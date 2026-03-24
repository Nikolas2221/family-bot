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
      'карточка обновления для технических релизов'
    ],
    fixed: [
      'рассинхронизация между реальным обновлением и текстом changelog'
    ]
  },
  '0.1.0-beta.4': {
    added: [
      'typed-обёртки для commands, copy, automod, security и ai',
      'typed-обёртки для embeds, applications и ranks',
      'новые TS-контракты для automod, AI, security и rank-сервисов'
    ],
    updated: [
      'слой src-ts для среднего и бизнес-модульного уровня',
      'типизация API вокруг действующего JS runtime',
      'подготовка проекта к переносу главного index на TypeScript'
    ],
    fixed: [
      'разрывы типизации между модулями перед следующим этапом миграции'
    ]
  },
  '0.1.0-beta.5': {
    added: [
      'TS-entrypoint src-ts/index.ts',
      'typed runtime-meta для версий и changelog',
      'команда start:ts для запуска через собранный TS-билд'
    ],
    updated: [
      'npm run check теперь автоматически включает typecheck',
      'маршрут миграции проекта к полноценному TS-runtime',
      'структура сборки dist-ts для следующих этапов перевода index'
    ],
    fixed: [
      'подготовка точки входа перед переносом главного index.js'
    ]
  },
  '0.1.0-beta.6': {
    added: [
      'TypeScript-модули interaction helpers, guild runtime и access API',
      'TS-фабрика guild settings и guild storage, подключённая к текущему JS runtime',
      'автоматическая сборка TypeScript перед npm start'
    ],
    updated: [
      'index.js теперь использует TS runtime-meta и shared helper-слой',
      'changelog группируется через единый typed runtime-meta',
      'стартовый путь подготовлен к поэтапному переносу index.js в index.ts'
    ],
    fixed: [
      'дубли логики ephemeral, guild settings и access между JS и TS слоями',
      'сигнатура сборки теперь собирается через общий runtime-meta'
    ]
  },
  '0.1.0-beta.7': {
    added: [
      'плоский dist-ts layout для runtime-модулей TypeScript',
      'hotfix-релиз для Railway-старта после подключения TS runtime'
    ],
    updated: [
      'tsconfig теперь собирает runtime-модули напрямую в папку dist-ts',
      'путь npm start и JS-runtime выровнен под Railway и Node require'
    ],
    fixed: [
      'ошибка Cannot find module ./dist-ts/access при запуске',
      'layout dist-ts после сборки TypeScript'
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
