// Downloads the raw sources into tools/cache/raw/. They are not checked in:
// all.json alone is ~44MB and is refreshed weekly upstream.
//   node tools/fetch.mjs          fetch anything missing
//   node tools/fetch.mjs --force  re-fetch everything (e.g. for this week's chart)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';

const RAW = new URL('./cache/raw/', import.meta.url).pathname;
const SOURCES = {
  // Every weekly Hot 100 since 4 Aug 1958; updated every week by a GitHub Action.
  'all.json': 'https://raw.githubusercontent.com/mhollingshead/billboard-hot-100/main/all.json',
  // Spotify artist genres for each Hot 100 song through mid-2021 (TidyTuesday 2021-09-14).
  'tt_audio.csv': 'https://raw.githubusercontent.com/rfordatascience/tidytuesday/master/data/2021/2021-09-14/audio_features.csv',
  // Chris Dalla Riva's hand-coded dataset of every #1 through Jan 2025 (TidyTuesday 2025-08-26).
  'tt_no1.csv': 'https://raw.githubusercontent.com/rfordatascience/tidytuesday/main/data/2025/2025-08-26/billboard.csv',
};

mkdirSync(RAW, { recursive: true });
const force = process.argv.includes('--force');
for (const [file, url] of Object.entries(SOURCES)) {
  if (existsSync(RAW + file) && !force) { console.log('cached ', file); continue; }
  console.log('fetch  ', file);
  // curl rather than fetch(): it honours HTTPS_PROXY without extra flags.
  execFileSync('curl', ['-sSfL', '--retry', '3', '-o', RAW + file, url], { stdio: 'inherit' });
}
