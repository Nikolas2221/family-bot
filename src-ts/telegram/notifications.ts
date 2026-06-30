import { Telegraf } from 'telegraf';

export interface TelegramSenderLike {
  sendMessage(chatId: string, text: string, options?: Record<string, unknown>): Promise<unknown>;
}

export interface ApplicationNotificationInput {
  application: Record<string, any>;
  familyTitle?: string;
  guild?: { id?: string; name?: string } | null;
  candidate?: { id?: string; username?: string; globalName?: string | null; tag?: string } | null;
  moderator?: { id?: string; username?: string; globalName?: string | null; tag?: string } | null;
  ticketChannel?: { id?: string; name?: string } | null;
  reason?: string;
  status?: string;
}

export interface TicketActivityNotificationInput {
  application: Record<string, any>;
  guildId: string;
  channelId: string;
  authorName?: string;
  content?: string;
  count: number;
}

export interface MemberJoinedNotificationInput {
  guild: { id: string; name?: string; memberCount?: number };
  member: { id: string; username?: string; globalName?: string | null; tag?: string; createdAt?: Date };
}

export interface AfkRequestNotificationInput {
  request: {
    id: string;
    guildId: string;
    channelId: string;
    messageId: string;
    userId: string;
    nicknameStatic: string;
    startDate: string;
    endDate: string;
    reason: string;
  };
}

export interface TelegramNotificationService {
  enabled: boolean;
  notifyApplicationCreated(input: ApplicationNotificationInput): Promise<boolean>;
  notifyApplicationAccepted(input: ApplicationNotificationInput): Promise<boolean>;
  notifyApplicationRejected(input: ApplicationNotificationInput): Promise<boolean>;
  notifyTicketClosed(input: ApplicationNotificationInput): Promise<boolean>;
  notifyTicketActivity(input: TicketActivityNotificationInput): Promise<boolean>;
  notifyMemberJoined(input: MemberJoinedNotificationInput): Promise<boolean>;
  notifyScamBlocked(input: Record<string, any>): Promise<boolean>;
  notifyAfkRequestCreated(input: AfkRequestNotificationInput): Promise<boolean>;
  sendAnnouncement(input: { type: 'announcement' | 'event'; text: string; authorName: string; createdAt?: Date }): Promise<{ ok: boolean; messageId: string }>;
}

function clean(value: unknown, fallback = 'не указано', maxLength = 1000): string {
  const normalized = String(value || '').trim();
  return (normalized || fallback).slice(0, maxLength);
}

function candidateName(input: ApplicationNotificationInput): string {
  return clean(
    input.candidate?.globalName
      || input.candidate?.username
      || input.candidate?.tag
      || input.application.discordUsername,
    'имя неизвестно',
    100
  );
}

function candidateId(input: ApplicationNotificationInput): string {
  return clean(input.candidate?.id || input.application.discordId, 'неизвестен', 32);
}

export function discordTicketUrl(guildId?: string, channelId?: string): string {
  if (!guildId || !channelId) return '';
  return `https://discord.com/channels/${guildId}/${channelId}`;
}

function ticketLabel(input: ApplicationNotificationInput): string {
  const url = discordTicketUrl(input.guild?.id, input.ticketChannel?.id);
  const name = clean(input.ticketChannel?.name || input.application.ticketChannelName, 'ticket');
  return url ? `${name}\n${url}` : name;
}

function buildNewApplicationMessage(input: ApplicationNotificationInput): string {
  const application = input.application;
  const id = candidateId(input);
  return [
    `📩 Новая заявка в ${clean(input.familyTitle, 'семью', 100)}`,
    '',
    `Кандидат: <@${id}> / ${candidateName(input)}`,
    `Discord ID: ${id}`,
    `Ник в игре: ${clean(application.nickname)}`,
    `Лвл: ${clean(application.level)}`,
    `Кто дал инвайт: ${clean(application.inviter)}`,
    `Откуда узнал: ${clean(application.discovery)}`,
    `ID анкеты: ${clean(application.id)}`,
    '',
    `О себе: ${clean(application.about || application.text, 'не указано', 1500)}`,
    '',
    'Discord тикет:',
    ticketLabel(input)
  ].join('\n').slice(0, 4000);
}

function buildDecisionMessage(title: string, input: ApplicationNotificationInput): string {
  const lines = [
    title,
    '',
    `ID анкеты: #${clean(input.application.id)}`,
    `Кандидат: ${candidateName(input)} (${candidateId(input)})`,
    `Статус: ${clean(input.status || input.application.ticketStatus || input.application.status)}`,
    `Модератор: ${clean(input.moderator?.username || input.moderator?.globalName || input.moderator?.tag || input.moderator?.id)}`,
    `Причина: ${clean(input.reason)}`,
    `Discord тикет: ${ticketLabel(input)}`
  ];
  return lines.join('\n').slice(0, 4000);
}

