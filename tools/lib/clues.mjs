// Quiz-archive counts (tools/fetch-clues.mjs) as a sparse {index: count} map
// over a build's emitted rows, matched on the same keys fetch-clues uses.
import { readFileSync, existsSync } from 'node:fs';

const FILE = new URL('../cache/clue-counts.json', import.meta.url).pathname;
const counts = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : null;

export function clueMap(kind, keys) {
  if (!counts) return {};
  const out = {};
  keys.forEach((k, i) => { if (counts[kind][k]) out[i] = counts[kind][k]; });
  return out;
}
