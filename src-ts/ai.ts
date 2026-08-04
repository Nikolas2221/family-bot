import copy from './copy';
import type {
  AIService,
  ApplicationAnalysisInput,
  MemberRecommendationInput
} from './types';

type ChatCompletionLike = {
  enabled?: boolean;
  model?: string;
  chat(messages: Array<{ role: string; content: string }>): Promise<string | null>;
};

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
] as const;

const NEGATIVE_KEYWORDS = [
  'твинк',
  'обман',
  'токс',
  'оскорб',
  'чит',
  'слив',
  'спам',
  'конфликт'
] as const;

function normalizeText(value: unknown): string {
  return String(value || '').trim();
}

function formatApplicationForModel(application: ApplicationAnalysisInput): string {
  return [
    `Кандидат: ${normalizeText(application.discordUsername) || normalizeText(application.discordId) || normalizeText(application.userId) || 'не указан'}`,
    `Discord ID: ${normalizeText(application.discordId || application.userId) || 'не указан'}`,
    `Игровой никнейм / static: ${normalizeText(application.nickname) || 'не указан'}`,
    `Возраст / уровень: ${normalizeText(application.age || application.level) || 'не указан'}`,
    `Кто пригласил: ${normalizeText(application.inviter) || 'не указано'}`,
    `Откуда узнал: ${normalizeText(application.discovery) || 'не указано'}`,
    `О себе: ${normalizeText(application.about || application.text) || 'не указано'}`,
    `Ценности семьи: ${normalizeText(application.values) || 'не указано'}`,
    `Направление развития: ${normalizeText(application.development) || 'не указано'}`,
    `Сильные стороны: ${normalizeText(application.strengths) || 'не указано'}`
  ].join('\n');
}

function formatMemberForModel(profile: MemberRecommendationInput): string {
  const allRoleNames = Array.isArray(profile.allRoleNames)
    ? profile.allRoleNames.map(role => normalizeText(role)).filter(Boolean)
    : [];
  return [
    `Участник: ${normalizeText(profile.displayName) || 'без имени'}`,
    `Текущая роль: ${normalizeText(profile.currentRoleName) || 'нет роли'}`,
    `Все роли Discord: ${allRoleNames.length ? allRoleNames.join(', ') : 'нет ролей'}`,
    `Цель авто-ранга: ${normalizeText(profile.autoTargetRoleName) || 'нет'}`,
    `Актив-очки: ${Math.max(0, Number(profile.activityScore) || 0)}`,
    `Баллы/репутация: ${Math.max(0, Number(profile.points) || 0)}/100`,
    `Выговоры: ${Math.max(0, Number(profile.warns) || 0)}/6`,
    `Похвалы: ${Math.max(0, Number(profile.commends) || 0)}`,
    `Сообщения: ${Math.max(0, Number(profile.messageCount) || 0)}`,
    `Голосовые минуты: ${Math.max(0, Number(profile.voiceMinutes) || 0)}`,
    `Последняя активность timestamp: ${Number(profile.lastSeenAt) || 0}`
  ].join('\n');
}

async function safeChat(
  chatCompletion: ChatCompletionLike | undefined,
  messages: Array<{ role: string; content: string }>
): Promise<string | null> {
  if (!chatCompletion?.enabled) return null;
  try {
    const result = await chatCompletion.chat(messages);
    return normalizeText(result) || null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || 'unknown error');
    console.warn(`External AI request failed, falling back to local helper: ${message}`);
    return null;
  }
}

function scoreApplication(application: ApplicationAnalysisInput) {
  const text = normalizeText(application.text).toLowerCase();
  const positiveHits = POSITIVE_KEYWORDS.filter(keyword => text.includes(keyword));
  const negativeHits = NEGATIVE_KEYWORDS.filter(keyword => text.includes(keyword));
  const lengthBonus = Math.min(3, Math.floor(text.length / 120));

  const score = positiveHits.length * 2 + lengthBonus - negativeHits.length * 2;
  return { score, positiveHits, negativeHits };
}

function buildRecommendation(score: number): string {
  if (score >= 6) return 'ПРИНЯТЬ';
  if (score >= 3) return 'РАССМОТРЕТЬ';
  return 'ОТКЛОНИТЬ';
}

function buildApplicationAnalysis(application: ApplicationAnalysisInput): string {
  const { score, positiveHits, negativeHits } = scoreApplication(application);
  const candidateId = normalizeText(application.discordId || application.userId || application.id);
  const candidate = /^\d{16,20}$/u.test(candidateId) ? `<@${candidateId}>` : (normalizeText(application.discordUsername) || 'кандидат не указан');
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const risks: string[] = [];

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
    'AI-анализ заявки',
    '',
    `Кандидат: ${candidate}`,
    '',
    'Оглавление:',
    '',
    '1. Общая информация',
    '2. Сильные стороны кандидата',
    '3. Возможные риски',
    '4. Совпадение с ценностями семьи',
    '5. Рекомендация по заявке',
    '6. Итог',
    '',
    '1. Общая информация',
    `- Ник: ${normalizeText(application.nickname) || 'не указан'}`,
    `- Уровень: ${normalizeText(application.level || application.age) || 'не указан'}`,
    `- Кто пригласил: ${normalizeText(application.inviter) || 'не указано'}`,
    `- Откуда узнал: ${normalizeText(application.discovery) || 'не указано'}`,
    '',
    '2. Сильные стороны кандидата',
    `- ${strengths.join('\n- ')}`,
    '',
    '3. Возможные риски',
    `- ${risks.join('\n- ')}`,
    '',
    '4. Совпадение с ценностями семьи',
    `- ${weaknesses.join('\n- ')}`,
    '',
    '5. Рекомендация по заявке',
    `- ${buildRecommendation(score)}`,
    '',
    '6. Итог',
    '- Решение всё равно должен принять Старший состав после ручной проверки кандидата.'
  ].join('\n');
}

function buildOfflineReply(userPrompt: string): string {
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

function hoursFromMinutes(minutes: unknown): number {
  return Math.max(0, Number(minutes) || 0) / 60;
}

function inactiveDaysSince(timestamp: unknown): number {
  const safeTimestamp = Number(timestamp) || 0;
  if (!safeTimestamp) return 999;
  return Math.max(0, (Date.now() - safeTimestamp) / (24 * 60 * 60 * 1000));
}

function buildMemberRecommendation(profile: MemberRecommendationInput): string {
  const points = Math.max(0, Number(profile.points) || 0);
  const warns = Math.max(0, Number(profile.warns) || 0);
  const commends = Math.max(0, Number(profile.commends) || 0);
  const messages = Math.max(0, Number(profile.messageCount) || 0);
  const activityScore = Math.max(0, Number(profile.activityScore) || 0);
  const voiceHours = hoursFromMinutes(profile.voiceMinutes);
  const inactiveDays = inactiveDaysSince(profile.lastSeenAt);
  const currentRoleName = normalizeText(profile.currentRoleName) || 'Нет роли';
  const autoTargetRoleName = normalizeText(profile.autoTargetRoleName);
  const allRoleNames = Array.isArray(profile.allRoleNames)
    ? profile.allRoleNames.map(role => normalizeText(role)).filter(Boolean)
    : [];

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const risks: string[] = [];

  if (activityScore >= 140) {
    strengths.push(`очень высокая общая активность (${activityScore} очк.)`);
  } else if (activityScore >= 60) {
    strengths.push(`стабильная активность (${activityScore} очк.)`);
  } else {
    weaknesses.push(`активность пока низкая (${activityScore} очк.)`);
  }

  if (messages >= 60) {
    strengths.push(`много сообщений в Discord (${messages})`);
  } else if (messages < 10) {
    weaknesses.push(`очень мало сообщений (${messages})`);
  }

  if (voiceHours >= 5) {
    strengths.push(`хорошая голосовая вовлечённость (${voiceHours.toFixed(1)} ч)`);
  } else if (voiceHours < 1) {
    weaknesses.push(`почти нет голосовой активности (${voiceHours.toFixed(1)} ч)`);
  }

  if (points >= 70) {
    strengths.push(`сильная репутация (${points}/100)`);
  } else if (points <= 30) {
    risks.push(`слабая репутация (${points}/100)`);
  }

  if (commends > warns) {
    strengths.push(`похвалы перевешивают преды (${commends} vs ${warns})`);
  }

  if (warns >= 3) {
    risks.push(`много дисциплинарных отметок (${warns})`);
  } else if (warns > 0) {
    weaknesses.push(`есть преды (${warns})`);
  }

  if (inactiveDays >= 7) {
    risks.push(`долгая неактивность (${inactiveDays.toFixed(1)} дн.)`);
  } else if (inactiveDays >= 3) {
    weaknesses.push(`есть AFK-риск (${inactiveDays.toFixed(1)} дн. без активности)`);
  } else {
    strengths.push(`недавняя активность (${inactiveDays.toFixed(1)} дн. назад)`);
  }

  if (autoTargetRoleName && autoTargetRoleName !== currentRoleName) {
    strengths.push(`по авто-рангу уже тянет на ${autoTargetRoleName}`);
  }

  if (!strengths.length) {
    strengths.push('критичных минусов по статистике не найдено');
  }

  if (!weaknesses.length) {
    weaknesses.push('заметных слабых мест по метрикам сейчас нет');
  }

  if (!risks.length) {
    risks.push('явных красных флагов по цифрам нет');
  }

  let recommendation = 'ОСТАВИТЬ В ТЕКУЩЕМ РАНГЕ';
  let action = 'наблюдать дальше';

  if (inactiveDays >= 7 && messages <= 5 && voiceHours < 1 && points <= 20) {
    recommendation = 'КИК / ЧИСТКА ЗА AFK';
    action = 'проверить причину отсутствия и кикнуть, если игрок не выходит на связь';
  } else if (inactiveDays >= 3) {
    recommendation = 'ПРЕДУПРЕДИТЬ ОБ AFK';
    action = 'отправить предупреждение и дать короткий срок на возврат в актив';
  } else if (warns >= 3 && points <= 40) {
    recommendation = 'ДИСЦИПЛИНАРНАЯ ПРОВЕРКА';
    action = 'не повышать и отдельно разобрать поведение участника';
  } else if (autoTargetRoleName && autoTargetRoleName !== currentRoleName && activityScore >= 50 && points >= 45) {
    recommendation = `РАССМОТРЕТЬ ПОВЫШЕНИЕ ДО ${autoTargetRoleName.toUpperCase()}`;
    action = `проверить качество активности и при желании повысить с ${currentRoleName} до ${autoTargetRoleName}`;
  } else if (points >= 75 && commends >= warns + 2 && (messages >= 25 || voiceHours >= 3)) {
    recommendation = 'ПООЩРИТЬ / ОТМЕТИТЬ';
    action = 'можно выдать похвалу или отметить участника в семье';
  }

  const summary = [
    `Участник: ${normalizeText(profile.displayName) || 'Без имени'}`,
    `Текущий ранг: ${currentRoleName}`,
    `Роли Discord: ${allRoleNames.length ? allRoleNames.join(', ') : 'нет ролей'}`,
    `Очки активности: ${activityScore}`,
    `Репутация: ${points}/100`,
    `Сообщения: ${messages}`,
    `Голос: ${voiceHours.toFixed(1)} ч`,
    `Похвалы / преды: ${commends} / ${warns}`,
    `Цель авто-ранга: ${autoTargetRoleName || 'совпадает с текущим или недоступна'}`
  ];

  return [
    '1. Сводка',
    `- ${summary.join('\n- ')}`,
    '',
    '2. Сильные стороны',
    `- ${strengths.join('\n- ')}`,
    '',
    '3. Слабые места и риски',
    `- ${[...weaknesses, ...risks].join('\n- ')}`,
    '',
    `4. Рекомендация: ${recommendation}`,
    `- Следующее действие: ${action}`
  ].join('\n');
}

export function createAIService({
  enabled,
  chatCompletion
}: {
  enabled: boolean;
  chatCompletion?: ChatCompletionLike | null;
}): AIService {
  async function aiText(_systemPrompt: string, userPrompt: string): Promise<string> {
    if (!enabled) {
      throw new Error(copy.ai.disabled);
    }

    const external = await safeChat(chatCompletion || undefined, [
      {
        role: 'system',
        content: [
          _systemPrompt || 'Ты помощник Discord-семьи.',
          'Отвечай по-русски, понятно и по делу.',
          'По умолчанию давай один готовый ответ, а не несколько вариантов.',
          'Если пользователь просит текст или объявление, сразу пиши готовый текст без пояснений.',
          'Не раскрывай токены, секреты и приватные данные.'
        ].join(' ')
      },
      { role: 'user', content: userPrompt }
    ]);
    if (external) return external;

    return buildOfflineReply(userPrompt);
  }

  async function analyzeApplication(application: ApplicationAnalysisInput): Promise<string> {
    if (!enabled) {
      throw new Error(copy.ai.disabled);
    }

    const external = await safeChat(chatCompletion || undefined, [
      {
        role: 'system',
        content: [
          'Ты AI-советник Старшего состава Discord-семьи.',
          'Проанализируй заявку кандидата по-русски.',
          'Не принимай финальное решение вместо администрации.',
          'Структура ответа: оглавление, общая информация, сильные стороны, возможные риски, совпадение с ценностями, рекомендация, итог.',
          'Пиши аккуратно, без технического ID заявки, кандидат должен быть указан как Discord mention/name, если он есть.'
        ].join(' ')
      },
      { role: 'user', content: `Данные заявки:\n${formatApplicationForModel(application)}` }
    ]);
    if (external) return external;

    return buildApplicationAnalysis(application);
  }

  async function analyzeMember(profile: MemberRecommendationInput): Promise<string> {
    if (!enabled) {
      throw new Error(copy.ai.disabled);
    }

    const external = await safeChat(chatCompletion || undefined, [
      {
        role: 'system',
        content: [
          'Ты AI-советник по участникам Discord-семьи.',
          'На основе статистики дай полезный разбор участника: активность, риски, выговоры, баллы, голос, сообщения и рекомендацию для старшего состава.',
          'Не выдумывай факты, используй только переданные данные.',
          'Пиши по-русски, структурно и без лишней воды.'
        ].join(' ')
      },
      { role: 'user', content: `Данные участника:\n${formatMemberForModel(profile)}` }
    ]);
    if (external) return external;

    return buildMemberRecommendation(profile);
  }

  return {
    aiText,
    analyzeApplication,
    analyzeMember
  };
}

export default createAIService;
