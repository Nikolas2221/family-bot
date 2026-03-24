const releaseNotes = {
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
  },
  '0.1.0-beta.3': {
    added: [
      'TypeScript-инфраструктура проекта',
      'команды typecheck и build:ts',
      'typed-слой src-ts для config, roles и release notes',
      'typed-контракты для database и storage',
      'автопроверка наличия changelog для текущего semver'
    ],
    updated: [
      'структура проекта для поэтапной миграции JS -> TypeScript',
      'система changelog по semver',
      'карточка обновления для текущих технических релизов'
    ],
    fixed: [
      'рассинхронизация между реальным обновлением и текстом changelog'
    ]
  }
};

function normalizeReleaseGroups(groups) {
  return {
    added: Array.isArray(groups?.added) ? groups.added.filter(Boolean).slice(0, 6) : [],
    updated: Array.isArray(groups?.updated) ? groups.updated.filter(Boolean).slice(0, 6) : [],
    fixed: Array.isArray(groups?.fixed) ? groups.fixed.filter(Boolean).slice(0, 6) : []
  };
}

function getReleaseNotes(version) {
  const key = String(version || '').trim();
  if (!key) return null;
  const groups = releaseNotes[key];
  if (!groups) return null;
  return normalizeReleaseGroups(groups);
}

module.exports = {
  releaseNotes,
  getReleaseNotes,
  normalizeReleaseGroups
};
