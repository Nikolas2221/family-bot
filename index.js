require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType
} = require('discord.js');
const OpenAI = require('openai');
const ROLES = require('./roles');

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
const ACCESS_APPLICATIONS = (process.env.ACCESS_APPLICATIONS || '').split(',').map(x => x.trim()).filter(Boolean);
const ACCESS_DISCIPLINE = (process.env.ACCESS_DISCIPLINE || '').split(',').map(x => x.trim()).filter(Boolean);
const AI_ENABLED = process.env.AI_ENABLED === 'true';
const AI_MODEL = process.env.AI_MODEL || 'gpt-5.4-mini';

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

function defaultStore() {
  return {
    members: {},
    applications: [],
    cooldowns: {},
    warns: [],
    commends: [],
    panelMessageId: ''
  };
}

function loadStore() {
  try {
    if (!fs.existsSync(DATA_FILE)) return defaultStore();
    return { ...defaultStore(), ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) };
  } catch {
    return defaultStore();
  }
}

let store = loadStore();

let saveTimer = null;

function flushStore() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function saveStore() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    flushStore();
  }, 500);
}

function trimText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function sanitizeApplicationInput(fields) {
  const nickname = trimText(fields.nickname, 64);
  const age = trimText(fields.age, 32);
  const text = trimText(fields.text, 1000);

  if (!nickname || !age || !text) {
    return { error: 'Все поля заявки должны быть заполнены.' };
  }

  if (text.length < 10) {
    return { error: 'Текст заявки слишком короткий. Напиши хотя бы 10 символов.' };
  }

  return { nickname, age, text };
}

function getPanelMessageId() {
  return MESSAGE_ID || store.panelMessageId || '';
}

function setPanelMessageId(messageId) {
  if (!MESSAGE_ID && messageId && store.panelMessageId !== messageId) {
    store.panelMessageId = messageId;
    saveStore();
  }
}

function isTerminalApplicationStatus(status) {
  return status === 'accepted' || status === 'rejected';
}

function setApplicationStatus(app, status, reviewerId) {
  app.status = status;
  app.reviewedBy = reviewerId;
  app.reviewedAt = new Date().toISOString();
  saveStore();
}

function ensureMember(id) {
  if (!store.members[id]) {
    store.members[id] = {
      messageCount: 0,
      lastSeenAt: Date.now(),
      warns: 0,
      commends: 0
    };
  }
  return store.members[id];
}

function canApplications(member) {
  if (!member) return false;
  if (!ACCESS_APPLICATIONS.length) return member.permissions.has('ManageRoles');
  return member.roles.cache.some(r => ACCESS_APPLICATIONS.includes(r.id)) || member.permissions.has('ManageRoles');
}

function canDiscipline(member) {
  if (!member) return false;
  if (!ACCESS_DISCIPLINE.length) return member.permissions.has('ManageRoles');
  return member.roles.cache.some(r => ACCESS_DISCIPLINE.includes(r.id)) || member.permissions.has('ManageRoles');
}

function getRoleIds() {
  return ROLES.map(r => r.id).filter(Boolean);
}

function hasFamilyRole(member) {
  const ids = new Set(getRoleIds());
  return member.roles.cache.some(r => ids.has(r.id));
}

function getStatusEmoji(member) {
  const s = member.presence?.status || 'offline';
  if (s === 'online') return '🟢';
  if (s === 'idle') return '🟡';
  if (s === 'dnd') return '⛔';
  return '⚫';
}

function statusWeight(member) {
  const s = member.presence?.status || 'offline';
  if (s === 'online') return 0;
  if (s === 'idle') return 1;
  if (s === 'dnd') return 2;
  return 3;
}

function activityScore(id) {
  const m = ensureMember(id);
  return (m.messageCount || 0) + (m.commends || 0) * 5 - (m.warns || 0) * 3;
}

function sortMembers(members) {
  return [...members].sort((a, b) => {
    const st = statusWeight(a) - statusWeight(b);
    if (st !== 0) return st;
    const act = activityScore(b.id) - activityScore(a.id);
    if (act !== 0) return act;
    return a.displayName.localeCompare(b.displayName, 'ru');
  });
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function fetchTextChannel(guild, id) {
  if (!id) return null;
  const ch = await guild.channels.fetch(id).catch(() => null);
  if (!ch || ch.type !== ChannelType.GuildText) return null;
  return ch;
}

function panelButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('family_refresh').setLabel('Обновить').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('family_apply').setLabel('Подать заявку').setStyle(ButtonStyle.Success)
    )
  ];
}

function buildApplyModal() {
  const modal = new ModalBuilder().setCustomId('family_apply_modal').setTitle('Заявка в семью');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('nickname').setLabel('Ваш ник').setStyle(TextInputStyle.Short).setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('age').setLabel('Ваш возраст').setStyle(TextInputStyle.Short).setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('text').setLabel('Почему хотите в семью').setStyle(TextInputStyle.Paragraph).setRequired(true)
    )
  );
  return modal;
}

function buildApplicationEmbed({ user, nickname, age, text, applicationId, source = 'Заявка' }) {
  return new EmbedBuilder()
    .setColor(0x22C55E)
    .setTitle('📝 Заявка в семью')
    .setDescription(`> **${source} от <@${user.id}>**\n> Статус: **На рассмотрении**`)
    .addFields(
      { name: '👤 Пользователь', value: `<@${user.id}>`, inline: true },
      { name: '📛 Ник', value: nickname, inline: true },
      { name: '🎂 Возраст', value: age, inline: true },
      { name: '📄 Текст заявки', value: text, inline: false },
      { name: '🆔 Номер заявки', value: `\`${applicationId}\``, inline: true }
    )
    .setFooter({ text: 'Majestic Style • Family Applications' })
    .setTimestamp();
}

function buildApplicationButtons(applicationId, userId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`app_accept:${applicationId}:${userId}`).setLabel('✅ Принять').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`app_ai:${applicationId}:${userId}`).setLabel('🤖 AI-анализ').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`app_review:${applicationId}:${userId}`).setLabel('🕒 На рассмотрении').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`app_reject:${applicationId}:${userId}`).setLabel('❌ Отклонить').setStyle(ButtonStyle.Danger)
    )
  ];
}

function buildAcceptLogEmbed({ member, moderatorUser, reason = 'Собеседование', rankName = '1 ранг' }) {
  return new EmbedBuilder()
    .setColor(0x16a34a)
    .setTitle('🏠 Отчёт о приёме в семью')
    .setDescription(`**<@${moderatorUser.id}> принимает <@${member.id}> в семью**`)
    .addFields(
      {
        name: '👤 Принят в семью',
        value: [
          `**Пользователь:** <@${member.id}>`,
          `**Ник:** ${member.displayName}`,
          `**Discord ID:** \`${member.id}\``
        ].join('\n'),
        inline: false
      },
      {
        name: '👑 Кто принял',
        value: [
          `**Пользователь:** <@${moderatorUser.id}>`,
          `**Ник:** ${moderatorUser.username}`,
          `**Discord ID:** \`${moderatorUser.id}\``
        ].join('\n'),
        inline: false
      },
      {
        name: '📋 Детали приёма',
        value: [
          `**Причина:** ${reason}`,
          `**Принят на:** ${rankName}`
        ].join('\n'),
        inline: false
      }
    )
    .setFooter({ text: 'Family Log System' })
    .setTimestamp();
}

function buildRejectLogEmbed({ user, moderatorUser, reason = 'Отказ' }) {
  return new EmbedBuilder()
    .setColor(0xEF4444)
    .setTitle('❌ Отчёт об отказе')
    .setDescription(`**<@${moderatorUser.id}> отклоняет заявку <@${user.id}>**`)
    .addFields(
      { name: '👤 Кандидат', value: `**Пользователь:** <@${user.id}>\n**Discord ID:** \`${user.id}\``, inline: false },
      { name: '👑 Кто отклонил', value: `**Пользователь:** <@${moderatorUser.id}>\n**Discord ID:** \`${moderatorUser.id}\``, inline: false },
      { name: '📋 Причина', value: reason, inline: false }
    )
    .setFooter({ text: 'Family Log System' })
    .setTimestamp();
}

function buildWarnLogEmbed({ targetUser, moderatorUser, reason }) {
  return new EmbedBuilder()
    .setColor(0xF97316)
    .setTitle('⚠️ Выговор')
    .setDescription(`**<@${moderatorUser.id}> выдал выговор <@${targetUser.id}>**`)
    .addFields(
      { name: '👤 Участник', value: `<@${targetUser.id}>\n\`${targetUser.id}\``, inline: true },
      { name: '👑 Выдал', value: `<@${moderatorUser.id}>\n\`${moderatorUser.id}\``, inline: true },
      { name: '📋 Причина', value: reason, inline: false }
    )
    .setFooter({ text: 'Discipline Log' })
    .setTimestamp();
}

function buildCommendLogEmbed({ targetUser, moderatorUser, reason }) {
  return new EmbedBuilder()
    .setColor(0x3B82F6)
    .setTitle('🏅 Похвала')
    .setDescription(`**<@${moderatorUser.id}> отметил <@${targetUser.id}>**`)
    .addFields(
      { name: '👤 Участник', value: `<@${targetUser.id}>\n\`${targetUser.id}\``, inline: true },
      { name: '👑 Выдал', value: `<@${moderatorUser.id}>\n\`${moderatorUser.id}\``, inline: true },
      { name: '📋 Причина', value: reason, inline: false }
    )
    .setFooter({ text: 'Discipline Log' })
    .setTimestamp();
}

function buildProfileEmbed(member) {
  const data = ensureMember(member.id);
  const familyRoles = member.roles.cache
    .filter(r => getRoleIds().includes(r.id))
    .map(r => `<@&${r.id}>`)
    .join(', ') || 'Нет';
  return new EmbedBuilder()
    .setColor(0x8B5CF6)
    .setTitle(`👤 Профиль участника`)
    .setDescription(`> Информация о <@${member.id}>`)
    .setThumbnail(member.user.displayAvatarURL())
    .addFields(
      { name: '📛 Ник', value: member.displayName, inline: true },
      { name: '👤 Discord', value: `<@${member.id}>`, inline: true },
      { name: '🆔 ID', value: `\`${member.id}\``, inline: true },
      { name: '📌 Роли семьи', value: familyRoles, inline: false },
      { name: '📈 Активность', value: String(activityScore(member.id)), inline: true },
      { name: '⚠️ Выговоры', value: String(data.warns || 0), inline: true },
      { name: '🏅 Похвалы', value: String(data.commends || 0), inline: true },
      { name: '💬 Сообщения', value: String(data.messageCount || 0), inline: true },
      { name: '🟢 Статус', value: `${getStatusEmoji(member)} ${member.presence?.status || 'offline'}`, inline: true }
    )
    .setFooter({ text: 'Family Profile System' })
    .setTimestamp();
}

async function sendAcceptLog(guild, member, moderatorUser, reason = 'Собеседование', rankName = '1 ранг') {
  if (!LOG_CHANNEL_ID) return;
  const channel = await fetchTextChannel(guild, LOG_CHANNEL_ID);
  if (!channel) return;
  await channel.send({ embeds: [buildAcceptLogEmbed({ member, moderatorUser, reason, rankName })] });
}

async function sendDisciplineLog(guild, embed) {
  if (!DISCIPLINE_LOG_CHANNEL_ID) return;
  const channel = await fetchTextChannel(guild, DISCIPLINE_LOG_CHANNEL_ID);
  if (!channel) return;
  await channel.send({ embeds: [embed] });
}

async function aiText(systemPrompt, userPrompt) {
  if (!AI_ENABLED || !openai) {
    throw new Error('AI выключен. Проверь AI_ENABLED=true и OPENAI_API_KEY.');
  }

  const response = await openai.responses.create({
    model: AI_MODEL,
    input: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]
  });

  return (response.output_text || '').trim() || 'AI не вернул текст.';
}

async function analyzeApplicationAI(app) {
  const systemPrompt = [
    'Ты помощник руководства семьи на RP-сервере.',
    'Анализируй заявку кратко и по делу.',
    'Пиши только на русском.',
    'Верни ответ в 4 блоках:',
    '1. Сильные стороны',
    '2. Слабые стороны',
    '3. Риск',
    '4. Рекомендация: ПРИНЯТЬ / РАССМОТРЕТЬ / ОТКЛОНИТЬ'
  ].join(' ');

  const userPrompt = [
    `Ник: ${app.nickname}`,
    `Возраст: ${app.age}`,
    `Текст заявки: ${app.text}`,
    `Статус: ${app.status}`
  ].join('\n');

  return aiText(systemPrompt, userPrompt);
}

async function buildFamilyEmbeds(guild) {
  const configuredRoles = ROLES
    .map(item => ({ ...item, role: guild.roles.cache.get(item.id) }))
    .filter(item => item.role)
    .sort((a, b) => b.role.position - a.role.position);

  const embeds = [];
  let embed = new EmbedBuilder()
    .setTitle(FAMILY_TITLE)
    .setColor(0x8B5CF6)
    .setDescription('🟢 Онлайн • 🟡 Отошёл • ⛔ Не беспокоить • ⚫ Оффлайн')
    .setTimestamp()
    .setFooter({ text: `Обновление ${Math.floor(UPDATE_INTERVAL_MS / 1000)} сек.` });

  let total = 0;
  let fieldCount = 0;

  for (const item of configuredRoles) {
    const members = sortMembers(item.role.members.map(m => m));
    if (!members.length) continue;
    total += members.length;

    const lines = members.map(m => `${getStatusEmoji(m)} <@${m.id}> • ${activityScore(m.id)} очк.`);
    const parts = chunk(lines, 15);

    for (let i = 0; i < parts.length; i++) {
      if (fieldCount >= 25) {
        embeds.push(embed);
        embed = new EmbedBuilder().setColor(0x8B5CF6).setTimestamp();
        fieldCount = 0;
      }
      embed.addFields({
        name: i === 0 ? `${item.name} (${members.length})` : `${item.name} — продолжение`,
        value: parts[i].join('\n'),
        inline: false
      });
      fieldCount++;
    }
  }

  if (fieldCount === 0) embed.setDescription('Нет участников в выбранных ролях.');
  embed.setAuthor({ name: `Всего участников: ${total}` });
  embeds.push(embed);
  return embeds;
}

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

    const embeds = await buildFamilyEmbeds(guild);
    const panelMessageId = getPanelMessageId();

    if (panelMessageId) {
      try {
        const message = await channel.messages.fetch(panelMessageId);
        await message.edit({ embeds, components: panelButtons(), content: '' });
      } catch {
        const message = await channel.send({ embeds, components: panelButtons(), content: '' });
        setPanelMessageId(message.id);
        console.log('Скопируй MESSAGE_ID:', message.id);
      }
    } else {
      const message = await channel.send({ embeds, components: panelButtons(), content: '' });
      setPanelMessageId(message.id);
      console.log('Скопируй MESSAGE_ID:', message.id);
    }

    lastPanelUpdate = Date.now();
  } catch (e) {
    console.error('Ошибка обновления панели:', e);
  } finally {
    panelUpdateInProgress = false;
    if (pendingPanelUpdate) {
      pendingPanelUpdate = false;
      setTimeout(() => doPanelUpdate(false), 3000);
    }
  }
}

async function registerCommands(guild) {
  const commands = [
    new SlashCommandBuilder().setName('family').setDescription('Открыть меню семьи'),
    new SlashCommandBuilder().setName('apply').setDescription('Подать заявку в семью'),
    new SlashCommandBuilder().setName('applypanel').setDescription('Отправить панель заявок'),
    new SlashCommandBuilder().setName('applications').setDescription('Показать последние заявки'),
    new SlashCommandBuilder().setName('testaccept').setDescription('Тест красивого лога приёма'),
    new SlashCommandBuilder().setName('profile').setDescription('Профиль участника')
      .addUserOption(o => o.setName('пользователь').setDescription('Кого посмотреть').setRequired(false)),
    new SlashCommandBuilder().setName('warn').setDescription('Выдать выговор')
      .addUserOption(o => o.setName('пользователь').setDescription('Кому').setRequired(true))
      .addStringOption(o => o.setName('причина').setDescription('Причина').setRequired(true)),
    new SlashCommandBuilder().setName('commend').setDescription('Выдать похвалу')
      .addUserOption(o => o.setName('пользователь').setDescription('Кому').setRequired(true))
      .addStringOption(o => o.setName('причина').setDescription('Причина').setRequired(true)),
    new SlashCommandBuilder().setName('ai').setDescription('AI-помощник семьи')
      .addStringOption(o => o.setName('запрос').setDescription('Что нужно?').setRequired(true))
  ].map(c => c.toJSON());

  await guild.commands.set(commands);
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
  const data = ensureMember(message.member.id);
  data.messageCount += 1;
  data.lastSeenAt = Date.now();
  saveStore();
});

