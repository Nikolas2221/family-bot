function createApplicationsService({
  storage,
  fetchTextChannel,
  applicationsChannelId,
  applicationDefaultRole,
  logChannelId,
  client,
  embeds,
  sendAcceptLog
}) {
  const STATUS_LABELS = {
    pending: 'На рассмотрении',
    review: 'На рассмотрении',
    accepted: 'Принята',
    rejected: 'Отклонена'
  };

  const TEXT = {
    applicationNotFound: 'Заявка не найдена.',
    applicationsChannelMissing: 'Канал заявок не найден.',
    applicationsPanelSent: 'Панель заявок отправлена в канал заявок.',
    applicationSent: 'Заявка отправлена. Ожидай решения руководства.',
    memberNotFound: 'Пользователь не найден на сервере.',
    roleAssignFailed: 'Не удалось выдать роль. Проверь права бота и позицию роли.'
  };

  function formatStatus(status) {
    return STATUS_LABELS[status] || status;
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
      return interaction.reply({ content: TEXT.applicationsChannelMissing, ephemeral: true });
    }

    await channel.send({
      embeds: [embeds.buildApplicationsPanelEmbed()],
      components: embeds.buildApplicationsPanelButtons()
    });

    return interaction.reply({ content: TEXT.applicationsPanelSent, ephemeral: true });
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

    return interaction.reply({ content: TEXT.applicationSent, ephemeral: true });
  }

  async function accept(interaction, applicationId, userId) {
    const application = storage.findApplication(applicationId);
    if (!application) {
      return interaction.reply({ content: TEXT.applicationNotFound, ephemeral: true });
    }

    if (isTerminalApplicationStatus(application.status)) {
      return interaction.reply({ content: `Заявка уже закрыта: ${formatStatus(application.status)}.`, ephemeral: true });
    }

    const member = await interaction.guild.members.fetch(userId).catch(() => null);
    if (!member) {
      return interaction.reply({ content: TEXT.memberNotFound, ephemeral: true });
    }

    if (applicationDefaultRole) {
      const role = interaction.guild.roles.cache.get(applicationDefaultRole);
      if (role) {
        const added = await member.roles.add(role).then(() => true).catch(() => false);
        if (!added) {
          return interaction.reply({
            content: TEXT.roleAssignFailed,
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
      source: 'Заявка'
    });

    accepted
      .setColor(0x16a34a)
      .setDescription(`> **Заявка от <@${userId}>**\n> Статус: **Принята**`)
      .setFooter({ text: `Принял: ${interaction.user.username}` });

    await interaction.message.edit({ embeds: [accepted], components: [] });
    await sendAcceptLog(interaction.guild, member, interaction.user, 'Собеседование', '1 ранг');

    return interaction.reply({ content: `✅ <@${userId}> принят в семью.`, ephemeral: true });
  }

  async function moveToReview(interaction, applicationId, userId) {
    const application = storage.findApplication(applicationId);
    if (!application) {
      return interaction.reply({ content: TEXT.applicationNotFound, ephemeral: true });
    }

    if (isTerminalApplicationStatus(application.status)) {
      return interaction.reply({
        content: `Нельзя вернуть закрытую заявку в рассмотрение. Текущий статус: ${formatStatus(application.status)}.`,
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
      source: 'Заявка'
    });

    review
      .setColor(0x64748b)
      .setDescription(`> **Заявка от <@${userId}>**\n> Статус: **На рассмотрении**`)
      .setFooter({ text: `Рассматривает: ${interaction.user.username}` });

    await interaction.message.edit({ embeds: [review], components: interaction.message.components });
    return interaction.reply({ content: '🕒 Заявка переведена в статус "На рассмотрении".', ephemeral: true });
  }

  async function reject(interaction, applicationId, userId) {
    const application = storage.findApplication(applicationId);
    if (!application) {
      return interaction.reply({ content: TEXT.applicationNotFound, ephemeral: true });
    }

    if (isTerminalApplicationStatus(application.status)) {
      return interaction.reply({ content: `Заявка уже закрыта: ${formatStatus(application.status)}.`, ephemeral: true });
    }

    storage.setApplicationStatus(application, 'rejected', interaction.user.id);

    const rejected = embeds.buildApplicationEmbed({
      user: { id: userId },
      nickname: application.nickname,
      age: application.age,
      text: application.text,
      applicationId,
      source: 'Заявка'
    });

    rejected
      .setColor(0xef4444)
      .setDescription(`> **Заявка от <@${userId}>**\n> Статус: **Отклонена**`)
      .setFooter({ text: `Отклонил: ${interaction.user.username}` });

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
              reason: 'Отказ по решению руководства'
            })
          ]
        });
      }
    }

    return interaction.reply({ content: `❌ <@${userId}> отклонён.`, ephemeral: true });
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
