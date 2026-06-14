const fs = require('fs');

// Deterministic shuffle so each language's daily sequence is varied but stable.
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function shuffle(arr, seed){const a=arr.slice();const r=mulberry32(seed);for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}

// English: Stanford GraphBase list (frequency-ordered, public domain).
function buildEnglish(){
  const raw = fs.readFileSync('sgb-words.txt','utf8').split(/\r?\n/).map(w=>w.trim().toLowerCase()).filter(w=>/^[a-z]{5}$/.test(w));
  const answers = shuffle(raw.slice(0, 2500), 20260614);
  const valid = Array.from(new Set(raw));
  return { answers, valid };
}

// German / Italian: hermitdave FrequencyWords (subtitle frequency, sorted desc).
// Lines are "word count". Keep pure a-z 5-letter words to match the a-z keyboard.
// Subtitle corpora leak foreign words, so ANSWERS exclude anything in `excludeSets`
// (e.g. English words) — guesses stay permissive so real attempts are still accepted.
function buildFreq(file, answersCount, seed, excludeSets = []){
  const words = fs.readFileSync(file,'utf8').split(/\r?\n/)
    .map(l=>l.split(' ')[0].toLowerCase())
    .filter(w=>/^[a-z]{5}$/.test(w));
  const valid = Array.from(new Set(words));     // already frequency-ordered + deduped
  const isForeign = (w) => excludeSets.some(s => s.has(w));
  const native = valid.filter(w => !isForeign(w));
  const answers = shuffle(native.slice(0, answersCount), seed);
  return { answers, valid };
}

const en = buildEnglish();
const enSet = new Set(en.valid);
const de = buildFreq('de_50k.txt', 1500, 20260615, [enSet]);
const it = buildFreq('it_50k.txt', 1500, 20260616, [enSet]);

function lang(name, flag, code, data){
  return `  ${code}: {\n    name: ${JSON.stringify(name)}, flag: ${JSON.stringify(flag)},\n    answers: ${JSON.stringify(data.answers)},\n    valid: new Set(${JSON.stringify(data.valid)})\n  }`;
}

const out =
`// Auto-generated multilingual word data for PENTA.
// Sources: Stanford GraphBase (EN, public domain); hermitdave/FrequencyWords (DE, IT).
// Each language: pre-shuffled common answers + a Set of accepted guesses (a-z only).
export const LANGUAGES = {
${lang('English','\u{1F1EC}\u{1F1E7}','en',en)},
${lang('Deutsch','\u{1F1E9}\u{1F1EA}','de',de)},
${lang('Italiano','\u{1F1EE}\u{1F1F9}','it',it)}
};
export const LANG_ORDER = ["en","de","it"];
`;
fs.writeFileSync('words.js', out);
console.log('EN answers', en.answers.length, 'valid', en.valid.length);
console.log('DE answers', de.answers.length, 'valid', de.valid.length);
console.log('IT answers', it.answers.length, 'valid', it.valid.length);
console.log('bytes', out.length);
