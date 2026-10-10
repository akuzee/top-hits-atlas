// Sanity checks on data/tv.json: every season present, ranks sane, and the #1
// show of well-known seasons matches (a transcription error at the top of a
// table would show up here).
//   node tools/test-tv.mjs
import { readFileSync } from 'node:fs';

const tv = JSON.parse(readFileSync(new URL('../data/tv.json', import.meta.url)));
let fail = 0;
const check = (ok, msg) => { if (!ok) { fail++; console.log('FAIL', msg); } };
const norm = (s) => s.toLowerCase().replace(/^the /, '').replace(/[^a-z0-9]/g, '');

const years = tv.seasons.map((s) => s.y);
for (let y = years[0]; y <= years[years.length - 1]; y++) check(years.includes(y), `season ${y} missing`);

const top = new Map();
tv.shows.forEach(([title, , , , runs]) => runs.forEach(([si, rank]) => {
  if (rank !== 1) return;
  const y = tv.seasons[si].y;
  top.set(y, [...(top.get(y) || []), title]);
}));
const KNOWN = {
  1952: 'I Love Lucy', 1955: 'The $64,000 Question', 1957: 'Gunsmoke', 1961: 'Wagon Train', 1962: 'The Beverly Hillbillies',
  1964: 'Bonanza', 1968: "Rowan & Martin's Laugh-In", 1971: 'All in the Family', 1976: 'Happy Days', 1977: 'Laverne & Shirley',
  1980: 'Dallas', 1984: 'Dynasty', 1985: 'The Cosby Show', 1990: 'Cheers', 1994: 'Seinfeld', 1995: 'ER', 1997: 'Seinfeld',
  1999: 'Who Wants to Be a Millionaire', 2001: 'Friends', 2002: 'CSI', 2005: 'American Idol',
};
for (const [y, t] of Object.entries(KNOWN)) {
  const got = top.get(+y) || [];
  check(got.some((g) => norm(g).startsWith(norm(t)) || norm(t).startsWith(norm(g))), `${y}–${String(+y + 1).slice(-2)} #1: expected ${t}, got ${got.join(' / ') || 'nothing'}`);
}
const thin = tv.seasons.filter((s) => s.n < 20).map((s) => `${s.y} (${s.n})`);
if (thin.length) console.log('short seasons:', thin.join(', '));
const famless = tv.shows.filter((s) => s[2] < 0).length;
console.log(`${tv.seasons.length} seasons, ${tv.shows.length} shows, ${famless} without a family, ${KNOWN && Object.keys(KNOWN).length} #1 checks`);
process.exit(fail ? 1 : 0);
