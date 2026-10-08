// Genres: the share of chart points each genre held, quarter by quarter, as a
// 100% stacked river; below it, the biggest hits of each genre for one year.
(function () {
  const HA = globalThis.HA, h = HA.h, s = HA.s;
  let root, chart, panel, year = 1979, lastW = 0, shares = null;

  function mount(el) {
    root = el;
    year = HA.store.get('riverYear', 1979);
    chart = h('div', { class: 'river' });
    panel = h('div', { class: 'year-hits' });
    root.append(
      h('div', { class: 'view-head' }, h('div', {},
        h('h1', {}, 'Genre river'),
        h('p', {}, 'Each band is a genre’s share of the Hot 100’s chart points in that quarter: a week at #1 counts ten times a week at #100. Hover to read a moment; tap to list that year’s biggest hits by genre.'))),
      h('div', { class: 'river-wrap' }, chart),
      panel);
    new ResizeObserver(() => {
      if (root.clientWidth === lastW) return;
      lastW = root.clientWidth;
      if (!root.hidden) drawChart();
    }).observe(root);
  }

  // Quarter shares, lightly smoothed over neighbouring quarters so one odd
  // quarter doesn't spike the river.
  function computeShares() {
    const m = HA.m, Q = m.river.length, F = m.UNKNOWN + 1;
    const raw = m.river.map((row) => { const t = row.reduce((a, b) => a + b, 0) || 1; return Array.from(row, (v) => v / t); });
    const first = m.quarterOf[0], last = m.quarterOf[m.weeks.length - 1];
    const out = [];
    for (let q = first; q <= last; q++) {
      const acc = new Array(F).fill(0);
      let n = 0;
      for (let k = Math.max(first, q - 1); k <= Math.min(last, q + 1); k++) { const wgt = k === q ? 2 : 1; raw[k].forEach((v, f) => { acc[f] += v * wgt; }); n += wgt; }
      out.push({ q, year: m.weekYear[0] + Math.floor(q / 4), qi: q % 4, v: acc.map((v) => v / n) });
    }
    return out;
  }

  function drawChart() {
    const m = HA.m, pal = HA.palette();
    shares = shares || computeShares();
    const W = Math.max(320, chart.clientWidth || root.clientWidth - 26);
    const H = W < 600 ? 260 : 360, pad = { l: 36, r: 8, t: 6, b: 22 };
    const n = shares.length, F = m.UNKNOWN + 1;
    const x = (i) => pad.l + (i / (n - 1)) * (W - pad.l - pad.r);
    const y = (v) => pad.t + (1 - v) * (H - pad.t - pad.b);
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Share of chart points by genre over time' });
    // Cumulative stack, bottom up, in palette order.
    const cum = shares.map((d) => { let c = 0; return d.v.map((v) => { const lo = c; c += v; return [lo, c]; }); });
    const colour = (f) => (f === m.UNKNOWN ? pal.unknown : pal.fams[f]);
    const bands = s('g', {});
    for (let f = 0; f < F; f++) {
      const upper = cum.map((c, i) => `${x(i).toFixed(1)},${y(c[f][1]).toFixed(1)}`);
      const lower = cum.map((c, i) => `${x(i).toFixed(1)},${y(c[f][0]).toFixed(1)}`).reverse();
      const key = f === m.UNKNOWN ? 'unknown' : f;
      bands.append(s('polygon', {
        points: upper.concat(lower).join(' '), fill: colour(f), stroke: pal.surface, 'stroke-width': 1,
        opacity: HA.state.spot == null || HA.state.spot === key ? 1 : 0.16,
        style: 'cursor:pointer', 'data-key': key,
      }));
    }
    svg.append(bands);
    // Direct labels at each band's thickest point, when it has room.
    for (let f = 0; f < m.UNKNOWN; f++) {
      let best = -1, th = 0;
      cum.forEach((c, i) => { const t = (c[f][1] - c[f][0]) * (H - pad.t - pad.b); if (t > th && i > 4 && i < n - 5) { th = t; best = i; } });
      if (th < 17) continue;
      const c = cum[best][f];
      svg.append(s('text', { x: x(best), y: y((c[0] + c[1]) / 2) + 4, 'text-anchor': 'middle', style: `fill:${HA.inkOn(pal.fams[f])};font-size:12px;font-weight:700;pointer-events:none`, opacity: HA.lit(f) ? 1 : 0.3 }, m.fams[f].label));
    }
    const ax = s('g', { class: 'axis grid' });
    for (const v of [0, 0.5, 1]) ax.append(s('text', { x: pad.l - 6, y: y(v) + 4, 'text-anchor': 'end' }, `${v * 100}%`));
    for (let d = Math.ceil(shares[0].year / 10) * 10; d <= shares[n - 1].year; d += 10) {
      const i = shares.findIndex((q) => q.year === d && q.qi === 0);
      ax.append(s('line', { x1: x(i), x2: x(i), y1: pad.t, y2: H - pad.b, style: 'stroke:var(--surface);stroke-opacity:.55' }));
      ax.append(s('text', { x: x(i), y: H - 6, 'text-anchor': 'middle' }, String(d)));
    }
    svg.append(ax);
    const cross = s('line', { y1: pad.t, y2: H - pad.b, stroke: pal.ink, 'stroke-width': 1.5, visibility: 'hidden', 'pointer-events': 'none' });
    const sel = s('rect', { y: pad.t, height: H - pad.t - pad.b, fill: 'none', stroke: pal.ink, 'stroke-width': 2, 'pointer-events': 'none' });
    svg.append(sel, cross);
    const placeSel = () => {
      const a = shares.findIndex((q) => q.year === year), b = shares.findLastIndex((q) => q.year === year);
      if (a < 0) { sel.setAttribute('visibility', 'hidden'); return; }
      sel.setAttribute('visibility', 'visible');
      sel.setAttribute('x', x(Math.max(0, a - 0.5)));
      sel.setAttribute('width', x(Math.min(n - 1, b + 0.5)) - x(Math.max(0, a - 0.5)));
    };
    placeSel();
    const idxAt = (e) => {
      const r = svg.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * W;
      return Math.max(0, Math.min(n - 1, Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (n - 1))));
    };
    svg.addEventListener('pointermove', (e) => {
      const i = idxAt(e), d = shares[i];
      cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
      const rows = [];
      for (let f = F - 1; f >= 0; f--) {
        if (d.v[f] < 0.005) continue;
        const label = f === m.UNKNOWN ? 'No data' : m.fams[f].label;
        rows.push(`<div class="t-row"><i class="sw${f === m.UNKNOWN ? ' unknown' : ''}" style="--c:${colour(f)}"></i>${label}<span class="v">${Math.round(d.v[f] * 100)}%</span></div>`);
      }
      HA.tip(`<b>Q${d.qi + 1} ${d.year}</b>${rows.join('')}`, e.clientX, e.clientY);
    });
    svg.addEventListener('pointerleave', () => { cross.setAttribute('visibility', 'hidden'); HA.untip(); });
    // A tap picks the year; a tap on a band also spotlights that genre.
    svg.addEventListener('click', (e) => {
      year = shares[idxAt(e)].year;
      HA.store.set('riverYear', year);
      const key = e.target.dataset?.key;
      if (key != null && HA.state.spot == null) HA.setSpot(key === 'unknown' ? key : +key);
      else { placeSel(); renderPanel(); }
    });
    chart.replaceChildren(svg);
  }

  function renderPanel() {
    const m = HA.m;
    year = Math.max(m.firstYear, Math.min(m.lastYear, year));
    const list = m.byYear.get(year);
    const pts = new Array(m.UNKNOWN + 1).fill(0);
    for (const x of list) pts[x.fam < 0 ? m.UNKNOWN : x.fam] += x.yearPts;
    const total = pts.reduce((a, b) => a + b, 0);
    const famsShown = HA.state.spot == null
      ? m.fams.map((f) => f.i).sort((a, b) => pts[b] - pts[a]).filter((f) => pts[f] > 0)
      : HA.state.spot === 'unknown' ? [] : [HA.state.spot];
    const per = HA.state.spot == null ? 5 : 20;
    const step = (d) => h('button', { class: 'btn', onclick: () => { year += d; HA.store.set('riverYear', year); drawChart(); renderPanel(); } }, d < 0 ? '← ' + (year - 1) : year + 1 + ' →');
    panel.replaceChildren(
      h('div', { class: 'view-head' },
        h('div', {}, h('h2', {}, `${year}: the biggest hit in each genre`), h('div', { class: 'note' }, 'Chart year ' + year + ' (December to November). Shares are of chart points earned that year.')),
        h('div', { class: 'controls' }, year > m.firstYear && step(-1), year < m.lastYear && step(1))),
      h('div', { class: 'fam-cards' }, famsShown.map((f) => {
        const songs = list.filter((x) => x.fam === f).slice(0, per);
        return h('div', { class: 'fam-card' },
          h('h4', {}, h('i', { class: 'sw', style: { '--c': HA.famVar(f) } }), m.fams[f].label, h('span', { class: 'pct' }, Math.round((pts[f] / total) * 100) + '%')),
          HA.state.spot != null && h('p', { class: 'blurb' }, m.fams[f].blurb),
          h('ol', {}, songs.map((x) => h('li', {}, h('button', { onclick: () => HA.openSong(x.i), title: `#${x.yearRank} of ${year}` },
            h('b', {}, x.title), h('span', {}, `${x.credit} · #${x.yearRank} of the year`))))));
      })));
  }

  function render() { drawChart(); renderPanel(); }

  HA.views.genres = { mount, render };
  HA.on('spot', () => { if (root && !root.hidden) render(); });
  HA.on('theme', () => { if (root && !root.hidden) drawChart(); });
})();
