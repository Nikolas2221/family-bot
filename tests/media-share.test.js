const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PermissionFlagsBits } = require('discord.js');

const { createDatabase } = require('../dist-ts/database');
const { createMediaShareService } = require('../dist-ts/services/media-share');

function permissions(...allowed) {
  return { has: flag => allowed.includes(flag) };
}

function createTempDatabase() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'family-bot-media-db-'));
  const dataFile = path.join(tempDir, 'database.json');
  return createDatabase({ dataFile, saveDelayMs: 1 });
}

function createChannel(id) {
  const sent = [];
  const messages = new Map();
  return {
    id,
    sent,
    messages: {
      async fetch(messageId) {
        return messages.get(messageId) || null;
      }
    },
    async send(payload) {
      sent.push(payload);
      const message = {
        id: `${id}-message-${sent.length}`,
        channel: this,
        async edit(update) {
          sent.push(update);
          this.lastEdit = update;
          return this;
        }
      };
      messages.set(message.id, message);
      return message;
    }
  };
}

function baseInteraction(guild, user, member) {
  return {
    guild,
    user,
    member,
    replies: [],
    isChatInputCommand: () => false,
    isButton: () => false,
    isModalSubmit: () => false,
    async reply(payload) { this.replies.push(payload); this.replied = true; },
    async deferReply() { this.deferred = true; },
    async editReply(payload) { this.replies.push(payload); },
    async showModal(modal) { this.modal = modal; }
  };
}

async function main() {
  const database = createTempDatabase();
  const guildId = '111111111111111111';
  database.ensureGuild(guildId, { guildName: 'Guild' });

  const panelChannel = createChannel('222222222222222222');
  const targetChannel = createChannel('333333333333333333');
  const logChannel = createChannel('444444444444444444');
  const minRole = { id: '555555555555555555', position: 10 };
  const channels = new Map([
    [panelChannel.id, panelChannel],
    [targetChannel.id, targetChannel],
    [logChannel.id, logChannel]
  ]);
  const guild = {
    id: guildId,
    roles: {
      cache: { get: roleId => roleId === minRole.id ? minRole : null },
      async fetch(roleId) { return roleId === minRole.id ? minRole : null; }
    },
    channels: { async fetch(id) { return channels.get(id) || null; } }
  };
  const adminUser = { id: '666666666666666666', username: 'admin' };
  const adminMember = { id: adminUser.id, permissions: permissions(PermissionFlagsBits.Administrator), roles: { cache: new Map(), highest: { position: 100 } } };
  const memberUser = { id: '777777777777777777', username: 'member' };
  const member = { id: memberUser.id, permissions: permissions(), roles: { cache: new Map([[minRole.id, minRole]]), highest: { position: 10 } } };
  const outsider = { id: '888888888888888888', permissions: permissions(), roles: { cache: new Map(), highest: { position: 1 } } };
  const service = createMediaShareService({
    database,
    resolveGuildSettings: id => database.getGuild(id).settings,
    fetchTextChannel: async (_guild, id) => channels.get(id) || null
  });

  const setup = baseInteraction(guild, adminUser, adminMember);
  setup.isChatInputCommand = () => true;
  setup.commandName = 'mediashare';
  setup.options = {
    getSubcommand: () => 'setup',
    getChannel(name) {
      if (name === 'panel_channel') return panelChannel;
      if (name === 'target_channel') return targetChannel;
      return logChannel;
    },
    getRole: () => minRole
  };
  await service.handleInteraction(setup);
  assert.equal(database.getGuild(guildId).settings.mediaShare.minRoleId, minRole.id);
  assert.equal(panelChannel.sent.length, 1);

  const denied = baseInteraction(guild, { id: outsider.id, username: 'outsider' }, outsider);
  denied.isButton = () => true;
  denied.customId = 'media_share_open:video';
  await service.handleInteraction(denied);
  assert.match(denied.replies[0].content, /Доступно только/u);

  const button = baseInteraction(guild, memberUser, member);
  button.isButton = () => true;
  button.customId = 'media_share_open:stream';
  await service.handleInteraction(button);
  assert.equal(button.modal.toJSON().custom_id, 'media_share_modal:stream');

  const modal = baseInteraction(guild, memberUser, member);
  modal.isModalSubmit = () => true;
  modal.customId = 'media_share_modal:stream';
  modal.fields = {
    getTextInputValue(id) {
      if (id === 'title') return 'Семейный стрим';
      if (id === 'url') return 'https://example.test/live';
      return 'Stream note';
    }
  };
  await service.handleInteraction(modal);
  assert.equal(logChannel.sent.length, 1);
  assert.equal(targetChannel.sent.length, 0);
  assert.match(modal.replies[0].content, /Стрим отправлено на модерацию/u);

  const request = database.getGuild(guildId).settings.mediaShare.pendingRequests[0];
  assert.equal(request.status, 'pending');

  const approve = baseInteraction(guild, adminUser, adminMember);
  approve.isButton = () => true;
  approve.customId = `media_share_approve:${request.id}`;
  approve.message = {
    async edit(payload) {
      this.lastEdit = payload;
    }
  };
  await service.handleInteraction(approve);
  assert.equal(targetChannel.sent.length, 1);
  assert.equal(database.getGuild(guildId).settings.mediaShare.pendingRequests[0].status, 'approved');
  assert.match(approve.replies[0].content, /Медиа одобрено/u);

  console.log('ALL MEDIA SHARE SERVICE TESTS PASSED');
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };
