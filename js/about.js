// About: where the data comes from and how to read it.
(function () {
  const HA = globalThis.HA, h = HA.h;
  let root;

  function mount(el) { root = el; }

  function render() {
    if (root.childElementCount) return;
    const m = HA.m;
    const bySrc = new Array(HA.SRC_LABEL.length).fill(0);
    for (const s of m.songs) bySrc[s.src]++;
    const pct = (n) => ((n / m.songs.length) * 100).toFixed(1) + '%';
    const link = (href, text) => h('a', { href, target: '_blank', rel: 'noopener' }, text);
    root.append(h('div', { class: 'prose' },
      h('div', { class: 'view-head' }, h('div', {}, h('h1', {}, 'How to read this'))),
      h('p', {}, `Hit Atlas holds every song that has appeared on the Billboard Hot 100: ${m.songs.length.toLocaleString()} songs by ${m.acts.length.toLocaleString()} acts over ${m.weeks.length.toLocaleString()} weekly charts, from ${HA.fmtWeek(0)} to ${HA.fmtWeek(m.weeks.length - 1)}.`),

      h('h2', {}, 'Years and rankings'),
      h('p', {}, 'Each week on the chart earns a song points: 100 for #1, falling as 100 ÷ √rank (50 at #4, 20 at #25, 10 at #100). A song belongs to the chart year in which it earned the most, and songs are ranked within a year by those points. Chart years run December to November, like Billboard’s own year-end lists, so a song that tops the chart over Christmas counts toward the following year.'),
      h('p', {}, 'Billboard’s official year-end lists also weigh sales and airplay directly, so this ranking will not match them exactly. Checked against the official year-end #1 for 1959–2024, it picks the same song in 46 of 66 years and has it in its top five in 57. A plain sum of chart positions matches only 20, because it rewards slow-burning songs that sat at #30 for a year over chart-toppers.'),

      h('h2', {}, 'Genres'),
      h('p', {}, 'Colour shows one of eight genre families, plus Other. They are broad on purpose, so a decade reads at a glance; the finer Spotify genres appear on each song and artist.'),
      h('table', {}, h('tbody', {}, m.fams.map((f) => h('tr', {}, h('td', {}, h('i', { class: 'sw', style: { '--c': HA.famVar(f.i), marginRight: '6px' } }), h('b', {}, f.label)), h('td', {}, f.blurb))))),
      h('p', {}, 'Genre usually belongs to the artist, not the song: it comes from the artist’s Spotify genres as of 2021. The exception is #1 hits, which use a song-level genre from Chris Dalla Riva’s hand-coded dataset of every #1. So an artist who changed style shows one colour, except on their #1s.'),
      h('table', {}, h('tbody', {}, HA.SRC_LABEL.map((l, k) => h('tr', {}, h('td', {}, l), h('td', { style: { textAlign: 'right' } }, bySrc[k].toLocaleString()), h('td', { style: { textAlign: 'right' } }, pct(bySrc[k])))))),
      h('p', {}, '“Edited” marks acts where Spotify’s match was clearly the wrong artist (it filed Prince under bachata), or where its tags pointed away from the act’s actual hits. “Inferred” marks acts with no source data, mostly artists who arrived after mid-2021 and one-hit acts of the early 1960s. Those were classified from general music knowledge and left blank when uncertain. Treat both as informed guesses.'),

      h('h2', {}, 'Artists'),
      h('p', {}, 'Credits are split into acts: “Rihanna Featuring Drake” counts for both, and duos split when both members had hits of their own (“Diana Ross & The Supremes” counts for Diana Ross and for The Supremes). Group names that include “&” stay whole (Earth, Wind & Fire). Featured appearances count half toward an act’s weight in the career lanes.'),

      h('h2', {}, 'Sources'),
      h('ul', {},
        h('li', {}, 'Weekly charts: ', link('https://github.com/mhollingshead/billboard-hot-100', 'mhollingshead/billboard-hot-100'), ', every Hot 100 since August 1958, refreshed weekly.'),
        h('li', {}, 'Artist genres: Spotify genre tags for Hot 100 songs through mid-2021, from ', link('https://github.com/rfordatascience/tidytuesday/tree/master/data/2021/2021-09-14', 'TidyTuesday 2021-09-14'), '.'),
        h('li', {}, 'Number ones: Chris Dalla Riva’s dataset of every #1 (genre, style, writers, producers, label) through January 2025, from ', link('https://github.com/rfordatascience/tidytuesday/tree/main/data/2025/2025-08-26', 'TidyTuesday 2025-08-26'), '.')),
      h('p', { class: 'note' }, `Data built ${m.built}.`)));
  }

  HA.views.about = { mount, render };
})();
