// Generates thousands of quiz questions per domain through the app's own code
// and checks each one: four distinct choices with exactly one right (two for
// "which came first"), a year answer the slider can reach, no "undefined" text,
// and every question kind turning up somewhere.
//   node tools/test-quiz.mjs [--show]   (--show prints a sample of each kind)
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const here = (p) => new URL(p, import.meta.url).pathname;
globalThis.document = { addEventListener() {}, querySelectorAll: () => [] };
for (const f of ['core', 'model', 'music', 'movies', 'tv', 'questions', 'quiz']) vm.runInThisContext(readFileSync(here(`../js/${f}.js`), 'utf8'), { filename: f + '.js' });
const HA = globalThis.HA;
const show = process.argv.includes('--show');

let fail = 0;
const bad = (msg) => { fail++; if (fail < 30) console.log('  ✗ ' + msg); };
for (const id of ['music', 'movies', 'tv']) {
  const D = (HA.D = HA.domains[id].build(JSON.parse(readFileSync(here(`../data/${id}.json`), 'utf8'))));
  // The settings a person can pick: every single decade, some wider ranges, each genre.
  const decades = [...new Set(D.periods.map((p) => Math.floor(p / 10) * 10))];
  const scopes = [{}, ...decades.map((d) => ({ years: [d, d + 9] })), { years: [1960, 1989] }, { years: [1990, 2029] },
    ...D.fams.map((f, i) => ({ fam: i })), { years: [1980, 1989], fam: 0 }];
  const seen = new Map();
  let n = 0;
  for (const sc of scopes) for (const level of ['familiar', 'deeper']) {
    const qs = HA.quiz.sample(sc, level, 30);
    // A small scope (one TV genre) can run short of deeper cuts; a familiar round never should.
    if (qs.length < (level === 'deeper' ? 3 : 10)) bad(`${id} ${JSON.stringify(sc)} ${level}: only ${qs.length} questions`);
    for (const q of qs) {
      n++;
      if (!seen.has(q.kind)) seen.set(q.kind, []);
      seen.get(q.kind).push(q);
      const text = [q.kicker, q.prompt, q.sub, q.reveal, ...(q.choices || []).flatMap((c) => [c.label, c.sub, c.reveal])].join(' ');
      if (/undefined|NaN|null|\[object/.test(text)) bad(`${id} ${q.kind}: bad text: ${text.slice(0, 160)}`);
      if (q.choices) {
        const want = q.kind === 'first' ? 2 : 4;
        if (q.choices.length !== want) bad(`${id} ${q.kind}: ${q.choices.length} choices`);
        if (q.choices.filter((c) => c.ok).length !== 1) bad(`${id} ${q.kind}: ${q.choices.filter((c) => c.ok).length} right answers`);
        const labels = q.choices.map((c) => c.label.toLowerCase());
        if (new Set(labels).size !== labels.length) bad(`${id} ${q.kind}: repeated choice in ${labels.join(' | ')}`);
      } else if (!Number.isInteger(q.year) || q.year < 1900 || q.year > 2030) bad(`${id} ${q.kind}: year ${q.year}`);
    }
  }
  const kinds = Object.keys(HA.questions[id](D).kinds);
  const missing = kinds.filter((k) => !seen.has(k));
  if (missing.length) bad(`${id}: kinds never generated: ${missing.join(', ')}`);
  console.log(`${id}: ${n} questions over ${scopes.length} scopes; by kind ${[...seen].map(([k, v]) => `${k} ${v.length}`).join(', ')}`);
  if (show) for (const [k, qs] of seen) for (const q of qs.slice(0, 2)) console.log(`   [${k}] ${q.kicker} | ${q.prompt}${q.sub ? ' | ' + q.sub : ''} → ${q.choices ? q.choices.map((c) => (c.ok ? `*${c.label}*` : c.label)).join(' / ') : q.year}`);
}
console.log(fail ? `${fail} problems` : 'all questions valid');
process.exit(fail ? 1 : 0);
