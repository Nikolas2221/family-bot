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
  const channel = {
    sent: [],
    async send(payload) {
      this.sent.push(payload);
      return payload;
    }
  };

  const service = createApplicationsService({
    storage,
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
    guild: { id: 'guild-1' },
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

  assert.equal(storage.listRecentApplications(1).length, 1);
  assert.equal(storage.getCooldown('user-1') > 0, true);
  assert.equal(channel.sent.length, 2);
  assert.match(replies[0].content, /заявка отправлена/i);
}

async function testSubmitApplicationCreatesThreadTicket() {
  const storage = createTempStorage();
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
    storage,
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
    guild: { id: 'guild-thread' },
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

  const saved = storage.listRecentApplications(1)[0];
  assert.equal(channel.sent.length, 1);
  assert.equal(threadMessages.length, 1);
  assert.equal(saved.ticketThreadId, 'thread-1');
  assert.equal(saved.ticketStarterMessageId, 'starter-1');
  assert.equal(saved.ticketMessageId, 'thread-message-1');
  assert.equal(threadOptions.name.startsWith('ticket-Threader-'), true);
  assert.match(starterEdited.content, /тикет/i);
}

async function testAcceptApplication() {
  const storage = createTempStorage();
  const applicationId = storage.createApplication({
    userId: 'user-2',
    nickname: 'Applicant',
    level: '19',
    inviter: 'Boss',
    discovery: 'Forum',
    about: 'Хочу быть полезным и активным участником семьи.'
  });

  const edits = [];
  let acceptLogPayload = null;
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
    storage,
    fetchTextChannel: async () => null,
    applicationsChannelId: 'applications',
    applicationDefaultRole: 'role-newbie',
    logChannelId: '',
    familyRoles: buildFamilyRoles(),
    client: {},
    embeds: createEmbedsStub(),
    sendAcceptLog: async (_guild, _member, _moderatorUser, reason, rankName) => {
      acceptLogPayload = { reason, rankName };
    }
  });

  const replies = [];
  const interaction = {
    user: { id: 'moderator-1', username: 'Boss' },
    guild: {
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

  assert.equal(storage.findApplication(applicationId).status, 'accepted');
  assert.equal(edits.length, 1);
  assert.equal(addedRoleId, 'role-newbie');
  assert.equal(removedRoleIds, null);
  assert.deepEqual(acceptLogPayload, {
    reason: 'Прошел собеседование',
    rankName: '1 ранг'
  });
  assert.match(replies[0].content, /принят в семью/i);
}

async function testAcceptApplicationAssignsResolvedFamilyRole() {
  const storage = createTempStorage();
  const applicationId = storage.createApplication({
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
    storage,
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

async function testRejectApplication() {
  const storage = createTempStorage();
  const applicationId = storage.createApplication({
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

  const service = createApplicationsService({
    storage,
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
    sendAcceptLog: async () => {}
  });

  const replies = [];
  const interaction = {
    user: { id: 'moderator-2', username: 'Rejector' },
    guild: {},
    message: {
      async edit() {}
    },
    async reply(payload) {
      replies.push(payload);
      return payload;
    }
  };

  await service.reject(interaction, applicationId, 'user-3');

  assert.equal(storage.findApplication(applicationId).status, 'rejected');
  assert.equal(logChannel.sent.length, 1);
  assert.match(replies[0].content, /отклон/i);
}

async function main() {
  await runTest('submitApplication stores data and sends application message', testSubmitApplication);
  await runTest('submitApplication creates thread ticket when threads are available', testSubmitApplicationCreatesThreadTicket);
  await runTest('accept updates status and logs admission', testAcceptApplication);
  await runTest('accept assigns resolved family role', testAcceptApplicationAssignsResolvedFamilyRole);
  await runTest('reject updates status and sends reject log', testRejectApplication);
  console.log('ALL TESTS PASSED');
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };
