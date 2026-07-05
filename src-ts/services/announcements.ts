import { PermissionFlagsBits } from 'discord.js';

import type { AnnouncementRecord, StorageApi } from '../types';
import type { TelegramNotificationService } from '../telegram';

interface DiscordMessageLike {
  id?: string;
}

interface DiscordChannelLike {
  send(payload: Record<string, unknown>): Promise<DiscordMessageLike>;
}

interface DiscordClientLike {
  channels: {
    fetch(channelId: string): Promise<DiscordChannelLike | null>;
  };
}

type AnnouncementInput = {
  guildId?: string;
  type: 'announcement' | 'event';
  text: string;
  authorId: string;
  authorName: string;
  fallbackDiscordChannelId?: string;
};

type AnnouncementResultCode =
  | 'discord_channel_missing'
  | 'discord_send_failed'
  | 'telegram_disabled'
  | 'telegram_send_failed';

type AnnouncementResult = { ok: boolean; code?: AnnouncementResultCode; detail?: string };

export interface AnnouncementService {
  sendDiscordFromTelegram(input: AnnouncementInput): Promise<AnnouncementResult>;
  sendTelegramFromDiscord(input: AnnouncementInput): Promise<AnnouncementResult>;
}

function safeDetail(value: unknown): string {
  return String(value || '').trim().slice(0, 280);
}

export function announcementResultReason(code?: AnnouncementResultCode, detail?: string): string {
  let reason = '';
  switch (code) {
    case 'discord_channel_missing':
      reason = 'Discord-канал объявлений не найден или не настроен. Проверь DISCORD_ANNOUNCEMENTS_CHANNEL_ID и права бота на просмотр/отправку сообщений.';
      break;
    case 'discord_send_failed':
      reason = 'Discord не принял сообщение. Проверь права бота Send Messages, Embed Links и доступ к каналу объявлений.';
      break;
    case 'telegram_disabled':
      reason = 'Telegram-мост выключен. Проверь TELEGRAM_BOT_TOKEN и TELEGRAM_ADMIN_CHAT_ID в Railway.';
      break;
    case 'telegram_send_failed':
      reason = 'Telegram не принял сообщение. Проверь TELEGRAM_ANNOUNCEMENTS_CHAT_ID/TELEGRAM_ADMIN_CHAT_ID, что бот добавлен в чат и может писать сообщения.';
      break;
    default:
      reason = 'Неизвестная ошибка. Проверь логи Railway.';
      break;
  }

  const cleanDetail = safeDetail(detail);
  return cleanDetail ? `${reason}\nДетали: ${cleanDetail}` : reason;
}

export function formatAnnouncementResultMessage(result: AnnouncementResult, target: 'discord' | 'telegram'): string {
  const targetName = target === 'telegram' ? 'Telegram' : 'Discord';
  if (!result.ok) {
    return `❌ Не удалось отправить объявление в ${targetName}.\nПричина: ${announcementResultReason(result.code, result.detail)}`;
  }

  const okMessage = `✅ Отправлено в ${targetName}.`;
  if (!result.code) return okMessage;

  return `${okMessage}\n⚠️ Дополнительно: ${announcementResultReason(result.code, result.detail)}`;
}

export function canSendDiscordAnnouncement(member: any, memberPermissions: any, roleIds: string[]): boolean {
  const configuredRoleIds = Array.isArray(roleIds) ? roleIds.filter(Boolean) : [];
  if (configuredRoleIds.length) {
    return configuredRoleIds.some(roleId => member?.roles?.cache?.has?.(roleId));
  }
  return Boolean(
    memberPermissions?.has?.(PermissionFlagsBits.Administrator)
    || member?.permissions?.has?.(PermissionFlagsBits.Administrator)
  );
}

function title(type: 'announcement' | 'event'): string {
  return type === 'event' ? '📅 Семейное событие' : '📢 Семейное объявление';
}

function safeText(value: unknown, maxLength = 3000): string {
  return String(value || '').trim().slice(0, maxLength);
}

export function createAnnouncementService(options: {
  storage: StorageApi;
  client: DiscordClientLike;
  telegramNotifications: TelegramNotificationService;
  discordChannelId: string;
  now?: () => Date;
}): AnnouncementService {
  const { storage, client, telegramNotifications } = options;
  const discordChannelId = String(options.discordChannelId || '').trim();
  const now = options.now || (() => new Date());

  function saveAnnouncement(record: AnnouncementRecord): void {
    const store = storage.getStore();
    store.announcements = [record, ...(store.announcements || [])].slice(0, 500);
    storage.save();
  }

  function baseRecord(input: AnnouncementInput & {
    source: 'telegram' | 'discord';
    targetPlatform: 'telegram' | 'discord';
  }): AnnouncementRecord {
    const createdAt = now().toISOString();
    return {
      announcementId: `${input.source}:${Date.parse(createdAt)}:${input.authorId}`,
      source: input.source,
      type: input.type,
      text: safeText(input.text),
      authorId: input.authorId,
      authorName: safeText(input.authorName, 100),
      targetPlatform: input.targetPlatform,
      createdAt,
      discordMessageId: '',
      telegramMessageId: ''
    };
  }

  async function fetchDiscordChannel(fallbackDiscordChannelId = ''): Promise<DiscordChannelLike | null> {
    const ids = Array.from(new Set([
      discordChannelId,
      String(fallbackDiscordChannelId || '').trim()
    ].filter(Boolean)));

    for (const id of ids) {
      const channel = await client.channels.fetch(id).catch(() => null);
      if (channel) return channel;
    }

    return null;
  }

  async function publishDiscord(channel: DiscordChannelLike, input: AnnouncementInput, source: 'Telegram' | 'Discord', createdAt: string): Promise<string> {
    const message = await channel.send({
      content: [
        title(input.type),
        '',
        safeText(input.text),
        '',
        `Источник: ${source}`,
        `Автор: ${safeText(input.authorName, 100)}`,
        `Дата: ${new Date(createdAt).toLocaleString('ru-RU')}`
      ].join('\n'),
      allowedMentions: { parse: [] }
    });
    return String(message?.id || '');
  }

  async function sendDiscordFromTelegram(input: AnnouncementInput): Promise<AnnouncementResult> {
    const channel = await fetchDiscordChannel(input.fallbackDiscordChannelId);
    if (!channel) return { ok: false, code: 'discord_channel_missing' };
    const record = baseRecord({ ...input, source: 'telegram', targetPlatform: 'discord' });
    try {
      record.discordMessageId = await publishDiscord(channel, input, 'Telegram', record.createdAt);
      saveAnnouncement(record);
      return { ok: true };
    } catch (error) {
      console.error('Failed to send Telegram announcement to Discord:', error);
      const detail = error instanceof Error ? error.message : String(error);
      return { ok: false, code: 'discord_send_failed', detail };
    }
  }

  async function sendTelegramFromDiscord(input: AnnouncementInput): Promise<AnnouncementResult> {
    const record = baseRecord({ ...input, source: 'discord', targetPlatform: 'telegram' });
    let warning: AnnouncementResultCode | undefined;
    let warningDetail = '';

    const channel = await fetchDiscordChannel(input.fallbackDiscordChannelId);
    if (!channel) {
      warning = 'discord_channel_missing';
    } else {
      try {
        record.discordMessageId = await publishDiscord(channel, input, 'Discord', record.createdAt);
      } catch (error) {
        console.error('Failed to persist Discord announcement:', error);
        warning = 'discord_send_failed';
        warningDetail = error instanceof Error ? error.message : String(error);
      }
    }

    if (telegramNotifications.enabled === false) {
      saveAnnouncement(record);
      return { ok: false, code: 'telegram_disabled' };
    }

    const telegramResult: any = await telegramNotifications.sendAnnouncement({
      guildId: input.guildId,
      type: input.type,
      text: input.text,
      authorName: input.authorName,
      createdAt: new Date(record.createdAt)
    });
    const sent = typeof telegramResult === 'boolean' ? telegramResult : Boolean(telegramResult?.ok);
    if (!sent) {
      saveAnnouncement(record);
      return { ok: false, code: 'telegram_send_failed', detail: telegramResult?.error };
    }

    record.telegramMessageId = String(telegramResult?.messageId || '');
    saveAnnouncement(record);
    return warning ? { ok: true, code: warning, detail: warningDetail } : { ok: true };
  }

  return { sendDiscordFromTelegram, sendTelegramFromDiscord };
}
