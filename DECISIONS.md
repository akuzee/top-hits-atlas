# Decisions

Why things are the way they are. Read before changing the scoring, the genre families or
the data sources.

## 1. Scoring: 100 / √rank, Billboard chart years

A week at rank r earns 100/√r points. A song's year is the chart year (December–November,
as Billboard's year-end lists run) in which it earned the most; songs are ranked within a
year by those points.

Calibrated against the official year-end #1 for 1959–2024 (`tools/year-end-number-ones.json`):

| Scheme | Official #1 at #1 | in top 5 |
|---|---|---|
| Σ(101 − r), whole run | 20 / 66 | 43 |
| Σ(101 − r)², calendar year | 25 | 52 |
| **100/√r, Dec–Nov** | **46** | **57** |

Linear scoring lets a song that idled at #30 for a year beat a chart-topper. Remaining misses
are years where Billboard's sales/airplay weighting differs (e.g. "Candle in the Wind 1997",
"Look Away" in 1989). `test-model.mjs` fails if agreement drops below 60% / 85%.

## 2. Genre families: eight, plus Other

Colour carries genre, and a categorical palette stops being distinguishable past eight hues,
so families are broad: Soft & Easy (the Easy Listening → Adult Contemporary lineage: standards,
soft rock, folk), Rock (incl. new wave, alternative), R&B / Soul, Country, Dance, Hip-Hop, Pop,
Latin & World (incl. reggae, afrobeats). Everything else is Other (grey).

The family order is the river's stack order. It was chosen by enumerating orders of the
palette and keeping only those where every adjacent pair stays separable under protan/deutan
colour-blindness simulation in both themes. Reordering means re-running that check.

## 3. Genre sources, in priority order

1. **Edited** (`overrides.json → families`): Spotify matched the wrong artist (Prince →
   bachata, Simon & Garfunkel → classical performance) or its tags point away from the hits.
2. **Song-level**, #1s only: Chris Dalla Riva's style when it defines the sound (Disco, Hip
   Hop, Soul…). Vague styles ("Pop Rock", "Vocal") defer to the artist, or every Madonna
   ballad turns red.
3. **Spotify artist genres** (2021 snapshot), voted into a family by `genres.mjs`.
4. **Inferred** (`overrides.json → inferred`): acts with no source data, classified from
   general knowledge, null when unsure. Mostly post-2021 acts and early-'60s one-hit acts.

The app labels every song with its source. Wikidata/MusicBrainz would give song-level genres
for all eras but were unreachable from the build environment; that is the obvious upgrade.

Spotify tags that clash with an act's era (modern tags on an act whose chart career ended
before 1995, or vintage ones on an act that started after 2005) are rejected automatically.

## 4. Credits → acts

Featured guests always split off. "&", "and", "x", ",", "with" split only when every piece
is an act with its own chart credit elsewhere, so "Earth, Wind & Fire" stays whole while
"Lil Nas X & Jack Harlow" splits. A trailing "& The Something" with no chart life of its own
rides on its leader ("Bob Seger & The Silver Bullet Band" → Bob Seger). `unsplit` protects
real groups whose name contains a solo act's ("Derek & The Dominos" vs the singer Derek).

A song is (title, lead act), so a remix that adds a guest mid-run stays one song.
