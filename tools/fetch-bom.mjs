// Box Office Mojo → tools/cache/bom/. Two kinds of page:
//   year/YYYY/?grossesOption=totalGrosses  every release of a year, ranked by its
//                                          total domestic gross (top 200)
//   weekend/YYYYWnn/                       one weekend's chart, from 1982
// Pages are parsed on arrival and only the rows are kept (one TSV per year).
//   NODE_USE_ENV_PROXY=1 node tools/fetch-bom.mjs [--refresh-current] [--years-only]
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const OUT = new URL('./cache/bom/', import.meta.url).pathname;
mkdirSync(OUT + 'years', { recursive: true });
mkdirSync(OUT + 'weekends', { recursive: true });
const UA = 'Mozilla/5.0 (X11; Linux x86_64) HitAtlas/0.3 (personal data-viz project)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const THIS_YEAR = new Date().getFullYear();
const refreshCurrent = process.argv.includes('--refresh-current');

async function get(path) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch('https://www.boxofficemojo.com' + path, { headers: { 'User-Agent': UA } }).catch(() => null);
    if (res && res.ok) return res.text();
    if (res && res.status === 404) return null;
    // Week 53 exists only in some years; BOM answers the others with an error, not a 404.
    if (res && /W53\/$/.test(path)) return null;
    await sleep(3000 * 2 ** attempt);
  }
  console.log('gave up on', path);
  return null;
}

const strip = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const money = (t) => (t && t !== '-' ? +t.replace(/[$,]/g, '') : '');
function table(html) {
  const head = [...html.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => strip(m[1]));
  const rows = [];
  for (const tr of html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || []) {
    const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
    if (!cells.length) continue;
    const rl = (tr.match(/href="\/release\/(rl\d+)/) || [])[1] || '';
    rows.push({ rl, cell: (name) => strip(cells[head.indexOf(name)] ?? '') });
  }
  return rows;
}

async function years() {
  for (let y = 1977; y <= THIS_YEAR; y++) {
    const file = `${OUT}years/${y}.tsv`;
    if (existsSync(file) && !(refreshCurrent && y >= THIS_YEAR - 1)) continue;
    const html = await get(`/year/${y}/?grossesOption=totalGrosses`);
    const rows = html ? table(html) : [];
    writeFileSync(file, rows.map((r) => [r.cell('Rank'), r.rl, r.cell('Release'), money(r.cell('Gross')), r.cell('Max Th').replace(/,/g, ''), money(r.cell('Opening')), r.cell('Open'), r.cell('Close'), r.cell('Distributor')].join('\t')).join('\n'));
    console.log('year', y, rows.length);
    await sleep(500);
  }
}

// "July 5-7, 1985" / "Dec 31, 1999-Jan 2, 2000" → "1985-07-05"
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function startDate(h4) {
  const m = h4.match(/([A-Za-z]{3})[a-z]*\.? (\d{1,2})/);
  const year = h4.match(/\d{4}/)?.[0];
  return m && year ? `${year}-${String(MONTHS.indexOf(m[1].toLowerCase()) + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}` : '';
}

async function weekends() {
  for (let y = 1982; y <= THIS_YEAR; y++) {
    const file = `${OUT}weekends/${y}.tsv`;
    if (existsSync(file) && !(refreshCurrent && y === THIS_YEAR)) continue;
    const lines = [];
    for (let w = 1; w <= 53; w++) {
      const key = `${y}W${String(w).padStart(2, '0')}`;
      const html = await get(`/weekend/${key}/`);
      if (!html) continue;
      const date = startDate(strip((html.match(/<h4[^>]*>([\s\S]*?)<\/h4>/) || [])[1] || ''));
      for (const r of table(html)) {
        if (!r.rl) continue;
        lines.push([key, date, r.cell('Rank'), r.rl, r.cell('Release'), money(r.cell('Gross')), r.cell('Theaters').replace(/,/g, ''), money(r.cell('Total Gross')), r.cell('Weeks'), r.cell('Distributor')].join('\t'));
      }
      await sleep(400);
    }
    writeFileSync(file, lines.join('\n'));
    console.log('weekends', y, lines.length);
  }
}

await years();
if (!process.argv.includes('--years-only')) await weekends();
