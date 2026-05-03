// Detect mojibake (UTF-8 cyrillic that was misread as CP1251 and re-encoded
// as UTF-8). The detector is a sibling of scripts/fix-mojibake.js: any run it
// considers fixable counts as mojibake.
//
// Used as a library by tests/mojibake.test.js and as a CLI for ad-hoc checks.

const fs = require('fs');
const path = require('path');

const CP1251_TO_UNICODE = {
  0x80: 0x0402, 0x81: 0x0403, 0x82: 0x201A, 0x83: 0x0453, 0x84: 0x201E,
  0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021, 0x88: 0x20AC, 0x89: 0x2030,
  0x8A: 0x0409, 0x8B: 0x2039, 0x8C: 0x040A, 0x8D: 0x040C, 0x8E: 0x040B,
  0x8F: 0x040F, 0x90: 0x0452, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201C,
  0x94: 0x201D, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014, 0x98: 0x0098,
  0x99: 0x2122, 0x9A: 0x0459, 0x9B: 0x203A, 0x9C: 0x045A, 0x9D: 0x045C,
  0x9E: 0x045B, 0x9F: 0x045F, 0xA0: 0x00A0, 0xA1: 0x040E, 0xA2: 0x045E,
  0xA3: 0x0408, 0xA4: 0x00A4, 0xA5: 0x0490, 0xA6: 0x00A6, 0xA7: 0x00A7,
  0xA8: 0x0401, 0xA9: 0x00A9, 0xAA: 0x0404, 0xAB: 0x00AB, 0xAC: 0x00AC,
  0xAD: 0x00AD, 0xAE: 0x00AE, 0xAF: 0x0407, 0xB0: 0x00B0, 0xB1: 0x00B1,
  0xB2: 0x0406, 0xB3: 0x0456, 0xB4: 0x0491, 0xB5: 0x00B5, 0xB6: 0x00B6,
  0xB7: 0x00B7, 0xB8: 0x0451, 0xB9: 0x2116, 0xBA: 0x0454, 0xBB: 0x00BB,
  0xBC: 0x0458, 0xBD: 0x0405, 0xBE: 0x0455, 0xBF: 0x0457
};
for (let i = 0; i < 64; i++) CP1251_TO_UNICODE[0xC0 + i] = 0x0410 + i;

const UNICODE_TO_CP1251 = new Map();
for (const [byte, cp] of Object.entries(CP1251_TO_UNICODE)) {
  UNICODE_TO_CP1251.set(Number(cp), Number(byte));
}

function looksLikeCyrillic(text) {
  if (!text || text.includes('�')) return false;
  const total = [...text].length;
  if (total === 0) return false;
  const cyr = (text.match(/[Ѐ-ӿ]/g) || []).length;
  return cyr >= 1 && cyr / total >= 0.5;
}

// Scan source. Return list of { start, end, original, decoded } for every
// run that decodes cleanly into cyrillic via the CP1251→UTF-8 mojibake path.
function findMojibake(source) {
  const hits = [];
  let i = 0;
  while (i < source.length) {
    const cp = source.codePointAt(i);
    const cpSize = cp > 0xFFFF ? 2 : 1;
    if (cp >= 0x80 && UNICODE_TO_CP1251.has(cp)) {
      let j = i;
      const bytes = [];
      let hasLowMarker = false;
      while (j < source.length) {
        const cpj = source.codePointAt(j);
        if (cpj < 0x80) break;
        if (!UNICODE_TO_CP1251.has(cpj)) break;
        const byte = UNICODE_TO_CP1251.get(cpj);
        if (byte < 0xC0) hasLowMarker = true;
        bytes.push(byte);
        j += cpj > 0xFFFF ? 2 : 1;
      }
      if (bytes.length >= 2 && hasLowMarker) {
        const decoded = Buffer.from(bytes).toString('utf-8');
        if (looksLikeCyrillic(decoded)) {
          hits.push({ start: i, end: j, original: source.slice(i, j), decoded });
          i = j;
          continue;
        }
      }
      i = j > i ? j : i + cpSize;
    } else {
      i += cpSize;
    }
  }
  return hits;
}

module.exports = { findMojibake };

if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  const targets = process.argv.slice(2).length
    ? process.argv.slice(2)
    : fs.readdirSync(path.join(root, 'src-ts'))
        .filter((f) => f.endsWith('.ts'))
        .map((f) => path.join('src-ts', f));

  let total = 0;
  for (const rel of targets) {
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) continue;
    const source = fs.readFileSync(file, 'utf-8');
    const hits = findMojibake(source);
    if (hits.length === 0) continue;
    total += hits.length;
    console.log(`${rel}: ${hits.length} mojibake run(s)`);
    for (const hit of hits.slice(0, 3)) {
      const line = source.slice(0, hit.start).split('\n').length;
      console.log(`  L${line}: ${JSON.stringify(hit.original.slice(0, 40))} -> ${JSON.stringify(hit.decoded.slice(0, 40))}`);
    }
    if (hits.length > 3) console.log(`  ... +${hits.length - 3} more`);
  }
  if (total === 0) console.log('OK: no mojibake found.');
  process.exit(total === 0 ? 0 : 1);
}
