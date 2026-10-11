// No. 1s: every #1 run as a calendar (one row per year, one bar per run at the
// top), or as a plain chronological list. Domains supply D.calendar.runs as
// {it, start, end (exclusive date), n (units in this run), total (units ever)}.
(function () {
  const HA = globalThis.HA, h = HA.h, s = HA.s;
  let root, body, modeSeg, head, mode = 'cal', lastW = 0, mountedFor = null;

  function mount(el) {
    root = el;
    mode = HA.store.get('no1mode', 'cal');
    modeSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Layout' },
      [['cal', 'Calendar'], ['list', 'List']].map(([k, l]) => h('button', { 'data-k': k, onclick: () => { mode = k; HA.store.set('no1mode', k); render(); } }, l)));
    head = h('div', { class: 'view-head' });
    body = h('div', {});
    root.append(head, body);
    new ResizeObserver(() => {
      if (root.clientWidth === lastW) return;
      lastW = root.clientWidth;
      if (mode === 'cal' && !root.hidden) render();
    }).observe(root);
  }

  function calendar() {
    const C = HA.D.calendar, pal = HA.palette();
    const W = Math.max(760, root.clientWidth - 26), labelW = 46, rowH = 21, top = 18;
    const y0 = +C.runs[0].start.slice(0, 4), y1 = +C.runs[C.runs.length - 1].start.slice(0, 4);
    const H = top + (y1 - y0 + 1) * rowH + 4;
    const x = (doy) => labelW + (Math.min(doy, 366) / 366) * (W - labelW - 4);
    const svg = s('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': C.title });
    const ax = s('g', { class: 'axis' });
    'JFMAMJJASOND'.split('').forEach((c, i) => ax.append(s('text', { x: x((i + 0.5) * 30.5), y: 12, 'text-anchor': 'middle' }, c)));
    for (let y = y0; y <= y1; y++) {
      const ry = top + (y - y0) * rowH;
      ax.append(s('text', { x: 0, y: ry + 15, style: y % 10 === 0 ? 'font-weight:700;fill:var(--ink)' : '' }, String(y)));
      if (y % 10 === 0) ax.append(s('line', { x1: 0, x2: W, y1: ry - 0.5, y2: ry - 0.5, class: 'baseline' }));
    }
    svg.append(ax);
    for (const run of C.runs) {
      const it = run.it, lit = HA.lit(it.fam), fill = HA.famColour(pal, it.fam);
      // A run crossing New Year draws as one piece per calendar row.
      const pieces = [];
      let a = run.start;
      while (a < run.end) {
        const yEnd = `${+a.slice(0, 4) + 1}-01-01`;
        const b = run.end < yEnd ? run.end : yEnd;
        pieces.push({ year: +a.slice(0, 4), a, b });
        a = b;
      }
      const longest = pieces.reduce((p, q) => (Date.parse(q.b) - Date.parse(q.a) > Date.parse(p.b) - Date.parse(p.a) ? q : p));
      for (const p of pieces) {
        const xa = x(HA.dayOfYear(p.a)), xb = p.b.endsWith('-01-01') && p.b !== p.a ? x(366) : x(HA.dayOfYear(p.b));
        const ry = top + (p.year - y0) * rowH;
        const g = s('g', { class: 'bar', opacity: lit ? 1 : 0.15 });
        g.append(s('rect', { x: xa + 1, y: ry + 2, width: Math.max(2, xb - xa - 2), height: rowH - 4, rx: 3, fill }));
        const room = Math.floor((xb - xa - 8) / 5.4);
        if (p === longest && room >= 4) {
          const t = it.title.length > room ? it.title.slice(0, room - 1).trimEnd() + '…' : it.title;
          g.append(s('text', { x: xa + 5, y: ry + 14.5, style: `fill:${HA.inkOn(fill)};font-size:11px;font-weight:600;font-stretch:80%;pointer-events:none` }, t));
        }
        HA.bindTip(g, () => `<div class="t-sub">#1 from ${HA.fmtDate(run.start)} · ${HA.plural(run.n, C.unit)}${run.total > run.n ? ` (${run.total} in all)` : ''}</div>` + HA.D.tip(it), () => HA.open(it));
        svg.append(g);
      }
    }
    return h('div', { class: 'cal-wrap scroll-x' }, h('div', { class: 'cal' }, svg));
  }

  function list() {
    const C = HA.D.calendar;
    const tb = h('tbody', {});
    const seen = new Set();
    let year = 0;
    for (const run of C.runs) {
      const it = run.it, y = +run.start.slice(0, 4);
      if (y !== year) { year = y; tb.append(h('tr', { class: 'yr' }, h('td', { colspan: 4 }, String(y)))); }
      const repeat = seen.has(it.i);
      seen.add(it.i);
      tb.append(h('tr', { style: { opacity: HA.lit(it.fam) ? 1 : 0.3 }, onclick: () => HA.open(it) },
        h('td', { class: 'num', style: { whiteSpace: 'nowrap', color: 'var(--muted)' } }, HA.fmtDate(run.start).replace(/, \d{4}$/, '')),
        h('td', {}, HA.swatch(it.fam, { marginRight: '8px' }), h('b', {}, it.title), repeat ? h('span', { class: 'feat-tag' }, '  (returns)') : ''),
        h('td', {}, it.sub),
        h('td', { class: 'num', style: { textAlign: 'right' } }, run.n)));
    }
    const unitTitle = C.unit[0].toUpperCase() + C.unit.slice(1) + 's';
    return h('div', { class: 'cal-wrap scroll-x' }, h('table', { class: 'no1-list' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Starting'), h('th', {}, HA.D.noun[0].toUpperCase() + HA.D.noun.slice(1)), h('th', {}, ''), h('th', { style: { textAlign: 'right' } }, unitTitle))), tb));
  }

  function render() {
    const D = HA.D;
    if (mountedFor !== D) {
      mountedFor = D;
      head.replaceChildren(h('div', {}, h('h1', {}, D.calendar.title), h('p', {}, D.calendar.facts())), h('div', { class: 'controls' }, modeSeg, HA.quizButton({ no1: true }, 'Quiz me on No. 1s')));
    }
    modeSeg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === mode)));
    body.replaceChildren(mode === 'cal' ? calendar() : list());
  }

  HA.views.no1s = { mount, render };
  HA.on('spot', () => { if (root && !root.hidden) render(); });
  HA.on('theme', () => { if (root && !root.hidden) render(); });
})();
