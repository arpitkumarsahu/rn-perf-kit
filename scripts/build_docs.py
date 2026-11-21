#!/usr/bin/env python3
"""
rn-perf-kit Static Documentation Generator
Compiles Markdown files in docs/ into a search-engine-optimized, responsive HTML site.
Styles and scripts are embedded directly into each HTML file to guarantee zero cache issues.
"""

import os
import re
import html
import shutil
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DOCS_DIR = BASE_DIR / "docs"
OUT_DIR = BASE_DIR / "docs_site"

PAGES = [
    {
        "id": "overview",
        "title": "rn-perf-kit: Deep Performance Profiler for React Native",
        "description": "Drop-in performance profiling toolkit for React Native apps — tells you what is slow, why, and what to change on budget Android and iOS.",
        "keywords": "react native performance, react native profiler, android jank, dropped frames, mobile app optimization",
        "src": DOCS_DIR / "README.md",
        "dest": "index.html",
        "category": "Getting Started",
        "nav_label": "Overview"
    },
    {
        "id": "getting-started",
        "title": "Getting Started with rn-perf-kit | React Native Setup Guide",
        "description": "Step-by-step 5-minute setup guide for rn-perf-kit in bare React Native and Expo projects. Register the Fiber hook and configure budgets.",
        "keywords": "react native install profiler, expo performance, perfprovider setup, react native fiber hook",
        "src": DOCS_DIR / "getting-started.md",
        "dest": "getting-started.html",
        "category": "Getting Started",
        "nav_label": "Quick Start Guide"
    },
    {
        "id": "navigation-profiling",
        "title": "Diagnosing & Fixing Navigation Jank in React Native",
        "description": "Phase-by-phase routing analysis: tap, dispatch, first-commit, transition, content-ready. Eliminate transition stutter on low-end Android devices.",
        "keywords": "react navigation lag, react native navigation jank, transition stutter android, defer mounts during transition",
        "src": DOCS_DIR / "guides" / "navigation-profiling.md",
        "dest": "guides/navigation-profiling.html",
        "category": "Guides",
        "nav_label": "Navigation Profiling"
    },
    {
        "id": "re-render-analysis",
        "title": "Eliminating Render Storms & Wasted Re-renders in React Native",
        "description": "Pinpoint re-render causes, unstable hook references, Context fan-outs, and store selector instability in React Native apps.",
        "keywords": "react native wasted renders, render storm detector, selector instability redux zustand, react native profiler",
        "src": DOCS_DIR / "guides" / "re-render-analysis.md",
        "dest": "guides/re-render-analysis.html",
        "category": "Guides",
        "nav_label": "Re-render Analysis"
    },
    {
        "id": "frame-attribution",
        "title": "Frame Attribution & Interrupted Renders | React Native",
        "description": "Correlate dropped UI frames with long JavaScript commits, Concurrent Mode discarded renders, and useLayoutEffect cascades.",
        "keywords": "react native dropped frames, frame attribution, concurrent react discarded renders, uselayouteffect cascade jank",
        "src": DOCS_DIR / "guides" / "frame-attribution-and-concurrency.md",
        "dest": "guides/frame-attribution-and-concurrency.html",
        "category": "Guides",
        "nav_label": "Frame Attribution"
    },
    {
        "id": "ci-performance-budgets",
        "title": "CI Performance Budgets & Regression Testing in React Native",
        "description": "Enforce hardware-tier performance budgets (LOW, MID, HIGH) on pull requests with GitHub Actions and the rn-perf CLI.",
        "keywords": "react native ci performance, performance budgets pull request, rn-perf cli, mobile performance regression",
        "src": DOCS_DIR / "guides" / "ci-performance-budgets.md",
        "dest": "guides/ci-performance-budgets.html",
        "category": "Guides",
        "nav_label": "CI Performance Budgets"
    },
    {
        "id": "api-reference",
        "title": "API Reference | rn-perf-kit Documentation",
        "description": "Comprehensive reference for PerfProvider, PerfOverlay, withNavigationPerf, usePerfScreen, PerfTrace, and store adapters.",
        "keywords": "rn-perf-kit api, PerfProvider reference, usePerfScreen api, withNavigationPerf, react native perf kit",
        "src": DOCS_DIR / "guides" / "api-reference.md",
        "dest": "guides/api-reference.html",
        "category": "Reference",
        "nav_label": "Full API Reference"
    }
]

