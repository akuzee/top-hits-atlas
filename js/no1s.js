// No. 1s: every week's #1 as a calendar (one row per year, one bar per run at
// the top), or as a plain chronological list.
(function () {
  const HA = globalThis.HA, h = HA.h, s = HA.s;
  let root, body, modeSeg, facts, mode = 'cal', lastW = 0;

  function mount(el) {
    root = el;
    mode = HA.store.get('no1mode', 'cal');
    modeSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Layout' },
      [['cal', 'Calendar'], ['list', 'List']].map(([k, l]) => h('button', { 'data-k': k, onclick: () => { mode = k; HA.store.set('no1mode', k); render(); } }, l)));
    facts = h('p', {});
    body = h('div', {});
    root.append(h('div', { class: 'view-head' },
      h('div', {}, h('h1', {}, 'Every No. 1'), facts),
      h('div', { class: 'controls' }, modeSeg)), body);
    new ResizeObserver(() => {
      if (root.clientWidth === lastW) return;
      lastW = root.clientWidth;
      if (mode === 'cal' && !root.hidden) render();
    }).observe(root);
  }

  function factsText() {
    const m = HA.m;
    const no1Songs = m.songs.filter((x) => x.wk1 > 0);
    const longest = no1Songs.reduce((a, b) => (b.wk1 > a.wk1 ? b : a));
    const byAct = new Map();
    for (const x of no1Songs) { const a = x.acts[0]; byAct.set(a, (byAct.get(a) || 0) + 1); }
    const [topAct, topN] = [...byAct].sort((a, b) => b[1] - a[1])[0];
    return `${no1Songs.length.toLocaleString()} songs have reached #1 since August 1958. The most weeks at #1 is ${longest.wk1} (“${longest.title}”, ${longest.credit}); the act with the most #1s as lead is ${m.acts[topAct].name} with ${topN}.`;
  }

  function calendar() {
    const m = HA.m, pal = HA.palette();
    const W = Math.max(760, root.clientWidth - 26), labelW = 46, rowH = 21, top = 18;
    const y0 = m.weekYear[0], y1 = m.weekYear[m.weeks.length - 1];
    const H = top + (y1 - y0 + 1) * rowH + 4;
    const x = (doy) => labelW + (Math.min(doy, 366) / 366) * (W - labelW - 4);
    const svg = s('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Calendar of every number-one single' });
    const ax = s('g', { class: 'axis' });
    'JFMAMJJASOND'.split('').forEach((c, i) => ax.append(s('text', { x: x((i + 0.5) * 30.5), y: 12, 'text-anchor': 'middle' }, c)));
    for (let y = y0; y <= y1; y++) {
      const ry = top + (y - y0) * rowH;
      ax.append(s('text', { x: 0, y: ry + 15, style: y % 10 === 0 ? 'font-weight:700;fill:var(--ink)' : '' }, String(y)));
      if (y % 10 === 0) ax.append(s('line', { x1: 0, x2: W, y1: ry - 0.5, y2: ry - 0.5, class: 'baseline' }));
    }
    svg.append(ax);
    for (const run of m.no1Runs) {
      const song = m.songs[run.song], lit = HA.lit(song.fam);
      const fill = song.fam < 0 ? pal.unknown : pal.fams[song.fam];
      // A run crossing New Year draws as one piece per calendar row.
      const pieces = [];
      for (let w = run.start; w <= run.end; w++) {
        const last = pieces[pieces.length - 1];
        if (last && last.year === m.weekYear[w]) last.end = w; else pieces.push({ year: m.weekYear[w], start: w, end: w });
      }
      const longest = pieces.reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a));
      for (const p of pieces) {
        const xa = x(HA.dayOfYear(p.start)), xb = x(HA.dayOfYear(p.end) + 7);
        const ry = top + (p.year - y0) * rowH;
        const g = s('g', { class: 'bar', opacity: lit ? 1 : 0.15 });
        g.append(s('rect', { x: xa + 1, y: ry + 2, width: Math.max(2, xb - xa - 2), height: rowH - 4, rx: 3, fill }));
        const room = Math.floor((xb - xa - 8) / 5.4);
        if (p === longest && room >= 4) {
          const t = song.title.length > room ? song.title.slice(0, room - 1).trimEnd() + '…' : song.title;
          g.append(s('text', { x: xa + 5, y: ry + 14.5, style: `fill:${HA.inkOn(fill)};font-size:11px;font-weight:600;font-stretch:80%;pointer-events:none` }, t));
        }
        const weeks = run.end - run.start + 1;
        g.addEventListener('pointermove', (e) => HA.tip(`<div class="t-sub">#1 from ${HA.fmtWeek(run.start)} · ${HA.plural(weeks, 'week')}${song.wk1 > weeks ? ` (${song.wk1} in all)` : ''}</div>` + HA.songTip(song), e.clientX, e.clientY));
        g.addEventListener('pointerleave', HA.untip);
        g.addEventListener('click', () => HA.openSong(song.i));
        svg.append(g);
      }
    }
    return h('div', { class: 'cal-wrap scroll-x' }, h('div', { class: 'cal' }, svg));
  }

  function list() {
    const m = HA.m;
    const tb = h('tbody', {});
    let year = 0;
    for (const run of m.no1Runs) {
      const song = m.songs[run.song];
      const y = m.weekYear[run.start];
      if (y !== year) { year = y; tb.append(h('tr', { class: 'yr' }, h('td', { colspan: 4 }, String(y)))); }
      const repeat = m.no1Runs.find((r) => r.song === run.song) !== run;
      tb.append(h('tr', { style: { opacity: HA.lit(song.fam) ? 1 : 0.3 }, onclick: () => HA.openSong(song.i) },
        h('td', { class: 'num', style: { whiteSpace: 'nowrap', color: 'var(--muted)' } }, HA.fmtWeek(run.start).replace(/, \d{4}$/, '')),
        h('td', {}, h('i', { class: 'sw' + (song.fam < 0 ? ' unknown' : ''), style: { '--c': HA.famVar(song.fam), marginRight: '8px' } }), h('b', {}, song.title), repeat ? h('span', { class: 'feat-tag' }, '  (returns)') : ''),
        h('td', {}, song.credit),
        h('td', { class: 'num', style: { textAlign: 'right' } }, run.end - run.start + 1)));
    }
    return h('div', { class: 'cal-wrap scroll-x' }, h('table', { class: 'no1-list' },
      h('thead', {}, h('tr', {}, h('th', {}, 'First week'), h('th', {}, 'Song'), h('th', {}, 'Artist'), h('th', { style: { textAlign: 'right' } }, 'Weeks'))), tb));
  }

  function render() {
    modeSeg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === mode)));
    if (!facts.textContent) facts.textContent = factsText();
    body.replaceChildren(mode === 'cal' ? calendar() : list());
  }

  HA.views.no1s = { mount, render };
  HA.on('spot', () => { if (root && !root.hidden) render(); });
  HA.on('theme', () => { if (root && !root.hidden) render(); });
})();
