import { createOpenRouterChatCompletion } from './deepseek';

export interface PlayerData {
  userId: string;
  nickname: string;
  joinedAt: string;
  roles: string[];
  activityScore: number;
  points: number;
  warns: number;
  commends: number;
  voiceMinutes: number;
  messageCount: number;
  lastSeenAt: number;
  lastMessageAt: number;
  lastVoiceAt: number;
  weekMessages: number;
  weekVoiceMinutes: number;
}

export function getPlayerData(
  member: any,
  guildStorage: any,
  guildAnalytics: any,
  guildId: string
): PlayerData {
  const userId = member.id;
  const nickname = member.displayName || member.user?.username || 'Неизвестно';
  const joinedAt = member.joinedAt?.toISOString() || 'неизвестно';
  const roles = member.roles?.cache?.map((r: any) => r.name) || [];

  const memberRecord = guildStorage.ensureGuildMember(guildId, userId);
  const activityScore = guildStorage.guildActivityScore(guildId, userId);
  const points = guildStorage.guildPointsScore(guildId, userId);
  const warns = memberRecord.warns || 0;
  const commends = memberRecord.commends || 0;
  const voiceMinutes = guildStorage.guildVoiceMinutes(guildId, userId);
  const messageCount = memberRecord.messageCount || 0;
  const lastSeenAt = memberRecord.lastSeenAt || 0;
  const lastMessageAt = memberRecord.lastMessageAt || 0;
  const lastVoiceAt = memberRecord.lastVoiceAt || 0;

  const period = guildAnalytics.getGuildPeriodAnalytics(guildId, 7);
  const memberStats = period.members[userId];
  const weekMessages = memberStats?.messages || 0;
  const weekVoiceMinutes = memberStats?.voiceMinutes || 0;

  return {
    userId,
    nickname,
    joinedAt,
    roles,
    activityScore,
    points,
    warns,
    commends,
    voiceMinutes,
    messageCount,
    lastSeenAt,
    lastMessageAt,
    lastVoiceAt,
    weekMessages,
    weekVoiceMinutes
  };
}

function formatPlayerDataForAI(data: PlayerData): string {
  const lines = [
    `**Участник:** ${data.nickname} (ID: ${data.userId})`,
    `**Дата присоединения:** ${data.joinedAt}`,
    `**Роли:** ${data.roles.join(', ') || 'нет'}`,
    '',
    `**Актив-очки:** ${data.activityScore}`,
    `**Репутация (баллы):** ${data.points}`,
    `**Выговоры:** ${data.warns}`,
    `**Похвалы:** ${data.commends}`,
    `**Голосовые минуты (всего):** ${data.voiceMinutes}`,
    `**Сообщения (всего):** ${data.messageCount}`,
    '',
    `**Статистика за 7 дней:**`,
    `  - Сообщения: ${data.weekMessages}`,
    `  - Голосовые минуты: ${data.weekVoiceMinutes}`,
    '',
    `**Последняя активность:**`,
    `  - Последнее сообщение: ${data.lastMessageAt ? new Date(data.lastMessageAt).toLocaleString('ru-RU') : 'нет'}`,
    `  - Последний голос: ${data.lastVoiceAt ? new Date(data.lastVoiceAt).toLocaleString('ru-RU') : 'нет'}`,
    `  - Последний вход: ${data.lastSeenAt ? new Date(data.lastSeenAt).toLocaleString('ru-RU') : 'нет'}`
  ];
  return lines.join('\n');
}

export async function callAiAdvisor(
  playerData: PlayerData,
  question?: string
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.DEEPSEEK_API_KEY || '';
  if (!apiKey) {
    return '❌ API-ключ OpenRouter не настроен. Установи переменную OPENROUTER_API_KEY.';
  }
  const usesOpenRouter = Boolean(process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_MODEL || process.env.OPENROUTER_BASE_URL);
  const baseUrl = process.env.OPENROUTER_BASE_URL
    || process.env.DEEPSEEK_BASE_URL
    || (usesOpenRouter ? 'https://openrouter.ai/api/v1' : 'https://api.deepseek.com');
  const model = process.env.OPENROUTER_MODEL
    || process.env.DEEPSEEK_MODEL
    || (usesOpenRouter ? 'openrouter/free' : 'deepseek-chat');
  const timeoutMs = Math.max(1000, Number(process.env.AI_TIMEOUT_MS) || 30000);

  const completion = createOpenRouterChatCompletion({
    apiKey,
    baseUrl,
    model,
    timeoutMs
  });

  const dataText = formatPlayerDataForAI(playerData);

  let prompt: string;
  if (question && question.trim()) {
    prompt = `Ты AI-советник по участникам семьи. На основе следующих данных участника ответь на вопрос: "${question.trim()}".\n\nДанные участника:\n${dataText}`;
  } else {
    prompt = `Ты AI-советник по участникам семьи. На основе этих данных дай развернутый, умный анализ участника. Отметь его сильные стороны, активность, возможные проблемы (например, много выговоров) и дай рекомендации для семьи.\n\nДанные участника:\n${dataText}`;
  }

  const messages = [
    { role: 'system', content: 'Отвечай по-русски, красиво и структурированно. Используй эмодзи для наглядности.' },
    { role: 'user', content: prompt }
  ];

  const result = await completion.chat(messages);
  if (!result) {
    return '❌ AI не смог сгенерировать ответ. Попробуйте позже.';
  }

  return result;
}
