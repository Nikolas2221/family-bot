const assert = require('node:assert/strict');
const { ChannelType, PermissionFlagsBits } = require('discord.js');

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
  let naturalTimeoutMs = 0;
  let naturalBanned = false;
  const targetMember = {
    id: '222222222222222222',
    guild: null,
    roles: { add: async () => {}, remove: async () => {} },
    timeout: async ms => { naturalTimeoutMs = ms; },
    kick: async () => {},
    ban: async () => { naturalBanned = true; }
  };
  const guild = {
    id: 'guild-1',
    name: 'Test Guild',
    memberCount: 3,
    ownerId: 'owner-1',
    channels: { cache: { values: () => [][Symbol.iterator]() } },
    members: {
      cache: {
        values: () => [
          { id: 'inactive-user', user: { id: 'inactive-user', bot: false }, presence: { status: 'offline' }, roles: { cache: { values: () => [][Symbol.iterator]() } } },
          { id: 'active-user', user: { id: 'active-user', bot: false }, presence: { status: 'online' }, roles: { cache: { values: () => [][Symbol.iterator]() } } }
        ][Symbol.iterator]()
      },
      fetch: async id => (id === targetMember.id ? targetMember : null)
    }
  };
  targetMember.guild = guild;
  const permissions = { has: permission => permission === PermissionFlagsBits.ManageMessages };
  const roleCache = roles => ({ some: callback => roles.some(id => callback({ id })) });

  assert.equal(accessApi.canBypassLeakGuard({ id: 'owner-1', guild, permissions, roles: { cache: roleCache([]) } }), true);
  assert.equal(accessApi.canBypassLeakGuard({ id: 'allowed', guild, permissions, roles: { cache: roleCache(['allowed-role']) } }), true);
  assert.equal(accessApi.canBypassLeakGuard({ id: 'manager', guild, permissions, roles: { cache: roleCache([]) } }), false);

  const listeners = new Map();
  const securityLogs = [];
  const telegramJoins = [];
  const telegramScamReports = [];
  const aiReplies = [];
  const aiSystems = [];
  const activityReplies = [];
  const naturalAnnouncements = [];
  const channelSettingsPatches = [];
  let botInsultTimeoutMs = 0;
  const client = {
    user: { id: 'bot-1', bot: true },
    channels: {
      fetch: async id => {
        if (id === '333333333333333333') return {
          id,
          messages: {
            fetch: async () => new Map([
              ['rules-message', {
                content: 'Правила: запрещены оскорбления, флуд, реклама и слив личных данных. За нарушение мут, кик или бан.'
              }]
            ])
          }
        };
        if (id === '444444444444444444') return {
          id,
          name: 'applications',
          type: ChannelType.GuildText,
          guild,
          permissionsFor: () => ({ has: () => true })
        };
        return null;
      }
    },
    removeAllListeners(name) {
      listeners.delete(name);
    },
    on(name, listener) {
      listeners.set(name, listener);
    }
  };
  registerEventRuntime({
    client,
    aiMention: { enabled: true, cooldownSeconds: 30, maxChars: 700 },
    aiService: {
      aiText: async (system, prompt) => {
        aiSystems.push(system);
        return `AI reply: ${prompt}`;
      }
    },
    database: {
      updateGuildSettings: (_guildId, patch) => channelSettingsPatches.push(patch)
    },
    announcementService: {
      sendTelegramFromDiscord: async payload => {
        naturalAnnouncements.push(payload);
        return { ok: true };
      }
    },
    familyAnnouncementRoleId: 'family-role',
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
      recordAnalyticsMessage() {}, recordMessage() {}, recordPresence() {}, trackJoin() {}, trackLeave() {}, recordReaction() {},
      getPeriodAnalytics: days => ({
        dayCount: days || 7,
        joins: 2,
        leaves: 1,
        messagesTotal: days === 1 ? 12 : 42,
        reactionsTotal: days === 1 ? 3 : 9,
        voiceMinutesTotal: days === 1 ? 60 : 300,
        members: { 'active-user': { messages: 20, reactions: 5, voiceMinutes: 120 } },
        channels: { 'channel-1': 42 },
        voiceChannels: {}
      }),
      ensureMemberRecord: id => ({
        lastSeenAt: id === 'inactive-user' ? Date.now() - 10 * 24 * 60 * 60 * 1000 : Date.now(),
        lastMessageAt: 0,
        lastVoiceAt: 0
      })
    }),
    isPremiumGuild: () => true,
    isModuleEnabled: () => true,
    hasFamilyRole: member => member?.id === 'inactive-user' || member?.id === 'active-user',
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
    resolveGuildSettings: () => ({ verification: { enabled: false }, channels: { rules: '333333333333333333' } }),
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

  await listeners.get('messageCreate')({
    ...baseMessage,
    id: 'message-3a',
    content: 'ты сын бляди',
    reference: { messageId: 'bot-reply' },
    channel: {
      id: 'channel-1',
      messages: {
        fetch: async id => (id === 'bot-reply' ? { author: { id: 'bot-1', bot: true } } : null)
      },
      send: async payload => {
        aiReplies.push(payload.content);
        return null;
      }
    },
    member: {
      ...baseMessage.member,
      timeout: async ms => { botInsultTimeoutMs = ms; }
    },
    delete: async () => {}
  });
  assert.equal(botInsultTimeoutMs, 2 * 60 * 1000);
  assert.match(aiReplies.at(-1), /мут на 2 минуты/u);
  aiReplies.length = 0;

  await listeners.get('messageCreate')({
    ...baseMessage,
    id: 'message-4',
    content: '<@bot-1> подскажи текст',
    mentions: { users: { size: 1, has: id => id === 'bot-1' } },
    channel: {
      id: 'channel-1',
      sendTyping: async () => {},
      send: async payload => {
        aiReplies.push(payload.content);
        return null;
      }
    },
    delete: async () => {}
  });
  assert.equal(aiReplies[0], '<@user-1> AI reply: подскажи текст');
  assert.match(aiSystems[0], /ФАКТИЧЕСКИЙ КОНТЕКСТ DISCORD-СЕРВЕРА/u);

  const aiCallsBeforeStats = aiSystems.length;
  await listeners.get('messageCreate')({
    ...baseMessage,
    id: 'message-4stats',
    content: '<@bot-1> дай мне статистику по активности в дс',
    mentions: { users: { size: 1, has: id => id === 'bot-1' } },
    channel: {
      id: 'channel-1',
      send: async payload => {
        activityReplies.push(payload);
        return null;
      }
    },
    delete: async () => {}
  });
  assert.equal(aiSystems.length, aiCallsBeforeStats);
  assert.equal(activityReplies.length, 1);
  assert.equal(activityReplies[0].embeds[0].data.title, '📊 Активность Discord');
  assert.match(activityReplies[0].embeds[0].data.fields[0].value, /12/u);

  const inactiveReplies = [];
  await listeners.get('messageCreate')({
    ...baseMessage,
    id: 'message-4inactive',
    content: '<@bot-1> тегни всех неактивных за 7 дней',
    mentions: { users: { size: 1, has: id => id === 'bot-1' } },
    member: {
      ...baseMessage.member,
      permissions: { has: permission => permission === PermissionFlagsBits.Administrator }
    },
    channel: {
      id: 'channel-1',
      send: async payload => {
        inactiveReplies.push(payload);
        return null;
      }
    },
    delete: async () => {}
  });
  assert.equal(inactiveReplies.length, 1);
  assert.match(inactiveReplies[0].content, /<@inactive-user>/u);
  assert.doesNotMatch(inactiveReplies[0].content, /<@active-user>/u);
  assert.deepEqual(inactiveReplies[0].allowedMentions.users, ['inactive-user']);

  await listeners.get('messageCreate')({
    ...baseMessage,
    id: 'message-4rules',
    content: '<@bot-1> напомни какие правила сервера нельзя нарушать и что будет за нарушение',
    mentions: { users: { size: 1, has: id => id === 'bot-1' } },
    channel: {
      id: 'channel-1',
      send: async payload => {
        aiReplies.push(payload.content);
        return null;
      }
    },
    delete: async () => {}
  });
  assert.match(aiReplies.at(-1), /AI reply:/u);
  assert.match(aiReplies.at(-1), /запрещены оскорбления/u);

  await listeners.get('messageCreate')({
    ...baseMessage,
    id: 'message-4rules-channel',
    content: '<@bot-1> вот тут <#333333333333333333>',
    mentions: { users: { size: 1, has: id => id === 'bot-1' } },
    channel: {
      id: 'channel-1',
      send: async payload => {
        aiReplies.push(payload.content);
        return null;
      }
    },
    delete: async () => {}
  });
  assert.match(aiReplies.at(-1), /AI reply:/u);
  assert.match(aiReplies.at(-1), /запрещены оскорбления/u);

  await listeners.get('messageCreate')({
    ...baseMessage,
    id: 'message-4channel',
    content: '<@bot-1> сделай <#444444444444444444> каналом заявок',
    mentions: { users: { size: 1, has: id => id === 'bot-1' } },
    member: {
      ...baseMessage.member,
      permissions: { has: permission => permission === PermissionFlagsBits.Administrator }
    },
    channel: {
      id: 'channel-1',
      send: async payload => {
        aiReplies.push(payload.content);
        return null;
      }
    },
    delete: async () => {}
  });
  assert.deepEqual(channelSettingsPatches.at(-1).channels, { applications: '444444444444444444' });
  assert.equal(channelSettingsPatches.at(-1).aiBrain.channels['444444444444444444'].purpose, 'applications');
  assert.equal(channelSettingsPatches.at(-1).aiBrain.audit.at(-1).action, 'channel_assign');
  assert.match(aiReplies.at(-1), /теперь используется как \*\*заявки\*\*/u);

  await listeners.get('messageCreate')({
    ...baseMessage,
    id: 'message-4a',
    content: '<@bot-1> замуть <@222222222222222222> за флуд',
    mentions: { users: { size: 2, has: id => id === 'bot-1' || id === targetMember.id } },
    member: {
      ...baseMessage.member,
      permissions: { has: permission => permission === PermissionFlagsBits.Administrator }
    },
    channel: {
      id: 'channel-1',
      send: async payload => {
        aiReplies.push(payload.content);
        return null;
      }
    },
    delete: async () => {}
  });
  assert.equal(naturalTimeoutMs, 30 * 60 * 1000);
  assert.match(aiReplies.at(-1), /Запрет на чрезмерный флуд/);

  await listeners.get('messageCreate')({
    ...baseMessage,
    id: 'message-4unmute',
    content: '<@bot-1> размуть <@222222222222222222>',
    mentions: { users: { size: 2, has: id => id === 'bot-1' || id === targetMember.id } },
    member: {
      ...baseMessage.member,
      permissions: { has: permission => permission === PermissionFlagsBits.Administrator }
    },
    channel: {
      id: 'channel-1',
      send: async payload => {
        aiReplies.push(payload.content);
        return null;
      }
    },
    delete: async () => {}
  });
  assert.equal(naturalTimeoutMs, null);
  assert.match(aiReplies.at(-1), /размучен/);

  await listeners.get('messageCreate')({
    ...baseMessage,
    id: 'message-4ban-plan',
    content: '<@bot-1> забань <@222222222222222222> за угрозы',
    mentions: { users: { size: 2, has: id => id === 'bot-1' || id === targetMember.id } },
    member: {
      ...baseMessage.member,
      permissions: { has: permission => permission === PermissionFlagsBits.Administrator }
    },
    channel: {
      id: 'channel-1',
      send: async payload => {
        aiReplies.push(payload.content);
        return null;
      }
    },
    delete: async () => {}
  });
  assert.equal(naturalBanned, false);
  const confirmationCode = aiReplies.at(-1).match(/подтверждаю ([A-Z0-9]{6})/u)?.[1];
  assert.ok(confirmationCode);

  await listeners.get('messageCreate')({
    ...baseMessage,
    id: 'message-4ban-confirm',
    content: `<@bot-1> подтверждаю ${confirmationCode}`,
    mentions: { users: { size: 1, has: id => id === 'bot-1' } },
    member: {
      ...baseMessage.member,
      permissions: { has: permission => permission === PermissionFlagsBits.Administrator }
    },
    channel: {
      id: 'channel-1',
      send: async payload => {
        aiReplies.push(payload.content);
        return null;
      }
    },
    delete: async () => {}
  });
  assert.equal(naturalBanned, true);
  assert.match(aiReplies.at(-1), /Подтверждено и выполнено/u);

  await listeners.get('messageCreate')({
    ...baseMessage,
    id: 'message-4b',
    content: '<@bot-1> сделай красивое оповещение о собрании завтра в 8 вечера',
    mentions: { users: { size: 1, has: id => id === 'bot-1' } },
    member: {
      ...baseMessage.member,
      permissions: { has: permission => permission === PermissionFlagsBits.Administrator }
    },
    channel: {
      id: 'channel-1',
      send: async payload => {
        aiReplies.push(payload.content);
        return null;
      }
    },
    delete: async () => {}
  });
  assert.equal(naturalAnnouncements.length, 1);
  assert.equal(naturalAnnouncements[0].type, 'event');
  assert.equal(naturalAnnouncements[0].title, '📅 Семейное собрание');
  assert.equal(naturalAnnouncements[0].pingRoleId, 'family-role');
  assert.match(naturalAnnouncements[0].text, /20:00/u);

  await listeners.get('messageCreate')({
    ...baseMessage,
    id: 'message-5',
    content: '<@bot-1> еще вопрос',
    mentions: { users: { size: 1, has: id => id === 'bot-1' } },
    channel: {
      id: 'channel-1',
      send: async payload => {
        aiReplies.push(payload.content);
        return null;
      }
    },
    delete: async () => {}
  });
  assert.match(aiReplies.at(-1), /подожди ещё/u);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };
