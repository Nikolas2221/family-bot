const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PermissionFlagsBits } = require('discord.js');

const { createDatabase } = require('../dist-ts/database');
const { createReportRequestService } = require('../dist-ts/services/report-requests');

function permissions(...allowed) {
  return { has: flag => allowed.includes(flag) };
}

function createTempDatabase() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'family-bot-report-db-'));
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
        edits: [],
        async edit(update) {
          this.edits.push(update);
          sent.push(update);
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
  const channels = new Map([
    [panelChannel.id, panelChannel],
    [targetChannel.id, targetChannel],
    [logChannel.id, logChannel]
  ]);
  const guild = { id: guildId, channels: { async fetch(id) { return channels.get(id) || null; } } };
  const adminUser = { id: '555555555555555555', username: 'admin' };
  const adminMember = { id: adminUser.id, permissions: permissions(PermissionFlagsBits.Administrator), roles: { cache: new Map() } };
  const service = createReportRequestService({
    database,
    resolveGuildSettings: id => database.getGuild(id).settings,
    fetchTextChannel: async (_guild, id) => channels.get(id) || null
  });

  const setup = baseInteraction(guild, adminUser, adminMember);
  setup.isChatInputCommand = () => true;
  setup.commandName = 'reportform';
  setup.options = {
    getSubcommand: () => 'setup',
    getString: () => 'contracts',
    getChannel(name) {
      if (name === 'panel_channel') return panelChannel;
      if (name === 'target_channel') return targetChannel;
      return logChannel;
    }
  };

  await service.handleInteraction(setup);
  const stored = database.getGuild(guildId).settings.reportRequests.contracts;
  assert.equal(stored.panelChannelId, panelChannel.id);
  assert.equal(stored.targetChannelId, targetChannel.id);
  assert.equal(stored.logChannelId, logChannel.id);
  assert.equal(panelChannel.sent.length, 1);

  const button = baseInteraction(guild, { id: '666666666666666666', username: 'member' }, { permissions: permissions(), roles: { cache: new Map() } });
  button.isButton = () => true;
  button.customId = 'report_request_open:contracts';
  await service.handleInteraction(button);
  assert.equal(button.modal.toJSON().custom_id, 'report_request_modal:contracts');

  const modal = baseInteraction(guild, button.user, button.member);
  modal.isModalSubmit = () => true;
  modal.customId = 'report_request_modal:contracts';
  modal.fields = {
    getTextInputValue(id) {
      return {
        nickname_static: 'Member #123',
        period: '01.07.2026 - 03.07.2026',
        count: '12',
        amount: '120000$',
        evidence: 'https://example.test/proof'
      }[id] || '';
    }
  };
  await service.handleInteraction(modal);
  assert.equal(targetChannel.sent.length, 1);
  assert.equal(logChannel.sent.length, 1);
  assert.match(modal.replies[0].content, /Отчёт отправлен/u);

  console.log('ALL REPORT REQUEST SERVICE TESTS PASSED');
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };
