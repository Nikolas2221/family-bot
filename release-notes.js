const releaseNotes = {
  '1.0.4': {
    added: [
      'финальный UTF-8 override-слой для family panel, help, welcome, leaderboard, voice и admin panel'
    ],
    updated: [
      'карточки семьи и family menu теперь используют единый чистый текстовый слой без битой кодировки',
      'update-log, role menus, automod status и report schedule выровнены по нормальному русскому тексту',
      'release notes синхронизированы с текущим релизом и больше не тянут битый changelog'
    ],
    fixed: [
      'битые слова в family panel, leaderboard, voice activity и admin panel',
      'битые строки в карточке welcome, update-log и role menu status',
      'риск повторного появления кракозябр из-за старого release-notes слоя'
    ]
  },
  '1.0.3': {
    added: [
      'чистый UTF-8 слой для embed-карточек, админ-панели, leaderboard и update-log'
    ],
    updated: [
      'automod bad words теперь принимает списки слов через запятую как отдельные слова',
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
