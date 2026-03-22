const copy = require('./copy');

const POSITIVE_KEYWORDS = [
  'актив',
  'онлайн',
  'помог',
  'помощ',
  'друг',
  'команд',
  'ответств',
  'адекват',
  'опыт',
  'rp',
  'рп'
];

const NEGATIVE_KEYWORDS = ['твинк', 'обман', 'токс', 'оскорб', 'чит', 'слив', 'спам', 'конфликт'];

function normalizeText(value) {
  return String(value || '').trim();
}

function scoreApplication(application) {
  const text = normalizeText(application.text).toLowerCase();
  const positiveHits = POSITIVE_KEYWORDS.filter(keyword => text.includes(keyword));
  const negativeHits = NEGATIVE_KEYWORDS.filter(keyword => text.includes(keyword));
  const lengthBonus = Math.min(3, Math.floor(text.length / 120));

  const score = positiveHits.length * 2 + lengthBonus - negativeHits.length * 2;
  return { score, positiveHits, negativeHits };
}

function buildRecommendation(score) {
  if (score >= 6) return 'ПРИНЯТЬ';
  if (score >= 3) return 'РАССМОТРЕТЬ';
  return 'ОТКЛОНИТЬ';
}

function buildApplicationAnalysis(application) {
  const { score, positiveHits, negativeHits } = scoreApplication(application);
  const strengths = [];
  const weaknesses = [];
  const risks = [];

  if (positiveHits.length) {
    strengths.push(`Есть полезные сигналы: ${positiveHits.slice(0, 4).join(', ')}.`);
  }

  if (normalizeText(application.text).length >= 180) {
    strengths.push('Заявка достаточно подробная и не выглядит пустой.');
  } else {
    weaknesses.push('Заявка короткая, мотивация раскрыта слабо.');
  }

  if (!positiveHits.length) {
    weaknesses.push('Мало конкретики про пользу для семьи и активность.');
  }

  if (negativeHits.length) {
    risks.push(`Есть риск по формулировкам: ${negativeHits.slice(0, 4).join(', ')}.`);
  }

  if (!risks.length) {
    risks.push('Явных красных флагов по тексту не видно, но нужна ручная проверка поведения в игре.');
  }

  if (!strengths.length) {
    strengths.push('Есть базовая мотивация вступить, но без сильных аргументов.');
  }

  if (!weaknesses.length) {
    weaknesses.push('Критичных слабых мест по тексту не видно.');
  }

  return [
    '1. Сильные стороны',
    `- ${strengths.join('\n- ')}`,
    '',
    '2. Слабые стороны',
    `- ${weaknesses.join('\n- ')}`,
    '',
    '3. Риск',
    `- ${risks.join('\n- ')}`,
    '',
    `4. Рекомендация: ${buildRecommendation(score)}`
  ].join('\n');
}

function buildOfflineReply(userPrompt) {
  const prompt = normalizeText(userPrompt);
  const promptLower = prompt.toLowerCase();

  if (!prompt) {
    return copy.ai.emptyPrompt;
  }

  if (promptLower.includes('заяв') && promptLower.includes('сем')) {
    return [
      'Короткий шаблон заявки:',
      '1. Кто ты и какой у тебя ник.',
      '2. Сколько тебе лет и какой у тебя онлайн.',
      '3. Чем будешь полезен семье.',
      '4. Почему хочешь именно к нам.',
      '5. Чем отличаешься от других кандидатов.'
    ].join('\n');
  }

  if (promptLower.includes('привет') || promptLower.includes('здрав')) {
    return 'Привет. Я оффлайн-помощник семьи: могу подсказать текст, идею объявления или короткий разбор ситуации.';
  }

  if (promptLower.includes('объяв') || promptLower.includes('анонс')) {
    return [
      'Черновик объявления:',
      'Семья открывает набор активных игроков. Нужны адекватность, онлайн и готовность работать в команде.',
      'Если хочешь вступить, подай заявку через панель семьи и коротко расскажи о себе.'
    ].join('\n');
  }

  if (promptLower.includes('конфликт') || promptLower.includes('ссора')) {
    return [
      'Спокойный вариант ответа:',
      'Давай без эмоций. Сначала фиксируем, что именно произошло, потом уже решаем вопрос по фактам.',
      'Если нужно, подключаем старших и закрываем ситуацию без лишнего шума.'
    ].join('\n');
  }

  return [
    'Оффлайн-помощник советует:',
    `- Сформулируй запрос короче и предметно: "${prompt.slice(0, 120)}"`,
    '- Если нужен текст, сразу укажи формат: сообщение, объявление, заявка или ответ игроку.',
    '- Если нужен разбор, дай факты: кто, что сделал, какой нужен итог.'
  ].join('\n');
}

function createAIService({ enabled }) {
  async function aiText(_systemPrompt, userPrompt) {
    if (!enabled) {
      throw new Error(copy.ai.disabled);
    }

    return buildOfflineReply(userPrompt);
  }

  async function analyzeApplication(application) {
    if (!enabled) {
      throw new Error(copy.ai.disabled);
    }

    return buildApplicationAnalysis(application);
  }

  return {
    aiText,
    analyzeApplication
  };
}

module.exports = { createAIService };
