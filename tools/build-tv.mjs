// Builds data/tv.json from the Nielsen season tables in tools/tv/seasons/.
//   node tools/build-tv.mjs
//
// The season tables were transcribed from Wikipedia's "Top-rated United States
// television programs of <season>" pages (each file names its source). They are
// checked in because the build environment can't reach Wikipedia directly.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { clueMap } from './lib/clues.mjs';

const here = (p) => new URL(p, import.meta.url).pathname;
const SEASONS = here('./tv/seasons/');
const STREAMING = here('./tv/streaming/');
const fixes = JSON.parse(readFileSync(here('./tv/overrides.json'), 'utf8'));
const tvmaze = existsSync(here('./cache/tvmaze.json')) ? JSON.parse(readFileSync(here('./cache/tvmaze.json'), 'utf8')) : {};
const families = existsSync(here('./tv/families.json')) ? JSON.parse(readFileSync(here('./tv/families.json'), 'utf8')) : {};

// Families in river stack order; slot = position in the shared validated palette.
export const FAMILIES = [
  { id: 'drama', label: 'Drama', blurb: 'Family, medical, workplace and anthology drama, prime-time soaps' },
  { id: 'crime', label: 'Crime & Legal', blurb: 'Cops, detectives, lawyers, procedurals' },
  { id: 'variety', label: 'Variety & Talk', blurb: 'Variety hours, music and sketch shows, talk' },
  { id: 'western', label: 'Western', blurb: 'The 1950s–60s frontier boom and its descendants' },
  { id: 'news', label: 'News & Docs', blurb: 'News magazines and documentary' },
  { id: 'comedy', label: 'Comedy', blurb: 'Sitcoms, animated comedy' },
  { id: 'reality', label: 'Reality & Games', blurb: 'Quiz and game shows, reality competitions' },
  { id: 'sports', label: 'Sports', blurb: 'Football and other live sport' },
  { id: 'other', label: 'Other', blurb: 'Movie nights, specials, anthologies of films' },
];
const FAM = Object.fromEntries(FAMILIES.map((f, i) => [f.id, i]));
// Where a show's family came from (the app labels every show with it).
const SRC = { NONE: 0, CLAUDE: 1, CLAUDE_TVMAZE: 2 };

const fold = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const normShow = (s) => fold(s).replace(/&/g, 'and').replace(/^the\s+/, '').replace(/[^a-z0-9]/g, '');
const ALIAS = new Map(Object.entries(fixes.aliases).map(([from, to]) => [normShow(from), to]));

// Network movie nights are listed under shifting names ("NBC Saturday Night at
// the Movies", "NBC Saturday Movie"); one network's movie on one night is one slot.
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function movieSlot(name, network) {
  if (!/\bmovies?\b/i.test(name) || !network) return null;
  const day = DAYS.find((d) => new RegExp(d.slice(0, 3), 'i').test(name));
  return day ? `${network.split(/[,/]/)[0].trim()} ${day} Night Movie` : null;
}

// Shows Wikipedia lists once per night ("American Idol (Wednesday)", "Dateline
// NBC — Friday", "Batman (Thurs.)", "… — Results") are one series with two slots.
const NIGHT = /\s*(?:[—–:-]\s*|\()(mon|tue|wed|thu|fri|sat|sun|results)[a-z]*\.?\)?\s*$/i;
function splitNights(rows) {
  for (const r of rows) {
    const m = r.program.match(NIGHT);
    [r.base, r.night] = m ? [r.program.slice(0, m.index).trim(), m[0].replace(/[()—–:-]/g, '').trim()] : [r.program, ''];
  }
  // "Peyton Place I" / "Peyton Place II": numbered halves, but only when every
  // row of that name is numbered ("60 Minutes II" was its own programme).
  const groups = new Map();
  for (const r of rows) {
    const m = !r.night && r.base.match(/^(.*\S)\s+(I|II|III)$/);
    if (m) groups.set(m[1], [...(groups.get(m[1]) || []), [r, m[2]]]);
  }
  for (const [base, list] of groups) {
    if (list.length < 2 || rows.some((r) => r.base === base)) continue;
    for (const [r, n] of list) [r.base, r.night] = [base, n];
  }
  return rows;
}

function tvmazeFamily(m) {
  const t = m.type, g = m.genres || [];
  if (t === 'Sports') return 'sports';
  if (t === 'News' || t === 'Documentary') return 'news';
  if (t === 'Talk Show' || t === 'Variety') return 'variety';
  if (t === 'Game Show' || t === 'Reality') return 'reality';
  if (g.includes('Western')) return 'western';
  if (g.includes('Crime') || g.includes('Legal')) return 'crime';
  if (g.includes('Comedy')) return 'comedy';
  return g.length ? 'drama' : null;
}

function readSeasons() {
  const out = [];
  for (const f of readdirSync(SEASONS).filter((f) => /^\d{4}\.tsv$/.test(f)).sort()) {
    const [head, ...lines] = readFileSync(SEASONS + f, 'utf8').trim().split('\n');
    const meta = Object.fromEntries([...head.matchAll(/(\w+)=(\S+)/g)].map((m) => [m[1], m[2]]));
    const rows = lines.filter((l) => l.trim() && !l.startsWith('#')).map((l) => {
      const [rank, program, network, value] = l.split('\t').map((x) => (x ?? '').trim());
      // "?" marks a network the source didn't state; the show's other seasons fill it in.
      return { rank: +rank, program, network: network === '?' ? '' : network, value: value === '' || value == null ? null : +value };
    });
    out.push({ y: +f.slice(0, 4), unit: meta.unit || 'rating', source: meta.source || '', complete: meta.complete !== 'no', rows: splitNights(rows) });
  }
  return out;
}

// Netflix's official weekly US Top 10 for TV (July 2021 on), rolled up into
// each calendar year's biggest series with the same 100/√rank weekly points
// the music charts use. Netflix-only, but the one clean chart of the
// streaming era, which the broadcast lists no longer see.
const NETFLIX = here('./cache/netflix/all-weeks-countries.tsv');
function readStreaming() {
  if (!existsSync(NETFLIX)) return [];
  const years = new Map();
  for (const line of readFileSync(NETFLIX, 'utf8').split('\n').slice(1)) {
    const [country, , week, category, rank, title] = line.split('\t');
    if (country !== 'United States' || category !== 'TV') continue;
    const y = +week.slice(0, 4);
    if (!years.has(y)) years.set(y, new Map());
    const m = years.get(y);
    const e = m.get(title) || { title, pts: 0, weeks: 0 };
    e.pts += 100 / Math.sqrt(+rank);
    e.weeks++;
    m.set(title, e);
  }
  return [...years].sort((a, b) => a[0] - b[0]).map(([year, m]) => ({
    year, unit: 'weeks', source: 'https://www.netflix.com/tudum/top10', complete: year < new Date().getFullYear(),
    rows: [...m.values()].sort((a, b) => b.pts - a.pts).slice(0, 10).map((e, k) => ({ rank: k + 1, title: e.title, platform: 'Netflix', value: e.weeks })),
  }));
}

function validate(seasons) {
  const problems = [];
  for (const s of seasons) {
    let prev = { rank: 0, value: Infinity };
    const seen = new Set();
    for (const r of s.rows) {
      if (!(r.rank >= prev.rank)) problems.push(`${s.y}: rank ${r.rank} after ${prev.rank}`);
      if (r.value != null && prev.value != null && r.value > prev.value + 1e-9) problems.push(`${s.y}: value rises at #${r.rank} ${r.program} (${r.value} > ${prev.value})`);
      const k = normShow(r.program);
      if (seen.has(k)) problems.push(`${s.y}: ${r.program} listed twice`);
      seen.add(k);
      prev = r;
    }
  }
  return problems;
}