def slugify(text):
    text = re.sub(r'[^\w\s-]', '', text.lower()).strip()
    return re.sub(r'[-\s]+', '-', text)

def inline_format(text):
    # Inline code: `code`
    text = re.sub(r'`([^`]+)`', lambda m: f"<code>{html.escape(m.group(1))}</code>", text)
    # Images with links: [![alt](img)](url)
    text = re.sub(
        r'\[!\[([^\]]*)\]\(([^)]+)\)\]\(([^)]+)\)',
        r'<a href="\3" target="_blank" rel="noopener noreferrer"><img src="\2" alt="\1" /></a>',
        text
    )
    # Images: ![alt](img)
    text = re.sub(r'!\[([^\]]*)\]\(([^)]+)\)', r'<img src="\2" alt="\1" />', text)
    # Standard Markdown Links: [text](url)
    def link_repl(m):
        link_text = m.group(1)
        url = m.group(2)
        external = 'target="_blank" rel="noopener noreferrer"' if url.startswith("http") else ''
        return f'<a href="{url}" {external}>{link_text}</a>'
    text = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', link_repl, text)
    # Bold: **text**
    text = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', text)
    # Italic: *text*
    text = re.sub(r'(?<!\*)\*([^*]+)\*(?!\*)', r'<em>\1</em>', text)
    return text

def parse_markdown_to_html(md_content, current_dest):
    # Normalize link destinations: .md -> .html
    def rewrite_links(match):
        text = match.group(1)
        url = match.group(2)
        if url.endswith(".md"):
            url = url[:-3] + ".html"
            url = url.replace("README.html", "index.html")
        return f"[{text}]({url})"

    md_content = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', rewrite_links, md_content)

    lines = md_content.split("\n")
    html_lines = []
    in_code_block = False
    code_lang = ""
    code_lines = []
    in_list = False
    in_table = False
    table_rows = []
    toc_items = []

    for line in lines:
        stripped = line.strip()

        # Code blocks
        if stripped.startswith("```"):
            if not in_code_block:
                in_code_block = True
                code_lang = stripped[3:].strip() or "text"
                code_lines = []
                continue
            else:
                in_code_block = False
                escaped = html.escape("\n".join(code_lines))
                html_lines.append(f"""<div class="code-block-wrapper">
  <div class="code-block-header">
    <span class="code-lang">{code_lang}</span>
    <button class="copy-btn" onclick="copyCode(this)">Copy</button>
  </div>
  <pre><code class="language-{code_lang}">{escaped}</code></pre>
</div>""")
                continue

        if in_code_block:
            code_lines.append(line)
            continue

        # Tables
        if "|" in line and (line.startswith("|") or stripped.startswith("|")):
            if not in_table:
                in_table = True
                table_rows = []
            table_rows.append(stripped)
            continue
        elif in_table:
            in_table = False
            if len(table_rows) >= 2:
                headers = [c.strip() for c in table_rows[0].strip("|").split("|")]
                th_html = "".join(f"<th>{inline_format(h)}</th>" for h in headers)
                body_rows = []
                for row_line in table_rows[2:]:
                    cols = [c.strip() for c in row_line.strip("|").split("|")]
                    td_html = "".join(f"<td>{inline_format(c)}</td>" for c in cols)
                    body_rows.append(f"<tr>{td_html}</tr>")
                html_lines.append(f"""<div class="table-container">
  <table>
    <thead><tr>{th_html}</tr></thead>
    <tbody>{"".join(body_rows)}</tbody>
  </table>
</div>""")
            table_rows = []

        # Blank lines
        if not stripped:
            if in_list:
                html_lines.append("</ul>")
                in_list = False
            continue

        # Headings
        h_match = re.match(r'^(#{1,6})\s+(.+)$', stripped)
        if h_match:
            level = len(h_match.group(1))
            heading_text = h_match.group(2)
            anchor = slugify(re.sub(r'\[.*?\]\(.*?\)', '', heading_text))
            if level in [2, 3]:
                toc_items.append({"level": level, "text": re.sub(r'<[^>]+>', '', heading_text), "id": anchor})
            formatted_text = inline_format(heading_text)
            html_lines.append(f'<h{level} id="{anchor}"><a href="#{anchor}" class="anchor-link">#</a> {formatted_text}</h{level}>')
            continue

        # Blockquote
        if stripped.startswith("> "):
            bq_text = inline_format(stripped[2:])
            html_lines.append(f"<blockquote><p>{bq_text}</p></blockquote>")
            continue

        # Horizontal rule
        if stripped in ["---", "***", "___"]:
            html_lines.append("<hr />")
            continue

        # Unordered list items
        if stripped.startswith("- ") or stripped.startswith("* "):
            if not in_list:
                in_list = True
                html_lines.append("<ul>")
            item_text = inline_format(stripped[2:])
            html_lines.append(f"<li>{item_text}</li>")
            continue
        elif in_list:
            html_lines.append("</ul>")
            in_list = False

        # Regular paragraph
        html_lines.append(f"<p>{inline_format(stripped)}</p>")

    if in_list:
        html_lines.append("</ul>")

    return "\n".join(html_lines), toc_items

