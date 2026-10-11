// Nielsen season tables → tools/tv/seasons/<start year>.tsv, parsed directly
// from Wikipedia's "Top-rated United States television programs by season",
// which holds one top-30 table per season from 1950–51 in order.
//   NODE_USE_ENV_PROXY=1 node tools/fetch-tv.mjs [--compare]
// --compare reports how the previous files (transcribed through web search
// while Wikipedia was unreachable) differ from the parsed tables, then overwrites.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { page, tables, col } from './lib/wiki.mjs';

const DIR = new URL('./tv/seasons/', import.meta.url).pathname;
const TITLE = 'Top-rated United States television programs by season';
const SOURCE = 'https://en.wikipedia.org/wiki/' + TITLE.replace(/ /g, '_');
const FIRST = 1950;
// From 2019–20 the page's "Rating" column holds average viewers in millions
// (Sunday Night Football at 20.09 against a top household rating of 10.9 the
// season before), so those seasons are labelled as viewers.
const VIEWERS_FROM = 2019;

const norm = (s) => s.toLowerCase().replace(/^the /, '').replace(/[^a-z0-9]/g, '');
const html = await page(TITLE, { refresh: process.argv.includes('--refresh') });
const all = tables(html).filter((t) => col(t.rows[0], /^rank/i) >= 0 && col(t.rows[0], /program/i) >= 0);
let same = 0, total = 0, changed = [];
all.forEach((t, k) => {
  const y = FIRST + k;
  const [head, ...rows] = t.rows;
  const [cr, cp, cn, cv] = [col(head, /^rank/i), col(head, /program/i), col(head, /network/i), col(head, /rating|viewers/i)];
  const parsed = rows.map((r) => [r[cr].replace(/[^\d]/g, ''), r[cp], r[cn] ?? '', (r[cv] ?? '').replace(/[^\d.]/g, '')]).filter((r) => r[0] && r[1]);
  const file = `${DIR}${y}.tsv`;
  if (process.argv.includes('--compare') && existsSync(file)) {
    const old = readFileSync(file, 'utf8').trim().split('\n').filter((l) => !l.startsWith('#')).map((l) => l.split('\t'));
    const key = (r) => `${+r[0]}|${norm(r[1])}|${(+r[3]).toFixed(1)}`;
    const want = new Set(parsed.map(key));
    for (const r of old) { total++; if (want.has(key(r))) same++; else changed.push(`${y}: ${r.join(' | ')}`); }
  }
  const season = `${y}-${y === 1999 ? '2000' : String(y + 1).slice(-2)}`;
  const unit = y >= VIEWERS_FROM ? 'viewers_m' : 'rating';
  writeFileSync(file, [`# season=${season} unit=${unit} source=${SOURCE} complete=yes`, ...parsed.map((r) => r.join('\t'))].join('\n') + '\n');
});
console.log(`wrote ${all.length} seasons, ${FIRST}–${String(FIRST + all.length).slice(-2)}`);
if (total) {
  console.log(`transcribed rows matching the parsed tables exactly (rank, program, value): ${same}/${total} (${((same / total) * 100).toFixed(1)}%)`);
  console.log(changed.slice(0, 40).join('\n'));
}
