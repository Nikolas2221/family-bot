const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { findMojibake } = require('../scripts/detect-mojibake');

const root = path.resolve(__dirname, '..');

// copy.ts holds intentional mojibake markers used by the runtime detector
// itself — those strings must stay broken. Every other src-ts file is expected
// to be clean cyrillic UTF-8.
const allowlist = new Set(['src-ts/copy.ts']);

function walkTsFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkTsFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

async function main() {
  const tsFiles = walkTsFiles(path.join(root, 'src-ts'));
  const offenders = [];

  for (const fullPath of tsFiles) {
    const rel = path.relative(root, fullPath).replace(/\\/g, '/');
    if (allowlist.has(rel)) continue;
    const source = fs.readFileSync(fullPath, 'utf-8');
    const hits = findMojibake(source);
    if (hits.length === 0) continue;
    const sample = hits.slice(0, 3).map((hit) => {
      const line = source.slice(0, hit.start).split('\n').length;
      return `  L${line}: ${JSON.stringify(hit.original.slice(0, 40))} -> ${JSON.stringify(hit.decoded.slice(0, 40))}`;
    });
    offenders.push(`${rel}: ${hits.length} mojibake run(s)\n${sample.join('\n')}`);
  }

  assert.equal(
    offenders.length,
    0,
    [
      'В src-ts найдена битая кириллица (UTF-8, прочитанный как CP1251).',
      'Поправь файлы вручную или используй CP1251→UTF-8 декодер из scripts/detect-mojibake.js.',
      '',
      ...offenders
    ].join('\n')
  );

  console.log('PASS no mojibake in src-ts (excluding copy.ts markers)');
  console.log('ALL MOJIBAKE TESTS PASSED');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };
