# Hit Atlas

Every Billboard Hot 100 hit since August 1958, laid out so you can build a mental map of
pop music: which songs were big, when, in what genre, and how each artist's career moved.

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
| `js/*.js` | One file per view, plus `ui.js` (drawer, search, legend) and `app.js` (boot, routing) |
