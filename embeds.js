const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const copy = require('./copy');

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
      new ButtonBuilder().setCustomId('admin_blacklist').setLabel(copy.family.adminBlacklistButton).setStyle(ButtonStyle.Danger),
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
  buildLeaderboardEmbed,
  buildProfileEmbed,
  buildRankButtons,
  buildReactionRoleStatusEmbed,
  buildRejectLogEmbed,
  buildReportScheduleEmbed,
  buildUpdateAnnouncementEmbed,
  buildVoiceActivityEmbed,
  buildWelcomeStatusEmbed,
  buildWelcomeEmbed,
  buildWarnLogEmbed,
  panelButtons
};
