const assert = require('node:assert/strict');

const { handleCommandRuntime } = require('../dist-ts/command-runtime');

function createInteraction(text = 'Новость') {
  let reply = null;
  return {
    interaction: {
      commandName: 'announce',
      guild: { id: '123456789012345678' },
      channelId: '111111111111111111',
      channel: { id: '111111111111111111' },
      user: { id: '222222222222222222', username: 'admin' },
      member: { roles: { cache: { has: () => false } } },
      memberPermissions: { has: () => true },
      isChatInputCommand: () => true,
      options: { getString: () => text },
      async reply(payload) { reply = payload; }
    },
    get reply() { return reply; }
  };
}

async function main() {
  const disabled = createInteraction('Telegram выключен');
  const handledDisabled = await handleCommandRuntime(disabled.interaction, {
    guildStorage: { addCommend() {} },
    discordAnnouncerRoleIds: [],
    ephemeral: payload => payload,
    announcementService: {
      async sendTelegramFromDiscord(payload) {
        assert.equal(payload.fallbackDiscordChannelId, '111111111111111111');
        return { ok: false, code: 'telegram_disabled' };
      }
    }
  });

  assert.equal(handledDisabled, true);
  assert.match(disabled.reply.content, /Причина:/u);
  assert.match(disabled.reply.content, /TELEGRAM_BOT_TOKEN/u);

  const partial = createInteraction('Telegram работает, Discord-копия нет');
  const handledPartial = await handleCommandRuntime(partial.interaction, {
    guildStorage: { addCommend() {} },
    discordAnnouncerRoleIds: [],
    ephemeral: payload => payload,
    announcementService: {
      async sendTelegramFromDiscord() {
        return { ok: true, code: 'discord_channel_missing' };
      }
    }
  });

  assert.equal(handledPartial, true);
  assert.match(partial.reply.content, /Отправлено в Telegram/u);
  assert.match(partial.reply.content, /Дополнительно:/u);
  assert.match(partial.reply.content, /DISCORD_ANNOUNCEMENTS_CHANNEL_ID/u);

  console.log('ALL ANNOUNCEMENT COMMAND RUNTIME TESTS PASSED');
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };
