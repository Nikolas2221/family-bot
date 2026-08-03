import type { Telegraf } from 'telegraf';
import { formatAnnouncementResultMessage } from '../services/announcements';
import type { AnnouncementService } from '../services/announcements';
import type { TicketService } from '../services/tickets';
import type { AfkLeaveService } from '../services/afk-leave';
import type { AIService } from '../types';

function commandText(ctx: any): string {
  return String(ctx.message?.text || '').replace(/^\/\w+(?:@\w+)?\s*/u, '').trim();
}

function telegramAuthor(ctx: any): { id: string; name: string } {
  const user = ctx.from || {};
  const id = String(user.id || 'unknown');
  const name = user.username ? `@${user.username}` : [user.first_name, user.last_name].filter(Boolean).join(' ') || id;
  return { id, name };
}

function splitTelegramText(text: string, limit = 3800): string[] {
  const normalized = String(text || '').trim() || 'AI не смог подготовить ответ. Попробуй переформулировать вопрос.';
  const chunks: string[] = [];
  let rest = normalized;
  while (rest.length > limit) {
    const breakpoint = Math.max(
      rest.lastIndexOf('\n\n', limit),
      rest.lastIndexOf('\n', limit),
      rest.lastIndexOf(' ', limit)
    );
    const cutAt = breakpoint > 500 ? breakpoint : limit;
    chunks.push(rest.slice(0, cutAt).trim());
    rest = rest.slice(cutAt).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

function buildTelegramAiSystemPrompt(authorName: string): string {
  return [
    'Ты KLAIZ BOT, AI-помощник для Telegram-чата администрации семьи.',
    'Отвечай по-русски, спокойно, живо и по делу.',
    'Помогай с текстами объявлений, советами по участникам, разбором ситуаций, заявками, модерацией и организацией семьи.',
    `Автор вопроса: ${authorName}.`,
    'Не раскрывай токены, ключи, пароли, cookies, session storage и приватные данные проекта.',
    'Если не хватает контекста, задай один короткий уточняющий вопрос или дай аккуратный вариант с допущениями.'
  ].join(' ');
}

function buildTelegramOnlineSystemPrompt(authorName: string): string {
  return [
    'Ты KLAIZ BOT, AI-советник по онлайну Discord-семьи.',
    'На основе списка участников онлайн сделай короткий красивый отчёт для Telegram.',
    'Структура: сводка, заметные участники/роли, риски по активности, что сделать старшему составу.',
    'Не выдумывай людей и цифры, используй только переданный список.',
    `Запросил: ${authorName}.`
  ].join(' ');
}

function formatTelegramAiCard(title: string, body: string): string {
  return [
    `🤖 ${title}`,
    '━━━━━━━━━━━━',
    String(body || '').trim() || 'Нет данных для анализа.',
    '━━━━━━━━━━━━',
    'KLAIZ BOT • AI'
  ].join('\n');
}

export function registerTelegramHandlers(bot: Telegraf | null, options: {
  adminChatId: string;
  tickets: TicketService;
  announcements: AnnouncementService;
  afkLeave?: AfkLeaveService;
  aiService?: AIService;
  aiCooldownSeconds?: number;
  aiMaxChars?: number;
  getOnlineMembers?: () => Promise<string>;
  verifyWelcomeMember?: (guildId: string, userId: string, actorName: string) => Promise<'ok' | 'already' | 'not_found' | 'role_missing' | 'failed'>;
}): void {
  if (!bot) return;
  const adminChatId = String(options.adminChatId || '').trim();
  const aiCooldowns = new Map<string, number>();

  function isAdminChat(ctx: any): boolean {
    return Boolean(adminChatId && String(ctx.chat?.id || '') === adminChatId);
  }

  async function requireAdminChat(ctx: any): Promise<boolean> {
    if (isAdminChat(ctx)) return true;
    await ctx.reply('❌ Эта команда доступна только в административном чате.');
    return false;
  }

  async function requireTelegramAdmin(ctx: any): Promise<boolean> {
    if (!(await requireAdminChat(ctx))) return false;
    if (ctx.chat?.type === 'private') return true;
    const member = await ctx.getChatMember?.(ctx.from?.id).catch(() => null);
    if (member?.status === 'administrator' || member?.status === 'creator') return true;
    const message = 'Только администратор Telegram-чата может рассматривать заявки';
    if (ctx.answerCbQuery) await ctx.answerCbQuery(message, { show_alert: true });
    else await ctx.reply(message);
    return false;
  }

  bot.action(/^ticket_take:(.+)$/u, async (ctx: any) => {
    if (!(await requireTelegramAdmin(ctx))) return;
    const ticketId = String(ctx.match?.[1] || '').trim();
    const author = telegramAuthor(ctx);
    const result = await options.tickets.takeInWork(ticketId, author.name);
    if (result === 'not_found') {
      await ctx.answerCbQuery(`Тикет ${ticketId} не найден`, { show_alert: true });
      return;
    }
    if (result === 'closed' || result === 'channel_missing') {
      await ctx.answerCbQuery('Тикет уже закрыт или недоступен', { show_alert: true });
      return;
    }
    await ctx.answerCbQuery('Заявка взята в работу');
    await ctx.reply(`✅ Заявка #${ticketId} взята в работу.`);
  });

  bot.action(/^welcome_verify:(\d{16,20}):(\d{16,20})$/u, async (ctx: any) => {
    if (!(await requireTelegramAdmin(ctx))) return;
    const guildId = String(ctx.match?.[1] || '');
    const userId = String(ctx.match?.[2] || '');
    if (!options.verifyWelcomeMember) {
      await ctx.answerCbQuery('Подтверждение временно недоступно', { show_alert: true });
      return;
    }
    const result = await options.verifyWelcomeMember(guildId, userId, telegramAuthor(ctx).name);
    if (result === 'not_found') {
      await ctx.answerCbQuery('Участник или сервер не найден', { show_alert: true });
      return;
    }
    if (result === 'role_missing') {
      await ctx.answerCbQuery('Стартовая роль не настроена', { show_alert: true });
      return;
    }
    if (result === 'failed') {
      await ctx.answerCbQuery('Discord не выдал роль. Проверь права бота.', { show_alert: true });
      return;
    }
    await ctx.answerCbQuery(result === 'already' ? 'Роль уже была выдана' : 'Участник подтверждён');
    await ctx.editMessageReplyMarkup?.({ inline_keyboard: [] }).catch(() => null);
    await ctx.reply(result === 'already'
      ? `ℹ️ Участник <@${userId}> уже подтверждён.`
      : `✅ Участник <@${userId}> подтверждён через Telegram. Стартовая роль выдана.`);
  });

  bot.action(/^afk_approve:([a-f0-9]{8})$/u, async (ctx: any) => {
    if (!(await requireTelegramAdmin(ctx))) return;
    if (!options.afkLeave) {
      await ctx.answerCbQuery('Система АФК-отпусков недоступна', { show_alert: true });
      return;
    }
    const requestId = String(ctx.match?.[1] || '');
    const author = telegramAuthor(ctx);
    const result = await options.afkLeave.reviewFromTelegram(requestId, 'approved', author.id, author.name);
    if (result !== 'ok') {
      const message = result === 'not_found'
        ? 'Заявка не найдена'
        : result === 'already_reviewed'
          ? 'Заявка уже рассмотрена'
          : result === 'busy'
            ? 'Заявку уже рассматривает другой администратор'
            : 'Не удалось обновить заявку в Discord';
      await ctx.answerCbQuery(message, { show_alert: true });
      return;
    }
    await ctx.answerCbQuery('Заявка одобрена');
    await ctx.editMessageReplyMarkup?.({ inline_keyboard: [] }).catch(() => null);
    await ctx.reply(`✅ Заявка #${requestId} одобрена администратором ${author.name}.`);
  });

  bot.action(/^afk_decline:([a-f0-9]{8})$/u, async (ctx: any) => {
    if (!(await requireTelegramAdmin(ctx))) return;
    const requestId = String(ctx.match?.[1] || '');
    await ctx.answerCbQuery('Укажи причину отказа');
    await ctx.reply(`Для отказа обязательно укажи причину:\n/afkdecline ${requestId} причина отказа`);
  });

  bot.command('afkdecline', async (ctx: any) => {
    if (!(await requireTelegramAdmin(ctx))) return;
    if (!options.afkLeave) {
      await ctx.reply('❌ Система АФК-отпусков недоступна.');
      return;
    }
    const input = commandText(ctx);
    const [requestId = '', ...parts] = input.split(/\s+/u);
    const reason = parts.join(' ').trim();
    if (!requestId) {
      await ctx.reply('❌ Укажи ID заявки: /afkdecline ID причина');
      return;
    }
    if (reason.length < 3) {
      await ctx.reply('❌ Обязательно укажи причину отказа после ID заявки.');
      return;
    }
    const author = telegramAuthor(ctx);
    const result = await options.afkLeave.reviewFromTelegram(requestId, 'declined', author.id, author.name, reason);
    if (result !== 'ok') {
      await ctx.reply(result === 'not_found'
        ? '❌ Заявка не найдена.'
        : result === 'already_reviewed'
          ? '❌ Заявка уже рассмотрена.'
          : '❌ Не удалось отклонить заявку в Discord.');
      return;
    }
    await ctx.reply(`❌ Заявка #${requestId} отклонена. Причина: ${reason}`);
  });

  bot.command('reply', async (ctx: any) => {
    if (!(await requireTelegramAdmin(ctx))) return;
    const input = commandText(ctx);
    const [ticketId = '', ...parts] = input.split(/\s+/u);
    const text = parts.join(' ').trim();
    if (!ticketId) {
      await ctx.reply('❌ Укажи ID тикета.');
      return;
    }
    if (!text) {
      await ctx.reply('❌ Укажи текст ответа.');
      return;
    }
    const result = await options.tickets.replyToTicket(ticketId, text, telegramAuthor(ctx).name);
    if (result === 'not_found') {
      await ctx.reply(`❌ Тикет с ID ${ticketId} не найден.`);
      return;
    }
    if (result === 'closed' || result === 'channel_missing') {
      await ctx.reply('❌ Тикет уже закрыт.');
      return;
    }
    await ctx.reply(`✅ Ответ отправлен в тикет #${ticketId}.`);
  });

  async function handleAnnouncement(ctx: any, type: 'announcement' | 'event'): Promise<void> {
    if (!(await requireTelegramAdmin(ctx))) return;
    const text = commandText(ctx);
    if (!text) {
      await ctx.reply('❌ Укажи текст объявления.');
      return;
    }
    const author = telegramAuthor(ctx);
    const result = await options.announcements.sendDiscordFromTelegram({
      type,
      text,
      authorId: author.id,
      authorName: author.name
    });
    await ctx.reply(formatAnnouncementResultMessage(result, 'discord'));
  }

  bot.command('announce', (ctx: any) => handleAnnouncement(ctx, 'announcement'));
  bot.command('event', (ctx: any) => handleAnnouncement(ctx, 'event'));
  bot.command('ai', async (ctx: any) => {
    if (!(await requireTelegramAdmin(ctx))) return;
    const prompt = commandText(ctx);
    if (!prompt) {
      await ctx.reply('❌ Укажи вопрос: /ai текст вопроса');
      return;
    }
    const maxChars = Math.max(50, Number(options.aiMaxChars) || 700);
    if (prompt.length > maxChars) {
      await ctx.reply(`❌ Вопрос слишком длинный. Сейчас: ${prompt.length}/${maxChars}.`);
      return;
    }
    if (!options.aiService) {
      await ctx.reply('❌ AI-помощник сейчас выключен. Проверь AI_ENABLED и OPENROUTER_API_KEY в Railway.');
      return;
    }

    const author = telegramAuthor(ctx);
    const cooldownMs = Math.max(3, Number(options.aiCooldownSeconds) || 30) * 1000;
    const cooldownKey = author.id;
    const nextAllowedAt = Number(aiCooldowns.get(cooldownKey) || 0);
    const waitMs = nextAllowedAt - Date.now();
    if (waitMs > 0) {
      await ctx.reply(`⏳ Подожди ещё ${Math.ceil(waitMs / 1000)} сек. перед следующим AI-вопросом.`);
      return;
    }
    aiCooldowns.set(cooldownKey, Date.now() + cooldownMs);

    const thinking = await ctx.reply('🤖 KLAIZ BOT думает...').catch(() => null);
    try {
      const answer = await options.aiService.aiText(buildTelegramAiSystemPrompt(author.name), prompt);
      for (const chunk of splitTelegramText(answer)) {
        await ctx.reply(chunk);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || 'неизвестная ошибка');
      await ctx.reply(`❌ AI сейчас не ответил.\nПричина: ${message.slice(0, 300)}`);
    } finally {
      if (thinking && typeof ctx.deleteMessage === 'function') {
        await ctx.deleteMessage(thinking.message_id).catch(() => null);
      }
    }
  });
  bot.command('aionline', async (ctx: any) => {
    if (!(await requireTelegramAdmin(ctx))) return;
    if (!options.aiService) {
      await ctx.reply('❌ AI-помощник сейчас выключен. Проверь AI_ENABLED и OPENROUTER_API_KEY в Railway.');
      return;
    }
    if (!options.getOnlineMembers) {
      await ctx.reply('❌ Не удалось получить список участников Discord.');
      return;
    }

    const author = telegramAuthor(ctx);
    const cooldownMs = Math.max(3, Number(options.aiCooldownSeconds) || 30) * 1000;
    const cooldownKey = `${author.id}:online`;
    const nextAllowedAt = Number(aiCooldowns.get(cooldownKey) || 0);
    const waitMs = nextAllowedAt - Date.now();
    if (waitMs > 0) {
      await ctx.reply(`⏳ Подожди ещё ${Math.ceil(waitMs / 1000)} сек. перед следующим AI-анализом онлайна.`);
      return;
    }
    aiCooldowns.set(cooldownKey, Date.now() + cooldownMs);

    const thinking = await ctx.reply('📡 Собираю онлайн и отдаю AI на анализ...').catch(() => null);
    try {
      const onlineText = await options.getOnlineMembers();
      const answer = await options.aiService.aiText(
        buildTelegramOnlineSystemPrompt(author.name),
        `Список Discord online:\n${onlineText}`
      );
      const card = formatTelegramAiCard('AI-анализ онлайна', answer);
      for (const chunk of splitTelegramText(card)) {
        await ctx.reply(chunk);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || 'неизвестная ошибка');
      await ctx.reply(`❌ Не удалось сделать AI-анализ онлайна.\nПричина: ${message.slice(0, 300)}`);
    } finally {
      if (thinking && typeof ctx.deleteMessage === 'function') {
        await ctx.deleteMessage(thinking.message_id).catch(() => null);
      }
    }
  });
  bot.command('online', async (ctx: any) => {
    if (!(await requireTelegramAdmin(ctx))) return;
    if (!options.getOnlineMembers) {
      await ctx.reply('❌ Не удалось получить список участников Discord.');
      return;
    }
    const text = await options.getOnlineMembers().catch(() => '❌ Не удалось получить список участников Discord.');
    await ctx.reply(text);
  });
}
