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
};

type AnnouncementResult = { ok: boolean; code?: 'channel_missing' | 'send_failed' };

export interface AnnouncementService {
  sendDiscordFromTelegram(input: AnnouncementInput): Promise<AnnouncementResult>;
  sendTelegramFromDiscord(input: AnnouncementInput): Promise<AnnouncementResult>;
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

  async function fetchDiscordChannel(): Promise<DiscordChannelLike | null> {
    return discordChannelId
      ? client.channels.fetch(discordChannelId).catch(() => null)
      : null;
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
      ].join('\n')
    });
    return String(message?.id || '');
  }

  async function sendDiscordFromTelegram(input: AnnouncementInput): Promise<AnnouncementResult> {
    const channel = await fetchDiscordChannel();
    if (!channel) return { ok: false, code: 'channel_missing' };
    const record = baseRecord({ ...input, source: 'telegram', targetPlatform: 'discord' });
    try {
      record.discordMessageId = await publishDiscord(channel, input, 'Telegram', record.createdAt);
      saveAnnouncement(record);
      return { ok: true };
    } catch (error) {
      console.error('Failed to send Telegram announcement to Discord:', error);
      return { ok: false, code: 'send_failed' };
    }
  }

  async function sendTelegramFromDiscord(input: AnnouncementInput): Promise<AnnouncementResult> {
    const channel = await fetchDiscordChannel();
    if (!channel) return { ok: false, code: 'channel_missing' };
    const record = baseRecord({ ...input, source: 'discord', targetPlatform: 'telegram' });

    try {
      record.discordMessageId = await publishDiscord(channel, input, 'Discord', record.createdAt);
    } catch (error) {
      console.error('Failed to persist Discord announcement:', error);
      return { ok: false, code: 'send_failed' };
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
      return { ok: false, code: 'send_failed' };
    }

    record.telegramMessageId = String(telegramResult?.messageId || '');
    saveAnnouncement(record);
    return { ok: true };
  }

  return { sendDiscordFromTelegram, sendTelegramFromDiscord };
}
