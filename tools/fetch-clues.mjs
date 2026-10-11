// How often each song, act, film, person and show comes up in general-knowledge
// quizzes, measured on the J! Archive's 544k Jeopardy! clues (1984–2026, via
// github.com/jwolle1/jeopardy_clue_dataset) → tools/cache/clue-counts.json.
// The builds read it to weight quiz questions toward what people most often
// need to know. Run after a first build, since matching uses data/*.json:
//   NODE_USE_ENV_PROXY=1 node tools/fetch-clues.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync, createReadStream } from 'node:fs';
import readline from 'node:readline';

const here = (p) => new URL(p, import.meta.url).pathname;
const SRC = 'https://raw.githubusercontent.com/jwolle1/jeopardy_clue_dataset/main/combined_season1-42.tsv';
const FILE = here('./cache/jeopardy/clues.tsv');
if (!existsSync(FILE)) {
  mkdirSync(here('./cache/jeopardy'), { recursive: true });
  const res = await fetch(SRC);
  if (!res.ok) throw new Error(`${SRC}: ${res.status}`);
  writeFileSync(FILE, Buffer.from(await res.arrayBuffer()));
}

const load = (d) => JSON.parse(readFileSync(here(`../data/${d}.json`), 'utf8'));
const music = load('music'), movies = load('movies'), tv = load('tv');
const norm = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, 'and').replace(/^the\s+/, '').replace(/[^a-z0-9]/g, '');
const bare = (t) => norm(t.replace(/\s*\(.*?\)\s*/g, ' '));
// Responses mark optional parts with parentheses and alternatives with "or":
// "(Bruce) Springsteen", "Beat It" or "Thriller".
const variants = (r) => {
  r = r.replace(/<[^>]+>/g, '').replace(/\\"/g, '"').replace(/^"|"$/g, '').trim();
  const out = new Set([norm(r.replace(/\([^)]*\)/g, ' ')), norm(r.replace(/[()]/g, '')), norm(r.replace(/"/g, ''))]);
  for (const p of r.split(/\s+or\s+|\s*\/\s*/)) out.add(norm(p.replace(/\([^)]*\)/g, ' ')));
  out.delete('');
  return [...out];
};
const quoted = (t) => [...t.matchAll(/"([^"]{2,80})"/g)].map((m) => bare(m[1]));
const ngrams = (t) => {
  const w = t.replace(/<[^>]+>/g, ' ').split(/[^A-Za-z0-9&'.!-]+/).filter(Boolean), out = new Set();
  for (let i = 0; i < w.length; i++) for (let n = 1; n <= 4 && i + n <= w.length; n++) out.add(norm(w.slice(i, i + n).join(' ')));
  return out;
};
const index = (list, key) => {
  const m = new Map();
  for (const x of list) { const k = key(x); if (k.length < 3) continue; if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  return m;
};

// A clue's context decides which medium a name can belong to. Names that are
// often something else (Chicago, Boston, Friends, Titanic) must also sit in a
// category about that medium.
const CTX = {
  music: /\b(songs?|hits?|albums?|band|sang|sings?|singer|recorded|charts?|no\. 1|#1|rock|pop|rap|rapper|group|duo|music|tune|single|lyrics?|grammy|billboard|top 40|crooned|r&b|soul|disco|motown|hip-hop|vocalist|diva)\b/i,
  film: /\b(films?|movies?|directed|director|starred|oscars?|academy award|screen|cinema|role|played|actor|actress|box office|hollywood|sequel|blockbuster|best picture|portrayed)\b/i,
  tv: /\b(tv|television|series|sitcom|network|episodes?|aired|nbc|cbs|abc|fox|emmys?|spin-?off|prime ?time|nielsen)\b/i,
};
const CAT = {
  music: /song|music|singer|band|rock|pop|hit|album|r&b|rap|hip-hop|country|motown|disco|grammy|billboard|duet|tune|lyric|crooner|diva|oldies|top 40|one-hit/i,
  film: /film|movie|cinema|oscar|actor|actress|director|hollywood|screen|best picture/i,
  tv: /\btv\b|television|sitcom|series|emmy|network|prime ?time|\bshows?\b/i,
};
const THEATRE = /musical|broadway|stage|theat/i;

const songs = music.songs.map(([title, credit, acts, , , , segs]) => ({ key: `${title}|${credit}`, acts, peak: Math.min(...segs.flatMap((s) => s.slice(1))) }));
const acts = music.acts.map(([name], i) => ({ i, key: name }));
const films = movies.films.map(([title, year, rank, , , , , imdb, , , , dirs, cast]) => ({ key: imdb || `${title} (${year})`, title, year, rank, dirs, cast }));
const people = movies.people.map((name, i) => ({ i, key: name }));
const shows = tv.shows.map(([title]) => ({ key: title }));

const songBy = index(songs.filter((s) => s.peak <= 40), (s) => bare(s.key.split('|')[0]));
const actBy = index(acts, (a) => norm(a.key));
const filmBy = index(films.filter((f) => f.rank <= 50), (f) => norm(f.title));
const personBy = index(people, (p) => norm(p.key));
const showBy = index(shows, (s) => norm(s.key));

const clues = [];
const rl = readline.createInterface({ input: createReadStream(FILE) });
for await (const line of rl) {
  const [, , , category, comments, clue, response] = line.split('\t');
  if (!clue || category === 'category') continue;
  const ctx = `${category} ${comments} ${clue}`;
  clues.push({ category, clue, resp: variants(response || ''), m: CTX.music.test(ctx), f: CTX.film.test(ctx), t: CTX.tv.test(ctx) });
}

// A name that is mostly a response outside its medium (Chicago the city, not
// the band) needs a medium category. Famous people who also turn up in other
// clues (Elvis in history, Hitchcock in TV) stay unrestricted.
const offMedium = (by, flag) => {
  const on = new Map(), off = new Map();
  for (const c of clues) for (const v of c.resp) if (by.has(v)) (c[flag] ? on : off).set(v, ((c[flag] ? on : off).get(v) || 0) + 1);
  return new Set([...off].filter(([v, k]) => k >= 3 && k > (on.get(v) || 0)).map(([v]) => v));
};
const ambig = { act: offMedium(actBy, 'm'), person: offMedium(personBy, 'f'), show: offMedium(showBy, 't'), film: offMedium(filmBy, 'f') };

const counts = { songs: {}, acts: {}, films: {}, people: {}, shows: {} };
const inc = (o, k) => { o[k] = (o[k] || 0) + 1; };
const yearsIn = (t) => new Set([...t.matchAll(/\b(19[5-9]\d|20[0-2]\d)\b/g)].map((m) => +m[1]));
// A remade title goes to the version whose year the clue names, else the original.
const oneFilm = (cands, years) => cands.find((f) => [...years].some((y) => Math.abs(y - f.year) <= 1)) || cands.reduce((a, b) => (b.year < a.year ? b : a));

for (const c of clues) {
  const grams = c.m || c.f ? ngrams(`${c.category} ${c.clue}`) : null;
  if (c.m) {
    const okAct = (v) => !ambig.act.has(v) || (CAT.music.test(c.category) && !THEATRE.test(c.category));
    const respActs = c.resp.filter(okAct).flatMap((v) => actBy.get(v) || []);
    const named = [...grams].filter(okAct).flatMap((g) => actBy.get(g) || []);
    const here = new Set([...respActs, ...named].map((a) => a.i));
    // A song needs one of its acts in the clue or response: titles alone collide ("Mexico", "Greece").
    const hit = new Set();
    for (const s of [...quoted(c.clue), ...c.resp].flatMap((k) => songBy.get(k) || [])) if (s.acts.some((a) => here.has(a))) hit.add(s.key);
    for (const k of hit) inc(counts.songs, k);
    for (const a of new Set(respActs)) inc(counts.acts, a.key);
  }
  if (c.f) {
    const years = yearsIn(c.clue);
    const okFilm = (v) => !ambig.film.has(v) || CAT.film.test(c.category);
    const fs = new Set();
    for (const k of [...quoted(c.clue), ...c.resp.filter(okFilm)]) { const cands = filmBy.get(k); if (cands) fs.add(oneFilm(cands, years).key); }
    for (const k of fs) inc(counts.films, k);
    const okPerson = (v) => !ambig.person.has(v) || CAT.film.test(c.category);
    for (const p of new Set(c.resp.filter(okPerson).flatMap((v) => personBy.get(v) || []))) inc(counts.people, p.key);
  }
  if (c.t) {
    const okShow = (v) => !ambig.show.has(v) || CAT.tv.test(c.category);
    const ss = new Set([...quoted(c.clue), ...c.resp].filter(okShow).flatMap((k) => showBy.get(k) || []).map((s) => s.key));
    for (const k of ss) inc(counts.shows, k);
  }
}

writeFileSync(here('./cache/clue-counts.json'), JSON.stringify(counts));
const top = (o, n = 12) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k.split('|')[0]} ${v}`).join('; ');
console.log(`${clues.length} clues; ambiguous names held to their medium's categories: ${Object.entries(ambig).map(([k, s]) => `${k} ${s.size}`).join(', ')}`);
for (const [k, o] of Object.entries(counts)) console.log(`${k}: ${Object.keys(o).length} asked about · ${top(o)}`);
