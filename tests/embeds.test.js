const assert = require('node:assert/strict');

const { createConfig, summarizeConfig, validateConfig } = require('../config');
const copy = require('../copy');
const {
  buildApplicationsPanelEmbed,
  buildDebugConfigEmbed,
  buildFamilyEmbeds,
  buildFamilyMenuEmbed,
  buildUpdateAnnouncementEmbed,
  buildWelcomeEmbed,
  panelButtons
} = require('../embeds');

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

async function testDebugConfigEmbedShowsHealthyState() {
  const config = createConfig({
    TOKEN: 'token',
    GUILD_ID: '123456789012345678',
    CHANNEL_ID: '123456789012345679',
    APPLICATIONS_CHANNEL_ID: '123456789012345680',
    LOG_CHANNEL_ID: '123456789012345681',
    DISCIPLINE_LOG_CHANNEL_ID: '123456789012345682',
    MESSAGE_ID: '123456789012345683',
    APPLICATION_DEFAULT_ROLE: '123456789012345684',
    ACCESS_APPLICATIONS: '123456789012345685',
    ACCESS_DISCIPLINE: '123456789012345686',
    ACCESS_RANKS: '123456789012345692',
    BOT_OWNER_IDS: '123456789012345693',
    ROLE_LEADER: '123456789012345687',
    ROLE_DEPUTY: '123456789012345688',
    ROLE_ELDER: '123456789012345689',
    ROLE_MEMBER: '123456789012345690',
    ROLE_NEWBIE: '123456789012345691',
    FAMILY_TITLE: 'Test Family',
    AI_ENABLED: 'false'
  });
  const validation = validateConfig(config);
  const embed = buildDebugConfigEmbed({
    summaryLines: summarizeConfig(config),
    validation
  }).toJSON();

  assert.equal(embed.title, copy.debugConfig.titleOk);
  assert.equal(embed.fields[0].name, copy.debugConfig.summaryField);
  assert.match(embed.fields[0].value, /Config summary:/);
  assert.match(embed.fields[0].value, /Test Family/);
  assert.equal(embed.fields[2].value, copy.debugConfig.none);
  assert.equal(embed.fields[3].value, copy.debugConfig.none);
}

async function testDebugConfigEmbedShowsErrors() {
  const config = createConfig({});
  const validation = validateConfig(config);
  const embed = buildDebugConfigEmbed({
    summaryLines: summarizeConfig(config),
    validation
  }).toJSON();

  assert.equal(embed.title, copy.debugConfig.titleError);
  assert.match(embed.fields[3].value, /TOKEN/);
  assert.match(embed.fields[3].value, /CHANNEL_ID/);
}

async function testWelcomeEmbedShowsJoinFlow() {
  const embed = buildWelcomeEmbed(
    {
      id: '123456789012345678',
      guild: { name: 'Phoenix Guild' },
      user: {
        displayAvatarURL() {
          return 'https://example.com/avatar.png';
        }
      }
    },
    'BRHD Family'
  ).toJSON();

  assert.match(embed.title, /BRHD Family|Phoenix/);
  assert.match(embed.description, /BRHD Family/);
  assert.ok(embed.fields?.length);
}

async function testFamilyPanelDoesNotDuplicateMemberAcrossRoles() {
  const familyMember = {
    id: 'user-1',
    displayName: 'Nikolas',
    user: { bot: false },
    presence: { status: 'online' }
  };
  const outsider = {
    id: 'user-2',
    displayName: 'Visitor',
    user: { bot: false },
    presence: { status: 'offline' }
  };

  const roles = new Map([
    [
      'role-leader',
      {
        id: 'role-leader',
        name: 'Leader',
        position: 20,
        members: new Map([[familyMember.id, familyMember]])
      }
    ],
    [
      'role-newbie',
      {
        id: 'role-newbie',
        name: 'Newbie',
        position: 10,
        members: new Map([[familyMember.id, familyMember]])
      }
    ]
  ]);

  const embeds = await buildFamilyEmbeds(
    {
      roles: {
        cache: {
          get(roleId) {
            return roles.get(roleId);
          }
        }
      },
      members: {
        cache: new Map([
          [familyMember.id, familyMember],
          [outsider.id, outsider]
        ])
      }
    },
    {
      roles: [
        { id: 'role-leader', name: 'Leader' },
        { id: 'role-newbie', name: 'Newbie' }
      ],
      familyTitle: 'Test Family',
      updateIntervalMs: 60000,
      summary: {
        pendingApplications: 2,
        afkRiskCount: 1,
        planLabel: copy.admin.panelPremium,
        onlineCount: 1,
        idleCount: 0,
        dndCount: 0,
        offlineCount: 0,
        topMemberLine: '<@user-1> • Leader • 0 очк.',
        lastUpdatedLabel: 'now'
      },
      activityScore() {
        return 0;
      }
    }
  );

  const payload = embeds.map(embed => embed.toJSON());
  const serialized = JSON.stringify(payload);
  const fieldMentions = payload
    .flatMap(embed => embed.fields || [])
    .map(field => field.value)
    .join('\n')
    .match(/<@user-1>/g) || [];

  assert.equal(fieldMentions.length, 1);
  assert.match(serialized, /1 \/ 1/);
  assert.match(serialized, /Premium/);
}

async function testMenuAndApplicationsEmbedsExposeConfiguredImages() {
  const familyEmbed = buildFamilyMenuEmbed({ imageUrl: 'https://example.com/family-banner.png' }).toJSON();
  const applicationsEmbed = buildApplicationsPanelEmbed({ imageUrl: 'https://example.com/apply-banner.png' }).toJSON();

  assert.equal(familyEmbed.image.url, 'https://example.com/family-banner.png');
  assert.equal(applicationsEmbed.image.url, 'https://example.com/apply-banner.png');
}

async function testFamilyMenuSummaryAndButtons() {
  const familyEmbed = buildFamilyMenuEmbed({
    summary: {
      totalMembers: 7,
      membersWithFamilyRoles: 5,
      membersWithoutFamilyRoles: 2,
      pendingApplications: 3,
      afkRiskCount: 1,
      planLabel: copy.admin.panelPremium,
      onlineCount: 2,
      idleCount: 1,
      dndCount: 1,
      offlineCount: 1,
      topMemberLine: '<@1> • Leader • 12 очк.',
      lastUpdatedLabel: '22.03.2026, 21:39:00'
    }
  }).toJSON();
  const rows = panelButtons().map(row => row.toJSON());

  assert.match(familyEmbed.description, /Premium/);
  assert.match(familyEmbed.description, /12/);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].components.length, 5);
  assert.equal(rows[1].components.length, 5);
}

async function testUpdateAnnouncementEmbedShowsStructuredChanges() {
  const embed = buildUpdateAnnouncementEmbed({
    versionLabel: 'BRHD/PHOENIX 1.0 RELEASE',
    semver: '1.0.3',
    buildId: 'abc123',
    commitMessage: 'embed update',
    changeLines: {
      added: [],
      updated: ['окно обновлений'],
      fixed: ['синхронизация команд']
    }
  }).toJSON();

  const fields = embed.fields || [];
  const updatedField = fields.find(field => field.name === 'Обновлено');
  const fixedField = fields.find(field => field.name === 'Исправлено');

  assert.ok(updatedField);
  assert.ok(fixedField);
  assert.ok(!fields.find(field => field.name === 'Добавлено'));
  assert.match(updatedField.value, /окно обновлений/);
  assert.match(fixedField.value, /синхронизация команд/);
}

async function main() {
  await runTest('debug config embed shows healthy config state', testDebugConfigEmbedShowsHealthyState);
  await runTest('debug config embed shows validation errors', testDebugConfigEmbedShowsErrors);
  await runTest('welcome embed shows join flow', testWelcomeEmbedShowsJoinFlow);
  await runTest('menu and applications embeds expose configured images', testMenuAndApplicationsEmbedsExposeConfiguredImages);
  await runTest('family menu summary and buttons render', testFamilyMenuSummaryAndButtons);
  await runTest('family panel does not duplicate member across roles', testFamilyPanelDoesNotDuplicateMemberAcrossRoles);
  await runTest('update announcement embed shows structured changes', testUpdateAnnouncementEmbedShowsStructuredChanges);
  console.log('ALL EMBEDS TESTS PASSED');
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };
