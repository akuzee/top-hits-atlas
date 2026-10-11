// The Wall: each period's biggest items. An overview mosaic across all periods
// and a readable decade page beneath it.
(function () {
  const HA = globalThis.HA, h = HA.h;
  const CELL_H = 6;
  let root, canvas, axis, grid, extra, quizSlot, decadeSeg, nSeg, orderSeg, listSeg, head, cap, hover = null, list = 'main', order = 'genre', decade = 1980, topN = 20, mountedFor = null;

  const decades = () => [...new Set(HA.D.periods.map((p) => Math.floor(p / 10) * 10))];
  const decadeLabel = (d) => {
    if (HA.D.decadeLabel) return HA.D.decadeLabel(d);
    const ps = HA.D.periods.filter((p) => Math.floor(p / 10) * 10 === d);
    if (ps.length < 5) return `${HA.D.periodLabel(ps[0])}${ps.length > 1 ? '–' + String(ps[ps.length - 1]).slice(-2) : ''}`;
    return d === 2000 ? '2000s' : `’${String(d).slice(2)}s`;
  };

  function mount(el) {
    root = el;
    head = h('div', { class: 'view-head' });
    decadeSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Decade' });
    nSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Items per period' });
    orderSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Mosaic order' },
      [['genre', 'Grouped by genre'], ['rank', 'In rank order']].map(([k, l]) => h('button', { 'data-k': k, onclick: () => { order = k; HA.store.set('mosaicOrder', k); render(); } }, l)));
    canvas = h('canvas', { 'aria-label': 'Mosaic of every period’s top items, coloured by genre' });
    axis = h('div', { class: 'mosaic-axis' });
    grid = h('div', { class: 'decade-grid' });
    cap = h('span', { class: 'label-sm' });
    root.append(head,
      h('div', { class: 'mosaic-wrap' }, h('div', { class: 'mosaic-cap' }, cap, orderSeg), canvas, axis),
      h('div', { class: 'controls', style: { marginBottom: '12px' } }, decadeSeg, quizSlot = h('span', { class: 'quiz-slot' })),
      h('div', { class: 'scroll-x' }, grid), extra = h('div', {}));
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', () => { hover = null; HA.untip(); drawMosaic(); });
    canvas.addEventListener('click', onClick);
    order = HA.store.get('mosaicOrder', 'genre');
    new ResizeObserver(() => drawMosaic()).observe(canvas);
  }

  // A domain can offer a second ranking (music: Billboard's official year-end lists).
  const source = () => (list === 'alt' && HA.D.wall.alt ? HA.D.wall.alt.byPeriod : HA.D.byPeriod);

  // Rebuild the controls that depend on the domain.
  function setup() {
    const D = HA.D;
    mountedFor = D;
    decade = HA.pref('decade', D.id === 'music' ? 1980 : 1990);
    if (!decades().includes(decade)) decade = decades()[0];
    topN = HA.pref('topN', D.wall.defaultN);
    if (!D.wall.topNs.includes(topN)) topN = D.wall.defaultN;
    list = D.wall.alt ? HA.pref('wallList', 'main') : 'main';
    listSeg = D.wall.alt && h('div', { class: 'seg', role: 'group', 'aria-label': 'Ranking' },
      [['main', D.wall.mainLabel], ['alt', D.wall.alt.label]].map(([k, l]) => h('button', { 'data-k': k, title: k === 'alt' ? D.wall.alt.note : '', onclick: () => { list = k; HA.setPref('wallList', k); render(); } }, l)));
    head.replaceChildren(
      h('div', {}, h('h1', {}, D.wall.title), h('p', {}, D.wall.blurb, D.awardNote && h('span', { class: 'aw-key' }, ` ★ ${D.awardNote}.`))),
      h('div', { class: 'controls' }, listSeg, nSeg));
    nSeg.replaceChildren(...D.wall.topNs.map((n) => h('button', { 'data-n': n, onclick: () => { topN = n; HA.setPref('topN', n); render(); } }, `Top ${n}`)));
    decadeSeg.replaceChildren(...decades().map((d) => h('button', { 'data-d': d, onclick: () => { decade = d; HA.setPref('decade', d); render(); } }, decadeLabel(d))));
    cap.textContent = D.wall.caption;
  }

  // A period's top rows as drawn: by rank, or stacked by genre (rank order within).
  function column(p) {
    const D = HA.D;
    const rows = (source().get(p) || []).slice(0, D.wall.rows);
    if (order === 'rank') return rows;
    const key = (e) => (e.it.fam < 0 ? 99 : e.it.fam);
    return rows.slice().sort((a, b) => key(a) - key(b) || a.rank - b.rank);
  }

  function cellAt(e) {
    const r = canvas.getBoundingClientRect(), D = HA.D;
    const col = Math.floor(((e.clientX - r.left) / r.width) * D.periods.length);
    const row = Math.floor((e.clientY - r.top) / CELL_H);
    const p = D.periods[col];
    const entry = p != null && column(p)[row];
    return entry ? { p, row, entry } : null;
  }
  function onMove(e) {
    const c = cellAt(e);
    hover = c;
    drawMosaic();
    if (c) HA.tip(HA.D.tip(c.entry.it, c.entry), e.clientX, e.clientY);
    else HA.untip();
  }
  function onClick(e) {
    const c = cellAt(e);
    if (!c) return;
    decade = Math.floor(c.p / 10) * 10;
    HA.setPref('decade', decade);
    HA.open(c.entry.it);
    render();
    grid.querySelector(`[data-p="${c.p}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }

  function drawMosaic() {
    if (!canvas.isConnected || !canvas.clientWidth || mountedFor !== HA.D) return;
    const D = HA.D, pal = HA.palette(), dpr = devicePixelRatio || 1;
    const rows = D.wall.rows;
    const W = canvas.clientWidth, H = rows * CELL_H;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);
    const cw = W / D.periods.length, gap = cw > 6 ? 1 : 0.5;
    D.periods.forEach((p, c) => {
      column(p).forEach((e, r) => {
        ctx.globalAlpha = HA.lit(e.it.fam) ? 1 : 0.13;
        ctx.fillStyle = HA.famColour(pal, e.it.fam);
        ctx.fillRect(c * cw + gap / 2, r * CELL_H + 0.5, cw - gap, CELL_H - 1);
      });
    });
    ctx.globalAlpha = 1;
    const inDec = D.periods.map((p) => Math.floor(p / 10) * 10 === decade);
    const d0 = inDec.indexOf(true), n = inDec.filter(Boolean).length;
    if (d0 >= 0) { ctx.strokeStyle = pal.ink; ctx.lineWidth = 2; ctx.strokeRect(d0 * cw + 1, 1, n * cw - 2, H - 2); }
    if (hover) {
      const c = D.periods.indexOf(hover.p);
      ctx.strokeStyle = pal.ink; ctx.lineWidth = 1.5;
      ctx.strokeRect(c * cw - 0.5, hover.row * CELL_H - 0.5, cw + 1, CELL_H + 1);
    }
    // Decade ticks only; the caption already says where the data starts.
    axis.replaceChildren(...decades().filter((d) => D.periods.includes(d)).map((d) => {
      const c = D.periods.indexOf(d);
      return h('span', { style: { left: ((c + 0.5) / D.periods.length) * 100 + '%' } }, String(d));
    }));
  }

  function render() {
    const D = HA.D;
    if (mountedFor !== D) setup();
    decadeSeg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.d === decade)));
    nSeg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.n === topN)));
    orderSeg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === order)));
    listSeg?.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === list)));
    const ps = D.periods.filter((p) => Math.floor(p / 10) * 10 === decade);
    const dl = decadeLabel(decade), named = /s$/.test(dl) ? 'the ' + dl : dl;
    quizSlot.replaceChildren(HA.quizButton({ years: [decade, decade + 9], label: named }, `Quiz me on ${named}`));
    grid.replaceChildren(...ps.map((p) => {
      const partial = D.wall.partial(p);
      return h('div', { class: 'year-col', 'data-p': p },
        h('h3', {}, D.periodLabel(p), partial && h('small', {}, partial)),
        h('div', { class: 'tiles' }, (source().get(p) || []).slice(0, topN).map((e) => {
          const value = D.wall.value(e);
          return h('button', {
            class: 'tile' + (D.wall.crown(e) ? ' no1' : '') + (e.it.fam < 0 ? ' unknown' : '') + (HA.lit(e.it.fam) ? '' : ' dim'),
            style: { '--c': HA.famVar(e.it.fam) },
            title: `${e.it.title} — ${e.it.sub}${e.it.award ? ` · ${e.it.award}` : ''}`,
            onclick: () => HA.open(e.it),
          }, h('span', { class: 'rk' }, e.rank), h('span', { class: 'tt' }, e.title || e.it.title, e.it.award && h('span', { class: 'aw', 'aria-label': e.it.award }, ' ★')), h('span', { class: 'ar' }, value ? `${value} · ${e.it.sub}` : e.it.sub));
        })));
    }));
    // A domain can add a second panel per decade (TV adds streaming's top series).
    extra.replaceChildren(D.wall.extra ? D.wall.extra(decade, topN) || '' : '');
    drawMosaic();
  }

  HA.views.wall = { mount, render };
  HA.on('spot', () => { if (root && !root.hidden) render(); });
  HA.on('theme', () => { if (root && !root.hidden) drawMosaic(); });
})();
