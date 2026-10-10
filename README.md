# Hit Atlas

The hits of every year since the late 1950s, laid out so you can build a mental map of pop
culture: which songs and TV shows were big, when, in what genre, and how careers moved.

- **Music**: every Billboard Hot 100 since August 1958.
- **TV**: Nielsen's top-rated prime-time series for every season since 1950–51.
- **Movies**: planned (see DECISIONS.md §6).

Views:

- **Wall**: each chart year's top songs, as an all-years mosaic plus a readable decade page.
- **No. 1s**: every week's #1 on a calendar (one row per year) or as a list.
- **Genres**: a 100% river of each genre's share of chart points, quarter by quarter.
- **Artists**: career lanes for each decade's leading acts; any artist's week-by-week trajectory.
- **Quiz**: guess the year, which came first, biggest hit of the year.

## Run it

```sh
node tools/fetch.mjs          # raw sources → tools/cache/raw (not in git)
node tools/build.mjs          # → data/music.json
node tools/build-tv.mjs       # tools/tv/seasons/*.tsv → data/tv.json
node tools/test-tv.mjs        # TV checks: every season present, known #1s
node tools/test-model.mjs     # sanity checks, incl. year-end #1 agreement
node tools/serve.mjs          # → http://localhost:8018
node tools/build-artifact.mjs # → dist/hit-atlas.html, one self-contained file
```

No dependencies. To pick up new weekly charts: `node tools/fetch.mjs --force`, then build.

## Layout

| Path | What |
|---|---|
| `tools/fetch.mjs` | Downloads the three sources |
| `tools/build.mjs` | Charts → songs, credits → acts, genres; writes `data/music.json` and `tools/cache/review.tsv` |
| `tools/genres.mjs` | Spotify micro-genre → family rules; #1-dataset style rules |
| `tools/overrides.json` | Name aliases, corrected families, inferred families (see DECISIONS.md) |
| `js/model.js` | Pure model: scoring, chart years, rankings, #1 runs, genre river. Node-testable |
| `js/core.js` | Shared plumbing and the domain contract every medium implements |
| `js/music.js` | Music domain adapter (the reference implementation of the contract) |
| `js/tv.js` | TV domain adapter: shows recur across seasons; lanes are the shows |
| `tools/tv/seasons/` | One Nielsen table per season, transcribed from Wikipedia (checked in) |
| `tools/tv/families.json`, `overrides.json` | Show genre families; show-name aliases |
| `js/wall.js` `calendar.js` `river.js` `lanes.js` `quiz.js` | Views; each reads only `HA.D`, the current domain |
| `js/app.js` | Boot and routing (`#<domain>-<view>`, e.g. `#music-wall`) |
