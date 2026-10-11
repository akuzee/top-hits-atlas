// Spotify micro-genres → 8 colour families (+ other).
//
// The family order is also the stack order in the genre river; it was chosen by
// enumerating orders that keep every adjacent pair colourblind-separable (see
// DECISIONS.md), so don't reorder casually.
export const FAMILIES = [
  { id: 'easy',    label: 'Soft & Easy',     blurb: 'Standards, easy listening, soft rock, folk, singer-songwriters: the Adult Contemporary lineage' },
  { id: 'rock',    label: 'Rock',            blurb: 'Rock & roll through classic, hard, new wave, alternative, grunge and pop-punk' },
  { id: 'rnb',     label: 'R&B / Soul',      blurb: 'Doo-wop, Motown, soul, funk, quiet storm, new jack swing, contemporary R&B' },
  { id: 'country', label: 'Country',         blurb: 'Nashville sound to bro-country and Americana' },
  { id: 'dance',   label: 'Dance',           blurb: 'Disco, freestyle, house, Eurodance, EDM' },
  { id: 'hiphop',  label: 'Hip-Hop',         blurb: 'Rap in all its regional and era forms' },
  { id: 'pop',     label: 'Pop',             blurb: 'Brill Building, bubblegum, teen pop, dance-pop, synth-pop' },
  { id: 'latin',   label: 'Latin & World',   blurb: 'Latin pop, reggaeton, regional Mexican, reggae, afrobeats, non-English pop' },
  { id: 'other',   label: 'Other',           blurb: 'Novelty, comedy, soundtracks, show tunes, Christian, children’s' },
];
export const FAM_INDEX = Object.fromEntries(FAMILIES.map((f, i) => [f.id, i]));

// Ordered rules: the first matching pattern decides a tag's family. Compound
// tags come before the generic words they contain ("country rock" before
// "country", "pop rock" before "rock").
const RULES = [
  ['other',   /christmas|comedy|comic|novelty|parody|children|kids|cartoon|disney|show tunes|broadway|movie tunes|soundtrack|hollywood|^theme$|wrestling|glee club|asmr|background music|^focus$|^fake$|otacore|lds youth|calming|classical|orchestra|barbershop|choir/],
  ['rock',    /rap rock|rap metal|funk metal|funk rock|nu metal|reggae rock|comedy rock|blues rock|blues-rock|british blues|punk blues/],
  ['country', /country rap|modern country rock|country dawn|country road/],
  ['rock',    /country rock|southern rock|cowpunk/],
  ['latin',   /latin|reggaeton|urbano|mexic|norteno|banda|grupera|corrido|ranchera|cumbia|bachata|salsa|bolero|duranguense|puerto rican|colombian|panamanian|cancion|romantico|bossa nova|samba|sertanejo|boogaloo|espanol|cantautor|reggae|dancehall|soca|^ska$|rock steady|lovers rock|^dub$|riddim|afro|mande|south african|chanson|schlager|enka|filmi|bollywood|desi|italian pop|classic italian|french pop|ye ye|german pop|kreyol|sevdah|turbo folk|yugoslav|tropical$/],
  ['hiphop',  /hip hop|\brap\b|rap$|^rap|trap|drill|crunk|hyphy|g funk|boom bap|turntablism|grime|miami bass|bboy|k-hop|bounce|wu fam/],
  ['rnb',     /hip pop|r&b|soul|motown|funk|rhythm and blues|doo-wop|quiet storm|new jack|urban contemporary|minneapolis|go-go|boogie|rare groove|vocal harmony|beach music|swamp pop|blues|strut/],
  ['country', /country|nashville|honky tonk|bakersfield|bluegrass|redneck|red dirt|americana|cowboy|yodel|steel guitar|old-time|banjo|outlaw/],
  ['dance',   /disco|house|edm|techno|trance|eurodance|hi-nrg|freestyle|electro(?!pop|powerpop|clash)|big room|brostep|dubstep|drum and bass|dnb|big beat|electronica|moombahton|italo|bubblegum dance|alternative dance|new rave|uk dance|australian dance|downtempo|trip hop|breakbeat|new beat|rawstyle|vogue|complextro|cedm|uk funky|liquid funk|bubble trance|electroclash|new french touch/],
  ['other',   /christian|worship|ccm|gospel/],
  ['easy',    /traditional pop|vocal music|crooner|soft rock|yacht rock|mellow gold|folk|singer-songwriter|neo mellow|lilith|acoustic|stomp and holler|adult standards|easy listening|lounge|jazz|swing|big band|exotica|space age pop|torch song|vintage swoon|operatic pop|new age|hammond organ|ballroom|celtic|bebop|hard bop|post-bop|stride|dixieland|smooth saxophone|vintage hollywood|melancholia|instrumental$|piano$/],
  ['pop',     /pop rock|power pop(?!.*punk)|jangle pop|dream pop|noise pop/],
  ['rock',    /rock|metal|punk|grunge|emo|new wave(?! pop)|permanent wave|britpop|merseybeat|british invasion|freakbeat|beatlesque|surf|rockabilly|garage|psychedel|protopunk|madchester|shoegaze|zolo|pixie|post-punk|gothic|industrial|glam|jam band|krautrock|canterbury|c86|no wave|slow core|dark wave|cyberpunk|steampunk|medieval/],
  ['pop',     /pop|bubblegum|girl group|boy band|idol|teen|viral|escape room|metropopolis|alt z|indietronica|new romantic|brill building|lo-fi|chillwave|bedroom|soda|shiver|etherpop|hopebeat|modern uplift|talent show|neo-synthpop|synth/],
];

// Tags that say little about the sound (era tags, the bare word "pop") vote at
// half weight so a more specific tag can outvote them.
const HALF = /^pop$|^pop rap$|^pop rock$|^mellow gold$|^yacht rock$|^post-disco$|^[a-z]+ pop$|^classic uk pop$/;
const HALF_EXCEPT = /^(dance|teen|candy|art|indie|viral|synth|k|j|latin|europop|electro|baroque|chamber|sunshine|bubblegum|power|jangle|dream|noise|acoustic|operatic|space age)\s?pop$/;
const IGNORE = /talent show/;

// Tie-break order: the more specific scenes win a tie against broad pop.
const PRIORITY = ['hiphop', 'latin', 'country', 'rnb', 'dance', 'rock', 'easy', 'pop', 'other'];

export function tagFamily(tag) {
  for (const [fam, re] of RULES) if (re.test(tag)) return fam;
  return null;
}

export function tagWeight(tag) {
  if (IGNORE.test(tag)) return 0;
  if (HALF.test(tag) && !HALF_EXCEPT.test(tag)) return 0.5;
  return 1;
}

export function familyScores(tags) {
  const score = {};
  for (const t of tags) {
    const f = tagFamily(t), w = tagWeight(t);
    if (!f || !w) continue;
    score[f] = (score[f] || 0) + w;
  }
  return score;
}

// A family only when one clearly wins (by a full vote), for sources whose
// genre lists mix eras and labels loosely (Wikidata songs).
export function clearFamily(tags) {
  const ranked = Object.entries(familyScores(tags)).sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return null;
  return ranked.length === 1 || ranked[0][1] - ranked[1][1] >= 1 ? ranked[0][0] : null;
}

// tags: Spotify genre strings for one artist. Returns a family id or null.
export function familyOf(tags) {
  const score = familyScores(tags);
  let best = null;
  for (const f of PRIORITY) if (score[f] && (!best || score[f] > score[best])) best = f;
  return best;
}

// Chris Dalla Riva's song-level genre for #1 hits: a coarse genre ("Pop;Rock")
// plus a style ("Disco", "Pop Rock", "Vocal"). Only a style that pins down the
// sound overrides the artist's family; vague ones ("Pop Rock", "Ballad") would
// just repaint, say, a Madonna ballad as rock. The coarse genre is a fallback
// for #1s whose artist has no family at all.
const CDR_STYLE = [
  ['dance',   /disco|house|eurodance|techno|edm|electro-house|hi-nrg|freestyle|dance-soul|electronic/i],
  ['hiphop',  /hip hop|rap|trap|crunk|g-funk|drill/i],
  ['rnb',     /r&b|soul|motown|funk|new jack|doo-wop|quiet storm|gospel/i],
  ['country', /country|bluegrass|americana/i],
  ['latin',   /reggae|latin|reggaeton|bossa|dancehall|calypso|ska/i],
  ['easy',    /soft rock|folk|easy listening|lounge|big band|swing|vocal jazz|exotica|instrumental/i],
  ['rock',    /^rock$|rock & roll|hard rock|heavy metal|arena rock|metal|punk|grunge|new wave|surf|garage|psychedelic|rockabilly|blues rock|southern rock|acoustic rock|synth-rock/i],
];
const CDR_GENRE = {
  'Pop': 'pop', 'Rock': 'rock', 'Funk/Soul': 'rnb', 'Hip Hop': 'hiphop', 'Electronic/Dance': 'dance',
  'Folk/Country': 'country', 'Reggae': 'latin', 'Latin': 'latin', 'Jazz': 'easy', 'Blues': 'rnb',
  'Classical': 'other', 'March': 'other', 'Polka': 'other', 'Children\'s': 'other', 'Stage & Screen': 'other',
};
// → { strong: family from a defining style, or null; coarse: family from the genre }
export function cdrFamily(genre, style) {
  let strong = null;
  if (style && style !== 'NA') {
    for (const part of style.split(';')) {
      for (const [fam, re] of CDR_STYLE) if (re.test(part.trim())) { strong = fam; break; }
      if (strong) break;
    }
  }
  const g = genre && genre !== 'NA' ? genre.split(';')[0].trim() : '';
  return { strong, coarse: CDR_GENRE[g] || null };
}
