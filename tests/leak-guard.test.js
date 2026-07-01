const assert = require('node:assert/strict');
const { PermissionFlagsBits } = require('discord.js');

const { createAccessApi } = require('../dist-ts/access');
const { buildLeakScanText, registerEventRuntime } = require('../dist-ts/event-runtime');
const { containsDiscordInvite, detectScamGift } = require('../dist-ts/security');

async function main() {
  assert.equal(containsDiscordInvite('https://discord.gg/family'), true);
  assert.equal(containsDiscordInvite('discord . gg / family'), true);
  assert.equal(containsDiscordInvite('discord dot gg/family'), true);
  assert.equal(containsDiscordInvite('dіscоrd.gg/family'), true);
  assert.equal(containsDiscordInvite('discord\u200b.gg/family'), true);
  assert.equal(containsDiscordInvite('мы обсуждаем Discord без ссылок'), false);
  assert.equal(detectScamGift('20$ steam - steamcommunity.com/gift/activation=QfkkZqjOxf').matched, true);
  assert.equal(detectScamGift('steamcommunnity.com/gift/activation=QfkkZqjOxf').matched, true);
  assert.equal(detectScamGift('20$ steam https://dub.sh/QfkkZqjOxf').matched, true);
  assert.equal(detectScamGift('обычное слово gift без ссылки').matched, false);

  assert.match(buildLeakScanText({
    content: '',
    embeds: [{ title: 'invite', description: 'discord.gg/embed-code' }],
    attachments: null
  }), /discord\.gg\/embed-code/);

  const accessApi = createAccessApi({
    ownerIds: [],
    leakGuard: { enabled: true, allowedRoles: ['allowed-role'] },
    channelGuard: { enabled: true, allowedRoles: [] },
    resolveGuildSettings: () => ({ access: { applications: [], discipline: [], ranks: [] } })
  });
  const guild = { id: 'guild-1', ownerId: 'owner-1' };
  const permissions = { has: permission => permission === PermissionFlagsBits.ManageMessages };
  const roleCache = roles => ({ some: callback => roles.some(id => callback({ id })) });

  assert.equal(accessApi.canBypassLeakGuard({ id: 'owner-1', guild, permissions, roles: { cache: roleCache([]) } }), true);
  assert.equal(accessApi.canBypassLeakGuard({ id: 'allowed', guild, permissions, roles: { cache: roleCache(['allowed-role']) } }), true);
  assert.equal(accessApi.canBypassLeakGuard({ id: 'manager', guild, permissions, roles: { cache: roleCache([]) } }), false);

  const listeners = new Map();
  const securityLogs = [];
  const telegramJoins = [];
  const telegramScamReports = [];
  const client = {
    removeAllListeners(name) {
      listeners.delete(name);
    },
    on(name, listener) {
      listeners.set(name, listener);
    }
  };
  registerEventRuntime({
    client,
    leakGuard: { enabled: true },
    scamGuard: { enabled: true, timeoutMinutes: 1440 },
    channelGuard: { enabled: false },
    copySecurity: {
      inviteGuardNotice: id => `blocked ${id}`,
      inviteBlocked: 'blocked',
      channelGuardReason: 'restore',
      channelRestored: name => name
    },
    getGuildStorage: () => ({
      recordAnalyticsMessage() {}, recordMessage() {}, recordPresence() {}, trackJoin() {}, trackLeave() {}, recordReaction() {}
    }),
    isPremiumGuild: () => true,
    isModuleEnabled: () => true,
    hasFamilyRole: () => false,
    containsDiscordInvite,
    detectScamGift,
    canBypassLeakGuard: () => false,
    canBypassScamGuard: () => false,
    handleAutomodMessage: async () => false,
    handleCustomTriggerMessage: async () => {},
    sendSecurityLog: async (_guild, content) => securityLogs.push(content),
    notifyTelegramScamBlocked: async report => telegramScamReports.push(report),
    notifyTelegramSecurityAlert: async () => {},
    startVoiceSession() {}, stopVoiceSession() {}, enforceBlacklist: async () => false,
    sendWelcomeInvite: async () => {}, notifyTelegramMemberJoined: async member => telegramJoins.push(member.id), applyAutorole: async () => false,
    resolveGuildSettings: () => ({ verification: { enabled: false } }),
    findReactionRoleEntry: () => null, getReactionEmojiKey: () => '',
    canBypassChannelGuard: () => false, fetchDeletedChannelExecutor: async () => null,
    restoreDeletedChannel: async () => null, doPanelUpdate: async () => {},
    handleDiscordTicketMessage: async () => false,
    handleAfkMessage: async () => false
  });

  await listeners.get('guildMemberAdd')({
    id: 'new-user',
    user: { id: 'new-user', bot: false },
    guild: { id: 'guild-1' }
  });
  assert.deepEqual(telegramJoins, ['new-user']);

  const baseMessage = {
    id: 'message-1',
    content: 'safe before edit',
    guild,
    member: { id: 'user-1', guild, moderatable: true, timeout: async () => {} },
    author: { id: 'user-1', username: 'user', bot: false },
    channel: { id: 'channel-1', send: async () => null },
    embeds: [],
    attachments: null,
    partial: false,
    fetch: async function () { return this; }
  };

  let editedDeleted = false;
  await listeners.get('messageUpdate')(baseMessage, {
    ...baseMessage,
    content: 'discord . gg / edited',
    delete: async () => { editedDeleted = true; }
  });
  assert.equal(editedDeleted, true);
  assert.match(securityLogs[0], /Результат: удалено/);

  const originalError = console.error;
  console.error = () => {};
  try {
    await listeners.get('messageCreate')({
      ...baseMessage,
      id: 'message-2',
      content: 'discord.gg/cannot-delete',
      delete: async () => { throw new Error('Missing Permissions'); }
    });
  } finally {
    console.error = originalError;
  }
  assert.match(securityLogs[1], /НЕ УДАЛЕНО/);
  assert.match(securityLogs[1], /user-1/);
  assert.match(securityLogs[1], /channel-1/);

  let scamDeleted = false;
  let scamMuted = false;
  await listeners.get('messageCreate')({
    ...baseMessage,
    id: 'message-3',
    content: '20$ steam - steamcommunity.com/gift/activation=QfkkZqjOxf',
    delete: async () => { scamDeleted = true; },
    member: {
      ...baseMessage.member,
      timeout: async () => { scamMuted = true; }
    }
  });
  assert.equal(scamDeleted, true);
  assert.equal(scamMuted, true);
  assert.equal(telegramScamReports.length, 1);
  assert.match(securityLogs[2], /Scam guard/);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };
