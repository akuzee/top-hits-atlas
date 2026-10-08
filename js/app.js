// Boot: load the data (inlined in the shipped build, fetched in dev), build the
// model, then route between views on the URL hash.
(function () {
  const HA = globalThis.HA;
  const VIEWS = ['wall', 'no1s', 'genres', 'artists', 'quiz', 'about'];
  const mounted = new Set();

  async function loadData() {
    const inline = document.getElementById('hits-data');
    if (inline) return JSON.parse(inline.textContent);
    const res = await fetch('data/hits.json');
    return res.json();
  }

  function show() {
    const view = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'wall';
    HA.state.view = view;
    for (const v of VIEWS) document.getElementById('view-' + v).hidden = v !== view;
    document.querySelectorAll('#tabs a').forEach((a) => (a.dataset.view === view ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    const el = document.getElementById('view-' + view);
    if (!mounted.has(view)) { HA.views[view].mount(el); mounted.add(view); }
    HA.untip();
    HA.views[view].render();
  }

  async function boot() {
    const raw = await loadData();
    HA.m = HA.buildModel(raw);
    document.getElementById('loading').remove();
    document.getElementById('wm-sub').textContent = `Billboard Hot 100 · Aug 1958 – ${HA.fmtMonth(HA.m.weeks.length - 1)}`;
    HA.initLegend();
    HA.initSearch();
    HA.state.decade = HA.store.get('decade', 1980);
    HA.on('spot', () => HA.untip());
    document.getElementById('drawer-close').addEventListener('click', HA.closeDrawer);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') HA.closeDrawer(); });
    // Canvas and SVG fills read colours once, so repaint when the theme flips.
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => HA.emit('theme'));
    new MutationObserver(() => HA.emit('theme')).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    addEventListener('hashchange', show);
    const remember = () => HA.store.set('decade', HA.state.decade);
    addEventListener('pagehide', remember);
    show();
  }

  boot().catch((err) => {
    document.getElementById('loading').textContent = 'Could not load the chart data: ' + err.message;
    console.error(err);
  });
})();
