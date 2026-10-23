const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { AdminChanges } = require('../dist-ts/services/admin-changes');
const { createDatabase } = require('../dist-ts/database');
const { handleCommandRuntime } = require('../dist-ts/command-runtime');
const { createServerBackupService } = require('../dist-ts/services/server-backups');
const { explainDiscordError } = require('../dist-ts/services/discord-errors');
const { handleInactiveMembersRequest } = require('../dist-ts/event-runtime');
const { explainInactivity } = require('../dist-ts/activity-policy');
const { buildCommands } = require('../dist-ts/commands');
const copy = require('../dist-ts/copy').default;

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'family-admin-reliability-'));
  const originalFetch = global.fetch;
  let database;
  try {
    const file = path.join(directory, 'changes.json');
    let journal = new AdminChanges(file);
    let current = { enabled: false };
    await journal.run({ guildId: 'guild', actorId: 'actor', targetId: 'guild', kind: 'settings', before: current }, async () => { current = { enabled: true }; }, () => current);
    const id = journal.list('guild')[0].id;
    journal = new AdminChanges(file);
    assert.equal(journal.list('guild')[0].actorId, 'actor');
    await assert.rejects(journal.undo('another-guild', id, 'actor', async () => current, async () => {}), /не найдено/);
    await assert.rejects(journal.undo('guild', id, 'actor', async () => ({ enabled: 'changed again' }), async () => {}), /Состояние уже изменилось/);
    let writes = 0;
    const undo = () => journal.undo('guild', id, 'actor', async () => current, async entry => { writes++; current = entry.before; });
    const attempts = await Promise.allSettled([undo(), undo()]);
    assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(writes, 1);
    assert.deepEqual(current, { enabled: false });
    assert.equal(new AdminChanges(file).list('guild')[0].status, 'reverted');
    let release;
    const inflight = journal.run({ guildId: 'guild', actorId: 'actor', targetId: 'target', kind: 'rank', before: ['old'] }, async () => { await new Promise(resolve => { release = resolve; }); }, () => ['new']);
    const restarted = new AdminChanges(file);
    assert.equal(restarted.list('guild')[0].status, 'interrupted');
    assert.match(restarted.healthLines().join('\n'), /прервано 1/);
    release(); await inflight;
    fs.writeFileSync(file, '{broken');
    const recovered = new AdminChanges(file);
    assert.ok(recovered.list('guild').every(entry => entry.status === 'interrupted'), 'stale backup cannot authorize undo');

    fs.writeFileSync(file, '{broken'); fs.writeFileSync(file + '.bak', '{broken');
    const damaged = new AdminChanges(file);
    assert.match(damaged.healthLines().join('\n'), /ошибка записи/);
    await assert.rejects(damaged.run({ guildId: 'guild', actorId: 'actor', targetId: 'guild', kind: 'settings', before: {} },
      async () => { throw Error('Must not execute'); }, () => ({})), /недоступен/);

    database = createDatabase({ dataFile: path.join(directory, 'database.json') });
    database.ensureGuild('guild');
    journal = new AdminChanges(path.join(directory, 'settings-history.json'));
    const replies = [];
    let permitted = true;
    const actor = { id: 'actor', roles: { highest: { position: 20 } }, permissions: { has: () => permitted } };
    actor.fetch = async () => actor;
    const guild = { id: 'guild', name: 'Test', ownerId: actor.id,
      channels: { cache: new Map() }, roles: { cache: new Map() }, members: { me: { roles: { highest: { position: 10 } } } } };
    const channel = { id: 'channel', guild, type: ChannelType.GuildText, permissionsFor: () => ({ has: () => true }) };
    guild.channels.cache.set(channel.id, channel);
    const role = { id: 'role', guild, name: 'Member', position: 1, permissions: { has: () => false } };
    guild.roles.cache.set(role.id, role);
    const options = { adminChanges: journal, database, copy, guildStorage: { addCommend() {} },
      canDebugConfig: () => permitted, ephemeral: value => value,
      resolveGuildSettings: () => database.getGuild(guild.id).settings,
      buildGuildSettingsSnapshot: () => ({ settings: database.getGuild(guild.id).settings }),
      embeds: { buildAdminPanelEmbed: () => ({}) }, doPanelUpdate: async () => {} };
    const run = async (sub, values = {}) => {
      const interaction = { commandName: 'settings', isChatInputCommand: () => true, guild, guildId: guild.id, member: actor, user: { id: actor.id },
        options: { getSubcommand: () => sub, getString: key => values[key], getBoolean: key => values[key], getChannel: () => values.value, getRole: () => values.value },
        reply: async function(payload) { this.replied = true; replies.push(payload); },
        deferReply: async () => {}, editReply: async payload => replies.push(payload) };
      await handleCommandRuntime(interaction, options);
      return interaction;
    };
    const interaction = await run('channel', { key: 'logs', value: channel });
    assert.equal(interaction.replied, true, 'delegation preserves original interaction state');
    assert.equal(database.getGuild('guild').settings.channels.logs, channel.id);
    const historyId = journal.list('guild')[0].id;
    assert.equal(journal.list('guild')[0].status, 'completed');
    await run('undo', { id: historyId });
    assert.equal(database.getGuild('guild').settings.channels.logs, '');
    await run('role', { key: 'member', value: role });
    assert.equal(database.getGuild('guild').settings.roles.member, role.id);
    await run('module', { key: 'ai', enabled: false });
    assert.equal(database.getGuild('guild').settings.modules.ai, false);
    await run('module', { key: 'ai', enabled: true });
    assert.equal(database.getGuild('guild').settings.modules.ai, true);
    await run('channel', { key: 'logs', value: { ...channel, id: 'forbidden', permissionsFor: () => ({ has: () => false }) } });
    assert.equal(database.getGuild('guild').settings.channels.logs, '');
    assert.match(replies.at(-1).content, /боту нужны/);
    await run('check');
    assert.match(replies.at(-1).content, /проверена/);
    permitted = false;
    const beforeDenied = journal.list('guild').length;
    await run('module', { key: 'ai', enabled: false });
    assert.equal(journal.list('guild').length, beforeDenied);
    assert.equal(database.getGuild('guild').settings.modules.ai, true);
    permitted = true;

    const oldRole = { ...role, id: 'old-role', name: 'Old member' };
    guild.roles.cache.set(oldRole.id, oldRole);
    guild.roles.fetch = async id => guild.roles.cache.get(id);
    const targetMember = { id: 'member', roles: { highest: { position: 1 }, cache: new Map([[oldRole.id, oldRole]]) } };
    targetMember.roles.add = async ids => { for (const id of ids) targetMember.roles.cache.set(id, guild.roles.cache.get(id)); };
    targetMember.roles.remove = async ids => { for (const id of ids) targetMember.roles.cache.delete(id); };
    guild.members.fetch = async () => targetMember;
    await journal.run({ guildId: guild.id, actorId: actor.id, targetId: targetMember.id, kind: 'rank', before: [oldRole.id] },
      async () => { targetMember.roles.cache = new Map([[role.id, role]]); }, () => [role.id]);
    const rankId = journal.list(guild.id)[0].id;
    await run('undo', { id: rankId });
    assert.deepEqual([...targetMember.roles.cache.keys()], [oldRole.id], 'rank rollback restores only the changed roles');
    await run('history');
    assert.match(replies.at(-1).content, /участник member/);
    const healthReplies = [];
    await handleCommandRuntime({ commandName: 'health', isChatInputCommand: () => true, guild, member: actor,
      reply: async payload => healthReplies.push(payload), followUp: async payload => healthReplies.push(payload) },
      { ...options, healthLines: () => Array.from({ length: 10 }, () => 'diagnostics '.repeat(40)) });
    assert.ok(healthReplies.length > 1, 'long health output preserves every section');
    assert.ok(healthReplies.every(payload => payload.content.length <= 1900));
    let releaseMembers, memberReads = 0;
    const activityGuild = { id: 'activity-isolated', members: { fetch: () => { memberReads++; return new Promise(resolve => { releaseMembers = resolve; }); } } };
    const activityMessage = { guild: activityGuild, author: { id: actor.id }, member: actor, channel: { id: 'activity', send: async () => {} } };
    const activityOptions = { getGuildStorage: () => ({}), hasFamilyRole: () => true };
    const firstActivity = handleInactiveMembersRequest(activityMessage, 'покажи неактивных за 7 дней', activityOptions);
    const secondActivity = handleInactiveMembersRequest(activityMessage, 'покажи неактивных за 7 дней', activityOptions);
    assert.equal(memberReads, 1, 'overlapping member-list reads share one Discord request');
    releaseMembers(new Map());
    await Promise.all([firstActivity, secondActivity]);

    const snapshot = { version: 1, guild: { id: 'guild' }, roles: [{ id: 'old-role', name: 'Member', position: 1, permissions: PermissionFlagsBits.Administrator.toString() }], channels: [
      { id: 'category', name: 'Family', type: ChannelType.GuildCategory, parentId: null, permissionOverwrites: [] },
      { id: 'text', name: 'general', type: ChannelType.GuildText, parentId: 'category', permissionOverwrites: [{ id: 'old-role', type: 0, allow: '0', deny: '0' }] }
    ] };
    let backup = snapshot;
    let networkCalls = 0;
    global.fetch = async () => { networkCalls++; return { ok: true, json: async () => ({ content: Buffer.from(JSON.stringify(backup)).toString('base64') }) }; };
    const service = createServerBackupService({ client: { guilds: { cache: new Map() } }, config: {
      enabled: true, intervalHours: 24, githubToken: 'test', githubOwner: 'owner', githubRepo: 'repo', githubBranch: 'main', githubBasePath: 'backups' } });
    const verified = await service.verifyBackup('guild', 'snapshot');
    assert.equal(verified.ok, true);
    assert.equal(verified.rolesCreated, 1);
    assert.equal(verified.channelsCreated, 2);
    assert.equal(networkCalls, 1, 'verification only reads a backup, never sends to Discord');
    assert.match(service.healthLines().join('\n'), /Проверка восстановления:/);
    let created = 0;
    const realTarget = { id: 'guild', roles: { cache: new Map(), fetch: async () => {}, create: async data => {
      assert.equal(data.permissions & PermissionFlagsBits.Administrator, 0n);
      const role = { ...data, id: 'new-role' }; realTarget.roles.cache.set(role.id, role); created++; return role;
    } }, channels: { cache: new Map(), fetch: async () => {}, create: async data => {
      const channel = { ...data, id: 'new-channel-' + created++, parentId: data.parent || null }; realTarget.channels.cache.set(channel.id, channel); return channel;
    } } };
    assert.equal((await service.restoreBackup(realTarget, 'snapshot')).ok, true);
    const initialCreated = created;
    const repeated = await service.restoreBackup(realTarget, 'snapshot');
    assert.equal(repeated.ok, true);
    assert.equal(created, initialCreated, 'retry reuses already restored roles and channels');
    backup = { ...snapshot, channels: [{ ...snapshot.channels[1], parentId: 'missing' }] };
    assert.equal((await service.verifyBackup('guild', 'snapshot')).ok, false);
    assert.equal((await service.restoreBackup(realTarget, 'snapshot')).ok, false);
    assert.equal(created, initialCreated, 'invalid snapshots do not mutate the guild');
    backup = { ...snapshot, guild: { id: 'another-guild' } };
    assert.equal((await service.verifyBackup('guild', 'snapshot')).ok, false);
    const beforeTraversal = networkCalls;
    assert.equal((await service.verifyBackup('guild', '../secret')).ok, false);
    assert.equal(networkCalls, beforeTraversal);
    const day = 86400000, now = 30 * day;
    const explanation = explainInactivity({ observedSince: day, lastMessageAt: 10 * day, lastVoiceAt: 12 * day }, 2 * day, 7 * day, now);
    assert.match(explanation, /неактивен; наблюдение 28 дн/);
    assert.match(explanation, /сообщение 20 дн/);
    assert.match(explanation, /голос 18 дн/);
    for (const code of [50013, 50001, 10003, 10007, 10011, 50007]) assert.notEqual(explainDiscordError({ code }), explainDiscordError({}));
    assert.doesNotMatch(explainDiscordError(Error('token=secret')), /secret/);
    const settingsCommand = buildCommands().find(command => command.name === 'settings');
    assert.equal(settingsCommand.default_member_permissions, PermissionFlagsBits.Administrator.toString());
    assert.deepEqual(settingsCommand.options.map(option => option.name), ['show', 'check', 'history', 'undo', 'channel', 'role', 'module']);
    console.log('PASS admin journal restart/undo/conflict, settings writes/validation/access, backup sandbox/retry/validation, activity explanations and safe errors');
  } finally {
    global.fetch = originalFetch;
    database?.flush();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
module.exports = { main };
