// Wikipedia pages as tables. Fetches the ordinary article HTML (/wiki/Title,
// served from Wikipedia's cache; both APIs rate-limit shared cloud IPs), caches it under
// tools/cache/wiki/, and expands rowspan/colspan so a tie that Wikipedia draws
// as one merged rank cell comes out as one row per show.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const CACHE = new URL('../cache/wiki/', import.meta.url).pathname;
const UA = 'HitAtlas/0.3 (personal data-viz project; https://github.com/akuzee) node';
mkdirSync(CACHE, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let last = 0;
export async function page(title, { refresh = false } = {}) {
  const file = CACHE + encodeURIComponent(title.replace(/ /g, '_')) + '.html';
  if (!refresh && existsSync(file)) return readFileSync(file, 'utf8');
  for (let attempt = 0; attempt < 6; attempt++) {
    // One request a second at most, as Wikimedia asks of unauthenticated clients.
    const wait = last + 1000 - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    const res = await fetch(`https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`, { headers: { 'User-Agent': UA } });
    if (res.status === 404) return null;
    if (res.status === 429 || res.status >= 500) { await sleep(2000 * 2 ** attempt); continue; }
    if (!res.ok) throw new Error(`${title}: HTTP ${res.status}`);
    const html = await res.text();
    writeFileSync(file, html);
    return html;
  }
  throw new Error(`${title}: gave up after retries`);
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…' };
export const text = (html) => html
  .replace(/<sup[^>]*class="[^"]*reference[^"]*"[^>]*>[\s\S]*?<\/sup>/g, '')
  .replace(/<style[\s\S]*?<\/style>/g, '')
  // A cell can list several items (two films tied for one rank); keep them apart with " ⏎ ".
  .replace(/<br\b[^>]*>|<\/li>|<\/p>/g, ' ⏎ ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e] ?? m))
  .replace(/\s+/g, ' ')
  .replace(/^(?:\s*⏎\s*)+|(?:\s*⏎\s*)+$/g, '')
  .replace(/(?:\s*⏎\s*)+/g, ' ⏎ ')
  .replace(/\s+([,.;:!?)])/g, '$1')
  .trim();

// All "wikitable" tables on the page: {caption, rows: [[cell, ...]], links: [[href|null]]}.
// Header rows are kept as rows; callers pick columns by header text.
export function tables(html) {
  const out = [];
  const re = /<table[^>]*class="[^"]*wikitable[^"]*"[^>]*>([\s\S]*?)<\/table>/g;
  let m;
  while ((m = re.exec(html))) {
    const body = m[1];
    const caption = text((body.match(/<caption[^>]*>([\s\S]*?)<\/caption>/) || [])[1] || '');
    const grid = [], links = [], pending = [];
    for (const tr of body.match(/<tr[\s\S]*?<\/tr>/g) || []) {
      const row = [], lrow = [];
      let col = 0;
      const place = () => { while (pending[col]?.left > 0) { row[col] = pending[col].text; lrow[col] = pending[col].link; pending[col].left--; col++; } };
      for (const c of tr.match(/<t[hd][^>]*>[\s\S]*?<\/t[hd]>/g) || []) {
        place();
        const attrs = c.slice(0, c.indexOf('>'));
        const inner = c.slice(c.indexOf('>') + 1, c.lastIndexOf('</'));
        const rs = +(attrs.match(/rowspan="?(\d+)/) || [])[1] || 1;
        const cs = +(attrs.match(/colspan="?(\d+)/) || [])[1] || 1;
        const t = text(inner);
        const link = (inner.match(/href="(?:\.\/|\/wiki\/)([^"#]+)"/) || [])[1] || null;
        for (let k = 0; k < cs; k++) {
          row[col] = t; lrow[col] = link;
          if (rs > 1) pending[col] = { text: t, link, left: rs - 1 };
          col++;
        }
      }
      place();
      if (row.length) { grid.push(row); links.push(lrow); }
    }
    out.push({ caption, rows: grid, links });
  }
  return out;
}

// Index of the first column whose header matches re, or -1.
export const col = (header, re) => header.findIndex((h) => re.test(h || ''));
