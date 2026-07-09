require('dotenv/config');

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

function env(name, fallback = '') {
  return String(process.env[name] || fallback).trim();
}

function getSessionPath() {
  return env('SESSION_STORAGE_PATH', path.join(process.cwd(), 'data', '.browser-session'));
}

async function main() {
  const cdpUrl = env('CABINET_CDP_URL', 'http://127.0.0.1:9222');
  const familyUrl = env('MAJESTIC_FAMILY_URL');
  const sessionPath = getSessionPath();
  const timeoutMs = Number(env('CABINET_LOGIN_TIMEOUT_MS', '600000')) || 600000;

  if (!familyUrl) throw new Error('MAJESTIC_FAMILY_URL must be set.');

  fs.mkdirSync(path.dirname(sessionPath), { recursive: true });

  console.log('Majestic cabinet CDP session capture');
  console.log(`CDP URL: ${cdpUrl}`);
  console.log(`Family URL: ${familyUrl}`);
  console.log(`Session path: ${sessionPath}`);

  const browser = await chromium.connectOverCDP(cdpUrl);
  const context = browser.contexts()[0] || await browser.newContext();
  const page = context.pages()[0] || await context.newPage();

  try {
    await page.goto(familyUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null);
    console.log('Finish login/check in the opened Brave window.');
    console.log(`Waiting up to ${Math.round(timeoutMs / 1000)} seconds for a non-login page...`);

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const url = String(page.url() || '').toLowerCase();
      if (url && !url.includes('/login') && !url.includes('/auth')) {
        await context.storageState({ path: sessionPath });
        console.log(`OK: session saved to ${sessionPath}`);
        return;
      }
      await page.waitForTimeout(1000);
    }

    throw new Error(`Login did not finish. Current URL: ${page.url()}`);
  } finally {
    await browser.close().catch(() => null);
  }
}

main().catch(error => {
  console.error(`ERROR: ${error && error.message ? error.message : String(error)}`);
  process.exit(1);
});
