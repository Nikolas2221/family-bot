// @ts-nocheck
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const copyModule = require('./copy');
const rawCopy = copyModule.default || copyModule.copy || copyModule;

function repairText(value) {
  const text = String(value ?? '');
  if (!text) return text;
  if (!/[РЁёЎўЂЃџ]/u.test(text) && !text.includes('вЂ') && !text.includes('рџ')) {
    return text;
  }

  let next = text;
  for (let index = 0; index < 2; index += 1) {
    try {
      const repaired = Buffer.from(next, 'latin1').toString('utf8');
      if (!repaired || repaired === next || repaired.includes('\uFFFD')) break;
      next = repaired;
    } catch {
      break;
    }
  }

  return next;
}

function repairCopyValue(value, seen = new WeakMap()) {
  if (typeof value === 'string') {
    return repairText(value);
  }

  if (typeof value === 'function') {
    return function repairedFunction(...args) {
      return repairCopyValue(value.apply(this, args), seen);
    };
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return seen.get(value);
  }

  if (Array.isArray(value)) {
    const output = [];
    seen.set(value, output);
    for (const item of value) {
      output.push(repairCopyValue(item, seen));
    }
    return output;
  }

  const output = {};
  seen.set(value, output);
  for (const [key, nested] of Object.entries(value)) {
    output[key] = repairCopyValue(nested, seen);
  }
  return output;
}

const copy = rawCopy;

const THEME = {
  brand: 0x7c3aed,
  phoenix: 0xf97316,
  ruby: 0xe11d48,
  gold: 0xf59e0b,
  royal: 0x2563eb,
  emerald: 0x10b981,
  warning: 0xf97316,
  slate: 0x334155
};

const BRAND_FOOTER = 'BRHD • Phoenix';

function getStatusEmoji(member) {
  const status = member.presence?.status || 'offline';
  if (status === 'online') return '🟢';
  if (status === 'idle') return '🟡';
  if (status === 'dnd') return '⛔';
  return '⚫';
}

function getStatusLabel(member) {
  const status = member.presence?.status || 'offline';
  if (status === 'online') return 'Онлайн';
  if (status === 'idle') return 'Отошёл';
  if (status === 'dnd') return 'Не беспокоить';
  return 'Оффлайн';
}

function release106StatusEmoji(member) {
  const status = member?.presence?.status || 'offline';
  if (status === 'online') return '🟢';
  if (status === 'idle') return '🟡';
  if (status === 'dnd') return '⛔';
  return '⚫';
}

function release106StatusLabel(member) {
  const status = member?.presence?.status || 'offline';
  if (status === 'online') return 'Онлайн';
  if (status === 'idle') return 'Отошёл';
  if (status === 'dnd') return 'Не беспокоить';
  return 'Оффлайн';
}

function release106FamilySummaryLines(summary = {}) {
  return [
    `Всего участников: ${summary.totalMembers ?? 0}`,
    `С ролями / без ролей: ${summary.membersWithFamilyRoles ?? 0} / ${summary.membersWithoutFamilyRoles ?? 0}`,
    `Заявок на рассмотрении: ${summary.pendingApplications ?? 0}`,
    `AFK-рисков: ${summary.afkRiskCount ?? 0}`,
    `Тариф: ${summary.planLabel || 'Free - 0$'}`,
    `Статусы: 🟢 ${summary.onlineCount ?? 0} • 🟡 ${summary.idleCount ?? 0} • ⛔ ${summary.dndCount ?? 0} • ⚫ ${summary.offlineCount ?? 0}`,
    summary.topMemberLine ? `Топ-1 активности: ${summary.topMemberLine}` : '',
    summary.lastUpdatedLabel ? `Последнее обновление: ${summary.lastUpdatedLabel}` : ''
  ].filter(Boolean);
}

function release106HelpSections(catalog = {}) {
  return [
    { title: copy.help.regularSection || 'Обычные команды', commands: Array.isArray(catalog.regularCommands) ? catalog.regularCommands : [] },
    { title: copy.help.adminSection || 'Команды администрации', commands: Array.isArray(catalog.adminCommands) ? catalog.adminCommands : [] },
    { title: copy.help.premiumRegularSection || 'Обычные команды в Premium', commands: Array.isArray(catalog.premiumRegularCommands) ? catalog.premiumRegularCommands : [] },
    { title: copy.help.premiumAdminSection || 'Админ-команды в Premium', commands: Array.isArray(catalog.premiumAdminCommands) ? catalog.premiumAdminCommands : [] }
  ].filter(item => item.commands.length);
}

function release106BuildHelpEmbed(catalog = {}, page = 0) {
  const sections = release106HelpSections(catalog);
  const totalPages = Math.max(1, sections.length || 1);
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const current = sections[safePage] || { title: 'Команды', commands: [] };

  return card({
    title: `Справка • ${current.title}`,
    color: catalog.plan === 'premium' ? THEME.gold : THEME.brand,
    description: [
      `Тариф: ${catalog.plan === 'premium' ? 'Premium - 5$' : 'Free - 0$'}`,
      `Страница: ${safePage + 1}/${totalPages}`,
      '',
      current.commands.length
        ? current.commands.map(command => copy.help.line(command.name, command.description)).join('\n').slice(0, 4000)
        : (copy.help.none || 'Нет доступных команд для этого раздела.')
    ].join('\n'),
    footer: 'BRHD • Phoenix • Help'
  });
}

function release106BuildHelpPaginationButtons(catalog = {}, page = 0) {
  const sections = release106HelpSections(catalog);
  if (sections.length <= 1) return [];
  const safePage = Math.max(0, Math.min(page, sections.length - 1));

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`help_page:${Math.max(0, safePage - 1)}`)
        .setLabel('Назад')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage === 0),
      new ButtonBuilder()
        .setCustomId(`help_page:${Math.min(sections.length - 1, safePage + 1)}`)
        .setLabel('Вперёд')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(safePage >= sections.length - 1)
    )
  ];
}

function release106PanelButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('family_refresh').setLabel(copy.family.refreshButton || 'Обновить').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('family_profile').setLabel(copy.family.profileButton || 'Профиль').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('family_leaderboard').setLabel(copy.family.leaderboardButton || 'Топ').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('family_voice').setLabel(copy.family.voiceButton || 'Голос').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('family_apply').setLabel(copy.family.applyButton || 'Подать заявку').setStyle(ButtonStyle.Success)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('admin_applications').setLabel(copy.family.adminApplicationsButton || 'Заявки').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('admin_aiadvisor').setLabel(copy.family.adminAiAdvisorButton || 'AI-совет').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('admin_panel').setLabel(copy.family.adminPanelButton || 'Админка').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('admin_blacklist').setLabel(copy.family.adminBlacklistButton || 'ЧС').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('admin_activityreport').setLabel(copy.family.adminReportButton || 'Отчёт').setStyle(ButtonStyle.Secondary)
    )
  ];
}

async function release106BuildFamilyEmbeds(guild, { roles = [], familyTitle, updateIntervalMs = 60000, activityScore = () => 0, summary = {}, imageUrl } = {}) {
  const configuredRoles = roles
    .map(item => ({ ...item, role: guild.roles.cache.get(item.id) }))
    .filter(item => item.role)
    .sort((a, b) => b.role.position - a.role.position);

  const assignedMemberIds = new Set();
  const snapshots = configuredRoles.map(item => {
    const members = Array.from(item.role.members.values())
      .filter(member => !member.user?.bot)
      .filter(member => {
        if (assignedMemberIds.has(member.id)) return false;
        assignedMemberIds.add(member.id);
        return true;
      });

    return { name: item.name, members: sortMembers(members, activityScore) };
  });

  const totalMembers = Array.from(guild.members.cache.values()).filter(member => !member.user?.bot).length;
  const activeRoles = snapshots.filter(item => item.members.length > 0);
  const embed = card({
    title: familyTitle || guild.name,
    color: THEME.brand,
    description: [
      ...release106FamilySummaryLines({
        ...summary,
        totalMembers,
        membersWithFamilyRoles: assignedMemberIds.size,
        membersWithoutFamilyRoles: Math.max(0, totalMembers - assignedMemberIds.size)
      }),
      '',
      `Активных секций: ${activeRoles.length}`,
      `Обновление: каждые ${Math.floor(updateIntervalMs / 1000)} сек.`,
      '',
      copy.family.legend || '🟢 Онлайн • 🟡 Отошёл • ⛔ Не беспокоить • ⚫ Оффлайн'
    ].join('\n'),
    footer: `BRHD • Phoenix • Обновление каждые ${Math.floor(updateIntervalMs / 1000)} сек.`,
    image: imageUrl
  });

  if (!activeRoles.length) {
    embed.addFields(section('Состав', 'Нет участников в выбранных ролях.'));
    return [embed];
  }

  for (const item of activeRoles) {
    embed.addFields(section(
      `${item.name} • ${item.members.length}`,
      item.members.map(member => `${release106StatusEmoji(member)} <@${member.id}> • ${activityScore(member.id)} очк.`).join('\n')
    ));
  }

  return [embed];
}

function release106BuildFamilyMenuEmbed({ imageUrl, summary } = {}) {
  return card({
    title: 'Панель семьи',
    color: THEME.brand,
    description: [
      'Панель семьи в стиле BRHD / Phoenix.',
      '',
      ...release106FamilySummaryLines(summary),
      '',
      '• Обновить - обновить состав, активность и ранги',
      '• Профиль - открыть свой профиль',
      '• Топ - рейтинг по очкам',
      '• Голос - топ по голосовой активности',
      '• Подать заявку - открыть анкету кандидата'
    ].join('\n'),
    footer: 'BRHD • Phoenix • Family Control',
    image: imageUrl
  });
}

function release106BuildProfileEmbed(member, { activityScore = () => 0, memberData = {}, familyRoleIds = [], rankInfo = null } = {}) {
  const familyRoles = member.roles.cache
    .filter(role => familyRoleIds.includes(role.id))
    .map(role => `<@&${role.id}>`)
    .join(', ') || copy.profile.noRoles;

  const currentRoleName = rankInfo?.currentRole?.name || copy.profile.noRoles;
  const autoRankText = !rankInfo?.autoEnabled
    ? copy.ranks.autoDisabled
    : rankInfo?.manualOnly
      ? copy.ranks.manualOnly(currentRoleName)
      : rankInfo?.currentRole && rankInfo?.autoTargetRole && rankInfo.currentRole.id === rankInfo.autoTargetRole.id
        ? copy.ranks.alreadySynced(currentRoleName, rankInfo.score)
        : rankInfo?.currentRole && rankInfo?.autoTargetRole
          ? copy.ranks.autoStatus(rankInfo.autoTargetRole.name, rankInfo.score)
          : copy.ranks.autoUnavailable;

  return card({
    title: copy.profile.title,
    color: THEME.brand,
    description: copy.profile.description(member.id),
    footer: 'BRHD • Phoenix • Profile',
    thumbnail: avatarUrl(member.user)
  }).addFields(
    section('Основное', [`Ник: ${member.displayName}`, `Discord: <@${member.id}>`, `ID: \`${member.id}\``].join('\n')),
    section(copy.profile.fieldRoles, familyRoles),
    section('Активность', [
      `Актив-очки: ${activityScore(member.id)}`,
      `Репутация: ${memberData.points || 0}/100`,
      `Сообщения: ${memberData.messageCount || 0}`,
      `Похвалы: ${memberData.commends || 0}`,
      `Выговоры: ${memberData.warns || 0}`
    ].join('\n'), true),
    section('Голосовые каналы', `Онлайн в голосе: ${hoursFromMinutes(memberData.voiceMinutes || 0)} ч`, true),
    section('Статус и ранг', [`Статус: ${release106StatusEmoji(member)} ${release106StatusLabel(member)}`, `Ранг: ${currentRoleName}`].join('\n'), true),
    section(copy.profile.fieldAutoRank, autoRankText)
  );
}

function release106BuildLeaderboardEmbed(entries, summary = {}) {
  const content = entries.length ? entries.join('\n') : copy.stats.leaderboardEmpty;
  return card({
    title: `${copy.stats.leaderboardTitle} • Phoenix`,
    color: THEME.gold,
    description: [
      copy.stats.leaderboardDescription,
      '',
      `Участников в рейтинге: ${summary.memberCount ?? entries.length}`,
      `Тариф: ${summary.planLabel || 'Premium - 5$'}`,
      `Топ-игрок: ${summary.topLine || 'нет данных'}`
    ].join('\n'),
    footer: 'BRHD • Phoenix • Premium Leaderboard',
    image: summary.imageUrl
  }).addFields(
    section('Сводка', [
      `Средняя репутация: ${summary.averagePoints ?? 0}/100`,
      `Суммарная репутация: ${summary.totalPoints ?? 0}`,
      `Голос семьи: ${summary.totalVoiceHours ?? 0} ч`
    ].join('\n'), true),
    section('Рейтинг', content)
  );
}

function release106BuildVoiceActivityEmbed(entries, summary = {}) {
  const content = entries.length ? entries.join('\n') : copy.stats.voiceEmpty;
  return card({
    title: `${copy.stats.voiceTitle} • Phoenix`,
    color: THEME.royal,
    description: [
      copy.stats.voiceDescription,
      '',
      `Участников в голосовом рейтинге: ${summary.memberCount ?? entries.length}`,
      `Тариф: ${summary.planLabel || 'Premium - 5$'}`,
      `Лидер голоса: ${summary.topLine || 'нет данных'}`
    ].join('\n'),
    footer: 'BRHD • Phoenix • Premium Voice',
    image: summary.imageUrl
  }).addFields(
    section('Сводка', [
      `Суммарно часов: ${summary.totalHours ?? 0} ч`,
      `Среднее на участника: ${summary.averageHours ?? 0} ч`,
      `Репутация ядра: ${summary.totalPoints ?? 0}`
    ].join('\n'), true),
    section('Топ по голосу', content)
  );
}

function release106BuildWelcomeEmbed(member, familyTitle, imageUrl = '', customMessage = '', extras = {}) {
  return card({
    title: `Добро пожаловать в ${familyTitle || 'Phoenix'}`,
    color: THEME.emerald,
    description: [
      customMessage || `Рады видеть тебя в семье **${familyTitle || 'Phoenix'}** на сервере **${member.guild?.name || 'Phoenix'}**.`,
      '',
      extras.rulesChannelId ? `Правила: <#${extras.rulesChannelId}>` : '',
      extras.applicationsChannelId ? `Подача заявки: <#${extras.applicationsChannelId}>` : '',
      extras.verificationEnabled ? 'Подтверди доступ кнопкой ниже, чтобы получить стартовую роль.' : ''
    ].filter(Boolean).join('\n'),
    footer: 'BRHD • Phoenix • Welcome',
    thumbnail: avatarUrl(member.user),
    image: imageUrl
  }).addFields(section('Старт', ['1. Изучи правила сервера', '2. Пройди подтверждение', '3. Открой панель семьи и подай заявку'].join('\n')));
}

function release106BuildReportScheduleEmbed(schedule = {}, channels = {}) {
  const weekly = schedule.weekly || {};
  const monthly = schedule.monthly || {};

  return card({
    title: 'Расписание отчётов',
    color: THEME.royal,
    description: [
      `Weekly: ${weekly.enabled ? 'ON' : 'OFF'}`,
      `Канал weekly: ${weekly.channelId ? `<#${weekly.channelId}>` : (channels.reports ? `<#${channels.reports}>` : 'не задан')}`,
      '',
      `Monthly: ${monthly.enabled ? 'ON' : 'OFF'}`,
      `Канал monthly: ${monthly.channelId ? `<#${monthly.channelId}>` : (channels.reports ? `<#${channels.reports}>` : 'не задан')}`
    ].join('\n'),
    footer: 'BRHD • Phoenix • Reports'
  });
}

function release106ChannelLine(label, value) {
  return `${label}: ${value ? `<#${value}>` : 'не задан'}`;
}

function release106RoleLine(label, value) {
  return `${label}: ${value ? `<@&${value}>` : 'не задана'}`;
}

function release106BuildAdminPanelEmbed({ guildName, record }) {
  const settings = record.settings || {};
  const channels = settings.channels || {};
  const roles = settings.roles || {};
  const visuals = settings.visuals || {};
  const modules = settings.modules || {};
  const automod = settings.automod || {};
  const welcome = settings.welcome || {};
  const verification = settings.verification || {};
  const reportSchedule = settings.reportSchedule || {};
  const reactionRoles = Array.isArray(settings.reactionRoles) ? settings.reactionRoles : [];
  const roleMenus = Array.isArray(settings.roleMenus) ? settings.roleMenus : [];
  const customCommands = Array.isArray(settings.customCommands) ? settings.customCommands : [];
  const isPremium = record.plan === 'premium';
  const planLabel = isPremium ? 'Premium - 5$' : 'Free - 0$';
  const mode = settings.mode || 'hybrid';

  const moduleLines = [
    `Family: ${modules.family ? 'ON' : 'OFF'}`,
    `Applications: ${modules.applications ? 'ON' : 'OFF'}`,
    `Moderation: ${modules.moderation ? 'ON' : 'OFF'}`,
    `Security: ${modules.security ? 'ON' : 'OFF'}`,
    `Analytics: ${modules.analytics ? 'ON' : 'OFF'}`,
    `AI: ${modules.ai ? 'ON' : 'OFF'}`,
    `Welcome: ${modules.welcome ? 'ON' : 'OFF'}`,
    `Automod: ${modules.automod ? 'ON' : 'OFF'}`,
    `Subscriptions: ${modules.subscriptions ? 'ON' : 'OFF'}`,
    `Custom Commands: ${modules.customCommands ? 'ON' : 'OFF'}`,
    `Music: ${modules.music ? 'ON' : 'OFF'}`
  ];

  return card({
    title: 'Панель администратора',
    color: isPremium ? THEME.gold : THEME.brand,
    description: `Сервер: **${guildName}**`,
    footer: 'BRHD • Phoenix • Administration'
  }).addFields(
    section('Статус', [`Тариф: ${planLabel}`, `Setup: ${record.setupCompleted ? 'завершён' : 'ожидает'}`, `Режим: ${mode}`].join('\n'), true),
    section('Каналы', [
      release106ChannelLine('Панель', channels.panel),
      release106ChannelLine('Подача заявки', channels.applications),
      release106ChannelLine('Welcome', channels.welcome),
      release106ChannelLine('Правила', channels.rules),
      release106ChannelLine('Логи', channels.logs),
      release106ChannelLine('Дисциплина', channels.disciplineLogs),
      release106ChannelLine('Апдейты', channels.updates),
      release106ChannelLine('Отчёты', channels.reports),
      release106ChannelLine('Automod', channels.automod)
    ].join('\n')),
    section('Роли', [
      release106RoleLine('Лидер', roles.leader),
      release106RoleLine('Зам', roles.deputy),
      release106RoleLine('Старший', roles.elder),
      release106RoleLine('Участник', roles.member),
      release106RoleLine('Новичок', roles.newbie),
      release106RoleLine('Мут', roles.mute),
      release106RoleLine('Автороль', roles.autorole),
      release106RoleLine('После подтверждения', roles.verification)
    ].join('\n')),
    section('Модули', moduleLines.join('\n')),
    section('Welcome', [`Статус: ${welcome.enabled ? 'ON' : 'OFF'}`, `ЛС: ${welcome.dmEnabled ? 'ON' : 'OFF'}`, `Текст: ${welcome.message ? 'задан' : 'не задан'}`].join('\n'), true),
    section('Verification', [`Статус: ${verification.enabled ? 'ON' : 'OFF'}`, `Анкета: ${verification.questionnaireEnabled ? 'ON' : 'OFF'}`, `Роль: ${verification.roleId ? `<@&${verification.roleId}>` : 'не задана'}`].join('\n'), true),
    section('Role Menus', [`Меню: ${roleMenus.length}`, `Старые reaction roles: ${reactionRoles.length}`].join('\n'), true),
    section('Custom Commands', [`Триггеры: ${customCommands.length}`, `Premium: ${isPremium ? 'ON' : 'OFF'}`].join('\n'), true),
    section('Reports', [`Weekly: ${reportSchedule.weekly?.enabled ? 'ON' : 'OFF'}`, `Канал weekly: ${reportSchedule.weekly?.channelId ? `<#${reportSchedule.weekly.channelId}>` : 'не задан'}`, `Monthly: ${reportSchedule.monthly?.enabled ? 'ON' : 'OFF'}`, `Канал monthly: ${reportSchedule.monthly?.channelId ? `<#${reportSchedule.monthly.channelId}>` : 'не задан'}`].join('\n')),
    section('Automod', [`Инвайты: ${automod.invitesEnabled ? 'ON' : 'OFF'}`, `Ссылки: ${automod.linksEnabled ? 'ON' : 'OFF'}`, `Капс: ${automod.capsEnabled ? `ON (${automod.capsPercent || 75}% / ${automod.capsMinLength || 12}+)` : 'OFF'}`, `Упоминания: ${automod.mentionsEnabled ? `ON (${automod.mentionLimit || 5})` : 'OFF'}`, `Флуд: ${automod.spamEnabled ? `ON (${automod.spamCount || 6} / ${automod.spamWindowSeconds || 8}с)` : 'OFF'}`, `Стоп-слова: ${automod.badWordsEnabled ? `ON (${(automod.badWords || []).length})` : 'OFF'}`, `Наказание: ${automod.actionMode === 'hard' ? 'жёсткое' : 'мягкое'}`].join('\n')),
    section('Баннеры', [`Панель семьи: ${visuals.familyBanner || 'не задан'}`, `Подача заявки: ${visuals.applicationsBanner || 'не задан'}`].join('\n'))
  );
}

module.exports.panelButtons = release106PanelButtons;
module.exports.buildHelpEmbed = release106BuildHelpEmbed;
module.exports.buildHelpPaginationButtons = release106BuildHelpPaginationButtons;
module.exports.buildFamilyEmbeds = release106BuildFamilyEmbeds;
module.exports.buildFamilyMenuEmbed = release106BuildFamilyMenuEmbed;
module.exports.buildProfileEmbed = release106BuildProfileEmbed;
module.exports.buildLeaderboardEmbed = release106BuildLeaderboardEmbed;
module.exports.buildVoiceActivityEmbed = release106BuildVoiceActivityEmbed;
module.exports.buildWelcomeEmbed = release106BuildWelcomeEmbed;
module.exports.buildReportScheduleEmbed = release106BuildReportScheduleEmbed;
module.exports.buildAdminPanelEmbed = release106BuildAdminPanelEmbed;

function statusWeight(member) {
  const status = member.presence?.status || 'offline';
  if (status === 'online') return 0;
  if (status === 'idle') return 1;
  if (status === 'dnd') return 2;
  return 3;
}

function sortMembers(members, activityScore) {
  return [...members].sort((a, b) => {
    const byStatus = statusWeight(a) - statusWeight(b);
    if (byStatus !== 0) return byStatus;

    const byActivity = activityScore(b.id) - activityScore(a.id);
    if (byActivity !== 0) return byActivity;

    return a.displayName.localeCompare(b.displayName, 'ru');
  });
}

function chunk(items, size) {
  const parts = [];
  for (let index = 0; index < items.length; index += size) {
    parts.push(items.slice(index, index + size));
  }
  return parts;
}

function trimValue(value, limit = 1024, fallback = '—') {
  const text = String(value || '').trim();
  if (!text) return fallback;
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function hoursFromMinutes(minutes) {
  return (Math.max(0, Number(minutes) || 0) / 60).toFixed(1);
}

function avatarUrl(user) {
  return typeof user?.displayAvatarURL === 'function' ? user.displayAvatarURL() : null;
}

function card({ title, description, color, footer, thumbnail, author, image }) {
  const embed = new EmbedBuilder().setColor(color).setTitle(title).setTimestamp();

  if (description) embed.setDescription(description);
  embed.setFooter({ text: footer || BRAND_FOOTER });
  if (thumbnail) embed.setThumbnail(thumbnail);
  if (author) embed.setAuthor(author);
  if (image) embed.setImage(image);

  return embed;
}

function section(name, value, inline = false) {
  return {
    name,
    value: trimValue(value),
    inline
  };
}

function roleLine(label, roleId) {
  return `${label}: ${roleId ? `<@&${roleId}>` : 'не задано'}`;
}

function channelLine(label, channelId) {
  return `${label}: ${channelId ? `<#${channelId}>` : 'не задан'}`;
}

function panelButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('family_refresh').setLabel(copy.family.refreshButton).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('family_profile').setLabel(copy.family.profileButton).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('family_leaderboard').setLabel(copy.family.leaderboardButton).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('family_voice').setLabel(copy.family.voiceButton).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('family_apply').setLabel(copy.family.applyButton).setStyle(ButtonStyle.Success)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('admin_applications').setLabel(copy.family.adminApplicationsButton).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('admin_aiadvisor').setLabel(copy.family.adminAiAdvisorButton).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('admin_panel').setLabel(copy.family.adminPanelButton).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('admin_blacklist').setLabel('ЧС').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('admin_activityreport').setLabel(copy.family.adminReportButton).setStyle(ButtonStyle.Secondary)
    )
  ];
}

function buildAiAdvisorModal() {
  const modal = new ModalBuilder().setCustomId('family_aiadvisor_modal').setTitle(copy.family.aiAdvisorModalTitle);
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('aiadvisor_member')
        .setLabel(copy.family.aiAdvisorModalLabel)
        .setPlaceholder(copy.family.aiAdvisorModalPlaceholder)
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
    )
  );
  return modal;
}

function buildSummaryLines(summary = {}) {
  return [
    `**Всего участников:** ${summary.totalMembers ?? 0}`,
    `**С ролями / без ролей:** ${summary.membersWithFamilyRoles ?? 0} / ${summary.membersWithoutFamilyRoles ?? 0}`,
    `**Заявок на рассмотрении:** ${summary.pendingApplications ?? 0}`,
    `**AFK-рисков:** ${summary.afkRiskCount ?? 0}`,
    `**Тариф:** ${summary.planLabel || 'Free — 0$'}`,
    `**Статусы:** 🟢 ${summary.onlineCount ?? 0} • 🟡 ${summary.idleCount ?? 0} • ⛔ ${summary.dndCount ?? 0} • ⚫ ${summary.offlineCount ?? 0}`,
    `**Топ-1 активности:** ${summary.topMemberLine || 'нет данных'}`,
    `**Последнее обновление:** ${summary.lastUpdatedLabel || 'сейчас'}`
  ];
}

function buildFamilyMenuEmbed({ imageUrl, summary } = {}) {
  return card({
    title: copy.family.menuTitle,
    color: THEME.brand,
    description: [
      'Панель семьи v2 в стиле BRHD / Phoenix.',
      '',
      ...buildSummaryLines(summary),
      '',
      `• ${copy.family.refreshButton} — обновить состав, активность и ранги`,
      `• ${copy.family.profileButton} — открыть свой профиль`,
      `• ${copy.family.leaderboardButton} — лидерборд по очкам`,
      `• ${copy.family.voiceButton} — топ по голосовой активности`,
      `• ${copy.family.applyButton} — открыть фирменную анкету кандидата`
    ].join('\n'),
    footer: 'BRHD • Phoenix • Family Control',
    image: imageUrl
  });
}

function buildWelcomeEmbed(member, familyTitle, imageUrl = '', customMessage = '') {
  return card({
    title: 'Добро пожаловать в Phoenix',
    color: THEME.brand,
    description: [
      `<@${member.id}>, ты только что зашёл на сервер **${member.guild.name}**.`,
      '',
      `Если хочешь вступить в **${familyTitle}**, нажми кнопку ниже и отправь заявку.`,
      'Карточка сразу уйдёт руководству на рассмотрение.'
    ].join('\n'),
    footer: 'BRHD • Phoenix • Welcome',
    thumbnail: avatarUrl(member.user),
    image: imageUrl
  }).addFields(
    section('Что дальше', ['1. Открой анкету', '2. Заполни данные', '3. Дождись решения руководства'].join('\n'), false)
  );
}

function buildApplyModal() {
  const modal = new ModalBuilder().setCustomId('family_apply_modal').setTitle(copy.applications.applyModalTitle);
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('nickname').setLabel(copy.applications.applyModalNick).setStyle(TextInputStyle.Short).setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('level').setLabel(copy.applications.applyModalLevel).setStyle(TextInputStyle.Short).setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('inviter').setLabel(copy.applications.applyModalInviter).setStyle(TextInputStyle.Short).setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('discovery').setLabel(copy.applications.applyModalDiscovery).setStyle(TextInputStyle.Short).setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('about')
        .setLabel(copy.applications.applyModalText)
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
    )
  );
  return modal;
}

function buildAcceptModal(applicationId, userId, messageId) {
  const modal = new ModalBuilder()
    .setCustomId(`app_accept_modal:${applicationId}:${userId}:${messageId}`)
    .setTitle(copy.applications.acceptModalTitle);

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('accept_reason')
        .setLabel(copy.applications.acceptModalReason)
        .setPlaceholder(copy.applications.acceptModalReasonPlaceholder)
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('accept_rank')
        .setLabel(copy.applications.acceptModalRank)
        .setPlaceholder(copy.applications.acceptModalRankPlaceholder)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    )
  );

  return modal;
}

function buildApplicationsPanelEmbed({ imageUrl } = {}) {
  return card({
    title: copy.applications.panelTitle,
    color: THEME.brand,
    description: [
      'Премиум-вход в семью в стиле BRHD / Phoenix.',
      '',
      copy.applications.panelDescription,
      '',
      'Как проходит подача:',
      '1. Нажми кнопку ниже',
      '2. Заполни анкету кандидата',
      '3. Руководство получит красивую карточку на рассмотрение'
    ].join('\n'),
    footer: 'BRHD • Phoenix • Applications',
    image: imageUrl
  });
}

function buildApplicationsPanelButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('family_apply').setLabel(copy.family.applyButton).setStyle(ButtonStyle.Success)
    )
  ];
}

function buildRankButtons({ userId, canPromote, canDemote, canAutoSync }) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`rank_promote:${userId}`)
        .setLabel(copy.ranks.promoteButton)
        .setStyle(ButtonStyle.Success)
        .setDisabled(!canPromote),
      new ButtonBuilder()
        .setCustomId(`rank_demote:${userId}`)
        .setLabel(copy.ranks.demoteButton)
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!canDemote),
      new ButtonBuilder()
        .setCustomId(`rank_autosync:${userId}`)
        .setLabel(copy.ranks.autoSyncButton)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!canAutoSync)
    )
  ];
}

function buildApplicationEmbed({ user, nickname, age, text, applicationId, source = copy.applications.source }) {
  const embed = card({
    title: `${copy.applications.embedTitle} • Phoenix Intake`,
    color: THEME.phoenix,
    description: [
      copy.applications.description(source, user.id, copy.applications.statusLabel('review')),
      '',
      'Стильная карточка кандидата для быстрого решения руководства.'
    ].join('\n'),
    footer: 'BRHD • Phoenix • Candidate Card',
    thumbnail: avatarUrl(user)
  });

  return embed.addFields(
    section('Кандидат', [`Пользователь: <@${user.id}>`, `Игровой ник: ${nickname}`, `Возраст: ${age}`].join('\n'), true),
    section('ID анкеты', `\`${applicationId}\``, true),
    section('Текст заявки', text, false)
  );
}

function buildApplicationButtons(applicationId, userId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`app_accept:${applicationId}:${userId}`).setLabel(copy.applications.acceptButton).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`app_ai:${applicationId}:${userId}`).setLabel(copy.applications.aiButton).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`app_review:${applicationId}:${userId}`).setLabel(copy.applications.reviewButton).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`app_reject:${applicationId}:${userId}`).setLabel(copy.applications.rejectButton).setStyle(ButtonStyle.Danger)
    )
  ];
}

function buildAcceptLogEmbed({ member, moderatorUser, reason = copy.applications.acceptReason, rankName = copy.applications.acceptRank }) {
  return card({
    title: copy.logs.acceptTitle,
    color: THEME.emerald,
    description: copy.logs.acceptDescription(moderatorUser.id, member.id),
    footer: 'BRHD • Phoenix • Family Log',
    thumbnail: avatarUrl(member.user)
  }).addFields(
    section(copy.logs.acceptedMember, [`Пользователь: <@${member.id}>`, `Ник: ${member.displayName}`, `ID: \`${member.id}\``].join('\n')),
    section(copy.logs.acceptedBy, [`Пользователь: <@${moderatorUser.id}>`, `Ник: ${moderatorUser.username}`, `ID: \`${moderatorUser.id}\``].join('\n')),
    section(copy.logs.acceptDetails, [`Причина: ${reason}`, `Принят на: ${rankName}`].join('\n'))
  );
}

