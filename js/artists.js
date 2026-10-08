// Artists: career lanes for the acts that defined each decade, and a
// trajectory page for any one act (every song's weekly chart run).
(function () {
  const HA = globalThis.HA, h = HA.h, s = HA.s;
  let root, body, lastW = 0, sortKey = 'date';

  function mount(el) {
    root = el;
    body = h('div', {});
    root.append(body);
    new ResizeObserver(() => {
      if (root.clientWidth === lastW) return;
      lastW = root.clientWidth;
      if (!root.hidden) render();
    }).observe(root);
  }

  // x position for a week on a 1958→now axis.
  const timeAxis = (W, l, r) => {
    const m = HA.m, n = m.weeks.length;
    return (w) => l + (w / (n - 1)) * (W - l - r);
  };

  function lanes() {
    const m = HA.m, pal = HA.palette();
    const leaders = HA.decadeLeaders(m, 7);
    const ids = [...new Set(leaders.flatMap((d) => d.acts))].sort((a, b) => m.acts[a].first - m.acts[b].first);
    const W = Math.max(720, root.clientWidth - 26), nameW = 150, laneH = 22, top = 22;
    const H = top + ids.length * laneH + 6;
    const x = timeAxis(W, nameW, 10);
    const svg = s('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Career lanes of the leading acts of each decade' });
    const ax = s('g', { class: 'axis grid' });
    for (let y = 1960; y <= m.lastYear; y += 10) {
      const w = m.weeks.findIndex((d) => +d.slice(0, 4) === y);
      ax.append(s('line', { x1: x(w), x2: x(w), y1: top - 4, y2: H }), s('text', { x: x(w), y: 12, 'text-anchor': 'middle' }, String(y)));
    }
    svg.append(ax);
    ids.forEach((a, k) => {
      const act = m.acts[a], cy = top + k * laneH + laneH / 2;
      svg.append(s('text', { class: 'lane-name', x: nameW - 10, y: cy + 4, 'text-anchor': 'end', onclick: () => HA.showArtist(a) }, act.name.length > 22 ? act.name.slice(0, 21) + '…' : act.name));
      svg.append(s('line', { x1: x(act.first), x2: x(act.last), y1: cy, y2: cy, stroke: pal.line, 'stroke-width': 2 }));
      const songs = act.songs.map((i) => m.songs[i]).filter((x) => x.peak <= 40).sort((p, q) => q.peak - p.peak);
      for (const so of songs) {
        const r = so.peak === 1 ? 6 : so.peak <= 10 ? 4.5 : 2.8;
        const fill = so.fam < 0 ? pal.unknown : pal.fams[so.fam];
        const c = s('circle', {
          class: 'dot', cx: x(so.peakWeek), cy, r, fill, opacity: HA.lit(so.fam) ? 1 : 0.15,
          stroke: so.peak === 1 ? pal.ink : pal.surface, 'stroke-width': so.peak === 1 ? 1.5 : 1,
        });
        c.addEventListener('pointermove', (e) => HA.tip(HA.songTip(so), e.clientX, e.clientY));
        c.addEventListener('pointerleave', HA.untip);
        c.addEventListener('click', () => HA.openSong(so.i));
        svg.append(c);
      }
    });
    return h('div', {},
      h('div', { class: 'view-head' }, h('div', {},
        h('h1', {}, 'Career lanes'),
        h('p', {}, 'The seven biggest acts of each decade, ordered by their first hit. Each dot is a top-40 hit at the week it peaked: big dots are top 10, ringed dots reached #1. Tap a name for the full trajectory, or search any artist.'))),
      h('div', { class: 'lanes-wrap scroll-x' }, h('div', { class: 'lanes' }, svg)));
  }

  function trajectory(a) {
    const m = HA.m, pal = HA.palette(), act = m.acts[a];
    const songs = act.songs.map((i) => m.songs[i]);
    const lead = songs.filter((x) => x.acts.indexOf(a) < x.nLead);
    const top10 = songs.filter((x) => x.peak <= 10).length, no1 = songs.filter((x) => x.peak === 1).length;
    const W = Math.max(320, root.clientWidth - 26), H = W < 600 ? 280 : 360, pad = { l: 34, r: 12, t: 30, b: 24 };
    const span = act.last - act.first;
    const w0 = act.first - Math.max(4, span * 0.03), w1 = act.last + Math.max(4, span * 0.03);
    const x = (w) => pad.l + ((w - w0) / (w1 - w0)) * (W - pad.l - pad.r);
    const y = (r) => pad.t + ((Math.sqrt(r) - 1) / 9) * (H - pad.t - pad.b);
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Chart runs of every ${act.name} song` });
    const ax = s('g', { class: 'axis grid' });
    for (const r of [1, 5, 10, 20, 40, 70, 100]) ax.append(s('line', { x1: pad.l, x2: W - pad.r, y1: y(r), y2: y(r) }), s('text', { x: pad.l - 6, y: y(r) + 4, 'text-anchor': 'end' }, '#' + r));
    const y0 = m.weekYear[Math.max(0, Math.ceil(w0))], y1 = m.weekYear[Math.min(m.weeks.length - 1, Math.floor(w1))];
    const stepY = y1 - y0 > 40 ? 10 : y1 - y0 > 16 ? 5 : y1 - y0 > 6 ? 2 : 1;
    for (let yr = Math.ceil(y0 / stepY) * stepY; yr <= y1; yr += stepY) {
      const w = m.weeks.findIndex((d) => +d.slice(0, 4) === yr);
      if (w < 0 || w < w0 || w > w1) continue;
      ax.append(s('text', { x: x(w), y: H - 6, 'text-anchor': 'middle' }, String(yr)));
    }
    svg.append(ax);
    const lines = s('g', {});
    const order = [...songs].sort((p, q) => q.peak - p.peak);
    for (const so of order) {
      const col = so.fam < 0 ? pal.unknown : pal.fams[so.fam];
      const g = s('g', { opacity: HA.lit(so.fam) ? 1 : 0.15, style: 'cursor:pointer' });
      for (const seg of so.segs) {
        if (seg.length > 2) g.append(s('polyline', { class: 'song-line', points: seg.slice(1).map((r, j) => `${x(seg[0] + j).toFixed(1)},${y(r).toFixed(1)}`).join(' '), stroke: col }));
        else g.append(s('circle', { cx: x(seg[0]), cy: y(seg[1]), r: 2.5, fill: col }));
      }
      // Wide invisible hit area so thin lines are easy to point at.
      for (const seg of so.segs) if (seg.length > 2) g.append(s('polyline', { points: seg.slice(1).map((r, j) => `${x(seg[0] + j).toFixed(1)},${y(r).toFixed(1)}`).join(' '), fill: 'none', stroke: 'transparent', 'stroke-width': 10 }));
      g.addEventListener('pointermove', (e) => { g.querySelectorAll('.song-line').forEach((l) => l.classList.add('hot')); HA.tip(HA.songTip(so), e.clientX, e.clientY); });
      g.addEventListener('pointerleave', () => { g.querySelectorAll('.song-line').forEach((l) => l.classList.remove('hot')); HA.untip(); });
      g.addEventListener('click', () => HA.openSong(so.i));
      lines.append(g);
    }
    svg.append(lines);
    // Label the biggest peaks, skipping any that would collide with one already placed.
    const placed = [];
    for (const so of [...songs].sort((p, q) => p.peak - q.peak || q.pts - p.pts)) {
      if (so.peak > 20 || placed.length >= 14) break;
      const lx = x(so.peakWeek), ly = y(so.peak) - 7;
      const wpx = Math.min(so.title.length, 26) * 6;
      const box = [lx - wpx / 2, ly - 11, lx + wpx / 2, ly + 2];
      if (box[0] < pad.l || box[2] > W - 2 || placed.some((b) => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) continue;
      placed.push(box);
      svg.append(s('text', { class: 'peak-label', x: lx, y: ly, 'text-anchor': 'middle', 'pointer-events': 'none', opacity: HA.lit(so.fam) ? 1 : 0.3 }, so.title.length > 26 ? so.title.slice(0, 25) + '…' : so.title));
    }

    const rows = [...songs].sort(sortKey === 'peak' ? (p, q) => p.peak - q.peak || q.pts - p.pts : sortKey === 'pts' ? (p, q) => q.pts - p.pts : (p, q) => p.first - q.first);
    const th = (k, label, cls) => h('th', { class: cls, onclick: () => { sortKey = k; render(); }, 'aria-sort': sortKey === k ? 'ascending' : null }, label + (sortKey === k ? ' ▾' : ''));
    const famCounts = new Map();
    for (const x of songs) famCounts.set(x.fam, (famCounts.get(x.fam) || 0) + 1);
    const famLabel = act.fam >= 0 ? m.fams[act.fam].label : 'Genre unknown';

    return h('div', {},
      h('div', { class: 'controls', style: { marginBottom: '10px' } }, h('button', { class: 'btn', onclick: () => { HA.state.artist = null; render(); } }, '← All career lanes')),
      h('div', { class: 'artist-head' },
        h('div', {},
          h('div', { class: 'd-fam' }, h('i', { class: 'sw' + (act.fam < 0 ? ' unknown' : ''), style: { '--c': HA.famVar(act.fam) } }), famLabel, h('span', { class: 'note' }, ' · ' + HA.SRC_LABEL[act.src])),
          h('h1', {}, act.name)),
        h('div', { class: 'stats' },
          h('div', { class: 'stat' }, h('b', {}, `${m.weekYear[act.first]}–${String(m.weekYear[act.last]).slice(-2)}`), h('span', {}, 'on the chart')),
          h('div', { class: 'stat' }, h('b', {}, songs.length), h('span', {}, `entries (${lead.length} as lead)`)),
          h('div', { class: 'stat' }, h('b', {}, top10), h('span', {}, 'top 10s')),
          h('div', { class: 'stat' }, h('b', {}, no1), h('span', {}, 'No. 1s')))),
      act.tags.length ? h('div', { class: 'tag-list', style: { marginBottom: '12px' } }, act.tags.map((t) => h('span', { class: 'tag' }, t))) : null,
      h('div', { class: 'traj-wrap' },
        h('div', { class: 'mosaic-cap' }, h('span', { class: 'label-sm' }, 'Every chart run, week by week'), h('span', { class: 'note' }, 'Higher is better; the scale stretches the top 10. Colour is each song’s genre.')),
        h('div', { class: 'traj' }, svg)),
      h('div', { class: 'scroll-x' }, h('table', { class: 'song-table' },
        h('thead', {}, h('tr', {}, th('date', 'Debut'), h('th', {}, 'Song'), th('peak', 'Peak', 'n'), h('th', { class: 'n' }, 'Weeks'), th('pts', 'Chart points', 'n'))),
        h('tbody', {}, rows.map((so) => h('tr', { class: 'row', onclick: () => HA.openSong(so.i), style: { opacity: HA.lit(so.fam) ? 1 : 0.35 } },
          h('td', { class: 'num', style: { color: 'var(--muted)', whiteSpace: 'nowrap' } }, HA.fmtMonth(so.first)),
          h('td', {}, h('i', { class: 'sw' + (so.fam < 0 ? ' unknown' : ''), style: { '--c': HA.famVar(so.fam), marginRight: '8px' } }), so.title, so.acts.indexOf(a) >= so.nLead ? h('span', { class: 'feat-tag' }, ` (feat. on ${so.credit.split(/ featuring | feat\. /i)[0]})`) : ''),
          h('td', { class: 'n' }, so.peak === 1 ? `#1 ×${so.wk1}` : '#' + so.peak),
          h('td', { class: 'n' }, so.weeksOn),
          h('td', { class: 'n' }, Math.round(so.pts).toLocaleString())))))));
  }

  function render() {
    if (!HA.m) return;
    body.replaceChildren(HA.state.artist != null ? trajectory(HA.state.artist) : lanes());
  }

  HA.views.artists = { mount, render };
  HA.on('artist', () => { if (root && !root.hidden) { render(); scrollTo({ top: 0 }); } });
  HA.on('spot', () => { if (root && !root.hidden) render(); });
  HA.on('theme', () => { if (root && !root.hidden) render(); });
})();
