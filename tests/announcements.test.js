const assert = require('node:assert/strict');

const {
  canSendDiscordAnnouncement,
  createAnnouncementService,
  formatAnnouncementResultMessage
} = require('../dist-ts/services/announcements');

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
      enabled: true,
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

  const fallbackDiscordMessages = [];
  const fallbackService = createAnnouncementService({
    storage: {
      getStore: () => ({ applications: [], announcements: [] }),
      save() {}
    },
    client: {
      channels: {
        fetch: async id => id === 'current-channel'
          ? {
              async send(payload) {
                fallbackDiscordMessages.push(payload);
                return { id: 'fallback-discord-message' };
              }
            }
          : null
      }
    },
    telegramNotifications: {
      enabled: true,
      sendAnnouncement: async () => ({ ok: true, messageId: 'telegram-message-2' })
    },
    discordChannelId: '',
    now: () => new Date('2026-06-20T12:00:00.000Z')
  });
  assert.deepEqual(await fallbackService.sendTelegramFromDiscord({
    type: 'announcement',
    text: 'Новость без настроенного канала',
    authorId: 'discord-2',
    authorName: 'Admin',
    fallbackDiscordChannelId: 'current-channel'
  }), { ok: true });
  assert.equal(fallbackDiscordMessages.length, 1);

  const missingDiscordService = createAnnouncementService({
    storage: {
      getStore: () => ({ applications: [], announcements: [] }),
      save() {}
    },
    client: { channels: { fetch: async () => null } },
    telegramNotifications: {
      enabled: true,
      sendAnnouncement: async () => ({ ok: true, messageId: 'telegram-message-unused' })
    },
    discordChannelId: '',
    now: () => new Date('2026-06-20T12:00:00.000Z')
  });
  const missingDiscordResult = await missingDiscordService.sendDiscordFromTelegram({
    type: 'announcement',
    text: 'Сообщение из Telegram',
    authorId: 'tg-2',
    authorName: '@admin',
    fallbackDiscordChannelId: 'missing-channel'
  });
  assert.deepEqual(missingDiscordResult, { ok: false, code: 'discord_channel_missing' });
  assert.match(formatAnnouncementResultMessage(missingDiscordResult, 'discord'), /DISCORD_ANNOUNCEMENTS_CHANNEL_ID/u);

  const telegramDisabledService = createAnnouncementService({
    storage: {
      getStore: () => ({ applications: [], announcements: [] }),
      save() {}
    },
    client: { channels: { fetch: async () => null } },
    telegramNotifications: {
      enabled: false,
      sendAnnouncement: async () => ({ ok: false, messageId: '' })
    },
    discordChannelId: '',
    now: () => new Date('2026-06-20T12:00:00.000Z')
  });
  const disabledResult = await telegramDisabledService.sendTelegramFromDiscord({
    type: 'event',
    text: 'Telegram выключен',
    authorId: 'discord-3',
    authorName: 'Admin'
  });
  assert.deepEqual(disabledResult, { ok: false, code: 'telegram_disabled' });
  assert.match(formatAnnouncementResultMessage(disabledResult, 'telegram'), /TELEGRAM_BOT_TOKEN/u);

  const telegramFailService = createAnnouncementService({
    storage: {
      getStore: () => ({ applications: [], announcements: [] }),
      save() {}
    },
    client: { channels: { fetch: async () => null } },
    telegramNotifications: {
      enabled: true,
      sendAnnouncement: async () => ({ ok: false, messageId: '', error: 'chat not found' })
    },
    discordChannelId: '',
    now: () => new Date('2026-06-20T12:00:00.000Z')
  });
  const failResult = await telegramFailService.sendTelegramFromDiscord({
    type: 'announcement',
    text: 'Telegram не принял',
    authorId: 'discord-4',
    authorName: 'Admin'
  });
  assert.deepEqual(failResult, { ok: false, code: 'telegram_send_failed', detail: 'chat not found' });
  assert.match(formatAnnouncementResultMessage(failResult, 'telegram'), /TELEGRAM_ANNOUNCEMENTS_CHAT_ID/u);
  assert.match(formatAnnouncementResultMessage(failResult, 'telegram'), /chat not found/u);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };
