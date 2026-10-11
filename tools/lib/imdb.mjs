// IMDb's bulk datasets (tools/cache/imdb/*.tsv.gz, from datasets.imdbws.com):
// streamed once and reduced to the small slices the build needs, cached as JSON.
import { createReadStream, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';

const DIR = new URL('../cache/imdb/', import.meta.url).pathname;

async function* rows(file) {
  const rl = createInterface({ input: createReadStream(DIR + file).pipe(createGunzip()), crlfDelay: Infinity });
  let head = null;
  for await (const line of rl) {
    const cells = line.split('\t');
    if (!head) { head = cells; continue; }
    yield cells;
  }
}
const nul = (v) => (v === '\\N' ? null : v);

// Every feature film since 1950 with its votes: {tconst: [title, original, year, runtime, genres, rating, votes]}.
export async function movies() {
  const cache = DIR + 'movies.json';
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, 'utf8'));
  const ratings = new Map();
  for await (const [t, avg, votes] of rows('title.ratings.tsv.gz')) ratings.set(t, [+avg, +votes]);
  const out = {};
  for await (const [t, type, title, original, , year, , runtime, genres] of rows('title.basics.tsv.gz')) {
    if (type !== 'movie' || !(+year >= 1945)) continue;
    const [avg, votes] = ratings.get(t) || [null, 0];
    out[t] = [title, original, +year, nul(runtime) ? +runtime : null, nul(genres) ? genres.split(',') : [], avg, votes];
  }
  writeFileSync(cache, JSON.stringify(out));
  return out;
}

// Directors and the first-billed cast for a set of films, with names:
// {films: {tconst: {d: [nconst], c: [nconst]}}, names: {nconst: name}, actresses: [nconst]}.
// Actresses are recorded so quiz questions can offer like-for-like choices.
export async function people(tconsts, castPerFilm = 4) {
  const cache = DIR + 'people.json';
  const want = new Set(tconsts);
  if (existsSync(cache)) {
    const c = JSON.parse(readFileSync(cache, 'utf8'));
    if (c.actresses && [...want].every((t) => t in c.films)) return c;
  }
  const films = Object.fromEntries([...want].map((t) => [t, { d: [], c: [] }]));
  for await (const [t, directors] of rows('title.crew.tsv.gz')) if (want.has(t) && nul(directors)) films[t].d = directors.split(',');
  const women = new Set();
  for await (const [t, ordering, n, category] of rows('title.principals.tsv.gz')) {
    if (!want.has(t) || (category !== 'actor' && category !== 'actress' && category !== 'self')) continue;
    if (category === 'actress') women.add(n);
    if (films[t].c.length < castPerFilm) films[t].c.push([+ordering, n]);
  }
  for (const f of Object.values(films)) f.c = f.c.sort((a, b) => a[0] - b[0]).map(([, n]) => n);
  const needed = new Set(Object.values(films).flatMap((f) => [...f.d, ...f.c]));
  const names = {};
  for await (const [n, name] of rows('name.basics.tsv.gz')) if (needed.has(n)) names[n] = name;
  const out = { films, names, actresses: [...women].filter((n) => needed.has(n)) };
  writeFileSync(cache, JSON.stringify(out));
  return out;
}
