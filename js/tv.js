// TV domain: Nielsen's top prime-time series of every season since 1950–51.
// Shows recur across seasons, so unlike songs an item sits in many period
// columns, and a show's season-by-season rank is its chart run. Shows are
// both the items and the entities (the lanes are shows).
(function () {
  const HA = globalThis.HA, h = HA.h, s = HA.s;
  const pts = (rank) => 100 / Math.sqrt(rank);
  const label = (p) => `${p}–${String(p + 1).slice(-2)}`;
  const UNIT = { rating: ['rating', (v) => v.toFixed(1)], viewers_m: ['million viewers', (v) => v.toFixed(1) + 'M'], demo_rating: ['18–49 rating', (v) => v.toFixed(1)] };
  const fmtValue = (season, v) => (v == null ? '' : (UNIT[season.unit] || UNIT.rating)[1](v));

  function build(raw) {
    const fams = raw.fams.map((f, i) => Object.assign({ i }, f, { slot: i < 8 ? i + 1 : 0 }));
    const seasons = raw.seasons;
    const byPeriod = new Map(seasons.map((se) => [se.y, []]));
    const shows = raw.shows.map(([title, nets, fam, src, slots, premiered, ended, imdb], i) => {
      // slots: every ranked appearance, two in a season for a show on two nights;
      // runs: the show's best slot per season, which is what its stats count.
      const all = slots.map(([si, rank, value, net, night]) => ({ p: seasons[si].y, si, rank, value, net, night }));
      const bySeason = new Map();
      for (const r of all) if (!bySeason.has(r.p) || r.rank < bySeason.get(r.p).rank) bySeason.set(r.p, r);
      const runs = [...bySeason.values()].sort((a, b) => a.p - b.p);
      let best = runs[0];
      for (const r of runs) if (r.rank < best.rank) best = r;
      const x = {
        i, title, name: title, sub: nets, fam, src, runs, slots: all, premiered, ended, imdb,
        home: { p: best.p, rank: best.rank },
        first: runs[0].p, last: runs[runs.length - 1].p,
        // The lane spans the show's whole time on air when TVmaze knows it.
        t0: premiered ? HA.yearFrac(premiered) : runs[0].p + 0.7,
        t1: ended ? HA.yearFrac(ended) : runs[runs.length - 1].p + 1.4,
        weight: runs.reduce((t, r) => t + pts(r.rank), 0),
        no1: runs.filter((r) => r.rank === 1).length,
        top10: runs.filter((r) => r.rank <= 10).length,
      };
      for (const r of all) byPeriod.get(r.p).push({ it: x, rank: r.rank, value: r.value, season: seasons[r.si], title: r.night ? `${title} (${r.night})` : null });
      return x;
    });
    for (const list of byPeriod.values()) list.sort((a, b) => a.rank - b.rank || (b.value ?? 0) - (a.value ?? 0));
    const emmys = new Map();
    for (const [i, y, kind] of raw.awards?.emmy || []) {
      const k = `${i}|${kind}`;
      emmys.set(k, [...(emmys.get(k) || []), y]);
    }
    for (const [k, ys] of emmys) {
      const [i, kind] = k.split('|'), x = shows[+i];
      const line = `Emmy for Outstanding ${kind === 'drama' ? 'Drama' : 'Comedy'} Series (${ys.join(', ')})`;
      x.award = x.award ? `${x.award}; ${line}` : line;
      x.emmys = [...(x.emmys || []), ...ys.map((y) => [y, kind])];
    }
    // Fame, for choosing quiz questions: quiz-archive mentions (tools/fetch-clues.mjs)
    // plus how high and how long the show ranked.
    const clues = raw.clues || { shows: {} };
    for (const x of shows) x.fame = (clues.shows[x.i] || 0) + (x.no1 ? 3 : x.top10 ? 1.4 : 0.4) + 0.25 * x.runs.length;
    const periods = seasons.map((se) => se.y);
    const first = periods[0], last = periods[periods.length - 1];

    const D = {
      id: 'tv', label: 'TV',
      noun: 'show', nouns: 'Shows', entityNoun: 'show', entityNouns: 'Shows',
      searchHint: 'Find a TV show',
      awardNote: 'won the Emmy for best drama or comedy series',
      subtitle: `Nielsen season rankings · ${label(first)} – ${label(last)}`,
      tabs: [['wall', 'Wall'], ['genres', 'Genres'], ['lanes', 'Shows']],
      fams, hasUnknown: shows.some((x) => x.fam < 0),
      srcLabels: ['No genre data', 'Genre classified by Claude', 'Genre classified by Claude; TVmaze agrees'],
      items: shows, entities: shows, entitiesAreItems: true,
      periods, byPeriod, periodLabel: label, periodNoun: 'season',
      decadeLabel: (d) => (d === 2000 ? '2000s' : `’${String(d).slice(2)}s`),
      tip: (x, e) => {
        const at = e ? `${e.title ? HA.esc(e.title) + ': ' : ''}#${e.rank} in ${label(e.season ? e.season.y : x.home.p)}${e.value != null && e.season ? ` (${fmtValue(e.season, e.value)} ${(UNIT[e.season.unit] || UNIT.rating)[0]})` : ''} · ` : '';
        return `<b>${HA.esc(x.title)}</b><div>${HA.esc(x.sub)}</div><div class="t-sub">${at}best #${x.home.rank} · ${HA.plural(x.runs.length, 'season')} in the top 30</div>${HA.awardTip(x)}`;
      },
      searchSub: (x) => `${x.sub} · ${label(x.first)}${x.last > x.first ? '–' + String(x.last + 1).slice(-2) : ''} · best #${x.home.rank}`,
      open: openShow,

      wall: {
        title: 'The Wall', rows: 30, topNs: [10, 20, 30], defaultN: 20,
        blurb: 'Every TV season’s top-rated prime-time series, by Nielsen ratings. Each column is one season, September to May; colour is genre. Long-running hits show up as the same title across many columns.',
        caption: `Top 30 of every season, ${label(first)} – ${label(last)}`,
        partial: (p) => (seasons.find((se) => se.y === p)?.complete === false ? 'partial' : ''),
        crown: (e) => e.rank === 1,
        value: (e) => (e.value != null && e.season ? fmtValue(e.season, e.value) : null),
        extra: (decade, topN) => streamingPanel(raw.streaming || [], shows, fams, decade, topN),
      },

      river: {
        title: 'Genre river',
        blurb: 'Each band is a genre’s share of the season’s top-rated series, weighted by rank (#1 counts about five times #30). Variety rules the early 1950s, Westerns peak at the end of that decade, sitcoms hold the middle of the chart from the 1960s to the 1990s, reality surges in the 2000s, and crime procedurals and football end up on top.',
        rows: periods.map((p) => {
          const v = new Array(fams.length + 1).fill(0);
          for (const e of byPeriod.get(p)) v[e.it.fam < 0 ? fams.length : e.it.fam] += pts(e.rank);
          const t = v.reduce((a, b) => a + b, 0) || 1;
          return { p, label: label(p), start: true, v: v.map((x) => x / t) };
        }),
        defaultPeriod: 1959,
        panelNote: (p) => `The ${label(p)} season, September to May. Shares are of the season’s ranked series, weighted by rank.`,
      },

      lanes: {
        title: 'Show lanes',
        blurb: 'The ten biggest series of each decade, ordered by their first top-30 season. Each dot is a season in the top 30: big dots are top 10, ringed dots finished #1. Tap a name for its season-by-season run.',
        ids: () => {
          const ids = new Set();
          for (let d = Math.floor(first / 10) * 10; d <= last; d += 10) {
            const tally = shows.map((x) => [x.i, x.runs.filter((r) => r.p >= d && r.p < d + 10).reduce((t, r) => t + pts(r.rank), 0)]);
            tally.sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([i, w]) => w > 0 && ids.add(i));
          }
          return [...ids].sort((a, b) => shows[a].first - shows[b].first || shows[a].home.rank - shows[b].home.rank);
        },
        marks: (i) => shows[i].runs.map((r) => ({ t: r.p + 0.7, rank: r.rank, it: shows[i], entry: byPeriod.get(r.p).find((e) => e.it === shows[i]) })),
        extent: [first, last + 1.5],
      },
      entityPage: showPage,

      links: (x) => showLinks(x),
      about: () => about(D, seasons, shows, raw.built),
    };
    return D;
  }

  // Nielsen's year-end streaming top 10s sit under the broadcast seasons of the
  // same decade: the broadcast lists stopped seeing what people watch.
  function streamingPanel(years, shows, fams, decade, topN) {
    const ys = years.filter((y) => Math.floor(y.year / 10) * 10 === decade);
    if (!ys.length) return null;
    const famOf = (row) => (row[4] >= 0 ? shows[row[4]].fam : row[5]);
    const openRow = (row, y) => {
      if (row[4] >= 0) return openShow(shows[row[4]]);
      const f = famOf(row);
      HA.openDrawer(
        h('div', { class: 'd-fam' }, HA.swatch(f), f >= 0 ? fams[f].label : 'Genre unknown'),
        h('div', { class: 'd-src' }, 'Netflix US Top 10 · genre classified by Claude'),
        h('div', { class: 'd-title' }, row[1]),
        h('div', { class: 'd-credit' }, row[2]),
        h('div', { class: 'd-stats' }, HA.stat('#' + row[0], `on Netflix in ${y.year}`), row[3] != null && HA.stat(row[3], row[3] === 1 ? 'week in the top 10' : 'weeks in the top 10')),
        h('div', { class: 'd-section' }, h('div', { class: 'label-sm' }, 'Look it up'), HA.searchLinks(`${row[1]} TV series`, ['Wikipedia', 'IMDb', 'JustWatch'])));
    };
    return h('div', { style: { marginTop: '28px' } },
      h('div', { class: 'view-head' }, h('div', {},
        h('h2', { class: 'section-h' }, 'Netflix’s biggest series'),
        h('p', {}, 'The broadcast rankings above no longer see streaming. These are each year’s top series on Netflix’s own weekly US Top 10, weighted by rank the same way as the music charts. Netflix only, and from July 2021; licensed reruns (Suits) compete with originals.'))),
      h('div', { class: 'scroll-x' }, h('div', { class: 'decade-grid' }, ys.map((y) => h('div', { class: 'year-col' },
        h('h3', {}, String(y.year), h('small', {}, y.complete ? 'Netflix' : 'Netflix, to date')),
        h('div', { class: 'tiles' }, y.rows.slice(0, topN).map((row) => {
          const f = famOf(row);
          return h('button', { class: 'tile' + (f < 0 ? ' unknown' : '') + (HA.lit(f) ? '' : ' dim'), style: { '--c': HA.famVar(f) }, onclick: () => openRow(row, y) },
            h('span', { class: 'rk' }, row[0]), h('span', { class: 'tt' }, row[1]), h('span', { class: 'ar' }, `${HA.plural(row[3], 'week')} in the top 10`));
        })))))));
  }

  function showLinks(x) {
    const q = encodeURIComponent(`${x.title} TV series`);
    return h('div', { class: 'listen' },
      h('a', { href: x.imdb ? `https://www.imdb.com/title/${x.imdb}/` : `https://www.imdb.com/find/?q=${q}`, target: '_blank', rel: 'noopener' }, 'IMDb ↗'),
      h('a', { href: `https://en.wikipedia.org/w/index.php?search=${q}`, target: '_blank', rel: 'noopener' }, 'Wikipedia ↗'),
      h('a', { href: `https://www.youtube.com/results?search_query=${encodeURIComponent(x.title + ' opening theme')}`, target: '_blank', rel: 'noopener' }, 'Theme ↗'),
      h('a', { href: `https://www.justwatch.com/us/search?q=${encodeURIComponent(x.title)}`, target: '_blank', rel: 'noopener' }, 'JustWatch ↗'));
  }

  function runChart(x, width, height, big) {
    const seasons = x.runs;
    const pad = { l: 28, r: 18, t: big ? 26 : 8, b: 20 };
    const p0 = Math.min(x.first - 1, x.last - 6), p1 = Math.max(x.last + 1, x.first + 6);
    const X = (p) => pad.l + ((p - p0) / (p1 - p0)) * (width - pad.l - pad.r);
    const Y = (r) => pad.t + ((Math.sqrt(r) - 1) / (Math.sqrt(30) - 1)) * (height - pad.t - pad.b);
    const svg = s('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': `Season ranks of ${x.title}` });
    const grid = s('g', { class: 'grid axis' });
    for (const r of [1, 5, 10, 20, 30]) grid.append(s('line', { x1: pad.l, x2: width - pad.r, y1: Y(r), y2: Y(r) }), s('text', { x: pad.l - 5, y: Y(r) + 4, 'text-anchor': 'end' }, '#' + r));
    const step = p1 - p0 > 30 ? 10 : p1 - p0 > 12 ? 5 : 2;
    for (let p = Math.ceil(p0 / step) * step; p <= p1; p += step) grid.append(s('text', { x: X(p), y: height - 4, 'text-anchor': 'middle' }, String(p)));
    svg.append(grid);
    const col = HA.famVar(x.fam);
    // Consecutive seasons join into a line; a gap means the show fell out of the top 30.
    let run = [];
    const flush = () => { if (run.length > 1) svg.append(s('polyline', { points: run.map((r) => `${X(r.p).toFixed(1)},${Y(r.rank).toFixed(1)}`).join(' '), fill: 'none', stroke: col, 'stroke-width': 2.5, 'stroke-linejoin': 'round' })); run = []; };
    seasons.forEach((r, k) => { if (k && r.p !== seasons[k - 1].p + 1) flush(); run.push(r); });
    flush();
    for (const r of seasons) {
      const c = s('circle', { cx: X(r.p), cy: Y(r.rank), r: r.rank === 1 ? 5.5 : 4, fill: col, stroke: r.rank === 1 ? 'var(--ink)' : 'var(--surface)', 'stroke-width': 1.5 });
      if (big) HA.bindTip(c, () => `<b>${label(r.p)}: #${r.rank}</b><div class="t-sub">${r.net}${r.value != null ? ' · ' + r.value : ''}</div>`);
      svg.append(c);
    }
    return svg;
  }

  function openShow(x) {
    const D = HA.D;
    HA.openDrawer(
      ...HA.drawerHead(x, x.title, x.sub),
      h('div', { class: 'd-acts' }, h('button', { onclick: () => HA.showEntity(x.i) }, 'Season-by-season page →')),
      h('div', { class: 'd-stats' },
        HA.stat('#' + x.home.rank, `best, in ${label(x.home.p)}`),
        HA.stat(x.runs.length, 'seasons in the top 30'),
        HA.stat(x.top10, 'seasons in the top 10'),
        x.premiered ? HA.stat(`${x.premiered.slice(0, 4)}–${x.ended ? x.ended.slice(2, 4) : 'now'}`, 'on the air') : HA.stat(`${x.first}–${String(x.last + 1).slice(-2)}`, 'first to last ranked')),
      h('div', { class: 'label-sm' }, 'Rank by season'),
      h('div', { class: 'd-run' }, runChart(x, 360, 140, false)),
      h('div', { class: 'd-section' }, h('div', { class: 'label-sm' }, 'Look it up'), D.links(x)));
  }

  function showPage(i, rerender, width) {
    const D = HA.D, x = D.items[i];
    const W = Math.max(320, width);
    return h('div', {},
      h('div', { class: 'artist-head' },
        h('div', {}, h('div', { class: 'd-fam' }, HA.swatch(x.fam), x.fam >= 0 ? D.fams[x.fam].label : 'Genre unknown', h('span', { class: 'note' }, ' · ' + D.srcLabels[x.src])), h('h1', {}, x.title)),
        h('div', { class: 'stats' },
          HA.stat(x.sub, x.premiered ? `on air ${x.premiered.slice(0, 4)}–${x.ended ? x.ended.slice(0, 4) : 'now'}` : 'network'),
          HA.stat(x.runs.length, 'seasons in the top 30'),
          HA.stat(x.top10, 'top-10 seasons'),
          HA.stat(x.no1, 'seasons at #1'))),
      h('div', { class: 'traj-wrap' },
        h('div', { class: 'mosaic-cap' }, h('span', { class: 'label-sm' }, 'Nielsen rank, season by season'), h('span', { class: 'note' }, 'Gaps are seasons outside the top 30, or off the air.')),
        h('div', { class: 'traj' }, runChart(x, W, W < 600 ? 240 : 300, true))),
      h('div', { class: 'scroll-x' }, h('table', { class: 'song-table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Season'), h('th', { class: 'n' }, 'Rank'), h('th', {}, 'Network'), h('th', { class: 'n' }, 'Rating / viewers'))),
        h('tbody', {}, x.slots.map((r) => h('tr', {},
          h('td', { class: 'num' }, label(r.p) + (r.night ? ` (${r.night})` : '')),
          h('td', { class: 'n' }, '#' + r.rank),
          h('td', {}, r.net || x.sub),
          h('td', { class: 'n' }, r.value != null ? fmtValue(D.byPeriod.get(r.p)[0].season, r.value) : '')))))),
      h('div', { style: { marginTop: '12px' } }, D.links(x)));
  }

  function about(D, seasons, shows, built) {
    const units = [...new Set(seasons.map((se) => se.unit))];
    const incomplete = seasons.filter((se) => !se.complete).map((se) => label(se.y));
    return [
      h('p', {}, `The TV side holds Nielsen’s top-rated prime-time series for ${seasons.length} seasons, ${label(seasons[0].y)} to ${label(seasons[seasons.length - 1].y)}: ${shows.length.toLocaleString()} different shows.`),
      h('h2', {}, 'What counts as a hit'),
      h('p', {}, 'A season’s ranking is the Nielsen season-average for regularly scheduled prime-time series on the broadcast networks, the lists Wikipedia keeps for every season. Specials (the Super Bowl, the Oscars) are excluded, as on those lists. Values are household ratings (the share of TV homes watching) in most seasons' + (units.includes('viewers_m') ? ' and average viewers in millions in some recent ones' : '') + '; ranks are comparable across seasons, values less so.'),
      h('p', {}, 'Broadcast rankings increasingly miss what people watch: cable hits never appear, and from about 2015 streaming series are invisible to these lists. The recent columns show what broadcast audiences watched, which leans toward football, procedurals and reality.'),
      h('h2', {}, 'Genres'),
      HA.famTable(D),
      h('p', {}, 'Each show’s genre was classified by Claude from general knowledge of the show, then checked against TVmaze’s genre tags, which agree on about 90% of shows; each show’s panel says whether they agree. They are broad calls about the show’s main identity: a cop show with comedy is Crime & Legal, a sketch-comedy hour is Variety. Where TVmaze differs the call stands, since it files spy shows under Drama and 1950s anthologies under Comedy.'),
      HA.sourceTable(D),
      h('h2', {}, 'How the data was gathered'),
      h('p', {}, 'Each season’s table is parsed straight from Wikipedia’s season pages. An earlier hand transcription agreed with the parse on all but 2 of 2,169 rows.' + (incomplete.length ? ` Seasons with missing rows: ${incomplete.join(', ')}.` : '') + ' A ★ marks shows that won the Emmy for best drama or comedy series; the years are ceremony years.'),
      h('h2', {}, 'Sources'),
      h('ul', {},
        h('li', {}, 'Season rankings: ', HA.extLink('https://en.wikipedia.org/wiki/Top-rated_United_States_television_programs_by_season', 'Wikipedia, Top-rated United States television programs by season'), ' (Nielsen Media Research).'),
        h('li', {}, 'Premiere and end dates, IMDb ids, genre check: ', HA.extLink('https://www.tvmaze.com/api', 'TVmaze'), '.'),
        h('li', {}, 'Streaming: ', HA.extLink('https://www.netflix.com/tudum/top10', 'Netflix Top 10'), ', weekly US lists since mid-2021.'),
        h('li', {}, 'Emmy winners: Wikipedia’s pages for ', HA.extLink('https://en.wikipedia.org/wiki/Primetime_Emmy_Award_for_Outstanding_Drama_Series', 'Outstanding Drama Series'), ' and ', HA.extLink('https://en.wikipedia.org/wiki/Primetime_Emmy_Award_for_Outstanding_Comedy_Series', 'Outstanding Comedy Series'), '.')),
      h('p', { class: 'note' }, `Data built ${built}.`),
    ];
  }

  HA.domains.tv = { id: 'tv', label: 'TV', dataId: 'tv-data', dataUrl: 'data/tv.json', build };
})();
