const assert = require('node:assert/strict');

const { canSendDiscordAnnouncement, createAnnouncementService } = require('../dist-ts/services/announcements');

async function main() {
  const roleMember = { roles: { cache: { has: id => id === 'role-allowed' } } };
  assert.equal(canSendDiscordAnnouncement(roleMember, null, ['role-allowed']), true);
  assert.equal(canSendDiscordAnnouncement(roleMember, { has: () => true }, ['other-role']), false);
  assert.equal(canSendDiscordAnnouncement({}, { has: () => true }, []), true);
  assert.equal(canSendDiscordAnnouncement({}, { has: () => false }, []), false);

  const store = { applications: [], announcements: [] };
  const discordMessages = [];
  const telegramMessages = [];
  let nextDiscordMessageId = 1;
  const service = createAnnouncementService({
    storage: {
      getStore: () => store,
      save() {}
    },
    client: {
      channels: {
        fetch: async id => id === 'announcements'
          ? {
              async send(payload) {
                discordMessages.push(payload);
                return { id: `discord-message-${nextDiscordMessageId++}` };
              }
            }
          : null
      }
    },
    telegramNotifications: {
      sendAnnouncement: async payload => {
        telegramMessages.push(payload);
        return { ok: true, messageId: 'telegram-message-1' };
      }
    },
    discordChannelId: 'announcements',
    now: () => new Date('2026-06-20T12:00:00.000Z')
  });

  assert.deepEqual(await service.sendDiscordFromTelegram({
    type: 'announcement',
    text: 'Собрание в 20:00',
    authorId: 'tg-1',
    authorName: '@admin'
  }), { ok: true });
  assert.match(discordMessages[0].content, /Источник: Telegram/);
  assert.equal(store.announcements[0].source, 'telegram');
  assert.equal(store.announcements[0].discordMessageId, 'discord-message-1');

  assert.deepEqual(await service.sendTelegramFromDiscord({
    type: 'event',
    text: 'Семейное событие',
    authorId: 'discord-1',
    authorName: 'Moderator'
  }), { ok: true });
  assert.equal(discordMessages.length, 2);
  assert.match(discordMessages[1].content, /Источник: Discord/);
  assert.equal(telegramMessages.length, 1);
  assert.equal(store.announcements[0].source, 'discord');
  assert.equal(store.announcements[0].discordMessageId, 'discord-message-2');
  assert.equal(store.announcements[0].telegramMessageId, 'telegram-message-1');
  assert.equal(store.announcements.length, 2);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };
