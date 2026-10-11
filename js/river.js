// Genres: each genre's share over time as a 100% stacked river; below it, the
// biggest items of each genre for one period. Domains supply D.river.rows as
// {p (period for the panel), label, start (first row of a year), v (shares by
// family, unknown last)}.
(function () {
  const HA = globalThis.HA, h = HA.h, s = HA.s;
  let root, head, chart, panel, period = null, lastW = 0, mountedFor = null;

  function mount(el) {
    root = el;
    head = h('div', { class: 'view-head' });
    chart = h('div', { class: 'river' });
    panel = h('div', { class: 'year-hits' });
    root.append(head, h('div', { class: 'river-wrap' }, chart), panel);
    new ResizeObserver(() => {
      if (root.clientWidth === lastW) return;
      lastW = root.clientWidth;
      if (!root.hidden) drawChart();
    }).observe(root);
  }

  function setup() {
    const D = HA.D;
    mountedFor = D;
    head.replaceChildren(h('div', {}, h('h1', {}, D.river.title), h('p', {}, D.river.blurb)),
      h('div', { class: 'controls' }, HA.quizButton({}, () => (HA.state.spot != null ? `Quiz me on ${D.fams[HA.state.spot].label}` : 'Quiz me on every genre'))));
    period = HA.pref('riverPeriod', D.river.defaultPeriod);
    if (!D.byPeriod.has(period)) period = D.periods[Math.floor(D.periods.length / 2)];
  }

  function drawChart() {
    const D = HA.D, pal = HA.palette(), rows = D.river.rows;
    const W = Math.max(320, chart.clientWidth || root.clientWidth - 26);
    const H = W < 600 ? 260 : 360, pad = { l: 36, r: 8, t: 6, b: 22 };
    const n = rows.length, F = D.fams.length + 1, UNK = D.fams.length;
    const x = (i) => pad.l + (i / (n - 1)) * (W - pad.l - pad.r);
    const y = (v) => pad.t + (1 - v) * (H - pad.t - pad.b);
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `${D.label}: share by genre over time` });
    const cum = rows.map((d) => { let c = 0; return d.v.map((v) => { const lo = c; c += v; return [lo, c]; }); });
    const colour = (f) => (f === UNK ? pal.unknown : pal.fams[f]);
    const bands = s('g', {});
    for (let f = 0; f < F; f++) {
      if (!cum.some((c) => c[f][1] - c[f][0] > 0)) continue;
      const upper = cum.map((c, i) => `${x(i).toFixed(1)},${y(c[f][1]).toFixed(1)}`);
      const lower = cum.map((c, i) => `${x(i).toFixed(1)},${y(c[f][0]).toFixed(1)}`).reverse();
      const key = f === UNK ? 'unknown' : f;
      bands.append(s('polygon', {
        points: upper.concat(lower).join(' '), fill: colour(f), stroke: pal.surface, 'stroke-width': 1,
        opacity: HA.state.spot == null || HA.state.spot === key ? 1 : 0.16, style: 'cursor:pointer', 'data-key': key,
      }));
    }
    svg.append(bands);
    // Direct labels at each band's thickest point, when it has room.
    const edge = Math.max(1, Math.round(n * 0.02));
    for (let f = 0; f < UNK; f++) {
      let best = -1, th = 0;
      cum.forEach((c, i) => { const t = (c[f][1] - c[f][0]) * (H - pad.t - pad.b); if (t > th && i >= edge && i < n - edge) { th = t; best = i; } });
      if (th < 17) continue;
      const c = cum[best][f];
      svg.append(s('text', { x: x(best), y: y((c[0] + c[1]) / 2) + 4, 'text-anchor': 'middle', style: `fill:${HA.inkOn(pal.fams[f])};font-size:12px;font-weight:700;pointer-events:none`, opacity: HA.lit(f) ? 1 : 0.3 }, D.fams[f].label));
    }
    const ax = s('g', { class: 'axis grid' });
    for (const v of [0, 0.5, 1]) ax.append(s('text', { x: pad.l - 6, y: y(v) + 4, 'text-anchor': 'end' }, `${v * 100}%`));
    rows.forEach((r, i) => {
      if (!r.start || r.p % 10 !== 0) return;
      ax.append(s('line', { x1: x(i), x2: x(i), y1: pad.t, y2: H - pad.b, style: 'stroke:var(--surface);stroke-opacity:.55' }));
      ax.append(s('text', { x: x(i), y: H - 6, 'text-anchor': 'middle' }, String(r.p)));
    });
    svg.append(ax);
    const cross = s('line', { y1: pad.t, y2: H - pad.b, stroke: pal.ink, 'stroke-width': 1.5, visibility: 'hidden', 'pointer-events': 'none' });
    const sel = s('rect', { y: pad.t, height: H - pad.t - pad.b, fill: 'none', stroke: pal.ink, 'stroke-width': 2, 'pointer-events': 'none' });
    svg.append(sel, cross);
    const placeSel = () => {
      const a = rows.findIndex((r) => r.p === period), b = rows.findLastIndex((r) => r.p === period);
      if (a < 0) { sel.setAttribute('visibility', 'hidden'); return; }
      sel.setAttribute('visibility', 'visible');
      sel.setAttribute('x', x(Math.max(0, a - 0.5)));
      sel.setAttribute('width', Math.max(3, x(Math.min(n - 1, b + 0.5)) - x(Math.max(0, a - 0.5))));
    };
    placeSel();
    const idxAt = (e) => {
      const r = svg.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * W;
      return Math.max(0, Math.min(n - 1, Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (n - 1))));
    };
    svg.addEventListener('pointermove', (e) => {
      const i = idxAt(e), d = rows[i];
      cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
      const lines = [];
      for (let f = F - 1; f >= 0; f--) {
        if (d.v[f] < 0.005) continue;
        const label = f === UNK ? 'No data' : D.fams[f].label;
        lines.push(`<div class="t-row"><i class="sw${f === UNK ? ' unknown' : ''}" style="--c:${colour(f)}"></i>${label}<span class="v">${Math.round(d.v[f] * 100)}%</span></div>`);
      }
      HA.tip(`<b>${d.label}</b>${lines.join('')}`, e.clientX, e.clientY);
    });
    svg.addEventListener('pointerleave', () => { cross.setAttribute('visibility', 'hidden'); HA.untip(); });
    // A tap picks the period; a tap on a band also spotlights that genre.
    svg.addEventListener('click', (e) => {
      period = rows[idxAt(e)].p;
      HA.setPref('riverPeriod', period);
      const key = e.target.dataset?.key;
      if (key != null && HA.state.spot == null) HA.setSpot(key === 'unknown' ? key : +key);
      else { placeSel(); renderPanel(); }
    });
    chart.replaceChildren(svg);
  }

  function renderPanel() {
    const D = HA.D;
    const list = D.byPeriod.get(period) || [];
    const val = new Array(D.fams.length + 1).fill(0);
    for (const e of list) val[e.it.fam < 0 ? D.fams.length : e.it.fam] += e.value || 1;
    const total = val.reduce((a, b) => a + b, 0) || 1;
    const famsShown = HA.state.spot == null
      ? D.fams.map((f) => f.i).sort((a, b) => val[b] - val[a]).filter((f) => val[f] > 0)
      : HA.state.spot === 'unknown' ? [] : [HA.state.spot];
    const per = HA.state.spot == null ? 5 : 20;
    const k = D.periods.indexOf(period);
    const step = (d) => {
      const p = D.periods[k + d];
      return p != null && h('button', { class: 'btn', onclick: () => { period = p; HA.setPref('riverPeriod', p); drawChart(); renderPanel(); } }, d < 0 ? '← ' + D.periodLabel(p) : D.periodLabel(p) + ' →');
    };
    panel.replaceChildren(
      h('div', { class: 'view-head' },
        h('div', {}, h('h2', {}, `${D.periodLabel(period)}: the biggest in each genre`), h('div', { class: 'note' }, D.river.panelNote(period))),
        h('div', { class: 'controls' }, step(-1), step(1))),
      h('div', { class: 'fam-cards' }, famsShown.map((f) => {
        const entries = list.filter((e) => e.it.fam === f).slice(0, per);
        return h('div', { class: 'fam-card' },
          h('h4', {}, HA.swatch(f), D.fams[f].label, h('span', { class: 'pct' }, Math.round((val[f] / total) * 100) + '%')),
          HA.state.spot != null && h('p', { class: 'blurb' }, D.fams[f].blurb),
          h('ol', {}, entries.map((e) => h('li', {}, h('button', { onclick: () => HA.open(e.it) },
            h('b', {}, e.it.title), h('span', {}, `${e.it.sub} · #${e.rank} of ${D.periodLabel(period)}`))))));
      })));
  }

  function render() {
    if (mountedFor !== HA.D) setup();
    drawChart();
    renderPanel();
  }

  HA.views.genres = { mount, render };
  HA.on('spot', () => { if (root && !root.hidden) render(); });
  HA.on('theme', () => { if (root && !root.hidden) drawChart(); });
})();
