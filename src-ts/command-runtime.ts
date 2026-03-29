import { createGuildScopedStorage } from './storage';

interface CommandRuntimeOptions {
  APPLICATION_COOLDOWN_MS: number;
  AUTO_RANKS: any;
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
  rankService: any;
  isPremiumGuild(guildId: string): boolean;
  isPremiumAutomodRule(rule: string): boolean;
  isPremiumAutomodTarget(target: string): boolean;
  buildAutomodRulePatch(rule: string, enabled: boolean): Record<string, unknown>;
  getAutomodTargetLimits(target: string, value: number): Record<string, number>;
  canModerate(member: any): boolean;
  replyAndAutoDelete(interaction: any, payload: Record<string, unknown>): Promise<any>;
  editReplyAndAutoDelete(interaction: any, payload: Record<string, unknown>): Promise<any>;
  resolveTargetTextChannel(interaction: any): any;
  canManageTargetChannel(member: any, channel: any): boolean;
  fetchRecentDeletableMessages(channel: any, count: number): Promise<any[]>;
  deleteMessagesFast(messages: any[]): Promise<number>;
  fetchMessagesForUser(channel: any, userId: string, count: number): Promise<{ messages: any[]; matched: number; blocked: number; system: number }>;
  clearChannelByMessages(channel: any): Promise<{ deleted: number; requested: number; skippedSystem: number; skippedBlocked: number }>;
  remapConfiguredChannelIds(guildId: string, oldChannelId: string, newChannelId: string): void;
  storage: any;
  runRolelessCleanupDetailed(guildId: string, reason: string, options?: Record<string, unknown>): Promise<any>;
  canUseSecurity(member: any): boolean;
  fetchMemberFast(guild: any, userId: string): Promise<any>;
  canDiscipline(member: any): boolean;
  EmbedBuilderCtor: any;
  formatModerationTimestamp(createdAt: string): string;
  buildLeaderboardLines(guild: any, limit: number): any;
  buildLeaderboardSummary(guild: any): any;
  buildVoiceActivityLines(guild: any, limit: number): any;
  buildVoiceActivitySummary(guild: any): any;
  buildServerStatsReportEmbed(guild: any, period: string): any;
  buildPremiumActivityReportEmbed(guild: any, member?: any): any;
  buildAiAdvisorEmbed(guild: any, member: any): Promise<any>;
  isOwner(userId: string): boolean;
  enforceBlacklist(member: any): Promise<any>;
  sendBlacklistDm(user: any, guild: any, reason: string): Promise<any>;
  createConfig(env: NodeJS.ProcessEnv): any;
  validateConfig(config: any): any;
  summarizeConfig(config: any): any;
  sendAcceptLog(guild: any, member: any, user: any): Promise<any>;
  buildProfilePayload(member: any, canManageRanks: boolean, statusMessage?: string): Record<string, unknown>;
  canManageRanks(member: any): boolean;
  sendDisciplineLog(guild: any, embed: any): Promise<any>;
  sendDisciplineDm(kind: string, guild: any, user: any, moderator: any, reason: string): Promise<any>;
  sendRankDm(guild: any, member: any, result: any): Promise<any>;
  aiService: any;
  isAiCommandOverviewQuery(query: string): boolean;
  buildAiCommandsOverview(interaction: any): string;
  canManageNicknames(member: any): boolean;
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
    ephemeral: rawEphemeral,
    resolveGuildSettings,
    buildFamilyDashboardStats,
    canApplications,
    canDebugConfig,
    buildGuildSettingsSnapshot,
    getGuildRecord,
    doPanelUpdate,
    defaultModulesForMode,
    getHelpCatalog,
    guildStorage: rawGuildStorage,
    applicationsService,
    rankService,
    isPremiumGuild,
    isPremiumAutomodRule,
    isPremiumAutomodTarget,
    buildAutomodRulePatch,
    getAutomodTargetLimits,
    canModerate,
    replyAndAutoDelete,
    editReplyAndAutoDelete,
    resolveTargetTextChannel,
    canManageTargetChannel,
    fetchRecentDeletableMessages,
    deleteMessagesFast,
    fetchMessagesForUser,
    clearChannelByMessages,
    remapConfiguredChannelIds,
    storage,
    runRolelessCleanupDetailed,
    canUseSecurity,
    fetchMemberFast,
    canDiscipline,
    EmbedBuilderCtor,
    formatModerationTimestamp,
    buildLeaderboardLines,
    buildLeaderboardSummary,
    buildVoiceActivityLines,
    buildVoiceActivitySummary,
    buildServerStatsReportEmbed,
    buildPremiumActivityReportEmbed,
    buildAiAdvisorEmbed,
    isOwner,
    enforceBlacklist,
    sendBlacklistDm,
    createConfig,
    validateConfig,
    summarizeConfig,
    sendAcceptLog,
    buildProfilePayload: rawBuildProfilePayload,
    canManageRanks,
    sendDisciplineLog,
    sendDisciplineDm,
    sendRankDm,
    AUTO_RANKS,
    aiService,
    isAiCommandOverviewQuery: rawIsAiCommandOverviewQuery,
    buildAiCommandsOverview: rawBuildAiCommandsOverview,
    canManageNicknames
  } = options;

  const ephemeral = typeof rawEphemeral === 'function' ? rawEphemeral : ((payload: Record<string, unknown> = {}) => payload);
  const guildStorage = rawGuildStorage && typeof rawGuildStorage.addCommend === 'function'
    ? rawGuildStorage
    : createGuildScopedStorage(guildId, storage);
  const buildProfilePayload = typeof rawBuildProfilePayload === 'function'
    ? rawBuildProfilePayload
    : ((_member: any, _allowRankButtons: boolean, content = '') => ephemeral({ content: content || 'Произошла ошибка. Попробуй ещё раз.' }));
  const isAiCommandOverviewQuery = typeof rawIsAiCommandOverviewQuery === 'function'
    ? rawIsAiCommandOverviewQuery
    : (() => false);
  const buildAiCommandsOverview = typeof rawBuildAiCommandsOverview === 'function'
    ? rawBuildAiCommandsOverview
    : (() => copy.ai?.commandsOverviewEmpty || 'Список команд пока недоступен.');

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
    const catalog = getHelpCatalog(interaction);
    await interaction.reply(ephemeral({
      embeds: [embeds.buildHelpEmbed(catalog, 0)],
      components: typeof embeds.buildHelpPaginationButtons === 'function'
        ? embeds.buildHelpPaginationButtons(catalog, 0)
        : []
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

  if (interaction.commandName === 'automod') {
    if (!canDebugConfig(interaction)) {
      await interaction.reply(ephemeral({ content: copy.common.noAccess }));
      return true;
    }

    const subcommand = interaction.options.getSubcommand();
    const current = resolveGuildSettings(guildId).automod;

    if (subcommand === copy.commands.automodActionSubcommand) {
      const mode = interaction.options.getString(copy.commands.actionModeOptionName, true);
      const actionModeLabel = mode === 'hard' ? 'жёсткий' : 'мягкий';
      database.updateGuildSettings(guildId, { automod: { actionMode: mode } });
      await interaction.reply(ephemeral({
        content: copy.automod.actionUpdated(actionModeLabel),
        embeds: [embeds.buildAutomodStatusEmbed(resolveGuildSettings(guildId).automod, resolveGuildSettings(guildId).channels.automod)]
      }));
      return true;
    }

    if (subcommand === copy.commands.automodWordsSubcommand) {
      if (!isPremiumGuild(guildId)) {
        await interaction.reply(ephemeral({ content: copy.admin.premiumOnly }));
        return true;
      }

      const action = interaction.options.getString(copy.commands.actionOptionName, true);
      const rawWord = interaction.options.getString(copy.commands.wordOptionName) || '';
      const parsedWords = rawWord
        .split(',')
        .map((item: string) => item.trim().toLowerCase())
        .filter(Boolean);
      const words = [...current.badWords];

      if (action === 'list') {
        await interaction.reply(ephemeral({
          embeds: [embeds.buildAutomodStatusEmbed(current, resolveGuildSettings(guildId).channels.automod)]
        }));
        return true;
      }

      if (action === 'clear') {
        database.updateGuildSettings(guildId, { automod: { badWords: [] } });
        await interaction.reply(ephemeral({
          content: copy.automod.wordsCleared,
          embeds: [embeds.buildAutomodStatusEmbed(resolveGuildSettings(guildId).automod, resolveGuildSettings(guildId).channels.automod)]
        }));
        return true;
      }

      if (!parsedWords.length) {
        await interaction.reply(ephemeral({ content: copy.automod.wordMissing }));
        return true;
      }

      if (action === 'add') {
        const nextWords = [...new Set([...words, ...parsedWords])];
        database.updateGuildSettings(guildId, { automod: { badWords: nextWords, badWordsEnabled: true } });
        await interaction.reply(ephemeral({
          content: copy.automod.wordAdded(parsedWords.join(', ')),
          embeds: [embeds.buildAutomodStatusEmbed(resolveGuildSettings(guildId).automod, resolveGuildSettings(guildId).channels.automod)]
        }));
        return true;
      }

      const parsedSet = new Set(parsedWords);
      const nextWords = words.filter((item: string) => !parsedSet.has(item));
      database.updateGuildSettings(guildId, { automod: { badWords: nextWords } });
      await interaction.reply(ephemeral({
        content: copy.automod.wordRemoved(parsedWords.join(', ')),
        embeds: [embeds.buildAutomodStatusEmbed(resolveGuildSettings(guildId).automod, resolveGuildSettings(guildId).channels.automod)]
      }));
      return true;
    }

    if (subcommand === copy.commands.automodStatusSubcommand) {
      await interaction.reply(ephemeral({
        embeds: [embeds.buildAutomodStatusEmbed(current, resolveGuildSettings(guildId).channels.automod)]
      }));
      return true;
    }

    if (subcommand === copy.commands.automodToggleSubcommand) {
      const rule = interaction.options.getString(copy.commands.automodRuleOptionName, true);
      if (!isPremiumGuild(guildId) && isPremiumAutomodRule(rule)) {
        await interaction.reply(ephemeral({ content: copy.admin.premiumOnly }));
        return true;
      }

      const enabled = interaction.options.getString(copy.commands.stateOptionName, true) === 'on';
      database.updateGuildSettings(guildId, { automod: buildAutomodRulePatch(rule, enabled) });
      const record = database.markSetupComplete(guildId, buildGuildSettingsSnapshot(interaction.guild));
      await interaction.reply(ephemeral({
        content: copy.automod.toggleDone(copy.automod.ruleLabel(rule), enabled),
        embeds: [
          embeds.buildAutomodStatusEmbed(resolveGuildSettings(guildId).automod, resolveGuildSettings(guildId).channels.automod),
          embeds.buildAdminPanelEmbed({ guildName: interaction.guild.name, record })
        ]
      }));
      return true;
    }

    if (subcommand === copy.commands.automodLimitSubcommand) {
      const target = interaction.options.getString(copy.commands.automodTargetOptionName, true);
      if (!isPremiumGuild(guildId) && isPremiumAutomodTarget(target)) {
        await interaction.reply(ephemeral({ content: copy.admin.premiumOnly }));
        return true;
      }

      const value = interaction.options.getInteger(copy.commands.valueOptionName, true);
      const patch = getAutomodTargetLimits(target, value);
      database.updateGuildSettings(guildId, { automod: patch });
      await interaction.reply(ephemeral({
        content: copy.automod.limitDone(copy.automod.targetLabel(target), Object.values(patch)[0]),
        embeds: [embeds.buildAutomodStatusEmbed(resolveGuildSettings(guildId).automod, resolveGuildSettings(guildId).channels.automod)]
      }));
      return true;
    }

    if (subcommand === copy.commands.automodActionSubcommand) {
      const mode = interaction.options.getString(copy.commands.actionModeOptionName, true);
      const actionModeLabel = mode === 'hard' ? 'жёсткий' : 'мягкий';
      database.updateGuildSettings(guildId, { automod: { actionMode: mode } });
      await interaction.reply(ephemeral({
        content: copy.automod.actionUpdated(mode === 'hard' ? 'Р¶С‘СЃС‚РєРёР№' : 'РјСЏРіРєРёР№'),
        embeds: [embeds.buildAutomodStatusEmbed(resolveGuildSettings(guildId).automod, resolveGuildSettings(guildId).channels.automod)]
      }));
      return true;
    }

    if (subcommand === copy.commands.automodWordsSubcommand) {
      if (!isPremiumGuild(guildId)) {
        await interaction.reply(ephemeral({ content: copy.admin.premiumOnly }));
        return true;
      }

      const action = interaction.options.getString(copy.commands.actionOptionName, true);
      const rawWord = interaction.options.getString(copy.commands.wordOptionName) || '';
      const word = rawWord.trim().toLowerCase();
      const words = [...current.badWords];

      if (action === 'list') {
        await interaction.reply(ephemeral({
          embeds: [embeds.buildAutomodStatusEmbed(current)]
        }));
        return true;
      }

      if (action === 'clear') {
        database.updateGuildSettings(guildId, { automod: { badWords: [] } });
        await interaction.reply(ephemeral({
          content: copy.automod.wordsCleared,
          embeds: [embeds.buildAutomodStatusEmbed(resolveGuildSettings(guildId).automod, resolveGuildSettings(guildId).channels.automod)]
        }));
        return true;
      }

      if (!word) {
        await interaction.reply(ephemeral({ content: copy.automod.wordMissing }));
        return true;
      }

      if (action === 'add') {
        const nextWords = [...new Set([...words, word])];
        database.updateGuildSettings(guildId, { automod: { badWords: nextWords, badWordsEnabled: true } });
        await interaction.reply(ephemeral({
          content: copy.automod.wordAdded(word),
          embeds: [embeds.buildAutomodStatusEmbed(resolveGuildSettings(guildId).automod, resolveGuildSettings(guildId).channels.automod)]
        }));
        return true;
      }

      const nextWords = words.filter((item: string) => item !== word);
      database.updateGuildSettings(guildId, { automod: { badWords: nextWords } });
      await interaction.reply(ephemeral({
        content: copy.automod.wordRemoved(word),
        embeds: [embeds.buildAutomodStatusEmbed(resolveGuildSettings(guildId).automod, resolveGuildSettings(guildId).channels.automod)]
      }));
      return true;
    }
  }

  if (interaction.commandName === 'purge') {
    if (!canModerate(interaction.member)) {
      await replyAndAutoDelete(interaction, { content: copy.moderation.noAccess });
      return true;
    }

    const count = interaction.options.getInteger(copy.commands.countOptionName, true);
    if (count < 1 || count > 500) {
      await replyAndAutoDelete(interaction, { content: copy.moderation.invalidCount });
      return true;
    }

    const channel = resolveTargetTextChannel(interaction);
    if (!channel) {
      await replyAndAutoDelete(interaction, { content: copy.moderation.notTextChannel });
      return true;
    }

    if (!canManageTargetChannel(interaction.member, channel)) {
      await replyAndAutoDelete(interaction, { content: copy.moderation.noAccess });
      return true;
    }

    await interaction.deferReply({ flags: 64 });
    const messages = await fetchRecentDeletableMessages(channel, count);
    const deleted = await deleteMessagesFast(messages);
    await editReplyAndAutoDelete(interaction, { content: copy.moderation.purgeDone(deleted, channel.id) });
    return true;
  }

  if (interaction.commandName === 'purgeuser') {
    if (!isPremiumGuild(guildId)) {
      await replyAndAutoDelete(interaction, { content: copy.moderation.premiumOnly });
      return true;
    }

    if (!canModerate(interaction.member)) {
      await replyAndAutoDelete(interaction, { content: copy.moderation.noAccess });
      return true;
    }

    const user = interaction.options.getUser(copy.commands.userOptionName, true);
    const count = interaction.options.getInteger(copy.commands.countOptionName, true);
    if (count < 1 || count > 500) {
      await replyAndAutoDelete(interaction, { content: copy.moderation.invalidCount });
      return true;
    }

    const channel = resolveTargetTextChannel(interaction);
    if (!channel) {
      await replyAndAutoDelete(interaction, { content: copy.moderation.notTextChannel });
      return true;
    }

    if (!canManageTargetChannel(interaction.member, channel)) {
      await replyAndAutoDelete(interaction, { content: copy.moderation.noAccess });
      return true;
    }

    await interaction.deferReply({ flags: 64 });
    const { messages, matched, blocked, system } = await fetchMessagesForUser(channel, user.id, count);
    const deleted = await deleteMessagesFast(messages);
    await editReplyAndAutoDelete(interaction, {
      content: copy.moderation.purgeUserDetailed(deleted, matched, blocked, system, user.id, channel.id)
    });
    return true;
  }

  if (interaction.commandName === 'clearallchannel') {
    if (!isPremiumGuild(guildId)) {
      await replyAndAutoDelete(interaction, { content: copy.moderation.premiumOnly });
      return true;
    }

    if (!canModerate(interaction.member)) {
      await replyAndAutoDelete(interaction, { content: copy.moderation.noAccess });
      return true;
    }

    const confirmation = interaction.options.getString(copy.commands.confirmOptionName, true).trim().toUpperCase();
    if (confirmation !== 'CLEAR') {
      await replyAndAutoDelete(interaction, { content: copy.moderation.invalidConfirmation });
      return true;
    }

    const channel = resolveTargetTextChannel(interaction);
    if (!channel) {
      await replyAndAutoDelete(interaction, { content: copy.moderation.notTextChannel });
      return true;
    }

    if (!canManageTargetChannel(interaction.member, channel)) {
      await replyAndAutoDelete(interaction, { content: copy.moderation.noAccess });
      return true;
    }

    await interaction.deferReply({ flags: 64 });
    const clearClone = await channel.clone({ reason: `Full clear by ${interaction.user.id}` }).catch(() => null);

    if (clearClone) {
      await clearClone.setPosition(channel.rawPosition).catch(() => {});
      const wasPanelChannel = resolveGuildSettings(guildId).channels.panel === channel.id;
      const removedOld = await channel.delete(`Full clear by ${interaction.user.id}`).then(() => true).catch(() => false);

      if (removedOld) {
        remapConfiguredChannelIds(guildId, channel.id, clearClone.id);

        if (wasPanelChannel) {
          storage.setGuildPanelMessageId(guildId, '');
          await doPanelUpdate(guildId, true);
        }

        await editReplyAndAutoDelete(interaction, {
          content: copy.moderation.clearChannelDone(channel.id, clearClone.id)
        });
        return true;
      }

      await clearClone.delete(`Rollback failed clear by ${interaction.user.id}`).catch(() => {});
    }

    const { deleted, requested, skippedSystem, skippedBlocked } = await clearChannelByMessages(channel);
    const skippedTotal = skippedSystem + skippedBlocked + Math.max(0, requested - deleted);

    if (deleted > 0 && skippedTotal > 0) {
      await editReplyAndAutoDelete(interaction, {
        content: copy.moderation.clearChannelPartial(channel.id, deleted, skippedTotal)
      });
      return true;
    }

    if (deleted > 0) {
      await editReplyAndAutoDelete(interaction, {
        content: `Канал <#${channel.id}> очищен по сообщениям. Удалено: **${deleted}**.`
      });
      return true;
    }

    await editReplyAndAutoDelete(interaction, { content: copy.moderation.actionFailed('clearallchannel') });
    return true;
  }

  if (interaction.commandName === 'kickroless') {
    if (!isPremiumGuild(guildId)) {
      await replyAndAutoDelete(interaction, { content: copy.moderation.premiumOnly });
      return true;
    }

    if (!canUseSecurity(interaction.member)) {
      await replyAndAutoDelete(interaction, { content: copy.moderation.noAccess });
      return true;
    }

    await interaction.deferReply({ flags: 64 });
    const result = await runRolelessCleanupDetailed(guildId, `manual:${interaction.user.id}`, { force: true });

    if (!result) {
      await editReplyAndAutoDelete(interaction, { content: copy.moderation.actionFailed('kickroless') });
      return true;
    }

    await editReplyAndAutoDelete(interaction, {
      content: copy.moderation.kickRolessDone(result.kicked.length, result.failed.length)
    });
    return true;
  }

  if (interaction.commandName === 'mute' || interaction.commandName === 'unmute') {
    if (!canModerate(interaction.member)) {
      await replyAndAutoDelete(interaction, { content: copy.moderation.noAccess });
      return true;
    }

    const settings = resolveGuildSettings(guildId);
    if (!settings.muteRoleId) {
      await replyAndAutoDelete(interaction, { content: copy.moderation.muteRoleMissing });
      return true;
    }

    const user = interaction.options.getUser(copy.commands.userOptionName, true);
    const member = await fetchMemberFast(interaction.guild, user.id);
    if (!member) {
      await replyAndAutoDelete(interaction, { content: copy.profile.notFound });
      return true;
    }

    if (interaction.commandName === 'mute') {
      const muteRole = interaction.guild.roles.cache.get(settings.muteRoleId)
        || await interaction.guild.roles.fetch(settings.muteRoleId).catch(() => null);
      if (!muteRole) {
        await replyAndAutoDelete(interaction, { content: copy.moderation.muteRoleMissing });
        return true;
      }

      const reason = interaction.options.getString(copy.commands.reasonOptionName) || 'Mute via bot';
      const ok = await member.roles.add(muteRole, reason).then(() => true).catch(() => false);
      await replyAndAutoDelete(interaction, { content: ok ? copy.moderation.muteDone(user.id, muteRole.id) : copy.moderation.actionFailed('mute') });
      return true;
    }

    const ok = await member.roles.remove(settings.muteRoleId, 'Unmute via bot').then(() => true).catch(() => false);
    await replyAndAutoDelete(interaction, { content: ok ? copy.moderation.unmuteDone(user.id) : copy.moderation.actionFailed('unmute') });
    return true;
  }

  if (interaction.commandName === 'lockchannel' || interaction.commandName === 'unlockchannel') {
    if (!canModerate(interaction.member)) {
      await replyAndAutoDelete(interaction, { content: copy.moderation.noAccess });
      return true;
    }

    const channel = resolveTargetTextChannel(interaction);
    if (!channel) {
      await replyAndAutoDelete(interaction, { content: copy.moderation.notTextChannel });
      return true;
    }

    if (!canManageTargetChannel(interaction.member, channel)) {
      await replyAndAutoDelete(interaction, { content: copy.moderation.noAccess });
      return true;
    }

    const overwrite = interaction.commandName === 'lockchannel' ? { SendMessages: false } : { SendMessages: null };
    const reason = interaction.commandName === 'lockchannel' ? `Locked by ${interaction.user.id}` : `Unlocked by ${interaction.user.id}`;
    const ok = await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, overwrite, { reason }).then(() => true).catch(() => false);
    await replyAndAutoDelete(interaction, {
      content: ok
        ? interaction.commandName === 'lockchannel'
          ? copy.moderation.lockDone(channel.id)
          : copy.moderation.unlockDone(channel.id)
        : copy.moderation.actionFailed(interaction.commandName)
    });
    return true;
  }

  if (interaction.commandName === 'slowmode') {
    if (!canModerate(interaction.member)) {
      await replyAndAutoDelete(interaction, { content: copy.moderation.noAccess });
      return true;
    }

    const seconds = interaction.options.getInteger(copy.commands.secondsOptionName, true);
    if (seconds < 0 || seconds > 21600) {
      await replyAndAutoDelete(interaction, { content: copy.moderation.invalidSeconds });
      return true;
    }

    const channel = resolveTargetTextChannel(interaction);
    if (!channel) {
      await replyAndAutoDelete(interaction, { content: copy.moderation.notTextChannel });
      return true;
    }

    if (!canManageTargetChannel(interaction.member, channel)) {
      await replyAndAutoDelete(interaction, { content: copy.moderation.noAccess });
      return true;
    }

    const ok = await channel.setRateLimitPerUser(seconds, `Slowmode by ${interaction.user.id}`).then(() => true).catch(() => false);
    await replyAndAutoDelete(interaction, { content: ok ? copy.moderation.slowmodeDone(channel.id, seconds) : copy.moderation.actionFailed('slowmode') });
    return true;
  }

  if (interaction.commandName === 'warnhistory') {
    if (!canDiscipline(interaction.member) && !canModerate(interaction.member)) {
      await replyAndAutoDelete(interaction, { content: copy.moderation.noAccess });
      return true;
    }

    const user = interaction.options.getUser(copy.commands.userOptionName, true);
    const entries = guildStorage.listWarns(user.id, 10);
    const embed = new EmbedBuilderCtor()
      .setColor(0xf97316)
      .setTitle(copy.moderation.warnHistoryTitle(user.tag || user.username))
      .setDescription(
        entries.length
          ? entries
            .map((entry: any, index: number) => copy.moderation.warnHistoryLine(index, {
              ...entry,
              createdAt: formatModerationTimestamp(entry.createdAt)
            }))
            .join('\n')
            .slice(0, 4000)
          : copy.moderation.warnHistoryEmpty
      )
      .setFooter({ text: 'BRHD / Phoenix / Moderation' });

    await replyAndAutoDelete(interaction, { embeds: [embed] });
    return true;
  }

  if (interaction.commandName === 'clearwarns') {
    if (!isPremiumGuild(guildId)) {
      await replyAndAutoDelete(interaction, { content: copy.moderation.premiumOnly });
      return true;
    }

    if (!canDiscipline(interaction.member) && !canModerate(interaction.member)) {
      await replyAndAutoDelete(interaction, { content: copy.moderation.noAccess });
      return true;
    }

    const user = interaction.options.getUser(copy.commands.userOptionName, true);
    const cleared = guildStorage.clearWarns(user.id);
    await doPanelUpdate(guildId, false);
    await replyAndAutoDelete(interaction, { content: copy.moderation.clearWarnsDone(user.id, cleared) });
    return true;
  }

  if (interaction.commandName === 'leaderboard') {
    if (!isPremiumGuild(guildId)) {
      await interaction.reply(ephemeral({ content: copy.admin.premiumOnly }));
      return true;
    }

    await interaction.reply(ephemeral({
      embeds: [embeds.buildLeaderboardEmbed(buildLeaderboardLines(interaction.guild, 15), buildLeaderboardSummary(interaction.guild))]
    }));
    return true;
  }

  if (interaction.commandName === 'voiceactivity') {
    if (!isPremiumGuild(guildId)) {
      await interaction.reply(ephemeral({ content: copy.admin.premiumOnly }));
      return true;
    }

    await interaction.reply(ephemeral({
      embeds: [embeds.buildVoiceActivityEmbed(buildVoiceActivityLines(interaction.guild, 15), buildVoiceActivitySummary(interaction.guild))]
    }));
    return true;
  }

  if (interaction.commandName === 'serverreport') {
    if (!canDebugConfig(interaction)) {
      await interaction.reply(ephemeral({ content: copy.common.noAccess }));
      return true;
    }

    const period = interaction.options.getString(copy.commands.periodOptionName, true);
    await interaction.reply(ephemeral({
      embeds: [buildServerStatsReportEmbed(interaction.guild, period)]
    }));
    return true;
  }

  if (interaction.commandName === 'activityreport') {
    if (!isPremiumGuild(guildId)) {
      await interaction.reply(ephemeral({ content: copy.admin.premiumOnly }));
      return true;
    }

    if (!canDebugConfig(interaction)) {
      await interaction.reply(ephemeral({ content: copy.common.noAccess }));
      return true;
    }

    const user = interaction.options.getUser(copy.commands.userOptionName);
    if (user) {
      const member = await fetchMemberFast(interaction.guild, user.id);
      if (!member) {
        await interaction.reply(ephemeral({ content: copy.profile.notFound }));
        return true;
      }

      await interaction.reply(ephemeral({ embeds: [buildPremiumActivityReportEmbed(interaction.guild, member)] }));
      return true;
    }

    await interaction.reply(ephemeral({ embeds: [buildPremiumActivityReportEmbed(interaction.guild)] }));
    return true;
  }

  if (interaction.commandName === 'aiadvisor') {
    if (!isPremiumGuild(guildId)) {
      await interaction.reply(ephemeral({ content: copy.admin.premiumOnly }));
      return true;
    }

    if (!canDebugConfig(interaction)) {
      await interaction.reply(ephemeral({ content: copy.common.noAccess }));
      return true;
    }

    const user = interaction.options.getUser(copy.commands.userOptionName) || interaction.user;
    const member = await fetchMemberFast(interaction.guild, user.id);
    if (!member) {
      await interaction.reply(ephemeral({ content: copy.profile.notFound }));
      return true;
    }

    await interaction.deferReply({ flags: 64 });

    try {
      const embed = await buildAiAdvisorEmbed(interaction.guild, member);
      await interaction.editReply({ embeds: [embed] });
    } catch (error: any) {
      await interaction.editReply({ content: copy.ai.unavailable(error?.message || copy.ai.advisorUnavailable) });
    }
    return true;
  }

  if (interaction.commandName === 'subscription') {
    if (!isOwner(interaction.user.id)) {
      await interaction.reply(ephemeral({ content: copy.admin.noOwnerAccess }));
      return true;
    }

    const plan = interaction.options.getString(copy.commands.planOptionName, true);
    const record = database.setSubscription(interaction.guild.id, {
      plan,
      assignedBy: interaction.user.id
    });

    await interaction.reply(ephemeral({
      content: copy.admin.subscriptionUpdated(plan),
      embeds: [embeds.buildAdminPanelEmbed({ guildName: interaction.guild.name, record })]
    }));
    return true;
  }

  if (interaction.commandName === 'blacklistadd') {
    if (!isPremiumGuild(guildId)) {
      await interaction.reply(ephemeral({ content: copy.admin.premiumOnly }));
      return true;
    }

    if (!canUseSecurity(interaction.member)) {
      await interaction.reply(ephemeral({ content: copy.security.noSecurityAccess }));
      return true;
    }

    const user = interaction.options.getUser(copy.commands.userOptionName, true);
    const reason = interaction.options.getString(copy.commands.reasonOptionName, true);
    const existed = guildStorage.isBlacklisted(user.id);
    guildStorage.addBlacklistEntry({
      userId: user.id,
      moderatorId: interaction.user.id,
      reason
    });

    const member = await fetchMemberFast(interaction.guild, user.id);
    if (member) {
      await enforceBlacklist(member);
    } else {
      await sendBlacklistDm(user, interaction.guild, reason).catch(() => {});
      await interaction.guild.bans.create(user.id, { reason: copy.security.blacklistBanReason(reason) }).catch(() => {});
    }

    await interaction.reply(ephemeral({
      content: existed ? copy.security.blacklistUpdated(user.id, reason) : copy.security.blacklistAdded(user.id, reason)
    }));
    return true;
  }

  if (interaction.commandName === 'blacklistremove') {
    if (!isPremiumGuild(guildId)) {
      await interaction.reply(ephemeral({ content: copy.admin.premiumOnly }));
      return true;
    }

    if (!canUseSecurity(interaction.member)) {
      await interaction.reply(ephemeral({ content: copy.security.noSecurityAccess }));
      return true;
    }

    const user = interaction.options.getUser(copy.commands.userOptionName, true);
    const removed = guildStorage.removeBlacklistEntry(user.id);
    if (!removed) {
      await interaction.reply(ephemeral({ content: copy.security.blacklistNotFound }));
      return true;
    }

    await interaction.guild.bans.remove(user.id).catch(() => {});
    await interaction.reply(ephemeral({ content: copy.security.blacklistRemoved(user.id) }));
    return true;
  }

  if (interaction.commandName === 'blacklistlist') {
    if (!isPremiumGuild(guildId)) {
      await interaction.reply(ephemeral({ content: copy.admin.premiumOnly }));
      return true;
    }

    if (!canUseSecurity(interaction.member)) {
      await interaction.reply(ephemeral({ content: copy.security.noSecurityAccess }));
      return true;
    }

    await interaction.reply(ephemeral({
      embeds: [embeds.buildBlacklistEmbed(guildStorage.listBlacklist().slice(0, 25))]
    }));
    return true;
  }

  if (interaction.commandName === 'banlist') {
    if (!isPremiumGuild(guildId)) {
      await interaction.reply(ephemeral({ content: copy.admin.premiumOnly }));
      return true;
    }

    if (!canUseSecurity(interaction.member)) {
      await interaction.reply(ephemeral({ content: copy.security.noSecurityAccess }));
      return true;
    }

    const bans = await interaction.guild.bans.fetch().catch(() => null);
    const entries = bans ? [...bans.values()].slice(0, 25) : [];
    await interaction.reply(ephemeral({
      embeds: [embeds.buildBanListEmbed(entries)]
    }));
    return true;
  }

  if (interaction.commandName === 'unbanid') {
    if (!isPremiumGuild(guildId)) {
      await interaction.reply(ephemeral({ content: copy.admin.premiumOnly }));
      return true;
    }

    if (!canUseSecurity(interaction.member)) {
      await interaction.reply(ephemeral({ content: copy.security.noSecurityAccess }));
      return true;
    }

    const userId = interaction.options.getString(copy.commands.userIdOptionName, true).trim();
    if (!/^\d{5,25}$/.test(userId)) {
      await interaction.reply(ephemeral({ content: copy.security.unbanFailed(userId) }));
      return true;
    }

    const removedFromBlacklist = guildStorage.removeBlacklistEntry(userId);
    const unbanned = await interaction.guild.bans.remove(userId).then(() => true).catch(() => false);
    if (!unbanned && !removedFromBlacklist) {
      await interaction.reply(ephemeral({ content: copy.security.unbanFailed(userId) }));
      return true;
    }

    await interaction.reply(ephemeral({ content: copy.security.unbanSuccess(userId) }));
    return true;
  }

  if (interaction.commandName === 'debugconfig') {
    if (!canDebugConfig(interaction)) {
      await interaction.reply(ephemeral({ content: copy.common.noDebugAccess }));
      return true;
    }

    const liveConfig = createConfig(process.env);
    const liveDiagnostics = validateConfig(liveConfig);
    await interaction.reply(ephemeral({
      embeds: [
        embeds.buildDebugConfigEmbed({
          summaryLines: summarizeConfig(liveConfig),
          validation: liveDiagnostics
        })
      ]
    }));
    return true;
  }

  if (interaction.commandName === 'testaccept') {
    if (!resolveGuildSettings(guildId).channels.logs) {
      await interaction.reply(ephemeral({ content: copy.logs.missingLogChannel }));
      return true;
    }

    await sendAcceptLog(interaction.guild, interaction.member, interaction.user);
    await interaction.reply(ephemeral({ content: copy.logs.testAcceptSent }));
    return true;
  }

  if (interaction.commandName === 'profile') {
    const user = interaction.options.getUser(copy.commands.userOptionName) || interaction.user;
    const member = await fetchMemberFast(interaction.guild, user.id);
    if (!member) {
      await interaction.reply(ephemeral({ content: copy.profile.notFound }));
      return true;
    }

    await interaction.reply(ephemeral(buildProfilePayload(member, canManageRanks(interaction.member))));
    return true;
  }

  if (interaction.commandName === 'warn') {
    if (!canDiscipline(interaction.member)) {
      await interaction.reply(ephemeral({ content: copy.common.noAccess }));
      return true;
    }

    const user = interaction.options.getUser(copy.commands.userOptionName, true);
    const reason = interaction.options.getString(copy.commands.reasonOptionName, true);
    guildStorage.addWarn({ userId: user.id, moderatorId: interaction.user.id, reason });

    await sendDisciplineLog(
      interaction.guild,
      embeds.buildWarnLogEmbed({
        targetUser: user,
        moderatorUser: interaction.user,
        reason
      })
    );
    await sendDisciplineDm('warn', interaction.guild, user, interaction.user, reason).catch(() => {});

    const member = await fetchMemberFast(interaction.guild, user.id);
    if (member && AUTO_RANKS.enabled && isPremiumGuild(interaction.guild.id)) {
      const autoRankResult = await rankService.applyAutoRank(member).catch(() => null);
      if (autoRankResult?.ok) {
        await sendRankDm(interaction.guild, member, autoRankResult).catch(() => {});
      }
      await doPanelUpdate(guildId, false);
    }

    await interaction.reply(ephemeral({ content: copy.discipline.warnReply(user.id) }));
    return true;
  }

  if (interaction.commandName === 'commend') {
    if (!canDiscipline(interaction.member)) {
      await interaction.reply(ephemeral({ content: copy.common.noAccess }));
      return true;
    }

    const user = interaction.options.getUser(copy.commands.userOptionName, true);
    const reason = interaction.options.getString(copy.commands.reasonOptionName, true);
    guildStorage.addCommend({ userId: user.id, moderatorId: interaction.user.id, reason });

    await sendDisciplineLog(
      interaction.guild,
      embeds.buildCommendLogEmbed({
        targetUser: user,
        moderatorUser: interaction.user,
        reason
      })
    );
    await sendDisciplineDm('commend', interaction.guild, user, interaction.user, reason).catch(() => {});

    const member = await fetchMemberFast(interaction.guild, user.id);
    if (member && AUTO_RANKS.enabled && isPremiumGuild(interaction.guild.id)) {
      const autoRankResult = await rankService.applyAutoRank(member).catch(() => null);
      if (autoRankResult?.ok) {
        await sendRankDm(interaction.guild, member, autoRankResult).catch(() => {});
      }
      await doPanelUpdate(guildId, false);
    }

    await interaction.reply(ephemeral({ content: copy.discipline.commendReply(user.id) }));
    return true;
  }

  if (interaction.commandName === 'ai') {
    if (!isPremiumGuild(interaction.guild.id)) {
      await interaction.reply(ephemeral({ content: copy.admin.premiumOnly }));
      return true;
    }

    const query = interaction.options.getString(copy.commands.queryOptionName, true);
    const targetUser = interaction.options.getUser(copy.commands.userOptionName);
    const desiredNickname = (interaction.options.getString(copy.commands.nicknameOptionName) || '').trim();
    const queryLower = query.toLowerCase();
    const wantsNicknameChange = queryLower.includes('смени ник')
      || queryLower.includes('измени ник')
      || queryLower.includes('переименуй')
      || queryLower.includes('смени ник')
      || queryLower.includes('измени ник')
      || queryLower.includes('переименуй')
      || queryLower.includes('rename nick');

    await interaction.deferReply({ flags: 64 });

    if (isAiCommandOverviewQuery(query)) {
      await interaction.editReply({ content: buildAiCommandsOverview(interaction) });
      return true;
    }

    if (wantsNicknameChange) {
      if (!targetUser || !desiredNickname) {
        await interaction.editReply({ content: copy.ai.nicknameMissingTarget });
        return true;
      }

      if (!canManageNicknames(interaction.member)) {
        await interaction.editReply({ content: copy.ai.nicknameNoAccess });
        return true;
      }

      if (desiredNickname.length < 1 || desiredNickname.length > 32) {
        await interaction.editReply({ content: copy.ai.nicknameTooLong });
        return true;
      }

      const targetMember = await fetchMemberFast(interaction.guild, targetUser.id);
      if (!targetMember) {
        await interaction.editReply({ content: copy.profile.notFound });
        return true;
      }

      const ok = await targetMember.setNickname(desiredNickname, `AI request by ${interaction.user.id}`)
        .then(() => true)
        .catch(() => false);

      await interaction.editReply({
        content: ok ? copy.ai.nicknameDone(targetUser.id, desiredNickname) : copy.ai.nicknameFailed
      });
      return true;
    }

    try {
      const answer = await aiService.aiText(copy.ai.assistantPrompt, query);
      await interaction.editReply({ content: answer.slice(0, 1900) });
    } catch (error: any) {
      await interaction.editReply({ content: copy.ai.unavailable(error.message) });
    }
    return true;
  }

  return false;
}
