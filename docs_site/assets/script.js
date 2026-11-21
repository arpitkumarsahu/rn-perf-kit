// Copy code snippet helper
function copyCode(btn) {
  const code = btn.closest('.code-block-wrapper').querySelector('code').innerText;
  navigator.clipboard.writeText(code).then(() => {
    const orig = btn.innerText;
    btn.innerText = 'Copied!';
    setTimeout(() => { btn.innerText = orig; }, 2000);
  });
}

// Mobile sidebar toggle
function toggleSidebar() {
  const sidebar = document.getElementById('docSidebar');
  sidebar.classList.toggle('open');
}

// Client-side quick search filtering
function filterSearch(query) {
  const dropdown = document.getElementById('searchResults');
  if (!query || query.length < 2) {
    dropdown.style.display = 'none';
    dropdown.innerHTML = '';
    return;
  }

  const searchable = [
    { title: 'Overview & Features', url: 'index.html', text: 'what is slow why what to change architecture' },
    { title: 'Quick Start Installation', url: 'getting-started.html', text: 'install fiber hook setup perfprovider' },
    { title: 'Navigation Profiling', url: 'guides/navigation-profiling.html', text: 'tap dispatch first commit transition end jank defer' },
    { title: 'Re-render Analysis', url: 'guides/re-render-analysis.html', text: 'render storms wasted renders selector instability redux zustand' },
    { title: 'Frame Attribution & Concurrency', url: 'guides/frame-attribution-and-concurrency.html', text: 'dropped frames discarded renders uselayouteffect native stalls' },
    { title: 'CI Performance Budgets', url: 'guides/ci-performance-budgets.html', text: 'ci budgets github actions pr regression rn-perf check' },
    { title: 'API Reference', url: 'guides/api-reference.html', text: 'PerfProvider PerfOverlay withNavigationPerf usePerfScreen' }
  ];

  const q = query.toLowerCase();
  const matches = searchable.filter(s => s.title.toLowerCase().includes(q) || s.text.toLowerCase().includes(q));

  if (matches.length === 0) {
    dropdown.innerHTML = '<div class="search-item-empty">No results found</div>';
  } else {
    dropdown.innerHTML = matches.map(m => `<a href="${m.url}" class="search-item"><strong>${m.title}</strong></a>`).join('');
  }
  dropdown.style.display = 'block';
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.nav-search')) {
    const dropdown = document.getElementById('searchResults');
    if (dropdown) dropdown.style.display = 'none';
  }
});
