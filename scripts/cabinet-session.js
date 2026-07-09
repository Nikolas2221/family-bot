require('dotenv/config');

const fs = require('node:fs');
const path = require('node:path');

function env(name, fallback = '') {
  return String(process.env[name] || fallback).trim();
}

function getSessionPath() {
  return env('SESSION_STORAGE_PATH', path.join(process.cwd(), 'data', '.browser-session'));
}

function importSession(targetPath) {
  const base64 = env('CABINET_SESSION_B64');
  if (!base64) throw new Error('CABINET_SESSION_B64 is empty.');

  const json = Buffer.from(base64, 'base64').toString('utf8');
  JSON.parse(json);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, json);
  console.log(`OK: session imported to ${targetPath}`);
}

function exportSession(targetPath) {
  if (!fs.existsSync(targetPath)) throw new Error(`Session file not found: ${targetPath}`);

  const json = fs.readFileSync(targetPath, 'utf8');
  JSON.parse(json);
  console.log('Copy this value to Railway Variables as CABINET_SESSION_B64:');
  console.log(Buffer.from(json, 'utf8').toString('base64'));
}

function checkSession(targetPath) {
  if (!fs.existsSync(targetPath)) {
    console.log(`MISSING: ${targetPath}`);
    process.exitCode = 1;
    return;
  }

  const data = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
  console.log(`OK: ${targetPath}`);
  console.log(`Cookies: ${Array.isArray(data.cookies) ? data.cookies.length : 0}`);
  console.log(`Origins: ${Array.isArray(data.origins) ? data.origins.length : 0}`);
}

function main() {
  const action = process.argv[2] || 'check';
  const targetPath = getSessionPath();

  if (action === 'export') return exportSession(targetPath);
  if (action === 'import') return importSession(targetPath);
  if (action === 'check') return checkSession(targetPath);

  throw new Error('Usage: node scripts/cabinet-session.js <check|export|import>');
}

try {
  main();
} catch (error) {
  console.error(`ERROR: ${error && error.message ? error.message : String(error)}`);
  process.exit(1);
}
