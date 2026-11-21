/**
 * Standalone Interactive HTML Report Generator for rn-perf-kit.
 * Transforms a SessionReport JSON into a self-contained visual dashboard.
 */

import type { SessionReport } from './json-reporter';

export function generateHtmlReport(report: SessionReport): string {
  const summary = report.summary || {
    totalFrames: 0,
    jankFrames: 0,
    jankPct: 0,
    totalCommits: 0,
    jsStalls: 0,
    navigations: 0,
  };

  const device = report.device || {
    tier: 'UNKNOWN',
    os: 'unknown',
    osVersion: 'unknown',
  };

  const tierColors: Record<string, { bg: string; text: string; border: string }> = {
    LOW: { bg: '#fef2f2', text: '#b91c1c', border: '#fca5a5' },
    MID: { bg: '#fefce8', text: '#a16207', border: '#fde047' },
    HIGH: { bg: '#f0fdf4', text: '#15803d', border: '#86efac' },
  };

  const tierStyle = tierColors[device.tier] || { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' };

  const findings = (report.findings as any[]) || [];
  // Event times are on the device's monotonic clock: show them relative to the session
  const sessionStart = (report.events ?? []).reduce((min, e) => (e.t < min ? e.t : min), Infinity);
  const relMs = (t: number) => Math.max(0, Math.round(t - (Number.isFinite(sessionStart) ? sessionStart : t)));
  const criticalFindings = findings.filter((f) => f.severity === 'critical');
  const warningFindings = findings.filter((f) => f.severity === 'warning');

  const findingsHtml = findings.length === 0
    ? `<div class="empty-state">🎉 No performance issues or violations detected. Great job!</div>`
    : findings.map((f) => {
        const badgeClass = f.severity === 'critical' ? 'badge-critical' : f.severity === 'warning' ? 'badge-warning' : 'badge-info';
        return `
          <div class="finding-card ${f.severity || 'info'}">
            <div class="finding-header">
              <span class="badge ${badgeClass}">${(f.severity || 'info').toUpperCase()}</span>
              <span class="finding-category">${escapeHtml(f.category || 'general')}</span>
              <span class="finding-time">+${relMs(f.t || 0)}ms</span>
            </div>
            <h4 class="finding-title">${escapeHtml(f.title || 'Performance Finding')}</h4>
            <p class="finding-detail">${escapeHtml(f.detail || '')}</p>
            ${f.suggestion ? `<div class="finding-suggestion"><span class="bulb">💡</span><strong>Recommendation:</strong> ${escapeHtml(f.suggestion)}</div>` : ''}
          </div>
        `;
      }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>rn-perf-kit Performance Report</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --card-border: #334155;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --accent: #6366f1;
      --danger: #ef4444;
      --warning: #f59e0b;
      --success: #10b981;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 24px;
    }
    .container { max-width: 1100px; margin: 0 auto; }
    
    /* Header */
    header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--card-border);
    }
    h1 { font-size: 24px; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 8px; }
    .subtitle { color: var(--text-muted); font-size: 13px; margin-top: 4px; }
    .device-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.5px;
      background: ${tierStyle.bg};
      color: ${tierStyle.text};
      border: 1px solid ${tierStyle.border};
    }

    /* Grid Stats */
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 28px;
    }
    .metric-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 16px;
    }
    .metric-label { font-size: 12px; color: var(--text-muted); text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px; }
    .metric-value { font-size: 28px; font-weight: 800; margin: 4px 0; color: #fff; }
    .metric-meta { font-size: 12px; color: var(--text-muted); }

    /* Progress bar */
    .bar-container { width: 100%; height: 6px; background: #334155; border-radius: 3px; overflow: hidden; margin-top: 8px; }
    .bar-fill { height: 100%; border-radius: 3px; }

    /* Section */
    .section-title { font-size: 18px; font-weight: 700; margin-bottom: 14px; display: flex; align-items: center; gap: 8px; }
    .findings-container { display: flex; flex-direction: column; gap: 12px; margin-bottom: 32px; }

    /* Finding card */
    .finding-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-left: 4px solid var(--accent);
      border-radius: 8px;
      padding: 16px;
      transition: transform 0.1s;
    }
    .finding-card.critical { border-left-color: var(--danger); }
    .finding-card.warning { border-left-color: var(--warning); }
    .finding-card.info { border-left-color: #38bdf8; }

    .finding-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .badge {
      font-size: 10px;
      font-weight: 800;
      padding: 2px 8px;
      border-radius: 4px;
      text-transform: uppercase;
    }
    .badge-critical { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); }
    .badge-warning { background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4); }
    .badge-info { background: rgba(56, 189, 248, 0.2); color: #7dd3fc; border: 1px solid rgba(56, 189, 248, 0.4); }

    .finding-category { font-size: 11px; color: var(--text-muted); font-family: monospace; background: #0f172a; padding: 2px 6px; border-radius: 4px; }
    .finding-time { font-size: 11px; color: var(--text-muted); margin-left: auto; font-family: monospace; }
    .finding-title { font-size: 15px; font-weight: 700; color: #fff; margin-bottom: 4px; }
    .finding-detail { font-size: 13px; color: #cbd5e1; margin-bottom: 10px; }
    .finding-suggestion {
      background: rgba(99, 102, 241, 0.1);
      border: 1px dashed rgba(99, 102, 241, 0.4);
      padding: 10px 12px;
      border-radius: 6px;
      font-size: 12px;
      color: #c7d2fe;
    }
    .bulb { margin-right: 4px; }

    /* Metadata details */
    details {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 12px 16px;
      margin-top: 16px;
    }
    summary { font-weight: 600; cursor: pointer; color: var(--text-muted); font-size: 13px; }
    pre {
      background: #090d16;
      padding: 12px;
      border-radius: 6px;
      margin-top: 10px;
      font-size: 11px;
      color: #94a3b8;
      overflow-x: auto;
      max-height: 400px;
    }

    .empty-state {
      padding: 32px;
      text-align: center;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      color: var(--text-muted);
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1>⚡ rn-perf-kit Report</h1>
        <div class="subtitle">Session recorded: ${escapeHtml(report.capturedAt || 'N/A')} · Duration: ${Math.round(report.durationMs || 0)}ms</div>
      </div>
      <div>
        <div class="device-badge">
          📱 ${escapeHtml(device.tier)} TIER · ${escapeHtml(device.os.toUpperCase())} ${escapeHtml(device.osVersion || '')}
        </div>
      </div>
    </header>

    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-label">Jank Frame Rate</div>
        <div class="metric-value" style="color: ${summary.jankPct > 15 ? 'var(--danger)' : summary.jankPct > 5 ? 'var(--warning)' : 'var(--success)'}">
          ${summary.jankPct.toFixed(1)}%
        </div>
        <div class="metric-meta">${summary.jankFrames} janky / ${summary.totalFrames} frames</div>
        <div class="bar-container">
          <div class="bar-fill" style="width: ${Math.min(100, summary.jankPct)}%; background: ${summary.jankPct > 15 ? 'var(--danger)' : 'var(--warning)'};"></div>
        </div>
      </div>

      <div class="metric-card">
        <div class="metric-label">JS Stalls (&gt;50ms)</div>
        <div class="metric-value" style="color: ${summary.jsStalls > 0 ? 'var(--danger)' : 'var(--success)'}">
          ${summary.jsStalls}
        </div>
        <div class="metric-meta">${summary.jsStalls === 0 ? 'Smooth execution' : 'Main JS thread blocked'}</div>
      </div>

      <div class="metric-card">
        <div class="metric-label">React Commits</div>
        <div class="metric-value">${summary.totalCommits}</div>
        <div class="metric-meta">DOM / Fabric tree mutations</div>
      </div>

      <div class="metric-card">
        <div class="metric-label">Navigations</div>
        <div class="metric-value">${summary.navigations}</div>
        <div class="metric-meta">Route transitions recorded</div>
      </div>
    </div>

    <div class="section-title">
      🔍 Actionable Findings (${findings.length})
      <span style="font-size: 12px; color: var(--text-muted); font-weight: normal;">
        (${criticalFindings.length} critical, ${warningFindings.length} warnings)
      </span>
    </div>
    
    <div class="findings-container">
      ${findingsHtml}
    </div>

    <details>
      <summary>Raw Session JSON</summary>
      <pre>${escapeHtml(JSON.stringify(report, null, 2))}</pre>
    </details>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
