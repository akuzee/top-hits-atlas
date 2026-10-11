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

## 5. Media as domains

Music, movies and TV share every view. A domain adapter (`js/music.js` is the reference)
turns its data into items, periods and ranked entries per period; the views never touch
songs or films directly. Each domain maps its own genre families onto the same eight colour
slots, so the river's colourblind-safe stack order holds in every medium. Drama is slot 1
(blue) and Comedy slot 6 (yellow) in both film and TV so the two read alike.

## 6. Movies and TV: planned sources and families (pending network access)

Not yet built: the build environment blocks every host except GitHub and package registries,
and no GitHub mirror of these datasets exists. Needed hosts, in priority order:
`en.wikipedia.org`, `datasets.imdbws.com`, `query.wikidata.org`, `www.boxofficemojo.com`,
`www.the-numbers.com`, optionally `api.tvmaze.com`.

**Movies.** A hit is US/Canada box office. Items are films, the period is release year, rank
is total domestic gross within the release year (Box Office Mojo from 1977, Wikipedia's
per-year top lists before). No. 1s are weekend #1 runs (Wikipedia, 1982 on). Lanes are the
directors and stars who defined each decade. Families, by slot: Drama, Action & Adventure
(incl. westerns, war, spy), Sci-Fi & Fantasy, Superhero, Animation, Comedy, Musical, Horror &
Thriller. Superhero is its own family because its rise after 2008 is the biggest box-office
story of the period; IMDb has no such genre, so it comes from Wikidata or a franchise list.

**TV.** A hit is a Nielsen season ranking (Wikipedia's top-30 tables, 1950–51 on). Items
are shows, which recur across seasons, so a show's season-by-season rank is its chart run
and the lanes are the shows themselves. Families, by slot: Drama, Crime & Legal, Variety &
Talk, Western, News & Docs, Comedy, Reality & Games, Sports. Broadcast rankings miss the
streaming era, so 2020 on needs Nielsen's streaming lists as a second source.

## 7. TV: how the data was actually gathered

The build container still can't reach Wikipedia, and the fetch tool runs inside the same
container, so the Nielsen season tables were transcribed through the server-side web-search
tool: one or more searches per season against that season's Wikipedia page, rows recorded
only as the results stated them, never from memory. Each file in `tools/tv/seasons/` names
its source page and whether it is complete. `build-tv.mjs` rejects rank or rating order
violations; `test-tv.mjs` checks the #1 of 21 well-known seasons.

Known gaps (search budget ran out, 200 searches per turn): 2005–06 and 2014–15 partial,
2019–20 to 2022–23 partial, 2023–24 onward and the streaming top-10s not collected. Rerun
the collection for those files and rebuild; nothing else changes.

Wikipedia lists a show once per night when it aired twice weekly ("American Idol —
Tuesday"); the build folds those into one show with two slots that season. Network movie
nights are folded by network and night, since their names drift ("NBC Saturday Night at the
Movies" / "NBC Saturday Movie").

Show genres were classified from general knowledge (labelled as such in the app): no genre
source was reachable, and these are well-known prime-time series.

## 8. Sources once the network opened (October 2026)

**TV.** The season tables are now parsed directly from Wikipedia's by-season page
(`fetch-tv.mjs`), all 75 seasons complete. Checked against the earlier search
transcriptions: 2,167 of 2,169 rows matched exactly. From 2019–20 the page's "Rating"
column holds average viewers in millions, so those seasons are labelled as viewers.
TVmaze adds premiere/end dates and IMDb ids and checks the genre calls (agrees on ~90%;
where it differs it is usually TVmaze's coarse tagging, e.g. spy shows as Drama, so the
call stands). Netflix's weekly US Top 10 (July 2021 on) is rolled up per year with the
same 100/√rank points as the music charts, shown under the 2020s; Nielsen's own
streaming rankings aren't published in a parseable form.

**Movies.** Box Office Mojo's release-year view ranks every film by total domestic
gross (top 200 a year); before 1977 its coverage is thin, so 1958–1976 use Wikipedia's
"<year> in film" top 10s, which are in rentals. Re-releases are dropped. IMDb ids come
from title + year matching (with a subtitle index for franchise films). Genre is a
weighted vote between Wikidata's full genre list per film and IMDb's genres (IMDb's bulk
file keeps three genres alphabetically and drops "Musical" from The Sound of Music).
Two rules came out of reading every year's top 10: Wikidata stacks near-synonyms for
mode genres (drama, melodrama, romance), so those count once, while premise genres
(sci-fi, fantasy, horror) add up, which keeps Star Wars in Sci-Fi rather than Action;
and "thriller" is a modifier worth one vote, not a premise, or every cop film becomes
Horror & Thriller. Compound comedy labels ("action comedy") still win for Comedy, and
superhero films are their own family. What the rules still got wrong in the top 10s
(about 75 films: Top Gun, Funny Girl, the later Hunger Games) is in
`tools/movies/overrides.json`, keyed by the source title and year.

**Wikipedia access.** api.php and the REST API rate-limit shared cloud IPs; the plain
/wiki/ article HTML is served from cache and works, so `lib/wiki.mjs` reads that.

**Music.** Billboard's official year-end Hot 100 (Wikipedia, 1959 on) is matched to
songs and offered as a second ranking on the Wall (6,408 of 6,701 entries matched).
Song-level genres from Wikidata were first allowed to override the artist's Spotify
family outright; a hand check of 60 changed #1s came out even (about as many made worse
as better), because Wikidata puts "pop music" on almost everything. So a song-level
genre now fills songs with no family and otherwise only chooses among the families the
lead act's own tags support. The #1 dataset's decisive styles still come first.

**Awards.** `fetch-awards.mjs` collects Best Picture winners (Wikidata, by IMDb id),
Emmy best drama/comedy series and the Grammy for Record of the Year (Wikipedia winners
tables). They are matched in each build and shown as a ★ on tiles, tooltips and panels.
Misses are real: CODA never had a box-office run, and two Record of the Year winners
(U2's "Walk On", Plant & Krauss's "Please Read the Letter") never made the Hot 100.
