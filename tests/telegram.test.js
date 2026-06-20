const assert = require('node:assert/strict');

const { createTelegramNotificationService } = require('../dist-ts/telegram');

async function main() {
  const sent = [];
  const service = createTelegramNotificationService({
    adminChatId: '-1001234567890',
    sender: {
      async sendMessage(chatId, text, options) {
        sent.push({ chatId, text, options });
      }
    }
  });

  const ok = await service.notifyApplicationCreated({
    application: {
      id: 'application-1',
      discordId: '123456789012345678',
      nickname: 'Phoenix_Player',
      level: '25',
      inviter: 'Leader',
      discovery: 'Discord',
      about: 'Хочу вступить в семью.'
    },
    guild: { id: '987654321098765432', name: 'Phoenix Guild' },
    candidate: { id: '123456789012345678', username: 'candidate' },
    ticketChannel: { id: '111111111111111111' }
  });

  assert.equal(ok, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].chatId, '-1001234567890');
  assert.match(sent[0].text, /<@123456789012345678> \| candidate \| ID: 123456789012345678/);
  assert.match(sent[0].text, /Ник в игре: Phoenix_Player/);
  assert.match(sent[0].text, /Level: 25/);
  assert.match(sent[0].text, /Кто дал инвайт: Leader/);
  assert.match(sent[0].text, /Откуда узнал: Discord/);
  assert.match(sent[0].text, /ID анкеты: application-1/);
  assert.match(sent[0].text, /О себе: Хочу вступить в семью\./);
  assert.match(sent[0].text, /https:\/\/discord\.com\/channels\/987654321098765432\/111111111111111111/);

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
