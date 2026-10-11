// Song-level genres from Wikidata for every top-40 hit → tools/cache/wikidata/song-genres.json
// as {"title|lead act": [genre, ...]}. A Wikidata item counts only when its
// performer matches one of the song's credited acts, since titles repeat.
//   NODE_USE_ENV_PROXY=1 node tools/fetch-songgenres.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const here = (p) => new URL(p, import.meta.url).pathname;
const OUT = here('./cache/wikidata/song-genres.json');
const raw = JSON.parse(readFileSync(here('../data/music.json'), 'utf8'));
const cache = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
const norm = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, 'and').replace(/^the\s+/, '').replace(/[^a-z0-9]/g, '');

// Billboard capitalises every word; Wikipedia's titles lowercase short
// articles, conjunctions and prepositions except at either end.
const SMALL = new Set('a an the and but or nor for so yet as at by in of off on per to up via with from into onto over upon'.split(' '));
const wpCase = (t) => t.split(' ').map((w, i, a) => (i && i < a.length - 1 && SMALL.has(w.toLowerCase()) ? w.toLowerCase() : w)).join(' ');
const lit = (t) => `"${t.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"@en`;

const songs = raw.songs.map(([title, credit, acts, , , , segs]) => ({
  title, acts: acts.map((a) => raw.acts[a][0]),
  peak: Math.min(...segs.flatMap((s) => s.slice(1))),
})).filter((s) => s.peak <= 40);
const key = (s) => `${s.title}|${s.acts[0]}`;
const todo = songs.filter((s) => !(key(s) in cache));
console.log(`${songs.length} top-40 songs, ${todo.length} to look up`);

for (let i = 0; i < todo.length; i += 60) {
  const batch = todo.slice(i, i + 60);
  const labels = [...new Set(batch.flatMap((s) => [s.title, wpCase(s.title)]))];
  const q = `SELECT ?t ?perfLabel ?genreLabel WHERE { VALUES ?t { ${labels.map(lit).join(' ')} } ?song rdfs:label ?t ; wdt:P175 ?perf ; wdt:P136 ?genre . SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }`;
  let json = null;
  for (let attempt = 0; attempt < 5 && !json; attempt++) {
    const res = await fetch('https://query.wikidata.org/sparql', {
      method: 'POST',
      headers: { 'User-Agent': 'HitAtlas/0.3 (https://github.com/akuzee)', Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'query=' + encodeURIComponent(q),
    }).catch(() => null);
    if (res?.ok) json = await res.json(); else await new Promise((r) => setTimeout(r, 4000 * 2 ** attempt));
  }
  if (!json) { console.log('batch failed at', i); continue; }
  const found = new Map();
  for (const b of json.results.bindings) {
    const k = norm(b.t.value) + '|' + norm(b.perfLabel.value);
    if (!found.has(k)) found.set(k, new Set());
    found.get(k).add(b.genreLabel.value);
  }
  for (const s of batch) {
    const g = new Set();
    for (const a of s.acts) for (const v of found.get(norm(s.title) + '|' + norm(a)) || []) g.add(v);
    cache[key(s)] = [...g];
  }
  if ((i / 60) % 10 === 0) { writeFileSync(OUT, JSON.stringify(cache)); console.log(i, Object.values(cache).filter((g) => g.length).length, 'with genres'); }
  await new Promise((r) => setTimeout(r, 1000));
}
writeFileSync(OUT, JSON.stringify(cache));
const hits = songs.filter((s) => cache[key(s)]?.length).length;
console.log(`song-level genres for ${hits}/${songs.length} top-40 songs`);
