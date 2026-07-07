import type { AutomodConfig, CopyCatalog, ReleaseNoteGroups } from './types';

type HelpCommandEntry = {
  name: string;
  description: string;
};

type HelpCatalog = {
  regularCommands: HelpCommandEntry[];
  adminCommands: HelpCommandEntry[];
};

type AutomodRulePatch = Partial<
  Pick<
    AutomodConfig,
    'invitesEnabled' | 'linksEnabled' | 'capsEnabled' | 'mentionsEnabled' | 'spamEnabled' | 'badWordsEnabled'
  >
>;

type AutomodTargetPatch = Partial<
  Pick<AutomodConfig, 'capsPercent' | 'capsMinLength' | 'mentionLimit' | 'spamCount' | 'spamWindowSeconds'>
>;

type BuildAiCommandsOverviewInput = {
  catalog: HelpCatalog;
  isPremium: boolean;
  userId: string;
  copy: Pick<CopyCatalog, 'ai'>;
};

export function isAiCommandOverviewQuery(query: unknown): boolean {
  const value = String(query || '').toLowerCase();
  return (
    value.includes('что я умею') ||
    value.includes('что ты умеешь') ||
    value.includes('что мне доступно') ||
    value.includes('какие команды') ||
    value.includes('что я могу') ||
    value.includes('что ты можешь') ||
    value.includes('что можешь') ||
    value.includes('мои команды')
  );
}

export function isAiNicknameRequest(query: unknown, targetUser: unknown, newNickname: unknown): boolean {
  if (!targetUser || !newNickname) return false;
  const value = String(query || '').toLowerCase();
  return (
    value.includes('смени ник') ||
    value.includes('измени ник') ||
    value.includes('переименуй') ||
    value.includes('rename nick')
  );
}

export function buildAiCommandsOverview({
  catalog,
  isPremium,
  userId,
  copy
}: BuildAiCommandsOverviewInput): string {
  const available = [...catalog.regularCommands, ...catalog.adminCommands];

  if (!available.length) {
    return copy.ai.commandsOverviewEmpty;
  }

  const planLabel = isPremium ? 'Premium' : 'Free';
  return [
    '🤖 Что я могу',
    '',
    `${copy.ai.commandsOverviewTitle}:`,
    `План: **${planLabel}**`,
    `Пользователь: <@${userId}>`,
    '',
    'Я могу вести семью и сервер: состав, заявки, роли, активность, отчёты, Telegram-связку, защиту, тикеты, AFK и AI-помощника.',
    '',
    '**Основные возможности**',
    '• Состав семьи: роли, онлайн-статусы, баллы, выговоры, топ активности.',
    '• Заявки: анкета, принятие/отказ, DM кандидату, логи и Telegram-дубляж.',
    '• Telegram ↔ Discord: объявления, события, заявки, AFK, ответы в тикеты.',
    '• Модерация: warn, commend, mute, purge, slowmode, blacklist и ban-list.',
    '• Защита: anti-scam, leak/channel guard, emergency lockdown, отчёты в Discord и Telegram.',
    '• Backup Discord: сохранение структуры сервера в GitHub и restore ролей/каналов.',
    '• Тикеты: приватные обращения, закрытие, claim, add/remove участников и логи.',
    '• AFK-отпуска: постоянная панель, заявки, одобрение/отказ в Discord и Telegram.',
    '• Отчёты и медиа: отдельные формы отчётов, публикация видео/стримов, логи.',
    '• AI и законка: /law по базе документов, AI-совет по участникам и командам.',
    '',
    '**Доступные тебе команды**',
    ...available.map((command) => `/${command.name} - ${command.description}`)
  ].join('\n').slice(0, 1900);
}

export function getUpdateChangeGroups(
  commitMessage: string,
  resolver: (commitMessage?: string | null) => ReleaseNoteGroups
): ReleaseNoteGroups {
  return resolver(commitMessage);
}

export function getAutomodStateKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

export function buildAutomodRulePatch(rule: string, state: boolean): AutomodRulePatch {
  switch (rule) {
    case 'invites':
      return { invitesEnabled: state };
    case 'links':
      return { linksEnabled: state };
    case 'caps':
      return { capsEnabled: state };
    case 'mentions':
      return { mentionsEnabled: state };
    case 'spam':
      return { spamEnabled: state };
    case 'badWords':
      return { badWordsEnabled: state };
    default:
      return {};
  }
}

export function getAutomodTargetLimits(target: string, value: number): AutomodTargetPatch {
  switch (target) {
    case 'capsPercent':
      return { capsPercent: Math.max(50, Math.min(100, value)) };
    case 'capsMinLength':
      return { capsMinLength: Math.max(4, Math.min(200, value)) };
    case 'mentionLimit':
      return { mentionLimit: Math.max(2, Math.min(50, value)) };
    case 'spamCount':
      return { spamCount: Math.max(3, Math.min(20, value)) };
    case 'spamWindowSeconds':
      return { spamWindowSeconds: Math.max(3, Math.min(60, value)) };
    default:
      return {};
  }
}

export function isPremiumAutomodRule(rule: string): boolean {
  return rule === 'spam' || rule === 'badWords';
}

export function isPremiumAutomodTarget(target: string): boolean {
  return target === 'spamCount' || target === 'spamWindowSeconds';
}
