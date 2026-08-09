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
  if (lower.includes('приглас') || lower.includes('приглаш')) return 'family_invite';
  if (lower.includes('покинул')) return 'family_leave';
  if (lower.includes('исключ') || lower.includes('уволен')) return 'family_kick';
  if (lower.includes('ранг') || lower.includes('роль')) return 'rank_change';
  if (lower.includes('преми')) return 'bonus';
  if (lower.includes('роял')) return 'royalty_payment';
  if (lower.includes('попол')) return 'finance_deposit';
  if (lower.includes('взят') || lower.includes('списан')) return 'finance_withdraw';
  if (/(снял|вывел|взял|изъял|потратил|расход|списал|выдал).*(баланс|казн|банк|сч[её]т|семь)/u.test(lower)) return 'finance_withdraw';
  if (/(пополнил|вн[её]с|зачисл|положил|доход).*(баланс|казн|банк|сч[её]т|семь)/u.test(lower)) return 'finance_deposit';
  if (/(доставил|прин[её]с|сдал|положил).*(товар|склад|материал|ресурс)/u.test(lower)) return 'warehouse_deposit';
  if (/(забрал|взял|изъял|выдал).*(товар|склад|материал|ресурс)/u.test(lower)) return 'warehouse_withdraw';
  if (lower.includes('транспорт')) return 'transport_added';
  return 'unknown';
}

function parseMoneyAmounts(raw: string): number[] {
  const matches = Array.from(String(raw || '').matchAll(/([+-]?)\s*\$\s*(\d[\d\s.,]*)|([+-]?)\s*(\d[\d\s.,]*)\s*\$/gu));
  return matches
    .map(match => {
      const sign = match[1] || match[3] || '';
      const value = match[2] || match[4] || '';
      const normalized = value.replace(/\s+/gu, '').replace(',', '.');
      const amount = Number(normalized);
      if (!Number.isFinite(amount)) return null;
      return sign === '-' ? -Math.abs(amount) : amount;
    })
    .filter((amount): amount is number => amount !== null);
}

function parseMoneyAmount(raw: string): number | null {
  return parseMoneyAmounts(raw)[0] ?? null;
}

function parseBalanceAfter(raw: string): number | null {
  return parseMoneyAmounts(raw)[1] ?? null;
}

