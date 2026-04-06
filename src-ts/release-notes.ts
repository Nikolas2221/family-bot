import type { ReleaseNoteGroups } from './types';

export const releaseNotes: Record<string, ReleaseNoteGroups> = {
  '1.0.10': {
    added: [
      'финальный тест миграции теперь сканирует весь src-ts и не позволяет снова тянуть корневые JS-модули',
      'формальная проверка production entrypoint закреплена на dist-ts/index.js'
    ],
    updated: [
      'copy и embeds окончательно закреплены как source of truth внутри src-ts',
      'TypeScript-переезд закрыт на уровне боевого рантайма и исходного слоя приложения'
    ],
    fixed: [
      'случайный возврат импортов вида ../copy и ../embeds теперь ловится до релиза',
      'проверка TS-миграции больше не ограничена двумя файлами и покрывает весь src-ts'
    ]
  },
  '1.0.9': {
    added: [
      'последние source-файлы copy и embeds перенесены в src-ts как часть TS runtime',
      'добавлена проверка миграции, чтобы src-ts больше не тянул ../copy и ../embeds'
    ],
    updated: [
      'TS runtime теперь берёт copy и embed-builder слой из src-ts source of truth',
      'команда check теперь собирает dist-ts перед полным прогоном проверок'
    ],
    fixed: [
      'стык между dist-ts/embeds и dist-ts/copy больше не ломает panelButtons и живые embed-экраны',
      'voiceLine и короткие UI-метки вроде ЧС/Голос/Статус проходят через единый TS repair-слой'
    ]
  },
  '1.0.8': {
    added: [],
    updated: [
      'guildStorage bound-context переведен на явные guild-scoped имена без двуглавого API',
      'TS runtime теперь читает member, points, voice и activity через единый storage-context',
      'история release notes очищена и приведена к нормальному UTF-8'
    ],
    fixed: [
      'устранена двусмысленность между storage API и guild-bound storage helper',
      'event, rank, profile и report слои больше не используют старые global-style методы storage'
    ]
  },
  '1.0.7': {
    added: [],
    updated: [
      'финальный чистый текстовый слой для family panel, profile, leaderboard, voice, reports и admin panel',
      'TS copy-repair шире распознает mojibake и добирается до хвостовых уведомлений'
    ],
    fixed: [
      'битые статус и ранг в профиле участника',
      'битые строки в family panel, leaderboard, activity report и report summary',
      'кнопка ЧС и help/page тексты больше не перетираются сломанным override-слоем'
    ]
  },
  '1.0.6': {
    added: [
      'чистый guild-storage helper для единого TS runtime-контекста',
      'финальный UTF-8 override для family panel, profile, voice, reports и admin panel'
    ],
    updated: [
      'TS command runtime теперь берет guild storage context из guild-runtime, а не напрямую из storage',
      'живые пользовательские embed-экраны переведены на чистые русские строки без битой кодировки'
    ],
    fixed: [
      'поломка команды голос из-за voiceLine и this.hours',
      'битые статусы и ранги в профиле',
      'битые строки в family panel, leaderboard, help и activity UI'
    ]
  },
  '1.0.5': {
    added: [],
    updated: [
      'панель семьи больше не зависит от агрессивного text-repair для коротких кириллических меток',
      'слой release notes переведен на чистый UTF-8 без битых строк в исходниках'
    ],
    fixed: [
      'кнопка ЧС в панели семьи больше не превращается в !',
      'TS repair-слой больше не ломает уже нормальный кириллический текст'
    ]
  },
  '1.0.4': {
    added: [
      'финальный UTF-8 override-слой для family panel, help, welcome, leaderboard, voice и admin panel'
    ],
    updated: [
      'карточки семьи и family menu используют единый чистый текстовый слой без битой кодировки',
      'update-log, role menus, automod status и report schedule выровнены по нормальному русскому тексту',
      'release notes синхронизированы с текущим релизом и больше не тянут битый changelog'
    ],
    fixed: [
      'битые слова в family panel, leaderboard, voice activity и admin panel',
      'битые строки в welcome, update-log и role menu status',
      'риск повторного появления кракозябр из-за старого слоя release-notes'
    ]
  },
  '1.0.3': {
    added: [
      'чистый UTF-8 слой для embed-карточек, админ-панели, leaderboard и update-log'
    ],
    updated: [
      'automod bad words теперь принимает список слов через запятую как отдельные слова',
      'статусы welcome, verification, role menu, reports и custom commands переведены на чистые тексты',
      'пользовательские уведомления и changelog теперь берутся из нормализованного релизного словаря'
    ],
    fixed: [
      'битые слова в leaderboard, activity report, админ-панели и update-card',
      'ошибочные ответы automod action/words после перехода на TS command runtime',
      'путаница со stop-словами, когда список через запятую воспринимался как одна строка'
    ]
  },
  '1.0.2': {
    added: [
      'отдельный hotfix-релиз для команд, DM-уведомлений и служебных embed-ов'
    ],
    updated: [
      'личные уведомления о принятии, рангах, дисциплине, blacklist и AFK переведены на чистый UTF-8 текст',
      'maintenance-отчеты, changelog fallback и служебные подписи больше не показывают битую кодировку',
      'валидация заявок жестче режет бессмысленный текст до создания тикета'
    ],
    fixed: [
      'ошибки interaction runtime для /help, /family, /adminpanel и других slash-команд после релиза 1.0.0',
      'битые строки в личных сообщениях, activity report, leaderboard и maintenance-embed',
      'удаление тикета после принятия заявки стало надежнее и чище'
    ]
  },
  '1.0.1': {
    added: [],
    updated: [
      'slash-команды снова работают через TS command runtime',
      'leaderboard, activity report и server report получили чистый UTF-8 текст',
      'удаление тикета после принятия стало жестче и надежнее'
    ],
    fixed: [
      'ошибки ephemeral, buildProfilePayload, addCommend и isAiCommandOverviewQuery в command runtime',
      'битая кодировка в таблице участников, отчетах и админ-панели',
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
      'index.js превращен в тонкий bootstrap-слой над TypeScript runtime',
      'основной command, event и interaction-flow выровнен под единый runtime-контур',
      'система версий и changelog переведена на релизный semver'
    ],
    fixed: [
      'скрытые legacy-дубли interaction runtime и command-flow',
      'расхождения между JS bootstrap и TS-managed runtime слоями'
    ]
  }
};

export function normalizeReleaseGroups(groups?: ReleaseNoteGroups | null): ReleaseNoteGroups {
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
