require('dotenv/config');

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

function env(name, fallback = '') {
  return String(process.env[name] || fallback).trim();
}

function boolEnv(name, fallback = false) {
  const value = env(name);
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

async function fillFirst(page, selectors, value, label) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible().catch(() => false)) {
      await locator.fill(value);
      console.log(`OK: ${label} filled by ${selector}`);
      return true;
    }
  }
  return false;
}

async function clickFirst(page, selectors, label) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible().catch(() => false)) {
      await locator.click();
      console.log(`OK: ${label} clicked by ${selector}`);
      return true;
    }
  }
  return false;
}

function looksLoggedIn(url) {
  const value = String(url || '').toLowerCase();
  return !value.includes('/login') && !value.includes('/auth');
}

async function waitForLoginResult(page, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (looksLoggedIn(page.url())) return true;
    await page.waitForTimeout(1000);
  }
  return looksLoggedIn(page.url());
}

async function main() {
  const email = env('MAJESTIC_EMAIL');
  const password = env('MAJESTIC_PASSWORD');
  const loginUrl = env('MAJESTIC_LOGIN_URL', 'https://id.majestic-rp.ru/login');
  const familyUrl = env('MAJESTIC_FAMILY_URL');
  const sessionPath = env('SESSION_STORAGE_PATH', path.join(process.cwd(), 'data', '.browser-session'));
  const headless = boolEnv('CABINET_LOGIN_HEADLESS', true);
  const timeoutMs = Number(env('CABINET_LOGIN_TIMEOUT_MS', '120000')) || 120000;

  if (!email || !password) {
    throw new Error('MAJESTIC_EMAIL и MAJESTIC_PASSWORD должны быть заданы.');
  }
  if (!familyUrl) {
    throw new Error('MAJESTIC_FAMILY_URL должен быть задан.');
  }

  fs.mkdirSync(path.dirname(sessionPath), { recursive: true });

  console.log('Majestic cabinet login');
  console.log(`Login URL: ${loginUrl}`);
  console.log(`Family URL: ${familyUrl}`);
  console.log(`Session path: ${sessionPath}`);
  console.log(`Headless: ${headless}`);

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    const emailOk = await fillFirst(page, [
      'input[type="email"]',
      'input[name="email"]',
      'input[name="login"]',
      'input[autocomplete="username"]',
      'input[type="text"]'
    ], email, 'email/login');

    const passwordOk = await fillFirst(page, [
      'input[type="password"]',
      'input[name="password"]',
      'input[autocomplete="current-password"]'
    ], password, 'password');

    if (!emailOk || !passwordOk) {
      throw new Error('Не нашёл поля email/password на странице входа. Возможно, изменилась форма или открылась капча.');
    }

    const clicked = await clickFirst(page, [
      'button[type="submit"]',
      'button:has-text("Войти")',
      'button:has-text("Login")',
      'input[type="submit"]'
    ], 'login button');
    if (!clicked) {
      await page.keyboard.press('Enter').catch(() => null);
      console.log('OK: login submitted by Enter');
    }

    const loggedIn = await waitForLoginResult(page, timeoutMs);
    if (!loggedIn) {
      throw new Error('Вход не завершился. Возможна 2FA, капча, неверный пароль или блокировка автоматического входа.');
    }

    await page.goto(familyUrl, { waitUntil: 'networkidle', timeout: 60000 }).catch(async () => {
      await page.goto(familyUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    });
    if (!looksLoggedIn(page.url())) {
      throw new Error('После входа страница семьи снова отправила на login. Сессия невалидна.');
    }

    await context.storageState({ path: sessionPath });
    console.log(`OK: session saved to ${sessionPath}`);
  } finally {
    await context.close().catch(() => null);
    await browser.close().catch(() => null);
  }
}

main().catch(error => {
  console.error(`ERROR: ${error && error.message ? error.message : String(error)}`);
  process.exit(1);
});
