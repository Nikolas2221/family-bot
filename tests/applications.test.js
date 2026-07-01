const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createApplicationsService } = require('../applications');
const { createStorage } = require('../storage');

function createTempStorage() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'family-bot-'));
  const dataFile = path.join(tempDir, 'storage.json');
  return createStorage({ dataFile, saveDelayMs: 1 });
}

function createGuildScopedStorage(storage, guildId) {
  return {
    sanitizeApplicationInput: storage.sanitizeApplicationInput,
    getCooldown(userId) {
      return storage.getGuildCooldown(guildId, userId);
    },
    setCooldown(userId, value) {
      return storage.setGuildCooldown(guildId, userId, value);
    },
    createApplication(payload) {
      return storage.createGuildApplication({ guildId, ...payload });
    },
    findApplication(applicationId) {
      return storage.findGuildApplication(guildId, applicationId);
    },
    setApplicationTicketInfo(application, ticketInfo) {
      return storage.setApplicationTicketInfo(application, ticketInfo);
    },
    setApplicationStatus(application, status, reviewerId) {
      return storage.setApplicationStatus(application, status, reviewerId);
    },
    listRecentApplications(limit) {
      return storage.listGuildRecentApplications(guildId, limit);
    }
  };
}

function createFakeEmbed() {
  return {
    color: null,
    description: '',
    footer: null,
    setColor(value) {
      this.color = value;
      return this;
    },
    setDescription(value) {
      this.description = value;
      return this;
    },
    setFooter(value) {
      this.footer = value;
      return this;
    }
  };
}

function createEmbedsStub() {
  return {
    buildApplicationsPanelEmbed() {
      return { type: 'panel' };
    },
    buildApplicationsPanelButtons() {
      return [{ type: 'buttons' }];
    },
    buildApplicationEmbed({ user, nickname, level, inviter, discovery, about, age, text, applicationId, source }) {
      const embed = createFakeEmbed();
      embed.payload = {
        user,
        nickname,
        level,
        inviter,
        discovery,
        about,
        age,
        text,
        applicationId,
        source
      };
      return embed;
    },
    buildApplicationButtons(applicationId, userId, options = {}) {
      return [{ applicationId, userId, options }];
    },
    buildRejectLogEmbed({ user, moderatorUser, reason }) {
      return { user, moderatorUser, reason };
    }
  };
}

function buildFamilyRoles() {
  return [
    { key: 'leader', id: 'role-leader', name: 'Leader' },
    { key: 'deputy', id: 'role-deputy', name: 'Deputy' },
    { key: 'elder', id: 'role-elder', name: 'Elder' },
    { key: 'member', id: 'role-member', name: 'Member' },
    { key: 'newbie', id: 'role-newbie', name: 'Newbie' }
  ];
}

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

async function testSubmitApplication() {
  const storage = createTempStorage();
  const guildId = 'guild-1';
  const channel = {
    sent: [],
    async send(payload) {
      this.sent.push(payload);
      return payload;
    }
  };

  const service = createApplicationsService({
    storage: createGuildScopedStorage(storage, guildId),
    fetchTextChannel: async () => channel,
    applicationsChannelId: 'applications',
    applicationDefaultRole: '',
    logChannelId: '',
    familyRoles: buildFamilyRoles(),
    client: {},
    embeds: createEmbedsStub(),
    sendAcceptLog: async () => {}
  });

  const replies = [];
  const interaction = {
    guild: { id: guildId },
    user: { id: 'user-1' },
    fields: {
      getTextInputValue(field) {
        return {
          nickname: 'Tester',
          level: '21',
          inviter: 'Deniska',
          discovery: 'Discord',
          about: 'Хочу вступить в семью и помогать проекту.'
        }[field];
      }
    },
    async reply(payload) {
      replies.push(payload);
      return payload;
    }
  };

  await service.submitApplication(interaction);

  assert.equal(storage.listGuildRecentApplications(guildId, 1).length, 1);
  assert.equal(storage.getGuildCooldown(guildId, 'user-1') > 0, true);
  assert.equal(channel.sent.length, 1);
  assert.match(replies[0].content, /заявка отправлена/i);
}

async function testSubmitApplicationCreatesReviewCardWithoutThread() {
  const storage = createTempStorage();
  const guildId = 'guild-thread';
  const threadMessages = [];
  let starterEdited = null;
  let threadOptions = null;

  const thread = {
    id: 'thread-1',
    async send(payload) {
      threadMessages.push(payload);
      return { id: `thread-message-${threadMessages.length}`, ...payload };
    }
  };

  const channel = {
    sent: [],
    async send(payload) {
      this.sent.push(payload);
      return {
        id: `starter-${this.sent.length}`,
        async startThread(options) {
          threadOptions = options;
          return thread;
        },
        async edit(payloadToEdit) {
          starterEdited = payloadToEdit;
          return payloadToEdit;
        }
      };
    }
  };

  const service = createApplicationsService({
    storage: createGuildScopedStorage(storage, guildId),
    fetchTextChannel: async () => channel,
    applicationsChannelId: 'applications',
    applicationDefaultRole: '',
    logChannelId: '',
    familyRoles: buildFamilyRoles(),
    applicationAccessRoleIds: ['role-admin-1', 'role-admin-2'],
    client: {},
    embeds: createEmbedsStub(),
    sendAcceptLog: async () => {}
  });

  const interaction = {
    guild: { id: guildId },
    user: { id: 'user-thread' },
    fields: {
      getTextInputValue(field) {
        return {
          nickname: 'Threader',
          level: '15',
          inviter: 'Old Member',
          discovery: 'YouTube',
          about: 'Еще один тест заявки для тикетного сценария.'
        }[field];
      }
    },
    async reply() {}
  };

  await service.submitApplication(interaction);

  const saved = storage.listGuildRecentApplications(guildId, 1)[0];
  assert.equal(channel.sent.length, 1);
  assert.equal(threadMessages.length, 0);
  assert.equal(saved.ticketThreadId, '');
  assert.equal(saved.ticketStarterMessageId, '');
  assert.equal(saved.ticketMessageId, 'starter-1');
  assert.equal(threadOptions, null);
  assert.equal(starterEdited, null);
  assert.match(channel.sent[0].content, /<@&role-admin-1>/u);
}

async function testSubmitApplicationSurvivesTelegramFailure() {
  const storage = createTempStorage();
  const guildId = 'guild-telegram-failure';
  const channel = {
    sent: [],
    async send(payload) {
      this.sent.push(payload);
      return { id: `message-${this.sent.length}`, ...payload };
    }
  };
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);

  try {
    const service = createApplicationsService({
      storage: createGuildScopedStorage(storage, guildId),
      fetchTextChannel: async () => channel,
      applicationsChannelId: 'applications',
      applicationDefaultRole: '',
      logChannelId: '',
      familyRoles: buildFamilyRoles(),
      client: {},
      embeds: createEmbedsStub(),
      sendAcceptLog: async () => {},
      telegramNotifications: {
        notifyApplicationCreated: async () => {
          throw new Error('Telegram unavailable');
        }
      }
    });

    const replies = [];
    await service.submitApplication({
      guild: { id: guildId, name: 'Failure Test Guild' },
      user: { id: 'user-telegram', username: 'telegram-user' },
      fields: {
        getTextInputValue(field) {
          return {
            nickname: 'TelegramTester',
            level: '12',
            inviter: 'Member',
            discovery: 'Discord',
            about: 'Проверка отказоустойчивости Telegram-уведомлений.'
          }[field];
        }
      },
      async reply(payload) {
        replies.push(payload);
        return payload;
      }
    });

    assert.equal(storage.listGuildRecentApplications(guildId, 1).length, 1);
    assert.equal(channel.sent.length, 1);
    assert.equal(replies.length, 1);
    assert.equal(warnings.length, 1);
  } finally {
    console.warn = originalWarn;
  }
}

async function testAcceptApplication() {
  const storage = createTempStorage();
  const guildId = 'guild-accept';
  const applicationId = storage.createGuildApplication({
    guildId,
    userId: 'user-2',
    nickname: 'Applicant',
    level: '19',
    inviter: 'Boss',
    discovery: 'Forum',
    about: 'Хочу быть полезным и активным участником семьи.'
  });

  const edits = [];
  let acceptLogPayload = null;
  let telegramAccepted = null;
  let addedRoleId = null;
  let removedRoleIds = null;
  const member = {
    id: 'user-2',
    displayName: 'Applicant',
    roles: {
      cache: new Map(),
      async add(role) {
        addedRoleId = typeof role === 'string' ? role : role.id;
        return true;
      },
      async remove(roleIds) {
        removedRoleIds = roleIds;
        return true;
      }
    }
  };

  const service = createApplicationsService({
    storage: createGuildScopedStorage(storage, guildId),
    fetchTextChannel: async () => null,
    applicationsChannelId: 'applications',
    applicationDefaultRole: 'role-newbie',
    logChannelId: '',
    familyRoles: buildFamilyRoles(),
    client: {},
    embeds: createEmbedsStub(),
    sendAcceptLog: async (_guild, _member, _moderatorUser, reason, rankName) => {
      acceptLogPayload = { reason, rankName };
    },
    telegramNotifications: {
      notifyApplicationAccepted: async payload => {
        telegramAccepted = payload;
        return true;
      }
    }
  });

  const replies = [];
  const interaction = {
    user: { id: 'moderator-1', username: 'Boss' },
    guild: {
      id: guildId,
      members: {
        async fetch() {
          return member;
        }
      },
      roles: {
        cache: {
          get(roleId) {
            return { id: roleId };
          }
        }
      }
    },
    message: {
      async edit(payload) {
        edits.push(payload);
      }
    },
    async reply(payload) {
      replies.push(payload);
      return payload;
    }
  };

  await service.accept(interaction, applicationId, 'user-2', {
    reason: 'Прошел собеседование',
    rankName: '1 ранг'
  });

  assert.equal(storage.findGuildApplication(guildId, applicationId).status, 'accepted');
  assert.equal(edits.length, 1);
  assert.equal(addedRoleId, 'role-newbie');
  assert.equal(removedRoleIds, null);
  assert.deepEqual(acceptLogPayload, {
    reason: 'Прошел собеседование',
    rankName: '1 ранг'
  });
  assert.equal(telegramAccepted.application.id, applicationId);
  assert.equal(telegramAccepted.moderator.id, 'moderator-1');
  assert.match(replies[0].content, /принят в семью/i);
}

async function testAcceptApplicationAssignsResolvedFamilyRole() {
  const storage = createTempStorage();
  const guildId = 'guild-accept-resolved';
  const applicationId = storage.createGuildApplication({
    guildId,
    userId: 'user-22',
    nickname: 'Applicant 2',
    level: '22',
    inviter: 'Friend',
    discovery: 'Discord',
    about: 'Хочу вступить и показать активный онлайн.'
  });

  let addedRoleId = null;
  let removedRoleIds = null;
  const member = {
    id: 'user-22',
    displayName: 'Applicant 2',
    roles: {
      cache: new Map([
        ['role-newbie', { id: 'role-newbie' }],
        ['role-member', { id: 'role-member' }]
      ]),
      async add(role) {
        addedRoleId = typeof role === 'string' ? role : role.id;
        return true;
      },
      async remove(roleIds) {
        removedRoleIds = roleIds;
        return true;
      }
    }
  };

  const service = createApplicationsService({
    storage: createGuildScopedStorage(storage, guildId),
    fetchTextChannel: async () => null,
    applicationsChannelId: 'applications',
    applicationDefaultRole: 'role-newbie',
    logChannelId: '',
    familyRoles: buildFamilyRoles(),
    client: {},
    embeds: createEmbedsStub(),
    sendAcceptLog: async () => {}
  });

  const interaction = {
    user: { id: 'moderator-1', username: 'Boss' },
    guild: {
      id: guildId,
      members: {
        async fetch() {
          return member;
        }
      },
      roles: {
        cache: {
          get(roleId) {
            return { id: roleId };
          }
        }
      }
    },
    message: {
      async edit() {}
    },
    async reply(payload) {
      return payload;
    }
  };

  await service.accept(interaction, applicationId, 'user-22', {
    reason: 'Собеседование',
    rankName: 'elder'
  });

  assert.equal(addedRoleId, 'role-elder');
  assert.deepEqual(removedRoleIds, ['role-member', 'role-newbie']);
}

async function testAcceptApplicationDeletesTicketAfterApproval() {
  const storage = createTempStorage();
  const guildId = 'guild-accept-ticket';
  const applicationId = storage.createGuildApplication({
    guildId,
    userId: 'user-44',
    nickname: 'Ticket Applicant',
    level: '18',
    inviter: 'Recruiter',
    discovery: 'Discord',
    about: 'Хочу попасть в семью и пройти одобрение через тикет.'
  });
  const application = storage.findGuildApplication(guildId, applicationId);
  storage.setApplicationTicketInfo(application, {
    ticketThreadId: 'thread-accepted',
    ticketMessageId: 'ticket-message-1',
    ticketStarterMessageId: 'starter-message-1'
  });

  let starterDeleted = false;
  let threadDeleted = false;
  const replies = [];

  const starterMessage = {
    async delete() {
      starterDeleted = true;
      return true;
    }
  };

  const threadChannel = {
    id: 'thread-accepted',
    parent: {
      type: 0,
      messages: {
        async fetch(messageId) {
          return messageId === 'starter-message-1' ? starterMessage : null;
        }
      }
    },
    isThread() {
      return true;
    },
    async delete() {
      threadDeleted = true;
      return true;
    }
  };

  const member = {
    id: 'user-44',
    displayName: 'Ticket Applicant',
    roles: {
      cache: new Map(),
      async add() {
        return true;
      },
      async remove() {
        return true;
      }
    }
  };

  const service = createApplicationsService({
    storage: createGuildScopedStorage(storage, guildId),
    fetchTextChannel: async () => null,
    applicationsChannelId: 'applications',
    applicationDefaultRole: 'role-newbie',
    logChannelId: '',
    familyRoles: buildFamilyRoles(),
    client: {},
    embeds: createEmbedsStub(),
    sendAcceptLog: async () => {}
  });

  const interaction = {
    user: { id: 'moderator-1', username: 'Boss' },
    guild: {
      id: guildId,
      members: {
        async fetch() {
          return member;
        }
      },
      roles: {
        cache: {
          get(roleId) {
            return { id: roleId };
          }
        }
      }
    },
    channel: threadChannel,
    message: {
      async edit() {}
    },
    async reply(payload) {
      replies.push(payload);
      return payload;
    }
  };

  await service.accept(interaction, applicationId, 'user-44', {
    reason: 'Одобрен',
    rankName: '1 ранг'
  });

  assert.equal(replies.length, 1);
  assert.equal(starterDeleted, true);
  assert.equal(threadDeleted, true);
  assert.equal(application.ticketThreadId, '');
  assert.equal(application.ticketStarterMessageId, '');
}

async function testRejectApplication() {
  const storage = createTempStorage();
  const guildId = 'guild-reject';
  const applicationId = storage.createGuildApplication({
    guildId,
    userId: 'user-3',
    nickname: 'Rejected',
    level: '20',
    inviter: 'Recruiter',
    discovery: 'TikTok',
    about: 'Подаю заявку для проверки сценария отклонения.'
  });

  const logChannel = {
    sent: [],
    async send(payload) {
      this.sent.push(payload);
      return payload;
    }
  };
  let telegramRejected = null;

  const service = createApplicationsService({
    storage: createGuildScopedStorage(storage, guildId),
    fetchTextChannel: async (_guild, id) => (id === 'log-channel' ? logChannel : null),
    applicationsChannelId: 'applications',
    applicationDefaultRole: '',
    logChannelId: 'log-channel',
    familyRoles: buildFamilyRoles(),
    client: {
      users: {
        async fetch() {
          return { id: 'user-3' };
        }
      }
    },
    embeds: createEmbedsStub(),
    sendAcceptLog: async () => {},
    telegramNotifications: {
      notifyApplicationRejected: async payload => {
        telegramRejected = payload;
        return true;
      }
    }
  });

  const replies = [];
  const interaction = {
    user: { id: 'moderator-2', username: 'Rejector' },
    guild: { id: guildId },
    message: {
      async edit() {}
    },
    async reply(payload) {
      replies.push(payload);
      return payload;
    }
  };

  await service.reject(interaction, applicationId, 'user-3', { reason: 'Не подходит по требованиям' });

  assert.equal(storage.findGuildApplication(guildId, applicationId).status, 'rejected');
  assert.equal(logChannel.sent.length, 1);
  assert.equal(logChannel.sent[0].embeds[0].reason, 'Не подходит по требованиям');
  assert.equal(telegramRejected.application.id, applicationId);
  assert.equal(telegramRejected.candidate.id, 'user-3');
  assert.equal(telegramRejected.reason, 'Не подходит по требованиям');
  assert.match(replies[0].content, /отклон/i);
}

async function testCloseTicketNotifiesTelegram() {
  const storage = createTempStorage();
  const guildId = 'guild-close';
  const applicationId = storage.createGuildApplication({
    guildId,
    userId: 'user-close',
    nickname: 'Closer',
    level: '10',
    inviter: 'Member',
    discovery: 'Discord',
    about: 'Ticket close notification test.'
  });
  let archived = false;
  let locked = false;
  let deleted = false;
  let telegramClosed = null;
  let telegramCloseCount = 0;

  const service = createApplicationsService({
    storage: createGuildScopedStorage(storage, guildId),
    fetchTextChannel: async () => null,
    applicationsChannelId: 'applications',
    applicationDefaultRole: '',
    logChannelId: '',
    client: {},
    embeds: createEmbedsStub(),
    sendAcceptLog: async () => {},
    telegramNotifications: {
      notifyTicketClosed: async payload => {
        telegramCloseCount += 1;
        telegramClosed = payload;
        return true;
      }
    },
    ticketDeleteDelayMs: 0
  });

  const channel = {
    id: 'thread-close',
    isThread: () => true,
    async setArchived() {
      archived = true;
    },
    async setLocked() {
      locked = true;
    },
    async delete() {
      deleted = true;
    }
  };

  await service.closeTicket({
    guild: { id: guildId, name: 'Close Guild' },
    user: { id: 'moderator-close', username: 'CloserMod' },
    channel,
    async reply() {}
  }, applicationId);

  assert.equal(deleted, true);
  assert.equal(archived, false);
  assert.equal(locked, true);
  assert.equal(telegramClosed.application.id, applicationId);
  assert.equal(telegramClosed.ticketChannel.id, 'thread-close');
  assert.equal(telegramCloseCount, 1);

  const repeatReplies = [];
  await service.closeTicket({
    guild: { id: guildId, name: 'Close Guild' },
    user: { id: 'moderator-close', username: 'CloserMod' },
    channel,
    async reply(payload) { repeatReplies.push(payload); }
  }, applicationId);
  assert.equal(telegramCloseCount, 1);
  assert.match(repeatReplies[0].content, /уже закрыт/u);
}

async function main() {
  await runTest('submitApplication stores data and sends application message', testSubmitApplication);
  await runTest('submitApplication creates review card without a thread', testSubmitApplicationCreatesReviewCardWithoutThread);
  await runTest('submitApplication survives Telegram notification failure', testSubmitApplicationSurvivesTelegramFailure);
  await runTest('accept updates status and logs admission', testAcceptApplication);
  await runTest('accept assigns resolved family role', testAcceptApplicationAssignsResolvedFamilyRole);
  await runTest('accept deletes ticket after approval', testAcceptApplicationDeletesTicketAfterApproval);
  await runTest('reject updates status and sends reject log', testRejectApplication);
  await runTest('close ticket sends Telegram notification', testCloseTicketNotifiesTelegram);
  console.log('ALL TESTS PASSED');
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };
