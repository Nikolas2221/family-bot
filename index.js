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
  PermissionFlagsBits,
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType
} = require('discord.js');

const ROLES = require('./roles');
const DATA_FILE = path.join(__dirname, 'storage.json');

const UPDATE_INTERVAL_MS = Math.max(5000, Number(process.env.UPDATE_INTERVAL_MS || 30000));
const REPORT_INTERVAL_MS = Math.max(3600000, Number(process.env.REPORT_INTERVAL_MS || 604800000));
const APPLICATION_COOLDOWN_MS = Math.max(10000, Number(process.env.APPLICATION_COOLDOWN_MS || 300000));
const INACTIVE_DAYS = Math.max(1, Number(process.env.INACTIVE_DAYS || 7));
const PROBATION_DAYS = Math.max(1, Number(process.env.PROBATION_DAYS || 7));

const FAMILY_TITLE = process.env.FAMILY_TITLE || '🏠 Семья';
const TAG_PREFIX = process.env.TAG_PREFIX || '[FAM]';
const APPLICATION_DEFAULT_ROLE = process.env.APPLICATION_DEFAULT_ROLE || process.env.ROLE_NEWBIE || '';
const GUILD_ID = process.env.GUILD_ID;
const MAIN_CHANNEL_ID = process.env.CHANNEL_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || '';
const APPLICATIONS_CHANNEL_ID = process.env.APPLICATIONS_CHANNEL_ID || MAIN_CHANNEL_ID || '';
const STATS_CHANNEL_ID = process.env.STATS_CHANNEL_ID || MAIN_CHANNEL_ID || '';
const REPORT_CHANNEL_ID = process.env.REPORT_CHANNEL_ID || LOG_CHANNEL_ID || MAIN_CHANNEL_ID || '';
const PROMOTION_LOG_CHANNEL_ID = process.env.PROMOTION_LOG_CHANNEL_ID || LOG_CHANNEL_ID || '';
const BLACKLIST_CHANNEL_ID = process.env.BLACKLIST_CHANNEL_ID || LOG_CHANNEL_ID || '';
const LEADERBOARD_CHANNEL_ID = process.env.LEADERBOARD_CHANNEL_ID || REPORT_CHANNEL_ID || '';
const MANAGER_ROLE_IDS = (process.env.MANAGER_ROLE_IDS || '').split(',').map(x => x.trim()).filter(Boolean);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

function defaultStore() {
  return {
    members: {},
    weekly: {},
    applications: [],
    warns: [],
    commends: [],
    contracts: [],
    logs: [],
    cooldowns: {},
    sessions: {},
    promotions: [],
    blacklisted: [],
    inactive: []
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

function saveStore() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function now() { return Date.now(); }
function isoNow() { return new Date().toISOString(); }

function ensureMember(id) {
  if (!store.members[id]) {
    store.members[id] = {
      discordId: id,
      joinedFamilyAt: null,
      probationUntil: null,
      lastSeenAt: now(),
      messageCount: 0,
      voiceSeconds: 0,
      warns: 0,
      commends: 0,
      contributions: 0,
      nickname: ''
    };
  }
  if (!store.weekly[id]) {
    store.weekly[id] = { messages: 0, voiceSeconds: 0, contributions: 0 };
  }
  return store.members[id];
}

function ensureWeekly(id) {
  if (!store.weekly[id]) store.weekly[id] = { messages: 0, voiceSeconds: 0, contributions: 0 };
  return store.weekly[id];
}

function addLog(type, discordId, moderatorId, details) {
  store.logs.unshift({
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    discordId,
    moderatorId: moderatorId || null,
    details: details || '',
    createdAt: isoNow()
  });
  store.logs = store.logs.slice(0, 1000);
  saveStore();
}

function getFamilyRoleIds() {
  return ROLES.map(r => r.id).filter(Boolean);
}

function memberFamilyRoles(member) {
  const ids = new Set(getFamilyRoleIds());
  return member.roles.cache.filter(r => ids.has(r.id));
}

function hasFamilyRole(member) {
  return memberFamilyRoles(member).size > 0;
}

function isManager(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.ManageRoles)) return true;
  return member.roles.cache.some(r => MANAGER_ROLE_IDS.includes(r.id));
}

function cleanupInactive() {
  store.inactive = store.inactive.filter(x => new Date(x.until).getTime() > now());
  saveStore();
}

function getInactiveEntry(userId) {
  return store.inactive.find(x => x.userId === userId) || null;
}

function isInactiveNow(userId) {
  const row = getInactiveEntry(userId);
  if (!row) return false;
  return new Date(row.until).getTime() > now();
}

function getBlacklistEntry(userId) {
  return store.blacklisted.find(x => x.userId === userId) || null;
}

function isBlacklisted(userId) {
  return !!getBlacklistEntry(userId);
}

function activityScore(id) {
  const m = ensureMember(id);
  return (m.messageCount || 0)
    + Math.floor((m.voiceSeconds || 0) / 60)
    + ((m.contributions || 0) * 5)
    + ((m.commends || 0) * 10)
    - ((m.warns || 0) * 5);
}

function weeklyScore(id) {
  const w = ensureWeekly(id);
  return (w.messages || 0)
    + Math.floor((w.voiceSeconds || 0) / 60)
    + ((w.contributions || 0) * 5);
}

function getStatusEmoji(member) {
  const s = member.presence?.status || 'offline';
  if (s === 'online') return '🟢';
  if (s === 'idle') return '🟡';
  if (s === 'dnd') return '⛔';
  return '⚫';
}

function getStatusWeight(member) {
  const s = member.presence?.status || 'offline';
  if (s === 'online') return 0;
  if (s === 'idle') return 1;
  if (s === 'dnd') return 2;
  return 3;
}

function sortMembers(members) {
  return [...members].sort((a, b) => {
    const byStatus = getStatusWeight(a) - getStatusWeight(b);
    if (byStatus !== 0) return byStatus;
    const byActivity = activityScore(b.id) - activityScore(a.id);
    if (byActivity !== 0) return byActivity;
    return a.displayName.localeCompare(b.displayName, 'ru');
  });
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function fetchTextChannel(guild, channelId) {
  if (!channelId) return null;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return null;
  return channel;
}

async function sendEmbedToChannel(guild, channelId, embed, content = '') {
  const channel = await fetchTextChannel(guild, channelId);
  if (!channel) return;
  await channel.send({ content, embeds: [embed] });
}

async function trySendDM(user, text) {
  try { await user.send(text); } catch {}
}

async function updateNicknameTag(member) {
  if (process.env.AUTO_TAG_ENABLED !== 'true') return;
  if (!hasFamilyRole(member) || member.user.bot || !member.manageable) return;
  const wanted = member.displayName.startsWith(TAG_PREFIX) ? member.displayName : `${TAG_PREFIX} ${member.displayName}`;
  if (wanted !== member.displayName) {
    await member.setNickname(wanted).catch(() => {});
  }
}

function getFamilyRoleObjects(guild) {
  return ROLES
    .map(item => ({ ...item, role: guild.roles.cache.get(item.id) }))
    .filter(x => x.role)
    .sort((a, b) => b.role.position - a.role.position);
}

function buildMainMenuEmbed(member) {
  return new EmbedBuilder()
    .setTitle('🌆 Панель семьи')
    .setColor(0x8B5CF6)
    .setDescription([
      `Добро пожаловать, <@${member.id}>.`,
      '',
      'Выбери раздел управления ниже:',
      '👤 Профиль',
      '📊 Статистика',
      '📨 Заявки',
      isManager(member) ? '⚙️ Управление' : '🔒 Управление доступно руководству'
    ].join('\n'))
    .setFooter({ text: 'RP-меню семьи' })
    .setTimestamp();
}

function buildMainMenuButtons(memberId, manager) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`menu:profile:${memberId}`).setLabel('Профиль').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`menu:stats:${memberId}`).setLabel('Статистика').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`menu:apply:${memberId}`).setLabel('Заявки').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`menu:manage:${memberId}`).setLabel('Управление').setStyle(ButtonStyle.Danger).setDisabled(!manager)
  );
  return [row];
}

function buildProfileEmbed(member) {
  const data = ensureMember(member.id);
  const familyRoles = memberFamilyRoles(member).map(r => `<@&${r.id}>`).join(', ') || 'Нет';
  const probation = data.probationUntil && new Date(data.probationUntil).getTime() > now()
    ? `<t:${Math.floor(new Date(data.probationUntil).getTime()/1000)}:R>`
    : 'Нет';
  const joined = data.joinedFamilyAt ? `<t:${Math.floor(new Date(data.joinedFamilyAt).getTime()/1000)}:R>` : 'Неизвестно';
  const lastSeen = data.lastSeenAt ? `<t:${Math.floor(Number(data.lastSeenAt)/1000)}:R>` : 'Неизвестно';
  const inactive = getInactiveEntry(member.id);
  const inactiveText = inactive ? `до <t:${Math.floor(new Date(inactive.until).getTime()/1000)}:f>\n${inactive.reason || 'без причины'}` : 'Нет';

  return new EmbedBuilder()
    .setTitle(`👤 Досье — ${member.displayName}`)
    .setColor(0x3B82F6)
    .setThumbnail(member.user.displayAvatarURL())
    .addFields(
      { name: 'Статус', value: `${getStatusEmoji(member)} ${member.presence?.status || 'offline'}`, inline: true },
      { name: 'Роли семьи', value: familyRoles, inline: false },
      { name: 'Вступил', value: joined, inline: true },
      { name: 'Испытательный срок', value: probation, inline: true },
      { name: 'Последняя активность', value: lastSeen, inline: true },
      { name: 'Сообщения', value: String(data.messageCount || 0), inline: true },
      { name: 'Голос', value: `${Math.floor((data.voiceSeconds || 0) / 60)} мин`, inline: true },
      { name: 'Вклад', value: String(data.contributions || 0), inline: true },
      { name: 'Выговоры', value: String(data.warns || 0), inline: true },
      { name: 'Похвалы', value: String(data.commends || 0), inline: true },
      { name: 'Активность', value: String(activityScore(member.id)), inline: true },
      { name: 'Неактив', value: inactiveText, inline: false }
    )
    .setTimestamp();
}

function buildLeaderProfileButtons(targetId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`leader:promote:${targetId}`).setLabel('Повысить').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`leader:demote:${targetId}`).setLabel('Понизить').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`leader:warn:${targetId}`).setLabel('Выговор').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`leader:contract:${targetId}`).setLabel('Контракт').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`leader:inactive:${targetId}`).setLabel('Неактив').setStyle(ButtonStyle.Secondary)
    )
  ];
}

function buildManageMenuEmbed() {
  return new EmbedBuilder()
    .setTitle('⚙️ Управление семьёй')
    .setColor(0xEF4444)
    .setDescription([
      'Доступно руководству.',
      '',
      'Разделы:',
      '📜 Логи',
      '⛔ Чёрный список',
      '📈 Повышения',
      '🗂 Архив заявок',
      '🏆 Топ недели'
    ].join('\n'))
    .setTimestamp();
}

function buildManageMenuButtons(userId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`manage:logs:${userId}`).setLabel('Логи').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`manage:blacklist:${userId}`).setLabel('ЧС').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`manage:promotions:${userId}`).setLabel('Повышения').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`manage:applications:${userId}`).setLabel('Архив заявок').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`manage:weekly:${userId}`).setLabel('Топ недели').setStyle(ButtonStyle.Secondary)
    )
  ];
}

async function generateFamilyEmbeds(guild) {
  await guild.members.fetch();
  await guild.roles.fetch();
  cleanupInactive();

  const configured = getFamilyRoleObjects(guild);
  const embeds = [];
  let embed = new EmbedBuilder()
    .setTitle(FAMILY_TITLE)
    .setColor(0x8B5CF6)
    .setDescription('🟢 Онлайн • 🟡 Отошёл • ⛔ Не беспокоить • ⚫ Оффлайн')
    .setTimestamp()
    .setFooter({ text: `Автообновление каждые ${Math.floor(UPDATE_INTERVAL_MS / 1000)} сек.` });

  let totalMembers = 0;
  let fieldsCount = 0;

  for (const item of configured) {
    const members = sortMembers(item.role.members.map(m => m));
    if (!members.length) continue;
    totalMembers += members.length;

    const lines = members.map(m => {
      const inactive = isInactiveNow(m.id) ? ' 🌙неактив' : '';
      const probation = ensureMember(m.id).probationUntil && new Date(ensureMember(m.id).probationUntil).getTime() > now() ? ' ⏳испыт.' : '';
      return `${getStatusEmoji(m)} <@${m.id}> • ${activityScore(m.id)} очк.${inactive}${probation}`;
    });

    const chunks = chunkArray(lines, 15);
    for (let i = 0; i < chunks.length; i++) {
      if (fieldsCount >= 25) {
        embeds.push(embed);
        embed = new EmbedBuilder().setColor(0x8B5CF6).setTimestamp();
        fieldsCount = 0;
      }
      embed.addFields({
        name: i === 0 ? `${item.name} (${members.length})` : `${item.name} — продолжение`,
        value: chunks[i].join('\n'),
        inline: false
      });
      fieldsCount++;
    }
  }

  if (fieldsCount === 0) embed.setDescription('Нет участников в выбранных ролях.');
  embed.setAuthor({ name: `Всего участников: ${totalMembers}` });
  embeds.push(embed);
  return embeds;
}

async function updateFamilyPanel() {
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const channel = await guild.channels.fetch(MAIN_CHANNEL_ID);
    const embeds = await generateFamilyEmbeds(guild);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('family_refresh').setLabel('Обновить').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('family_apply').setLabel('Подать заявку').setStyle(ButtonStyle.Success)
    );

    if (process.env.MESSAGE_ID) {
      try {
        const message = await channel.messages.fetch(process.env.MESSAGE_ID);
        await message.edit({ embeds, components: [row], content: '' });
      } catch {
        const message = await channel.send({ embeds, components: [row], content: '' });
        console.log('Скопируй MESSAGE_ID:', message.id);
      }
    } else {
      const message = await channel.send({ embeds, components: [row], content: '' });
      console.log('Скопируй MESSAGE_ID:', message.id);
    }
  } catch (e) {
    console.error('Ошибка панели семьи:', e);
  }
}

async function updateStatsPanel(guildInput) {
  try {
    const guild = guildInput || await client.guilds.fetch(GUILD_ID);
    await guild.members.fetch();
    cleanupInactive();

    const familyMembers = guild.members.cache.filter(m => hasFamilyRole(m));
    const onlineCount = familyMembers.filter(m => (m.presence?.status || 'offline') !== 'offline').size;
    const inactiveCount = familyMembers.filter(m => isInactiveNow(m.id)).size;

    const leaderboard = [...familyMembers.values()]
      .sort((a, b) => activityScore(b.id) - activityScore(a.id))
      .slice(0, 10)
      .map((m, i) => `${i + 1}. <@${m.id}> — ${activityScore(m.id)} очк.`)
      .join('\n') || 'Нет данных';

    const weak = [...familyMembers.values()]
      .filter(m => !isInactiveNow(m.id))
      .sort((a, b) => activityScore(a.id) - activityScore(b.id))
      .slice(0, 5)
      .map(m => `<@${m.id}> — ${activityScore(m.id)} очк.`)
      .join('\n') || 'Нет';

    const embed = new EmbedBuilder()
      .setTitle('📊 Табель лидера')
      .setColor(0xF59E0B)
      .addFields(
        { name: 'Всего участников', value: String(familyMembers.size), inline: true },
        { name: 'Онлайн', value: String(onlineCount), inline: true },
        { name: 'В неактиве', value: String(inactiveCount), inline: true },
        { name: 'Топ активности', value: leaderboard, inline: false },
        { name: 'Слабый актив', value: weak, inline: false }
      )
      .setTimestamp();

    const channel = await fetchTextChannel(guild, STATS_CHANNEL_ID);
    if (!channel) return;

    if (process.env.STATS_MESSAGE_ID) {
      try {
        const message = await channel.messages.fetch(process.env.STATS_MESSAGE_ID);
        await message.edit({ embeds: [embed], content: '' });
        return;
      } catch {}
    }

    const message = await channel.send({ embeds: [embed], content: '' });
    console.log('Скопируй STATS_MESSAGE_ID:', message.id);
  } catch (e) {
    console.error('Ошибка статистики:', e);
  }
}

async function logPromotion(guild, content) {
  const embed = new EmbedBuilder().setTitle('📈 Журнал повышений').setColor(0x10B981).setDescription(content).setTimestamp();
  await sendEmbedToChannel(guild, PROMOTION_LOG_CHANNEL_ID, embed);
}

async function logBlacklist(guild, content) {
  const embed = new EmbedBuilder().setTitle('⛔ Чёрный список семьи').setColor(0xEF4444).setDescription(content).setTimestamp();
  await sendEmbedToChannel(guild, BLACKLIST_CHANNEL_ID, embed);
}

async function runWeeklyTop(guildInput) {
  const guild = guildInput || await client.guilds.fetch(GUILD_ID);
  await guild.members.fetch();
  const familyMembers = guild.members.cache.filter(m => hasFamilyRole(m));

  const top = [...familyMembers.values()]
    .sort((a, b) => weeklyScore(b.id) - weeklyScore(a.id))
    .slice(0, 10)
    .map((m, i) => `${i + 1}. <@${m.id}> — ${weeklyScore(m.id)} очк.`)
    .join('\n') || 'Нет данных';

  const embed = new EmbedBuilder()
    .setTitle('🏆 Топ недели')
    .setColor(0xFFD700)
    .setDescription(top)
    .setTimestamp();

  const channel = await fetchTextChannel(guild, LEADERBOARD_CHANNEL_ID);
  if (channel) await channel.send({ embeds: [embed] });

  store.weekly = {};
  saveStore();
}

async function runReport(guildInput) {
  const guild = guildInput || await client.guilds.fetch(GUILD_ID);
  await guild.members.fetch();
  cleanupInactive();

  const familyMembers = guild.members.cache.filter(m => hasFamilyRole(m));
  const online = familyMembers.filter(m => (m.presence?.status || 'offline') !== 'offline').size;
  const percent = familyMembers.size ? Math.round((online / familyMembers.size) * 100) : 0;
  const threshold = now() - INACTIVE_DAYS * 24 * 60 * 60 * 1000;

  const inactive = [...familyMembers.values()]
    .filter(m => !isInactiveNow(m.id) && (ensureMember(m.id).lastSeenAt || 0) < threshold)
    .slice(0, 10)
    .map(m => `<@${m.id}>`)
    .join('\n') || 'Нет';

  const expiringProbation = [...familyMembers.values()]
    .filter(m => {
      const p = ensureMember(m.id).probationUntil;
      if (!p) return false;
      const t = new Date(p).getTime();
      return t <= now() + 24 * 60 * 60 * 1000 && t > now();
    })
    .slice(0, 10)
    .map(m => `<@${m.id}>`)
    .join('\n') || 'Нет';

  const embed = new EmbedBuilder()
    .setTitle('📋 Отчёт семьи')
    .setColor(percent >= 80 ? 0x22C55E : 0x3B82F6)
    .addFields(
      { name: 'Онлайн сейчас', value: `${online}/${familyMembers.size} (${percent}%)`, inline: true },
      { name: `Неактивны ${INACTIVE_DAYS}+ дн.`, value: inactive, inline: false },
      { name: 'Испытательный срок заканчивается', value: expiringProbation, inline: false }
    )
    .setTimestamp();

  await sendEmbedToChannel(guild, REPORT_CHANNEL_ID, embed);
  if (percent >= 80) {
    const ch = await fetchTextChannel(guild, REPORT_CHANNEL_ID);
    if (ch) await ch.send('🔥 Сегодня онлайн 80%+ семьи. Отличный актив!');
  }
}

async function registerCommands(guild) {
  const commands = [
    new SlashCommandBuilder().setName('family').setDescription('Открыть RP-меню семьи'),
    new SlashCommandBuilder().setName('familypanel').setDescription('Обновить панель семьи').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
    new SlashCommandBuilder().setName('familystats').setDescription('Обновить табель лидера').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
    new SlashCommandBuilder().setName('apply').setDescription('Подать заявку в семью'),
    new SlashCommandBuilder().setName('applypanel').setDescription('Отправить панель заявок').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
    new SlashCommandBuilder().setName('invite').setDescription('Создать инвайт-запрос').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addUserOption(o => o.setName('пользователь').setDescription('Кого пригласить').setRequired(true))
      .addRoleOption(o => o.setName('роль').setDescription('Роль при одобрении').setRequired(false))
      .addStringOption(o => o.setName('причина').setDescription('Комментарий').setRequired(false)),
    new SlashCommandBuilder().setName('profile').setDescription('Профиль участника')
      .addUserOption(o => o.setName('пользователь').setDescription('Участник').setRequired(true)),
    new SlashCommandBuilder().setName('inactive').setDescription('Выдать неактив')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addUserOption(o => o.setName('пользователь').setDescription('Кому').setRequired(true))
      .addIntegerOption(o => o.setName('дней').setDescription('Сколько дней').setRequired(true))
      .addStringOption(o => o.setName('причина').setDescription('Причина').setRequired(false)),
    new SlashCommandBuilder().setName('blacklist').setDescription('Управление ЧС')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addSubcommand(s => s.setName('add').setDescription('Добавить')
        .addUserOption(o => o.setName('пользователь').setDescription('Кого').setRequired(true))
        .addStringOption(o => o.setName('причина').setDescription('Причина').setRequired(true)))
      .addSubcommand(s => s.setName('remove').setDescription('Убрать')
        .addUserOption(o => o.setName('пользователь').setDescription('Кого').setRequired(true)))
      .addSubcommand(s => s.setName('list').setDescription('Список')),
    new SlashCommandBuilder().setName('promote').setDescription('Повысить участника')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addUserOption(o => o.setName('пользователь').setDescription('Кого').setRequired(true))
      .addRoleOption(o => o.setName('роль').setDescription('Новая роль').setRequired(true)),
    new SlashCommandBuilder().setName('demote').setDescription('Понизить участника')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addUserOption(o => o.setName('пользователь').setDescription('Кого').setRequired(true))
      .addRoleOption(o => o.setName('роль').setDescription('Роль снять').setRequired(true)),
    new SlashCommandBuilder().setName('warn').setDescription('Выдать выговор')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addUserOption(o => o.setName('пользователь').setDescription('Кому').setRequired(true))
      .addStringOption(o => o.setName('причина').setDescription('Причина').setRequired(true)),
    new SlashCommandBuilder().setName('commend').setDescription('Похвалить')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addUserOption(o => o.setName('пользователь').setDescription('Кого').setRequired(true))
      .addStringOption(o => o.setName('причина').setDescription('Причина').setRequired(true)),
    new SlashCommandBuilder().setName('contract').setDescription('Контракты')
      .addSubcommand(s => s.setName('create').setDescription('Создать')
        .addUserOption(o => o.setName('пользователь').setDescription('Кому').setRequired(true))
        .addStringOption(o => o.setName('текст').setDescription('Описание').setRequired(true)))
      .addSubcommand(s => s.setName('list').setDescription('Список'))
      .addSubcommand(s => s.setName('done').setDescription('Завершить')
        .addIntegerOption(o => o.setName('номер').setDescription('Номер').setRequired(true))),
    new SlashCommandBuilder().setName('applications').setDescription('Архив заявок').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
    new SlashCommandBuilder().setName('weeklytop').setDescription('Опубликовать топ недели').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  ].map(x => x.toJSON());

  await guild.commands.set(commands);
}

function canManage(actorMember, targetMember, targetRole) {
  if (actorMember.id === targetMember.id) return { ok: false, reason: 'Нельзя управлять собой.' };
  if (targetRole && actorMember.roles.highest.position <= targetRole.position) return { ok: false, reason: 'Роль выше или равна твоей.' };
  if (actorMember.roles.highest.position <= targetMember.roles.highest.position) return { ok: false, reason: 'У цели роль выше или равна твоей.' };
  return { ok: true };
}

async function applyWarn(guild, user, moderator, reason) {
  const data = ensureMember(user.id);
  data.warns += 1;
  store.warns.unshift({ userId: user.id, moderatorId: moderator.id, reason, createdAt: isoNow() });
  saveStore();
  addLog('warn', user.id, moderator.id, reason);

  await trySendDM(user, `Тебе выдали выговор в семье. Причина: ${reason}`);

  const embed = new EmbedBuilder()
    .setTitle('⚠️ Выговор')
    .setColor(0xEF4444)
    .setDescription(`<@${user.id}> получил выговор.\n**Причина:** ${reason}`)
    .setTimestamp();
  await sendEmbedToChannel(guild, LOG_CHANNEL_ID, embed);

  if (data.warns >= 3) {
    const member = await guild.members.fetch(user.id).catch(() => null);
    if (member) {
      const rolesToRemove = memberFamilyRoles(member).filter(r => r.id !== process.env.ROLE_NEWBIE);
      for (const role of rolesToRemove.values()) {
        await member.roles.remove(role).catch(() => {});
      }
    }
    const autoEmbed = new EmbedBuilder()
      .setTitle('⛔ Автосанкция')
      .setColor(0x7F1D1D)
      .setDescription(`<@${user.id}> достиг 3 выговоров.`)
      .setTimestamp();
    await sendEmbedToChannel(guild, LOG_CHANNEL_ID, autoEmbed);
  }
}

async function postApplication({ guild, user, nickname, age, text, source, inviter, requestedRoleId }) {
  const channel = await fetchTextChannel(guild, APPLICATIONS_CHANNEL_ID);
  if (!channel) return;

  store.applications.unshift({
    id: `${Date.now()}_${user.id}`,
    discordId: user.id,
    nickname,
    age,
    text,
    source,
    inviterId: inviter?.id || null,
    requestedRoleId: requestedRoleId || APPLICATION_DEFAULT_ROLE || null,
    status: 'pending',
    createdAt: isoNow()
  });
  store.applications = store.applications.slice(0, 300);
  saveStore();

  const embed = new EmbedBuilder()
    .setTitle(source === 'invite' ? '📨 Инвайт в семью' : '📝 Заявка в семью')
    .setColor(source === 'invite' ? 0x3B82F6 : 0x22C55E)
    .addFields(
      { name: 'Пользователь', value: `<@${user.id}>`, inline: true },
      { name: 'Ник', value: nickname || 'Не указан', inline: true },
      { name: 'Возраст', value: age || '-', inline: true },
      { name: 'Текст', value: text || 'Нет текста', inline: false },
      { name: 'Статус', value: 'На рассмотрении', inline: true },
      { name: 'Роль при одобрении', value: requestedRoleId ? `<@&${requestedRoleId}>` : 'Не указана', inline: true }
    )
    .setTimestamp();

  if (inviter) {
    embed.addFields({ name: 'Кто инвайтит', value: `<@${inviter.id}>`, inline: true });
  }

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`app:approve:${source}:${user.id}:${requestedRoleId || 'none'}`).setLabel('Одобрить').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`app:reject:${source}:${user.id}:${requestedRoleId || 'none'}`).setLabel('Отклонить').setStyle(ButtonStyle.Danger)
  );

  await channel.send({ embeds: [embed], components: [buttons] });
}

client.on('clientReady', async () => {
  console.log(`Бот запущен как ${client.user.tag}`);
  const guild = await client.guilds.fetch(GUILD_ID);
  await registerCommands(guild);
  await updateFamilyPanel();
  await updateStatsPanel(guild);

  setInterval(async () => {
    await updateFamilyPanel();
    await updateStatsPanel(guild);
  }, UPDATE_INTERVAL_MS);

  setInterval(async () => {
    await runReport(guild);
    await runWeeklyTop(guild);
  }, REPORT_INTERVAL_MS);
});

client.on('messageCreate', message => {
  if (!message.guild || message.author.bot || !message.member || !hasFamilyRole(message.member)) return;
  const data = ensureMember(message.member.id);
  data.messageCount += 1;
  data.lastSeenAt = now();
  data.nickname = message.member.displayName;
  const weekly = ensureWeekly(message.member.id);
  weekly.messages += 1;
  saveStore();
});

client.on('presenceUpdate', (_, p) => {
  const member = p?.member;
  if (!member || !hasFamilyRole(member)) return;
  const data = ensureMember(member.id);
  data.lastSeenAt = now();
  data.nickname = member.displayName;
  saveStore();
});

client.on('voiceStateUpdate', (oldState, newState) => {
  const member = newState.member || oldState.member;
  if (!member || !hasFamilyRole(member)) return;
  const data = ensureMember(member.id);

  if (!oldState.channelId && newState.channelId) {
    store.sessions[member.id] = now();
    saveStore();
  }

  if (oldState.channelId && !newState.channelId) {
    const started = store.sessions[member.id];
    if (started) {
      const sec = Math.floor((now() - started) / 1000);
      data.voiceSeconds += sec;
      data.lastSeenAt = now();
      const weekly = ensureWeekly(member.id);
      weekly.voiceSeconds += sec;
      delete store.sessions[member.id];
      saveStore();
    }
  }
});

client.on('guildMemberAdd', async member => {
  const data = ensureMember(member.id);
  data.lastSeenAt = now();
  data.nickname = member.displayName;
  saveStore();

  if (!hasFamilyRole(member)) return;
  await sendEmbedToChannel(member.guild, LOG_CHANNEL_ID,
    new EmbedBuilder().setTitle('➕ Кто зашёл в семью').setColor(0x22C55E).setDescription(`<@${member.id}> зашёл на сервер и уже состоит в семье.`).setTimestamp()
  );
});

client.on('guildMemberRemove', async member => {
  if (!hasFamilyRole(member)) return;
  await sendEmbedToChannel(member.guild, LOG_CHANNEL_ID,
    new EmbedBuilder().setTitle('➖ Кто вышел из семьи / сервера').setColor(0xEF4444).setDescription(`<@${member.id}> вышел с сервера.`).setTimestamp()
  );
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
  const oldFamily = memberFamilyRoles(oldMember);
  const newFamily = memberFamilyRoles(newMember);

  const oldIds = new Set(oldFamily.map(r => r.id));
  const newIds = new Set(newFamily.map(r => r.id));

  const added = [...newIds].filter(id => !oldIds.has(id)).map(id => newMember.guild.roles.cache.get(id)).filter(Boolean);
  const removed = [...oldIds].filter(id => !newIds.has(id)).map(id => newMember.guild.roles.cache.get(id)).filter(Boolean);

  const data = ensureMember(newMember.id);
  data.lastSeenAt = now();
  data.nickname = newMember.displayName;

  if (!oldFamily.size && newFamily.size && !data.joinedFamilyAt) {
    data.joinedFamilyAt = isoNow();
    data.probationUntil = new Date(now() + PROBATION_DAYS * 24 * 60 * 60 * 1000).toISOString();

    await trySendDM(newMember.user,
      `Ты принят в семью 🎉\nДобро пожаловать.\nИспытательный срок: ${PROBATION_DAYS} дн.\nСледи за активностью и правилами.`
    );
    await updateNicknameTag(newMember);
  }

  saveStore();

  if (!added.length && !removed.length) return;

  if (!oldFamily.size && newFamily.size) {
    await sendEmbedToChannel(newMember.guild, LOG_CHANNEL_ID,
      new EmbedBuilder().setTitle('✅ Кто зашёл в семью').setColor(0x22C55E).setDescription(`<@${newMember.id}> вступил в семью.`).addFields({ name: 'Роли', value: newFamily.map(r => `<@&${r.id}>`).join(', '), inline: false }).setTimestamp()
    );
  }

  if (oldFamily.size && !newFamily.size) {
    await sendEmbedToChannel(newMember.guild, LOG_CHANNEL_ID,
      new EmbedBuilder().setTitle('❌ Кто вышел из семьи').setColor(0xEF4444).setDescription(`<@${newMember.id}> больше не состоит в семье.`).setTimestamp()
    );
  }

  if (added.length) {
    await sendEmbedToChannel(newMember.guild, LOG_CHANNEL_ID,
      new EmbedBuilder().setTitle('🎖 Кто получил роль').setColor(0x3B82F6).setDescription(`<@${newMember.id}> получил: ${added.map(r => `<@&${r.id}>`).join(', ')}`).setTimestamp()
    );
  }

  if (removed.length) {
    await sendEmbedToChannel(newMember.guild, LOG_CHANNEL_ID,
      new EmbedBuilder().setTitle('🗑 Кто потерял роль').setColor(0xF59E0B).setDescription(`<@${newMember.id}> потерял: ${removed.map(r => `<@&${r.id}>`).join(', ')}`).setTimestamp()
    );
  }

  await updateFamilyPanel();
  await updateStatsPanel(newMember.guild);
});

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'family') {
        return interaction.reply({
          embeds: [buildMainMenuEmbed(interaction.member)],
          components: buildMainMenuButtons(interaction.user.id, isManager(interaction.member)),
          ephemeral: true
        });
      }

      if (interaction.commandName === 'familypanel') {
        if (!isManager(interaction.member)) return interaction.reply({ content: 'Нет доступа.', ephemeral: true });
        await updateFamilyPanel();
        return interaction.reply({ content: 'Панель семьи обновлена.', ephemeral: true });
      }

      if (interaction.commandName === 'familystats') {
        if (!isManager(interaction.member)) return interaction.reply({ content: 'Нет доступа.', ephemeral: true });
        await updateStatsPanel(interaction.guild);
        return interaction.reply({ content: 'Табель лидера обновлён.', ephemeral: true });
      }

      if (interaction.commandName === 'applypanel') {
        if (!isManager(interaction.member)) return interaction.reply({ content: 'Нет доступа.', ephemeral: true });

        const channel = await fetchTextChannel(interaction.guild, APPLICATIONS_CHANNEL_ID);
        if (!channel) return interaction.reply({ content: 'Канал заявок не найден.', ephemeral: true });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('family_apply').setLabel('Подать заявку').setStyle(ButtonStyle.Success)
        );

        await channel.send({
          embeds: [new EmbedBuilder().setTitle('📨 Заявки в семью').setColor(0x22C55E).setDescription('Нажми кнопку ниже, чтобы подать заявку.').setTimestamp()],
          components: [row]
        });

        return interaction.reply({ content: 'Панель заявок отправлена.', ephemeral: true });
      }

      if (interaction.commandName === 'apply') {
        if (isBlacklisted(interaction.user.id)) {
          return interaction.reply({ content: 'Ты в чёрном списке семьи.', ephemeral: true });
        }

        const last = store.cooldowns[interaction.user.id] || 0;
        if (now() - last < APPLICATION_COOLDOWN_MS) {
          return interaction.reply({ content: `Подожди ${Math.ceil((APPLICATION_COOLDOWN_MS - (now() - last)) / 1000)} сек.`, ephemeral: true });
        }

        if (store.applications.find(x => x.discordId === interaction.user.id && x.status === 'pending')) {
          return interaction.reply({ content: 'У тебя уже есть активная заявка.', ephemeral: true });
        }

        const modal = new ModalBuilder().setCustomId('family_apply_modal').setTitle('Заявка в семью');
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nickname').setLabel('Ваш ник').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('age').setLabel('Ваш возраст').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('text').setLabel('Почему хотите в семью').setStyle(TextInputStyle.Paragraph).setRequired(true))
        );
        return interaction.showModal(modal);
      }

      if (interaction.commandName === 'invite') {
        if (!isManager(interaction.member)) return interaction.reply({ content: 'Нет доступа.', ephemeral: true });

        const user = interaction.options.getUser('пользователь', true);
        const role = interaction.options.getRole('роль', false);
        const reason = interaction.options.getString('причина', false) || 'Инвайт от руководства';

        if (user.id === interaction.user.id) {
          return interaction.reply({ content: 'Нельзя инвайтить себя.', ephemeral: true });
        }

        if (isBlacklisted(user.id)) {
          return interaction.reply({ content: 'Пользователь в чёрном списке.', ephemeral: true });
        }

        await postApplication({
          guild: interaction.guild,
          user,
          nickname: user.username,
          age: '-',
          text: reason,
          source: 'invite',
          inviter: interaction.user,
          requestedRoleId: role?.id || APPLICATION_DEFAULT_ROLE || ''
        });

        return interaction.reply({ content: 'Инвайт-запрос отправлен.', ephemeral: true });
      }

      if (interaction.commandName === 'profile') {
        const user = interaction.options.getUser('пользователь', true);
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (!member) return interaction.reply({ content: 'Участник не найден.', ephemeral: true });

        return interaction.reply({
          embeds: [buildProfileEmbed(member)],
          components: isManager(interaction.member) ? buildLeaderProfileButtons(member.id) : [],
          ephemeral: true
        });
      }

      if (interaction.commandName === 'inactive') {
        if (!isManager(interaction.member)) return interaction.reply({ content: 'Нет доступа.', ephemeral: true });

        const user = interaction.options.getUser('пользователь', true);
        const days = interaction.options.getInteger('дней', true);
        const reason = interaction.options.getString('причина', false) || 'без причины';
        const until = new Date(now() + days * 24 * 60 * 60 * 1000).toISOString();

        store.inactive = store.inactive.filter(x => x.userId !== user.id);
        store.inactive.push({ userId: user.id, moderatorId: interaction.user.id, until, reason, createdAt: isoNow() });
        saveStore();

        await trySendDM(user, `Тебе выдан неактив на ${days} дн. Причина: ${reason}`);
        await sendEmbedToChannel(interaction.guild, LOG_CHANNEL_ID,
          new EmbedBuilder().setTitle('🌙 Неактив').setColor(0x6366F1).setDescription(`<@${user.id}> в неактиве до <t:${Math.floor(new Date(until).getTime()/1000)}:f>\n**Причина:** ${reason}`).setTimestamp()
        );

        return interaction.reply({ content: `Неактив выдан <@${user.id}>.`, ephemeral: true });
      }

      if (interaction.commandName === 'blacklist') {
        if (!isManager(interaction.member)) return interaction.reply({ content: 'Нет доступа.', ephemeral: true });
        const sub = interaction.options.getSubcommand();

        if (sub === 'add') {
          const user = interaction.options.getUser('пользователь', true);
          const reason = interaction.options.getString('причина', true);

          store.blacklisted = store.blacklisted.filter(x => x.userId !== user.id);
          store.blacklisted.push({ userId: user.id, moderatorId: interaction.user.id, reason, createdAt: isoNow() });
          saveStore();

          await logBlacklist(interaction.guild, `<@${user.id}> добавлен в ЧС.\n**Причина:** ${reason}`);
          return interaction.reply({ content: `Пользователь <@${user.id}> добавлен в ЧС.`, ephemeral: true });
        }

        if (sub === 'remove') {
          const user = interaction.options.getUser('пользователь', true);
          store.blacklisted = store.blacklisted.filter(x => x.userId !== user.id);
          saveStore();

          await logBlacklist(interaction.guild, `<@${user.id}> удалён из ЧС.`);
          return interaction.reply({ content: `Пользователь <@${user.id}> удалён из ЧС.`, ephemeral: true });
        }

        const list = store.blacklisted.slice(0, 20).map((x, i) => `${i + 1}. <@${x.userId}> — ${x.reason}`).join('\n') || 'ЧС пуст';
        return interaction.reply({ embeds: [new EmbedBuilder().setTitle('⛔ Чёрный список').setColor(0xEF4444).setDescription(list).setTimestamp()], ephemeral: true });
      }

      if (interaction.commandName === 'promote') {
        if (!isManager(interaction.member)) return interaction.reply({ content: 'Нет доступа.', ephemeral: true });
        const user = interaction.options.getUser('пользователь', true);
        const role = interaction.options.getRole('роль', true);
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (!member) return interaction.reply({ content: 'Участник не найден.', ephemeral: true });

        const check = canManage(interaction.member, member, role);
        if (!check.ok) return interaction.reply({ content: check.reason, ephemeral: true });

        await member.roles.add(role).catch(() => {});
        await trySendDM(user, `Тебя повысили в семье. Новая роль: ${role.name}`);
        store.promotions.unshift({ userId: user.id, moderatorId: interaction.user.id, roleId: role.id, action: 'promote', createdAt: isoNow() });
        store.promotions = store.promotions.slice(0, 200);
        saveStore();
        await logPromotion(interaction.guild, `<@${interaction.user.id}> повысил <@${user.id}> до <@&${role.id}>.`);
        return interaction.reply({ content: `Роль ${role.name} выдана ${member.displayName}.`, ephemeral: true });
      }

      if (interaction.commandName === 'demote') {
        if (!isManager(interaction.member)) return interaction.reply({ content: 'Нет доступа.', ephemeral: true });
        const user = interaction.options.getUser('пользователь', true);
        const role = interaction.options.getRole('роль', true);
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (!member) return interaction.reply({ content: 'Участник не найден.', ephemeral: true });

        const check = canManage(interaction.member, member, role);
        if (!check.ok) return interaction.reply({ content: check.reason, ephemeral: true });

        await member.roles.remove(role).catch(() => {});
        await trySendDM(user, `Тебя понизили в семье. Снята роль: ${role.name}`);
        store.promotions.unshift({ userId: user.id, moderatorId: interaction.user.id, roleId: role.id, action: 'demote', createdAt: isoNow() });
        store.promotions = store.promotions.slice(0, 200);
        saveStore();
        await logPromotion(interaction.guild, `<@${interaction.user.id}> снял роль <@&${role.id}> с <@${user.id}>.`);
        return interaction.reply({ content: `Роль ${role.name} снята с ${member.displayName}.`, ephemeral: true });
      }

      if (interaction.commandName === 'warn') {
        if (!isManager(interaction.member)) return interaction.reply({ content: 'Нет доступа.', ephemeral: true });
        const user = interaction.options.getUser('пользователь', true);
        const reason = interaction.options.getString('причина', true);
        await applyWarn(interaction.guild, user, interaction.user, reason);
        return interaction.reply({ content: `Выговор выдан <@${user.id}>.`, ephemeral: true });
      }

      if (interaction.commandName === 'commend') {
        if (!isManager(interaction.member)) return interaction.reply({ content: 'Нет доступа.', ephemeral: true });
        const user = interaction.options.getUser('пользователь', true);
        const reason = interaction.options.getString('причина', true);
        const data = ensureMember(user.id);
        data.commends += 1;
        data.contributions += 1;
        const weekly = ensureWeekly(user.id);
        weekly.contributions += 1;
        store.commends.unshift({ userId: user.id, moderatorId: interaction.user.id, reason, createdAt: isoNow() });
        saveStore();
        await trySendDM(user, `Тебя отметили в семье. Причина: ${reason}`);
        await sendEmbedToChannel(interaction.guild, LOG_CHANNEL_ID,
          new EmbedBuilder().setTitle('🏅 Похвала').setColor(0x22C55E).setDescription(`<@${user.id}> получил похвалу.\n**Причина:** ${reason}`).setTimestamp()
        );
        return interaction.reply({ content: `Похвала выдана <@${user.id}>.`, ephemeral: true });
      }

      if (interaction.commandName === 'contract') {
        const sub = interaction.options.getSubcommand();

        if (sub === 'create') {
          if (!isManager(interaction.member)) return interaction.reply({ content: 'Нет доступа.', ephemeral: true });
          const user = interaction.options.getUser('пользователь', true);
          const text = interaction.options.getString('текст', true);
          store.contracts.unshift({
            id: `${Date.now()}_${user.id}`,
            userId: user.id,
            text,
            createdBy: interaction.user.id,
            createdAt: isoNow(),
            status: 'active'
          });
          store.contracts = store.contracts.slice(0, 100);
          saveStore();
          await trySendDM(user, `Тебе назначен контракт семьи: ${text}`);
          return interaction.reply({ content: `Контракт создан для <@${user.id}>.`, ephemeral: true });
        }

        if (sub === 'done') {
          if (!isManager(interaction.member)) return interaction.reply({ content: 'Нет доступа.', ephemeral: true });
          const num = interaction.options.getInteger('номер', true);
          const row = store.contracts[num - 1];
          if (!row) return interaction.reply({ content: 'Контракт не найден.', ephemeral: true });
          row.status = 'done';
          const data = ensureMember(row.userId);
          data.contributions += 2;
          const weekly = ensureWeekly(row.userId);
          weekly.contributions += 2;
          saveStore();
          return interaction.reply({ content: `Контракт #${num} завершён.`, ephemeral: true });
        }

        const list = store.contracts.slice(0, 10).map((c, i) => `${i + 1}. <@${c.userId}> — ${c.text} [${c.status}]`).join('\n') || 'Нет контрактов';
        return interaction.reply({ embeds: [new EmbedBuilder().setTitle('📜 Контракты').setColor(0x10B981).setDescription(list).setTimestamp()], ephemeral: true });
      }

      if (interaction.commandName === 'applications') {
        if (!isManager(interaction.member)) return interaction.reply({ content: 'Нет доступа.', ephemeral: true });
        const list = store.applications.slice(0, 15).map((a, i) => `${i + 1}. <@${a.discordId}> • ${a.status} • ${a.source} • ${String(a.text).slice(0, 50)}`).join('\n') || 'Нет заявок';
        return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🗂 Архив заявок').setColor(0x22C55E).setDescription(list).setTimestamp()], ephemeral: true });
      }

      if (interaction.commandName === 'weeklytop') {
        if (!isManager(interaction.member)) return interaction.reply({ content: 'Нет доступа.', ephemeral: true });
        await runWeeklyTop(interaction.guild);
        return interaction.reply({ content: 'Топ недели опубликован.', ephemeral: true });
      }
    }

    if (interaction.isButton()) {
      if (interaction.customId === 'family_refresh') {
        await interaction.deferReply({ ephemeral: true });
        await updateFamilyPanel();
        await updateStatsPanel(interaction.guild);
        return interaction.editReply({ content: 'Панели обновлены.' });
      }

      if (interaction.customId === 'family_apply' || interaction.customId.startsWith('menu:apply:')) {
        if (isBlacklisted(interaction.user.id)) {
          return interaction.reply({ content: 'Ты в чёрном списке семьи.', ephemeral: true });
        }
        const last = store.cooldowns[interaction.user.id] || 0;
        if (now() - last < APPLICATION_COOLDOWN_MS) {
          return interaction.reply({ content: `Подожди ${Math.ceil((APPLICATION_COOLDOWN_MS - (now() - last)) / 1000)} сек.`, ephemeral: true });
        }
        if (store.applications.find(x => x.discordId === interaction.user.id && x.status === 'pending')) {
          return interaction.reply({ content: 'У тебя уже есть активная заявка.', ephemeral: true });
        }

        const modal = new ModalBuilder().setCustomId('family_apply_modal').setTitle('Заявка в семью');
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nickname').setLabel('Ваш ник').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('age').setLabel('Ваш возраст').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('text').setLabel('Почему хотите в семью').setStyle(TextInputStyle.Paragraph).setRequired(true))
        );
        return interaction.showModal(modal);
      }

      if (interaction.customId.startsWith('menu:')) {
        const [, section, userId] = interaction.customId.split(':');
        if (userId !== interaction.user.id) {
          return interaction.reply({ content: 'Это меню не для тебя.', ephemeral: true });
        }

        if (section === 'profile') {
          const member = interaction.member;
          return interaction.update({
            embeds: [buildProfileEmbed(member)],
            components: isManager(member) ? buildLeaderProfileButtons(member.id) : []
          });
        }

        if (section === 'stats') {
          await interaction.guild.members.fetch();
          const familyMembers = interaction.guild.members.cache.filter(m => hasFamilyRole(m));
          const onlineCount = familyMembers.filter(m => (m.presence?.status || 'offline') !== 'offline').size;
          const leaderboard = [...familyMembers.values()]
            .sort((a, b) => activityScore(b.id) - activityScore(a.id))
            .slice(0, 10)
            .map((m, i) => `${i + 1}. <@${m.id}> — ${activityScore(m.id)} очк.`)
            .join('\n') || 'Нет данных';

          const embed = new EmbedBuilder()
            .setTitle('📊 Статистика семьи')
            .setColor(0xF59E0B)
            .addFields(
              { name: 'Всего участников', value: String(familyMembers.size), inline: true },
              { name: 'Онлайн', value: String(onlineCount), inline: true },
              { name: 'Топ активности', value: leaderboard, inline: false }
            )
            .setTimestamp();

          return interaction.update({ embeds: [embed], components: buildMainMenuButtons(interaction.user.id, isManager(interaction.member)) });
        }

        if (section === 'manage') {
          if (!isManager(interaction.member)) {
            return interaction.reply({ content: 'Нет доступа.', ephemeral: true });
          }
          return interaction.update({ embeds: [buildManageMenuEmbed()], components: buildManageMenuButtons(interaction.user.id) });
        }
      }

      if (interaction.customId.startsWith('manage:')) {
        if (!isManager(interaction.member)) return interaction.reply({ content: 'Нет доступа.', ephemeral: true });
        const [, section] = interaction.customId.split(':');

        if (section === 'logs') {
          const list = store.logs.slice(0, 15).map((x, i) => `${i + 1}. **${x.type}** • <@${x.discordId}> • ${x.details || '—'}`).join('\n') || 'Нет логов';
          return interaction.update({ embeds: [new EmbedBuilder().setTitle('📜 Последние логи').setColor(0x64748B).setDescription(list).setTimestamp()], components: buildManageMenuButtons(interaction.user.id) });
        }

        if (section === 'blacklist') {
          const list = store.blacklisted.slice(0, 20).map((x, i) => `${i + 1}. <@${x.userId}> — ${x.reason}`).join('\n') || 'ЧС пуст';
          return interaction.update({ embeds: [new EmbedBuilder().setTitle('⛔ Чёрный список').setColor(0xEF4444).setDescription(list).setTimestamp()], components: buildManageMenuButtons(interaction.user.id) });
        }

        if (section === 'promotions') {
          const list = store.promotions.slice(0, 15).map((x, i) => `${i + 1}. ${x.action === 'promote' ? '⬆️' : '⬇️'} <@${x.userId}> • <@&${x.roleId}>`).join('\n') || 'Нет записей';
          return interaction.update({ embeds: [new EmbedBuilder().setTitle('📈 Журнал повышений').setColor(0x10B981).setDescription(list).setTimestamp()], components: buildManageMenuButtons(interaction.user.id) });
        }

        if (section === 'applications') {
          const list = store.applications.slice(0, 15).map((a, i) => `${i + 1}. <@${a.discordId}> • ${a.status} • ${a.source}`).join('\n') || 'Нет заявок';
          return interaction.update({ embeds: [new EmbedBuilder().setTitle('🗂 Архив заявок').setColor(0x22C55E).setDescription(list).setTimestamp()], components: buildManageMenuButtons(interaction.user.id) });
        }

        if (section === 'weekly') {
          const guild = interaction.guild;
          await guild.members.fetch();
          const familyMembers = guild.members.cache.filter(m => hasFamilyRole(m));
          const top = [...familyMembers.values()]
            .sort((a, b) => weeklyScore(b.id) - weeklyScore(a.id))
            .slice(0, 10)
            .map((m, i) => `${i + 1}. <@${m.id}> — ${weeklyScore(m.id)} очк.`)
            .join('\n') || 'Нет данных';

          return interaction.update({ embeds: [new EmbedBuilder().setTitle('🏆 Топ недели').setColor(0xFFD700).setDescription(top).setTimestamp()], components: buildManageMenuButtons(interaction.user.id) });
        }
      }

      if (interaction.customId.startsWith('leader:')) {
        if (!isManager(interaction.member)) return interaction.reply({ content: 'Нет доступа.', ephemeral: true });
        const [, action, targetId] = interaction.customId.split(':');
        const member = await interaction.guild.members.fetch(targetId).catch(() => null);
        if (!member) return interaction.reply({ content: 'Участник не найден.', ephemeral: true });

        if (action === 'promote') {
          const role = interaction.guild.roles.cache.get(process.env.ROLE_MEMBER || '');
          if (!role) return interaction.reply({ content: 'ROLE_MEMBER не найден.', ephemeral: true });
          const check = canManage(interaction.member, member, role);
          if (!check.ok) return interaction.reply({ content: check.reason, ephemeral: true });
          await member.roles.add(role).catch(() => {});
          await logPromotion(interaction.guild, `<@${interaction.user.id}> повысил <@${member.id}> до <@&${role.id}>.`);
          return interaction.reply({ content: 'Участник повышен.', ephemeral: true });
        }

        if (action === 'demote') {
          const role = interaction.guild.roles.cache.get(process.env.ROLE_MEMBER || '');
          if (!role) return interaction.reply({ content: 'ROLE_MEMBER не найден.', ephemeral: true });
          const check = canManage(interaction.member, member, role);
          if (!check.ok) return interaction.reply({ content: check.reason, ephemeral: true });
          await member.roles.remove(role).catch(() => {});
          await logPromotion(interaction.guild, `<@${interaction.user.id}> понизил <@${member.id}>.`);
          return interaction.reply({ content: 'Участник понижен.', ephemeral: true });
        }

        if (action === 'warn') {
          await applyWarn(interaction.guild, member.user, interaction.user, 'Выговор через меню лидера');
          return interaction.reply({ content: 'Выговор выдан.', ephemeral: true });
        }

        if (action === 'contract') {
          store.contracts.unshift({
            id: `${Date.now()}_${member.id}`,
            userId: member.id,
            text: 'Контракт через меню лидера',
            createdBy: interaction.user.id,
            createdAt: isoNow(),
            status: 'active'
          });
          store.contracts = store.contracts.slice(0, 100);
          saveStore();
          await trySendDM(member.user, 'Тебе назначен контракт семьи.');
          return interaction.reply({ content: 'Контракт создан.', ephemeral: true });
        }

        if (action === 'inactive') {
          const until = new Date(now() + 7 * 24 * 60 * 60 * 1000).toISOString();
          store.inactive = store.inactive.filter(x => x.userId !== member.id);
          store.inactive.push({ userId: member.id, moderatorId: interaction.user.id, until, reason: 'Через меню лидера', createdAt: isoNow() });
          saveStore();
          return interaction.reply({ content: 'Неактив выдан на 7 дней.', ephemeral: true });
        }
      }

      if (interaction.customId.startsWith('app:')) {
        if (!isManager(interaction.member)) return interaction.reply({ content: 'Нет доступа.', ephemeral: true });

        const [, action, source, userId, roleIdRaw] = interaction.customId.split(':');
        const roleId = roleIdRaw === 'none' ? '' : roleIdRaw;
        const member = await interaction.guild.members.fetch(userId).catch(() => null);
        const app = store.applications.find(x => x.discordId === userId && x.status === 'pending');

        if (action === 'reject') {
          if (app) app.status = 'rejected';
          saveStore();
          const rejected = EmbedBuilder.from(interaction.message.embeds[0])
            .setColor(0xEF4444)
            .setFooter({ text: `Отклонено: ${interaction.user.tag}` });
          await interaction.message.edit({ embeds: [rejected], components: [] });
          if (member) await trySendDM(member.user, 'Твоя заявка в семью отклонена.');
          return interaction.reply({ content: 'Заявка отклонена.', ephemeral: true });
        }

        if (!member) return interaction.reply({ content: 'Пользователь не найден на сервере.', ephemeral: true });

        if (roleId) {
          const role = interaction.guild.roles.cache.get(roleId);
          if (role) await member.roles.add(role).catch(() => {});
        }

        const data = ensureMember(member.id);
        if (!data.joinedFamilyAt) data.joinedFamilyAt = isoNow();
        data.probationUntil = new Date(now() + PROBATION_DAYS * 24 * 60 * 60 * 1000).toISOString();
        saveStore();

        if (app) app.status = 'approved';
        saveStore();

        await updateNicknameTag(member);
        await trySendDM(member.user, `Ты принят в семью 🎉\nИспытательный срок: ${PROBATION_DAYS} дн.`);
        const approved = EmbedBuilder.from(interaction.message.embeds[0])
          .setColor(0x22C55E)
          .setFooter({ text: `Одобрено: ${interaction.user.tag}` });

        await interaction.message.edit({ embeds: [approved], components: [] });
        await updateFamilyPanel();
        return interaction.reply({ content: 'Заявка одобрена, роль выдана.', ephemeral: true });
      }
    }

    if (interaction.isModalSubmit() && interaction.customId === 'family_apply_modal') {
      const nickname = interaction.fields.getTextInputValue('nickname');
      const age = interaction.fields.getTextInputValue('age');
      const text = interaction.fields.getTextInputValue('text');

      store.cooldowns[interaction.user.id] = now();
      saveStore();

      await postApplication({
        guild: interaction.guild,
        user: interaction.user,
        nickname,
        age,
        text,
        source: 'apply',
        requestedRoleId: APPLICATION_DEFAULT_ROLE || ''
      });

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
