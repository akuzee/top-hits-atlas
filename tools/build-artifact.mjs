// Inlines CSS, JS and data into one HTML file for publishing as an artifact.
//   node tools/build-artifact.mjs   → dist/hit-atlas.html (+ dist/preview.html)
// The artifact host wraps the page in its own <!doctype>/<head>/<body>, so the
// main output is a fragment; preview.html adds a wrapper back for local screenshots.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const here = (p) => new URL(p, import.meta.url).pathname;
const read = (p) => readFileSync(here('../' + p), 'utf8');
// "</" inside an inline <script> could close it early.
const safe = (t) => t.replace(/<\//g, '<\\/');

// index.html is a full page, which GitHub Pages serves as is. The artifact host
// adds its own document wrapper, so the artifact keeps only what is inside it.
let html = read('index.html')
  .replace(/^<!doctype html>\s*<html[^>]*>\s*<head>\s*<meta charset[^>]*>\s*<meta name="viewport"[^>]*>\s*/i, '')
  .replace(/<\/head>\s*<body>\s*/i, '')
  .replace(/\s*<\/body>\s*<\/html>\s*$/i, '\n');
if (/<\/?(html|head|body)\b/i.test(html)) throw new Error('index.html wrapper not stripped');
html = html.replace('<link rel="stylesheet" href="css/styles.css">', () => `<style>\n${read('css/styles.css')}</style>`);
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>\n?/g)];
const js = scripts.map((m) => `// ── ${m[1]}\n${read(m[1])}`).join('\n');
// One JSON block per medium that has been built; app.js offers only those.
const data = ['music', 'movies', 'tv'].filter((d) => existsSync(here(`../data/${d}.json`)))
  .map((d) => `<script type="application/json" id="${d}-data">${safe(read(`data/${d}.json`))}</script>\n`).join('');
html = html.replace(scripts.map((m) => m[0]).join(''), () => `${data}<script>\n${js.replace(/<\/script/gi, '<\\/script')}</script>\n`);

mkdirSync(here('../dist'), { recursive: true });
writeFileSync(here('../dist/hit-atlas.html'), html);
const reset = ':root{color-scheme:light}body{margin:0;font:14px system-ui,sans-serif;background:#fbfbfa}img{max-width:100%}[hidden]{display:none!important}';
writeFileSync(here('../dist/preview.html'), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${reset}</style></head><body>\n${html}\n</body></html>`);
const mb = Buffer.byteLength(html) / 1e6;
console.log(`dist/hit-atlas.html ${mb.toFixed(2)}MB`);
if (mb > 16) { console.error('over the 16MB artifact limit'); process.exit(1); }
