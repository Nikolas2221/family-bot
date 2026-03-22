const OpenAI = require('openai');

function createAIService({ enabled, apiKey, model }) {
  const openai = apiKey ? new OpenAI({ apiKey }) : null;

  async function aiText(systemPrompt, userPrompt) {
    if (!enabled || !openai) {
      throw new Error('AI выключен. Проверь AI_ENABLED=true и OPENAI_API_KEY.');
    }

    const response = await openai.responses.create({
      model,
      input: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    });

    return (response.output_text || '').trim() || 'AI не вернул текст.';
  }

  async function analyzeApplication(application) {
    const systemPrompt = [
      'Ты помощник руководства семьи на RP-сервере.',
      'Анализируй заявку кратко и по делу.',
      'Пиши только на русском.',
      'Верни ответ в 4 блоках:',
      '1. Сильные стороны',
      '2. Слабые стороны',
      '3. Риск',
      '4. Рекомендация: ПРИНЯТЬ / РАССМОТРЕТЬ / ОТКЛОНИТЬ'
    ].join(' ');

    const userPrompt = [
      `Ник: ${application.nickname}`,
      `Возраст: ${application.age}`,
      `Текст заявки: ${application.text}`,
      `Статус: ${application.status}`
    ].join('\n');

    return aiText(systemPrompt, userPrompt);
  }

  return {
    aiText,
    analyzeApplication
  };
}

module.exports = { createAIService };
