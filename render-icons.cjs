const sharp = require('sharp');
const fs = require('fs');
const svg = fs.readFileSync('icon.svg');
const jobs = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
  ['favicon-32.png', 32],
];
(async () => {
  for (const [out, size] of jobs) {
    await sharp(svg, { density: 384 }).resize(size, size).png().toFile(out);
    console.log('wrote', out, size);
  }
})();