function buildRejectLogEmbed({ user, moderatorUser, reason = 'Отказ' }) {
  return card({
    title: copy.logs.rejectTitle,
    color: THEME.ruby,
    description: copy.logs.rejectDescription(moderatorUser.id, user.id),
    footer: 'BRHD • Phoenix • Family Log',
    thumbnail: avatarUrl(user)
  }).addFields(
    section(copy.logs.candidate, [`Пользователь: <@${user.id}>`, `ID: \`${user.id}\``].join('\n')),
    section(copy.logs.rejectedBy, [`Пользователь: <@${moderatorUser.id}>`, `ID: \`${moderatorUser.id}\``].join('\n')),
    section(copy.logs.reason, reason)
  );
}

function buildWarnLogEmbed({ targetUser, moderatorUser, reason }) {
  return card({
    title: copy.logs.warnTitle,
    color: THEME.warning,
    description: copy.logs.warnDescription(moderatorUser.id, targetUser.id),
    footer: 'BRHD • Phoenix • Discipline',
    thumbnail: avatarUrl(targetUser)
  }).addFields(
    section(copy.logs.participant, interactiveIdentityBlock(targetUser, targetUser.username), true),
    section(copy.logs.moderator, interactiveIdentityBlock(moderatorUser, moderatorUser.username), true),
    section(copy.logs.reason, reason, false)
  );
}

function buildCommendLogEmbed({ targetUser, moderatorUser, reason }) {
  return card({
    title: copy.logs.commendTitle,
    color: THEME.royal,
    description: copy.logs.commendDescription(moderatorUser.id, targetUser.id),
    footer: 'BRHD • Phoenix • Discipline',
    thumbnail: avatarUrl(targetUser)
  }).addFields(
    section(copy.logs.participant, interactiveIdentityBlock(targetUser, targetUser.username), true),
    section(copy.logs.moderator, interactiveIdentityBlock(moderatorUser, moderatorUser.username), true),
    section(copy.logs.reason, reason, false)
  );
}

function buildWarnLogEmbed({ targetUser, moderatorUser, reason }) {
  return card({
    title: copy.logs.warnTitle,
    color: THEME.warning,
    description: copy.logs.warnDescription(moderatorUser.id, targetUser.id),
    footer: 'BRHD • Phoenix • Discipline',
    thumbnail: avatarUrl(targetUser)
  }).addFields(
    section(copy.logs.participant, `<@${targetUser.id}>\n\`${targetUser.id}\``, true),
    section(copy.logs.moderator, `<@${moderatorUser.id}>\n\`${moderatorUser.id}\``, true),
    section(copy.logs.reason, reason, false)
  );
}

function buildCommendLogEmbed({ targetUser, moderatorUser, reason }) {
  return card({
    title: copy.logs.commendTitle,
    color: THEME.royal,
    description: copy.logs.commendDescription(moderatorUser.id, targetUser.id),
    footer: 'BRHD • Phoenix • Discipline',
    thumbnail: avatarUrl(targetUser)
  }).addFields(
    section(copy.logs.participant, `<@${targetUser.id}>\n\`${targetUser.id}\``, true),
    section(copy.logs.moderator, `<@${moderatorUser.id}>\n\`${moderatorUser.id}\``, true),
    section(copy.logs.reason, reason, false)
  );
}

function buildProfileEmbed(member, { activityScore, memberData, familyRoleIds, rankInfo }) {
  const familyRoles = member.roles.cache
    .filter(role => familyRoleIds.includes(role.id))
    .map(role => `<@&${role.id}>`)
    .join(', ') || copy.profile.noRoles;

  const currentRoleName = rankInfo?.currentRole?.name || copy.profile.noRoles;
  const autoRankText = !rankInfo?.autoEnabled
    ? copy.ranks.autoDisabled
    : rankInfo?.manualOnly
      ? copy.ranks.manualOnly(currentRoleName)
      : rankInfo?.currentRole && rankInfo?.currentRole?.id === rankInfo?.autoTargetRole?.id
        ? copy.ranks.alreadySynced(currentRoleName, rankInfo.score)
        : rankInfo?.currentRole && rankInfo?.autoTargetRole
          ? copy.ranks.autoStatus(rankInfo.autoTargetRole.name, rankInfo.score)
          : copy.ranks.autoUnavailable;

  return card({
    title: copy.profile.title,
    color: THEME.brand,
    description: copy.profile.description(member.id),
    footer: 'BRHD • Phoenix • Profile',
    thumbnail: avatarUrl(member.user)
  }).addFields(
    section('Основное', [`Ник: ${member.displayName}`, `Discord: <@${member.id}>`, `ID: \`${member.id}\``].join('\n'), false),
    section(copy.profile.fieldRoles, familyRoles, false),
    section(
      'Активность',
      [
        `Актив-очки: ${activityScore(member.id)}`,
        `Репутация: ${memberData.points || 0}/100`,
        `Сообщения: ${memberData.messageCount || 0}`,
        `Похвалы: ${memberData.commends || 0}`,
        `Выговоры: ${memberData.warns || 0}`
      ].join('\n'),
      true
    ),
    section('Голосовые каналы', `Онлайн в голосе: ${hoursFromMinutes(memberData.voiceMinutes || 0)} ч`, true),
    section('Статус и ранг', [`Статус: ${getStatusEmoji(member)} ${getStatusLabel(member)}`, `Ранг: ${currentRoleName}`].join('\n'), true),
    section(copy.profile.fieldAutoRank, autoRankText, false)
  );
}

function buildLeaderboardEmbed(entries) {
  const content = entries.length ? entries.join('\n') : copy.stats.leaderboardEmpty;

  return card({
    title: copy.stats.leaderboardTitle,
    color: THEME.gold,
    description: copy.stats.leaderboardDescription,
    footer: 'BRHD • Phoenix • Leaderboard'
  }).addFields(section('Рейтинг', content, false));
}

function buildVoiceActivityEmbed(entries) {
  const content = entries.length ? entries.join('\n') : copy.stats.voiceEmpty;

  return card({
    title: copy.stats.voiceTitle,
    color: THEME.royal,
    description: copy.stats.voiceDescription,
    footer: 'BRHD • Phoenix • Voice Activity'
  }).addFields(section('Топ по голосу', content, false));
}

function buildApplicationsListEmbed(applications) {
  const lines = applications.length
    ? applications.map((application, index) => copy.list.line(index, application)).join('\n')
    : copy.list.empty;

  return card({
    title: copy.list.title,
    color: THEME.phoenix,
    description: applications.length ? `Всего последних заявок: ${applications.length}` : 'Пока заявок нет.',
    footer: 'BRHD • Phoenix • Applications Feed'
  }).addFields(section('Последние заявки', lines, false));
}

function buildBlacklistEmbed(entries) {
  const lines = entries.length
    ? entries.map((entry, index) => copy.security.blacklistLine(index, entry)).join('\n')
    : copy.security.blacklistEmpty;

  return card({
    title: copy.security.blacklistTitle,
    color: THEME.ruby,
    description: entries.length ? `Записей в чёрном списке: ${entries.length}` : 'Чёрный список пуст.',
    footer: 'BRHD • Phoenix • Security'
  }).addFields(section('Список', lines, false));
}

function buildBanListEmbed(entries) {
  const lines = entries.length
    ? entries.map((entry, index) => copy.security.banListLine(index, entry)).join('\n')
    : copy.security.banListEmpty;

  return card({
    title: copy.security.banListTitle,
    color: THEME.ruby,
    description: 'Текущий список банов Discord-сервера.',
    footer: 'BRHD • Phoenix • Bans'
  }).addFields(section('Забаненные пользователи', lines, false));
}

function buildAdminPanelEmbed({ guildName, record }) {
  const isPremium = record.plan === 'premium';
  const planLabel = isPremium ? copy.admin.panelPremium : copy.admin.panelFree;

  return card({
    title: copy.admin.panelTitle,
    color: isPremium ? THEME.gold : THEME.brand,
    description: `Сервер: **${guildName}**`,
    footer: 'BRHD • Phoenix • Administration'
  }).addFields(
    section('Статус', [`План: ${planLabel}`, `Setup: ${record.setupCompleted ? copy.admin.panelSetupDone : copy.admin.panelSetupPending}`].join('\n'), true),
    section('Возможности', copy.admin.panelFeatures(record.plan), true),
    section(
      copy.admin.panelFieldChannels,
      [
        channelLine('Панель', record.settings.channels.panel),
        channelLine('Заявки', record.settings.channels.applications),
        channelLine('Логи', record.settings.channels.logs),
        channelLine('Дисциплина', record.settings.channels.disciplineLogs)
      ].join('\n'),
      false
    ),
    section(
      copy.admin.panelFieldRoles,
      [
        roleLine('Лидер', record.settings.roles.leader),
        roleLine('Зам', record.settings.roles.deputy),
        roleLine('Старший', record.settings.roles.elder),
        roleLine('Участник', record.settings.roles.member),
        roleLine('Новичок', record.settings.roles.newbie)
      ].join('\n'),
      false
    ),
    section(
      copy.admin.panelFieldVisuals,
      [
        copy.admin.visualLine('Панель семьи', record.settings.visuals?.familyBanner),
        copy.admin.visualLine('Подача заявки', record.settings.visuals?.applicationsBanner)
      ].join('\n'),
      false
    )
  );
}

function buildHelpEmbed({ plan, availableCommands, premiumCommands }) {
  return card({
    title: copy.help.title(plan),
    color: plan === 'premium' ? THEME.gold : THEME.brand,
    description: plan === 'premium' ? 'Открыт полный набор команд.' : 'Показываю доступные команды для текущего тарифа.',
    footer: 'BRHD • Phoenix • Commands'
  }).addFields(
    section(copy.help.freeSection, availableCommands.map(command => copy.help.line(command.name, command.description)).join('\n')),
    section(
      copy.help.premiumSection,
      premiumCommands.length ? premiumCommands.map(command => copy.help.line(command.name, command.description)).join('\n') : copy.debugConfig.none
    )
  );
}

function joinSectionLines(lines) {
  return lines && lines.length ? trimValue(lines.join('\n')) : copy.debugConfig.none;
}

function buildDebugConfigEmbed({ summaryLines, validation }) {
  const hasErrors = validation.errors.length > 0;
  const hasWarnings = validation.warnings.length > 0;

  return card({
    title: hasErrors ? copy.debugConfig.titleError : hasWarnings ? copy.debugConfig.titleWarn : copy.debugConfig.titleOk,
    color: hasErrors ? THEME.ruby : hasWarnings ? THEME.gold : THEME.brand,
    description: 'Текущая диагностика конфигурации сервера и бота.',
    footer: `BRHD • Phoenix • ${copy.debugConfig.footer}`
  }).addFields(
    { name: copy.debugConfig.summaryField, value: joinSectionLines(summaryLines), inline: false },
    { name: copy.debugConfig.notesField, value: joinSectionLines(validation.notes), inline: false },
    { name: copy.debugConfig.warningsField, value: joinSectionLines(validation.warnings), inline: false },
    { name: copy.debugConfig.errorsField, value: joinSectionLines(validation.errors), inline: false }
  );
}

async function buildFamilyEmbeds(guild, { roles, familyTitle, updateIntervalMs, activityScore, summary, imageUrl }) {
  const configuredRoles = roles
    .map(item => ({ ...item, role: guild.roles.cache.get(item.id) }))
    .filter(item => item.role)
    .sort((a, b) => b.role.position - a.role.position);

  const assignedMemberIds = new Set();
  const roleSnapshots = configuredRoles.map(item => {
    const uniqueMembers = Array.from(item.role.members.values())
      .filter(member => {
        if (assignedMemberIds.has(member.id)) {
          return false;
        }

        assignedMemberIds.add(member.id);
        return true;
      });

    return {
      ...item,
      members: sortMembers(uniqueMembers, activityScore)
    };
  });

  const totalMembers = Array.from(guild.members.cache.values()).filter(member => !member.user?.bot).length;
  const membersWithFamilyRoles = assignedMemberIds.size;
  const membersWithoutFamilyRoles = Math.max(0, totalMembers - membersWithFamilyRoles);
  const activeRoles = roleSnapshots.filter(item => item.members.length);
  const embeds = [];
  let currentEmbed = card({
    title: familyTitle,
    color: THEME.brand,
    description: [
      ...buildSummaryLines({
        ...summary,
        totalMembers,
        membersWithFamilyRoles,
        membersWithoutFamilyRoles
      }),
      '',
      `**Активных секций:** ${activeRoles.length}`,
      `**Обновление:** каждые ${Math.floor(updateIntervalMs / 1000)} сек.`,
      '',
      copy.family.legend
    ].join('\n'),
    footer: `BRHD • Phoenix • ${copy.family.updateInterval(Math.floor(updateIntervalMs / 1000))}`,
    image: imageUrl
  });
  let fieldCount = 0;

  if (!activeRoles.length) {
    currentEmbed.addFields(section('Состав', copy.family.emptyMembers, false));
    return [currentEmbed];
  }

  for (const item of activeRoles) {
    const lines = item.members.map(member => `${getStatusEmoji(member)} <@${member.id}> • ${copy.family.points(activityScore(member.id))}`);
    const parts = chunk(lines, 15);

    for (let index = 0; index < parts.length; index += 1) {
      if (fieldCount >= 25) {
        embeds.push(currentEmbed);
        currentEmbed = card({
          title: `${familyTitle} • продолжение`,
          color: THEME.slate,
          description: 'Продолжение состава семьи.',
          footer: `BRHD • Phoenix • ${copy.family.updateInterval(Math.floor(updateIntervalMs / 1000))}`
        });
        fieldCount = 0;
      }

      currentEmbed.addFields(
        section(index === 0 ? `${item.name} • ${item.members.length}` : `${item.name} • продолжение`, parts[index].join('\n'), false)
      );
      fieldCount += 1;
    }
  }

  embeds.push(currentEmbed);
  return embeds;
}

function buildLeaderboardEmbed(entries, summary = {}) {
  const content = entries.length ? entries.join('\n') : copy.stats.leaderboardEmpty;

  return card({
    title: `${copy.stats.leaderboardTitle} • Phoenix`,
    color: THEME.gold,
    description: [
      'Премиальный срез репутации семьи в стиле BRHD / Phoenix.',
      '',
      `**Участников в рейтинге:** ${summary.memberCount ?? entries.length}`,
      `**Тариф:** ${summary.planLabel || 'Premium — 5$'}`,
      `**Топ-игрок:** ${summary.topLine || 'нет данных'}`
    ].join('\n'),
    footer: 'BRHD • Phoenix • Premium Leaderboard',
    image: summary.imageUrl
  }).addFields(
    section(
      'Сводка',
      [
        `Средняя репутация: ${summary.averagePoints ?? 0}/100`,
        `Суммарная репутация: ${summary.totalPoints ?? 0}`,
        `Голос семьи: ${summary.totalVoiceHours ?? 0} ч`
      ].join('\n'),
      true
    ),
    section('Рейтинг', content, false)
  );
}

function buildVoiceActivityEmbed(entries, summary = {}) {
  const content = entries.length ? entries.join('\n') : copy.stats.voiceEmpty;

  return card({
    title: `${copy.stats.voiceTitle} • Phoenix`,
    color: THEME.royal,
    description: [
      'Премиальный мониторинг голосовой активности семьи.',
      '',
      `**Участников в голосовом рейтинге:** ${summary.memberCount ?? entries.length}`,
      `**Тариф:** ${summary.planLabel || 'Premium — 5$'}`,
      `**Лидер голоса:** ${summary.topLine || 'нет данных'}`
    ].join('\n'),
    footer: 'BRHD • Phoenix • Premium Voice',
    image: summary.imageUrl
  }).addFields(
    section(
      'Сводка',
      [
        `Суммарно часов: ${summary.totalHours ?? 0} ч`,
        `Среднее на участника: ${summary.averageHours ?? 0} ч`,
        `Репутация ядра: ${summary.totalPoints ?? 0}`
      ].join('\n'),
      true
    ),
    section('Топ по голосу', content, false)
  );
}

function buildApplicationEmbed({
  user,
  nickname,
  level = '',
  inviter = '',
  discovery = '',
  about = '',
  age = '',
  text = '',
  applicationId,
  source = copy.applications.source
}) {
  const normalizedLevel = level || age || 'не указано';
  const normalizedAbout = about || text || 'не указано';
  const embed = card({
    title: `${copy.applications.embedTitle} • Phoenix Intake`,
    color: THEME.phoenix,
    description: [
      copy.applications.description(source, user.id, copy.applications.statusLabel('review')),
      '',
      'Стильная карточка кандидата для быстрого решения руководства.'
    ].join('\n'),
    footer: 'BRHD • Phoenix • Candidate Card',
    thumbnail: avatarUrl(user)
  });

  return embed.addFields(
    section('Кандидат', [`Пользователь: <@${user.id}>`, `Ник в игре: ${nickname}`, `Лвл: ${normalizedLevel}`].join('\n'), true),
    section(copy.applications.fieldInvite, [`Кто дал инвайт: ${inviter || 'не указано'}`, `Откуда узнали: ${discovery || 'не указано'}`].join('\n'), true),
    section('ID анкеты', `\`${applicationId}\``, true),
    section(copy.applications.fieldText, normalizedAbout, false)
  );
}

function buildApplicationButtons(applicationId, userId, { closed = false } = {}) {
  const rows = [];

  if (!closed) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`app_accept:${applicationId}:${userId}`).setLabel(copy.applications.acceptButton).setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`app_ai:${applicationId}:${userId}`).setLabel(copy.applications.aiButton).setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`app_review:${applicationId}:${userId}`).setLabel(copy.applications.reviewButton).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`app_reject:${applicationId}:${userId}`).setLabel(copy.applications.rejectButton).setStyle(ButtonStyle.Danger)
      )
    );
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`app_close:${applicationId}:${userId}`).setLabel(copy.applications.closeTicketButton).setStyle(ButtonStyle.Secondary)
    )
  );

  return rows;
}

function buildAdminPanelEmbed({ guildName, record }) {
  const isPremium = record.plan === 'premium';
  const planLabel = isPremium ? copy.admin.panelPremium : copy.admin.panelFree;

  return card({
    title: copy.admin.panelTitle,
    color: isPremium ? THEME.gold : THEME.brand,
    description: `Сервер: **${guildName}**`,
    footer: 'BRHD • Phoenix • Administration'
  }).addFields(
    section('Статус', [`План: ${planLabel}`, `Setup: ${record.setupCompleted ? copy.admin.panelSetupDone : copy.admin.panelSetupPending}`].join('\n'), true),
    section('Возможности', copy.admin.panelFeatures(record.plan), true),
    section(
      copy.admin.panelFieldChannels,
      [
        channelLine('Панель', record.settings.channels.panel),
        channelLine('Заявки', record.settings.channels.applications),
        channelLine('Логи', record.settings.channels.logs),
        channelLine('Дисциплина', record.settings.channels.disciplineLogs)
      ].join('\n'),
      false
    ),
    section(
      copy.admin.panelFieldRoles,
      [
        roleLine('Лидер', record.settings.roles.leader),
        roleLine('Зам', record.settings.roles.deputy),
        roleLine('Старший', record.settings.roles.elder),
        roleLine('Участник', record.settings.roles.member),
        roleLine('Новичок', record.settings.roles.newbie),
        roleLine('Мут', record.settings.roles.mute)
      ].join('\n'),
      false
    ),
    section(
      copy.admin.panelFieldVisuals,
      [
        copy.admin.visualLine('Панель семьи', record.settings.visuals?.familyBanner),
        copy.admin.visualLine('Подача заявки', record.settings.visuals?.applicationsBanner)
      ].join('\n'),
      false
    )
  );
}

function interactiveIdentityBlock(user, nickname = '') {
  return [
    `Пользователь: <@${user.id}>`,
    nickname ? `Ник: ${nickname}` : null,
    `ID: \`${user.id}\` • Профиль: <@${user.id}>`
  ].filter(Boolean).join('\n');
}

function buildAcceptLogEmbed({ member, moderatorUser, reason = copy.applications.acceptReason, rankName = copy.applications.acceptRank }) {
  return card({
    title: copy.logs.acceptTitle,
    color: THEME.emerald,
    description: copy.logs.acceptDescription(moderatorUser.id, member.id),
    footer: 'BRHD • Phoenix • Family Log',
    thumbnail: avatarUrl(member.user)
  }).addFields(
    section(copy.logs.acceptedMember, interactiveIdentityBlock(member, member.displayName)),
    section(copy.logs.acceptedBy, interactiveIdentityBlock(moderatorUser, moderatorUser.username)),
    section(copy.logs.acceptDetails, [`Причина: ${reason}`, `Принят на: ${rankName}`].join('\n'))
  );
}

function buildRejectLogEmbed({ user, moderatorUser, reason = 'Отказ' }) {
  return card({
    title: copy.logs.rejectTitle,
    color: THEME.ruby,
    description: copy.logs.rejectDescription(moderatorUser.id, user.id),
    footer: 'BRHD • Phoenix • Family Log',
    thumbnail: avatarUrl(user)
  }).addFields(
    section(copy.logs.candidate, interactiveIdentityBlock(user)),
    section(copy.logs.rejectedBy, interactiveIdentityBlock(moderatorUser, moderatorUser.username)),
    section(copy.logs.reason, reason)
  );
}

function buildHelpEmbed({ plan, regularCommands = [], adminCommands = [], premiumRegularCommands = [], premiumAdminCommands = [] }) {
  return card({
    title: copy.help.title(plan),
    color: plan === 'premium' ? THEME.gold : THEME.brand,
    description: plan === 'premium'
      ? 'Открыт полный набор команд текущего тарифа.'
      : 'Показываю команды отдельно для обычных участников и администрации.',
    footer: 'BRHD • Phoenix • Commands'
  }).addFields(
    section(
      copy.help.regularSection,
      regularCommands.length ? regularCommands.map(command => copy.help.line(command.name, command.description)).join('\n') : copy.help.none
    ),
    section(
      copy.help.adminSection,
      adminCommands.length ? adminCommands.map(command => copy.help.line(command.name, command.description)).join('\n') : copy.help.none
    ),
    section(
      copy.help.premiumRegularSection,
      premiumRegularCommands.length ? premiumRegularCommands.map(command => copy.help.line(command.name, command.description)).join('\n') : copy.debugConfig.none
    ),
    section(
      copy.help.premiumAdminSection,
      premiumAdminCommands.length ? premiumAdminCommands.map(command => copy.help.line(command.name, command.description)).join('\n') : copy.debugConfig.none
    )
  );
}

function buildAdminPanelEmbed({ guildName, record }) {
  const isPremium = record.plan === 'premium';
  const planLabel = isPremium ? copy.admin.panelPremium : copy.admin.panelFree;
  const modules = record.settings.modules || {};
  const mode = record.settings.mode || 'hybrid';
  const automod = record.settings.automod || {};
  const moduleLines = [
    `Family: ${modules.family ? 'ON' : 'OFF'}`,
    `Applications: ${modules.applications ? 'ON' : 'OFF'}`,
    `Moderation: ${modules.moderation ? 'ON' : 'OFF'}`,
    `Security: ${modules.security ? 'ON' : 'OFF'}`,
    `Analytics: ${modules.analytics ? 'ON' : 'OFF'}`,
    `AI: ${modules.ai ? 'ON' : 'OFF'}`,
    `Welcome: ${modules.welcome ? 'ON' : 'OFF'}`,
    `Automod: ${modules.automod ? 'ON' : 'OFF'}`,
    `Subscriptions: ${modules.subscriptions ? 'ON' : 'OFF'}`,
    `Custom Commands: ${modules.customCommands ? 'ON' : 'OFF'}`,
    `Music: ${modules.music ? 'ON' : 'OFF'}`
  ];

  return card({
    title: copy.admin.panelTitle,
    color: isPremium ? THEME.gold : THEME.brand,
    description: `Сервер: **${guildName}**`,
    footer: 'BRHD • Phoenix • Administration'
  }).addFields(
    section('Статус', [`План: ${planLabel}`, `Setup: ${record.setupCompleted ? copy.admin.panelSetupDone : copy.admin.panelSetupPending}`, `Режим: ${mode}`].join('\n'), true),
    section('Возможности', copy.admin.panelFeatures(record.plan), true),
    section(
      copy.admin.panelFieldChannels,
      [
        channelLine('Панель', record.settings.channels.panel),
        channelLine('Подача заявки', record.settings.channels.applications),
        channelLine('Логи', record.settings.channels.logs),
        channelLine('Дисциплина', record.settings.channels.disciplineLogs),
        channelLine('Апдейты', record.settings.channels.updates)
      ].join('\n'),
      false
    ),
    section(
      copy.admin.panelFieldRoles,
      [
        roleLine('Лидер', record.settings.roles.leader),
        roleLine('Зам', record.settings.roles.deputy),
        roleLine('Старший', record.settings.roles.elder),
        roleLine('Участник', record.settings.roles.member),
        roleLine('Новичок', record.settings.roles.newbie),
        roleLine('Мут', record.settings.roles.mute)
      ].join('\n'),
      false
    ),
    section('Модули', moduleLines.join('\n'), false),
    section(
      'Automod',
      [
        `Инвайты: ${automod.invitesEnabled ? 'ON' : 'OFF'}`,
        `Ссылки: ${automod.linksEnabled ? 'ON' : 'OFF'}`,
        `Капс: ${automod.capsEnabled ? `ON (${automod.capsPercent || 75}% / ${automod.capsMinLength || 12}+ букв)` : 'OFF'}`,
        `Упоминания: ${automod.mentionsEnabled ? `ON (${automod.mentionLimit || 5})` : 'OFF'}`,
        `Флуд: ${automod.spamEnabled ? `ON (${automod.spamCount || 6} / ${automod.spamWindowSeconds || 8}с)` : 'OFF'}`,
        `Стоп-слова: ${automod.badWordsEnabled ? `ON (${(automod.badWords || []).length})` : 'OFF'}`
      ].join('\n'),
      false
    ),
    section(
      copy.admin.panelFieldVisuals,
      [
        copy.admin.visualLine('Панель семьи', record.settings.visuals?.familyBanner),
        copy.admin.visualLine('Подача заявки', record.settings.visuals?.applicationsBanner)
      ].join('\n'),
      false
    )
  );
}

function buildAutomodStatusEmbed(config = {}) {
  const settings = config || {};
  return card({
    title: '🛡️ Automod',
    color: THEME.ruby,
    description: 'Настройки автоматической модерации сервера.',
    footer: 'BRHD • Phoenix • Automod'
  }).addFields(
    section('Базовые правила', [
      `Инвайты: ${settings.invitesEnabled ? 'ON' : 'OFF'}`,
      `Ссылки: ${settings.linksEnabled ? 'ON' : 'OFF'}`,
      `Капс: ${settings.capsEnabled ? 'ON' : 'OFF'}`,
      `Упоминания: ${settings.mentionsEnabled ? 'ON' : 'OFF'}`
    ].join('\n'), true),
    section('Расширенные правила', [
      `Флуд: ${settings.spamEnabled ? 'ON' : 'OFF'}`,
      `Стоп-слова: ${settings.badWordsEnabled ? 'ON' : 'OFF'}`,
      `Слов в списке: ${(settings.badWords || []).length}`
    ].join('\n'), true),
    section('Пороги', [
      `Капс: ${settings.capsPercent || 75}% / ${settings.capsMinLength || 12}+ букв`,
      `Упоминания: ${settings.mentionLimit || 5}`,
      `Флуд: ${settings.spamCount || 6} сообщений / ${settings.spamWindowSeconds || 8}с`
    ].join('\n')),
    section('Стоп-слова', (settings.badWords || []).length ? settings.badWords.join(', ').slice(0, 1024) : 'Список пуст')
  );
}

function buildAutomodActionEmbed({ member, rule, detail, channelId, content }) {
  return card({
    title: '🚫 Automod сработал',
    color: THEME.ruby,
    description: `Сообщение участника ${member ? `<@${member.id}>` : 'неизвестно'} было удалено автоматически.`,
    footer: 'BRHD • Phoenix • Automod',
    thumbnail: member?.displayAvatarURL?.()
  }).addFields(
    section('Правило', `${copy.automod?.ruleLabel ? copy.automod.ruleLabel(rule) : rule}${detail ? ` • ${detail}` : ''}`, true),
    section('Канал', channelId ? `<#${channelId}>` : 'не задан', true),
    section('Сообщение', trimValue(content, 1000))
  );
}

function buildUpdateAnnouncementEmbed({ versionLabel, semver, buildId, commitMessage = '', changeLines = [] }) {
  return card({
    title: '🚀 Бот получил обновление',
    color: THEME.gold,
    description: `${versionLabel}\nСборка успешно развернута на сервере.`,
    footer: 'BRHD • Phoenix • Updates'
  }).addFields(
    section('Версия', [`Лейбл: ${versionLabel}`, `Semver: ${semver}`, `Build: ${buildId}`].join('\n'), true),
    section('Коммит', commitMessage || 'Нет commit message в окружении Railway.', true),
    section('Что изменилось', (changeLines || []).length ? changeLines.map(line => `• ${line}`).join('\n') : '• Список изменений не передан')
  );
}

function buildWelcomeStatusEmbed({ enabled, channelId, dmEnabled, message = '', autoroleRoleId = '' } = {}) {
  return card({
    title: copy.welcome.statusTitle,
    color: enabled ? THEME.emerald : THEME.slate,
    description: enabled ? copy.welcome.enabled : copy.welcome.disabled,
    footer: 'BRHD • Phoenix • Welcome'
  }).addFields(
    section(copy.welcome.channel, channelId ? `<#${channelId}>` : 'не задан', true),
    section(copy.welcome.dm, dmEnabled ? 'включено' : 'выключено', true),
    section(copy.welcome.autorole, autoroleRoleId ? `<@&${autoroleRoleId}>` : 'не задано', true),
    section(copy.welcome.message, message || 'не задано')
  );
}

function formatUpdateSectionLines(lines = [], fallback = '—') {
  if (!Array.isArray(lines) || !lines.length) return fallback;
  return lines.map(line => `• ${line}`).join('\n');
}

function buildUpdateAnnouncementEmbed({ versionLabel, semver, buildId, commitMessage = '', changeLines = [] }) {
  const normalizedGroups = Array.isArray(changeLines)
    ? { added: changeLines, updated: [], fixed: [] }
    : {
        added: changeLines?.added || [],
        updated: changeLines?.updated || [],
        fixed: changeLines?.fixed || []
      };

  const hasStructuredChanges = (
    normalizedGroups.added.length ||
    normalizedGroups.updated.length ||
    normalizedGroups.fixed.length
  );

  const fields = [
    section('Версия', [`Лейбл: ${versionLabel}`, `Semver: ${semver}`, `Build: ${buildId}`].join('\n'), true),
    section('Коммит', trimValue(commitMessage || 'Нет commit message в окружении Railway.', 1024), true)
  ];

  if (normalizedGroups.added.length) {
    fields.push(section('Добавлено', formatUpdateSectionLines(normalizedGroups.added), true));
  }

  if (normalizedGroups.updated.length) {
    fields.push(section('Обновлено', formatUpdateSectionLines(normalizedGroups.updated), true));
  }

  if (normalizedGroups.fixed.length) {
    fields.push(section('Исправлено', formatUpdateSectionLines(normalizedGroups.fixed)));
  }

  fields.push(section(
    'Итог',
    hasStructuredChanges
      ? 'Обновление успешно применено и разложено по ключевым изменениям.'
      : 'Список изменений не передан, но сборка успешно развернута.'
  ));

  return card({
    title: '🚀 Бот получил обновление',
    color: THEME.gold,
    description: `${versionLabel}\nСборка успешно развернута на сервере.`,
    footer: 'BRHD • Phoenix • Updates'
  }).addFields(...fields);
}

function formatUpdateSectionLinesNatural(lines = [], mode = 'updated', fallback = '—') {
  if (!Array.isArray(lines) || !lines.length) return fallback;
  return lines.map(line => `• ${line}`).join('\n');
}

function buildUpdateAnnouncementEmbed({ versionLabel, semver, buildId, commitMessage = '', changeLines = [] }) {
  const normalizedGroups = Array.isArray(changeLines)
    ? { added: changeLines, updated: [], fixed: [] }
    : {
        added: changeLines?.added || [],
        updated: changeLines?.updated || [],
        fixed: changeLines?.fixed || []
      };

  const hasStructuredChanges = (
    normalizedGroups.added.length ||
    normalizedGroups.updated.length ||
    normalizedGroups.fixed.length
  );

  const fields = [
    section('Версия', [`Лейбл: ${versionLabel}`, `Semver: ${semver}`, `Build: ${buildId}`].join('\n'), true),
    section('Коммит', trimValue(commitMessage || 'Нет commit message в окружении Railway.', 1024), true)
  ];

  if (normalizedGroups.added.length) {
    fields.push(section('Добавлено', formatUpdateSectionLinesNatural(normalizedGroups.added, 'added'), true));
  }

  if (normalizedGroups.updated.length) {
    fields.push(section('Обновлено', formatUpdateSectionLinesNatural(normalizedGroups.updated, 'updated'), true));
  }

  if (normalizedGroups.fixed.length) {
    fields.push(section('Исправлено', formatUpdateSectionLinesNatural(normalizedGroups.fixed, 'fixed')));
  }

  fields.push(section(
    'Итог',
    hasStructuredChanges
      ? 'Обновление успешно применено и разложено по понятным пунктам.'
      : 'Список изменений не передан, но сборка успешно развернута.'
  ));

  return card({
    title: '🚀 Бот получил обновление',
    color: THEME.gold,
    description: `${versionLabel}\nСборка успешно развернута на сервере.`,
    footer: 'BRHD • Phoenix • Updates'
  }).addFields(...fields);
}

function buildAutoroleStatusEmbed(roleId = '') {
  return card({
    title: '🪪 Autorole',
    color: roleId ? THEME.emerald : THEME.slate,
    description: roleId ? `Роль будет выдаваться автоматически: <@&${roleId}>` : 'Autorole сейчас выключена.',
    footer: 'BRHD • Phoenix • Welcome'
  });
}

function buildReactionRoleStatusEmbed(entries = []) {
  const lines = entries.slice(0, 20).map((entry, index) => (
    `${index + 1}. ${entry.emoji} • <@&${entry.roleId}> • \`${entry.messageId}\`${entry.channelId ? ` • <#${entry.channelId}>` : ''}`
  ));

  return card({
    title: copy.reactionRoles.title,
    color: entries.length ? THEME.brand : THEME.slate,
    description: lines.length ? lines.join('\n') : copy.reactionRoles.empty,
    footer: 'BRHD • Phoenix • Reaction Roles'
  });
}

function buildReportScheduleEmbed(schedule = {}, channels = {}) {
  const weekly = schedule.weekly || {};
  const monthly = schedule.monthly || {};
  const reportChannel = channels.reports || '';

  return card({
    title: copy.reports.title,
    color: THEME.royal,
    description: 'Автоматическая отправка weekly и monthly отчётов.',
    footer: 'BRHD • Phoenix • Reports'
  }).addFields(
    section('Weekly', [
      `Статус: ${weekly.enabled ? 'включён' : 'выключен'}`,
      `Канал: ${weekly.channelId ? `<#${weekly.channelId}>` : (reportChannel ? `<#${reportChannel}>` : 'не задан')}`,
      'Время: понедельник в 02:00'
    ].join('\n'), true),
    section('Monthly', [
      `Статус: ${monthly.enabled ? 'включён' : 'выключен'}`,
      `Канал: ${monthly.channelId ? `<#${monthly.channelId}>` : (reportChannel ? `<#${reportChannel}>` : 'не задан')}`,
      'Время: 1 число в 02:00'
    ].join('\n'), true)
  );
}

function buildWelcomeEmbed(member, familyTitle, imageUrl = '', customMessage = '') {
  return card({
    title: 'Р”РѕР±СЂРѕ РїРѕР¶Р°Р»РѕРІР°С‚СЊ РІ Phoenix',
    color: THEME.brand,
    description: [
      `<@${member.id}>, С‚С‹ С‚РѕР»СЊРєРѕ С‡С‚Рѕ Р·Р°С€С‘Р» РЅР° СЃРµСЂРІРµСЂ **${member.guild.name}**.`,
      '',
      `Р•СЃР»Рё С…РѕС‡РµС€СЊ РІСЃС‚СѓРїРёС‚СЊ РІ **${familyTitle}**, РЅР°Р¶РјРё РєРЅРѕРїРєСѓ РЅРёР¶Рµ Рё РѕС‚РїСЂР°РІСЊ Р·Р°СЏРІРєСѓ.`,
      'РљР°СЂС‚РѕС‡РєР° СЃСЂР°Р·Сѓ СѓР№РґС‘С‚ СЂСѓРєРѕРІРѕРґСЃС‚РІСѓ РЅР° СЂР°СЃСЃРјРѕС‚СЂРµРЅРёРµ.'
    ].join('\n'),
    footer: 'BRHD вЂў Phoenix вЂў Welcome',
    thumbnail: avatarUrl(member.user),
    image: imageUrl
  }).addFields(
    section('Р§С‚Рѕ РґР°Р»СЊС€Рµ', ['1. РћС‚РєСЂРѕР№ Р°РЅРєРµС‚Сѓ', '2. Р—Р°РїРѕР»РЅРё РґР°РЅРЅС‹Рµ', '3. Р”РѕР¶РґРёСЃСЊ СЂРµС€РµРЅРёСЏ СЂСѓРєРѕРІРѕРґСЃС‚РІР°'].join('\n'), false),
    ...(customMessage ? [section('РЎРѕРѕР±С‰РµРЅРёРµ СЃРµСЂРІРµСЂР°', customMessage, false)] : [])
  );
}

function buildAdminPanelEmbed({ guildName, record }) {
  const isPremium = record.plan === 'premium';
  const planLabel = isPremium ? copy.admin.panelPremium : copy.admin.panelFree;
  const modules = record.settings.modules || {};
  const mode = record.settings.mode || 'hybrid';
  const automod = record.settings.automod || {};
  const welcome = record.settings.welcome || {};
  const reportSchedule = record.settings.reportSchedule || {};
  const reactionRoles = record.settings.reactionRoles || [];
  const moduleLines = [
    `Family: ${modules.family ? 'ON' : 'OFF'}`,
    `Applications: ${modules.applications ? 'ON' : 'OFF'}`,
    `Moderation: ${modules.moderation ? 'ON' : 'OFF'}`,
    `Security: ${modules.security ? 'ON' : 'OFF'}`,
    `Analytics: ${modules.analytics ? 'ON' : 'OFF'}`,
    `AI: ${modules.ai ? 'ON' : 'OFF'}`,
    `Welcome: ${modules.welcome ? 'ON' : 'OFF'}`,
    `Automod: ${modules.automod ? 'ON' : 'OFF'}`,
    `Subscriptions: ${modules.subscriptions ? 'ON' : 'OFF'}`,
    `Custom Commands: ${modules.customCommands ? 'ON' : 'OFF'}`,
    `Music: ${modules.music ? 'ON' : 'OFF'}`
  ];

  return card({
    title: copy.admin.panelTitle,
    color: isPremium ? THEME.gold : THEME.brand,
    description: `РЎРµСЂРІРµСЂ: **${guildName}**`,
    footer: 'BRHD вЂў Phoenix вЂў Administration'
  }).addFields(
    section('РЎС‚Р°С‚СѓСЃ', [`РџР»Р°РЅ: ${planLabel}`, `Setup: ${record.setupCompleted ? copy.admin.panelSetupDone : copy.admin.panelSetupPending}`, `Р РµР¶РёРј: ${mode}`].join('\n'), true),
    section('Р’РѕР·РјРѕР¶РЅРѕСЃС‚Рё', copy.admin.panelFeatures(record.plan), true),
    section(
      copy.admin.panelFieldChannels,
      [
        channelLine('РџР°РЅРµР»СЊ', record.settings.channels.panel),
        channelLine('РџРѕРґР°С‡Р° Р·Р°СЏРІРєРё', record.settings.channels.applications),
        channelLine('Welcome', record.settings.channels.welcome),
        channelLine('Р›РѕРіРё', record.settings.channels.logs),
        channelLine('Р”РёСЃС†РёРїР»РёРЅР°', record.settings.channels.disciplineLogs),
        channelLine('РђРїРґРµР№С‚С‹', record.settings.channels.updates),
        channelLine('РћС‚С‡С‘С‚С‹', record.settings.channels.reports)
      ].join('\n'),
      false
    ),
    section(
      copy.admin.panelFieldRoles,
      [
        roleLine('Р›РёРґРµСЂ', record.settings.roles.leader),
        roleLine('Р—Р°Рј', record.settings.roles.deputy),
        roleLine('РЎС‚Р°СЂС€РёР№', record.settings.roles.elder),
        roleLine('РЈС‡Р°СЃС‚РЅРёРє', record.settings.roles.member),
        roleLine('РќРѕРІРёС‡РѕРє', record.settings.roles.newbie),
        roleLine('РњСѓС‚', record.settings.roles.mute),
        roleLine('РђРІС‚РѕСЂРѕР»СЊ', record.settings.roles.autorole)
      ].join('\n'),
      false
    ),
    section('РњРѕРґСѓР»Рё', moduleLines.join('\n'), false),
    section(
      'Welcome',
      [
        `РЎС‚Р°С‚СѓСЃ: ${welcome.enabled ? 'ON' : 'OFF'}`,
        `Р›РЎ: ${welcome.dmEnabled ? 'ON' : 'OFF'}`,
        `РўРµРєСЃС‚: ${welcome.message ? 'Р·Р°РґР°РЅ' : 'РЅРµ Р·Р°РґР°РЅ'}`
      ].join('\n'),
      true
    ),
    section(
      'Reaction Roles',
      [`РЎРІСЏР·РѕРє: ${reactionRoles.length}`, `Premium: ${isPremium ? 'ON' : 'OFF'}`].join('\n'),
      true
    ),
    section(
      'Reports',
      [
        `Weekly: ${reportSchedule.weekly?.enabled ? 'ON' : 'OFF'}`,
        `Monthly: ${reportSchedule.monthly?.enabled ? 'ON' : 'OFF'}`,
        `РљР°РЅР°Р»: ${record.settings.channels.reports ? `<#${record.settings.channels.reports}>` : 'РЅРµ Р·Р°РґР°РЅ'}`
      ].join('\n'),
      false
    ),
    section(
      'Automod',
      [
        `РРЅРІР°Р№С‚С‹: ${automod.invitesEnabled ? 'ON' : 'OFF'}`,
        `РЎСЃС‹Р»РєРё: ${automod.linksEnabled ? 'ON' : 'OFF'}`,
        `РљР°РїСЃ: ${automod.capsEnabled ? `ON (${automod.capsPercent || 75}% / ${automod.capsMinLength || 12}+ Р±СѓРєРІ)` : 'OFF'}`,
        `РЈРїРѕРјРёРЅР°РЅРёСЏ: ${automod.mentionsEnabled ? `ON (${automod.mentionLimit || 5})` : 'OFF'}`,
        `Р¤Р»СѓРґ: ${automod.spamEnabled ? `ON (${automod.spamCount || 6} / ${automod.spamWindowSeconds || 8}СЃ)` : 'OFF'}`,
        `РЎС‚РѕРї-СЃР»РѕРІР°: ${automod.badWordsEnabled ? `ON (${(automod.badWords || []).length})` : 'OFF'}`
      ].join('\n'),
      false
    ),
    section(
      copy.admin.panelFieldVisuals,
      [
        copy.admin.visualLine('РџР°РЅРµР»СЊ СЃРµРјСЊРё', record.settings.visuals?.familyBanner),
        copy.admin.visualLine('РџРѕРґР°С‡Р° Р·Р°СЏРІРєРё', record.settings.visuals?.applicationsBanner)
      ].join('\n'),
      false
    )
  );
}

function buildWelcomeButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('welcome_verify').setLabel(copy.verification.verifyButton).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('welcome_rules').setLabel(copy.verification.rulesButton).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('family_apply').setLabel(copy.verification.applyButton).setStyle(ButtonStyle.Primary)
    )
  ];
}

function buildVerificationModal() {
  return new ModalBuilder()
    .setCustomId('welcome_verification_modal')
    .setTitle(copy.verification.modalTitle)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('verify_nick').setLabel(copy.verification.modalNick).setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('verify_reason').setLabel(copy.verification.modalReason).setStyle(TextInputStyle.Paragraph).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('verify_rules').setLabel(copy.verification.modalRules).setStyle(TextInputStyle.Short).setRequired(true)
      )
    );
}

function buildVerificationStatusEmbed(config = {}) {
  return card({
    title: `✅ ${copy.verification.title}`,
    color: config.enabled ? THEME.emerald : THEME.slate,
    description: copy.verification.status(config.enabled, config.roleId, config.questionnaireEnabled),
    footer: 'BRHD • Phoenix • Verification'
  });
}

function buildRoleMenuStatusEmbed(menus = []) {
  const lines = (Array.isArray(menus) ? menus : []).flatMap(menu => {
    const head = `• \`${menu.menuId}\` — ${menu.title}${menu.category ? ` [${menu.category}]` : ''}`;
    const items = (menu.items || []).slice(0, 5).map(item => `  - ${item.emoji ? `${item.emoji} ` : ''}${item.label} -> <@&${item.roleId}>`);
    return [head, ...items];
  });

  return card({
    title: `🎛️ ${copy.roleMenus.title}`,
    color: THEME.brand,
    description: lines.length ? lines.join('\n') : copy.roleMenus.empty,
    footer: 'BRHD • Phoenix • Role Menus'
  });
}

function buildRoleMenuComponents(menu = {}) {
  const buttons = (menu.items || []).slice(0, 25).map(item =>
    new ButtonBuilder()
      .setCustomId(`rolemenu_toggle:${menu.menuId}:${item.roleId}`)
      .setLabel(item.label.slice(0, 80))
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(item.emoji || undefined)
  );

  return chunk(buttons, 5).map(part => new ActionRowBuilder().addComponents(part));
}

function buildRoleMenuEmbed(menu = {}) {
  const lines = (menu.items || []).map(item => {
    const prefix = item.emoji ? `${item.emoji} ` : '';
    const suffix = item.description ? ` — ${item.description}` : '';
    return `• ${prefix}<@&${item.roleId}>${suffix}`;
  });

  return card({
    title: menu.title || 'Role Menu',
    color: THEME.brand,
    description: [
      menu.category ? `Категория: **${menu.category}**` : '',
      menu.description || '',
      '',
      lines.length ? lines.join('\n') : 'Пункты пока не добавлены.'
    ].filter(Boolean).join('\n'),
    footer: 'BRHD • Phoenix • Role Menu'
  });
}

function buildCustomCommandsEmbed(commands = []) {
  const lines = (Array.isArray(commands) ? commands : []).map(command => `• \`${command.name}\` — ${command.trigger} (${command.mode})`);
  return card({
    title: `🧩 ${copy.customCommands.title}`,
    color: THEME.royal,
    description: lines.length ? lines.join('\n') : copy.customCommands.empty,
    footer: 'BRHD • Phoenix • Custom Commands'
  });
}

function buildWelcomeEmbed(member, familyTitle, imageUrl = '', customMessage = '', extras = {}) {
  return card({
    title: `👋 Добро пожаловать в ${familyTitle || 'Phoenix'}`,
    color: THEME.emerald,
    description: [
      `Привет, <@${member.id}>. Сервер уже готов к старту.`,
      '',
      customMessage || 'Используй кнопки ниже, чтобы изучить правила, пройти подтверждение и подать заявку.',
      '',
      extras.rulesChannelId ? `• Правила: <#${extras.rulesChannelId}>` : '',
      extras.panelChannelId ? `• Панель семьи: <#${extras.panelChannelId}>` : '',
      extras.applicationsChannelId ? `• Подача заявки: <#${extras.applicationsChannelId}>` : '',
      extras.verificationEnabled ? '• Подтверди доступ кнопкой ниже, чтобы получить стартовую роль.' : ''
    ].filter(Boolean).join('\n'),
    footer: 'BRHD • Phoenix • Welcome',
    thumbnail: avatarUrl(member.user),
    image: imageUrl
  });
}

function buildAutomodStatusEmbed(config = {}, automodChannelId = '') {
  return card({
    title: '🛡️ Automod',
    color: THEME.ruby,
    description: [
      `Инвайты: ${config.invitesEnabled ? 'ON' : 'OFF'}`,
      `Ссылки: ${config.linksEnabled ? 'ON' : 'OFF'}`,
      `Капс: ${config.capsEnabled ? `ON (${config.capsPercent || 75}% / ${config.capsMinLength || 12}+)` : 'OFF'}`,
      `Упоминания: ${config.mentionsEnabled ? `ON (${config.mentionLimit || 5})` : 'OFF'}`,
      `Флуд: ${config.spamEnabled ? `ON (${config.spamCount || 6}/${config.spamWindowSeconds || 8}с)` : 'OFF'}`,
      `Стоп-слова: ${config.badWordsEnabled ? `ON (${(config.badWords || []).length})` : 'OFF'}`,
      `Наказание: ${config.actionMode === 'hard' ? 'жёсткое' : 'мягкое'}`,
      `Логи automod: ${automodChannelId ? `<#${automodChannelId}>` : 'не заданы'}`
    ].join('\n'),
    footer: 'BRHD • Phoenix • Automod'
  });
}

function buildReportScheduleEmbed(schedule = {}, channels = {}) {
  const weekly = schedule.weekly || {};
  const monthly = schedule.monthly || {};
  return card({
    title: '📆 Расписание отчётов',
    color: THEME.royal,
    description: [
      `Weekly: ${weekly.enabled ? 'ON' : 'OFF'}`,
      `Канал weekly: ${weekly.channelId ? `<#${weekly.channelId}>` : (channels.reports ? `<#${channels.reports}>` : 'не задан')}`,
      '',
      `Monthly: ${monthly.enabled ? 'ON' : 'OFF'}`,
      `Канал monthly: ${monthly.channelId ? `<#${monthly.channelId}>` : (channels.reports ? `<#${channels.reports}>` : 'не задан')}`
    ].join('\n'),
    footer: 'BRHD • Phoenix • Reports'
  });
}

function buildAdminPanelEmbed({ guildName, record }) {
  const isPremium = record.plan === 'premium';
  const planLabel = isPremium ? copy.admin.panelPremium : copy.admin.panelFree;
  const modules = record.settings.modules || {};
  const mode = record.settings.mode || 'hybrid';
  const automod = record.settings.automod || {};
  const welcome = record.settings.welcome || {};
  const verification = record.settings.verification || {};
  const reportSchedule = record.settings.reportSchedule || {};
  const reactionRoles = record.settings.reactionRoles || [];
  const roleMenus = record.settings.roleMenus || [];
  const customCommands = record.settings.customCommands || [];
  const moduleLines = [
    `Family: ${modules.family ? 'ON' : 'OFF'}`,
    `Applications: ${modules.applications ? 'ON' : 'OFF'}`,
    `Moderation: ${modules.moderation ? 'ON' : 'OFF'}`,
    `Security: ${modules.security ? 'ON' : 'OFF'}`,
    `Analytics: ${modules.analytics ? 'ON' : 'OFF'}`,
    `AI: ${modules.ai ? 'ON' : 'OFF'}`,
    `Welcome: ${modules.welcome ? 'ON' : 'OFF'}`,
    `Automod: ${modules.automod ? 'ON' : 'OFF'}`,
    `Subscriptions: ${modules.subscriptions ? 'ON' : 'OFF'}`,
    `Custom Commands: ${modules.customCommands ? 'ON' : 'OFF'}`,
    `Music: ${modules.music ? 'ON' : 'OFF'}`
  ];

  return card({
    title: copy.admin.panelTitle,
    color: isPremium ? THEME.gold : THEME.brand,
    description: `Сервер: **${guildName}**`,
    footer: 'BRHD • Phoenix • Administration'
  }).addFields(
    section('Статус', [`План: ${planLabel}`, `Setup: ${record.setupCompleted ? copy.admin.panelSetupDone : copy.admin.panelSetupPending}`, `Режим: ${mode}`].join('\n'), true),
    section('Возможности', copy.admin.panelFeatures(record.plan), true),
    section(
      copy.admin.panelFieldChannels,
      [
        channelLine('Панель', record.settings.channels.panel),
        channelLine('Подача заявки', record.settings.channels.applications),
        channelLine('Welcome', record.settings.channels.welcome),
        channelLine('Правила', record.settings.channels.rules),
        channelLine('Логи', record.settings.channels.logs),
        channelLine('Дисциплина', record.settings.channels.disciplineLogs),
        channelLine('Апдейты', record.settings.channels.updates),
        channelLine('Отчёты', record.settings.channels.reports),
        channelLine('Automod', record.settings.channels.automod)
      ].join('\n'),
      false
    ),
    section(
      copy.admin.panelFieldRoles,
      [
        roleLine('Лидер', record.settings.roles.leader),
        roleLine('Зам', record.settings.roles.deputy),
        roleLine('Старший', record.settings.roles.elder),
        roleLine('Участник', record.settings.roles.member),
        roleLine('Новичок', record.settings.roles.newbie),
        roleLine('Мут', record.settings.roles.mute),
        roleLine('Автороль', record.settings.roles.autorole),
        roleLine('После подтверждения', record.settings.roles.verification)
      ].join('\n'),
      false
    ),
    section('Модули', moduleLines.join('\n'), false),
    section(
      'Welcome',
      [
        `Статус: ${welcome.enabled ? 'ON' : 'OFF'}`,
        `ЛС: ${welcome.dmEnabled ? 'ON' : 'OFF'}`,
        `Текст: ${welcome.message ? 'задан' : 'не задан'}`
      ].join('\n'),
      true
    ),
    section(
      'Verification',
      [
        `Статус: ${verification.enabled ? 'ON' : 'OFF'}`,
        `Анкета: ${verification.questionnaireEnabled ? 'ON' : 'OFF'}`,
        `Роль: ${verification.roleId ? `<@&${verification.roleId}>` : 'не задана'}`
      ].join('\n'),
      true
    ),
    section(
      'Role Menus',
      [`Меню: ${roleMenus.length}`, `Старые reaction roles: ${reactionRoles.length}`].join('\n'),
      true
    ),
    section(
      'Custom Commands',
      [`Триггеры: ${customCommands.length}`, `Premium: ${isPremium ? 'ON' : 'OFF'}`].join('\n'),
      true
    ),
    section(
      'Reports',
      [
        `Weekly: ${reportSchedule.weekly?.enabled ? 'ON' : 'OFF'}`,
        `Канал weekly: ${reportSchedule.weekly?.channelId ? `<#${reportSchedule.weekly.channelId}>` : 'не задан'}`,
        `Monthly: ${reportSchedule.monthly?.enabled ? 'ON' : 'OFF'}`,
        `Канал monthly: ${reportSchedule.monthly?.channelId ? `<#${reportSchedule.monthly.channelId}>` : 'не задан'}`
      ].join('\n'),
      false
    ),
    section(
      'Automod',
      [
        `Инвайты: ${automod.invitesEnabled ? 'ON' : 'OFF'}`,
        `Ссылки: ${automod.linksEnabled ? 'ON' : 'OFF'}`,
        `Капс: ${automod.capsEnabled ? `ON (${automod.capsPercent || 75}% / ${automod.capsMinLength || 12}+ букв)` : 'OFF'}`,
        `Упоминания: ${automod.mentionsEnabled ? `ON (${automod.mentionLimit || 5})` : 'OFF'}`,
        `Флуд: ${automod.spamEnabled ? `ON (${automod.spamCount || 6} / ${automod.spamWindowSeconds || 8}с)` : 'OFF'}`,
        `Стоп-слова: ${automod.badWordsEnabled ? `ON (${(automod.badWords || []).length})` : 'OFF'}`,
        `Наказание: ${automod.actionMode === 'hard' ? 'жёсткое' : 'мягкое'}`
      ].join('\n'),
      false
    ),
    section(
      copy.admin.panelFieldVisuals,
      [
        copy.admin.visualLine('Панель семьи', record.settings.visuals?.familyBanner),
        copy.admin.visualLine('Подача заявки', record.settings.visuals?.applicationsBanner)
      ].join('\n'),
      false
    )
  );
}

function buildRoleMenuStatusEmbed(menus = []) {
  const lines = (Array.isArray(menus) ? menus : []).flatMap(menu => {
    const head = `• \`${menu.menuId}\` - ${menu.title}${menu.category ? ` [${menu.category}]` : ''}`;
    const items = (menu.items || []).slice(0, 5).map(item => `  - ${item.emoji ? `${item.emoji} ` : ''}${item.label} -> <@&${item.roleId}>`);
    return [head, ...items];
  });

  return card({
    title: `🎛️ ${copy.roleMenus.title}`,
    color: THEME.brand,
    description: lines.length ? lines.join('\n') : copy.roleMenus.empty,
    footer: 'BRHD • Phoenix • Role Menus'
  });
}

function buildRoleMenuEmbed(menu = {}) {
  const lines = (menu.items || []).map(item => {
    const prefix = item.emoji ? `${item.emoji} ` : '';
    const suffix = item.description ? ` - ${item.description}` : '';
    return `• ${prefix}<@&${item.roleId}>${suffix}`;
  });

  return card({
    title: menu.title || 'Role Menu',
    color: THEME.brand,
    description: [
      menu.category ? `Категория: **${menu.category}**` : '',
      menu.description || '',
      '',
      lines.length ? lines.join('\n') : 'Пункты пока не добавлены.'
    ].filter(Boolean).join('\n'),
    footer: 'BRHD • Phoenix • Role Menu'
  });
}

function buildCustomCommandsEmbed(commands = []) {
  const lines = (Array.isArray(commands) ? commands : []).map(command => `• \`${command.name}\` - ${command.trigger} (${command.mode})`);
  return card({
    title: `🧩 ${copy.customCommands.title}`,
    color: THEME.royal,
    description: lines.length ? lines.join('\n') : copy.customCommands.empty,
    footer: 'BRHD • Phoenix • Custom Commands'
  });
}

function buildWelcomeEmbed(member, familyTitle, imageUrl = '', customMessage = '', extras = {}) {
  const guildName = member.guild?.name || familyTitle || 'Phoenix';
  return card({
    title: `👋 Добро пожаловать в ${guildName}`,
    color: THEME.emerald,
    description: [
      `Привет, <@${member.id}>. Ты только что зашёл на сервер **${guildName}**.`,
      '',
      customMessage || `Используй кнопки ниже, чтобы изучить правила, пройти подтверждение и открыть доступ к панели **${familyTitle || guildName}**.`,
      '',
      extras.rulesChannelId ? `• Правила: <#${extras.rulesChannelId}>` : '',
      extras.panelChannelId ? `• Панель семьи: <#${extras.panelChannelId}>` : '',
      extras.applicationsChannelId ? `• Подача заявки: <#${extras.applicationsChannelId}>` : '',
      extras.verificationEnabled ? '• Подтверди доступ кнопкой ниже, чтобы получить стартовую роль.' : ''
    ].filter(Boolean).join('\n'),
    footer: 'BRHD • Phoenix • Welcome',
    thumbnail: avatarUrl(member.user),
    image: imageUrl
  }).addFields(
    section(
      'Старт',
      [
        '1. Изучи правила сервера',
        '2. Пройди подтверждение',
        '3. Открой панель семьи и подай заявку'
      ].join('\n'),
      false
    )
  );
}

function buildAutomodStatusEmbed(config = {}, automodChannelId = '') {
  return card({
    title: '🛡️ Automod',
    color: THEME.ruby,
    description: [
      `Инвайты: ${config.invitesEnabled ? 'ON' : 'OFF'}`,
      `Ссылки: ${config.linksEnabled ? 'ON' : 'OFF'}`,
      `Капс: ${config.capsEnabled ? `ON (${config.capsPercent || 75}% / ${config.capsMinLength || 12}+)` : 'OFF'}`,
      `Упоминания: ${config.mentionsEnabled ? `ON (${config.mentionLimit || 5})` : 'OFF'}`,
      `Флуд: ${config.spamEnabled ? `ON (${config.spamCount || 6}/${config.spamWindowSeconds || 8}с)` : 'OFF'}`,
      `Стоп-слова: ${config.badWordsEnabled ? `ON (${(config.badWords || []).length})` : 'OFF'}`,
      `Наказание: ${config.actionMode === 'hard' ? 'жёсткое' : 'мягкое'}`,
      `Логи automod: ${automodChannelId ? `<#${automodChannelId}>` : 'не заданы'}`
    ].join('\n'),
    footer: 'BRHD • Phoenix • Automod'
  });
}

function buildReportScheduleEmbed(schedule = {}, channels = {}) {
  const weekly = schedule.weekly || {};
  const monthly = schedule.monthly || {};
  return card({
    title: '📆 Расписание отчётов',
    color: THEME.royal,
    description: [
      `Weekly: ${weekly.enabled ? 'ON' : 'OFF'}`,
      `Канал weekly: ${weekly.channelId ? `<#${weekly.channelId}>` : (channels.reports ? `<#${channels.reports}>` : 'не задан')}`,
      '',
      `Monthly: ${monthly.enabled ? 'ON' : 'OFF'}`,
      `Канал monthly: ${monthly.channelId ? `<#${monthly.channelId}>` : (channels.reports ? `<#${channels.reports}>` : 'не задан')}`
    ].join('\n'),
    footer: 'BRHD • Phoenix • Reports'
  });
}

function roleLine(label, roleId) {
  return `${label}: ${roleId ? `<@&${roleId}>` : 'не задано'}`;
}

function channelLine(label, channelId) {
  return `${label}: ${channelId ? `<#${channelId}>` : 'не задан'}`;
}

function buildLeaderboardEmbed(entries, summary = {}) {
  const content = entries.length ? entries.join('\n') : copy.stats.leaderboardEmpty;

  return card({
    title: `${copy.stats.leaderboardTitle} • Phoenix`,
    color: THEME.gold,
    description: [
      'Премиальный срез репутации семьи в стиле BRHD / Phoenix.',
      '',
      `Участников в рейтинге: ${summary.memberCount ?? entries.length}`,
      `Тариф: ${summary.planLabel || 'Premium — 5$'}`,
      `Топ-игрок: ${summary.topLine || 'нет данных'}`
    ].join('\n'),
    footer: 'BRHD • Phoenix • Premium Leaderboard',
    image: summary.imageUrl
  }).addFields(
    section(
      'Сводка',
      [
        `Средняя репутация: ${summary.averagePoints ?? 0}/100`,
        `Суммарная репутация: ${summary.totalPoints ?? 0}`,
        `Голос семьи: ${summary.totalVoiceHours ?? 0} ч`
      ].join('\n'),
      true
    ),
    section('Рейтинг', content, false)
  );
}

function buildVoiceActivityEmbed(entries, summary = {}) {
  const content = entries.length ? entries.join('\n') : copy.stats.voiceEmpty;

  return card({
    title: `${copy.stats.voiceTitle} • Phoenix`,
    color: THEME.royal,
    description: [
      'Премиальный мониторинг голосовой активности семьи.',
      '',
      `Участников в голосовом рейтинге: ${summary.memberCount ?? entries.length}`,
      `Тариф: ${summary.planLabel || 'Premium — 5$'}`,
      `Лидер голоса: ${summary.topLine || 'нет данных'}`
    ].join('\n'),
    footer: 'BRHD • Phoenix • Premium Voice',
    image: summary.imageUrl
  }).addFields(
    section(
      'Сводка',
      [
        `Суммарно часов: ${summary.totalHours ?? 0} ч`,
        `Среднее на участника: ${summary.averageHours ?? 0} ч`,
        `Репутация ядра: ${summary.totalPoints ?? 0}`
      ].join('\n'),
      true
    ),
    section('Топ по голосу', content, false)
  );
}

function buildWelcomeEmbed(member, familyTitle, imageUrl = '', customMessage = '', extras = {}) {
  const guildName = member.guild?.name || familyTitle || 'Phoenix';
  return card({
    title: `👋 Добро пожаловать в ${guildName}`,
    color: THEME.emerald,
    description: [
      `Привет, <@${member.id}>. Ты только что зашёл на сервер **${guildName}**.`,
      '',
      customMessage || `Используй кнопки ниже, чтобы изучить правила, пройти подтверждение и открыть доступ к панели **${familyTitle || guildName}**.`,
      '',
      extras.rulesChannelId ? `• Правила: <#${extras.rulesChannelId}>` : '',
      extras.panelChannelId ? `• Панель семьи: <#${extras.panelChannelId}>` : '',
      extras.applicationsChannelId ? `• Подача заявки: <#${extras.applicationsChannelId}>` : '',
      extras.verificationEnabled ? '• Подтверди доступ кнопкой ниже, чтобы получить стартовую роль.' : ''
    ].filter(Boolean).join('\n'),
    footer: 'BRHD • Phoenix • Welcome',
    thumbnail: avatarUrl(member.user),
    image: imageUrl
  }).addFields(
    section(
      'Старт',
      [
        '1. Изучи правила сервера',
        '2. Пройди подтверждение',
        '3. Открой панель семьи и подай заявку'
      ].join('\n'),
      false
    )
  );
}

function buildAutomodStatusEmbed(config = {}, automodChannelId = '') {
  return card({
    title: '🛡️ Automod',
    color: THEME.ruby,
    description: [
      `Инвайты: ${config.invitesEnabled ? 'ON' : 'OFF'}`,
      `Ссылки: ${config.linksEnabled ? 'ON' : 'OFF'}`,
      `Капс: ${config.capsEnabled ? `ON (${config.capsPercent || 75}% / ${config.capsMinLength || 12}+)` : 'OFF'}`,
      `Упоминания: ${config.mentionsEnabled ? `ON (${config.mentionLimit || 5})` : 'OFF'}`,
      `Флуд: ${config.spamEnabled ? `ON (${config.spamCount || 6}/${config.spamWindowSeconds || 8}с)` : 'OFF'}`,
      `Стоп-слова: ${config.badWordsEnabled ? `ON (${(config.badWords || []).length})` : 'OFF'}`,
      `Наказание: ${config.actionMode === 'hard' ? 'жёсткое' : 'мягкое'}`,
      `Логи automod: ${automodChannelId ? `<#${automodChannelId}>` : 'не заданы'}`
    ].join('\n'),
    footer: 'BRHD • Phoenix • Automod'
  });
}

function buildReportScheduleEmbed(schedule = {}, channels = {}) {
  const weekly = schedule.weekly || {};
  const monthly = schedule.monthly || {};
  return card({
    title: '📆 Расписание отчётов',
    color: THEME.royal,
    description: [
      `Weekly: ${weekly.enabled ? 'ON' : 'OFF'}`,
      `Канал weekly: ${weekly.channelId ? `<#${weekly.channelId}>` : (channels.reports ? `<#${channels.reports}>` : 'не задан')}`,
      '',
      `Monthly: ${monthly.enabled ? 'ON' : 'OFF'}`,
      `Канал monthly: ${monthly.channelId ? `<#${monthly.channelId}>` : (channels.reports ? `<#${channels.reports}>` : 'не задан')}`
    ].join('\n'),
    footer: 'BRHD • Phoenix • Reports'
  });
}

function buildAdminPanelEmbed({ guildName, record }) {
  const settings = record.settings || {};
  const channels = settings.channels || {};
  const roles = settings.roles || {};
  const visuals = settings.visuals || {};
  const modules = settings.modules || {};
  const automod = settings.automod || {};
  const welcome = settings.welcome || {};
  const verification = settings.verification || {};
  const reportSchedule = settings.reportSchedule || {};
  const reactionRoles = Array.isArray(settings.reactionRoles) ? settings.reactionRoles : [];
  const roleMenus = Array.isArray(settings.roleMenus) ? settings.roleMenus : [];
  const customCommands = Array.isArray(settings.customCommands) ? settings.customCommands : [];
  const isPremium = record.plan === 'premium';
  const planLabel = isPremium ? copy.admin.panelPremium : copy.admin.panelFree;
  const mode = settings.mode || 'hybrid';

  const moduleLines = [
    `Family: ${modules.family ? 'ON' : 'OFF'}`,
    `Applications: ${modules.applications ? 'ON' : 'OFF'}`,
    `Moderation: ${modules.moderation ? 'ON' : 'OFF'}`,
    `Security: ${modules.security ? 'ON' : 'OFF'}`,
    `Analytics: ${modules.analytics ? 'ON' : 'OFF'}`,
    `AI: ${modules.ai ? 'ON' : 'OFF'}`,
    `Welcome: ${modules.welcome ? 'ON' : 'OFF'}`,
    `Automod: ${modules.automod ? 'ON' : 'OFF'}`,
    `Subscriptions: ${modules.subscriptions ? 'ON' : 'OFF'}`,
    `Custom Commands: ${modules.customCommands ? 'ON' : 'OFF'}`,
    `Music: ${modules.music ? 'ON' : 'OFF'}`
  ];

  return card({
    title: copy.admin.panelTitle,
    color: isPremium ? THEME.gold : THEME.brand,
    description: `Сервер: **${guildName}**`,
    footer: 'BRHD • Phoenix • Administration'
  }).addFields(
    section(
      'Статус',
      [
        `Тариф: ${planLabel}`,
        `Setup: ${record.setupCompleted ? copy.admin.panelSetupDone : copy.admin.panelSetupPending}`,
        `Режим: ${mode}`
      ].join('\n'),
      true
    ),
    section('Возможности', copy.admin.panelFeatures(record.plan), true),
    section(
      copy.admin.panelFieldChannels,
      [
        channelLine('Панель', channels.panel),
        channelLine('Подача заявки', channels.applications),
        channelLine('Welcome', channels.welcome),
        channelLine('Правила', channels.rules),
        channelLine('Логи', channels.logs),
        channelLine('Дисциплина', channels.disciplineLogs),
        channelLine('Апдейты', channels.updates),
        channelLine('Отчёты', channels.reports),
        channelLine('Automod', channels.automod)
      ].join('\n'),
      false
    ),
    section(
      copy.admin.panelFieldRoles,
      [
        roleLine('Лидер', roles.leader),
        roleLine('Зам', roles.deputy),
        roleLine('Старший', roles.elder),
        roleLine('Участник', roles.member),
        roleLine('Новичок', roles.newbie),
        roleLine('Мут', roles.mute),
        roleLine('Автороль', roles.autorole),
        roleLine('После подтверждения', roles.verification)
      ].join('\n'),
      false
    ),
    section('Модули', moduleLines.join('\n'), false),
    section(
      'Welcome',
      [
        `Статус: ${welcome.enabled ? 'ON' : 'OFF'}`,
        `ЛС: ${welcome.dmEnabled ? 'ON' : 'OFF'}`,
        `Текст: ${welcome.message ? 'задан' : 'не задан'}`
      ].join('\n'),
      true
    ),
    section(
      'Verification',
      [
        `Статус: ${verification.enabled ? 'ON' : 'OFF'}`,
        `Анкета: ${verification.questionnaireEnabled ? 'ON' : 'OFF'}`,
        `Роль: ${verification.roleId ? `<@&${verification.roleId}>` : 'не задана'}`
      ].join('\n'),
      true
    ),
    section(
      'Role Menus',
      [`Меню: ${roleMenus.length}`, `Старые reaction roles: ${reactionRoles.length}`].join('\n'),
      true
    ),
    section(
      'Custom Commands',
      [`Триггеры: ${customCommands.length}`, `Premium: ${isPremium ? 'ON' : 'OFF'}`].join('\n'),
      true
    ),
    section(
      'Reports',
      [
        `Weekly: ${reportSchedule.weekly?.enabled ? 'ON' : 'OFF'}`,
        `Канал weekly: ${reportSchedule.weekly?.channelId ? `<#${reportSchedule.weekly.channelId}>` : 'не задан'}`,
        `Monthly: ${reportSchedule.monthly?.enabled ? 'ON' : 'OFF'}`,
        `Канал monthly: ${reportSchedule.monthly?.channelId ? `<#${reportSchedule.monthly.channelId}>` : 'не задан'}`
      ].join('\n'),
      false
    ),
    section(
      'Automod',
      [
        `Инвайты: ${automod.invitesEnabled ? 'ON' : 'OFF'}`,
        `Ссылки: ${automod.linksEnabled ? 'ON' : 'OFF'}`,
        `Капс: ${automod.capsEnabled ? `ON (${automod.capsPercent || 75}% / ${automod.capsMinLength || 12}+ букв)` : 'OFF'}`,
        `Упоминания: ${automod.mentionsEnabled ? `ON (${automod.mentionLimit || 5})` : 'OFF'}`,
        `Флуд: ${automod.spamEnabled ? `ON (${automod.spamCount || 6} / ${automod.spamWindowSeconds || 8}с)` : 'OFF'}`,
        `Стоп-слова: ${automod.badWordsEnabled ? `ON (${(automod.badWords || []).length})` : 'OFF'}`,
        `Наказание: ${automod.actionMode === 'hard' ? 'жёсткое' : 'мягкое'}`
      ].join('\n'),
      false
    ),
    section(
      copy.admin.panelFieldVisuals,
      [
        copy.admin.visualLine('Панель семьи', visuals.familyBanner),
        copy.admin.visualLine('Подача заявки', visuals.applicationsBanner)
      ].join('\n'),
      false
    )
  );
}

function buildRoleMenuStatusEmbed(menus = []) {
  const lines = (Array.isArray(menus) ? menus : []).flatMap(menu => {
    const head = `• \`${menu.menuId}\` - ${menu.title}${menu.category ? ` [${menu.category}]` : ''}`;
    const items = (menu.items || []).slice(0, 5).map(item => `  - ${item.emoji ? `${item.emoji} ` : ''}${item.label} -> <@&${item.roleId}>`);
    return [head, ...items];
  });

  return card({
    title: `🎛️ ${copy.roleMenus.title}`,
    color: THEME.brand,
    description: lines.length ? lines.join('\n') : copy.roleMenus.empty,
    footer: 'BRHD • Phoenix • Role Menus'
  });
}

function buildRoleMenuEmbed(menu = {}) {
  const lines = (menu.items || []).map(item => {
    const prefix = item.emoji ? `${item.emoji} ` : '';
    const suffix = item.description ? ` - ${item.description}` : '';
    return `• ${prefix}<@&${item.roleId}>${suffix}`;
  });

  return card({
    title: menu.title || 'Role Menu',
    color: THEME.brand,
    description: [
      menu.category ? `Категория: **${menu.category}**` : '',
      menu.description || '',
      '',
      lines.length ? lines.join('\n') : 'Пункты пока не добавлены.'
    ].filter(Boolean).join('\n'),
    footer: 'BRHD • Phoenix • Role Menu'
  });
}

function buildCustomCommandsEmbed(commands = []) {
  const lines = (Array.isArray(commands) ? commands : []).map(command => `• \`${command.name}\` - ${command.trigger} (${command.mode})`);
  return card({
    title: `🧩 ${copy.customCommands.title}`,
    color: THEME.royal,
    description: lines.length ? lines.join('\n') : copy.customCommands.empty,
    footer: 'BRHD • Phoenix • Custom Commands'
  });
}

module.exports = {
  buildAcceptLogEmbed,
  buildApplicationButtons,
  buildApplicationEmbed,
  buildApplicationsListEmbed,
  buildApplicationsPanelButtons,
  buildApplicationsPanelEmbed,
  buildAcceptModal,
  buildAiAdvisorModal,
  buildApplyModal,
  buildAdminPanelEmbed,
  buildBanListEmbed,
  buildBlacklistEmbed,
  buildCommendLogEmbed,
  buildDebugConfigEmbed,
  buildFamilyEmbeds,
  buildFamilyMenuEmbed,
  buildHelpEmbed,
  buildAutomodActionEmbed,
  buildAutomodStatusEmbed,
  buildAutoroleStatusEmbed,
  buildCustomCommandsEmbed,
  buildLeaderboardEmbed,
  buildProfileEmbed,
  buildRankButtons,
  buildRoleMenuComponents,
  buildRoleMenuEmbed,
  buildRoleMenuStatusEmbed,
  buildReactionRoleStatusEmbed,
  buildRejectLogEmbed,
  buildReportScheduleEmbed,
  buildUpdateAnnouncementEmbed,
  buildVerificationModal,
  buildVerificationStatusEmbed,
  buildVoiceActivityEmbed,
  buildWelcomeButtons,
  buildWelcomeStatusEmbed,
  buildWelcomeEmbed,
  buildWarnLogEmbed,
  panelButtons
};

function roleLine(label, roleId) {
  return `${label}: ${roleId ? `<@&${roleId}>` : 'не задано'}`;
}

function channelLine(label, channelId) {
  return `${label}: ${channelId ? `<#${channelId}>` : 'не задан'}`;
}

function buildRoleMenuStatusEmbed(menus = []) {
  const lines = (Array.isArray(menus) ? menus : []).flatMap(menu => {
    const head = `• \`${menu.menuId}\` - ${menu.title}${menu.category ? ` [${menu.category}]` : ''}`;
    const items = (menu.items || []).slice(0, 5).map(item => `  - ${item.emoji ? `${item.emoji} ` : ''}${item.label} -> <@&${item.roleId}>`);
    return [head, ...items];
  });

  return card({
    title: `🎛️ ${copy.roleMenus.title}`,
    color: THEME.brand,
    description: lines.length ? lines.join('\n') : copy.roleMenus.empty,
    footer: 'BRHD • Phoenix • Role Menus'
  });
}

function buildRoleMenuEmbed(menu = {}) {
  const lines = (menu.items || []).map(item => {
    const prefix = item.emoji ? `${item.emoji} ` : '';
    const suffix = item.description ? ` - ${item.description}` : '';
    return `• ${prefix}<@&${item.roleId}>${suffix}`;
  });

  return card({
    title: menu.title || 'Role Menu',
    color: THEME.brand,
    description: [
      menu.category ? `Категория: **${menu.category}**` : '',
      menu.description || '',
      '',
      lines.length ? lines.join('\n') : 'Пункты пока не добавлены.'
    ].filter(Boolean).join('\n'),
    footer: 'BRHD • Phoenix • Role Menu'
  });
}

function buildCustomCommandsEmbed(commands = []) {
  const lines = (Array.isArray(commands) ? commands : []).map(command => `• \`${command.name}\` - ${command.trigger} (${command.mode})`);
  return card({
    title: `🧩 ${copy.customCommands.title}`,
    color: THEME.royal,
    description: lines.length ? lines.join('\n') : copy.customCommands.empty,
    footer: 'BRHD • Phoenix • Custom Commands'
  });
}

function buildWelcomeEmbed(member, familyTitle, imageUrl = '', customMessage = '', extras = {}) {
  const guildName = member.guild?.name || familyTitle || 'Phoenix';
  return card({
    title: `👋 Добро пожаловать в ${guildName}`,
    color: THEME.emerald,
    description: [
      `Привет, <@${member.id}>. Ты только что зашёл на сервер **${guildName}**.`,
      '',
      customMessage || `Используй кнопки ниже, чтобы изучить правила, пройти подтверждение и открыть доступ к панели **${familyTitle || guildName}**.`,
      '',
      extras.rulesChannelId ? `• Правила: <#${extras.rulesChannelId}>` : '',
      extras.panelChannelId ? `• Панель семьи: <#${extras.panelChannelId}>` : '',
      extras.applicationsChannelId ? `• Подача заявки: <#${extras.applicationsChannelId}>` : '',
      extras.verificationEnabled ? '• Подтверди доступ кнопкой ниже, чтобы получить стартовую роль.' : ''
    ].filter(Boolean).join('\n'),
    footer: 'BRHD • Phoenix • Welcome',
    thumbnail: avatarUrl(member.user),
    image: imageUrl
  }).addFields(
    section(
      'Старт',
      [
        '1. Изучи правила сервера',
        '2. Пройди подтверждение',
        '3. Открой панель семьи и подай заявку'
      ].join('\n'),
      false
    )
  );
}

function buildAutomodStatusEmbed(config = {}, automodChannelId = '') {
  return card({
    title: '🛡️ Automod',
    color: THEME.ruby,
    description: [
      `Инвайты: ${config.invitesEnabled ? 'ON' : 'OFF'}`,
      `Ссылки: ${config.linksEnabled ? 'ON' : 'OFF'}`,
      `Капс: ${config.capsEnabled ? `ON (${config.capsPercent || 75}% / ${config.capsMinLength || 12}+)` : 'OFF'}`,
      `Упоминания: ${config.mentionsEnabled ? `ON (${config.mentionLimit || 5})` : 'OFF'}`,
      `Флуд: ${config.spamEnabled ? `ON (${config.spamCount || 6}/${config.spamWindowSeconds || 8}с)` : 'OFF'}`,
      `Стоп-слова: ${config.badWordsEnabled ? `ON (${(config.badWords || []).length})` : 'OFF'}`,
      `Наказание: ${config.actionMode === 'hard' ? 'жёсткое' : 'мягкое'}`,
      `Логи automod: ${automodChannelId ? `<#${automodChannelId}>` : 'не заданы'}`
    ].join('\n'),
    footer: 'BRHD • Phoenix • Automod'
  });
}

function buildReportScheduleEmbed(schedule = {}, channels = {}) {
  const weekly = schedule.weekly || {};
  const monthly = schedule.monthly || {};
  return card({
    title: '📆 Расписание отчётов',
    color: THEME.royal,
    description: [
      `Weekly: ${weekly.enabled ? 'ON' : 'OFF'}`,
      `Канал weekly: ${weekly.channelId ? `<#${weekly.channelId}>` : (channels.reports ? `<#${channels.reports}>` : 'не задан')}`,
      '',
      `Monthly: ${monthly.enabled ? 'ON' : 'OFF'}`,
      `Канал monthly: ${monthly.channelId ? `<#${monthly.channelId}>` : (channels.reports ? `<#${channels.reports}>` : 'не задан')}`
    ].join('\n'),
    footer: 'BRHD • Phoenix • Reports'
  });
}

function buildLeaderboardEmbed(entries, summary = {}) {
  const content = entries.length ? entries.join('\n') : copy.stats.leaderboardEmpty;

  return card({
    title: `${copy.stats.leaderboardTitle} • Phoenix`,
    color: THEME.gold,
    description: [
      'Премиальный срез репутации семьи в стиле BRHD / Phoenix.',
      '',
      `Участников в рейтинге: ${summary.memberCount ?? entries.length}`,
      `Тариф: ${summary.planLabel || 'Premium — 5$'}`,
      `Топ-игрок: ${summary.topLine || 'нет данных'}`
    ].join('\n'),
    footer: 'BRHD • Phoenix • Premium Leaderboard',
    image: summary.imageUrl
  }).addFields(
    section(
      'Сводка',
      [
        `Средняя репутация: ${summary.averagePoints ?? 0}/100`,
        `Суммарная репутация: ${summary.totalPoints ?? 0}`,
        `Голос семьи: ${summary.totalVoiceHours ?? 0} ч`
      ].join('\n'),
      true
    ),
    section('Рейтинг', content, false)
  );
}

function buildVoiceActivityEmbed(entries, summary = {}) {
  const content = entries.length ? entries.join('\n') : copy.stats.voiceEmpty;

  return card({
    title: `${copy.stats.voiceTitle} • Phoenix`,
    color: THEME.royal,
    description: [
      'Премиальный мониторинг голосовой активности семьи.',
      '',
      `Участников в голосовом рейтинге: ${summary.memberCount ?? entries.length}`,
      `Тариф: ${summary.planLabel || 'Premium — 5$'}`,
      `Лидер голоса: ${summary.topLine || 'нет данных'}`
    ].join('\n'),
    footer: 'BRHD • Phoenix • Premium Voice',
    image: summary.imageUrl
  }).addFields(
    section(
      'Сводка',
      [
        `Суммарно часов: ${summary.totalHours ?? 0} ч`,
        `Среднее на участника: ${summary.averageHours ?? 0} ч`,
        `Репутация ядра: ${summary.totalPoints ?? 0}`
      ].join('\n'),
      true
    ),
    section('Топ по голосу', content, false)
  );
}

function buildAdminPanelEmbed({ guildName, record }) {
  const settings = record.settings || {};
  const channels = settings.channels || {};
  const roles = settings.roles || {};
  const visuals = settings.visuals || {};
  const modules = settings.modules || {};
  const automod = settings.automod || {};
  const welcome = settings.welcome || {};
  const verification = settings.verification || {};
  const reportSchedule = settings.reportSchedule || {};
  const reactionRoles = Array.isArray(settings.reactionRoles) ? settings.reactionRoles : [];
  const roleMenus = Array.isArray(settings.roleMenus) ? settings.roleMenus : [];
  const customCommands = Array.isArray(settings.customCommands) ? settings.customCommands : [];
  const isPremium = record.plan === 'premium';
  const planLabel = isPremium ? copy.admin.panelPremium : copy.admin.panelFree;
  const mode = settings.mode || 'hybrid';

  const moduleLines = [
    `Family: ${modules.family ? 'ON' : 'OFF'}`,
    `Applications: ${modules.applications ? 'ON' : 'OFF'}`,
    `Moderation: ${modules.moderation ? 'ON' : 'OFF'}`,
    `Security: ${modules.security ? 'ON' : 'OFF'}`,
    `Analytics: ${modules.analytics ? 'ON' : 'OFF'}`,
    `AI: ${modules.ai ? 'ON' : 'OFF'}`,
    `Welcome: ${modules.welcome ? 'ON' : 'OFF'}`,
    `Automod: ${modules.automod ? 'ON' : 'OFF'}`,
    `Subscriptions: ${modules.subscriptions ? 'ON' : 'OFF'}`,
    `Custom Commands: ${modules.customCommands ? 'ON' : 'OFF'}`,
    `Music: ${modules.music ? 'ON' : 'OFF'}`
  ];

  return card({
    title: copy.admin.panelTitle,
    color: isPremium ? THEME.gold : THEME.brand,
    description: `Сервер: **${guildName}**`,
    footer: 'BRHD • Phoenix • Administration'
  }).addFields(
    section(
      'Статус',
      [
        `Тариф: ${planLabel}`,
        `Setup: ${record.setupCompleted ? copy.admin.panelSetupDone : copy.admin.panelSetupPending}`,
        `Режим: ${mode}`
      ].join('\n'),
      true
    ),
    section('Возможности', copy.admin.panelFeatures(record.plan), true),
    section(
      copy.admin.panelFieldChannels,
      [
        channelLine('Панель', channels.panel),
        channelLine('Подача заявки', channels.applications),
        channelLine('Welcome', channels.welcome),
        channelLine('Правила', channels.rules),
        channelLine('Логи', channels.logs),
        channelLine('Дисциплина', channels.disciplineLogs),
        channelLine('Апдейты', channels.updates),
        channelLine('Отчёты', channels.reports),
        channelLine('Automod', channels.automod)
      ].join('\n'),
      false
    ),
    section(
      copy.admin.panelFieldRoles,
      [
        roleLine('Лидер', roles.leader),
        roleLine('Зам', roles.deputy),
        roleLine('Старший', roles.elder),
        roleLine('Участник', roles.member),
        roleLine('Новичок', roles.newbie),
        roleLine('Мут', roles.mute),
        roleLine('Автороль', roles.autorole),
        roleLine('После подтверждения', roles.verification)
      ].join('\n'),
      false
    ),
    section('Модули', moduleLines.join('\n'), false),
    section(
      'Welcome',
      [
        `Статус: ${welcome.enabled ? 'ON' : 'OFF'}`,
        `ЛС: ${welcome.dmEnabled ? 'ON' : 'OFF'}`,
        `Текст: ${welcome.message ? 'задан' : 'не задан'}`
      ].join('\n'),
      true
    ),
    section(
      'Verification',
      [
        `Статус: ${verification.enabled ? 'ON' : 'OFF'}`,
        `Анкета: ${verification.questionnaireEnabled ? 'ON' : 'OFF'}`,
        `Роль: ${verification.roleId ? `<@&${verification.roleId}>` : 'не задана'}`
      ].join('\n'),
      true
    ),
    section(
      'Role Menus',
      [`Меню: ${roleMenus.length}`, `Старые reaction roles: ${reactionRoles.length}`].join('\n'),
      true
    ),
    section(
      'Custom Commands',
      [`Триггеры: ${customCommands.length}`, `Premium: ${isPremium ? 'ON' : 'OFF'}`].join('\n'),
      true
    ),
    section(
      'Reports',
      [
        `Weekly: ${reportSchedule.weekly?.enabled ? 'ON' : 'OFF'}`,
        `Канал weekly: ${reportSchedule.weekly?.channelId ? `<#${reportSchedule.weekly.channelId}>` : 'не задан'}`,
        `Monthly: ${reportSchedule.monthly?.enabled ? 'ON' : 'OFF'}`,
        `Канал monthly: ${reportSchedule.monthly?.channelId ? `<#${reportSchedule.monthly.channelId}>` : 'не задан'}`
      ].join('\n'),
      false
    ),
    section(
      'Automod',
      [
        `Инвайты: ${automod.invitesEnabled ? 'ON' : 'OFF'}`,
        `Ссылки: ${automod.linksEnabled ? 'ON' : 'OFF'}`,
        `Капс: ${automod.capsEnabled ? `ON (${automod.capsPercent || 75}% / ${automod.capsMinLength || 12}+ букв)` : 'OFF'}`,
        `Упоминания: ${automod.mentionsEnabled ? `ON (${automod.mentionLimit || 5})` : 'OFF'}`,
        `Флуд: ${automod.spamEnabled ? `ON (${automod.spamCount || 6} / ${automod.spamWindowSeconds || 8}с)` : 'OFF'}`,
        `Стоп-слова: ${automod.badWordsEnabled ? `ON (${(automod.badWords || []).length})` : 'OFF'}`,
        `Наказание: ${automod.actionMode === 'hard' ? 'жёсткое' : 'мягкое'}`
      ].join('\n'),
      false
    ),
    section(
      copy.admin.panelFieldVisuals,
      [
        copy.admin.visualLine('Панель семьи', visuals.familyBanner),
        copy.admin.visualLine('Подача заявки', visuals.applicationsBanner)
      ].join('\n'),
      false
    )
  );
}

module.exports.buildRoleMenuStatusEmbed = buildRoleMenuStatusEmbed;
module.exports.buildRoleMenuEmbed = buildRoleMenuEmbed;
module.exports.buildCustomCommandsEmbed = buildCustomCommandsEmbed;
module.exports.buildWelcomeEmbed = buildWelcomeEmbed;
module.exports.buildAutomodStatusEmbed = buildAutomodStatusEmbed;
module.exports.buildReportScheduleEmbed = buildReportScheduleEmbed;
module.exports.buildLeaderboardEmbed = buildLeaderboardEmbed;
module.exports.buildVoiceActivityEmbed = buildVoiceActivityEmbed;
module.exports.buildAdminPanelEmbed = buildAdminPanelEmbed;

function buildSummaryLinesUtf8(summary = {}) {
  return [
    `**Всего участников:** ${summary.totalMembers ?? 0}`,
    `**С ролями / без ролей:** ${summary.membersWithFamilyRoles ?? 0} / ${summary.membersWithoutFamilyRoles ?? 0}`,
    `**Заявок на рассмотрении:** ${summary.pendingApplications ?? 0}`,
    `**AFK-рисков:** ${summary.afkRiskCount ?? 0}`,
    `**Тариф:** ${summary.planLabel || 'Free - 0$'}`,
    `**Статусы:** 🟢 ${summary.onlineCount ?? 0} • 🟡 ${summary.idleCount ?? 0} • ⛔ ${summary.dndCount ?? 0} • ⚫ ${summary.offlineCount ?? 0}`,
    `**Топ-1 активности:** ${summary.topMemberLine || 'нет данных'}`,
    `**Последнее обновление:** ${summary.lastUpdatedLabel || 'сейчас'}`
  ];
}

function buildFamilyMenuEmbedUtf8({ imageUrl, summary } = {}) {
  return card({
    title: copy.family.menuTitle,
    color: THEME.brand,
    description: [
      'Панель семьи v2 в стиле BRHD / Phoenix.',
      '',
      ...buildSummaryLinesUtf8(summary),
      '',
      `• ${copy.family.refreshButton} — обновить состав, активность и ранги`,
      `• ${copy.family.profileButton} — открыть свой профиль`,
      `• ${copy.family.leaderboardButton} — лидерборд по очкам`,
      `• ${copy.family.voiceButton} — топ по голосовой активности`,
      `• ${copy.family.applyButton} — открыть анкету кандидата`
    ].join('\n'),
    footer: 'BRHD / Phoenix / Family Control',
    image: imageUrl
  });
}

function buildHelpEmbedUtf8({ plan, regularCommands = [], adminCommands = [], premiumRegularCommands = [], premiumAdminCommands = [] }) {
  const embed = card({
    title: copy.help.title(plan),
    color: plan === 'premium' ? THEME.gold : THEME.brand,
    description: 'Команды разделены по ролям и тарифу.',
    footer: 'BRHD / Phoenix / Help'
  });

  const sections = [
    [copy.help.regularSection, regularCommands],
    [copy.help.adminSection, adminCommands],
    [copy.help.premiumRegularSection, premiumRegularCommands],
    [copy.help.premiumAdminSection, premiumAdminCommands]
  ];

  for (const [name, commands] of sections) {
    embed.addFields(section(name, (commands && commands.length ? commands.join('\n') : copy.help.none), false));
  }

  return embed;
}

function buildUpdateAnnouncementEmbedUtf8({ versionLabel, semver, buildId, commitMessage = '', changeLines = {} }) {
  const embed = card({
    title: '🚀 Бот получил обновление',
    color: THEME.gold,
    description: `${versionLabel}\nСборка успешно развёрнута на сервере.`,
    footer: 'BRHD / Phoenix / Updates'
  });

  embed.addFields(
    section(
      'Версия',
      [
        `Лейбл: ${versionLabel}`,
        `Semver: ${semver}`,
        `Build: ${buildId}`
      ].join('\n'),
      true
    ),
    section('Коммит', commitMessage || 'deploy update', true)
  );

  if (Array.isArray(changeLines.added) && changeLines.added.length) {
    embed.addFields(section('Добавлено', changeLines.added.map(item => `• ${item}`).join('\n'), false));
  }

  if (Array.isArray(changeLines.updated) && changeLines.updated.length) {
    embed.addFields(section('Обновлено', changeLines.updated.map(item => `• ${item}`).join('\n'), false));
  }

  if (Array.isArray(changeLines.fixed) && changeLines.fixed.length) {
    embed.addFields(section('Исправлено', changeLines.fixed.map(item => `• ${item}`).join('\n'), false));
  }

  embed.addFields(section('Итог', 'Обновление успешно применено и разложено по понятным пунктам.', false));
  return embed;
}

function buildWelcomeStatusEmbedUtf8({ enabled, channelId, dmEnabled, message = '', autoroleRoleId = '' } = {}) {
  return card({
    title: copy.welcome.statusTitle,
    color: enabled ? THEME.emerald : THEME.slate,
    description: [
      `Статус: ${enabled ? copy.welcome.enabled : copy.welcome.disabled}`,
      `Канал: ${channelId ? `<#${channelId}>` : 'не задан'}`,
      `ЛС: ${dmEnabled ? 'включены' : 'выключены'}`,
      `Автороль: ${autoroleRoleId ? `<@&${autoroleRoleId}>` : 'не задана'}`,
      `Текст: ${message ? 'задан' : 'не задан'}`
    ].join('\n'),
    footer: 'BRHD / Phoenix / Welcome'
  });
}

function buildAutoroleStatusEmbedUtf8(roleId = '') {
  return card({
    title: '🔖 Автороль',
    color: THEME.brand,
    description: `Текущая роль: ${roleId ? `<@&${roleId}>` : 'не задана'}`,
    footer: 'BRHD / Phoenix / Autorole'
  });
}

function buildReactionRoleStatusEmbedUtf8(entries = []) {
  const lines = (Array.isArray(entries) ? entries : []).map((entry, index) =>
    `${index + 1}. ${entry.emoji || '•'} • <@&${entry.roleId}> • \`${entry.messageId}\``
  );
  return card({
    title: copy.reactionRoles.title,
    color: THEME.brand,
    description: lines.length ? lines.join('\n') : copy.reactionRoles.empty,
    footer: 'BRHD / Phoenix / Reaction Roles'
  });
}

function buildVerificationStatusEmbedUtf8(config = {}) {
  return card({
    title: copy.verification.title,
    color: config.enabled ? THEME.emerald : THEME.slate,
    description: [
      `Статус: ${config.enabled ? 'включено' : 'выключено'}`,
      `Роль после подтверждения: ${config.roleId ? `<@&${config.roleId}>` : 'не задана'}`,
      `Анкета: ${config.questionnaireEnabled ? 'включена' : 'выключена'}`
    ].join('\n'),
    footer: 'BRHD / Phoenix / Verification'
  });
}

function buildRoleMenuStatusEmbedUtf8(menus = []) {
  const lines = (Array.isArray(menus) ? menus : []).flatMap((menu) => {
    const head = `• \`${menu.menuId}\` — ${menu.title}${menu.category ? ` [${menu.category}]` : ''}`;
    const items = (menu.items || []).slice(0, 5).map((item) => `  - ${item.emoji ? `${item.emoji} ` : ''}${item.label} -> <@&${item.roleId}>`);
    return [head, ...items];
  });

  return card({
    title: `🎛️ ${copy.roleMenus.title}`,
    color: THEME.brand,
    description: lines.length ? lines.join('\n') : copy.roleMenus.empty,
    footer: 'BRHD / Phoenix / Role Menu'
  });
}

function buildRoleMenuEmbedUtf8(menu = {}) {
  const lines = (menu.items || []).map((item) => `${item.emoji ? `${item.emoji} ` : ''}${item.label} — <@&${item.roleId}>`);
  return card({
    title: menu.title || copy.roleMenus.title,
    color: THEME.brand,
    description: [
      menu.category ? `Категория: **${menu.category}**` : '',
      menu.description || '',
      '',
      lines.length ? lines.join('\n') : 'Пункты пока не добавлены.'
    ].filter(Boolean).join('\n'),
    footer: 'BRHD / Phoenix / Role Menu'
  });
}

function buildCustomCommandsEmbedUtf8(commands = []) {
  const lines = (Array.isArray(commands) ? commands : []).map((command) => `• \`${command.name}\` — ${command.trigger} (${command.mode})`);
  return card({
    title: `🧩 ${copy.customCommands.title}`,
    color: THEME.royal,
    description: lines.length ? lines.join('\n') : copy.customCommands.empty,
    footer: 'BRHD / Phoenix / Custom Commands'
  });
}

function buildWelcomeEmbedUtf8(member, familyTitle, imageUrl = '', customMessage = '', extras = {}) {
  return card({
    title: `Добро пожаловать в ${familyTitle || 'Phoenix'}`,
    color: THEME.emerald,
    description: [
      customMessage || `Рады видеть тебя в семье **${familyTitle}** на сервере **${member.guild?.name || 'Phoenix'}**.`,
      '',
      extras.rulesChannelId ? `• Правила: <#${extras.rulesChannelId}>` : '',
      extras.applicationsChannelId ? `• Подача заявки: <#${extras.applicationsChannelId}>` : '',
      extras.verificationEnabled ? '• Подтверди доступ кнопкой ниже, чтобы получить стартовую роль.' : ''
    ].filter(Boolean).join('\n'),
    footer: 'BRHD / Phoenix / Welcome',
    thumbnail: avatarUrl(member.user),
    image: imageUrl
  }).addFields(
    section(
      'Старт',
      [
        '1. Изучи правила сервера',
        '2. Пройди подтверждение',
        '3. Открой панель семьи и подай заявку'
      ].join('\n'),
      false
    )
  );
}

function buildAutomodStatusEmbedUtf8(config = {}, automodChannelId = '') {
  return card({
    title: '🛡️ Automod',
    color: THEME.ruby,
    description: [
      `Инвайты: ${config.invitesEnabled ? 'ON' : 'OFF'}`,
      `Ссылки: ${config.linksEnabled ? 'ON' : 'OFF'}`,
      `Капс: ${config.capsEnabled ? `ON (${config.capsPercent || 75}% / ${config.capsMinLength || 12}+)` : 'OFF'}`,
      `Упоминания: ${config.mentionsEnabled ? `ON (${config.mentionLimit || 5})` : 'OFF'}`,
      `Флуд: ${config.spamEnabled ? `ON (${config.spamCount || 6}/${config.spamWindowSeconds || 8}с)` : 'OFF'}`,
      `Стоп-слова: ${config.badWordsEnabled ? `ON (${(config.badWords || []).length})` : 'OFF'}`,
      `Наказание: ${config.actionMode === 'hard' ? 'жёсткое' : 'мягкое'}`,
      `Логи automod: ${automodChannelId ? `<#${automodChannelId}>` : 'не заданы'}`
    ].join('\n'),
    footer: 'BRHD / Phoenix / Automod'
  });
}

function buildReportScheduleEmbedUtf8(schedule = {}, channels = {}) {
  const weekly = schedule.weekly || {};
  const monthly = schedule.monthly || {};

  return card({
    title: copy.reports.title,
    color: THEME.royal,
    description: [
      `Weekly: ${weekly.enabled ? 'ON' : 'OFF'}`,
      `Канал weekly: ${weekly.channelId ? `<#${weekly.channelId}>` : (channels.reports ? `<#${channels.reports}>` : 'не задан')}`,
      '',
      `Monthly: ${monthly.enabled ? 'ON' : 'OFF'}`,
      `Канал monthly: ${monthly.channelId ? `<#${monthly.channelId}>` : (channels.reports ? `<#${channels.reports}>` : 'не задан')}`
    ].join('\n'),
    footer: 'BRHD / Phoenix / Reports'
  });
}

function buildLeaderboardEmbedUtf8(entries, summary = {}) {
  const content = entries.length ? entries.join('\n') : copy.stats.leaderboardEmpty;

  return card({
    title: `${copy.stats.leaderboardTitle} • Phoenix`,
    color: THEME.gold,
    description: [
      copy.stats.leaderboardDescription,
      '',
      `Участников в рейтинге: ${summary.memberCount ?? entries.length}`,
      `Тариф: ${summary.planLabel || 'Premium - 5$'}`,
      `Топ-игрок: ${summary.topLine || 'нет данных'}`
    ].join('\n'),
    footer: 'BRHD / Phoenix / Premium Leaderboard',
    image: summary.imageUrl
  }).addFields(
    section(
      'Сводка',
      [
        `Средняя репутация: ${summary.averagePoints ?? 0}/100`,
        `Суммарная репутация: ${summary.totalPoints ?? 0}`,
        `Голос семьи: ${summary.totalVoiceHours ?? 0} ч`
      ].join('\n'),
      true
    ),
    section('Рейтинг', content, false)
  );
}

function buildVoiceActivityEmbedUtf8(entries, summary = {}) {
  const content = entries.length ? entries.join('\n') : copy.stats.voiceEmpty;

  return card({
    title: `${copy.stats.voiceTitle} • Phoenix`,
    color: THEME.royal,
    description: [
      copy.stats.voiceDescription,
      '',
      `Участников в голосовом рейтинге: ${summary.memberCount ?? entries.length}`,
      `Тариф: ${summary.planLabel || 'Premium - 5$'}`,
      `Лидер голоса: ${summary.topLine || 'нет данных'}`
    ].join('\n'),
    footer: 'BRHD / Phoenix / Premium Voice',
    image: summary.imageUrl
  }).addFields(
    section(
      'Сводка',
      [
        `Суммарно часов: ${summary.totalHours ?? 0} ч`,
        `Среднее на участника: ${summary.averageHours ?? 0} ч`,
        `Репутация ядра: ${summary.totalPoints ?? 0}`
      ].join('\n'),
      true
    ),
    section('Топ по голосу', content, false)
  );
}

