interface InteractionRuntimeOptions {
  client: {
    removeAllListeners(event: string): unknown;
    on(event: string, listener: (...args: any[]) => unknown): unknown;
  };
  handlePrimaryInteraction(interaction: any): Promise<unknown>;
  ephemeral(payload: Record<string, unknown>): Record<string, unknown>;
  copy: any;
  embeds: any;
  database: any;
  EmbedBuilderCtor: new () => any;
  resolveGuildSettings(guildId: string): any;
  getGuildRecord(guild: any): any;
  canDebugConfig(interaction: any): boolean;
  isPremiumGuild(guildId: string): boolean;
  fetchTextChannel(guild: any, channelId?: string | null): Promise<any>;
  sendWelcomeInvite(member: any): Promise<unknown>;
  getVerificationRoleId(guildId: string): string;
  applyVerificationRole(member: any): Promise<{ ok: boolean; roleId?: string }>;
  getRoleMenuEntries(guildId: string): any[];
  findRoleMenu(guildId: string, menuId: string): any;
  saveRoleMenu(guildId: string, menu: any): void;
  removeRoleMenuItem(guildId: string, menuId: string, roleId: string): void;
  getCustomCommands(guildId: string): any[];
  getReactionRoleEntries(guildId: string): any[];
  normalizeReactionEmoji(emojiValue?: string): string;
  sendScheduledReport(guild: any, period: string, channelId: string): Promise<boolean>;
}

async function handleWelcomeCommands(interaction: any, options: InteractionRuntimeOptions): Promise<boolean> {
  const guildId = interaction.guild?.id;
  if (!guildId || interaction.commandName !== 'welcome') return false;
  if (!options.canDebugConfig(interaction)) {
    await interaction.reply(options.ephemeral({ content: options.copy.common.noAccess }));
    return true;
  }

  const settings = options.resolveGuildSettings(guildId);
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === options.copy.commands.welcomeStatusSubcommand) {
    await interaction.reply(options.ephemeral({
      embeds: [options.embeds.buildWelcomeStatusEmbed({
        enabled: settings.welcome.enabled,
        channelId: settings.channels.welcome,
        dmEnabled: settings.welcome.dmEnabled,
        message: settings.welcome.message,
        autoroleRoleId: settings.autoroleRoleId
      })]
    }));
    return true;
  }

  if (subcommand === options.copy.commands.welcomeToggleSubcommand) {
    const enabled = interaction.options.getString(options.copy.commands.stateOptionName, true) === 'on';
    options.database.updateGuildSettings(guildId, { welcome: { enabled } });
    const next = options.resolveGuildSettings(guildId);
    await interaction.reply(options.ephemeral({
      content: options.copy.welcome.updated(enabled ? 'status: on' : 'status: off'),
      embeds: [options.embeds.buildWelcomeStatusEmbed({
        enabled,
        channelId: next.channels.welcome,
        dmEnabled: next.welcome.dmEnabled,
        message: next.welcome.message,
        autoroleRoleId: next.autoroleRoleId
      })]
    }));
    return true;
  }

  if (subcommand === options.copy.commands.welcomeChannelSubcommand) {
    const channel = interaction.options.getChannel(options.copy.commands.channelValueOptionName, true);
    options.database.updateGuildSettings(guildId, { channels: { welcome: channel.id } });
    const next = options.resolveGuildSettings(guildId);
    await interaction.reply(options.ephemeral({
      content: options.copy.welcome.updated(`channel: <#${channel.id}>`),
      embeds: [options.embeds.buildWelcomeStatusEmbed({
        enabled: next.welcome.enabled,
        channelId: channel.id,
        dmEnabled: next.welcome.dmEnabled,
        message: next.welcome.message,
        autoroleRoleId: next.autoroleRoleId
      })]
    }));
    return true;
  }

  if (subcommand === options.copy.commands.welcomeDmSubcommand) {
    const dmEnabled = interaction.options.getString(options.copy.commands.stateOptionName, true) === 'on';
    options.database.updateGuildSettings(guildId, { welcome: { dmEnabled } });
    const next = options.resolveGuildSettings(guildId);
    await interaction.reply(options.ephemeral({
      content: options.copy.welcome.updated(dmEnabled ? 'dm: on' : 'dm: off'),
      embeds: [options.embeds.buildWelcomeStatusEmbed({
        enabled: next.welcome.enabled,
        channelId: next.channels.welcome,
        dmEnabled,
        message: next.welcome.message,
        autoroleRoleId: next.autoroleRoleId
      })]
    }));
    return true;
  }

  if (subcommand === options.copy.commands.welcomeMessageSubcommand) {
    const rawMessage = interaction.options.getString(options.copy.commands.messageOptionName, true).trim();
    const nextMessage = ['off', 'clear', 'none'].includes(rawMessage.toLowerCase()) ? '' : rawMessage.slice(0, 1000);
    options.database.updateGuildSettings(guildId, { welcome: { message: nextMessage } });
    const next = options.resolveGuildSettings(guildId);
    await interaction.reply(options.ephemeral({
      content: nextMessage ? options.copy.welcome.updated('message') : options.copy.welcome.messageCleared,
      embeds: [options.embeds.buildWelcomeStatusEmbed({
        enabled: next.welcome.enabled,
        channelId: next.channels.welcome,
        dmEnabled: next.welcome.dmEnabled,
        message: nextMessage,
        autoroleRoleId: next.autoroleRoleId
      })]
    }));
    return true;
  }

  if (subcommand === options.copy.commands.welcomeTestSubcommand) {
    const member = interaction.member || await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (member) {
      await options.sendWelcomeInvite(member).catch(() => null);
    }
    await interaction.reply(options.ephemeral({ content: options.copy.welcome.testSent }));
    return true;
  }

  return false;
}

