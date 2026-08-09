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
  const domain = String(raw.domain || '').trim();
  if (!name || !domain) return null;

  const expires = Number(raw.expires ?? raw.expirationDate ?? -1);
  return {
    name,
    value,
    domain,
    path: String(raw.path || '/'),
    expires: Number.isFinite(expires) ? expires : -1,
    httpOnly: Boolean(raw.httpOnly),
    secure: raw.secure !== false,
    sameSite: normalizeSameSite(raw.sameSite)
  };
}

function mergeCookies(primary, extra) {
  const merged = new Map();
  for (const cookie of [...primary, ...extra]) {
    if (!cookie) continue;
    merged.set(`${cookie.name};${cookie.domain};${cookie.path}`, cookie);
  }
  return Array.from(merged.values());
}

function compactText(text) {
  return String(text || '').replace(/\s+/gu, ' ').trim();
}

function looksLikeLoginPage(text) {
  const compact = compactText(text).toLowerCase();
  return (
    compact.includes('добро пожаловать в личный кабинет') ||
    compact.includes('войдите в аккаунт') ||
    compact.includes('majestic id') && compact.includes('регистрац') ||
    compact.includes('забыли пароль') ||
    compact.includes('данные от игры сюда не подходят')
  );
}

function looksLikeFamilyCabinet(text) {
  return /Обзор|Участники|Ранги|Действия|Финансы|Все записи|Все операции/u.test(String(text || ''));
}

async function readCdpCookies(context, page) {
  const session = await context.newCDPSession(page);
  try {
    const browserContextCookies = await context.cookies().catch(() => []);
    const network = await session.send('Network.getAllCookies').catch(() => ({ cookies: [] }));
    const storage = await session.send('Storage.getCookies').catch(() => ({ cookies: [] }));
    return mergeCookies(
      mergeCookies(
        browserContextCookies.map(normalizeCookie).filter(Boolean),
        (network.cookies || []).map(normalizeCookie).filter(Boolean)
      ),
      (storage.cookies || []).map(normalizeCookie).filter(Boolean)
    );
  } finally {
    await session.detach().catch(() => null);
  }
}

async function saveStorageStateWithCdpCookies(context, page, sessionPath) {
  const state = await context.storageState();
  const cdpCookies = await readCdpCookies(context, page).catch(() => []);
  state.cookies = mergeCookies(state.cookies || [], cdpCookies);
  fs.writeFileSync(sessionPath, JSON.stringify(state, null, 2));
  return state;
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
      const bodyText = await page.locator('body').innerText({ timeout: 3000 }).catch(() => '');
      if (url && !url.includes('/login') && !url.includes('/auth') && looksLikeFamilyCabinet(bodyText) && !looksLikeLoginPage(bodyText)) {
        const state = await saveStorageStateWithCdpCookies(context, page, sessionPath);
        console.log(`OK: session saved to ${sessionPath}`);
        console.log(`Cookies: ${Array.isArray(state.cookies) ? state.cookies.length : 0}`);
        console.log(`Origins: ${Array.isArray(state.origins) ? state.origins.length : 0}`);
        return;
      }
      if (looksLikeLoginPage(bodyText)) {
        console.log('Still on Majestic login page. Log in in the opened Brave window...');
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
