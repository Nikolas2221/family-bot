import type { ReleaseNoteGroups } from './types';

export const releaseNotes: Record<string, ReleaseNoteGroups> = {
  '1.0.2': {
    added: [
      'отдельный hotfix-релиз для команд, DM-уведомлений и служебных embed-ов'
    ],
    updated: [
      'личные уведомления о принятии, рангах, дисциплине, blacklist и AFK переведены на чистый UTF-8 текст',
      'maintenance-отчёты, changelog fallback и служебные подписи больше не показывают битую кодировку',
      'валидация заявок жёстче режет бессмысленный текст до создания тикета'
    ],
    fixed: [
      'ошибки interaction runtime для /help, /family, /adminpanel и других slash-команд после релиза 1.0.0',
      'битые строки в личных сообщениях, activity report, leaderboard и maintenance-embed',
      'удаление тикета после принятия заявки стало надёжнее и чище'
    ]
  },
  '1.0.1': {
    added: [],
    updated: [
      'slash-команды снова работают через TS command runtime',
      'лидерборд, activity report и server report получили чистый UTF-8 текст',
      'удаление тикета после принятия стало жёстче и надёжнее'
    ],
    fixed: [
      'ошибки ephemeral, buildProfilePayload, addCommend и isAiCommandOverviewQuery в command runtime',
      'битая кодировка в таблице участников, отчётах и админ-панели',
      'слишком слабая проверка анкеты от бессмысленного текста'
    ]
  },
  '1.0.0': {
    added: [
      'полноценный релиз BRHD/PHOENIX 1.0',
      'TypeScript-managed runtime для команд, interaction-сценариев и clientReady',
      'стабильный production-старт через dist-ts/index.js'
    ],
    updated: [
      'index.js превращён в тонкий bootstrap-слой над TypeScript runtime',
      'основной command, event и interaction-flow выровнен под единый runtime-контур',
      'система версий и changelog переведена на релизный semver'
    ],
    fixed: [
      'скрытые legacy-дубли interaction runtime и command-flow',
      'расхождения между JS bootstrap и TS-managed runtime слоями'
    ]
  }
};

export function normalizeReleaseGroups(groups?: Partial<ReleaseNoteGroups> | null): ReleaseNoteGroups {
  return {
    added: Array.isArray(groups?.added) ? groups.added.filter(Boolean).slice(0, 6) : [],
    updated: Array.isArray(groups?.updated) ? groups.updated.filter(Boolean).slice(0, 6) : [],
    fixed: Array.isArray(groups?.fixed) ? groups.fixed.filter(Boolean).slice(0, 6) : []
  };
}

export function getReleaseNotes(version?: string | null): ReleaseNoteGroups | null {
  const key = String(version || '').trim();
  if (!key) return null;
  const groups = releaseNotes[key];
  if (!groups) return null;
  return normalizeReleaseGroups(groups);
}
