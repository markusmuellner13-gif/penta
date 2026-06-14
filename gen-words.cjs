const fs = require('fs');
const raw = fs.readFileSync('sgb-words.txt','utf8').split(/\r?\n/).map(w=>w.trim().toLowerCase()).filter(w=>/^[a-z]{5}$/.test(w));
// SGB list is frequency-ordered: use the most common subset as fair answers.
const answersRaw = raw.slice(0, 2500);
// Seeded shuffle (mulberry32) so the daily sequence is varied but deterministic.
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const rnd = mulberry32(20260614);
const answers = answersRaw.slice();
for(let i=answers.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[answers[i],answers[j]]=[answers[j],answers[i]];}
const valid = Array.from(new Set(raw)); // all words are valid guesses
const out = `// Auto-generated word data for PENTA. Source: Stanford GraphBase 5-letter words (public domain).
// ANSWERS: ${answers.length} common words, pre-shuffled for daily-sequence variety.
// VALID: ${valid.length} accepted guesses.
export const ANSWERS = ${JSON.stringify(answers)};
export const VALID_SET = new Set(${JSON.stringify(valid)});
`;
fs.writeFileSync('words.js', out);
console.log('answers', answers.length, 'valid', valid.length, 'bytes', out.length);
