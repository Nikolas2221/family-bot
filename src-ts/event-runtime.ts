import { AuditLogEvent, ChannelType, PermissionFlagsBits } from 'discord.js';
import { getActiveLockdown } from './services/security-lockdown';
import { getUnsafeAssignableRoleReasonAsync } from './role-safety';

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
  permissions?: {
    has(permission: unknown): boolean;
  } | null;
  roles: {
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
  members: {
    cache: {
      get(id: string): MemberLike | undefined;
    };
    fetch(id: string): Promise<MemberLike | null>;
  };
  roles: {
    everyone?: RoleLike;
    cache: {
      get(id: string): RoleLike | undefined;
    };
    fetch(id: string): Promise<RoleLike | null>;
  };
  fetchAuditLogs?(options: Record<string, unknown>): Promise<any>;
}

interface ChannelLike {
  id: string;
  name?: string;
  type?: number;
  archived?: boolean;
  guild?: GuildLike | null;
  send?(payload: Record<string, unknown>): Promise<NoticeLike | null>;
  sendTyping?(): Promise<unknown>;
  fetchWebhooks?(): Promise<any>;
  messages?: {
    fetch(options?: Record<string, unknown>): Promise<any>;
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
}

interface WelcomeSettingsLike {
  verification: {
    enabled: boolean;
  };
}

interface EventRuntimeOptions {
  client: {
    user?: UserLike | null;
    channels?: {
      fetch(channelId: string): Promise<ChannelLike | null>;
    };
    removeAllListeners(event: string): unknown;
    on(event: string, listener: (...args: any[]) => unknown): unknown;
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
    '• делать шаблоны объявлений и событий;',
    '• защищать сервер от scam/gift ссылок, invite-слива и опасных действий;',
    '• создавать backup структуры Discord в GitHub;',
    '• вести тикеты, AFK-отпуска, отчёты, медиа и Voice Room.',
    '',
    'Полный список доступен командой /capabilities.'
  ].join('\n');
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

function parseMentionedChannelId(content: string): string {
  const match = String(content || '').match(/<#(\d{16,20})>/u);
  return match?.[1] || '';
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

async function readMentionedRulesChannel(
  prompt: string,
  client: EventRuntimeOptions['client']
): Promise<{ channelId: string; text: string; error: string }> {
  const channelId = parseMentionedChannelId(prompt);
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
  options: Pick<EventRuntimeOptions, 'client' | 'aiService'>
): Promise<boolean> {
  if (!looksLikeRulesQuestion(prompt)) return false;

  const channelContext = await readMentionedRulesChannel(prompt, options.client);
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

async function handleNaturalAdminCommand(
  message: MessageLike,
  prompt: string,
  options: Pick<EventRuntimeOptions, 'client' | 'aiService' | 'announcementService' | 'familyAnnouncementRoleId'>
): Promise<boolean> {
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

    const rule = findDiscordRule(prompt);
    const durationMs = parseMuteDurationMs(prompt, rule?.defaultMuteMinutes || 60);
    const reason = rule
      ? `Discord rule: ${rule.title}; moderator: ${message.author.id}`
      : `Natural AI moderation by ${message.author.id}`;
    let ok = false;
    if (action === 'ban') {
      ok = await targetMember.ban?.({ reason }).then(() => true).catch(() => false) || false;
    } else if (action === 'kick') {
      ok = await targetMember.kick?.(reason).then(() => true).catch(() => false) || false;
    } else if (action === 'unmute') {
      ok = await targetMember.timeout?.(null, reason).then(() => true).catch(() => false) || false;
    } else {
      ok = await targetMember.timeout?.(durationMs, reason).then(() => true).catch(() => false) || false;
    }

    const actionLabel = action === 'ban'
      ? 'забанен'
      : action === 'kick'
        ? 'кикнут'
        : action === 'unmute'
          ? 'размучен'
          : `получил мут на ${formatDurationRu(durationMs)}`;
    const ruleLine = rule ? `\n⚖️ Правило: ${rule.title}\nПричина: ${rule.detail}` : '';
    await message.channel.send?.({
      content: ok
        ? `✅ <@${targetId}> ${actionLabel}.${ruleLine}\nМодератор: <@${message.author.id}>.`
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

  await message.channel.send?.({
    content: result.ok
      ? `✅ Оповещение отправлено в канал новостей и продублировано в Telegram.`
      : `❌ Не удалось отправить оповещение. Проверь канал новостей и Telegram-настройки.`,
    allowedMentions: { parse: [] }
  }).catch(() => null);
  return true;
}

async function handleAiMentionMessage(
  message: MessageLike,
  state: Map<string, number>,
  options: Pick<EventRuntimeOptions, 'client' | 'aiMention' | 'aiService' | 'announcementService' | 'familyAnnouncementRoleId'>
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

  if (await handleNaturalAdminCommand(message, prompt, options)) {
    return true;
  }

  if (await handleRulesQuestion(message, prompt, options)) {
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
    const answer = await options.aiService.aiText(buildMentionSystemPrompt(), prompt);
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
    'channelCreate',
    'channelDelete',
    'roleCreate',
    'roleUpdate',
    'webhooksUpdate'
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
    await handleAiSoftConflict(message, aiConflictCooldowns, { aiMention }).catch(() => null);

    if (await handleAiMentionMessage(message, aiMentionCooldowns, {
      client,
      aiMention,
      aiService,
      announcementService,
      familyAnnouncementRoleId
    })) {
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
    await applyActiveLockdownToNewChannel(channel, {
      sendSecurityLog,
      notifyTelegramSecurityAlert
    }).catch(error => {
      console.error('Ошибка применения lockdown к новому каналу:', error);
    });
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

  client.on('roleCreate', async (role: RoleEventLike) => {
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
