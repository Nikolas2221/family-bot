interface CommandRuntimeOptions {
  APPLICATION_COOLDOWN_MS: number;
  copy: any;
  embeds: any;
  database: any;
  ephemeral(payload: Record<string, unknown>): Record<string, unknown>;
  resolveGuildSettings(guildId: string): any;
  buildFamilyDashboardStats(guild: any): any;
  canApplications(member: any): boolean;
  canDebugConfig(interaction: any): boolean;
  buildGuildSettingsSnapshot(guild: any): any;
  getGuildRecord(guild: any): any;
  doPanelUpdate(guildId: string, force?: boolean): Promise<unknown>;
  defaultModulesForMode(mode: string): Record<string, boolean>;
  getHelpCatalog(interaction: any): any;
  guildStorage: any;
  applicationsService: any;
}

function adminPanelReply(interaction: any, options: CommandRuntimeOptions, record: any, content?: string) {
  return options.ephemeral({
    ...(content ? { content } : {}),
    embeds: [options.embeds.buildAdminPanelEmbed({ guildName: interaction.guild.name, record })]
  });
}

export async function handleCommandRuntime(interaction: any, options: CommandRuntimeOptions): Promise<boolean> {
  const guildId = interaction.guild?.id;
  if (!guildId || !interaction.isChatInputCommand?.()) {
    return false;
  }

  const {
    APPLICATION_COOLDOWN_MS,
    copy,
    embeds,
    database,
    ephemeral,
    resolveGuildSettings,
    buildFamilyDashboardStats,
    canApplications,
    canDebugConfig,
    buildGuildSettingsSnapshot,
    getGuildRecord,
    doPanelUpdate,
    defaultModulesForMode,
    getHelpCatalog,
    guildStorage,
    applicationsService
  } = options;

  if (interaction.commandName === 'family') {
    const settings = resolveGuildSettings(guildId);
    const summary = buildFamilyDashboardStats(interaction.guild);
    await interaction.reply(ephemeral({
      embeds: [embeds.buildFamilyMenuEmbed({ imageUrl: settings.visuals.familyBanner, summary })],
      components: embeds.panelButtons()
    }));
    return true;
  }

  if (interaction.commandName === 'apply') {
    const secondsLeft = applicationsService.getCooldownSecondsLeft(interaction.user.id, APPLICATION_COOLDOWN_MS);
    if (secondsLeft > 0) {
      await interaction.reply(ephemeral({ content: copy.common.cooldown(secondsLeft) }));
      return true;
    }

    await interaction.showModal(embeds.buildApplyModal());
    return true;
  }

  if (interaction.commandName === 'applypanel') {
    if (!canApplications(interaction.member)) {
      await interaction.reply(ephemeral({ content: copy.common.noAccess }));
      return true;
    }

    await applicationsService.sendApplyPanel(interaction);
    return true;
  }

  if (interaction.commandName === 'applications') {
    await interaction.reply(ephemeral({
      embeds: [embeds.buildApplicationsListEmbed(guildStorage.listRecentApplications(10))]
    }));
    return true;
  }

  if (interaction.commandName === 'setup') {
    if (!canDebugConfig(interaction)) {
      await interaction.reply(ephemeral({ content: copy.common.noAccess }));
      return true;
    }

    const record = database.markSetupComplete(guildId, buildGuildSettingsSnapshot(interaction.guild));
    await interaction.reply(adminPanelReply(interaction, options, record, copy.admin.setupSaved));
    return true;
  }

  if (interaction.commandName === 'adminpanel') {
    if (!canDebugConfig(interaction)) {
      await interaction.reply(ephemeral({ content: copy.common.noAccess }));
      return true;
    }

    await interaction.reply(ephemeral({
      embeds: [embeds.buildAdminPanelEmbed({ guildName: interaction.guild.name, record: getGuildRecord(interaction.guild) })]
    }));
    return true;
  }

  if (interaction.commandName === 'help') {
    await interaction.reply(ephemeral({
      embeds: [embeds.buildHelpEmbed(getHelpCatalog(interaction))]
    }));
    return true;
  }

  if (interaction.commandName === 'setrole') {
    if (!canDebugConfig(interaction)) {
      await interaction.reply(ephemeral({ content: copy.common.noAccess }));
      return true;
    }

    const key = interaction.options.getString(copy.commands.roleTargetOptionName, true);
    const role = interaction.options.getRole(copy.commands.roleValueOptionName, true);
    database.updateGuildSettings(guildId, { roles: { [key]: role.id } });
    const record = database.markSetupComplete(guildId, buildGuildSettingsSnapshot(interaction.guild));
    await doPanelUpdate(guildId, true);
    await interaction.reply(adminPanelReply(interaction, options, record, `Роль **${key}** сохранена: <@&${role.id}>`));
    return true;
  }

  if (interaction.commandName === 'setchannel') {
    if (!canDebugConfig(interaction)) {
      await interaction.reply(ephemeral({ content: copy.common.noAccess }));
      return true;
    }

    const key = interaction.options.getString(copy.commands.channelTargetOptionName, true);
    const channel = interaction.options.getChannel(copy.commands.channelValueOptionName, true);
    database.updateGuildSettings(guildId, { channels: { [key]: channel.id } });
    const record = database.markSetupComplete(guildId, buildGuildSettingsSnapshot(interaction.guild));
    if (key === 'panel') {
      await doPanelUpdate(guildId, true);
    }
    await interaction.reply(adminPanelReply(interaction, options, record, `Канал **${key}** сохранён: <#${channel.id}>`));
    return true;
  }

  if (interaction.commandName === 'setfamilytitle') {
    if (!canDebugConfig(interaction)) {
      await interaction.reply(ephemeral({ content: copy.common.noAccess }));
      return true;
    }

    const familyTitle = interaction.options.getString(copy.commands.familyTitleOptionName, true).trim().slice(0, 80);
    database.updateGuildSettings(guildId, { familyTitle });
    const record = database.markSetupComplete(guildId, buildGuildSettingsSnapshot(interaction.guild));
    await doPanelUpdate(guildId, true);
    await interaction.reply(adminPanelReply(interaction, options, record, `Название семьи обновлено: **${familyTitle}**`));
    return true;
  }

  if (interaction.commandName === 'setmode') {
    if (!canDebugConfig(interaction)) {
      await interaction.reply(ephemeral({ content: copy.common.noAccess }));
      return true;
    }

    const mode = interaction.options.getString(copy.commands.modeOptionName, true);
    const modules = defaultModulesForMode(mode);
    database.updateGuildSettings(guildId, { mode, modules });
    const record = database.markSetupComplete(guildId, buildGuildSettingsSnapshot(interaction.guild));
    await doPanelUpdate(guildId, true);
    await interaction.reply(adminPanelReply(interaction, options, record, `Режим сервера переключён на **${mode}**.`));
    return true;
  }

  if (interaction.commandName === 'setmodule') {
    if (!canDebugConfig(interaction)) {
      await interaction.reply(ephemeral({ content: copy.common.noAccess }));
      return true;
    }

    const key = interaction.options.getString(copy.commands.moduleOptionName, true);
    const state = interaction.options.getString(copy.commands.stateOptionName, true) === 'on';
    database.updateGuildSettings(guildId, { modules: { [key]: state } });
    const record = database.markSetupComplete(guildId, buildGuildSettingsSnapshot(interaction.guild));
    await doPanelUpdate(guildId, true);
    await interaction.reply(adminPanelReply(interaction, options, record, `Модуль **${key}** теперь **${state ? 'включён' : 'выключен'}**.`));
    return true;
  }

  if (interaction.commandName === 'setart') {
    if (!canDebugConfig(interaction)) {
      await interaction.reply(ephemeral({ content: copy.common.noAccess }));
      return true;
    }

    const key = interaction.options.getString(copy.commands.artTargetOptionName, true);
    const rawValue = interaction.options.getString(copy.commands.artUrlOptionName, true).trim();
    const clearValues = new Set(['off', 'none', 'clear', 'remove']);
    const value = clearValues.has(rawValue.toLowerCase()) ? '' : rawValue;

    if (value && !/^https?:\/\/\S+/i.test(value)) {
      await interaction.reply(ephemeral({ content: 'Укажи прямую ссылку на изображение через http/https или напиши `off`.' }));
      return true;
    }

    database.updateGuildSettings(guildId, { visuals: { [key]: value } });
    const record = database.markSetupComplete(guildId, buildGuildSettingsSnapshot(interaction.guild));
    await doPanelUpdate(guildId, true);
    await interaction.reply(adminPanelReply(interaction, options, record, value ? `Баннер **${key}** сохранён.` : `Баннер **${key}** отключён.`));
    return true;
  }

  return false;
}
