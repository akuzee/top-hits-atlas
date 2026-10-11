// Award winners, for trivia badges → tools/cache/awards.json.
//   Best Picture       Wikidata (films with "award received: Academy Award for Best Picture")
//   Emmy, best drama and comedy series; Grammy Record of the Year
//                      Wikipedia winners tables, where each year lists the winner first
//   NODE_USE_ENV_PROXY=1 node tools/fetch-awards.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { page, tables, col } from './lib/wiki.mjs';

const here = (p) => new URL(p, import.meta.url).pathname;

// First row of each year group is the winner.
async function winners(title, valueCols) {
  const out = {};
  for (const t of tables(await page(title))) {
    const head = t.rows.find((r) => col(r, /^year/i) >= 0);
    if (!head) continue;
    const cy = col(head, /^year/i), cols = valueCols.map((re) => col(head, re));
    if (cols.some((c) => c < 0)) continue;
    for (const r of t.rows) {
      const y = +(r[cy] || '').match(/\b(19|20)\d{2}\b/)?.[0];
      if (!y || y in out) continue;
      const vals = cols.map((c) => (r[c] || '').split(' ⏎ ')[0].replace(/^"\s*|\s*"$/g, '').trim());
      if (vals[0] && !/^(year|program|record)$/i.test(vals[0])) out[y] = vals.length === 1 ? vals[0] : vals;
    }
  }
  return out;
}

const bestPicture = readFileSync(here('./cache/wikidata/best-picture.csv'), 'utf8').split('\n').slice(1)
  .map((l) => l.split(',')[0]).filter((id) => id.startsWith('tt'));
const out = {
  bestPicture: [...new Set(bestPicture)],
  emmyDrama: await winners('Primetime Emmy Award for Outstanding Drama Series', [/program/i]),
  emmyComedy: await winners('Primetime Emmy Award for Outstanding Comedy Series', [/program/i]),
  grammyRecord: await winners('Grammy Award for Record of the Year', [/record/i, /artist/i]),
};
writeFileSync(here('./cache/awards.json'), JSON.stringify(out, null, 1));
for (const [k, v] of Object.entries(out)) console.log(k, Array.isArray(v) ? v.length : Object.keys(v).length, JSON.stringify(Array.isArray(v) ? v.slice(0, 2) : Object.entries(v).slice(-2)));
