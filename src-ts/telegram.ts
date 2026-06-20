import { Telegraf } from 'telegraf';

interface TelegramSenderLike {
  sendMessage(chatId: string, text: string, options?: Record<string, unknown>): Promise<unknown>;
}

interface DiscordUserLike {
  id?: string;
  username?: string;
  globalName?: string | null;
  tag?: string;
}

interface DiscordGuildLike {
  id?: string;
  name?: string;
}

interface DiscordChannelLike {
  id?: string;
}

interface ApplicationLike {
  id?: string;
  discordId?: string;
  nickname?: string;
  level?: string;
  inviter?: string;
  discovery?: string;
  about?: string;
  text?: string;
}

interface ApplicationNotificationInput {
  application: ApplicationLike;
  guild?: DiscordGuildLike | null;
  candidate?: DiscordUserLike | null;
  moderator?: DiscordUserLike | null;
  ticketChannel?: DiscordChannelLike | null;
}

export interface TelegramNotificationService {
  enabled: boolean;
  notifyApplicationCreated(input: ApplicationNotificationInput): Promise<boolean>;
  notifyApplicationAccepted(input: ApplicationNotificationInput): Promise<boolean>;
  notifyApplicationRejected(input: ApplicationNotificationInput): Promise<boolean>;
  notifyTicketClosed(input: ApplicationNotificationInput): Promise<boolean>;
}

function clean(value: unknown, fallback = 'не указано', maxLength = 1000): string {
  const normalized = String(value || '').trim();
  return (normalized || fallback).slice(0, maxLength);
}

function candidateLine(application: ApplicationLike, candidate?: DiscordUserLike | null): string {
  const id = clean(candidate?.id || application.discordId, 'неизвестен', 32);
  const name = clean(candidate?.globalName || candidate?.username || candidate?.tag, 'имя неизвестно', 100);
  return `<@${id}> | ${name} | ID: ${id}`;
}

function ticketUrl(guild?: DiscordGuildLike | null, channel?: DiscordChannelLike | null): string {
  if (!guild?.id || !channel?.id) return 'недоступна';
  return `https://discord.com/channels/${guild.id}/${channel.id}`;
}

function buildApplicationMessage(title: string, input: ApplicationNotificationInput): string {
  const { application, guild, candidate, moderator, ticketChannel } = input;
  const lines = [
    title,
    '',
    `Сервер: ${clean(guild?.name)} (${clean(guild?.id)})`,
    `Кандидат: ${candidateLine(application, candidate)}`,
    `Ник в игре: ${clean(application.nickname)}`,
    `Level: ${clean(application.level)}`,
    `Кто дал инвайт: ${clean(application.inviter)}`,
    `Откуда узнал: ${clean(application.discovery)}`,
    `ID анкеты: ${clean(application.id)}`,
    `О себе: ${clean(application.about || application.text, 'не указано', 1500)}`,
    `Discord ticket: ${ticketUrl(guild, ticketChannel)}`
  ];

  if (moderator?.id) {
    lines.push(`Модератор: ${clean(moderator.username || moderator.tag || moderator.globalName)} (${moderator.id})`);
  }

  return lines.join('\n').slice(0, 4000);
}

export function createTelegramNotificationService(options: {
  token?: string;
  adminChatId?: string;
  sender?: TelegramSenderLike | null;
  logger?: Pick<Console, 'warn'>;
}): TelegramNotificationService {
  const token = String(options.token || '').trim();
  const adminChatId = String(options.adminChatId || '').trim();
  const enabled = Boolean(adminChatId && (options.sender || token));
  const sender = options.sender || (enabled ? new Telegraf(token).telegram : null);
  const logger = options.logger || console;

  async function send(title: string, input: ApplicationNotificationInput): Promise<boolean> {
    if (!enabled || !sender) return false;

    try {
      await sender.sendMessage(adminChatId, buildApplicationMessage(title, input), {
        disable_web_page_preview: true
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`Telegram notification failed: ${message}`);
      return false;
    }
  }

  return {
    enabled,
    notifyApplicationCreated: input => send('Новая Discord-заявка', input),
    notifyApplicationAccepted: input => send('Discord-заявка одобрена', input),
    notifyApplicationRejected: input => send('Discord-заявка отклонена', input),
    notifyTicketClosed: input => send('Discord ticket закрыт', input)
  };
}

export default createTelegramNotificationService;
