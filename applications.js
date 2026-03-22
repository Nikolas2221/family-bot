const copy = require('./copy');

function createApplicationsService({
  storage,
  fetchTextChannel,
  applicationsChannelId,
  applicationDefaultRole,
  logChannelId,
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

  async function sendApplyPanel(interaction) {
    const channel = await fetchTextChannel(interaction.guild, applicationsChannelId);
    if (!channel) {
      return interaction.reply({ content: copy.applications.channelMissing, ephemeral: true });
    }

    await channel.send({
      embeds: [embeds.buildApplicationsPanelEmbed()],
      components: embeds.buildApplicationsPanelButtons()
    });

    return interaction.reply({ content: copy.applications.panelSent, ephemeral: true });
  }

  async function submitApplication(interaction) {
    const sanitized = storage.sanitizeApplicationInput({
      nickname: interaction.fields.getTextInputValue('nickname'),
      age: interaction.fields.getTextInputValue('age'),
      text: interaction.fields.getTextInputValue('text')
    });

    if (sanitized.error) {
      return interaction.reply({ content: sanitized.error, ephemeral: true });
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

    return interaction.reply({ content: copy.applications.sent, ephemeral: true });
  }

  async function accept(interaction, applicationId, userId) {
    const application = storage.findApplication(applicationId);
    if (!application) {
      return interaction.reply({ content: copy.applications.notFound, ephemeral: true });
    }

    if (isTerminalApplicationStatus(application.status)) {
      return interaction.reply({ content: copy.applications.closed(formatStatus(application.status)), ephemeral: true });
    }

    const member = await interaction.guild.members.fetch(userId).catch(() => null);
    if (!member) {
      return interaction.reply({ content: copy.applications.memberNotFound, ephemeral: true });
    }

    if (applicationDefaultRole) {
      const role = interaction.guild.roles.cache.get(applicationDefaultRole);
      if (role) {
        const added = await member.roles.add(role).then(() => true).catch(() => false);
        if (!added) {
          return interaction.reply({
            content: copy.applications.roleAssignFailed,
            ephemeral: true
          });
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

    await interaction.message.edit({ embeds: [accepted], components: [] });
    await sendAcceptLog(interaction.guild, member, interaction.user, copy.applications.acceptReason, copy.applications.acceptRank);
    await sendAcceptanceDm({
      guild: interaction.guild,
      member,
      moderatorUser: interaction.user,
      reason: copy.applications.acceptReason,
      rankName: copy.applications.acceptRank
    });

    return interaction.reply({ content: copy.applications.acceptedReply(userId), ephemeral: true });
  }

  async function moveToReview(interaction, applicationId, userId) {
    const application = storage.findApplication(applicationId);
    if (!application) {
      return interaction.reply({ content: copy.applications.notFound, ephemeral: true });
    }

    if (isTerminalApplicationStatus(application.status)) {
      return interaction.reply({
        content: copy.applications.closedForReview(formatStatus(application.status)),
        ephemeral: true
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
    return interaction.reply({ content: copy.applications.reviewReply, ephemeral: true });
  }

  async function reject(interaction, applicationId, userId) {
    const application = storage.findApplication(applicationId);
    if (!application) {
      return interaction.reply({ content: copy.applications.notFound, ephemeral: true });
    }

    if (isTerminalApplicationStatus(application.status)) {
      return interaction.reply({ content: copy.applications.closed(formatStatus(application.status)), ephemeral: true });
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

    return interaction.reply({ content: copy.applications.rejectedReply(userId), ephemeral: true });
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
