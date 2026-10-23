const assert = require('node:assert/strict');
const { PermissionFlagsBits } = require('discord.js');
const { handleAiMentionMessage } = require('../dist-ts/event-runtime');
const { createAgentReplies, isConversationFollowUp, needsServerContext } = require('../dist-ts/services/agent-replies');

async function main() {
  const bot = '123456789012345678';
  const other = '223456789012345678';
  let discordReads = 0;
  const sent = [], calls = [];
  const actor = { id: 'dialogue-user', roles: { highest: { position: 10 } }, permissions: { has: p => p === PermissionFlagsBits.Administrator } };
  actor.fetch = async () => actor;
  let bans = 0;
  const target = { id: other, roles: { highest: { position: 1 } }, ban: async () => { bans++; } };
  const guild = { id: 'dialogue-guild', ownerId: 'owner', members: { fetch: async id => { discordReads++; return id === actor.id ? actor : target; } } };
  const channel = { id: 'dialogue-channel', send: async payload => { sent.push(payload.content); }, sendTyping: async () => {}, messages: {
    fetch: async id => { discordReads++; return { id, channel, guild, author: { id: other, username: 'Quoted person' }, content: 'Я говорю о боте.' }; }
  } };
  const base = { id: 'incoming', author: { id: actor.id }, member: actor, guild, channel };
  let brain;
  const options = {
    client: { user: { id: bot } }, aiMention: { enabled: true, maxChars: 700 },
    aiService: { aiText: async (system, prompt) => { calls.push({ system, prompt }); return 'Ответ модели'; } },
    getGuildStorage: () => { throw Error('No statistics needed'); },
    resolveGuildSettings: () => ({ aiBrain: brain }),
    database: { updateGuildSettings: (_, patch) => { brain = patch.aiBrain; } },
    sendSecurityLog: async () => {}
  };
  const state = new Map(), pending = new Map();
  const ask = (text, extra = {}) => handleAiMentionMessage({ ...base, content: '<@' + bot + '> ' + text, ...extra }, state, options, pending);
  await ask('Объясни массивы');
  await ask('а почему?');
  assert.match(JSON.parse(calls.at(-1).prompt).history[0].content, /массивы/);
  await ask('нет, я про тебя');
  await ask('сделай короче');
  assert.equal(discordReads, 0);
  assert.equal(calls.length, 4, 'follow-ups reach the conversational model');
  const history = JSON.parse(calls.at(-1).prompt).history;
  assert.deepEqual(history.map(turn => turn.role), ['user', 'assistant', 'user', 'assistant', 'user', 'assistant']);
  await ask('так тебя оскорбили', { reference: { messageId: 'quote', channelId: channel.id, guildId: guild.id } });
  assert.equal(discordReads, 1, 'only the exact reply is fetched');
  assert.match(JSON.parse(calls.at(-1).prompt).context, /Quoted person/);
  await ask('а почему?');
  assert.ok(JSON.parse(calls.at(-1).prompt).history.some(turn => turn.context?.includes('Quoted person')), 'quote remains attached to its original turn');
  assert.equal(discordReads, 1, 'later follow-ups use local history');
  await ask('Объясни <@' + other + '>, как работают массивы');
  assert.equal(discordReads, 1, 'mention alone does not load statistics');
  await ask('а почему мой профиль тут важен?');
  assert.equal(discordReads, 1, 'clarification does not reload server facts');
  await ask('Новая тема: объясни сортировку');
  assert.equal(JSON.parse(calls.at(-1).prompt).request, 'Новая тема: объясни сортировку');
  const missingChannel = { ...channel, messages: { fetch: async () => { discordReads++; throw Error('Missing access'); } } };
  await ask('объясни цитату', { channel: missingChannel, reference: { messageId: 'missing', channelId: channel.id, guildId: guild.id } });
  assert.match(JSON.parse(calls.at(-1).prompt).context, /referenceUnavailable/);
  await ask('сделай проще');
  assert.ok(JSON.parse(calls.at(-1).prompt).history.some(turn => turn.context?.includes('referenceUnavailable')));
  assert.equal(discordReads, 2);
  const before = calls.length;
  await ask('да, сделай');
  assert.match(sent.at(-1), /Нет ожидающего подтверждения/);
  assert.equal(calls.length, before);
  assert.equal(bans, 0);
  const plan = (code, changes = {}) => pending.set(code, { code, guildId: guild.id, actorId: actor.id, channelId: channel.id,
    expiresAt: Date.now() + 60000, action: 'ban', targetId: other, reason: 'test', summary: 'test', risk: 'high', ...changes });
  plan('ABC123', { actorId: 'stranger' });
  plan('ABC124', { channelId: 'elsewhere' });
  plan('ABC125', { guildId: 'elsewhere' });
  plan('ABC126', { expiresAt: Date.now() - 1 });
  await ask('да, сделай');
  assert.equal(bans, 0, 'foreign and expired plans do not authorize anything');
  plan('ABC127'); plan('ABC128');
  await ask('да, сделай');
  assert.match(sent.at(-1), /несколько/);
  assert.equal(bans, 0);
  pending.delete('ABC128');
  await ask('да, сделай');
  assert.equal(bans, 1, 'unique matching pending action uses the existing executor');
  await ask('да, сделай');
  assert.equal(bans, 1, 'confirmation cannot be replayed');

  for (const text of ['а почему?', 'нет, я про тебя', 'сделай короче', 'продолжи']) assert.equal(isConversationFollowUp(text), true);
  for (const text of ['забань <@' + other + '>', 'объяви собрание', 'новая тема: массивы']) assert.equal(isConversationFollowUp(text), false);
  assert.equal(needsServerContext('объясни <@' + other + '> массивы'), false);
  assert.equal(needsServerContext('какой ранг у <@' + other + '>'), true);
  assert.equal(needsServerContext('проверь мой профиль'), true);
  assert.equal(needsServerContext('покажи статистику нашего сервера'), true);
  let now = 0;
  const reply = createAgentReplies(() => now);
  const seen = [];
  const service = { aiText: async (_, prompt) => { seen.push(prompt); return 'Ответ'; } };
  await reply('topic', service, '', 'Расскажи о рангах');
  await reply('topic', service, '', 'Новая тема: массивы');
  assert.equal(JSON.parse(seen.at(-1)).request, 'Новая тема: массивы');
  assert.equal(reply.hasHistory('topic'), true);
  now = 16 * 60000;
  assert.equal(reply.hasHistory('topic'), false, 'expired history cannot select a conversational route');
  await reply('another-user', service, '', 'а почему?');
  assert.equal(seen.at(-1), 'а почему?', 'another speaker cannot inherit history');
  console.log('PASS dialogue routing, structured quotes, scoped confirmations and Discord request counts');
}
module.exports = { main };
