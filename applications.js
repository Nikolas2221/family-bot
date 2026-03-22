const { MessageFlags } = require('discord.js');
const copy = require('./copy');

function ephemeral(payload = {}) {
  return { ...payload, flags: MessageFlags.Ephemeral };
}

function normalizeRankToken(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/<@&(\d+)>/g, '$1')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function createApplicationsService({
  storage,
  fetchTextChannel,
  applicationsChannelId,
  applicationDefaultRole,
  logChannelId,
  applicationsBanner,
  familyRoles = [],
  client,
  embeds,
  sendAcceptLog,
  sendAcceptanceDm = async () => {}
}) {
  function formatStatus(status) {
    return copy.applications.statusLabel(status);
  }

  function getCooldownSecondsLeft(userId, cooldownMs) {
    const last = storage.getCooldown(userId);
    if (!last) return 0;
    const leftMs = cooldownMs - (Date.now() - last);
    return leftMs > 0 ? Math.ceil(leftMs / 1000) : 0;
  }

  function isTerminalApplicationStatus(status) {
    return status === 'accepted' || status === 'rejected';
  }

  function resolveAcceptedRoleId(rankName) {
    const fallbackRoleId = applicationDefaultRole || familyRoles.find(role => role.key === 'newbie')?.id || '';
    const normalized = normalizeRankToken(rankName);
    if (!normalized) return fallbackRoleId;

    const ordinalAliases = new Map([
      ['1', 'newbie'],
      ['1ранг', 'newbie'],
      ['ранг1', 'newbie'],
      ['2', 'member'],
      ['2ранг', 'member'],
      ['ранг2', 'member'],
      ['3', 'elder'],
      ['3ранг', 'elder'],
      ['ранг3', 'elder'],
      ['4', 'deputy'],
      ['4ранг', 'deputy'],
      ['ранг4', 'deputy'],
      ['5', 'leader'],
      ['5ранг', 'leader'],
      ['ранг5', 'leader']
    ]);

    const directRole = familyRoles.find(role => {
      const aliases = new Set([
        normalizeRankToken(role.id),
        normalizeRankToken(role.key),
        normalizeRankToken(role.name)
      ]);
      return aliases.has(normalized);
    });
    if (directRole?.id) return directRole.id;

    const ordinalKey = ordinalAliases.get(normalized);
    if (ordinalKey) {
      return familyRoles.find(role => role.key === ordinalKey)?.id || fallbackRoleId;
    }

    return fallbackRoleId;
  }

  async function sendApplyPanel(interaction) {
    const channel = await fetchTextChannel(interaction.guild, applicationsChannelId);
    if (!channel) {
      return interaction.reply(ephemeral({ content: copy.applications.channelMissing }));
    }

    await channel.send({
      embeds: [embeds.buildApplicationsPanelEmbed({ imageUrl: applicationsBanner })],
      components: embeds.buildApplicationsPanelButtons()
    });

    return interaction.reply(ephemeral({ content: copy.applications.panelSent }));
  }

  async function submitApplication(interaction) {
    const sanitized = storage.sanitizeApplicationInput({
      nickname: interaction.fields.getTextInputValue('nickname'),
      age: interaction.fields.getTextInputValue('age'),
      text: interaction.fields.getTextInputValue('text')
    });

    if (sanitized.error) {
      return interaction.reply(ephemeral({ content: sanitized.error }));
    }

    const { nickname, age, text } = sanitized;
    storage.setCooldown(interaction.user.id);
    const applicationId = storage.createApplication({
      userId: interaction.user.id,
      nickname,
      age,
      text
    });

    const channel = await fetchTextChannel(interaction.guild, applicationsChannelId);
    if (channel) {
      await channel.send({
        embeds: [embeds.buildApplicationEmbed({ user: interaction.user, nickname, age, text, applicationId })],
        components: embeds.buildApplicationButtons(applicationId, interaction.user.id)
      });
    }

    return interaction.reply(ephemeral({ content: copy.applications.sent }));
  }

  async function accept(interaction, applicationId, userId, details = {}) {
    const application = storage.findApplication(applicationId);
    if (!application) {
      return interaction.reply(ephemeral({ content: copy.applications.notFound }));
    }

    if (isTerminalApplicationStatus(application.status)) {
      return interaction.reply(ephemeral({ content: copy.applications.closed(formatStatus(application.status)) }));
    }

    const member = await interaction.guild.members.fetch(userId).catch(() => null);
    if (!member) {
      return interaction.reply(ephemeral({ content: copy.applications.memberNotFound }));
    }

    const acceptedRoleId = resolveAcceptedRoleId(details.rankName);
    if (acceptedRoleId) {
      const role = interaction.guild.roles.cache.get(acceptedRoleId);
      if (role) {
        const added = await member.roles.add(role).then(() => true).catch(() => false);
        if (!added) {
          return interaction.reply({
            content: copy.applications.roleAssignFailed,
            flags: MessageFlags.Ephemeral
          });
        }

        const removableRoleIds = familyRoles
          .filter(item => item.id && item.id !== acceptedRoleId && member.roles.cache.has(item.id))
          .map(item => item.id);
        if (removableRoleIds.length) {
          await member.roles.remove(removableRoleIds).catch(() => {});
        }
      }
    }

    storage.setApplicationStatus(application, 'accepted', interaction.user.id);

    const accepted = embeds.buildApplicationEmbed({
      user: { id: userId },
      nickname: application.nickname,
      age: application.age,
      text: application.text,
      applicationId,
      source: copy.applications.source
    });

    accepted
      .setColor(0x16a34a)
      .setDescription(copy.applications.description(copy.applications.source, userId, copy.applications.statusLabel('accepted')))
      .setFooter({ text: copy.applications.acceptedFooter(interaction.user.username) });

    const reason = String(details.reason || '').trim() || copy.applications.acceptReason;
    const rankName = String(details.rankName || '').trim() || copy.applications.acceptRank;

    const targetMessage = interaction.message
      || await interaction.channel?.messages?.fetch?.(details.messageId).catch(() => null);

    if (!targetMessage) {
      return interaction.reply(ephemeral({ content: copy.common.unknownError }));
    }

    await targetMessage.edit({ embeds: [accepted], components: [] });
    await sendAcceptLog(interaction.guild, member, interaction.user, reason, rankName);
    await sendAcceptanceDm({
      guild: interaction.guild,
      member,
      moderatorUser: interaction.user,
      reason,
      rankName
    });

    return interaction.reply(ephemeral({ content: copy.applications.acceptedReply(userId) }));
  }

  async function moveToReview(interaction, applicationId, userId) {
    const application = storage.findApplication(applicationId);
    if (!application) {
      return interaction.reply(ephemeral({ content: copy.applications.notFound }));
    }

    if (isTerminalApplicationStatus(application.status)) {
      return interaction.reply({
        content: copy.applications.closedForReview(formatStatus(application.status)),
        flags: MessageFlags.Ephemeral
      });
    }

    storage.setApplicationStatus(application, 'review', interaction.user.id);

    const review = embeds.buildApplicationEmbed({
      user: { id: userId },
      nickname: application.nickname,
      age: application.age,
      text: application.text,
      applicationId,
      source: copy.applications.source
    });

    review
      .setColor(0x64748b)
      .setDescription(copy.applications.description(copy.applications.source, userId, copy.applications.statusLabel('review')))
      .setFooter({ text: copy.applications.reviewFooter(interaction.user.username) });

    await interaction.message.edit({ embeds: [review], components: interaction.message.components });
    return interaction.reply(ephemeral({ content: copy.applications.reviewReply }));
  }

  async function reject(interaction, applicationId, userId) {
    const application = storage.findApplication(applicationId);
    if (!application) {
      return interaction.reply(ephemeral({ content: copy.applications.notFound }));
    }

    if (isTerminalApplicationStatus(application.status)) {
      return interaction.reply(ephemeral({ content: copy.applications.closed(formatStatus(application.status)) }));
    }

    storage.setApplicationStatus(application, 'rejected', interaction.user.id);

    const rejected = embeds.buildApplicationEmbed({
      user: { id: userId },
      nickname: application.nickname,
      age: application.age,
      text: application.text,
      applicationId,
      source: copy.applications.source
    });

    rejected
      .setColor(0xef4444)
      .setDescription(copy.applications.description(copy.applications.source, userId, copy.applications.statusLabel('rejected')))
      .setFooter({ text: copy.applications.rejectedFooter(interaction.user.username) });

    await interaction.message.edit({ embeds: [rejected], components: [] });

    const user = await client.users.fetch(userId).catch(() => null);
    if (user && logChannelId) {
      const channel = await fetchTextChannel(interaction.guild, logChannelId);
      if (channel) {
        await channel.send({
          embeds: [
            embeds.buildRejectLogEmbed({
              user,
              moderatorUser: interaction.user,
              reason: copy.applications.rejectReason
            })
          ]
        });
      }
    }

    return interaction.reply(ephemeral({ content: copy.applications.rejectedReply(userId) }));
  }

  return {
    accept,
    getCooldownSecondsLeft,
    moveToReview,
    reject,
    sendApplyPanel,
    submitApplication
  };
}

module.exports = { createApplicationsService };
