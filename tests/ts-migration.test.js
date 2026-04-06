const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

async function main() {
  const srcTsDir = path.join(root, 'src-ts');
  const tsFiles = fs.readdirSync(srcTsDir).filter((file) => file.endsWith('.ts'));
  const offendingImports = [];

  for (const file of tsFiles) {
    const fullPath = path.join(srcTsDir, file);
    const contents = fs.readFileSync(fullPath, 'utf8');
    const lines = contents.split(/\r?\n/);

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      const parentImport =
        trimmed.includes("require('../") ||
        trimmed.includes('require("../') ||
        trimmed.includes("from '../") ||
        trimmed.includes('from "../');

      if (!parentImport) return;
      if (file === 'runtime-meta.ts' && trimmed.includes("../package.json")) return;

      offendingImports.push(`${file}:${index + 1}: ${trimmed}`);
    });
  }

  assert.equal(
    offendingImports.length,
    0,
    `src-ts больше не должен тянуть корневые JS-модули. Найдено:\n${offendingImports.join('\n')}`
  );

  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(packageJson.main, 'dist-ts/index.js', 'production entrypoint должен смотреть на dist-ts/index.js');
  assert.ok(
    String(packageJson.scripts?.start || '').includes('dist-ts/index.js'),
    'npm start должен запускать dist-ts/index.js'
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };
