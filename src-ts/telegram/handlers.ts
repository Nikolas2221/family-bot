import type { Telegraf } from 'telegraf';
import type { AnnouncementService } from '../services/announcements';
import type { TicketService } from '../services/tickets';

function commandText(ctx: any): string {
  return String(ctx.message?.text || '').replace(/^\/\w+(?:@\w+)?\s*/u, '').trim();
}

function telegramAuthor(ctx: any): { id: string; name: string } {
  const user = ctx.from || {};
  const id = String(user.id || 'unknown');
  const name = user.username ? `@${user.username}` : [user.first_name, user.last_name].filter(Boolean).join(' ') || id;
  return { id, name };
}

export function registerTelegramHandlers(bot: Telegraf | null, options: {
  adminChatId: string;
  tickets: TicketService;
  announcements: AnnouncementService;
}): void {
  if (!bot) return;
  const adminChatId = String(options.adminChatId || '').trim();

  function isAdminChat(ctx: any): boolean {
    return Boolean(adminChatId && String(ctx.chat?.id || '') === adminChatId);
  }

  async function requireAdminChat(ctx: any): Promise<boolean> {
    if (isAdminChat(ctx)) return true;
    await ctx.reply('❌ Эта команда доступна только в административном чате.');
    return false;
  }

  bot.action(/^ticket_take:(.+)$/u, async (ctx: any) => {
    if (!(await requireAdminChat(ctx))) return;
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

  bot.command('reply', async (ctx: any) => {
    if (!(await requireAdminChat(ctx))) return;
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
    if (!(await requireAdminChat(ctx))) return;
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
    await ctx.reply(result.ok ? '✅ Отправлено в Discord.' : '❌ Не удалось отправить объявление в Discord.');
  }

  bot.command('announce', (ctx: any) => handleAnnouncement(ctx, 'announcement'));
  bot.command('event', (ctx: any) => handleAnnouncement(ctx, 'event'));
}
