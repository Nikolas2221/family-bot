const assert = require('node:assert/strict');

const { createTelegramNotificationService } = require('../dist-ts/telegram');

async function main() {
  const sent = [];
  const service = createTelegramNotificationService({
    adminChatId: '-1001234567890',
    allowedGuildIds: ['987654321098765432'],
    sender: {
      async sendMessage(chatId, text, options) {
        sent.push({ chatId, text, options });
      }
    }
  });

  const ok = await service.notifyApplicationCreated({
    familyTitle: 'Test Family',
    application: {
      id: 'application-1',
      discordId: '123456789012345678',
      nickname: 'Phoenix_Player',
      level: '25',
      inviter: 'Leader',
      discovery: 'Discord',
      about: 'Хочу вступить в семью.'
    },
    guild: { id: '987654321098765432', name: 'Phoenix Guild', memberCount: 286 },
    candidate: { id: '123456789012345678', username: 'candidate' },
    ticketChannel: { id: '111111111111111111' }
  });

  assert.equal(ok, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].chatId, '-1001234567890');
  assert.match(sent[0].text, /Новая заявка в Test Family/u);
  assert.match(sent[0].text, /Кандидат: <@123456789012345678> \/ candidate/);
  assert.match(sent[0].text, /Discord ID: 123456789012345678/);
  assert.match(sent[0].text, /Ник в игре: Phoenix_Player/);
  assert.match(sent[0].text, /Лвл: 25/);
  assert.match(sent[0].text, /Кто дал инвайт: Leader/);
  assert.match(sent[0].text, /Откуда узнал: Discord/);
  assert.match(sent[0].text, /ID анкеты: application-1/);
  assert.match(sent[0].text, /О себе: Хочу вступить в семью\./);
  assert.match(sent[0].text, /https:\/\/discord\.com\/channels\/987654321098765432\/111111111111111111/);
  assert.equal(sent[0].options.reply_markup.inline_keyboard[0][0].text, 'Открыть тикет');
  assert.equal(sent[0].options.reply_markup.inline_keyboard[1][0].callback_data, 'ticket_take:application-1');

  const joined = await service.notifyMemberJoined({
    guild: { id: '987654321098765432', name: 'Phoenix Guild', memberCount: 286 },
    member: { id: '222222222222222222', username: 'new-member', createdAt: new Date('2026-06-23T12:00:00Z') }
  });
  assert.equal(joined, true);
  assert.equal(sent.length, 2);
  assert.match(sent[1].text, /Новый участник/u);
  assert.match(sent[1].text, /222222222222222222/u);
  assert.match(sent[1].text, /286/u);
  assert.equal(sent[1].options.reply_markup.inline_keyboard[0][0].callback_data, 'welcome_verify:987654321098765432:222222222222222222');

  const blockedJoin = await service.notifyMemberJoined({
    guild: { id: '111111111111111111', name: 'Other Guild', memberCount: 1 },
    member: { id: '333333333333333333', username: 'other-member', createdAt: new Date('2026-06-23T12:00:00Z') }
  });
  assert.equal(blockedJoin, false);
  assert.equal(sent.length, 2);

  const afkSent = await service.notifyAfkRequestCreated({
    request: {
      id: 'a1b2c3d4', guildId: '987654321098765432', channelId: '111111111111111111',
      messageId: '333333333333333333', userId: '222222222222222222',
      nicknameStatic: 'Username #12345', startDate: '24.06.2026', endDate: '26.06.2026', reason: 'Отпуск'
    }
  });
  assert.equal(afkSent, true);
  assert.equal(sent.length, 3);
  assert.match(sent[2].text, /Username #12345/u);
  assert.equal(sent[2].options.reply_markup.inline_keyboard[1][0].callback_data, 'afk_approve:a1b2c3d4');
  assert.equal(sent[2].options.reply_markup.inline_keyboard[1][1].callback_data, 'afk_decline:a1b2c3d4');

  const warnings = [];
  const unavailable = createTelegramNotificationService({
    adminChatId: 'admin',
    sender: {
      async sendMessage() {
        throw new Error('Telegram unavailable');
      }
    },
    logger: { warn: message => warnings.push(message) }
  });

  assert.equal(await unavailable.notifyApplicationAccepted({ application: { id: 'application-2' } }), false);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Telegram unavailable/);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };
