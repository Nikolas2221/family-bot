const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function listFiles(dir, predicate) {
  const result = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      result.push(...listFiles(fullPath, predicate));
      continue;
    }

    if (predicate(fullPath)) result.push(fullPath);
  }

  return result;
}

async function main() {
  const srcTsDir = path.join(root, 'src-ts');
  const tsFiles = listFiles(srcTsDir, (file) => file.endsWith('.ts'));
  const offendingImports = [];

  for (const filePath of tsFiles) {
    const relativeFile = path.relative(srcTsDir, filePath);
    const contents = fs.readFileSync(filePath, 'utf8');
    const lines = contents.split(/\r?\n/);

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      const matches = [
        ...trimmed.matchAll(/from\s+['"]([^'"]+)['"]/g),
        ...trimmed.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)
      ];

      for (const match of matches) {
        const importPath = match[1];

        if (!importPath.startsWith('..')) continue;
        if (relativeFile === 'runtime-meta.ts' && importPath === '../package.json') continue;

        const resolvedPath = path.resolve(path.dirname(filePath), importPath);
        const isInsideSrcTs = resolvedPath === srcTsDir || resolvedPath.startsWith(`${srcTsDir}${path.sep}`);

        if (!isInsideSrcTs) {
          offendingImports.push(`${relativeFile}:${index + 1}: ${trimmed}`);
        }
      }
    });
  }

  assert.equal(
    offendingImports.length,
    0,
    `src-ts больше не должен тянуть корневые JS-модули. Найдено:\n${offendingImports.join('\n')}`
  );

  const removedRootWrappers = [
    'ai.js',
    'applications.js',
    'automod.js',
    'commands.js',
    'config.js',
    'copy.js',
    'database.js',
    'embeds.js',
    'index.js',
    'ranks.js',
    'release-notes.js',
    'roles.js',
    'security.js',
    'storage.js'
  ];

  const existingWrappers = removedRootWrappers.filter((file) => fs.existsSync(path.join(root, file)));
  assert.deepEqual(existingWrappers, [], `корневые JS-обёртки должны быть удалены: ${existingWrappers.join(', ')}`);

  const tsconfig = JSON.parse(fs.readFileSync(path.join(root, 'tsconfig.json'), 'utf8'));
  assert.equal(tsconfig.compilerOptions?.allowJs, false, 'tsconfig должен держать allowJs=false');

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
