require('dotenv').config({ quiet: true });
const cases = require('../tests/fixtures/dialogue-cases.json');
const { createAgentReplies } = require('../dist-ts/services/agent-replies');
const { createOpenRouterChatCompletion } = require('../dist-ts/services/deepseek');
const { createAiBudget } = require('../dist-ts/services/ai-budget');
const path = require('node:path');
async function main() {
  if (!process.argv.includes('--live')) {
    console.log('Сценариев: ' + cases.length + '. Локальные проверки: npm run check. Для ручной оценки модели: npm run ai:eval -- --live.'); return;
  }
  const budget = createAiBudget(path.resolve((process.env.STORAGE_FILE || 'dist-ts/storage.json') + '.ai-usage.json'), { dailyTokens: Number(process.env.AI_DAILY_TOKENS) || 200000, userRequests: 50, channelRequests: 200 });
  const completion = createOpenRouterChatCompletion({ apiKey: process.env.OPENROUTER_API_KEY || process.env.DEEPSEEK_API_KEY || '', model: process.env.OPENROUTER_MODEL || process.env.DEEPSEEK_MODEL,
    baseUrl: process.env.OPENROUTER_BASE_URL || process.env.DEEPSEEK_BASE_URL, fetchImpl: budget.guardedFetch(fetch) });
  if (!completion.enabled) throw Error('Ключ ИИ не настроен');
  const service = { aiText: (system, prompt) => completion.chat([{ role: 'system', content: system }, { role: 'user', content: prompt }]).then(answer => answer || '') };
  for (const item of cases) {
    const reply = createAgentReplies();
    let answer;
    for (const prompt of item.turns) answer = await reply(item.id, service, 'Отвечай коротко, не выполняй действия без результата инструмента.', prompt, '', item.context || '');
    console.log(JSON.stringify({ id: item.id, rubric: item.rubric, answer }));
  }
  console.log('Ответы требуют ручной оценки по rubric. Это не автоматическая оценка качества модели.');
}
main().catch(() => { console.error('Оценка не завершена. Проверьте ключ, лимит бюджета и доступ провайдера.'); process.exitCode = 1; });
