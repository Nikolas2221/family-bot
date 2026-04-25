interface RoleMenuLike {
  menuId: string;
  items?: Array<{ roleId: string }>;
}

interface GuildSettingsLike {
  roleMenus?: RoleMenuLike[];
  customCommands?: Array<{
    trigger?: string;
    response?: string;
    mode?: 'contains' | 'startsWith' | 'exact';
  }>;
  reportSchedule?: {
    weekly?: { enabled?: boolean; channelId?: string };
    monthly?: { enabled?: boolean; channelId?: string };
  };
  channels?: {
    reports?: string;
  };
  automod: Record<string, any>;
}

interface DatabaseLike {
  updateGuildSettings(guildId: string, patch: Record<string, unknown>): void;
}

interface GuildStorageLike {
  getReportMarker(markerKey: string): string;
  setReportMarker(markerKey: string, value: string): void;
}

interface TextChannelLike {
  send(payload: Record<string, unknown>): Promise<any>;
}

interface AutomationRuntimeOptions {
  database: DatabaseLike;
  automodState: Map<string, number[]>;
  copy: {
    automod: {
      notice(userId: string, ruleLabel: string, detail?: string): string;
      ruleLabel(rule: string): string;
    };
  };
  resolveGuildSettings(guildId: string): GuildSettingsLike;
  isModuleEnabled(guildId: string, moduleName: string | null): boolean;
  isPremiumGuild(guildId: string): boolean;
  getGuildStorage(guildId: string): GuildStorageLike;
  fetchTextChannel(guild: any, channelId?: string | null): Promise<TextChannelLike | null>;
  buildServerStatsReportEmbed(guild: any, period?: string): any;
  getWeeklyReportKey(date?: Date): string;
  getMonthlyReportKey(date?: Date): string;
  isScheduledReportDue(period: string, now?: Date): boolean;
  fetchGuild(guildId: string): Promise<any | null>;
  evaluateAutomodMessage(payload: Record<string, unknown>): { rule: string; detail?: string } | null;
  evaluateSpamActivity(current: number[], now: number, automod: Record<string, any>): { recent: number[]; triggered: boolean };
  getAutomodStateKey(guildId: string, memberId: string): string;
  canBypassAutomod(member: any): boolean;
  sendAutomodLog(guild: any, payload: Record<string, unknown>): Promise<unknown>;
}

function matchCustomCommand(command: { trigger?: string; mode?: string }, content: string): boolean {
  const haystack = String(content || '').trim().toLowerCase();
  const trigger = String(command?.trigger || '').trim().toLowerCase();
  if (!haystack || !trigger) return false;
  if (command.mode === 'exact') return haystack === trigger;
  if (command.mode === 'startsWith') return haystack.startsWith(trigger);
  return haystack.includes(trigger);
}

export function createAutomationRuntimeHelpers(options: AutomationRuntimeOptions) {
  const {
    database,
    automodState,
    copy,
    resolveGuildSettings,
    isModuleEnabled,
    isPremiumGuild,
    getGuildStorage,
    fetchTextChannel,
    buildServerStatsReportEmbed,
    getWeeklyReportKey,
    getMonthlyReportKey,
    isScheduledReportDue,
    fetchGuild,
    evaluateAutomodMessage,
    evaluateSpamActivity,
    getAutomodStateKey,
    canBypassAutomod,
    sendAutomodLog
  } = options;

  function getRoleMenuEntries(guildId: string) {
    return resolveGuildSettings(guildId).roleMenus || [];
  }

  function findRoleMenu(guildId: string, menuId: string) {
    const normalized = String(menuId || '').trim().toLowerCase();
    return getRoleMenuEntries(guildId).find((menu) => menu.menuId === normalized) || null;
  }

  function saveRoleMenu(guildId: string, nextMenu: RoleMenuLike) {
    const current = getRoleMenuEntries(guildId).filter((menu) => menu.menuId !== nextMenu.menuId);
    database.updateGuildSettings(guildId, { roleMenus: [...current, nextMenu] });
    return findRoleMenu(guildId, nextMenu.menuId);
  }

  function removeRoleMenuItem(guildId: string, menuId: string, roleId: string) {
    const menu = findRoleMenu(guildId, menuId);
    if (!menu) return null;
    const nextMenu = {
      ...menu,
      items: (menu.items || []).filter((item) => item.roleId !== roleId)
    };
    saveRoleMenu(guildId, nextMenu);
    return nextMenu;
  }

  function getCustomCommands(guildId: string) {
    return resolveGuildSettings(guildId).customCommands || [];
  }

  async function handleCustomTriggerMessage(message: any) {
    if (!message.guild || message.author?.bot) return false;
    const guildId = message.guild.id;
    if (!isModuleEnabled(guildId, 'customCommands')) return false;
    if (!isPremiumGuild(guildId)) return false;

    const match = getCustomCommands(guildId).find((command) => matchCustomCommand(command, message.content));
    if (!match) return false;

    await message.channel.send({ content: match.response }).catch(() => {});
    return true;
  }

  async function sendScheduledReport(guild: any, period: string, channelId = '') {
    const settings = resolveGuildSettings(guild.id);
    const scheduledChannelId =
      period === 'monthly'
        ? settings.reportSchedule?.monthly?.channelId
        : settings.reportSchedule?.weekly?.channelId;
    const targetChannelId = channelId || scheduledChannelId || settings.channels?.reports;
    if (!targetChannelId) return false;

    const channel = await fetchTextChannel(guild, targetChannelId);
    if (!channel) return false;

    await channel.send({ embeds: [buildServerStatsReportEmbed(guild, period)] }).catch(() => null);
    return true;
  }

  async function runScheduledReports(guildId: string, now = new Date()) {
    const guild = await fetchGuild(guildId);
    if (!guild) return;

    if (!isModuleEnabled(guildId, 'analytics') || !isPremiumGuild(guildId)) {
      return;
    }

    const settings = resolveGuildSettings(guildId);
    const schedule = settings.reportSchedule || {};
    const plans = [
      { period: 'weekly', key: getWeeklyReportKey(now), enabled: schedule.weekly?.enabled, channelId: schedule.weekly?.channelId },
      { period: 'monthly', key: getMonthlyReportKey(now), enabled: schedule.monthly?.enabled, channelId: schedule.monthly?.channelId }
    ];

    for (const plan of plans) {
      if (!plan.enabled || !isScheduledReportDue(plan.period, now)) continue;
      if (getGuildStorage(guildId).getReportMarker(`scheduled:${plan.period}`) === plan.key) continue;

      const sent = await sendScheduledReport(guild, plan.period, plan.channelId);
      if (sent) {
        getGuildStorage(guildId).setReportMarker(`scheduled:${plan.period}`, plan.key);
      }
    }
  }

  async function handleAutomodMessage(message: any) {
    const guildId = message.guild.id;
    if (!isModuleEnabled(guildId, 'automod')) return false;
    if (canBypassAutomod(message.member)) return false;

    const settings = resolveGuildSettings(guildId);
    const automod = settings.automod;
    let triggered = evaluateAutomodMessage({
      content: message.content,
      mentionCount: message.mentions?.users?.size || 0,
      config: automod
    });

    if (!triggered && automod.spamEnabled) {
      const stateKey = getAutomodStateKey(guildId, message.author.id);
      const now = Date.now();
      const current = automodState.get(stateKey) || [];
      const spam = evaluateSpamActivity(current, now, automod);
      automodState.set(stateKey, spam.recent);
      if (spam.triggered) {
        triggered = {
          rule: 'spam',
          detail: `${spam.recent.length}/${automod.spamCount}`
        };
      }
    }

    if (!triggered) {
      return false;
    }

    await message.delete().catch(() => {});
    let punishmentLabel = 'soft';
    if (automod.actionMode === 'hard' && message.member?.moderatable) {
      const timeoutMs = Math.max(1, Number(automod.timeoutMinutes) || 10) * 60 * 1000;
      const timedOut = await message.member.timeout(timeoutMs, `Automod: ${triggered.rule}`).then(() => true).catch(() => false);
      if (timedOut) {
        punishmentLabel = `hard/${automod.timeoutMinutes || 10}m`;
      }
    }

    const notice = await message.channel
      .send({
        content: copy.automod.notice(message.author.id, copy.automod.ruleLabel(triggered.rule), triggered.detail)
      })
      .catch(() => null);

    if (notice) {
      setTimeout(() => notice.delete().catch(() => {}), 8000);
    }

    await sendAutomodLog(message.guild, {
      member: message.member,
      rule: triggered.rule,
      detail: [triggered.detail, punishmentLabel].filter(Boolean).join(' - '),
      channelId: message.channel.id,
      content: message.content
    }).catch(() => {});

    return true;
  }

  return {
    findRoleMenu,
    getCustomCommands,
    getRoleMenuEntries,
    handleAutomodMessage,
    handleCustomTriggerMessage,
    removeRoleMenuItem,
    runScheduledReports,
    saveRoleMenu,
    sendScheduledReport
  };
}
