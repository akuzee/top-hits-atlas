// Movies domain: each year's biggest films at the US/Canada box office.
// Items are films (one home year each, like songs); entities are the people
// (directors and billed stars) whose careers the lanes follow. Films from 1982
// on also have a weekend chart run, which feeds the No. 1s calendar.
(function () {
  const HA = globalThis.HA, h = HA.h, s = HA.s;
  const pts = (rank) => 100 / Math.sqrt(rank);
  const MON = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  const money = (v) => (v == null ? '' : v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : v >= 1e7 ? `$${Math.round(v / 1e6)}M` : `$${(v / 1e6).toFixed(1)}M`);

  function build(raw) {
    const fams = raw.fams.map((f, i) => Object.assign({ i }, f, { slot: i < 8 ? i + 1 : 0 }));
    const W = raw.weekends;
    const people = raw.people.map((name, i) => ({ i, name, films: [], dir: 0, act: 0, weight: 0, fam: -1, src: 0 }));
    for (const i of raw.actresses || []) people[i].woman = true;
    const films = raw.films.map(([title, year, rank, value, dist, fam, src, imdb, rating, votes, runtime, dirs, rawCast, runs, opening, open, genres], i) => {
      // IMDb lists an actor twice when they play two parts (Nicole Kidman in Bewitched).
      const cast = [...new Set(rawCast)];
      const [mon, day] = (open || '').split(' ');
      const t0 = year + (MON[mon] != null ? (MON[mon] + (+day || 15) / 31) / 12 : 0.5);
      const x = {
        i, title, year, rank, value, dist, fam, src, imdb, rating, votes, runtime, dirs, cast, runs, opening, open, genres,
        unit: raw.units[year] || 'gross',
        home: { p: year, rank }, t0, weight: pts(rank),
        wk1: runs.filter((r) => r[1] === 1).length,
        sub: dirs.length ? dirs.map((d) => raw.people[d]).join(', ') : dist,
      };
      dirs.forEach((d) => { people[d].films.push(i); people[d].dir++; });
      cast.forEach((c) => { people[c].films.push(i); people[c].act++; });
      return x;
    });
    for (const i of raw.awards?.bestPicture || []) films[i].award = 'Oscar for Best Picture';
    // Fame, for choosing quiz questions: quiz-archive mentions (tools/fetch-clues.mjs),
    // box-office rank, and IMDb votes for lasting popularity.
    const clues = raw.clues || { films: {}, people: {} };
    for (const f of films) f.fame = (clues.films[f.i] || 0) + (f.rank === 1 ? 3 : f.rank <= 10 ? 1.4 : f.rank <= 25 ? 0.5 : 0.15) + Math.log10(1 + (f.votes || 0)) / 2;
    for (const p of people) {
      const fs = p.films.map((i) => films[i]);
      p.weight = fs.reduce((t, f) => t + pts(f.rank), 0);
      p.t0 = Math.min(...fs.map((f) => f.t0));
      p.t1 = Math.max(...fs.map((f) => f.t0));
      // A person's colour is the family of most of their hits.
      const tally = new Map();
      for (const f of fs) tally.set(f.fam, (tally.get(f.fam) || 0) + pts(f.rank));
      p.fam = [...tally].sort((a, b) => b[1] - a[1])[0]?.[0] ?? -1;
      p.role = p.dir >= p.act ? 'Director' : 'Actor';
      p.sub = `${p.role} · ${HA.plural(fs.length, 'film')} · ${Math.floor(Math.min(...fs.map((f) => f.year)))}–${Math.max(...fs.map((f) => f.year))}`;
      p.fame = (clues.people[p.i] || 0) + 0.25 * fs.reduce((t, f) => t + f.fame, 0);
    }
    const years = [...new Set(films.map((f) => f.year))].sort((a, b) => a - b);
    const byPeriod = new Map(years.map((y) => [y, []]));
    for (const f of films) byPeriod.get(f.year).push({ it: f, rank: f.rank, value: f.value });
    for (const list of byPeriod.values()) list.sort((a, b) => a.rank - b.rank);
    const first = years[0], last = years[years.length - 1];

    // Weekend #1 runs: consecutive weekends at the top by the same film.
    const top = new Map();
    for (const f of films) for (const [w, r] of f.runs) if (r === 1) top.set(w, f);
    const no1Runs = [];
    for (let w = 0; w < W.length; w++) {
      const f = top.get(w);
      if (!f) continue;
      const lastRun = no1Runs[no1Runs.length - 1];
      if (lastRun && lastRun.it === f && lastRun.w1 === w - 1) { lastRun.w1 = w; lastRun.n++; } else no1Runs.push({ it: f, w0: w, w1: w, n: 1 });
    }

    const peakText = (f) => `#${f.rank} of ${f.year}`;
    const D = {
      id: 'movies', label: 'Movies',
      noun: 'film', nouns: 'Films', entityNoun: 'person', entityNouns: 'People',
      searchHint: 'Find a film, director or star',
      awardNote: 'won the Oscar for Best Picture',
      subtitle: `US box office · ${first} – ${last}`,
      tabs: [['wall', 'Wall'], no1Runs.length && ['no1s', 'No. 1s'], ['genres', 'Genres'], ['lanes', 'People']].filter(Boolean),
      fams, hasUnknown: films.some((f) => f.fam < 0),
      srcLabels: ['No genre data', 'Genre from Wikidata', 'Genre from IMDb', 'Genre edited by hand'],
      items: films, entities: people,
      periods: years, byPeriod, periodLabel: String, periodNoun: 'year',
      tip: (f) => `<b>${HA.esc(f.title)}</b><div>${HA.esc(f.sub)}</div><div class="t-sub">${peakText(f)} · ${money(f.value)}${f.unit === 'rentals' ? ' rentals' : ''}${f.wk1 ? ` · ${HA.plural(f.wk1, 'weekend')} at #1` : ''}</div>${HA.awardTip(f)}`,
      searchSub: (f) => `${f.year} · ${f.sub} · ${peakText(f)}`,
      open: openFilm,

      wall: {
        title: 'The Wall', rows: 20, topNs: [10, 20, 40], defaultN: 20,
        blurb: 'Every year’s biggest films at the US and Canadian box office, by total gross for films released that year. Colour is genre. Before 1977 only each year’s top 10 is known, ranked by rentals.',
        caption: `Top 20 of every year, ${first}–${last}`,
        partial: (y) => (y === last ? 'to date' : y < 1977 ? 'top 10' : ''),
        crown: (e) => e.rank === 1,
        value: (e) => money(e.value),
      },

      river: {
        title: 'Genre river',
        blurb: 'Each band is a genre’s share of the box office earned by the year’s top 30 films (top 10 before 1977). Watch musicals and epics fade after the 1960s, sci-fi arrive with Star Wars, animation return in the 1990s and superheroes take over after 2008.',
        rows: years.map((y) => {
          const v = new Array(fams.length + 1).fill(0);
          for (const e of byPeriod.get(y).slice(0, 30)) v[e.it.fam < 0 ? fams.length : e.it.fam] += e.value || pts(e.rank);
          const t = v.reduce((a, b) => a + b, 0) || 1;
          return { p: y, label: String(y), start: true, v: v.map((x) => x / t) };
        }),
        defaultPeriod: 1977,
        panelNote: (y) => `Films released in ${y}. Shares are of the box office of the year’s top films.`,
      },

      calendar: no1Runs.length ? {
        title: 'Weekend No. 1s', unit: 'weekend',
        runs: no1Runs.map((r) => ({ it: r.it, start: W[r.w0], end: HA.addDays(W[r.w1], 7), n: r.n, total: r.it.wk1 })),
        facts: () => {
          const no1 = films.filter((f) => f.wk1 > 0);
          const most = no1.reduce((a, b) => (b.wk1 > a.wk1 ? b : a));
          return `${no1.length.toLocaleString()} films have topped the weekend box office since ${W[0].slice(0, 4)}. The most weekends at #1 is ${most.wk1}, by “${most.title}” (${most.year}).`;
        },
      } : null,

      lanes: {
        title: 'Career lanes',
        blurb: 'The directors and stars who defined each decade, ordered by their first hit. Each dot is one of their films at its release date: big dots were a year’s top 10, ringed dots its #1. Tap a name for the whole filmography.',
        ids: () => {
          const ids = new Set();
          for (let d = Math.floor(first / 10) * 10; d <= last; d += 10) {
            people.map((p) => [p.i, p.films.map((i) => films[i]).filter((f) => f.year >= d && f.year < d + 10).reduce((t, f) => t + pts(f.rank), 0)])
              .sort((a, b) => b[1] - a[1]).slice(0, 8).forEach(([i, w]) => w > 0 && ids.add(i));
          }
          return [...ids].sort((a, b) => people[a].t0 - people[b].t0);
        },
        marks: (i) => people[i].films.map((fi) => ({ t: films[fi].t0, rank: films[fi].rank, it: films[fi] })),
        extent: [first, last + 1],
      },
      entityPage: personPage,

      links: (f) => filmLinks(f),
      about: () => about(D, films, raw),
    };
    return D;
  }

  function filmLinks(f) {
    const q = encodeURIComponent(`${f.title} ${f.year}`);
    return h('div', { class: 'listen' },
      f.imdb && h('a', { href: `https://www.imdb.com/title/${f.imdb}/`, target: '_blank', rel: 'noopener' }, 'IMDb ↗'),
      h('a', { href: `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(`${f.title} ${f.year} film`)}`, target: '_blank', rel: 'noopener' }, 'Wikipedia ↗'),
      h('a', { href: `https://www.youtube.com/results?search_query=${q}+trailer`, target: '_blank', rel: 'noopener' }, 'Trailer ↗'),
      h('a', { href: `https://www.justwatch.com/us/search?q=${encodeURIComponent(f.title)}`, target: '_blank', rel: 'noopener' }, 'JustWatch ↗'));
  }

  function weekendChart(f, width, height) {
    const runs = f.runs;
    const pad = { l: 26, r: 8, t: 8, b: 18 };
    const w0 = runs[0][0], w1 = runs[runs.length - 1][0], span = Math.max(w1 - w0, 6);
    const maxR = Math.max(10, ...runs.map((r) => r[1]));
    const X = (w) => pad.l + ((w - w0) / span) * (width - pad.l - pad.r);
    const Y = (r) => pad.t + ((Math.sqrt(r) - 1) / (Math.sqrt(maxR) - 1)) * (height - pad.t - pad.b);
    const svg = s('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': `Weekend chart run of ${f.title}` });
    const grid = s('g', { class: 'grid axis' });
    for (const r of [1, 5, 10, 20, 50].filter((r) => r <= maxR)) grid.append(s('line', { x1: pad.l, x2: width - pad.r, y1: Y(r), y2: Y(r) }), s('text', { x: pad.l - 5, y: Y(r) + 4, 'text-anchor': 'end' }, '#' + r));
    svg.append(grid);
    const col = HA.famVar(f.fam);
    let seg = [];
    const flush = () => { if (seg.length > 1) svg.append(s('polyline', { points: seg.map(([w, r]) => `${X(w).toFixed(1)},${Y(r).toFixed(1)}`).join(' '), fill: 'none', stroke: col, 'stroke-width': 2, 'stroke-linejoin': 'round' })); seg = []; };
    runs.forEach((r, k) => { if (k && r[0] !== runs[k - 1][0] + 1) flush(); seg.push(r); });
    flush();
    const best = runs.reduce((a, b) => (b[1] < a[1] ? b : a));
    svg.append(s('circle', { cx: X(best[0]), cy: Y(best[1]), r: 4.5, fill: col, stroke: 'var(--surface)', 'stroke-width': 2 }));
    const ax = s('g', { class: 'axis' });
    ax.append(s('text', { x: pad.l, y: height - 3 }, `${runs.length} weekends on the chart`));
    svg.append(ax);
    return svg;
  }

  function openFilm(f) {
    const D = HA.D;
    const role = (ids, label) => ids.length && h('div', { class: 'd-acts' }, h('span', { class: 'note', style: { alignSelf: 'center' } }, label), ids.map((p) => h('button', { onclick: () => HA.showEntity(p) }, D.entities[p].name + ' →')));
    HA.openDrawer(
      ...HA.drawerHead(f, f.title, [f.year, f.dist, f.runtime && `${f.runtime} min`].filter(Boolean).join(' · ')),
      role(f.dirs, 'Directed by'),
      role(f.cast, 'Starring'),
      h('div', { class: 'd-stats' },
        HA.stat('#' + f.rank, `film of ${f.year}`),
        HA.stat(money(f.value), f.unit === 'rentals' ? 'US rentals (studio share)' : 'US & Canada gross'),
        f.opening ? HA.stat(money(f.opening), 'opening weekend') : HA.stat(f.rating ? f.rating.toFixed(1) : '–', 'IMDb rating'),
        f.wk1 ? HA.stat(f.wk1, f.wk1 === 1 ? 'weekend at #1' : 'weekends at #1') : HA.stat(f.rating ? f.rating.toFixed(1) : '–', f.rating ? `IMDb, ${HA.plural(f.votes, 'vote')}` : 'IMDb rating')),
      f.runs.length > 1 && h('div', { class: 'label-sm' }, 'Weekend box-office rank'),
      f.runs.length > 1 && h('div', { class: 'd-run' }, weekendChart(f, 360, 130)),
      f.genres.length && h('div', { class: 'd-section' }, h('div', { class: 'label-sm' }, 'Genres'), h('div', { class: 'tag-list' }, f.genres.map((g) => h('span', { class: 'tag' }, g)))),
      h('div', { class: 'd-section' }, h('div', { class: 'label-sm' }, 'Look it up'), filmLinks(f)));
  }

  let sortKey = 'year';
  function personPage(i, rerender, width) {
    const D = HA.D, p = D.entities[i], pal = HA.palette();
    const fs = p.films.map((fi) => D.items[fi]);
    const Wd = Math.max(320, width), H = Wd < 600 ? 260 : 320, pad = { l: 34, r: 16, t: 28, b: 24 };
    const y0 = Math.floor(p.t0) - 1, y1 = Math.ceil(p.t1) + 1;
    const maxR = Math.max(20, ...fs.map((f) => f.rank));
    const X = (t) => pad.l + ((t - y0) / (y1 - y0)) * (Wd - pad.l - pad.r);
    const Y = (r) => pad.t + ((Math.sqrt(r) - 1) / (Math.sqrt(maxR) - 1)) * (H - pad.t - pad.b);
    const svg = s('svg', { viewBox: `0 0 ${Wd} ${H}`, role: 'img', 'aria-label': `Films of ${p.name} by year and rank` });
    const ax = s('g', { class: 'axis grid' });
    for (const r of [1, 5, 10, 20, 50, 100, 200].filter((r) => r <= maxR)) ax.append(s('line', { x1: pad.l, x2: Wd - pad.r, y1: Y(r), y2: Y(r) }), s('text', { x: pad.l - 6, y: Y(r) + 4, 'text-anchor': 'end' }, '#' + r));
    const step = y1 - y0 > 40 ? 10 : y1 - y0 > 16 ? 5 : y1 - y0 > 6 ? 2 : 1;
    for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) ax.append(s('text', { x: X(y), y: H - 6, 'text-anchor': 'middle' }, String(y)));
    svg.append(ax);
    const placed = [];
    for (const f of [...fs].sort((a, b) => b.rank - a.rank)) {
      const c = s('circle', { cx: X(f.t0), cy: Y(f.rank), r: f.rank === 1 ? 6.5 : f.rank <= 10 ? 5 : 3.5, fill: HA.famColour(pal, f.fam), stroke: f.rank === 1 ? pal.ink : pal.surface, 'stroke-width': 1.5, opacity: HA.lit(f.fam) ? 1 : 0.2, style: 'cursor:pointer' });
      HA.bindTip(c, () => D.tip(f), () => openFilm(f));
      svg.append(c);
    }
    for (const f of [...fs].sort((a, b) => a.rank - b.rank)) {
      if (f.rank > 20 || placed.length >= 14) break;
      const lx = X(f.t0), ly = Y(f.rank) - 9, wpx = Math.min(f.title.length, 24) * 6;
      const box = [lx - wpx / 2, ly - 11, lx + wpx / 2, ly + 2];
      if (box[0] < pad.l || box[2] > Wd - 2 || placed.some((b) => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) continue;
      placed.push(box);
      svg.append(s('text', { class: 'peak-label', x: lx, y: ly, 'text-anchor': 'middle', 'pointer-events': 'none' }, f.title.length > 24 ? f.title.slice(0, 23) + '…' : f.title));
    }
    const rows = [...fs].sort(sortKey === 'rank' ? (a, b) => a.rank - b.rank : sortKey === 'gross' ? (a, b) => (b.value || 0) - (a.value || 0) : (a, b) => a.t0 - b.t0);
    const th = (k, label, cls) => h('th', { class: cls, onclick: () => { sortKey = k; rerender(); } }, label + (sortKey === k ? ' ▾' : ''));
    return h('div', {},
      h('div', { class: 'artist-head' },
        h('div', {}, h('div', { class: 'd-fam' }, HA.swatch(p.fam), p.fam >= 0 ? D.fams[p.fam].label : '', h('span', { class: 'note' }, ' · colour of most of their hits')), h('h1', {}, p.name)),
        h('div', { class: 'stats' },
          HA.stat(`${Math.min(...fs.map((f) => f.year))}–${String(Math.max(...fs.map((f) => f.year))).slice(-2)}`, 'years with a hit'),
          HA.stat(fs.length, `films (${p.dir} directed, ${p.act} starring)`),
          HA.stat(fs.filter((f) => f.rank <= 10).length, 'top-10 films'),
          HA.stat(fs.filter((f) => f.rank === 1).length, 'No. 1 films'))),
      h('div', { class: 'traj-wrap' },
        h('div', { class: 'mosaic-cap' }, h('span', { class: 'label-sm' }, 'Every film, by release date and rank in its year'), h('span', { class: 'note' }, 'Higher is bigger; the scale stretches the top 10.')),
        h('div', { class: 'traj' }, svg)),
      h('div', { class: 'scroll-x' }, h('table', { class: 'song-table' },
        h('thead', {}, h('tr', {}, th('year', 'Year'), h('th', {}, 'Film'), h('th', {}, 'Role'), th('rank', 'Rank', 'n'), th('gross', 'US gross', 'n'))),
        h('tbody', {}, rows.map((f) => h('tr', { class: 'row', onclick: () => openFilm(f), style: { opacity: HA.lit(f.fam) ? 1 : 0.35 } },
          h('td', { class: 'num', style: { color: 'var(--muted)' } }, f.year),
          h('td', {}, HA.swatch(f.fam, { marginRight: '8px' }), f.title),
          h('td', {}, f.dirs.includes(i) ? (f.cast.includes(i) ? 'Director, star' : 'Director') : 'Star'),
          h('td', { class: 'n' }, '#' + f.rank),
          h('td', { class: 'n' }, money(f.value) + (f.unit === 'rentals' ? ' r' : ''))))))));
  }

  function about(D, films, raw) {
    const link = HA.extLink;
    return [
      h('p', {}, `The movie side holds ${films.length.toLocaleString()} films released ${D.periods[0]}–${D.periods[D.periods.length - 1]}, each ranked within its release year by total US and Canadian box office.`),
      h('h2', {}, 'What counts as a hit'),
      h('p', {}, 'A film belongs to the year it opened and is ranked by its total domestic gross, so a December release counts fully toward its own year (Titanic is 1997’s #1). Re-releases are left out. Before 1977 only each year’s top 10 is known, and it is ranked by rentals (the studio’s share of ticket sales, roughly half the gross); compare those years by rank, not by dollars. Figures are not adjusted for inflation.'),
      h('p', {}, 'The No. 1s view shows each weekend’s top film from 1982 on, and every film since then has its weekend-by-weekend chart run.'),
      h('h2', {}, 'Genres'),
      HA.famTable(D),
      h('p', {}, 'Genre is a weighted vote between Wikidata’s full genre list for each film (matched by IMDb id) and IMDb’s own genres. IMDb’s bulk file keeps only three genres per film, alphabetically, which drops “Musical” from The Sound of Music, so Wikidata usually decides. Premise genres (science fiction, fantasy, horror) win when several of them stack up, since Wikidata repeats mode labels like drama and adventure on nearly everything. Comedies of any kind (action comedy, fantasy comedy) count as Comedy; superhero films are their own family. Every year’s top 10 was then read through by Claude and about 75 calls corrected by hand (Top Gun is Action, not Drama); those show as “edited”.'),
      HA.sourceTable(D),
      h('h2', {}, 'Sources'),
      h('ul', {},
        h('li', {}, link('https://www.boxofficemojo.com/', 'Box Office Mojo'), ': yearly grosses from 1977 and weekend charts from 1982.'),
        h('li', {}, 'Wikipedia “<year> in film” pages: each year’s top 10 for 1958–1976.'),
        h('li', {}, link('https://developer.imdb.com/non-commercial-datasets/', 'IMDb non-commercial datasets'), ': ids, runtimes, ratings, directors and cast.'),
        h('li', {}, link('https://www.wikidata.org/', 'Wikidata'), ': genres, the superhero list and Best Picture winners (★).')),
      h('p', { class: 'note' }, `Data built ${raw.built}.`),
    ];
  }

  HA.domains.movies = { id: 'movies', label: 'Movies', dataId: 'movies-data', dataUrl: 'data/movies.json', build };
})();