export function createTelegramNotificationService(options: {
  token?: string;
  adminChatId?: string;
  announcementsChatId?: string;
  sender?: TelegramSenderLike | null;
  logger?: Pick<Console, 'warn'>;
}): TelegramNotificationService {
  const token = String(options.token || '').trim();
  const adminChatId = String(options.adminChatId || '').trim();
  const announcementsChatId = String(options.announcementsChatId || adminChatId).trim();
  const enabled = Boolean(adminChatId && (options.sender || token));
  const sender = options.sender || (enabled ? new Telegraf(token).telegram : null);
  const logger = options.logger || console;

  async function sendWithResult(chatId: string, text: string, sendOptions: Record<string, unknown> = {}): Promise<{ ok: boolean; messageId: string }> {
    if (!enabled || !sender || !chatId) return { ok: false, messageId: '' };
    try {
      const result: any = await sender.sendMessage(chatId, text.slice(0, 4000), {
        disable_web_page_preview: true,
        ...sendOptions
      });
      return { ok: true, messageId: String(result?.message_id || '') };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`Telegram notification failed: ${message}`);
      return { ok: false, messageId: '' };
    }
  }

  async function send(chatId: string, text: string, sendOptions: Record<string, unknown> = {}): Promise<boolean> {
    return (await sendWithResult(chatId, text, sendOptions)).ok;
  }

  return {
    enabled,
    notifyApplicationCreated(input) {
      const url = discordTicketUrl(input.guild?.id, input.ticketChannel?.id);
      const buttons: Array<Array<Record<string, string>>> = [];
      if (url) buttons.push([{ text: 'Открыть тикет', url }]);
      buttons.push([{ text: 'Взять в работу', callback_data: `ticket_take:${input.application.id}` }]);
      return send(adminChatId, buildNewApplicationMessage(input), {
        reply_markup: { inline_keyboard: buttons }
      });
    },
    notifyApplicationAccepted: input => send(adminChatId, buildDecisionMessage('✅ Заявка одобрена', { ...input, status: 'approved' })),
    notifyApplicationRejected: input => send(adminChatId, buildDecisionMessage('❌ Заявка отклонена', { ...input, status: 'rejected' })),
    notifyTicketClosed: input => send(adminChatId, buildDecisionMessage('✅ Тикет закрыт', { ...input, status: input.status || 'closed' })),
    notifyTicketActivity(input) {
      const url = discordTicketUrl(input.guildId, input.channelId);
      const text = input.count > 1
        ? `💬 В тикете #${input.application.id} есть новые сообщения: ${input.count}\n\nСсылка на тикет: ${url}`
        : [
            `💬 Новое сообщение в тикете #${input.application.id}`,
            '',
            `Автор: ${clean(input.authorName)}`,
            `Текст: ${clean(input.content, 'без текста', 1500)}`,
            '',
            `Ссылка на тикет: ${url}`
          ].join('\n');
      return send(adminChatId, text);
    },
    notifyMemberJoined(input) {
      const memberName = clean(input.member.globalName || input.member.username || input.member.tag, 'имя неизвестно', 100);
      const createdAt = input.member.createdAt instanceof Date
        ? input.member.createdAt.toLocaleString('ru-RU')
        : 'неизвестно';
      return send(adminChatId, [
        '👋 Новый участник на Discord-сервере',
        '',
        `Сервер: ${clean(input.guild.name, input.guild.id, 100)}`,
        input.guild.memberCount ? `Участников на сервере: ${input.guild.memberCount}` : '',
        `Пользователь: ${memberName}`,
        `Discord ID: ${input.member.id}`,
        `Аккаунт создан: ${createdAt}`
      ].filter(Boolean).join('\n'), {
        reply_markup: {
          inline_keyboard: [[{
            text: '✅ Подтвердить и выдать роль',
            callback_data: `welcome_verify:${input.guild.id}:${input.member.id}`
          }]]
        }
      });
    },
    notifyScamBlocked(input) {
      const guildName = clean(input.guild?.name || input.guild?.id, 'сервер', 100);
      const userName = clean(input.user?.globalName || input.user?.username || input.user?.id, 'неизвестно', 100);
      const channelId = clean(input.channel?.id, 'unknown', 32);
      const status = [
        input.deleted ? 'сообщение удалено' : 'сообщение НЕ удалено',
        input.muted ? `мут ${clean(input.timeoutMinutes)} мин.` : 'мут НЕ выдан'
      ].join(', ');
      return send(adminChatId, [
        '🚨 Scam guard сработал',
        '',
        `Сервер: ${guildName}`,
        `Пользователь: ${userName} (${clean(input.user?.id, 'unknown', 32)})`,
        `Канал: ${channelId}`,
        `Причина: ${clean(input.reason, 'scam/phishing', 200)}`,
        `Результат: ${status}`,
        '',
        `Фрагмент: ${clean(input.content, 'без текста', 1200)}`
      ].join('\n'));
    },
    notifyAfkRequestCreated(input) {
      const request = input.request;
      const url = request.guildId && request.channelId && request.messageId
        ? `https://discord.com/channels/${request.guildId}/${request.channelId}/${request.messageId}`
        : '';
      const buttons: Array<Array<Record<string, string>>> = [[
        { text: '✅ Одобрить', callback_data: `afk_approve:${request.id}` },
        { text: '❌ Отклонить', callback_data: `afk_decline:${request.id}` }
      ]];
      if (url) buttons.unshift([{ text: 'Открыть заявку в Discord', url }]);
      return send(adminChatId, [
        '🏖️ Новая заявка на АФК-отпуск',
        '',
        `Пользователь: <@${clean(request.userId)}>`,
        `Discord ID: ${clean(request.userId)}`,
        `Ник и статик: ${clean(request.nicknameStatic)}`,
        `Период: ${clean(request.startDate)} - ${clean(request.endDate)}`,
        `Причина: ${clean(request.reason, 'Не указана', 1500)}`,
        `ID заявки: ${clean(request.id)}`,
        '',
        `Discord: ${url || 'ссылка недоступна'}`
      ].join('\n'), { reply_markup: { inline_keyboard: buttons } });
    },
    sendAnnouncement(input) {
      const title = input.type === 'event' ? '📅 Семейное событие' : '📢 Семейное объявление';
      return sendWithResult(announcementsChatId, [
        title,
        '',
        clean(input.text, '', 3000),
        '',
        'Источник: Discord',
        `Автор: ${clean(input.authorName)}`,
        `Дата: ${(input.createdAt || new Date()).toLocaleString('ru-RU')}`
      ].join('\n'));
    }
  };
}
