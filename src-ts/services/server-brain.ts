import { createHash } from 'node:crypto';
import { ChannelType, PermissionFlagsBits } from 'discord.js';

export type BrainRisk = 'read' | 'low' | 'medium' | 'high' | 'critical';
export type BrainActionStatus = 'planned' | 'completed' | 'failed' | 'cancelled';

export interface BrainChannelMemory {
  id: string;
  name: string;
  type: number;
  parentId: string;
  purpose: string;
  source: 'discord' | 'admin' | 'system';
  configuredBy: string;
  updatedAt: string;
}

export interface BrainRoleMemory {
  id: string;
  name: string;
  position: number;
  permissions: string;
  managed: boolean;
  updatedAt: string;
}

export interface BrainRulesMemory {
  channelId: string;
  hash: string;
  text: string;
  messageIds: string[];
  syncedAt: string;
}

export interface BrainAuditEntry {
  id: string;
  action: string;
  risk: BrainRisk;
  status: BrainActionStatus;
  actorId: string;
  targetId: string;
  summary: string;
  createdAt: string;
}

export interface ServerBrainSettings {
  version: 1;
  channels: Record<string, BrainChannelMemory>;
  roles: Record<string, BrainRoleMemory>;
  rules: BrainRulesMemory;
  audit: BrainAuditEntry[];
  lastMappedAt: string;
}

export interface PermissionAuditResult {
  scannedChannels: number;
  scannedRoles: number;
  findings: string[];
  summary: string;
}

const EMPTY_RULES: BrainRulesMemory = {
  channelId: '',
  hash: '',
  text: '',
  messageIds: [],
  syncedAt: ''
};

function clean(value: unknown, max = 1000): string {
  return String(value || '').trim().slice(0, max);
}

function recordEntries(value: unknown): Array<[string, any]> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? Object.entries(value as Record<string, unknown>)
    : [];
}

function collectionValues<T = any>(value: any): T[] {
  if (!value) return [];
  if (typeof value.values === 'function') return Array.from(value.values());
  if (Array.isArray(value)) return value;
  return [];
}

export function createEmptyServerBrainSettings(): ServerBrainSettings {
  return {
    version: 1,
    channels: {},
    roles: {},
    rules: { ...EMPTY_RULES },
    audit: [],
    lastMappedAt: ''
  };
}

export function normalizeServerBrainSettings(value: unknown): ServerBrainSettings {
  const raw = value && typeof value === 'object' ? value as Record<string, any> : {};
  const channels = Object.fromEntries(recordEntries(raw.channels).slice(0, 500).map(([id, item]) => [id, {
    id: clean(item?.id || id, 32),
    name: clean(item?.name, 100),
    type: Number(item?.type) || 0,
    parentId: clean(item?.parentId, 32),
    purpose: clean(item?.purpose, 50),
    source: ['admin', 'system'].includes(item?.source) ? item.source : 'discord',
    configuredBy: clean(item?.configuredBy, 32),
    updatedAt: clean(item?.updatedAt, 40)
  } satisfies BrainChannelMemory]));
  const roles = Object.fromEntries(recordEntries(raw.roles).slice(0, 500).map(([id, item]) => [id, {
    id: clean(item?.id || id, 32),
    name: clean(item?.name, 100),
    position: Number(item?.position) || 0,
    permissions: clean(item?.permissions, 100),
    managed: Boolean(item?.managed),
    updatedAt: clean(item?.updatedAt, 40)
  } satisfies BrainRoleMemory]));
  const rules = raw.rules && typeof raw.rules === 'object' ? raw.rules : {};
  const audit = (Array.isArray(raw.audit) ? raw.audit : []).slice(-100).map((item: any) => ({
    id: clean(item?.id, 80),
    action: clean(item?.action, 80),
    risk: ['read', 'low', 'medium', 'high', 'critical'].includes(item?.risk) ? item.risk : 'low',
    status: ['planned', 'completed', 'failed', 'cancelled'].includes(item?.status) ? item.status : 'failed',
    actorId: clean(item?.actorId, 32),
    targetId: clean(item?.targetId, 64),
    summary: clean(item?.summary, 500),
    createdAt: clean(item?.createdAt, 40)
  } satisfies BrainAuditEntry));

  return {
    version: 1,
    channels,
    roles,
    rules: {
      channelId: clean(rules.channelId, 32),
      hash: clean(rules.hash, 128),
      text: clean(rules.text, 12000),
      messageIds: (Array.isArray(rules.messageIds) ? rules.messageIds : []).map((id: unknown) => clean(id, 32)).filter(Boolean).slice(0, 100),
      syncedAt: clean(rules.syncedAt, 40)
    },
    audit,
    lastMappedAt: clean(raw.lastMappedAt, 40)
  };
}

function purposeByChannelId(settings: any): Map<string, string> {
  const result = new Map<string, string>();
  for (const [purpose, channelId] of Object.entries(settings?.channels || {})) {
    const id = clean(channelId, 32);
    if (id) result.set(id, purpose);
  }
  return result;
}

export function snapshotServerMap(guild: any, settings: any, previous?: unknown): ServerBrainSettings {
  const brain = normalizeServerBrainSettings(previous || settings?.aiBrain);
  const now = new Date().toISOString();
  const purposes = purposeByChannelId(settings);
  const channels: Record<string, BrainChannelMemory> = {};
  for (const channel of collectionValues<any>(guild?.channels?.cache)) {
    if (!channel?.id) continue;
    const remembered = brain.channels[channel.id];
    channels[channel.id] = {
      id: channel.id,
      name: clean(channel.name, 100),
      type: Number(channel.type) || 0,
      parentId: clean(channel.parentId, 32),
      purpose: purposes.get(channel.id) || remembered?.purpose || '',
      source: purposes.has(channel.id) ? (remembered?.source || 'system') : 'discord',
      configuredBy: remembered?.configuredBy || '',
      updatedAt: now
    };
  }

  const roles: Record<string, BrainRoleMemory> = {};
  for (const role of collectionValues<any>(guild?.roles?.cache)) {
    if (!role?.id) continue;
    roles[role.id] = {
      id: role.id,
      name: clean(role.name, 100),
      position: Number(role.position) || 0,
      permissions: clean(role.permissions?.bitfield?.toString?.() || role.permissions?.toString?.(), 100),
      managed: Boolean(role.managed),
      updatedAt: now
    };
  }

  return { ...brain, channels, roles, lastMappedAt: now };
}

export function rememberChannelPurpose(
  current: unknown,
  channel: any,
  purpose: string,
  actorId: string
): ServerBrainSettings {
  const brain = normalizeServerBrainSettings(current);
  const now = new Date().toISOString();
  brain.channels[channel.id] = {
    id: channel.id,
    name: clean(channel.name, 100),
    type: Number(channel.type) || 0,
    parentId: clean(channel.parentId, 32),
    purpose: clean(purpose, 50),
    source: 'admin',
    configuredBy: clean(actorId, 32),
    updatedAt: now
  };
  brain.lastMappedAt = now;
  return brain;
}

export function appendBrainAudit(current: unknown, entry: Omit<BrainAuditEntry, 'id' | 'createdAt'> & Partial<Pick<BrainAuditEntry, 'id' | 'createdAt'>>): ServerBrainSettings {
  const brain = normalizeServerBrainSettings(current);
  const createdAt = entry.createdAt || new Date().toISOString();
  brain.audit = [...brain.audit, {
    ...entry,
    id: entry.id || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt
  }].slice(-100);
  return brain;
}

function messageText(message: any): string {
  const embedText = (Array.isArray(message?.embeds) ? message.embeds : []).flatMap((embed: any) => [
    embed?.title,
    embed?.description,
    ...(Array.isArray(embed?.fields) ? embed.fields.flatMap((field: any) => [field?.name, field?.value]) : [])
  ]);
  return [message?.content, ...embedText].filter(Boolean).join('\n').trim();
}

export async function readRulesSnapshot(channel: any): Promise<BrainRulesMemory> {
  if (!channel?.id || !channel?.messages?.fetch) {
    throw new Error('Канал правил не найден или бот не может читать его сообщения.');
  }
  const fetched = await channel.messages.fetch({ limit: 100 });
  const messages = collectionValues<any>(fetched)
    .filter(message => message?.id)
    .sort((left, right) => (Number(left.createdTimestamp) || 0) - (Number(right.createdTimestamp) || 0));
  const text = messages.map(messageText).filter(Boolean).join('\n\n').slice(0, 12000);
  if (!text) throw new Error('В канале правил не найден текст для синхронизации.');
  return {
    channelId: channel.id,
    hash: createHash('sha256').update(text).digest('hex'),
    text,
    messageIds: messages.map(message => String(message.id)).slice(-100),
    syncedAt: new Date().toISOString()
  };
}

export function withRulesSnapshot(current: unknown, snapshot: BrainRulesMemory): ServerBrainSettings {
  const brain = normalizeServerBrainSettings(current);
  brain.rules = snapshot;
  return brain;
}

export function riskForBrainAction(action: string): BrainRisk {
  const normalized = clean(action, 80).toLowerCase();
  if (['inspect', 'map', 'rules_sync', 'permissions_audit'].includes(normalized)) return 'read';
  if (['channel_assign', 'role_remember'].includes(normalized)) return 'low';
  if (['announce', 'event', 'mute', 'unmute', 'nickname'].includes(normalized)) return 'medium';
  if (['kick', 'ban', 'role_grant', 'role_remove', 'channel_permissions'].includes(normalized)) return 'high';
  if (['channel_delete', 'role_delete', 'lockdown', 'restore'].includes(normalized)) return 'critical';
  return 'high';
}

const DANGEROUS_ROLE_PERMISSIONS: Array<[bigint, string]> = [
  [PermissionFlagsBits.Administrator, 'Administrator'],
  [PermissionFlagsBits.ManageGuild, 'Manage Server'],
  [PermissionFlagsBits.ManageRoles, 'Manage Roles'],
  [PermissionFlagsBits.ManageChannels, 'Manage Channels'],
  [PermissionFlagsBits.ManageWebhooks, 'Manage Webhooks'],
  [PermissionFlagsBits.BanMembers, 'Ban Members']
];

function hasPermission(target: any, permission: bigint): boolean {
  try {
    return Boolean(target?.permissions?.has?.(permission) || target?.has?.(permission));
  } catch {
    return false;
  }
}