function build() {
  const seasons = readSeasons();
  const problems = validate(seasons);
  const shows = new Map();
  seasons.forEach((s, si) => {
    for (const r of s.rows) {
      const name = ALIAS.get(normShow(r.base)) ?? movieSlot(r.base, r.network) ?? r.base;
      const k = normShow(name);
      if (!shows.has(k)) shows.set(k, { names: new Map(), nets: new Map(), runs: [] });
      const sh = shows.get(k);
      sh.names.set(name, (sh.names.get(name) || 0) + 1);
      if (r.network) sh.nets.set(r.network, (sh.nets.get(r.network) || 0) + 1);
      sh.runs.push([si, r.rank, r.value, r.network || '', r.night]);
    }
  });
  const mode = (m) => [...m].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  const streaming = readStreaming();
  const famKey = new Map(Object.entries(families).map(([n, f]) => [normShow(n), f]));
  const unclassified = [];
  const out = {
    v: 1,
    built: new Date().toISOString().slice(0, 10),
    fams: FAMILIES,
    seasons: seasons.map((s) => ({ y: s.y, unit: s.unit, source: s.source, complete: s.complete, n: s.rows.length })),
    shows: [...shows].map(([k, sh]) => {
      const title = mode(sh.names);
      const f = famKey.get(k) ?? famKey.get(normShow(title));
      if (f == null) unclassified.push(title);
      // Networks in the order the show appeared on them ("ABC, NBC" for Taxi).
      const nets = [...new Set(sh.runs.map((r) => r[3]).filter(Boolean))];
      // TVmaze (fetch-tvmaze.mjs): premiere/end dates, IMDb id, and a check on
      // the genre call. It agrees on ~90% of shows; where it differs the call
      // stands (TVmaze files spy shows under Drama and 1950s anthologies under Comedy).
      const m = tvmaze[title];
      const src = f == null ? SRC.NONE : m && tvmazeFamily(m) === f ? SRC.CLAUDE_TVMAZE : SRC.CLAUDE;
      return [title, nets.join(', '), f == null ? -1 : FAM[f], src, sh.runs, m?.premiered || '', m?.ended || '', m?.imdb || ''];
    }),
  };
  // Streaming rows point at the broadcast show when the same series is in both
  // (e.g. Grey's Anatomy), otherwise carry their own family.
  const showIdx = new Map([...shows.keys()].map((k, i) => [k, i]));
  out.streaming = streaming.map((y) => ({
    year: y.year, unit: y.unit, source: y.source, complete: y.complete,
    rows: y.rows.map((r) => {
      const k = normShow(ALIAS.get(normShow(r.title)) ?? r.title);
      const f = famKey.get(k);
      if (f == null && !showIdx.has(k)) unclassified.push(r.title);
      return [r.rank, r.title, r.platform, r.value, showIdx.has(k) ? showIdx.get(k) : -1, f == null ? -1 : FAM[f]];
    }),
  }));
  out.clues = { shows: clueMap('shows', out.shows.map((r) => r[0])) };
  // Emmy best drama and comedy series (tools/fetch-awards.mjs), as
  // [show index, ceremony year, 'drama' | 'comedy'] for shows that ranked.
  const awardsFile = here('./cache/awards.json');
  if (existsSync(awardsFile)) {
    const aw = JSON.parse(readFileSync(awardsFile, 'utf8'));
    out.awards = { emmy: [] };
    for (const kind of ['drama', 'comedy']) {
      for (const [y, title] of Object.entries(aw[kind === 'drama' ? 'emmyDrama' : 'emmyComedy'])) {
        const k = normShow(ALIAS.get(normShow(title)) ?? title);
        if (showIdx.has(k)) out.awards.emmy.push([showIdx.get(k), +y, kind]);
      }
    }
    console.log(`Emmy series wins by ranked shows: ${out.awards.emmy.length}`);
  }
  writeFileSync(here('../data/tv.json'), JSON.stringify(out));
  writeFileSync(here('./cache/tv-shows.tsv'), out.shows.map((s) => [s[0], s[1], s[4].length, s[4].map(([si]) => seasons[si].y)[0]].join('\t')).join('\n'));
  console.log(`${seasons.length} seasons (${seasons.filter((s) => !s.complete).length} incomplete), ${out.shows.length} shows, ${unclassified.length} without a family`);
  if (problems.length) console.log('validation:\n  ' + problems.join('\n  '));
  return { problems, unclassified };
}

const { unclassified } = build();
if (process.argv.includes('--unclassified')) console.log(unclassified.join('\n'));
