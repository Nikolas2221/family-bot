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

function getStatusEmoji(member) {
  const status = member.presence?.status || 'offline';
  if (status === 'online') return '🟢';
  if (status === 'idle') return '🟡';
  if (status === 'dnd') return '⛔';
  return '⚫';
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

function panelButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('family_refresh').setLabel(copy.family.refreshButton).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('family_apply').setLabel(copy.family.applyButton).setStyle(ButtonStyle.Success)
    )
  ];
}

function buildFamilyMenuEmbed() {
  return new EmbedBuilder()
    .setTitle(copy.family.menuTitle)
    .setColor(0x8b5cf6)
    .setDescription(copy.family.menuDescription)
    .setTimestamp();
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

function buildApplicationsPanelEmbed() {
  return new EmbedBuilder()
    .setTitle(copy.applications.panelTitle)
    .setColor(0x22c55e)
    .setDescription(copy.applications.panelDescription)
    .setFooter({ text: copy.applications.panelFooter })
    .setTimestamp();
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
  return new EmbedBuilder()
    .setColor(0x22c55e)
    .setTitle(copy.applications.embedTitle)
    .setDescription(copy.applications.description(source, user.id, copy.applications.statusLabel('review')))
    .addFields(
      { name: copy.applications.fieldUser, value: `<@${user.id}>`, inline: true },
      { name: copy.applications.fieldNick, value: nickname, inline: true },
      { name: copy.applications.fieldAge, value: age, inline: true },
      { name: copy.applications.fieldText, value: text, inline: false },
      { name: copy.applications.fieldId, value: `\`${applicationId}\``, inline: true }
    )
    .setFooter({ text: copy.applications.panelFooter })
    .setTimestamp();
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
  return new EmbedBuilder()
    .setColor(0x16a34a)
    .setTitle(copy.logs.acceptTitle)
    .setDescription(copy.logs.acceptDescription(moderatorUser.id, member.id))
    .addFields(
      {
        name: copy.logs.acceptedMember,
        value: [
          `**Пользователь:** <@${member.id}>`,
          `**Ник:** ${member.displayName}`,
          `**Discord ID:** \`${member.id}\``
        ].join('\n'),
        inline: false
      },
      {
        name: copy.logs.acceptedBy,
        value: [
          `**Пользователь:** <@${moderatorUser.id}>`,
          `**Ник:** ${moderatorUser.username}`,
          `**Discord ID:** \`${moderatorUser.id}\``
        ].join('\n'),
        inline: false
      },
      {
        name: copy.logs.acceptDetails,
        value: [`**Причина:** ${reason}`, `**Принят на:** ${rankName}`].join('\n'),
        inline: false
      }
    )
    .setFooter({ text: copy.logs.familyLogFooter })
    .setTimestamp();
}

function buildRejectLogEmbed({ user, moderatorUser, reason = 'Отказ' }) {
  return new EmbedBuilder()
    .setColor(0xef4444)
    .setTitle(copy.logs.rejectTitle)
    .setDescription(copy.logs.rejectDescription(moderatorUser.id, user.id))
    .addFields(
      {
        name: copy.logs.candidate,
        value: `**Пользователь:** <@${user.id}>\n**Discord ID:** \`${user.id}\``,
        inline: false
      },
      {
        name: copy.logs.rejectedBy,
        value: `**Пользователь:** <@${moderatorUser.id}>\n**Discord ID:** \`${moderatorUser.id}\``,
        inline: false
      },
      { name: copy.logs.reason, value: reason, inline: false }
    )
    .setFooter({ text: copy.logs.familyLogFooter })
    .setTimestamp();
}

function buildWarnLogEmbed({ targetUser, moderatorUser, reason }) {
  return new EmbedBuilder()
    .setColor(0xf97316)
    .setTitle(copy.logs.warnTitle)
    .setDescription(copy.logs.warnDescription(moderatorUser.id, targetUser.id))
    .addFields(
      { name: copy.logs.participant, value: `<@${targetUser.id}>\n\`${targetUser.id}\``, inline: true },
      { name: copy.logs.moderator, value: `<@${moderatorUser.id}>\n\`${moderatorUser.id}\``, inline: true },
      { name: copy.logs.reason, value: reason, inline: false }
    )
    .setFooter({ text: copy.logs.disciplineLogFooter })
    .setTimestamp();
}

function buildCommendLogEmbed({ targetUser, moderatorUser, reason }) {
  return new EmbedBuilder()
    .setColor(0x3b82f6)
    .setTitle(copy.logs.commendTitle)
    .setDescription(copy.logs.commendDescription(moderatorUser.id, targetUser.id))
    .addFields(
      { name: copy.logs.participant, value: `<@${targetUser.id}>\n\`${targetUser.id}\``, inline: true },
      { name: copy.logs.moderator, value: `<@${moderatorUser.id}>\n\`${moderatorUser.id}\``, inline: true },
      { name: copy.logs.reason, value: reason, inline: false }
    )
    .setFooter({ text: copy.logs.disciplineLogFooter })
    .setTimestamp();
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

  return new EmbedBuilder()
    .setColor(0x8b5cf6)
    .setTitle(copy.profile.title)
    .setDescription(copy.profile.description(member.id))
    .setThumbnail(member.user.displayAvatarURL())
    .addFields(
      { name: copy.profile.fieldNick, value: member.displayName, inline: true },
      { name: copy.profile.fieldDiscord, value: `<@${member.id}>`, inline: true },
      { name: copy.profile.fieldId, value: `\`${member.id}\``, inline: true },
      { name: copy.profile.fieldRoles, value: familyRoles, inline: false },
      { name: copy.profile.fieldActivity, value: String(activityScore(member.id)), inline: true },
      { name: copy.profile.fieldRank, value: currentRoleName, inline: true },
      { name: copy.profile.fieldWarns, value: String(memberData.warns || 0), inline: true },
      { name: copy.profile.fieldCommends, value: String(memberData.commends || 0), inline: true },
      { name: copy.profile.fieldMessages, value: String(memberData.messageCount || 0), inline: true },
      { name: copy.profile.fieldStatus, value: `${getStatusEmoji(member)} ${member.presence?.status || 'offline'}`, inline: true },
      { name: copy.profile.fieldAutoRank, value: autoRankText, inline: false }
    )
    .setFooter({ text: copy.profile.footer })
    .setTimestamp();
}

function buildApplicationsListEmbed(applications) {
  const description = applications.length
    ? applications.map((application, index) => copy.list.line(index, application)).join('\n')
    : copy.list.empty;

  return new EmbedBuilder()
    .setTitle(copy.list.title)
    .setColor(0x22c55e)
    .setDescription(description)
    .setTimestamp();
}

function buildBlacklistEmbed(entries) {
  const description = entries.length
    ? entries.map((entry, index) => copy.security.blacklistLine(index, entry)).join('\n')
    : copy.security.blacklistEmpty;

  return new EmbedBuilder()
    .setColor(0xef4444)
    .setTitle(copy.security.blacklistTitle)
    .setDescription(description)
    .setTimestamp();
}

function buildAdminPanelEmbed({ guildName, record }) {
  const planLabel = record.plan === 'premium' ? copy.admin.panelPremium : copy.admin.panelFree;

  return new EmbedBuilder()
    .setColor(record.plan === 'premium' ? 0xf59e0b : 0x22c55e)
    .setTitle(copy.admin.panelTitle)
    .setDescription(guildName)
    .addFields(
      { name: copy.admin.panelFieldPlan, value: planLabel, inline: true },
      { name: copy.admin.panelFieldSetup, value: record.setupCompleted ? copy.admin.panelSetupDone : copy.admin.panelSetupPending, inline: true },
      { name: copy.admin.panelFieldFeatures, value: copy.admin.panelFeatures(record.plan), inline: false },
      {
        name: copy.admin.panelFieldChannels,
        value: [
          copy.admin.channelLine('Панель', record.settings.channels.panel),
          copy.admin.channelLine('Заявки', record.settings.channels.applications),
          copy.admin.channelLine('Логи', record.settings.channels.logs),
          copy.admin.channelLine('Дисциплина', record.settings.channels.disciplineLogs)
        ].join('\n'),
        inline: false
      },
      {
        name: copy.admin.panelFieldRoles,
        value: [
          copy.admin.roleLine('Лидер', record.settings.roles.leader),
          copy.admin.roleLine('Зам', record.settings.roles.deputy),
          copy.admin.roleLine('Старший', record.settings.roles.elder),
          copy.admin.roleLine('Участник', record.settings.roles.member),
          copy.admin.roleLine('Новичок', record.settings.roles.newbie)
        ].join('\n'),
        inline: false
      }
    )
    .setTimestamp();
}

function buildHelpEmbed({ plan, availableCommands, premiumCommands }) {
  return new EmbedBuilder()
    .setColor(plan === 'premium' ? 0xf59e0b : 0x3b82f6)
    .setTitle(copy.help.title(plan))
    .addFields(
      {
        name: copy.help.freeSection,
        value: availableCommands.map(command => copy.help.line(command.name, command.description)).join('\n'),
        inline: false
      },
      {
        name: copy.help.premiumSection,
        value: premiumCommands.length
          ? premiumCommands.map(command => copy.help.line(command.name, command.description)).join('\n')
          : copy.debugConfig.none,
        inline: false
      }
    )
    .setTimestamp();
}

function joinSectionLines(lines) {
  return lines && lines.length ? lines.join('\n') : copy.debugConfig.none;
}

function buildDebugConfigEmbed({ summaryLines, validation }) {
  const hasErrors = validation.errors.length > 0;
  const hasWarnings = validation.warnings.length > 0;

  return new EmbedBuilder()
    .setColor(hasErrors ? 0xef4444 : hasWarnings ? 0xf59e0b : 0x22c55e)
    .setTitle(hasErrors ? copy.debugConfig.titleError : hasWarnings ? copy.debugConfig.titleWarn : copy.debugConfig.titleOk)
    .addFields(
      { name: copy.debugConfig.summaryField, value: joinSectionLines(summaryLines), inline: false },
      { name: copy.debugConfig.notesField, value: joinSectionLines(validation.notes), inline: false },
      { name: copy.debugConfig.warningsField, value: joinSectionLines(validation.warnings), inline: false },
      { name: copy.debugConfig.errorsField, value: joinSectionLines(validation.errors), inline: false }
    )
    .setFooter({ text: copy.debugConfig.footer })
    .setTimestamp();
}

async function buildFamilyEmbeds(guild, { roles, familyTitle, updateIntervalMs, activityScore }) {
  const configuredRoles = roles
    .map(item => ({ ...item, role: guild.roles.cache.get(item.id) }))
    .filter(item => item.role)
    .sort((a, b) => b.role.position - a.role.position);

  const result = [];
  let embed = new EmbedBuilder()
    .setTitle(familyTitle)
    .setColor(0x8b5cf6)
    .setDescription(copy.family.legend)
    .setTimestamp()
    .setFooter({ text: copy.family.updateInterval(Math.floor(updateIntervalMs / 1000)) });

  let total = 0;
  let fieldCount = 0;

  for (const item of configuredRoles) {
    const members = sortMembers(item.role.members.map(member => member), activityScore);
    if (!members.length) continue;

    total += members.length;
    const lines = members.map(member => `${getStatusEmoji(member)} <@${member.id}> • ${copy.family.points(activityScore(member.id))}`);
    const parts = chunk(lines, 15);

    for (let index = 0; index < parts.length; index += 1) {
      if (fieldCount >= 25) {
        result.push(embed);
        embed = new EmbedBuilder().setColor(0x8b5cf6).setTimestamp();
        fieldCount = 0;
      }

      embed.addFields({
        name: index === 0 ? `${item.name} (${members.length})` : copy.family.continued(item.name),
        value: parts[index].join('\n'),
        inline: false
      });
      fieldCount += 1;
    }
  }

  if (fieldCount === 0) {
    embed.setDescription(copy.family.emptyMembers);
  }

  embed.setAuthor({ name: copy.family.totalMembers(total) });
  result.push(embed);
  return result;
}

module.exports = {
  buildAcceptLogEmbed,
  buildApplicationButtons,
  buildApplicationEmbed,
  buildApplicationsListEmbed,
  buildApplicationsPanelButtons,
  buildApplicationsPanelEmbed,
  buildApplyModal,
  buildAdminPanelEmbed,
  buildBlacklistEmbed,
  buildCommendLogEmbed,
  buildDebugConfigEmbed,
  buildFamilyEmbeds,
  buildFamilyMenuEmbed,
  buildHelpEmbed,
  buildProfileEmbed,
  buildRankButtons,
  buildRejectLogEmbed,
  buildWarnLogEmbed,
  panelButtons
};
