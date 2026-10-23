import { explainDiscordError } from './discord-errors';
import { ChannelType, PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import { trackWork } from './shutdown';

type BackupConfig = {
  enabled: boolean;
  intervalHours: number;
  githubToken: string;
  githubOwner: string;
  githubRepo: string;
  githubBranch: string;
  githubBasePath: string;
};

type BackupResult = {
  ok: boolean;
  id?: string;
  path?: string;
  url?: string;
  error?: string;
  skipped?: boolean;
};

function safeName(value: unknown): string {
  return String(value || '').trim().replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'backup';
}

function isoId(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function permissionsToString(value: unknown): string {
  try {
    return new PermissionsBitField(value as any).bitfield.toString();
  } catch {
    return String(value || '0');
  }
}

const unsafeRestoredRolePermissions = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageWebhooks,
  PermissionFlagsBits.MentionEveryone
] as bigint[];

function sanitizeRestoredRolePermissions(value: unknown): bigint {
  let permissions: bigint;
  try {
    permissions = BigInt(String(value || '0'));
  } catch {
    return 0n;
  }

  for (const permission of unsafeRestoredRolePermissions) {
    permissions &= ~permission;
  }
  return permissions;
}

function serializeOverwrites(channel: any) {
  return Array.from(channel.permissionOverwrites?.cache?.values?.() || []).map((overwrite: any) => ({
    id: overwrite.id,
    type: overwrite.type,
    allow: permissionsToString(overwrite.allow?.bitfield ?? overwrite.allow),
    deny: permissionsToString(overwrite.deny?.bitfield ?? overwrite.deny)
  }));
}

function serializeRole(role: any) {
  return {
    id: role.id,
    name: role.name,
    color: role.color || 0,
    hoist: Boolean(role.hoist),
    mentionable: Boolean(role.mentionable),
    permissions: permissionsToString(role.permissions?.bitfield ?? role.permissions),
    position: role.position || 0
  };
}

function serializeChannel(channel: any) {
  return {
    id: channel.id,
    type: channel.type,
    name: channel.name,
    parentId: channel.parentId || null,
    position: channel.rawPosition ?? channel.position ?? 0,
    topic: channel.topic || '',
    nsfw: Boolean(channel.nsfw),
    rateLimitPerUser: channel.rateLimitPerUser || 0,
    bitrate: channel.bitrate || 0,
    userLimit: channel.userLimit || 0,
    permissionOverwrites: serializeOverwrites(channel)
  };
}

function canCreateChannelType(type: number): boolean {
  return [
    ChannelType.GuildCategory,
    ChannelType.GuildText,
    ChannelType.GuildVoice,
    ChannelType.GuildAnnouncement,
    ChannelType.GuildForum,
    ChannelType.GuildStageVoice
  ].includes(type);
}

function githubApiBase(config: BackupConfig): string {
  return `https://api.github.com/repos/${config.githubOwner}/${config.githubRepo}/contents`;
}

export function validateBackupSnapshot(backup: any, guildId: string): string {
  if (!backup || backup.version !== 1 || backup.guild?.id !== guildId || !Array.isArray(backup.roles) || !Array.isArray(backup.channels)) return 'Неверный формат backup или другой сервер.';
  if (backup.roles.length > 250 || backup.channels.length > 500) return 'Backup слишком большой для восстановления.';
  const ids = new Set<string>([guildId]);
  for (const item of [...backup.roles, ...backup.channels]) {
    if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id) || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 100) return 'Повторяющийся ID или некорректное имя в backup.';
    ids.add(item.id);
  }
  const bits = (value: unknown) => typeof value === 'string' && /^\d{1,30}$/u.test(value);
  for (const role of backup.roles) if (!bits(role.permissions)) return 'Некорректные права роли в backup.';
  const categories = new Set(backup.channels.filter((channel: any) => channel.type === ChannelType.GuildCategory).map((channel: any) => channel.id));
  for (const channel of backup.channels) {
    if (!canCreateChannelType(channel.type) || (channel.parentId && !categories.has(channel.parentId))
      || channel.parentId === channel.id || (channel.type === ChannelType.GuildCategory && channel.parentId)) return 'Неподдерживаемый тип или некорректная категория канала.';
    if (!Array.isArray(channel.permissionOverwrites) || channel.permissionOverwrites.length > 100
      || channel.permissionOverwrites.some((overwrite: any) => !overwrite || typeof overwrite.id !== 'string' || ![0, 1].includes(overwrite.type) || !bits(overwrite.allow) || !bits(overwrite.deny))) return 'Некорректные разрешения канала.';
  }
  return '';
}

export function createServerBackupService({ client, config }: { client: any; config: BackupConfig }) {
  let autoTimer: NodeJS.Timeout | null = null;
  let authenticationFailed = false;
  let lastError = '';
  let lastSuccessAt = '';
  let lastVerifiedAt = '';
  const restores = new Set<string>();
  const inProgressGuilds = new Set<string>();

  function isConfigured() {
    return Boolean(config.githubToken && config.githubOwner && config.githubRepo);
  }

  function buildBackupPath(guildId: string, backupId: string): string {
    if (!/^[a-zA-Z0-9_-]+$/u.test(guildId) || !/^[a-zA-Z0-9_.-]+$/u.test(backupId) || backupId.includes('..')) throw new Error('Некорректный ID backup.');
    const basePath = String(config.githubBasePath || 'backups/server').replace(/^\/+|\/+$/g, '');
    return `${basePath}/${guildId}/${backupId}.json`;
  }

  function createSnapshot(guild: any) {
    const roles = Array.from(guild.roles.cache.values())
      .filter((role: any) => role.id !== guild.id && !role.managed)
      .map(serializeRole)
      .sort((left: any, right: any) => left.position - right.position);

    const channels = Array.from(guild.channels.cache.values())
      .filter((channel: any) => canCreateChannelType(channel.type))
      .map(serializeChannel)
      .sort((left: any, right: any) => {
        if (left.parentId === right.parentId) return left.position - right.position;
        if (!left.parentId && right.parentId) return -1;
        if (left.parentId && !right.parentId) return 1;
        return String(left.parentId || '').localeCompare(String(right.parentId || ''));
      });

    return {
      version: 1,
      createdAt: new Date().toISOString(),
      guild: {
        id: guild.id,
        name: guild.name,
        ownerId: guild.ownerId || ''
      },
      roles,
      channels
    };
  }

  async function putGithubFile(filePath: string, content: string, message: string): Promise<{ url?: string }> {
    const endpoint = `${githubApiBase(config)}/${filePath}`;
    const existing = await fetch(`${endpoint}?ref=${encodeURIComponent(config.githubBranch)}`, {
      signal: AbortSignal.timeout(15000),
      headers: {
        authorization: `Bearer ${config.githubToken}`,
        accept: 'application/vnd.github+json',
        'user-agent': 'FamilyBotBackup'
      }
    }).then(async response => response.ok ? response.json() : null).catch(() => null);

    const payload: Record<string, unknown> = {
      message,
      branch: config.githubBranch,
      content: Buffer.from(content, 'utf8').toString('base64')
    };
    if (existing?.sha) payload.sha = existing.sha;

    const result = await fetch(endpoint, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${config.githubToken}`,
        accept: 'application/vnd.github+json',
        'content-type': 'application/json',
        'user-agent': 'FamilyBotBackup'
      },
      body: JSON.stringify(payload)
    });

    if (!result.ok) {
      if (result.status === 401) {
        authenticationFailed = true;
        stopAutoBackups();
        throw new Error('GitHub HTTP 401: GITHUB_BACKUP_TOKEN истёк или отозван. Обновите токен в Railway и перезапустите сервис. Автобэкапы остановлены.');
      }
      throw new Error(`GitHub HTTP ${result.status}: резервная копия не сохранена. Проверьте доступ токена к репозиторию.`);
    }

    const json = await result.json();
    return { url: json?.content?.html_url };
  }

  async function createBackup(guild: any, reason = 'manual'): Promise<BackupResult> {
    if (authenticationFailed) return { ok: false, error: lastError || 'Обновите GITHUB_BACKUP_TOKEN и перезапустите сервис.' };
    if (!isConfigured()) return { ok: false, error: 'GitHub backup env is not configured.' };
    const guildId = String(guild?.id || 'unknown');
    if (inProgressGuilds.has(guildId)) {
      return { ok: false, skipped: true, error: 'Backup is already running for this server.' };
    }

    inProgressGuilds.add(guildId);
    try {
      await guild.roles.fetch();
      await guild.channels.fetch();
      const backupId = `${isoId()}-${safeName(reason)}`;
      const snapshot = createSnapshot(guild);
      const filePath = buildBackupPath(guild.id, backupId);
      const uploaded = await putGithubFile(
        filePath,
        JSON.stringify(snapshot, null, 2),
        `Server backup ${guild.name} ${backupId}`
      );
      lastSuccessAt = new Date().toISOString();
      lastError = '';
      return { ok: true, id: backupId, path: filePath, url: uploaded.url };
    } catch (error: any) {
      lastError = error?.message || 'Unknown backup error.';
      console.warn('Server backup failed:', lastError);
      return { ok: false, error: error?.message || 'Unknown backup error.' };
    } finally {
      inProgressGuilds.delete(guildId);
    }
  }

  async function listBackups(guildId: string): Promise<Array<{ id: string; path: string; url?: string }>> {
    if (!isConfigured()) return [];
    const basePath = String(config.githubBasePath || 'backups/server').replace(/^\/+|\/+$/g, '');
    const endpoint = `${githubApiBase(config)}/${basePath}/${guildId}?ref=${encodeURIComponent(config.githubBranch)}`;
    const response = await fetch(endpoint, {
      headers: {
        authorization: `Bearer ${config.githubToken}`,
        accept: 'application/vnd.github+json',
        'user-agent': 'FamilyBotBackup'
      }
    }).catch(() => null);
    if (!response?.ok) return [];
    const json = await response.json();
    return (Array.isArray(json) ? json : [])
      .filter((item: any) => item.type === 'file' && String(item.name || '').endsWith('.json'))
      .map((item: any) => ({
        id: String(item.name).replace(/\.json$/i, ''),
        path: item.path,
        url: item.html_url
      }))
      .sort((left, right) => right.id.localeCompare(left.id));
  }

  async function fetchBackup(guildId: string, backupId: string): Promise<any | null> {
    if (!isConfigured()) return null;
    const filePath = buildBackupPath(guildId, backupId.replace(/\.json$/i, ''));
    const endpoint = `${githubApiBase(config)}/${filePath}?ref=${encodeURIComponent(config.githubBranch)}`;
    const response = await fetch(endpoint, {
      headers: {
        authorization: `Bearer ${config.githubToken}`,
        accept: 'application/vnd.github+json',
        'user-agent': 'FamilyBotBackup'
      }
    }).catch(() => null);
    if (!response?.ok) return null;
    const json = await response.json();
    const raw = Buffer.from(String(json.content || ''), 'base64').toString('utf8');
    return JSON.parse(raw);
  }

  async function restoreBackup(guild: any, backupId: string): Promise<BackupResult & { rolesCreated?: number; channelsCreated?: number }> {
    if (restores.has(guild.id)) return { ok: false, error: 'Восстановление уже выполняется.' };
    restores.add(guild.id);
    try {
      const backup = await fetchBackup(guild.id, backupId);
      if (!backup) return { ok: false, error: 'Backup не найден.' };
      const problem = validateBackupSnapshot(backup, guild.id);
      if (problem) return { ok: false, error: problem };
      await guild.roles.fetch();
      await guild.channels.fetch();
      return await restoreSnapshot(guild, backup, backupId);
    } catch (error) { return { ok: false, error: 'Восстановление прервано. ' + (error instanceof Error && error.message === 'Ambiguous existing channels' ? 'Найдено несколько одинаковых каналов.' : explainDiscordError(error)) + ' Проверьте уже созданные роли и каналы перед повтором.' }; }
    finally { restores.delete(guild.id); }
  }

  async function verifyBackup(guildId: string, backupId: string): Promise<BackupResult & { rolesCreated?: number; channelsCreated?: number }> {
    try {
      const backup = await fetchBackup(guildId, backupId);
      if (!backup) return { ok: false, error: 'Backup не найден или GitHub недоступен.' };
      const problem = validateBackupSnapshot(backup, guildId);
      if (problem) return { ok: false, error: problem };
      const roles = new Map<string, any>(), channels = new Map<string, any>();
      // The real restoration algorithm writes exclusively into these isolated collections.
      const sandbox = { id: guildId, roles: { cache: roles, create: async (data: any) => {
        const role = { ...data, id: 'test-role-' + roles.size }; roles.set(role.id, role); return role;
      } }, channels: { cache: channels, create: async (data: any) => {
        if (data.parent && !channels.has(data.parent)) throw Error('Missing restored parent');
        const channel = { ...data, parentId: data.parent || null, id: 'test-channel-' + channels.size };
        channels.set(channel.id, channel); return channel;
      } } };
      const result = await restoreSnapshot(sandbox, backup, backupId);
      if (result.ok) lastVerifiedAt = new Date().toISOString();
      return result;
    } catch { return { ok: false, error: 'Проверка backup не выполнена: повреждён JSON или недоступен GitHub.' }; }
  }

  async function restoreSnapshot(guild: any, backup: any, backupId: string): Promise<BackupResult & { rolesCreated?: number; channelsCreated?: number }> {
    if (!backup) return { ok: false, error: `Backup ${backupId} not found.` };
    if (backup.guild?.id && String(backup.guild.id) !== String(guild.id)) {
      return { ok: false, error: `Backup ${backupId} belongs to another guild.` };
    }

    const backupRoles = Array.isArray(backup.roles) ? backup.roles : [];
    const backupChannels = Array.isArray(backup.channels) ? backup.channels : [];
    if (backupRoles.length > 250 || backupChannels.length > 500) {
      return { ok: false, error: 'Backup is too large for safe automatic restore.' };
    }

    const roleMap = new Map<string, string>();
    roleMap.set(backup.guild?.id || guild.id, guild.id);

    const existingRolesByName = new Map(Array.from(guild.roles.cache.values()).map((role: any) => [role.name, role]));
    const roles = [...backupRoles].sort((left: any, right: any) => left.position - right.position);
    let rolesCreated = 0;
    for (const roleData of roles) {
      const existing = guild.roles.cache.get(roleData.id) || existingRolesByName.get(roleData.name) as any;
      if (existing) {
        roleMap.set(roleData.id, existing.id);
        continue;
      }
      const role = await guild.roles.create({
        name: roleData.name,
        color: roleData.color || undefined,
        hoist: roleData.hoist,
        mentionable: roleData.mentionable,
        permissions: sanitizeRestoredRolePermissions(roleData.permissions),
        reason: `Restore server backup ${backupId}`
      });
      roleMap.set(roleData.id, role.id);
      rolesCreated += 1;
    }

    const channelMap = new Map<string, string>();
    const categories = backupChannels.filter((channel: any) => channel.type === ChannelType.GuildCategory);
    const children = backupChannels.filter((channel: any) => channel.type !== ChannelType.GuildCategory);
    let channelsCreated = 0;

    async function createChannel(channelData: any) {
      const parentId = channelData.parentId ? channelMap.get(channelData.parentId) : null;
      const matching = [...guild.channels.cache.values()].filter((channel: any) => channel.name === channelData.name && channel.type === channelData.type && (channel.parentId || null) === parentId);
      if (matching.length > 1) throw Error('Ambiguous existing channels');
      const existing = guild.channels.cache.get(channelData.id) || matching[0];
      if (existing) { channelMap.set(channelData.id, existing.id); return; }
      const overwrites = (channelData.permissionOverwrites || [])
        .map((overwrite: any) => {
          const mappedId = roleMap.get(overwrite.id) || channelMap.get(overwrite.id) || overwrite.id;
          return {
            id: mappedId,
            type: overwrite.type,
            allow: sanitizeRestoredRolePermissions(overwrite.allow),
            deny: BigInt(overwrite.deny || '0')
          };
        });

      const created = await guild.channels.create({
        name: channelData.name,
        type: channelData.type,
        parent: channelData.parentId ? channelMap.get(channelData.parentId) : undefined,
        topic: channelData.topic || undefined,
        nsfw: channelData.nsfw || undefined,
        rateLimitPerUser: channelData.rateLimitPerUser || undefined,
        bitrate: channelData.bitrate || undefined,
        userLimit: channelData.userLimit || undefined,
        permissionOverwrites: overwrites,
        reason: `Restore server backup ${backupId}`
      });
      channelMap.set(channelData.id, created.id);
      channelsCreated += 1;
    }

    for (const category of categories) await createChannel(category);
    for (const channel of children) await createChannel(channel);

    return { ok: true, id: backupId, rolesCreated, channelsCreated };
  }

  function startAutoBackups() {
    if (authenticationFailed || !config.enabled || !isConfigured() || autoTimer) return;
    const intervalMs = Math.max(1, Number(config.intervalHours) || 48) * 60 * 60 * 1000;

    const runAutoBackup = (reason: string) => {
      void trackWork(async () => {
        for (const guild of client.guilds.cache.values()) {
          if (authenticationFailed) break;
          const result = await createBackup(guild, reason);
          if (!result.ok && result.skipped) {
            console.warn(`Auto server backup skipped for ${guild.id}: ${result.error}`);
          } else if (!result.ok) {
            console.error(`Auto server backup failed for ${guild.id}:`, result.error);
          }
        }
      }).catch(error => {
        console.error('Auto server backup scheduler failed:', error);
      });
    };

    runAutoBackup('startup-auto');
    autoTimer = setInterval(() => runAutoBackup('auto'), intervalMs);
  }

  function stopAutoBackups() {
    if (autoTimer) clearInterval(autoTimer);
    autoTimer = null;
  }

  return {
    healthLines: () => [
      `GitHub backup: ${authenticationFailed ? 'остановлен: токен отклонён' : isConfigured() ? 'настроен' : 'не настроен'}`,
      `Последний успешный backup: ${lastSuccessAt || 'в этом запуске ещё не было'}`,
      `Проверка восстановления: ${lastVerifiedAt || 'в этом запуске ещё не выполнялась'}`,
      ...(lastError ? [`Ошибка backup: ${lastError}`] : [])
    ],
    config,
    isConfigured,
    createSnapshot,
    createBackup,
    listBackups,
    restoreBackup,
    verifyBackup,
    startAutoBackups,
    stopAutoBackups
  };
}
