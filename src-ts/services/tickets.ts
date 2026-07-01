import type { ApplicationRecord, StorageApi } from '../types';
import type { TelegramNotificationService } from '../telegram';

interface DiscordChannelLike {
  id: string;
  name?: string;
  archived?: boolean;
  send(payload: Record<string, unknown>): Promise<unknown>;
}

interface DiscordClientLike {
  channels: {
    fetch(channelId: string): Promise<DiscordChannelLike | null>;
  };
}

export interface TicketService {
  findTicket(ticketId: string): ApplicationRecord | null;
  findTicketByChannel(channelId: string): ApplicationRecord | null;
  registerTicket(application: ApplicationRecord, input: { channelId: string; channelName?: string; discordUsername?: string }): void;
  takeInWork(ticketId: string, handler: string): Promise<'ok' | 'not_found' | 'closed' | 'channel_missing'>;
  replyToTicket(ticketId: string, text: string, authorName: string): Promise<'ok' | 'not_found' | 'closed' | 'channel_missing'>;
  markDecision(application: ApplicationRecord, status: 'approved' | 'rejected', handledBy: string): void;
  markClosed(application: ApplicationRecord, input: { handledBy: string; reason?: string }): void;
  handleDiscordTicketMessage(message: {
    content?: string;
    guild?: { id?: string } | null;
    channel: { id: string; archived?: boolean };
    author: { bot?: boolean; username?: string; globalName?: string | null; id?: string };
  }): Promise<boolean>;
  stop(): void;
}

function isClosed(application: ApplicationRecord): boolean {
  return ['approved', 'rejected', 'closed'].includes(application.ticketStatus || 'open');
}

export function createTicketService(options: {
  storage: StorageApi;
  client: DiscordClientLike;
  telegramNotifications: TelegramNotificationService;
  notificationWindowMs?: number;
  now?: () => number;
}): TicketService {
  const { storage, client, telegramNotifications } = options;
  const notificationWindowMs = options.notificationWindowMs || 60_000;
  const now = options.now || Date.now;
  const pendingTimers = new Map<string, NodeJS.Timeout>();

  function findTicket(ticketId: string): ApplicationRecord | null {
    const normalized = String(ticketId || '').trim().replace(/^#/, '');
    return storage.getStore().applications.find(item => item.id === normalized) || null;
  }

  function findTicketByChannel(channelId: string): ApplicationRecord | null {
    return storage.getStore().applications.find(item => (item.ticketChannelId || item.ticketThreadId) === channelId) || null;
  }

  function registerTicket(application: ApplicationRecord, input: { channelId: string; channelName?: string; discordUsername?: string }): void {
    application.ticketChannelId = input.channelId;
    application.ticketChannelName = String(input.channelName || '').trim();
    application.discordUsername = String(input.discordUsername || application.discordUsername || '').trim();
    application.ticketStatus = 'open';
    application.pendingMessageCount = 0;
    application.lastTelegramMessageAt = 0;
    storage.save();
  }

  async function fetchOpenChannel(application: ApplicationRecord): Promise<DiscordChannelLike | null> {
    const channelId = application.ticketChannelId || application.ticketThreadId;
    if (!channelId || isClosed(application)) return null;
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel || channel.archived) return null;
    return channel;
  }

  async function takeInWork(ticketId: string, handler: string) {
    const application = findTicket(ticketId);
    if (!application) return 'not_found' as const;
    if (isClosed(application)) return 'closed' as const;
    const channel = await fetchOpenChannel(application);
    if (!channel) return 'channel_missing' as const;

    application.ticketStatus = 'in_progress';
    application.handledBy = handler;
    storage.save();
    await channel.send({
      content: `👮 Заявку взял в работу: ${handler}`,
      allowedMentions: { parse: [] }
    });
    return 'ok' as const;
  }

  async function replyToTicket(ticketId: string, text: string, authorName: string) {
    const application = findTicket(ticketId);
    if (!application) return 'not_found' as const;
    if (isClosed(application)) return 'closed' as const;
    const channel = await fetchOpenChannel(application);
    if (!channel) return 'channel_missing' as const;

    await channel.send({
      content: [`💬 Ответ от администрации Telegram: ${String(text).trim().slice(0, 1800)}`, '', `Отправил: ${authorName}`].join('\n'),
      allowedMentions: { parse: [] }
    });
    return 'ok' as const;
  }

  function markDecision(application: ApplicationRecord, status: 'approved' | 'rejected', handledBy: string): void {
    application.ticketStatus = status;
    application.handledBy = handledBy;
    application.closedAt = new Date(now()).toISOString();
    storage.save();
  }

  function markClosed(application: ApplicationRecord, input: { handledBy: string; reason?: string }): void {
    application.ticketStatus = 'closed';
    application.handledBy = input.handledBy;
    application.closeReason = String(input.reason || 'Закрыто администратором').trim();
    application.closedAt = new Date(now()).toISOString();
    application.pendingMessageCount = 0;
    const timer = pendingTimers.get(application.id);
    if (timer) clearTimeout(timer);
    pendingTimers.delete(application.id);
    storage.save();
  }

  async function flushPending(application: ApplicationRecord, guildId: string): Promise<void> {
    pendingTimers.delete(application.id);
    const count = Number(application.pendingMessageCount || 0);
    if (!count || isClosed(application)) return;
    application.pendingMessageCount = 0;
    application.lastTelegramMessageAt = now();
    storage.save();
    await telegramNotifications.notifyTicketActivity({
      application,
      guildId,
      channelId: application.ticketChannelId || application.ticketThreadId,
      count
    });
  }

  async function handleDiscordTicketMessage(message: {
    content?: string;
    guild?: { id?: string } | null;
    channel: { id: string; archived?: boolean };
    author: { bot?: boolean; username?: string; globalName?: string | null; id?: string };
  }): Promise<boolean> {
    const content = String(message.content || '').trim();
    if (!content || message.author.bot || message.channel.archived || !message.guild?.id) return false;
    const application = findTicketByChannel(message.channel.id);
    if (!application || isClosed(application)) return false;

    const timestamp = now();
    const lastSentAt = Number(application.lastTelegramMessageAt || 0);
    const elapsed = timestamp - lastSentAt;
    if (!lastSentAt || elapsed >= notificationWindowMs) {
      application.lastTelegramMessageAt = timestamp;
      application.pendingMessageCount = 0;
      storage.save();
      await telegramNotifications.notifyTicketActivity({
        application,
        guildId: message.guild.id,
        channelId: message.channel.id,
        authorName: message.author.globalName || message.author.username || message.author.id,
        content,
        count: 1
      });
      return true;
    }

    application.pendingMessageCount = Number(application.pendingMessageCount || 0) + 1;
    storage.save();
    if (!pendingTimers.has(application.id)) {
      const delay = Math.max(1, notificationWindowMs - elapsed);
      pendingTimers.set(application.id, setTimeout(() => {
        void flushPending(application, message.guild!.id!).catch(error => {
          console.warn('Telegram ticket digest failed:', error);
        });
      }, delay));
    }
    return true;
  }

  function stop(): void {
    for (const timer of pendingTimers.values()) clearTimeout(timer);
    pendingTimers.clear();
  }

  return {
    findTicket,
    findTicketByChannel,
    registerTicket,
    takeInWork,
    replyToTicket,
    markDecision,
    markClosed,
    handleDiscordTicketMessage,
    stop
  };
}
