// Sanity checks on the built model: runs it under node against data/music.json.
//   node tools/test-model.mjs
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const HA = createRequire(import.meta.url)('../js/model.js');
const m = HA.buildModel(JSON.parse(readFileSync(new URL('../data/music.json', import.meta.url))));
let fail = 0;
const check = (ok, msg) => { if (!ok) { fail++; console.log('FAIL', msg); } };

// Billboard's official year-end #1s. The year ranking is chart points, not
// sales/airplay, so it can't match every year; it should match most, and land
// the official #1 in its top five almost always.
const YE = JSON.parse(readFileSync(new URL('./year-end-number-ones.json', import.meta.url)));
const norm = (s) => s.toLowerCase().replace(/^the /, '').replace(/[^a-z0-9]/g, '');
let top1 = 0, top5 = 0;
for (const [y, t] of Object.entries(YE)) {
  const list = m.byYear.get(+y) || [];
  const k = list.findIndex((s) => norm(s.title).startsWith(norm(t)));
  if (k === 0) top1++;
  if (k >= 0 && k < 5) top5++;
  else console.log(`  ${y}: "${t}" ranked ${k < 0 ? 'nowhere' : k + 1}; #1 is "${list[0]?.title}"`);
}
const n = Object.keys(YE).length;
console.log(`year-end #1 reproduced: ${top1}/${n} at #1, ${top5}/${n} in top 5`);
check(top1 / n >= 0.6 && top5 / n >= 0.85, 'year ranking drifted from the official lists');
check(m.no1Runs.length > 1100, 'number-one runs: ' + m.no1Runs.length);
check(m.songs.every((s) => s.year >= m.firstYear && s.year <= m.lastYear), 'every song has a home year');
const known = m.songs.filter((s) => s.fam >= 0).length / m.songs.length;
console.log(`songs ${m.songs.length}, acts ${m.acts.length}, #1 runs ${m.no1Runs.length}, genre coverage ${(known * 100).toFixed(1)}%`);
for (const y of [1964, 1985, 2003, 2025]) console.log(y, m.byYear.get(y).slice(0, 5).map((s) => `${s.title} (${s.credit})`).join(' | '));
process.exit(fail ? 1 : 0);
