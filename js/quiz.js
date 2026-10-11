// Quiz: ten questions on the current medium, opened from the header's Quiz
// button into the side drawer rather than a tab of its own, since the app is an
// explorer first. Three settings, kept per medium: the years, the difficulty
// and the genre. Question kinds live in questions.js; which songs, films and
// shows get asked follows each item's fame (set in the domain files). Missed
// items come back in later rounds.
(function () {
  const HA = globalThis.HA, h = HA.h;
  const ROUND = 10, REVIEW = 0.3, MISSED_MAX = 80;
  const sets = new Map();
  let game = null;

  const K = () => HA.quizKit;
  const kit = (D) => { if (!sets.has(D)) sets.set(D, HA.questions[D.id](D)); return sets.get(D); };
  const missedKey = () => `quiz:missed:${HA.D.id}`;
  const missed = () => new Set(HA.store.get(missedKey(), []));
  function remember(key, wrong) {
    const s = missed();
    s.delete(key);
    if (wrong) s.add(key);
    HA.store.set(missedKey(), [...s].slice(-MISSED_MAX));
  }

  // Settings, per medium: {from, to} decades, level ('familiar' | 'deeper'), fam (null for all).
  const decadesOf = (D) => [...new Set(D.periods.map((p) => Math.floor(p / 10) * 10))];
  function settings() {
    const D = HA.D, ds = decadesOf(D);
    const s = Object.assign({ from: ds[0], to: ds[ds.length - 1], level: 'familiar', fam: null }, HA.store.get(`quiz:settings:${D.id}`, {}));
    if (!ds.includes(s.from)) s.from = ds[0];
    if (!ds.includes(s.to)) s.to = ds[ds.length - 1];
    if (s.from > s.to) [s.from, s.to] = [s.to, s.from];
    if (s.fam != null && !D.fams[s.fam]) s.fam = null;
    return s;
  }
  const scopeOf = (st) => {
    const ds = decadesOf(HA.D);
    const all = st.from === ds[0] && st.to === ds[ds.length - 1];
    return { years: all ? null : [st.from, st.to + 9], fam: st.fam };
  };

  function context(sc, level) {
    const D = HA.D, Q = kit(D);
    const famOk = (x) => sc.fam == null || x.fam === sc.fam;
    const yearsOf = Q.years || ((x) => [Q.yearOf(x)]);
    const inYears = (ys) => !sc.years || ys.some((y) => y >= sc.years[0] && y <= sc.years[1]);
    const inScope = (x) => famOk(x) && inYears(yearsOf(x));
    const byFame = (a, b) => b.fame - a.fame;
    const pool = Q.items.filter(inScope).sort(byFame);
    // An artist belongs to a range when a good share of their fame is from it:
    // the Beatles had a 1982 hit, but they are not an '80s act.
    const mostlyIn = (e) => {
      if (!sc.years) return true;
      let t = 0, a = 0;
      for (const x of Q.entItems(e)) { t += x.fame; if (inYears(yearsOf(x))) a += x.fame; }
      return t > 0 && a / t >= 0.4;
    };
    const ents = Q.ents.filter((e) => famOk(e) && mostlyIn(e)).sort(byFame);
    // Familiar draws from the best-known fifth of the scope's songs, films or
    // shows; Deeper from the next two fifths. Artists and people are many more
    // per hit, so their familiar tier is the top 8%.
    const tier = (list, frac = 0.2) => {
      const n = Math.max(25, Math.round(list.length * frac));
      if (list.length <= n) return list;
      return level === 'deeper' ? list.slice(n, n * 3) : list.slice(0, n);
    };
    const used = new Set(), miss = missed();
    const picker = (tag, tierList, all) => (filter = () => true) => {
      const ok = (x) => !used.has(tag + x.i) && filter(x);
      const again = all.filter((x) => miss.has(tag + x.i) && ok(x));
      let x = null;
      if (again.length && Math.random() < REVIEW) x = again[K().rnd(again.length)];
      else { const cands = tierList.filter(ok); if (cands.length) x = K().pick(cands); }
      // A small pool (TV news shows) may ask about the same item twice, in different ways.
      if (!x && all.length < 15) { const cands = all.filter(filter); if (cands.length) x = K().pick(cands); }
      if (x) used.add(tag + x.i);
      return x;
    };
    const periods = D.periods.filter((p) => !sc.years || (p >= sc.years[0] && p <= sc.years[1]));
    const decades = [...new Set(periods.map((p) => Math.floor(p / 10) * 10))].filter((d) => D.periods.filter((p) => Math.floor(p / 10) * 10 === d).length >= 5);
    return {
      level, pool, ents, inScope, famOk, top: tier(pool),
      item: picker('i', tier(pool), pool),
      ent: picker('e', tier(ents, 0.08), ents),
      year: () => (periods.length ? periods[K().rnd(periods.length)] : null),
      decade: () => (decades.length ? decades[K().rnd(decades.length)] : null),
    };
  }

  function nextQuestion() {
    const ks = Object.entries(kit(HA.D).kinds).map(([id, k]) => ({ id, w: k.w, make: k.make }));
    for (let tries = 0; tries < 40 && ks.length; tries++) {
      let k = K().pick(ks, (x) => x.w);
      // Avoid the same kind twice running when there's a choice.
      if (k.id === game.lastKind && ks.length > 1 && Math.random() < 0.6) k = K().pick(ks, (x) => x.w);
      const q = k.make(game.ctx);
      if (!q || !(q.choices || q.year != null)) continue;
      // Never the same question about the same thing twice in a round.
      const key = `${k.id}:${q.entity ? 'e' : 'i'}${q.subject.i}`;
      if (game.asked.has(key)) continue;
      game.asked.add(key);
      q.kind = k.id; game.lastKind = k.id;
      return q;
    }
    return null;
  }

  function start() {
    const st = settings(), sc = scopeOf(st);
    game = { st, scope: sc, level: st.level, ctx: context(sc, st.level), n: 0, results: [], log: [], q: null, lastKind: null, asked: new Set() };
    game.q = nextQuestion();
    render(true);
  }

  function answer(points, detail) {
    const q = game.q;
    q.done = { points, detail };
    game.results.push(points);
    game.log.push(q);
    game.n++;
    remember((q.entity ? 'e' : 'i') + q.subject.i, points < 1);
    render();
  }

  function next() {
    if (game.n >= ROUND) { game.over = true; render(); return; }
    game.q = nextQuestion();
    render();
  }

  // ── rendering ──────────────────────────────────────────────────────────────
  const fmt = (n) => (n % 1 ? `${Math.floor(n)}½` : String(n));
  // Changing a setting starts a fresh round.
  function change(patch) {
    HA.store.set(`quiz:settings:${HA.D.id}`, Object.assign(settings(), patch));
    start();
  }
  function settingsRow() {
    const D = HA.D, st = game.st, ds = decadesOf(D);
    const select = (label, value, opts, onPick) => h('select', { 'aria-label': label, onchange: (e) => onPick(e.target.value) },
      opts.map(([v, l]) => h('option', { value: v, selected: String(v) === String(value) ? true : null }, l)));
    const dec = (d) => `${d}s`;
    return h('div', { class: 'qz-settings' },
      h('span', { class: 'qz-range' },
        select('From', st.from, ds.map((d) => [d, dec(d)]), (v) => change({ from: +v, to: Math.max(+v, st.to) })),
        h('span', { class: 'note' }, 'to'),
        select('To', st.to, ds.map((d) => [d, dec(d)]), (v) => change({ to: +v, from: Math.min(+v, st.from) }))),
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Difficulty' }, [['familiar', 'Familiar'], ['deeper', 'Deeper cuts']].map(([k, l]) =>
        h('button', { 'aria-pressed': String(st.level === k), onclick: () => change({ level: k }) }, l))),
      select('Genre', st.fam ?? '', [['', 'All genres'], ...D.fams.map((f, i) => [i, f.label])], (v) => change({ fam: v === '' ? null : +v })));
  }

  function render(fresh) {
    const D = HA.D;
    const node = h('div', { class: 'qz' },
      h('div', { class: 'label-sm' }, 'Quiz'),
      h('div', { class: 'qz-scope' }, D.label),
      settingsRow(),
      game.over ? summary() : card());
    const body = document.getElementById('drawer-body'), drawer = document.getElementById('drawer');
    if (fresh || drawer.hidden || !body.querySelector('.qz')) HA.openDrawer(node);
    else body.replaceChildren(node);
    (body.querySelector('.qz-focus') || body.querySelector('.q-choice:not(:disabled)'))?.focus({ preventScroll: true });
  }

  function progress() {
    const right = game.results.reduce((a, b) => a + b, 0);
    return h('div', { class: 'qz-progress' },
      h('span', { class: 'note' }, `Question ${Math.min(game.n + (game.q?.done ? 0 : 1), ROUND)} of ${ROUND} · ${fmt(right)} right`),
      h('div', { class: 'dots' }, Array.from({ length: ROUND }, (_, k) => h('i', { class: k < game.results.length ? 'on' : '', style: { '--v': k < game.results.length ? 15 + game.results[k] * 85 : 0 } }))));
  }

  function card() {
    const D = HA.D, q = game.q;
    if (!q) return h('div', { class: 'q-result' }, h('b', {}, 'Not enough here for a quiz.'), h('div', { class: 'note' }, 'Try a wider range of years, the other difficulty, or all genres.'));
    const parts = [progress(),
      h('div', { class: 'q-prompt' }, q.kicker),
      h('div', { class: 'qz-q' + (q.prompt.length > 42 ? ' long' : '') }, q.prompt),
      q.sub && h('div', { class: 'qz-sub' }, q.sub)];
    if (q.choices) {
      parts.push(h('div', { class: 'q-choices' }, q.choices.map((c, k) => h('button', {
        class: 'q-choice' + (q.done ? (c.ok ? ' right' : q.done.detail === k ? ' wrong' : '') : ''),
        disabled: q.done ? true : null, 'data-k': k + 1,
        onclick: () => answer(c.ok ? 1 : 0, k),
      }, h('b', {}, c.label), c.sub && h('span', {}, c.sub), q.done && c.reveal && h('div', { class: 'reveal' }, c.reveal)))));
      if (q.done) parts.push(result(q.done.points ? 'Right.' : 'Not this one.'));
    } else {
      // The slider spans the data, widened for an answer just outside it (a 1949 premiere).
      const lo = Math.min(D.periods[0], q.year), hi = Math.max(D.periods[D.periods.length - 1], q.year);
      if (q.guess == null) q.guess = game.scope.years ? Math.round((game.scope.years[0] + game.scope.years[1]) / 2) : Math.round((lo + hi) / 2);
      const out = h('div', { class: 'q-year' }, q.guess);
      const slider = h('input', { class: 'q-slider' + (q.done ? '' : ' qz-focus'), type: 'range', min: lo, max: hi, value: q.guess, 'aria-label': 'Your guess', disabled: q.done ? true : null });
      const set = (v) => { q.guess = Math.max(lo, Math.min(hi, v)); slider.value = q.guess; out.textContent = q.guess; };
      slider.addEventListener('input', () => set(+slider.value));
      parts.push(out, slider, h('div', { class: 'note qz-ends' }, h('span', {}, lo), h('span', {}, hi)));
      if (!q.done) {
        const nudge = (d) => h('button', { class: 'btn', 'aria-label': d < 0 ? 'One year earlier' : 'One year later', onclick: () => set(q.guess + d) }, d < 0 ? '−1' : '+1');
        parts.push(h('div', { class: 'q-row' }, nudge(-1), nudge(1), h('button', { class: 'btn primary qz-lock', onclick: lock }, 'Lock it in')));
      } else {
        const off = q.done.detail;
        parts.push(result(off <= q.tol[0] ? (off ? `Close enough: it’s ${q.year}.` : `Exactly ${q.year}.`) : off <= q.tol[1] ? `Near: it’s ${q.year}, ${HA.plural(off, 'year')} off.` : `It’s ${q.year}. You were ${HA.plural(off, 'year')} off.`));
      }
    }
    return h('div', {}, ...parts);
  }

  function lock() {
    const q = game.q;
    const off = Math.min(...(q.ok || [q.year]).map((y) => Math.abs(q.guess - y)));
    answer(off <= q.tol[0] ? 1 : off <= q.tol[1] ? 0.5 : 0, off);
  }

  function result(head) {
    return h('div', {},
      h('div', { class: 'q-result' }, h('b', {}, head), h('div', { class: 'note' }, game.q.reveal)),
      h('div', { class: 'q-row' }, h('button', { class: 'btn primary qz-focus qz-next', onclick: next }, game.n >= ROUND ? 'See how you did' : 'Next question →')));
  }

  function summary() {
    const D = HA.D, total = game.results.reduce((a, b) => a + b, 0);
    const answerOf = (q) => (q.choices ? q.choices.find((c) => c.ok).label : String(q.year));
    return h('div', {},
      h('div', { class: 'q-year' }, `${fmt(total)} / ${ROUND}`),
      h('ol', { class: 'qz-log' }, game.log.map((q, k) => h('li', { class: game.results[k] >= 1 ? 'ok' : game.results[k] ? 'half' : 'miss' },
        h('span', { class: 'mark', 'aria-label': game.results[k] >= 1 ? 'right' : game.results[k] ? 'close' : 'missed' }, game.results[k] >= 1 ? '✓' : game.results[k] ? '≈' : '✗'),
        h('button', { class: 'linkish', onclick: () => (q.entity ? HA.showEntity(q.subject.i) : HA.open(q.subject)) },
          h('span', { class: 'note' }, q.kicker + ' '), q.prompt.length > 60 ? q.prompt.slice(0, 58) + '…' : q.prompt, h('b', {}, ' → ' + answerOf(q)))))),
      h('div', { class: 'note' }, missed().size ? 'Ones you missed come back in later rounds.' : ''),
      h('div', { class: 'q-row' }, h('button', { class: 'btn primary qz-focus', onclick: start }, 'Another round')));
  }

  // ── entry points ───────────────────────────────────────────────────────────
  HA.quiz = {
    // Reopening mid-round picks up where it left off.
    open() { if (game && !game.over) render(true); else start(); },
    // n questions for {years: [y0, y1] | null, fam} without rendering, for tools/test-quiz.mjs.
    sample(scope, level, n) {
      const saved = game, sc = Object.assign({ years: null, fam: null }, scope);
      game = { scope: sc, level, ctx: context(sc, level), lastKind: null, asked: new Set() };
      const out = [];
      for (let k = 0; k < n; k++) { const q = nextQuestion(); if (!q) break; out.push(q); }
      game = saved;
      return out;
    },
  };
  HA.on('domain', () => { game = null; });
  document.addEventListener('keydown', (e) => {
    const box = document.querySelector('#drawer:not([hidden]) .qz');
    if (!box || !game || e.target.closest?.('input[type=text], input[type=search], select')) return;
    if (/^[1-4]$/.test(e.key)) box.querySelector(`.q-choice[data-k="${e.key}"]:not(:disabled)`)?.click();
    else if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') (box.querySelector('.qz-next') || box.querySelector('.qz-lock'))?.click();
  });
})();
