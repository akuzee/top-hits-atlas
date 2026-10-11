// Builds data/music.json from the raw sources (run tools/fetch.mjs first).
//   node tools/build.mjs
// Also writes tools/cache/review.tsv: the top acts with their genre evidence,
// which is what you read when deciding on entries for overrides.json.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { FAMILIES, FAM_INDEX, familyOf, familyScores, clearFamily, cdrFamily } from './genres.mjs';
import { clueMap } from './lib/clues.mjs';

const here = (p) => new URL(p, import.meta.url).pathname;
const RAW = here('./cache/raw/');
const fixes = JSON.parse(readFileSync(here('./overrides.json'), 'utf8'));

// Where an act's family came from. The app shows anything other than SPOTIFY
// or SONG with a marker, so inferred data never passes as sourced data.
export const SRC = { NONE: 0, SPOTIFY: 1, SONG: 2, CORRECTED: 3, INFERRED: 4, SONG_WD: 5 };

// ── text normalisation ────────────────────────────────────────────────────────
const fold = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
const normTitle = (s) => fold(s).replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
const normName = (s) => fold(s).replace(/&/g, 'and').replace(/^the\s+/, '').replace(/[^a-z0-9]/g, '');

const ALIAS = new Map(Object.entries(fixes.aliases).map(([from, to]) => [normName(from), to]));
// Acts whose name contains a solo act's name, e.g. "Derek & The Dominos" vs the
// bubblegum singer "Derek"; the splitter would otherwise fold one into the other.
const UNSPLIT = new Set((fixes.unsplit || []).map(normName));
const canon = (name) => ALIAS.get(normName(name)) ?? name;

// ── step 1: weekly charts ─────────────────────────────────────────────────────
function loadCharts() {
  const weeks = JSON.parse(readFileSync(RAW + 'all.json', 'utf8'));
  return { dates: weeks.map((w) => w.date), weeks: weeks.map((w) => w.data) };
}

// ── step 2: artist credits → acts ─────────────────────────────────────────────
// Featured guests always split off. "&", "and", "x", "," and "with" split only
// when the pieces are acts in their own right elsewhere on the chart, so
// "Earth, Wind & Fire" stays whole while "Lil Nas X & Jack Harlow" splits.
const HARD = /\s+(?:featuring|feat\.?|ft\.?|duet with|introducing|presents)\s+/i;
const SOFT = [/\s+(?:&|and|with|x|vs\.?|\/)\s+/iy, /\s*,\s+/y];

function makeCreditParser(allCredits) {
  const known = new Set();
  for (const c of allCredits) for (const part of c.split(HARD)) known.add(normName(part.trim()));

  function piece(name, first) {
    if (known.has(normName(name))) return { cost: 0, known: 1, n: 1, names: [name] };
    // "Bob Seger & The Silver Bullet Band": a backing band rides on its leader.
    if (!first && /^(the|his|her|their)\s/i.test(name)) return { cost: 0, known: 0, n: 1, names: [] };
    return { cost: 1, known: 0, n: 1, names: [name] };
  }
  const join = (a, b) => ({ cost: a.cost + b.cost, known: a.known + b.known, n: a.n + b.n, names: [...a.names, ...b.names] });
  const better = (a, b) => a.cost !== b.cost ? a.cost < b.cost : a.known !== b.known ? a.known > b.known : a.n > b.n;

  function splitSoft(s) {
    if (UNSPLIT.has(normName(s))) return [s];
    const occ = [];
    for (let i = 0; i < s.length; i++) for (const re of SOFT) {
      re.lastIndex = i;
      const m = re.exec(s);
      if (m) occ.push([i, i + m[0].length]);
    }
    const memo = new Map();
    const go = (start, first) => {
      const key = start * 2 + (first ? 1 : 0);
      if (memo.has(key)) return memo.get(key);
      let best = piece(s.slice(start).trim(), first);
      for (const [a, b] of occ) {
        if (a <= start) continue;
        const head = s.slice(start, a).trim();
        if (!head) continue;
        const cand = join(piece(head, first), go(b, false));
        if (better(cand, best)) best = cand;
      }
      memo.set(key, best);
      return best;
    };
    return go(0, true).names;
  }

  const cache = new Map();
  return (credit) => {
    if (cache.has(credit)) return cache.get(credit);
    const [lead, ...guests] = credit.split(HARD).map((p) => p.trim()).filter(Boolean);
    const leads = splitSoft(lead).map(canon);
    const feats = guests.flatMap(splitSoft).map(canon).filter((n) => !leads.includes(n));
    const out = { leads, feats };
    cache.set(credit, out);
    return out;
  };
}

// ── step 3: songs ─────────────────────────────────────────────────────────────
// A song is (title, lead act): a credit that gains a remix guest mid-run, like
// Despacito's Justin Bieber feature, stays one song.
function buildSongs(charts, parse) {
  const songs = new Map();
  charts.weeks.forEach((entries, w) => {
    for (const e of entries) {
      const { leads } = parse(e.artist);
      const key = normTitle(e.song) + '|' + normName(leads[0] ?? e.artist);
      let s = songs.get(key);
      if (!s) songs.set(key, (s = { titles: new Map(), credits: new Map(), ranks: new Map() }));
      s.titles.set(e.song, (s.titles.get(e.song) || 0) + 1);
      s.credits.set(e.artist, (s.credits.get(e.artist) || 0) + 1);
      const prev = s.ranks.get(w);
      if (!prev || e.this_week < prev) s.ranks.set(w, e.this_week);
    }
  });
  const mode = (m) => [...m].sort((a, b) => b[1] - a[1])[0][0];
  return [...songs.values()].map((s) => {
    const weeks = [...s.ranks.keys()].sort((a, b) => a - b);
    // Contiguous runs of weeks: [startWeek, rank, rank, ...]
    const segs = [];
    for (const w of weeks) {
      const last = segs[segs.length - 1];
      if (last && last[0] + last.length - 1 === w) last.push(s.ranks.get(w));
      else segs.push([w, s.ranks.get(w)]);
    }
    const credit = mode(s.credits);
    return { title: mode(s.titles), credit, ...parse(credit), segs, credits: [...s.credits.keys()] };
  }).sort((a, b) => a.segs[0][0] - b.segs[0][0] || Math.min(...a.segs[0].slice(1)) - Math.min(...b.segs[0].slice(1)));
}

const points = (song) => song.segs.reduce((t, seg) => t + seg.slice(1).reduce((u, r) => u + 101 - r, 0), 0);
const peak = (song) => Math.min(...song.segs.flatMap((seg) => seg.slice(1)));

// ── step 4: genres ────────────────────────────────────────────────────────────
function parseCSV(text) {
  const rows = [];
  let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
    else if (c !== '\r') f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

// Spotify's artist search sometimes matched the wrong artist (the source has
// "Prince" as bachata). Tags from the wrong era for an act's chart career are
// the tell; such acts fall through to overrides/inference instead.
const MODERN = /edm|tropical house|big room|trap|reggaeton|post-teen pop|viral|social media|alt z|emo rap|melodic rap|drill|brostep|electro house|progressive house|k-pop|escape room|metropopolis|poptimism|bedroom pop|hyperpop|urbano|bachata/;
const VINTAGE = /adult standards|doo-wop|merseybeat|rock-and-roll|rockabilly|brill building|british invasion|bubblegum pop|big band|swing|exotica|lounge|easy listening/;

function spotifyTags(parse, actYears) {
  const solo = new Map(), lead = new Map();
  for (const r of parseCSV(readFileSync(RAW + 'tt_audio.csv', 'utf8'))) {
    if (!r.spotify_genre || r.spotify_genre === 'NA' || r.spotify_genre === '[]') continue;
    const tags = [...r.spotify_genre.matchAll(/'([^']*)'|"([^"]*)"/g)].map((m) => m[1] ?? m[2]);
    const { leads, feats } = parse(r.performer);
    if (!leads.length) continue;
    const bucket = leads.length === 1 && !feats.length ? solo : lead;
    const k = normName(leads[0]);
    if (!bucket.has(k)) bucket.set(k, new Map());
    const m = bucket.get(k), id = tags.join('|');
    m.set(id, (m.get(id) || 0) + 1);
  }
  const out = new Map(), rejected = [];
  for (const k of new Set([...solo.keys(), ...lead.keys()])) {
    const m = solo.get(k) ?? lead.get(k);
    const tags = [...m].sort((a, b) => b[1] - a[1])[0][0].split('|');
    const yrs = actYears.get(k);
    if (yrs) {
      const share = (re) => tags.filter((t) => re.test(t)).length / tags.length;
      if ((yrs[1] < 1995 && share(MODERN) >= 0.5) || (yrs[0] >= 2005 && share(VINTAGE) >= 0.5)) { rejected.push([k, tags]); continue; }
    }
    out.set(k, tags);
  }
  return { tags: out, rejected };
}

function cdrRows() {
  return parseCSV(readFileSync(RAW + 'tt_no1.csv', 'utf8'));
}

// ── step 5: emit ──────────────────────────────────────────────────────────────
function build() {
  const charts = loadCharts();
  const allCredits = new Set(charts.weeks.flatMap((w) => w.map((e) => e.artist)));
  const parse = makeCreditParser(allCredits);
  const songs = buildSongs(charts, parse);
  const year = (w) => +charts.dates[w].slice(0, 4);

  // Acts, in order of first appearance.
  const acts = new Map();
  const act = (name) => {
    const k = normName(name);
    if (!acts.has(k)) acts.set(k, { key: k, names: new Map(), pts: 0, n: 0, years: [9999, 0] });
    const a = acts.get(k);
    a.names.set(name, (a.names.get(name) || 0) + 1);
    return a;
  };
  for (const s of songs) {
    const p = points(s), y0 = year(s.segs[0][0]), last = s.segs[s.segs.length - 1], y1 = year(last[0] + last.length - 2);
    s.acts = [...s.leads, ...s.feats].map(act);
    s.nLead = s.leads.length;
    for (const a of s.acts) { a.pts += p; a.n++; a.years = [Math.min(a.years[0], y0), Math.max(a.years[1], y1)]; }
  }
  const actYears = new Map([...acts].map(([k, a]) => [k, a.years]));
  const { tags: spot, rejected } = spotifyTags(parse, actYears);

  const famOverride = new Map(Object.entries(fixes.families).map(([n, f]) => [normName(n), f]));
  const inferred = new Map(Object.entries(fixes.inferred).map(([n, f]) => [normName(n), f]));
  for (const f of [...famOverride.values(), ...inferred.values()]) if (!(f in FAM_INDEX)) throw new Error('unknown family ' + f);
  for (const a of acts.values()) {
    a.tags = spot.get(a.key) ?? [];
    const sf = a.tags.length ? familyOf(a.tags) : null;
    if (famOverride.has(a.key)) [a.fam, a.src] = [famOverride.get(a.key), SRC.CORRECTED];
    else if (sf) [a.fam, a.src] = [sf, SRC.SPOTIFY];
    else if (inferred.has(a.key)) [a.fam, a.src] = [inferred.get(a.key), SRC.INFERRED];
    else [a.fam, a.src] = [null, SRC.NONE];
  }

  // Song family: the #1 dataset's song-level genre when there is one, else the
  // lead act's, else the first credited act that has one.
  for (const s of songs) {
    const a = s.acts.find((x) => x.fam);
    [s.fam, s.src] = a ? [a.fam, a.src] : [null, SRC.NONE];
  }
  // Song-level genres from Wikidata (tools/fetch-songgenres.mjs) show an
  // artist's change of style, but they lean on generic labels ("pop music"),
  // and letting them override outright was a wash on a hand check of 60 #1s.
  // So they fill songs with no family, and otherwise only choose among the
  // families the lead act's own tags already support (Taylor Swift: country,
  // then pop). The #1 dataset, below, beats both where its style is decisive.
  const songGenresFile = here('./cache/wikidata/song-genres.json');
  const songGenres = existsSync(songGenresFile) ? JSON.parse(readFileSync(songGenresFile, 'utf8')) : {};
  let wdSongs = 0;
  for (const s of songs) {
    const lead = s.acts[0] && [...s.acts[0].names].sort((x, y) => y[1] - x[1])[0][0];
    const g = songGenres[`${s.title}|${lead}`];
    const f = g && g.length ? clearFamily(g.map((x) => x.toLowerCase())) : null;
    if (!f || f === s.fam || famOverride.has(s.acts[0]?.key)) continue;
    if (s.fam && !familyScores(s.acts[0]?.tags ?? [])[f]) continue;
    [s.fam, s.src] = [f, SRC.SONG_WD]; wdSongs++;
  }

  const no1 = {};
  const byTitle = new Map();
  songs.forEach((s, i) => {
    const firstTop = s.segs.flatMap((seg) => seg.slice(1).map((r, j) => [seg[0] + j, r])).find(([, r]) => r === 1);
    if (!firstTop) return;
    const k = normTitle(s.title);
    if (!byTitle.has(k)) byTitle.set(k, []);
    byTitle.get(k).push([i, firstTop[0]]);
  });
  let matched = 0;
  const cdr = cdrRows();
  for (const r of cdr) {
    const cands = byTitle.get(normTitle(r.song));
    if (!cands) continue;
    const t = Date.parse(r.date.slice(0, 10));
    const [i] = cands.map(([i, w]) => [i, Math.abs(Date.parse(charts.dates[w]) - t)]).sort((a, b) => a[1] - b[1])[0];
    const s = songs[i];
    const { strong, coarse } = cdrFamily(r.cdr_genre, r.cdr_style);
    if (strong && !famOverride.has(s.acts[0].key)) [s.fam, s.src] = [strong, SRC.SONG];
    else if (!s.fam && coarse) [s.fam, s.src] = [coarse, SRC.SONG];
    const clean = (v) => (v && v !== 'NA' ? v : '');
    no1[i] = [clean(r.cdr_style), clean(r.songwriters), clean(r.producers), clean(r.label)];
    matched++;
  }

  // Billboard's official year-end lists (tools/fetch-yearend.mjs), matched to
  // songs by title, the years the song charted, and artist.
  const yeFile = here('./cache/yearend.json');
  const yearEnd = {};
  let yeTotal = 0, yeMatched = 0;
  if (existsSync(yeFile)) {
    const titleIdx = new Map();
    songs.forEach((s, i) => { const k = normTitle(s.title); if (!titleIdx.has(k)) titleIdx.set(k, []); titleIdx.get(k).push(i); });
    for (const [y, rows] of Object.entries(JSON.parse(readFileSync(yeFile, 'utf8')))) {
      yearEnd[y] = [];
      for (const [rank, title, artist] of rows) {
        yeTotal++;
        // "Hey Jude" / "Revolution": double A-sides list both titles.
        const cands = [...new Set(title.split(/\s*\/\s*|"\s*"/).flatMap((t) => titleIdx.get(normTitle(t.replace(/"/g, ''))) || []))]
          .filter((i) => { const s = songs[i]; return year(s.segs[0][0]) <= +y && year(s.segs[s.segs.length - 1][0]) >= +y - 1; });
        const na = normName(artist);
        const best = cands.find((i) => songs[i].acts.some((a) => na.includes(a.key) || a.key.includes(na))) ?? cands[0];
        if (best != null) { yearEnd[y].push([rank, best]); yeMatched++; }
      }
    }
  }

  // Emit, indexing acts and tags compactly.
  const actList = [...acts.values()];
  actList.forEach((a, i) => { a.i = i; });
  const tagVocab = [...new Set(actList.flatMap((a) => a.tags))].sort();
  const tagIdx = new Map(tagVocab.map((t, i) => [t, i]));
  const mode = (m) => [...m].sort((a, b) => b[1] - a[1])[0][0];
  const famI = (f) => (f ? FAM_INDEX[f] : -1);
  const out = {
    v: 1,
    built: new Date().toISOString().slice(0, 10),
    weeks: charts.dates,
    fams: FAMILIES,
    tags: tagVocab,
    acts: actList.map((a) => [mode(a.names), famI(a.fam), a.src, a.tags.map((t) => tagIdx.get(t))]),
    songs: songs.map((s) => [s.title, s.credit, s.acts.map((a) => a.i), s.nLead, famI(s.fam), s.src, s.segs]),
    no1,
    yearEnd,
    awards: grammys(songs),
  };
  out.clues = { songs: clueMap('songs', out.songs.map((r) => `${r[0]}|${r[1]}`)), acts: clueMap('acts', out.acts.map((r) => r[0])) };
  writeFileSync(here('../data/music.json'), JSON.stringify(out));

  // Review sheet: the acts that matter most, with the evidence for their family.
  const top = [...actList].sort((a, b) => b.pts - a.pts).slice(0, 1500);
  writeFileSync(here('./cache/review.tsv'), top.map((a, r) =>
    [r + 1, mode(a.names), a.fam ?? '-', a.src, a.n, a.years.join('-'), a.tags.join(', ')].join('\t')).join('\n'));

  const srcCount = {};
  for (const s of songs) srcCount[s.src] = (srcCount[s.src] || 0) + 1;
  console.log(`${charts.dates.length} weeks, ${songs.length} songs, ${actList.length} acts`);
  console.log(`#1 dataset: ${matched}/${cdr.length} matched; spotify mismatches rejected: ${rejected.length}`);
  console.log('songs by genre source', srcCount, `(song-level from Wikidata: ${wdSongs})`);
  console.log(`official year-end entries matched: ${yeMatched}/${yeTotal}`);
  console.log('wrote data/music.json', (JSON.stringify(out).length / 1e6).toFixed(2) + 'MB');
  return { rejected };
}

const { rejected } = build();
if (process.argv.includes('--rejected')) for (const [k, t] of rejected) console.log(k, '→', t.join(', '));

// Grammy Record of the Year winners that charted (tools/fetch-awards.mjs), as
// [song index, ceremony year]. Title and lead act must both match.
function grammys(songs) {
  const file = here('./cache/awards.json');
  if (!existsSync(file)) return {};
  // Chart and award titles differ in medleys, film credits and articles:
  // "Aquarius/Let The Sunshine In (The Flesh Failures)", "Taste Of Honey".
  const core = (t) => normTitle(t.replace(/\s*\(.*?\)\s*/g, ' ').replace(/"/g, '').split('/')[0].trim().replace(/^(the|a)\s+/i, ''));
  const out = [];
  for (const [y, [record, artist]] of Object.entries(JSON.parse(readFileSync(file, 'utf8')).grammyRecord)) {
    const lead = normName(artist.split(/ & | and | featuring | feat\. | with |, /i)[0]);
    const i = songs.findIndex((s) => core(s.title) === core(record) && s.acts.some((a) => [...a.names.keys()].some((n) => normName(n).startsWith(lead) || lead.startsWith(normName(n)))));
    if (i >= 0) out.push([i, +y]); else console.log('  Grammy record not on the chart:', y, record, '—', artist);
  }
  console.log(`Grammy Records of the Year matched: ${out.length}`);
  return { grammy: out };
}