export function auditServerPermissions(guild: any, settings: any, botMember?: any): PermissionAuditResult {
  const roles = collectionValues<any>(guild?.roles?.cache);
  const channels = collectionValues<any>(guild?.channels?.cache);
  const findings: string[] = [];

  for (const role of roles) {
    if (!role?.id || role.id === guild?.roles?.everyone?.id || role.managed) continue;
    const dangerous = DANGEROUS_ROLE_PERMISSIONS.filter(([permission]) => hasPermission(role, permission)).map(([, label]) => label);
    if (dangerous.length) findings.push(`⚠️ Роль **${clean(role.name, 80)}**: ${dangerous.join(', ')}`);
  }

  const sensitivePurposes = new Set(['logs', 'disciplineLogs', 'automod']);
  const purposeMap = purposeByChannelId(settings);
  for (const channel of channels) {
    if (!channel?.id || !channel?.permissionsFor) continue;
    const purpose = purposeMap.get(channel.id) || '';
    const everyonePermissions = channel.permissionsFor(guild?.roles?.everyone);
    const dangerousEveryone = [
      [PermissionFlagsBits.ManageChannels, 'Manage Channels'],
      [PermissionFlagsBits.ManageWebhooks, 'Manage Webhooks'],
      [PermissionFlagsBits.ManageMessages, 'Manage Messages']
    ].filter(([permission]) => hasPermission(everyonePermissions, permission as bigint)).map(([, label]) => label);
    if (dangerousEveryone.length) {
      findings.push(`🚨 @everyone имеет в <#${channel.id}>: ${dangerousEveryone.join(', ')}`);
    }
    if (sensitivePurposes.has(purpose) && hasPermission(everyonePermissions, PermissionFlagsBits.ViewChannel)) {
      findings.push(`🔓 <#${channel.id}> (${purpose}) виден роли @everyone`);
    }
    if (purpose) {
      const botPermissions = channel.permissionsFor(botMember || guild?.members?.me);
      const missing = [
        [PermissionFlagsBits.ViewChannel, 'View Channel'],
        [PermissionFlagsBits.SendMessages, 'Send Messages'],
        [PermissionFlagsBits.EmbedLinks, 'Embed Links'],
        [PermissionFlagsBits.ReadMessageHistory, 'Read Message History']
      ].filter(([permission]) => !hasPermission(botPermissions, permission as bigint)).map(([, label]) => label);
      if (missing.length) findings.push(`❌ В <#${channel.id}> боту не хватает: ${missing.join(', ')}`);
    }
  }

  const botHighest = Number(botMember?.roles?.highest?.position) || 0;
  const managedRolePositions = Object.values(settings?.roles || {})
    .map(roleId => guild?.roles?.cache?.get?.(roleId))
    .filter(Boolean)
    .map((role: any) => Number(role.position) || 0);
  if (managedRolePositions.some(position => position >= botHighest)) {
    findings.push('❌ Роль бота находится не выше всех ролей, которыми он должен управлять.');
  }

  const visible = findings.slice(0, 20);
  return {
    scannedChannels: channels.length,
    scannedRoles: roles.length,
    findings: visible,
    summary: visible.length
      ? `Проверено каналов: ${channels.length}, ролей: ${roles.length}. Найдено замечаний: ${findings.length}.\n${visible.join('\n')}`
      : `Проверено каналов: ${channels.length}, ролей: ${roles.length}. Критичных проблем в настроенных областях не найдено.`
  };
}

export function formatBrainMemory(settings: any): string {
  const brain = normalizeServerBrainSettings(settings?.aiBrain);
  const remembered = Object.values(brain.channels)
    .filter(channel => channel.purpose)
    .sort((left, right) => left.purpose.localeCompare(right.purpose, 'ru'))
    .map(channel => `• ${channel.purpose}: <#${channel.id}>${channel.configuredBy ? ` (назначил <@${channel.configuredBy}>)` : ''}`);
  return [
    `Память обновлена: ${brain.lastMappedAt || 'ещё не создана'}`,
    `Каналов в памяти: ${Object.keys(brain.channels).length}`,
    `Ролей в памяти: ${Object.keys(brain.roles).length}`,
    `Правила: ${brain.rules.syncedAt ? `синхронизированы ${brain.rules.syncedAt}` : 'не синхронизированы'}`,
    `AI-действий в журнале: ${brain.audit.length}`,
    remembered.length ? remembered.join('\n') : 'Назначения каналов пока не сохранены.'
  ].join('\n');
}

export function formatBrainAudit(settings: any, limit = 8): string {
  const brain = normalizeServerBrainSettings(settings?.aiBrain);
  const entries = brain.audit.slice(-Math.max(1, Math.min(20, limit))).reverse();
  if (!entries.length) return 'Журнал AI-действий пока пуст.';
  return entries.map(entry => [
    `• ${entry.action} [${entry.risk}/${entry.status}]`,
    entry.actorId ? `автор <@${entry.actorId}>` : '',
    entry.targetId ? `цель ${entry.targetId}` : '',
    entry.createdAt
  ].filter(Boolean).join(' • ')).join('\n');
}

export function isTextRulesChannel(channel: any): boolean {
  return [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum].includes(channel?.type);
}
