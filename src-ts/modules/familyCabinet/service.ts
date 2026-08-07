import fs from 'node:fs';
import path from 'node:path';
import { EmbedBuilder } from 'discord.js';
import { scrapeFamilyLogs } from './scraper';
import type {
  FamilyCabinetAction,
  FamilyCabinetConfig,
  FamilyCabinetState,
  FamilyCabinetSyncRun
} from './types';

function defaultState(): FamilyCabinetState {
  return {
    actions: [],
    syncRuns: []
  };
}

function safeLimit(value: unknown, fallback = 10): number {
  return Math.max(1, Math.min(50, Number(value) || fallback));
}

function canSendToChannel(channel: any): boolean {
  if (!channel || typeof channel.send !== 'function') return false;
  return typeof channel.isTextBased === 'function' ? Boolean(channel.isTextBased()) : true;
}

function personLabel(person?: { nickname?: string; staticId?: number } | null): string {
  if (!person) return 'Не указан';
  return person.staticId ? `${person.nickname || 'Без ника'} #${person.staticId}` : (person.nickname || 'Не указан');
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value || 'неизвестно';
  return date.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
}

function normalizeAction(input: any): FamilyCabinetAction | null {
  const externalLogId = String(input?.externalLogId || '').trim();
  const actionRaw = String(input?.actionRaw || '').trim();
  if (!externalLogId || !actionRaw) return null;

  return {
    externalLogId,
    datetime: String(input.datetime || new Date().toISOString()),
    actionRaw,
    actionType: String(input.actionType || 'unknown'),
    member: {
      nickname: String(input.member?.nickname || ''),
      staticId: Number(input.member?.staticId) || 0
    },
    initiator: input.initiator ? {
      nickname: String(input.initiator.nickname || ''),
      staticId: Number(input.initiator.staticId) || 0
    } : null,
    quantity: input.quantity ?? null,
    unit: input.unit ?? null,
    direction: input.direction ?? null,
    contract: input.contract ?? null,
    amount: input.amount ?? null,
    balanceAfter: input.balanceAfter ?? null,
    status: input.status === 'parsed' ? 'parsed' : 'unparsed',
    createdAt: String(input.createdAt || new Date().toISOString()),
    updatedAt: String(input.updatedAt || new Date().toISOString())
  };
}

export class FamilyCabinetService {
  private state: FamilyCabinetState;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly client: any,
    private readonly config: FamilyCabinetConfig
  ) {
    this.state = this.loadState();
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  statusLines(): string[] {
    const lastRun = this.state.syncRuns[0];
    return [
      `Статус: ${this.config.enabled ? 'включён' : 'выключен'}`,
      `Live-sync: ${this.config.syncEnabled ? 'включён' : 'выключен'}`,
      `Сохранено действий: ${this.state.actions.length}`,
      `Канал live-sync: ${this.config.syncChannelId ? `<#${this.config.syncChannelId}>` : 'не задан'}`,
      `Файл данных: ${this.config.dataFile}`,
      `Scraper: ${this.config.scraperModulePath ? this.config.scraperModulePath : 'встроенный Playwright scraper'}`,
      lastRun
        ? `Последний запуск: ${lastRun.status}, новых: ${lastRun.logsCreated}, отправлено: ${lastRun.logsDelivered ?? 0}, ${formatDateTime(lastRun.finishedAt)}`
        : 'Последний запуск: ещё не было',
      lastRun?.errorMessage ? `Последняя причина: ${lastRun.errorMessage}` : ''
    ].filter(Boolean);
  }

  startAutoSync(): void {
    if (!this.config.enabled || !this.config.syncEnabled || this.timer) return;
    this.timer = setInterval(() => {
      void this.runSync('auto').catch(error => {
        console.error('[family-cabinet] auto sync failed:', error);
      });
    }, Math.max(60000, this.config.syncIntervalMs));
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  listActions(limit = 10): FamilyCabinetAction[] {
    return this.state.actions.slice(0, safeLimit(limit));
  }

  listUnknown(limit = 10): FamilyCabinetAction[] {
    return this.state.actions.filter(action => action.status === 'unparsed').slice(0, safeLimit(limit));
  }

  async runSync(reason = 'manual'): Promise<FamilyCabinetSyncRun> {
    if (!this.config.enabled) {
      return this.recordRun('disabled', 0, 0, 0, 'FAMILY_CABINET_ENABLED не true.');
    }
    if (this.running) {
      const run = this.recordRun('failed', 0, 0, 0, 'Синхронизация кабинета уже выполняется. Дождись завершения текущего запуска.');
      await this.sendSyncSummary(run, reason).catch(error => {
        console.warn('[family-cabinet] failed to send running summary:', error);
      });
      return run;
    }
    this.running = true;
    const startedAt = new Date().toISOString();
    try {
      const logs = await this.scrape();
      const existing = new Set(this.state.actions.map(action => action.externalLogId));
      const normalized = logs.map(normalizeAction).filter(Boolean) as FamilyCabinetAction[];
      const created = normalized.filter(action => !existing.has(action.externalLogId));
      let delivery: { sent: number; failed: number; errorMessage?: string } = { sent: 0, failed: 0 };

      if (created.length) {
        this.state.actions = [...created, ...this.state.actions].slice(0, 5000);
        this.saveState();
        delivery = await this.sendNewLogs(created, reason);
      }

      const deliveryError = delivery.errorMessage
        ? `Доставка логов: ${delivery.errorMessage}`
        : delivery.failed > 0
          ? `Доставка логов: не отправлено ${delivery.failed}.`
          : '';
      const run = this.recordRun(
        'ok',
        normalized.length,
        created.length,
        normalized.length - created.length,
        deliveryError,
        startedAt,
        delivery.sent,
        delivery.failed
      );
      await this.sendSyncSummary(run, reason).catch(error => {
        console.warn('[family-cabinet] failed to send sync summary:', error);
      });
      return run;
    } catch (error: any) {
      const run = this.recordRun('failed', 0, 0, 0, error?.message || String(error), startedAt);
      await this.sendSyncSummary(run, reason).catch(summaryError => {
        console.warn('[family-cabinet] failed to send failure summary:', summaryError);
      });
      return run;
    } finally {
      this.running = false;
    }
  }

  private async scrape(): Promise<any[]> {
    if (!this.config.scraperModulePath) {
      return await scrapeFamilyLogs(this.config);
    }

    const dynamicRequire = eval('require') as NodeRequire;
    const modulePath = path.isAbsolute(this.config.scraperModulePath)
      ? this.config.scraperModulePath
      : path.resolve(process.cwd(), this.config.scraperModulePath);
    const imported = dynamicRequire(modulePath);

    if (typeof imported.scrapeFamilyLogs === 'function') {
      return await imported.scrapeFamilyLogs(this.config);
    }

    if (typeof imported.FamilyCabinetScraper === 'function') {
      const scraper = new imported.FamilyCabinetScraper({
        email: this.config.email,
        password: this.config.password,
        familyPageUrl: this.config.familyUrl,
        loginUrl: this.config.loginUrl,
        sessionStoragePath: this.config.sessionStoragePath,
        logsFetchTarget: this.config.logsFetchTarget,
        financeTabEnabled: this.config.financeTabEnabled,
        financeFetchTarget: this.config.financeFetchTarget,
        headless: true
      });
      return await scraper.scrapeFamilyLogs();
    }

    throw new Error('Scraper module должен экспортировать scrapeFamilyLogs(config) или FamilyCabinetScraper.');
  }

  private recordRun(
    status: FamilyCabinetSyncRun['status'],
    logsReceived: number,
    logsCreated: number,
    logsSkipped: number,
    errorMessage = '',
    startedAt = new Date().toISOString(),
    logsDelivered = 0,
    logsDeliveryFailed = 0
  ): FamilyCabinetSyncRun {
    const run: FamilyCabinetSyncRun = {
      startedAt,
      finishedAt: new Date().toISOString(),
      status,
      logsReceived,
      logsCreated,
      logsSkipped,
      logsDelivered,
      logsDeliveryFailed,
      errorMessage: errorMessage || undefined
    };
    this.state.syncRuns.unshift(run);
    this.state.syncRuns = this.state.syncRuns.slice(0, 100);
    this.saveState();
    return run;
  }

  private buildActionEmbed(action: FamilyCabinetAction): EmbedBuilder {
    return new EmbedBuilder()
      .setColor(action.status === 'parsed' ? 0x57f287 : 0xf59e0b)
      .setTitle('📘 Лог семейного кабинета')
      .setDescription(action.actionRaw.slice(0, 1000))
      .addFields(
        { name: 'Тип', value: action.actionType || 'unknown', inline: true },
        { name: 'Участник', value: personLabel(action.member), inline: true },
        { name: 'Инициатор', value: personLabel(action.initiator), inline: true },
        { name: 'Дата', value: formatDateTime(action.datetime), inline: false }
      )
      .setFooter({ text: 'KLAIZ • Family Cabinet' })
      .setTimestamp();
  }

  private async fetchSendableChannel(channelId: string, label: string): Promise<{ channel: any | null; errorMessage: string }> {
    if (!channelId) {
      return { channel: null, errorMessage: `${label} не задан.` };
    }
    const channel = await this.client.channels.fetch(channelId).catch(() => null);
    if (!channel) {
      return { channel: null, errorMessage: `${label} не найден или бот не видит канал ${channelId}.` };
    }
    if (!canSendToChannel(channel)) {
      return { channel: null, errorMessage: `${label} не является текстовым каналом или бот не может туда писать.` };
    }
    return { channel, errorMessage: '' };
  }

  private async sendNewLogs(actions: FamilyCabinetAction[], reason: string): Promise<{ sent: number; failed: number; errorMessage?: string }> {
    const resolved = await this.fetchSendableChannel(this.config.syncChannelId, 'FAMILY_CABINET_SYNC_CHANNEL_ID');
    if (!resolved.channel) {
      console.warn(`[family-cabinet] sync channel unavailable: ${resolved.errorMessage}`);
      return { sent: 0, failed: actions.length, errorMessage: resolved.errorMessage };
    }
    const channel = resolved.channel;
    let sent = 0;
    let failed = 0;

    if (actions.length > 10) {
      await channel.send({
        content: `📘 Family Cabinet: найдено ${actions.length} новых логов. Показываю последние 10, остальные сохранены в базе.`
      }).catch(() => null);
    }

    for (const action of actions.slice(0, 10).reverse()) {
      const ok = await channel.send({
        content: reason === 'manual' ? undefined : '',
        embeds: [this.buildActionEmbed(action)]
      }).then(() => true).catch((error: unknown) => {
        failed += 1;
        console.warn('[family-cabinet] failed to send one cabinet log:', error);
        return false;
      });
      if (ok) sent += 1;
    }

    return { sent, failed };
  }

  private buildSyncSummaryEmbed(run: FamilyCabinetSyncRun, reason: string): EmbedBuilder {
    const ok = run.status === 'ok' && !run.errorMessage;
    return new EmbedBuilder()
      .setColor(ok ? 0x57f287 : 0xf59e0b)
      .setTitle(ok ? '✅ Синхронизация Majestic завершена' : '⚠️ Синхронизация Majestic требует внимания')
      .addFields(
        { name: 'Запуск', value: reason || 'unknown', inline: true },
        { name: 'Статус', value: run.status, inline: true },
        { name: 'Получено', value: String(run.logsReceived), inline: true },
        { name: 'Новых', value: String(run.logsCreated), inline: true },
        { name: 'Пропущено', value: String(run.logsSkipped), inline: true },
        { name: 'Отправлено', value: `${run.logsDelivered ?? 0}/${run.logsCreated}`, inline: true },
        { name: 'Дата', value: formatDateTime(run.finishedAt), inline: false },
        ...(run.errorMessage ? [{ name: 'Причина', value: run.errorMessage.slice(0, 1000), inline: false }] : [])
      )
      .setFooter({ text: 'KLAIZ • Majestic Sync' })
      .setTimestamp();
  }

  private async sendSyncSummary(run: FamilyCabinetSyncRun, reason: string): Promise<void> {
    const shouldSend = reason === 'manual' || run.status !== 'ok' || run.logsCreated > 0 || Boolean(run.errorMessage);
    if (!shouldSend) return;

    const targetChannelId = this.config.logChannelId || this.config.syncChannelId;
    const resolved = await this.fetchSendableChannel(targetChannelId, this.config.logChannelId ? 'FAMILY_CABINET_LOG_CHANNEL_ID' : 'FAMILY_CABINET_SYNC_CHANNEL_ID');
    if (!resolved.channel) {
      console.warn(`[family-cabinet] summary channel unavailable: ${resolved.errorMessage}`);
      return;
    }

    await resolved.channel.send({
      embeds: [this.buildSyncSummaryEmbed(run, reason)]
    });
  }

  private loadState(): FamilyCabinetState {
    try {
      if (!fs.existsSync(this.config.dataFile)) return defaultState();
      const parsed = JSON.parse(fs.readFileSync(this.config.dataFile, 'utf8'));
      return {
        ...defaultState(),
        ...parsed,
        actions: Array.isArray(parsed.actions) ? parsed.actions : [],
        syncRuns: Array.isArray(parsed.syncRuns) ? parsed.syncRuns : []
      };
    } catch {
      return defaultState();
    }
  }

  private saveState(): void {
    fs.mkdirSync(path.dirname(this.config.dataFile), { recursive: true });
    fs.writeFileSync(this.config.dataFile, JSON.stringify(this.state, null, 2), 'utf8');
  }
}

export function createFamilyCabinetService(client: any, config: FamilyCabinetConfig): FamilyCabinetService {
  return new FamilyCabinetService(client, config);
}

export function buildFamilyCabinetActionsEmbed(title: string, actions: FamilyCabinetAction[]): EmbedBuilder {
  const lines = actions.map((action, index) => [
    `**${index + 1}. ${formatDateTime(action.datetime)}**`,
    `${action.actionRaw.slice(0, 180)}`,
    `Участник: ${personLabel(action.member)}`
  ].join('\n'));

  return new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle(title)
    .setDescription(lines.length ? lines.join('\n\n').slice(0, 3900) : 'Записей пока нет.')
    .setFooter({ text: 'KLAIZ • Family Cabinet' })
    .setTimestamp();
}
