const assert = require('node:assert/strict');
const { createDeepSeekService } = require('../dist-ts/services/deepseek');

async function main() {
  let request = null;
  const service = createDeepSeekService({
    apiKey: 'secret-key',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        status: 200,
        async json() {
          return { choices: [{ message: { content: 'Развёрнутый ответ [1].' } }] };
        }
      };
    }
  });

  const answer = await service.answerLawQuestion('Можно ли?', [{
    id: '1', document: 'Кодекс', heading: 'Статья 1', text: 'Полный текст',
    excerpt: 'Выдержка', url: 'https://example.test/law', score: 10
  }]);

  assert.equal(answer, 'Развёрнутый ответ [1].');
  assert.equal(request.url, 'https://api.deepseek.com/chat/completions');
  assert.equal(request.options.headers.Authorization, 'Bearer secret-key');
  const body = JSON.parse(request.options.body);
  assert.equal(body.model, 'deepseek-chat');
  assert.match(body.messages[1].content, /Выдержка/);
  assert.doesNotMatch(body.messages[1].content, /secret-key/);

  const disabled = createDeepSeekService({ apiKey: '' });
  assert.equal(await disabled.answerLawQuestion('Вопрос', []), null);

  const failed = createDeepSeekService({
    apiKey: 'secret-key',
    fetchImpl: async () => ({ ok: false, status: 401 })
  });
  await assert.rejects(
    () => failed.answerLawQuestion('Вопрос', [{ excerpt: 'Норма' }]),
    /DeepSeek HTTP 401/
  );

  const hanging = createDeepSeekService({
    apiKey: 'secret-key',
    timeoutMs: 10,
    fetchImpl: async () => new Promise(() => {})
  });
  await assert.rejects(
    () => hanging.answerLawQuestion('Вопрос', [{ excerpt: 'Норма' }]),
    /DeepSeek timeout after 10ms/
  );
  console.log('ALL DEEPSEEK TESTS PASSED');
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };
