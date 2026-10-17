const assert = require('node:assert/strict');
const { handleAiMentionMessage } = require('../dist-ts/event-runtime');
async function main() {
  const sent = [];
  let memberLoads = 0;
  const message = {
    content: '<@123456789012345678> поищи в интернете последние новости Discord',
    author: { id: 'author', bot: false },
    member: { permissions: { has: () => false } },
    guild: { id: 'test-search', members: { fetch: async () => {
      memberLoads++;
      throw Error('Member fetch must not block web questions');
    } } },
    channel: { id: 'channel', send: async payload => sent.push(payload), sendTyping: async () => {} }
  };
  const key = process.env.TAVILY_API_KEY;
  delete process.env.TAVILY_API_KEY;
  try {
    const handled = await handleAiMentionMessage(message, new Map(), {
      client: { user: { id: '123456789012345678' } },
      aiMention: { enabled: true, cooldownSeconds: 3, maxChars: 700 },
      aiService: { aiText: async system => {
        assert.match(system, /TAVILY_API_KEY/);
        return 'Search key is missing';
      } }
    }, new Map());
    assert.equal(handled, true);
    assert.equal(memberLoads, 0);
    assert.equal(sent.length, 1);
    assert.match(sent[0].content, /Search key is missing/);
    message.content = '<@123456789012345678> объясни как работают массивы';
    await handleAiMentionMessage(message, new Map(), {
      client: { user: { id: '123456789012345678' } },
      aiMention: { enabled: true, cooldownSeconds: 3, maxChars: 700 },
      getGuildStorage: () => { throw Error('General questions must not load storage'); },
      aiService: { aiText: async () => 'General answer' }
    }, new Map());
    assert.equal(memberLoads, 0);
    assert.equal(sent.length, 2);
    assert.match(sent[1].content, /General answer/);
  } finally {
    if (key === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = key;
  }
  console.log('PASS general and web questions avoid server data and send one answer');
}
module.exports = { main };
