import { ChannelType, PermissionsBitField } from 'discord.js';

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

export function createServerBackupService({ client, config }: { client: any; config: BackupConfig }) {
  let autoTimer: NodeJS.Timeout | null = null;
  let inProgress = false;

  function isConfigured() {
    return Boolean(config.githubToken && config.githubOwner && config.githubRepo);
  }

  function buildBackupPath(guildId: string, backupId: string): string {
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
      const text = await result.text().catch(() => '');
      throw new Error(`GitHub HTTP ${result.status}: ${text.slice(0, 300)}`);
    }

    const json = await result.json();
    return { url: json?.content?.html_url };
  }

  async function createBackup(guild: any, reason = 'manual'): Promise<BackupResult> {
    if (!isConfigured()) return { ok: false, error: 'GitHub backup env is not configured.' };
    if (inProgress) return { ok: false, error: 'Backup is already running.' };

    inProgress = true;
    try {
      await guild.roles.fetch().catch(() => null);
      await guild.channels.fetch().catch(() => null);
      const backupId = `${isoId()}-${safeName(reason)}`;
      const snapshot = createSnapshot(guild);
      const filePath = buildBackupPath(guild.id, backupId);
      const uploaded = await putGithubFile(
        filePath,
        JSON.stringify(snapshot, null, 2),
        `Server backup ${guild.name} ${backupId}`
      );
      return { ok: true, id: backupId, path: filePath, url: uploaded.url };
    } catch (error: any) {
      console.error('Server backup failed:', error);
      return { ok: false, error: error?.message || 'Unknown backup error.' };
    } finally {
      inProgress = false;
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
    const backup = await fetchBackup(guild.id, backupId);
    if (!backup) return { ok: false, error: `Backup ${backupId} not found.` };

    const roleMap = new Map<string, string>();
    roleMap.set(backup.guild?.id || guild.id, guild.id);

    const existingRolesByName = new Map(Array.from(guild.roles.cache.values()).map((role: any) => [role.name, role]));
    const roles = [...(backup.roles || [])].sort((left: any, right: any) => left.position - right.position);
    let rolesCreated = 0;
    for (const roleData of roles) {
      const existing = existingRolesByName.get(roleData.name) as any;
      if (existing) {
        roleMap.set(roleData.id, existing.id);
        continue;
      }
      const role = await guild.roles.create({
        name: roleData.name,
        color: roleData.color || undefined,
        hoist: roleData.hoist,
        mentionable: roleData.mentionable,
        permissions: BigInt(roleData.permissions || '0'),
        reason: `Restore server backup ${backupId}`
      });
      roleMap.set(roleData.id, role.id);
      rolesCreated += 1;
    }

    const channelMap = new Map<string, string>();
    const categories = (backup.channels || []).filter((channel: any) => channel.type === ChannelType.GuildCategory);
    const children = (backup.channels || []).filter((channel: any) => channel.type !== ChannelType.GuildCategory);
    let channelsCreated = 0;

    async function createChannel(channelData: any) {
      const overwrites = (channelData.permissionOverwrites || [])
        .map((overwrite: any) => {
          const mappedId = roleMap.get(overwrite.id) || channelMap.get(overwrite.id) || overwrite.id;
          return {
            id: mappedId,
            type: overwrite.type,
            allow: BigInt(overwrite.allow || '0'),
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
    if (!config.enabled || !isConfigured() || autoTimer) return;
    const intervalMs = Math.max(1, Number(config.intervalHours) || 48) * 60 * 60 * 1000;

    const runAutoBackup = (reason: string) => {
      for (const guild of client.guilds.cache.values()) {
        void createBackup(guild, reason).then(result => {
          if (!result.ok) console.error(`Auto server backup failed for ${guild.id}:`, result.error);
        });
      }
    };

    runAutoBackup('startup-auto');
    autoTimer = setInterval(() => runAutoBackup('auto'), intervalMs);
  }

  function stopAutoBackups() {
    if (autoTimer) clearInterval(autoTimer);
    autoTimer = null;
  }

  return {
    config,
    isConfigured,
    createSnapshot,
    createBackup,
    listBackups,
    restoreBackup,
    startAutoBackups,
    stopAutoBackups
  };
}
