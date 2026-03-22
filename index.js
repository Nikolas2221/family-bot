require('dotenv').config();

const path = require('path');
const { ChannelType, Client, EmbedBuilder, GatewayIntentBits, PermissionFlagsBits } = require('discord.js');
const { createAIService } = require('./ai');
const { createApplicationsService } = require('./applications');
const { registerCommands } = require('./commands');
const { createConfig, printStartupDiagnostics, summarizeConfig, validateConfig } = require('./config');
const copy = require('./copy');
const { createDatabase } = require('./database');
const embeds = require('./embeds');
const { createRankService } = require('./ranks');
const ROLES = require('./roles');
const { containsDiscordInvite, fetchDeletedChannelExecutor, restoreDeletedChannel } = require('./security');
const { createStorage } = require('./storage');

const config = createConfig(process.env);
const diagnostics = validateConfig(config);
const DATA_FILE = path.join(__dirname, 'storage.json');
const DATABASE_FILE = config.databaseFile || path.join(__dirname, 'database.json');

printStartupDiagnostics(config, diagnostics);

if (diagnostics.errors.length) {
  process.exit(1);
}

const GUILD_ID = config.guildId;
const CHANNEL_ID = config.channelId;
const APPLICATIONS_CHANNEL_ID = config.applicationsChannelId;
const LOG_CHANNEL_ID = config.logChannelId;
const DISCIPLINE_LOG_CHANNEL_ID = config.disciplineLogChannelId;
const MESSAGE_ID = config.messageId;
const UPDATE_INTERVAL_MS = config.updateIntervalMs;
const APPLICATION_COOLDOWN_MS = config.applicationCooldownMs;
const APPLICATION_DEFAULT_ROLE = config.applicationDefaultRole;
const FAMILY_TITLE = config.familyTitle;
const ACCESS_APPLICATIONS = config.accessApplications;
const ACCESS_DISCIPLINE = config.accessDiscipline;
const ACCESS_RANKS = config.accessRanks;
const AI_ENABLED = config.aiEnabled;
const AUTO_RANKS = config.autoRanks;
const LEAK_GUARD = config.leakGuard;
const CHANNEL_GUARD = config.channelGuard;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const storage = createStorage({ dataFile: DATA_FILE });
const database = createDatabase({ dataFile: DATABASE_FILE });
const aiService = createAIService({ enabled: AI_ENABLED });
const rankService = createRankService({
  roles: ROLES,
  storage,
  autoRanks: AUTO_RANKS
});

function getRoleIds() {
  return ROLES.map(role => role.id).filter(Boolean);
}

function hasFamilyRole(member) {
  const roleIds = new Set(getRoleIds());
  return member.roles.cache.some(role => roleIds.has(role.id));
}

function hasPermission(member, permission) {
  return Boolean(member?.permissions?.has(permission));
}

function hasAnyRole(member, roleIds) {
  return Boolean(member?.roles?.cache?.some(role => roleIds.includes(role.id)));
}

function isOwner(userId) {
  return config.ownerIds.includes(userId);
}

function getGuildPlan(guildId) {
  return database.getSubscription(guildId);
}

function isPremiumGuild(guildId) {
  return database.isPremium(guildId);
}

function buildGuildSettingsSnapshot(guild) {
  return {
    guildName: guild.name,
    ownerId: guild.ownerId || '',
    settings: {
      familyTitle: FAMILY_TITLE,
      channels: {
        panel: CHANNEL_ID,
        applications: APPLICATIONS_CHANNEL_ID,
        logs: LOG_CHANNEL_ID,
        disciplineLogs: DISCIPLINE_LOG_CHANNEL_ID
      },
      roles: {
        leader: ROLES.find(role => role.key === 'leader')?.id || '',
        deputy: ROLES.find(role => role.key === 'deputy')?.id || '',
        elder: ROLES.find(role => role.key === 'elder')?.id || '',
        member: ROLES.find(role => role.key === 'member')?.id || '',
        newbie: ROLES.find(role => role.key === 'newbie')?.id || ''
      },
      access: {
        applications: ACCESS_APPLICATIONS,
        discipline: ACCESS_DISCIPLINE,
        ranks: ACCESS_RANKS
      },
      features: {
        aiEnabled: AI_ENABLED,
        autoRanksEnabled: AUTO_RANKS.enabled,
        leakGuardEnabled: LEAK_GUARD.enabled,
        channelGuardEnabled: CHANNEL_GUARD.enabled
      }
    }
  };
}

function getGuildRecord(guild) {
  return database.ensureGuild(guild.id, {
    guildName: guild.name,
    ownerId: guild.ownerId || ''
  });
}

function getHelpCatalog(guildId, userId) {
  const freeCommands = [
    { name: 'family', description: copy.commands.familyDescription },
    { name: 'apply', description: copy.commands.applyDescription },
    { name: 'applications', description: copy.commands.applicationsDescription },
    { name: 'profile', description: copy.commands.profileDescription },
    { name: 'help', description: copy.commands.helpDescription },
    { name: 'setup', description: copy.commands.setupDescription },
    { name: 'adminpanel', description: copy.commands.adminPanelDescription },
    { name: 'warn', description: copy.commands.warnDescription },
    { name: 'commend', description: copy.commands.commendDescription },
    { name: 'blacklistadd', description: copy.commands.blacklistAddDescription },
    { name: 'blacklistremove', description: copy.commands.blacklistRemoveDescription },
    { name: 'blacklistlist', description: copy.commands.blacklistListDescription },
    { name: 'debugconfig', description: copy.commands.debugConfigDescription }
  ];

  const premiumCommands = [{ name: 'ai', description: copy.commands.aiDescription }];

  if (isOwner(userId)) {
    freeCommands.push({ name: 'subscription', description: copy.commands.subscriptionDescription });
  }

  return {
    plan: getGuildPlan(guildId),
    availableCommands: isPremiumGuild(guildId) ? [...freeCommands, ...premiumCommands] : freeCommands,
    premiumCommands: isPremiumGuild(guildId) ? [] : premiumCommands
  };
}

function canApplications(member) {
  if (!member) return false;
  if (!ACCESS_APPLICATIONS.length) return hasPermission(member, PermissionFlagsBits.ManageRoles);
  return hasAnyRole(member, ACCESS_APPLICATIONS) || hasPermission(member, PermissionFlagsBits.ManageRoles);
}

function canDiscipline(member) {
  if (!member) return false;
  if (!ACCESS_DISCIPLINE.length) return hasPermission(member, PermissionFlagsBits.ManageRoles);
  return hasAnyRole(member, ACCESS_DISCIPLINE) || hasPermission(member, PermissionFlagsBits.ManageRoles);
}

function canManageRanks(member) {
  if (!member) return false;
  if (!ACCESS_RANKS.length) return hasPermission(member, PermissionFlagsBits.ManageRoles);
  return hasAnyRole(member, ACCESS_RANKS) || hasPermission(member, PermissionFlagsBits.ManageRoles);
}

function canDebugConfig(interaction) {
  const memberPermissions = interaction.memberPermissions || interaction.member?.permissions;
  if (!memberPermissions) return false;

  return (
    memberPermissions.has(PermissionFlagsBits.Administrator) ||
    memberPermissions.has(PermissionFlagsBits.ManageGuild) ||
    memberPermissions.has(PermissionFlagsBits.ManageRoles)
  );
}

function canUseSecurity(member) {
  if (!member) return false;

  return (
    hasPermission(member, PermissionFlagsBits.Administrator) ||
    hasPermission(member, PermissionFlagsBits.ManageGuild) ||
    hasPermission(member, PermissionFlagsBits.BanMembers) ||
    hasPermission(member, PermissionFlagsBits.ManageChannels)
  );
}

function canBypassLeakGuard(member) {
  if (!LEAK_GUARD.enabled) return true;
  if (!member) return false;
  if (!LEAK_GUARD.allowedRoles.length) {
    return hasPermission(member, PermissionFlagsBits.ManageGuild) || hasPermission(member, PermissionFlagsBits.ManageMessages);
  }

  return (
    hasAnyRole(member, LEAK_GUARD.allowedRoles) ||
    hasPermission(member, PermissionFlagsBits.ManageGuild) ||
    hasPermission(member, PermissionFlagsBits.ManageMessages)
  );
}

function canBypassChannelGuard(member) {
  if (!CHANNEL_GUARD.enabled) return true;
  if (!member) return false;
  if (!CHANNEL_GUARD.allowedRoles.length) {
    return hasPermission(member, PermissionFlagsBits.ManageGuild) || hasPermission(member, PermissionFlagsBits.ManageChannels);
  }

  return (
    hasAnyRole(member, CHANNEL_GUARD.allowedRoles) ||
    hasPermission(member, PermissionFlagsBits.ManageGuild) ||
    hasPermission(member, PermissionFlagsBits.ManageChannels)
  );
}

async function fetchTextChannel(guild, id) {
  if (!id) return null;
  const channel = await guild.channels.fetch(id).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return null;
  return channel;
}

async function sendAcceptLog(
  guild,
  member,
  moderatorUser,
  reason = copy.applications.acceptReason,
  rankName = copy.applications.acceptRank
) {
  if (!isPremiumGuild(guild.id)) return;
  if (!LOG_CHANNEL_ID) return;
  const channel = await fetchTextChannel(guild, LOG_CHANNEL_ID);
  if (!channel) return;

  await channel.send({
    embeds: [embeds.buildAcceptLogEmbed({ member, moderatorUser, reason, rankName })]
  });
}

async function sendDisciplineLog(guild, embed) {
  if (!isPremiumGuild(guild.id)) return;
  if (!DISCIPLINE_LOG_CHANNEL_ID) return;
  const channel = await fetchTextChannel(guild, DISCIPLINE_LOG_CHANNEL_ID);
  if (!channel) return;
  await channel.send({ embeds: [embed] });
}

async function sendSecurityLog(guild, content) {
  if (!isPremiumGuild(guild.id)) return;
  if (!LOG_CHANNEL_ID) return;
  const channel = await fetchTextChannel(guild, LOG_CHANNEL_ID);
  if (!channel) return;
  await channel.send({ content }).catch(() => {});
}

async function refreshMember(member) {
  if (typeof member.fetch !== 'function') return member;
  return member.fetch().catch(() => member);
}

function buildProfilePayload(member, allowRankButtons, content = '') {
  const rankInfo = {
    ...rankService.describeMember(member),
    autoEnabled: isPremiumGuild(member.guild.id) && AUTO_RANKS.enabled
  };
  const payload = {
    embeds: [
      embeds.buildProfileEmbed(member, {
        activityScore: storage.activityScore,
        memberData: storage.ensureMember(member.id),
        familyRoleIds: getRoleIds(),
        rankInfo
      })
    ],
    components: allowRankButtons
      ? embeds.buildRankButtons({
          userId: member.id,
          canPromote: rankInfo.canPromote,
          canDemote: rankInfo.canDemote,
          canAutoSync: rankInfo.canAutoSync && rankInfo.autoEnabled
        })
      : []
  };

  if (content) {
    payload.content = content;
  }

  return payload;
}

function formatRankResult(userId, result) {
  switch (result.code) {
    case 'promoted':
      return copy.ranks.promoted(userId, result.fromRole.name, result.toRole.name);
    case 'demoted':
      return copy.ranks.demoted(userId, result.fromRole.name, result.toRole.name);
    case 'auto_applied':
      return copy.ranks.autoApplied(userId, result.fromRole.name, result.toRole.name, result.score);
    case 'top_rank':
      return copy.ranks.topRank(result.currentRole.name);
    case 'bottom_rank':
      return copy.ranks.bottomRank(result.currentRole.name);
    case 'manual_only':
      return copy.ranks.manualOnly(result.currentRole.name);
    case 'already_synced':
      return copy.ranks.alreadySynced(result.currentRole.name, result.score);
    case 'auto_disabled':
      return copy.ranks.autoDisabled;
    case 'auto_unavailable':
      return copy.ranks.autoUnavailable;
    case 'no_family_role':
    default:
      return copy.ranks.noFamilyRole;
  }
}