function buildAdminPanelEmbedUtf8({ guildName, record }) {
  const settings = record.settings || {};
  const channels = settings.channels || {};
  const roles = settings.roles || {};
  const visuals = settings.visuals || {};
  const modules = settings.modules || {};
  const automod = settings.automod || {};
  const welcome = settings.welcome || {};
  const verification = settings.verification || {};
  const reportSchedule = settings.reportSchedule || {};
  const reactionRoles = Array.isArray(settings.reactionRoles) ? settings.reactionRoles : [];
  const roleMenus = Array.isArray(settings.roleMenus) ? settings.roleMenus : [];
  const customCommands = Array.isArray(settings.customCommands) ? settings.customCommands : [];
  const isPremium = record.plan === 'premium';
  const planLabel = isPremium ? copy.admin.panelPremium : copy.admin.panelFree;
  const mode = settings.mode || 'hybrid';

  const moduleLines = [
    `Family: ${modules.family ? 'ON' : 'OFF'}`,
    `Applications: ${modules.applications ? 'ON' : 'OFF'}`,
    `Moderation: ${modules.moderation ? 'ON' : 'OFF'}`,
    `Security: ${modules.security ? 'ON' : 'OFF'}`,
    `Analytics: ${modules.analytics ? 'ON' : 'OFF'}`,
    `AI: ${modules.ai ? 'ON' : 'OFF'}`,
    `Welcome: ${modules.welcome ? 'ON' : 'OFF'}`,
    `Automod: ${modules.automod ? 'ON' : 'OFF'}`,
    `Subscriptions: ${modules.subscriptions ? 'ON' : 'OFF'}`,
    `Custom Commands: ${modules.customCommands ? 'ON' : 'OFF'}`,
    `Music: ${modules.music ? 'ON' : 'OFF'}`
  ];

  return card({
    title: copy.admin.panelTitle,
    color: isPremium ? THEME.gold : THEME.brand,
    description: `Сервер: **${guildName}**`,
    footer: 'BRHD / Phoenix / Administration'
  }).addFields(
    section('Статус', [`Тариф: ${planLabel}`, `Setup: ${record.setupCompleted ? copy.admin.panelSetupDone : copy.admin.panelSetupPending}`, `Режим: ${mode}`].join('\n'), true),
    section('Возможности', copy.admin.panelFeatures(record.plan), true),
    section(
      copy.admin.panelFieldChannels,
      [
        channelLine('Панель', channels.panel),
        channelLine('Подача заявки', channels.applications),
        channelLine('Welcome', channels.welcome),
        channelLine('Правила', channels.rules),
        channelLine('Логи', channels.logs),
        channelLine('Дисциплина', channels.disciplineLogs),
        channelLine('Апдейты', channels.updates),
        channelLine('Отчёты', channels.reports),
        channelLine('Automod', channels.automod)
      ].join('\n'),
      false
    ),
    section(
      copy.admin.panelFieldRoles,
      [
        roleLine('Лидер', roles.leader),
        roleLine('Зам', roles.deputy),
        roleLine('Старший', roles.elder),
        roleLine('Участник', roles.member),
        roleLine('Новичок', roles.newbie),
        roleLine('Мут', roles.mute),
        roleLine('Автороль', roles.autorole),
        roleLine('После подтверждения', roles.verification)
      ].join('\n'),
      false
    ),
    section('Модули', moduleLines.join('\n'), false),
    section('Welcome', [`Статус: ${welcome.enabled ? 'ON' : 'OFF'}`, `ЛС: ${welcome.dmEnabled ? 'ON' : 'OFF'}`, `Текст: ${welcome.message ? 'задан' : 'не задан'}`].join('\n'), true),
    section('Verification', [`Статус: ${verification.enabled ? 'ON' : 'OFF'}`, `Анкета: ${verification.questionnaireEnabled ? 'ON' : 'OFF'}`, `Роль: ${verification.roleId ? `<@&${verification.roleId}>` : 'не задана'}`].join('\n'), true),
    section('Role Menus', [`Меню: ${roleMenus.length}`, `Старые reaction roles: ${reactionRoles.length}`].join('\n'), true),
    section('Custom Commands', [`Триггеры: ${customCommands.length}`, `Premium: ${isPremium ? 'ON' : 'OFF'}`].join('\n'), true),
    section('Reports', [`Weekly: ${reportSchedule.weekly?.enabled ? 'ON' : 'OFF'}`, `Канал weekly: ${reportSchedule.weekly?.channelId ? `<#${reportSchedule.weekly.channelId}>` : 'не задан'}`, `Monthly: ${reportSchedule.monthly?.enabled ? 'ON' : 'OFF'}`, `Канал monthly: ${reportSchedule.monthly?.channelId ? `<#${reportSchedule.monthly.channelId}>` : 'не задан'}`].join('\n'), false),
    section('Automod', [`Инвайты: ${automod.invitesEnabled ? 'ON' : 'OFF'}`, `Ссылки: ${automod.linksEnabled ? 'ON' : 'OFF'}`, `Капс: ${automod.capsEnabled ? `ON (${automod.capsPercent || 75}% / ${automod.capsMinLength || 12}+ букв)` : 'OFF'}`, `Упоминания: ${automod.mentionsEnabled ? `ON (${automod.mentionLimit || 5})` : 'OFF'}`, `Флуд: ${automod.spamEnabled ? `ON (${automod.spamCount || 6} / ${automod.spamWindowSeconds || 8}с)` : 'OFF'}`, `Стоп-слова: ${automod.badWordsEnabled ? `ON (${(automod.badWords || []).length})` : 'OFF'}`, `Наказание: ${automod.actionMode === 'hard' ? 'жёсткое' : 'мягкое'}`].join('\n'), false),
    section(copy.admin.panelFieldVisuals, [copy.admin.visualLine('Панель семьи', visuals.familyBanner), copy.admin.visualLine('Подача заявки', visuals.applicationsBanner)].join('\n'), false)
  );
}

module.exports.buildFamilyMenuEmbed = buildFamilyMenuEmbedUtf8;
module.exports.buildHelpEmbed = buildHelpEmbedUtf8;
module.exports.buildUpdateAnnouncementEmbed = buildUpdateAnnouncementEmbedUtf8;
module.exports.buildWelcomeStatusEmbed = buildWelcomeStatusEmbedUtf8;
module.exports.buildAutoroleStatusEmbed = buildAutoroleStatusEmbedUtf8;
module.exports.buildReactionRoleStatusEmbed = buildReactionRoleStatusEmbedUtf8;
module.exports.buildVerificationStatusEmbed = buildVerificationStatusEmbedUtf8;
module.exports.buildRoleMenuStatusEmbed = buildRoleMenuStatusEmbedUtf8;
module.exports.buildRoleMenuEmbed = buildRoleMenuEmbedUtf8;
module.exports.buildCustomCommandsEmbed = buildCustomCommandsEmbedUtf8;
module.exports.buildWelcomeEmbed = buildWelcomeEmbedUtf8;
module.exports.buildAutomodStatusEmbed = buildAutomodStatusEmbedUtf8;
module.exports.buildReportScheduleEmbed = buildReportScheduleEmbedUtf8;
module.exports.buildLeaderboardEmbed = buildLeaderboardEmbedUtf8;
module.exports.buildVoiceActivityEmbed = buildVoiceActivityEmbedUtf8;
module.exports.buildAdminPanelEmbed = buildAdminPanelEmbedUtf8;

function renderHelpCommandsFinal(commands = []) {
  if (!Array.isArray(commands) || !commands.length) {
    return copy.help.none;
  }

  return commands
    .map((command) => {
      if (typeof command === 'string') return command;
      return copy.help.line(command.name, command.description);
    })
    .join('\n');
}

function buildFamilySummaryLinesFinal(summary = {}) {
  return [
    `**Всего участников:** ${summary.totalMembers ?? 0}`,
    `**С ролями / без ролей:** ${summary.membersWithFamilyRoles ?? 0} / ${summary.membersWithoutFamilyRoles ?? 0}`,
    `**Заявок на рассмотрении:** ${summary.pendingApplications ?? 0}`,
    `**AFK-рисков:** ${summary.afkRiskCount ?? 0}`,
    `**Тариф:** ${summary.planLabel || 'Free - 0$'}`,
    `**Статусы:** 🟢 ${summary.onlineCount ?? 0} • 🌙 ${summary.idleCount ?? 0} • ⛔ ${summary.dndCount ?? 0} • ⚫ ${summary.offlineCount ?? 0}`,
    `**Топ-1 активности:** ${summary.topMemberLine || 'нет данных'}`,
    `**Последнее обновление:** ${summary.lastUpdatedLabel || 'сейчас'}`
  ];
}

function buildFamilyEmbedsFinal(guild, { roles, familyTitle, updateIntervalMs, activityScore, summary = {}, imageUrl }) {
  const configuredRoles = roles
    .map((item) => ({ ...item, role: guild.roles.cache.get(item.id) }))
    .filter((item) => item.role)
    .sort((a, b) => b.role.position - a.role.position);

  const assignedMemberIds = new Set();
  const roleSnapshots = configuredRoles.map((item) => {
    const uniqueMembers = Array.from(item.role.members.values())
      .filter((member) => {
        if (assignedMemberIds.has(member.id)) return false;
        assignedMemberIds.add(member.id);
        return true;
      });

    return {
      ...item,
      members: sortMembers(uniqueMembers, activityScore)
    };
  });

  const totalMembers = Array.from(guild.members.cache.values()).filter((member) => !member.user?.bot).length;
  const membersWithFamilyRoles = assignedMemberIds.size;
  const membersWithoutFamilyRoles = Math.max(0, totalMembers - membersWithFamilyRoles);
  const activeRoles = roleSnapshots.filter((item) => item.members.length);
  const embeds = [];

  let currentEmbed = card({
    title: familyTitle,
    color: THEME.brand,
    description: [
      ...buildFamilySummaryLinesFinal({
        ...summary,
        totalMembers,
        membersWithFamilyRoles,
        membersWithoutFamilyRoles
      }),
      '',
      `**Активных секций:** ${activeRoles.length}`,
      `**Обновление:** каждые ${Math.floor(updateIntervalMs / 1000)} сек.`,
      '',
      '🟢 Онлайн • 🌙 Отошёл • ⛔ Не беспокоить • ⚫ Оффлайн'
    ].join('\n'),
    footer: `BRHD • Phoenix • Обновление каждые ${Math.floor(updateIntervalMs / 1000)} сек.`,
    image: imageUrl
  });
  let fieldCount = 0;

  if (!activeRoles.length) {
    currentEmbed.addFields(section('Состав', copy.family.emptyMembers, false));
    return [currentEmbed];
  }

  for (const item of activeRoles) {
    const lines = item.members.map((member) => `${getStatusEmoji(member)} <@${member.id}> • ${activityScore(member.id)} очк.`);
    const parts = chunk(lines, 15);

    for (let index = 0; index < parts.length; index += 1) {
      if (fieldCount >= 25) {
        embeds.push(currentEmbed);
        currentEmbed = card({
          title: `${familyTitle} • продолжение`,
          color: THEME.slate,
          description: 'Продолжение состава семьи.',
          footer: `BRHD • Phoenix • Обновление каждые ${Math.floor(updateIntervalMs / 1000)} сек.`
        });
        fieldCount = 0;
      }

      currentEmbed.addFields(
        section(index === 0 ? `${item.name} • ${item.members.length}` : `${item.name} • продолжение`, parts[index].join('\n'), false)
      );
      fieldCount += 1;
    }
  }

  embeds.push(currentEmbed);
  return embeds;
}

function buildFamilyMenuEmbedFinal({ imageUrl, summary } = {}) {
  return card({
    title: copy.family.menuTitle,
    color: THEME.brand,
    description: [
      'Панель семьи v2 в стиле BRHD / Phoenix.',
      '',
      ...buildFamilySummaryLinesFinal(summary),
      '',
      `• ${copy.family.refreshButton} — обновить состав, активность и ранги`,
      `• ${copy.family.profileButton} — открыть свой профиль`,
      `• ${copy.family.leaderboardButton} — лидерборд по очкам`,
      `• ${copy.family.voiceButton} — топ по голосовой активности`,
      `• ${copy.family.applyButton} — открыть анкету кандидата`
    ].join('\n'),
    footer: 'BRHD • Phoenix • Family Control',
    image: imageUrl
  });
}

function buildHelpEmbedFinal({ plan, regularCommands = [], adminCommands = [], premiumRegularCommands = [], premiumAdminCommands = [] }) {
  const embed = card({
    title: copy.help.title(plan),
    color: plan === 'premium' ? THEME.gold : THEME.brand,
    description: 'Команды разделены по ролям и тарифу.',
    footer: 'BRHD • Phoenix • Help'
  });

  const sections = [
    [copy.help.regularSection, regularCommands],
    [copy.help.adminSection, adminCommands],
    [copy.help.premiumRegularSection, premiumRegularCommands],
    [copy.help.premiumAdminSection, premiumAdminCommands]
  ];

  for (const [name, commands] of sections) {
    embed.addFields(section(name, renderHelpCommandsFinal(commands), false));
  }

  return embed;
}

function buildUpdateAnnouncementEmbedFinal({ versionLabel, semver, buildId, commitMessage = '', changeLines = {} }) {
  const embed = card({
    title: '🚀 Бот получил обновление',
    color: THEME.gold,
    description: `${versionLabel}\nСборка успешно развернута на сервере.`,
    footer: 'BRHD • Phoenix • Updates'
  });

  embed.addFields(
    section('Версия', [`Лейбл: ${versionLabel}`, `Semver: ${semver}`, `Build: ${buildId}`].join('\n'), true),
    section('Коммит', commitMessage || 'deploy update', true)
  );

  if (Array.isArray(changeLines.added) && changeLines.added.length) {
    embed.addFields(section('Добавлено', changeLines.added.map((item) => `• ${item}`).join('\n'), false));
  }
  if (Array.isArray(changeLines.updated) && changeLines.updated.length) {
    embed.addFields(section('Обновлено', changeLines.updated.map((item) => `• ${item}`).join('\n'), false));
  }
  if (Array.isArray(changeLines.fixed) && changeLines.fixed.length) {
    embed.addFields(section('Исправлено', changeLines.fixed.map((item) => `• ${item}`).join('\n'), false));
  }

  embed.addFields(section('Итог', 'Обновление успешно применено и разложено по понятным пунктам.', false));
  return embed;
}

function buildWelcomeStatusEmbedFinal({ enabled, channelId, dmEnabled, message = '', autoroleRoleId = '' } = {}) {
  return card({
    title: copy.welcome.statusTitle,
    color: enabled ? THEME.emerald : THEME.slate,
    description: [
      `Статус: ${enabled ? copy.welcome.enabled : copy.welcome.disabled}`,
      `Канал: ${channelId ? `<#${channelId}>` : 'не задан'}`,
      `ЛС: ${dmEnabled ? 'включены' : 'выключены'}`,
      `Автороль: ${autoroleRoleId ? `<@&${autoroleRoleId}>` : 'не задана'}`,
      `Текст: ${message ? 'задан' : 'не задан'}`
    ].join('\n'),
    footer: 'BRHD • Phoenix • Welcome'
  });
}

function buildAutoroleStatusEmbedFinal(roleId = '') {
  return card({
    title: '🔖 Автороль',
    color: THEME.brand,
    description: `Текущая роль: ${roleId ? `<@&${roleId}>` : 'не задана'}`,
    footer: 'BRHD • Phoenix • Autorole'
  });
}

function buildReactionRoleStatusEmbedFinal(entries = []) {
  const lines = (Array.isArray(entries) ? entries : []).map((entry, index) => `${index + 1}. ${entry.emoji || '•'} • <@&${entry.roleId}> • \`${entry.messageId}\``);
  return card({
    title: copy.reactionRoles.title,
    color: THEME.brand,
    description: lines.length ? lines.join('\n') : copy.reactionRoles.empty,
    footer: 'BRHD • Phoenix • Reaction Roles'
  });
}

function buildVerificationStatusEmbedFinal(config = {}) {
  return card({
    title: copy.verification.title,
    color: config.enabled ? THEME.emerald : THEME.slate,
    description: [
      `Статус: ${config.enabled ? 'включено' : 'выключено'}`,
      `Роль после подтверждения: ${config.roleId ? `<@&${config.roleId}>` : 'не задана'}`,
      `Анкета: ${config.questionnaireEnabled ? 'включена' : 'выключена'}`
    ].join('\n'),
    footer: 'BRHD • Phoenix • Verification'
  });
}

function buildRoleMenuStatusEmbedFinal(menus = []) {
  const lines = (Array.isArray(menus) ? menus : []).flatMap((menu) => {
    const head = `• \`${menu.menuId}\` — ${menu.title}${menu.category ? ` [${menu.category}]` : ''}`;
    const items = (menu.items || []).slice(0, 5).map((item) => `  - ${item.emoji ? `${item.emoji} ` : ''}${item.label} -> <@&${item.roleId}>`);
    return [head, ...items];
  });

  return card({
    title: `🎛️ ${copy.roleMenus.title}`,
    color: THEME.brand,
    description: lines.length ? lines.join('\n') : copy.roleMenus.empty,
    footer: 'BRHD • Phoenix • Role Menu'
  });
}

function buildRoleMenuEmbedFinal(menu = {}) {
  const lines = (menu.items || []).map((item) => `${item.emoji ? `${item.emoji} ` : ''}${item.label} — <@&${item.roleId}>`);
  return card({
    title: menu.title || copy.roleMenus.title,
    color: THEME.brand,
    description: [
      menu.category ? `Категория: **${menu.category}**` : '',
      menu.description || '',
      '',
      lines.length ? lines.join('\n') : 'Пункты пока не добавлены.'
    ].filter(Boolean).join('\n'),
    footer: 'BRHD • Phoenix • Role Menu'
  });
}

function buildCustomCommandsEmbedFinal(commands = []) {
  const lines = (Array.isArray(commands) ? commands : []).map((command) => `• \`${command.name}\` — ${command.trigger} (${command.mode})`);
  return card({
    title: `🧩 ${copy.customCommands.title}`,
    color: THEME.royal,
    description: lines.length ? lines.join('\n') : copy.customCommands.empty,
    footer: 'BRHD • Phoenix • Custom Commands'
  });
}

function buildWelcomeEmbedFinal(member, familyTitle, imageUrl = '', customMessage = '', extras = {}) {
  return card({
    title: `Добро пожаловать в ${familyTitle || 'Phoenix'}`,
    color: THEME.emerald,
    description: [
      customMessage || `Рады видеть тебя в семье **${familyTitle}** на сервере **${member.guild?.name || 'Phoenix'}**.`,
      '',
      extras.rulesChannelId ? `• Правила: <#${extras.rulesChannelId}>` : '',
      extras.applicationsChannelId ? `• Подача заявки: <#${extras.applicationsChannelId}>` : '',
      extras.verificationEnabled ? '• Подтверди доступ кнопкой ниже, чтобы получить стартовую роль.' : ''
    ].filter(Boolean).join('\n'),
    footer: 'BRHD • Phoenix • Welcome',
    thumbnail: avatarUrl(member.user),
    image: imageUrl
  }).addFields(section('Старт', ['1. Изучи правила сервера', '2. Пройди подтверждение', '3. Открой панель семьи и подай заявку'].join('\n'), false));
}

function buildAutomodStatusEmbedFinal(config = {}, automodChannelId = '') {
  return card({
    title: '🛡️ Automod',
    color: THEME.ruby,
    description: [
      `Инвайты: ${config.invitesEnabled ? 'ON' : 'OFF'}`,
      `Ссылки: ${config.linksEnabled ? 'ON' : 'OFF'}`,
      `Капс: ${config.capsEnabled ? `ON (${config.capsPercent || 75}% / ${config.capsMinLength || 12}+)` : 'OFF'}`,
      `Упоминания: ${config.mentionsEnabled ? `ON (${config.mentionLimit || 5})` : 'OFF'}`,
      `Флуд: ${config.spamEnabled ? `ON (${config.spamCount || 6}/${config.spamWindowSeconds || 8}с)` : 'OFF'}`,
      `Стоп-слова: ${config.badWordsEnabled ? `ON (${(config.badWords || []).length})` : 'OFF'}`,
      `Наказание: ${config.actionMode === 'hard' ? 'жёсткое' : 'мягкое'}`,
      `Логи automod: ${automodChannelId ? `<#${automodChannelId}>` : 'не заданы'}`
    ].join('\n'),
    footer: 'BRHD • Phoenix • Automod'
  });
}

function buildReportScheduleEmbedFinal(schedule = {}, channels = {}) {
  const weekly = schedule.weekly || {};
  const monthly = schedule.monthly || {};

  return card({
    title: copy.reports.title,
    color: THEME.royal,
    description: [
      `Weekly: ${weekly.enabled ? 'ON' : 'OFF'}`,
      `Канал weekly: ${weekly.channelId ? `<#${weekly.channelId}>` : (channels.reports ? `<#${channels.reports}>` : 'не задан')}`,
      '',
      `Monthly: ${monthly.enabled ? 'ON' : 'OFF'}`,
      `Канал monthly: ${monthly.channelId ? `<#${monthly.channelId}>` : (channels.reports ? `<#${channels.reports}>` : 'не задан')}`
    ].join('\n'),
    footer: 'BRHD • Phoenix • Reports'
  });
}

function buildLeaderboardEmbedFinal(entries, summary = {}) {
  const content = entries.length ? entries.join('\n') : copy.stats.leaderboardEmpty;

  return card({
    title: `${copy.stats.leaderboardTitle} • Phoenix`,
    color: THEME.gold,
    description: [
      copy.stats.leaderboardDescription,
      '',
      `Участников в рейтинге: ${summary.memberCount ?? entries.length}`,
      `Тариф: ${summary.planLabel || 'Premium - 5$'}`,
      `Топ-игрок: ${summary.topLine || 'нет данных'}`
    ].join('\n'),
    footer: 'BRHD • Phoenix • Premium Leaderboard',
    image: summary.imageUrl
  }).addFields(
    section('Сводка', [`Средняя репутация: ${summary.averagePoints ?? 0}/100`, `Суммарная репутация: ${summary.totalPoints ?? 0}`, `Голос семьи: ${summary.totalVoiceHours ?? 0} ч`].join('\n'), true),
    section('Рейтинг', content, false)
  );
}

function buildVoiceActivityEmbedFinal(entries, summary = {}) {
  const content = entries.length ? entries.join('\n') : copy.stats.voiceEmpty;

  return card({
    title: `${copy.stats.voiceTitle} • Phoenix`,
    color: THEME.royal,
    description: [
      copy.stats.voiceDescription,
      '',
      `Участников в голосовом рейтинге: ${summary.memberCount ?? entries.length}`,
      `Тариф: ${summary.planLabel || 'Premium - 5$'}`,
      `Лидер голоса: ${summary.topLine || 'нет данных'}`
    ].join('\n'),
    footer: 'BRHD • Phoenix • Premium Voice',
    image: summary.imageUrl
  }).addFields(
    section('Сводка', [`Суммарно часов: ${summary.totalHours ?? 0} ч`, `Среднее на участника: ${summary.averageHours ?? 0} ч`, `Репутация ядра: ${summary.totalPoints ?? 0}`].join('\n'), true),
    section('Топ по голосу', content, false)
  );
}

function buildAdminPanelEmbedFinal({ guildName, record }) {
  const settings = record.settings || {};
  const channels = settings.channels || {};
  const roles = settings.roles || {};
  const visuals = settings.visuals || {};
  const modules = settings.modules || {};
  const automod = settings.automod || {};
  const welcome = settings.welcome || {};
  const verification = settings.verification || {};
  const reportSchedule = settings.reportSchedule || {};
  const reactionRoles = Array.isArray(settings.reactionRoles) ? settings.reactionRoles : [];
  const roleMenus = Array.isArray(settings.roleMenus) ? settings.roleMenus : [];
  const customCommands = Array.isArray(settings.customCommands) ? settings.customCommands : [];
  const isPremium = record.plan === 'premium';
  const planLabel = isPremium ? copy.admin.panelPremium : copy.admin.panelFree;
  const mode = settings.mode || 'hybrid';

  const moduleLines = [
    `Family: ${modules.family ? 'ON' : 'OFF'}`,
    `Applications: ${modules.applications ? 'ON' : 'OFF'}`,
    `Moderation: ${modules.moderation ? 'ON' : 'OFF'}`,
    `Security: ${modules.security ? 'ON' : 'OFF'}`,
    `Analytics: ${modules.analytics ? 'ON' : 'OFF'}`,
    `AI: ${modules.ai ? 'ON' : 'OFF'}`,
    `Welcome: ${modules.welcome ? 'ON' : 'OFF'}`,
    `Automod: ${modules.automod ? 'ON' : 'OFF'}`,
    `Subscriptions: ${modules.subscriptions ? 'ON' : 'OFF'}`,
    `Custom Commands: ${modules.customCommands ? 'ON' : 'OFF'}`,
    `Music: ${modules.music ? 'ON' : 'OFF'}`
  ];

  return card({
    title: copy.admin.panelTitle,
    color: isPremium ? THEME.gold : THEME.brand,
    description: `Сервер: **${guildName}**`,
    footer: 'BRHD • Phoenix • Administration'
  }).addFields(
    section('Статус', [`Тариф: ${planLabel}`, `Setup: ${record.setupCompleted ? copy.admin.panelSetupDone : copy.admin.panelSetupPending}`, `Режим: ${mode}`].join('\n'), true),
    section('Возможности', copy.admin.panelFeatures(record.plan), true),
    section(copy.admin.panelFieldChannels, [channelLine('Панель', channels.panel), channelLine('Подача заявки', channels.applications), channelLine('Welcome', channels.welcome), channelLine('Правила', channels.rules), channelLine('Логи', channels.logs), channelLine('Дисциплина', channels.disciplineLogs), channelLine('Апдейты', channels.updates), channelLine('Отчёты', channels.reports), channelLine('Automod', channels.automod)].join('\n'), false),
    section(copy.admin.panelFieldRoles, [roleLine('Лидер', roles.leader), roleLine('Зам', roles.deputy), roleLine('Старший', roles.elder), roleLine('Участник', roles.member), roleLine('Новичок', roles.newbie), roleLine('Мут', roles.mute), roleLine('Автороль', roles.autorole), roleLine('После подтверждения', roles.verification)].join('\n'), false),
    section('Модули', moduleLines.join('\n'), false),
    section('Welcome', [`Статус: ${welcome.enabled ? 'ON' : 'OFF'}`, `ЛС: ${welcome.dmEnabled ? 'ON' : 'OFF'}`, `Текст: ${welcome.message ? 'задан' : 'не задан'}`].join('\n'), true),
    section('Verification', [`Статус: ${verification.enabled ? 'ON' : 'OFF'}`, `Анкета: ${verification.questionnaireEnabled ? 'ON' : 'OFF'}`, `Роль: ${verification.roleId ? `<@&${verification.roleId}>` : 'не задана'}`].join('\n'), true),
    section('Role Menus', [`Меню: ${roleMenus.length}`, `Старые reaction roles: ${reactionRoles.length}`].join('\n'), true),
    section('Custom Commands', [`Триггеры: ${customCommands.length}`, `Premium: ${isPremium ? 'ON' : 'OFF'}`].join('\n'), true),
    section('Reports', [`Weekly: ${reportSchedule.weekly?.enabled ? 'ON' : 'OFF'}`, `Канал weekly: ${reportSchedule.weekly?.channelId ? `<#${reportSchedule.weekly.channelId}>` : 'не задан'}`, `Monthly: ${reportSchedule.monthly?.enabled ? 'ON' : 'OFF'}`, `Канал monthly: ${reportSchedule.monthly?.channelId ? `<#${reportSchedule.monthly.channelId}>` : 'не задан'}`].join('\n'), false),
    section('Automod', [`Инвайты: ${automod.invitesEnabled ? 'ON' : 'OFF'}`, `Ссылки: ${automod.linksEnabled ? 'ON' : 'OFF'}`, `Капс: ${automod.capsEnabled ? `ON (${automod.capsPercent || 75}% / ${automod.capsMinLength || 12}+ букв)` : 'OFF'}`, `Упоминания: ${automod.mentionsEnabled ? `ON (${automod.mentionLimit || 5})` : 'OFF'}`, `Флуд: ${automod.spamEnabled ? `ON (${automod.spamCount || 6} / ${automod.spamWindowSeconds || 8}с)` : 'OFF'}`, `Стоп-слова: ${automod.badWordsEnabled ? `ON (${(automod.badWords || []).length})` : 'OFF'}`, `Наказание: ${automod.actionMode === 'hard' ? 'жёсткое' : 'мягкое'}`].join('\n'), false),
    section(copy.admin.panelFieldVisuals, [copy.admin.visualLine('Панель семьи', visuals.familyBanner), copy.admin.visualLine('Подача заявки', visuals.applicationsBanner)].join('\n'), false)
  );
}

module.exports.buildFamilyEmbeds = buildFamilyEmbedsFinal;
module.exports.buildFamilyMenuEmbed = buildFamilyMenuEmbedFinal;
module.exports.buildHelpEmbed = buildHelpEmbedFinal;
module.exports.buildUpdateAnnouncementEmbed = buildUpdateAnnouncementEmbedFinal;
module.exports.buildWelcomeStatusEmbed = buildWelcomeStatusEmbedFinal;
module.exports.buildAutoroleStatusEmbed = buildAutoroleStatusEmbedFinal;
module.exports.buildReactionRoleStatusEmbed = buildReactionRoleStatusEmbedFinal;
module.exports.buildVerificationStatusEmbed = buildVerificationStatusEmbedFinal;
module.exports.buildRoleMenuStatusEmbed = buildRoleMenuStatusEmbedFinal;
module.exports.buildRoleMenuEmbed = buildRoleMenuEmbedFinal;
module.exports.buildCustomCommandsEmbed = buildCustomCommandsEmbedFinal;
module.exports.buildWelcomeEmbed = buildWelcomeEmbedFinal;
module.exports.buildAutomodStatusEmbed = buildAutomodStatusEmbedFinal;
module.exports.buildReportScheduleEmbed = buildReportScheduleEmbedFinal;
module.exports.buildLeaderboardEmbed = buildLeaderboardEmbedFinal;
module.exports.buildVoiceActivityEmbed = buildVoiceActivityEmbedFinal;
module.exports.buildAdminPanelEmbed = buildAdminPanelEmbedFinal;

function buildFamilySummaryLinesRelease(summary = {}) {
  return [
    `**Всего участников:** ${summary.totalMembers ?? 0}`,
    `**С ролями / без ролей:** ${summary.membersWithFamilyRoles ?? 0} / ${summary.membersWithoutFamilyRoles ?? 0}`,
    `**Заявок на рассмотрении:** ${summary.pendingApplications ?? 0}`,
    `**AFK-рисков:** ${summary.afkRiskCount ?? 0}`,
    `**Тариф:** ${summary.planLabel || 'Free - 0$'}`,
    `**Статусы:** 🟢 ${summary.onlineCount ?? 0} • 🌙 ${summary.idleCount ?? 0} • ⛔ ${summary.dndCount ?? 0} • ⚫ ${summary.offlineCount ?? 0}`,
    `**Топ-1 активности:** ${summary.topMemberLine || 'нет данных'}`,
    `**Последнее обновление:** ${summary.lastUpdatedLabel || 'сейчас'}`
  ];
}

function buildFamilyEmbedsRelease(guild, { roles, familyTitle, updateIntervalMs, activityScore, summary = {}, imageUrl }) {
  const configuredRoles = roles
    .map((item) => ({ ...item, role: guild.roles.cache.get(item.id) }))
    .filter((item) => item.role)
    .sort((a, b) => b.role.position - a.role.position);

  const assignedMemberIds = new Set();
  const roleSnapshots = configuredRoles.map((item) => {
    const uniqueMembers = Array.from(item.role.members.values())
      .filter((member) => {
        if (assignedMemberIds.has(member.id)) return false;
        assignedMemberIds.add(member.id);
        return true;
      });

    return {
      ...item,
      members: sortMembers(uniqueMembers, activityScore)
    };
  });

  const totalMembers = Array.from(guild.members.cache.values()).filter((member) => !member.user?.bot).length;
  const membersWithFamilyRoles = assignedMemberIds.size;
  const membersWithoutFamilyRoles = Math.max(0, totalMembers - membersWithFamilyRoles);
  const activeRoles = roleSnapshots.filter((item) => item.members.length);
  const embeds = [];

  let currentEmbed = card({
    title: familyTitle,
    color: THEME.brand,
    description: [
      ...buildFamilySummaryLinesRelease({
        ...summary,
        totalMembers,
        membersWithFamilyRoles,
        membersWithoutFamilyRoles
      }),
      '',
      `**Активных секций:** ${activeRoles.length}`,
      `**Обновление:** каждые ${Math.floor(updateIntervalMs / 1000)} сек.`,
      '',
      '🟢 Онлайн • 🌙 Отошёл • ⛔ Не беспокоить • ⚫ Оффлайн'
    ].join('\n'),
    footer: `BRHD • Phoenix • Обновление каждые ${Math.floor(updateIntervalMs / 1000)} сек.`,
    image: imageUrl
  });

  let fieldCount = 0;

  if (!activeRoles.length) {
    currentEmbed.addFields(section('Состав', copy.family.emptyMembers, false));
    return [currentEmbed];
  }

  for (const item of activeRoles) {
    const lines = item.members.map((member) => `${getStatusEmoji(member)} <@${member.id}> • ${activityScore(member.id)} очк.`);
    const parts = chunk(lines, 15);

    for (let index = 0; index < parts.length; index += 1) {
      if (fieldCount >= 25) {
        embeds.push(currentEmbed);
        currentEmbed = card({
          title: `${familyTitle} • продолжение`,
          color: THEME.slate,
          description: 'Продолжение состава семьи.',
          footer: `BRHD • Phoenix • Обновление каждые ${Math.floor(updateIntervalMs / 1000)} сек.`
        });
        fieldCount = 0;
      }

      currentEmbed.addFields(
        section(index === 0 ? `${item.name} • ${item.members.length}` : `${item.name} • продолжение`, parts[index].join('\n'), false)
      );
      fieldCount += 1;
    }
  }

  embeds.push(currentEmbed);
  return embeds;
}

function buildFamilyMenuEmbedRelease({ imageUrl, summary } = {}) {
  return card({
    title: copy.family.menuTitle,
    color: THEME.brand,
    description: [
      'Панель семьи v2 в стиле BRHD / Phoenix.',
      '',
      ...buildFamilySummaryLinesRelease(summary),
      '',
      `• ${copy.family.refreshButton} — обновить состав, активность и ранги`,
      `• ${copy.family.profileButton} — открыть свой профиль`,
      `• ${copy.family.leaderboardButton} — лидерборд по очкам`,
      `• ${copy.family.voiceButton} — топ по голосовой активности`,
      `• ${copy.family.applyButton} — открыть анкету кандидата`
    ].join('\n'),
    footer: 'BRHD • Phoenix • Family Control',
    image: imageUrl
  });
}

function buildReportScheduleEmbedRelease(schedule = {}, channels = {}) {
  const weekly = schedule.weekly || {};
  const monthly = schedule.monthly || {};

  return card({
    title: copy.reports.title,
    color: THEME.royal,
    description: [
      `Weekly: ${weekly.enabled ? 'ON' : 'OFF'}`,
      `Канал weekly: ${weekly.channelId ? `<#${weekly.channelId}>` : (channels.reports ? `<#${channels.reports}>` : 'не задан')}`,
      '',
      `Monthly: ${monthly.enabled ? 'ON' : 'OFF'}`,
      `Канал monthly: ${monthly.channelId ? `<#${monthly.channelId}>` : (channels.reports ? `<#${channels.reports}>` : 'не задан')}`
    ].join('\n'),
    footer: 'BRHD • Phoenix • Reports'
  });
}

function buildLeaderboardEmbedRelease(entries, summary = {}) {
  const content = entries.length ? entries.join('\n') : copy.stats.leaderboardEmpty;

  return card({
    title: `${copy.stats.leaderboardTitle} • Phoenix`,
    color: THEME.gold,
    description: [
      copy.stats.leaderboardDescription,
      '',
      `Участников в рейтинге: ${summary.memberCount ?? entries.length}`,
      `Тариф: ${summary.planLabel || 'Premium - 5$'}`,
      `Топ-игрок: ${summary.topLine || 'нет данных'}`
    ].join('\n'),
    footer: 'BRHD • Phoenix • Premium Leaderboard',
    image: summary.imageUrl
  }).addFields(
    section('Сводка', [
      `Средняя репутация: ${summary.averagePoints ?? 0}/100`,
      `Суммарная репутация: ${summary.totalPoints ?? 0}`,
      `Голос семьи: ${summary.totalVoiceHours ?? 0} ч`
    ].join('\n'), true),
    section('Рейтинг', content, false)
  );
}

function buildVoiceActivityEmbedRelease(entries, summary = {}) {
  const content = entries.length ? entries.join('\n') : copy.stats.voiceEmpty;

  return card({
    title: `${copy.stats.voiceTitle} • Phoenix`,
    color: THEME.royal,
    description: [
      copy.stats.voiceDescription,
      '',
      `Участников в голосовом рейтинге: ${summary.memberCount ?? entries.length}`,
      `Тариф: ${summary.planLabel || 'Premium - 5$'}`,
      `Лидер голоса: ${summary.topLine || 'нет данных'}`
    ].join('\n'),
    footer: 'BRHD • Phoenix • Premium Voice',
    image: summary.imageUrl
  }).addFields(
    section('Сводка', [
      `Суммарно часов: ${summary.totalHours ?? 0} ч`,
      `Среднее на участника: ${summary.averageHours ?? 0} ч`,
      `Репутация ядра: ${summary.totalPoints ?? 0}`
    ].join('\n'), true),
    section('Топ по голосу', content, false)
  );
}

function buildAdminPanelEmbedRelease({ guildName, record }) {
  const settings = record.settings || {};
  const channels = settings.channels || {};
  const roles = settings.roles || {};
  const visuals = settings.visuals || {};
  const modules = settings.modules || {};
  const automod = settings.automod || {};
  const welcome = settings.welcome || {};
  const verification = settings.verification || {};
  const reportSchedule = settings.reportSchedule || {};
  const reactionRoles = Array.isArray(settings.reactionRoles) ? settings.reactionRoles : [];
  const roleMenus = Array.isArray(settings.roleMenus) ? settings.roleMenus : [];
  const customCommands = Array.isArray(settings.customCommands) ? settings.customCommands : [];
  const isPremium = record.plan === 'premium';
  const planLabel = isPremium ? copy.admin.panelPremium : copy.admin.panelFree;
  const mode = settings.mode || 'hybrid';

  const moduleLines = [
    `Family: ${modules.family ? 'ON' : 'OFF'}`,
    `Applications: ${modules.applications ? 'ON' : 'OFF'}`,
    `Moderation: ${modules.moderation ? 'ON' : 'OFF'}`,
    `Security: ${modules.security ? 'ON' : 'OFF'}`,
    `Analytics: ${modules.analytics ? 'ON' : 'OFF'}`,
    `AI: ${modules.ai ? 'ON' : 'OFF'}`,
    `Welcome: ${modules.welcome ? 'ON' : 'OFF'}`,
    `Automod: ${modules.automod ? 'ON' : 'OFF'}`,
    `Subscriptions: ${modules.subscriptions ? 'ON' : 'OFF'}`,
    `Custom Commands: ${modules.customCommands ? 'ON' : 'OFF'}`,
    `Music: ${modules.music ? 'ON' : 'OFF'}`
  ];

  return card({
    title: copy.admin.panelTitle,
    color: isPremium ? THEME.gold : THEME.brand,
    description: `Сервер: **${guildName}**`,
    footer: 'BRHD • Phoenix • Administration'
  }).addFields(
    section('Статус', [`Тариф: ${planLabel}`, `Setup: ${record.setupCompleted ? copy.admin.panelSetupDone : copy.admin.panelSetupPending}`, `Режим: ${mode}`].join('\n'), true),
    section('Возможности', copy.admin.panelFeatures(record.plan), true),
    section(copy.admin.panelFieldChannels, [
      channelLine('Панель', channels.panel),
      channelLine('Подача заявки', channels.applications),
      channelLine('Welcome', channels.welcome),
      channelLine('Правила', channels.rules),
      channelLine('Логи', channels.logs),
      channelLine('Дисциплина', channels.disciplineLogs),
      channelLine('Апдейты', channels.updates),
      channelLine('Отчёты', channels.reports),
      channelLine('Automod', channels.automod)
    ].join('\n'), false),
    section(copy.admin.panelFieldRoles, [
      roleLine('Лидер', roles.leader),
      roleLine('Зам', roles.deputy),
      roleLine('Старший', roles.elder),
      roleLine('Участник', roles.member),
      roleLine('Новичок', roles.newbie),
      roleLine('Мут', roles.mute),
      roleLine('Автороль', roles.autorole),
      roleLine('После подтверждения', roles.verification)
    ].join('\n'), false),
    section('Модули', moduleLines.join('\n'), false),
    section('Welcome', [`Статус: ${welcome.enabled ? 'ON' : 'OFF'}`, `ЛС: ${welcome.dmEnabled ? 'ON' : 'OFF'}`, `Текст: ${welcome.message ? 'задан' : 'не задан'}`].join('\n'), true),
    section('Verification', [`Статус: ${verification.enabled ? 'ON' : 'OFF'}`, `Анкета: ${verification.questionnaireEnabled ? 'ON' : 'OFF'}`, `Роль: ${verification.roleId ? `<@&${verification.roleId}>` : 'не задана'}`].join('\n'), true),
    section('Role Menus', [`Меню: ${roleMenus.length}`, `Старые reaction roles: ${reactionRoles.length}`].join('\n'), true),
    section('Custom Commands', [`Триггеры: ${customCommands.length}`, `Premium: ${isPremium ? 'ON' : 'OFF'}`].join('\n'), true),
    section('Reports', [`Weekly: ${reportSchedule.weekly?.enabled ? 'ON' : 'OFF'}`, `Канал weekly: ${reportSchedule.weekly?.channelId ? `<#${reportSchedule.weekly.channelId}>` : 'не задан'}`, `Monthly: ${reportSchedule.monthly?.enabled ? 'ON' : 'OFF'}`, `Канал monthly: ${reportSchedule.monthly?.channelId ? `<#${reportSchedule.monthly.channelId}>` : 'не задан'}`].join('\n'), false),
    section('Automod', [`Инвайты: ${automod.invitesEnabled ? 'ON' : 'OFF'}`, `Ссылки: ${automod.linksEnabled ? 'ON' : 'OFF'}`, `Капс: ${automod.capsEnabled ? `ON (${automod.capsPercent || 75}% / ${automod.capsMinLength || 12}+ букв)` : 'OFF'}`, `Упоминания: ${automod.mentionsEnabled ? `ON (${automod.mentionLimit || 5})` : 'OFF'}`, `Флуд: ${automod.spamEnabled ? `ON (${automod.spamCount || 6} / ${automod.spamWindowSeconds || 8}с)` : 'OFF'}`, `Стоп-слова: ${automod.badWordsEnabled ? `ON (${(automod.badWords || []).length})` : 'OFF'}`, `Наказание: ${automod.actionMode === 'hard' ? 'жёсткое' : 'мягкое'}`].join('\n'), false),
    section(copy.admin.panelFieldVisuals, [copy.admin.visualLine('Панель семьи', visuals.familyBanner), copy.admin.visualLine('Подача заявки', visuals.applicationsBanner)].join('\n'), false)
  );
}

module.exports.buildFamilyEmbeds = buildFamilyEmbedsRelease;
module.exports.buildFamilyMenuEmbed = buildFamilyMenuEmbedRelease;
module.exports.buildReportScheduleEmbed = buildReportScheduleEmbedRelease;
module.exports.buildLeaderboardEmbed = buildLeaderboardEmbedRelease;
module.exports.buildVoiceActivityEmbed = buildVoiceActivityEmbedRelease;
module.exports.buildAdminPanelEmbed = buildAdminPanelEmbedRelease;

function helpSectionsClean({ regularCommands = [], adminCommands = [], premiumRegularCommands = [], premiumAdminCommands = [] } = {}) {
  return [
    { title: 'Обычные команды', commands: regularCommands },
    { title: 'Команды администрации', commands: adminCommands },
    { title: 'Premium для всех', commands: premiumRegularCommands },
    { title: 'Premium для администрации', commands: premiumAdminCommands }
  ].filter(sectionData => Array.isArray(sectionData.commands) && sectionData.commands.length);
}

function renderCommandListClean(commands = []) {
  if (!commands.length) return 'В этой категории пока нет доступных команд.';
  return commands
    .map(({ name }) => `/${name}`)
    .join('\n')
    .slice(0, 4000);
}

function buildHelpEmbedClean(catalog = {}, page = 0) {
  const sections = helpSectionsClean(catalog);
  const safePage = Math.max(0, Math.min(page, Math.max(0, sections.length - 1)));
  const current = sections[safePage] || { title: 'Команды', commands: [] };
  const totalPages = Math.max(1, sections.length || 1);

  return card({
    title: `Справка - ${current.title}`,
    color: catalog.plan === 'premium' ? THEME.gold : THEME.brand,
    description: [
      `Тариф: ${catalog.plan === 'premium' ? 'Premium - 5$' : 'Free - 0$'}`,
      `Страница: ${safePage + 1}/${totalPages}`,
      '',
      renderCommandListClean(current.commands)
    ].join('\n'),
    footer: 'BRHD • Phoenix • Help'
  });
}

function buildHelpPaginationButtonsClean(catalog = {}, page = 0) {
  const sections = helpSectionsClean(catalog);
  if (sections.length <= 1) return [];

  const safePage = Math.max(0, Math.min(page, sections.length - 1));
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`help_page:${Math.max(0, safePage - 1)}`)
        .setLabel('Назад')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage === 0),
      new ButtonBuilder()
        .setCustomId(`help_page:${Math.min(sections.length - 1, safePage + 1)}`)
        .setLabel('Вперёд')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(safePage >= sections.length - 1)
    )
  ];
}

function buildFamilySummaryLinesClean(summary = {}) {
  return [
    `**Всего участников:** ${summary.totalMembers ?? 0}`,
    `**С ролями / без ролей:** ${summary.membersWithFamilyRoles ?? 0} / ${summary.membersWithoutFamilyRoles ?? 0}`,
    `**Заявок на рассмотрении:** ${summary.pendingApplications ?? 0}`,
    `**AFK-рисков:** ${summary.afkRiskCount ?? 0}`,
    `**Тариф:** ${summary.planLabel || 'Free - 0$'}`,
    `**Статусы:** ${summary.onlineCount ?? 0} онлайн, ${summary.idleCount ?? 0} отошёл, ${summary.dndCount ?? 0} не беспокоить, ${summary.offlineCount ?? 0} оффлайн`,
    `**Топ-1 активности:** ${summary.topMemberLine || 'нет данных'}`,
    `**Последнее обновление:** ${summary.lastUpdatedLabel || 'сейчас'}`
  ];
}

async function buildFamilyEmbedsClean(guild, { roles, familyTitle, updateIntervalMs, activityScore, summary, imageUrl } = {}) {
  const roleSnapshots = roles.map(roleConfig => {
    const discordRole = guild.roles.cache.get(roleConfig.id);
    const members = discordRole ? Array.from(discordRole.members.values()).filter(member => !member.user?.bot) : [];
    return { ...roleConfig, members };
  });

  const assignedMemberIds = new Set();
  const normalizedRoles = roleSnapshots.map(item => {
    const uniqueMembers = item.members.filter(member => {
      if (assignedMemberIds.has(member.id)) return false;
      assignedMemberIds.add(member.id);
      return true;
    });

    return {
      ...item,
      members: sortMembers(uniqueMembers, activityScore)
    };
  });

  const totalMembers = Array.from(guild.members.cache.values()).filter(member => !member.user?.bot).length;
  const membersWithFamilyRoles = assignedMemberIds.size;
  const membersWithoutFamilyRoles = Math.max(0, totalMembers - membersWithFamilyRoles);
  const activeRoles = normalizedRoles.filter(item => item.members.length);
  const embeds = [];

  let currentEmbed = card({
    title: familyTitle,
    color: THEME.brand,
    description: [
      ...buildFamilySummaryLinesClean({
        ...summary,
        totalMembers,
        membersWithFamilyRoles,
        membersWithoutFamilyRoles
      }),
      '',
      `**Активных секций:** ${activeRoles.length}`,
      `**Обновление:** каждые ${Math.floor(updateIntervalMs / 1000)} сек.`,
      '',
      'Онлайн | Отошёл | Не беспокоить | Оффлайн'
    ].join('\n'),
    footer: `BRHD • Phoenix • Обновление каждые ${Math.floor(updateIntervalMs / 1000)} сек.`,
    image: imageUrl
  });

  let fieldCount = 0;

  if (!activeRoles.length) {
    currentEmbed.addFields(section('Состав', 'Нет участников в выбранных ролях.', false));
    return [currentEmbed];
  }

  for (const item of activeRoles) {
    const lines = item.members.map(member => `${getStatusEmoji(member)} <@${member.id}> - ${activityScore(member.id)} очк.`);
    const parts = chunk(lines, 15);

    for (let index = 0; index < parts.length; index += 1) {
      if (fieldCount >= 25) {
        embeds.push(currentEmbed);
        currentEmbed = card({
          title: `${familyTitle} - продолжение`,
          color: THEME.slate,
          description: 'Продолжение состава семьи.',
          footer: `BRHD • Phoenix • Обновление каждые ${Math.floor(updateIntervalMs / 1000)} сек.`
        });
        fieldCount = 0;
      }

      currentEmbed.addFields(
        section(index === 0 ? `${item.name} - ${item.members.length}` : `${item.name} - продолжение`, parts[index].join('\n'), false)
      );
      fieldCount += 1;
    }
  }

  embeds.push(currentEmbed);
  return embeds;
}

function buildFamilyMenuEmbedClean({ imageUrl, summary } = {}) {
  return card({
    title: 'Панель семьи',
    color: THEME.brand,
    description: [
      'Панель семьи в стиле BRHD / Phoenix.',
      '',
      ...buildFamilySummaryLinesClean(summary),
      '',
      `- ${copy.family.refreshButton} - обновить состав, активность и ранги`,
      `- ${copy.family.profileButton} - открыть свой профиль`,
      `- ${copy.family.leaderboardButton} - рейтинг по очкам`,
      `- ${copy.family.voiceButton} - топ по голосовой активности`,
      `- ${copy.family.applyButton} - открыть анкету кандидата`
    ].join('\n'),
    footer: 'BRHD • Phoenix • Family Control',
    image: imageUrl
  });
}

function buildWelcomeEmbedClean(member, familyTitle, imageUrl = '', customMessage = '', extras = {}) {
  return card({
    title: `Добро пожаловать в ${familyTitle || 'Phoenix'}`,
    color: THEME.emerald,
    description: [
      customMessage || `Рады видеть тебя в семье **${familyTitle || 'Phoenix'}** на сервере **${member.guild?.name || 'Phoenix'}**.`,
      '',
      extras.rulesChannelId ? `Правила: <#${extras.rulesChannelId}>` : '',
      extras.applicationsChannelId ? `Подача заявки: <#${extras.applicationsChannelId}>` : '',
      extras.verificationEnabled ? 'Подтверди доступ кнопкой ниже, чтобы получить стартовую роль.' : ''
    ].filter(Boolean).join('\n'),
    footer: 'BRHD • Phoenix • Welcome',
    thumbnail: avatarUrl(member.user),
    image: imageUrl
  }).addFields(section('Старт', ['1. Изучи правила сервера', '2. Пройди подтверждение', '3. Открой панель семьи и подай заявку'].join('\n'), false));
}

function buildReportScheduleEmbedClean(schedule = {}, channels = {}) {
  const weekly = schedule.weekly || {};
  const monthly = schedule.monthly || {};

  return card({
    title: 'Расписание отчётов',
    color: THEME.royal,
    description: [
      `Weekly: ${weekly.enabled ? 'ON' : 'OFF'}`,
      `Канал weekly: ${weekly.channelId ? `<#${weekly.channelId}>` : (channels.reports ? `<#${channels.reports}>` : 'не задан')}`,
      '',
      `Monthly: ${monthly.enabled ? 'ON' : 'OFF'}`,
      `Канал monthly: ${monthly.channelId ? `<#${monthly.channelId}>` : (channels.reports ? `<#${channels.reports}>` : 'не задан')}`
    ].join('\n'),
    footer: 'BRHD • Phoenix • Reports'
  });
}

function buildLeaderboardEmbedClean(entries, summary = {}) {
  const content = entries.length ? entries.join('\n') : 'Пока нет данных для рейтинга.';
  return card({
    title: 'Таблица участников • Phoenix',
    color: THEME.gold,
    description: [
      'Премиальный срез репутации семьи в стиле BRHD / Phoenix.',
      '',
      `Участников в рейтинге: ${summary.memberCount ?? entries.length}`,
      `Тариф: ${summary.planLabel || 'Premium - 5$'}`,
      `Топ-игрок: ${summary.topLine || 'нет данных'}`
    ].join('\n'),
    footer: 'BRHD • Phoenix • Premium Leaderboard',
    image: summary.imageUrl
  }).addFields(
    section('Сводка', [
      `Средняя репутация: ${summary.averagePoints ?? 0}/100`,
      `Суммарная репутация: ${summary.totalPoints ?? 0}`,
      `Голос семьи: ${summary.totalVoiceHours ?? 0} ч`
    ].join('\n'), true),
    section('Рейтинг', content, false)
  );
}

function buildVoiceActivityEmbedClean(entries, summary = {}) {
  const content = entries.length ? entries.join('\n') : 'Пока нет данных по голосовой активности.';
  return card({
    title: 'Голосовая активность • Phoenix',
    color: THEME.royal,
    description: [
      'Топ участников по голосовой активности.',
      '',
      `Участников в голосовом рейтинге: ${summary.memberCount ?? entries.length}`,
      `Тариф: ${summary.planLabel || 'Premium - 5$'}`,
      `Лидер голоса: ${summary.topLine || 'нет данных'}`
    ].join('\n'),
    footer: 'BRHD • Phoenix • Premium Voice',
    image: summary.imageUrl
  }).addFields(
    section('Сводка', [
      `Суммарно часов: ${summary.totalHours ?? 0} ч`,
      `Среднее на участника: ${summary.averageHours ?? 0} ч`,
      `Репутация ядра: ${summary.totalPoints ?? 0}`
    ].join('\n'), true),
    section('Топ по голосу', content, false)
  );
}

function buildAdminPanelEmbedClean({ guildName, record }) {
  const settings = record.settings || {};
  const channels = settings.channels || {};
  const roles = settings.roles || {};
  const visuals = settings.visuals || {};
  const modules = settings.modules || {};
  const automod = settings.automod || {};
  const welcome = settings.welcome || {};
  const verification = settings.verification || {};
  const reportSchedule = settings.reportSchedule || {};
  const reactionRoles = Array.isArray(settings.reactionRoles) ? settings.reactionRoles : [];
  const roleMenus = Array.isArray(settings.roleMenus) ? settings.roleMenus : [];
  const customCommands = Array.isArray(settings.customCommands) ? settings.customCommands : [];
  const isPremium = record.plan === 'premium';
  const planLabel = isPremium ? 'Premium - 5$' : 'Free - 0$';
  const mode = settings.mode || 'hybrid';

  const moduleLines = [
    `Family: ${modules.family ? 'ON' : 'OFF'}`,
    `Applications: ${modules.applications ? 'ON' : 'OFF'}`,
    `Moderation: ${modules.moderation ? 'ON' : 'OFF'}`,
    `Security: ${modules.security ? 'ON' : 'OFF'}`,
    `Analytics: ${modules.analytics ? 'ON' : 'OFF'}`,
    `AI: ${modules.ai ? 'ON' : 'OFF'}`,
    `Welcome: ${modules.welcome ? 'ON' : 'OFF'}`,
    `Automod: ${modules.automod ? 'ON' : 'OFF'}`,
    `Subscriptions: ${modules.subscriptions ? 'ON' : 'OFF'}`,
    `Custom Commands: ${modules.customCommands ? 'ON' : 'OFF'}`,
    `Music: ${modules.music ? 'ON' : 'OFF'}`
  ];

  return card({
    title: 'Панель администратора',
    color: isPremium ? THEME.gold : THEME.brand,
    description: `Сервер: **${guildName}**`,
    footer: 'BRHD • Phoenix • Administration'
  }).addFields(
    section('Статус', [`Тариф: ${planLabel}`, `Setup: ${record.setupCompleted ? 'завершён' : 'ожидает'}`, `Режим: ${mode}`].join('\n'), true),
    section('Каналы', [
      channelLine('Панель', channels.panel),
      channelLine('Подача заявки', channels.applications),
      channelLine('Welcome', channels.welcome),
      channelLine('Правила', channels.rules),
      channelLine('Логи', channels.logs),
      channelLine('Дисциплина', channels.disciplineLogs),
      channelLine('Апдейты', channels.updates),
      channelLine('Отчёты', channels.reports),
      channelLine('Automod', channels.automod)
    ].join('\n'), false),
    section('Роли', [
      roleLine('Лидер', roles.leader),
      roleLine('Зам', roles.deputy),
      roleLine('Старший', roles.elder),
      roleLine('Участник', roles.member),
      roleLine('Новичок', roles.newbie),
      roleLine('Мут', roles.mute),
      roleLine('Автороль', roles.autorole),
      roleLine('После подтверждения', roles.verification)
    ].join('\n'), false),
    section('Модули', moduleLines.join('\n'), false),
    section('Welcome', [`Статус: ${welcome.enabled ? 'ON' : 'OFF'}`, `ЛС: ${welcome.dmEnabled ? 'ON' : 'OFF'}`, `Текст: ${welcome.message ? 'задан' : 'не задан'}`].join('\n'), true),
    section('Verification', [`Статус: ${verification.enabled ? 'ON' : 'OFF'}`, `Анкета: ${verification.questionnaireEnabled ? 'ON' : 'OFF'}`, `Роль: ${verification.roleId ? `<@&${verification.roleId}>` : 'не задана'}`].join('\n'), true),
    section('Role Menus', [`Меню: ${roleMenus.length}`, `Старые reaction roles: ${reactionRoles.length}`].join('\n'), true),
    section('Custom Commands', [`Триггеры: ${customCommands.length}`, `Premium: ${isPremium ? 'ON' : 'OFF'}`].join('\n'), true),
    section('Reports', [`Weekly: ${reportSchedule.weekly?.enabled ? 'ON' : 'OFF'}`, `Канал weekly: ${reportSchedule.weekly?.channelId ? `<#${reportSchedule.weekly.channelId}>` : 'не задан'}`, `Monthly: ${reportSchedule.monthly?.enabled ? 'ON' : 'OFF'}`, `Канал monthly: ${reportSchedule.monthly?.channelId ? `<#${reportSchedule.monthly.channelId}>` : 'не задан'}`].join('\n'), false),
    section('Automod', [`Инвайты: ${automod.invitesEnabled ? 'ON' : 'OFF'}`, `Ссылки: ${automod.linksEnabled ? 'ON' : 'OFF'}`, `Капс: ${automod.capsEnabled ? `ON (${automod.capsPercent || 75}% / ${automod.capsMinLength || 12}+)` : 'OFF'}`, `Упоминания: ${automod.mentionsEnabled ? `ON (${automod.mentionLimit || 5})` : 'OFF'}`, `Флуд: ${automod.spamEnabled ? `ON (${automod.spamCount || 6} / ${automod.spamWindowSeconds || 8}с)` : 'OFF'}`, `Стоп-слова: ${automod.badWordsEnabled ? `ON (${(automod.badWords || []).length})` : 'OFF'}`, `Наказание: ${automod.actionMode === 'hard' ? 'жёсткое' : 'мягкое'}`].join('\n'), false),
    section('Баннеры', [
      `Панель семьи: ${visuals.familyBanner || 'не задан'}`,
      `Подача заявки: ${visuals.applicationsBanner || 'не задан'}`
    ].join('\n'), false)
  );
}

module.exports.buildHelpEmbed = buildHelpEmbedClean;
module.exports.buildHelpPaginationButtons = buildHelpPaginationButtonsClean;
module.exports.buildFamilyEmbeds = buildFamilyEmbedsClean;
module.exports.buildFamilyMenuEmbed = buildFamilyMenuEmbedClean;
module.exports.buildWelcomeEmbed = buildWelcomeEmbedClean;
module.exports.buildReportScheduleEmbed = buildReportScheduleEmbedClean;
module.exports.buildLeaderboardEmbed = buildLeaderboardEmbedClean;
module.exports.buildVoiceActivityEmbed = buildVoiceActivityEmbedClean;
module.exports.buildAdminPanelEmbed = buildAdminPanelEmbedClean;

function getStatusEmoji(member) {
  const status = member?.presence?.status || 'offline';
  if (status === 'online') return repairText('рџџў');
  if (status === 'idle') return repairText('рџџЎ');
  if (status === 'dnd') return repairText('в›”');
  return repairText('вљ«');
}

function getStatusLabel(member) {
  const status = member?.presence?.status || 'offline';
  if (status === 'online') return repairText('РћРЅР»Р°Р№РЅ');
  if (status === 'idle') return repairText('РћС‚РѕС€С‘Р»');
  if (status === 'dnd') return repairText('РќРµ Р±РµСЃРїРѕРєРѕРёС‚СЊ');
  return repairText('РћС„С„Р»Р°Р№РЅ');
}

function trimValue(value, limit = 1024, fallback = 'вЂ”') {
  const text = repairText(String(value || '').trim());
  if (!text) return repairText(fallback);
  return text.length > limit ? `${text.slice(0, limit - 1)}${repairText('вЂ¦')}` : text;
}

function card({ title, description, color, footer, thumbnail, author, image }) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(repairText(title))
    .setTimestamp();

  if (description) embed.setDescription(repairText(description));
  embed.setFooter({ text: repairText(footer || BRAND_FOOTER) });
  if (thumbnail) embed.setThumbnail(thumbnail);
  if (author) {
    embed.setAuthor({
      ...author,
      ...(author.name ? { name: repairText(author.name) } : {})
    });
  }
  if (image) embed.setImage(image);
  return embed;
}

function section(name, value, inline = false) {
  return {
    name: repairText(name),
    value: trimValue(value),
    inline
  };
}

function roleLine(label, roleId) {
  return `${repairText(label)}: ${roleId ? `<@&${roleId}>` : repairText('РЅРµ Р·Р°РґР°РЅРѕ')}`;
}

function channelLine(label, channelId) {
  return `${repairText(label)}: ${channelId ? `<#${channelId}>` : repairText('РЅРµ Р·Р°РґР°РЅ')}`;
}

function repairText(value) {
  const text = String(value ?? '');
  if (!text) return text;

  const score = (input) => {
    const markers = ['Р', 'С', 'вЂ', 'рџ', '\uFFFD'];
    const markerPenalty = markers.reduce((sum, marker) => sum + (input.split(marker).length - 1) * 4, 0);
    const controlPenalty = Array.from(input).reduce((sum, char) => {
      const code = char.charCodeAt(0);
      return sum + ((code < 32 && char !== '\n' && char !== '\r' && char !== '\t') ? 6 : 0);
    }, 0);
    const cyrillicBonus = (input.match(/[А-Яа-яЁё]/g) || []).length;
    return markerPenalty + controlPenalty - cyrillicBonus;
  };

  let best = text;
  let bestScore = score(text);
  let next = text;

  for (let index = 0; index < 2; index += 1) {
    try {
      const repaired = Buffer.from(next, 'latin1').toString('utf8');
      if (!repaired || repaired === next) break;
      const repairedScore = score(repaired);
      if (repaired.includes('\uFFFD') && repairedScore >= bestScore) break;
      if (repairedScore < bestScore) {
        best = repaired;
        bestScore = repairedScore;
      }
      next = repaired;
    } catch {
      break;
    }
  }

  return best;
}

function statusEmojiFinal(member) {
  const status = member?.presence?.status || 'offline';
  if (status === 'online') return '🟢';
  if (status === 'idle') return '🟡';
  if (status === 'dnd') return '⛔';
  return '⚫';
}

function statusLabelFinal(member) {
  const status = member?.presence?.status || 'offline';
  if (status === 'online') return 'Онлайн';
  if (status === 'idle') return 'Отошёл';
  if (status === 'dnd') return 'Не беспокоить';
  return 'Оффлайн';
}

function sectionFinal(name, value, inline = false) {
  return {
    name,
    value: String(value || '—').slice(0, 1024),
    inline
  };
}

function cardFinal({ title, description, color, footer, thumbnail, image }) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setTimestamp();

  if (description) embed.setDescription(description);
  if (footer) embed.setFooter({ text: footer });
  if (thumbnail) embed.setThumbnail(thumbnail);
  if (image) embed.setImage(image);
  return embed;
}

function roleLineFinal(label, roleId) {
  return `${label}: ${roleId ? `<@&${roleId}>` : 'не задано'}`;
}

function channelLineFinal(label, channelId) {
  return `${label}: ${channelId ? `<#${channelId}>` : 'не задан'}`;
}

function renderCommandListFinal(commands = []) {
  if (!commands.length) return 'В этой категории пока нет доступных команд.';
  return commands.map(({ name }) => `/${name}`).join('\n').slice(0, 4000);
}

function buildHelpEmbedFinal2(catalog = {}, page = 0) {
  const sections = helpSectionsClean(catalog);
  const safePage = Math.max(0, Math.min(page, Math.max(0, sections.length - 1)));
  const current = sections[safePage] || { title: 'Команды', commands: [] };
  const totalPages = Math.max(1, sections.length || 1);

  return cardFinal({
    title: `Справка • ${current.title}`,
    color: catalog.plan === 'premium' ? THEME.gold : THEME.brand,
    description: [
      `Тариф: ${catalog.plan === 'premium' ? 'Premium - 5$' : 'Free - 0$'}`,
      `Страница: ${safePage + 1}/${totalPages}`,
      '',
      renderCommandListFinal(current.commands)
    ].join('\n'),
    footer: 'BRHD • Phoenix • Help'
  });
}

function buildHelpPaginationButtonsFinal2(catalog = {}, page = 0) {
  const sections = helpSectionsClean(catalog);
  if (sections.length <= 1) return [];

  const safePage = Math.max(0, Math.min(page, sections.length - 1));
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`help_page:${Math.max(0, safePage - 1)}`)
        .setLabel('Назад')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage === 0),
      new ButtonBuilder()
        .setCustomId(`help_page:${Math.min(sections.length - 1, safePage + 1)}`)
        .setLabel('Вперёд')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(safePage >= sections.length - 1)
    )
  ];
}

function buildFamilySummaryLinesFinal(summary = {}) {
  return [
    `Всего участников: ${summary.totalMembers ?? 0}`,
    `С ролями / без ролей: ${summary.membersWithFamilyRoles ?? 0} / ${summary.membersWithoutFamilyRoles ?? 0}`,
    `Заявок на рассмотрении: ${summary.pendingApplications ?? 0}`,
    `AFK-рисков: ${summary.afkRiskCount ?? 0}`,
    `Тариф: ${summary.planLabel || 'Free - 0$'}`,
    `Статусы: ${summary.onlineCount ?? 0} • ${summary.idleCount ?? 0} • ${summary.dndCount ?? 0} • ${summary.offlineCount ?? 0}`,
    `Топ-1 активности: ${summary.topMemberLine || 'нет данных'}`,
    `Последнее обновление: ${summary.lastUpdatedLabel || 'сейчас'}`
  ];
}

async function buildFamilyEmbedsFinal2(guild, { roles, familyTitle, updateIntervalMs, activityScore, summary, imageUrl } = {}) {
  const roleSnapshots = roles.map(roleConfig => {
    const discordRole = guild.roles.cache.get(roleConfig.id);
    const members = discordRole ? Array.from(discordRole.members.values()).filter(member => !member.user?.bot) : [];
    return { ...roleConfig, members };
  });

  const assignedMemberIds = new Set();
  const normalizedRoles = roleSnapshots.map(item => {
    const uniqueMembers = item.members.filter(member => {
      if (assignedMemberIds.has(member.id)) return false;
      assignedMemberIds.add(member.id);
      return true;
    });

    return {
      ...item,
      members: sortMembers(uniqueMembers, activityScore)
    };
  });

  const totalMembers = Array.from(guild.members.cache.values()).filter(member => !member.user?.bot).length;
  const membersWithFamilyRoles = assignedMemberIds.size;
  const membersWithoutFamilyRoles = Math.max(0, totalMembers - membersWithFamilyRoles);
  const activeRoles = normalizedRoles.filter(item => item.members.length);

  const currentEmbed = cardFinal({
    title: familyTitle,
    color: THEME.brand,
    description: [
      ...buildFamilySummaryLinesFinal({
        ...summary,
        totalMembers,
        membersWithFamilyRoles,
        membersWithoutFamilyRoles
      }),
      '',
      `Активных секций: ${activeRoles.length}`,
      `Обновление: каждые ${Math.floor(updateIntervalMs / 1000)} сек.`,
      '',
      `${statusEmojiFinal({ presence: { status: 'online' } })} Онлайн • ${statusEmojiFinal({ presence: { status: 'idle' } })} Отошёл • ${statusEmojiFinal({ presence: { status: 'dnd' } })} Не беспокоить • ${statusEmojiFinal({ presence: { status: 'offline' } })} Оффлайн`
    ].join('\n'),
    footer: `BRHD • Phoenix • Обновление каждые ${Math.floor(updateIntervalMs / 1000)} сек.`,
    image: imageUrl
  });

  if (!activeRoles.length) {
    currentEmbed.addFields(sectionFinal('Состав', 'Нет участников в выбранных ролях.'));
    return [currentEmbed];
  }

  for (const item of activeRoles) {
    const lines = item.members.map(member => `${statusEmojiFinal(member)} <@${member.id}> • ${activityScore(member.id)} очк.`);
    currentEmbed.addFields(sectionFinal(`${item.name} • ${item.members.length}`, lines.join('\n')));
  }

  return [currentEmbed];
}

function buildFamilyMenuEmbedFinal2({ imageUrl, summary } = {}) {
  return cardFinal({
    title: 'Панель семьи',
    color: THEME.brand,
    description: [
      'Панель семьи в стиле BRHD / Phoenix.',
      '',
      ...buildFamilySummaryLinesFinal(summary),
      '',
      '- Обновить • обновить состав, активность и ранги',
      '- Профиль • открыть свой профиль',
      '- Топ • рейтинг по очкам',
      '- Голос • топ по голосовой активности',
      '- Подать заявку • открыть анкету кандидата'
    ].join('\n'),
    footer: 'BRHD • Phoenix • Family Control',
    image: imageUrl
  });
}

function buildWelcomeEmbedFinal2(member, familyTitle, imageUrl = '', customMessage = '', extras = {}) {
  return cardFinal({
    title: `Добро пожаловать в ${familyTitle || 'Phoenix'}`,
    color: THEME.emerald,
    description: [
      customMessage || `Рады видеть тебя в семье **${familyTitle || 'Phoenix'}** на сервере **${member.guild?.name || 'Phoenix'}**.`,
      '',
      extras.rulesChannelId ? `Правила: <#${extras.rulesChannelId}>` : '',
      extras.applicationsChannelId ? `Подача заявки: <#${extras.applicationsChannelId}>` : '',
      extras.verificationEnabled ? 'Подтверди доступ кнопкой ниже, чтобы получить стартовую роль.' : ''
    ].filter(Boolean).join('\n'),
    footer: 'BRHD • Phoenix • Welcome',
    thumbnail: avatarUrl(member.user),
    image: imageUrl
  }).addFields(sectionFinal('Старт', ['1. Изучи правила сервера', '2. Пройди подтверждение', '3. Открой панель семьи и подай заявку'].join('\n')));
}

function buildReportScheduleEmbedFinal2(schedule = {}, channels = {}) {
  const weekly = schedule.weekly || {};
  const monthly = schedule.monthly || {};

  return cardFinal({
    title: 'Расписание отчётов',
    color: THEME.royal,
    description: [
      `Weekly: ${weekly.enabled ? 'ON' : 'OFF'}`,
      `Канал weekly: ${weekly.channelId ? `<#${weekly.channelId}>` : (channels.reports ? `<#${channels.reports}>` : 'не задан')}`,
      '',
      `Monthly: ${monthly.enabled ? 'ON' : 'OFF'}`,
      `Канал monthly: ${monthly.channelId ? `<#${monthly.channelId}>` : (channels.reports ? `<#${channels.reports}>` : 'не задан')}`
    ].join('\n'),
    footer: 'BRHD • Phoenix • Reports'
  });
}

function buildLeaderboardEmbedFinal2(entries, summary = {}) {
  const content = entries.length ? entries.join('\n') : 'Пока нет данных для рейтинга.';
  return cardFinal({
    title: 'Таблица участников • Phoenix',
    color: THEME.gold,
    description: [
      'Премиальный срез репутации семьи в стиле BRHD / Phoenix.',
      '',
      `Участников в рейтинге: ${summary.memberCount ?? entries.length}`,
      `Тариф: ${summary.planLabel || 'Premium - 5$'}`,
      `Топ-игрок: ${summary.topLine || 'нет данных'}`
    ].join('\n'),
    footer: 'BRHD • Phoenix • Premium Leaderboard',
    image: summary.imageUrl
  }).addFields(
    sectionFinal('Сводка', [
      `Средняя репутация: ${summary.averagePoints ?? 0}/100`,
      `Суммарная репутация: ${summary.totalPoints ?? 0}`,
      `Голос семьи: ${summary.totalVoiceHours ?? 0} ч`
    ].join('\n'), true),
    sectionFinal('Рейтинг', content)
  );
}

function buildVoiceActivityEmbedFinal2(entries, summary = {}) {
  const content = entries.length ? entries.join('\n') : 'Пока нет данных по голосовой активности.';
  return cardFinal({
    title: 'Голосовая активность • Phoenix',
    color: THEME.royal,
    description: [
      'Топ участников по голосовой активности.',
      '',
      `Участников в голосовом рейтинге: ${summary.memberCount ?? entries.length}`,
      `Тариф: ${summary.planLabel || 'Premium - 5$'}`,
      `Лидер голоса: ${summary.topLine || 'нет данных'}`
    ].join('\n'),
    footer: 'BRHD • Phoenix • Premium Voice',
    image: summary.imageUrl
  }).addFields(
    sectionFinal('Сводка', [
      `Суммарно часов: ${summary.totalHours ?? 0} ч`,
      `Среднее на участника: ${summary.averageHours ?? 0} ч`,
      `Репутация ядра: ${summary.totalPoints ?? 0}`
    ].join('\n'), true),
    sectionFinal('Топ по голосу', content)
  );
}

function buildAdminPanelEmbedFinal2({ guildName, record }) {
  const settings = record.settings || {};
  const channels = settings.channels || {};
  const roles = settings.roles || {};
  const visuals = settings.visuals || {};
  const modules = settings.modules || {};
  const automod = settings.automod || {};
  const welcome = settings.welcome || {};
  const verification = settings.verification || {};
  const reportSchedule = settings.reportSchedule || {};
  const reactionRoles = Array.isArray(settings.reactionRoles) ? settings.reactionRoles : [];
  const roleMenus = Array.isArray(settings.roleMenus) ? settings.roleMenus : [];
  const customCommands = Array.isArray(settings.customCommands) ? settings.customCommands : [];
  const isPremium = record.plan === 'premium';
  const planLabel = isPremium ? 'Premium - 5$' : 'Free - 0$';
  const mode = settings.mode || 'hybrid';

  const moduleLines = [
    `Family: ${modules.family ? 'ON' : 'OFF'}`,
    `Applications: ${modules.applications ? 'ON' : 'OFF'}`,
    `Moderation: ${modules.moderation ? 'ON' : 'OFF'}`,
    `Security: ${modules.security ? 'ON' : 'OFF'}`,
    `Analytics: ${modules.analytics ? 'ON' : 'OFF'}`,
    `AI: ${modules.ai ? 'ON' : 'OFF'}`,
    `Welcome: ${modules.welcome ? 'ON' : 'OFF'}`,
    `Automod: ${modules.automod ? 'ON' : 'OFF'}`,
    `Subscriptions: ${modules.subscriptions ? 'ON' : 'OFF'}`,
    `Custom Commands: ${modules.customCommands ? 'ON' : 'OFF'}`,
    `Music: ${modules.music ? 'ON' : 'OFF'}`
  ];

  return cardFinal({
    title: 'Панель администратора',
    color: isPremium ? THEME.gold : THEME.brand,
    description: `Сервер: **${guildName}**`,
    footer: 'BRHD • Phoenix • Administration'
  }).addFields(
    sectionFinal('Статус', [`Тариф: ${planLabel}`, `Setup: ${record.setupCompleted ? 'завершён' : 'ожидает'}`, `Режим: ${mode}`].join('\n'), true),
    sectionFinal('Каналы', [
      channelLineFinal('Панель', channels.panel),
      channelLineFinal('Подача заявки', channels.applications),
      channelLineFinal('Welcome', channels.welcome),
      channelLineFinal('Правила', channels.rules),
      channelLineFinal('Логи', channels.logs),
      channelLineFinal('Дисциплина', channels.disciplineLogs),
      channelLineFinal('Апдейты', channels.updates),
      channelLineFinal('Отчёты', channels.reports),
      channelLineFinal('Automod', channels.automod)
    ].join('\n')),
    sectionFinal('Роли', [
      roleLineFinal('Лидер', roles.leader),
      roleLineFinal('Зам', roles.deputy),
      roleLineFinal('Старший', roles.elder),
      roleLineFinal('Участник', roles.member),
      roleLineFinal('Новичок', roles.newbie),
      roleLineFinal('Мут', roles.mute),
      roleLineFinal('Автороль', roles.autorole),
      roleLineFinal('После подтверждения', roles.verification)
    ].join('\n')),
    sectionFinal('Модули', moduleLines.join('\n')),
    sectionFinal('Welcome', [`Статус: ${welcome.enabled ? 'ON' : 'OFF'}`, `ЛС: ${welcome.dmEnabled ? 'ON' : 'OFF'}`, `Текст: ${welcome.message ? 'задан' : 'не задан'}`].join('\n'), true),
    sectionFinal('Verification', [`Статус: ${verification.enabled ? 'ON' : 'OFF'}`, `Анкета: ${verification.questionnaireEnabled ? 'ON' : 'OFF'}`, `Роль: ${verification.roleId ? `<@&${verification.roleId}>` : 'не задана'}`].join('\n'), true),
    sectionFinal('Role Menus', [`Меню: ${roleMenus.length}`, `Старые reaction roles: ${reactionRoles.length}`].join('\n'), true),
    sectionFinal('Custom Commands', [`Триггеры: ${customCommands.length}`, `Premium: ${isPremium ? 'ON' : 'OFF'}`].join('\n'), true),
    sectionFinal('Reports', [`Weekly: ${reportSchedule.weekly?.enabled ? 'ON' : 'OFF'}`, `Канал weekly: ${reportSchedule.weekly?.channelId ? `<#${reportSchedule.weekly.channelId}>` : 'не задан'}`, `Monthly: ${reportSchedule.monthly?.enabled ? 'ON' : 'OFF'}`, `Канал monthly: ${reportSchedule.monthly?.channelId ? `<#${reportSchedule.monthly.channelId}>` : 'не задан'}`].join('\n')),
    sectionFinal('Automod', [`Инвайты: ${automod.invitesEnabled ? 'ON' : 'OFF'}`, `Ссылки: ${automod.linksEnabled ? 'ON' : 'OFF'}`, `Капс: ${automod.capsEnabled ? `ON (${automod.capsPercent || 75}% / ${automod.capsMinLength || 12}+)` : 'OFF'}`, `Упоминания: ${automod.mentionsEnabled ? `ON (${automod.mentionLimit || 5})` : 'OFF'}`, `Флуд: ${automod.spamEnabled ? `ON (${automod.spamCount || 6} / ${automod.spamWindowSeconds || 8}с)` : 'OFF'}`, `Стоп-слова: ${automod.badWordsEnabled ? `ON (${(automod.badWords || []).length})` : 'OFF'}`, `Наказание: ${automod.actionMode === 'hard' ? 'жёсткое' : 'мягкое'}`].join('\n')),
    sectionFinal('Баннеры', [`Панель семьи: ${visuals.familyBanner || 'не задан'}`, `Подача заявки: ${visuals.applicationsBanner || 'не задан'}`].join('\n'))
  );
}

module.exports.buildHelpEmbed = buildHelpEmbedFinal2;
module.exports.buildHelpPaginationButtons = buildHelpPaginationButtonsFinal2;
module.exports.buildFamilyEmbeds = buildFamilyEmbedsFinal2;
module.exports.buildFamilyMenuEmbed = buildFamilyMenuEmbedFinal2;
module.exports.buildWelcomeEmbed = buildWelcomeEmbedFinal2;
module.exports.buildReportScheduleEmbed = buildReportScheduleEmbedFinal2;
module.exports.buildLeaderboardEmbed = buildLeaderboardEmbedFinal2;
module.exports.buildVoiceActivityEmbed = buildVoiceActivityEmbedFinal2;
module.exports.buildAdminPanelEmbed = buildAdminPanelEmbedFinal2;

function liveStatusEmoji(member) {
  const status = member?.presence?.status || 'offline';
  if (status === 'online') return '🟢';
  if (status === 'idle') return '🟡';
  if (status === 'dnd') return '⛔';
  return '⚫';
}

function liveStatusLabel(member) {
  const status = member?.presence?.status || 'offline';
  if (status === 'online') return 'Онлайн';
  if (status === 'idle') return 'Отошёл';
  if (status === 'dnd') return 'Не беспокоить';
  return 'Оффлайн';
}

function livePanelButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('family_refresh').setLabel(copy.family.refreshButton).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('family_profile').setLabel(copy.family.profileButton).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('family_leaderboard').setLabel(copy.family.leaderboardButton).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('family_voice').setLabel(copy.family.voiceButton).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('family_apply').setLabel(copy.family.applyButton).setStyle(ButtonStyle.Success)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('admin_applications').setLabel(copy.family.adminApplicationsButton).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('admin_aiadvisor').setLabel(copy.family.adminAiAdvisorButton).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('admin_panel').setLabel(copy.family.adminPanelButton).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('admin_blacklist').setLabel(copy.family.adminBlacklistButton || 'ЧС').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('admin_activityreport').setLabel(copy.family.adminReportButton).setStyle(ButtonStyle.Secondary)
    )
  ];
}

function liveFamilySummaryLines(summary = {}) {
  return [
    `Всего участников: ${summary.totalMembers ?? 0}`,
    `С ролями / без ролей: ${summary.membersWithFamilyRoles ?? 0} / ${summary.membersWithoutFamilyRoles ?? 0}`,
    `Заявок на рассмотрении: ${summary.pendingApplications ?? 0}`,
    `AFK-рисков: ${summary.afkRiskCount ?? 0}`,
    `Тариф: ${summary.planLabel || 'Free - 0$'}`,
    `Статусы: 🟢 ${summary.onlineCount ?? 0} • 🟡 ${summary.idleCount ?? 0} • ⛔ ${summary.dndCount ?? 0} • ⚫ ${summary.offlineCount ?? 0}`,
    summary.topMemberLine ? `Топ-1 активности: ${summary.topMemberLine}` : '',
    summary.lastUpdatedLabel ? `Последнее обновление: ${summary.lastUpdatedLabel}` : ''
  ].filter(Boolean);
}

async function liveBuildFamilyEmbeds(guild, { roles = [], familyTitle, updateIntervalMs = 60000, activityScore = () => 0, summary = {}, imageUrl } = {}) {
  const configuredRoles = roles
    .map(item => ({ ...item, role: guild.roles.cache.get(item.id) }))
    .filter(item => item.role)
    .sort((a, b) => b.role.position - a.role.position);

  const assignedMemberIds = new Set();
  const snapshots = configuredRoles.map(item => {
    const members = Array.from(item.role.members.values())
      .filter(member => !member.user?.bot)
      .filter(member => {
        if (assignedMemberIds.has(member.id)) return false;
        assignedMemberIds.add(member.id);
        return true;
      });

    return {
      name: item.name,
      members: sortMembers(members, activityScore)
    };
  });

  const totalMembers = Array.from(guild.members.cache.values()).filter(member => !member.user?.bot).length;
  const activeRoles = snapshots.filter(item => item.members.length > 0);
  const embed = card({
    title: familyTitle || guild.name,
    color: THEME.brand,
    description: [
      ...liveFamilySummaryLines({
        ...summary,
        totalMembers,
        membersWithFamilyRoles: assignedMemberIds.size,
        membersWithoutFamilyRoles: Math.max(0, totalMembers - assignedMemberIds.size)
      }),
      '',
      `Активных секций: ${activeRoles.length}`,
      `Обновление: каждые ${Math.floor(updateIntervalMs / 1000)} сек.`,
      '',
      '🟢 Онлайн • 🟡 Отошёл • ⛔ Не беспокоить • ⚫ Оффлайн'
    ].join('\n'),
    footer: `BRHD • Phoenix • Обновление каждые ${Math.floor(updateIntervalMs / 1000)} сек.`,
    image: imageUrl
  });

  if (!activeRoles.length) {
    embed.addFields(section('Состав', 'Нет участников в выбранных ролях.'));
    return [embed];
  }

  for (const item of activeRoles) {
    embed.addFields(section(
      `${item.name} • ${item.members.length}`,
      item.members.map(member => `${liveStatusEmoji(member)} <@${member.id}> • ${activityScore(member.id)} очк.`).join('\n')
    ));
  }

  return [embed];
}

function liveBuildFamilyMenuEmbed({ imageUrl, summary } = {}) {
  return card({
    title: 'Панель семьи',
    color: THEME.brand,
    description: [
      'Панель семьи в стиле BRHD / Phoenix.',
      '',
      ...liveFamilySummaryLines(summary),
      '',
      '• Обновить - обновить состав, активность и ранги',
      '• Профиль - открыть свой профиль',
      '• Топ - рейтинг по очкам',
      '• Голос - топ по голосовой активности',
      '• Подать заявку - открыть анкету кандидата'
    ].join('\n'),
    footer: 'BRHD • Phoenix • Family Control',
    image: imageUrl
  });
}

function liveBuildProfileEmbed(member, { activityScore = () => 0, memberData = {}, familyRoleIds = [], rankInfo = null } = {}) {
  const familyRoles = member.roles.cache
    .filter(role => familyRoleIds.includes(role.id))
    .map(role => `<@&${role.id}>`)
    .join(', ') || copy.profile.noRoles;

  const currentRoleName = rankInfo?.currentRole?.name || copy.profile.noRoles;
  const autoRankText = !rankInfo?.autoEnabled
    ? copy.ranks.autoDisabled
    : rankInfo?.manualOnly
      ? copy.ranks.manualOnly(currentRoleName)
      : rankInfo?.currentRole && rankInfo?.currentRole?.id === rankInfo?.autoTargetRole?.id
        ? copy.ranks.alreadySynced(currentRoleName, rankInfo.score)
        : rankInfo?.currentRole && rankInfo?.autoTargetRole
          ? copy.ranks.autoStatus(rankInfo.autoTargetRole.name, rankInfo.score)
          : copy.ranks.autoUnavailable;

  return card({
    title: copy.profile.title,
    color: THEME.brand,
    description: copy.profile.description(member.id),
    footer: 'BRHD • Phoenix • Profile',
    thumbnail: avatarUrl(member.user)
  }).addFields(
    section('Основное', [`Ник: ${member.displayName}`, `Discord: <@${member.id}>`, `ID: \`${member.id}\``].join('\n')),
    section(copy.profile.fieldRoles, familyRoles),
    section(
      'Активность',
      [
        `Актив-очки: ${activityScore(member.id)}`,
        `Репутация: ${memberData.points || 0}/100`,
        `Сообщения: ${memberData.messageCount || 0}`,
        `Похвалы: ${memberData.commends || 0}`,
        `Выговоры: ${memberData.warns || 0}`
      ].join('\n'),
      true
    ),
    section('Голосовые каналы', `Онлайн в голосе: ${hoursFromMinutes(memberData.voiceMinutes || 0)} ч`, true),
    section('Статус и ранг', [`Статус: ${liveStatusEmoji(member)} ${liveStatusLabel(member)}`, `Ранг: ${currentRoleName}`].join('\n'), true),
    section(copy.profile.fieldAutoRank, autoRankText)
  );
}

function liveBuildLeaderboardEmbed(entries, summary = {}) {
  const content = entries.length ? entries.join('\n') : copy.stats.leaderboardEmpty;
  return card({
    title: `${copy.stats.leaderboardTitle} • Phoenix`,
    color: THEME.gold,
    description: [
      copy.stats.leaderboardDescription,
      '',
      `Участников в рейтинге: ${summary.memberCount ?? entries.length}`,
      `Тариф: ${summary.planLabel || 'Premium - 5$'}`,
      `Топ-игрок: ${summary.topLine || 'нет данных'}`
    ].join('\n'),
    footer: 'BRHD • Phoenix • Premium Leaderboard',
    image: summary.imageUrl
  }).addFields(
    section('Сводка', [
      `Средняя репутация: ${summary.averagePoints ?? 0}/100`,
      `Суммарная репутация: ${summary.totalPoints ?? 0}`,
      `Голос семьи: ${summary.totalVoiceHours ?? 0} ч`
    ].join('\n'), true),
    section('Рейтинг', content)
  );
}

function liveBuildVoiceActivityEmbed(entries, summary = {}) {
  const content = entries.length ? entries.join('\n') : copy.stats.voiceEmpty;
  return card({
    title: `${copy.stats.voiceTitle} • Phoenix`,
    color: THEME.royal,
    description: [
      copy.stats.voiceDescription,
      '',
      `Участников в голосовом рейтинге: ${summary.memberCount ?? entries.length}`,
      `Тариф: ${summary.planLabel || 'Premium - 5$'}`,
      `Лидер голоса: ${summary.topLine || 'нет данных'}`
    ].join('\n'),
    footer: 'BRHD • Phoenix • Premium Voice',
    image: summary.imageUrl
  }).addFields(
    section('Сводка', [
      `Суммарно часов: ${summary.totalHours ?? 0} ч`,
      `Среднее на участника: ${summary.averageHours ?? 0} ч`,
      `Репутация ядра: ${summary.totalPoints ?? 0}`
    ].join('\n'), true),
    section('Топ по голосу', content)
  );
}

function liveBuildWelcomeEmbed(member, familyTitle, imageUrl = '', customMessage = '', extras = {}) {
  return card({
    title: `Добро пожаловать в ${familyTitle || 'Phoenix'}`,
    color: THEME.emerald,
    description: [
      customMessage || `Рады видеть тебя в семье **${familyTitle || 'Phoenix'}** на сервере **${member.guild?.name || 'Phoenix'}**.`,
      '',
      extras.rulesChannelId ? `Правила: <#${extras.rulesChannelId}>` : '',
      extras.applicationsChannelId ? `Подача заявки: <#${extras.applicationsChannelId}>` : '',
      extras.verificationEnabled ? 'Подтверди доступ кнопкой ниже, чтобы получить стартовую роль.' : ''
    ].filter(Boolean).join('\n'),
    footer: 'BRHD • Phoenix • Welcome',
    thumbnail: avatarUrl(member.user),
    image: imageUrl
  }).addFields(section('Старт', ['1. Изучи правила сервера', '2. Пройди подтверждение', '3. Открой панель семьи и подай заявку'].join('\n')));
}

function liveBuildReportScheduleEmbed(schedule = {}, channels = {}) {
  const weekly = schedule.weekly || {};
  const monthly = schedule.monthly || {};

  return card({
    title: 'Расписание отчётов',
    color: THEME.royal,
    description: [
      `Weekly: ${weekly.enabled ? 'ON' : 'OFF'}`,
      `Канал weekly: ${weekly.channelId ? `<#${weekly.channelId}>` : (channels.reports ? `<#${channels.reports}>` : 'не задан')}`,
      '',
      `Monthly: ${monthly.enabled ? 'ON' : 'OFF'}`,
      `Канал monthly: ${monthly.channelId ? `<#${monthly.channelId}>` : (channels.reports ? `<#${channels.reports}>` : 'не задан')}`
    ].join('\n'),
    footer: 'BRHD • Phoenix • Reports'
  });
}

function liveChannelLine(label, value) {
  return `${label}: ${value ? `<#${value}>` : 'не задан'}`;
}

function liveRoleLine(label, value) {
  return `${label}: ${value ? `<@&${value}>` : 'не задана'}`;
}

function liveBuildAdminPanelEmbed({ guildName, record }) {
  const settings = record.settings || {};
  const channels = settings.channels || {};
  const roles = settings.roles || {};
  const visuals = settings.visuals || {};
  const modules = settings.modules || {};
  const automod = settings.automod || {};
  const welcome = settings.welcome || {};
  const verification = settings.verification || {};
  const reportSchedule = settings.reportSchedule || {};
  const reactionRoles = Array.isArray(settings.reactionRoles) ? settings.reactionRoles : [];
  const roleMenus = Array.isArray(settings.roleMenus) ? settings.roleMenus : [];
  const customCommands = Array.isArray(settings.customCommands) ? settings.customCommands : [];
  const isPremium = record.plan === 'premium';
  const planLabel = isPremium ? 'Premium - 5$' : 'Free - 0$';
  const mode = settings.mode || 'hybrid';

  const moduleLines = [
    `Family: ${modules.family ? 'ON' : 'OFF'}`,
    `Applications: ${modules.applications ? 'ON' : 'OFF'}`,
    `Moderation: ${modules.moderation ? 'ON' : 'OFF'}`,
    `Security: ${modules.security ? 'ON' : 'OFF'}`,
    `Analytics: ${modules.analytics ? 'ON' : 'OFF'}`,
    `AI: ${modules.ai ? 'ON' : 'OFF'}`,
    `Welcome: ${modules.welcome ? 'ON' : 'OFF'}`,
    `Automod: ${modules.automod ? 'ON' : 'OFF'}`,
    `Subscriptions: ${modules.subscriptions ? 'ON' : 'OFF'}`,
    `Custom Commands: ${modules.customCommands ? 'ON' : 'OFF'}`,
    `Music: ${modules.music ? 'ON' : 'OFF'}`
  ];

  return card({
    title: 'Панель администратора',
    color: isPremium ? THEME.gold : THEME.brand,
    description: `Сервер: **${guildName}**`,
    footer: 'BRHD • Phoenix • Administration'
  }).addFields(
    section('Статус', [`Тариф: ${planLabel}`, `Setup: ${record.setupCompleted ? 'завершён' : 'ожидает'}`, `Режим: ${mode}`].join('\n'), true),
    section('Каналы', [
      liveChannelLine('Панель', channels.panel),
      liveChannelLine('Подача заявки', channels.applications),
      liveChannelLine('Welcome', channels.welcome),
      liveChannelLine('Правила', channels.rules),
      liveChannelLine('Логи', channels.logs),
      liveChannelLine('Дисциплина', channels.disciplineLogs),
      liveChannelLine('Апдейты', channels.updates),
      liveChannelLine('Отчёты', channels.reports),
      liveChannelLine('Automod', channels.automod)
    ].join('\n')),
    section('Роли', [
      liveRoleLine('Лидер', roles.leader),
      liveRoleLine('Зам', roles.deputy),
      liveRoleLine('Старший', roles.elder),
      liveRoleLine('Участник', roles.member),
      liveRoleLine('Новичок', roles.newbie),
      liveRoleLine('Мут', roles.mute),
      liveRoleLine('Автороль', roles.autorole),
      liveRoleLine('После подтверждения', roles.verification)
    ].join('\n')),
    section('Модули', moduleLines.join('\n')),
    section('Welcome', [`Статус: ${welcome.enabled ? 'ON' : 'OFF'}`, `ЛС: ${welcome.dmEnabled ? 'ON' : 'OFF'}`, `Текст: ${welcome.message ? 'задан' : 'не задан'}`].join('\n'), true),
    section('Verification', [`Статус: ${verification.enabled ? 'ON' : 'OFF'}`, `Анкета: ${verification.questionnaireEnabled ? 'ON' : 'OFF'}`, `Роль: ${verification.roleId ? `<@&${verification.roleId}>` : 'не задана'}`].join('\n'), true),
    section('Role Menus', [`Меню: ${roleMenus.length}`, `Старые reaction roles: ${reactionRoles.length}`].join('\n'), true),
    section('Custom Commands', [`Триггеры: ${customCommands.length}`, `Premium: ${isPremium ? 'ON' : 'OFF'}`].join('\n'), true),
    section('Reports', [`Weekly: ${reportSchedule.weekly?.enabled ? 'ON' : 'OFF'}`, `Канал weekly: ${reportSchedule.weekly?.channelId ? `<#${reportSchedule.weekly.channelId}>` : 'не задан'}`, `Monthly: ${reportSchedule.monthly?.enabled ? 'ON' : 'OFF'}`, `Канал monthly: ${reportSchedule.monthly?.channelId ? `<#${reportSchedule.monthly.channelId}>` : 'не задан'}`].join('\n')),
    section('Automod', [`Инвайты: ${automod.invitesEnabled ? 'ON' : 'OFF'}`, `Ссылки: ${automod.linksEnabled ? 'ON' : 'OFF'}`, `Капс: ${automod.capsEnabled ? `ON (${automod.capsPercent || 75}% / ${automod.capsMinLength || 12}+)` : 'OFF'}`, `Упоминания: ${automod.mentionsEnabled ? `ON (${automod.mentionLimit || 5})` : 'OFF'}`, `Флуд: ${automod.spamEnabled ? `ON (${automod.spamCount || 6} / ${automod.spamWindowSeconds || 8}с)` : 'OFF'}`, `Стоп-слова: ${automod.badWordsEnabled ? `ON (${(automod.badWords || []).length})` : 'OFF'}`, `Наказание: ${automod.actionMode === 'hard' ? 'жёсткое' : 'мягкое'}`].join('\n')),
    section('Баннеры', [`Панель семьи: ${visuals.familyBanner || 'не задан'}`, `Подача заявки: ${visuals.applicationsBanner || 'не задан'}`].join('\n'))
  );
}

module.exports.panelButtons = livePanelButtons;
module.exports.buildFamilyEmbeds = liveBuildFamilyEmbeds;
module.exports.buildFamilyMenuEmbed = liveBuildFamilyMenuEmbed;
module.exports.buildProfileEmbed = liveBuildProfileEmbed;
module.exports.buildLeaderboardEmbed = liveBuildLeaderboardEmbed;
module.exports.buildVoiceActivityEmbed = liveBuildVoiceActivityEmbed;
module.exports.buildWelcomeEmbed = liveBuildWelcomeEmbed;
module.exports.buildReportScheduleEmbed = liveBuildReportScheduleEmbed;
module.exports.buildAdminPanelEmbed = liveBuildAdminPanelEmbed;

function release107RepairText(value) {
  const text = String(value ?? '');
  if (!text) return text;

  let next = text;
  if (/[РС][^ \n\r\t]/u.test(next) || next.includes('вЂ')) {
    for (let index = 0; index < 2; index += 1) {
      try {
        const repaired = Buffer.from(next, 'latin1').toString('utf8');
        if (!repaired || repaired === next || repaired.includes('\uFFFD')) break;
        next = repaired;
      } catch {
        break;
      }
    }
  }

  return next
    .replace(/вЂў/g, '•')
    .replace(/вЂ”/g, '—')
    .replace(/вЂ¦/g, '…')
    .replace(/рџџў/g, '🟢')
    .replace(/рџџЎ/g, '🟡')
    .replace(/в›”/g, '⛔')
    .replace(/вљ«/g, '⚫')
    .trim();
}

function release107StatusEmoji(member) {
  const status = member?.presence?.status || 'offline';
  if (status === 'online') return '🟢';
  if (status === 'idle') return '🟡';
  if (status === 'dnd') return '⛔';
  return '⚫';
}

function release107StatusLabel(member) {
  const status = member?.presence?.status || 'offline';
  if (status === 'online') return 'Онлайн';
  if (status === 'idle') return 'Отошёл';
  if (status === 'dnd') return 'Не беспокоить';
  return 'Оффлайн';
}

function release107PanelButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('family_refresh').setLabel(copy.family.refreshButton || 'Обновить').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('family_profile').setLabel(copy.family.profileButton || 'Профиль').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('family_leaderboard').setLabel(copy.family.leaderboardButton || 'Топ').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('family_voice').setLabel(copy.family.voiceButton || 'Голос').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('family_apply').setLabel(copy.family.applyButton || 'Подать заявку').setStyle(ButtonStyle.Success)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('admin_applications').setLabel(copy.family.adminApplicationsButton || 'Заявки').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('admin_aiadvisor').setLabel(copy.family.adminAiAdvisorButton || 'AI-совет').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('admin_panel').setLabel(copy.family.adminPanelButton || 'Админка').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('admin_blacklist').setLabel('ЧС').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('admin_activityreport').setLabel(copy.family.adminReportButton || 'Отчёт').setStyle(ButtonStyle.Secondary)
    )
  ];
}

function release107HelpSections(catalog = {}) {
  return [
    { title: copy.help.regularSection || 'Обычные команды', commands: Array.isArray(catalog.regularCommands) ? catalog.regularCommands : [] },
    { title: copy.help.adminSection || 'Команды администрации', commands: Array.isArray(catalog.adminCommands) ? catalog.adminCommands : [] },
    { title: copy.help.premiumRegularSection || 'Обычные команды в Premium', commands: Array.isArray(catalog.premiumRegularCommands) ? catalog.premiumRegularCommands : [] },
    { title: copy.help.premiumAdminSection || 'Админ-команды в Premium', commands: Array.isArray(catalog.premiumAdminCommands) ? catalog.premiumAdminCommands : [] }
  ].filter(item => item.commands.length);
}

function release107BuildHelpEmbed(catalog = {}, page = 0) {
  const sections = release107HelpSections(catalog);
  const totalPages = Math.max(1, sections.length || 1);
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const current = sections[safePage] || { title: 'Команды', commands: [] };

  return cardFinal({
    title: `Справка • ${current.title}`,
    color: catalog.plan === 'premium' ? THEME.gold : THEME.brand,
    description: [
      `Тариф: ${catalog.plan === 'premium' ? 'Premium - 5$' : 'Free - 0$'}`,
      `Страница: ${safePage + 1}/${totalPages}`,
      '',
      current.commands.length
        ? current.commands.map(command => copy.help.line(command.name, command.description)).join('\n').slice(0, 4000)
        : (copy.help.none || 'Нет доступных команд для этого раздела.')
    ].join('\n'),
    footer: 'BRHD • Phoenix • Help'
  });
}

function release107BuildHelpPaginationButtons(catalog = {}, page = 0) {
  const sections = release107HelpSections(catalog);
  if (sections.length <= 1) return [];
  const safePage = Math.max(0, Math.min(page, sections.length - 1));
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`help_page:${Math.max(0, safePage - 1)}`).setLabel('Назад').setStyle(ButtonStyle.Secondary).setDisabled(safePage === 0),
      new ButtonBuilder().setCustomId(`help_page:${Math.min(sections.length - 1, safePage + 1)}`).setLabel('Вперёд').setStyle(ButtonStyle.Primary).setDisabled(safePage >= sections.length - 1)
    )
  ];
}

function release107SummaryLines(summary = {}) {
  return [
    `Всего участников: ${summary.totalMembers ?? 0}`,
    `С ролями / без ролей: ${summary.membersWithFamilyRoles ?? 0} / ${summary.membersWithoutFamilyRoles ?? 0}`,
    `Заявок на рассмотрении: ${summary.pendingApplications ?? 0}`,
    `AFK-рисков: ${summary.afkRiskCount ?? 0}`,
    `Тариф: ${summary.planLabel || 'Free - 0$'}`,
    `Статусы: 🟢 ${summary.onlineCount ?? 0} • 🟡 ${summary.idleCount ?? 0} • ⛔ ${summary.dndCount ?? 0} • ⚫ ${summary.offlineCount ?? 0}`,
    summary.topMemberLine ? `Топ-1 активности: ${release107RepairText(summary.topMemberLine)}` : '',
    summary.lastUpdatedLabel ? `Последнее обновление: ${summary.lastUpdatedLabel}` : ''
  ].filter(Boolean);
}

async function release107BuildFamilyEmbeds(guild, { roles = [], familyTitle, updateIntervalMs = 60000, activityScore = () => 0, summary = {}, imageUrl } = {}) {
  const configuredRoles = roles
    .map(item => ({ ...item, role: guild.roles.cache.get(item.id) }))
    .filter(item => item.role)
    .sort((a, b) => b.role.position - a.role.position);

  const assignedMemberIds = new Set();
  const snapshots = configuredRoles.map(item => {
    const members = Array.from(item.role.members.values())
      .filter(member => !member.user?.bot)
      .filter(member => {
        if (assignedMemberIds.has(member.id)) return false;
        assignedMemberIds.add(member.id);
        return true;
      });

    return { name: release107RepairText(item.name), members: sortMembers(members, activityScore) };
  });

  const totalMembers = Array.from(guild.members.cache.values()).filter(member => !member.user?.bot).length;
  const activeRoles = snapshots.filter(item => item.members.length > 0);
  const embed = cardFinal({
    title: release107RepairText(familyTitle || guild.name),
    color: THEME.brand,
    description: [
      ...release107SummaryLines({
        ...summary,
        totalMembers,
        membersWithFamilyRoles: assignedMemberIds.size,
        membersWithoutFamilyRoles: Math.max(0, totalMembers - assignedMemberIds.size)
      }),
      '',
      `Активных секций: ${activeRoles.length}`,
      `Обновление: каждые ${Math.floor(updateIntervalMs / 1000)} сек.`,
      '',
      copy.family.legend || '🟢 Онлайн • 🟡 Отошёл • ⛔ Не беспокоить • ⚫ Оффлайн'
    ].join('\n'),
    footer: `BRHD • Phoenix • Обновление каждые ${Math.floor(updateIntervalMs / 1000)} сек.`,
    image: imageUrl
  });

  if (!activeRoles.length) {
    embed.addFields(sectionFinal('Состав', 'Нет участников в выбранных ролях.'));
    return [embed];
  }

  for (const item of activeRoles) {
    embed.addFields(sectionFinal(
      `${item.name} • ${item.members.length}`,
      item.members.map(member => `${release107StatusEmoji(member)} <@${member.id}> • ${activityScore(member.id)} очк.`).join('\n')
    ));
  }

  return [embed];
}

function release107BuildFamilyMenuEmbed({ imageUrl, summary } = {}) {
  return cardFinal({
    title: 'Панель семьи',
    color: THEME.brand,
    description: [
      'Панель семьи в стиле BRHD / Phoenix.',
      '',
      ...release107SummaryLines(summary),
      '',
      '• Обновить - обновить состав, активность и ранги',
      '• Профиль - открыть свой профиль',
      '• Топ - рейтинг по очкам',
      '• Голос - топ по голосовой активности',
      '• Подать заявку - открыть анкету кандидата'
    ].join('\n'),
    footer: 'BRHD • Phoenix • Family Control',
    image: imageUrl
  });
}

function release107BuildProfileEmbed(member, { activityScore = () => 0, memberData = {}, familyRoleIds = [], rankInfo = null } = {}) {
  const familyRoles = member.roles.cache
    .filter(role => familyRoleIds.includes(role.id))
    .map(role => `<@&${role.id}>`)
    .join(', ') || copy.profile.noRoles;

  const currentRoleName = release107RepairText(rankInfo?.currentRole?.name || copy.profile.noRoles);
  const autoRankText = !rankInfo?.autoEnabled
    ? copy.ranks.autoDisabled
    : rankInfo?.manualOnly
      ? copy.ranks.manualOnly(currentRoleName)
      : rankInfo?.currentRole && rankInfo?.autoTargetRole && rankInfo.currentRole.id === rankInfo.autoTargetRole.id
        ? copy.ranks.alreadySynced(currentRoleName, rankInfo.score)
        : rankInfo?.currentRole && rankInfo?.autoTargetRole
          ? copy.ranks.autoStatus(release107RepairText(rankInfo.autoTargetRole.name), rankInfo.score)
          : copy.ranks.autoUnavailable;

  return cardFinal({
    title: copy.profile.title,
    color: THEME.brand,
    description: copy.profile.description(member.id),
    footer: 'BRHD • Phoenix • Profile',
    thumbnail: avatarUrl(member.user)
  }).addFields(
    sectionFinal('Основное', [`Ник: ${member.displayName}`, `Discord: <@${member.id}>`, `ID: \`${member.id}\``].join('\n')),
    sectionFinal(copy.profile.fieldRoles, familyRoles),
    sectionFinal('Активность', [
      `Актив-очки: ${activityScore(member.id)}`,
      `Репутация: ${memberData.points || 0}/100`,
      `Сообщения: ${memberData.messageCount || 0}`,
      `Похвалы: ${memberData.commends || 0}`,
      `Выговоры: ${memberData.warns || 0}`
    ].join('\n'), true),
    sectionFinal('Голосовые каналы', `Онлайн в голосе: ${hoursFromMinutes(memberData.voiceMinutes || 0)} ч`, true),
    sectionFinal('Статус и ранг', [`Статус: ${release107StatusEmoji(member)} ${release107StatusLabel(member)}`, `Ранг: ${currentRoleName}`].join('\n'), true),
    sectionFinal(copy.profile.fieldAutoRank, release107RepairText(autoRankText))
  );
}

function release107BuildLeaderboardEmbed(entries, summary = {}) {
  const content = entries.length ? entries.map(release107RepairText).join('\n') : copy.stats.leaderboardEmpty;
  return cardFinal({
    title: `${copy.stats.leaderboardTitle} • Phoenix`,
    color: THEME.gold,
    description: [
      copy.stats.leaderboardDescription,
      '',
      `Участников в рейтинге: ${summary.memberCount ?? entries.length}`,
      `Тариф: ${summary.planLabel || 'Premium - 5$'}`,
      `Топ-игрок: ${summary.topLine ? release107RepairText(summary.topLine) : 'нет данных'}`
    ].join('\n'),
    footer: 'BRHD • Phoenix • Premium Leaderboard',
    image: summary.imageUrl
  }).addFields(
    sectionFinal('Сводка', [
      `Средняя репутация: ${summary.averagePoints ?? 0}/100`,
      `Суммарная репутация: ${summary.totalPoints ?? 0}`,
      `Голос семьи: ${summary.totalVoiceHours ?? 0} ч`
    ].join('\n'), true),
    sectionFinal('Рейтинг', content)
  );
}

function release107BuildVoiceActivityEmbed(entries, summary = {}) {
  const content = entries.length ? entries.map(release107RepairText).join('\n') : copy.stats.voiceEmpty;
  return cardFinal({
    title: `${copy.stats.voiceTitle} • Phoenix`,
    color: THEME.royal,
    description: [
      copy.stats.voiceDescription,
      '',
      `Участников в голосовом рейтинге: ${summary.memberCount ?? entries.length}`,
      `Тариф: ${summary.planLabel || 'Premium - 5$'}`,
      `Лидер голоса: ${summary.topLine ? release107RepairText(summary.topLine) : 'нет данных'}`
    ].join('\n'),
    footer: 'BRHD • Phoenix • Premium Voice',
    image: summary.imageUrl
  }).addFields(
    sectionFinal('Сводка', [
      `Суммарно часов: ${summary.totalHours ?? 0} ч`,
      `Среднее на участника: ${summary.averageHours ?? 0} ч`,
      `Репутация ядра: ${summary.totalPoints ?? 0}`
    ].join('\n'), true),
    sectionFinal('Топ по голосу', content)
  );
}

function release107BuildWelcomeEmbed(member, familyTitle, imageUrl = '', customMessage = '', extras = {}) {
  return cardFinal({
    title: `Добро пожаловать в ${release107RepairText(familyTitle || 'Phoenix')}`,
    color: THEME.emerald,
    description: [
      release107RepairText(customMessage || `Рады видеть тебя в семье **${familyTitle || 'Phoenix'}** на сервере **${member.guild?.name || 'Phoenix'}**.`),
      '',
      extras.rulesChannelId ? `Правила: <#${extras.rulesChannelId}>` : '',
      extras.applicationsChannelId ? `Подача заявки: <#${extras.applicationsChannelId}>` : '',
      extras.verificationEnabled ? 'Подтверди доступ кнопкой ниже, чтобы получить стартовую роль.' : ''
    ].filter(Boolean).join('\n'),
    footer: 'BRHD • Phoenix • Welcome',
    thumbnail: avatarUrl(member.user),
    image: imageUrl
  }).addFields(sectionFinal('Старт', ['1. Изучи правила сервера', '2. Пройди подтверждение', '3. Открой панель семьи и подай заявку'].join('\n')));
}

function release107BuildReportScheduleEmbed(schedule = {}, channels = {}) {
  const weekly = schedule.weekly || {};
  const monthly = schedule.monthly || {};
  return cardFinal({
    title: 'Расписание отчётов',
    color: THEME.royal,
    description: [
      `Weekly: ${weekly.enabled ? 'ON' : 'OFF'}`,
      `Канал weekly: ${weekly.channelId ? `<#${weekly.channelId}>` : (channels.reports ? `<#${channels.reports}>` : 'не задан')}`,
      '',
      `Monthly: ${monthly.enabled ? 'ON' : 'OFF'}`,
      `Канал monthly: ${monthly.channelId ? `<#${monthly.channelId}>` : (channels.reports ? `<#${channels.reports}>` : 'не задан')}`
    ].join('\n'),
    footer: 'BRHD • Phoenix • Reports'
  });
}

function release107ChannelLine(label, value) {
  return `${label}: ${value ? `<#${value}>` : 'не задан'}`;
}

function release107RoleLine(label, value) {
  return `${label}: ${value ? `<@&${value}>` : 'не задана'}`;
}

function release107BuildAdminPanelEmbed({ guildName, record }) {
  const settings = record.settings || {};
  const channels = settings.channels || {};
  const roles = settings.roles || {};
  const visuals = settings.visuals || {};
  const modules = settings.modules || {};
  const automod = settings.automod || {};
  const welcome = settings.welcome || {};
  const verification = settings.verification || {};
  const reportSchedule = settings.reportSchedule || {};
  const reactionRoles = Array.isArray(settings.reactionRoles) ? settings.reactionRoles : [];
  const roleMenus = Array.isArray(settings.roleMenus) ? settings.roleMenus : [];
  const customCommands = Array.isArray(settings.customCommands) ? settings.customCommands : [];
  const isPremium = record.plan === 'premium';
  const planLabel = isPremium ? 'Premium - 5$' : 'Free - 0$';
  const mode = settings.mode || 'hybrid';

  const moduleLines = [
    `Family: ${modules.family ? 'ON' : 'OFF'}`,
    `Applications: ${modules.applications ? 'ON' : 'OFF'}`,
    `Moderation: ${modules.moderation ? 'ON' : 'OFF'}`,
    `Security: ${modules.security ? 'ON' : 'OFF'}`,
    `Analytics: ${modules.analytics ? 'ON' : 'OFF'}`,
    `AI: ${modules.ai ? 'ON' : 'OFF'}`,
    `Welcome: ${modules.welcome ? 'ON' : 'OFF'}`,
    `Automod: ${modules.automod ? 'ON' : 'OFF'}`,
    `Subscriptions: ${modules.subscriptions ? 'ON' : 'OFF'}`,
    `Custom Commands: ${modules.customCommands ? 'ON' : 'OFF'}`,
    `Music: ${modules.music ? 'ON' : 'OFF'}`
  ];

  return cardFinal({
    title: 'Панель администратора',
    color: isPremium ? THEME.gold : THEME.brand,
    description: `Сервер: **${release107RepairText(guildName)}**`,
    footer: 'BRHD • Phoenix • Administration'
  }).addFields(
    sectionFinal('Статус', [`Тариф: ${planLabel}`, `Setup: ${record.setupCompleted ? 'завершён' : 'ожидает'}`, `Режим: ${mode}`].join('\n'), true),
    sectionFinal('Каналы', [
      release107ChannelLine('Панель', channels.panel),
      release107ChannelLine('Подача заявки', channels.applications),
      release107ChannelLine('Welcome', channels.welcome),
      release107ChannelLine('Правила', channels.rules),
      release107ChannelLine('Логи', channels.logs),
      release107ChannelLine('Дисциплина', channels.disciplineLogs),
      release107ChannelLine('Апдейты', channels.updates),
      release107ChannelLine('Отчёты', channels.reports),
      release107ChannelLine('Automod', channels.automod)
    ].join('\n')),
    sectionFinal('Роли', [
      release107RoleLine('Лидер', roles.leader),
      release107RoleLine('Зам', roles.deputy),
      release107RoleLine('Старший', roles.elder),
      release107RoleLine('Участник', roles.member),
      release107RoleLine('Новичок', roles.newbie),
      release107RoleLine('Мут', roles.mute),
      release107RoleLine('Автороль', roles.autorole),
      release107RoleLine('После подтверждения', roles.verification)
    ].join('\n')),
    sectionFinal('Модули', moduleLines.join('\n')),
    sectionFinal('Welcome', [`Статус: ${welcome.enabled ? 'ON' : 'OFF'}`, `ЛС: ${welcome.dmEnabled ? 'ON' : 'OFF'}`, `Текст: ${welcome.message ? 'задан' : 'не задан'}`].join('\n'), true),
    sectionFinal('Verification', [`Статус: ${verification.enabled ? 'ON' : 'OFF'}`, `Анкета: ${verification.questionnaireEnabled ? 'ON' : 'OFF'}`, `Роль: ${verification.roleId ? `<@&${verification.roleId}>` : 'не задана'}`].join('\n'), true),
    sectionFinal('Role Menus', [`Меню: ${roleMenus.length}`, `Старые reaction roles: ${reactionRoles.length}`].join('\n'), true),
    sectionFinal('Custom Commands', [`Триггеры: ${customCommands.length}`, `Premium: ${isPremium ? 'ON' : 'OFF'}`].join('\n'), true),
    sectionFinal('Reports', [`Weekly: ${reportSchedule.weekly?.enabled ? 'ON' : 'OFF'}`, `Канал weekly: ${reportSchedule.weekly?.channelId ? `<#${reportSchedule.weekly.channelId}>` : 'не задан'}`, `Monthly: ${reportSchedule.monthly?.enabled ? 'ON' : 'OFF'}`, `Канал monthly: ${reportSchedule.monthly?.channelId ? `<#${reportSchedule.monthly.channelId}>` : 'не задан'}`].join('\n')),
    sectionFinal('Automod', [`Инвайты: ${automod.invitesEnabled ? 'ON' : 'OFF'}`, `Ссылки: ${automod.linksEnabled ? 'ON' : 'OFF'}`, `Капс: ${automod.capsEnabled ? `ON (${automod.capsPercent || 75}% / ${automod.capsMinLength || 12}+)` : 'OFF'}`, `Упоминания: ${automod.mentionsEnabled ? `ON (${automod.mentionLimit || 5})` : 'OFF'}`, `Флуд: ${automod.spamEnabled ? `ON (${automod.spamCount || 6} / ${automod.spamWindowSeconds || 8}с)` : 'OFF'}`, `Стоп-слова: ${automod.badWordsEnabled ? `ON (${(automod.badWords || []).length})` : 'OFF'}`, `Наказание: ${automod.actionMode === 'hard' ? 'жёсткое' : 'мягкое'}`].join('\n')),
    sectionFinal('Баннеры', [`Панель семьи: ${visuals.familyBanner || 'не задан'}`, `Подача заявки: ${visuals.applicationsBanner || 'не задан'}`].join('\n'))
  );
}

module.exports.panelButtons = release107PanelButtons;
module.exports.buildHelpEmbed = release107BuildHelpEmbed;
module.exports.buildHelpPaginationButtons = release107BuildHelpPaginationButtons;
module.exports.buildFamilyEmbeds = release107BuildFamilyEmbeds;
module.exports.buildFamilyMenuEmbed = release107BuildFamilyMenuEmbed;
module.exports.buildProfileEmbed = release107BuildProfileEmbed;
module.exports.buildLeaderboardEmbed = release107BuildLeaderboardEmbed;
module.exports.buildVoiceActivityEmbed = release107BuildVoiceActivityEmbed;
module.exports.buildWelcomeEmbed = release107BuildWelcomeEmbed;
module.exports.buildReportScheduleEmbed = release107BuildReportScheduleEmbed;
module.exports.buildAdminPanelEmbed = release107BuildAdminPanelEmbed;

function getStatusEmoji(member) {
  const status = member.presence?.status || 'offline';
  if (status === 'online') return '🟢';
  if (status === 'idle') return '🟡';
  if (status === 'dnd') return '⛔';
  return '⚫';
}

function getStatusLabel(member) {
  const status = member.presence?.status || 'offline';
  if (status === 'online') return 'Онлайн';
  if (status === 'idle') return 'Отошёл';
  if (status === 'dnd') return 'Не беспокоить';
  return 'Оффлайн';
}
