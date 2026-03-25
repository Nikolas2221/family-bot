import type { ReleaseNoteGroups } from './types';

export const releaseNotes: Record<string, ReleaseNoteGroups> = {
  '1.0.0': {
    added: [
      'полноценный релиз BRHD/PHOENIX 1.0',
      'TypeScript-managed runtime для команд, interaction-сценариев, событий и clientReady',
      'стабильный production-старт через dist-ts/index.js'
    ],
    updated: [
      'index.js превращён в тонкий bootstrap-слой над TypeScript runtime',
      'основной command, event и interaction-flow выровнен под единый runtime-контур',
      'система версий и changelog переведена с beta-цикла на полноценный релизный semver'
    ],
    fixed: [
      'скрытые legacy-дубли interaction runtime и command-flow',
      'расхождения между JS bootstrap и TS-managed runtime слоями'
    ]
  },
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
      'структура проекта для поэтапной миграции JS в TypeScript',
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
      'дубли логики ephemeral, guild settings и access между JS и TS слоями'
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
  },
  '0.1.0-beta.8': {
    added: [
      'TypeScript-модуль client-ready-runtime для старта, фоновых задач и guild warmup',
      'typed-регистрация central runtime для clientReady поверх текущего JS entrypoint'
    ],
    updated: [
      'главный startup pipeline теперь уходит через dist-ts/client-ready-runtime',
      'подготовка проекта к переносу оставшегося index.js runtime в src-ts/index.ts'
    ],
    fixed: [
      'дублирование startup-логики между подготовленным TS-слоем и боевым рантаймом',
      'точка подключения typed clientReady без ручной правки всего index.js за один релиз'
    ]
  },
  '0.1.0-beta.9': {
    added: [
      'TypeScript-модуль event-runtime для сообщений, участников, реакций и channel guard',
      'central runtime-регистрация событийного слоя поверх текущего JS entrypoint'
    ],
    updated: [
      'событийный runtime теперь подключается через dist-ts/event-runtime',
      'подготовка index.js к переносу interaction и remaining listeners в TypeScript'
    ],
    fixed: [
      'разрозненная регистрация message/member/reaction listeners между JS и TS слоями',
      'безопасный перенос событийной логики без остановки рабочего рантайма'
    ]
  },
  '0.1.0-beta.10': {
    added: [
      'TypeScript-модуль interaction-runtime для unified interactionCreate-обработки',
      'central runtime-обёртка для welcome, autorole, verification, role menus и custom commands'
    ],
    updated: [
      'interactionCreate теперь управляется через dist-ts/interaction-runtime',
      'index.js переведён на единую TS-managed точку регистрации interaction-слоя'
    ],
    fixed: [
      'параллельные interactionCreate listeners между командными и UI-модулями',
      'поэтапная миграция interaction runtime без отключения боевого entrypoint'
    ]
  },
  '0.1.0-beta.11': {
    added: [],
    updated: [
      'карточка обновления теперь берёт чистый UTF-8 changelog без битой кодировки',
      'релизные заметки выровнены между JS и TS слоями'
    ],
    fixed: [
      'кракозябры в блоках Добавлено, Обновлено и Исправлено',
      'рассинхронизация текста changelog между semver-релизами'
    ]
  },
  '0.1.0-beta.12': {
    added: [
      'TypeScript-модуль command-runtime для базовых семейных и админских slash-команд',
      'полная TS-обработка reactionrole add/remove внутри unified interaction runtime'
    ],
    updated: [
      'handlePrimaryInteraction теперь передаёт family/apply/help/setup/setrole/setchannel/setfamilytitle/setmode/setmodule/setart в TS-слой',
      'interaction runtime использует единый источник reaction-role записей и нормализации эмодзи'
    ],
    fixed: [
      'регрессия reactionrole add/remove после переноса interactionCreate в TypeScript',
      'дублирование базового command-flow между legacy index.js и новым TS runtime'
    ]
  },
  '0.1.0-beta.13': {
    added: [
      'очистка legacy-слушателей ready, events и interaction из JS-runtime'
    ],
    updated: [
      'index.js теперь опирается на TS-managed client-ready, event и interaction слои без мёртвых дублей',
      'runtime-поток подготовлен к следующему этапу полного старта через dist-ts/index.js'
    ],
    fixed: [
      'риск скрытых дублей и регрессий из-за сохранённого legacy runtime в index.js'
    ]
  },
  '0.1.0-beta.14': {
    added: [
      'TypeScript-обработка оставшихся moderation, security, reports, discipline и AI slash-команд'
    ],
    updated: [
      'handleCommandRuntime теперь покрывает практически весь боевой slash-command слой',
      'TS command-runtime получил полный набор runtime helper-функций для moderation, blacklist, отчётов и AI'
    ],
    fixed: [
      'риск расхождения логики между ранними TS-командами и оставшимся legacy slash-command хвостом'
    ]
  },
  '0.1.0-beta.15': {
    added: [
      'TypeScript-обработка оставшихся moderation, security, reports, discipline и AI slash-команд',
      'боевой запуск через TS entrypoint bridge dist-ts/index.js'
    ],
    updated: [
      'handleCommandRuntime теперь покрывает практически весь боевой slash-command слой',
      'npm start теперь идёт через TypeScript entrypoint bridge вместо прямого node index.js',
      'main-точка пакета переведена на dist-ts/index.js для следующего полного TS-релиза'
    ],
    fixed: [
      'расхождение между build-путём TypeScript и фактическим стартом бота в production',
      'риск расхождения логики между ранними TS-командами и оставшимся legacy slash-command хвостом'
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
