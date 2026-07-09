require('dotenv/config');

const fs = require('node:fs');
const path = require('node:path');

function env(name, fallback = '') {
  return String(process.env[name] || fallback).trim();
}

function getSessionPath() {
  return env('SESSION_STORAGE_PATH', path.join(process.cwd(), 'data', '.browser-session'));
}

function normalizeSameSite(value) {
  const text = String(value || '').toLowerCase();
  if (text.includes('strict')) return 'Strict';
  if (text.includes('lax')) return 'Lax';
  if (text.includes('none') || text.includes('no_restriction')) return 'None';
  return 'Lax';
}

function normalizeCookie(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = String(raw.name || '').trim();
  const value = String(raw.value || '');
  if (!name) return null;

  const domain = String(raw.domain || raw.host || '.majestic-rp.ru').trim();
  const pathValue = String(raw.path || '/');
  const expires = Number(raw.expires ?? raw.expirationDate ?? -1);

  return {
    name,
    value,
    domain,
    path: pathValue || '/',
    expires: Number.isFinite(expires) ? expires : -1,
    httpOnly: Boolean(raw.httpOnly),
    secure: raw.secure !== false,
    sameSite: normalizeSameSite(raw.sameSite)
  };
}

function readCookiesInput() {
  const file = env('CABINET_COOKIES_FILE') || process.argv[3] || '';
  const raw = file
    ? fs.readFileSync(file, 'utf8')
    : env('CABINET_COOKIES_JSON');
  if (!raw) throw new Error('Set CABINET_COOKIES_JSON or pass a cookies JSON file path.');

  const parsed = JSON.parse(raw);
  const source = Array.isArray(parsed) ? parsed : parsed.cookies;
  if (!Array.isArray(source)) {
    throw new Error('Cookies JSON must be an array or an object with cookies array.');
  }

  const cookies = source.map(normalizeCookie).filter(Boolean);
  if (!cookies.length) throw new Error('No valid cookies found in input.');
  return cookies;
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

function importCookies(targetPath) {
  const cookies = readCookiesInput();
  const storageState = {
    cookies,
    origins: []
  };

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, JSON.stringify(storageState, null, 2));
  console.log(`OK: ${cookies.length} cookies imported to ${targetPath}`);
  console.log('Now run: npm run cabinet:session:export');
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
  if (action === 'cookies') return importCookies(targetPath);
  if (action === 'check') return checkSession(targetPath);

  throw new Error('Usage: node scripts/cabinet-session.js <check|export|import|cookies> [cookies.json]');
}

try {
  main();
} catch (error) {
  console.error(`ERROR: ${error && error.message ? error.message : String(error)}`);
  process.exit(1);
}
