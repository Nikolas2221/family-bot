const assert = require('node:assert/strict');
const { ChannelType, Collection, PermissionFlagsBits } = require('discord.js');
const { createSupportTicketService, parseUserId, safeChannelName } = require('../dist-ts/services/support-tickets');

function permissions(...allowed) {
  return { has: flag => allowed.includes(flag) };
}

function interactionBase(guild, channel, user, member) {
  const replies = [];
  return {
    guild, channel, channelId: channel.id, user, member,
    replies,
    isChatInputCommand: () => false,
    isButton: () => false,
    isModalSubmit: () => false,
    async reply(payload) { replies.push(payload); this.replied = true; },
    async deferReply() { this.deferred = true; },
    async editReply(payload) { replies.push(payload); },
    async showModal(modal) { this.modal = modal; },
    async update(payload) { replies.push(payload); }
  };
}

async function main() {
  assert.equal(safeChannelName('Тест User !!', '123456789012345678'), 'ticket-user-345678');
  assert.equal(parseUserId('<@123456789012345678>'), '123456789012345678');
  assert.equal(parseUserId('bad'), '');

  const store = { supportTickets: [], supportTicketCooldowns: {} };
  const storage = { getStore: () => store, save() {}, flush() {} };
  const supportRoleId = '333333333333333333';
  const category = { id: '222222222222222222', type: ChannelType.GuildCategory };
  const supportRole = { id: supportRoleId };
  const sent = [];
  const permissionChanges = [];
  let deleted = false;
  let firstMessage = null;
  const ticketChannel = {
    id: '444444444444444444', name: 'ticket-user-345678', type: ChannelType.GuildText,
    isTextBased: () => true,
    permissionOverwrites: {
      async edit(id, patch) { permissionChanges.push({ action: 'edit', id, patch }); },
      async delete(id) { permissionChanges.push({ action: 'delete', id }); }
    },
    async send(payload) {
      sent.push(payload);
      firstMessage = { id: 'first-message', async edit(update) { sent.push(update); } };
      return firstMessage;
    },
    messages: {
      async fetch(arg) {
        if (typeof arg === 'string') return firstMessage;
        return new Collection();
      }
    },
    async delete() { deleted = true; }
  };
  const logPayloads = [];
  const logChannel = { id: '555555555555555555', isTextBased: () => true, async send(payload) { logPayloads.push(payload); } };
  const channels = new Map([[category.id, category], [logChannel.id, logChannel], [ticketChannel.id, ticketChannel]]);
  const creatorUser = { id: '123456789012345678', username: 'Test User' };
  const addedUser = { id: '666666666666666666', username: 'guest' };
  const creatorMember = { id: creatorUser.id, user: creatorUser, permissions: permissions(), roles: { cache: new Map() } };
  const addedMember = { id: addedUser.id, user: addedUser, permissions: permissions(), roles: { cache: new Map() } };
  const supportUser = { id: '777777777777777777', username: 'support' };
  const supportMember = { id: supportUser.id, user: supportUser, permissions: permissions(), roles: { cache: new Map([[supportRoleId, supportRole]]) } };
  const outsiderUser = { id: '888888888888888888', username: 'outsider' };
  const outsiderMember = { id: outsiderUser.id, user: outsiderUser, permissions: permissions(), roles: { cache: new Map() } };
  const members = new Map([[creatorUser.id, creatorMember], [addedUser.id, addedMember], [supportUser.id, supportMember], [outsiderUser.id, outsiderMember]]);
  let createOptions = null;
  const guild = {
    id: '111111111111111111', ownerId: '999999999999999999',
    members: {
      me: { id: 'bot', permissions: permissions(PermissionFlagsBits.ManageChannels) },
      cache: members,
      async fetch(id) { return members.get(id) || null; }
    },
    roles: { cache: new Map([[supportRoleId, supportRole]]), async fetch(id) { return id === supportRoleId ? supportRole : null; } },
    channels: {
      cache: channels,
      async fetch(id) { return channels.get(id) || null; },
      async create(options) { createOptions = options; return ticketChannel; }
    }
  };
  const client = { channels: { async fetch(id) { return channels.get(id) || null; } } };
  const service = createSupportTicketService({
    storage, client,
    config: {
      categoryId: category.id, supportRoleId, logChannelId: logChannel.id, panelChannelId: '',
      pingSupport: true, cooldownSeconds: 60, maxOpenPerUser: 1, deleteDelaySeconds: 0
    }
  });

  const createButton = interactionBase(guild, ticketChannel, creatorUser, creatorMember);
  createButton.isButton = () => true;
  createButton.customId = 'ticket_create';
  assert.equal(await service.handleInteraction(createButton), true);
  assert.equal(createButton.modal.toJSON().custom_id, 'ticket_create_modal');

  const createModal = interactionBase(guild, ticketChannel, creatorUser, creatorMember);
  createModal.isModalSubmit = () => true;
  createModal.customId = 'ticket_create_modal';
  createModal.fields = { getTextInputValue: id => ({ topic: 'Проблема', description: 'Подробное описание', evidence: 'https://example.test' })[id] || '' };
  await service.handleInteraction(createModal);
  assert.equal(store.supportTickets.length, 1);
  assert.equal(store.supportTickets[0].status, 'open');
  assert.equal(createOptions.parent, category.id);
  assert.equal(createOptions.permissionOverwrites[0].id, guild.id);
  assert.equal(createOptions.permissionOverwrites[1].id, creatorUser.id);
  assert.equal(createOptions.permissionOverwrites[2].id, supportRoleId);
  assert.equal(sent[0].allowedMentions.roles[0], supportRoleId);
  assert.equal(logPayloads.length, 1);

  const duplicate = interactionBase(guild, ticketChannel, creatorUser, creatorMember);
  duplicate.isButton = () => true;
  duplicate.customId = 'ticket_create';
  await service.handleInteraction(duplicate);
  assert.match(duplicate.replies[0].content, /уже есть открытый тикет/u);

  const claim = interactionBase(guild, ticketChannel, supportUser, supportMember);
  claim.isButton = () => true;
  claim.customId = 'support_ticket_claim';
  await service.handleInteraction(claim);
  assert.equal(store.supportTickets[0].claimedBy, supportUser.id);

  const add = interactionBase(guild, ticketChannel, supportUser, supportMember);
  add.isModalSubmit = () => true;
  add.customId = 'support_ticket_add_modal';
  add.fields = { getTextInputValue: () => `<@${addedUser.id}>` };
  await service.handleInteraction(add);
  assert.equal(permissionChanges[0].action, 'edit');
  assert.deepEqual(store.supportTickets[0].addedUserIds, [addedUser.id]);

  const remove = interactionBase(guild, ticketChannel, supportUser, supportMember);
  remove.isModalSubmit = () => true;
  remove.customId = 'support_ticket_remove_modal';
  remove.fields = { getTextInputValue: () => addedUser.id };
  await service.handleInteraction(remove);
  assert.equal(permissionChanges[1].action, 'delete');

  const deniedClose = interactionBase(guild, ticketChannel, outsiderUser, outsiderMember);
  deniedClose.isButton = () => true;
  deniedClose.customId = 'support_ticket_close';
  await service.handleInteraction(deniedClose);
  assert.match(deniedClose.replies[0].content, /не можешь закрыть/u);

  const closeRequest = interactionBase(guild, ticketChannel, creatorUser, creatorMember);
  closeRequest.isButton = () => true;
  closeRequest.customId = 'support_ticket_close';
  await service.handleInteraction(closeRequest);
  assert.match(closeRequest.replies[0].content, /точно хочешь закрыть/u);

  const closeConfirm = interactionBase(guild, ticketChannel, creatorUser, creatorMember);
  closeConfirm.isButton = () => true;
  closeConfirm.customId = 'support_ticket_close_confirm';
  await service.handleInteraction(closeConfirm);
  assert.equal(closeConfirm.modal.toJSON().custom_id, 'support_ticket_close_modal');

  const close = interactionBase(guild, ticketChannel, creatorUser, creatorMember);
  close.isModalSubmit = () => true;
  close.customId = 'support_ticket_close_modal';
  close.fields = { getTextInputValue: () => 'Вопрос решён' };
  await service.handleInteraction(close);
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(store.supportTickets[0].status, 'closed');
  assert.equal(store.supportTickets[0].closeReason, 'Вопрос решён');
  assert.equal(deleted, true);
  assert.equal(Object.keys(store.supportTicketCooldowns).length, 0);
  assert.ok(logPayloads.at(-1).files?.[0]?.attachment);

  const afterClose = interactionBase(guild, ticketChannel, creatorUser, creatorMember);
  afterClose.isButton = () => true;
  afterClose.customId = 'ticket_create';
  await service.handleInteraction(afterClose);
  assert.equal(afterClose.modal.toJSON().custom_id, 'ticket_create_modal');

  const info = interactionBase(guild, ticketChannel, creatorUser, creatorMember);
  info.isChatInputCommand = () => true;
  info.commandName = 'ticket';
  info.options = { getSubcommand: () => 'info' };
  await service.handleInteraction(info);
  assert.equal(info.replies[0].embeds[0].toJSON().title, '❓ Что такое тикет?');

  const adminUser = { id: '999999999999999999', username: 'admin' };
  const adminMember = { id: adminUser.id, permissions: permissions(PermissionFlagsBits.Administrator), roles: { cache: new Map() } };
  const setup = interactionBase(guild, ticketChannel, adminUser, adminMember);
  setup.isChatInputCommand = () => true;
  setup.commandName = 'ticket';
  setup.options = { getSubcommand: () => 'setup' };
  await service.handleInteraction(setup);
  assert.match(setup.replies.at(-1).content, /Панель тикетов отправлена/u);

  console.log('ALL SUPPORT TICKET TESTS PASSED');
}

if (require.main === module) {
  main().catch(error => { console.error(error); process.exit(1); });
}

module.exports = { main };