def build_sidebar(current_dest, root_rel):
    categories = {}
    for p in PAGES:
        cat = p["category"]
        categories.setdefault(cat, []).append(p)

    sidebar_html = []
    for cat, pages in categories.items():
        sidebar_html.append(f'<div class="sidebar-group"><div class="sidebar-heading">{cat}</div><ul class="sidebar-links">')
        for page in pages:
            page_dest = page["dest"]
            href = root_rel + page_dest
            is_active = (page_dest == current_dest)
            active_class = ' class="active"' if is_active else ''
            sidebar_html.append(f'<li><a href="{href}"{active_class}>{page["nav_label"]}</a></li>')
        sidebar_html.append('</ul></div>')
    return "\n".join(sidebar_html)

def build_toc(toc_items):
    if not toc_items:
        return ""
    toc_html = ['<div class="toc-wrapper"><div class="toc-title">On this page</div><ul class="toc-list">']
    for item in toc_items:
        lvl_cls = "toc-l3" if item["level"] == 3 else "toc-l2"
        toc_html.append(f'<li class="{lvl_cls}"><a href="#{item["id"]}">{item["text"]}</a></li>')
    toc_html.append('</ul></div>')
    return "\n".join(toc_html)

def get_css():
    return """
:root {
  --bg-primary: #0a0e17;
  --bg-surface: #111827;
  --bg-surface-elevated: #1f2937;
  --border-color: #1f293d;
  --text-primary: #f3f4f6;
  --text-secondary: #9ca3af;
  --text-muted: #6b7280;
  --accent-cyan: #38bdf8;
  --accent-blue: #60a5fa;
  --code-bg: #030712;
  --font-sans: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-mono: 'JetBrains Mono', SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background-color: var(--bg-primary);
  color: var(--text-primary);
  font-family: var(--font-sans);
  line-height: 1.7;
  -webkit-font-smoothing: antialiased;
}

/* ── Top Navbar ─────────────────────────────────────────────────────────── */
.top-nav {
  position: sticky;
  top: 0;
  z-index: 100;
  background-color: rgba(10, 14, 23, 0.95);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border-color);
  height: 64px;
}
.nav-container {
  max-width: 1440px;
  margin: 0 auto;
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
}
.nav-left { display: flex; align-items: center; gap: 14px; flex-shrink: 0; }
.nav-logo {
  display: flex;
  align-items: center;
  gap: 8px;
  text-decoration: none;
  color: var(--text-primary);
  font-weight: 700;
  font-size: 1.15rem;
}
.logo-icon { font-size: 1.3rem; }
.version-badge {
  font-size: 0.72rem;
  background: rgba(56, 189, 248, 0.15);
  color: var(--accent-cyan);
  border: 1px solid rgba(56, 189, 248, 0.3);
  padding: 2px 7px;
  border-radius: 9999px;
  font-family: var(--font-mono);
}

/* ── Fixed Sized Search Box ─────────────────────────────────────────────── */
.nav-search {
  position: relative;
  flex: 1;
  max-width: 440px;
  height: 38px;
  margin: 0 24px;
}
.search-icon-img {
  position: absolute;
  left: 12px;
  top: 11px;
  width: 16px;
  height: 16px;
  pointer-events: none;
  z-index: 2;
  opacity: 0.6;
}
.nav-search input {
  width: 100%;
  height: 38px;
  padding: 0 14px 0 38px;
  border-radius: 8px;
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  font-size: 0.88rem;
  font-family: var(--font-sans);
  transition: all 0.2s ease;
  outline: none;
}
.nav-search input:focus {
  border-color: var(--accent-cyan);
  background-color: #0b0f19;
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.2);
}
.nav-search input::placeholder {
  color: var(--text-muted);
}

/* ── Dropdown Overlay ───────────────────────────────────────────────────── */
.search-results-dropdown {
  display: none;
  position: absolute;
  top: 46px;
  left: 0;
  right: 0;
  background: #111827;
  border: 1px solid #1f293d;
  border-radius: 8px;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.06);
  z-index: 9999;
  max-height: 380px;
  overflow-y: auto;
  padding: 6px;
}
.search-item {
  display: flex !important;
  flex-direction: column !important;
  padding: 10px 14px !important;
  border-radius: 6px !important;
  text-decoration: none !important;
  color: #f3f4f6 !important;
  background: transparent !important;
  transition: all 0.15s ease !important;
  margin-bottom: 2px !important;
  border-left: 3px solid transparent !important;
}
.search-item:last-child { margin-bottom: 0 !important; }
.search-item:hover, .search-item:focus {
  background: #1f2937 !important;
  border-left-color: #38bdf8 !important;
  color: #ffffff !important;
  outline: none !important;
}
.search-item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 2px;
}
.search-item-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: #38bdf8 !important;
}
.search-item:hover .search-item-title { color: #60a5fa !important; }
.search-item-category {
  font-size: 0.7rem;
  background: rgba(255, 255, 255, 0.08);
  color: #9ca3af;
  padding: 1px 6px;
  border-radius: 4px;
  font-family: var(--font-mono);
}
.search-item-desc {
  font-size: 0.8rem;
  color: #9ca3af !important;
  line-height: 1.4;
}
.search-item-empty {
  padding: 16px;
  text-align: center;
  color: #9ca3af;
  font-size: 0.85rem;
}

/* ── Top Nav Right ──────────────────────────────────────────────────────── */
.nav-right { display: flex; align-items: center; gap: 14px; flex-shrink: 0; }
.nav-badge-link { display: flex; align-items: center; }
.nav-github-link {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-primary);
  text-decoration: none;
  font-weight: 600;
  font-size: 0.88rem;
  padding: 6px 12px;
  border-radius: 6px;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  transition: background 0.2s;
}
.nav-github-link:hover { background: var(--bg-surface-elevated); }

/* ── Layout ─────────────────────────────────────────────────────────────── */
.doc-layout {
  display: flex;
  max-width: 1440px;
  margin: 0 auto;
  min-height: calc(100vh - 64px);
}
.doc-sidebar {
  width: 270px;
  flex-shrink: 0;
  border-right: 1px solid var(--border-color);
  padding: 24px 16px;
  position: sticky;
  top: 64px;
  height: calc(100vh - 64px);
  overflow-y: auto;
}
.sidebar-heading {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 700;
  color: var(--text-muted);
  margin-bottom: 8px;
  margin-top: 20px;
}
.sidebar-group:first-child .sidebar-heading { margin-top: 0; }
.sidebar-links { list-style: none; }
.sidebar-links li { margin: 2px 0; }
.sidebar-links a {
  display: block;
  padding: 6px 12px;
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 0.9rem;
  border-radius: 6px;
  transition: all 0.15s ease;
}
.sidebar-links a:hover {
  color: var(--text-primary);
  background: var(--bg-surface);
}
.sidebar-links a.active {
  color: var(--accent-cyan);
  background: rgba(56, 189, 248, 0.1);
  font-weight: 600;
}

/* ── Main Content Area ──────────────────────────────────────────────────── */
.doc-main {
  flex: 1;
  min-width: 0;
  padding: 40px 48px;
}
.doc-content { max-width: 820px; margin: 0 auto; }
.doc-content h1 {
  font-size: 2.3rem;
  font-weight: 800;
  margin-bottom: 16px;
  color: #fff;
  letter-spacing: -0.025em;
  line-height: 1.25;
}
.doc-content h2 {
  font-size: 1.6rem;
  font-weight: 700;
  margin-top: 40px;
  margin-bottom: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
  color: #f9fafb;
}
.doc-content h3 {
  font-size: 1.25rem;
  font-weight: 600;
  margin-top: 28px;
  margin-bottom: 12px;
  color: #e5e7eb;
}
.doc-content p {
  margin-bottom: 18px;
  color: #d1d5db;
  font-size: 1rem;
}
.doc-content a {
  color: var(--accent-cyan);
  text-decoration: none;
}
.doc-content a:hover { text-decoration: underline; }
.doc-content ul, .doc-content ol {
  margin-bottom: 18px;
  padding-left: 24px;
  color: #d1d5db;
}
.doc-content li { margin-bottom: 6px; }
.doc-content blockquote {
  border-left: 4px solid var(--accent-cyan);
  background: rgba(56, 189, 248, 0.05);
  padding: 12px 18px;
  border-radius: 0 8px 8px 0;
  margin: 20px 0;
}
.anchor-link {
  color: var(--text-muted);
  text-decoration: none;
  margin-right: 6px;
  opacity: 0;
  transition: opacity 0.2s;
}
.doc-content h2:hover .anchor-link,
.doc-content h3:hover .anchor-link { opacity: 1; }

/* ── Code Blocks ────────────────────────────────────────────────────────── */
code {
  font-family: var(--font-mono);
  font-size: 0.88em;
  background: rgba(255, 255, 255, 0.08);
  padding: 2px 6px;
  border-radius: 4px;
  color: #38bdf8;
}
.code-block-wrapper {
  background: var(--code-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  margin: 24px 0;
  overflow: hidden;
}
.code-block-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  background: #0f172a;
  border-bottom: 1px solid var(--border-color);
  font-size: 0.78rem;
  color: var(--text-muted);
  font-family: var(--font-mono);
}
.copy-btn {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: var(--text-secondary);
  font-size: 0.75rem;
  padding: 3px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}
.copy-btn:hover { background: rgba(255, 255, 255, 0.2); color: #fff; }
.code-block-wrapper pre {
  padding: 16px;
  overflow-x: auto;
  font-family: var(--font-mono);
  font-size: 0.88rem;
  line-height: 1.6;
  color: #e2e8f0;
}
.code-block-wrapper code {
  background: transparent;
  padding: 0;
  border-radius: 0;
  color: inherit;
}

/* ── Tables ─────────────────────────────────────────────────────────────── */
.table-container {
  overflow-x: auto;
  margin: 24px 0;
  border: 1px solid var(--border-color);
  border-radius: 8px;
}
table { width: 100%; border-collapse: collapse; text-align: left; }
th, td { padding: 12px 16px; border-bottom: 1px solid var(--border-color); font-size: 0.92rem; }
th { background: var(--bg-surface); font-weight: 600; color: #fff; }
tr:last-child td { border-bottom: none; }
tr:hover td { background: rgba(255, 255, 255, 0.02); }

/* ── Table of Contents ──────────────────────────────────────────────────── */
.doc-toc {
  width: 220px;
  flex-shrink: 0;
  padding: 24px 16px;
  position: sticky;
  top: 64px;
  height: calc(100vh - 64px);
  overflow-y: auto;
}
.toc-title {
  font-size: 0.78rem;
  text-transform: uppercase;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  margin-bottom: 12px;
}
.toc-list { list-style: none; font-size: 0.85rem; }
.toc-l2 { margin: 6px 0; }
.toc-l3 { margin: 4px 0 4px 12px; font-size: 0.8rem; }
.toc-list a { color: var(--text-secondary); text-decoration: none; }
.toc-list a:hover { color: var(--accent-cyan); }

/* ── Footer ─────────────────────────────────────────────────────────────── */
.doc-footer {
  margin-top: 64px;
  padding-top: 24px;
  border-top: 1px solid var(--border-color);
  color: var(--text-muted);
  font-size: 0.85rem;
}
.footer-edit { margin-bottom: 8px; }

/* ── Responsive ─────────────────────────────────────────────────────────── */
.mobile-toggle { display: none; }
@media (max-width: 1080px) {
  .doc-toc { display: none; }
}
@media (max-width: 768px) {
  .mobile-toggle {
    display: flex;
    flex-direction: column;
    gap: 4px;
    background: none;
    border: none;
    cursor: pointer;
  }
  .mobile-toggle span { width: 20px; height: 2px; background: #fff; }
  .doc-sidebar {
    display: none;
    position: fixed;
    top: 64px;
    left: 0;
    width: 260px;
    background: var(--bg-primary);
    z-index: 99;
  }
  .doc-sidebar.open { display: block; }
  .doc-main { padding: 24px 16px; }
  .nav-search { display: none; }
}
"""

def get_js():
    return """
function copyCode(btn) {
  const code = btn.closest('.code-block-wrapper').querySelector('code').innerText;
  navigator.clipboard.writeText(code).then(() => {
    const orig = btn.innerText;
    btn.innerText = 'Copied!';
    setTimeout(() => { btn.innerText = orig; }, 2000);
  });
}

function toggleSidebar() {
  const sidebar = document.getElementById('docSidebar');
  sidebar.classList.toggle('open');
}

function filterSearch(query) {
  const dropdown = document.getElementById('searchResults');
  if (!query || query.trim().length < 2) {
    dropdown.style.display = 'none';
    dropdown.innerHTML = '';
    return;
  }

  const root = window.DOCS_ROOT || '';

  const searchable = [
    {
      title: 'Overview & Architecture',
      category: 'Getting Started',
      desc: 'Unified timeline, budget tiers (LOW/MID/HIGH), minimal overhead',
      url: root + 'index.html',
      keywords: 'overview what is slow why what to change architecture core'
    },
    {
      title: 'Quick Start Installation',
      category: 'Getting Started',
      desc: '5-minute setup in React Native and Expo, fiber hook registration',
      url: root + 'getting-started.html',
      keywords: 'install setup fiber hook perfprovider expo npm yarn pnpm'
    },
    {
      title: 'Navigation Profiling',
      category: 'Guides',
      desc: '6-phase routing breakdown, mount-during-transition jank detection',
      url: root + 'guides/navigation-profiling.html',
      keywords: 'navigation jank lag transition stutter defer mount tap dispatch'
    },
    {
      title: 'Re-render Analysis',
      category: 'Guides',
      desc: 'Eliminating render storms, wasted re-renders, and selector instability',
      url: root + 'guides/re-render-analysis.html',
      keywords: 're-render render storm wasted selector redux zustand context'
    },
    {
      title: 'Frame Attribution & Concurrency',
      category: 'Guides',
      desc: 'Correlate dropped frames with JS commits, stalls, and layout cascades',
      url: root + 'guides/frame-attribution-and-concurrency.html',
      keywords: 'frame attribution dropped frames stalls concurrent discarded uselayouteffect'
    },
    {
      title: 'CI Performance Budgets',
      category: 'Guides',
      desc: 'Automated performance regression checks in GitHub Actions PRs',
      url: root + 'guides/ci-performance-budgets.html',
      keywords: 'ci budgets github actions regression check cli rn-perf'
    },
    {
      title: 'Full API Reference',
      category: 'Reference',
      desc: 'Complete reference for PerfProvider, PerfOverlay, withNavigationPerf, hooks',
      url: root + 'guides/api-reference.html',
      keywords: 'api reference perfprovider withnavigationperf useperfscreen perftrace'
    }
  ];

  const q = query.trim().toLowerCase();
  const matches = searchable.filter(s =>
    s.title.toLowerCase().includes(q) ||
    s.desc.toLowerCase().includes(q) ||
    s.keywords.toLowerCase().includes(q)
  );

  if (matches.length === 0) {
    dropdown.innerHTML = '<div class="search-item-empty">No results found for &ldquo;' + escapeHtml(query) + '&rdquo;</div>';
  } else {
    dropdown.innerHTML = matches.map(m => `
      <a href="${m.url}" class="search-item">
        <div class="search-item-header">
          <span class="search-item-title">${m.title}</span>
          <span class="search-item-category">${m.category}</span>
        </div>
        <span class="search-item-desc">${m.desc}</span>
      </a>
    `).join('');
  }
  dropdown.style.display = 'block';
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    e.preventDefault();
    const searchInput = document.getElementById('docSearch');
    if (searchInput) { searchInput.focus(); searchInput.select(); }
  } else if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    const searchInput = document.getElementById('docSearch');
    if (searchInput) { searchInput.focus(); searchInput.select(); }
  } else if (e.key === 'Escape') {
    const dropdown = document.getElementById('searchResults');
    if (dropdown) dropdown.style.display = 'none';
  }
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.nav-search')) {
    const dropdown = document.getElementById('searchResults');
    if (dropdown) dropdown.style.display = 'none';
  }
});
"""

TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
  <meta name="description" content="{description}">
  <meta name="keywords" content="{keywords}">
  <meta name="author" content="Arpit Kumar Sahu">
  <link rel="canonical" href="https://arpitkumarsahu.github.io/rn-perf-kit/{dest}">

  <!-- OpenGraph Metadata -->
  <meta property="og:type" content="article">
  <meta property="og:title" content="{title}">
  <meta property="og:description" content="{description}">
  <meta property="og:url" content="https://arpitkumarsahu.github.io/rn-perf-kit/{dest}">
  <meta property="og:site_name" content="rn-perf-kit Documentation">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{title}">
  <meta name="twitter:description" content="{description}">

  <!-- Schema.org JSON-LD -->
  <script type="application/ld+json">
  {{
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "rn-perf-kit",
    "operatingSystem": "Android, iOS",
    "applicationCategory": "DeveloperApplication",
    "description": "Deep performance profiling toolkit for React Native apps focused on budget Android devices.",
    "author": {{
      "@type": "Person",
      "name": "Arpit Kumar Sahu"
    }},
    "url": "https://www.npmjs.com/package/rn-perf-kit"
  }}
  </script>

  <script>
    window.DOCS_ROOT = "{root_rel}";
  </script>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  
  <style>
{embedded_css}
  </style>
</head>
<body>
  <!-- Top Global Navbar -->
  <header class="top-nav">
    <div class="nav-container">
      <div class="nav-left">
        <button class="mobile-toggle" onclick="toggleSidebar()" aria-label="Toggle navigation">
          <span></span><span></span><span></span>
        </button>
        <a href="{root_rel}index.html" class="nav-logo">
          <span class="logo-icon">⚡</span>
          <span class="logo-title">rn-perf-kit</span>
          <span class="version-badge">v0.1.1</span>
        </a>
      </div>
      
      <!-- Search Component -->
      <div class="nav-search">
        <svg class="search-icon-img" width="16" height="16" viewBox="0 0 20 20" fill="#6b7280" xmlns="http://www.w3.org/2000/svg">
          <path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd" />
        </svg>
        <input type="text" id="docSearch" placeholder="Search guides, components, APIs... (Press / to search)" oninput="filterSearch(this.value)" autocomplete="off">
        <div id="searchResults" class="search-results-dropdown"></div>
      </div>

      <div class="nav-right">
        <a href="https://www.npmjs.com/package/rn-perf-kit" target="_blank" rel="noopener noreferrer" class="nav-badge-link">
          <img src="https://img.shields.io/npm/v/rn-perf-kit.svg?style=flat-square&color=CB3837" alt="npm version">
        </a>
        <a href="https://github.com/arpitkumarsahu/rn-perf-kit" target="_blank" rel="noopener noreferrer" class="nav-github-link">
          <svg height="20" width="20" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
          </svg>
          <span>GitHub</span>
        </a>
      </div>
    </div>
  </header>

  <!-- Main Documentation Container -->
  <div class="doc-layout">
    <!-- Sidebar -->
    <aside class="doc-sidebar" id="docSidebar">
      <div class="sidebar-inner">
        {sidebar_html}
      </div>
    </aside>

    <!-- Main Content Area -->
    <main class="doc-main">
      <article class="doc-content">
        {article_html}
      </article>
      <footer class="doc-footer">
        <div class="footer-edit">
          <a href="https://github.com/arpitkumarsahu/rn-perf-kit" target="_blank" rel="noopener noreferrer">
            Edit this guide on GitHub →
          </a>
        </div>
        <p class="footer-copy">MIT Licensed © 2026 Arpit Kumar Sahu. Built for React Native performance excellence.</p>
      </footer>
    </main>

    <!-- Table of Contents Sidebar -->
    <aside class="doc-toc">
      {toc_html}
    </aside>
  </div>

  <script>
{embedded_js}
  </script>
</body>
</html>
"""

def main():
    print(f"Building rn-perf-kit documentation site in {OUT_DIR}...")
    if OUT_DIR.exists():
        shutil.rmtree(OUT_DIR)
    OUT_DIR.mkdir(parents=True)

    css_content = get_css()
    js_content = get_js()

    # Also keep standalone assets for any external references
    assets_dir = OUT_DIR / "assets"
    assets_dir.mkdir(parents=True)
    with open(assets_dir / "styles.css", "w") as f:
        f.write(css_content)
    with open(assets_dir / "script.js", "w") as f:
        f.write(js_content)

    for page in PAGES:
        src_path = page["src"]
        dest_rel = page["dest"]
        out_file = OUT_DIR / dest_rel
        out_file.parent.mkdir(parents=True, exist_ok=True)

        if not src_path.exists():
            print(f"⚠️ Source missing: {src_path}")
            continue

        with open(src_path, "r", encoding="utf-8") as f:
            raw_md = f.read()

        depth = len(Path(dest_rel).parts) - 1
        root_rel = "../" * depth if depth > 0 else ""

        article_html, toc_items = parse_markdown_to_html(raw_md, dest_rel)
        sidebar_html = build_sidebar(dest_rel, root_rel)
        toc_html = build_toc(toc_items)

        page_html = TEMPLATE.format(
            title=page["title"],
            description=page["description"],
            keywords=page["keywords"],
            dest=dest_rel,
            root_rel=root_rel,
            sidebar_html=sidebar_html,
            article_html=article_html,
            toc_html=toc_html,
            embedded_css=css_content,
            embedded_js=js_content
        )

        with open(out_file, "w", encoding="utf-8") as f:
            f.write(page_html)

        print(f"  ✓ Rendered {dest_rel}")

    with open(OUT_DIR / ".nojekyll", "w") as f:
        f.write("")

    print(f"✨ Successfully generated documentation site at: {OUT_DIR}\n")

if __name__ == "__main__":
    main()
