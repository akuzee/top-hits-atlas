// Billboard's official Year-End Hot 100 for every year, from Wikipedia's
// "Billboard Year-End Hot 100 singles of <year>" pages → tools/cache/yearend.json
// as {year: [[rank, title, artist], ...]}.
//   NODE_USE_ENV_PROXY=1 node tools/fetch-yearend.mjs
import { writeFileSync } from 'node:fs';
import { page, tables, col } from './lib/wiki.mjs';

const out = {};
for (let y = 1959; y <= new Date().getFullYear(); y++) {
  const html = await page(`Billboard Year-End Hot 100 singles of ${y}`);
  if (!html) continue;
  const t = tables(html).find((t) => col(t.rows[0], /title/i) >= 0 && col(t.rows[0], /artist/i) >= 0);
  if (!t) continue;
  const [head, ...rows] = t.rows;
  const [cn, ct, ca] = [col(head, /^(no|rank|#)/i), col(head, /title/i), col(head, /artist/i)];
  out[y] = rows.map((r, k) => [+(r[cn] || '').replace(/\D/g, '') || k + 1, r[ct].replace(/^"|"$/g, ''), r[ca]]);
  console.log(y, out[y].length, out[y][0]?.[1]);
}
writeFileSync(new URL('./cache/yearend.json', import.meta.url), JSON.stringify(out));
