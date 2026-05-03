// Walks tsc output and annotates implicit-any parameters with `: any`.
// Used as a one-shot tool when lifting @ts-nocheck from data-heavy files
// where strict typing would be busywork.

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const tscOut = (() => {
  try {
    execSync('npx tsc --noEmit -p tsconfig.json', { encoding: 'utf-8' });
    return '';
  } catch (err) {
    return (err.stdout || '') + (err.stderr || '');
  }
})();

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error('Usage: node scripts/annotate-implicit-any.js <file> [file ...]');
  process.exit(1);
}

const targetSet = new Set(targets.map((p) => p.replace(/\\/g, '/')));

// Group fixes per file: { line: [{ col, paramName }] }
const perFile = new Map();
const re = /^(.+?)\((\d+),(\d+)\): error TS7006: Parameter '([^']+)' implicitly has an 'any' type\.$/gm;
let match;
while ((match = re.exec(tscOut)) !== null) {
  const [, rel, line, col, name] = match;
  const norm = rel.replace(/\\/g, '/');
  if (!targetSet.has(norm)) continue;
  if (!perFile.has(norm)) perFile.set(norm, new Map());
  const lines = perFile.get(norm);
  if (!lines.has(Number(line))) lines.set(Number(line), []);
  lines.get(Number(line)).push({ col: Number(col), name });
}

let totalFixed = 0;
for (const [rel, lines] of perFile) {
  const file = path.resolve(rel);
  const src = fs.readFileSync(file, 'utf-8').split(/\r?\n/);
  for (const [lineNo, params] of lines) {
    let lineText = src[lineNo - 1];
    // Apply right-to-left so earlier offsets stay valid.
    params.sort((a, b) => b.col - a.col);
    for (const { col, name } of params) {
      const idx = col - 1; // tsc columns are 1-based
      const before = lineText.slice(0, idx);
      const after = lineText.slice(idx);
      if (!after.startsWith(name)) {
        // Param name doesn't match what tsc claimed at that column — skip.
        continue;
      }
      const tail = after.slice(name.length);
      // Skip if already typed.
      if (/^\s*:/.test(tail)) continue;
      // Detect bare-param arrow fn: `name =>` (no surrounding parens around
      // the single parameter). In that case we must wrap the param in parens,
      // because `name: any =>` is a syntax error. If the parameter is already
      // inside parens, `tail` starts with `,` or `)` instead of `=>`, so we
      // fall through to the normal append.
      const arrowMatch = tail.match(/^\s*=>/);
      if (arrowMatch) {
        lineText = `${before}(${name}: any)${tail}`;
        totalFixed++;
        continue;
      }
      lineText = `${before}${name}: any${tail}`;
      totalFixed++;
    }
    src[lineNo - 1] = lineText;
  }
  fs.writeFileSync(file, src.join('\n'), 'utf-8');
  console.log(`patched ${rel}: ${[...lines.values()].reduce((n, arr) => n + arr.length, 0)} param(s)`);
}

console.log(`Done. ${totalFixed} parameter annotation(s) added.`);
