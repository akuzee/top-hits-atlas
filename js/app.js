// Boot and routing. The hash is "#<domain>-<view>" (e.g. #movies-wall); the
// artifact host only passes plain tokens through, so no "?" or "=" state.
// Each domain's data is inlined in the shipped build (parsed on first use) and
// fetched from data/ in dev.
(function () {
  const HA = globalThis.HA;
  const ORDER = ['music', 'movies', 'tv'];
  const built = new Map();
  const mounted = new Set();
  let available = [];

  async function rawData(reg) {
    const inline = document.getElementById(reg.dataId);
    if (inline) return JSON.parse(inline.textContent);
    const res = await fetch(reg.dataUrl);
    if (!res.ok) throw new Error(`${reg.dataUrl}: ${res.status}`);
    return res.json();
  }
  async function domain(id) {
    if (!built.has(id)) built.set(id, HA.domains[id].build(await rawData(HA.domains[id])));
    return built.get(id);
  }
  async function findAvailable() {
    const out = [];
    for (const id of ORDER) {
      const reg = HA.domains[id];
      if (!reg) continue;
      if (document.getElementById(reg.dataId)) { out.push(id); continue; }
      if (document.querySelector('script[type="application/json"]')) continue; // shipped build without it
      try { if ((await fetch(reg.dataUrl, { method: 'HEAD' })).ok) out.push(id); } catch { /* not built yet */ }
    }
    return out;
  }

  function parseHash() {
    const t = location.hash.slice(1);
    if (t === 'about') return { dom: HA.state.domain || available[0], view: 'about' };
    const [dom, view] = t.includes('-') ? t.split('-') : ['music', t];
    return { dom: available.includes(dom) ? dom : available[0], view: view || 'wall' };
  }

  function renderSwitcher() {
    const el = document.getElementById('domains');
    el.hidden = available.length < 2;
    el.replaceChildren(...available.map((id) => HA.h('button', {
      'aria-pressed': String(id === HA.state.domain),
      onclick: () => { location.hash = `${id}-${HA.state.view === 'about' ? 'wall' : HA.D.tabs.some(([v]) => v === HA.state.view) && HA.domains[id] ? HA.state.view : 'wall'}`; },
    }, HA.domains[id].label)));
  }
  function renderTabs() {
    const nav = document.getElementById('tabs');
    nav.replaceChildren(...HA.D.tabs.map(([v, label]) => HA.h('a', { href: `#${HA.state.domain}-${v}`, 'data-view': v }, label)),
      HA.h('a', { href: '#about', 'data-view': 'about' }, 'About'));
  }

  async function show() {
    let { dom, view } = parseHash();
    const D = await domain(dom);
    if (HA.D !== D) {
      HA.D = D;
      HA.state.domain = dom;
      HA.state.spot = null;
      HA.state.entity = null;
      HA.closeDrawer();
      document.getElementById('wm-sub').textContent = D.subtitle;
      HA.renderLegend();
      renderTabs();
      HA.emit('domain');
    }
    // A view this medium lacks (TV has no No. 1s) falls back to the Wall, and the
    // address follows. Old links to the quiz tab open the Wall with the quiz alongside.
    const quiz = view === 'quiz';
    if (view !== 'about' && !D.tabs.some(([v]) => v === view)) {
      view = 'wall';
      history.replaceState(null, '', `#${dom}-wall`);
    }
    HA.state.view = view;
    renderSwitcher();
    for (const el of document.querySelectorAll('main > .view')) el.hidden = el.id !== 'view-' + view;
    document.querySelectorAll('#tabs a').forEach((a) => (a.dataset.view === view ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    const el = document.getElementById('view-' + view);
    if (!mounted.has(view)) { HA.views[view].mount(el); mounted.add(view); }
    HA.untip();
    HA.views[view].render();
    if (quiz) HA.quiz.open();
  }

  async function boot() {
    available = await findAvailable();
    HA.available = available;
    if (!available.length) throw new Error('no data found; run tools/build.mjs');
    document.getElementById('loading').remove();
    HA.initSearch();
    document.getElementById('drawer-close').addEventListener('click', HA.closeDrawer);
    document.getElementById('quiz-open').addEventListener('click', () => HA.quiz.open());
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') HA.closeDrawer(); });
    // Canvas and SVG fills read colours once, so repaint when the theme flips.
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => HA.emit('theme'));
    new MutationObserver(() => HA.emit('theme')).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    addEventListener('hashchange', () => show().catch(fail));
    await show();
  }
  const fail = (err) => {
    const el = document.getElementById('loading') || document.getElementById('main');
    el.prepend(HA.h('p', { class: 'loading' }, 'Something went wrong: ' + err.message));
    console.error(err);
  };
  boot().catch(fail);
})();
