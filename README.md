# Hit Atlas

Live: https://akuzee.github.io/top-hits-atlas/ (GitHub Pages; `.github/workflows/pages.yml` runs the checks and deploys on every push to `main`).

The hits of every year since the late 1950s, laid out so you can build a mental map of pop
culture: which songs and TV shows were big, when, in what genre, and how careers moved.

- **Music**: every Billboard Hot 100 since August 1958, plus Billboard's official year-end lists.
- **Movies**: every year's biggest films at the US box office since 1958, with weekend charts from 1982.
- **TV**: Nielsen's top-rated prime-time series for every season since 1950–51, plus Netflix's US Top 10 since 2021.

Views:

- **Wall**: each chart year's top songs, as an all-years mosaic plus a readable decade page.
- **No. 1s**: every week's #1 on a calendar (one row per year) or as a list.
- **Genres**: a 100% river of each genre's share of chart points, quarter by quarter.
- **Artists**: career lanes for each decade's leading acts; any artist's week-by-week trajectory.
- **Quiz**: a header button opens ten questions on the current medium (pick the years,
  the difficulty and a genre), weighted toward what most often comes up in
  general-knowledge quizzes. See DECISIONS.md §9.

A ★ marks award winners: the Grammy for Record of the Year, the Oscar for Best Picture,
and the Emmy for best drama or comedy series.

## Run it

```sh
export NODE_USE_ENV_PROXY=1    # only behind an HTTPS proxy
node tools/fetch-awards.mjs   # Best Picture, Emmy series, Record of the Year → star badges
node tools/fetch-clues.mjs    # quiz weights from 544k Jeopardy! clues (after a first build; then rebuild)

# music
node tools/fetch.mjs          # weekly charts, Spotify genres, #1 dataset → tools/cache/raw
node tools/fetch-yearend.mjs  # Billboard year-end lists (Wikipedia)
node tools/fetch-songgenres.mjs  # song-level genres (Wikidata), ~1 hour
node tools/build.mjs          # → data/music.json

# movies
node tools/fetch-bom.mjs      # Box Office Mojo years + weekend charts, ~1 hour
#   + IMDb datasets in tools/cache/imdb/ (title.basics, title.ratings, title.crew,
#     title.principals, name.basics from datasets.imdbws.com)
node tools/build-movies.mjs   # → data/movies.json (+ Wikipedia years, Wikidata genres)

# tv
node tools/fetch-tv.mjs       # Nielsen tables (Wikipedia) → tools/tv/seasons/
node tools/fetch-tvmaze.mjs   # premiere/end dates, IMDb ids
#   + Netflix Top 10: tools/cache/netflix/all-weeks-countries.tsv from netflix.com/tudum/top10
node tools/build-tv.mjs       # tools/tv/seasons/*.tsv → data/tv.json
node tools/test-tv.mjs        # TV checks: every season present, known #1s
node tools/test-model.mjs     # sanity checks, incl. year-end #1 agreement
node tools/test-quiz.mjs      # generates ~4,000 quiz questions and checks each
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
| `js/movies.js` | Movies domain adapter: films by release year; lanes are directors and stars |
| `js/tv.js` | TV domain adapter: shows recur across seasons; lanes are the shows |
| `tools/lib/wiki.mjs` `imdb.mjs` | Wikipedia table parser (cached); IMDb bulk-file slices |
| `tools/tv/seasons/` | One Nielsen table per season, transcribed from Wikipedia (checked in) |
| `tools/tv/families.json`, `overrides.json` | Show genre families; show-name aliases |
| `js/wall.js` `calendar.js` `river.js` `lanes.js` | Views; each reads only `HA.D`, the current domain |
| `js/quiz.js` `questions.js` | The quiz drawer, and its question kinds per domain |
| `js/app.js` | Boot and routing (`#<domain>-<view>`, e.g. `#music-wall`) |
