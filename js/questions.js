// Question kinds for the quiz (js/quiz.js), one set per domain. Each kind's
// weight follows how often that kind of question comes up in general-knowledge
// quizzes (DECISIONS.md §9): who sang it and which song is theirs lead for
// music; naming the film from its facts and its stars for movies; naming the
// show for TV. "When" questions are scored by closeness: a rough sense of the
// year is the useful part.
(function () {
  const HA = globalThis.HA;
  const K = (HA.quizKit = {});

  K.rnd = (n) => Math.floor(Math.random() * n);
  K.shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = K.rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  K.fame = (x) => x.fame;
  K.pick = (list, w = K.fame) => {
    if (!list.length) return null;
    let t = 0;
    for (const x of list) t += Math.max(0, w(x));
    let r = Math.random() * t;
    for (const x of list) { r -= Math.max(0, w(x)); if (r <= 0) return x; }
    return list[list.length - 1];
  };
  // n distinct draws by weight; key() decides what counts as the same answer.
  K.some = (list, n, w = K.fame, key = (x) => x, taken = new Set()) => {
    const out = [];
    let pool = list.filter((x) => !taken.has(key(x)));
    while (out.length < n && pool.length) {
      const x = K.pick(pool, w), k = key(x);
      out.push(x); taken.add(k);
      pool = pool.filter((y) => key(y) !== k);
    }
    return out;
  };
  // Distractors from the same genre are harder to rule out, so they're favoured.
  // Wrong answers should be well known (an obscure name is easy to rule out)
  // and, where possible, from the same genre.
  K.known = (x) => Math.pow(x.fame, 1.4);
  K.likeFam = (fam, k = 2.5) => (x) => K.known(x) * (x.fam === fam ? k : 1);
  // ...and about as well known as the right answer, so neither stands out.
  K.band = (list, ref, k = 3) => {
    const b = list.filter((x) => x.fame >= ref.fame / k && x.fame <= ref.fame * k);
    return b.length >= 6 ? b : list;
  };
  K.choices = (right, wrong, label, sub = () => '', reveal = () => '') => {
    if (wrong.length < 3) return null;
    return K.shuffle([right, ...wrong].map((x, k) => ({ label: label(x), sub: sub(x), reveal: reveal(x), ok: k === 0 })));
  };
  const quote = (t) => `“${t}”`;
  const decadeName = (d) => `the ${d}s`;
  const near = (y, gap, yearOf) => (x) => Math.abs(yearOf(x) - y) <= gap;

  // ── music ──────────────────────────────────────────────────────────────────
  HA.questions = {};
  HA.questions.music = function (D) {
    const m = D.m, songs = m.songs, acts = m.acts;
    const lead = (s) => acts[s.acts[0]];
    const leadSongs = (a) => a.songs.map((i) => songs[i]).filter((s) => s.acts.indexOf(a.i) < s.nLead && s.peak <= 40);
    const peakText = (s) => (s.peak === 1 ? `No. 1 for ${HA.plural(s.wk1, 'week')}` : `peaked at No. ${s.peak}`);
    const hits = songs.filter((s) => s.peak <= 20);
    // An act's biggest year: where its lead hits earned the most chart points.
    const peakYear = (a) => {
      if (a.peakYear == null) {
        const t = new Map();
        for (const s of leadSongs(a)) t.set(s.year, (t.get(s.year) || 0) + s.pts);
        a.peakYear = [...t].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
      }
      return a.peakYear;
    };
    const span = (a) => `${m.weekYear[a.first]}–${m.weekYear[a.last]}`;
    const actsNear = (y, gap, not) => {
      const out = new Set();
      for (const s of hits) if (Math.abs(s.year - y) <= gap) for (const a of s.acts.slice(0, s.nLead)) if (!not.has(a)) out.add(acts[a]);
      return [...out];
    };

    const kinds = {
      artist: { w: 5, make(c) {
        const s = c.item();
        if (!s) return null;
        const a = lead(s);
        const wrong = K.some(K.band(actsNear(s.year, 4, new Set(s.acts)), a), 3, K.likeFam(a.fam), (x) => x.name, new Set([a.name]));
        return { kicker: 'Who had the hit', prompt: quote(s.title), sub: String(s.year), subject: s,
          choices: K.choices(a, wrong, (x) => x.name), reveal: `${s.credit} · ${peakText(s)} in ${s.year}` };
      } },
      song: { w: 4, make(c) {
        const a = c.ent((x) => leadSongs(x).some(c.inScope));
        if (!a) return null;
        const own = leadSongs(a).filter(c.inScope);
        const s = K.pick(own, K.known);
        if (!s) return null;
        const wrong = K.some(K.band(hits.filter((x) => !x.acts.includes(a.i) && Math.abs(x.year - s.year) <= 4), s), 3, K.likeFam(s.fam), (x) => x.title.toLowerCase(), new Set([s.title.toLowerCase()]));
        return { kicker: 'Which was a hit for', prompt: a.name, subject: s,
          choices: K.choices(s, wrong, (x) => quote(x.title), (x) => String(x.year), (x) => (x === s ? '' : x.credit)),
          reveal: `${quote(s.title)} · ${peakText(s)} in ${s.year}` };
      } },
      whohits: { w: 3, make(c) {
        const a = c.ent((x) => leadSongs(x).length >= 3);
        if (!a) return null;
        const top = leadSongs(a).sort((x, y) => y.fame - x.fame).slice(0, 3);
        const py = peakYear(a);
        const wrong = K.some(K.band(actsNear(py, 5, new Set([a.i])).filter((x) => leadSongs(x).length >= 2), a), 3, K.likeFam(a.fam), (x) => x.name, new Set([a.name]));
        return { kicker: 'Whose hits were these', prompt: top.map((s) => quote(s.title)).join(', '), subject: a, entity: true,
          choices: K.choices(a, wrong, (x) => x.name), reveal: `${a.name}: on the chart ${span(a)}, ${HA.plural(leadSongs(a).length, 'top-40 hit')}` };
      } },
      when: { w: 2.5, make(c) {
        const s = c.item();
        if (!s) return null;
        return { kicker: 'When was this a hit', prompt: quote(s.title), sub: s.credit, subject: s,
          year: s.year, ok: [s.year, m.weekYear[s.peakWeek]], tol: [1, 3], reveal: `${peakText(s)} in ${s.year}` };
      } },
      peak: { w: 2, make(c) {
        const a = c.ent((x) => leadSongs(x).length >= 2 && peakYear(x) != null);
        if (!a) return null;
        const best = leadSongs(a).sort((x, y) => y.fame - x.fame)[0];
        return { kicker: 'When were they at their peak', prompt: a.name, sub: 'Their biggest year on the chart', subject: a, entity: true,
          year: peakYear(a), tol: [2, 5], reveal: `On the chart ${span(a)}; biggest year ${peakYear(a)}. Best known: ${quote(best.title)} (${best.year})` };
      } },
      biggest: { w: 2, make(c) {
        const d = c.decade();
        if (d == null) return null;
        const t = new Map();
        for (const s of songs) if (s.year >= d && s.year < d + 10 && c.famOk(s)) s.acts.forEach((a, k) => t.set(a, (t.get(a) || 0) + (k < s.nLead ? s.pts : s.pts / 2)));
        const ranked = [...t].sort((x, y) => y[1] - x[1]).slice(0, 40).map(([a, p], k) => ({ a: acts[a], p, rank: k + 1 }));
        if (ranked.length < 12) return null;
        const top = c.level === 'deeper' ? ranked.slice(6, 20) : ranked.slice(0, 8);
        const r = top[K.rnd(top.length)];
        const below = ranked.filter((x) => x.p < r.p / 1.3);
        const wrong = K.some(below, 3, () => 1, (x) => x.a.name);
        return { kicker: decadeName(d), prompt: 'Which act had the biggest decade?', sub: 'Most chart success from songs of the decade', subject: r.a, entity: true,
          choices: K.choices(r, wrong, (x) => x.a.name, () => '', (x) => `No. ${x.rank} of the decade`), reveal: `${r.a.name} was No. ${r.rank} of ${decadeName(d)}` };
      } },
      yearhit: { w: 2, make(c) {
        const y = c.year();
        if (y == null) return null;
        const list = (m.byYear.get(y) || []).filter(c.famOk);
        const tier = c.level === 'deeper' ? list.slice(10, 30) : list.slice(0, 10);
        if (!tier.length) return null;
        const s = K.pick(tier);
        if (!s) return null;
        const wrong = K.some(K.band(hits.filter((x) => Math.abs(x.year - y) >= 4 && Math.abs(x.year - y) <= 15 && x.yearRank <= 20), s), 3, K.likeFam(s.fam), (x) => x.title.toLowerCase(), new Set([s.title.toLowerCase()]));
        return { kicker: String(y), prompt: 'Which of these was a big hit that year?', subject: s,
          choices: K.choices(s, wrong, (x) => quote(x.title), (x) => x.credit, (x) => `${x.year}`), reveal: `${quote(s.title)} was No. ${s.yearRank} of ${y}` };
      } },
      no1: { w: 1, make(c) {
        const s = c.item((x) => x.peak === 1);
        if (!s) return null;
        const wrong = K.some(K.band(songs.filter((x) => x.peak >= 2 && x.peak <= 5 && Math.abs(x.year - s.year) <= 3), s), 3, K.known, (x) => x.title.toLowerCase(), new Set([s.title.toLowerCase()]));
        return { kicker: 'Chart-toppers', prompt: 'Which of these went to No. 1?', subject: s,
          choices: K.choices(s, wrong, (x) => quote(x.title), (x) => `${lead(x).name}, ${x.year}`, (x) => (x.peak === 1 ? 'No. 1' : `peaked at No. ${x.peak}`)), reveal: `${quote(s.title)}: ${peakText(s)}` };
      } },
      first: { w: 0.7, make(c) {
        const a = c.item();
        if (!a) return null;
        const b = K.pick(c.top.filter((x) => x !== a && Math.abs(x.year - a.year) >= 2 && Math.abs(x.year - a.year) <= 10));
        if (!b) return null;
        const [x, y] = a.first < b.first ? [a, b] : [b, a];
        const ch = K.shuffle([{ label: quote(x.title), sub: x.credit, reveal: String(x.year), ok: true }, { label: quote(y.title), sub: y.credit, reveal: String(y.year), ok: false }]);
        return { kicker: 'Which came first', prompt: 'Which was a hit first?', subject: a, choices: ch, reveal: `${quote(x.title)} (${x.year}) came ${HA.plural(y.year - x.year, 'year')} before ${quote(y.title)} (${y.year})` };
      } },
      grammy: { w: 0.6, make(c) {
        const s = c.item((x) => x.grammy);
        if (!s) return null;
        const wrong = K.some(songs.filter((x) => !x.grammy && x.yearRank <= 15 && Math.abs(x.year - (s.grammy - 1)) <= 1), 3);
        return { kicker: 'Grammy Record of the Year', prompt: `Which won at the ${s.grammy} Grammys?`, subject: s,
          choices: K.choices(s, wrong, (x) => quote(x.title), (x) => lead(x).name), reveal: `${quote(s.title)} by ${s.credit}` };
      } },
    };
    return {
      kinds,
      items: songs.filter((s) => s.peak <= 40),
      ents: acts.filter((a) => leadSongs(a).length),
      yearOf: (s) => s.year,
      entItems: (a) => leadSongs(a),
    };
  };

  // ── movies ─────────────────────────────────────────────────────────────────
  HA.questions.movies = function (D) {
    const films = D.items, people = D.entities;
    const name = (p) => people[p].name;
    const top = films.filter((f) => f.rank <= 20);
    const list = (ids) => ids.map(name);
    const and = (xs) => (xs.length > 1 ? xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1] : xs[0]);
    const peopleNear = (y, gap, role, not) => {
      const out = new Set();
      for (const f of top) if (Math.abs(f.year - y) <= gap) for (const p of (role === 'dir' ? f.dirs : f.cast.slice(0, 2))) if (!not.has(p)) out.add(people[p]);
      return [...out];
    };
    const filmsOf = (p) => p.films.map((i) => films[i]);
    const isDirector = (p) => p.dir >= p.act;
    const peakYear = (p) => {
      const fs = filmsOf(p);
      const w = fs.reduce((t, f) => t + f.fame, 0);
      return Math.round(fs.reduce((t, f) => t + f.year * f.fame, 0) / w);
    };
    const facts = (f) => [f.dirs.length && `directed by ${and(list(f.dirs.slice(0, 2)))}`, f.cast.length && `starring ${and(list(f.cast.slice(0, 2)))}`].filter(Boolean).join(', ');
    const filmsNear = (f, gap) => top.filter((x) => x !== f && Math.abs(x.year - f.year) <= gap && x.title !== f.title);

    const kinds = {
      film: { w: 4, make(c) {
        const f = c.item((x) => x.dirs.length && x.cast.length);
        if (!f) return null;
        const wrong = K.some(K.band(filmsNear(f, 3), f), 3, K.likeFam(f.fam), (x) => x.title);
        return { kicker: 'Name the film', prompt: `A ${f.year} film ${facts(f)}`, subject: f,
          choices: K.choices(f, wrong, (x) => x.title, () => '', (x) => String(x.year)), reveal: `${f.title} (${f.year}) · No. ${f.rank} at the box office that year` };
      } },
      star: { w: 3, make(c) {
        const f = c.item((x) => x.cast.length);
        if (!f) return null;
        const p = people[f.cast[0]];
        // Like for like: an actress among three actors would give it away.
        const wrong = K.some(K.band(peopleNear(f.year, 4, 'cast', new Set(f.cast)).filter((x) => !!x.woman === !!p.woman), p), 3, K.known, (x) => x.name, new Set([p.name]));
        return { kicker: 'Who starred in', prompt: f.title, sub: String(f.year), subject: f,
          choices: K.choices(p, wrong, (x) => x.name), reveal: `${f.title}: ${and(list(f.cast.slice(0, 3)))}` };
      } },
      director: { w: 1.5, make(c) {
        const f = c.item((x) => x.dirs.length);
        if (!f) return null;
        const p = people[f.dirs[0]];
        const wrong = K.some(K.band(peopleNear(f.year, 5, 'dir', new Set(f.dirs)), p), 3, K.known, (x) => x.name, new Set([p.name]));
        return { kicker: 'Who directed', prompt: f.title, sub: String(f.year), subject: f,
          choices: K.choices(p, wrong, (x) => x.name), reveal: `${f.title} (${f.year}), directed by ${and(list(f.dirs))}` };
      } },
      when: { w: 2, make(c) {
        const f = c.item();
        if (!f) return null;
        return { kicker: 'What year did it come out', prompt: f.title, sub: f.sub, subject: f, year: f.year, tol: [1, 3],
          reveal: `${f.year} · No. ${f.rank} at the box office that year` };
      } },
      peak: { w: 1.5, make(c) {
        const p = c.ent((x) => x.films.length >= 3);
        if (!p) return null;
        const fs = filmsOf(p).sort((x, y) => y.fame - x.fame);
        return { kicker: 'When were they at their peak', prompt: p.name, sub: isDirector(p) ? 'Director' : 'Actor', subject: p, entity: true,
          year: peakYear(p), tol: [3, 6], reveal: `Hits ${Math.min(...fs.map((f) => f.year))}–${Math.max(...fs.map((f) => f.year))}; best known: ${fs.slice(0, 2).map((f) => `${f.title} (${f.year})`).join(', ')}` };
      } },
      starfilm: { w: 2, make(c) {
        const p = c.ent((x) => filmsOf(x).some(c.inScope));
        if (!p) return null;
        const f = K.pick(filmsOf(p).filter(c.inScope), K.known);
        if (!f) return null;
        const wrong = K.some(K.band(filmsNear(f, 4).filter((x) => !x.dirs.includes(p.i) && !x.cast.includes(p.i)), f), 3, K.likeFam(f.fam), (x) => x.title);
        const verb = f.dirs.includes(p.i) ? 'directed' : 'starred';
        return { kicker: `Which of these ${verb === 'directed' ? 'did they direct' : 'did they star in'}`, prompt: p.name, subject: f,
          choices: K.choices(f, wrong, (x) => x.title, (x) => String(x.year)), reveal: `${p.name} ${verb === 'directed' ? 'directed' : 'starred in'} ${f.title} (${f.year})` };
      } },
      bp: { w: 1.5, make(c) {
        const f = c.item((x) => x.award);
        if (!f) return null;
        const wrong = K.some(films.filter((x) => !x.award && x.rank <= 12 && Math.abs(x.year - f.year) <= 1), 3);
        return { kicker: 'Best Picture', prompt: `Which of these won Best Picture?`, sub: `Films of ${f.year - 1}–${f.year + 1}`, subject: f,
          choices: K.choices(f, wrong, (x) => x.title, (x) => String(x.year)), reveal: `${f.title} (${f.year}) won the Oscar for Best Picture` };
      } },
      yearhit: { w: 2, make(c) {
        const y = c.year();
        if (y == null) return null;
        const year = (D.byPeriod.get(y) || []).map((e) => e.it).filter(c.famOk);
        if (year.length < 6) return null;
        if (c.level !== 'deeper' && Math.random() < 0.5) {
          const f = year[0];
          const wrong = K.some(year.slice(1, 8), 3, () => 1);
          return { kicker: String(y), prompt: 'Which was the top-grossing film of the year?', subject: f,
            choices: K.choices(f, wrong, (x) => x.title, () => '', (x) => `No. ${x.rank} of ${y}`), reveal: `${f.title} was No. 1 at the ${y} box office` };
        }
        const tier = c.level === 'deeper' ? year.slice(10, 30) : year.slice(0, 10);
        const f = K.pick(tier);
        if (!f) return null;
        const wrong = K.some(K.band(top.filter((x) => Math.abs(x.year - y) >= 3 && Math.abs(x.year - y) <= 12), f), 3, K.likeFam(f.fam), (x) => x.title, new Set([f.title]));
        return { kicker: String(y), prompt: 'Which of these came out that year?', subject: f,
          choices: K.choices(f, wrong, (x) => x.title, () => '', (x) => String(x.year)), reveal: `${f.title} was No. ${f.rank} of ${y}` };
      } },
      first: { w: 0.7, make(c) {
        const a = c.item();
        if (!a) return null;
        const b = K.pick(c.top.filter((x) => x !== a && Math.abs(x.year - a.year) >= 2 && Math.abs(x.year - a.year) <= 12));
        if (!b) return null;
        const [x, y] = a.t0 < b.t0 ? [a, b] : [b, a];
        const ch = K.shuffle([{ label: x.title, reveal: String(x.year), ok: true }, { label: y.title, reveal: String(y.year), ok: false }]);
        return { kicker: 'Which came first', prompt: 'Which came out first?', subject: a, choices: ch, reveal: `${x.title} (${x.year}), then ${y.title} (${y.year})` };
      } },
    };
    return {
      kinds,
      items: films.filter((f) => f.rank <= 50),
      ents: people.filter((p) => p.films.length >= 2),
      yearOf: (f) => f.year,
      entItems: (p) => filmsOf(p),
    };
  };

  // ── tv ─────────────────────────────────────────────────────────────────────
  HA.questions.tv = function (D) {
    const shows = D.items, label = D.periodLabel;
    const startYear = (x) => (x.premiered ? +x.premiered.slice(0, 4) : x.first);
    const endYear = (x) => (x.ended ? +x.ended.slice(0, 4) : x.last + 1);
    const nets = (x) => x.sub.split(', ').filter(Boolean);
    const famName = (x) => (x.fam >= 0 ? D.fams[x.fam].label.toLowerCase() : 'prime-time');
    const overlap = (a, b, pad = 2) => startYear(a) <= endYear(b) + pad && startYear(b) <= endYear(a) + pad;
    const runText = (x) => (x.top10 ? `a top-10 show for ${HA.plural(x.top10, 'season')}` : `ranked as high as No. ${x.home.rank}`);
    const NETWORKS = [['ABC', 1948, 2100], ['CBS', 1948, 2100], ['NBC', 1948, 2100], ['FOX', 1987, 2100], ['DuMont', 1948, 1956], ['The WB', 1995, 2006], ['UPN', 1995, 2006], ['The CW', 2006, 2100]];

    const kinds = {
      show: { w: 4, make(c) {
        const x = c.item();
        if (!x) return null;
        const wrong = K.some(K.band(shows.filter((y) => y !== x && overlap(x, y)), x), 3, K.likeFam(x.fam), (y) => y.title);
        return { kicker: 'Name the show', prompt: `A ${famName(x)} series on ${nets(x).join(' and ')}, ${startYear(x)}–${x.ended ? endYear(x) : 'now'}, ${runText(x)}`, subject: x,
          choices: K.choices(x, wrong, (y) => y.title, () => '', (y) => `${startYear(y)}–${y.ended ? endYear(y) : 'now'}`), reveal: `${x.title}: best No. ${x.home.rank} in ${label(x.home.p)}` };
      } },
      when: { w: 2.5, make(c) {
        const x = c.item();
        if (!x) return null;
        return { kicker: 'When did it start', prompt: x.title, sub: x.sub, subject: x, year: startYear(x), tol: [2, 4],
          reveal: `${x.premiered ? 'Premiered' : 'First ranked'} ${startYear(x)}; ${runText(x)}` };
      } },
      top: { w: 2, make(c) {
        const y = c.year();
        if (y == null) return null;
        const list = (D.byPeriod.get(y) || []).filter((e) => c.famOk(e.it));
        if (list.length < 6) return null;
        const e = list[0];
        const wrong = K.some(list.slice(1, 10).map((r) => r.it).filter((it) => it !== e.it), 3, () => 1, (it) => it.title);
        return { kicker: label(y), prompt: 'What was the most-watched series of the season?', subject: e.it,
          choices: K.choices(e.it, wrong, (it) => it.title, (it) => it.sub), reveal: `${e.it.title} was No. 1 in ${label(y)}` };
      } },
      emmy: { w: 1, make(c) {
        const x = c.item((s) => s.emmys?.length);
        if (!x) return null;
        const [y, kind] = x.emmys[K.rnd(x.emmys.length)];
        const wrong = K.some(shows.filter((s) => s !== x && s.fam === x.fam && s.runs.some((r) => Math.abs(r.p - (y - 1)) <= 1) && !s.emmys?.some(([yy, k]) => yy === y && k === kind)), 3);
        return { kicker: `Emmy for ${kind === 'drama' ? 'Drama' : 'Comedy'} Series`, prompt: `Which won in ${y}?`, subject: x,
          choices: K.choices(x, wrong, (s) => s.title, (s) => s.sub), reveal: x.award };
      } },
      network: { w: 0.7, make(c) {
        const x = c.item((s) => nets(s).length === 1);
        if (!x) return null;
        const n = nets(x)[0], y = startYear(x);
        const wrong = K.shuffle(NETWORKS.filter(([k, a, b]) => k !== n && y >= a - 1 && y <= b)).slice(0, 3).map(([k]) => k);
        if (wrong.length < 3) return null;
        return { kicker: 'Which network', prompt: x.title, sub: `${startYear(x)}–${x.ended ? endYear(x) : 'now'}`, subject: x,
          choices: K.choices(n, wrong, (k) => k), reveal: `${x.title} aired on ${x.sub}` };
      } },
      yearhit: { w: 1.5, make(c) {
        const y = c.year();
        if (y == null) return null;
        const list = (D.byPeriod.get(y) || []).filter((e) => c.famOk(e.it)).map((e) => e.it);
        const tier = c.level === 'deeper' ? list.slice(10, 30) : list.slice(0, 10);
        if (!tier.length) return null;
        const x = K.pick(tier);
        if (!x) return null;
        // Shows from nearby eras that weren't on then: far-off ones are too easy to rule out.
        const wrong = K.some(K.band(shows.filter((s) => s.top10 && s.runs.every((r) => Math.abs(r.p - y) >= 4) && s.runs.some((r) => Math.abs(r.p - y) <= 14)), x), 3, K.likeFam(x.fam), (s) => s.title);
        return { kicker: label(y), prompt: 'Which of these was a top show that season?', subject: x,
          choices: K.choices(x, wrong, (s) => s.title, (s) => s.sub, (s) => `${label(s.first)} – ${label(s.last)}`), reveal: `${x.title} was No. ${x.runs.find((r) => r.p === y)?.rank ?? x.home.rank} in ${label(y)}` };
      } },
      first: { w: 0.7, make(c) {
        const a = c.item();
        if (!a) return null;
        const b = K.pick(c.top.filter((x) => x !== a && Math.abs(startYear(x) - startYear(a)) >= 2 && Math.abs(startYear(x) - startYear(a)) <= 12));
        if (!b) return null;
        const [x, y] = startYear(a) < startYear(b) ? [a, b] : [b, a];
        const ch = K.shuffle([{ label: x.title, sub: x.sub, reveal: String(startYear(x)), ok: true }, { label: y.title, sub: y.sub, reveal: String(startYear(y)), ok: false }]);
        return { kicker: 'Which came first', prompt: 'Which premiered first?', subject: a, choices: ch, reveal: `${x.title} (${startYear(x)}), then ${y.title} (${startYear(y)})` };
      } },
    };
    return {
      kinds,
      items: shows,
      ents: [],
      // A show belongs to every season it ranked in.
      yearOf: (x) => x.home.p,
      years: (x) => x.runs.map((r) => r.p),
    };
  };
})();
