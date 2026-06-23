const assert = require('node:assert/strict');

const { registerTelegramHandlers } = require('../dist-ts/telegram/handlers');

async function main() {
  const commands = new Map();
  const actions = [];
  const bot = {
    command(name, handler) {
      commands.set(name, handler);
    },
    action(pattern, handler) {
      actions.push({ pattern, handler });
    }
  };
  const replies = [];
  const ticketReplies = [];
  const announcements = [];
  const callbackAnswers = [];
  const verified = [];
  registerTelegramHandlers(bot, {
    adminChatId: '-1001',
    tickets: {
      takeInWork: async () => 'ok',
      replyToTicket: async (id, text, author) => {
        ticketReplies.push({ id, text, author });
        return 'ok';
      }
    },
    announcements: {
      sendDiscordFromTelegram: async payload => {
        announcements.push(payload);
        return { ok: true };
      }
    },
    verifyWelcomeMember: async (guildId, userId, actor) => {
      verified.push({ guildId, userId, actor });
      return 'ok';
    }
  });

  await commands.get('reply')({
    chat: { id: -1001 },
    from: { id: 7, username: 'admin' },
    message: { text: '/reply ticket-1 Привет, ожидай.' },
    reply: async text => replies.push(text)
  });
  assert.deepEqual(ticketReplies[0], { id: 'ticket-1', text: 'Привет, ожидай.', author: '@admin' });

  await commands.get('announce')({
    chat: { id: -1001 },
    from: { id: 7, username: 'admin' },
    message: { text: '/announce Собрание сегодня.' },
    reply: async text => replies.push(text)
  });
  assert.equal(announcements.length, 1);

  await commands.get('event')({
    chat: { id: 999 },
    from: { id: 8, username: 'outsider' },
    message: { text: '/event unauthorized' },
    reply: async text => replies.push(text)
  });
  assert.match(replies.at(-1), /только в административном чате/);
  const takeHandler = actions[0].handler;
  const welcomeVerifyHandler = actions[1].handler;
  assert.equal(typeof takeHandler, 'function');

  await takeHandler({
    chat: { id: -1001 },
    from: { id: 7, username: 'admin' },
    match: ['ticket_take:ticket-1', 'ticket-1'],
    answerCbQuery: async text => callbackAnswers.push(text),
    reply: async text => replies.push(text)
  });
  assert.match(callbackAnswers[0], /взята в работу/);
  assert.match(replies.at(-1), /ticket-1/);

  let markupRemoved = false;
  await welcomeVerifyHandler({
    chat: { id: -1001 },
    from: { id: 7, username: 'admin' },
    match: ['welcome_verify:987654321098765432:222222222222222222', '987654321098765432', '222222222222222222'],
    answerCbQuery: async text => callbackAnswers.push(text),
    editMessageReplyMarkup: async () => { markupRemoved = true; },
    reply: async text => replies.push(text)
  });
  assert.deepEqual(verified[0], {
    guildId: '987654321098765432', userId: '222222222222222222', actor: '@admin'
  });
  assert.equal(markupRemoved, true);
  assert.match(replies.at(-1), /подтверждён через Telegram/u);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };
