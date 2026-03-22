require('dotenv').config();
const path = require('path');
const { ChannelType, Client, EmbedBuilder, GatewayIntentBits } = require('discord.js');
const ROLES = require('./roles');
const { createAIService } = require('./ai');
const { createApplicationsService } = require('./applications');
const { registerCommands } = require('./commands');
const embeds = require('./embeds');
const { createStorage } = require('./storage');

const DATA_FILE = path.join(__dirname, 'storage.json');

const GUILD_ID = process.env.GUILD_ID;
const CHANNEL_ID = process.env.CHANNEL_ID;
const APPLICATIONS_CHANNEL_ID = process.env.APPLICATIONS_CHANNEL_ID || CHANNEL_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || '';
const DISCIPLINE_LOG_CHANNEL_ID = process.env.DISCIPLINE_LOG_CHANNEL_ID || LOG_CHANNEL_ID || '';
const MESSAGE_ID = process.env.MESSAGE_ID || '';
const UPDATE_INTERVAL_MS = Math.max(60000, Number(process.env.UPDATE_INTERVAL_MS || 60000));
const APPLICATION_COOLDOWN_MS = Math.max(10000, Number(process.env.APPLICATION_COOLDOWN_MS || 300000));
const APPLICATION_DEFAULT_ROLE = process.env.APPLICATION_DEFAULT_ROLE || process.env.ROLE_NEWBIE || '';
const FAMILY_TITLE = process.env.FAMILY_TITLE || '🏠 Семья';
const ACCESS_APPLICATIONS = (process.env.ACCESS_APPLICATIONS || '').split(',').map(item => item.trim()).filter(Boolean);
const ACCESS_DISCIPLINE = (process.env.ACCESS_DISCIPLINE || '').split(',').map(item => item.trim()).filter(Boolean);
const AI_ENABLED = process.env.AI_ENABLED === 'true';
const AI_MODEL = process.env.AI_MODEL || 'gpt-5.4-mini';
const NO_ACCESS_MESSAGE = 'У тебя нет доступа к этому действию.';

function formatCooldownMessage(secondsLeft) {
  return `Подожди ${secondsLeft} сек. перед новой заявкой.`;
}

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
const aiService = createAIService({
  enabled: AI_ENABLED,
  apiKey: process.env.OPENAI_API_KEY,
  model: AI_MODEL
});

function getRoleIds() {
  return ROLES.map(role => role.id).filter(Boolean);
}

function hasFamilyRole(member) {
  const roleIds = new Set(getRoleIds());
  return member.roles.cache.some(role => roleIds.has(role.id));
}

function canApplications(member) {
  if (!member) return false;
  if (!ACCESS_APPLICATIONS.length) return member.permissions.has('ManageRoles');
  return member.roles.cache.some(role => ACCESS_APPLICATIONS.includes(role.id)) || member.permissions.has('ManageRoles');
}

function canDiscipline(member) {
  if (!member) return false;
  if (!ACCESS_DISCIPLINE.length) return member.permissions.has('ManageRoles');
  return member.roles.cache.some(role => ACCESS_DISCIPLINE.includes(role.id)) || member.permissions.has('ManageRoles');
}

async function fetchTextChannel(guild, id) {
  if (!id) return null;
  const channel = await guild.channels.fetch(id).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return null;
  return channel;
}

async function sendAcceptLog(guild, member, moderatorUser, reason = 'Собеседование', rankName = '1 ранг') {
  if (!LOG_CHANNEL_ID) return;
  const channel = await fetchTextChannel(guild, LOG_CHANNEL_ID);
  if (!channel) return;

  await channel.send({
    embeds: [embeds.buildAcceptLogEmbed({ member, moderatorUser, reason, rankName })]
  });
}

async function sendDisciplineLog(guild, embed) {
  if (!DISCIPLINE_LOG_CHANNEL_ID) return;
  const channel = await fetchTextChannel(guild, DISCIPLINE_LOG_CHANNEL_ID);
  if (!channel) return;
  await channel.send({ embeds: [embed] });
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

client.on('clientReady', async () => {
  console.log(`Бот запущен как ${client.user.tag}`);

  const guild = await client.guilds.fetch(GUILD_ID);
  await guild.roles.fetch();
  await guild.members.fetch();

  await registerCommands(guild);
  await doPanelUpdate(true);

  setInterval(() => {
    doPanelUpdate(false);
  }, UPDATE_INTERVAL_MS);
});

client.on('messageCreate', message => {
  if (!message.guild || message.author.bot || !message.member) return;
  if (!hasFamilyRole(message.member)) return;
  storage.trackMessage(message.member.id);
});

client.on('presenceUpdate', (_, presence) => {
  const member = presence?.member;
  if (!member || !hasFamilyRole(member)) return;
  storage.trackPresence(member.id);
});

client.on('guildMemberUpdate', (oldMember, newMember) => {
  const before = hasFamilyRole(oldMember);
  const after = hasFamilyRole(newMember);
  if (before !== after) setTimeout(() => doPanelUpdate(false), 2000);
});

process.on('SIGINT', () => {
  storage.flush();
  process.exit(0);
});

process.on('SIGTERM', () => {
  storage.flush();
  process.exit(0);
});

process.on('beforeExit', () => {
  storage.flush();
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
          return interaction.reply({ content: formatCooldownMessage(secondsLeft), ephemeral: true });
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

      if (interaction.commandName === 'testaccept') {
        if (!LOG_CHANNEL_ID) {
          return interaction.reply({ content: 'LOG_CHANNEL_ID не указан.', ephemeral: true });
        }

        await sendAcceptLog(interaction.guild, interaction.member, interaction.user, 'Собеседование', '1 ранг');
        return interaction.reply({ content: 'Тестовый лог отправлен в канал логов.', ephemeral: true });
      }

      if (interaction.commandName === 'profile') {
        const user = interaction.options.getUser('пользователь') || interaction.user;
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (!member) {
          return interaction.reply({ content: 'Участник не найден.', ephemeral: true });
        }

        return interaction.reply({
          embeds: [
            embeds.buildProfileEmbed(member, {
              activityScore: storage.activityScore,
              memberData: storage.ensureMember(member.id),
              familyRoleIds: getRoleIds()
            })
          ],
          ephemeral: true
        });
      }

      if (interaction.commandName === 'warn') {
        if (!canDiscipline(interaction.member)) {
          return interaction.reply({ content: NO_ACCESS_MESSAGE, ephemeral: true });
        }

        const user = interaction.options.getUser('пользователь', true);
        const reason = interaction.options.getString('причина', true);
        storage.addWarn({ userId: user.id, moderatorId: interaction.user.id, reason });

        await sendDisciplineLog(interaction.guild, embeds.buildWarnLogEmbed({
          targetUser: user,
          moderatorUser: interaction.user,
          reason
        }));

        return interaction.reply({ content: `⚠️ Выговор выдан <@${user.id}>.`, ephemeral: true });
      }

      if (interaction.commandName === 'commend') {
        if (!canDiscipline(interaction.member)) {
          return interaction.reply({ content: NO_ACCESS_MESSAGE, ephemeral: true });
        }

        const user = interaction.options.getUser('пользователь', true);
        const reason = interaction.options.getString('причина', true);
        storage.addCommend({ userId: user.id, moderatorId: interaction.user.id, reason });

        await sendDisciplineLog(interaction.guild, embeds.buildCommendLogEmbed({
          targetUser: user,
          moderatorUser: interaction.user,
          reason
        }));

        return interaction.reply({ content: `🏅 Похвала выдана <@${user.id}>.`, ephemeral: true });
      }

      if (interaction.commandName === 'ai') {
        const query = interaction.options.getString('запрос', true);
        await interaction.deferReply({ ephemeral: true });

        try {
          const answer = await aiService.aiText(
            'Ты помощник семьи на RP-сервере. Отвечай по-русски, кратко, полезно, в стиле игрового помощника. Если просят текст, давай готовый вариант.',
            query
          );
          return interaction.editReply({ content: answer.slice(0, 1900) });
        } catch (error) {
          return interaction.editReply({ content: `AI временно недоступен: ${error.message}` });
        }
      }
    }

    if (interaction.isButton()) {
      if (interaction.customId === 'family_refresh') {
        await interaction.deferReply({ ephemeral: true });
        await doPanelUpdate(true);
        return interaction.editReply({ content: 'Панель обновлена.' });
      }

      if (interaction.customId === 'family_apply') {
        const secondsLeft = applicationsService.getCooldownSecondsLeft(interaction.user.id, APPLICATION_COOLDOWN_MS);
        if (secondsLeft > 0) {
          return interaction.reply({ content: formatCooldownMessage(secondsLeft), ephemeral: true });
        }

        return interaction.showModal(embeds.buildApplyModal());
      }

      if (interaction.customId.startsWith('app_accept:')) {
        if (!canApplications(interaction.member)) {
          return interaction.reply({ content: NO_ACCESS_MESSAGE, ephemeral: true });
        }

        const [, applicationId, userId] = interaction.customId.split(':');
        const response = await applicationsService.accept(interaction, applicationId, userId);
        await doPanelUpdate(false);
        return response;
      }

      if (interaction.customId.startsWith('app_ai:')) {
        if (!canApplications(interaction.member)) {
          return interaction.reply({ content: NO_ACCESS_MESSAGE, ephemeral: true });
        }

        const [, applicationId] = interaction.customId.split(':');
        const application = storage.findApplication(applicationId);
        if (!application) {
          return interaction.reply({ content: 'Заявка не найдена.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });
        try {
          const analysis = await aiService.analyzeApplication(application);
          const embed = new EmbedBuilder()
            .setColor(0x3b82f6)
            .setTitle('🤖 AI-анализ заявки')
            .setDescription(analysis.slice(0, 3900))
            .setFooter({ text: `Заявка ${applicationId}` })
            .setTimestamp();

          return interaction.editReply({ embeds: [embed] });
        } catch (error) {
          return interaction.editReply({ content: `AI временно недоступен: ${error.message}` });
        }
      }

      if (interaction.customId.startsWith('app_review:')) {
        if (!canApplications(interaction.member)) {
          return interaction.reply({ content: NO_ACCESS_MESSAGE, ephemeral: true });
        }

        const [, applicationId, userId] = interaction.customId.split(':');
        return applicationsService.moveToReview(interaction, applicationId, userId);
      }

      if (interaction.customId.startsWith('app_reject:')) {
        if (!canApplications(interaction.member)) {
          return interaction.reply({ content: NO_ACCESS_MESSAGE, ephemeral: true });
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
      await interaction.reply({ content: 'Произошла ошибка. Попробуй ещё раз.', ephemeral: true }).catch(() => {});
    }
  }
});

client.login(process.env.TOKEN);
