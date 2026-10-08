// Shared UI plumbing: DOM helper, colours, formatting, tooltip, state + events,
// the song drawer and search.
(function () {
  const HA = globalThis.HA;

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

  // ── state & events ─────────────────────────────────────────────────────────
  HA.state = { view: 'wall', spot: null, decade: 1980, topN: 20, artist: null };
  const subs = new Map();
  HA.on = (ev, fn) => { if (!subs.has(ev)) subs.set(ev, []); subs.get(ev).push(fn); };
  HA.emit = (ev, arg) => (subs.get(ev) || []).forEach((fn) => fn(arg));
  HA.setSpot = (f) => { HA.state.spot = HA.state.spot === f ? null : f; HA.emit('spot'); };
  // A song is "lit" unless a genre spotlight is on and it's another genre.
  HA.lit = (fam) => HA.state.spot == null || HA.state.spot === (fam < 0 ? 'unknown' : fam);

  HA.store = {
    get(k, d) { try { const v = localStorage.getItem('hit-atlas:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('hit-atlas:' + k, JSON.stringify(v)); } catch { /* storage blocked: fine */ } },
  };

  // ── colours ────────────────────────────────────────────────────────────────
  HA.famVar = (f) => (f < 0 ? 'var(--g-unknown)' : `var(--g-${HA.m.fams[f].id})`);
  // Canvas and contrast maths need real values, read from the live theme.
  HA.palette = function () {
    const cs = getComputedStyle(document.documentElement);
    const get = (n) => cs.getPropertyValue(n).trim();
    const fams = HA.m.fams.map((f) => get('--g-' + f.id));
    return { fams, unknown: get('--g-unknown'), surface: get('--surface'), ink: get('--ink'), line: get('--line'), muted: get('--muted'), bg: get('--bg') };
  };
  const lum = (hex) => {
    const n = parseInt(hex.replace('#', ''), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  // Ink for text sitting on a genre fill: whichever of near-black/white contrasts more.
  HA.inkOn = (hex) => { const L = lum(hex); return (L + 0.05) / 0.0105 > 1.05 / (L + 0.05) ? '#12141a' : '#ffffff'; };

  // ── formatting ─────────────────────────────────────────────────────────────
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  HA.fmtWeek = (w) => { const d = HA.m.weeks[w]; return `${MONTHS[+d.slice(5, 7) - 1]} ${+d.slice(8, 10)}, ${d.slice(0, 4)}`; };
  HA.fmtMonth = (w) => { const d = HA.m.weeks[w]; return `${MONTHS[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`; };
  HA.plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  HA.peakText = (s) => (s.peak === 1 ? `#1 for ${HA.plural(s.wk1, 'week')}` : `peaked #${s.peak}`);
  HA.dayOfYear = (w) => { const d = new Date(HA.m.weeks[w] + 'T00:00:00Z'); return (d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5; };

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
  HA.songTip = (s, extra) =>
    `<b>${HA.esc(s.title)}</b><div>${HA.esc(s.credit)}</div><div class="t-sub">${HA.peakText(s)} · ${s.year} chart year #${s.yearRank}${extra ? ' · ' + extra : ''}</div>`;

  // ── song drawer ────────────────────────────────────────────────────────────
  HA.listenLinks = (s) => {
    const q = encodeURIComponent(`${s.title} ${s.credit}`);
    return HA.h('div', { class: 'listen' },
      HA.h('a', { href: `https://www.youtube.com/results?search_query=${q}`, target: '_blank', rel: 'noopener' }, 'YouTube ↗'),
      HA.h('a', { href: `https://open.spotify.com/search/${q}`, target: '_blank', rel: 'noopener' }, 'Spotify ↗'),
      HA.h('a', { href: `https://music.apple.com/us/search?term=${q}`, target: '_blank', rel: 'noopener' }, 'Apple Music ↗'));
  };

  HA.runChart = function (s, width, height) {
    // y on a square-root scale, so the top 10 gets room and #100 still fits.
    const weeks = HA.songWeeks(s);
    const pad = { l: 26, r: 6, t: 8, b: 18 };
    const w0 = weeks[0][0], w1 = weeks[weeks.length - 1][0];
    const span = Math.max(w1 - w0, 8);
    const x = (w) => pad.l + ((w - w0) / span) * (width - pad.l - pad.r);
    const y = (r) => pad.t + ((Math.sqrt(r) - 1) / 9) * (height - pad.t - pad.b);
    const svg = HA.s('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': `Chart run of ${s.title}` });
    const grid = HA.s('g', { class: 'grid axis' });
    for (const r of [1, 10, 40, 100]) {
      grid.append(HA.s('line', { x1: pad.l, x2: width - pad.r, y1: y(r), y2: y(r) }));
      grid.append(HA.s('text', { x: pad.l - 5, y: y(r) + 4, 'text-anchor': 'end' }, '#' + r));
    }
    svg.append(grid);
    const col = HA.famVar(s.fam);
    for (const seg of s.segs) {
      const pts = seg.slice(1).map((r, j) => `${x(seg[0] + j).toFixed(1)},${y(r).toFixed(1)}`).join(' ');
      if (seg.length > 2) svg.append(HA.s('polyline', { points: pts, fill: 'none', stroke: col, 'stroke-width': 2, 'stroke-linejoin': 'round' }));
      else svg.append(HA.s('circle', { cx: x(seg[0]), cy: y(seg[1]), r: 2.5, fill: col }));
    }
    svg.append(HA.s('circle', { cx: x(s.peakWeek), cy: y(s.peak), r: 4.5, fill: col, stroke: 'var(--surface)', 'stroke-width': 2 }));
    const ax = HA.s('g', { class: 'axis' });
    ax.append(HA.s('text', { x: pad.l, y: height - 3 }, HA.fmtMonth(w0)));
    if (w1 - w0 > 20) ax.append(HA.s('text', { x: width - pad.r, y: height - 3, 'text-anchor': 'end' }, HA.fmtMonth(w1)));
    svg.append(ax);
    return svg;
  };

  HA.openSong = function (i) {
    const m = HA.m, s = m.songs[i], h = HA.h;
    const body = document.getElementById('drawer-body');
    body.replaceChildren();
    const famLabel = s.fam < 0 ? 'Genre unknown' : m.fams[s.fam].label;
    body.append(
      h('div', { class: 'd-fam' }, h('i', { class: 'sw' + (s.fam < 0 ? ' unknown' : ''), style: { '--c': HA.famVar(s.fam) } }), famLabel),
      h('div', { class: 'd-src' }, HA.SRC_LABEL[s.src]),
      h('div', { class: 'd-title' }, s.title),
      h('div', { class: 'd-credit' }, s.credit),
      h('div', { class: 'd-acts' }, s.acts.map((a, k) => h('button', { onclick: () => HA.showArtist(a) }, m.acts[a].name + (k >= s.nLead ? ' (feat.)' : '') + ' →'))),
      h('div', { class: 'd-stats' },
        h('div', { class: 'stat' }, h('b', {}, '#' + s.peak), h('span', {}, s.peak === 1 ? `peak · ${HA.plural(s.wk1, 'week')} at #1` : `peak · ${HA.plural(s.atPeak, 'week')} there`)),
        h('div', { class: 'stat' }, h('b', {}, s.weeksOn), h('span', {}, 'weeks on chart')),
        h('div', { class: 'stat' }, h('b', {}, '#' + s.yearRank), h('span', {}, `of chart year ${s.year}`)),
        h('div', { class: 'stat' }, h('b', {}, HA.fmtWeek(s.first).replace(/, \d{4}$/, '')), h('span', {}, 'debut, ' + HA.m.weeks[s.first].slice(0, 4)))),
      h('div', { class: 'label-sm' }, 'Chart run'),
      h('div', { class: 'd-run' }, HA.runChart(s, 360, 130)),
    );
    const info = m.no1Info[i];
    if (info) {
      const [style, writers, producers, label] = info;
      const dl = h('dl', { class: 'd-meta' });
      const row = (k, v) => v && dl.append(h('dt', {}, k), h('dd', {}, v));
      row('Style', style.replace(/;/g, ', '));
      row('Written by', writers.replace(/;/g, ', '));
      row('Produced by', producers.replace(/;/g, ', '));
      row('Label', label.replace(/;/g, ', '));
      body.append(h('div', { class: 'label-sm' }, 'About this #1'), dl);
    }
    const lead = m.acts[s.acts[0]];
    if (lead && lead.tags.length) body.append(h('div', { class: 'd-section' }, h('div', { class: 'label-sm' }, `Spotify genres for ${lead.name}`), h('div', { class: 'tag-list' }, lead.tags.map((t) => h('span', { class: 'tag' }, t)))));
    body.append(h('div', { class: 'd-section' }, h('div', { class: 'label-sm' }, 'Listen'), HA.listenLinks(s)));
    const d = document.getElementById('drawer');
    d.hidden = false;
    d.scrollTop = 0;
    document.getElementById('drawer-close').focus({ preventScroll: true });
  };
  HA.closeDrawer = () => { document.getElementById('drawer').hidden = true; };

  HA.showArtist = function (a) {
    HA.closeDrawer();
    HA.state.artist = a;
    if (location.hash !== '#artists') location.hash = 'artists';
    else HA.emit('artist');
  };

  // ── search ─────────────────────────────────────────────────────────────────
  HA.initSearch = function () {
    const m = HA.m, input = document.getElementById('search'), box = document.getElementById('search-results');
    const fold = (t) => t.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const songKeys = m.songs.map((s) => fold(s.title));
    const actKeys = m.acts.map((a) => fold(a.name));
    let items = [], active = -1;
    const pick = (it) => { box.hidden = true; input.blur(); it.type === 'song' ? HA.openSong(it.i) : HA.showArtist(it.i); };
    const render = () => {
      box.replaceChildren();
      const q = fold(input.value.trim());
      if (q.length < 2) { box.hidden = true; return; }
      const rank = (key) => (key === q ? 0 : key.startsWith(q) ? 1 : key.includes(' ' + q) ? 2 : key.includes(q) ? 3 : -1);
      const acts = [], songs = [];
      actKeys.forEach((k, i) => { const r = rank(k); if (r >= 0) acts.push([r, -m.acts[i].pts, i]); });
      songKeys.forEach((k, i) => { const r = rank(k); if (r >= 0) songs.push([r, -m.songs[i].pts, i]); });
      acts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      songs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      items = [...acts.slice(0, 5).map(([, , i]) => ({ type: 'act', i })), ...songs.slice(0, 8).map(([, , i]) => ({ type: 'song', i }))];
      active = -1;
      if (!items.length) { box.append(HA.h('div', { class: 'sr-group' }, 'No matches')); box.hidden = false; return; }
      let lastType = '';
      items.forEach((it, k) => {
        if (it.type !== lastType) box.append(HA.h('div', { class: 'sr-group' }, it.type === 'act' ? 'Artists' : 'Songs'));
        lastType = it.type;
        const fam = it.type === 'act' ? m.acts[it.i].fam : m.songs[it.i].fam;
        const main = it.type === 'act'
          ? [HA.h('b', {}, m.acts[it.i].name), HA.h('span', {}, `${HA.plural(m.acts[it.i].songs.length, 'chart entry')} · ${m.weekYear[m.acts[it.i].first]}–${m.weekYear[m.acts[it.i].last]}`.replace('entrys', 'entries'))]
          : [HA.h('b', {}, m.songs[it.i].title), HA.h('span', {}, `${m.songs[it.i].credit} · ${m.songs[it.i].year} · ${HA.peakText(m.songs[it.i])}`)];
        box.append(HA.h('button', { class: 'sr-item', 'data-k': k, onmousedown: (e) => { e.preventDefault(); pick(it); } },
          HA.h('i', { class: 'sw' + (fam < 0 ? ' unknown' : ''), style: { '--c': HA.famVar(fam) } }), HA.h('div', { class: 'sr-main' }, main)));
      });
      box.hidden = false;
    };
    input.addEventListener('input', render);
    input.addEventListener('focus', render);
    input.addEventListener('blur', () => setTimeout(() => { box.hidden = true; }, 120));
    input.addEventListener('keydown', (e) => {
      const btns = [...box.querySelectorAll('.sr-item')];
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length;
        btns.forEach((b, k) => b.classList.toggle('active', k === active));
      } else if (e.key === 'Enter' && items.length) pick(items[Math.max(active, 0)]);
      else if (e.key === 'Escape') { box.hidden = true; input.blur(); }
    });
  };

  // ── legend / spotlight ─────────────────────────────────────────────────────
  HA.initLegend = function () {
    const el = document.getElementById('legend');
    const chips = [];
    const add = (key, label, title, cls) => {
      const b = HA.h('button', { class: 'chip', title, 'aria-pressed': 'false', onclick: () => HA.setSpot(key) },
        HA.h('i', { class: 'sw' + (cls || ''), style: { '--c': key === 'unknown' ? 'var(--g-unknown)' : HA.famVar(key) } }), label);
      chips.push([key, b]);
      el.append(b);
    };
    HA.m.fams.forEach((f) => add(f.i, f.label, f.blurb));
    add('unknown', 'No data', 'Songs whose artist has no genre data', ' unknown');
    el.append(HA.h('span', { class: 'hint' }, 'Tap a genre to spotlight it'));
    const sync = () => chips.forEach(([k, b]) => {
      b.setAttribute('aria-pressed', String(HA.state.spot === k));
      b.classList.toggle('dim', HA.state.spot != null && HA.state.spot !== k);
    });
    HA.on('spot', sync);
  };
})();
