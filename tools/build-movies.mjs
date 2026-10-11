// Builds data/movies.json: each year's biggest films at the US/Canada box office.
//   NODE_USE_ENV_PROXY=1 node tools/build-movies.mjs      (after tools/fetch-bom.mjs)
// Also writes tools/cache/movies-review.tsv (each year's top 15 with genre
// evidence), which is what to read when adding entries to tools/movies/overrides.json.
//
// Sources, in order of authority:
//   1958–1976  Wikipedia "<year> in film": top 10 by North American rentals
//   1977–      Box Office Mojo: every release of the year by total domestic gross,
//              plus weekend charts from 1982 (chart runs and weekend #1s)
//   IMDb       matches each film to an id: runtime, rating, director, cast
//   Wikidata   full genre lists by IMDb id (IMDb's own file keeps only three, alphabetically)
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { clueMap } from './lib/clues.mjs';
import { page, tables, col } from './lib/wiki.mjs';
import { movies as imdbMovies, people as imdbPeople } from './lib/imdb.mjs';

const here = (p) => new URL(p, import.meta.url).pathname;
const BOM = here('./cache/bom/');
const WD = here('./cache/wikidata/');
const fixes = JSON.parse(readFileSync(here('./movies/overrides.json'), 'utf8'));
const FIRST = 1958, BOM_FROM = 1977;

export const FAMILIES = [
  { id: 'drama', label: 'Drama', blurb: 'Drama, romance, biopics, crime and war dramas' },
  { id: 'action', label: 'Action & Adventure', blurb: 'Action, adventure, spy, disaster, war epics and westerns' },
  { id: 'scifi', label: 'Sci-Fi & Fantasy', blurb: 'Science fiction and fantasy, from Star Wars to Harry Potter' },
  { id: 'superhero', label: 'Superhero', blurb: 'Comic-book heroes: Superman, Batman, Spider-Man, the Marvel and DC universes' },
  { id: 'animation', label: 'Animation', blurb: 'Animated features: Disney, Pixar, DreamWorks, Illumination' },
  { id: 'comedy', label: 'Comedy', blurb: 'Comedy, including romantic, action and fantasy comedies' },
  { id: 'musical', label: 'Musical', blurb: 'Musicals and music films, from The Sound of Music to Wicked' },
  { id: 'horror', label: 'Horror & Thriller', blurb: 'Horror, thrillers and suspense' },
  { id: 'other', label: 'Other', blurb: 'Documentaries and concert films' },
];
const FAM = Object.fromEntries(FAMILIES.map((f, i) => [f.id, i]));
// Where a film's family came from; the app labels each film with it.
const SRC = { NONE: 0, WIKIDATA: 1, IMDB: 2, EDITED: 3 };

const RERELEASE = /\s*(?:\d{4}\s+)?(?:re-?release|special edition|\d+(?:st|nd|rd|th) anniversary(?: edition)?|imax re-?release|re-?issue)\s*$/i;
const norm = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, 'and').replace(/^the\s+/, '').replace(/[^a-z0-9]/g, '');

// ── 1. the films of each year ─────────────────────────────────────────────────
async function wikiYear(y) {
  const t = tables(await page(`${y} in film`)).find((t) => col(t.rows[0], /rank/i) >= 0 && /gross|rental/i.test(t.rows[0].join(' ')));
  if (!t) return { unit: null, rows: [] };
  const [head, ...rows] = t.rows;
  const [cr, ct, cd, cv] = [col(head, /rank/i), col(head, /title/i), col(head, /distributor|studio/i), col(head, /gross|rental/i)];
  return {
    unit: /rental/i.test(head[cv]) ? 'rentals' : 'gross',
    // A tie lists two films in one row ("Rio Bravo ⏎ The Nun's Story").
    rows: rows.flatMap((r, k) => r[ct].split(' ⏎ ').map((title) => ({ year: y, rank: +r[cr] || k + 1, title, distributor: (r[cd] || '').split(' ⏎ ')[0], value: +String(r[cv]).split(' ⏎ ')[0].replace(/[^\d.]/g, '') || null }))),
  };
}
function bomYear(y) {
  const file = `${BOM}years/${y}.tsv`;
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => {
    const [rank, rl, title, gross, maxTh, opening, open, , distributor] = l.split('\t');
    return { year: y, rank: +rank, rl, title, value: +gross || null, maxTh: +maxTh || null, opening: +opening || null, open, distributor };
  });
}

