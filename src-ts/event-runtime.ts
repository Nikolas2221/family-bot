interface UserLike {
  id: string;
  bot?: boolean;
  username?: string;
  globalName?: string | null;
}

interface RoleLike {
  id: string;
}

interface MemberRoleManagerLike {
  add(role: RoleLike, reason?: string): Promise<unknown>;
  remove(role: RoleLike, reason?: string): Promise<unknown>;
}

interface MemberLike {
  id: string;
  user?: UserLike | null;
  guild: GuildLike;
  moderatable?: boolean;
  roles: {
    add(role: RoleLike, reason?: string): Promise<unknown>;
    remove(role: RoleLike, reason?: string): Promise<unknown>;
  };
  timeout?(duration: number, reason?: string): Promise<unknown>;
}

interface GuildLike {
  id: string;
  ownerId?: string | null;
  memberCount?: number;
  members: {
    cache: {
      get(id: string): MemberLike | undefined;
    };
    fetch(id: string): Promise<MemberLike | null>;
  };
  roles: {
    cache: {
      get(id: string): RoleLike | undefined;
    };
    fetch(id: string): Promise<RoleLike | null>;
  };
}

interface ChannelLike {
  id: string;
  name?: string;
  archived?: boolean;
  send?(payload: Record<string, unknown>): Promise<NoticeLike | null>;
}

interface NoticeLike {
  delete(): Promise<unknown>;
}

interface MentionsLike {
  users?: {
    size?: number;
  };
}

interface MessageLike {
  id: string;
  content: string;
  guild?: GuildLike | null;
  author: UserLike;
  member?: MemberLike | null;
  channel: ChannelLike;
  mentions?: MentionsLike | null;
  partial?: boolean;
  webhookId?: string | null;
  embeds?: Array<{
    title?: string | null;
    description?: string | null;
    url?: string | null;
    fields?: Array<{ name?: string; value?: string }>;
  }>;
  attachments?: {
    values(): IterableIterator<{ name?: string | null; description?: string | null; url?: string | null }>;
  } | null;
  delete(): Promise<unknown>;
  fetch?(): Promise<MessageLike>;
}

export function buildLeakScanText(message: MessageLike): string {
  const embedText = (message.embeds || []).flatMap(embed => [
    embed.title,
    embed.description,
    embed.url,
    ...(embed.fields || []).flatMap(field => [field.name, field.value])
  ]);
  const attachmentText = message.attachments
    ? Array.from(message.attachments.values()).flatMap(attachment => [attachment.name, attachment.description, attachment.url])
    : [];
  return [message.content, ...embedText, ...attachmentText].filter(Boolean).join('\n');
}

function safeLogExcerpt(value: string): string {
  return String(value || '').replace(/[`\r\n]+/gu, ' ').trim().slice(0, 300) || 'без текста';
}

async function enforceScamGuard(
  message: MessageLike,
  options: Pick<EventRuntimeOptions, 'scamGuard' | 'detectScamGift' | 'canBypassScamGuard' | 'sendSecurityLog' | 'notifyTelegramScamBlocked'>
): Promise<boolean> {
  if (!message.guild || !options.scamGuard.enabled) return false;
  if (options.canBypassScamGuard(message.member)) return false;

  const scanText = buildLeakScanText(message);
  const scam = options.detectScamGift(scanText);
  if (!scam.matched) return false;

  let deletionError: unknown = null;
  const deleted = await message.delete().then(() => true).catch(error => {
    deletionError = error;
    return false;
  });

  const timeoutMs = Math.max(1, Number(options.scamGuard.timeoutMinutes) || 1440) * 60 * 1000;
  let muted = false;
  let muteError: unknown = null;
  if (message.member?.timeout && message.member.moderatable !== false) {
    muted = await message.member.timeout(timeoutMs, `Scam guard: ${scam.reason}`).then(() => true).catch(error => {
      muteError = error;
      return false;
    });
  }

  const authorLabel = message.author?.id ? `<@${message.author.id}> (\`${message.author.id}\`)` : 'unknown';
  const channelLabel = message.channel?.id ? `<#${message.channel.id}> (\`${message.channel.id}\`)` : 'unknown';
  const result = [
    deleted ? 'message deleted' : 'message NOT deleted',
    muted ? `timeout ${options.scamGuard.timeoutMinutes}m` : 'timeout NOT applied'
  ].join(', ');
  const logMessage = [
    '🚨 Scam guard: подозрительная gift/phishing ссылка или текст',
    `Автор: ${authorLabel}`,
    `Канал: ${channelLabel}`,
    `Причина: ${scam.reason}`,
    `Результат: ${result}`,
    `Фрагмент: \`${safeLogExcerpt(scanText)}\``
  ].join('\n');

  if (!deleted) {
    console.error(`Scam guard failed to delete message ${message.id} in channel ${message.channel?.id}:`, deletionError);
  }
  if (!muted) {
    console.error(`Scam guard failed to timeout member ${message.author?.id}:`, muteError || 'member is not moderatable');
  }

  await options.sendSecurityLog(message.guild, logMessage).catch(() => null);
  await options.notifyTelegramScamBlocked({
    guild: message.guild,
    user: message.author,
    channel: message.channel,
    reason: scam.reason,
    content: scanText,
    deleted,
    muted,
    timeoutMinutes: options.scamGuard.timeoutMinutes
  }).catch(() => null);

  const gifUrl = String(options.scamGuard.gifUrl || '').trim();
  const noticePayload: Record<string, unknown> = {
    content: `😂 <@${message.author.id}>, ха-ха, попался. Scam-ссылка удалена, доступ к написанию временно ограничен. Ваше уголовное дело создано и отправлено в прокуратуру, ожидайте суда.`
  };
  if (gifUrl) {
    noticePayload.embeds = [{ image: { url: gifUrl } }];
  }
  const notice = await message.channel.send?.(noticePayload).catch(() => null);
  if (notice) {
    setTimeout(() => {
      void notice.delete().catch(() => null);
    }, 10000);
  }

  return true;
}

async function enforceLeakGuard(
  message: MessageLike,
  options: Pick<EventRuntimeOptions, 'leakGuard' | 'isPremiumGuild' | 'containsDiscordInvite' | 'canBypassLeakGuard' | 'sendSecurityLog' | 'copySecurity'>
): Promise<boolean> {
  if (!message.guild || !options.isPremiumGuild(message.guild.id) || !options.leakGuard.enabled) return false;
  const scanText = buildLeakScanText(message);
  if (!options.containsDiscordInvite(scanText) || options.canBypassLeakGuard(message.member)) return false;

  let deletionError: unknown = null;
  const deleted = await message.delete().then(() => true).catch(error => {
    deletionError = error;
    return false;
  });
  const authorLabel = message.author?.id ? `<@${message.author.id}> (\`${message.author.id}\`)` : 'неизвестен';
  const channelLabel = message.channel?.id ? `<#${message.channel.id}> (\`${message.channel.id}\`)` : 'неизвестен';
  const result = deleted ? 'удалено' : 'НЕ УДАЛЕНО — проверь право Manage Messages';
  const logMessage = [
    '🚨 Anti-leak: обнаружена Discord invite-ссылка',
    `Автор: ${authorLabel}`,
    `Канал: ${channelLabel}`,
    `Результат: ${result}`,
    `Фрагмент: \`${safeLogExcerpt(scanText)}\``
  ].join('\n');

  if (!deleted) {
    console.error(`Anti-leak failed to delete message ${message.id} in channel ${message.channel?.id}:`, deletionError);
  }
  await options.sendSecurityLog(message.guild, logMessage).catch(() => null);

  const notice = await message.channel.send?.({
    content: deleted
      ? options.copySecurity.inviteGuardNotice(message.author.id)
      : `⚠️ <@${message.author.id}>, invite-ссылка обнаружена, но боту не удалось удалить сообщение.`
  }).catch(() => null);
  if (notice) {
    setTimeout(() => {
      void notice.delete().catch(() => null);
    }, 10000);
  }
  return true;
}

interface PresenceLike {
  member?: MemberLike | null;
}

interface VoiceStateLike {
  channelId?: string | null;
  member?: MemberLike | null;
}

interface EmojiLike {
  id?: string | null;
  name?: string | null;
}

interface ReactionLike {
  partial?: boolean;
  emoji?: EmojiLike | null;
  message?: MessageLike | null;
  fetch?(): Promise<ReactionLike | null>;
}

interface ReactionRoleEntryLike {
  roleId: string;
  emoji: string;
}

interface ChannelDeleteLike {
  id: string;
  name: string;
  guild?: GuildLike | null;
}

interface GuildStorageLike {
  recordAnalyticsMessage(memberId: string, channelId: string): unknown;
  recordMessage(memberId: string): unknown;
  recordPresence(memberId: string): unknown;
  trackJoin(): unknown;
  trackLeave(): unknown;
  recordReaction(memberId: string): unknown;
}

interface WelcomeSettingsLike {
  verification: {
    enabled: boolean;
  };
}

interface EventRuntimeOptions {
  client: {
    removeAllListeners(event: string): unknown;
    on(event: string, listener: (...args: any[]) => unknown): unknown;
  };
  leakGuard: {
    enabled: boolean;
  };
  scamGuard: {
    enabled: boolean;
    timeoutMinutes: number;
    gifUrl?: string;
  };
  channelGuard: {
    enabled: boolean;
  };
  copySecurity: {
    inviteGuardNotice(userId: string): string;
    inviteBlocked: string;
    channelGuardReason: string;
    channelRestored(channelName: string): string;
  };
  getGuildStorage(guildId: string): GuildStorageLike;
  isPremiumGuild(guildId: string): boolean;
  isModuleEnabled(guildId: string, moduleName: string | null): boolean;
  hasFamilyRole(member: MemberLike | null | undefined): boolean;
  containsDiscordInvite(content: string): boolean;
  detectScamGift(content: string): { matched: boolean; reason: string };
  canBypassLeakGuard(member: MemberLike | null | undefined): boolean;
  canBypassScamGuard(member: MemberLike | null | undefined): boolean;
  handleAutomodMessage(message: MessageLike): Promise<boolean>;
  handleCustomTriggerMessage(message: MessageLike): Promise<unknown>;
  sendSecurityLog(guild: GuildLike, content: string): Promise<unknown>;
  notifyTelegramScamBlocked(input: Record<string, any>): Promise<unknown>;
  startVoiceSession(member: MemberLike): void;
  stopVoiceSession(member: MemberLike): void;
  enforceBlacklist(member: MemberLike): Promise<boolean>;
  sendWelcomeInvite(member: MemberLike, memberCount?: number): Promise<unknown>;
  notifyTelegramMemberJoined(member: MemberLike): Promise<unknown>;
  applyAutorole(member: MemberLike): Promise<boolean>;
  resolveGuildSettings(guildId: string): WelcomeSettingsLike;
  findReactionRoleEntry(guildId: string, messageId: string, emojiKey: string): ReactionRoleEntryLike | null;
  getReactionEmojiKey(emoji: EmojiLike | null | undefined): string;
  canBypassChannelGuard(member: MemberLike | null | undefined): boolean;
  fetchDeletedChannelExecutor(guild: GuildLike, channelId: string): Promise<{ id: string } | null>;
  restoreDeletedChannel(channel: ChannelDeleteLike, reason: string): Promise<unknown>;
  doPanelUpdate(guildId: string, force: boolean): Promise<unknown>;
  handleDiscordTicketMessage(message: MessageLike): Promise<boolean>;
  handleAfkMessage(message: MessageLike): Promise<boolean>;
}

interface WelcomeInviteBatch {
  items: MemberLike[];
  timer: NodeJS.Timeout | null;
  flushing: boolean;
}

async function hydrateReaction(reaction: ReactionLike | null | undefined): Promise<ReactionLike | null> {
  if (!reaction) return null;

  let currentReaction: ReactionLike | null = reaction;
  if (currentReaction.partial && typeof currentReaction.fetch === 'function') {
    currentReaction = (await currentReaction.fetch().catch(() => null)) || null;
  }

  if (!currentReaction?.message) return null;
  if (currentReaction.message.partial && typeof currentReaction.message.fetch === 'function') {
    await currentReaction.message.fetch().catch(() => null);
  }

  if (!currentReaction.message?.guild) return null;
  return currentReaction;
}

async function applyReactionRoleChange(
  reaction: ReactionLike | null | undefined,
  user: UserLike | null | undefined,
  action: 'add' | 'remove',
  options: Pick<
    EventRuntimeOptions,
    'findReactionRoleEntry' | 'getReactionEmojiKey' | 'isPremiumGuild' | 'isModuleEnabled'
  >
): Promise<void> {
  if (!reaction || !user || user.bot) return;

  const guild = reaction.message?.guild;
  if (!guild) return;

  const guildId = guild.id;
  const entry = options.findReactionRoleEntry(guildId, reaction.message?.id || '', options.getReactionEmojiKey(reaction.emoji));
  if (!entry || !options.isPremiumGuild(guildId) || !options.isModuleEnabled(guildId, 'welcome')) return;

  const member = guild.members.cache.get(user.id) || (await guild.members.fetch(user.id).catch(() => null));
  if (!member) return;

  const role = guild.roles.cache.get(entry.roleId) || (await guild.roles.fetch(entry.roleId).catch(() => null));
  if (!role) return;

  if (action === 'remove') {
    await member.roles.remove(role, `Reaction role remove ${entry.emoji}`).catch(() => null);
    return;
  }

  await member.roles.add(role, `Reaction role add ${entry.emoji}`).catch(() => null);
}

export function registerEventRuntime(options: EventRuntimeOptions): void {
  const {
    client,
    leakGuard,
    scamGuard,
    channelGuard,
    copySecurity,
    getGuildStorage,
    isPremiumGuild,
    isModuleEnabled,
    hasFamilyRole,
    containsDiscordInvite,
    detectScamGift,
    canBypassLeakGuard,
    canBypassScamGuard,
    handleAutomodMessage,
    handleCustomTriggerMessage,
    sendSecurityLog,
    notifyTelegramScamBlocked,
    startVoiceSession,
    stopVoiceSession,
    enforceBlacklist,
    sendWelcomeInvite,
    notifyTelegramMemberJoined,
    applyAutorole,
    resolveGuildSettings,
    findReactionRoleEntry,
    getReactionEmojiKey,
    canBypassChannelGuard,
    fetchDeletedChannelExecutor,
    restoreDeletedChannel,
    doPanelUpdate,
    handleDiscordTicketMessage,
    handleAfkMessage
  } = options;
  const welcomeInviteBatches = new Map<string, WelcomeInviteBatch>();

  function scheduleWelcomeInvite(member: MemberLike): void {
    const guildId = member.guild.id;
    let batch = welcomeInviteBatches.get(guildId);
    if (!batch) {
      batch = { items: [], timer: null, flushing: false };
      welcomeInviteBatches.set(guildId, batch);
    }

    batch.items.push(member);
    if (batch.timer) clearTimeout(batch.timer);
    batch.timer = setTimeout(() => {
      void flushWelcomeInvites(guildId);
    }, 1000);
  }

  async function flushWelcomeInvites(guildId: string): Promise<void> {
    const batch = welcomeInviteBatches.get(guildId);
    if (!batch || batch.flushing) return;

    if (batch.timer) {
      clearTimeout(batch.timer);
      batch.timer = null;
    }

    const items = batch.items.splice(0);
    if (!items.length) {
      welcomeInviteBatches.delete(guildId);
      return;
    }

    batch.flushing = true;
    const finalMemberCount = Math.max(...items.map(member => Number(member.guild?.memberCount) || 0), 0);
    const firstMemberCount = finalMemberCount > 0 ? Math.max(1, finalMemberCount - items.length + 1) : 0;

    for (let index = 0; index < items.length; index += 1) {
      const memberCount = firstMemberCount ? firstMemberCount + index : undefined;
      await sendWelcomeInvite(items[index], memberCount).catch(() => null);
    }

    batch.flushing = false;
    if (batch.items.length) {
      if (batch.timer) clearTimeout(batch.timer);
      batch.timer = setTimeout(() => {
        void flushWelcomeInvites(guildId);
      }, 1000);
      return;
    }

    welcomeInviteBatches.delete(guildId);
  }

  const managedEvents = [
    'messageCreate',
    'messageUpdate',
    'presenceUpdate',
    'voiceStateUpdate',
    'guildMemberAdd',
    'guildMemberRemove',
    'messageReactionAdd',
    'messageReactionRemove',
    'guildMemberUpdate',
    'channelDelete'
  ];

  for (const eventName of managedEvents) {
    client.removeAllListeners(eventName);
  }

  client.on('messageCreate', async (message: MessageLike) => {
    if (!message.guild || (message.author.bot && !message.webhookId)) return;
    if (await enforceScamGuard(message, {
      scamGuard,
      detectScamGift,
      canBypassScamGuard,
      sendSecurityLog,
      notifyTelegramScamBlocked
    })) return;
    if (await enforceLeakGuard(message, {
      leakGuard,
      isPremiumGuild,
      containsDiscordInvite,
      canBypassLeakGuard,
      sendSecurityLog,
      copySecurity
    })) return;
    if (!message.member) return;
    const guildStorage = getGuildStorage(message.guild.id);

    if (await handleAutomodMessage(message)) {
      return;
    }

    if (await handleAfkMessage(message).catch(error => {
      console.warn('AFK leave message handler failed:', error);
      return false;
    })) {
      guildStorage.recordAnalyticsMessage(message.member.id, message.channel.id);
      return;
    }

    await handleDiscordTicketMessage(message).catch(error => {
      console.warn('Telegram ticket message bridge failed:', error);
    });

    guildStorage.recordAnalyticsMessage(message.member.id, message.channel.id);
    await handleCustomTriggerMessage(message).catch(() => null);

    if (!hasFamilyRole(message.member)) return;
    guildStorage.recordMessage(message.member.id);
  });

  client.on('messageUpdate', async (_oldMessage: MessageLike, nextMessage: MessageLike) => {
    let message = nextMessage;
    if (message.partial && typeof message.fetch === 'function') {
      message = await message.fetch().catch(() => message);
    }
    if (!message.guild || (message.author.bot && !message.webhookId)) return;
    if (await enforceScamGuard(message, {
      scamGuard,
      detectScamGift,
      canBypassScamGuard,
      sendSecurityLog,
      notifyTelegramScamBlocked
    })) return;
    await enforceLeakGuard(message, {
      leakGuard,
      isPremiumGuild,
      containsDiscordInvite,
      canBypassLeakGuard,
      sendSecurityLog,
      copySecurity
    });
  });

  client.on('presenceUpdate', (_oldPresence: PresenceLike | null, presence: PresenceLike | null) => {
    const member = presence?.member;
    if (!member || !hasFamilyRole(member)) return;
    getGuildStorage(member.guild.id).recordPresence(member.id);
  });

  client.on('voiceStateUpdate', (oldState: VoiceStateLike, newState: VoiceStateLike) => {
    const member = newState.member || oldState.member;
    if (!member || member.user?.bot) return;

    const oldChannelId = oldState.channelId;
    const newChannelId = newState.channelId;

    if (!oldChannelId && newChannelId) {
      startVoiceSession(member);
      return;
    }

    if (oldChannelId && !newChannelId) {
      stopVoiceSession(member);
      return;
    }

    if (oldChannelId && newChannelId && oldChannelId !== newChannelId) {
      stopVoiceSession(member);
      startVoiceSession(member);
    }
  });

  client.on('guildMemberAdd', async (member: MemberLike) => {
    if (member.user?.bot) return;
    getGuildStorage(member.guild.id).trackJoin();
    const blocked = await enforceBlacklist(member);
    if (blocked) return;

    await notifyTelegramMemberJoined(member).catch(() => null);

    if (isModuleEnabled(member.guild.id, 'welcome')) {
      const settings = resolveGuildSettings(member.guild.id);
      if (!settings.verification.enabled) {
        await applyAutorole(member).catch(() => null);
      }
      scheduleWelcomeInvite(member);
    }
  });

  client.on('guildMemberRemove', (member: MemberLike) => {
    if (member.user?.bot) return;
    getGuildStorage(member.guild.id).trackLeave();
  });

  client.on('messageReactionAdd', async (reaction: ReactionLike, user: UserLike) => {
    if (!user || user.bot) return;
    const hydratedReaction = await hydrateReaction(reaction);
    if (!hydratedReaction?.message?.guild) return;

    const member =
      hydratedReaction.message.guild.members.cache.get(user.id)
      || (await hydratedReaction.message.guild.members.fetch(user.id).catch(() => null));
    if (!member) return;

    getGuildStorage(hydratedReaction.message.guild.id).recordReaction(user.id);
    await applyReactionRoleChange(hydratedReaction, user, 'add', {
      findReactionRoleEntry,
      getReactionEmojiKey,
      isPremiumGuild,
      isModuleEnabled
    });
  });

  client.on('messageReactionRemove', async (reaction: ReactionLike, user: UserLike) => {
    if (!user || user.bot) return;
    const hydratedReaction = await hydrateReaction(reaction);
    if (!hydratedReaction?.message?.guild) return;
    await applyReactionRoleChange(hydratedReaction, user, 'remove', {
      findReactionRoleEntry,
      getReactionEmojiKey,
      isPremiumGuild,
      isModuleEnabled
    });
  });

  client.on('guildMemberUpdate', (oldMember: MemberLike, newMember: MemberLike) => {
    const before = hasFamilyRole(oldMember);
    const after = hasFamilyRole(newMember);
    if (before === after) return;

    setTimeout(() => {
      void doPanelUpdate(newMember.guild.id, false).catch(() => null);
    }, 2000);
  });

  client.on('channelDelete', async (channel: ChannelDeleteLike) => {
    if (!channelGuard.enabled || !channel?.guild || !isPremiumGuild(channel.guild.id)) return;

    try {
      const executor = await fetchDeletedChannelExecutor(channel.guild, channel.id);
      if (executor) {
        const executorMember = await channel.guild.members.fetch(executor.id).catch(() => null);
        if (canBypassChannelGuard(executorMember)) {
          return;
        }
      }

      const restored = await restoreDeletedChannel(channel, copySecurity.channelGuardReason);
      if (restored) {
        await sendSecurityLog(channel.guild, copySecurity.channelRestored(channel.name)).catch(() => null);
      }
    } catch (error) {
      console.error('Ошибка защиты каналов:', error);
    }
  });
}
