import type { ReleaseNoteGroups } from './types';

export const releaseNotes: Record<string, ReleaseNoteGroups> = {
  '0.1.0-beta.2': {
    added: [
      'автопост недельных и месячных отчётов',
      'welcome 2.0 с DM-вступлением и onboarding-кнопками',
      'несколько role-menu и панели ролей',
      'custom commands и автоответы по триггерам',
      'verification-flow с анкетой и ролью после подтверждения'
    ],
    updated: [
      'automod: bad words, ссылки, капс, упоминания и флуд',
      'окно обновлений и формат changelog',
      'меню welcome, autorole и reaction roles',
      'расписание и оформление серверных отчётов'
    ],
    fixed: [
      'синхронизация команд на старте',
      'критический путь запуска guild warmup'
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
