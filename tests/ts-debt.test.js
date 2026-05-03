const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

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
  const srcTsDir = path.join(root, 'src-ts');
  const tsFiles = walkTsFiles(srcTsDir);

  const noCheckFiles = tsFiles
    .filter((fullPath) => {
      const contents = fs.readFileSync(fullPath, 'utf8');
      return contents.split(/\r?\n/, 1)[0]?.includes('@ts-nocheck');
    })
    .map((fullPath) => path.relative(root, fullPath).replace(/\\/g, '/'))
    .sort();

  const allowedDebt = [];

  assert.deepEqual(
    noCheckFiles,
    allowedDebt,
    [
      'Остаточный TypeScript-долг изменился.',
      'Сейчас допускаются только эти файлы с @ts-nocheck:',
      ...allowedDebt.map((file) => `- ${file}`),
      'Фактически найдено:',
      ...noCheckFiles.map((file) => `- ${file}`)
    ].join('\n')
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };
