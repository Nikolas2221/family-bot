import crypto from 'node:crypto';
import fs from 'node:fs';
import type { FamilyCabinetAction, FamilyCabinetConfig } from './types';

function getPlaywrightChromium(): any {
  try {
    const dynamicRequire = eval('require') as NodeRequire;
    return dynamicRequire('playwright').chromium;
  } catch {
    throw new Error('Playwright не установлен. Добавь зависимость playwright и установи Chromium для Railway.');
  }
}

function toMoscowIso(value: string): string {
  const match = String(value || '').match(/(\d{2})\.(\d{2})\.(\d{4})\D+(\d{1,2}):(\d{2})/u);
  if (!match) return new Date().toISOString();
  const [, day, month, year, hour, minute] = match;
  const utcMs = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour) - 3, Number(minute), 0);
  return new Date(utcMs).toISOString();
}

function actionType(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes('контракт')) return 'contract_complete';
  if (lower.includes('приглас')) return 'family_invite';
  if (lower.includes('покинул')) return 'family_leave';
  if (lower.includes('исключ')) return 'family_kick';
  if (lower.includes('ранг') || lower.includes('роль')) return 'rank_change';
  if (lower.includes('преми')) return 'bonus';
  if (lower.includes('роял')) return 'royalty_payment';
  if (lower.includes('попол')) return 'finance_deposit';
  if (lower.includes('взят') || lower.includes('списан')) return 'finance_withdraw';
  if (lower.includes('транспорт')) return 'transport_added';
  return 'unknown';
}

function extractPerson(raw: string): { nickname: string; staticId: number } | null {
  const text = String(raw || '').trim();
  if (!text || text === '-' || text === '—') return null;
  const match = text.match(/^(.*?)\s*#(\d+)\s*$/u);
  if (!match) return { nickname: text, staticId: 0 };
  return { nickname: match[1].trim(), staticId: Number(match[2]) || 0 };
}

function externalId(parts: string[]): string {
  return `majestic-${crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 16)}`;
}

function withTab(url: string, tab: string): string {
  const clean = String(url || '').replace(/\?.*$/u, '');
  return `${clean}?tab=${tab}`;
}

function restoreSessionFromEnv(sessionStoragePath: string): boolean {
  const encoded = String(process.env.CABINET_SESSION_B64 || '').trim();
  if (!encoded || fs.existsSync(sessionStoragePath)) return false;

  try {
    const json = Buffer.from(encoded, 'base64').toString('utf8');
    JSON.parse(json);
    fs.mkdirSync(sessionStoragePath.replace(/[\\/][^\\/]+$/u, ''), { recursive: true });
    fs.writeFileSync(sessionStoragePath, json);
    return true;
  } catch (error) {
    throw new Error(`CABINET_SESSION_B64 is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function expandRows(page: any, target: number): Promise<void> {
  const rowSelector = 'div.overflow-hidden.rounded-lg.bg-background-tertiary';
  const maxClicks = Math.ceil(Math.max(0, target - 50) / 50) + 1;
  let previousCount = await page.locator(rowSelector).count().catch(() => 0);

  for (let index = 0; index < maxClicks && previousCount < target; index += 1) {
    const button = page.locator('div.flex.justify-center.pt-2 > button').first();
    if (!await button.isVisible().catch(() => false)) break;
    if (await button.isDisabled().catch(() => false)) break;
    await button.click().catch(() => null);
    await page.waitForTimeout(1200);
    const nextCount = await page.locator(rowSelector).count().catch(() => previousCount);
    if (nextCount <= previousCount) break;
    previousCount = nextCount;
  }
}

async function parseRows(page: any): Promise<FamilyCabinetAction[]> {
  const rowSelector = 'div.overflow-hidden.rounded-lg.bg-background-tertiary';
  const rows = page.locator(rowSelector);
  const count = await rows.count().catch(() => 0);
  const logs: FamilyCabinetAction[] = [];

  for (let index = 0; index < count; index += 1) {
    const row = rows.nth(index);
    const desktopRow = row.locator('div.hidden.items-start.xl\\:flex');
    const cols = desktopRow.locator('> div');
    const colCount = await cols.count().catch(() => 0);
    if (colCount < 4) continue;

    const read = async (colIndex: number): Promise<string> => {
      const spans = await cols.nth(colIndex).locator('span').allTextContents().catch(() => []);
      const paragraphs = await cols.nth(colIndex).locator('p').allTextContents().catch(() => []);
      return [...spans, ...paragraphs].map((part: string) => part.trim()).filter(Boolean).join(' ').trim();
    };

    const dateText = await read(0);
    const raw = await read(1);
    const memberText = await read(2);
    const initiatorText = await read(3);
    if (!dateText || !raw) continue;

    const datetime = toMoscowIso(dateText);
    const type = actionType(raw);
    logs.push({
      externalLogId: externalId([datetime, raw, memberText, initiatorText]),
      datetime,
      actionRaw: raw,
      actionType: type,
      member: extractPerson(memberText) || { nickname: '', staticId: 0 },
      initiator: extractPerson(initiatorText),
      quantity: null,
      unit: null,
      direction: null,
      contract: null,
      amount: null,
      balanceAfter: null,
      status: type === 'unknown' ? 'unparsed' : 'parsed'
    });
  }

  return logs;
}

export async function scrapeFamilyLogs(config: FamilyCabinetConfig): Promise<FamilyCabinetAction[]> {
  if (!config.familyUrl) {
    throw new Error('MAJESTIC_FAMILY_URL не задан.');
  }
  restoreSessionFromEnv(config.sessionStoragePath);
  if (!fs.existsSync(config.sessionStoragePath)) {
    throw new Error(`Сессия кабинета не найдена: ${config.sessionStoragePath}. Нужно один раз сохранить Playwright storageState.`);
  }

  const chromium = getPlaywrightChromium();
  const browser = await chromium.launch({ headless: true });
  let context: any = null;
  try {
    context = await browser.newContext({ storageState: config.sessionStoragePath });
    const page = await context.newPage();
    await page.goto(withTab(config.familyUrl, 'logs'), { waitUntil: 'networkidle', timeout: 60000 });
    if (String(page.url()).includes('login')) {
      throw new Error('Сессия кабинета истекла. Нужно обновить SESSION_STORAGE_PATH.');
    }
    await page.locator('div.overflow-hidden.rounded-lg.bg-background-tertiary').first().waitFor({ timeout: 15000 }).catch(() => null);
    await expandRows(page, config.logsFetchTarget);
    return await parseRows(page);
  } finally {
    if (context) await context.close().catch(() => null);
    await browser.close().catch(() => null);
  }
}
