const assert = require('node:assert/strict');

const { createConfig, summarizeConfig, validateConfig } = require('../dist-ts/config');
const copy = require('../dist-ts/copy').default;
const { embeds } = require('../dist-ts/embeds');
const {
  buildApplicationsPanelEmbed,
  buildDebugConfigEmbed,
  buildFamilyEmbeds,
  buildFamilyMenuEmbed,
  buildUpdateAnnouncementEmbed,
  buildWelcomeEmbed,
  panelButtons
} = embeds;

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
    'KLAIZ Family',
    '',
    '',
    {
      memberCount: 286,
      verificationEnabled: true,
      rulesChannelId: '1517564214968058002',
      applicationsChannelId: '1517564215156805874',
      chatChannelId: '1517564214968058003'
    }
  ).toJSON();

  assert.equal(embed.title, 'Добро пожаловать в семью KLAIZ !');
  assert.match(embed.description, /286-й участник/u);
  assert.match(embed.description, /1517564214968058002/u);
  assert.match(embed.description, /1517564215156805874/u);
  assert.match(embed.description, /1517564214968058003/u);
  assert.match(embed.description, /обрабатывается до 12 часов/u);
  assert.match(embed.description, /подтверждения администратора/u);
  assert.doesNotMatch(embed.description, /Привет ты попал/u);
  assert.equal(embed.fields, undefined);
}

async function testWelcomeButtonsExcludeApplication() {
  const rows = embeds.buildWelcomeButtons('123456789012345678').map(row => row.toJSON());
  const buttons = rows.flatMap(row => row.components || []);
  assert.equal(buttons.some(button => button.custom_id === 'welcome_verify:123456789012345678'), true);
  assert.equal(buttons.some(button => button.custom_id === 'welcome_rules'), true);
  assert.equal(buttons.some(button => button.custom_id === 'family_apply'), false);
}

async function testFamilyPanelShowsMemberOnlyInHighestRole() {
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
        name: 'KLAIZ Elite',
        position: 20,
        members: new Map([[familyMember.id, familyMember]])
      }
    ],
    [
      'role-newbie',
      {
        id: 'role-newbie',
        name: 'KLAIZ Main',
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
        { id: 'role-leader', name: 'KLAIZ Elite' },
        { id: 'role-newbie', name: 'KLAIZ Main' }
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
        lastUpdatedLabel: 'now',
        totalWarnings: 2
      },
      activityScore() {
        return 0;
      },
      pointsScore() {
        return 42;
      },
      memberWarnings(memberId) {
        return memberId === 'user-1' ? 2 : 0;
      }
    }
  );

  const payload = embeds.map(embed => embed.toJSON());
  const serialized = JSON.stringify(payload);
  const fieldMentions = [payload[0]]
    .flatMap(embed => embed.fields || [])
    .map(field => field.value)
    .join('\n')
    .match(/<@user-1>/g) || [];

  assert.equal(fieldMentions.length, 1);
  assert.match(serialized, /Всего выговоров/u);
  assert.match(serialized, /42/u);
  assert.match(serialized, /2\/6/u);
  assert.doesNotMatch(serialized, /Premium/);
  assert.doesNotMatch(serialized, /1 \/ 1/);
}

async function testFamilyPanelCanUseAllDiscordRoles() {
  const eliteMember = {
    id: 'user-elite',
    displayName: 'Elite',
    user: { bot: false },
    presence: { status: 'online' }
  };
  const mainMember = {
    id: 'user-main',
    displayName: 'Main',
    user: { bot: false },
    presence: { status: 'online' }
  };

  const roles = new Map([
    [
      'guild-1',
      {
        id: 'guild-1',
        name: '@everyone',
        position: 0,
        members: new Map([[eliteMember.id, eliteMember], [mainMember.id, mainMember]])
      }
    ],
    [
      'role-family',
      {
        id: 'role-family',
        name: 'KLZ FAMQ',
        position: 10,
        members: new Map([[eliteMember.id, eliteMember], [mainMember.id, mainMember]])
      }
    ],
    [
      'role-main',
      {
        id: 'role-main',
        name: 'KLAIZ Main',
        position: 20,
        members: new Map([[mainMember.id, mainMember]])
      }
    ],
    [
      'role-guest',
      {
        id: 'role-guest',
        name: 'Guest',
        position: 21,
        members: new Map([[mainMember.id, mainMember]])
      }
    ],
    [
      'role-booster',
      {
        id: 'role-booster',
        name: 'Server Booster',
        position: 22,
        tags: { premiumSubscriberRole: true },
        members: new Map([[eliteMember.id, eliteMember]])
      }
    ],
    [
      'role-bot',
      {
        id: 'role-bot',
        name: 'KLAIZ BOT',
        position: 23,
        members: new Map([[mainMember.id, mainMember]])
      }
    ],
    [
      'role-elite',
      {
        id: 'role-elite',
        name: 'KLAIZ Elite',
        position: 30,
        members: new Map([[eliteMember.id, eliteMember]])
      }
    ]
  ]);

  const payload = (await buildFamilyEmbeds(
    {
      id: 'guild-1',
      roles: {
        cache: {
          get(roleId) {
            return roles.get(roleId);
          },
          values() {
            return roles.values();
          }
        }
      },
      members: {
        cache: new Map([
          [eliteMember.id, eliteMember],
          [mainMember.id, mainMember]
        ])
      }
    },
    {
      roles: [{ id: 'role-family', name: 'KLZ FAMQ' }],
      showAllGuildRoles: true,
      familyTitle: 'Test Family',
      activityScore() {
        return 0;
      }
    }
  )).map(embed => embed.toJSON());

  const fields = payload.flatMap(embed => embed.fields || []);
  const fieldNames = fields.map(field => field.name).join('\n');
  const fieldValues = fields.map(field => field.value).join('\n');

  assert.match(fieldNames, /𝑬𝒍𝒊𝒕𝒆/);
  assert.match(fieldNames, /𝑴𝒂𝒊𝒏/);
  assert.doesNotMatch(fieldNames, /@everyone/);
  assert.doesNotMatch(fieldNames, /Guest/);
  assert.doesNotMatch(fieldNames, /Booster/);
  assert.doesNotMatch(fieldNames, /BOT/);
  assert.equal((fieldValues.match(/<@user-elite>/g) || []).length, 1);
  assert.equal((fieldValues.match(/<@user-main>/g) || []).length, 1);
}

async function testMenuAndApplicationsEmbedsExposeConfiguredImages() {
  const familyEmbed = buildFamilyMenuEmbed({ imageUrl: 'https://example.com/family-banner.png' }).toJSON();
  const applicationsEmbed = buildApplicationsPanelEmbed({ imageUrl: 'https://example.com/apply-banner.png', familyTitle: 'Test Family' }).toJSON();

  assert.equal(familyEmbed.image.url, 'https://example.com/family-banner.png');
  assert.equal(applicationsEmbed.image.url, 'https://example.com/apply-banner.png');
  assert.equal(applicationsEmbed.title, 'Заявка в семью KLAIZ');
  assert.match(applicationsEmbed.description, /Нажми кнопку ниже, чтобы подать заявку в семью/u);
  assert.match(applicationsEmbed.description, /Процесс подачи заявки/u);
  assert.match(applicationsEmbed.description, /Вердикт заявки будет оповещен в личных сообщениях/u);
  assert.match(applicationsEmbed.footer.text, /KLAIZ/u);
  assert.doesNotMatch(applicationsEmbed.footer.text, /BRHD|Phoenix/u);
  const applicationEmbed = embeds.buildApplicationEmbed({
    user: { id: '123456789012345678' }, applicationId: 'app-1', familyTitle: 'Test Family'
  }).toJSON();
  assert.match(applicationEmbed.title, /Test Family/u);
  assert.match(applicationEmbed.footer.text, /Test Family/u);
  assert.doesNotMatch(applicationEmbed.footer.text, /BRHD|Phoenix/u);
  const applicationButtons = embeds.buildApplicationButtons('app-1', '123456789012345678')
    .flatMap(row => row.toJSON().components.map(component => component.custom_id));
  assert.equal(applicationButtons.some(customId => customId.startsWith('app_close:')), false);
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
  assert.equal(rows[0].components.length, 4);
  assert.equal(rows[1].components.length, 3);
  const customIds = rows.flatMap(row => row.components.map(component => component.custom_id));
  assert.equal(customIds.includes('family_apply'), false);
  assert.equal(customIds.includes('admin_applications'), false);
  assert.equal(customIds.includes('admin_blacklist'), false);
}

async function testUpdateAnnouncementEmbedShowsStructuredChanges() {
  const embed = buildUpdateAnnouncementEmbed({
    versionLabel: 'KLAIZ BOT 1.0 RELEASE',
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
async function testEmbedsPublicApiStaysComplete() {
  const expectedFunctions = [
    'buildAcceptLogEmbed',
    'buildAcceptModal',
    'buildAdminPanelEmbed',
    'buildAiAdvisorModal',
    'buildApplicationButtons',
    'buildApplicationEmbed',
    'buildApplicationsListEmbed',
    'buildApplicationsPanelButtons',
    'buildApplicationsPanelEmbed',
    'buildApplyDetailsModal',
    'buildApplyModal',
    'buildAutomodActionEmbed',
    'buildAutomodStatusEmbed',
    'buildAutoroleStatusEmbed',
    'buildBanListEmbed',
    'buildBlacklistEmbed',
    'buildCommendLogEmbed',
    'buildCustomCommandsEmbed',
    'buildDebugConfigEmbed',
    'buildFamilyEmbeds',
    'buildFamilyMenuEmbed',
    'buildHelpEmbed',
    'buildHelpPaginationButtons',
    'buildLeaderboardEmbed',
    'buildProfileEmbed',
    'buildProfilePointsModal',
    'buildProfileWarnModal',
    'buildRankButtons',
    'buildReactionRoleStatusEmbed',
    'buildRejectModal',
    'buildRejectLogEmbed',
    'buildReportScheduleEmbed',
    'buildRoleMenuComponents',
    'buildRoleMenuEmbed',
    'buildRoleMenuStatusEmbed',
    'buildUpdateAnnouncementEmbed',
    'buildVerificationModal',
    'buildVerificationStatusEmbed',
    'buildVoiceActivityEmbed',
    'buildWarnLogEmbed',
    'buildWelcomeButtons',
    'buildWelcomeEmbed',
    'buildWelcomeStatusEmbed',
    'panelButtons'
  ];

  for (const name of expectedFunctions) {
    assert.equal(typeof embeds[name], 'function', `${name} must stay exported`);
  }
}

async function main() {
  await runTest('debug config embed shows healthy config state', testDebugConfigEmbedShowsHealthyState);
  await runTest('debug config embed shows validation errors', testDebugConfigEmbedShowsErrors);
  await runTest('welcome embed shows join flow', testWelcomeEmbedShowsJoinFlow);
  await runTest('welcome buttons exclude application', testWelcomeButtonsExcludeApplication);
  await runTest('menu and applications embeds expose configured images', testMenuAndApplicationsEmbedsExposeConfiguredImages);
  await runTest('family menu summary and buttons render', testFamilyMenuSummaryAndButtons);
  await runTest('family panel shows member only in highest role', testFamilyPanelShowsMemberOnlyInHighestRole);
  await runTest('family panel can use all Discord roles', testFamilyPanelCanUseAllDiscordRoles);
  await runTest('update announcement embed shows structured changes', testUpdateAnnouncementEmbedShowsStructuredChanges);
  await runTest('embeds public api stays complete', testEmbedsPublicApiStaysComplete);
  console.log('ALL EMBEDS TESTS PASSED');
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };
