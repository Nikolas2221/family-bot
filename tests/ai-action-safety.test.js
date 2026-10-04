const assert = require('node:assert/strict');
const { PermissionFlagsBits } = require('discord.js');
const { executePendingBrainAction, handleInactiveMembersRequest, configureActionJournal, cancelBulkAction } = require('../dist-ts/event-runtime');
const { ActionJournal } = require('../dist-ts/services/action-journal');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { assessInactivity } = require('../dist-ts/activity-policy');

async function main() {
  const now = Date.now();
  const day = 86400000;
  assert.equal(assessInactivity({ observedSince: now, lastSeenAt: now - 20 * day }, null, 7 * day, now), 'insufficient');
  assert.equal(assessInactivity({ observedSince: now - 8 * day, lastSeenAt: now - 7 * day }, null, 7 * day, now), 'inactive');
  let administrator = true;
  let bans = 0;
  const replies = [];
  const logs = [];
  let brain;
  const actor = { id: 'actor', roles: { highest: { position: 10 } }, permissions: { has: p => administrator && p === PermissionFlagsBits.Administrator } };
  actor.fetch = async force => { assert.equal(force, true); return actor; };
  const target = { id: 'target', roles: { highest: { position: 1 } }, ban: async () => { bans++; } };
  const recipients = [];
  const guild = { id: 'safety-guild', ownerId: 'owner', members: {
    fetch: async id => id ? id === 'actor' ? actor : target : new Map(recipients.map(member => [member.id, member]))
  } };
  const message = { guild, author: { id: actor.id }, member: actor, channel: { id: 'channel', send: async payload => { replies.push(payload); } } };
  const records = new Map();
  const cooldowns = new Map();
  const options = {
    getGuildStorage: () => ({ ensureMemberRecord: id => records.get(id), getCooldown: id => cooldowns.get(id) || 0, setCooldown: (id, value) => cooldowns.set(id, value) }),
    hasFamilyRole: () => true,
    resolveGuildSettings: () => ({ aiBrain: brain }),
    database: { updateGuildSettings: (_, patch) => { brain = patch.aiBrain; } },
    sendSecurityLog: async (_, text) => logs.push(text),
    aiService: { aiText: async () => 'Please contact the administrators.' }
  };
  const pending = new Map();
  const plan = () => pending.set('ABC123', { code: 'ABC123', guildId: guild.id, actorId: actor.id,
    channelId: message.channel.id, action: 'ban', targetId: target.id, reason: 'test', summary: 'test', risk: 'high', expiresAt: Date.now() + 60000 });
  plan();
  await executePendingBrainAction({ ...message, author: { id: 'stranger' } }, 'confirm ABC123', pending, options);
  assert.equal(pending.size, 1, 'another user must not consume the confirmation');
  await executePendingBrainAction({ ...message, channel: { ...message.channel, id: 'elsewhere' } }, 'confirm ABC123', pending, options);
  assert.equal(pending.size, 1, 'confirmation is bound to the original channel');
  administrator = false;
  await executePendingBrainAction(message, 'confirm ABC123', pending, options);
  assert.equal(bans, 0, 'cached admin permission must not authorize a revoked actor');
  assert.equal(brain.audit.at(-1).status, 'failed');
  administrator = true;
  plan();
  await Promise.all([executePendingBrainAction(message, 'confirm ABC123', pending, options), executePendingBrainAction(message, 'confirm ABC123', pending, options)]);
  assert.equal(bans, 1, 'one confirmation must execute only once');
  plan();
  target.roles.highest.position = 20;
  await executePendingBrainAction(message, 'confirm ABC123', pending, options);
  assert.equal(bans, 1, 'target hierarchy must be checked again');
  target.roles.highest.position = 1;
  plan();
  pending.get('ABC123').expiresAt = Date.now() - 1;
  await executePendingBrainAction(message, 'confirm ABC123', pending, options);
  assert.equal(bans, 1);

  let sent = 0;
  const recipient = { id: 'recipient', guild, roles: {}, user: { id: 'recipient', send: async () => { sent++; } } };
  recipients.push(recipient);
  records.set(recipient.id, { observedSince: now - 20 * day, lastSeenAt: now - 10 * day });
  await handleInactiveMembersRequest(message, 'отправь неактивным за 7 дней в лс', options, pending);
  assert.equal(sent, 0);
  const code = Array.from(pending.keys())[0];
  assert.ok(code);
  records.get(recipient.id).lastSeenAt = Date.now();
  await executePendingBrainAction(message, `confirm ${code}`, pending, options);
  assert.equal(sent, 0, 'member active since planning must be excluded');
  records.get(recipient.id).lastSeenAt = now - 10 * day;
  await handleInactiveMembersRequest(message, 'отправь неактивным за 7 дней в лс', options, pending);
  const nextCode = Array.from(pending.keys())[0];
  await executePendingBrainAction(message, `confirm ${nextCode}`, pending, options);
  assert.equal(sent, 1);
  assert.ok(cooldowns.get('inactive-dm:recipient'));
  recipient.user.send = async () => { throw new Error('closed DM'); };
  cooldowns.clear();
  await handleInactiveMembersRequest(message, 'отправь неактивным за 7 дней в лс', options, pending);
  const failedCode = Array.from(pending.keys())[0];
  await executePendingBrainAction(message, `confirm ${failedCode}`, pending, options);
  assert.equal(brain.audit.at(-1).status, 'failed');
  assert.equal(cooldowns.size, 0, 'failed delivery must not set cooldown');
  for (let attempt = 0; attempt < 2; attempt++) {
    await handleInactiveMembersRequest(message, 'тегни неактивных за 7 дней', options, pending);
    const pingCode = Array.from(pending.keys())[0];
    assert.ok(pingCode);
    await executePendingBrainAction(message, `confirm ${pingCode}`, pending, options);
  }
  assert.equal(replies.filter(payload => payload.allowedMentions?.users?.includes('recipient')).length, 1, 'repeat mass pings must respect the cooldown');

  await handleInactiveMembersRequest(message, 'тегни неактивных за 7 дней', options, pending);
  const brokenCode = Array.from(pending.keys())[0];
  const fetch = guild.members.fetch;
  guild.members.fetch = async id => { if (!id) throw new Error('members unavailable'); return fetch(id); };
  await executePendingBrainAction(message, `confirm ${brokenCode}`, pending, options);
  assert.equal(brain.audit.at(-1).status, 'failed', 'unexpected failures must receive a final audit status');
  assert.match(replies.at(-1).content, /Рассылка прервана/);
  guild.members.fetch = fetch;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bulk-restart-'));
  try {
    const file = path.join(dir, 'actions.json');
    configureActionJournal(new ActionJournal(file));
    let deliveries = 0;
    recipient.user.send = async () => { deliveries++; };
    for (let attempt = 0; attempt < 2; attempt++) {
      cooldowns.clear();
      await handleInactiveMembersRequest(message, 'отправь неактивным за 7 дней в лс', options, pending);
      await executePendingBrainAction(message, `confirm ${Array.from(pending.keys())[0]}`, pending, options);
      configureActionJournal(new ActionJournal(file));
    }
    assert.equal(deliveries, 1, 'persistent recipient journal prevents duplicates even if the main cooldown write was lost');
    recipient.id = 'uncertain-recipient';
    records.set(recipient.id, { observedSince: now - 20 * day, lastSeenAt: now - 10 * day });
    let attempts = 0;
    recipient.user.send = async () => { attempts++; throw Object.assign(new Error('response lost'), { code: 'ETIMEDOUT' }); };
    for (let attempt = 0; attempt < 2; attempt++) {
      cooldowns.clear();
      await handleInactiveMembersRequest(message, 'отправь неактивным за 7 дней в лс', options, pending);
      await executePendingBrainAction(message, `confirm ${Array.from(pending.keys())[0]}`, pending, options);
      configureActionJournal(new ActionJournal(file));
    }
    assert.equal(attempts, 1, 'ambiguous network errors must not permit duplicate delivery after restart');
    const restored = new ActionJournal(file);
    assert.ok(restored.list().some(job => job.recipients[recipient.id] === 'sending'));
  } finally { configureActionJournal(undefined); fs.rmSync(dir, { recursive: true, force: true }); }
  const second = { ...recipient, id: 'second', user: { send: async () => { throw new Error('must not send after stopping'); } } };
  recipients.push(second);
  records.set(second.id, { observedSince: now - 20 * day, lastSeenAt: now - 10 * day });
  for (const reason of ['revoked', 'cancelled']) {
    administrator = true;
    cooldowns.clear();
    let firstSent = 0;
    recipient.user.send = async () => {
      firstSent++;
      if (reason === 'revoked') administrator = false;
      else await cancelBulkAction(message, 'отмени рассылку');
    };
    await handleInactiveMembersRequest(message, 'отправь неактивным за 7 дней в лс', options, pending);
    await executePendingBrainAction(message, `confirm ${Array.from(pending.keys())[0]}`, pending, options);
    assert.equal(firstSent, 1);
    assert.equal(brain.audit.at(-1).status, 'cancelled');
    assert.equal(cooldowns.has('inactive-dm:second'), false);
    administrator = true;
  }
}

module.exports = { main };
