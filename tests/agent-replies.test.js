const assert = require('node:assert/strict');
const { createAgentReplies, generateNotificationIntro } = require('../dist-ts/services/agent-replies');

async function main() {
  let time = 0;
  const reply = createAgentReplies(() => time);
  const requests = [];
  const service = { aiText: async (system, prompt) => {
    requests.push({ system, prompt });
    return 'Generated answer';
  } };
  await reply('guild:channel:user', service, 'Current facts', 'First request');
  await reply('guild:channel:user', service, 'New facts', 'Follow up');
  assert.match(requests[1].prompt, /First request/);
  assert.match(requests[1].system, /New facts/);
  await reply('other:user', service, '', 'Private');
  assert.doesNotMatch(requests[2].prompt, /First request/);
  time = 16 * 60_000;
  await reply('guild:channel:user', service, '', 'After expiry');
  assert.doesNotMatch(requests[3].prompt, /First request/);
  const offline = { aiText: async () => '' };
  assert.match(await reply('offline', offline, '', 'Question'), /модель не ответила/);
  assert.equal(await generateNotificationIntro(offline, 'Event', 'Facts'), '');
  assert.equal(await generateNotificationIntro({ aiText: async () => { throw Error('offline'); } }, '', ''), '');
  assert.equal(await generateNotificationIntro(service, 'Accepted', 'Rank: member'), 'Generated answer');
  assert.match(requests.at(-1).prompt, /Rank: member/);
  console.log('PASS agent replies: scoped history, expiry, generated notifications and fallback');
}
module.exports = { main };