client.on('presenceUpdate', (_, presence) => {
  const member = presence?.member;
  if (!member || !hasFamilyRole(member)) return;
  const data = ensureMember(member.id);
  data.lastSeenAt = Date.now();
  saveStore();
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
  const before = hasFamilyRole(oldMember);
  const after = hasFamilyRole(newMember);
  if (before !== after) setTimeout(() => doPanelUpdate(false), 2000);
});

process.on('SIGINT', () => {
  flushStore();
  process.exit(0);
});

process.on('SIGTERM', () => {
  flushStore();
  process.exit(0);
});

process.on('beforeExit', () => {
  flushStore();
});

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'family') {
        const embed = new EmbedBuilder()
          .setTitle('🌆 Панель семьи')
          .setColor(0x8B5CF6)
          .setDescription('Выбери действие ниже.')
          .setTimestamp();

        return interaction.reply({ embeds: [embed], components: panelButtons(), ephemeral: true });
      }

      if (interaction.commandName === 'apply') {
        const last = store.cooldowns[interaction.user.id] || 0;
        if (Date.now() - last < APPLICATION_COOLDOWN_MS) {
          return interaction.reply({ content: `Подожди ${Math.ceil((APPLICATION_COOLDOWN_MS - (Date.now() - last)) / 1000)} сек.`, ephemeral: true });
        }
        return interaction.showModal(buildApplyModal());
      }

      if (interaction.commandName === 'applypanel') {
        const channel = await fetchTextChannel(interaction.guild, APPLICATIONS_CHANNEL_ID);
        if (!channel) return interaction.reply({ content: 'Канал заявок не найден.', ephemeral: true });

        await channel.send({
          embeds: [
            new EmbedBuilder()
              .setTitle('📨 Заявки в семью')
              .setColor(0x22C55E)
              .setDescription('Нажми кнопку ниже, чтобы подать заявку в семью.')
              .setFooter({ text: 'Majestic Style • Family Applications' })
              .setTimestamp()
          ],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('family_apply').setLabel('Подать заявку').setStyle(ButtonStyle.Success)
            )
          ]
        });

        return interaction.reply({ content: 'Панель заявок отправлена.', ephemeral: true });
      }

      if (interaction.commandName === 'applications') {
        const list = store.applications.slice(0, 10).map((a, i) =>
          `${i + 1}. \`${a.id}\` • <@${a.discordId}> • ${a.status}`
        ).join('\n') || 'Нет заявок';

        return interaction.reply({
          embeds: [new EmbedBuilder().setTitle('🗂 Последние заявки').setColor(0x22C55E).setDescription(list).setTimestamp()],
          ephemeral: true
        });
      }

      if (interaction.commandName === 'testaccept') {
        if (!LOG_CHANNEL_ID) return interaction.reply({ content: 'LOG_CHANNEL_ID не указан.', ephemeral: true });
        await sendAcceptLog(interaction.guild, interaction.member, interaction.user, 'Собеседование', '1 ранг');
        return interaction.reply({ content: 'Тестовый лог отправлен.', ephemeral: true });
      }

      if (interaction.commandName === 'profile') {
        const user = interaction.options.getUser('пользователь') || interaction.user;
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (!member) return interaction.reply({ content: 'Участник не найден.', ephemeral: true });
        return interaction.reply({ embeds: [buildProfileEmbed(member)], ephemeral: true });
      }

      if (interaction.commandName === 'warn') {
        if (!canDiscipline(interaction.member)) return interaction.reply({ content: 'Нет доступа.', ephemeral: true });
        const user = interaction.options.getUser('пользователь', true);
        const reason = interaction.options.getString('причина', true);
        const data = ensureMember(user.id);
        data.warns = (data.warns || 0) + 1;
        store.warns.unshift({ userId: user.id, moderatorId: interaction.user.id, reason, createdAt: new Date().toISOString() });
        store.warns = store.warns.slice(0, 200);
        saveStore();

        await sendDisciplineLog(interaction.guild, buildWarnLogEmbed({ targetUser: user, moderatorUser: interaction.user, reason }));
        return interaction.reply({ content: `⚠️ Выговор выдан <@${user.id}>.`, ephemeral: true });
      }

      if (interaction.commandName === 'commend') {
        if (!canDiscipline(interaction.member)) return interaction.reply({ content: 'Нет доступа.', ephemeral: true });
        const user = interaction.options.getUser('пользователь', true);
        const reason = interaction.options.getString('причина', true);
        const data = ensureMember(user.id);
        data.commends = (data.commends || 0) + 1;
        store.commends.unshift({ userId: user.id, moderatorId: interaction.user.id, reason, createdAt: new Date().toISOString() });
        store.commends = store.commends.slice(0, 200);
        saveStore();

        await sendDisciplineLog(interaction.guild, buildCommendLogEmbed({ targetUser: user, moderatorUser: interaction.user, reason }));
        return interaction.reply({ content: `🏅 Похвала выдана <@${user.id}>.`, ephemeral: true });
      }

      if (interaction.commandName === 'ai') {
        const query = interaction.options.getString('запрос', true);
        await interaction.deferReply({ ephemeral: true });
        try {
          const answer = await aiText(
            'Ты помощник семьи на RP-сервере. Отвечай по-русски, кратко, полезно, в стиле игрового помощника. Если просят текст, давай готовый вариант.',
            query
          );
          return interaction.editReply({ content: answer.slice(0, 1900) });
        } catch (e) {
          return interaction.editReply({ content: `AI ошибка: ${e.message}` });
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
        const last = store.cooldowns[interaction.user.id] || 0;
        if (Date.now() - last < APPLICATION_COOLDOWN_MS) {
          return interaction.reply({ content: `Подожди ${Math.ceil((APPLICATION_COOLDOWN_MS - (Date.now() - last)) / 1000)} сек.`, ephemeral: true });
        }
        return interaction.showModal(buildApplyModal());
      }

      if (interaction.customId.startsWith('app_accept:')) {
        if (!canApplications(interaction.member)) return interaction.reply({ content: 'No access.', ephemeral: true });

        const [, applicationId, userId] = interaction.customId.split(':');
        const app = store.applications.find(x => x.id === applicationId);
        if (!app) return interaction.reply({ content: 'Application not found.', ephemeral: true });
        if (isTerminalApplicationStatus(app.status)) {
          return interaction.reply({ content: `Application is already closed with status: ${app.status}.`, ephemeral: true });
        }

        const member = await interaction.guild.members.fetch(userId).catch(() => null);
        if (!member) return interaction.reply({ content: 'User was not found on the server.', ephemeral: true });

        if (APPLICATION_DEFAULT_ROLE) {
          const role = interaction.guild.roles.cache.get(APPLICATION_DEFAULT_ROLE);
          if (role) {
            const added = await member.roles.add(role).then(() => true).catch(() => false);
            if (!added) {
              return interaction.reply({ content: 'Failed to assign the role. Check bot permissions and role position.', ephemeral: true });
            }
          }
        }

        setApplicationStatus(app, 'accepted', interaction.user.id);

        const accepted = EmbedBuilder.from(interaction.message.embeds[0])
          .setColor(0x16a34a)
          .setDescription(`> **Application from <@${userId}>**\n> Status: **Accepted**`)
          .setFooter({ text: `Accepted by: ${interaction.user.username}` });

        await interaction.message.edit({ embeds: [accepted], components: [] });
        await sendAcceptLog(interaction.guild, member, interaction.user, 'Interview', 'Rank 1');
        await doPanelUpdate(false);

        return interaction.reply({ content: `Accepted: <@${userId}> joined the family.`, ephemeral: true });
      }

      if (interaction.customId.startsWith('app_ai:')) {
        if (!canApplications(interaction.member)) return interaction.reply({ content: 'Нет доступа.', ephemeral: true });

        const [, applicationId] = interaction.customId.split(':');
        const app = store.applications.find(x => x.id === applicationId);
        if (!app) return interaction.reply({ content: 'Заявка не найдена.', ephemeral: true });

        await interaction.deferReply({ ephemeral: true });
        try {
          const analysis = await analyzeApplicationAI(app);
          const embed = new EmbedBuilder()
            .setColor(0x3B82F6)
            .setTitle('🤖 AI-анализ заявки')
            .setDescription(analysis.slice(0, 3900))
            .setFooter({ text: `Заявка ${applicationId}` })
            .setTimestamp();

          return interaction.editReply({ embeds: [embed] });
        } catch (e) {
          return interaction.editReply({ content: `AI ошибка: ${e.message}` });
        }
      }

      if (interaction.customId.startsWith('app_review:')) {
        if (!canApplications(interaction.member)) return interaction.reply({ content: 'No access.', ephemeral: true });

        const [, applicationId, userId] = interaction.customId.split(':');
        const app = store.applications.find(x => x.id === applicationId);
        if (!app) return interaction.reply({ content: 'Application not found.', ephemeral: true });
        if (isTerminalApplicationStatus(app.status)) {
          return interaction.reply({ content: `Cannot move a closed application back to review. Current status: ${app.status}.`, ephemeral: true });
        }

        setApplicationStatus(app, 'review', interaction.user.id);

        const review = EmbedBuilder.from(interaction.message.embeds[0])
          .setColor(0x64748b)
          .setDescription(`> **Application from <@${userId}>**\n> Status: **In review**`)
          .setFooter({ text: `Reviewed by: ${interaction.user.username}` });

        await interaction.message.edit({ embeds: [review], components: interaction.message.components });
        return interaction.reply({ content: 'Application moved to in-review status.', ephemeral: true });
      }

      if (interaction.customId.startsWith('app_reject:')) {
        if (!canApplications(interaction.member)) return interaction.reply({ content: 'No access.', ephemeral: true });

        const [, applicationId, userId] = interaction.customId.split(':');
        const app = store.applications.find(x => x.id === applicationId);
        if (!app) return interaction.reply({ content: 'Application not found.', ephemeral: true });
        if (isTerminalApplicationStatus(app.status)) {
          return interaction.reply({ content: `Application is already closed with status: ${app.status}.`, ephemeral: true });
        }

        setApplicationStatus(app, 'rejected', interaction.user.id);

        const rejected = EmbedBuilder.from(interaction.message.embeds[0])
          .setColor(0xEF4444)
          .setDescription(`> **Application from <@${userId}>**\n> Status: **Rejected**`)
          .setFooter({ text: `Rejected by: ${interaction.user.username}` });

        await interaction.message.edit({ embeds: [rejected], components: [] });

        const user = await client.users.fetch(userId).catch(() => null);
        if (user && LOG_CHANNEL_ID) {
          const channel = await fetchTextChannel(interaction.guild, LOG_CHANNEL_ID);
          if (channel) {
            await channel.send({
              embeds: [buildRejectLogEmbed({ user, moderatorUser: interaction.user, reason: 'Rejected by leadership decision' })]
            });
          }
        }

        return interaction.reply({ content: `Rejected: <@${userId}>.`, ephemeral: true });
      }
    }

    if (interaction.isModalSubmit() && interaction.customId === 'family_apply_modal') {
      const sanitized = sanitizeApplicationInput({
        nickname: interaction.fields.getTextInputValue('nickname'),
        age: interaction.fields.getTextInputValue('age'),
        text: interaction.fields.getTextInputValue('text')
      });
      if (sanitized.error) {
        return interaction.reply({ content: sanitized.error, ephemeral: true });
      }

      const { nickname, age, text } = sanitized;

      store.cooldowns[interaction.user.id] = Date.now();
      const applicationId = `${Date.now()}_${interaction.user.id}`;

      store.applications.unshift({
        id: applicationId,
        discordId: interaction.user.id,
        nickname,
        age,
        text,
        status: 'pending',
        createdAt: new Date().toISOString()
      });
      store.applications = store.applications.slice(0, 100);
      saveStore();

      const channel = await fetchTextChannel(interaction.guild, APPLICATIONS_CHANNEL_ID);
      if (channel) {
        await channel.send({
          embeds: [buildApplicationEmbed({ user: interaction.user, nickname, age, text, applicationId, source: 'Заявка' })],
          components: buildApplicationButtons(applicationId, interaction.user.id)
        });
      }

      return interaction.reply({ content: 'Заявка отправлена.', ephemeral: true });
    }
  } catch (e) {
    console.error('Ошибка interactionCreate:', e);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'Произошла ошибка.', ephemeral: true }).catch(() => {});
    }
  }
});

client.login(process.env.TOKEN);
