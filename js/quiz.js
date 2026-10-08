// Quiz: three ten-question games for fixing hits in time.
(function () {
  const HA = globalThis.HA, h = HA.h;
  const MODES = { year: 'Guess the year', first: 'Which came first?', top: 'Biggest hit of the year' };
  const LEVELS = { smash: ['Smashes', 10], hits: ['Top 40', 40], deep: ['Deep cuts', 100] };
  const ROUND = 10;
  let root, card, side, cfg, game;

  function mount(el) {
    root = el;
    cfg = Object.assign({ mode: 'year', level: 'smash', decades: [] }, HA.store.get('quiz', {}));
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

  function pool() {
    const N = LEVELS[cfg.level][1];
    return HA.m.songs.filter((x) => x.yearRank <= N && inDecades(x.year) && HA.lit(x.fam));
  }

  function newGame() {
    HA.store.set('quiz', cfg);
    game = { n: 0, results: [], used: new Set(), q: null };
    next();
  }

  function pickSong(p) {
    for (let tries = 0; tries < 50; tries++) { const x = p[rnd(p.length)]; if (!game.used.has(x.i)) { game.used.add(x.i); return x; } }
    return p[rnd(p.length)];
  }

  function next() {
    const p = pool(), m = HA.m;
    if (cfg.mode === 'top') {
      const years = m.years.filter((y) => inDecades(y) && m.byYear.get(y).length > 30);
      if (!years.length) { game.q = { empty: true }; renderCard(); return; }
      const y = years[rnd(years.length)], list = m.byYear.get(y);
      const opts = shuffle([list[0], ...shuffle(list.slice(3, 25)).slice(0, 3)]);
      game.q = { type: 'top', year: y, opts, answer: list[0].i };
    } else if (p.length < 2) {
      game.q = { empty: true };
    } else if (cfg.mode === 'year') {
      game.q = { type: 'year', song: pickSong(p), guess: Math.round((m.firstYear + m.lastYear) / 2) };
    } else {
      const a = pickSong(p);
      let b = null;
      for (let tries = 0; tries < 200 && !b; tries++) { const c = p[rnd(p.length)]; const d = Math.abs(c.year - a.year); if (d >= 1 && d <= 8 && c.i !== a.i) b = c; }
      b = b || p.find((c) => c.year !== a.year) || p[rnd(p.length)];
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

  function songFacts(x) {
    return `${HA.peakText(x)} · #${x.yearRank} of ${x.year} · debuted ${HA.fmtMonth(x.first)}`;
  }

  function renderCard() {
    const m = HA.m, q = game.q;
    card.replaceChildren();
    if (game.over) {
      const total = game.results.reduce((a, b) => a + b, 0);
      const key = `best:${cfg.mode}:${cfg.level}`;
      const best = Math.max(total, HA.store.get(key, 0));
      HA.store.set(key, best);
      card.append(
        h('div', { class: 'q-prompt' }, 'Round complete'),
        h('div', { class: 'q-song' }, `${total} / ${ROUND * 100}`),
        h('div', { class: 'q-artist' }, `Your best at ${MODES[cfg.mode]} (${LEVELS[cfg.level][0]}): ${best}`),
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
      const slider = h('input', { id: 'q-slider', class: 'q-slider', type: 'range', min: m.firstYear, max: m.lastYear, value: q.guess, 'aria-label': 'Your guess', disabled: q.done ? true : null });
      slider.addEventListener('input', () => { q.guess = +slider.value; out.textContent = q.guess; });
      card.append(h('div', { class: 'q-song' }, x.title), h('div', { class: 'q-artist' }, x.credit), h('div', { style: { marginTop: '10px' } }, HA.listenLinks(x)),
        h('div', { style: { marginTop: '22px' } }, out), slider,
        h('div', { class: 'note', style: { display: 'flex', justifyContent: 'space-between' } }, h('span', {}, m.firstYear), h('span', {}, m.lastYear)));
      if (!q.done) {
        const nudge = (d) => h('button', { class: 'btn', 'aria-label': d < 0 ? 'One year earlier' : 'One year later', onclick: () => { q.guess = Math.max(m.firstYear, Math.min(m.lastYear, q.guess + d)); slider.value = q.guess; out.textContent = q.guess; } }, d < 0 ? '−1' : '+1');
        card.append(h('div', { class: 'q-row' }, nudge(-1), nudge(1), h('button', {
          class: 'btn primary', onclick: () => {
            // December hits count for either year: the chart year or the calendar year.
            const off = Math.min(Math.abs(q.guess - x.year), Math.abs(q.guess - m.weekYear[x.peakWeek]));
            score(Math.max(0, 100 - 20 * off), off);
          },
        }, 'Lock it in')));
      } else {
        const off = q.done.detail;
        card.append(h('div', { class: 'q-result' },
          h('b', {}, off === 0 ? `Exactly: ${x.year}. +100` : `It’s ${x.year}. You were ${HA.plural(off, 'year')} off. +${q.done.points}`),
          h('div', { class: 'note' }, songFacts(x)),
          h('div', { style: { marginTop: '6px' } }, h('button', { class: 'btn', onclick: () => HA.openSong(x.i) }, 'Song details'))), nextBtn());
      }
    } else if (q.type === 'first') {
      card.append(h('div', { class: 'q-song', style: { fontSize: 'clamp(26px,4vw,38px)' } }, 'Which was a hit first?'));
      const [a, b] = q.opts;
      const earlier = a.first <= b.first ? a : b;
      card.append(h('div', { class: 'q-choices two' }, q.opts.map((x) => h('button', {
        class: 'q-choice' + (q.done ? (x === earlier ? ' right' : q.done.detail === x.i ? ' wrong' : '') : ''),
        disabled: q.done ? true : null,
        onclick: () => score(x === earlier ? 100 : 0, x.i),
      }, h('b', {}, x.title), h('span', {}, x.credit), q.done && h('div', { class: 'reveal' }, `${HA.fmtMonth(x.first)} · ${HA.peakText(x)}`)))));
      if (q.done) card.append(h('div', { class: 'q-result' }, h('b', {}, q.done.points ? 'Right. +100' : 'Not this time.'), h('div', { class: 'note' }, `“${earlier.title}” debuted ${HA.fmtMonth(earlier.first)}.`)), nextBtn());
    } else {
      card.append(h('div', { class: 'q-song' }, String(q.year)), h('div', { class: 'q-artist' }, 'Which was the biggest hit of the chart year?'));
      card.append(h('div', { class: 'q-choices' }, q.opts.map((x) => h('button', {
        class: 'q-choice' + (q.done ? (x.i === q.answer ? ' right' : q.done.detail === x.i ? ' wrong' : '') : ''),
        disabled: q.done ? true : null,
        onclick: () => score(x.i === q.answer ? 100 : 0, x.i),
      }, h('b', {}, x.title), h('span', {}, x.credit), q.done && h('div', { class: 'reveal' }, `#${x.yearRank} of ${q.year} · ${HA.peakText(x)}`)))));
      if (q.done) card.append(h('div', { class: 'q-result' }, h('b', {}, q.done.points ? 'Right. +100' : `It was “${m.songs[q.answer].title}”.`)), nextBtn());
    }
  }

  function renderSide() {
    const m = HA.m;
    const seg = (key, opts) => h('div', { class: 'seg', role: 'group' }, Object.entries(opts).map(([k, v]) => h('button', {
      'aria-pressed': String(cfg[key] === k), onclick: () => { cfg[key] = k; newGame(); },
    }, Array.isArray(v) ? v[0] : v)));
    const decs = [];
    for (let d = decadeOf(m.firstYear); d <= m.lastYear; d += 10) decs.push(d);
    const total = game.results.reduce((a, b) => a + b, 0);
    side.replaceChildren(
      h('div', { class: 'panel' },
        h('div', { class: 'label-sm' }, 'Score'),
        h('div', { class: 'score-big' }, total),
        h('div', { class: 'dots' }, Array.from({ length: ROUND }, (_, k) => h('i', { class: k < game.results.length ? 'on' : '', style: { '--v': k < game.results.length ? 15 + game.results[k] * 0.85 : 0 }, title: k < game.results.length ? `+${game.results[k]}` : '' })))),
      h('div', { class: 'panel' },
        h('div', { class: 'label-sm' }, 'Game'), seg('mode', MODES),
        h('div', { class: 'label-sm', style: { marginTop: '12px' } }, 'Pool'), seg('level', LEVELS),
        h('div', { class: 'note', style: { marginTop: '4px' } }, `Each chart year’s top ${LEVELS[cfg.level][1]}${HA.state.spot != null ? ', spotlit genre only' : ''}: ${pool().length.toLocaleString()} songs`),
        h('div', { class: 'label-sm', style: { marginTop: '12px' } }, 'Decades'),
        h('div', { class: 'tag-list', style: { marginTop: '4px' } }, decs.map((d) => h('button', {
          class: 'chip', 'aria-pressed': String(cfg.decades.includes(d)),
          onclick: () => { cfg.decades = cfg.decades.includes(d) ? cfg.decades.filter((x) => x !== d) : [...cfg.decades, d]; newGame(); },
        }, d === 1950 ? '1958–59' : `${d}s`))),
        h('div', { class: 'note', style: { marginTop: '4px' } }, cfg.decades.length ? 'Tap again to drop a decade.' : 'All decades. Tap to narrow.')));
  }

  function render() {
    if (!game) newGame(); else { renderCard(); renderSide(); }
  }

  HA.views.quiz = { mount, render };
  HA.on('spot', () => { if (root && !root.hidden && game) newGame(); });
})();
