
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
  const backdrop = document.getElementById('sidebarBackdrop');
  const toggleBtn = document.querySelector('.mobile-toggle');
  if (sidebar) sidebar.classList.toggle('open');
  if (backdrop) backdrop.classList.toggle('active');
  if (toggleBtn) toggleBtn.classList.toggle('active');
}

function updateSearchPlaceholder() {
  const input = document.getElementById('docSearch');
  if (input) {
    if (window.innerWidth <= 640) {
      input.placeholder = "Search docs...";
    } else {
      input.placeholder = "Search guides, components, APIs... (Press / to search)";
    }
  }
}
window.addEventListener('resize', updateSearchPlaceholder);
document.addEventListener('DOMContentLoaded', () => {
  updateSearchPlaceholder();
  const sidebarLinks = document.querySelectorAll('.doc-sidebar a');
  sidebarLinks.forEach(link => {
    link.addEventListener('click', () => {
      if (window.innerWidth <= 768) {
        const sidebar = document.getElementById('docSidebar');
        if (sidebar && sidebar.classList.contains('open')) {
          toggleSidebar();
        }
      }
    });
  });
});

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
      desc: '5-minute setup in React Native and Expo, fiber hook registration, autolinking',
      url: root + 'getting-started.html',
      keywords: 'install setup fiber hook perfprovider expo router expo-router autolinking npm yarn pnpm new architecture'
    },
    {
      title: 'Navigation Profiling',
      category: 'Guides',
      desc: '6-phase routing breakdown, Expo Router and React Navigation deferral',
      url: root + 'guides/navigation-profiling.html',
      keywords: 'navigation jank lag transition stutter defer mount tap dispatch expo router expo-router withnavigationperf useexporouterperf'
    },
    {
      title: 'Re-render Analysis',
      category: 'Guides',
      desc: 'Eliminating render storms, wasted re-renders, and selector instability',
      url: root + 'guides/re-render-analysis.html',
      keywords: 're-render render storm wasted selector redux zustand context query tanstack identical refetch'
    },
    {
      title: 'Frame Attribution & Concurrency',
      category: 'Guides',
      desc: 'Correlate dropped frames with JS commits, stalls, JankStats, and layout cascades',
      url: root + 'guides/frame-attribution-and-concurrency.html',
      keywords: 'frame attribution dropped frames stalls concurrent discarded uselayouteffect jankstats cadisplaylink clock sync'
    },
    {
      title: 'CI Performance Budgets',
      category: 'Guides',
      desc: 'Automated performance regression checks in GitHub Actions PRs',
      url: root + 'guides/ci-performance-budgets.html',
      keywords: 'ci budgets github actions regression check cli rn-perf hardware tiers low mid high'
    },
    {
      title: 'Full API Reference',
      category: 'Reference',
      desc: 'Complete reference for PerfProvider, PerfOverlay, withNavigationPerf, useExpoRouterPerf, adapters',
      url: root + 'guides/api-reference.html',
      keywords: 'api reference perfprovider withnavigationperf useexporouterperf useperfscreen perftrace network query store analyzers'
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
