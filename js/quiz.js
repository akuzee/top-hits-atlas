// Quiz: three ten-question games for fixing hits in time. Domains supply
// D.quiz {yearOf, yearsOk, firstOf, firstText, facts, levels, topPrompt, links}.
(function () {
  const HA = globalThis.HA, h = HA.h;
  const MODES = { year: 'Guess the year', first: 'Which came first?', top: 'Biggest of the year' };
  const ROUND = 10;
  let root, card, side, cfg, game, mountedFor = null;

  function mount(el) {
    root = el;
    card = h('div', { class: 'quiz-card' });
    side = h('div', { class: 'quiz-side' });
    root.append(
      h('div', { class: 'view-head' }, h('div', {}, h('h1', {}, 'Quiz'), h('p', {}, 'Ten questions a round. The genre spotlight and the decades you pick narrow the pool, so you can drill one era at a time.'))),
      h('div', { class: 'quiz' }, card, side));
  }

  const rnd = (n) => Math.floor(Math.random() * n);
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const decadeOf = (y) => Math.floor(y / 10) * 10;
  const inDecades = (y) => !cfg.decades.length || cfg.decades.includes(decadeOf(y));

  const LEVELS = () => HA.D.quiz.levels;
  function pool() {
    const N = LEVELS()[cfg.level][1];
    return HA.D.items.filter((x) => x.home && x.home.rank <= N && inDecades(x.home.p) && HA.lit(x.fam));
  }

  function newGame() {
    HA.setPref('quiz', cfg);
    game = { n: 0, results: [], used: new Set(), q: null };
    next();
  }

  function pickSong(p) {
    for (let tries = 0; tries < 50; tries++) { const x = p[rnd(p.length)]; if (!game.used.has(x.i)) { game.used.add(x.i); return x; } }
    return p[rnd(p.length)];
  }

  function next() {
    const p = pool(), D = HA.D;
    if (cfg.mode === 'top') {
      const ps = D.periods.filter((y) => inDecades(y) && D.byPeriod.get(y).length >= 10);
      if (!ps.length) { game.q = { empty: true }; renderCard(); return; }
      const y = ps[rnd(ps.length)], list = D.byPeriod.get(y);
      const opts = shuffle([list[0], ...shuffle(list.slice(3, 25)).slice(0, 3)]);
      game.q = { type: 'top', year: y, opts, answer: list[0].it.i };
    } else if (p.length < 2) {
      game.q = { empty: true };
    } else if (cfg.mode === 'year') {
      game.q = { type: 'year', song: pickSong(p), guess: Math.round((D.periods[0] + D.periods[D.periods.length - 1]) / 2) };
    } else {
      const a = pickSong(p);
      let b = null;
      const Y = D.quiz.yearOf;
      for (let tries = 0; tries < 200 && !b; tries++) { const c = p[rnd(p.length)]; const d = Math.abs(Y(c) - Y(a)); if (d >= 1 && d <= 8 && c.i !== a.i) b = c; }
      b = b || p.find((c) => Y(c) !== Y(a)) || p[rnd(p.length)];
      game.q = { type: 'first', opts: shuffle([a, b]) };
    }
    renderCard();
    renderSide();
  }

  function score(points, detail) {
    game.q.done = { points, detail };
    game.results.push(points);
    game.n++;
    renderCard();
    renderSide();
  }

  function renderCard() {
    const D = HA.D, q = game.q, lo = D.periods[0], hi = D.periods[D.periods.length - 1];
    card.replaceChildren();
    if (game.over) {
      const total = game.results.reduce((a, b) => a + b, 0);
      const key = `${HA.D.id}:best:${cfg.mode}:${cfg.level}`;
      const best = Math.max(total, HA.store.get(key, 0));
      HA.store.set(key, best);
      card.append(
        h('div', { class: 'q-prompt' }, 'Round complete'),
        h('div', { class: 'q-song' }, `${total} / ${ROUND * 100}`),
        h('div', { class: 'q-artist' }, `Your best at ${MODES[cfg.mode]} (${LEVELS()[cfg.level][0]}): ${best}`),
        h('div', { class: 'q-row' }, h('button', { class: 'btn primary', onclick: newGame }, 'Play again')));
      return;
    }
    if (!q) return;
    if (q.empty) {
      card.append(h('div', { class: 'q-prompt' }, 'No songs match'), h('p', {}, 'Pick more decades, a deeper level, or clear the genre spotlight.'));
      return;
    }
    card.append(h('div', { class: 'q-prompt' }, `Question ${Math.min(game.n + (q.done ? 0 : 1), ROUND)} of ${ROUND} · ${MODES[cfg.mode]}`));
    const nextBtn = () => h('div', { class: 'q-row' }, h('button', {
      class: 'btn primary', onclick: () => { if (game.n >= ROUND) { game.over = true; renderCard(); } else next(); },
    }, game.n >= ROUND ? 'See score' : 'Next question →'));

    if (q.type === 'year') {
      const x = q.song;
      const out = h('div', { class: 'q-year' }, q.guess);
      const slider = h('input', { id: 'q-slider', class: 'q-slider', type: 'range', min: lo, max: hi, value: q.guess, 'aria-label': 'Your guess', disabled: q.done ? true : null });
      slider.addEventListener('input', () => { q.guess = +slider.value; out.textContent = q.guess; });
      card.append(h('div', { class: 'q-song' }, x.title), h('div', { class: 'q-artist' }, x.sub), h('div', { style: { marginTop: '10px' } }, D.quiz.links(x)),
        h('div', { style: { marginTop: '22px' } }, out), slider,
        h('div', { class: 'note', style: { display: 'flex', justifyContent: 'space-between' } }, h('span', {}, lo), h('span', {}, hi)));
      if (!q.done) {
        const nudge = (d) => h('button', { class: 'btn', 'aria-label': d < 0 ? 'One year earlier' : 'One year later', onclick: () => { q.guess = Math.max(lo, Math.min(hi, q.guess + d)); slider.value = q.guess; out.textContent = q.guess; } }, d < 0 ? '−1' : '+1');
        card.append(h('div', { class: 'q-row' }, nudge(-1), nudge(1), h('button', {
          class: 'btn primary', onclick: () => {
            const off = Math.min(...D.quiz.yearsOk(x).map((y) => Math.abs(q.guess - y)));
            score(Math.max(0, 100 - 20 * off), off);
          },
        }, 'Lock it in')));
      } else {
        const off = q.done.detail;
        card.append(h('div', { class: 'q-result' },
          h('b', {}, off === 0 ? `Exactly: ${D.quiz.yearOf(x)}. +100` : `It’s ${D.quiz.yearOf(x)}. You were ${HA.plural(off, 'year')} off. +${q.done.points}`),
          h('div', { class: 'note' }, D.quiz.facts(x)),
          h('div', { style: { marginTop: '6px' } }, h('button', { class: 'btn', onclick: () => HA.open(x) }, 'Details'))), nextBtn());
      }
    } else if (q.type === 'first') {
      card.append(h('div', { class: 'q-song', style: { fontSize: 'clamp(26px,4vw,38px)' } }, D.quiz.firstPrompt));
      const [a, b] = q.opts;
      const earlier = D.quiz.firstOf(a) <= D.quiz.firstOf(b) ? a : b;
      card.append(h('div', { class: 'q-choices two' }, q.opts.map((x) => h('button', {
        class: 'q-choice' + (q.done ? (x === earlier ? ' right' : q.done.detail === x.i ? ' wrong' : '') : ''),
        disabled: q.done ? true : null,
        onclick: () => score(x === earlier ? 100 : 0, x.i),
      }, h('b', {}, x.title), h('span', {}, x.sub), q.done && h('div', { class: 'reveal' }, D.quiz.facts(x))))));
      if (q.done) card.append(h('div', { class: 'q-result' }, h('b', {}, q.done.points ? 'Right. +100' : 'Not this time.'), h('div', { class: 'note' }, `“${earlier.title}” ${D.quiz.firstText(earlier)}.`)), nextBtn());
    } else {
      card.append(h('div', { class: 'q-song' }, D.periodLabel(q.year)), h('div', { class: 'q-artist' }, D.quiz.topPrompt));
      card.append(h('div', { class: 'q-choices' }, q.opts.map((e) => h('button', {
        class: 'q-choice' + (q.done ? (e.it.i === q.answer ? ' right' : q.done.detail === e.it.i ? ' wrong' : '') : ''),
        disabled: q.done ? true : null,
        onclick: () => score(e.it.i === q.answer ? 100 : 0, e.it.i),
      }, h('b', {}, e.it.title), h('span', {}, e.it.sub), q.done && h('div', { class: 'reveal' }, `#${e.rank} of ${D.periodLabel(q.year)}`)))));
      if (q.done) card.append(h('div', { class: 'q-result' }, h('b', {}, q.done.points ? 'Right. +100' : `It was “${D.items[q.answer].title}”.`)), nextBtn());
    }
  }

  function renderSide() {
    const D = HA.D;
    const seg = (key, opts) => h('div', { class: 'seg', role: 'group' }, Object.entries(opts).map(([k, v]) => h('button', {
      'aria-pressed': String(cfg[key] === k), onclick: () => { cfg[key] = k; newGame(); },
    }, Array.isArray(v) ? v[0] : v)));
    const decs = [];
    for (const p of D.periods) if (!decs.includes(decadeOf(p))) decs.push(decadeOf(p));
    const total = game.results.reduce((a, b) => a + b, 0);
    side.replaceChildren(
      h('div', { class: 'panel' },
        h('div', { class: 'label-sm' }, 'Score'),
        h('div', { class: 'score-big' }, total),
        h('div', { class: 'dots' }, Array.from({ length: ROUND }, (_, k) => h('i', { class: k < game.results.length ? 'on' : '', style: { '--v': k < game.results.length ? 15 + game.results[k] * 0.85 : 0 }, title: k < game.results.length ? `+${game.results[k]}` : '' })))),
      h('div', { class: 'panel' },
        h('div', { class: 'label-sm' }, 'Game'), seg('mode', MODES),
        h('div', { class: 'label-sm', style: { marginTop: '12px' } }, 'Pool'), seg('level', LEVELS()),
        h('div', { class: 'note', style: { marginTop: '4px' } }, `Each ${D.periodNoun}’s top ${LEVELS()[cfg.level][1]}${HA.state.spot != null ? ', spotlit genre only' : ''}: ${HA.plural(pool().length, D.noun)}`),
        h('div', { class: 'label-sm', style: { marginTop: '12px' } }, 'Decades'),
        h('div', { class: 'tag-list', style: { marginTop: '4px' } }, decs.map((d) => h('button', {
          class: 'chip', 'aria-pressed': String(cfg.decades.includes(d)),
          onclick: () => { cfg.decades = cfg.decades.includes(d) ? cfg.decades.filter((x) => x !== d) : [...cfg.decades, d]; newGame(); },
        }, `${d}s`))),
        h('div', { class: 'note', style: { marginTop: '4px' } }, cfg.decades.length ? 'Tap again to drop a decade.' : 'All decades. Tap to narrow.')));
  }

  function render() {
    if (mountedFor !== HA.D) {
      mountedFor = HA.D;
      cfg = Object.assign({ mode: 'year', level: Object.keys(HA.D.quiz.levels)[0], decades: [] }, HA.pref('quiz', {}));
      if (!HA.D.quiz.levels[cfg.level]) cfg.level = Object.keys(HA.D.quiz.levels)[0];
      game = null;
    }
    if (!game) newGame(); else { renderCard(); renderSide(); }
  }

  HA.views.quiz = { mount, render };
  HA.on('spot', () => { if (root && !root.hidden && game) newGame(); });
})();
