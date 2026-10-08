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
      HA.D.about()));
  }

  HA.views.about = { mount, render };
})();