// ── 2. IMDb ids ──────────────────────────────────────────────────────────────
function matcher(movies) {
  const byTitle = new Map();
  for (const [t, [title, original, year, , , , votes]] of Object.entries(movies)) {
    // Also index a franchise film by its subtitle, so Wikipedia's "Return of the
    // Jedi" finds "Star Wars: Episode VI - Return of the Jedi".
    const sub = (t) => (/ - |: /.test(t) ? t.split(/ - |: /).pop() : t);
    for (const k of new Set([norm(title), norm(original), norm(sub(title))])) {
      if (!byTitle.has(k)) byTitle.set(k, []);
      byTitle.get(k).push([t, year, votes]);
    }
  }
  // Box Office Mojo and Wikipedia titles differ from IMDb's in subtitles and
  // punctuation ("Star Wars" vs "Star Wars: Episode IV - A New Hope").
  const variants = (title) => {
    const base = title.replace(/\s*\((?:re-?release|\d{4}[^)]*|special edition|imax|3d)[^)]*\)\s*$/i, '');
    return [...new Set([base, base.split(/:\s| - /)[0], base.replace(/^(.*?), the$/i, 'The $1')])];
  };
  return (title, year, slack = 1) => {
    if (fixes.imdb[`${title} (${year})`]) return fixes.imdb[`${title} (${year})`];
    let best = null;
    for (const v of variants(title)) {
      for (const [t, y, votes] of byTitle.get(norm(v)) || []) {
        if (Math.abs(y - year) > slack) continue;
        const score = votes - Math.abs(y - year) * 1e5;
        if (!best || score > best[1]) best = [t, score];
      }
      if (best) break;
    }
    return best && best[0];
  };
}

// ── 3. Wikidata genres ───────────────────────────────────────────────────────
async function wikidataGenres(ids) {
  const file = WD + 'film-genres.json';
  const cache = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const todo = ids.filter((t) => !(t in cache));
  for (let i = 0; i < todo.length; i += 250) {
    const batch = todo.slice(i, i + 250);
    const q = `SELECT ?imdb ?gLabel WHERE { VALUES ?imdb { ${batch.map((t) => `"${t}"`).join(' ')} } ?f wdt:P345 ?imdb ; wdt:P136 ?g . SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }`;
    let json = null;
    for (let attempt = 0; attempt < 4 && !json; attempt++) {
      const res = await fetch('https://query.wikidata.org/sparql', {
        method: 'POST',
        headers: { 'User-Agent': 'HitAtlas/0.3 (https://github.com/akuzee)', Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'query=' + encodeURIComponent(q),
      }).catch(() => null);
      if (res?.ok) json = await res.json(); else await new Promise((r) => setTimeout(r, 3000 * 2 ** attempt));
    }
    for (const t of batch) cache[t] = [];
    for (const b of json?.results.bindings || []) cache[b.imdb.value].push(b.gLabel.value);
    writeFileSync(file, JSON.stringify(cache));
  }
  return cache;
}

// ── 4. families ──────────────────────────────────────────────────────────────
// Two imperfect sources vote. IMDb's genres are a film's main ones but its bulk
// file keeps only three, alphabetically; Wikidata's lists are complete but loose
// (it tags Terminator 2 "comedy film" and "drama film"). So IMDb genres count
// double, generic labels count less, and an explicitly comedic label ("romantic
// comedy", "comedy horror") counts extra. A few kinds decide outright: superhero
// (Wikidata's list), animation (IMDb, which tags it reliably), musical (when IMDb
// agrees, or at least doesn't call it a comedy: Barbie has songs but isn't one).
const IMDB_VOTE = {
  Action: ['action', 2], Adventure: ['action', 1], War: ['action', 2], Western: ['action', 2],
  'Sci-Fi': ['scifi', 2], Fantasy: ['scifi', 2], Comedy: ['comedy', 2], Horror: ['horror', 2], Thriller: ['horror', 1],
  Mystery: ['horror', 1], Drama: ['drama', 2], Romance: ['drama', 2], Biography: ['drama', 2], History: ['drama', 1],
  Crime: ['drama', 1], Sport: ['drama', 1], Music: ['drama', 1], Documentary: ['other', 3],
};
const LABEL_FAMILY = [
  ['other', /^documentary|concert film/],
  ['drama', /comedy[- ]drama|dramedy/],
  ['action', /action thriller|spy thriller/],
  ['comedy', /comedy|parody|spoof|satir/],
  ['horror', /horror|slasher|zombie/],
  ['thriller', /thriller|suspense|mystery|psychological|neo-noir/],
  ['scifi', /science fiction|fantasy|space opera|cyberpunk|dystopian|sword and sorcery|kaiju|fairy tale|supernatural/],
  ['action', /action|adventure|war film|western|spy|disaster|martial arts|swashbuckler|heist|epic film|sword-and-sandal|military|pirate|submarine/],
  ['drama', /drama|romance|romantic|biographical|crime|historical|sports|coming-of-age|family|legal|teen|melodrama|period|political|christmas|lgbt|road|buddy|noir|social/],
];
const labelFamily = (l) => { for (const [f, re] of LABEL_FAMILY) if (re.test(l.toLowerCase())) return f; return null; };
const COMEDY_COMPOUND = /\b(?!comedy\b)[a-z-]+ comedy|comedy (?:horror|thriller)|parody|spoof/i;
const TIE_ORDER = ['comedy', 'scifi', 'action', 'horror', 'drama', 'other'];
// Wikidata's superhero list misses some franchise entries (Quantumania); the
// big comic-book franchises are matched by name as a backstop.
const SUPERHERO_TITLE = /\b(Avengers|Spider-Man|Batman|Superman|X-Men|X2|Iron Man|Thor|Captain America|Ant-Man|Guardians of the Galaxy|Black Panther|Wonder Woman|Aquaman|Deadpool|Wolverine|Justice League|Fantastic Four|Hulk|Doctor Strange|Shazam|Venom|Eternals|The Flash|Suicide Squad|Black Widow|Shang-Chi|Daredevil|Hellboy|Man of Steel|Dark Knight|Captain Marvel|The Marvels|Thunderbolts|Morbius|Blade|Watchmen|Green Lantern|Kick-Ass|Logan)\b/;

function filmFamily(imdbGenres, labels) {
  const has = (g) => imdbGenres.includes(g);
  if (has('Animation')) return ['animation', SRC.IMDB];
  if (has('Documentary') || labels.some((l) => /^documentary|concert film/i.test(l))) return ['other', has('Documentary') ? SRC.IMDB : SRC.WIKIDATA];
  const wdMusical = labels.some((l) => /musical/i.test(l));
  if (has('Musical') || (wdMusical && !has('Comedy'))) return ['musical', has('Musical') ? SRC.IMDB : SRC.WIKIDATA];
  const votes = {};
  const vote = (f, w) => { votes[f] = (votes[f] || 0) + w; };
  for (const g of imdbGenres) if (IMDB_VOTE[g]) vote(...IMDB_VOTE[g]);
  // Wikidata stacks near-synonyms for mode genres (drama, melodrama, romance,
  // crime thriller), so those take only their strongest label. Premise genres
  // (science fiction, fantasy, horror) add up: many such labels mean the
  // premise defines the film.
  const best = {};
  for (const l of labels) {
    const f = labelFamily(l);
    const w = /^drama film$/i.test(l) ? 0.5 : f === 'scifi' ? 1.5 : 1;
    if (f === 'scifi' || f === 'horror') best[f] = (best[f] || 0) + w;
    else if (f) best[f] = Math.max(best[f] || 0, w);
    if (COMEDY_COMPOUND.test(l) && !/comedy[- ]drama/i.test(l)) best.comedyCompound = 2;
  }
  for (const [f, w] of Object.entries(best)) vote({ comedyCompound: 'comedy', thriller: 'horror' }[f] || f, w);
  const ranked = Object.entries(votes).sort((a, b) => b[1] - a[1] || TIE_ORDER.indexOf(a[0]) - TIE_ORDER.indexOf(b[0]));
  if (!ranked.length) return [null, SRC.NONE];
  return [ranked[0][0], labels.length ? SRC.WIKIDATA : SRC.IMDB];
}

// ── 5. weekend charts ────────────────────────────────────────────────────────
function weekendCharts() {
  const rows = [];
  for (const f of readdirSync(BOM + 'weekends').filter((f) => f.endsWith('.tsv')).sort()) {
    for (const l of readFileSync(BOM + 'weekends/' + f, 'utf8').split('\n')) {
      if (!l) continue;
      const [key, date, rank, rl, title, gross] = l.split('\t');
      if (date) rows.push({ key, date, rank: +rank, rl, title, gross: +gross || 0 });
    }
  }
  const dates = [...new Set(rows.map((r) => r.date))].sort();
  const idx = new Map(dates.map((d, i) => [d, i]));
  const byRl = new Map();
  for (const r of rows) {
    if (!byRl.has(r.rl)) byRl.set(r.rl, []);
    byRl.get(r.rl).push([idx.get(r.date), r.rank, r.gross]);
  }
  return { dates, byRl };
}

async function build() {
  const thisYear = new Date().getFullYear();
  const films = [];
  for (let y = FIRST; y <= thisYear; y++) {
    if (y < BOM_FROM) {
      const w = await wikiYear(y);
      films.push(...w.rows.map((r) => Object.assign(r, { unit: w.unit })));
      continue;
    }
    const b = bomYear(y);
    films.push(...b.map((r) => Object.assign(r, { unit: 'gross' })));
    // Box Office Mojo is thin before the mid-1980s: add any of Wikipedia's top
    // 10 it lacks, when Wikipedia reports grosses (rentals would not compare).
    if (y < 1986) {
      const w = await wikiYear(y);
      if (w.unit === 'gross') {
        // "The Empire Strikes Back" is BOM's "Star Wars: Episode V - The Empire Strikes Back".
        for (const r of w.rows) if (!b.some((x) => norm(x.title).includes(norm(r.title)))) films.push(Object.assign(r, { unit: 'gross', added: true }));
      }
    }
  }

  const movies = await imdbMovies();
  const match = matcher(movies);
  for (const f of films) {
    f.imdb = match(f.title, f.year, f.year < 1977 ? 2 : 1);
    const m = f.imdb && movies[f.imdb];
    // A re-release (Star Wars Special Edition in 1997) isn't a hit of that year.
    f.rerelease = (!!m && m[2] < f.year - 1) || RERELEASE.test(f.title);
    f.title = f.title.replace(RERELEASE, '').replace(/\s*[†‡]+$/, '').trim();
  }
  // Rank within year by value, dropping re-releases and duplicates of one film.
  const byYear = new Map();
  for (const f of films) {
    if (f.rerelease) continue;
    if (!byYear.has(f.year)) byYear.set(f.year, []);
    const list = byYear.get(f.year);
    if (f.imdb && list.some((x) => x.imdb === f.imdb)) continue;
    list.push(f);
  }
  for (const list of byYear.values()) {
    list.sort((a, b) => (b.value ?? 0) - (a.value ?? 0) || a.rank - b.rank);
    list.forEach((f, k) => { f.yearRank = k + 1; });
  }
  const kept = [...byYear.values()].flat();

  const ids = kept.map((f) => f.imdb).filter(Boolean);
  const genres = await wikidataGenres(ids);
  const crew = await imdbPeople(ids);
  const superhero = new Set(readFileSync(WD + 'superhero.csv', 'utf8').split('\n').slice(1).map((l) => l.split(',')[0]).filter(Boolean));

  for (const f of kept) {
    const m = f.imdb && movies[f.imdb];
    const wd = (f.imdb && genres[f.imdb]) || [];
    const override = fixes.families[`${f.title} (${f.year})`];
    if (override) [f.fam, f.src] = [override, SRC.EDITED];
    else if (f.imdb && superhero.has(f.imdb)) [f.fam, f.src] = ['superhero', SRC.WIKIDATA];
    else {
      [f.fam, f.src] = filmFamily(m ? m[4] : [], wd);
      if (f.fam !== 'animation' && SUPERHERO_TITLE.test(m ? m[0] : f.title) && (m ? m[4] : []).some((g) => /Action|Sci-Fi|Fantasy|Adventure/.test(g))) [f.fam, f.src] = ['superhero', SRC.EDITED];
    }
    f.genres = wd.length ? wd : m ? m[4] : [];
  }

  // People: directors and up to four billed cast.
  const peopleIdx = new Map(), people = [];
  const person = (n) => {
    if (!peopleIdx.has(n)) { peopleIdx.set(n, people.length); people.push(crew.names[n] || n); }
    return peopleIdx.get(n);
  };
  const { dates, byRl } = weekendCharts();
  const out = {
    v: 1,
    built: new Date().toISOString().slice(0, 10),
    fams: FAMILIES,
    weekends: dates,
    units: Object.fromEntries([...byYear].map(([y, list]) => [y, list[0]?.unit])),
    films: kept.map((f) => {
      const m = f.imdb && movies[f.imdb];
      const c = (f.imdb && crew.films[f.imdb]) || { d: [], c: [] };
      const runs = (f.rl && byRl.get(f.rl)) || [];
      runs.sort((a, b) => a[0] - b[0]);
      return [
        m ? m[0] : f.title, f.year, f.yearRank, f.value, f.distributor || '', f.fam == null ? -1 : FAM[f.fam], f.src,
        f.imdb || '', m ? m[5] : null, m ? m[6] : 0, m ? m[3] : null,
        c.d.map(person), c.c.map(person),
        runs.map(([w, r]) => [w, r]), f.opening || (runs[0] ? runs[0][2] : null), f.open || '',
        f.genres.slice(0, 6),
      ];
    }),
    people,
  };
  const women = new Set(crew.actresses || []);
  out.actresses = [...peopleIdx].filter(([n]) => women.has(n)).map(([, i]) => i);
  out.clues = { films: clueMap('films', out.films.map((r) => r[7] || `${r[0]} (${r[1]})`)), people: clueMap('people', out.people) };
  // Best Picture winners (tools/fetch-awards.mjs), as film indexes.
  const awardsFile = here('./cache/awards.json');
  if (existsSync(awardsFile)) {
    const bp = new Set(JSON.parse(readFileSync(awardsFile, 'utf8')).bestPicture);
    out.awards = { bestPicture: kept.flatMap((f, i) => (bp.has(f.imdb) ? [i] : [])) };
    console.log(`Best Picture winners among the films: ${out.awards.bestPicture.length}/${bp.size}`);
  }
  writeFileSync(here('../data/movies.json'), JSON.stringify(out));

  const review = [];
  for (const [y, list] of byYear) for (const f of list.slice(0, 15)) review.push([y, f.yearRank, f.title, f.fam ?? '-', f.src, f.imdb || 'NO-IMDB', f.genres.join(', ')].join('\t'));
  writeFileSync(here('./cache/movies-review.tsv'), review.join('\n'));
  const unmatched = kept.filter((f) => !f.imdb);
  const bySrc = {};
  for (const f of kept) bySrc[f.src] = (bySrc[f.src] || 0) + 1;
  console.log(`${kept.length} films ${FIRST}–${thisYear}, ${unmatched.length} without an IMDb match, ${films.filter((f) => f.rerelease).length} re-releases dropped`);
  console.log('family source', bySrc, `weekends ${dates.length} (${dates[0]} – ${dates[dates.length - 1]})`);
  console.log('unmatched in yearly top 20:', unmatched.filter((f) => f.yearRank <= 20).map((f) => `${f.title} (${f.year})`).join('; '));
}

await build();
