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

function getFrames(page) {
  return [page.mainFrame(), ...page.frames().filter(frame => frame !== page.mainFrame())];
}

async function fillFirst(page, selectors, value, label) {
  for (const frame of getFrames(page)) {
    for (const selector of selectors) {
      const locator = frame.locator(selector).first();
      if (await locator.isVisible().catch(() => false)) {
        await locator.fill(value);
        console.log(`OK: ${label} filled by ${selector} (${frame.url() || 'main frame'})`);
        return true;
      }
    }
  }
  return false;
}

async function clickFirst(page, selectors, label) {
  for (const frame of getFrames(page)) {
    for (const selector of selectors) {
      const locator = frame.locator(selector).first();
      if (await locator.isVisible().catch(() => false)) {
        await locator.click();
        console.log(`OK: ${label} clicked by ${selector} (${frame.url() || 'main frame'})`);
        return true;
      }
    }
  }
  return false;
}

async function waitForAnyVisible(page, selectors, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const frame of getFrames(page)) {
      for (const selector of selectors) {
        if (await frame.locator(selector).first().isVisible().catch(() => false)) {
          return true;
        }
      }
    }
    await page.waitForTimeout(500);
  }
  return false;
}

function scrubSecrets(text, secrets) {
  let result = String(text || '');
  for (const secret of secrets) {
    if (secret) result = result.split(secret).join('[redacted]');
  }
  return result;
}

async function collectPageDiagnostics(page) {
  const frames = [];
  for (const frame of getFrames(page)) {
    const elements = await frame.locator('input, button, textarea, select, a').evaluateAll(nodes => nodes.slice(0, 80).map(node => ({
      tag: node.tagName.toLowerCase(),
      type: node.getAttribute('type') || '',
      name: node.getAttribute('name') || '',
      id: node.getAttribute('id') || '',
      placeholder: node.getAttribute('placeholder') || '',
      autocomplete: node.getAttribute('autocomplete') || '',
      text: (node.textContent || '').trim().slice(0, 80),
      visible: !!(node.offsetWidth || node.offsetHeight || node.getClientRects().length)
    }))).catch(error => [{ error: error.message }]);

    frames.push({
      url: frame.url(),
      name: frame.name(),
      title: await frame.title().catch(() => ''),
      elements
    });
  }

  return {
    url: page.url(),
    title: await page.title().catch(() => ''),
    frames
  };
}

async function saveDebugFiles(page, sessionPath, secrets) {
  const debugDir = path.join(path.dirname(sessionPath), 'cabinet-login-debug');
  fs.mkdirSync(debugDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const diagnosticsPath = path.join(debugDir, `${stamp}-diagnostics.json`);
  const htmlPath = path.join(debugDir, `${stamp}-page.html`);
  const screenshotPath = path.join(debugDir, `${stamp}-page.png`);

  const diagnostics = await collectPageDiagnostics(page);
  fs.writeFileSync(diagnosticsPath, scrubSecrets(JSON.stringify(diagnostics, null, 2), secrets));
  fs.writeFileSync(htmlPath, scrubSecrets(await page.content().catch(() => ''), secrets));
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => null);

  console.log(`DEBUG: diagnostics saved to ${diagnosticsPath}`);
  console.log(`DEBUG: html saved to ${htmlPath}`);
  console.log(`DEBUG: screenshot saved to ${screenshotPath}`);
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
    throw new Error('MAJESTIC_EMAIL and MAJESTIC_PASSWORD must be set.');
  }
  if (!familyUrl) {
    throw new Error('MAJESTIC_FAMILY_URL must be set.');
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

  const emailSelectors = [
    'input[type="email"]',
    'input[name="email"]',
    'input[name="login"]',
    'input[name="username"]',
    'input[id*="email" i]',
    'input[id*="login" i]',
    'input[id*="username" i]',
    'input[placeholder*="email" i]',
    'input[placeholder*="mail" i]',
    'input[placeholder*="login" i]',
    'input[placeholder*="логин" i]',
    'input[placeholder*="почт" i]',
    'input[autocomplete="username"]',
    'input[type="text"]'
  ];

  const passwordSelectors = [
    'input[type="password"]',
    'input[name="password"]',
    'input[id*="password" i]',
    'input[placeholder*="password" i]',
    'input[placeholder*="парол" i]',
    'input[autocomplete="current-password"]'
  ];

  try {
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => null);
    await waitForAnyVisible(page, [...emailSelectors, ...passwordSelectors], 15000);

    const emailOk = await fillFirst(page, emailSelectors, email, 'email/login');
    const passwordOk = await fillFirst(page, passwordSelectors, password, 'password');

    if (!emailOk || !passwordOk) {
      await saveDebugFiles(page, sessionPath, [email, password]);
      throw new Error('Login fields were not found. The page may show captcha/protection or the markup changed. Debug files were saved near SESSION_STORAGE_PATH.');
    }

    const clicked = await clickFirst(page, [
      'button[type="submit"]',
      'button:has-text("Войти")',
      'button:has-text("Login")',
      'button:has-text("Sign in")',
      'button:has-text("Log in")',
      'input[type="submit"]'
    ], 'login button');

    if (!clicked) {
      await page.keyboard.press('Enter').catch(() => null);
      console.log('OK: login submitted by Enter');
    }

    const loggedIn = await waitForLoginResult(page, timeoutMs);
    if (!loggedIn) {
      throw new Error('Login did not finish. Possible 2FA, captcha, wrong password or automated login block.');
    }

    await page.goto(familyUrl, { waitUntil: 'networkidle', timeout: 60000 }).catch(async () => {
      await page.goto(familyUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    });
    if (!looksLoggedIn(page.url())) {
      throw new Error('Family page redirected back to login. Session is invalid.');
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
