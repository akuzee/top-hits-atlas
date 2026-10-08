// Turns data/music.json into the structures every view reads. Pure: no DOM, so
// tools/test-model.mjs can run it under node.
var HA = globalThis.HA || (globalThis.HA = {});

// Where a song's genre came from (mirrors SRC in tools/build.mjs).
HA.SRC_LABEL = ['No genre data', 'Spotify artist genres', 'Song-level (#1 hits dataset)', 'Edited: source data was wrong', 'Inferred: no source data'];

// Weekly chart points: 100 for a week at #1, 50 at #4, 10 at #100. The
// 1/sqrt(rank) curve was calibrated against Billboard's official year-end #1s
// (tools/test-model.mjs): a linear (101 - rank) score lets long mid-chart runs
// outrank chart-toppers and matches only a third of them.
HA.weekPts = (r) => 100 / Math.sqrt(r);

HA.buildModel = function (raw) {
  const weeks = raw.weeks;
  const W = weeks.length;
  const weekYear = weeks.map((d) => +d.slice(0, 4));
  // Billboard's chart year runs December to November, as the year-end lists do,
  // so a song that tops the chart over Christmas belongs to the year it ends in.
  const chartYear = weeks.map((d, w) => (d.slice(5, 7) === '12' ? weekYear[w] + 1 : weekYear[w]));
  const firstYear = chartYear[0], lastYear = chartYear[W - 1];
  const fams = raw.fams.map((f, i) => Object.assign({ i }, f));
  const UNKNOWN = fams.length; // index used for "no genre" in tallies

  const acts = raw.acts.map(([name, fam, src, tags], i) => ({
    i, name, fam, src, tags: tags.map((t) => raw.tags[t]), songs: [], pts: 0, first: W, last: -1,
  }));

  const no1Week = new Int32Array(W).fill(-1);
  const songs = raw.songs.map(([title, credit, actIdx, nLead, fam, src, segs], i) => {
    let peak = 101, weeksOn = 0, wk1 = 0, pts = 0, peakWeek = -1, atPeak = 0;
    const perYear = new Map();
    for (const seg of segs) {
      for (let j = 1; j < seg.length; j++) {
        const r = seg[j], w = seg[0] + j - 1, p = HA.weekPts(r);
        weeksOn++;
        pts += p;
        perYear.set(chartYear[w], (perYear.get(chartYear[w]) || 0) + p);
        if (r === 1) { wk1++; no1Week[w] = i; }
        if (r < peak) { peak = r; peakWeek = w; atPeak = 1; } else if (r === peak) atPeak++;
      }
    }
    // A song lives in the chart year where it earned the most; a re-entry decades
    // later (a revival, a holiday standard) doesn't move it.
    let year = 0, yearPts = -1;
    for (const [y, p] of perYear) if (p > yearPts) [year, yearPts] = [y, p];
    const lastSeg = segs[segs.length - 1];
    return {
      i, title, credit, acts: actIdx, nLead, fam, src, segs,
      peak, peakWeek, atPeak, weeksOn, wk1, pts,
      first: segs[0][0], last: lastSeg[0] + lastSeg.length - 2,
      year, yearPts, yearRank: 0,
    };
  });

  for (const s of songs) {
    s.acts.forEach((a, k) => {
      const act = acts[a];
      act.songs.push(s.i);
      // Features count half toward an act's weight; a guest verse is not a hit of their own.
      act.pts += k < s.nLead ? s.pts : s.pts / 2;
      act.first = Math.min(act.first, s.first);
      act.last = Math.max(act.last, s.last);
    });
  }

  const years = [];
  for (let y = firstYear; y <= lastYear; y++) years.push(y);
  const byYear = new Map(years.map((y) => [y, []]));
  for (const s of songs) byYear.get(s.year).push(s);
  for (const list of byYear.values()) {
    list.sort((a, b) => b.yearPts - a.yearPts || a.peak - b.peak);
    list.forEach((s, k) => { s.yearRank = k + 1; });
  }

  // Consecutive weeks at #1 by the same song.
  const no1Runs = [];
  for (let w = 0; w < W; w++) {
    const s = no1Week[w];
    if (s < 0) continue;
    const last = no1Runs[no1Runs.length - 1];
    if (last && last.song === s && last.end === w - 1) last.end = w;
    else no1Runs.push({ song: s, start: w, end: w });
  }

  // Genre share per quarter, weighted by chart points, so the river shows who
  // held the hits rather than who filled the bottom of the chart.
  const Q = (weekYear[W - 1] - weekYear[0] + 1) * 4;
  const river = Array.from({ length: Q }, () => new Float64Array(UNKNOWN + 1));
  const quarterOf = weeks.map((d, w) => (weekYear[w] - weekYear[0]) * 4 + Math.floor((+d.slice(5, 7) - 1) / 3));
  for (const s of songs) {
    const f = s.fam < 0 ? UNKNOWN : s.fam;
    for (const seg of s.segs) for (let j = 1; j < seg.length; j++) river[quarterOf[seg[0] + j - 1]][f] += HA.weekPts(seg[j]);
  }

  return {
    weeks, weekYear, chartYear, firstYear, lastYear, years, fams, UNKNOWN, acts, songs, byYear, no1Week, no1Runs,
    river, quarterOf, built: raw.built, no1Info: raw.no1,
  };
};

// Ranks for every week of a song, as [week, rank] pairs.
HA.songWeeks = function (s) {
  const out = [];
  for (const seg of s.segs) for (let j = 1; j < seg.length; j++) out.push([seg[0] + j - 1, seg[j]]);
  return out;
};

// The acts that define each decade: top acts by chart points earned by songs
// whose home year falls in that decade.
HA.decadeLeaders = function (m, perDecade) {
  const out = [];
  for (let d = Math.floor(m.firstYear / 10) * 10; d <= m.lastYear; d += 10) {
    const tally = new Map();
    for (const s of m.songs) {
      if (s.year < d || s.year >= d + 10) continue;
      s.acts.forEach((a, k) => tally.set(a, (tally.get(a) || 0) + (k < s.nLead ? s.pts : s.pts / 2)));
    }
    out.push({ decade: d, acts: [...tally].sort((a, b) => b[1] - a[1]).slice(0, perDecade).map(([a]) => a) });
  }
  return out;
};

if (typeof module !== 'undefined') module.exports = HA;
