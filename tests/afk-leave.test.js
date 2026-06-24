const assert = require('node:assert/strict');
const { Collection, PermissionFlagsBits } = require('discord.js');
const { createAfkLeaveService, parseAfkMessage, validateAfkForm } = require('../dist-ts/services/afk-leave');

function permissions(...allowed) {
  return { has: flag => allowed.includes(flag) };
}

function baseInteraction(guild, channel, user, member) {
  return {
    guild, channel, channelId: channel.id, user, member, replies: [],
    isChatInputCommand: () => false, isButton: () => false, isModalSubmit: () => false,
    async reply(payload) { this.replies.push(payload); this.replied = true; },
    async deferReply() { this.deferred = true; },
    async editReply(payload) { this.replies.push(payload); },
    async showModal(modal) { this.modal = modal; }
  };
}

async function main() {
  const parsed = parseAfkMessage('1. Username #12345\n2. 11.06.2026 - 13.06.2026\n3. Отдых');
  assert.deepEqual(parsed, {
    nicknameStatic: 'Username #12345', startDate: '11.06.2026', endDate: '13.06.2026', reason: 'Отдых'
  });
  assert.equal(validateAfkForm(parsed), '');
  assert.match(validateAfkForm({ ...parsed, startDate: '14.06.2026' }), /раньше даты начала/u);
  assert.equal(parseAfkMessage('неверная форма'), null);

  const store = { afkPanels: {}, afkRequests: [] };
  const storage = { getStore: () => store, save() {}, flush() {} };
  const messages = new Map();
  const sent = [];
  const logs = [];
  const dms = [];
  let panelSendCount = 0;
  function makeMessage(id, authorId = 'bot') {
    return {
      id, pinned: false, author: { id: authorId }, edits: [], reactionsAdded: [],
      async edit(payload) { this.edits.push(payload); return this; },
      async pin() { this.pinned = true; },
      async react(emoji) { this.reactionsAdded.push(emoji); },
      reactions: { resolve: () => null }
    };
  }
  const afkChannel = {
    id: '111111111111111111', isTextBased: () => true,
    permissionsFor: () => permissions(
      PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.AddReactions, PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.ManageMessages
    ),
    messages: { async fetch(id) { return messages.get(id) || null; } },
    async send(payload) {
      sent.push(payload);
      const isPanel = payload.components?.[0]?.toJSON?.().components?.[0]?.custom_id === 'afk_request_create';
      const message = makeMessage(isPanel ? 'panel-message' : `request-${sent.length}`);
      messages.set(message.id, message);
      if (isPanel) panelSendCount += 1;
      return message;
    }
  };
  const logChannel = { id: '222222222222222222', isTextBased: () => true, async send(payload) { logs.push(payload); } };
  const channels = new Map([[afkChannel.id, afkChannel], [logChannel.id, logChannel]]);
  const managerRoleId = '333333333333333333';
  const user = { id: '444444444444444444', username: 'member' };
  const adminUser = { id: '555555555555555555', username: 'admin' };
  const ordinaryUser = { id: '666666666666666666', username: 'ordinary' };
  const member = { id: user.id, permissions: permissions(), roles: { cache: new Map() } };
  const adminMember = { id: adminUser.id, permissions: permissions(PermissionFlagsBits.Administrator), roles: { cache: new Map() } };
  const ordinaryMember = { id: ordinaryUser.id, permissions: permissions(), roles: { cache: new Map() } };
  const guild = {
    id: '777777777777777777',
    members: { me: { permissions: permissions(PermissionFlagsBits.SendMessages) } },
    channels: { cache: channels, async fetch(id) { return channels.get(id) || null; } }
  };
  const client = {
    user: { id: 'bot' },
    channels: { async fetch(id) { return channels.get(id) || null; } },
    users: { async fetch(id) { return { id, async send(payload) { dms.push(payload); } }; } }
  };
  const service = createAfkLeaveService({
    storage, client,
    config: {
      channelId: afkChannel.id, logChannelId: logChannel.id, managerRoleId,
      useModal: true, useMessageForm: true, allowDmNotify: true, pinPanel: true, preventDuplicatePanel: true
    },
    now: () => new Date('2026-06-24T12:00:00Z')
  });

  const setup = baseInteraction(guild, afkChannel, adminUser, adminMember);
  setup.isChatInputCommand = () => true;
  setup.commandName = 'afk';
  setup.options = { getSubcommand: () => 'setup' };
  await service.handleInteraction(setup);
  assert.equal(panelSendCount, 1);
  assert.equal(messages.get('panel-message').pinned, true);
  assert.equal(store.afkPanels[guild.id].messageId, 'panel-message');

  const refresh = baseInteraction(guild, afkChannel, adminUser, adminMember);
  refresh.isChatInputCommand = () => true;
  refresh.commandName = 'afk';
  refresh.options = { getSubcommand: () => 'refresh' };
  await service.handleInteraction(refresh);
  assert.equal(panelSendCount, 1);
  assert.equal(messages.get('panel-message').edits.length, 1);

  const createButton = baseInteraction(guild, afkChannel, user, member);
  createButton.isButton = () => true;
  createButton.customId = 'afk_request_create';
  await service.handleInteraction(createButton);
  assert.equal(createButton.modal.toJSON().custom_id, 'afk_request_modal');

  const modal = baseInteraction(guild, afkChannel, user, member);
  modal.isModalSubmit = () => true;
  modal.customId = 'afk_request_modal';
  modal.fields = { getTextInputValue: id => ({
    nickname_static: 'Username #12345', start_date: '11.06.2026', end_date: '13.06.2026', reason: 'Отдых'
  })[id] };
  await service.handleInteraction(modal);
  assert.equal(store.afkRequests.length, 1);
  const first = store.afkRequests[0];
  assert.equal(first.status, 'pending');
  assert.equal(messages.get(first.messageId).reactionsAdded[0], '⏳');
  assert.equal(logs.length, 1);

  const duplicate = baseInteraction(guild, afkChannel, user, member);
  duplicate.isButton = () => true;
  duplicate.customId = 'afk_request_create';
  await service.handleInteraction(duplicate);
  assert.match(duplicate.replies[0].content, /уже есть заявка/u);

  const unauthorized = baseInteraction(guild, afkChannel, ordinaryUser, ordinaryMember);
  unauthorized.isButton = () => true;
  unauthorized.customId = `afk_approve_${first.id}`;
  await service.handleInteraction(unauthorized);
  assert.match(unauthorized.replies[0].content, /Недостаточно прав/u);

  const approve = baseInteraction(guild, afkChannel, adminUser, adminMember);
  approve.isButton = () => true;
  approve.customId = `afk_approve_${first.id}`;
  await service.handleInteraction(approve);
  assert.equal(first.status, 'approved');
  assert.equal(messages.get(first.messageId).reactionsAdded.at(-1), '✅');
  assert.equal(messages.get(first.messageId).edits.at(-1).components.length, 0);
  assert.equal(dms.length, 1);

  const repeat = baseInteraction(guild, afkChannel, adminUser, adminMember);
  repeat.isButton = () => true;
  repeat.customId = `afk_approve_${first.id}`;
  await service.handleInteraction(repeat);
  assert.match(repeat.replies[0].content, /уже была рассмотрена/u);

  const rawMessage = makeMessage('raw-request', user.id);
  Object.assign(rawMessage, {
    guild, channel: afkChannel, author: user, member,
    content: '1. Username #12345\n2. 15.06.2026 - 16.06.2026\n3. Поездка', webhookId: null,
    replies: [], async reply(payload) { this.replies.push(payload); }
  });
  messages.set(rawMessage.id, rawMessage);
  assert.equal(await service.handleMessage(rawMessage), true);
  const second = store.afkRequests[0];
  assert.equal(second.source, 'message');
  assert.equal(rawMessage.reactionsAdded[0], '⏳');

  const declineButton = baseInteraction(guild, afkChannel, adminUser, adminMember);
  declineButton.isButton = () => true;
  declineButton.customId = `afk_decline_${second.id}`;
  await service.handleInteraction(declineButton);
  assert.equal(declineButton.modal.toJSON().custom_id, `afk_decline_modal_${second.id}`);

  const declineModal = baseInteraction(guild, afkChannel, adminUser, adminMember);
  declineModal.isModalSubmit = () => true;
  declineModal.customId = `afk_decline_modal_${second.id}`;
  declineModal.fields = { getTextInputValue: () => 'Недостаточная причина' };
  await service.handleInteraction(declineModal);
  assert.equal(second.status, 'declined');
  assert.equal(second.declineReason, 'Недостаточная причина');
  assert.equal(rawMessage.reactionsAdded.at(-1), '❌');
  assert.equal(logs.length, 4);
  assert.equal(dms.length, 2);

  const status = baseInteraction(guild, afkChannel, user, member);
  status.isChatInputCommand = () => true;
  status.commandName = 'afk';
  status.options = { getSubcommand: () => 'status' };
  await service.handleInteraction(status);
  assert.match(status.replies[0].content, /Отклонено/u);

  console.log('ALL AFK LEAVE TESTS PASSED');
}

if (require.main === module) main().catch(error => { console.error(error); process.exit(1); });
module.exports = { main };
