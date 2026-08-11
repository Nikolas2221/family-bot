import { AuditLogEvent, ChannelType, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { getActiveLockdown } from './services/security-lockdown';
import { getUnsafeAssignableRoleReasonAsync } from './role-safety';
import {
  appendBrainAudit,
  auditServerPermissions,
  formatBrainAudit,
  formatBrainMemory,
  normalizeServerBrainSettings,
  readRulesSnapshot,
  rememberChannelPurpose,
  riskForBrainAction,
  snapshotServerMap,
  withRulesSnapshot
} from './services/server-brain';
import type { BrainRisk, ServerBrainSettings } from './services/server-brain';

interface UserLike {
  id: string;
  bot?: boolean;
  username?: string;
  globalName?: string | null;
  send?(payload: Record<string, unknown> | string): Promise<unknown>;
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
  displayName?: string;
  user?: UserLike | null;
  presence?: { status?: string } | null;
  guild: GuildLike;
  moderatable?: boolean;
  permissions?: {
    has(permission: unknown): boolean;
  } | null;
  roles: {
    highest?: { position?: number };
    cache?: {
      values?(): IterableIterator<{ id: string; name?: string; position?: number }>;
      some?(callback: (role: { id: string; name?: string; position?: number }) => boolean): boolean;
    };
    add(role: RoleLike, reason?: string): Promise<unknown>;
    remove(role: RoleLike, reason?: string): Promise<unknown>;
  };
  ban?(options?: Record<string, unknown> | string): Promise<unknown>;
  kick?(reason?: string): Promise<unknown>;
  timeout?(duration: number | null, reason?: string): Promise<unknown>;
}

interface GuildLike {
  id: string;
  name?: string;
  ownerId?: string | null;
  memberCount?: number;
  channels?: {
    cache?: {
      get?(id: string): ChannelLike | undefined;
      values?(): IterableIterator<ChannelLike>;
    };
  };
  members: {
    cache: {
      get(id: string): MemberLike | undefined;
      values?(): IterableIterator<MemberLike>;
    };
    fetch(id: string): Promise<MemberLike | null>;
  };
  roles: {
    everyone?: RoleLike;
    cache: {
      get(id: string): RoleLike | undefined;
      values?(): IterableIterator<{ id: string; name?: string; position?: number; managed?: boolean }>;
    };
    fetch(id: string): Promise<RoleLike | null>;
  };
  fetchAuditLogs?(options: Record<string, unknown>): Promise<any>;
}

interface ChannelLike {
  id: string;
  name?: string;
  type?: number;
  parentId?: string | null;
  topic?: string | null;
  archived?: boolean;
  guild?: GuildLike | null;
  send?(payload: Record<string, unknown>): Promise<NoticeLike | null>;
  sendTyping?(): Promise<unknown>;
  fetchWebhooks?(): Promise<any>;
  permissionsFor?(target: unknown): { has(permission: unknown): boolean } | null;
  messages?: {
    fetch(options?: Record<string, unknown> | string): Promise<any>;
  };
  permissionOverwrites?: {
    edit(target: unknown, overwrite: Record<string, boolean | null>, options?: Record<string, unknown>): Promise<unknown>;
  };
  setRateLimitPerUser?(seconds: number, reason?: string): Promise<unknown>;
}

interface NoticeLike {
  delete(): Promise<unknown>;
}

interface MentionsLike {
  users?: {
    size?: number;
    has?(id: string): boolean;
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
  reference?: {
    messageId?: string | null;
    channelId?: string | null;
  } | null;
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
    content: `😂 <@${message.author.id}>, ха-ха, попался. Scam-ссылка удалена, доступ к написанию временно ограничен. Ваше уголовное дело создано и отправлено в прокуратуру, ожидайте суда.`,
    allowedMentions: { parse: [], users: message.author?.id ? [message.author.id] : [] }
  };
  if (gifUrl) {
    noticePayload.embeds = [{ image: { url: gifUrl } }];
  }
  await message.channel.send?.(noticePayload).catch(() => null);

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

interface RoleEventLike {
  id: string;
  name?: string;
  guild?: GuildLike | null;
  managed?: boolean;
  permissions?: {
    has(permission: unknown): boolean;
    bitfield?: unknown;
  } | null;
  delete?(reason?: string): Promise<unknown>;
  edit?(options: Record<string, unknown>, reason?: string): Promise<unknown>;
}

interface GuildStorageLike {
  recordAnalyticsMessage(memberId: string, channelId: string): unknown;
  recordMessage(memberId: string): unknown;
  recordPresence(memberId: string): unknown;
  trackJoin(): unknown;
  trackLeave(): unknown;
  recordReaction(memberId: string): unknown;
  getPeriodAnalytics(days?: number): {
    dayCount: number;
    joins: number;
    leaves: number;
    messagesTotal: number;
    reactionsTotal: number;
    voiceMinutesTotal: number;
    members: Record<string, { messages: number; reactions: number; voiceMinutes: number }>;
    channels: Record<string, number>;
    voiceChannels: Record<string, number>;
  };
  ensureMemberRecord(memberId: string): {
    messageCount?: number;
    voiceMinutes?: number;
    points?: number;
    warns?: number;
    commends?: number;
    lastSeenAt?: number;
    lastMessageAt?: number;
    lastVoiceAt?: number;
  };
}

interface WelcomeSettingsLike {
  verification: {
    enabled: boolean;
  };
  familyTitle?: string;
  channels?: Record<string, string>;
  access?: {
    applications?: string[];
    discipline?: string[];
    ranks?: string[];
  };
  modules?: Record<string, boolean>;
  roles?: Record<string, string>;
  aiBrain?: ServerBrainSettings;
}

interface DatabaseLike {
  updateGuildSettings(guildId: string, patch: Record<string, unknown>): unknown;
}

interface EventRuntimeOptions {
  client: {
    user?: UserLike | null;
    channels?: {
      fetch(channelId: string): Promise<ChannelLike | null>;
    };
    removeAllListeners(event: string): unknown;
    on(event: string, listener: (...args: any[]) => unknown): unknown;
    guilds?: {
      cache?: {
        values?(): IterableIterator<GuildLike>;
      };
    };
  };
  aiMention: {
    enabled: boolean;
    cooldownSeconds: number;
    maxChars: number;
  };
  aiService?: {
    aiText(systemPrompt: string, userPrompt: string): Promise<string>;
  } | null;
  announcementService?: {
    sendTelegramFromDiscord(input: Record<string, any>): Promise<{ ok: boolean; code?: string; detail?: string }>;
  } | null;
  familyAnnouncementRoleId?: string;
  database?: DatabaseLike | null;
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
  canBypassAutomod?(member: MemberLike | null | undefined): boolean;
  handleAutomodMessage(message: MessageLike): Promise<boolean>;
  handleCustomTriggerMessage(message: MessageLike): Promise<unknown>;
  sendSecurityLog(guild: GuildLike, content: string): Promise<unknown>;
  notifyTelegramScamBlocked(input: Record<string, any>): Promise<unknown>;
  notifyTelegramSecurityAlert(input: Record<string, any>): Promise<unknown>;
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
  handleVoiceRoomsVoiceStateUpdate?(oldState: VoiceStateLike, newState: VoiceStateLike): Promise<boolean>;
}

interface PendingBrainAction {
  code: string;
  guildId: string;
  actorId: string;
  action: 'ban' | 'kick';
  targetId: string;
  reason: string;
  summary: string;
  risk: BrainRisk;
  expiresAt: number;
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

  const unsafeReason = await getUnsafeAssignableRoleReasonAsync(role, { guild });
  if (unsafeReason) {
    console.warn(`Reaction role assignment blocked for ${entry.roleId}: ${unsafeReason}`);
    return;
  }

  await member.roles.add(role, `Reaction role add ${entry.emoji}`).catch(() => null);
}

const dangerousRolePermissions = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageWebhooks,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.MentionEveryone
];

function roleHasDangerousPermissions(role: RoleEventLike | null | undefined): boolean {
  return Boolean(role?.permissions && dangerousRolePermissions.some(permission => role.permissions?.has(permission)));
}

function roleGainedDangerousPermissions(oldRole: RoleEventLike | null | undefined, newRole: RoleEventLike | null | undefined): boolean {
  if (!newRole?.permissions) return false;
  return dangerousRolePermissions.some(permission => newRole.permissions?.has(permission) && !oldRole?.permissions?.has(permission));
}

async function fetchRecentAuditExecutor(guild: GuildLike, type: unknown, targetId?: string): Promise<UserLike | null> {
  const logs = await guild.fetchAuditLogs?.({ type, limit: 5 }).catch(() => null);
  if (!logs?.entries?.values) return null;

  const now = Date.now();
  for (const entry of logs.entries.values()) {
    if (targetId && entry.target?.id !== targetId) continue;
    if (entry.createdTimestamp && now - entry.createdTimestamp > 15000) continue;
    return entry.executor || null;
  }

  return null;
}

async function isTrustedSecurityActor(guild: GuildLike, actor: UserLike | null, canBypassChannelGuard: EventRuntimeOptions['canBypassChannelGuard']): Promise<boolean> {
  if (!actor?.id) return false;
  if (guild.ownerId && guild.ownerId === actor.id) return true;
  const member = await guild.members.fetch(actor.id).catch(() => null);
  return canBypassChannelGuard(member);
}

async function reportSecurityAlert(
  guild: GuildLike,
  input: { title: string; actor?: UserLike | null; content: string },
  options: Pick<EventRuntimeOptions, 'sendSecurityLog' | 'notifyTelegramSecurityAlert'>
): Promise<void> {
  const text = [input.title, input.actor?.id ? `Инициатор: <@${input.actor.id}> (${input.actor.id})` : '', input.content].filter(Boolean).join('\n');
  await options.sendSecurityLog(guild, text).catch(() => null);
  await options.notifyTelegramSecurityAlert({
    title: input.title,
    guild,
    actor: input.actor,
    content: input.content
  }).catch(() => null);
}

function isLockdownTargetChannel(channel: ChannelLike | null | undefined): boolean {
  return [
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
    ChannelType.GuildForum
  ].includes(channel?.type as any);
}

function buildLockdownOverwrite(): Record<string, boolean> {
  return {
    SendMessages: false,
    SendMessagesInThreads: false,
    CreatePublicThreads: false,
    CreatePrivateThreads: false,
    AddReactions: false,
    CreateInstantInvite: false
  };
}

async function applyActiveLockdownToNewChannel(
  channel: ChannelLike,
  options: Pick<EventRuntimeOptions, 'sendSecurityLog' | 'notifyTelegramSecurityAlert'>
): Promise<void> {
  const guild = channel.guild;
  if (!guild || !isLockdownTargetChannel(channel)) return;
  const state = getActiveLockdown(guild.id);
  if (!state) return;

  const reason = `Emergency lockdown active by ${state.actorId}`;
  const overwriteOk = await channel.permissionOverwrites?.edit?.(guild.roles.everyone || guild.id, buildLockdownOverwrite(), { reason })
    .then(() => true)
    .catch(() => false);
  const slowmodeOk = typeof channel.setRateLimitPerUser === 'function'
    ? await channel.setRateLimitPerUser(state.slowmodeSeconds, reason).then(() => true).catch(() => false)
    : true;

  if (overwriteOk || slowmodeOk) return;
  await reportSecurityAlert(guild, {
    title: '🚨 Security: lockdown не применился к новому каналу',
    content: `Канал: <#${channel.id}> (${channel.id})\nПроверь права бота Manage Channels.`
  }, options);
}

async function handleDangerousRoleCreate(
  role: RoleEventLike,
  options: Pick<EventRuntimeOptions, 'isPremiumGuild' | 'isModuleEnabled' | 'canBypassChannelGuard' | 'sendSecurityLog' | 'notifyTelegramSecurityAlert'>
): Promise<void> {
  if (!role.guild || role.managed || !options.isPremiumGuild(role.guild.id) || !options.isModuleEnabled(role.guild.id, 'security')) return;
  if (!roleHasDangerousPermissions(role)) return;

  const actor = await fetchRecentAuditExecutor(role.guild, AuditLogEvent.RoleCreate, role.id);
  if (await isTrustedSecurityActor(role.guild, actor, options.canBypassChannelGuard)) return;

  const deleted = await role.delete?.(`Security guard: dangerous role created by ${actor?.id || 'unknown'}`).then(() => true).catch(() => false);
  await reportSecurityAlert(role.guild, {
    title: '🚨 Security: опасная роль создана',
    actor,
    content: [
      `Роль: ${role.name || role.id} (${role.id})`,
      `Действие: ${deleted ? 'роль удалена' : 'не удалось удалить роль'}`
    ].join('\n')
  }, options);
}

async function handleDangerousRoleUpdate(
  oldRole: RoleEventLike,
  newRole: RoleEventLike,
  options: Pick<EventRuntimeOptions, 'isPremiumGuild' | 'isModuleEnabled' | 'canBypassChannelGuard' | 'sendSecurityLog' | 'notifyTelegramSecurityAlert'>
): Promise<void> {
  if (!newRole.guild || newRole.managed || !options.isPremiumGuild(newRole.guild.id) || !options.isModuleEnabled(newRole.guild.id, 'security')) return;
  if (!roleGainedDangerousPermissions(oldRole, newRole)) return;

  const actor = await fetchRecentAuditExecutor(newRole.guild, AuditLogEvent.RoleUpdate, newRole.id);
  if (await isTrustedSecurityActor(newRole.guild, actor, options.canBypassChannelGuard)) return;

  const previousPermissions = oldRole.permissions?.bitfield ?? oldRole.permissions;
  const reverted = await newRole.edit?.({ permissions: previousPermissions }, `Security guard: dangerous role permissions by ${actor?.id || 'unknown'}`)
    .then(() => true)
    .catch(() => false);
  await reportSecurityAlert(newRole.guild, {
    title: '🚨 Security: опасные права роли',
    actor,
    content: [
      `Роль: ${newRole.name || newRole.id} (${newRole.id})`,
      `Действие: ${reverted ? 'права откатились' : 'не удалось откатить права'}`
    ].join('\n')
  }, options);
}

async function handleWebhookUpdate(
  channel: ChannelLike,
  options: Pick<EventRuntimeOptions, 'isPremiumGuild' | 'isModuleEnabled' | 'canBypassChannelGuard' | 'sendSecurityLog' | 'notifyTelegramSecurityAlert'>
): Promise<void> {
  const guild = channel.guild;
  if (!guild || !options.isPremiumGuild(guild.id) || !options.isModuleEnabled(guild.id, 'security')) return;

  const now = Date.now();
  const entries: any[] = [];
  for (const type of [AuditLogEvent.WebhookCreate, AuditLogEvent.WebhookUpdate, AuditLogEvent.WebhookDelete]) {
    const logs = await guild.fetchAuditLogs?.({ type, limit: 5 }).catch(() => null);
    if (logs?.entries?.values) entries.push(...Array.from(logs.entries.values()) as any[]);
  }
  const entry: any = entries
    .filter((item: any) => !item.createdTimestamp || now - item.createdTimestamp <= 15000)
    .sort((left: any, right: any) => Number(right.createdTimestamp || 0) - Number(left.createdTimestamp || 0))[0] || null;
  const actor = entry?.executor || null;
  if (await isTrustedSecurityActor(guild, actor, options.canBypassChannelGuard)) return;

  const targetId = entry?.target?.id ? String(entry.target.id) : '';
  if (!targetId) {
    await reportSecurityAlert(guild, {
      title: '🚨 Security: webhook изменён',
      actor,
      content: `Канал: <#${channel.id}> (${channel.id})\nAudit log не вернул target webhook. Проверь канал вручную.`
    }, options);
    return;
  }
  if (entry?.action === AuditLogEvent.WebhookDelete || typeof channel.fetchWebhooks !== 'function') {
    await reportSecurityAlert(guild, {
      title: '🚨 Security: webhook удалён или недоступен',
      actor,
      content: `Канал: <#${channel.id}> (${channel.id})\nWebhook: ${targetId}`
    }, options);
    return;
  }

  const webhooks = await channel.fetchWebhooks().catch(() => null);
  const webhook = webhooks?.get?.(targetId);
  const deleted = webhook ? await webhook.delete(`Security guard: webhook created by ${actor?.id || 'unknown'}`).then(() => true).catch(() => false) : false;
  await reportSecurityAlert(guild, {
    title: entry?.action === AuditLogEvent.WebhookUpdate ? '🚨 Security: webhook изменён' : '🚨 Security: webhook создан',
    actor,
    content: [
      `Канал: <#${channel.id}> (${channel.id})`,
      `Webhook: ${targetId}`,
      `Действие: ${deleted ? 'webhook удалён' : 'не удалось удалить webhook'}`
    ].join('\n')
  }, options);
}

function botWasMentioned(message: MessageLike, botId: string): boolean {
  if (!botId) return false;
  if (message.mentions?.users?.has?.(botId)) return true;
  return new RegExp(`<@!?${botId}>`, 'u').test(String(message.content || ''));
}

function stripBotMention(content: string, botId: string): string {
  return String(content || '')
    .replace(new RegExp(`<@!?${botId}>`, 'gu'), ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function buildMentionSystemPrompt(): string {
  return [
    'Ты KLAIZ BOT, живой AI-помощник Discord-семьи.',
    'Отвечай по-русски, дружелюбно, уверенно и коротко.',
    'По умолчанию давай один готовый ответ, а не список из многих вариантов.',
    'Если просят объявление, текст, ответ участнику или идею, сразу дай готовый вариант.',
    'Если данных мало, задай один короткий уточняющий вопрос.',
    'Не раскрывай и не проси токены, пароли, cookie, ключи API или приватные данные.',
    'Не пингуй everyone/here и не вставляй опасные ссылки.'
  ].join(' ');
}

function isCapabilityQuestion(value: string): boolean {
  const text = String(value || '').toLowerCase();
  return [
    'что можешь',
    'что ты можешь',
    'что умеешь',
    'что ты умеешь',
    'какие команды',
    'мои команды',
    'что может бот',
    'что может klaiz bot'
  ].some(marker => text.includes(marker));
}

function buildMentionCapabilitiesText(): string {
  return [
    '🤖 Что я могу:',
    '',
    '• вести панель семьи, роли, баллы, выговоры и активность;',
    '• принимать заявки в семью и отправлять вердикт в личные сообщения;',
    '• дублировать заявки, AFK, объявления и события в Telegram;',
    '• показывать /online, /aionline и списки активности;',
    '• отвечать через AI: /ai, /aimember, /aidaily, /aistaff, /aiannounce;',
    '• анализировать участников, заявки и риски по активности;',
    '• хранить постоянную карту каналов и ролей сервера и помнить их назначение;',
    '• автоматически читать изменения в назначенном канале правил;',
    '• проверять права каналов, опасные роли и иерархию роли бота;',
    '• выполнять админ-команды через единый AI-центр с оценкой риска, подтверждением и журналом;',
    '• делать шаблоны объявлений и событий;',
    '• защищать сервер от scam/gift ссылок, invite-слива и опасных действий;',
    '• создавать backup структуры Discord в GitHub;',
    '• вести тикеты, AFK-отпуска, отчёты, медиа и Voice Room.',
    '',
    'Полный список доступен командой /capabilities.'
  ].join('\n');
}

async function buildAiToolSummary(
  aiService: EventRuntimeOptions['aiService'],
  systemPrompt: string,
  dataPrompt: string,
  fallback: string
): Promise<string> {
  if (!aiService) return fallback;
  let timeout: NodeJS.Timeout | null = null;
  try {
    const answer = await Promise.race([
      aiService.aiText(systemPrompt, dataPrompt),
      new Promise<string>(resolve => {
        timeout = setTimeout(() => resolve(''), 6000);
      })
    ]);
    return String(answer || '').trim().slice(0, 700) || fallback;
  } catch {
    return fallback;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function looksLikeLiveActivityQuestion(value: string): boolean {
  const text = String(value || '').toLowerCase().replace(/ё/gu, 'е');
  const asksForStats = /статист|стат[ау]\b|активност|аналитик|топ актив/u.test(text);
  const serverScope = /(дс|discord|дискорд|сервер|семь|участник|сообщен|голос|реакц)/u.test(text);
  return asksForStats && serverScope;
}

function requestedActivityDays(value: string): number {
  const text = String(value || '').toLowerCase().replace(/ё/gu, 'е');
  if (/месяц|30\s*(дн|дней|дня)/u.test(text)) return 30;
  if (/сегодня|сутк|за\s*день|24\s*(ч|час)/u.test(text)) return 1;
  return 7;
}

function looksLikeInactiveMembersRequest(value: string): boolean {
  const text = String(value || '').toLowerCase().replace(/ё/gu, 'е');
  const asksForMembers = /(тегни|упомяни|позови|пингани|покажи|найди|кто|список|дай|выведи|отправ|напиши|разошли|предупреди)/u.test(text);
  return asksForMembers && /(неактив|давно не заход|пропал)/u.test(text);
}

function shouldPingInactiveMembers(value: string): boolean {
  return /(тегни|упомяни|позови|пингани)/u.test(String(value || '').toLowerCase().replace(/ё/gu, 'е'));
}

function shouldMessageInactiveMembers(value: string): boolean {
  const text = String(value || '').toLowerCase().replace(/ё/gu, 'е');
  return /(отправ|напиши|разошли|предупреди)/u.test(text) && /(лс|личн|dm|сообщен)/u.test(text);
}

function requestedInactiveDays(value: string): number {
  const text = String(value || '').toLowerCase().replace(/ё/gu, 'е');
  const explicit = text.match(/(?:за|больше|старше)?\s*(\d{1,3})\s*(?:дн|день|дня|дней)/u);
  if (explicit) return Math.max(1, Math.min(90, Number(explicit[1]) || 7));
  if (/месяц/u.test(text)) return 30;
  if (/недел/u.test(text)) return 7;
  return 7;
}

async function handleInactiveMembersRequest(
  message: MessageLike,
  prompt: string,
  options: Pick<EventRuntimeOptions, 'getGuildStorage' | 'hasFamilyRole' | 'database' | 'resolveGuildSettings' | 'sendSecurityLog' | 'aiService'>
): Promise<boolean> {
  if (!message.guild || !looksLikeInactiveMembersRequest(prompt)) return false;
  if (!isAdminMember(message.member)) {
    await message.channel.send?.({
      content: `<@${message.author.id}>, массово упоминать неактивных участников может только администратор.`,
      allowedMentions: { parse: [], users: [message.author.id] }
    }).catch(() => null);
    return true;
  }

  const days = requestedInactiveDays(prompt);
  const pingMembers = shouldPingInactiveMembers(prompt);
  const messageMembers = shouldMessageInactiveMembers(prompt);
  const threshold = Date.now() - days * 24 * 60 * 60 * 1000;
  const guildStorage = options.getGuildStorage(message.guild.id);
  const inactive = collectionValues<MemberLike>(message.guild.members?.cache)
    .filter(member => member.id !== message.author.id && !member.user?.bot && options.hasFamilyRole(member))
    .map(member => ({ member, data: guildStorage.ensureMemberRecord(member.id) }))
    .filter(({ data }) => {
      const lastActivity = Math.max(
        Number(data.lastSeenAt) || 0,
        Number(data.lastMessageAt) || 0,
        Number(data.lastVoiceAt) || 0
      );
      return lastActivity > 0 && lastActivity < threshold;
    })
    .sort((left, right) => (Number(left.data.lastSeenAt) || 0) - (Number(right.data.lastSeenAt) || 0));

  if (!inactive.length) {
    await message.channel.send?.({
      content: `✅ Неактивных семейных участников за последние ${days} дн. не найдено.`,
      allowedMentions: { parse: [] }
    }).catch(() => null);
    return true;
  }

  const ids = inactive.map(item => item.member.id).slice(0, 100);
  const inactiveAiProfiles = inactive.slice(0, 100).map(({ member, data }, index) => {
    const lastActivity = Math.max(Number(data.lastSeenAt) || 0, Number(data.lastMessageAt) || 0, Number(data.lastVoiceAt) || 0);
    const inactiveForDays = lastActivity ? Math.max(0, Math.floor((Date.now() - lastActivity) / (24 * 60 * 60 * 1000))) : -1;
    const publicName = member.displayName || member.user?.globalName || member.user?.username || member.id;
    return `${index + 1}) ${publicName}; Discord ID=${member.id}; сообщений=${Number(data.messageCount) || 0}; голос=${Number(data.voiceMinutes) || 0} мин; баллы=${Number(data.points) || 0}; выговоры=${Number(data.warns) || 0}; похвалы=${Number(data.commends) || 0}; неактивность=${inactiveForDays < 0 ? 'нет данных' : `${inactiveForDays} дн.`}`;
  }).join('\n');
  const aiSummary = await buildAiToolSummary(
    options.aiService,
    messageMembers
      ? 'Ты KLAIZ BOT. Составь одно вежливое, но ясное личное предупреждение неактивному участнику семьи. Попроси проявить активность или сообщить администрации причину отсутствия. Не добавляй имя, mention, ссылку, угрозы и выдуманные правила. Верни только готовый текст сообщения.'
      : 'Ты аналитик KLAIZ BOT. По переданным агрегированным данным дай одно короткое дружелюбное сообщение без выдуманных цифр, команд сторонних ботов и упоминаний пользователей.',
    messageMembers
      ? `Порог неактивности: более ${days} дней. Администратор попросил самостоятельно сформировать предупреждение и отправить его в личные сообщения. Публичные профили получателей:\n${inactiveAiProfiles}`
      : `Найдено неактивных семейных участников: ${ids.length}. Порог неактивности: ${days} дней. Действие: ${pingMembers ? 'администратор попросил упомянуть их' : 'администратор запросил список'}. Публичные профили и активность:\n${inactiveAiProfiles}`,
    messageMembers
      ? `Здравствуйте! Мы заметили, что вы не проявляли активность более ${days} дней. Пожалуйста, проявите активность или сообщите администрации причину отсутствия, чтобы мы понимали вашу текущую ситуацию.`
      : `Найдено ${ids.length} неактивных семейных участников за период более ${days} дней.`
  );
  let delivered = 0;
  let failed = 0;
  if (messageMembers) {
    for (const { member } of inactive.slice(0, 100)) {
      const sent = await member.user?.send?.({
        content: aiSummary,
        allowedMentions: { parse: [] }
      }).then(() => true).catch(() => false);
      if (sent) delivered += 1;
      else failed += 1;
    }
    await message.channel.send?.({
      content: [
        '✅ Предупреждение неактивным участникам отправлено.',
        `Доставлено: **${delivered}**`,
        `Не доставлено: **${failed}**`,
        '',
        `**Текст сообщения:**\n${aiSummary}`
      ].join('\n').slice(0, 1900),
      allowedMentions: { parse: [] }
    }).catch(() => null);
  } else if (pingMembers) {
    const batches: string[][] = [];
    for (let index = 0; index < ids.length; index += 25) batches.push(ids.slice(index, index + 25));
    for (let index = 0; index < batches.length; index += 1) {
      const batch = batches[index];
      await message.channel.send?.({
        content: [
          index === 0 ? `📣 ${aiSummary}\nНеактивные участники за ${days} дн. (${ids.length}):` : `Продолжение списка (${index + 1}/${batches.length}):`,
          batch.map(id => `<@${id}>`).join(' '),
          index === 0 ? 'Пожалуйста, отметьтесь и сообщите о своей активности.' : ''
        ].filter(Boolean).join('\n'),
        allowedMentions: { parse: [], users: batch }
      }).catch(() => null);
    }
  } else {
    const lines = inactive.slice(0, 40).map(({ member, data }, index) => {
      const lastActivity = Math.max(
        Number(data.lastSeenAt) || 0,
        Number(data.lastMessageAt) || 0,
        Number(data.lastVoiceAt) || 0
      );
      const inactiveDays = Math.max(1, Math.floor((Date.now() - lastActivity) / (24 * 60 * 60 * 1000)));
      return `${index + 1}. <@${member.id}> — нет активности ${inactiveDays} дн.`;
    });
    if (inactive.length > lines.length) lines.push(`…и ещё ${inactive.length - lines.length} участник(ов).`);
    const embed = new EmbedBuilder()
      .setColor(0xf59e0b)
      .setTitle('💤 Неактивные участники')
      .setDescription(`${aiSummary}\n\nСемейные участники без активности более **${days} дн.**: **${inactive.length}**`)
      .addFields({ name: 'Список', value: lines.join('\n').slice(0, 1024) })
      .setFooter({ text: 'KLAIZ • Живые данные бота' })
      .setTimestamp();
    await message.channel.send?.({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => null);
  }

  const currentSettings = options.resolveGuildSettings(message.guild.id);
  const brain = appendBrainAudit(normalizeServerBrainSettings(currentSettings.aiBrain), {
    action: messageMembers ? 'inactive_dm' : (pingMembers ? 'inactive_ping' : 'inactive_list'),
    risk: messageMembers || pingMembers ? 'medium' : 'read',
    status: 'completed',
    actorId: message.author.id,
    targetId: message.channel.id,
    summary: `${messageMembers ? `ЛС доставлено ${delivered}, ошибок ${failed}` : (pingMembers ? 'Упомянуты' : 'Показаны')} неактивные участники: ${ids.length}; период: ${days} дн.`
  });
  saveBrainSettings(message.guild.id, brain, options);
  await options.sendSecurityLog(
    message.guild,
    `AI action ${messageMembers ? 'inactive_dm' : (pingMembers ? 'inactive_ping' : 'inactive_list')}: actor=${message.author.id}, channel=${message.channel.id}, users=${ids.length}, delivered=${delivered}, failed=${failed}, days=${days}, risk=${messageMembers || pingMembers ? 'medium' : 'read'}, status=completed`
  ).catch(() => null);
  return true;
}

function formatActivityMemberLine(
  memberId: string,
  stats: { messages: number; reactions: number; voiceMinutes: number },
  index: number
): string {
  const voiceHours = (Math.max(0, Number(stats.voiceMinutes) || 0) / 60).toFixed(1);
  return `${index + 1}. <@${memberId}> — ${stats.messages || 0} сообщ. • ${voiceHours} ч голос • ${stats.reactions || 0} реакц.`;
}

async function handleLiveActivityQuestion(
  message: MessageLike,
  prompt: string,
  options: Pick<EventRuntimeOptions, 'getGuildStorage' | 'hasFamilyRole' | 'aiService'>
): Promise<boolean> {
  if (!message.guild || !looksLikeLiveActivityQuestion(prompt)) return false;

  const days = requestedActivityDays(prompt);
  const guildStorage = options.getGuildStorage(message.guild.id);
  const today = guildStorage.getPeriodAnalytics(1);
  const period = guildStorage.getPeriodAnalytics(days);
  const cachedMembers = collectionValues<MemberLike>(message.guild.members?.cache);
  const familyMembers = cachedMembers.filter(member => !member.user?.bot && options.hasFamilyRole(member));
  const onlineMembers = cachedMembers.filter(member => !member.user?.bot && member.presence?.status && member.presence.status !== 'offline');
  const topMembers = Object.entries(period.members || {})
    .sort(([, left], [, right]) => {
      const leftScore = (left.messages || 0) + (left.reactions || 0) + (left.voiceMinutes || 0) / 10;
      const rightScore = (right.messages || 0) + (right.reactions || 0) + (right.voiceMinutes || 0) / 10;
      return rightScore - leftScore;
    })
    .slice(0, 8)
    .map(([memberId, stats], index) => formatActivityMemberLine(memberId, stats, index));
  const channelNames = new Map(
    collectionValues<ChannelLike>(message.guild.channels?.cache).map(channel => [channel.id, channel.name || channel.id])
  );
  const topChannels = Object.entries(period.channels || {})
    .sort(([, left], [, right]) => Number(right) - Number(left))
    .slice(0, 5)
    .map(([channelId, count], index) => `${index + 1}. <#${channelId}> (${channelNames.get(channelId) || channelId}) — ${count}`);
  const periodLabel = days === 1 ? 'Сегодня' : `За ${days} дней`;
  const perMemberActivity = Object.entries(period.members || {})
    .slice(0, 100)
    .map(([memberId, stats], index) => {
      const member = cachedMembers.find(item => item.id === memberId);
      const publicName = member?.displayName || member?.user?.globalName || member?.user?.username || memberId;
      return `${index + 1}) ${publicName}; Discord ID=${memberId}; сообщения=${stats.messages || 0}; реакции=${stats.reactions || 0}; голос=${stats.voiceMinutes || 0} мин.`;
    })
    .join('\n');
  const aiSummary = await buildAiToolSummary(
    options.aiService,
    'Ты аналитик KLAIZ BOT. Дай краткий вывод по реальной агрегированной статистике Discord. Не выдумывай данные, не говори об отсутствии доступа и не советуй сторонних ботов.',
    [
      `Период: ${days} дней.`,
      `Участников сервера: ${message.guild.memberCount ?? cachedMembers.length}.`,
      `Сообщения: ${period.messagesTotal || 0}.`,
      `Реакции: ${period.reactionsTotal || 0}.`,
      `Голосовые минуты: ${period.voiceMinutesTotal || 0}.`,
      `Входы: ${period.joins || 0}. Выходы: ${period.leaves || 0}.`,
      `Участников с зафиксированной активностью: ${Object.keys(period.members || {}).length}.`,
      perMemberActivity ? `Публичные профили и активность каждого участника:\n${perMemberActivity}` : ''
    ].join(' '),
    `За ${days} дн. зафиксировано ${period.messagesTotal || 0} сообщений, ${period.reactionsTotal || 0} реакций и ${((period.voiceMinutesTotal || 0) / 60).toFixed(1)} ч голосовой активности.`
  );

  const embed = new EmbedBuilder()
    .setColor(0x7c3aed)
    .setTitle('📊 Активность Discord')
    .setDescription([
      `Сервер: **${message.guild.name || message.guild.id}**`,
      `Участников: **${message.guild.memberCount ?? cachedMembers.length}**`,
      `Семейных участников в кеше: **${familyMembers.length}**`,
      `Сейчас онлайн: **${onlineMembers.length}**`,
      '',
      `🤖 **AI-сводка:** ${aiSummary}`
    ].join('\n'))
    .addFields(
      {
        name: 'Сегодня',
        value: [
          `Сообщения: **${today.messagesTotal || 0}**`,
          `Реакции: **${today.reactionsTotal || 0}**`,
          `Голос: **${((today.voiceMinutesTotal || 0) / 60).toFixed(1)} ч**`,
          `Вошли / вышли: **${today.joins || 0} / ${today.leaves || 0}**`
        ].join('\n'),
        inline: true
      },
      {
        name: periodLabel,
        value: [
          `Сообщения: **${period.messagesTotal || 0}**`,
          `Реакции: **${period.reactionsTotal || 0}**`,
          `Голос: **${((period.voiceMinutesTotal || 0) / 60).toFixed(1)} ч**`,
          `Вошли / вышли: **${period.joins || 0} / ${period.leaves || 0}**`
        ].join('\n'),
        inline: true
      },
      {
        name: `Топ участников • ${periodLabel.toLowerCase()}`,
        value: topMembers.length ? topMembers.join('\n').slice(0, 1024) : 'За выбранный период активности пока не зафиксировано.'
      },
      {
        name: 'Активные текстовые каналы',
        value: topChannels.length ? topChannels.join('\n').slice(0, 1024) : 'Сообщений по каналам за выбранный период пока нет.'
      }
    )
    .setFooter({ text: 'KLAIZ • Живые данные бота' })
    .setTimestamp();

  await message.channel.send?.({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => null);
  return true;
}

function buildAggregateServerContext(
  message: MessageLike,
  options: Pick<EventRuntimeOptions, 'getGuildStorage' | 'resolveGuildSettings' | 'hasFamilyRole'>
): string {
  if (!message.guild) return '';
  const guildStorage = options.getGuildStorage(message.guild.id);
  const stats = guildStorage.getPeriodAnalytics(7);
  const settings = options.resolveGuildSettings(message.guild.id);
  const channels = Object.values(settings.aiBrain?.channels || {})
    .slice(0, 25)
    .map(channel => `${channel.name}: ${channel.purpose || 'не назначено'}`)
    .join(', ');
  const roles = Object.values(settings.aiBrain?.roles || {})
    .sort((left, right) => right.position - left.position)
    .slice(0, 20)
    .map(role => role.name)
    .join(', ');
  const rules = String(settings.aiBrain?.rules?.text || '').trim().slice(0, 1200);
  const requestedIds = new Set(parseTargetUserIds(message.content, ''));
  const memberProfiles = collectionValues<MemberLike>(message.guild.members?.cache)
    .filter(member => !member.user?.bot && options.hasFamilyRole(member))
    .sort((left, right) => Number(requestedIds.has(right.id)) - Number(requestedIds.has(left.id)))
    .slice(0, 100)
    .map((member, index) => {
      const record = guildStorage.ensureMemberRecord(member.id);
      const weekly = stats.members?.[member.id] || { messages: 0, reactions: 0, voiceMinutes: 0 };
      const lastAt = Math.max(Number(record.lastSeenAt) || 0, Number(record.lastMessageAt) || 0, Number(record.lastVoiceAt) || 0);
      const inactiveDays = lastAt ? Math.max(0, Math.floor((Date.now() - lastAt) / (24 * 60 * 60 * 1000))) : -1;
      const roleNames = collectionValues<{ id: string; name?: string; position?: number }>(member.roles?.cache)
        .sort((left, right) => (Number(right.position) || 0) - (Number(left.position) || 0))
        .map(role => role.name || '')
        .filter(Boolean)
        .slice(0, 5);
      const publicName = member.displayName || member.user?.globalName || member.user?.username || member.id;
      return [
        requestedIds.has(member.id) ? `ЦЕЛЕВОЙ УЧАСТНИК (профиль ${index + 1})` : `Участник ${index + 1}`,
        `display name=${publicName}`,
        `username=${member.user?.username || 'не указан'}`,
        `Discord ID=${member.id}`,
        `роли=${roleNames.join('/') || 'нет'}`,
        `всего сообщений=${Number(record.messageCount) || 0}`,
        `всего голос=${Number(record.voiceMinutes) || 0} мин`,
        `7д сообщения=${weekly.messages || 0}`,
        `7д реакции=${weekly.reactions || 0}`,
        `7д голос=${weekly.voiceMinutes || 0} мин`,
        `баллы=${Number(record.points) || 0}`,
        `выговоры=${Number(record.warns) || 0}`,
        `похвалы=${Number(record.commends) || 0}`,
        `неактивность=${inactiveDays < 0 ? 'нет данных' : `${inactiveDays} дн.`}`
      ].join('; ');
    });
  return [
    'ФАКТИЧЕСКИЙ КОНТЕКСТ DISCORD-СЕРВЕРА:',
    `Сервер: ${message.guild.name || message.guild.id}; участников: ${message.guild.memberCount ?? 'неизвестно'}.`,
    `Активность за 7 дней: сообщения=${stats.messagesTotal || 0}, реакции=${stats.reactionsTotal || 0}, голос=${stats.voiceMinutesTotal || 0} минут, входы=${stats.joins || 0}, выходы=${stats.leaves || 0}.`,
    channels ? `Каналы и назначения: ${channels}.` : '',
    roles ? `Роли сверху вниз: ${roles}.` : '',
    rules ? `Актуальные правила из настроенного канала:\n${rules}` : '',
    memberProfiles.length ? `ПУБЛИЧНЫЕ DISCORD-ПРОФИЛИ И СТАТИСТИКА КАЖДОГО СЕМЕЙНОГО УЧАСТНИКА:\n${memberProfiles.join('\n')}` : '',
    'Не утверждай, что у тебя нет доступа к серверу. Используй этот контекст и встроенные функции бота. Не выдумывай отсутствующие данные.'
  ].filter(Boolean).join('\n').slice(0, 30000);
}

const conflictMarkers = [
  'идиот',
  'дурак',
  'тупой',
  'заткнись',
  'клоун',
  'оскорб',
  'ссора',
  'конфликт',
  'пошел',
  'пошёл'
];

function looksLikeConflict(value: string): boolean {
  const text = String(value || '').toLowerCase();
  if (text.length < 8) return false;
  const hits = conflictMarkers.filter(marker => text.includes(marker)).length;
  return hits >= 1 && /[!?]{2,}|[А-ЯA-Z]{8,}/u.test(String(value || ''));
}

async function handleAiSoftConflict(
  message: MessageLike,
  state: Map<string, number>,
  options: Pick<EventRuntimeOptions, 'aiMention'>
): Promise<void> {
  if (!message.guild || message.author?.bot || !options.aiMention.enabled) return;
  if (!looksLikeConflict(message.content)) return;

  const key = `${message.guild.id}:${message.channel.id}`;
  const cooldownMs = Math.max(60, Number(options.aiMention.cooldownSeconds) || 30) * 4 * 1000;
  const lastAt = state.get(key) || 0;
  if (Date.now() - lastAt < cooldownMs) return;
  state.set(key, Date.now());

  await message.channel.send?.({
    content: '🕊️ Давайте спокойнее и по фактам. Если есть спорная ситуация, лучше оформить её через тикет или позвать старший состав.',
    allowedMentions: { parse: [] }
  }).catch(() => null);
}

function looksLikeBotInsult(value: string): boolean {
  const text = String(value || '').toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  return [
    /сын\s+бля/iu,
    /бля[дт]/iu,
    /сука/u,
    /еблан/u,
    /долбо[её]б/u,
    /у[её]б/u,
    /пид[ао]р/u,
    /чмо/u,
    /тварь/u,
    /мраз/u,
    /иди\s+нах/u
  ].some(pattern => pattern.test(text));
}

async function isReplyToBot(message: MessageLike, botId: string): Promise<boolean> {
  const messageId = String(message.reference?.messageId || '').trim();
  if (!messageId || !message.channel.messages?.fetch) return false;
  const referenced = await message.channel.messages.fetch(messageId).catch(() => null);
  return String(referenced?.author?.id || '') === botId;
}

async function enforceBotInsultGuard(
  message: MessageLike,
  options: Pick<EventRuntimeOptions, 'client' | 'canBypassScamGuard'>
): Promise<boolean> {
  const botId = options.client.user?.id || '';
  if (!botId || !message.guild || !message.member || message.author.bot) return false;
  if (options.canBypassScamGuard(message.member)) return false;
  if (!looksLikeBotInsult(message.content)) return false;

  const targetsBot = botWasMentioned(message, botId) || await isReplyToBot(message, botId);
  if (!targetsBot) return false;

  const durationMs = 2 * 60 * 1000;
  const muted = await message.member.timeout?.(durationMs, 'Bot insult guard: insult directed at bot')
    .then(() => true)
    .catch(() => false) || false;

  await message.channel.send?.({
    content: muted
      ? `<@${message.author.id}>, за оскорбление бота выдан мут на 2 минуты.`
      : `<@${message.author.id}>, оскорбление бота замечено, но Discord не дал выдать мут. Проверь права и иерархию роли бота.`,
    allowedMentions: { parse: [], users: [message.author.id] }
  }).catch(() => null);
  return true;
}

function isAdminMember(member: MemberLike | null | undefined): boolean {
  return Boolean(member?.permissions?.has?.(PermissionFlagsBits.Administrator));
}

function parseMentionedUserId(content: string, botId: string): string {
  const matches = Array.from(String(content || '').matchAll(/<@!?(\d{16,20})>|\b(\d{16,20})\b/gu));
  for (const match of matches) {
    const id = match[1] || match[2] || '';
    if (id && id !== botId) return id;
  }
  return '';
}

type DiscordRuleMatch = {
  title: string;
  detail: string;
  defaultMuteMinutes: number;
};

type NaturalAnnouncementDraft = {
  type: 'announcement' | 'event';
  title: string;
  text: string;
};

const DISCORD_RULES: Array<{
  title: string;
  detail: string;
  defaultMuteMinutes: number;
  patterns: RegExp[];
}> = [
  {
    title: 'Уважение и недопустимость конфликтов',
    detail: 'упоминание родителей, оскорбления и разжигание конфликтов запрещены',
    defaultMuteMinutes: 120,
    patterns: [/родител/u, /мам[ауеы]?/u, /бат[яюи]?/u, /конфликт/u, /провокац/u]
  },
  {
    title: 'Оскорбления и нарушение уважения',
    detail: 'прямые и скрытые оскорбления участников запрещены',
    defaultMuteMinutes: 60,
    patterns: [/оскорб/u, /униж/u, /сарказм/u, /инсинуац/u]
  },
  {
    title: 'Запрет на распространение неподходящего контента',
    detail: 'эротический, порнографический, грубый, жестокий и экстремистский контент запрещён',
    defaultMuteMinutes: 1440,
    patterns: [/эрот/u, /порн/u, /nsfw/u, /жесток/u, /насил/u, /экстрем/u]
  },
  {
    title: 'Запрет на чрезмерный флуд',
    detail: 'чрезмерный флуд мешает общению и запрещён',
    defaultMuteMinutes: 30,
    patterns: [/флуд/u, /спам/u, /flood/u, /spam/u]
  },
  {
    title: 'Запрет на дискриминацию',
    detail: 'дискриминация по любому признаку запрещена',
    defaultMuteMinutes: 1440,
    patterns: [/дискрим/u, /расов/u, /национал/u, /религи/u, /инвалид/u, /гомофоб/u]
  },
  {
    title: 'Запрет на рекламу и сторонние ссылки',
    detail: 'реклама сторонних проектов, сайтов и Discord-каналов без одобрения запрещена',
    defaultMuteMinutes: 1440,
    patterns: [/реклам/u, /сторонн/u, /discord\.gg/u, /дискорд\.гг/u, /инвайт/u]
  },
  {
    title: 'Запрет на разглашение персональной информации',
    detail: 'слив личных данных без разрешения владельца запрещён',
    defaultMuteMinutes: 1440,
    patterns: [/персональн/u, /личн[а-я]* данн/u, /докс/u, /деанон/u, /слив/u]
  },
  {
    title: 'Запрет на угрозы и политические конфликты',
    detail: 'угрозы в реальной жизни и провокационные политические темы запрещены',
    defaultMuteMinutes: 1440,
    patterns: [/угроз/u, /полит/u, /войн/u, /реал/u]
  },
  {
    title: 'Запрет на ввод в заблуждение',
    detail: 'нельзя выдавать себя за модератора и вводить участников в заблуждение',
    defaultMuteMinutes: 720,
    patterns: [/модератор/u, /админ/u, /выда[её]т себя/u, /обман/u, /заблужден/u]
  }
];

function findDiscordRule(prompt: string): DiscordRuleMatch | null {
  const text = String(prompt || '').toLowerCase();
  const match = DISCORD_RULES.find(rule => rule.patterns.some(pattern => pattern.test(text)));
  return match ? { title: match.title, detail: match.detail, defaultMuteMinutes: match.defaultMuteMinutes } : null;
}

function buildDiscordRulesSummary(): string {
  return [
    '⚖️ Кратко по правилам Discord:',
    '',
    ...DISCORD_RULES.map((rule, index) => `${index + 1}. **${rule.title}** — ${rule.detail}. Наказание: мут от ${rule.defaultMuteMinutes >= 1440 ? `${Math.round(rule.defaultMuteMinutes / 1440)} дн.` : `${rule.defaultMuteMinutes} мин.`}, по решению администрации возможны кик/бан.`),
    '',
    'Решение по наказанию принимает администрация. Бот может выдать/снять мут только по команде администратора.'
  ].join('\n');
}

type RuleEnforcementMatch = {
  rule: DiscordRuleMatch;
  evidence: string;
  timeoutMinutes: number;
  action: 'timeout' | 'log';
};

const OBVIOUS_RULE_VIOLATIONS: Array<{
  ruleTitle: string;
  detail: string;
  timeoutMinutes: number;
  action: 'timeout' | 'log';
  patterns: RegExp[];
}> = [
  {
    ruleTitle: 'Уважение и недопустимость конфликтов',
    detail: 'оскорбления через родителей и разжигание конфликта',
    timeoutMinutes: 120,
    action: 'timeout',
    patterns: [
      /(?:мам[аеуы]|мать|родител[еяий]|бат[яю])\s+(?:еб|шлю|сдох|оскорб|хуй|лох|твар)/iu,
      /(?:сын|дочь)\s+(?:бля|шлю|хуй|твар)/iu
    ]
  },
  {
    ruleTitle: 'Оскорбления и нарушение уважения',
    detail: 'прямое грубое оскорбление участника',
    timeoutMinutes: 60,
    action: 'timeout',
    patterns: [
      /(?:^|\s)(?:у[её]бок|долбо[её]б|пид[ао]р|мразь|тварь|чмо|еблан)(?:\s|$)/iu
    ]
  },
  {
    ruleTitle: 'Запрет на разглашение персональной информации',
    detail: 'похоже на деанон или слив персональной информации',
    timeoutMinutes: 1440,
    action: 'log',
    patterns: [
      /(?:деанон|докс|dox|слив\s+(?:данных|адрес|телефон|пасп))/iu,
      /(?:адрес|телефон|паспорт)\s*[:=]\s*[\p{L}\p{N}\s+.-]{8,}/iu
    ]
  },
  {
    ruleTitle: 'Запрет на угрозы и политические конфликты',
    detail: 'похоже на угрозу в реальной жизни',
    timeoutMinutes: 1440,
    action: 'log',
    patterns: [
      /(?:найду\s+тебя|приеду\s+к\s+тебе|сломаю\s+(?:тебе|лицо)|убью\s+тебя)/iu
    ]
  }
];

function findObviousRuleViolation(content: string): RuleEnforcementMatch | null {
  const text = String(content || '').trim();
  if (!text || text.length > 1500) return null;
  for (const entry of OBVIOUS_RULE_VIOLATIONS) {
    const pattern = entry.patterns.find(candidate => candidate.test(text));
    if (!pattern) continue;
    return {
      rule: {
        title: entry.ruleTitle,
        detail: entry.detail,
        defaultMuteMinutes: entry.timeoutMinutes
      },
      evidence: safeLogExcerpt(text),
      timeoutMinutes: entry.timeoutMinutes,
      action: entry.action
    };
  }
  return null;
}

async function enforceDiscordRuleGuard(
  message: MessageLike,
  options: Pick<EventRuntimeOptions, 'canBypassScamGuard' | 'canBypassAutomod' | 'sendSecurityLog'>
): Promise<boolean> {
  if (!message.guild || message.author?.bot || !message.member) return false;
  if (options.canBypassScamGuard(message.member) || options.canBypassAutomod?.(message.member)) return false;

  const violation = findObviousRuleViolation(message.content);
  if (!violation) return false;

  let muted = false;
  let deleted = false;
  if (violation.action === 'timeout') {
    muted = await message.member.timeout?.(
      violation.timeoutMinutes * 60 * 1000,
      `Discord rules guard: ${violation.rule.title}`
    ).then(() => true).catch(() => false) || false;
    deleted = await message.delete().then(() => true).catch(() => false);
  }

  const logMessage = [
    '⚖️ Rule guard: обнаружено нарушение правил Discord',
    `Автор: <@${message.author.id}> (\`${message.author.id}\`)`,
    `Канал: <#${message.channel.id}> (\`${message.channel.id}\`)`,
    `Правило: ${violation.rule.title}`,
    `Причина: ${violation.rule.detail}`,
    `Действие: ${violation.action === 'timeout' ? (muted ? `мут ${violation.timeoutMinutes} мин.` : 'мут не выдан — проверь права бота') : 'только лог для ручной проверки'}`,
    `Удаление: ${deleted ? 'сообщение удалено' : violation.action === 'timeout' ? 'не удалено' : 'не требуется'}`,
    `Фрагмент: \`${violation.evidence}\``
  ].join('\n');
  await options.sendSecurityLog(message.guild, logMessage).catch(() => null);

  await message.channel.send?.({
    content: violation.action === 'timeout' && muted
      ? `<@${message.author.id}>, нарушение правила **${violation.rule.title}**. Выдан мут на ${violation.timeoutMinutes} мин.`
      : `<@${message.author.id}>, возможное нарушение правила **${violation.rule.title}** отправлено администрации на проверку.`,
    allowedMentions: { parse: [], users: [message.author.id] }
  }).catch(() => null);
  return violation.action === 'timeout';
}

function parseMentionedChannelId(content: string): string {
  const text = String(content || '');
  const mention = text.match(/<#(\d{16,20})>/u);
  if (mention?.[1]) return mention[1];
  const link = text.match(/discord(?:app)?\.com\/channels\/\d{16,20}\/(\d{16,20})/iu);
  if (link?.[1]) return link[1];
  const raw = text.match(/\b(\d{16,20})\b/u);
  return raw?.[1] || '';
}

function looksLikeRulesQuestion(prompt: string): boolean {
  const text = String(prompt || '').toLowerCase();
  const hasChannelMention = Boolean(parseMentionedChannelId(prompt));
  return (
    text.includes('правил')
    || text.includes('rules')
    || text.includes('наруш')
    || (hasChannelMention && (text.includes('тут') || text.includes('здесь') || text.length <= 80))
  );
}

function collectionValues<T = any>(value: any): T[] {
  if (!value) return [];
  if (typeof value.values === 'function') return Array.from(value.values());
  if (Array.isArray(value)) return value;
  return [];
}

function messageTextForRules(message: any): string {
  const embedText = Array.isArray(message?.embeds)
    ? message.embeds.flatMap((embed: any) => [
      embed?.title,
      embed?.description,
      ...(Array.isArray(embed?.fields) ? embed.fields.flatMap((field: any) => [field?.name, field?.value]) : [])
    ])
    : [];
  return [message?.content, ...embedText].filter(Boolean).join('\n').trim();
}

function saveBrainSettings(
  guildId: string,
  brain: ServerBrainSettings,
  options: Pick<EventRuntimeOptions, 'database'>
): void {
  options.database?.updateGuildSettings(guildId, { aiBrain: brain });
}

function recordBrainAction(
  guildId: string,
  current: unknown,
  entry: Parameters<typeof appendBrainAudit>[1],
  options: Pick<EventRuntimeOptions, 'database'>
): ServerBrainSettings {
  const next = appendBrainAudit(current, entry);
  saveBrainSettings(guildId, next, options);
  return next;
}

async function syncRulesChannelMemory(
  guild: GuildLike,
  channelId: string,
  actorId: string,
  options: Pick<EventRuntimeOptions, 'client' | 'database' | 'resolveGuildSettings'>
): Promise<{ changed: boolean; brain: ServerBrainSettings; error: string }> {
  if (!channelId) {
    return { changed: false, brain: normalizeServerBrainSettings(options.resolveGuildSettings(guild.id).aiBrain), error: 'Канал правил не назначен.' };
  }
  try {
    const channel = await options.client.channels?.fetch(channelId).catch(() => null);
    const snapshot = await readRulesSnapshot(channel);
    const settings = options.resolveGuildSettings(guild.id);
    const current = normalizeServerBrainSettings(settings.aiBrain);
    const changed = current.rules.hash !== snapshot.hash || current.rules.channelId !== snapshot.channelId;
    let next = withRulesSnapshot(current, snapshot);
    next = appendBrainAudit(next, {
      action: 'rules_sync',
      risk: 'read',
      status: 'completed',
      actorId,
      targetId: channelId,
      summary: changed ? 'Правила обновлены из Discord.' : 'Правила проверены, изменений нет.'
    });
    saveBrainSettings(guild.id, next, options);
    return { changed, brain: next, error: '' };
  } catch (error: any) {
    return {
      changed: false,
      brain: normalizeServerBrainSettings(options.resolveGuildSettings(guild.id).aiBrain),
      error: String(error?.message || error || 'Не удалось синхронизировать правила.')
    };
  }
}

async function readMentionedRulesChannel(
  prompt: string,
  client: EventRuntimeOptions['client'],
  fallbackChannelId = ''
): Promise<{ channelId: string; text: string; error: string }> {
  const channelId = parseMentionedChannelId(prompt) || String(fallbackChannelId || '').trim();
  if (!channelId) return { channelId: '', text: '', error: '' };
  try {
    const channel = await client.channels?.fetch(channelId).catch(() => null);
    if (!channel?.messages?.fetch) return { channelId, text: '', error: 'канал не найден или бот не может читать сообщения' };
    const messages = await channel.messages.fetch({ limit: 10 }).catch((error: any) => {
      throw error;
    });
    const text = collectionValues(messages)
      .map(messageTextForRules)
      .filter(Boolean)
      .join('\n\n')
      .slice(0, 6000);
    return { channelId, text, error: text ? '' : 'в последних сообщениях канала нет текста правил' };
  } catch (error: any) {
    return { channelId, text: '', error: String(error?.message || error || 'нет доступа к каналу') };
  }
}

async function handleRulesQuestion(
  message: MessageLike,
  prompt: string,
  options: Pick<EventRuntimeOptions, 'client' | 'aiService' | 'database' | 'resolveGuildSettings'>
): Promise<boolean> {
  if (!looksLikeRulesQuestion(prompt)) return false;

  const settings = message.guild?.id ? options.resolveGuildSettings(message.guild.id) : null;
  const rulesChannelId = settings?.channels?.rules || '';
  const channelContext = await readMentionedRulesChannel(prompt, options.client, rulesChannelId);
  if (message.guild && channelContext.channelId && channelContext.text) {
    await syncRulesChannelMemory(message.guild, channelContext.channelId, message.author.id, options).catch(() => null);
  }
  const rememberedRules = normalizeServerBrainSettings(settings?.aiBrain).rules;
  if (!channelContext.text && rememberedRules.text && rememberedRules.channelId === (channelContext.channelId || rulesChannelId)) {
    channelContext.text = rememberedRules.text;
    channelContext.channelId = rememberedRules.channelId;
    channelContext.error = '';
  }
  const fallback = buildDiscordRulesSummary();
  let answer = fallback;

  if (channelContext.text && options.aiService) {
    const systemPrompt = [
      'Ты помощник Discord-сервера. По тексту правил составь краткую понятную сводку.',
      'Обязательно укажи, что нельзя нарушать, и какие последствия возможны: предупреждение, мут, кик или бан по решению администрации.',
      'Не выдумывай правил, которых нет в тексте. Если в тексте есть токсичные исключения, не повторяй их как допустимые.',
      'Ответь на русском, структурой до 1800 символов.'
    ].join('\n');
    const userPrompt = [
      `Вопрос пользователя: ${prompt}`,
      '',
      `Текст из канала <#${channelContext.channelId}>:`,
      channelContext.text
    ].join('\n');
    const aiAnswer = await options.aiService.aiText(systemPrompt, userPrompt).catch(() => '');
    answer = String(aiAnswer || '').trim() || fallback;
  } else if (channelContext.error) {
    answer = [
      `Не смог прочитать <#${channelContext.channelId}>: ${channelContext.error}.`,
      '',
      fallback
    ].join('\n');
  }

  await message.channel.send?.({
    content: `<@${message.author.id}>\n${answer}`.slice(0, 1900),
    allowedMentions: { parse: [], users: [message.author.id] }
  }).catch(() => null);
  return true;
}

type ChannelPurpose = 'panel' | 'applications' | 'welcome' | 'rules' | 'logs' | 'disciplineLogs' | 'updates' | 'reports' | 'automod';

const CHANNEL_PURPOSES: Array<{
  key: ChannelPurpose;
  label: string;
  description: string;
  patterns: RegExp[];
}> = [
  {
    key: 'applications',
    label: 'заявки',
    description: 'канал подачи и просмотра заявок',
    patterns: [/заяв/u, /анкет/u, /при[её]м/u, /applications?/u]
  },
  {
    key: 'panel',
    label: 'панель семьи',
    description: 'главная панель состава, профиля и активности',
    patterns: [/панел/u, /состав/u, /главн/u, /family\s*panel/u]
  },
  {
    key: 'welcome',
    label: 'welcome',
    description: 'канал приветствий и ожидания подтверждения',
    patterns: [/welcome/u, /велком/u, /привет/u, /гост/u, /guests?/u]
  },
  {
    key: 'rules',
    label: 'правила',
    description: 'канал с актуальными правилами сервера',
    patterns: [/правил/u, /rules?/u]
  },
  {
    key: 'disciplineLogs',
    label: 'логи дисциплины',
    description: 'логи выговоров, баллов и дисциплинарных действий',
    patterns: [/дисцип/u, /выговор/u, /warn/u, /балл/u, /discipline/u]
  },
  {
    key: 'automod',
    label: 'логи automod',
    description: 'логи автомодерации, scam/anti-leak и фильтров',
    patterns: [/automod/u, /автомод/u, /скам/u, /scam/u, /anti[\s-]?leak/u, /слив/u]
  },
  {
    key: 'updates',
    label: 'обновления',
    description: 'карточки обновлений бота',
    patterns: [/обнов/u, /апдейт/u, /update/u, /release/u]
  },
  {
    key: 'reports',
    label: 'отчёты',
    description: 'канал отчётов и сводок',
    patterns: [/отч[её]т/u, /reports?/u]
  },
  {
    key: 'logs',
    label: 'общие логи',
    description: 'общие системные логи бота',
    patterns: [/лог/u, /logs?/u]
  }
];

function inferChannelPurpose(prompt: string): typeof CHANNEL_PURPOSES[number] | null {
  const text = String(prompt || '').toLowerCase();
  return CHANNEL_PURPOSES.find(purpose => purpose.patterns.some(pattern => pattern.test(text))) || null;
}

function looksLikeChannelSetupRequest(prompt: string): boolean {
  const text = String(prompt || '').toLowerCase();
  const targetsCurrentChannel = /(этот канал|текущий канал|здесь|сюда)/u.test(text);
  return (Boolean(parseMentionedChannelId(prompt)) || targetsCurrentChannel)
    && /(сделай|назначь|настрой|поставь|запиши|установи|используй|будет)/u.test(text)
    && /(канал|сюда|этот|здесь|для)/u.test(text)
    && Boolean(inferChannelPurpose(prompt));
}

function formatChannelName(channel: ChannelLike | null | undefined): string {
  if (!channel?.id) return 'не найден';
  return channel.name ? `#${channel.name} (${channel.id})` : channel.id;
}

function channelTypeLabel(type: unknown): string {
  if (type === ChannelType.GuildText) return 'текстовый';
  if (type === ChannelType.GuildAnnouncement) return 'новостной';
  if (type === ChannelType.GuildVoice) return 'голосовой';
  if (type === ChannelType.GuildCategory) return 'категория';
  if (type === ChannelType.GuildForum) return 'форум';
  return `тип ${String(type ?? 'unknown')}`;
}

function buildServerBrainSummary(guild: GuildLike, settings: WelcomeSettingsLike): string {
  const configured = CHANNEL_PURPOSES
    .map(purpose => {
      const channelId = settings.channels?.[purpose.key] || '';
      return channelId ? `• ${purpose.label}: <#${channelId}>` : `• ${purpose.label}: не настроен`;
    })
    .join('\n');
  const roles = collectionValues<{ id: string; name?: string; position?: number; managed?: boolean }>(guild.roles?.cache)
    .filter(role => role?.id)
    .sort((left, right) => (Number(right.position) || 0) - (Number(left.position) || 0))
    .slice(0, 20)
    .map((role, index) => `${index + 1}. ${role.name || role.id} (${role.id})`)
    .join('\n') || 'ролей в кеше нет';
  const channels = collectionValues<ChannelLike>(guild.channels?.cache)
    .filter(channel => channel?.id)
    .slice(0, 30)
    .map(channel => `• #${channel.name || channel.id} (${channel.id}) — ${channelTypeLabel(channel.type)}${channel.topic ? `, тема: ${String(channel.topic).slice(0, 80)}` : ''}`)
    .join('\n') || 'каналов в кеше нет';

  return [
    '🧠 Карта сервера для AI:',
    '',
    `Сервер: ${guild.name || guild.id}`,
    `Название семьи: ${settings.familyTitle || 'не задано'}`,
    '',
    'Настроенные назначения каналов:',
    configured,
    '',
    'Роли сверху вниз:',
    roles,
    '',
    'Каналы:',
    channels
  ].join('\n');
}

function formatMemberBrainLine(member: MemberLike | null | undefined): string {
  if (!member?.id) return '';
  const roleNames = collectionValues<{ id: string; name?: string; position?: number }>(member.roles?.cache)
    .filter(role => role?.id)
    .sort((left, right) => (Number(right.position) || 0) - (Number(left.position) || 0))
    .map(role => role.name || role.id);
  const isAdmin = isAdminMember(member);
  return [
    `Участник: <@${member.id}> (${member.id})`,
    `Администратор: ${isAdmin ? 'да' : 'нет'}`,
    `Роли: ${roleNames.length ? roleNames.join(', ') : 'нет ролей в кеше'}`
  ].join('\n');
}

function parseTargetUserIds(content: string, botId: string): string[] {
  return Array.from(String(content || '').matchAll(/<@!?(\d{16,20})>|\b(\d{16,20})\b/gu))
    .map(match => match[1] || match[2] || '')
    .filter(id => id && id !== botId);
}

function looksLikeServerBrainQuestion(prompt: string): boolean {
  const text = String(prompt || '').toLowerCase();
  return [
    'проанализируй сервер',
    'карта сервера',
    'что настроено',
    'какие каналы',
    'какие роли',
    'права участника',
    'доступы участника',
    'права у',
    'доступы у',
    'аудит прав',
    'проверь права',
    'проверь доступы',
    'безопасность ролей',
    'журнал ии',
    'журнал ai',
    'что делал бот'
  ].some(marker => text.includes(marker));
}

async function handleServerBrainQuestion(
  message: MessageLike,
  prompt: string,
  options: Pick<EventRuntimeOptions, 'client' | 'database' | 'resolveGuildSettings' | 'aiService'>
): Promise<boolean> {
  if (!message.guild || !looksLikeServerBrainQuestion(prompt)) return false;
  if (!isAdminMember(message.member)) {
    await message.channel.send?.({
      content: `<@${message.author.id}>, карта сервера и аудит прав доступны только участнику с правом Administrator.`,
      allowedMentions: { parse: [], users: [message.author.id] }
    }).catch(() => null);
    return true;
  }
  const currentSettings = options.resolveGuildSettings(message.guild.id);
  let brain = snapshotServerMap(message.guild, currentSettings, currentSettings.aiBrain);
  brain = appendBrainAudit(brain, {
    action: 'permissions_audit',
    risk: 'read',
    status: 'completed',
    actorId: message.author.id,
    targetId: message.guild.id,
    summary: 'Карта сервера и права проверены через AI-помощника.'
  });
  saveBrainSettings(message.guild.id, brain, options);
  const settings = { ...currentSettings, aiBrain: brain };
  const botId = options.client.user?.id || '';
  const targetIds = parseTargetUserIds(message.content, botId);
  const targetBlocks: string[] = [];
  for (const targetId of targetIds.slice(0, 3)) {
    const member = await message.guild.members.fetch(targetId).catch(() => null);
    const block = formatMemberBrainLine(member);
    if (block) targetBlocks.push(block);
  }

  const botMember = options.client.user?.id
    ? await message.guild.members.fetch(options.client.user.id).catch(() => null)
    : null;
  const permissionAudit = auditServerPermissions(message.guild, settings, botMember);
  const context = [
    buildServerBrainSummary(message.guild, settings),
    '',
    'Постоянная память:',
    formatBrainMemory(settings),
    '',
    'Аудит прав:',
    permissionAudit.summary,
    '',
    'Последние AI-действия:',
    formatBrainAudit(settings),
    targetBlocks.length ? `\nУчастники из запроса:\n${targetBlocks.join('\n\n')}` : ''
  ].join('\n').slice(0, 8000);

  let answer = [
    context,
    '',
    'Я могу менять безопасные назначения каналов через сообщение вида:',
    '<@бот> сделай <#канал> каналом заявок',
    '<@бот> назначь <#канал> каналом правил',
    '<@бот> сделай <#канал> каналом логов'
  ].join('\n');

  if (options.aiService) {
    const systemPrompt = [
      'Ты AI-мозг Discord-бота. По карте сервера кратко объясни, что настроено, что не настроено и что можно улучшить.',
      'Не раскрывай секреты. Не выдумывай каналов и ролей сверх данных. Ответ до 1800 символов.'
    ].join('\n');
    const aiAnswer = await options.aiService.aiText(systemPrompt, `${prompt}\n\n${context}`).catch(() => '');
    answer = String(aiAnswer || '').trim() || answer;
  }

  await message.channel.send?.({
    content: `<@${message.author.id}>\n${answer}`.slice(0, 1900),
    allowedMentions: { parse: [], users: [message.author.id] }
  }).catch(() => null);
  return true;
}

async function handleNaturalChannelSetup(
  message: MessageLike,
  prompt: string,
  options: Pick<EventRuntimeOptions, 'client' | 'database' | 'resolveGuildSettings' | 'doPanelUpdate'>
): Promise<boolean> {
  if (!message.guild || !looksLikeChannelSetupRequest(prompt)) return false;
  if (!isAdminMember(message.member)) {
    await message.channel.send?.({
      content: `<@${message.author.id}>, менять назначение каналов может только участник с правом Administrator.`,
      allowedMentions: { parse: [], users: [message.author.id] }
    }).catch(() => null);
    return true;
  }

  if (!options.database) {
    await message.channel.send?.({
      content: `<@${message.author.id}>, база настроек недоступна, поэтому я не могу сохранить канал.`,
      allowedMentions: { parse: [], users: [message.author.id] }
    }).catch(() => null);
    return true;
  }

  const purpose = inferChannelPurpose(prompt);
  const channelId = parseMentionedChannelId(prompt) || message.channel.id;
  const channel = channelId
    ? await options.client.channels?.fetch(channelId).catch(() => null)
    : null;

  if (!purpose || !channel?.id) {
    await message.channel.send?.({
      content: `<@${message.author.id}>, не понял канал или назначение. Пример: <@${options.client.user?.id || 'bot'}> сделай <#канал> каналом заявок.`,
      allowedMentions: { parse: [], users: [message.author.id] }
    }).catch(() => null);
    return true;
  }

  if (channel.guild?.id && channel.guild.id !== message.guild.id) {
    await message.channel.send?.({
      content: `<@${message.author.id}>, этот канал находится на другом сервере, я не буду смешивать настройки.`,
      allowedMentions: { parse: [], users: [message.author.id] }
    }).catch(() => null);
    return true;
  }

  const allowedChannelTypes = new Set([ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum]);
  if (!allowedChannelTypes.has(channel.type as any)) {
    await message.channel.send?.({
      content: `<@${message.author.id}>, ${formatChannelName(channel)} не похож на текстовый/новостной/форум-канал. Для ${purpose.label} нужен канал, куда бот сможет писать.`,
      allowedMentions: { parse: [], users: [message.author.id] }
    }).catch(() => null);
    return true;
  }

  const botMember = options.client.user?.id ? await message.guild.members.fetch(options.client.user.id).catch(() => null) : null;
  const canView = channel.permissionsFor?.(botMember || message.guild.id)?.has(PermissionFlagsBits.ViewChannel) !== false;
  const canSend = channel.permissionsFor?.(botMember || message.guild.id)?.has(PermissionFlagsBits.SendMessages) !== false;
  const canEmbed = channel.permissionsFor?.(botMember || message.guild.id)?.has(PermissionFlagsBits.EmbedLinks) !== false;
  if (!canView || !canSend) {
    await message.channel.send?.({
      content: `<@${message.author.id}>, я вижу запрос, но у меня нет доступа писать в ${formatChannelName(channel)}. Дай боту View Channel и Send Messages.`,
      allowedMentions: { parse: [], users: [message.author.id] }
    }).catch(() => null);
    return true;
  }

  const currentSettings = options.resolveGuildSettings(message.guild.id);
  let nextBrain = rememberChannelPurpose(currentSettings.aiBrain, channel, purpose.key, message.author.id);
  nextBrain = appendBrainAudit(nextBrain, {
    action: 'channel_assign',
    risk: riskForBrainAction('channel_assign'),
    status: 'completed',
    actorId: message.author.id,
    targetId: channel.id,
    summary: `Канал назначен как ${purpose.label}.`
  });
  options.database.updateGuildSettings(message.guild.id, {
    channels: { [purpose.key]: channel.id },
    aiBrain: nextBrain
  });
  if (purpose.key === 'rules') {
    await syncRulesChannelMemory(message.guild, channel.id, message.author.id, options).catch(() => null);
  }
  if (purpose.key === 'panel') {
    await options.doPanelUpdate(message.guild.id, true).catch(() => null);
  }
  const embedNote = canEmbed ? '' : '\n⚠️ Embed Links у бота в этом канале не видно, карточки могут отправляться обычным текстом.';
  await message.channel.send?.({
    content: [
      `✅ Готово: <#${channel.id}> теперь используется как **${purpose.label}**.`,
      `Назначение: ${purpose.description}.`,
      'Я сохранил это в настройках сервера, Railway env менять не нужно.',
      embedNote
    ].filter(Boolean).join('\n'),
    allowedMentions: { parse: [] }
  }).catch(() => null);
  return true;
}

function parseMuteDurationMs(prompt: string, fallbackMinutes = 60): number {
  const match = String(prompt || '').toLowerCase().match(/(\d{1,4})\s*(мин|минут|m|ч|час|часа|h)\b/u);
  if (!match) return Math.max(1, fallbackMinutes) * 60 * 1000;
  const value = Math.max(1, Number(match[1]) || 1);
  const unit = match[2];
  const minutes = unit.startsWith('ч') || unit === 'h' ? value * 60 : value;
  return Math.min(minutes, 28 * 24 * 60) * 60 * 1000;
}

function formatDurationRu(durationMs: number): string {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  if (minutes % 1440 === 0) return `${minutes / 1440} дн.`;
  if (minutes % 60 === 0) return `${minutes / 60} ч.`;
  return `${minutes} мин.`;
}

function parseNaturalModerationAction(prompt: string): 'ban' | 'kick' | 'mute' | 'unmute' | '' {
  const text = String(prompt || '').toLowerCase();
  if (/(^|\s)(размуть|размут|unmute)(\s|$)/u.test(text)) return 'unmute';
  if (/(сними|снять|убери|убрать)\s+(мут|timeout|таймаут|наказание)/u.test(text)) return 'unmute';
  if (/(^|\s)(забань|бан|ban)(\s|$)/u.test(text)) return 'ban';
  if (/(^|\s)(кикни|кик|kick)(\s|$)/u.test(text)) return 'kick';
  if (/(^|\s)(замуть|мут|mute|timeout|накажи|наказание)(\s|$)/u.test(text)) return 'mute';
  if (/(нарушил|нарушение|получил мут|выдай мут)/u.test(text) && findDiscordRule(text)) return 'mute';
  return '';
}

function looksLikeAnnouncementRequest(prompt: string): boolean {
  const text = String(prompt || '').toLowerCase();
  return (
    (text.includes('оповещ') || text.includes('объяв') || text.includes('анонс') || text.includes('собрани'))
    && !parseNaturalModerationAction(text)
  );
}

function cleanNaturalAnnouncementText(prompt: string): string {
  return String(prompt || '')
    .replace(/^(сделай|создай|отправь|напиши)\s+/iu, '')
    .replace(/^(оповещение|объявление|анонс)\s+/iu, '')
    .trim()
    .slice(0, 2500);
}

function inferAnnouncementType(prompt: string): 'announcement' | 'event' {
  const text = String(prompt || '').toLowerCase();
  return text.includes('собрани') || text.includes('ивент') || text.includes('мероприят') || text.includes('event')
    ? 'event'
    : 'announcement';
}

function extractTimeHint(prompt: string): string {
  const text = String(prompt || '').toLowerCase();
  const timeMatch = text.match(/(?:в\s*)?(\d{1,2})(?::(\d{2}))?\s*(вечера|утра)?/u);
  if (!timeMatch) return text.includes('завтра') ? 'завтра' : '';
  let hour = Math.max(0, Math.min(23, Number(timeMatch[1]) || 0));
  const minute = timeMatch[2] || '00';
  const dayPart = timeMatch[3] || '';
  if (dayPart === 'вечера' && hour < 12) hour += 12;
  const formatted = `${String(hour).padStart(2, '0')}:${minute}`;
  return text.includes('завтра') ? `завтра в ${formatted}` : `в ${formatted}`;
}

function cleanupAnnouncementRequest(prompt: string): string {
  return cleanNaturalAnnouncementText(prompt)
    .replace(/\b(красивое|красиво|красивый|аккуратное|сам|сама|придумай|оформи|иконку|значок)\b/giu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function buildLocalNaturalAnnouncementDraft(prompt: string): NaturalAnnouncementDraft {
  const type = inferAnnouncementType(prompt);
  const cleaned = cleanupAnnouncementRequest(prompt);
  const timeHint = extractTimeHint(prompt);
  if (type === 'event' && String(prompt || '').toLowerCase().includes('собрани')) {
    const when = timeHint || 'в назначенное время';
    return {
      type,
      title: '📅 Семейное собрание',
      text: [
        `Семейное собрание состоится ${when}.`,
        '',
        'Просьба всем участникам быть на месте заранее и не опаздывать.',
        'Если не сможете присутствовать, предупредите старший состав.'
      ].join('\n')
    };
  }

  return {
    type,
    title: type === 'event' ? '📅 Семейное событие' : '📢 Семейное объявление',
    text: cleaned || 'Следите за новостями и не пропускайте важные обновления.'
  };
}

function parseAnnouncementDraftJson(value: string): NaturalAnnouncementDraft | null {
  const raw = String(value || '').trim()
    .replace(/^```json\s*/iu, '')
    .replace(/^```\s*/iu, '')
    .replace(/```$/u, '')
    .trim();
  const match = raw.match(/\{[\s\S]*\}/u);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    const type = parsed?.type === 'event' ? 'event' : 'announcement';
    const title = String(parsed?.title || '').trim().slice(0, 90);
    const text = String(parsed?.text || '').trim().slice(0, 2200);
    if (!title || !text) return null;
    return { type, title, text };
  } catch {
    return null;
  }
}

async function buildNaturalAnnouncementDraft(
  prompt: string,
  aiService?: EventRuntimeOptions['aiService']
): Promise<NaturalAnnouncementDraft> {
  const fallback = buildLocalNaturalAnnouncementDraft(prompt);
  if (!aiService) return fallback;

  const systemPrompt = [
    'Ты оформляешь объявление для Discord и Telegram семьи KLAIZ.',
    'Верни строго JSON без markdown-блока: {"type":"announcement|event","title":"emoji + короткий заголовок","text":"готовый текст"}.',
    'Если про собрание, type должен быть event. Если пользователь просит красиво, сам выбери уместную emoji-иконку и сделай текст аккуратным.',
    'Не добавляй Источник, Автор, Дата, @everyone, @here и лишние технические поля.',
    'Пиши на русском, коротко, понятно и без токсичности.'
  ].join('\n');

  const aiResult = await aiService.aiText(systemPrompt, prompt).catch(() => '');
  return parseAnnouncementDraftJson(aiResult) || fallback;
}

function parseBrainConfirmationCode(prompt: string): string {
  const match = String(prompt || '').toUpperCase().match(/(?:ПОДТВЕРЖДАЮ|ПОДТВЕРДИ|CONFIRM)\s+([A-Z0-9]{6})/u);
  return match?.[1] || '';
}

function createBrainConfirmationCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, 'X');
}

async function executePendingBrainAction(
  message: MessageLike,
  prompt: string,
  pendingActions: Map<string, PendingBrainAction>,
  options: Pick<EventRuntimeOptions, 'database' | 'resolveGuildSettings' | 'sendSecurityLog'>
): Promise<boolean> {
  const code = parseBrainConfirmationCode(prompt);
  if (!code || !message.guild) return false;
  const pending = pendingActions.get(code);
  if (!pending || pending.guildId !== message.guild.id || pending.actorId !== message.author.id || pending.expiresAt < Date.now()) {
    pendingActions.delete(code);
    await message.channel.send?.({
      content: `<@${message.author.id}>, подтверждение не найдено или истекло. Повтори исходную команду.`,
      allowedMentions: { parse: [], users: [message.author.id] }
    }).catch(() => null);
    return true;
  }

  pendingActions.delete(code);
  const targetMember = await message.guild.members.fetch(pending.targetId).catch(() => null);
  let ok = false;
  if (targetMember) {
    ok = pending.action === 'ban'
      ? await targetMember.ban?.({ reason: pending.reason }).then(() => true).catch(() => false) || false
      : await targetMember.kick?.(pending.reason).then(() => true).catch(() => false) || false;
  }
  const settings = options.resolveGuildSettings(message.guild.id);
  recordBrainAction(message.guild.id, settings.aiBrain, {
    action: pending.action,
    risk: pending.risk,
    status: ok ? 'completed' : 'failed',
    actorId: message.author.id,
    targetId: pending.targetId,
    summary: pending.summary
  }, options);
  const logText = `AI action ${pending.action}: actor=${message.author.id}, target=${pending.targetId}, risk=${pending.risk}, status=${ok ? 'completed' : 'failed'}`;
  await options.sendSecurityLog(message.guild, logText).catch(() => null);
  await message.channel.send?.({
    content: ok
      ? `✅ Подтверждено и выполнено: <@${pending.targetId}> ${pending.action === 'ban' ? 'забанен' : 'кикнут'}.\nРиск: **${pending.risk}**. Запись добавлена в журнал AI-действий.`
      : `❌ Действие подтверждено, но Discord его не выполнил. Проверь права бота, иерархию ролей и доступность участника.`,
    allowedMentions: { parse: [], users: [message.author.id, pending.targetId] }
  }).catch(() => null);
  return true;
}

async function handleNaturalAdminCommand(
  message: MessageLike,
  prompt: string,
  options: Pick<EventRuntimeOptions, 'client' | 'aiService' | 'announcementService' | 'familyAnnouncementRoleId' | 'database' | 'resolveGuildSettings' | 'doPanelUpdate' | 'sendSecurityLog'>,
  pendingActions: Map<string, PendingBrainAction>
): Promise<boolean> {
  if (await executePendingBrainAction(message, prompt, pendingActions, options)) {
    return true;
  }
  if (await handleNaturalChannelSetup(message, prompt, options)) {
    return true;
  }
  if (!message.guild) return false;

  const botId = options.client.user?.id || '';
  const action = parseNaturalModerationAction(prompt);
  const wantsAnnouncement = looksLikeAnnouncementRequest(prompt);
  if (!action && !wantsAnnouncement) return false;

  if (!isAdminMember(message.member)) {
    await message.channel.send?.({
      content: `<@${message.author.id}>, эту AI-команду может выполнять только участник с правом Administrator.`,
      allowedMentions: { parse: [], users: [message.author.id] }
    }).catch(() => null);
    return true;
  }

  if (action) {
    const targetId = parseMentionedUserId(message.content, botId);
    if (!targetId) {
      await message.channel.send?.({
        content: `<@${message.author.id}>, укажи участника: например, <@${botId}> замуть @user 60 мин. или <@${botId}> размуть @user.`,
        allowedMentions: { parse: [], users: [message.author.id] }
      }).catch(() => null);
      return true;
    }

    const targetMember = await message.guild?.members.fetch(targetId).catch(() => null);
    if (!targetMember) {
      await message.channel.send?.({
        content: `<@${message.author.id}>, участник <@${targetId}> не найден на сервере.`,
        allowedMentions: { parse: [], users: [message.author.id, targetId] }
      }).catch(() => null);
      return true;
    }

    if (targetId === options.client.user?.id || targetId === message.guild?.ownerId) {
      await message.channel.send?.({
        content: `<@${message.author.id}>, это защищённая цель. AI-центр не применяет наказания к владельцу сервера или самому боту.`,
        allowedMentions: { parse: [], users: [message.author.id] }
      }).catch(() => null);
      return true;
    }

    const rule = findDiscordRule(prompt);
    const durationMs = parseMuteDurationMs(prompt, rule?.defaultMuteMinutes || 60);
    const reason = rule
      ? `Discord rule: ${rule.title}; moderator: ${message.author.id}`
      : `Natural AI moderation by ${message.author.id}`;
    const risk = riskForBrainAction(action);
    if ((action === 'ban' || action === 'kick') && isAdminMember(targetMember) && message.author.id !== message.guild?.ownerId) {
      await message.channel.send?.({
        content: `<@${message.author.id}>, я не буду применять **${action}** к другому администратору. Такое действие может подтвердить только владелец сервера.`,
        allowedMentions: { parse: [], users: [message.author.id, targetId] }
      }).catch(() => null);
      return true;
    }
    if (action === 'ban' || action === 'kick') {
      const code = createBrainConfirmationCode();
      const summary = `${action === 'ban' ? 'Бан' : 'Кик'} участника ${targetId}: ${rule?.title || 'причина из команды администратора'}`;
      pendingActions.set(code, {
        code,
        guildId: message.guild.id,
        actorId: message.author.id,
        action,
        targetId,
        reason,
        summary,
        risk,
        expiresAt: Date.now() + 2 * 60 * 1000
      });
      const settings = options.resolveGuildSettings(message.guild.id);
      recordBrainAction(message.guild.id, settings.aiBrain, {
        action,
        risk,
        status: 'planned',
        actorId: message.author.id,
        targetId,
        summary
      }, options);
      await message.channel.send?.({
        content: [
          `⚠️ **AI-центр подготовил действие**`,
          `Действие: ${action === 'ban' ? 'бан' : 'кик'} <@${targetId}>`,
          `Риск: **${risk}**`,
          `Причина: ${rule?.title || 'указана администратором'}`,
          '',
          `Для выполнения в течение 2 минут напиши: <@${options.client.user?.id || 'bot'}> подтверждаю ${code}`
        ].join('\n'),
        allowedMentions: { parse: [], users: [message.author.id, targetId] }
      }).catch(() => null);
      return true;
    }
    let ok = false;
    if (action === 'unmute') {
      ok = await targetMember.timeout?.(null, reason).then(() => true).catch(() => false) || false;
    } else {
      ok = await targetMember.timeout?.(durationMs, reason).then(() => true).catch(() => false) || false;
    }

    const actionLabel = action === 'unmute'
      ? 'размучен'
      : `получил мут на ${formatDurationRu(durationMs)}`;
    const settings = options.resolveGuildSettings(message.guild.id);
    recordBrainAction(message.guild.id, settings.aiBrain, {
      action,
      risk,
      status: ok ? 'completed' : 'failed',
      actorId: message.author.id,
      targetId,
      summary: `${actionLabel}${rule ? `: ${rule.title}` : ''}`
    }, options);
    await options.sendSecurityLog(
      message.guild,
      `AI action ${action}: actor=${message.author.id}, target=${targetId}, risk=${risk}, status=${ok ? 'completed' : 'failed'}`
    ).catch(() => null);
    const ruleLine = rule ? `\n⚖️ Правило: ${rule.title}\nПричина: ${rule.detail}` : '';
    await message.channel.send?.({
      content: ok
        ? `✅ <@${targetId}> ${actionLabel}.${ruleLine}\nМодератор: <@${message.author.id}>.\nРиск: **${risk}**. Действие записано в AI-журнал.`
        : `❌ Не удалось выполнить действие для <@${targetId}>. Проверь права и иерархию роли бота.`,
      allowedMentions: { parse: [], users: [message.author.id, targetId] }
    }).catch(() => null);
    return true;
  }

  if (!options.announcementService) {
    await message.channel.send?.({
      content: `<@${message.author.id}>, модуль объявлений сейчас не настроен.`,
      allowedMentions: { parse: [], users: [message.author.id] }
    }).catch(() => null);
    return true;
  }

  const requestText = cleanNaturalAnnouncementText(prompt);
  if (!requestText) {
    await message.channel.send?.({
      content: `<@${message.author.id}>, напиши текст оповещения. Например: собрание сегодня в 20:00, быть всем.`,
      allowedMentions: { parse: [], users: [message.author.id] }
    }).catch(() => null);
    return true;
  }

  const draft = await buildNaturalAnnouncementDraft(prompt, options.aiService);
  const result = await options.announcementService.sendTelegramFromDiscord({
    guildId: message.guild?.id,
    type: draft.type,
    title: draft.title,
    text: draft.text,
    authorId: message.author.id,
    authorName: message.author.globalName || message.author.username || message.author.id,
    fallbackDiscordChannelId: message.channel.id,
    pingRoleId: String(options.familyAnnouncementRoleId || '').trim()
  });

  if (message.guild) {
    const settings = options.resolveGuildSettings(message.guild.id);
    const actionName = draft.type === 'event' ? 'event' : 'announce';
    const risk = riskForBrainAction(actionName);
    recordBrainAction(message.guild.id, settings.aiBrain, {
      action: actionName,
      risk,
      status: result.ok ? 'completed' : 'failed',
      actorId: message.author.id,
      targetId: settings.channels?.updates || message.channel.id,
      summary: `${draft.title}: ${draft.text}`.slice(0, 500)
    }, options);
    await options.sendSecurityLog(
      message.guild,
      `AI action ${actionName}: actor=${message.author.id}, risk=${risk}, status=${result.ok ? 'completed' : 'failed'}`
    ).catch(() => null);
  }

  await message.channel.send?.({
    content: result.ok
      ? `✅ Оповещение отправлено в канал новостей и продублировано в Telegram.\nРиск: **medium**. Действие записано в AI-журнал.`
      : `❌ Не удалось отправить оповещение. Проверь канал новостей и Telegram-настройки.`,
    allowedMentions: { parse: [] }
  }).catch(() => null);
  return true;
}

async function handleAiMentionMessage(
  message: MessageLike,
  state: Map<string, number>,
  options: Pick<EventRuntimeOptions, 'client' | 'aiMention' | 'aiService' | 'announcementService' | 'familyAnnouncementRoleId' | 'database' | 'resolveGuildSettings' | 'doPanelUpdate' | 'sendSecurityLog' | 'getGuildStorage' | 'hasFamilyRole'>,
  pendingActions: Map<string, PendingBrainAction>
): Promise<boolean> {
  const botId = options.client.user?.id || '';
  if (!message.guild || message.author?.bot || !botWasMentioned(message, botId)) return false;

  if (!options.aiMention.enabled || !options.aiService) {
    await message.channel.send?.({
      content: `<@${message.author.id}>, AI-помощник сейчас выключен.`,
      allowedMentions: { parse: [], users: [message.author.id] }
    }).catch(() => null);
    return true;
  }

  const prompt = stripBotMention(message.content, botId);
  if (!prompt) {
    await message.channel.send?.({
      content: `<@${message.author.id}>, напиши вопрос после упоминания. Например: <@${botId}> сделай короткое объявление о собрании в 20:00.`,
      allowedMentions: { parse: [], users: [message.author.id] }
    }).catch(() => null);
    return true;
  }

  if (await handleNaturalAdminCommand(message, prompt, options, pendingActions)) {
    return true;
  }

  if (await handleInactiveMembersRequest(message, prompt, options)) {
    return true;
  }

  if (await handleLiveActivityQuestion(message, prompt, options)) {
    return true;
  }

  if (await handleRulesQuestion(message, prompt, options)) {
    return true;
  }

  if (await handleServerBrainQuestion(message, prompt, options)) {
    return true;
  }

  if (isCapabilityQuestion(prompt)) {
    await message.channel.send?.({
      content: `<@${message.author.id}>\n${buildMentionCapabilitiesText()}`.slice(0, 1800),
      allowedMentions: { parse: [], users: [message.author.id] }
    }).catch(() => null);
    return true;
  }

  const maxChars = Math.max(50, Number(options.aiMention.maxChars) || 700);
  if (prompt.length > maxChars) {
    await message.channel.send?.({
      content: `<@${message.author.id}>, вопрос слишком длинный: ${prompt.length}/${maxChars}. Сократи его и попробуй ещё раз.`,
      allowedMentions: { parse: [], users: [message.author.id] }
    }).catch(() => null);
    return true;
  }

  const cooldownMs = Math.max(3, Number(options.aiMention.cooldownSeconds) || 30) * 1000;
  const cooldownKey = `${message.guild.id}:${message.author.id}`;
  const lastAt = state.get(cooldownKey) || 0;
  const waitMs = cooldownMs - (Date.now() - lastAt);
  if (waitMs > 0) {
    await message.channel.send?.({
      content: `<@${message.author.id}>, подожди ещё ${Math.ceil(waitMs / 1000)} сек. перед следующим AI-вопросом.`,
      allowedMentions: { parse: [], users: [message.author.id] }
    }).catch(() => null);
    return true;
  }

  state.set(cooldownKey, Date.now());
  await message.channel.sendTyping?.().catch(() => null);

  try {
    const liveContext = buildAggregateServerContext(message, options);
    const answer = await options.aiService.aiText(`${buildMentionSystemPrompt()}\n\n${liveContext}`, prompt);
    await message.channel.send?.({
      content: `<@${message.author.id}> ${String(answer || 'Не смог придумать ответ. Попробуй переформулировать.').slice(0, 1800)}`,
      allowedMentions: { parse: [], users: [message.author.id] }
    }).catch(() => null);
  } catch (error: any) {
    await message.channel.send?.({
      content: `<@${message.author.id}>, AI сейчас не ответил: ${String(error?.message || 'неизвестная ошибка').slice(0, 300)}`,
      allowedMentions: { parse: [], users: [message.author.id] }
    }).catch(() => null);
  }

  return true;
}

export function registerEventRuntime(options: EventRuntimeOptions): void {
  const {
    client,
    aiMention,
    aiService,
    announcementService,
    familyAnnouncementRoleId,
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
    canBypassAutomod,
    handleAutomodMessage,
    handleCustomTriggerMessage,
    sendSecurityLog,
    notifyTelegramScamBlocked,
    notifyTelegramSecurityAlert,
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
    handleAfkMessage,
    handleVoiceRoomsVoiceStateUpdate
  } = options;
  const welcomeInviteBatches = new Map<string, WelcomeInviteBatch>();
  const aiMentionCooldowns = new Map<string, number>();
  const aiConflictCooldowns = new Map<string, number>();
  const pendingAiActions = new Map<string, PendingBrainAction>();
  const rulesSyncTimers = new Map<string, NodeJS.Timeout>();

  function scheduleBrainSnapshot(guild: GuildLike, delayMs = 1000): void {
    setTimeout(() => {
      const settings = resolveGuildSettings(guild.id);
      const brain = snapshotServerMap(guild, settings, settings.aiBrain);
      saveBrainSettings(guild.id, brain, options);
    }, delayMs);
  }

  function scheduleRulesMemorySync(guild: GuildLike, channelId: string, actorId = 'system'): void {
    const settings = resolveGuildSettings(guild.id);
    if (!channelId || settings.channels?.rules !== channelId) return;
    const key = `${guild.id}:${channelId}`;
    const current = rulesSyncTimers.get(key);
    if (current) clearTimeout(current);
    rulesSyncTimers.set(key, setTimeout(() => {
      rulesSyncTimers.delete(key);
      void syncRulesChannelMemory(guild, channelId, actorId, options).catch(() => null);
    }, 1000));
  }

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
    'messageDelete',
    'presenceUpdate',
    'voiceStateUpdate',
    'guildMemberAdd',
    'guildMemberRemove',
    'messageReactionAdd',
    'messageReactionRemove',
    'guildMemberUpdate',
    'channelCreate',
    'channelUpdate',
    'channelDelete',
    'roleCreate',
    'roleUpdate',
    'roleDelete',
    'webhooksUpdate'
  ];

  for (const eventName of managedEvents) {
    client.removeAllListeners(eventName);
  }

  client.on('clientReady', () => {
    for (const guild of collectionValues<GuildLike>(client.guilds?.cache)) {
      scheduleBrainSnapshot(guild, 1500);
      const rulesChannelId = resolveGuildSettings(guild.id).channels?.rules || '';
      if (rulesChannelId) scheduleRulesMemorySync(guild, rulesChannelId, 'startup');
    }
  });

  client.on('messageCreate', async (message: MessageLike) => {
    if (!message.guild) return;
    scheduleRulesMemorySync(message.guild, message.channel.id, message.author?.id || 'system');
    if (message.author.bot && !message.webhookId) return;
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

    if (await enforceBotInsultGuard(message, {
      client,
      canBypassScamGuard
    })) {
      return;
    }

    if (await enforceDiscordRuleGuard(message, {
      canBypassScamGuard,
      canBypassAutomod,
      sendSecurityLog
    })) {
      return;
    }

    await handleAiSoftConflict(message, aiConflictCooldowns, { aiMention }).catch(() => null);

    if (await handleAiMentionMessage(message, aiMentionCooldowns, {
      client,
      aiMention,
      aiService,
      announcementService,
      familyAnnouncementRoleId,
      database: options.database,
      resolveGuildSettings,
      doPanelUpdate,
      sendSecurityLog,
      getGuildStorage,
      hasFamilyRole
    }, pendingAiActions)) {
      return;
    }

    if (!hasFamilyRole(message.member)) return;
    guildStorage.recordMessage(message.member.id);
  });

  client.on('messageUpdate', async (_oldMessage: MessageLike, nextMessage: MessageLike) => {
    let message = nextMessage;
    if (message.partial && typeof message.fetch === 'function') {
      message = await message.fetch().catch(() => message);
    }
    if (!message.guild) return;
    scheduleRulesMemorySync(message.guild, message.channel.id, message.author?.id || 'system');
    if (message.author.bot && !message.webhookId) return;
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

  client.on('messageDelete', (message: MessageLike) => {
    if (!message.guild) return;
    scheduleRulesMemorySync(message.guild, message.channel.id, message.author?.id || 'system');
  });

  client.on('presenceUpdate', (_oldPresence: PresenceLike | null, presence: PresenceLike | null) => {
    const member = presence?.member;
    if (!member || !hasFamilyRole(member)) return;
    getGuildStorage(member.guild.id).recordPresence(member.id);
  });

  client.on('voiceStateUpdate', (oldState: VoiceStateLike, newState: VoiceStateLike) => {
    const member = newState.member || oldState.member;
    if (!member || member.user?.bot) return;

    if (handleVoiceRoomsVoiceStateUpdate) {
      void handleVoiceRoomsVoiceStateUpdate(oldState, newState).catch(error => {
        console.warn('Voice Rooms handler failed:', error);
      });
    }

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

  client.on('channelCreate', async (channel: ChannelLike) => {
    if (channel.guild) scheduleBrainSnapshot(channel.guild);
    await applyActiveLockdownToNewChannel(channel, {
      sendSecurityLog,
      notifyTelegramSecurityAlert
    }).catch(error => {
      console.error('Ошибка применения lockdown к новому каналу:', error);
    });
  });

  client.on('channelUpdate', (_oldChannel: ChannelLike, newChannel: ChannelLike) => {
    if (newChannel.guild) scheduleBrainSnapshot(newChannel.guild);
  });

  client.on('channelDelete', async (channel: ChannelDeleteLike) => {
    if (channel?.guild) scheduleBrainSnapshot(channel.guild);
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

  client.on('roleCreate', async (role: RoleEventLike) => {
    if (role.guild) scheduleBrainSnapshot(role.guild);
    await handleDangerousRoleCreate(role, {
      isPremiumGuild,
      isModuleEnabled,
      canBypassChannelGuard,
      sendSecurityLog,
      notifyTelegramSecurityAlert
    }).catch(error => {
      console.error('Ошибка защиты ролей:', error);
    });
  });

  client.on('roleUpdate', async (oldRole: RoleEventLike, newRole: RoleEventLike) => {
    if (newRole.guild) scheduleBrainSnapshot(newRole.guild);
    await handleDangerousRoleUpdate(oldRole, newRole, {
      isPremiumGuild,
      isModuleEnabled,
      canBypassChannelGuard,
      sendSecurityLog,
      notifyTelegramSecurityAlert
    }).catch(error => {
      console.error('Ошибка защиты ролей:', error);
    });
  });

  client.on('roleDelete', (role: RoleEventLike) => {
    if (role.guild) scheduleBrainSnapshot(role.guild);
  });

  client.on('webhooksUpdate', async (channel: ChannelLike) => {
    await handleWebhookUpdate(channel, {
      isPremiumGuild,
      isModuleEnabled,
      canBypassChannelGuard,
      sendSecurityLog,
      notifyTelegramSecurityAlert
    }).catch(error => {
      console.error('Ошибка защиты webhook:', error);
    });
  });
}
