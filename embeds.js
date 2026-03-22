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

function card({ title, description, color, footer, thumbnail, author }) {
  const embed = new EmbedBuilder().setColor(color).setTitle(title).setTimestamp();

  if (description) embed.setDescription(description);
  embed.setFooter({ text: footer || BRAND_FOOTER });
  if (thumbnail) embed.setThumbnail(thumbnail);
  if (author) embed.setAuthor(author);

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
      new ButtonBuilder().setCustomId('family_apply').setLabel(copy.family.applyButton).setStyle(ButtonStyle.Success)
    )
  ];
}

function buildFamilyMenuEmbed() {
  return card({
    title: copy.family.menuTitle,
    color: THEME.brand,
    description: [
      'Панель семьи в стиле BRHD / Phoenix.',
      '',
      `• ${copy.family.refreshButton} — обновить состав, активность и ранги`,
      `• ${copy.family.applyButton} — открыть фирменную анкету кандидата`
    ].join('\n'),
    footer: 'BRHD • Phoenix • Family Control'
  });
}

function buildWelcomeEmbed(member, familyTitle) {
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
    thumbnail: avatarUrl(member.user)
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
      new TextInputBuilder().setCustomId('age').setLabel(copy.applications.applyModalAge).setStyle(TextInputStyle.Short).setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('text')
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

function buildApplicationsPanelEmbed() {
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
    footer: 'BRHD • Phoenix • Applications'
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

async function buildFamilyEmbeds(guild, { roles, familyTitle, updateIntervalMs, activityScore }) {
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
      `**Всего участников:** ${totalMembers}`,
      `**С ролями:** ${membersWithFamilyRoles}`,
      `**Без ролей:** ${membersWithoutFamilyRoles}`,
      `**Активных секций:** ${activeRoles.length}`,
      `**Обновление:** каждые ${Math.floor(updateIntervalMs / 1000)} сек.`,
      '',
      copy.family.legend
    ].join('\n'),
    footer: `BRHD • Phoenix • ${copy.family.updateInterval(Math.floor(updateIntervalMs / 1000))}`
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

module.exports = {
  buildAcceptLogEmbed,
  buildApplicationButtons,
  buildApplicationEmbed,
  buildApplicationsListEmbed,
  buildApplicationsPanelButtons,
  buildApplicationsPanelEmbed,
  buildAcceptModal,
  buildApplyModal,
  buildAdminPanelEmbed,
  buildBanListEmbed,
  buildBlacklistEmbed,
  buildCommendLogEmbed,
  buildDebugConfigEmbed,
  buildFamilyEmbeds,
  buildFamilyMenuEmbed,
  buildHelpEmbed,
  buildLeaderboardEmbed,
  buildProfileEmbed,
  buildRankButtons,
  buildRejectLogEmbed,
  buildVoiceActivityEmbed,
  buildWelcomeEmbed,
  buildWarnLogEmbed,
  panelButtons
};
