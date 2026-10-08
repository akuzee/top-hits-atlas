// The Wall: every chart year's biggest hits. An overview mosaic of the top 40
// across all years, and a readable decade page beneath it.
(function () {
  const HA = globalThis.HA, h = HA.h;
  const ROWS = 40, CELL_H = 6;
  let root, canvas, axis, grid, decadeSeg, nSeg, orderSeg, hover = null, order = 'genre';

  const decades = () => {
    const out = [];
    for (let d = Math.floor(HA.m.firstYear / 10) * 10; d <= HA.m.lastYear; d += 10) out.push(d);
    return out;
  };
  const decadeLabel = (d) => (d === 1950 ? '1958–59' : d === 2000 ? '2000s' : `’${String(d).slice(2)}s`);

  function mount(el) {
    root = el;
    decadeSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Decade' },
      decades().map((d) => h('button', { 'data-d': d, onclick: () => { HA.state.decade = d; render(); } }, decadeLabel(d))));
    nSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Songs per year' },
      [10, 20, 40].map((n) => h('button', { 'data-n': n, onclick: () => { HA.state.topN = n; HA.store.set('topN', n); render(); } }, `Top ${n}`)));
    order = HA.store.get('mosaicOrder', 'genre');
    orderSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Mosaic order' },
      [['genre', 'Grouped by genre'], ['rank', 'In rank order']].map(([k, l]) => h('button', { 'data-k': k, onclick: () => { order = k; HA.store.set('mosaicOrder', k); render(); } }, l)));
    canvas = h('canvas', { height: ROWS * CELL_H, 'aria-label': 'Mosaic of the top 40 songs of every chart year, coloured by genre' });
    axis = h('div', { class: 'mosaic-axis' });
    grid = h('div', { class: 'decade-grid' });
    root.append(
      h('div', { class: 'view-head' },
        h('div', {},
          h('h1', {}, 'The Wall'),
          h('p', {}, 'Every chart year’s biggest hits, ranked by chart points. Each column is one year; colour is genre. Read the overview for eras, tap any cell for its song, then read a decade below.')),
        h('div', { class: 'controls' }, nSeg)),
      h('div', { class: 'mosaic-wrap' },
        h('div', { class: 'mosaic-cap' }, h('span', { class: 'label-sm' }, `Top ${ROWS} of every chart year, ${HA.m.firstYear}–${HA.m.lastYear}`), orderSeg),
        canvas, axis),
      h('div', { class: 'controls', style: { marginBottom: '12px' } }, decadeSeg),
      h('div', { class: 'scroll-x' }, grid));
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', () => { hover = null; HA.untip(); drawMosaic(); });
    canvas.addEventListener('click', onClick);
    HA.state.topN = HA.store.get('topN', 20);
    new ResizeObserver(() => drawMosaic()).observe(canvas);
  }

  // A year's top 40 as drawn: by rank, or stacked by genre (rank order within).
  function column(y) {
    const list = HA.m.byYear.get(y).slice(0, ROWS);
    if (order === 'rank') return list;
    const key = (s) => (s.fam < 0 ? HA.m.UNKNOWN : s.fam);
    return list.slice().sort((a, b) => key(a) - key(b) || a.yearRank - b.yearRank);
  }

  function cellAt(e) {
    const r = canvas.getBoundingClientRect(), m = HA.m;
    const col = Math.floor(((e.clientX - r.left) / r.width) * m.years.length);
    const row = Math.floor((e.clientY - r.top) / CELL_H);
    const year = m.years[col];
    const s = year && column(year)[row];
    return s ? { year, row, s } : null;
  }
  function onMove(e) {
    const c = cellAt(e);
    hover = c;
    drawMosaic();
    if (c) HA.tip(HA.songTip(c.s), e.clientX, e.clientY);
    else HA.untip();
  }
  function onClick(e) {
    const c = cellAt(e);
    if (!c) return;
    HA.state.decade = Math.floor(c.year / 10) * 10;
    HA.openSong(c.s.i);
    render();
    grid.querySelector(`[data-year="${c.year}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }

  function drawMosaic() {
    if (!canvas.isConnected || !canvas.clientWidth) return;
    const m = HA.m, pal = HA.palette(), dpr = devicePixelRatio || 1;
    const W = canvas.clientWidth, H = ROWS * CELL_H;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);
    const cw = W / m.years.length, gap = cw > 6 ? 1 : 0.5;
    m.years.forEach((y, c) => {
      const list = column(y);
      for (let r = 0; r < list.length; r++) {
        const s = list[r];
        ctx.globalAlpha = HA.lit(s.fam) ? 1 : 0.13;
        ctx.fillStyle = s.fam < 0 ? pal.unknown : pal.fams[s.fam];
        ctx.fillRect(c * cw + gap / 2, r * CELL_H + 0.5, cw - gap, CELL_H - 1);
      }
    });
    ctx.globalAlpha = 1;
    // Frame the decade shown below.
    const d0 = m.years.findIndex((y) => Math.floor(y / 10) * 10 === HA.state.decade);
    const n = m.years.filter((y) => Math.floor(y / 10) * 10 === HA.state.decade).length;
    if (d0 >= 0) {
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = 2;
      ctx.strokeRect(d0 * cw + 1, 1, n * cw - 2, H - 2);
    }
    if (hover) {
      const c = m.years.indexOf(hover.year);
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(c * cw - 0.5, hover.row * CELL_H - 0.5, cw + 1, CELL_H + 1);
    }
    // Decade ticks only; the caption already says where the chart starts.
    axis.replaceChildren(...decades().filter((d) => d >= m.firstYear).map((d) => {
      const c = m.years.indexOf(d);
      return h('span', { style: { left: ((c + 0.5) / m.years.length) * 100 + '%' } }, String(d));
    }));
  }

  function render() {
    const m = HA.m, N = HA.state.topN;
    decadeSeg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.d === HA.state.decade)));
    nSeg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.n === N)));
    orderSeg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === order)));
    const years = m.years.filter((y) => Math.floor(y / 10) * 10 === HA.state.decade);
    grid.replaceChildren(...years.map((y) => {
      const list = m.byYear.get(y).slice(0, N);
      const partial = y === m.firstYear ? 'from Aug' : y === m.lastYear ? `to ${HA.fmtMonth(m.weeks.length - 1).slice(0, 3)}` : '';
      return h('div', { class: 'year-col', 'data-year': y },
        h('h3', {}, String(y), partial && h('small', {}, partial)),
        h('div', { class: 'tiles' }, list.map((s, k) => h('button', {
          class: 'tile' + (s.peak === 1 ? ' no1' : '') + (s.fam < 0 ? ' unknown' : '') + (HA.lit(s.fam) ? '' : ' dim'),
          style: { '--c': HA.famVar(s.fam) },
          title: `${s.title} — ${s.credit}`,
          onclick: () => HA.openSong(s.i),
        }, h('span', { class: 'rk' }, k + 1), h('span', { class: 'tt' }, s.title), h('span', { class: 'ar' }, s.credit)))));
    }));
    drawMosaic();
  }

  HA.views = HA.views || {};
  HA.views.wall = { mount, render };
  HA.on('spot', () => { if (root && !root.hidden) render(); });
  HA.on('theme', () => { if (root && !root.hidden) drawMosaic(); });
})();
