// About: how to read the current medium. Each domain supplies D.about().
(function () {
  const HA = globalThis.HA, h = HA.h;
  let root;
  function mount(el) { root = el; }

  HA.sourceTable = (D) => {
    const by = new Array(D.srcLabels.length).fill(0);
    for (const x of D.items) by[x.src]++;
    return h('table', {}, h('tbody', {}, D.srcLabels.map((l, k) => by[k] > 0 && h('tr', {}, h('td', {}, l), h('td', { style: { textAlign: 'right' } }, by[k].toLocaleString()), h('td', { style: { textAlign: 'right' } }, ((by[k] / D.items.length) * 100).toFixed(1) + '%')))));
  };
  HA.famTable = (D) => h('table', {}, h('tbody', {}, D.fams.map((f) => h('tr', {}, h('td', {}, HA.swatch(f.i, { marginRight: '6px' }), h('b', {}, f.label)), h('td', {}, f.blurb)))));
  HA.extLink = (href, text) => h('a', { href, target: '_blank', rel: 'noopener' }, text);

  let mountedFor = null;
  function render() {
    if (mountedFor === HA.D) return;
    mountedFor = HA.D;
    root.replaceChildren(h('div', { class: 'prose' },
      h('div', { class: 'view-head' }, h('div', {}, h('h1', {}, `How to read ${HA.D.label}`))),
      HA.D.about(),
      h('h2', {}, 'Quizzes'),
      h('p', {}, `Each view has a “Quiz me” button: ten questions on what that view shows (a decade, the No. 1s, one ${HA.D.entityNoun}), in the side panel, with the genre spotlight narrowing it further. “Familiar” draws from the best-known fifth of what’s in range, “Deeper cuts” from the next two fifths. Ones you miss come back in later rounds.`),
      h('p', {}, 'Which items get asked, and what kinds of question, follow how often things come up in general-knowledge quizzes, measured on 544,110 Jeopardy! clues from 1984 to 2026: a #1 hit comes up about three times as often as another top-10 hit, and “who sang it” and “name the film” are the most common kinds. Years are scored by how close you get, since a rough sense of when is what helps.'),
      h('p', { class: 'note' }, 'Clue source: ', HA.extLink('https://github.com/jwolle1/jeopardy_clue_dataset', 'jwolle1/jeopardy_clue_dataset'), ', from the fan-run J! Archive.')));
  }

  HA.views.about = { mount, render };
})();
