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
    buildApplicationEmbed({ user, nickname, age, text, applicationId, source }) {
      const embed = createFakeEmbed();
      embed.payload = { user, nickname, age, text, applicationId, source };
      return embed;
    },
    buildApplicationButtons(applicationId, userId) {
      return [{ applicationId, userId }];
    },
    buildRejectLogEmbed({ user, moderatorUser, reason }) {
      return { user, moderatorUser, reason };
    }
  };
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
          age: '21',
          text: 'Хочу вступить в семью и помогать проекту.'
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
  assert.equal(channel.sent.length, 1);
  assert.match(replies[0].content, /Заявка отправлена/);
}

async function testAcceptApplication() {
  const storage = createTempStorage();
  const applicationId = storage.createApplication({
    userId: 'user-2',
    nickname: 'Applicant',
    age: '19',
    text: 'Хочу быть полезным и активным участником семьи.'
  });

  const edits = [];
  let acceptLogPayload = null;
  const member = {
    id: 'user-2',
    displayName: 'Applicant',
    roles: {
      async add() {
        return true;
      }
    }
  };

  const service = createApplicationsService({
    storage,
    fetchTextChannel: async () => null,
    applicationsChannelId: 'applications',
    applicationDefaultRole: 'role-1',
    logChannelId: '',
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
          get() {
            return { id: 'role-1' };
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
    reason: 'Прошёл собеседование',
    rankName: '1 ранг'
  });

  assert.equal(storage.findApplication(applicationId).status, 'accepted');
  assert.equal(edits.length, 1);
  assert.deepEqual(acceptLogPayload, {
    reason: 'Прошёл собеседование',
    rankName: '1 ранг'
  });
  assert.match(replies[0].content, /принят в семью/i);
}

async function testRejectApplication() {
  const storage = createTempStorage();
  const applicationId = storage.createApplication({
    userId: 'user-3',
    nickname: 'Rejected',
    age: '20',
    text: 'Подаю заявку для проверки сценария отклонения.'
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
  await runTest('accept updates status and logs admission', testAcceptApplication);
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
