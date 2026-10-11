// Shared plumbing for every medium: DOM helpers, state and events, colours,
// dates, tooltip, the details drawer, search and the genre legend.
//
// Each medium (music, movies, TV) registers a *domain*: an adapter that turns
// its data into the shapes the views read. The views never look at songs or
// films directly, only at a domain's items, periods and entries:
//   item   {i, title, sub, fam, src, home: {p, rank}, t0}
//   entry  {it, rank, value} in D.byPeriod.get(p), sorted by rank
// See music.js for the full contract.
(function () {
  const HA = globalThis.HA || (globalThis.HA = {});
  HA.domains = HA.domains || {};
  HA.views = HA.views || {};

  HA.h = function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      // Custom properties (--c) only take via setProperty, not assignment.
      else if (k === 'style' && typeof v === 'object') for (const [p, val] of Object.entries(v)) { if (p.startsWith('--')) el.style.setProperty(p, val); else el.style[p] = val; }
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : String(kid));
    return el;
  };
  const SVGNS = 'http://www.w3.org/2000/svg';
  HA.s = function s(tag, attrs, ...kids) {
    const el = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  };
  HA.esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  HA.plural = (n, w, ws) => `${n.toLocaleString()} ${n === 1 ? w : ws || w + 's'}`;

  // ── state & events ─────────────────────────────────────────────────────────
  HA.state = { domain: 'music', view: 'wall', spot: null, entity: null };
  const subs = new Map();
  HA.on = (ev, fn) => { if (!subs.has(ev)) subs.set(ev, []); subs.get(ev).push(fn); };
  HA.emit = (ev, arg) => (subs.get(ev) || []).forEach((fn) => fn(arg));
  HA.setSpot = (f) => { HA.state.spot = HA.state.spot === f ? null : f; HA.emit('spot'); };
  // An item is "lit" unless a genre spotlight is on and it's another genre.
  HA.lit = (fam) => HA.state.spot == null || HA.state.spot === (fam < 0 ? 'unknown' : fam);
  HA.store = {
    get(k, d) { try { const v = localStorage.getItem('hit-atlas:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('hit-atlas:' + k, JSON.stringify(v)); } catch { /* storage blocked: fine */ } },
  };
  // Per-domain remembered settings, e.g. HA.pref('decade', 1980).
  HA.pref = (k, d) => HA.store.get(`${HA.state.domain}:${k}`, d);
  HA.setPref = (k, v) => HA.store.set(`${HA.state.domain}:${k}`, v);

  // ── colours ────────────────────────────────────────────────────────────────
  // Every domain maps its families onto the same eight validated slots, so a
  // slot's position in the river stack never changes between media.
  HA.famVar = (f) => {
    if (f < 0) return 'var(--c-unknown)';
    const slot = HA.D.fams[f].slot;
    return slot ? `var(--c${slot})` : 'var(--c-other)';
  };
  HA.palette = function () {
    const cs = getComputedStyle(document.documentElement);
    const get = (n) => cs.getPropertyValue(n).trim();
    const fams = HA.D.fams.map((f) => get(f.slot ? `--c${f.slot}` : '--c-other'));
    return { fams, unknown: get('--c-unknown'), surface: get('--surface'), ink: get('--ink'), line: get('--line'), muted: get('--muted'), bg: get('--bg') };
  };
  HA.famColour = (pal, f) => (f < 0 ? pal.unknown : pal.fams[f]);
  const lum = (hex) => {
    const n = parseInt(hex.replace('#', ''), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  // Ink for text sitting on a genre fill: whichever of near-black/white contrasts more.
  HA.inkOn = (hex) => { const L = lum(hex); return (L + 0.05) / 0.0105 > 1.05 / (L + 0.05) ? '#12141a' : '#ffffff'; };
  HA.swatch = (f, extra) => HA.h('i', { class: 'sw' + (f < 0 ? ' unknown' : ''), style: Object.assign({ '--c': HA.famVar(f) }, extra || {}) });

  // ── dates ──────────────────────────────────────────────────────────────────
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  HA.fmtDate = (d) => `${MONTHS[+d.slice(5, 7) - 1]} ${+d.slice(8, 10)}, ${d.slice(0, 4)}`;
  HA.fmtMonthOf = (d) => `${MONTHS[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`;
  HA.dayOfYear = (d) => { const t = new Date(d + 'T00:00:00Z'); return (t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5; };
  // Fractional year, the shared time axis for lanes and trajectories.
  HA.yearFrac = (d) => +d.slice(0, 4) + HA.dayOfYear(d) / 365.25;
  HA.addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);

  // ── tooltip ────────────────────────────────────────────────────────────────
  const tip = () => document.getElementById('tip');
  HA.tip = function (html, x, y) {
    const t = tip();
    t.innerHTML = html;
    t.hidden = false;
    const r = t.getBoundingClientRect();
    const px = x + 14 + r.width > innerWidth - 8 ? x - r.width - 14 : x + 14;
    const py = y + 14 + r.height > innerHeight - 8 ? y - r.height - 10 : y + 14;
    t.style.left = Math.max(8, px) + 'px';
    t.style.top = Math.max(8, py) + 'px';
  };
  HA.untip = () => { tip().hidden = true; };
  HA.bindTip = (el, html, onclick) => {
    el.addEventListener('pointermove', (e) => HA.tip(typeof html === 'function' ? html() : html, e.clientX, e.clientY));
    el.addEventListener('pointerleave', HA.untip);
    if (onclick) el.addEventListener('click', onclick);
    return el;
  };

  // ── drawer ─────────────────────────────────────────────────────────────────
  HA.openDrawer = function (...nodes) {
    const body = document.getElementById('drawer-body');
    body.replaceChildren(...nodes.flat().filter(Boolean));
    const d = document.getElementById('drawer');
    d.hidden = false;
    d.scrollTop = 0;
    document.getElementById('drawer-close').focus({ preventScroll: true });
  };
  HA.closeDrawer = () => { document.getElementById('drawer').hidden = true; };
  HA.open = (it) => HA.D.open(it);
  // Header block shared by every drawer: family, its source, title, subtitle.
  HA.drawerHead = (it, title, sub) => {
    const D = HA.D, h = HA.h;
    return [
      h('div', { class: 'd-fam' }, HA.swatch(it.fam), it.fam < 0 ? 'Genre unknown' : D.fams[it.fam].label),
      h('div', { class: 'd-src' }, D.srcLabels[it.src] || ''),
      h('div', { class: 'd-title' }, title),
      sub && h('div', { class: 'd-credit' }, sub),
      it.award && h('div', { class: 'd-award' }, '★ ' + it.award),
    ];
  };
  HA.awardTip = (it) => (it.award ? `<div class="t-aw">★ ${HA.esc(it.award)}</div>` : '');
  HA.stat = (big, small) => HA.h('div', { class: 'stat' }, HA.h('b', {}, big), HA.h('span', {}, small));
  HA.searchLinks = (q, sites) => {
    const enc = encodeURIComponent(q);
    const URLS = {
      YouTube: `https://www.youtube.com/results?search_query=${enc}`,
      Spotify: `https://open.spotify.com/search/${enc}`,
      'Apple Music': `https://music.apple.com/us/search?term=${enc}`,
      IMDb: `https://www.imdb.com/find/?q=${enc}`,
      Wikipedia: `https://en.wikipedia.org/w/index.php?search=${enc}`,
      JustWatch: `https://www.justwatch.com/us/search?q=${enc}`,
    };
    return HA.h('div', { class: 'listen' }, sites.map((s) => HA.h('a', { href: URLS[s], target: '_blank', rel: 'noopener' }, s + ' ↗')));
  };

  HA.showEntity = function (i) {
    HA.closeDrawer();
    HA.state.entity = i;
    const target = `${HA.state.domain}-lanes`;
    if (location.hash !== '#' + target) location.hash = target;
    else HA.emit('entity');
  };

  // ── search ─────────────────────────────────────────────────────────────────
  const fold = (t) => t.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  HA.initSearch = function () {
    const input = document.getElementById('search'), box = document.getElementById('search-results');
    let keys = null, keysFor = null, items = [], active = -1;
    const index = () => {
      if (keysFor === HA.D) return;
      keysFor = HA.D;
      // When the entities are the items themselves (TV shows), list them once.
      keys = { items: HA.D.items.map((x) => fold(x.title)), ents: HA.D.entitiesAreItems ? [] : (HA.D.entities || []).map((e) => fold(e.name)) };
    };
    const pick = (it) => { box.hidden = true; input.blur(); it.kind === 'ent' ? HA.showEntity(it.i) : HA.open(HA.D.items[it.i]); };
    const render = () => {
      const D = HA.D;
      index();
      box.replaceChildren();
      const q = fold(input.value.trim());
      if (q.length < 2) { box.hidden = true; return; }
      const rank = (key) => (key === q ? 0 : key.startsWith(q) ? 1 : key.includes(' ' + q) ? 2 : key.includes(q) ? 3 : -1);
      const ents = [], its = [];
      keys.ents.forEach((k, i) => { const r = rank(k); if (r >= 0) ents.push([r, -D.entities[i].weight, i]); });
      keys.items.forEach((k, i) => { const r = rank(k); if (r >= 0) its.push([r, -D.items[i].weight, i]); });
      ents.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      its.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      items = [...ents.slice(0, 5).map(([, , i]) => ({ kind: 'ent', i })), ...its.slice(0, 8).map(([, , i]) => ({ kind: 'item', i }))];
      active = -1;
      if (!items.length) { box.append(HA.h('div', { class: 'sr-group' }, 'No matches')); box.hidden = false; return; }
      let last = '';
      items.forEach((it, k) => {
        if (it.kind !== last) box.append(HA.h('div', { class: 'sr-group' }, it.kind === 'ent' ? D.entityNouns : D.nouns));
        last = it.kind;
        const x = it.kind === 'ent' ? D.entities[it.i] : D.items[it.i];
        const sub = it.kind === 'ent' ? x.sub : D.searchSub(x);
        box.append(HA.h('button', { class: 'sr-item', onmousedown: (e) => { e.preventDefault(); pick(it); } },
          HA.swatch(x.fam), HA.h('div', { class: 'sr-main' }, HA.h('b', {}, it.kind === 'ent' ? x.name : x.title), HA.h('span', {}, sub))));
      });
      box.hidden = false;
    };
    input.addEventListener('input', render);
    input.addEventListener('focus', render);
    input.addEventListener('blur', () => setTimeout(() => { box.hidden = true; }, 120));
    input.addEventListener('keydown', (e) => {
      const btns = [...box.querySelectorAll('.sr-item')];
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && btns.length) {
        e.preventDefault();
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length;
        btns.forEach((b, k) => b.classList.toggle('active', k === active));
      } else if (e.key === 'Enter' && items.length) pick(items[Math.max(active, 0)]);
      else if (e.key === 'Escape') { box.hidden = true; input.blur(); }
    });
    HA.on('domain', () => { input.value = ''; input.placeholder = HA.D.searchHint; box.hidden = true; });
  };

  // ── legend / spotlight ─────────────────────────────────────────────────────
  HA.renderLegend = function () {
    const el = document.getElementById('legend');
    el.replaceChildren();
    const chips = [];
    const add = (key, label, title) => {
      const b = HA.h('button', { class: 'chip', title, 'aria-pressed': 'false', onclick: () => HA.setSpot(key) }, HA.swatch(key === 'unknown' ? -1 : key), label);
      chips.push([key, b]);
      el.append(b);
    };
    HA.D.fams.forEach((f) => add(f.i, f.label, f.blurb));
    if (HA.D.hasUnknown) add('unknown', 'No data', 'No genre data');
    el.append(HA.h('span', { class: 'hint' }, 'Tap a genre to spotlight it'));
    const sync = () => chips.forEach(([k, b]) => {
      b.setAttribute('aria-pressed', String(HA.state.spot === k));
      b.classList.toggle('dim', HA.state.spot != null && HA.state.spot !== k);
    });
    sync();
    HA.legendSync = sync;
  };
  HA.on('spot', () => HA.legendSync && HA.legendSync());
})();