async function enforceBlacklist(member) {
  const entry = storage.getBlacklistEntry(member.id);
  if (!entry) return false;

  const reason = copy.security.blacklistBanReason(entry.reason);
  const banned = await member.ban({ reason }).then(() => true).catch(() => false);
  if (banned) {
    await sendSecurityLog(member.guild, copy.security.blacklistAdded(member.id, entry.reason));
    return true;
  }

  const kicked = await member.kick(reason).then(() => true).catch(() => false);
  if (kicked) {
    await sendSecurityLog(member.guild, copy.security.blacklistAdded(member.id, entry.reason));
  }
  return kicked;
}

const applicationsService = createApplicationsService({
  storage,
  fetchTextChannel,
  applicationsChannelId: APPLICATIONS_CHANNEL_ID,
  applicationDefaultRole: APPLICATION_DEFAULT_ROLE,
  logChannelId: LOG_CHANNEL_ID,
  client,
  embeds,
  sendAcceptLog
});

let panelUpdateInProgress = false;
let pendingPanelUpdate = false;
let lastPanelUpdate = 0;
let autoRankSyncInProgress = false;

async function doPanelUpdate(force = false) {
  if (panelUpdateInProgress) {
    pendingPanelUpdate = true;
    return;
  }

  const now = Date.now();
  if (!force && now - lastPanelUpdate < 15000) return;

  panelUpdateInProgress = true;
  try {
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) return;

    const channel = await fetchTextChannel(guild, CHANNEL_ID);
    if (!channel) return;

    const familyEmbeds = await embeds.buildFamilyEmbeds(guild, {
      roles: ROLES,
      familyTitle: FAMILY_TITLE,
      updateIntervalMs: UPDATE_INTERVAL_MS,
      activityScore: storage.activityScore
    });

    const panelMessageId = storage.getPanelMessageId(MESSAGE_ID);
    if (panelMessageId) {
      try {
        const message = await channel.messages.fetch(panelMessageId);
        await message.edit({ embeds: familyEmbeds, components: embeds.panelButtons(), content: '' });
      } catch {
        const message = await channel.send({ embeds: familyEmbeds, components: embeds.panelButtons(), content: '' });
        storage.setPanelMessageId(message.id, MESSAGE_ID);
        console.log('Скопируй MESSAGE_ID:', message.id);
      }
    } else {
      const message = await channel.send({ embeds: familyEmbeds, components: embeds.panelButtons(), content: '' });
      storage.setPanelMessageId(message.id, MESSAGE_ID);
      console.log('Скопируй MESSAGE_ID:', message.id);
    }

    lastPanelUpdate = Date.now();
  } catch (error) {
    console.error('Ошибка обновления панели:', error);
  } finally {
    panelUpdateInProgress = false;
    if (pendingPanelUpdate) {
      pendingPanelUpdate = false;
      setTimeout(() => doPanelUpdate(false), 3000);
    }
  }
}

async function syncAutoRanks(reason = 'interval') {
  if (!AUTO_RANKS.enabled || !isPremiumGuild(GUILD_ID) || autoRankSyncInProgress) return;

  autoRankSyncInProgress = true;
  try {
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) return;

    const result = await rankService.syncAutoRanks(guild);
    if (result.changes.length) {
      console.log(`[auto-ranks:${reason}] ${result.changes.length} change(s)`);
      await doPanelUpdate(false);
    }

    for (const failure of result.failures) {
      console.error(`Ошибка авто-ранга для ${failure.memberId}:`, failure.error);
    }
  } catch (error) {
    console.error('Ошибка авто-рангов:', error);
  } finally {
    autoRankSyncInProgress = false;
  }
}

client.on('clientReady', async () => {
  try {
    console.log(`Бот запущен как ${client.user.tag}`);

    const guilds = await client.guilds.fetch();
    for (const guildData of guilds.values()) {
      try {
        const guild = await guildData.fetch();
        database.ensureGuild(guild.id, {
          guildName: guild.name,
          ownerId: guild.ownerId || ''
        });
        await registerCommands(guild);
      } catch (error) {
        console.error(`Ошибка инициализации guild ${guildData.id}:`, error);
      }
    }

    const guild = await client.guilds.fetch(GUILD_ID).catch(error => {
      console.error(`Не удалось получить основной guild ${GUILD_ID}:`, error);
      return null;
    });

    if (!guild) {
      return;
    }

    await guild.roles.fetch().catch(error => {
      console.error('Не удалось получить роли guild:', error);
    });

    await guild.members.fetch().catch(error => {
      console.error('Не удалось получить участников guild:', error);
    });

    await syncAutoRanks('startup').catch(error => {
      console.error('Ошибка стартовой синхронизации авто-рангов:', error);
    });

    await doPanelUpdate(true).catch(error => {
      console.error('Ошибка стартового обновления панели:', error);
    });

    setInterval(() => {
      doPanelUpdate(false).catch(error => {
        console.error('Ошибка interval обновления панели:', error);
      });
    }, UPDATE_INTERVAL_MS);

    if (AUTO_RANKS.enabled) {
      setInterval(() => {
        syncAutoRanks('interval').catch(error => {
          console.error('Ошибка interval авто-рангов:', error);
        });
      }, AUTO_RANKS.intervalMs);
    }
  } catch (error) {
    console.error('Критическая ошибка clientReady:', error);
  }
});

client.on('messageCreate', async message => {
  if (!message.guild || message.author.bot || !message.member) return;

  if (LEAK_GUARD.enabled && containsDiscordInvite(message.content) && !canBypassLeakGuard(message.member)) {
    await message.delete().catch(() => {});
    const notice = await message.channel.send({ content: copy.security.inviteGuardNotice(message.author.id) }).catch(() => null);
    if (notice) {
      setTimeout(() => notice.delete().catch(() => {}), 10000);
    }
    await sendSecurityLog(message.guild, copy.security.inviteBlocked);
    return;
  }

  if (!hasFamilyRole(message.member)) return;
  storage.trackMessage(message.member.id);
});

client.on('presenceUpdate', (_, presence) => {
  const member = presence?.member;
  if (!member || !hasFamilyRole(member)) return;
  storage.trackPresence(member.id);
});

client.on('guildMemberAdd', async member => {
  await enforceBlacklist(member);
});

client.on('guildMemberUpdate', (oldMember, newMember) => {
  const before = hasFamilyRole(oldMember);
  const after = hasFamilyRole(newMember);
  if (before !== after) setTimeout(() => doPanelUpdate(false), 2000);
});

client.on('channelDelete', async channel => {
  if (!CHANNEL_GUARD.enabled || !channel?.guild) return;

  try {
    const executor = await fetchDeletedChannelExecutor(channel.guild, channel.id);
    if (executor) {
      const executorMember = await channel.guild.members.fetch(executor.id).catch(() => null);
      if (canBypassChannelGuard(executorMember)) {
        return;
      }
    }

    const restored = await restoreDeletedChannel(channel, copy.security.channelGuardReason);
    if (restored) {
      await sendSecurityLog(channel.guild, copy.security.channelRestored(channel.name));
    }
  } catch (error) {
    console.error('Ошибка защиты каналов:', error);
  }
});

process.on('SIGINT', () => {
  database.flush();
  storage.flush();
  process.exit(0);
});

process.on('SIGTERM', () => {
  database.flush();
  storage.flush();
  process.exit(0);
});

process.on('beforeExit', () => {
  database.flush();
  storage.flush();
});

process.on('unhandledRejection', error => {
  console.error('Unhandled rejection:', error);
});

process.on('uncaughtException', error => {
  console.error('Uncaught exception:', error);
});

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'family') {
        return interaction.reply({
          embeds: [embeds.buildFamilyMenuEmbed()],
          components: embeds.panelButtons(),
          ephemeral: true
        });
      }

      if (interaction.commandName === 'apply') {
        const secondsLeft = applicationsService.getCooldownSecondsLeft(interaction.user.id, APPLICATION_COOLDOWN_MS);
        if (secondsLeft > 0) {
          return interaction.reply({ content: copy.common.cooldown(secondsLeft), ephemeral: true });
        }

        return interaction.showModal(embeds.buildApplyModal());
      }

      if (interaction.commandName === 'applypanel') {
        return applicationsService.sendApplyPanel(interaction);
      }

      if (interaction.commandName === 'applications') {
        return interaction.reply({
          embeds: [embeds.buildApplicationsListEmbed(storage.listRecentApplications(10))],
          ephemeral: true
        });
      }

      if (interaction.commandName === 'setup') {
        if (!canDebugConfig(interaction)) {
          return interaction.reply({ content: copy.common.noAccess, ephemeral: true });
        }

        const record = database.markSetupComplete(interaction.guild.id, buildGuildSettingsSnapshot(interaction.guild));
        return interaction.reply({
          content: copy.admin.setupSaved,
          embeds: [embeds.buildAdminPanelEmbed({ guildName: interaction.guild.name, record })],
          ephemeral: true
        });
      }

      if (interaction.commandName === 'adminpanel') {
        if (!canDebugConfig(interaction)) {
          return interaction.reply({ content: copy.common.noAccess, ephemeral: true });
        }

        const record = getGuildRecord(interaction.guild);
        return interaction.reply({
          embeds: [embeds.buildAdminPanelEmbed({ guildName: interaction.guild.name, record })],
          ephemeral: true
        });
      }

      if (interaction.commandName === 'help') {
        const catalog = getHelpCatalog(interaction.guild.id, interaction.user.id);
        return interaction.reply({
          embeds: [embeds.buildHelpEmbed(catalog)],
          ephemeral: true
        });
      }

      if (interaction.commandName === 'subscription') {
        if (!isOwner(interaction.user.id)) {
          return interaction.reply({ content: copy.admin.noOwnerAccess, ephemeral: true });
        }

        const plan = interaction.options.getString(copy.commands.planOptionName, true);
        const record = database.setSubscription(interaction.guild.id, {
          plan,
          assignedBy: interaction.user.id
        });

        return interaction.reply({
          content: copy.admin.subscriptionUpdated(plan),
          embeds: [embeds.buildAdminPanelEmbed({ guildName: interaction.guild.name, record })],
          ephemeral: true
        });
      }

      if (interaction.commandName === 'blacklistadd') {
        if (!canUseSecurity(interaction.member)) {
          return interaction.reply({ content: copy.security.noSecurityAccess, ephemeral: true });
        }

        const user = interaction.options.getUser(copy.commands.userOptionName, true);
        const reason = interaction.options.getString(copy.commands.reasonOptionName, true);
        const existed = storage.isBlacklisted(user.id);
        storage.addBlacklistEntry({
          userId: user.id,
          moderatorId: interaction.user.id,
          reason
        });

        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (member) {
          await enforceBlacklist(member);
        }

        return interaction.reply({
          content: existed ? copy.security.blacklistUpdated(user.id, reason) : copy.security.blacklistAdded(user.id, reason),
          ephemeral: true
        });
      }

      if (interaction.commandName === 'blacklistremove') {
        if (!canUseSecurity(interaction.member)) {
          return interaction.reply({ content: copy.security.noSecurityAccess, ephemeral: true });
        }

        const user = interaction.options.getUser(copy.commands.userOptionName, true);
        const removed = storage.removeBlacklistEntry(user.id);
        if (!removed) {
          return interaction.reply({ content: copy.security.blacklistNotFound, ephemeral: true });
        }

        await interaction.guild.bans.remove(user.id).catch(() => {});
        return interaction.reply({ content: copy.security.blacklistRemoved(user.id), ephemeral: true });
      }

      if (interaction.commandName === 'blacklistlist') {
        if (!canUseSecurity(interaction.member)) {
          return interaction.reply({ content: copy.security.noSecurityAccess, ephemeral: true });
        }

        return interaction.reply({
          embeds: [embeds.buildBlacklistEmbed(storage.listBlacklist().slice(0, 25))],
          ephemeral: true
        });
      }

      if (interaction.commandName === 'debugconfig') {
        if (!canDebugConfig(interaction)) {
          return interaction.reply({ content: copy.common.noDebugAccess, ephemeral: true });
        }

        const liveConfig = createConfig(process.env);
        const liveDiagnostics = validateConfig(liveConfig);

        return interaction.reply({
          embeds: [
            embeds.buildDebugConfigEmbed({
              summaryLines: summarizeConfig(liveConfig),
              validation: liveDiagnostics
            })
          ],
          ephemeral: true
        });
      }

      if (interaction.commandName === 'testaccept') {
        if (!LOG_CHANNEL_ID) {
          return interaction.reply({ content: copy.logs.missingLogChannel, ephemeral: true });
        }

        await sendAcceptLog(interaction.guild, interaction.member, interaction.user);
        return interaction.reply({ content: copy.logs.testAcceptSent, ephemeral: true });
      }

      if (interaction.commandName === 'profile') {
        const user = interaction.options.getUser(copy.commands.userOptionName) || interaction.user;
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (!member) {
          return interaction.reply({ content: copy.profile.notFound, ephemeral: true });
        }

        return interaction.reply({
          ...buildProfilePayload(member, canManageRanks(interaction.member)),
          ephemeral: true
        });
      }

      if (interaction.commandName === 'warn') {
        if (!canDiscipline(interaction.member)) {
          return interaction.reply({ content: copy.common.noAccess, ephemeral: true });
        }

        const user = interaction.options.getUser(copy.commands.userOptionName, true);
        const reason = interaction.options.getString(copy.commands.reasonOptionName, true);
        storage.addWarn({ userId: user.id, moderatorId: interaction.user.id, reason });

        await sendDisciplineLog(
          interaction.guild,
          embeds.buildWarnLogEmbed({
            targetUser: user,
            moderatorUser: interaction.user,
            reason
          })
        );

        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (member && AUTO_RANKS.enabled && isPremiumGuild(interaction.guild.id)) {
          await rankService.applyAutoRank(member).catch(() => {});
          await doPanelUpdate(false);
        }

        return interaction.reply({ content: copy.discipline.warnReply(user.id), ephemeral: true });
      }

      if (interaction.commandName === 'commend') {
        if (!canDiscipline(interaction.member)) {
          return interaction.reply({ content: copy.common.noAccess, ephemeral: true });
        }

        const user = interaction.options.getUser(copy.commands.userOptionName, true);
        const reason = interaction.options.getString(copy.commands.reasonOptionName, true);
        storage.addCommend({ userId: user.id, moderatorId: interaction.user.id, reason });

        await sendDisciplineLog(
          interaction.guild,
          embeds.buildCommendLogEmbed({
            targetUser: user,
            moderatorUser: interaction.user,
            reason
          })
        );

        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (member && AUTO_RANKS.enabled && isPremiumGuild(interaction.guild.id)) {
          await rankService.applyAutoRank(member).catch(() => {});
          await doPanelUpdate(false);
        }

        return interaction.reply({ content: copy.discipline.commendReply(user.id), ephemeral: true });
      }

      if (interaction.commandName === 'ai') {
        if (!isPremiumGuild(interaction.guild.id)) {
          return interaction.reply({ content: copy.admin.premiumOnly, ephemeral: true });
        }

        const query = interaction.options.getString(copy.commands.queryOptionName, true);
        await interaction.deferReply({ ephemeral: true });

        try {
          const answer = await aiService.aiText(copy.ai.assistantPrompt, query);
          return interaction.editReply({ content: answer.slice(0, 1900) });
        } catch (error) {
          return interaction.editReply({ content: copy.ai.unavailable(error.message) });
        }
      }
    }

    if (interaction.isButton()) {
      if (interaction.customId === 'family_refresh') {
        await interaction.deferReply({ ephemeral: true });
        await syncAutoRanks('manual-refresh');
        await doPanelUpdate(true);
        return interaction.editReply({ content: copy.family.panelUpdated });
      }

      if (interaction.customId === 'family_apply') {
        const secondsLeft = applicationsService.getCooldownSecondsLeft(interaction.user.id, APPLICATION_COOLDOWN_MS);
        if (secondsLeft > 0) {
          return interaction.reply({ content: copy.common.cooldown(secondsLeft), ephemeral: true });
        }

        return interaction.showModal(embeds.buildApplyModal());
      }

      if (interaction.customId.startsWith('rank_')) {
        if (!canManageRanks(interaction.member)) {
          return interaction.reply({ content: copy.common.noAccess, ephemeral: true });
        }

        const [action, userId] = interaction.customId.split(':');
        const member = await interaction.guild.members.fetch(userId).catch(() => null);
        if (!member) {
          return interaction.reply({ content: copy.profile.notFound, ephemeral: true });
        }

        let result;
        if (action === 'rank_promote') {
          result = await rankService.promote(member);
        } else if (action === 'rank_demote') {
          result = await rankService.demote(member);
        } else {
          if (!isPremiumGuild(interaction.guild.id)) {
            return interaction.reply({ content: copy.admin.premiumOnly, ephemeral: true });
          }
          result = await rankService.applyAutoRank(member);
        }

        const refreshedMember = await refreshMember(member);
        await interaction.update(buildProfilePayload(refreshedMember, true, formatRankResult(userId, result)));
        await doPanelUpdate(false);
        return;
      }

      if (interaction.customId.startsWith('app_accept:')) {
        if (!canApplications(interaction.member)) {
          return interaction.reply({ content: copy.common.noAccess, ephemeral: true });
        }

        const [, applicationId, userId] = interaction.customId.split(':');
        const response = await applicationsService.accept(interaction, applicationId, userId);
        await doPanelUpdate(false);
        return response;
      }

      if (interaction.customId.startsWith('app_ai:')) {
        if (!canApplications(interaction.member)) {
          return interaction.reply({ content: copy.common.noAccess, ephemeral: true });
        }

        if (!isPremiumGuild(interaction.guild.id)) {
          return interaction.reply({ content: copy.admin.premiumOnly, ephemeral: true });
        }

        const [, applicationId] = interaction.customId.split(':');
        const application = storage.findApplication(applicationId);
        if (!application) {
          return interaction.reply({ content: copy.applications.notFound, ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });
        try {
          const analysis = await aiService.analyzeApplication(application);
          const embed = new EmbedBuilder()
            .setColor(0x3b82f6)
            .setTitle(copy.ai.buttonTitle)
            .setDescription(analysis.slice(0, 3900))
            .setFooter({ text: copy.ai.buttonFooter(applicationId) })
            .setTimestamp();

          return interaction.editReply({ embeds: [embed] });
        } catch (error) {
          return interaction.editReply({ content: copy.ai.unavailable(error.message) });
        }
      }

      if (interaction.customId.startsWith('app_review:')) {
        if (!canApplications(interaction.member)) {
          return interaction.reply({ content: copy.common.noAccess, ephemeral: true });
        }

        const [, applicationId, userId] = interaction.customId.split(':');
        return applicationsService.moveToReview(interaction, applicationId, userId);
      }

      if (interaction.customId.startsWith('app_reject:')) {
        if (!canApplications(interaction.member)) {
          return interaction.reply({ content: copy.common.noAccess, ephemeral: true });
        }

        const [, applicationId, userId] = interaction.customId.split(':');
        return applicationsService.reject(interaction, applicationId, userId);
      }
    }

    if (interaction.isModalSubmit() && interaction.customId === 'family_apply_modal') {
      return applicationsService.submitApplication(interaction);
    }
  } catch (error) {
    console.error('Ошибка interactionCreate:', error);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: copy.common.unknownError, ephemeral: true }).catch(() => {});
    }
  }
});

client.login(config.token);
