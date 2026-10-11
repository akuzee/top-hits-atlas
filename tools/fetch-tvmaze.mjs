// TVmaze metadata for every ranked show → tools/cache/tvmaze.json: premiere and
// end dates, type (Scripted, Reality, Variety…), genres and the IMDb id.
// The search can return a namesake (a 2010s reboot for a 1960s show), so the
// candidate must have premiered no later than the show's first ranked season.
//   NODE_USE_ENV_PROXY=1 node tools/fetch-tvmaze.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const here = (p) => new URL(p, import.meta.url).pathname;
const OUT = here('./cache/tvmaze.json');
const tv = JSON.parse(readFileSync(here('../data/tv.json'), 'utf8'));
const cache = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => s.toLowerCase().replace(/^the /, '').replace(/[^a-z0-9]/g, '');

for (const [title, nets, , , runs] of tv.shows) {
  if (title in cache) continue;
  const first = tv.seasons[runs[0][0]].y;
  if (/night movie$|movie of the week/i.test(title)) { cache[title] = null; continue; }
  const q = title.replace(/\s*\(.*?\)\s*$/, '');
  let hits = [];
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(q)}`).catch(() => null);
    if (res?.ok) { hits = await res.json(); break; }
    await sleep(2000 * 2 ** attempt);
  }
  const ok = hits.map((h) => h.show).filter((s) => {
    const y = +(s.premiered || '9999').slice(0, 4);
    return y <= first + 1 && y >= first - 25;
  });
  const netMatch = (s) => nets.split(', ').some((n) => (s.network?.name || '').toUpperCase().includes(n.toUpperCase()));
  const best = ok.find((s) => norm(s.name) === norm(q) && netMatch(s)) || ok.find((s) => norm(s.name) === norm(q)) || ok.find(netMatch) || null;
  cache[title] = best && {
    id: best.id, name: best.name, type: best.type, genres: best.genres, premiered: best.premiered, ended: best.ended,
    network: best.network?.name || best.webChannel?.name || '', imdb: best.externals?.imdb || '',
  };
  await sleep(550); // TVmaze allows 20 calls per 10 seconds
}
writeFileSync(OUT, JSON.stringify(cache, null, 1));
const found = Object.values(cache).filter(Boolean).length;
console.log(`tvmaze: ${found}/${Object.keys(cache).length} shows matched`);
