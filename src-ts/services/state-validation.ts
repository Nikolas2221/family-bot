import fs from 'node:fs';
import { randomUUID } from 'node:crypto';

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
function safeTree(value: unknown): boolean {
  if (Array.isArray(value)) return value.every(safeTree);
  return !object(value) || Object.entries(value).every(([key, child]) =>
    !['__proto__', 'prototype', 'constructor'].includes(key) && safeTree(child));
}
function entries(value: unknown, validate: (entry: unknown) => boolean): boolean {
  return object(value) && Object.values(value).every(validate);
}
function record(value: unknown): boolean {
  if (!object(value)) return false;
  for (const field of ['id', 'guildId', 'userId', 'status', 'roleId', 'channelId', 'messageId']) {
    if (value[field] !== undefined && typeof value[field] !== 'string') return false;
  }
  for (const field of ['points', 'warns', 'commends', 'messageCount', 'voiceMinutes', 'lastSeenAt', 'observedSince', 'lastMessageAt', 'lastVoiceAt']) {
    if (value[field] !== undefined && (typeof value[field] !== 'number' || !Number.isFinite(value[field]))) return false;
  }
  if (value.decisionDelivery !== undefined && (!object(value.decisionDelivery)
    || !Array.isArray(value.decisionDelivery.remaining) || !value.decisionDelivery.remaining.every(item => typeof item === 'string'))) return false;
  return true;
}
export function validStore(value: unknown): boolean {
  if (!object(value) || !safeTree(value)) return false;
  for (const field of ['applications', 'announcements', 'supportTickets', 'afkRequests', 'warns', 'commends', 'blacklist']) {
    if (value[field] !== undefined && (!Array.isArray(value[field]) || !value[field].every(record))) return false;
  }
  for (const field of ['members', 'afkPanels', 'verificationConfirmations', 'applicationDrafts']) {
    if (value[field] !== undefined && !entries(value[field], record)) return false;
  }
  for (const field of ['cooldowns', 'supportTicketCooldowns']) {
    if (value[field] !== undefined && !entries(value[field], item => typeof item === 'number' && Number.isFinite(item))) return false;
  }
  if (value.panelMessageId !== undefined && typeof value.panelMessageId !== 'string') return false;
  if (value.panelMessageIds !== undefined && !entries(value.panelMessageIds, item => typeof item === 'string')) return false;
  if (value.analytics !== undefined) {
    if (!object(value.analytics)) return false;
    if (value.analytics.reports !== undefined && !entries(value.analytics.reports, item => typeof item === 'string')) return false;
    if (value.analytics.daily !== undefined && !entries(value.analytics.daily, item => {
      if (!object(item)) return false;
      if (item.members !== undefined && !entries(item.members, record)) return false;
      return item.channels === undefined || entries(item.channels, count => typeof count === 'number' && Number.isFinite(count));
    })) return false;
  }
  return true;
}
export function validDatabase(value: unknown): boolean {
  if (!object(value) || !safeTree(value)) return false;
  if (value.meta !== undefined && !object(value.meta)) return false;
  return value.guilds === undefined || entries(value.guilds, guild => {
    if (!object(guild)) return false;
    if (guild.settings !== undefined && !object(guild.settings)) return false;
    if (guild.maintenance !== undefined && !object(guild.maintenance)) return false;
    const settings = object(guild.settings) ? guild.settings : {};
    for (const field of ['channels', 'roles', 'welcome', 'verification', 'reportSchedule', 'mediaShare', 'automod', 'visuals', 'aiBrain', 'modules', 'features', 'access', 'roleIds']) {
      if (settings[field] !== undefined && !object(settings[field])) return false;
    }
    for (const field of ['roleMenus', 'reactionRoles', 'customCommands']) {
      if (settings[field] !== undefined && (!Array.isArray(settings[field]) || !settings[field].every(record))) return false;
    }
    for (const field of ['channels', 'roles']) if (settings[field] !== undefined
      && !entries(settings[field], item => typeof item === 'string')) return false;
    for (const field of ['modules', 'features']) if (settings[field] !== undefined
      && !entries(settings[field], item => typeof item === 'boolean')) return false;
    if (settings.access !== undefined && !entries(settings.access, item => Array.isArray(item) && item.every(id => typeof id === 'string'))) return false;
    if (settings.panelRoleIds !== undefined && (!Array.isArray(settings.panelRoleIds) || !settings.panelRoleIds.every(id => typeof id === 'string'))) return false;
    if (Array.isArray(settings.roleMenus) && !settings.roleMenus.every(menu => object(menu)
      && (menu.items === undefined || (Array.isArray(menu.items) && menu.items.every(record))))) return false;
    return true;
  });
}

export function readValidated<T>(file: string, validate: (value: unknown) => boolean): T | null {
  if (!fs.existsSync(file)) return null;
  try {
    const value: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (validate(value)) return value as T;
  } catch { /* Preserve the unreadable original before recovery. */ }
  const archive = `${file}.corrupt-${Date.now()}-${randomUUID()}`;
  fs.copyFileSync(file, archive, fs.constants.COPYFILE_EXCL);
  console.error(`State file is invalid; original preserved at ${archive}`);
  return null;
}

export function refuseEmptyRecovery(file: string): void {
  if (fs.existsSync(file) || fs.existsSync(`${file}.bak`)) {
    throw new Error(`Cannot recover ${file}: no valid state copy. Restore the preserved files before restarting; originals were not overwritten.`);
  }
}
