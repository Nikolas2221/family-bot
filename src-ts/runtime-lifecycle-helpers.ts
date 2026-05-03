import type { AutoRanksConfig, GuildStorageContext, StorageApi } from './types';

interface VoiceSessionState {
  startedAt: number;
  channelId: string;
}

interface GuildMemberLike {
  id: string;
  user?: {
    bot?: boolean;
  } | null;
  voice?: {
    channelId?: string | null;
  } | null;
  guild: {
    id: string;
  };
}

interface GuildLike {
  id: string;
  members: {
    cache: {
      values(): IterableIterator<GuildMemberLike>;
      get(id: string): GuildMemberLike | undefined;
    };
    fetch(id: string): Promise<GuildMemberLike | null>;
  };
}

interface ChannelMessageLike {
  id: string;
  edit(payload: Record<string, unknown>): Promise<unknown>;
}

interface TextChannelLike {
  messages: {
    fetch(messageId: string): Promise<ChannelMessageLike>;
  };
  send(payload: Record<string, unknown>): Promise<{ id: string }>;
}

interface ClientLike {
  guilds: {
    cache: {
      get(id: string): GuildLike | undefined;
      values(): IterableIterator<GuildLike>;
    };
  };
}

interface RankSyncChangeLike {
  memberId: string;
  fromRole?: unknown;
  toRole?: unknown;
  score?: number;
}

interface RankServiceLike {
  syncAutoRanks(guild: GuildLike): Promise<{
    changes: RankSyncChangeLike[];
    failures: Array<{ memberId: string; error: unknown }>;
  }>;
}

interface PanelState {
  inProgress: boolean;
  pending: boolean;
  lastUpdate: number;
}

interface LifecycleRuntimeHelpersOptions {
  client: ClientLike;
  storage: StorageApi;
  embeds: {
    buildFamilyEmbeds(guild: GuildLike, options: Record<string, unknown>): Promise<unknown[]>;
    panelButtons(): unknown;
  };
  voiceSessions: Map<string, VoiceSessionState>;
  autoRanks: AutoRanksConfig;
  fixedGuildId: string;
  fixedMessageId: string;
  updateIntervalMs: number;
  memberSessionKey(guildId: string, memberId: string): string;
  getGuildStorage(guildId: string): GuildStorageContext;
  getRankService(guildId: string): RankServiceLike;
  isPremiumGuild(guildId: string): boolean;
  resolveGuildSettings(guildId: string): {
    channels: {
      panel?: string;
    };
    roles: unknown[];
    familyTitle: string;
    visuals?: {
      familyBanner?: string;
    };
  };
  fetchTextChannel(guild: GuildLike, channelId?: string | null): Promise<TextChannelLike | null>;
  buildFamilyDashboardStats(guild: GuildLike): unknown;
  sendRankDm(guild: GuildLike, member: GuildMemberLike, result: Record<string, unknown>): Promise<unknown>;
}

export function createRuntimeLifecycleHelpers(options: LifecycleRuntimeHelpersOptions) {
  const {
    client,
    storage,
    embeds,
    voiceSessions,
    autoRanks,
    fixedGuildId,
    fixedMessageId,
    updateIntervalMs,
    memberSessionKey,
    getGuildStorage,
    getRankService,
    isPremiumGuild,
    resolveGuildSettings,
    fetchTextChannel,
    buildFamilyDashboardStats,
    sendRankDm
  } = options;

  const panelUpdateStates = new Map<string, PanelState>();
  const autoRankSyncInProgress = new Set<string>();

  function getPanelUpdateState(guildId: string): PanelState {
    if (!panelUpdateStates.has(guildId)) {
      panelUpdateStates.set(guildId, {
        inProgress: false,
        pending: false,
        lastUpdate: 0
      });
    }

    return panelUpdateStates.get(guildId) as PanelState;
  }

  function startVoiceSession(member: GuildMemberLike): void {
    if (!member?.id || !member.voice?.channelId || member.user?.bot) return;
    const key = memberSessionKey(member.guild.id, member.id);
    if (!voiceSessions.has(key)) {
      voiceSessions.set(key, {
        startedAt: Date.now(),
        channelId: member.voice.channelId
      });
    }
  }

  function stopVoiceSession(member: GuildMemberLike): number {
    if (!member?.id) return 0;
    const key = memberSessionKey(member.guild.id, member.id);
    const session = voiceSessions.get(key);
    if (!session?.startedAt) return 0;

    voiceSessions.delete(key);
    const elapsedMs = Date.now() - session.startedAt;
    const minutes = Math.floor(elapsedMs / 60000);
    if (minutes <= 0) return 0;

    return getGuildStorage(member.guild.id).addVoiceMinutesInChannel(member.id, minutes, session.channelId);
  }

  function flushVoiceSessions(): void {
    for (const guild of client.guilds.cache.values()) {
      for (const member of guild.members.cache.values()) {
        if (voiceSessions.has(memberSessionKey(guild.id, member.id))) {
          stopVoiceSession(member);
        }
      }
    }
  }

  async function doPanelUpdate(guildId: string, force = false): Promise<void> {
    const state = getPanelUpdateState(guildId);
    if (state.inProgress) {
      state.pending = true;
      return;
    }

    const now = Date.now();
    if (!force && now - state.lastUpdate < Math.min(15000, Math.max(5000, updateIntervalMs))) {
      return;
    }

    state.inProgress = true;
    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return;

      const settings = resolveGuildSettings(guild.id);
      const guildStorage = getGuildStorage(guild.id);
      const channel = await fetchTextChannel(guild, settings.channels.panel);
      if (!channel) return;
      const summary = buildFamilyDashboardStats(guild);

      const familyEmbeds = await embeds.buildFamilyEmbeds(guild, {
        roles: settings.roles,
        familyTitle: settings.familyTitle,
        updateIntervalMs,
        activityScore: guildStorage.getActivityScore,
        summary,
        imageUrl: settings.visuals?.familyBanner
      });

      const resolvedFixedMessageId = guild.id === fixedGuildId ? fixedMessageId : '';
      const panelMessageId = storage.getGuildPanelMessageId(guild.id, resolvedFixedMessageId);
      if (panelMessageId) {
        try {
          const message = await channel.messages.fetch(panelMessageId);
          await message.edit({ embeds: familyEmbeds, components: embeds.panelButtons(), content: '' });
        } catch {
          const message = await channel.send({ embeds: familyEmbeds, components: embeds.panelButtons(), content: '' });
          storage.setGuildPanelMessageId(guild.id, message.id, resolvedFixedMessageId);
          console.log('Скопируй MESSAGE_ID:', message.id);
        }
      } else {
        const message = await channel.send({ embeds: familyEmbeds, components: embeds.panelButtons(), content: '' });
        storage.setGuildPanelMessageId(guild.id, message.id, resolvedFixedMessageId);
        console.log('Скопируй MESSAGE_ID:', message.id);
      }

      state.lastUpdate = Date.now();
    } catch (error) {
      console.error('Ошибка обновления панели:', error);
    } finally {
      state.inProgress = false;
      if (state.pending) {
        state.pending = false;
        setTimeout(() => {
          void doPanelUpdate(guildId, false);
        }, 3000);
      }
    }
  }

  async function doPanelUpdateAll(force = false): Promise<void> {
    for (const guild of client.guilds.cache.values()) {
      await doPanelUpdate(guild.id, force);
    }
  }

  async function syncAutoRanks(guildId: string, reason = 'interval'): Promise<void> {
    if (!autoRanks.enabled || !isPremiumGuild(guildId) || autoRankSyncInProgress.has(guildId)) return;

    autoRankSyncInProgress.add(guildId);
    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return;

      const rankService = getRankService(guild.id);
      const result = await rankService.syncAutoRanks(guild);
      if (result.changes.length) {
        console.log(`[auto-ranks:${reason}] ${result.changes.length} change(s)`);
        for (const change of result.changes) {
          const member =
            guild.members.cache.get(change.memberId) ||
            (await guild.members.fetch(change.memberId).catch(() => null));
          if (member) {
            await sendRankDm(guild, member, {
              ok: true,
              code: 'auto_applied',
              fromRole: change.fromRole,
              toRole: change.toRole,
              score: change.score
            }).catch(() => {});
          }
        }
        await doPanelUpdate(guild.id, true);
      }

      for (const failure of result.failures) {
        console.error(`Ошибка авто-ранга для ${failure.memberId}:`, failure.error);
      }
    } catch (error) {
      console.error('Ошибка авто-рангов:', error);
    } finally {
      autoRankSyncInProgress.delete(guildId);
    }
  }

  async function syncAutoRanksAll(reason = 'interval'): Promise<void> {
    for (const guild of client.guilds.cache.values()) {
      await syncAutoRanks(guild.id, reason);
    }
  }

  return {
    startVoiceSession,
    stopVoiceSession,
    flushVoiceSessions,
    doPanelUpdate,
    doPanelUpdateAll,
    syncAutoRanks,
    syncAutoRanksAll
  };
}
