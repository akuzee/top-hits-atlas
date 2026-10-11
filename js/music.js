// Music domain: the Billboard Hot 100. Adapts js/model.js to the domain
// contract the views read (see core.js). This file is also the reference for
// that contract; movies.js and tv.js fill in the same fields.
(function () {
  const HA = globalThis.HA, h = HA.h, s = HA.s;

  function build(raw) {
    const m = HA.buildModel(raw);
    const wk = (w) => m.weeks[w];
    const fams = m.fams.map((f, i) => Object.assign({}, f, { slot: i < 8 ? i + 1 : 0 }));

    for (const x of m.songs) {
      x.sub = x.credit;
      x.home = { p: x.year, rank: x.yearRank };
      x.t0 = HA.yearFrac(wk(x.first));
      x.weight = x.pts;
    }
    for (const a of m.acts) {
      a.weight = a.pts;
      a.t0 = HA.yearFrac(wk(a.first));
      a.t1 = HA.yearFrac(wk(a.last));
      a.sub = `${HA.plural(a.songs.length, 'chart entry', 'chart entries')} · ${m.weekYear[a.first]}–${m.weekYear[a.last]}`;
    }
    const byPeriod = new Map([...m.byYear].map(([y, list]) => [y, list.map((x) => ({ it: x, rank: x.yearRank, value: x.yearPts }))]));
    // Billboard's official year-end Hot 100 (from Wikipedia), where matched to a song.
    const yearEnd = new Map(Object.entries(raw.yearEnd || {}).map(([y, rows]) => [+y, rows.map(([rank, i]) => ({ it: m.songs[i], rank, value: 101 - rank }))]));
    for (const [y, rows] of yearEnd) for (const e of rows) if (!e.it.ye || e.rank < e.it.ye.rank) e.it.ye = { y, rank: e.rank };
    for (const [i, y] of raw.awards?.grammy || []) m.songs[i].award = `Grammy Record of the Year (${y})`;
    const peakText = (x) => (x.peak === 1 ? `#1 for ${HA.plural(x.wk1, 'week')}` : `peaked #${x.peak}`);

    const D = {
      id: 'music', label: 'Music', m,
      noun: 'song', nouns: 'Songs', entityNoun: 'artist', entityNouns: 'Artists',
      searchHint: 'Find a song or artist',
      awardNote: 'won the Grammy for Record of the Year',
      subtitle: `Billboard Hot 100 · Aug 1958 – ${HA.fmtMonthOf(wk(m.weeks.length - 1))}`,
      tabs: [['wall', 'Wall'], ['no1s', 'No. 1s'], ['genres', 'Genres'], ['lanes', 'Artists'], ['quiz', 'Quiz']],
      fams, hasUnknown: true, srcLabels: HA.SRC_LABEL,
      items: m.songs, entities: m.acts,
      periods: m.years, byPeriod, periodLabel: String, periodNoun: 'chart year',
      peakText,
      tip: (x) => `<b>${HA.esc(x.title)}</b><div>${HA.esc(x.credit)}</div><div class="t-sub">${peakText(x)} · #${x.yearRank} of ${x.year}</div>${HA.awardTip(x)}`,
      searchSub: (x) => `${x.credit} · ${x.year} · ${peakText(x)}`,
      open: openSong,

      wall: {
        title: 'The Wall', rows: 40, topNs: [10, 20, 40], defaultN: 20,
        blurb: 'Every chart year’s biggest hits, ranked by chart points. Each column is one year; colour is genre. Read the overview for eras, tap any cell for its song, then read a decade below.',
        caption: `Top 40 of every chart year, ${m.firstYear}–${m.lastYear}`,
        partial: (y) => (y === m.firstYear ? 'from Aug' : y === m.lastYear ? `to ${HA.fmtMonthOf(wk(m.weeks.length - 1)).slice(0, 3)}` : ''),
        crown: (e) => e.it.peak === 1,
        value: () => null,
        mainLabel: 'Chart points',
        alt: yearEnd.size ? { label: 'Billboard year-end', byPeriod: yearEnd, note: 'Billboard’s official year-end Hot 100, which also weighs sales and airplay' } : null,
      },

      river: {
        title: 'Genre river',
        blurb: 'Each band is a genre’s share of the Hot 100’s chart points in that quarter: a week at #1 counts ten times a week at #100. Hover to read a moment; tap to list that year’s biggest hits by genre.',
        rows: riverRows(m), defaultPeriod: 1979,
        panelNote: (y) => `Chart year ${y} (December to November). Shares are of chart points earned that year.`,
      },

      calendar: {
        title: 'Every No. 1', unit: 'week',
        runs: m.no1Runs.map((r) => ({ it: m.songs[r.song], start: wk(r.start), end: HA.addDays(wk(r.end), 7), n: r.end - r.start + 1, total: m.songs[r.song].wk1 })),
        facts: () => {
          const no1 = m.songs.filter((x) => x.wk1 > 0);
          const most = no1.reduce((a, b) => (b.wk1 > a.wk1 ? b : a));
          const byAct = new Map();
          for (const x of no1) byAct.set(x.acts[0], (byAct.get(x.acts[0]) || 0) + 1);
          const [topAct, topN] = [...byAct].sort((a, b) => b[1] - a[1])[0];
          return `${no1.length.toLocaleString()} songs have reached #1 since August 1958. The most weeks at #1 is ${most.wk1} (“${most.title}”, ${most.credit}); the act with the most #1s as lead is ${m.acts[topAct].name} with ${topN}.`;
        },
      },

      lanes: {
        title: 'Career lanes',
        blurb: 'The seven biggest acts of each decade, ordered by their first hit. Each dot is a top-40 hit at the week it peaked: big dots are top 10, ringed dots reached #1. Tap a name for the full trajectory, or search any artist.',
        ids: () => [...new Set(HA.decadeLeaders(m, 7).flatMap((d) => d.acts))].sort((a, b) => m.acts[a].first - m.acts[b].first),
        marks: (a) => m.acts[a].songs.map((i) => m.songs[i]).filter((x) => x.peak <= 40).map((x) => ({ t: HA.yearFrac(wk(x.peakWeek)), rank: x.peak, it: x })),
        extent: [HA.yearFrac(wk(0)), HA.yearFrac(wk(m.weeks.length - 1))],
      },
      entityPage: trajectory,
      about: () => about(m),

      quiz: {
        yearOf: (x) => x.year,
        // December hits count for either year: the chart year or the calendar year.
        yearsOk: (x) => [x.year, m.weekYear[x.peakWeek]],
        firstOf: (x) => x.first,
        firstText: (x) => `debuted ${HA.fmtMonthOf(wk(x.first))}`,
        firstPrompt: 'Which was a hit first?',
        facts: (x) => `${peakText(x)} · #${x.yearRank} of ${x.year} · debuted ${HA.fmtMonthOf(wk(x.first))}`,
        levels: { smash: ['Smashes', 10], hits: ['Top 40', 40], deep: ['Deep cuts', 100] },
        topPrompt: 'Which was the biggest hit of the chart year?',
        links: (x) => HA.searchLinks(`${x.title} ${x.credit}`, ['YouTube', 'Spotify', 'Apple Music']),
      },
    };
    return D;
  }

  // Quarter shares, lightly smoothed over neighbouring quarters so one odd
  // quarter doesn't spike the river.
  function riverRows(m) {
    const F = m.UNKNOWN + 1;
    const raw = m.river.map((row) => { const t = row.reduce((a, b) => a + b, 0) || 1; return Array.from(row, (v) => v / t); });
    const first = m.quarterOf[0], last = m.quarterOf[m.weeks.length - 1];
    const out = [];
    for (let q = first; q <= last; q++) {
      const acc = new Array(F).fill(0);
      let n = 0;
      for (let k = Math.max(first, q - 1); k <= Math.min(last, q + 1); k++) { const w = k === q ? 2 : 1; raw[k].forEach((v, f) => { acc[f] += v * w; }); n += w; }
      const year = m.weekYear[0] + Math.floor(q / 4);
      out.push({ p: year, label: `Q${(q % 4) + 1} ${year}`, start: q % 4 === 0, v: acc.map((v) => v / n) });
    }
    return out;
  }

  // ── drawer ─────────────────────────────────────────────────────────────────
  function runChart(x, width, height) {
    // y on a square-root scale, so the top 10 gets room and #100 still fits.
    const weeks = HA.songWeeks(x);
    const pad = { l: 26, r: 6, t: 8, b: 18 };
    const w0 = weeks[0][0], w1 = weeks[weeks.length - 1][0];
    const span = Math.max(w1 - w0, 8);
    const X = (w) => pad.l + ((w - w0) / span) * (width - pad.l - pad.r);
    const Y = (r) => pad.t + ((Math.sqrt(r) - 1) / 9) * (height - pad.t - pad.b);
    const svg = s('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': `Chart run of ${x.title}` });
    const grid = s('g', { class: 'grid axis' });
    for (const r of [1, 10, 40, 100]) grid.append(s('line', { x1: pad.l, x2: width - pad.r, y1: Y(r), y2: Y(r) }), s('text', { x: pad.l - 5, y: Y(r) + 4, 'text-anchor': 'end' }, '#' + r));
    svg.append(grid);
    const col = HA.famVar(x.fam);
    for (const seg of x.segs) {
      if (seg.length > 2) svg.append(s('polyline', { points: seg.slice(1).map((r, j) => `${X(seg[0] + j).toFixed(1)},${Y(r).toFixed(1)}`).join(' '), fill: 'none', stroke: col, 'stroke-width': 2, 'stroke-linejoin': 'round' }));
      else svg.append(s('circle', { cx: X(seg[0]), cy: Y(seg[1]), r: 2.5, fill: col }));
    }
    svg.append(s('circle', { cx: X(x.peakWeek), cy: Y(x.peak), r: 4.5, fill: col, stroke: 'var(--surface)', 'stroke-width': 2 }));
    const m = HA.D.m;
    const ax = s('g', { class: 'axis' });
    ax.append(s('text', { x: pad.l, y: height - 3 }, HA.fmtMonthOf(m.weeks[w0])));
    if (w1 - w0 > 20) ax.append(s('text', { x: width - pad.r, y: height - 3, 'text-anchor': 'end' }, HA.fmtMonthOf(m.weeks[w1])));
    svg.append(ax);
    return svg;
  }

  function openSong(x) {
    const D = HA.D, m = D.m;
    const nodes = [
      ...HA.drawerHead(x, x.title, x.credit),
      h('div', { class: 'd-acts' }, x.acts.map((a, k) => h('button', { onclick: () => HA.showEntity(a) }, m.acts[a].name + (k >= x.nLead ? ' (feat.)' : '') + ' →'))),
      h('div', { class: 'd-stats' },
        HA.stat('#' + x.peak, x.peak === 1 ? `peak · ${HA.plural(x.wk1, 'week')} at #1` : `peak · ${HA.plural(x.atPeak, 'week')} there`),
        HA.stat(x.weeksOn, 'weeks on chart'),
        x.ye ? HA.stat('#' + x.ye.rank, `Billboard year-end ${x.ye.y} (here #${x.yearRank} of ${x.year})`) : HA.stat('#' + x.yearRank, `of chart year ${x.year}`),
        HA.stat(HA.fmtDate(m.weeks[x.first]).replace(/, \d{4}$/, ''), 'debut, ' + m.weeks[x.first].slice(0, 4))),
      h('div', { class: 'label-sm' }, 'Chart run'),
      h('div', { class: 'd-run' }, runChart(x, 360, 130)),
    ];
    const info = m.no1Info[x.i];
    if (info) {
      const [style, writers, producers, label] = info;
      const dl = h('dl', { class: 'd-meta' });
      const row = (k, v) => v && dl.append(h('dt', {}, k), h('dd', {}, v.replace(/;/g, ', ')));
      row('Style', style); row('Written by', writers); row('Produced by', producers); row('Label', label);
      nodes.push(h('div', { class: 'label-sm' }, 'About this #1'), dl);
    }
    const lead = m.acts[x.acts[0]];
    if (lead && lead.tags.length) nodes.push(h('div', { class: 'd-section' }, h('div', { class: 'label-sm' }, `Spotify genres for ${lead.name}`), h('div', { class: 'tag-list' }, lead.tags.map((t) => h('span', { class: 'tag' }, t)))));
    nodes.push(h('div', { class: 'd-section' }, h('div', { class: 'label-sm' }, 'Listen'), D.quiz.links(x)));
    HA.openDrawer(nodes);
  }

  // ── artist page ────────────────────────────────────────────────────────────
  let sortKey = 'date';
  function trajectory(a, rerender, width) {
    const D = HA.D, m = D.m, pal = HA.palette(), act = m.acts[a];
    const songs = act.songs.map((i) => m.songs[i]);
    const lead = songs.filter((x) => x.acts.indexOf(a) < x.nLead);
    const top10 = songs.filter((x) => x.peak <= 10).length, no1 = songs.filter((x) => x.peak === 1).length;
    const W = Math.max(320, width), H = W < 600 ? 280 : 360, pad = { l: 34, r: 12, t: 30, b: 24 };
    const span = act.last - act.first;
    const w0 = act.first - Math.max(4, span * 0.03), w1 = act.last + Math.max(4, span * 0.03);
    const X = (w) => pad.l + ((w - w0) / (w1 - w0)) * (W - pad.l - pad.r);
    const Y = (r) => pad.t + ((Math.sqrt(r) - 1) / 9) * (H - pad.t - pad.b);
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Chart runs of every ${act.name} song` });
    const ax = s('g', { class: 'axis grid' });
    for (const r of [1, 5, 10, 20, 40, 70, 100]) ax.append(s('line', { x1: pad.l, x2: W - pad.r, y1: Y(r), y2: Y(r) }), s('text', { x: pad.l - 6, y: Y(r) + 4, 'text-anchor': 'end' }, '#' + r));
    const y0 = m.weekYear[Math.max(0, Math.ceil(w0))], y1 = m.weekYear[Math.min(m.weeks.length - 1, Math.floor(w1))];
    const stepY = y1 - y0 > 40 ? 10 : y1 - y0 > 16 ? 5 : y1 - y0 > 6 ? 2 : 1;
    for (let yr = Math.ceil(y0 / stepY) * stepY; yr <= y1; yr += stepY) {
      const w = m.weeks.findIndex((d) => +d.slice(0, 4) === yr);
      if (w < 0 || w < w0 || w > w1) continue;
      ax.append(s('text', { x: X(w), y: H - 6, 'text-anchor': 'middle' }, String(yr)));
    }
    svg.append(ax);
    const lines = s('g', {});
    for (const so of [...songs].sort((p, q) => q.peak - p.peak)) {
      const col = HA.famColour(pal, so.fam);
      const g = s('g', { opacity: HA.lit(so.fam) ? 1 : 0.15, style: 'cursor:pointer' });
      for (const seg of so.segs) {
        const pts = seg.slice(1).map((r, j) => `${X(seg[0] + j).toFixed(1)},${Y(r).toFixed(1)}`).join(' ');
        if (seg.length > 2) g.append(s('polyline', { class: 'song-line', points: pts, stroke: col }), s('polyline', { points: pts, fill: 'none', stroke: 'transparent', 'stroke-width': 10 }));
        else g.append(s('circle', { cx: X(seg[0]), cy: Y(seg[1]), r: 2.5, fill: col }));
      }
      g.addEventListener('pointermove', (e) => { g.querySelectorAll('.song-line').forEach((l) => l.classList.add('hot')); HA.tip(D.tip(so), e.clientX, e.clientY); });
      g.addEventListener('pointerleave', () => { g.querySelectorAll('.song-line').forEach((l) => l.classList.remove('hot')); HA.untip(); });
      g.addEventListener('click', () => openSong(so));
      lines.append(g);
    }
    svg.append(lines);
    // Label the biggest peaks, skipping any that would collide with one already placed.
    const placed = [];
    for (const so of [...songs].sort((p, q) => p.peak - q.peak || q.pts - p.pts)) {
      if (so.peak > 20 || placed.length >= 14) break;
      const lx = X(so.peakWeek), ly = Y(so.peak) - 7;
      const wpx = Math.min(so.title.length, 26) * 6;
      const box = [lx - wpx / 2, ly - 11, lx + wpx / 2, ly + 2];
      if (box[0] < pad.l || box[2] > W - 2 || placed.some((b) => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) continue;
      placed.push(box);
      svg.append(s('text', { class: 'peak-label', x: lx, y: ly, 'text-anchor': 'middle', 'pointer-events': 'none', opacity: HA.lit(so.fam) ? 1 : 0.3 }, so.title.length > 26 ? so.title.slice(0, 25) + '…' : so.title));
    }

    const rows = [...songs].sort(sortKey === 'peak' ? (p, q) => p.peak - q.peak || q.pts - p.pts : sortKey === 'pts' ? (p, q) => q.pts - p.pts : (p, q) => p.first - q.first);
    const th = (k, label, cls) => h('th', { class: cls, onclick: () => { sortKey = k; rerender(); } }, label + (sortKey === k ? ' ▾' : ''));
    return h('div', {},
      h('div', { class: 'artist-head' },
        h('div', {},
          h('div', { class: 'd-fam' }, HA.swatch(act.fam), act.fam >= 0 ? D.fams[act.fam].label : 'Genre unknown', h('span', { class: 'note' }, ' · ' + D.srcLabels[act.src])),
          h('h1', {}, act.name)),
        h('div', { class: 'stats' },
          HA.stat(`${m.weekYear[act.first]}–${String(m.weekYear[act.last]).slice(-2)}`, 'on the chart'),
          HA.stat(songs.length, `entries (${lead.length} as lead)`),
          HA.stat(top10, 'top 10s'),
          HA.stat(no1, 'No. 1s'))),
      act.tags.length ? h('div', { class: 'tag-list', style: { marginBottom: '12px' } }, act.tags.map((t) => h('span', { class: 'tag' }, t))) : null,
      h('div', { class: 'traj-wrap' },
        h('div', { class: 'mosaic-cap' }, h('span', { class: 'label-sm' }, 'Every chart run, week by week'), h('span', { class: 'note' }, 'Higher is better; the scale stretches the top 10. Colour is each song’s genre.')),
        h('div', { class: 'traj' }, svg)),
      h('div', { class: 'scroll-x' }, h('table', { class: 'song-table' },
        h('thead', {}, h('tr', {}, th('date', 'Debut'), h('th', {}, 'Song'), th('peak', 'Peak', 'n'), h('th', { class: 'n' }, 'Weeks'), th('pts', 'Chart points', 'n'))),
        h('tbody', {}, rows.map((so) => h('tr', { class: 'row', onclick: () => openSong(so), style: { opacity: HA.lit(so.fam) ? 1 : 0.35 } },
          h('td', { class: 'num', style: { color: 'var(--muted)', whiteSpace: 'nowrap' } }, HA.fmtMonthOf(m.weeks[so.first])),
          h('td', {}, HA.swatch(so.fam, { marginRight: '8px' }), so.title, so.acts.indexOf(a) >= so.nLead ? h('span', { class: 'feat-tag' }, ` (feat. on ${so.credit.split(/ featuring | feat\. /i)[0]})`) : ''),
          h('td', { class: 'n' }, so.peak === 1 ? `#1 ×${so.wk1}` : '#' + so.peak),
          h('td', { class: 'n' }, so.weeksOn),
          h('td', { class: 'n' }, Math.round(so.pts).toLocaleString())))))));
  }

  function about(m) {
    const D = HA.D, link = HA.extLink;
    return [
      h('p', {}, `The music side holds every song that has appeared on the Billboard Hot 100: ${m.songs.length.toLocaleString()} songs by ${m.acts.length.toLocaleString()} acts over ${m.weeks.length.toLocaleString()} weekly charts, from ${HA.fmtDate(m.weeks[0])} to ${HA.fmtDate(m.weeks[m.weeks.length - 1])}.`),
      h('h2', {}, 'Years and rankings'),
      h('p', {}, 'Each week on the chart earns a song points: 100 for #1, falling as 100 ÷ √rank (50 at #4, 20 at #25, 10 at #100). A song belongs to the chart year in which it earned the most, and songs are ranked within a year by those points. Chart years run December to November, like Billboard’s own year-end lists, so a song that tops the chart over Christmas counts toward the following year.'),
      h('p', {}, 'Billboard’s official year-end lists also weigh sales and airplay directly, so this ranking will not match them exactly. Checked against the official year-end #1 for 1959–2024, it picks the same song in 46 of 66 years and has it in its top five in 57. A plain sum of chart positions matches only 20, because it rewards slow-burning songs that sat at #30 for a year over chart-toppers.'),
      h('p', {}, 'The Wall’s “Billboard year-end” button swaps in the official lists themselves (1959 on). About 96% of their entries are matched to a song here; the rest are left out of that view. A ★ marks the songs that won the Grammy for Record of the Year.'),
      h('h2', {}, 'Genres'),
      h('p', {}, 'Colour shows one of eight genre families, plus Other. They are broad on purpose, so a decade reads at a glance; the finer Spotify genres appear on each song and artist.'),
      HA.famTable(D),
      h('p', {}, 'Genre usually belongs to the artist, not the song: it comes from the artist’s Spotify genres as of 2021. Two song-level sources refine that. Wikidata’s genre for the song chooses among the families the artist’s own tags support, so a crossover artist’s country and pop records can differ; it may not move a song to a family the artist has no tag for, because its labels are loose (“pop music” turns up on everything). And #1 hits use Chris Dalla Riva’s hand-coded genre when its style pins the sound down (Disco, Hip Hop, Soul).'),
      HA.sourceTable(D),
      h('p', {}, '“Edited” marks acts where Spotify’s match was clearly the wrong artist (it filed Prince under bachata), or where its tags pointed away from the act’s actual hits. “Inferred” marks acts with no source data, mostly artists who arrived after mid-2021 and one-hit acts of the early 1960s. Those were classified from general music knowledge and left blank when uncertain. Treat both as informed guesses.'),
      h('h2', {}, 'Artists'),
      h('p', {}, 'Credits are split into acts: “Rihanna Featuring Drake” counts for both, and duos split when both members had hits of their own (“Diana Ross & The Supremes” counts for Diana Ross and for The Supremes). Group names that include “&” stay whole (Earth, Wind & Fire). Featured appearances count half toward an act’s weight in the career lanes.'),
      h('h2', {}, 'Sources'),
      h('ul', {},
        h('li', {}, 'Weekly charts: ', link('https://github.com/mhollingshead/billboard-hot-100', 'mhollingshead/billboard-hot-100'), ', every Hot 100 since August 1958, refreshed weekly.'),
        h('li', {}, 'Artist genres: Spotify genre tags for Hot 100 songs through mid-2021, from ', link('https://github.com/rfordatascience/tidytuesday/tree/master/data/2021/2021-09-14', 'TidyTuesday 2021-09-14'), '.'),
        h('li', {}, 'Number ones: Chris Dalla Riva’s dataset of every #1 (genre, style, writers, producers, label) through January 2025, from ', link('https://github.com/rfordatascience/tidytuesday/tree/main/data/2025/2025-08-26', 'TidyTuesday 2025-08-26'), '.'),
        h('li', {}, 'Official year-end lists: Wikipedia’s ', link('https://en.wikipedia.org/wiki/Billboard_Year-End_Hot_100_singles_of_1984', '“Billboard Year-End Hot 100 singles of <year>”'), ' pages.'),
        h('li', {}, 'Song-level genres: ', link('https://www.wikidata.org/', 'Wikidata'), ', matched on title and performer.'),
        h('li', {}, 'Record of the Year: ', link('https://en.wikipedia.org/wiki/Grammy_Award_for_Record_of_the_Year', 'Wikipedia'), '.')),
      h('p', { class: 'note' }, `Data built ${m.built}.`),
    ];
  }

  HA.domains.music = { id: 'music', label: 'Music', dataId: 'music-data', dataUrl: 'data/music.json', build };
})();