function extractPerson(raw: string): { nickname: string; staticId: number } | null {
  const text = String(raw || '').trim();
  if (!text || text === '-' || text === '—') return null;
  const match = text.match(/^(.*?)\s*#(\d+)\s*$/u);
  if (!match) return { nickname: text, staticId: 0 };
  return { nickname: match[1].trim(), staticId: Number(match[2]) || 0 };
}

function parseTextFallback(text: string): FamilyCabinetAction | null {
  const cleaned = String(text || '').replace(/\s+/gu, ' ').trim();
  if (!cleaned) return null;
  const dateMatch = cleaned.match(/(\d{2}\.\d{2}\.\d{4}\D+\d{1,2}:\d{2})/u);
  const datetime = dateMatch ? toMoscowIso(dateMatch[1]) : new Date().toISOString();
  const raw = dateMatch ? cleaned.replace(dateMatch[1], '').trim() : cleaned;
  if (!raw) return null;

  const people = Array.from(cleaned.matchAll(/([^\s#][^#]{1,40}?)\s*#(\d{3,10})/gu))
    .map(match => ({ nickname: match[1].trim(), staticId: Number(match[2]) || 0 }))
    .filter(person => person.staticId);
  const type = actionType(raw);
  return {
    externalLogId: externalId([datetime, raw]),
    datetime,
    actionRaw: raw,
    actionType: type,
    member: people[0] || { nickname: '', staticId: 0 },
    initiator: people[1] || null,
    quantity: null,
    unit: null,
    direction: null,
    contract: null,
    amount: parseMoneyAmount(raw),
    balanceAfter: parseBalanceAfter(raw),
    status: type === 'unknown' ? 'unparsed' : 'parsed'
  };
}

function normalizedLines(text: string): string[] {
  return String(text || '')
    .split(/\r?\n/u)
    .map(line => line.replace(/\s+/gu, ' ').trim())
    .filter(Boolean);
}

function parseFinanceRowText(text: string): FamilyCabinetAction | null {
  const lines = normalizedLines(text);
  const dateIndex = lines.findIndex(line => /\d{2}\.\d{2}\.\d{4}\D+\d{1,2}:\d{2}/u.test(line));
  if (dateIndex < 0) return null;
  const dateText = lines[dateIndex];
  const moneyIndexes = lines
    .map((line, index) => ({ line, index }))
    .filter(item => item.index > dateIndex && item.line.includes('$'));
  const operationIndex = moneyIndexes.length >= 2 ? moneyIndexes[1].index + 1 : dateIndex + 1;
  const operation = lines[operationIndex] || lines.slice(dateIndex + 1).find(line => !line.includes('$')) || '';
  const actorText = lines.slice(operationIndex + 1).find(line => /#\d{3,10}/u.test(line)) || '';
  const arrowPeople = actorText.split(/\s*[→>]\s*/u).map(extractPerson).filter(Boolean) as { nickname: string; staticId: number }[];
  const people = arrowPeople.length
    ? arrowPeople
    : Array.from(`${operation} ${actorText}`.matchAll(/([^\s#][^#]{1,40}?)\s*#(\d{3,10})/gu))
      .map(match => ({ nickname: match[1].trim(), staticId: Number(match[2]) || 0 }))
      .filter(person => person.staticId);
  const amountText = moneyIndexes[0]?.line || '';
  const balanceText = moneyIndexes[1]?.line || '';
  const raw = [operation, amountText, balanceText, actorText].filter(Boolean).join(' • ');
  const type = actionType(raw);

  if (!operation && !amountText) return null;
  return {
    externalLogId: externalId([dateText, operation, amountText, balanceText, actorText]),
    datetime: toMoscowIso(dateText),
    actionRaw: operation || raw,
    actionType: type === 'unknown' && amountText ? (parseMoneyAmount(amountText) ?? 0) < 0 ? 'finance_withdraw' : 'finance_deposit' : type,
    member: people[1] || { nickname: '', staticId: 0 },
    initiator: people[0] || null,
    quantity: null,
    unit: null,
    direction: null,
    contract: null,
    amount: parseMoneyAmount(amountText || raw),
    balanceAfter: parseMoneyAmount(balanceText) ?? parseBalanceAfter(raw),
    status: 'parsed'
  };
}

function parseTextDump(text: string, finance = false): FamilyCabinetAction[] {
  const lines = normalizedLines(text);
  const logs: FamilyCabinetAction[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (!/\d{2}\.\d{2}\.\d{4}\D+\d{1,2}:\d{2}/u.test(lines[index])) continue;
    const chunkLines = lines.slice(index, Math.min(lines.length, index + (finance ? 6 : 5)));
    const action = finance
      ? parseFinanceRowText(chunkLines.join('\n')) || parseTextFallback(chunkLines.join(' '))
      : parseTextFallback(chunkLines.join(' '));
    if (action && action.actionRaw.length > 3) logs.push(action);
  }

  return uniqueActions(logs);
}

function uniqueActions(actions: FamilyCabinetAction[]): FamilyCabinetAction[] {
  const seen = new Set<string>();
  const unique: FamilyCabinetAction[] = [];
  for (const action of actions) {
    if (seen.has(action.externalLogId)) continue;
    seen.add(action.externalLogId);
    unique.push(action);
  }
  return unique;
}

function externalId(parts: string[]): string {
  return `majestic-${crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 16)}`;
}

function withTab(url: string, tab: string): string {
  const clean = String(url || '').replace(/\?.*$/u, '');
  return `${clean}?tab=${tab}`;
}

function tabLabels(tab: string): string[] {
  if (tab === 'finance' || tab === 'finances') return ['Финансы', 'Finance', 'Finances'];
  if (tab === 'logs' || tab === 'actions') return ['Действия', 'Логи', 'Actions', 'Logs'];
  return [tab];
}

async function clickTabByLabel(page: any, tab: string): Promise<boolean> {
  for (const label of tabLabels(tab)) {
    const clicked = await page.getByText(label, { exact: true }).first().click({ timeout: 3000 }).then(() => true).catch(() => false);
    if (clicked) {
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => null);
      await page.waitForTimeout(800);
      return true;
    }
  }
  return false;
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

async function candidateRowTexts(page: any): Promise<string[]> {
  return await page.locator('body *').evaluateAll((elements: Element[]) => {
    const dateRe = /\d{2}\.\d{2}\.\d{4}\D+\d{1,2}:\d{2}/u;
    const texts = elements
      .map(element => (element as HTMLElement).innerText || '')
      .map(text => text.replace(/[ \t]+/gu, ' ').trim())
      .filter(text => dateRe.test(text) && text.length < 900 && text.split(/\r?\n/u).length <= 12);
    return Array.from(new Set(texts));
  }).catch(() => []);
}

async function parseRows(page: any, forceTextFallback = false): Promise<FamilyCabinetAction[]> {
  const rowSelector = 'div.overflow-hidden.rounded-lg.bg-background-tertiary';
  const rows = page.locator(rowSelector);
  const count = await rows.count().catch(() => 0);
  const logs: FamilyCabinetAction[] = [];

  if (count === 0) {
    for (const text of await candidateRowTexts(page)) {
      const action = forceTextFallback
        ? parseFinanceRowText(text) || parseTextFallback(text)
        : parseTextFallback(text);
      if (action) logs.push(action);
    }
    if (logs.length) return uniqueActions(logs);

    const bodyText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
    return parseTextDump(bodyText, forceTextFallback);
  }

  for (let index = 0; index < count; index += 1) {
    const row = rows.nth(index);
    if (forceTextFallback) {
      const fallbackText = await row.innerText().catch(() => '');
      const fallbackAction = parseFinanceRowText(fallbackText) || parseTextFallback(fallbackText);
      if (fallbackAction) logs.push(fallbackAction);
      continue;
    }

    const desktopRow = row.locator('div.hidden.items-start.xl\\:flex');
    const cols = desktopRow.locator('> div');
    const colCount = await cols.count().catch(() => 0);
    if (colCount < 4) {
      const fallbackText = await row.innerText().catch(() => '');
      const fallbackAction = parseTextFallback(fallbackText);
      if (fallbackAction) logs.push(fallbackAction);
      continue;
    }

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
      amount: parseMoneyAmount(raw),
      balanceAfter: parseBalanceAfter(raw),
      status: type === 'unknown' ? 'unparsed' : 'parsed'
    });
  }

  return logs;
}

async function scrapeTab(page: any, familyUrl: string, tab: string, target: number, forceTextFallback = false): Promise<FamilyCabinetAction[]> {
  await page.goto(withTab(familyUrl, tab), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => null);
  if (String(page.url()).includes('login')) {
    throw new Error('Сессия кабинета истекла. Нужно обновить SESSION_STORAGE_PATH.');
  }
  await page.locator('div.overflow-hidden.rounded-lg.bg-background-tertiary').first().waitFor({ timeout: 15000 }).catch(() => null);
  await expandRows(page, target);
  let parsed = await parseRows(page, forceTextFallback);
  if (parsed.length === 0 && await clickTabByLabel(page, tab)) {
    await page.locator('div.overflow-hidden.rounded-lg.bg-background-tertiary').first().waitFor({ timeout: 15000 }).catch(() => null);
    await expandRows(page, target);
    parsed = await parseRows(page, forceTextFallback);
  }
  if (parsed.length === 0) {
    const title = await page.title().catch(() => '');
    const bodyText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
    console.warn(`[family-cabinet] ${tab} tab parsed 0 rows. url=${page.url()} title=${title} textLength=${bodyText.length}`);
  }
  return parsed;
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
    const logs = [
      ...await scrapeTab(page, config.familyUrl, 'logs', config.logsFetchTarget),
      ...await scrapeTab(page, config.familyUrl, 'actions', config.logsFetchTarget).catch(error => {
        console.warn('[family-cabinet] actions tab scrape failed:', error);
        return [];
      })
    ];

    if (config.financeTabEnabled) {
      const financeLogs = [
        ...await scrapeTab(page, config.familyUrl, 'finance', config.financeFetchTarget, true).catch(error => {
          console.warn('[family-cabinet] finance tab scrape failed:', error);
          return [];
        }),
        ...await scrapeTab(page, config.familyUrl, 'finances', config.financeFetchTarget, true).catch(error => {
          console.warn('[family-cabinet] finances tab scrape failed:', error);
          return [];
        })
      ];
      logs.push(...financeLogs);
    }

    const unique = uniqueActions(logs);
    if (unique.length === 0) {
      throw new Error('Majestic открылся, но строки логов не найдены. Проверь MAJESTIC_FAMILY_URL, права аккаунта в кабинете или изменение разметки страницы.');
    }

    return unique;
  } finally {
    if (context) await context.close().catch(() => null);
    await browser.close().catch(() => null);
  }
}
