// Lanes: one horizontal lane per leading entity (artist, film-maker, show) over
// the whole time span, a dot for each of its hits; tap a name for its page.
// Domains supply D.lanes {title, blurb, ids(), marks(i) → [{t, rank, it}],
// extent [t0, t1]} and D.entityPage(i, rerender, width).
(function () {
  const HA = globalThis.HA, h = HA.h, s = HA.s;
  let root, body, lastW = 0;

  function mount(el) {
    root = el;
    body = h('div', {});
    root.append(body);
    new ResizeObserver(() => {
      if (root.clientWidth === lastW) return;
      lastW = root.clientWidth;
      if (!root.hidden) render();
    }).observe(root);
  }

  function lanes() {
    const D = HA.D, L = D.lanes, pal = HA.palette();
    const ids = L.ids();
    const W = Math.max(720, root.clientWidth - 26), nameW = 190, laneH = 22, top = 22;
    const H = top + ids.length * laneH + 6;
    const [t0, t1] = L.extent;
    const x = (t) => nameW + ((t - t0) / (t1 - t0)) * (W - nameW - 10);
    const svg = s('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': L.title });
    const ax = s('g', { class: 'axis grid' });
    for (let y = Math.ceil(t0 / 10) * 10; y <= t1; y += 10) ax.append(s('line', { x1: x(y), x2: x(y), y1: top - 4, y2: H }), s('text', { x: x(y), y: 12, 'text-anchor': 'middle' }, String(y)));
    svg.append(ax);
    ids.forEach((i, k) => {
      const e = D.entities[i], cy = top + k * laneH + laneH / 2;
      svg.append(s('text', { class: 'lane-name', x: nameW - 10, y: cy + 4, 'text-anchor': 'end', onclick: () => HA.showEntity(i) }, e.name.length > 25 ? e.name.slice(0, 24) + '…' : e.name));
      svg.append(s('line', { x1: x(e.t0), x2: x(e.t1), y1: cy, y2: cy, stroke: pal.line, 'stroke-width': 2 }));
      for (const mk of L.marks(i).sort((a, b) => b.rank - a.rank)) {
        const r = mk.rank === 1 ? 6 : mk.rank <= 10 ? 4.5 : 2.8;
        const c = s('circle', {
          class: 'dot', cx: x(mk.t), cy, r, fill: HA.famColour(pal, mk.it.fam), opacity: HA.lit(mk.it.fam) ? 1 : 0.15,
          stroke: mk.rank === 1 ? pal.ink : pal.surface, 'stroke-width': mk.rank === 1 ? 1.5 : 1,
        });
        HA.bindTip(c, () => D.tip(mk.it, mk.entry), () => HA.open(mk.it));
        svg.append(c);
      }
    });
    return h('div', {},
      h('div', { class: 'view-head' }, h('div', {}, h('h1', {}, L.title), h('p', {}, L.blurb)),
        h('div', { class: 'controls' }, HA.quizButton({ focus: 'ents' }, `Quiz me on ${D.entityNouns.toLowerCase()}`))),
      h('div', { class: 'lanes-wrap scroll-x' }, h('div', { class: 'lanes' }, svg)));
  }

  function render() {
    if (!HA.D) return;
    const e = HA.state.entity;
    if (e != null && HA.D.entities[e]) {
      body.replaceChildren(
        h('div', { class: 'controls', style: { marginBottom: '10px' } }, h('button', { class: 'btn', onclick: () => { HA.state.entity = null; render(); } }, '← All ' + HA.D.lanes.title.toLowerCase()),
          !HA.D.entitiesAreItems && HA.quiz.canEnt(e) && HA.quizButton({ ent: e }, `Quiz me on ${HA.D.entities[e].name}`)),
        HA.D.entityPage(e, render, root.clientWidth - 26));
    } else body.replaceChildren(lanes());
  }

  HA.views.lanes = { mount, render };
  HA.on('entity', () => { if (root && !root.hidden) { render(); scrollTo({ top: 0 }); } });
  HA.on('spot', () => { if (root && !root.hidden) render(); });
  HA.on('theme', () => { if (root && !root.hidden) render(); });
})();