async function handleAutoroleCommands(interaction: any, options: InteractionRuntimeOptions): Promise<boolean> {
  const guildId = interaction.guild?.id;
  if (!guildId || interaction.commandName !== 'autorole') return false;
  if (!options.canDebugConfig(interaction)) {
    await interaction.reply(options.ephemeral({ content: options.copy.common.noAccess }));
    return true;
  }

  const subcommand = interaction.options.getSubcommand();
  if (subcommand === options.copy.commands.autoroleStatusSubcommand) {
    await interaction.reply(options.ephemeral({
      embeds: [options.embeds.buildAutoroleStatusEmbed(options.resolveGuildSettings(guildId).autoroleRoleId)]
    }));
    return true;
  }

  if (subcommand === options.copy.commands.autoroleSetSubcommand) {
    const role = interaction.options.getRole(options.copy.commands.roleValueOptionName, true);
    options.database.updateGuildSettings(guildId, { roles: { autorole: role.id } });
    await interaction.reply(options.ephemeral({
      content: `Autorole настроена: <@&${role.id}>`,
      embeds: [options.embeds.buildAutoroleStatusEmbed(role.id)]
    }));
    return true;
  }

  if (subcommand === options.copy.commands.autoroleClearSubcommand) {
    options.database.updateGuildSettings(guildId, { roles: { autorole: '' } });
    await interaction.reply(options.ephemeral({
      content: 'Autorole отключена.',
      embeds: [options.embeds.buildAutoroleStatusEmbed('')]
    }));
    return true;
  }

  return false;
}

async function handleReactionRoleCommands(interaction: any, options: InteractionRuntimeOptions): Promise<boolean> {
  const guildId = interaction.guild?.id;
  if (!guildId || interaction.commandName !== 'reactionrole') return false;
  if (!options.isPremiumGuild(guildId)) {
    await interaction.reply(options.ephemeral({ content: options.copy.admin.premiumOnly }));
    return true;
  }
  if (!options.canDebugConfig(interaction)) {
    await interaction.reply(options.ephemeral({ content: options.copy.common.noAccess }));
    return true;
  }

  const subcommand = interaction.options.getSubcommand();
  if (subcommand === options.copy.commands.reactionRoleStatusSubcommand) {
    await interaction.reply(options.ephemeral({
      embeds: [options.embeds.buildReactionRoleStatusEmbed(options.getReactionRoleEntries(guildId))]
    }));
    return true;
  }

  const messageId = interaction.options.getString(options.copy.commands.messageIdOptionName, true).trim();
  const emoji = interaction.options.getString(options.copy.commands.emojiOptionName, true).trim();
  const emojiKey = options.normalizeReactionEmoji(emoji);

  if (subcommand === options.copy.commands.reactionRoleAddSubcommand) {
    const role = interaction.options.getRole(options.copy.commands.roleValueOptionName, true);
    const channel = interaction.options.getChannel(options.copy.commands.channelOptionName) || interaction.channel;
    if (!channel?.isTextBased?.() || typeof channel.messages?.fetch !== 'function') {
      await interaction.reply(options.ephemeral({ content: options.copy.reactionRoles.messageMissing }));
      return true;
    }

    const targetMessage = await channel.messages.fetch(messageId).catch(() => null);
    if (!targetMessage) {
      await interaction.reply(options.ephemeral({ content: options.copy.reactionRoles.messageMissing }));
      return true;
    }

    const nextEntries = options.getReactionRoleEntries(guildId)
      .filter((entry: any) => !(entry.messageId === messageId && entry.emojiKey === emojiKey))
      .concat([{ messageId, channelId: channel.id, roleId: role.id, emoji, emojiKey }]);

    options.database.updateGuildSettings(guildId, { reactionRoles: nextEntries });
    await targetMessage.react(emoji).catch(() => null);

    await interaction.reply(options.ephemeral({
      content: options.copy.reactionRoles.added(emoji, role.id, messageId),
      embeds: [options.embeds.buildReactionRoleStatusEmbed(nextEntries)]
    }));
    return true;
  }

  if (subcommand === options.copy.commands.reactionRoleRemoveSubcommand) {
    const currentEntries = options.getReactionRoleEntries(guildId);
    const nextEntries = currentEntries.filter((entry: any) => !(entry.messageId === messageId && entry.emojiKey === emojiKey));
    if (nextEntries.length === currentEntries.length) {
      await interaction.reply(options.ephemeral({ content: options.copy.reactionRoles.notFound }));
      return true;
    }

    options.database.updateGuildSettings(guildId, { reactionRoles: nextEntries });
    await interaction.reply(options.ephemeral({
      content: options.copy.reactionRoles.removed(emoji, messageId),
      embeds: [options.embeds.buildReactionRoleStatusEmbed(nextEntries)]
    }));
    return true;
  }

  return false;
}

async function handleReportScheduleCommands(interaction: any, options: InteractionRuntimeOptions): Promise<boolean> {
  const guildId = interaction.guild?.id;
  if (!guildId || interaction.commandName !== 'reportschedule') return false;
  if (!options.isPremiumGuild(guildId)) {
    await interaction.reply(options.ephemeral({ content: options.copy.admin.premiumOnly }));
    return true;
  }
  if (!options.canDebugConfig(interaction)) {
    await interaction.reply(options.ephemeral({ content: options.copy.common.noAccess }));
    return true;
  }

  const settings = options.resolveGuildSettings(guildId);
  const subcommand = interaction.options.getSubcommand();
  const periodLabel = (period: string) => period === 'monthly' ? options.copy.reports.periodMonthly : options.copy.reports.periodWeekly;

  if (subcommand === options.copy.commands.reportScheduleStatusSubcommand) {
    await interaction.reply(options.ephemeral({
      embeds: [options.embeds.buildReportScheduleEmbed(settings.reportSchedule, settings.channels)]
    }));
    return true;
  }

  const period = interaction.options.getString(options.copy.commands.periodOptionName, true);

  if (subcommand === options.copy.commands.reportScheduleSetSubcommand) {
    const channel = interaction.options.getChannel(options.copy.commands.channelValueOptionName);
    const patch: any = {
      reportSchedule: {
        [period]: {
          enabled: true,
          channelId: channel?.id || settings.reportSchedule?.[period]?.channelId || settings.channels.reports || ''
        }
      }
    };
    if (channel?.id) {
      patch.channels = { reports: channel.id };
    }
    options.database.updateGuildSettings(guildId, patch);
    const next = options.resolveGuildSettings(guildId);
    await interaction.reply(options.ephemeral({
      content: options.copy.reports.enabled(periodLabel(period), patch.reportSchedule[period].channelId || settings.channels.reports),
      embeds: [options.embeds.buildReportScheduleEmbed(next.reportSchedule, next.channels)]
    }));
    return true;
  }

  if (subcommand === options.copy.commands.reportScheduleOffSubcommand) {
    options.database.updateGuildSettings(guildId, { reportSchedule: { [period]: { enabled: false } } });
    const next = options.resolveGuildSettings(guildId);
    await interaction.reply(options.ephemeral({
      content: options.copy.reports.disabled(periodLabel(period)),
      embeds: [options.embeds.buildReportScheduleEmbed(next.reportSchedule, next.channels)]
    }));
    return true;
  }

  if (subcommand === options.copy.commands.reportScheduleSendSubcommand) {
    const channelId = settings.reportSchedule?.[period]?.channelId || settings.channels.reports || interaction.channelId;
    const sent = await options.sendScheduledReport(interaction.guild, period, channelId);
    if (!sent) {
      await interaction.reply(options.ephemeral({ content: options.copy.reports.channelMissing }));
      return true;
    }

    await interaction.reply(options.ephemeral({
      content: options.copy.reports.sent(periodLabel(period), channelId),
      embeds: [options.embeds.buildReportScheduleEmbed(options.resolveGuildSettings(guildId).reportSchedule, options.resolveGuildSettings(guildId).channels)]
    }));
    return true;
  }

  return false;
}

async function handleVerificationCommands(interaction: any, options: InteractionRuntimeOptions): Promise<boolean> {
  const guildId = interaction.guild?.id;
  if (!guildId || interaction.commandName !== 'verification') return false;
  if (!options.canDebugConfig(interaction)) {
    await interaction.reply(options.ephemeral({ content: options.copy.common.noAccess }));
    return true;
  }

  const settings = options.resolveGuildSettings(guildId);
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === options.copy.commands.verificationStatusSubcommand) {
    await interaction.reply(options.ephemeral({
      embeds: [options.embeds.buildVerificationStatusEmbed(settings.verification)]
    }));
    return true;
  }

  if (subcommand === options.copy.commands.verificationToggleSubcommand) {
    const enabled = interaction.options.getString(options.copy.commands.stateOptionName, true) === 'on';
    options.database.updateGuildSettings(guildId, { verification: { enabled } });
    await interaction.reply(options.ephemeral({
      content: options.copy.verification.updated(enabled ? 'status: on' : 'status: off'),
      embeds: [options.embeds.buildVerificationStatusEmbed(options.resolveGuildSettings(guildId).verification)]
    }));
    return true;
  }

  if (subcommand === options.copy.commands.verificationRoleSubcommand) {
    const role = interaction.options.getRole(options.copy.commands.roleValueOptionName, true);
    options.database.updateGuildSettings(guildId, {
      verification: { roleId: role.id },
      roles: { verification: role.id }
    });
    await interaction.reply(options.ephemeral({
      content: options.copy.verification.updated(`role: <@&${role.id}>`),
      embeds: [options.embeds.buildVerificationStatusEmbed(options.resolveGuildSettings(guildId).verification)]
    }));
    return true;
  }

  if (subcommand === options.copy.commands.verificationQuestionnaireSubcommand) {
    const questionnaireEnabled = interaction.options.getString(options.copy.commands.stateOptionName, true) === 'on';
    options.database.updateGuildSettings(guildId, { verification: { questionnaireEnabled } });
    await interaction.reply(options.ephemeral({
      content: options.copy.verification.updated(questionnaireEnabled ? 'questionnaire: on' : 'questionnaire: off'),
      embeds: [options.embeds.buildVerificationStatusEmbed(options.resolveGuildSettings(guildId).verification)]
    }));
    return true;
  }

  return false;
}

async function handleRoleMenuCommands(interaction: any, options: InteractionRuntimeOptions): Promise<boolean> {
  const guildId = interaction.guild?.id;
  if (!guildId || interaction.commandName !== 'rolemenu') return false;
  if (!options.isPremiumGuild(guildId)) {
    await interaction.reply(options.ephemeral({ content: options.copy.admin.premiumOnly }));
    return true;
  }
  if (!options.canDebugConfig(interaction)) {
    await interaction.reply(options.ephemeral({ content: options.copy.common.noAccess }));
    return true;
  }

  const subcommand = interaction.options.getSubcommand();
  if (subcommand === options.copy.commands.roleMenuStatusSubcommand) {
    await interaction.reply(options.ephemeral({
      embeds: [options.embeds.buildRoleMenuStatusEmbed(options.getRoleMenuEntries(guildId))]
    }));
    return true;
  }

  const menuId = interaction.options.getString(options.copy.commands.menuOptionName, true).trim().toLowerCase();

  if (subcommand === options.copy.commands.roleMenuCreateSubcommand) {
    const title = interaction.options.getString(options.copy.commands.titleOptionName, true).trim().slice(0, 80);
    const description = (interaction.options.getString(options.copy.commands.descriptionOptionName) || '').trim().slice(0, 400);
    const category = (interaction.options.getString(options.copy.commands.categoryOptionName) || '').trim().slice(0, 40);
    const channel = interaction.options.getChannel(options.copy.commands.channelValueOptionName);
    const nextMenu = {
      menuId,
      title,
      description,
      category,
      channelId: channel?.id || '',
      messageId: '',
      items: options.findRoleMenu(guildId, menuId)?.items || []
    };
    options.saveRoleMenu(guildId, nextMenu);
    await interaction.reply(options.ephemeral({
      content: options.copy.roleMenus.created(menuId),
      embeds: [options.embeds.buildRoleMenuStatusEmbed(options.getRoleMenuEntries(guildId))]
    }));
    return true;
  }

  const menu = options.findRoleMenu(guildId, menuId);
  if (!menu) {
    await interaction.reply(options.ephemeral({ content: options.copy.roleMenus.notFound }));
    return true;
  }

  if (subcommand === options.copy.commands.roleMenuAddSubcommand) {
    const role = interaction.options.getRole(options.copy.commands.roleValueOptionName, true);
    const label = interaction.options.getString(options.copy.commands.titleOptionName, true).trim().slice(0, 80);
    const emoji = (interaction.options.getString(options.copy.commands.emojiOptionName) || '').trim().slice(0, 32);
    const description = (interaction.options.getString(options.copy.commands.descriptionOptionName) || '').trim().slice(0, 120);
    options.saveRoleMenu(guildId, {
      ...menu,
      items: [...(menu.items || []).filter((item: any) => item.roleId !== role.id), { roleId: role.id, label, emoji, description }]
    });
    await interaction.reply(options.ephemeral({
      content: options.copy.roleMenus.itemAdded(menuId, role.id),
      embeds: [options.embeds.buildRoleMenuStatusEmbed(options.getRoleMenuEntries(guildId))]
    }));
    return true;
  }

  if (subcommand === options.copy.commands.roleMenuRemoveSubcommand) {
    const role = interaction.options.getRole(options.copy.commands.roleValueOptionName, true);
    options.removeRoleMenuItem(guildId, menuId, role.id);
    await interaction.reply(options.ephemeral({
      content: options.copy.roleMenus.itemRemoved(menuId, role.id),
      embeds: [options.embeds.buildRoleMenuStatusEmbed(options.getRoleMenuEntries(guildId))]
    }));
    return true;
  }

  if (subcommand === options.copy.commands.roleMenuPublishSubcommand) {
    const targetChannel =
      interaction.options.getChannel(options.copy.commands.channelValueOptionName)
      || (menu.channelId ? await options.fetchTextChannel(interaction.guild, menu.channelId) : null)
      || interaction.channel;
    if (!targetChannel?.isTextBased?.()) {
      await interaction.reply(options.ephemeral({ content: options.copy.reactionRoles.messageMissing }));
      return true;
    }

    const published = await targetChannel.send({
      embeds: [options.embeds.buildRoleMenuEmbed(menu)],
      components: options.embeds.buildRoleMenuComponents(menu)
    }).catch(() => null);

    if (!published) {
      await interaction.reply(options.ephemeral({ content: options.copy.common.unknownError }));
      return true;
    }

    options.saveRoleMenu(guildId, { ...menu, channelId: targetChannel.id, messageId: published.id });
    await interaction.reply(options.ephemeral({
      content: options.copy.roleMenus.published(menuId, targetChannel.id),
      embeds: [options.embeds.buildRoleMenuStatusEmbed(options.getRoleMenuEntries(guildId))]
    }));
    return true;
  }

  return false;
}

async function handleCustomCommandCommands(interaction: any, options: InteractionRuntimeOptions): Promise<boolean> {
  const guildId = interaction.guild?.id;
  if (!guildId || interaction.commandName !== 'customcommand') return false;
  if (!options.isPremiumGuild(guildId)) {
    await interaction.reply(options.ephemeral({ content: options.copy.admin.premiumOnly }));
    return true;
  }
  if (!options.canDebugConfig(interaction)) {
    await interaction.reply(options.ephemeral({ content: options.copy.common.noAccess }));
    return true;
  }

  const subcommand = interaction.options.getSubcommand();
  const current = options.getCustomCommands(guildId);

  if (subcommand === options.copy.commands.customCommandStatusSubcommand) {
    await interaction.reply(options.ephemeral({
      embeds: [options.embeds.buildCustomCommandsEmbed(current)]
    }));
    return true;
  }

  if (subcommand === options.copy.commands.customCommandAddSubcommand) {
    const name = interaction.options.getString(options.copy.commands.titleOptionName, true).trim().toLowerCase().slice(0, 32);
    const trigger = interaction.options.getString(options.copy.commands.triggerOptionName, true).trim().toLowerCase().slice(0, 120);
    const response = interaction.options.getString(options.copy.commands.responseOptionName, true).trim().slice(0, 1500);
    const mode = interaction.options.getString(options.copy.commands.modeChoiceOptionName) || 'contains';
    const next = current.filter((item: any) => item.name !== name).concat([{ name, trigger, response, mode }]);
    options.database.updateGuildSettings(guildId, { customCommands: next });
    await interaction.reply(options.ephemeral({
      content: options.copy.customCommands.added(name),
      embeds: [options.embeds.buildCustomCommandsEmbed(options.resolveGuildSettings(guildId).customCommands)]
    }));
    return true;
  }

  if (subcommand === options.copy.commands.customCommandRemoveSubcommand) {
    const name = interaction.options.getString(options.copy.commands.titleOptionName, true).trim().toLowerCase();
    const next = current.filter((item: any) => item.name !== name);
    if (next.length === current.length) {
      await interaction.reply(options.ephemeral({ content: options.copy.customCommands.notFound }));
      return true;
    }
    options.database.updateGuildSettings(guildId, { customCommands: next });
    await interaction.reply(options.ephemeral({
      content: options.copy.customCommands.removed(name),
      embeds: [options.embeds.buildCustomCommandsEmbed(options.resolveGuildSettings(guildId).customCommands)]
    }));
    return true;
  }

  return false;
}

async function handleButtonsAndModals(interaction: any, options: InteractionRuntimeOptions): Promise<boolean> {
  const guildId = interaction.guild?.id;
  if (!guildId) return false;
  const settings = options.resolveGuildSettings(guildId);

  if (interaction.isButton() && !interaction.replied && !interaction.deferred) {
    if (interaction.customId === 'welcome_rules') {
      await interaction.reply(options.ephemeral({
        content: [
          settings.channels.rules ? `Правила: <#${settings.channels.rules}>` : '',
          settings.channels.panel ? `Панель семьи: <#${settings.channels.panel}>` : '',
          settings.channels.applications ? `Подача заявки: <#${settings.channels.applications}>` : ''
        ].filter(Boolean).join('\n') || 'Каналы правил и навигации пока не настроены.'
      }));
      return true;
    }

    if (interaction.customId === 'welcome_verify') {
      if (!settings.verification.enabled) {
        await interaction.reply(options.ephemeral({ content: options.copy.verification.disabled }));
        return true;
      }

      const member = interaction.member || await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      if (!member) {
        await interaction.reply(options.ephemeral({ content: options.copy.profile.notFound }));
        return true;
      }

      const targetRoleId = options.getVerificationRoleId(guildId);
      if (!targetRoleId) {
        await interaction.reply(options.ephemeral({ content: options.copy.verification.roleMissing }));
        return true;
      }

      if (member.roles.cache.has(targetRoleId)) {
        await interaction.reply(options.ephemeral({ content: options.copy.verification.alreadyVerified }));
        return true;
      }

      if (settings.verification.questionnaireEnabled) {
        await interaction.showModal(options.embeds.buildVerificationModal());
        return true;
      }

      const result = await options.applyVerificationRole(member);
      await interaction.reply(options.ephemeral({
        content: result.ok ? options.copy.verification.success(result.roleId) : options.copy.verification.noPermission
      }));
      return true;
    }

    if (interaction.customId.startsWith('rolemenu_toggle:')) {
      if (!options.isPremiumGuild(guildId)) {
        await interaction.reply(options.ephemeral({ content: options.copy.admin.premiumOnly }));
        return true;
      }

      const [, menuId, roleId] = interaction.customId.split(':');
      const member = interaction.member || await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      if (!member) {
        await interaction.reply(options.ephemeral({ content: options.copy.profile.notFound }));
        return true;
      }

      const role = interaction.guild.roles.cache.get(roleId) || await interaction.guild.roles.fetch(roleId).catch(() => null);
      if (!role) {
        await interaction.reply(options.ephemeral({ content: options.copy.common.unknownError }));
        return true;
      }

      if (member.roles.cache.has(role.id)) {
        await member.roles.remove(role, `Role menu ${menuId}`).catch(() => null);
        await interaction.reply(options.ephemeral({ content: options.copy.roleMenus.roleRemoved(role.id) }));
        return true;
      }

      await member.roles.add(role, `Role menu ${menuId}`).catch(() => null);
      await interaction.reply(options.ephemeral({ content: options.copy.roleMenus.roleAdded(role.id) }));
      return true;
    }
  }

  if (interaction.isModalSubmit() && !interaction.replied && !interaction.deferred) {
    if (interaction.customId === 'welcome_verification_modal') {
      const member = interaction.member || await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      if (!member) {
        await interaction.reply(options.ephemeral({ content: options.copy.profile.notFound }));
        return true;
      }

      const result = await options.applyVerificationRole(member);
      const logsChannel = await options.fetchTextChannel(interaction.guild, settings.channels.logs).catch(() => null);
      if (logsChannel) {
        await logsChannel.send({
          embeds: [
            new options.EmbedBuilderCtor()
              .setColor(0x10b981)
              .setTitle('Новый участник прошёл verification')
              .setDescription([
                `Пользователь: <@${interaction.user.id}>`,
                `Ник: ${interaction.fields.getTextInputValue('verify_nick')}`,
                `Причина: ${interaction.fields.getTextInputValue('verify_reason')}`,
                `Правила: ${interaction.fields.getTextInputValue('verify_rules')}`
              ].join('\n'))
              .setFooter({ text: 'BRHD • Phoenix • Verification' })
              .setTimestamp()
          ]
        }).catch(() => null);
      }

      await interaction.reply(options.ephemeral({
        content: result.ok ? options.copy.verification.success(result.roleId) : options.copy.verification.noPermission
      }));
      return true;
    }
  }

  return false;
}

export function registerInteractionRuntime(options: InteractionRuntimeOptions): void {
  const { client, handlePrimaryInteraction } = options;

  client.removeAllListeners('interactionCreate');
  client.on('interactionCreate', async (interaction: any) => {
    try {
      await handlePrimaryInteraction(interaction);
      if (interaction.replied || interaction.deferred) {
        return;
      }

      if (interaction.isChatInputCommand && interaction.isChatInputCommand()) {
        if (await handleWelcomeCommands(interaction, options)) return;
        if (await handleAutoroleCommands(interaction, options)) return;
        if (await handleReactionRoleCommands(interaction, options)) return;
        if (await handleReportScheduleCommands(interaction, options)) return;
        if (await handleVerificationCommands(interaction, options)) return;
        if (await handleRoleMenuCommands(interaction, options)) return;
        if (await handleCustomCommandCommands(interaction, options)) return;
      }

      if (await handleButtonsAndModals(interaction, options)) {
        return;
      }
    } catch (error) {
      console.error('Interaction runtime error:', error);
      if (interaction?.isRepliable?.() && !interaction.replied && !interaction.deferred) {
        await interaction.reply(options.ephemeral({ content: options.copy.common.unknownError })).catch(() => null);
      }
    }
  });
}
