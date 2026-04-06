// @ts-nocheck
const copy = {
  defaults: {
    familyTitle: '🏠 Семья'
  },
  common: {
    noAccess: 'У тебя нет доступа к этому действию.',
    noDebugAccess: 'У тебя нет доступа к просмотру конфигурации бота.',
    unknownError: 'Произошла ошибка. Попробуй ещё раз.',
    cooldown(secondsLeft) {
      return `Подожди ${secondsLeft} сек. перед новой заявкой.`;
    }
  },
  commands: {
    familyDescription: 'Открыть меню семьи',
    applyDescription: 'Подать заявку в семью',
    applyPanelDescription: 'Отправить панель заявок',
    applicationsDescription: 'Показать последние заявки',
    setupDescription: 'Сохранить настройки текущего сервера',
    adminPanelDescription: 'Открыть админ-панель сервера',
    subscriptionDescription: 'Изменить подписку сервера',
    helpDescription: 'Показать доступные команды бота',
    setRoleDescription: 'Назначить семейную роль через Discord',
    setChannelDescription: 'Назначить канал бота через Discord',
    setFamilyTitleDescription: 'Изменить название семьи через Discord',
    setArtDescription: 'Назначить баннер для карточек бота',
    blacklistAddDescription: 'Добавить пользователя в чёрный список',
    blacklistRemoveDescription: 'Убрать пользователя из чёрного списка',
    blacklistListDescription: 'Показать чёрный список',
    testAcceptDescription: 'Тест красивого лога приёма',
    debugConfigDescription: 'Показать статус конфигурации бота',
    profileDescription: 'Профиль участника',
    userOptionName: 'пользователь',
    profileUserDescription: 'Кого посмотреть',
    targetUserDescription: 'Кому',
    reasonOptionName: 'причина',
    reasonDescription: 'Причина',
    commendDescription: 'Выдать похвалу',
    warnDescription: 'Выдать выговор',
    aiDescription: 'Оффлайн-помощник семьи',
    queryOptionName: 'запрос',
    queryDescription: 'Что нужно?',
    planOptionName: 'план',
    planDescription: 'Какой план установить',
    roleTargetOptionName: 'роль',
    roleTargetDescription: 'Какую семейную роль настроить',
    roleValueOptionName: 'значение',
    roleValueDescription: 'Какую Discord-роль использовать',
    channelTargetOptionName: 'канал',
    channelTargetDescription: 'Какой канал настроить',
    channelValueOptionName: 'значение',
    channelValueDescription: 'Какой текстовый канал использовать',
    familyTitleOptionName: 'название',
    familyTitleOptionDescription: 'Новое название семьи',
    artTargetOptionName: 'блок',
    artTargetDescription: 'Для какой карточки настроить баннер',
    artUrlOptionName: 'url',
    artUrlDescription: 'Ссылка на изображение или off для удаления',
    artTargetFamily: 'Панель семьи',
    artTargetApplications: 'Подача заявки'
  },
  roles: {
    leader: '🕴 Лидер',
    deputy: '🧠 Заместители',
    elder: '💼 Старшие',
    member: '👥 Участники',
    newbie: '🆕 Новички'
  },
  family: {
    menuTitle: '🌆 Панель семьи',
    menuDescription: 'Выбери действие ниже.',
    refreshButton: 'Обновить',
    profileButton: 'Профиль',
    leaderboardButton: 'Топ',
    voiceButton: 'Голос',
    applyButton: 'Подать заявку',
    adminApplicationsButton: 'Заявки',
    adminAiAdvisorButton: 'AI-совет',
    adminPanelButton: 'Админка',
    adminBlacklistButton: 'ЧС',
    adminReportButton: 'Отчёт',
    aiAdvisorModalTitle: 'AI-совет по участнику',
    aiAdvisorModalLabel: 'ID, @ник или имя участника',
    aiAdvisorModalPlaceholder: 'Оставь пустым для анализа себя',
    panelUpdated: 'Панель обновлена.',
    legend: '🟢 Онлайн • 🟡 Отошёл • ⛔ Не беспокоить • ⚫ Оффлайн',
    emptyMembers: 'Нет участников в выбранных ролях.',
    totalMembers(total) {
      return `Всего участников: ${total}`;
    },
    updateInterval(seconds) {
      return `Обновление каждые ${seconds} сек.`;
    },
    continued(name) {
      return `${name} — продолжение`;
    },
    points(value) {
      return `${value} очк.`;
    }
  },
  applications: {
    panelTitle: '📨 Заявки в семью',
    panelDescription: 'Нажми кнопку ниже, чтобы подать заявку в семью.',
    panelFooter: 'Majestic Style • Family Applications',
    embedTitle: '📝 Заявка в семью',
    source: 'Заявка',
    fieldUser: '👤 Пользователь',
    fieldNick: '📛 Ник',
    fieldAge: '🎂 Возраст',
    fieldText: '📄 Текст заявки',
    fieldId: '🆔 Номер заявки',
    applyModalTitle: 'Заявка в семью',
    applyModalNick: 'Ваш ник',
    applyModalAge: 'Ваш возраст',
    applyModalText: 'Почему хотите в семью',
    acceptModalTitle: 'Детали приёма',
    acceptModalReason: 'Причина приёма',
    acceptModalRank: 'На какой ранг принят',
    acceptModalReasonPlaceholder: 'Например: собеседование пройдено, адекватный и активный',
    acceptModalRankPlaceholder: 'Например: 1 ранг',
    acceptButton: '✅ Принять',
    aiButton: '🤖 AI-анализ',
    reviewButton: '🕒 На рассмотрении',
    rejectButton: '❌ Отклонить',
    channelMissing: 'Канал заявок не найден.',
    panelSent: 'Панель заявок отправлена в канал заявок.',
    sent: 'Заявка отправлена. Ожидай решения руководства.',
    invalidEmpty: 'Все поля заявки должны быть заполнены.',
    invalidShort: 'Текст заявки слишком короткий. Напиши хотя бы 10 символов.',
    invalidNonsense: 'Похоже, в заявке есть бессмысленный текст. Напиши нормальный ник, кто пригласил, откуда узнал и немного о себе.',
    notFound: 'Заявка не найдена.',
    closed(statusLabel) {
      return `Заявка уже закрыта: ${statusLabel}.`;
    },
    closedForReview(statusLabel) {
      return `Нельзя вернуть закрытую заявку в рассмотрение. Текущий статус: ${statusLabel}.`;
    },
    memberNotFound: 'Пользователь не найден на сервере.',
    roleAssignFailed: 'Не удалось выдать роль. Проверь права бота и позицию роли.',
    acceptedReply(userId) {
      return `✅ <@${userId}> принят в семью.`;
    },
    reviewReply: '🕒 Заявка переведена в статус "На рассмотрении".',
    rejectedReply(userId) {
      return `❌ <@${userId}> отклонён.`;
    },
    statusLabel(status) {
      const labels = {
        pending: 'На рассмотрении',
        review: 'На рассмотрении',
        accepted: 'Принята',
        rejected: 'Отклонена'
      };
      return labels[status] || status;
    },
    description(source, userId, status) {
      return `> **${source} от <@${userId}>**\n> Статус: **${status}**`;
    },
    acceptedFooter(username) {
      return `Принял: ${username}`;
    },
    reviewFooter(username) {
      return `Рассматривает: ${username}`;
    },
    rejectedFooter(username) {
      return `Отклонил: ${username}`;
    },
    acceptReason: 'Собеседование',
    acceptRank: '1 ранг',
    rejectReason: 'Отказ по решению руководства'
  },
  logs: {
    acceptTitle: '🏠 Отчёт о приёме в семью',
    acceptDescription(moderatorId, memberId) {
      return `**<@${moderatorId}> принимает <@${memberId}> в семью**`;
    },
    acceptedMember: '👤 Принят в семью',
    acceptedBy: '🕴 Кто принял',
    acceptDetails: '📋 Детали приёма',
    rejectTitle: '❌ Отчёт об отказе',
    rejectDescription(moderatorId, userId) {
      return `**<@${moderatorId}> отклоняет заявку <@${userId}>**`;
    },
    candidate: '👤 Кандидат',
    rejectedBy: '🕴 Кто отклонил',
    reason: '📋 Причина',
    warnTitle: '⚠️ Выговор',
    warnDescription(moderatorId, userId) {
      return `**<@${moderatorId}> выдал выговор <@${userId}>**`;
    },
    commendTitle: '🏅 Похвала',
    commendDescription(moderatorId, userId) {
      return `**<@${moderatorId}> отметил <@${userId}>**`;
    },
    participant: '👤 Участник',
    moderator: '🕴 Выдал',
    familyLogFooter: 'Family Log System',
    disciplineLogFooter: 'Discipline Log',
    testAcceptSent: 'Тестовый лог отправлен в канал логов.',
    missingLogChannel: 'LOG_CHANNEL_ID не указан.'
  },
  profile: {
    title: '👤 Профиль участника',
    description(userId) {
      return `> Информация о <@${userId}>`;
    },
    fieldNick: '📛 Ник',
    fieldDiscord: '👤 Discord',
    fieldId: '🆔 ID',
    fieldRoles: '📌 Роли семьи',
    fieldActivity: '📈 Активность',
    fieldWarns: '⚠️ Выговоры',
    fieldCommends: '🏅 Похвалы',
    fieldMessages: '💬 Сообщения',
    fieldStatus: '🟢 Статус',
    fieldRank: '🏷 Ранг',
    fieldAutoRank: '📊 Авто-ранг',
    footer: 'Family Profile System',
    notFound: 'Участник не найден.',
    noRoles: 'Нет'
  },
  ranks: {
    promoteButton: 'Повысить',
    demoteButton: 'Понизить',
    autoSyncButton: 'Авто-ранг',
    noFamilyRole: 'У участника нет семейной роли.',
    promoted(userId, fromRole, toRole) {
      return `⬆️ <@${userId}> повышен: ${fromRole} -> ${toRole}.`;
    },
    demoted(userId, fromRole, toRole) {
      return `⬇️ <@${userId}> понижен: ${fromRole} -> ${toRole}.`;
    },
    autoApplied(userId, fromRole, toRole, score) {
      return `📊 Авто-ранг применён для <@${userId}>: ${fromRole} -> ${toRole} (${score} очк.).`;
    },
    topRank(roleName) {
      return `${roleName} уже является максимальным рангом.`;
    },
    bottomRank(roleName) {
      return `${roleName} уже является минимальным рангом.`;
    },
    alreadySynced(roleName, score) {
      return `📊 Авто-ранг уже совпадает с текущим рангом: ${roleName} (${score} очк.).`;
    },
    manualOnly(roleName) {
      return `${roleName} управляется только вручную.`;
    },
    autoDisabled: 'Авто-ранги выключены.',
    autoUnavailable: 'Авто-ранг сейчас недоступен.',
    autoStatus(targetRoleName, score) {
      return `Цель: ${targetRoleName} • Очки: ${score}`;
    }
  },
  discipline: {
    warnReply(userId) {
      return `⚠️ Выговор выдан <@${userId}>.`;
    },
    commendReply(userId) {
      return `🏅 Похвала выдана <@${userId}>.`;
    }
  },
  list: {
    title: '🗂 Последние заявки',
    empty: 'Нет заявок',
    line(index, application) {
      return `${index + 1}. \`${application.id}\` • <@${application.discordId}> • ${copy.applications.statusLabel(application.status)}`;
    }
  },
  ai: {
    buttonTitle: '🤖 AI-анализ заявки',
    buttonFooter(applicationId) {
      return `Заявка ${applicationId}`;
    },
    unavailable(errorMessage) {
      return `AI временно недоступен: ${errorMessage}`;
    },
    assistantPrompt:
      'Ты помощник семьи на RP-сервере. Отвечай по-русски, кратко, полезно, в стиле игрового помощника. Если просят текст, давай готовый вариант.',
    analysisPrompt: [
      'Ты помощник руководства семьи на RP-сервере.',
      'Анализируй заявку кратко и по делу.',
      'Пиши только на русском.',
      'Верни ответ в 4 блоках:',
      '1. Сильные стороны',
      '2. Слабые стороны',
      '3. Риск',
      '4. Рекомендация: ПРИНЯТЬ / РАССМОТРЕТЬ / ОТКЛОНИТЬ'
    ].join(' '),
    disabled: 'Оффлайн AI выключен. Проверь AI_ENABLED=true.',
    emptyPrompt: 'Напиши запрос, и я постараюсь помочь локально без внешнего API.',
    emptyResponse: 'Локальный AI не смог собрать ответ.'
  },
  security: {
    defaultBlacklistReason: 'Запрещён доступ на сервер',
    blacklistAdded(userId, reason) {
      return `⛔ <@${userId}> добавлен в чёрный список. Причина: ${reason}`;
    },
    blacklistUpdated(userId, reason) {
      return `⛔ <@${userId}> уже был в чёрном списке. Причина обновлена: ${reason}`;
    },
    blacklistRemoved(userId) {
      return `✅ <@${userId}> удалён из чёрного списка.`;
    },
    blacklistNotFound: 'Пользователь не найден в чёрном списке.',
    blacklistEmpty: 'Чёрный список пуст.',
    blacklistTitle: '⛔ Чёрный список',
    blacklistLine(index, entry) {
      return `${index + 1}. <@${entry.userId}> • ${entry.reason}`;
    },
    noSecurityAccess: 'У тебя нет доступа к защитным функциям.',
    blacklistBanReason(reason) {
      return `Чёрный список: ${reason}`;
    },
    inviteBlocked: 'Инвайт-ссылки запрещены. Сообщение удалено.',
    inviteGuardNotice(userId) {
      return `⚠️ <@${userId}>, инвайт-ссылки на серверы запрещены.`;
    },
    channelRestored(channelName) {
      return `🛡 Канал "${channelName}" был восстановлен после удаления.`;
    },
    channelGuardReason: 'Автовосстановление удалённого канала'
  },
  admin: {
    noOwnerAccess: 'Эта команда доступна только владельцам бота.',
    premiumOnly: 'Эта функция доступна только на тарифе Premium.',
    setupSaved: 'Настройки сервера сохранены в базе.',
    setupTitle: '⚙️ Setup сервера',
    setupDescription(guildName) {
      return `Конфигурация для сервера "${guildName}" сохранена.`;
    },
    panelTitle: '🛠 Админ-панель сервера',
    panelFree: 'Free — 0$',
    panelPremium: 'Premium — 5$',
    panelFieldPlan: 'Тариф',
    panelFieldSetup: 'Setup',
    panelFieldFeatures: 'Функции',
    panelFieldChannels: 'Каналы',
    panelFieldRoles: 'Роли',
    panelFieldVisuals: 'Баннеры',
    panelSetupDone: 'Настроен',
    panelSetupPending: 'Не настроен',
    panelFeatures(plan) {
      if (plan === 'premium') {
        return [
          '• всё из Free',
          '• лидерборд и голосовая активность',
          '• админ-отчёты по активности',
          '• оффлайн AI и AI-анализ заявок',
          '• авто-ранги и авто-DM',
          '• чёрный список и бан-лист',
          '• anti-leak и защита каналов',
          '• еженедельная очистка без ролей',
          '• AFK-предупреждения за 3 дня'
        ].join('\n');
      }

      return [
        '• панель семьи',
        '• заявки и кнопка подачи',
        '• профили участников',
        '• настройка ролей и каналов через Discord',
        '• ручные похвалы и преды',
        '• базовая админка сервера'
      ].join('\n');
    },
    channelLine(label, value) {
      return `${label}: ${value || 'не задан'}`;
    },
    roleLine(label, value) {
      return `${label}: ${value || 'не задана'}`;
    },
    visualLine(label, value) {
      return `${label}: ${value || 'не задан'}`;
    },
    subscriptionUpdated(plan) {
      return `Подписка сервера обновлена: ${plan === 'premium' ? 'Premium — 5$' : 'Free — 0$'}.`;
    }
  },
  help: {
    title(plan) {
      return `📚 Команды бота • ${plan === 'premium' ? 'Premium — 5$' : 'Free — 0$'}`;
    },
    freeSection: 'Доступно сейчас',
    premiumSection: 'В Premium',
    line(name, description) {
      return `/${name} — ${description}`;
    }
  },
  debugConfig: {
    titleOk: '🧪 Конфигурация бота',
    titleWarn: '🟡 Конфигурация бота',
    titleError: '🔴 Конфигурация бота',
    summaryField: 'Сводка',
    notesField: 'Заметки',
    warningsField: 'Предупреждения',
    errorsField: 'Ошибки',
    none: 'Нет',
    footer: 'Токены и ключи скрыты'
  }
};

copy.commands.leaderboardDescription = 'Показать таблицу участников по очкам';
copy.commands.voiceActivityDescription = 'Показать активность в голосовых каналах';
copy.commands.activityReportDescription = 'Админ-отчёт по активности семьи';
copy.commands.aiAdvisorDescription = 'AI-советник по участнику семьи';
copy.commands.unbanIdDescription = 'Разбанить пользователя по Discord ID';
copy.commands.banListDescription = 'Показать список банов сервера';
copy.commands.roleTargetLeader = 'Лидер';
copy.commands.roleTargetDeputy = 'Заместитель';
copy.commands.roleTargetElder = 'Старший';
copy.commands.roleTargetMember = 'Участник';
copy.commands.roleTargetNewbie = 'Новичок';
copy.commands.channelTargetPanel = 'Панель';
copy.commands.channelTargetApplications = 'Заявки';
copy.commands.channelTargetLogs = 'Логи';
copy.commands.channelTargetDiscipline = 'Дисциплина';
copy.commands.userIdOptionName = 'id';
copy.commands.userIdDescription = 'Discord ID пользователя';

copy.ranks.autoKeepCurrent = function autoKeepCurrent(roleName, score) {
  return `Авто-ранг сохранил текущую роль ${roleName}. Автоматическое понижение не применяется (${score} очк.).`;
};
copy.ranks.permissionFailed = 'Не удалось изменить ранг. Проверь, что роль бота выше семейных ролей и у него есть право Manage Roles.';

copy.stats = {
  leaderboardTitle: '🏆 Таблица участников',
  leaderboardDescription: 'Рейтинг по очкам репутации от 0 до 100.',
  leaderboardEmpty: 'Пока нет участников для таблицы.',
  voiceTitle: '🎙 Голосовая активность',
  voiceDescription: 'Топ участников по времени в голосовых каналах.',
  voiceEmpty: 'Пока нет активности в голосовых каналах.',
  pointsField: 'Очки',
  voiceField: 'Голос',
  hours(value) {
    return `${value.toFixed(1)} ч`;
  },
  leaderboardLine(index, member, roleName, points, voiceHours) {
    return `${index + 1}. ${roleName} • <@${member.id}> • ${points}/100 • ${this.hours(voiceHours)}`;
  },
  voiceLine(index, member, hours, points) {
    return `${index + 1}. <@${member.id}> • ${this.hours(hours)} • ${points}/100`;
  }
};

copy.ai.advisorTitle = function advisorTitle(displayName) {
  return `🤖 AI-советник: ${displayName}`;
};
copy.ai.advisorFooter = 'BRHD • Phoenix • AI Advisor';
copy.ai.advisorUnavailable = 'AI-советник временно недоступен.';

copy.security.banListTitle = '🔨 Список банов';
copy.security.banListEmpty = 'На сервере сейчас нет активных банов.';
copy.security.banListLine = function banListLine(index, ban) {
  const username = ban?.user?.username || 'unknown';
  const reason = ban?.reason || 'без причины';
  return `${index + 1}. ${username} • \`${ban.user.id}\` • ${reason}`;
};
copy.security.unbanSuccess = function unbanSuccess(userId) {
  return `✅ Пользователь \`${userId}\` разбанен и удалён из чёрного списка.`;
};
copy.security.unbanFailed = function unbanFailed(userId) {
  return `Не удалось разбанить пользователя \`${userId}\`. Проверь ID и наличие бана.`;
};

copy.applications.fieldNick = '🎮 Ник в игре';
copy.applications.fieldLevel = '⚡ Лвл';
copy.applications.fieldInvite = '🫂 Кто дал инвайт / Откуда узнали';
copy.applications.fieldText = '📝 О себе';
copy.applications.applyModalNick = 'Ник в игре';
copy.applications.applyModalLevel = 'Какой лвл?';
copy.applications.applyModalInviter = 'Кто дал инвайт?';
copy.applications.applyModalDiscovery = 'Откуда о нас узнали?';
copy.applications.applyModalText = 'О себе';
copy.applications.closeTicketButton = '🔒 Закрыть тикет';
copy.applications.ticketClosedReply = '🔒 Тикет по заявке закрыт.';
copy.applications.ticketOnlyInThread = 'Закрыть тикет можно только внутри треда заявки.';
copy.applications.ticketThreadName = function ticketThreadName(nickname, applicationId) {
  return `ticket-${nickname}-${applicationId}`.slice(0, 90);
};
copy.applications.ticketStarter = function ticketStarter(userId, threadId) {
  return `Новая заявка от <@${userId}> • тикет: <#${threadId}>`;
};
copy.applications.ticketThreadHeader = function ticketThreadHeader(userId, applicationId) {
  return `Тикет по заявке <@${userId}> • ID: \`${applicationId}\``;
};
copy.applications.ticketReason = function ticketReason(userId) {
  return `Тикет по заявке ${userId}`;
};

copy.commands.roleTargetMute = 'Мут';
copy.commands.purgeDescription = 'Удалить выбранное количество сообщений в канале';
copy.commands.purgeUserDescription = 'Удалить сообщения конкретного участника';
copy.commands.clearAllChannelDescription = 'Полностью очистить текстовый канал';
copy.commands.muteDescription = 'Выдать мут участнику через mute-роль';
copy.commands.unmuteDescription = 'Снять мут с участника';
copy.commands.lockChannelDescription = 'Закрыть канал для @everyone';
copy.commands.unlockChannelDescription = 'Открыть канал для @everyone';
copy.commands.slowmodeDescription = 'Изменить slowmode канала';
copy.commands.warnHistoryDescription = 'Показать историю выговоров участника';
copy.commands.clearWarnsDescription = 'Очистить выговоры участника';
copy.commands.countOptionName = 'количество';
copy.commands.countOptionDescription = 'Сколько сообщений обработать';
copy.commands.channelOptionName = 'канал';
copy.commands.channelOptionDescription = 'Текстовый канал для команды';
copy.commands.confirmOptionName = 'подтверждение';
copy.commands.confirmOptionDescription = 'Напишите CLEAR, чтобы подтвердить полную очистку канала';
copy.commands.secondsOptionName = 'секунды';
copy.commands.secondsOptionDescription = 'Количество секунд для slowmode';

copy.moderation = {
  noAccess: 'У тебя нет доступа к этой модераторской команде.',
  premiumOnly: 'Эта модераторская команда доступна только на Premium.',
  muteRoleMissing: 'Сначала задай mute-роль через /setrole.',
  invalidCount: 'Укажи количество от 1 до 500.',
  invalidSeconds: 'Укажи значение от 0 до 21600 секунд.',
  invalidConfirmation: 'Для полной очистки канала нужно написать `CLEAR`.',
  notTextChannel: 'Эта команда работает только с текстовыми каналами сервера.',
  purgeDone(count, channelId) {
    return `Удалено сообщений: **${count}** в канале <#${channelId}>.`;
  },
  purgeUserDone(count, userId, channelId) {
    return `Удалено сообщений участника <@${userId}>: **${count}** в канале <#${channelId}>.`;
  },
  purgeUserScanDone(count, matched, userId, channelId) {
    return `Удалено сообщений участника <@${userId}>: **${count}** из **${matched}** найденных в канале <#${channelId}>.`;
  },
  clearChannelDone(oldChannelId, newChannelId) {
    return `Канал <#${oldChannelId}> очищен. Новый канал: <#${newChannelId}>.`;
  },
  clearChannelPartial(channelId, deleted, skippedSystem) {
    return `Канал <#${channelId}> очищен частично. Удалено: **${deleted}**. Служебных системных сообщений осталось: **${skippedSystem}**.`;
  },
  muteDone(userId, roleId) {
    return `Участнику <@${userId}> выдан мут <@&${roleId}>.`;
  },
  unmuteDone(userId) {
    return `С участника <@${userId}> снят мут.`;
  },
  slowmodeDone(channelId, seconds) {
    return seconds > 0
      ? `Slowmode для <#${channelId}> установлен на **${seconds}** сек.`
      : `Slowmode для <#${channelId}> отключён.`;
  },
  lockDone(channelId) {
    return `Канал <#${channelId}> закрыт для @everyone.`;
  },
  unlockDone(channelId) {
    return `Канал <#${channelId}> снова открыт для @everyone.`;
  },
  warnHistoryTitle(userTag) {
    return `История выговоров: ${userTag}`;
  },
  warnHistoryEmpty: 'У участника пока нет сохранённых выговоров.',
  warnHistoryLine(index, entry) {
    return `${index + 1}. ${entry.reason} • модератор <@${entry.moderatorId}> • ${entry.createdAt}`;
  },
  clearWarnsDone(userId, count) {
    return `Для <@${userId}> очищено выговоров: **${count}**.`;
  },
  actionFailed(action) {
    return `Не удалось выполнить действие: ${action}. Проверь права бота и иерархию ролей.`;
  }
};

copy.security.banListLine = function banListLine(index, ban) {
  const username = ban?.user?.username || 'unknown';
  const reason = ban?.reason || 'без причины';
  return `${index + 1}. <@${ban.user.id}> • \`${ban.user.id}\` • ${username} • ${reason}`;
};

copy.security.blacklistLine = function blacklistLine(index, entry) {
  return `${index + 1}. <@${entry.userId}> • \`${entry.userId}\` • ${entry.reason}`;
};

copy.commands.channelTargetApplications = 'Подача заявки';

copy.moderation.purgeUserDetailed = function purgeUserDetailed(count, matched, blocked, system, userId, channelId) {
  const details = [
    `Удалено сообщений участника <@${userId}>: **${count}**`,
    `Найдено совпадений: **${matched}**`,
    `Канал: <#${channelId}>`
  ];

  if (blocked > 0) {
    details.push(`Неудаляемых сообщений: **${blocked}**`);
  }

  if (system > 0) {
    details.push(`Системных записей Discord: **${system}**`);
  }

  return details.join(' • ');
};

copy.moderation.clearChannelPartial = function clearChannelPartial(channelId, deleted, skipped) {
  return `Канал <#${channelId}> очищен частично. Удалено: **${deleted}**. Осталось неудаляемых или системных сообщений: **${skipped}**.`;
};

copy.commands.nicknameOptionName = 'новый_ник';
copy.commands.nicknameOptionDescription = 'Новый ник для AI-действия';
copy.commands.kickRolessDescription = 'Кикнуть участников без ролей вручную';

copy.moderation.kickRolessDone = function kickRolessDone(kicked, failed) {
  return `Чистка безрольных завершена: кикнуто **${kicked}**, ошибок **${failed}**.`;
};

copy.ai.commandsOverviewTitle = 'Что тебе доступно сейчас';
copy.ai.commandsOverviewEmpty = 'Не нашел доступных команд для твоих прав.';
copy.ai.nicknameMissingTarget = 'Для смены ника укажи пользователя и новый ник.';
copy.ai.nicknameNoAccess = 'Для смены ника через AI нужны права администратора или Manage Nicknames.';
copy.ai.nicknameTooLong = 'Новый ник должен быть от 1 до 32 символов.';
copy.ai.nicknameDone = function nicknameDone(userId, nickname) {
  return `AI изменил ник для <@${userId}> на **${nickname}**.`;
};
copy.ai.nicknameFailed = 'AI не смог изменить ник. Проверь права бота и иерархию ролей.';

copy.help.regularSection = 'Обычные команды';
copy.help.adminSection = 'Команды администрации';
copy.help.premiumRegularSection = 'Обычные команды в Premium';
copy.help.premiumAdminSection = 'Админ-команды в Premium';
copy.help.none = 'Нет доступных команд для этого раздела.';
copy.common.moduleDisabled = 'Этот модуль сервера сейчас отключён.';
copy.commands.setModeDescription = 'Переключить продуктовый режим сервера';
copy.commands.setModuleDescription = 'Включить или выключить модуль сервера';
copy.commands.modeOptionName = 'mode';
copy.commands.modeOptionDescription = 'Какой режим продукта включить';
copy.commands.moduleOptionName = 'module';
copy.commands.moduleOptionDescription = 'Какой модуль переключить';
copy.commands.stateOptionName = 'state';
copy.commands.stateOptionDescription = 'Включить или выключить модуль';
copy.commands.modeFamily = 'Family Mode';
copy.commands.modeHybrid = 'Hybrid Mode';
copy.commands.modeServer = 'Server Mode';
copy.commands.stateOn = 'On';
copy.commands.stateOff = 'Off';
copy.commands.moduleFamily = 'Family';
copy.commands.moduleApplications = 'Applications';
copy.commands.moduleModeration = 'Moderation';
copy.commands.moduleSecurity = 'Security';
copy.commands.moduleAnalytics = 'Analytics';
copy.commands.moduleAi = 'AI';
copy.commands.moduleWelcome = 'Welcome';
copy.commands.moduleAutomod = 'Automod';
copy.commands.moduleSubscriptions = 'Subscriptions';
copy.commands.moduleCustomCommands = 'Custom Commands';
copy.commands.moduleMusic = 'Music';

copy.commands.channelTargetUpdates = 'Апдейты бота';
copy.commands.automodDescription = 'Настроить автомодерацию сервера';
copy.commands.automodStatusSubcommand = 'status';
copy.commands.automodStatusDescription = 'Показать текущие настройки automod';
copy.commands.automodToggleSubcommand = 'toggle';
copy.commands.automodToggleDescription = 'Включить или выключить правило automod';
copy.commands.automodLimitSubcommand = 'limit';
copy.commands.automodLimitDescription = 'Изменить числовой порог automod';
copy.commands.automodWordsSubcommand = 'words';
copy.commands.automodWordsDescription = 'Управлять списком стоп-слов automod';
copy.commands.automodRuleOptionName = 'rule';
copy.commands.automodRuleOptionDescription = 'Какое правило automod изменить';
copy.commands.automodRuleInvites = 'Инвайты';
copy.commands.automodRuleLinks = 'Ссылки';
copy.commands.automodRuleCaps = 'Капс';
copy.commands.automodRuleMentions = 'Много упоминаний';
copy.commands.automodRuleSpam = 'Флуд';
copy.commands.automodRuleBadWords = 'Стоп-слова';
copy.commands.automodTargetOptionName = 'target';
copy.commands.automodTargetOptionDescription = 'Какой порог изменить';
copy.commands.automodTargetCapsPercent = 'Порог капса %';
copy.commands.automodTargetCapsMinLength = 'Мин. длина капса';
copy.commands.automodTargetMentionLimit = 'Лимит упоминаний';
copy.commands.automodTargetSpamCount = 'Лимит флуда';
copy.commands.automodTargetSpamWindow = 'Окно флуда';
copy.commands.valueOptionName = 'value';
copy.commands.valueOptionDescription = 'Новое значение для порога';
copy.commands.actionOptionName = 'action';
copy.commands.actionOptionDescription = 'Что сделать со списком слов';
copy.commands.wordOptionName = 'word';
copy.commands.wordOptionDescription = 'Слово для списка automod';
copy.commands.automodWordAddAction = 'Добавить';
copy.commands.automodWordRemoveAction = 'Удалить';
copy.commands.automodWordListAction = 'Показать';
copy.commands.automodWordClearAction = 'Очистить';
copy.commands.serverReportDescription = 'Показать недельный или месячный отчёт по серверу';
copy.commands.periodOptionName = 'period';
copy.commands.periodOptionDescription = 'За какой период собрать статистику';
copy.commands.periodWeekly = 'Weekly';
copy.commands.periodMonthly = 'Monthly';

copy.automod = copy.automod || {};
copy.automod.ruleLabel = function ruleLabel(rule) {
  const labels = {
    invites: 'Инвайты',
    links: 'Ссылки',
    caps: 'Капс',
    mentions: 'Упоминания',
    spam: 'Флуд',
    badWords: 'Стоп-слова'
  };

  return labels[rule] || rule;
};
copy.automod.targetLabel = function targetLabel(target) {
  const labels = {
    capsPercent: 'Порог капса',
    capsMinLength: 'Мин. длина капса',
    mentionLimit: 'Лимит упоминаний',
    spamCount: 'Лимит флуда',
    spamWindowSeconds: 'Окно флуда'
  };

  return labels[target] || target;
};
copy.automod.notice = function notice(userId, rule, detail = '') {
  return `<@${userId}>, automod удалил сообщение по правилу **${rule}**${detail ? ` (${detail})` : ''}.`;
};
copy.automod.toggleDone = function toggleDone(rule, enabled) {
  return `Правило automod **${rule}** теперь **${enabled ? 'включено' : 'выключено'}**.`;
};
copy.automod.limitDone = function limitDone(target, value) {
  return `Порог automod **${target}** обновлён: **${value}**.`;
};
copy.automod.wordAdded = function wordAdded(word) {
  return `Слово **${word}** добавлено в стоп-лист automod.`;
};
copy.automod.wordRemoved = function wordRemoved(word) {
  return `Слово **${word}** удалено из стоп-листа automod.`;
};
copy.automod.wordsCleared = 'Список стоп-слов automod очищен.';
copy.automod.wordMissing = 'Укажи слово для этой операции.';

copy.commands.roleTargetAutorole = 'Автороль';
copy.commands.channelTargetWelcome = 'Welcome';
copy.commands.channelTargetReports = 'Отчёты';
copy.commands.messageOptionName = 'message';
copy.commands.messageOptionDescription = 'Текст welcome-сообщения';
copy.commands.messageIdOptionName = 'message_id';
copy.commands.messageIdOptionDescription = 'ID сообщения для reaction role';
copy.commands.emojiOptionName = 'emoji';
copy.commands.emojiOptionDescription = 'Эмодзи реакции';

copy.commands.welcomeDescription = 'Настроить welcome-сообщения сервера';
copy.commands.welcomeStatusSubcommand = 'status';
copy.commands.welcomeStatusDescription = 'Показать текущие настройки welcome';
copy.commands.welcomeToggleSubcommand = 'toggle';
copy.commands.welcomeToggleDescription = 'Включить или выключить welcome-сообщения';
copy.commands.welcomeChannelSubcommand = 'channel';
copy.commands.welcomeChannelDescription = 'Назначить канал для welcome-сообщений';
copy.commands.welcomeDmSubcommand = 'dm';
copy.commands.welcomeDmDescription = 'Включить или выключить welcome в личные сообщения';
copy.commands.welcomeMessageSubcommand = 'message';
copy.commands.welcomeMessageDescription = 'Изменить текст welcome-сообщения';
copy.commands.welcomeTestSubcommand = 'test';
copy.commands.welcomeTestDescription = 'Отправить тестовое welcome-сообщение';

copy.commands.autoroleDescription = 'Настроить автоматическую выдачу роли новичкам';
copy.commands.autoroleStatusSubcommand = 'status';
copy.commands.autoroleStatusDescription = 'Показать текущую autorole';
copy.commands.autoroleSetSubcommand = 'set';
copy.commands.autoroleSetDescription = 'Назначить роль для autorole';
copy.commands.autoroleClearSubcommand = 'clear';
copy.commands.autoroleClearDescription = 'Отключить autorole';

copy.commands.reactionRoleDescription = 'Настроить reaction roles';
copy.commands.reactionRoleStatusSubcommand = 'status';
copy.commands.reactionRoleStatusDescription = 'Показать все reaction roles';
copy.commands.reactionRoleAddSubcommand = 'add';
copy.commands.reactionRoleAddDescription = 'Добавить новую reaction role';
copy.commands.reactionRoleRemoveSubcommand = 'remove';
copy.commands.reactionRoleRemoveDescription = 'Удалить reaction role';

copy.commands.reportScheduleDescription = 'Настроить автопост серверных отчётов';
copy.commands.reportScheduleStatusSubcommand = 'status';
copy.commands.reportScheduleStatusDescription = 'Показать статус weekly/monthly отчётов';
copy.commands.reportScheduleSetSubcommand = 'set';
copy.commands.reportScheduleSetDescription = 'Включить weekly или monthly отчёт';
copy.commands.reportScheduleOffSubcommand = 'off';
copy.commands.reportScheduleOffDescription = 'Выключить weekly или monthly отчёт';
copy.commands.reportScheduleSendSubcommand = 'send';
copy.commands.reportScheduleSendDescription = 'Отправить отчёт вручную сейчас';

copy.welcome = copy.welcome || {};
copy.welcome.statusTitle = '👋 Welcome';
copy.welcome.enabled = 'Включено';
copy.welcome.disabled = 'Выключено';
copy.welcome.channel = 'Канал';
copy.welcome.dm = 'ЛС';
copy.welcome.message = 'Текст';
copy.welcome.autorole = 'Автороль';
copy.welcome.updated = function updated(label) {
  return `Настройки welcome обновлены: ${label}.`;
};
copy.welcome.messageCleared = 'Текст welcome очищен.';
copy.welcome.testSent = 'Тестовое welcome-сообщение отправлено.';

copy.reactionRoles = copy.reactionRoles || {};
copy.reactionRoles.title = '✨ Reaction Roles';
copy.reactionRoles.empty = 'Связки реакций пока не настроены.';
copy.reactionRoles.added = function added(emoji, roleId, messageId) {
  return `Reaction role добавлена: ${emoji} -> <@&${roleId}> для сообщения \`${messageId}\`.`;
};
copy.reactionRoles.removed = function removed(emoji, messageId) {
  return `Reaction role удалена: ${emoji} для сообщения \`${messageId}\`.`;
};
copy.reactionRoles.notFound = 'Такая reaction role не найдена.';
copy.reactionRoles.messageMissing = 'Не удалось найти сообщение для этой reaction role.';

copy.reports = copy.reports || {};
copy.reports.title = '📆 Расписание отчётов';
copy.reports.periodWeekly = 'Weekly';
copy.reports.periodMonthly = 'Monthly';
copy.reports.enabled = function enabled(period, channelId) {
  return `${period} отчёт включён${channelId ? ` в <#${channelId}>` : ''}.`;
};
copy.reports.disabled = function disabled(period) {
  return `${period} отчёт выключен.`;
};
copy.reports.sent = function sent(period, channelId) {
  return `${period} отчёт отправлен${channelId ? ` в <#${channelId}>` : ''}.`;
};
copy.reports.channelMissing = 'Сначала укажи канал отчётов или передай канал в команду.';

copy.commands.roleTargetVerification = 'Роль после подтверждения';
copy.commands.channelTargetRules = 'Правила';
copy.commands.channelTargetAutomod = 'Логи automod';

copy.commands.verificationDescription = 'Настроить проверку новичков';
copy.commands.verificationStatusSubcommand = 'status';
copy.commands.verificationToggleSubcommand = 'toggle';
copy.commands.verificationRoleSubcommand = 'role';
copy.commands.verificationQuestionnaireSubcommand = 'questionnaire';

copy.commands.roleMenuDescription = 'Настроить role-menu с кнопками';
copy.commands.roleMenuStatusSubcommand = 'status';
copy.commands.roleMenuCreateSubcommand = 'create';
copy.commands.roleMenuAddSubcommand = 'add';
copy.commands.roleMenuRemoveSubcommand = 'remove';
copy.commands.roleMenuPublishSubcommand = 'publish';

copy.commands.customCommandDescription = 'Настроить свои автоответы и триггеры';
copy.commands.customCommandStatusSubcommand = 'status';
copy.commands.customCommandAddSubcommand = 'add';
copy.commands.customCommandRemoveSubcommand = 'remove';

copy.commands.automodActionSubcommand = 'action';
copy.commands.automodActionDescription = 'Выбрать мягкое или жёсткое наказание';
copy.commands.automodActionModeSoft = 'Мягкий режим';
copy.commands.automodActionModeHard = 'Жёсткий режим';

copy.commands.menuOptionName = 'menu';
copy.commands.menuOptionDescription = 'ID или имя меню';
copy.commands.titleOptionName = 'title';
copy.commands.titleOptionDescription = 'Заголовок';
copy.commands.descriptionOptionName = 'description';
copy.commands.descriptionOptionDescription = 'Описание';
copy.commands.categoryOptionName = 'category';
copy.commands.categoryOptionDescription = 'Категория';
copy.commands.triggerOptionName = 'trigger';
copy.commands.triggerOptionDescription = 'Ключевое слово или фраза';
copy.commands.responseOptionName = 'response';
copy.commands.responseOptionDescription = 'Ответ бота';
copy.commands.modeChoiceOptionName = 'mode';
copy.commands.modeChoiceOptionDescription = 'Как искать совпадение';
copy.commands.modeContains = 'Содержит';
copy.commands.modeStartsWith = 'Начинается с';
copy.commands.modeExact = 'Точное совпадение';
copy.commands.actionModeOptionName = 'mode';
copy.commands.actionModeOptionDescription = 'Режим наказания';

copy.verification = copy.verification || {};
copy.verification.title = 'Проверка новичков';
copy.verification.enabled = 'Проверка включена.';
copy.verification.disabled = 'Проверка выключена.';
copy.verification.status = function status(enabled, roleId, questionnaireEnabled) {
  return [
    `Статус: ${enabled ? 'включено' : 'выключено'}`,
    `Роль после подтверждения: ${roleId ? `<@&${roleId}>` : 'не задана'}`,
    `Стартовая анкета: ${questionnaireEnabled ? 'включена' : 'выключена'}`
  ].join('\n');
};
copy.verification.updated = function updated(label) {
  return `Настройки verification обновлены: ${label}.`;
};
copy.verification.alreadyVerified = 'Ты уже прошёл подтверждение.';
copy.verification.roleMissing = 'Сначала укажи роль после подтверждения или autorole.';
copy.verification.success = function success(roleId) {
  return `Подтверждение пройдено. Роль выдана${roleId ? `: <@&${roleId}>` : '.'}`;
};
copy.verification.noPermission = 'Бот не смог выдать роль после подтверждения. Проверь права и иерархию ролей.';
copy.verification.modalTitle = 'Стартовая анкета';
copy.verification.modalNick = 'Игровой ник';
copy.verification.modalReason = 'Зачем пришёл';
copy.verification.modalRules = 'Подтверди, что ознакомился с правилами';
copy.verification.rulesButton = 'Правила';
copy.verification.verifyButton = 'Подтвердить';
copy.verification.applyButton = 'Подать заявку';

copy.roleMenus = copy.roleMenus || {};
copy.roleMenus.title = 'Role Menus';
copy.roleMenus.empty = 'Role-menu пока не созданы.';
copy.roleMenus.created = function created(menuId) {
  return `Role-menu \`${menuId}\` создано.`;
};
copy.roleMenus.itemAdded = function itemAdded(menuId, roleId) {
  return `Роль <@&${roleId}> добавлена в menu \`${menuId}\`.`;
};
copy.roleMenus.itemRemoved = function itemRemoved(menuId, roleId) {
  return `Роль <@&${roleId}> удалена из menu \`${menuId}\`.`;
};
copy.roleMenus.published = function published(menuId, channelId) {
  return `Role-menu \`${menuId}\` опубликовано в <#${channelId}>.`;
};
copy.roleMenus.notFound = 'Такое role-menu не найдено.';
copy.roleMenus.roleAdded = function roleAdded(roleId) {
  return `Роль <@&${roleId}> выдана.`;
};
copy.roleMenus.roleRemoved = function roleRemoved(roleId) {
  return `Роль <@&${roleId}> снята.`;
};

copy.customCommands = copy.customCommands || {};
copy.customCommands.title = 'Custom Commands';
copy.customCommands.empty = 'Пользовательские триггеры пока не настроены.';
copy.customCommands.added = function added(name) {
  return `Триггер \`${name}\` сохранён.`;
};
copy.customCommands.removed = function removed(name) {
  return `Триггер \`${name}\` удалён.`;
};
copy.customCommands.notFound = 'Такой триггер не найден.';

copy.automod.actionUpdated = function actionUpdated(mode) {
  return `Режим наказания automod обновлён: ${mode}.`;
};

copy.stats = {
  leaderboardTitle: '🏆 Таблица участников',
  leaderboardDescription: 'Рейтинг по очкам репутации от 0 до 100.',
  leaderboardEmpty: 'Пока нет участников для таблицы.',
  voiceTitle: '🎙 Голосовая активность',
  voiceDescription: 'Топ участников по времени в голосовых каналах.',
  voiceEmpty: 'Пока нет активности в голосовых каналах.',
  pointsField: 'Очки',
  voiceField: 'Голос',
  hours(value) {
    return `${Number(value || 0).toFixed(1)} ч`;
  },
  leaderboardLine(index, member, roleName, points, voiceHours) {
    return `${index + 1}. ${roleName} • <@${member.id}> • ${points}/100 • ${this.hours(voiceHours)}`;
  },
  voiceLine(index, member, hours, points) {
    return `${index + 1}. <@${member.id}> • ${this.hours(hours)} • ${points}/100`;
  }
};

copy.ai.advisorTitle = function advisorTitle(displayName) {
  return `🤖 AI-советник: ${displayName}`;
};
copy.ai.advisorFooter = 'BRHD • Phoenix • AI Advisor';
copy.ai.advisorUnavailable = 'AI-советник временно недоступен.';

copy.admin.noOwnerAccess = 'Эта команда доступна только владельцам бота.';
copy.admin.premiumOnly = 'Эта функция доступна только на тарифе Premium.';
copy.admin.setupSaved = 'Настройки сервера сохранены в базе.';
copy.admin.setupTitle = '⚙️ Setup сервера';
copy.admin.setupDescription = function setupDescription(guildName) {
  return `Конфигурация для сервера "${guildName}" сохранена.`;
};
copy.admin.panelTitle = '🛠 Админ-панель сервера';
copy.admin.panelFree = 'Free — 0$';
copy.admin.panelPremium = 'Premium — 5$';
copy.admin.panelFieldPlan = 'Тариф';
copy.admin.panelFieldSetup = 'Setup';
copy.admin.panelFieldFeatures = 'Функции';
copy.admin.panelFieldChannels = 'Каналы';
copy.admin.panelFieldRoles = 'Роли';
copy.admin.panelFieldVisuals = 'Баннеры';
copy.admin.panelSetupDone = 'Настроен';
copy.admin.panelSetupPending = 'Не настроен';
copy.admin.panelFeatures = function panelFeatures(plan) {
  if (plan === 'premium') {
    return [
      '• всё из Free',
      '• лидерборд и голосовая активность',
      '• админ-отчёты по активности',
      '• оффлайн AI и AI-анализ заявок',
      '• авто-ранги и авто-DM',
      '• чёрный список и бан-лист',
      '• anti-leak и защита каналов',
      '• еженедельная очистка без ролей',
      '• AFK-предупреждения за 3 дня'
    ].join('\n');
  }

  return [
    '• панель семьи',
    '• заявки и кнопка подачи',
    '• профили участников',
    '• настройка ролей и каналов через Discord',
    '• ручные похвалы и преды',
    '• базовая админка сервера'
  ].join('\n');
};
copy.admin.channelLine = function channelLine(label, value) {
  return `${label}: ${value || 'не задан'}`;
};
copy.admin.roleLine = function roleLine(label, value) {
  return `${label}: ${value || 'не задана'}`;
};
copy.admin.visualLine = function visualLine(label, value) {
  return `${label}: ${value || 'не задан'}`;
};
copy.admin.subscriptionUpdated = function subscriptionUpdated(plan) {
  return `Подписка сервера обновлена: ${plan === 'premium' ? 'Premium — 5$' : 'Free — 0$'}.`;
};

copy.help.title = function title(plan) {
  return `📚 Команды бота • ${plan === 'premium' ? 'Premium — 5$' : 'Free — 0$'}`;
};
copy.help.freeSection = 'Доступно сейчас';
copy.help.premiumSection = 'В Premium';
copy.help.line = function line(name, description) {
  return `/${name} — ${description}`;
};

copy.applications.fieldNick = '🎮 Ник в игре';
copy.applications.fieldLevel = '⚡ Лвл';
copy.applications.fieldInvite = '🫂 Кто дал инвайт / Откуда узнали';
copy.applications.fieldText = '📝 О себе';
copy.applications.applyModalNick = 'Ник в игре';
copy.applications.applyModalLevel = 'Какой лвл?';
copy.applications.applyModalInviter = 'Кто дал инвайт?';
copy.applications.applyModalDiscovery = 'Откуда о нас узнали?';
copy.applications.applyModalText = 'О себе';
copy.applications.closeTicketButton = '🔒 Закрыть тикет';
copy.applications.ticketClosedReply = '🔒 Тикет по заявке закрыт.';
copy.applications.ticketOnlyInThread = 'Закрыть тикет можно только внутри треда заявки.';
copy.applications.ticketStarter = function ticketStarter(userId, threadId) {
  return `Новая заявка от <@${userId}> • тикет: <#${threadId}>`;
};
copy.applications.ticketThreadHeader = function ticketThreadHeader(userId, applicationId) {
  return `Тикет по заявке <@${userId}> • ID: \`${applicationId}\``;
};
copy.applications.ticketReason = function ticketReason(userId) {
  return `Тикет по заявке ${userId}`;
};

copy.verification.title = 'Проверка новичков';
copy.verification.enabled = 'Проверка включена.';
copy.verification.disabled = 'Проверка выключена.';
copy.verification.status = function status(enabled, roleId, questionnaireEnabled) {
  return [
    `Статус: ${enabled ? 'включено' : 'выключено'}`,
    `Роль после подтверждения: ${roleId ? `<@&${roleId}>` : 'не задана'}`,
    `Стартовая анкета: ${questionnaireEnabled ? 'включена' : 'выключена'}`
  ].join('\n');
};
copy.verification.updated = function updated(label) {
  return `Настройки verification обновлены: ${label}.`;
};
copy.verification.alreadyVerified = 'Ты уже прошёл подтверждение.';
copy.verification.roleMissing = 'Сначала укажи роль после подтверждения или autorole.';
copy.verification.success = function success(roleId) {
  return `Подтверждение пройдено. Роль выдана${roleId ? `: <@&${roleId}>` : '.'}`;
};
copy.verification.noPermission = 'Бот не смог выдать роль после подтверждения. Проверь права и иерархию ролей.';
copy.verification.modalTitle = 'Стартовая анкета';
copy.verification.modalNick = 'Игровой ник';
copy.verification.modalReason = 'Зачем пришёл';
copy.verification.modalRules = 'Подтверди, что ознакомился с правилами';
copy.verification.rulesButton = 'Правила';
copy.verification.verifyButton = 'Подтвердить';
copy.verification.applyButton = 'Подать заявку';

copy.roleMenus.title = 'Role Menus';
copy.roleMenus.empty = 'Role-menu пока не созданы.';
copy.roleMenus.created = function created(menuId) {
  return `Role-menu \`${menuId}\` создано.`;
};
copy.roleMenus.itemAdded = function itemAdded(menuId, roleId) {
  return `Роль <@&${roleId}> добавлена в menu \`${menuId}\`.`;
};
copy.roleMenus.itemRemoved = function itemRemoved(menuId, roleId) {
  return `Роль <@&${roleId}> удалена из menu \`${menuId}\`.`;
};
copy.roleMenus.published = function published(menuId, channelId) {
  return `Role-menu \`${menuId}\` опубликовано в <#${channelId}>.`;
};
copy.roleMenus.notFound = 'Такое role-menu не найдено.';
copy.roleMenus.roleAdded = function roleAdded(roleId) {
  return `Роль <@&${roleId}> выдана.`;
};
copy.roleMenus.roleRemoved = function roleRemoved(roleId) {
  return `Роль <@&${roleId}> снята.`;
};

copy.customCommands.title = 'Custom Commands';
copy.customCommands.empty = 'Пользовательские триггеры пока не настроены.';
copy.customCommands.added = function added(name) {
  return `Триггер \`${name}\` сохранён.`;
};
copy.customCommands.removed = function removed(name) {
  return `Триггер \`${name}\` удалён.`;
};
copy.customCommands.notFound = 'Такой триггер не найден.';

copy.automod.actionUpdated = function actionUpdated(mode) {
  return `Режим наказания automod обновлён: ${mode}.`;
};

module.exports = copy;

// UTF-8 overrides for late-added modules and admin surfaces.
Object.assign(copy.applications, {
  applyModalNick: 'Ник в игре',
  applyModalLevel: 'Какой лвл?',
  applyModalInviter: 'Кто дал инвайт?',
  applyModalDiscovery: 'Откуда о нас узнали?',
  applyModalText: 'О себе',
  closeTicketButton: '🔒 Закрыть тикет',
  ticketClosedReply: '🔒 Тикет по заявке закрыт.',
  ticketOnlyInThread: 'Закрыть тикет можно только внутри треда заявки.',
  fieldNick: '🎮 Ник в игре',
  fieldLevel: '⚡ Лвл',
  fieldInvite: '🫂 Кто дал инвайт / Откуда узнали',
  fieldText: '📝 О себе'
});
copy.applications.ticketThreadName = function ticketThreadName(nickname, applicationId) {
  return `ticket-${nickname}-${applicationId}`.slice(0, 90);
};
copy.applications.ticketStarter = function ticketStarter(userId, threadId) {
  return `Новая заявка от <@${userId}> • тикет: <#${threadId}>`;
};
copy.applications.ticketThreadHeader = function ticketThreadHeader(userId, applicationId) {
  return `Тикет по заявке <@${userId}> • ID: \`${applicationId}\``;
};
copy.applications.ticketReason = function ticketReason(userId) {
  return `Тикет по заявке ${userId}`;
};

Object.assign(copy.commands, {
  roleTargetMute: 'Мут',
  roleTargetAutorole: 'Автороль',
  roleTargetVerification: 'Роль после подтверждения',
  purgeDescription: 'Удалить выбранное количество сообщений в канале',
  purgeUserDescription: 'Удалить сообщения конкретного участника',
  clearAllChannelDescription: 'Полностью очистить текстовый канал',
  muteDescription: 'Выдать мут участнику через mute-роль',
  unmuteDescription: 'Снять мут с участника',
  lockChannelDescription: 'Закрыть канал для @everyone',
  unlockChannelDescription: 'Открыть канал для @everyone',
  slowmodeDescription: 'Изменить slowmode канала',
  warnHistoryDescription: 'Показать историю выговоров участника',
  clearWarnsDescription: 'Очистить выговоры участника',
  countOptionName: 'количество',
  countOptionDescription: 'Сколько сообщений обработать',
  channelOptionName: 'канал',
  channelOptionDescription: 'Текстовый канал для команды',
  confirmOptionName: 'подтверждение',
  confirmOptionDescription: 'Напишите CLEAR, чтобы подтвердить полную очистку канала',
  secondsOptionName: 'секунды',
  secondsOptionDescription: 'Количество секунд для slowmode',
  nicknameOptionName: 'новый_ник',
  nicknameOptionDescription: 'Новый ник для AI-действия',
  kickRolessDescription: 'Кикнуть участников без ролей вручную',
  setModeDescription: 'Переключить продуктовый режим сервера',
  setModuleDescription: 'Включить или выключить модуль сервера',
  modeOptionName: 'mode',
  modeOptionDescription: 'Какой режим продукта включить',
  moduleOptionName: 'module',
  moduleOptionDescription: 'Какой модуль переключить',
  stateOptionName: 'state',
  stateOptionDescription: 'Включить или выключить модуль',
  modeFamily: 'Family Mode',
  modeHybrid: 'Hybrid Mode',
  modeServer: 'Server Mode',
  stateOn: 'On',
  stateOff: 'Off',
  moduleFamily: 'Family',
  moduleApplications: 'Applications',
  moduleModeration: 'Moderation',
  moduleSecurity: 'Security',
  moduleAnalytics: 'Analytics',
  moduleAi: 'AI',
  moduleWelcome: 'Welcome',
  moduleAutomod: 'Automod',
  moduleSubscriptions: 'Subscriptions',
  moduleCustomCommands: 'Custom Commands',
  moduleMusic: 'Music',
  channelTargetApplications: 'Подача заявки',
  channelTargetUpdates: 'Апдейты бота',
  channelTargetWelcome: 'Welcome',
  channelTargetReports: 'Отчёты',
  channelTargetRules: 'Правила',
  channelTargetAutomod: 'Логи automod',
  automodDescription: 'Настроить автомодерацию сервера',
  automodStatusSubcommand: 'status',
  automodStatusDescription: 'Показать текущие настройки automod',
  automodToggleSubcommand: 'toggle',
  automodToggleDescription: 'Включить или выключить правило automod',
  automodLimitSubcommand: 'limit',
  automodLimitDescription: 'Изменить числовой порог automod',
  automodWordsSubcommand: 'words',
  automodWordsDescription: 'Управлять списком стоп-слов automod',
  automodRuleOptionName: 'rule',
  automodRuleOptionDescription: 'Какое правило automod изменить',
  automodRuleInvites: 'Инвайты',
  automodRuleLinks: 'Ссылки',
  automodRuleCaps: 'Капс',
  automodRuleMentions: 'Много упоминаний',
  automodRuleSpam: 'Флуд',
  automodRuleBadWords: 'Стоп-слова',
  automodTargetOptionName: 'target',
  automodTargetOptionDescription: 'Какой порог изменить',
  automodTargetCapsPercent: 'Порог капса %',
  automodTargetCapsMinLength: 'Мин. длина капса',
  automodTargetMentionLimit: 'Лимит упоминаний',
  automodTargetSpamCount: 'Лимит флуда',
  automodTargetSpamWindow: 'Окно флуда',
  valueOptionName: 'value',
  valueOptionDescription: 'Новое значение для порога',
  actionOptionName: 'action',
  actionOptionDescription: 'Что сделать со списком слов',
  wordOptionName: 'word',
  wordOptionDescription: 'Слово или список слов через запятую',
  automodWordAddAction: 'Добавить',
  automodWordRemoveAction: 'Удалить',
  automodWordListAction: 'Показать',
  automodWordClearAction: 'Очистить',
  serverReportDescription: 'Показать недельный или месячный отчёт по серверу',
  periodOptionName: 'period',
  periodOptionDescription: 'За какой период собрать статистику',
  periodWeekly: 'Weekly',
  periodMonthly: 'Monthly',
  messageOptionName: 'message',
  messageOptionDescription: 'Текст welcome-сообщения',
  messageIdOptionName: 'message_id',
  messageIdOptionDescription: 'ID сообщения для reaction role',
  emojiOptionName: 'emoji',
  emojiOptionDescription: 'Эмодзи реакции',
  welcomeDescription: 'Настроить welcome-сообщения сервера',
  welcomeStatusSubcommand: 'status',
  welcomeStatusDescription: 'Показать текущие настройки welcome',
  welcomeToggleSubcommand: 'toggle',
  welcomeToggleDescription: 'Включить или выключить welcome-сообщения',
  welcomeChannelSubcommand: 'channel',
  welcomeChannelDescription: 'Назначить канал для welcome-сообщений',
  welcomeDmSubcommand: 'dm',
  welcomeDmDescription: 'Включить или выключить welcome в личные сообщения',
  welcomeMessageSubcommand: 'message',
  welcomeMessageDescription: 'Изменить текст welcome-сообщения',
  welcomeTestSubcommand: 'test',
  welcomeTestDescription: 'Отправить тестовое welcome-сообщение',
  autoroleDescription: 'Настроить автоматическую выдачу роли новичкам',
  autoroleStatusSubcommand: 'status',
  autoroleStatusDescription: 'Показать текущую autorole',
  autoroleSetSubcommand: 'set',
  autoroleSetDescription: 'Назначить роль для autorole',
  autoroleClearSubcommand: 'clear',
  autoroleClearDescription: 'Отключить autorole',
  reactionRoleDescription: 'Настроить reaction roles',
  reactionRoleStatusSubcommand: 'status',
  reactionRoleStatusDescription: 'Показать все reaction roles',
  reactionRoleAddSubcommand: 'add',
  reactionRoleAddDescription: 'Добавить новую reaction role',
  reactionRoleRemoveSubcommand: 'remove',
  reactionRoleRemoveDescription: 'Удалить reaction role',
  reportScheduleDescription: 'Настроить автопост серверных отчётов',
  reportScheduleStatusSubcommand: 'status',
  reportScheduleStatusDescription: 'Показать статус weekly/monthly отчётов',
  reportScheduleSetSubcommand: 'set',
  reportScheduleSetDescription: 'Включить weekly или monthly отчёт',
  reportScheduleOffSubcommand: 'off',
  reportScheduleOffDescription: 'Выключить weekly или monthly отчёт',
  reportScheduleSendSubcommand: 'send',
  reportScheduleSendDescription: 'Отправить отчёт вручную сейчас',
  verificationDescription: 'Настроить проверку новичков',
  verificationStatusSubcommand: 'status',
  verificationToggleSubcommand: 'toggle',
  verificationRoleSubcommand: 'role',
  verificationQuestionnaireSubcommand: 'questionnaire',
  roleMenuDescription: 'Настроить меню ролей с кнопками',
  roleMenuStatusSubcommand: 'status',
  roleMenuCreateSubcommand: 'create',
  roleMenuAddSubcommand: 'add',
  roleMenuRemoveSubcommand: 'remove',
  roleMenuPublishSubcommand: 'publish',
  customCommandDescription: 'Настроить свои автоответы и триггеры',
  customCommandStatusSubcommand: 'status',
  customCommandAddSubcommand: 'add',
  customCommandRemoveSubcommand: 'remove',
  automodActionSubcommand: 'action',
  automodActionDescription: 'Выбрать мягкое или жёсткое наказание',
  automodActionModeSoft: 'Мягкий режим',
  automodActionModeHard: 'Жёсткий режим',
  menuOptionName: 'menu',
  menuOptionDescription: 'ID или имя меню',
  titleOptionName: 'title',
  titleOptionDescription: 'Заголовок',
  descriptionOptionName: 'description',
  descriptionOptionDescription: 'Описание',
  categoryOptionName: 'category',
  categoryOptionDescription: 'Категория',
  triggerOptionName: 'trigger',
  triggerOptionDescription: 'Ключевое слово или фраза',
  responseOptionName: 'response',
  responseOptionDescription: 'Ответ бота',
  modeChoiceOptionName: 'mode',
  modeChoiceOptionDescription: 'Как искать совпадение',
  modeContains: 'Содержит',
  modeStartsWith: 'Начинается с',
  modeExact: 'Точное совпадение',
  actionModeOptionName: 'mode',
  actionModeOptionDescription: 'Режим наказания'
});

copy.common.moduleDisabled = 'Этот модуль сервера сейчас отключён.';

copy.moderation = {
  ...copy.moderation,
  noAccess: 'У тебя нет доступа к этой модераторской команде.',
  premiumOnly: 'Эта модераторская команда доступна только на Premium.',
  muteRoleMissing: 'Сначала задай mute-роль через /setrole.',
  invalidCount: 'Укажи количество от 1 до 500.',
  invalidSeconds: 'Укажи значение от 0 до 21600 секунд.',
  invalidConfirmation: 'Для полной очистки канала нужно написать `CLEAR`.',
  notTextChannel: 'Эта команда работает только с текстовыми каналами сервера.',
  purgeDone(count, channelId) {
    return `Удалено сообщений: **${count}** в канале <#${channelId}>.`;
  },
  purgeUserDone(count, userId, channelId) {
    return `Удалено сообщений участника <@${userId}>: **${count}** в канале <#${channelId}>.`;
  },
  purgeUserScanDone(count, matched, userId, channelId) {
    return `Удалено сообщений участника <@${userId}>: **${count}** из **${matched}** найденных в канале <#${channelId}>.`;
  },
  purgeUserDetailed(count, matched, blocked, system, userId, channelId) {
    const details = [
      `Удалено сообщений участника <@${userId}>: **${count}**`,
      `Найдено совпадений: **${matched}**`,
      `Канал: <#${channelId}>`
    ];
    if (blocked > 0) details.push(`Неудаляемых сообщений: **${blocked}**`);
    if (system > 0) details.push(`Системных записей Discord: **${system}**`);
    return details.join(' • ');
  },
  clearChannelDone(oldChannelId, newChannelId) {
    return `Канал <#${oldChannelId}> очищен. Новый канал: <#${newChannelId}>.`;
  },
  clearChannelPartial(channelId, deleted, skipped) {
    return `Канал <#${channelId}> очищен частично. Удалено: **${deleted}**. Осталось неудаляемых или системных сообщений: **${skipped}**.`;
  },
  muteDone(userId, roleId) {
    return `Участнику <@${userId}> выдан мут <@&${roleId}>.`;
  },
  unmuteDone(userId) {
    return `С участника <@${userId}> снят мут.`;
  },
  slowmodeDone(channelId, seconds) {
    return seconds > 0
      ? `Slowmode для <#${channelId}> установлен на **${seconds}** сек.`
      : `Slowmode для <#${channelId}> отключён.`;
  },
  lockDone(channelId) {
    return `Канал <#${channelId}> закрыт для @everyone.`;
  },
  unlockDone(channelId) {
    return `Канал <#${channelId}> снова открыт для @everyone.`;
  },
  warnHistoryTitle(userTag) {
    return `История выговоров: ${userTag}`;
  },
  warnHistoryEmpty: 'У участника пока нет сохранённых выговоров.',
  warnHistoryLine(index, entry) {
    return `${index + 1}. ${entry.reason} • модератор <@${entry.moderatorId}> • ${entry.createdAt}`;
  },
  clearWarnsDone(userId, count) {
    return `Для <@${userId}> очищено выговоров: **${count}**.`;
  },
  actionFailed(action) {
    return `Не удалось выполнить действие: ${action}. Проверь права бота и иерархию ролей.`;
  },
  kickRolessDone(kicked, failed) {
    return `Чистка безрольных завершена: кикнуто **${kicked}**, ошибок **${failed}**.`;
  }
};

copy.security.banListLine = function banListLine(index, ban) {
  const username = ban?.user?.username || 'unknown';
  const reason = ban?.reason || 'без причины';
  return `${index + 1}. <@${ban.user.id}> • \`${ban.user.id}\` • ${username} • ${reason}`;
};
copy.security.blacklistLine = function blacklistLine(index, entry) {
  return `${index + 1}. <@${entry.userId}> • \`${entry.userId}\` • ${entry.reason}`;
};

copy.automod = copy.automod || {};
copy.automod.ruleLabel = function ruleLabel(rule) {
  const labels = {
    invites: 'Инвайты',
    links: 'Ссылки',
    caps: 'Капс',
    mentions: 'Упоминания',
    spam: 'Флуд',
    badWords: 'Стоп-слова'
  };
  return labels[rule] || rule;
};
copy.automod.targetLabel = function targetLabel(target) {
  const labels = {
    capsPercent: 'Порог капса',
    capsMinLength: 'Мин. длина капса',
    mentionLimit: 'Лимит упоминаний',
    spamCount: 'Лимит флуда',
    spamWindowSeconds: 'Окно флуда'
  };
  return labels[target] || target;
};
copy.automod.notice = function notice(userId, rule, detail = '') {
  return `<@${userId}>, automod удалил сообщение по правилу **${rule}**${detail ? ` (${detail})` : ''}.`;
};
copy.automod.toggleDone = function toggleDone(rule, enabled) {
  return `Правило automod **${rule}** теперь **${enabled ? 'включено' : 'выключено'}**.`;
};
copy.automod.limitDone = function limitDone(target, value) {
  return `Порог automod **${target}** обновлён: **${value}**.`;
};
copy.automod.wordAdded = function wordAdded(word) {
  return `Слова **${word}** добавлены в стоп-лист automod.`;
};
copy.automod.wordRemoved = function wordRemoved(word) {
  return `Слова **${word}** удалены из стоп-листа automod.`;
};
copy.automod.wordsCleared = 'Список стоп-слов automod очищен.';
copy.automod.wordMissing = 'Укажи слово или список слов через запятую для этой операции.';
copy.automod.actionUpdated = function actionUpdated(mode) {
  return `Режим наказания automod обновлён: ${mode}.`;
};

copy.welcome = copy.welcome || {};
Object.assign(copy.welcome, {
  statusTitle: '👋 Welcome',
  enabled: 'Включено',
  disabled: 'Выключено',
  channel: 'Канал',
  dm: 'ЛС',
  message: 'Текст',
  autorole: 'Автороль',
  messageCleared: 'Текст welcome очищен.',
  testSent: 'Тестовое welcome-сообщение отправлено.'
});
copy.welcome.updated = function updated(label) {
  return `Настройки welcome обновлены: ${label}.`;
};

copy.reactionRoles = copy.reactionRoles || {};
Object.assign(copy.reactionRoles, {
  title: '✨ Reaction Roles',
  empty: 'Связки реакций пока не настроены.',
  notFound: 'Такая reaction role не найдена.',
  messageMissing: 'Не удалось найти сообщение для этой reaction role.'
});
copy.reactionRoles.added = function added(emoji, roleId, messageId) {
  return `Reaction role добавлена: ${emoji} -> <@&${roleId}> для сообщения \`${messageId}\`.`;
};
copy.reactionRoles.removed = function removed(emoji, messageId) {
  return `Reaction role удалена: ${emoji} для сообщения \`${messageId}\`.`;
};

copy.reports = copy.reports || {};
Object.assign(copy.reports, {
  title: '📆 Расписание отчётов',
  periodWeekly: 'Weekly',
  periodMonthly: 'Monthly',
  channelMissing: 'Сначала укажи канал отчётов или передай канал в команду.'
});
copy.reports.enabled = function enabled(period, channelId) {
  return `${period} отчёт включён${channelId ? ` в <#${channelId}>` : ''}.`;
};
copy.reports.disabled = function disabled(period) {
  return `${period} отчёт выключен.`;
};
copy.reports.sent = function sent(period, channelId) {
  return `${period} отчёт отправлен${channelId ? ` в <#${channelId}>` : ''}.`;
};

copy.verification = copy.verification || {};
Object.assign(copy.verification, {
  title: 'Проверка новичков',
  enabled: 'Проверка включена.',
  disabled: 'Проверка выключена.',
  alreadyVerified: 'Ты уже прошёл подтверждение.',
  roleMissing: 'Сначала укажи роль после подтверждения или autorole.',
  noPermission: 'Бот не смог выдать роль после подтверждения. Проверь права и иерархию ролей.',
  modalTitle: 'Стартовая анкета',
  modalNick: 'Игровой ник',
  modalReason: 'Зачем пришёл',
  modalRules: 'Подтверди, что ознакомился с правилами',
  rulesButton: 'Правила',
  verifyButton: 'Подтвердить',
  applyButton: 'Подать заявку'
});
copy.verification.status = function status(enabled, roleId, questionnaireEnabled) {
  return [
    `Статус: ${enabled ? 'включено' : 'выключено'}`,
    `Роль после подтверждения: ${roleId ? `<@&${roleId}>` : 'не задана'}`,
    `Стартовая анкета: ${questionnaireEnabled ? 'включена' : 'выключена'}`
  ].join('\n');
};
copy.verification.updated = function updated(label) {
  return `Настройки verification обновлены: ${label}.`;
};
copy.verification.success = function success(roleId) {
  return `Подтверждение пройдено. Роль выдана${roleId ? `: <@&${roleId}>` : '.'}`;
};

copy.roleMenus = copy.roleMenus || {};
Object.assign(copy.roleMenus, {
  title: 'Меню ролей',
  empty: 'Role-menu пока не созданы.',
  notFound: 'Такое role-menu не найдено.'
});
copy.roleMenus.created = function created(menuId) {
  return `Role-menu \`${menuId}\` создано.`;
};
copy.roleMenus.itemAdded = function itemAdded(menuId, roleId) {
  return `Роль <@&${roleId}> добавлена в menu \`${menuId}\`.`;
};
copy.roleMenus.itemRemoved = function itemRemoved(menuId, roleId) {
  return `Роль <@&${roleId}> удалена из menu \`${menuId}\`.`;
};
copy.roleMenus.published = function published(menuId, channelId) {
  return `Role-menu \`${menuId}\` опубликовано в <#${channelId}>.`;
};
copy.roleMenus.roleAdded = function roleAdded(roleId) {
  return `Роль <@&${roleId}> выдана.`;
};
copy.roleMenus.roleRemoved = function roleRemoved(roleId) {
  return `Роль <@&${roleId}> снята.`;
};

copy.customCommands = copy.customCommands || {};
Object.assign(copy.customCommands, {
  title: 'Пользовательские команды',
  empty: 'Пользовательские триггеры пока не настроены.',
  notFound: 'Такой триггер не найден.'
});
copy.customCommands.added = function added(name) {
  return `Триггер \`${name}\` сохранён.`;
};
copy.customCommands.removed = function removed(name) {
  return `Триггер \`${name}\` удалён.`;
};

copy.stats = {
  ...copy.stats,
  leaderboardTitle: '🏆 Таблица участников',
  leaderboardDescription: 'Рейтинг по очкам репутации от 0 до 100.',
  leaderboardEmpty: 'Пока нет участников для таблицы.',
  voiceTitle: '🎙 Голосовая активность',
  voiceDescription: 'Топ участников по времени в голосовых каналах.',
  voiceEmpty: 'Пока нет активности в голосовых каналах.',
  pointsField: 'Очки',
  voiceField: 'Голос',
  hours(value) {
    return `${Number(value || 0).toFixed(1)} ч`;
  },
  leaderboardLine(index, member, roleName, points, voiceHours) {
    return `${index + 1}. ${roleName} • <@${member.id}> • ${points}/100 • ${this.hours(voiceHours)}`;
  },
  voiceLine(index, member, hours, points) {
    return `${index + 1}. <@${member.id}> • ${this.hours(hours)} • ${points}/100`;
  }
};

copy.ai.advisorTitle = function advisorTitle(displayName) {
  return `🤖 AI-советник: ${displayName}`;
};
copy.ai.advisorFooter = 'BRHD • Phoenix • AI Advisor';
copy.ai.advisorUnavailable = 'AI-советник временно недоступен.';
copy.ai.commandsOverviewTitle = 'Что тебе доступно сейчас';
copy.ai.commandsOverviewEmpty = 'Не нашёл доступных команд для твоих прав.';
copy.ai.nicknameMissingTarget = 'Для смены ника укажи пользователя и новый ник.';
copy.ai.nicknameNoAccess = 'Для смены ника через AI нужны права администратора или Manage Nicknames.';
copy.ai.nicknameTooLong = 'Новый ник должен быть от 1 до 32 символов.';
copy.ai.nicknameDone = function nicknameDone(userId, nickname) {
  return `AI изменил ник для <@${userId}> на **${nickname}**.`;
};
copy.ai.nicknameFailed = 'AI не смог изменить ник. Проверь права бота и иерархию ролей.';

copy.admin.noOwnerAccess = 'Эта команда доступна только владельцам бота.';
copy.admin.premiumOnly = 'Эта функция доступна только на тарифе Premium.';
copy.admin.setupSaved = 'Настройки сервера сохранены в базе.';
copy.admin.setupTitle = '⚙️ Setup сервера';
copy.admin.setupDescription = function setupDescription(guildName) {
  return `Конфигурация для сервера "${guildName}" сохранена.`;
};
copy.admin.panelTitle = '🛠 Админ-панель сервера';
copy.admin.panelFree = 'Free - 0$';
copy.admin.panelPremium = 'Premium - 5$';
copy.admin.panelFieldPlan = 'Тариф';
copy.admin.panelFieldSetup = 'Setup';
copy.admin.panelFieldFeatures = 'Функции';
copy.admin.panelFieldChannels = 'Каналы';
copy.admin.panelFieldRoles = 'Роли';
copy.admin.panelFieldVisuals = 'Баннеры';
copy.admin.panelSetupDone = 'Настроен';
copy.admin.panelSetupPending = 'Не настроен';
copy.admin.panelFeatures = function panelFeatures(plan) {
  if (plan === 'premium') {
    return [
      '• всё из Free',
      '• лидерборд и голосовая активность',
      '• админ-отчёты по активности',
      '• оффлайн AI и AI-анализ заявок',
      '• авто-ранги и авто-DM',
      '• чёрный список и бан-лист',
      '• anti-leak и защита каналов',
      '• еженедельная очистка без ролей',
      '• AFK-предупреждения за 3 дня'
    ].join('\n');
  }

  return [
    '• панель семьи',
    '• заявки и кнопка подачи',
    '• профили участников',
    '• настройка ролей и каналов через Discord',
    '• ручные похвалы и преды',
    '• базовая админка сервера'
  ].join('\n');
};
copy.admin.channelLine = function channelLine(label, value) {
  return `${label}: ${value || 'не задан'}`;
};
copy.admin.roleLine = function roleLine(label, value) {
  return `${label}: ${value || 'не задана'}`;
};
copy.admin.visualLine = function visualLine(label, value) {
  return `${label}: ${value || 'не задан'}`;
};
copy.admin.subscriptionUpdated = function subscriptionUpdated(plan) {
  return `Подписка сервера обновлена: ${plan === 'premium' ? 'Premium - 5$' : 'Free - 0$'}.`;
};

copy.help.title = function title(plan) {
  return `📚 Команды бота • ${plan === 'premium' ? 'Premium - 5$' : 'Free - 0$'}`;
};
copy.help.regularSection = 'Обычные команды';
copy.help.adminSection = 'Команды администрации';
copy.help.premiumRegularSection = 'Обычные команды в Premium';
copy.help.premiumAdminSection = 'Админ-команды в Premium';
copy.help.freeSection = 'Доступно сейчас';
copy.help.premiumSection = 'В Premium';
copy.help.none = 'Нет доступных команд для этого раздела.';
copy.help.line = function line(name, description) {
  return `/${name} - ${description}`;
};

function copy107Hours(value) {
  return `${Number(value || 0).toFixed(1)} ч`;
}

copy.common = {
  ...copy.common,
  noAccess: 'У тебя нет доступа к этой команде.',
  moduleDisabled: 'Этот модуль сервера сейчас отключён.'
};

copy.family = {
  ...copy.family,
  menuTitle: 'Панель семьи',
  refreshButton: 'Обновить',
  profileButton: 'Профиль',
  leaderboardButton: 'Топ',
  voiceButton: 'Голос',
  applyButton: 'Подать заявку',
  adminApplicationsButton: 'Заявки',
  adminAiAdvisorButton: 'AI-совет',
  adminPanelButton: 'Админка',
  adminBlacklistButton: 'ЧС',
  adminReportButton: 'Отчёт',
  legend: '🟢 Онлайн • 🟡 Отошёл • ⛔ Не беспокоить • ⚫ Оффлайн',
  panelUpdated: 'Панель обновлена.'
};

copy.profile = {
  ...copy.profile,
  title: '👤 Профиль участника',
  description: userId => `Информация о <@${userId}>`,
  fieldRoles: '📌 Роли семьи',
  fieldAutoRank: '📊 Авто-ранг',
  noRoles: 'Без семейной роли',
  notFound: 'Участник не найден.'
};

copy.stats = {
  ...copy.stats,
  leaderboardTitle: '🏆 Таблица участников',
  leaderboardDescription: 'Премиальный срез репутации семьи в стиле BRHD / Phoenix.',
  leaderboardEmpty: 'Пока нет участников для таблицы.',
  voiceTitle: '🎙 Голосовая активность',
  voiceDescription: 'Топ участников по времени в голосовых каналах.',
  voiceEmpty: 'Пока нет активности в голосовых каналах.',
  pointsField: 'Очки',
  voiceField: 'Голос',
  hours: copy107Hours,
  leaderboardLine(index, member, roleName, points, voiceHours) {
    return `${index + 1}. ${roleName} • <@${member.id}> • ${points}/100 • ${copy107Hours(voiceHours)}`;
  },
  voiceLine(index, member, hours, points) {
    return `${index + 1}. <@${member.id}> • ${copy107Hours(hours)} • ${points}/100`;
  }
};

copy.ai = {
  ...copy.ai,
  commandsOverviewTitle: 'Что тебе доступно сейчас',
  commandsOverviewEmpty: 'Не нашёл доступных команд для твоих прав.',
  advisorUnavailable: 'AI-советник временно недоступен.',
  nicknameMissingTarget: 'Для смены ника укажи пользователя и новый ник.',
  nicknameNoAccess: 'Для смены ника через AI нужны права администратора или Manage Nicknames.',
  nicknameTooLong: 'Новый ник должен быть от 1 до 32 символов.',
  nicknameDone: (userId, nickname) => `AI изменил ник для <@${userId}> на **${nickname}**.`,
  nicknameFailed: 'AI не смог изменить ник. Проверь права бота и иерархию ролей.'
};

copy.admin = {
  ...copy.admin,
  noOwnerAccess: 'Эта команда доступна только владельцам бота.',
  premiumOnly: 'Эта функция доступна только на тарифе Premium.',
  setupSaved: 'Настройки сервера сохранены в базе.',
  panelTitle: '🛠 Админ-панель сервера',
  panelFree: 'Free - 0$',
  panelPremium: 'Premium - 5$'
};

copy.help = {
  ...copy.help,
  title: plan => `📚 Команды бота • ${plan === 'premium' ? 'Premium - 5$' : 'Free - 0$'}`,
  regularSection: 'Обычные команды',
  adminSection: 'Команды администрации',
  premiumRegularSection: 'Обычные команды в Premium',
  premiumAdminSection: 'Админ-команды в Premium',
  freeSection: 'Доступно сейчас',
  premiumSection: 'В Premium',
  none: 'Нет доступных команд для этого раздела.',
  line: (name, description) => `/${name} - ${description}`
};

function release106CopyHours(value) {
  return `${Number(value || 0).toFixed(1)} ч`;
}

copy.family = {
  ...copy.family,
  refreshButton: 'Обновить',
  profileButton: 'Профиль',
  leaderboardButton: 'Топ',
  voiceButton: 'Голос',
  applyButton: 'Подать заявку',
  adminApplicationsButton: 'Заявки',
  adminAiAdvisorButton: 'AI-совет',
  adminPanelButton: 'Админка',
  adminBlacklistButton: 'ЧС',
  adminReportButton: 'Отчёт',
  legend: '🟢 Онлайн • 🟡 Отошёл • ⛔ Не беспокоить • ⚫ Оффлайн',
  panelUpdated: 'Панель обновлена.'
};

copy.profile = {
  ...copy.profile,
  title: '👤 Профиль участника',
  description: userId => `Информация о <@${userId}>`,
  fieldRoles: '📌 Роли семьи',
  fieldAutoRank: '📊 Авто-ранг',
  noRoles: 'Без семейной роли',
  notFound: 'Участник не найден.'
};

copy.stats = {
  ...copy.stats,
  leaderboardTitle: '🏆 Таблица участников',
  leaderboardDescription: 'Премиальный срез репутации семьи в стиле BRHD / Phoenix.',
  leaderboardEmpty: 'Пока нет участников для таблицы.',
  voiceTitle: '🎙 Голосовая активность',
  voiceDescription: 'Топ участников по времени в голосовых каналах.',
  voiceEmpty: 'Пока нет активности в голосовых каналах.',
  pointsField: 'Очки',
  voiceField: 'Голос',
  hours: release106CopyHours,
  leaderboardLine(index, member, roleName, points, voiceHours) {
    return `${index + 1}. ${roleName} • <@${member.id}> • ${points}/100 • ${release106CopyHours(voiceHours)}`;
  },
  voiceLine(index, member, hours, points) {
    return `${index + 1}. <@${member.id}> • ${release106CopyHours(hours)} • ${points}/100`;
  }
};

copy.ai = {
  ...copy.ai,
  commandsOverviewTitle: 'Что тебе доступно сейчас',
  commandsOverviewEmpty: 'Не нашёл доступных команд для твоих прав.',
  advisorUnavailable: 'AI-советник временно недоступен.'
};

copy.admin = {
  ...copy.admin,
  panelTitle: '🛠 Админ-панель сервера',
  panelFree: 'Free - 0$',
  panelPremium: 'Premium - 5$',
  setupSaved: 'Настройки сервера сохранены в базе.',
  premiumOnly: 'Эта функция доступна только на тарифе Premium.'
};

copy.help = {
  ...copy.help,
  title: plan => `📚 Команды бота • ${plan === 'premium' ? 'Premium - 5$' : 'Free - 0$'}`,
  regularSection: 'Обычные команды',
  adminSection: 'Команды администрации',
  premiumRegularSection: 'Обычные команды в Premium',
  premiumAdminSection: 'Админ-команды в Premium',
  freeSection: 'Доступно сейчас',
  premiumSection: 'В Premium',
  none: 'Нет доступных команд для этого раздела.',
  line: (name, description) => `/${name} - ${description}`
};
function finalHoursFormatter(value) {
  return `${Number(value || 0).toFixed(1)} ч`;
}

copy.common = {
  ...copy.common,
  unknownError: 'Произошла ошибка. Попробуй ещё раз.',
  noAccess: 'У тебя нет доступа к этой команде.'
};

copy.family = {
  ...copy.family,
  refreshButton: 'Обновить',
  profileButton: 'Профиль',
  leaderboardButton: 'Топ',
  voiceButton: 'Голос',
  applyButton: 'Подать заявку',
  adminApplicationsButton: 'Заявки',
  adminAiAdvisorButton: 'AI-совет',
  adminPanelButton: 'Админка',
  adminBlacklistButton: 'ЧС',
  adminReportButton: 'Отчёт',
  panelUpdated: 'Панель обновлена.',
  legend: '🟢 Онлайн • 🟡 Отошёл • ⛔ Не беспокоить • ⚫ Оффлайн'
};

copy.profile = {
  ...copy.profile,
  title: '👤 Профиль участника',
  description(userId) {
    return `Информация о <@${userId}>`;
  },
  fieldRoles: '📌 Роли семьи',
  fieldAutoRank: '📊 Авто-ранг',
  noRoles: 'Нет семейной роли.',
  notFound: 'Участник не найден.'
};

copy.admin = {
  ...copy.admin,
  panelFree: 'Free — 0$',
  panelPremium: 'Premium — 5$',
  premiumOnly: 'Эта функция доступна только на тарифе Premium.'
};

copy.stats = {
  ...copy.stats,
  leaderboardTitle: '🏆 Таблица участников',
  leaderboardDescription: 'Премиальный срез репутации семьи в стиле BRHD / Phoenix.',
  leaderboardEmpty: 'Пока нет участников для таблицы.',
  voiceTitle: '🎙 Голосовая активность',
  voiceDescription: 'Топ участников по времени в голосовых каналах.',
  voiceEmpty: 'Пока нет активности в голосовых каналах.',
  pointsField: 'Очки',
  voiceField: 'Голос',
  hours: finalHoursFormatter,
  leaderboardLine(index, member, roleName, points, voiceHours) {
    return `${index + 1}. ${roleName} • <@${member.id}> • ${points}/100 • ${finalHoursFormatter(voiceHours)}`;
  },
  voiceLine(index, member, hours, points) {
    return `${index + 1}. <@${member.id}> • ${finalHoursFormatter(hours)} • ${points}/100`;
  }
};

copy.ai = {
  ...copy.ai,
  commandsOverviewTitle: 'Что тебе доступно сейчас',
  commandsOverviewEmpty: 'Не нашёл доступных команд для твоих прав.',
  advisorUnavailable: 'AI-советник временно недоступен.'
};

copy.help = {
  ...copy.help,
  title(plan) {
    return `📚 Команды бота • ${plan === 'premium' ? 'Premium — 5$' : 'Free — 0$'}`;
  },
  regularSection: 'Обычные команды',
  adminSection: 'Команды администрации',
  premiumRegularSection: 'Обычные команды в Premium',
  premiumAdminSection: 'Админ-команды в Premium',
  freeSection: 'Доступно сейчас',
  premiumSection: 'В Premium',
  none: 'Нет доступных команд для этого раздела.',
  line(name, description) {
    return `/${name} - ${description}`;
  }
};

function liveHoursFormatter(value) {
  return `${Number(value || 0).toFixed(1)} ч`;
}

copy.common = {
  ...copy.common,
  unknownError: 'Произошла ошибка. Попробуй ещё раз.',
  noAccess: 'У тебя нет доступа к этой команде.'
};

copy.roles = {
  ...copy.roles,
  leader: 'Лидер',
  deputy: 'Заместители',
  elder: 'Старшие',
  member: 'Участники',
  newbie: 'Новички',
  mute: 'Мут'
};

copy.family = {
  ...copy.family,
  refreshButton: 'Обновить',
  profileButton: 'Профиль',
  leaderboardButton: 'Топ',
  voiceButton: 'Голос',
  applyButton: 'Подать заявку',
  adminApplicationsButton: 'Заявки',
  adminAiAdvisorButton: 'AI-совет',
  adminPanelButton: 'Админка',
  adminBlacklistButton: 'ЧС',
  adminReportButton: 'Отчёт',
  panelUpdated: 'Панель обновлена.',
  aiAdvisorModalTitle: 'AI-совет по участнику',
  aiAdvisorModalLabel: 'Участник',
  aiAdvisorModalPlaceholder: 'ID, @упоминание или ник'
};

copy.profile = {
  ...copy.profile,
  title: 'Профиль участника',
  description: userId => `Информация о <@${userId}>`,
  noRoles: 'Нет семейных ролей',
  fieldRoles: 'Роли семьи',
  fieldAutoRank: 'Авто-ранг'
};

copy.ranks = {
  ...copy.ranks,
  autoDisabled: 'Авто-ранги выключены.',
  manualOnly: roleName => `Авто-ранг работает в ручном режиме. Текущий ранг: ${roleName}.`,
  alreadySynced: (roleName, score) => `Авто-ранг уже синхронизирован с ролью ${roleName}. Очки: ${score}.`,
  autoStatus: (targetRoleName, score) => `Следующий авто-ранг: ${targetRoleName}. Очки: ${score}.`,
  autoUnavailable: 'Авто-ранг пока не определён.'
};

copy.help = {
  ...copy.help,
  regularSection: 'Обычные команды',
  adminSection: 'Команды администрации',
  premiumRegularSection: 'Обычные команды в Premium',
  premiumAdminSection: 'Админ-команды в Premium',
  freeSection: 'Доступно сейчас',
  premiumSection: 'В Premium',
  none: 'Нет доступных команд для этого раздела.',
  line: (name, description) => `/${name} - ${description}`
};

copy.admin = {
  ...copy.admin,
  panelTitle: 'Панель администратора',
  panelFree: 'Free - 0$',
  panelPremium: 'Premium - 5$',
  panelFieldPlan: 'Тариф',
  panelFieldSetup: 'Setup',
  panelFieldFeatures: 'Возможности',
  panelFieldChannels: 'Каналы',
  panelFieldRoles: 'Роли',
  panelFieldVisuals: 'Баннеры',
  panelSetupDone: 'Настроен',
  panelSetupPending: 'Не настроен'
};

copy.admin.panelFeatures = function panelFeatures(plan) {
  if (plan === 'premium') {
    return [
      '• всё из Free',
      '• лидерборд и голосовая активность',
      '• админ-отчёты по активности',
      '• оффлайн AI и AI-анализ заявок',
      '• авто-ранги и авто-DM',
      '• чёрный список и бан-лист',
      '• anti-leak и защита каналов',
      '• еженедельная очистка без ролей',
      '• AFK-предупреждения за 3 дня'
    ].join('\n');
  }

  return [
    '• панель семьи',
    '• заявки и кнопка подачи',
    '• профили участников',
    '• настройка ролей и каналов через Discord',
    '• ручные похвалы и выговоры',
    '• базовая админка сервера'
  ].join('\n');
};

copy.welcome = {
  ...copy.welcome,
  title: 'Добро пожаловать',
  enabled: 'Включено',
  disabled: 'Выключено',
  channel: 'Канал',
  dm: 'ЛС',
  message: 'Текст',
  autorole: 'Автороль',
  messageCleared: 'Текст welcome очищен.',
  testSent: 'Тестовое welcome-сообщение отправлено.',
  updated: label => `Настройки welcome обновлены: ${label}.`
};

copy.reports = {
  ...copy.reports,
  title: 'Расписание отчётов',
  periodWeekly: 'Weekly',
  periodMonthly: 'Monthly',
  channelMissing: 'Сначала укажи канал отчётов или передай канал в команду.',
  enabled: (period, channelId) => `${period} отчёт включён${channelId ? ` в <#${channelId}>` : ''}.`,
  disabled: period => `${period} отчёт выключен.`,
  sent: (period, channelId) => `${period} отчёт отправлен${channelId ? ` в <#${channelId}>` : ''}.`
};

copy.verification = {
  ...copy.verification,
  title: 'Проверка новичков',
  enabled: 'Проверка включена.',
  disabled: 'Проверка выключена.',
  alreadyVerified: 'Ты уже прошёл подтверждение.',
  roleMissing: 'Сначала укажи роль после подтверждения или autorole.',
  noPermission: 'Бот не смог выдать роль после подтверждения. Проверь права и иерархию ролей.',
  modalTitle: 'Стартовая анкета',
  modalNick: 'Игровой ник',
  modalReason: 'Зачем пришёл',
  modalRules: 'Подтверди, что ознакомился с правилами',
  rulesButton: 'Правила',
  verifyButton: 'Подтвердить',
  applyButton: 'Подать заявку',
  status: (enabled, roleId, questionnaireEnabled) => [
    `Статус: ${enabled ? 'включено' : 'выключено'}`,
    `Роль после подтверждения: ${roleId ? `<@&${roleId}>` : 'не задана'}`,
    `Стартовая анкета: ${questionnaireEnabled ? 'включена' : 'выключена'}`
  ].join('\n'),
  updated: label => `Настройки verification обновлены: ${label}.`,
  success: roleId => `Подтверждение пройдено. Роль выдана${roleId ? `: <@&${roleId}>` : '.'}`
};

copy.roleMenus = {
  ...copy.roleMenus,
  title: 'Меню ролей',
  empty: 'Role-menu пока не созданы.',
  notFound: 'Такое role-menu не найдено.',
  created: menuId => `Role-menu \`${menuId}\` создано.`,
  itemAdded: (menuId, roleId) => `Роль <@&${roleId}> добавлена в menu \`${menuId}\`.`,
  itemRemoved: (menuId, roleId) => `Роль <@&${roleId}> удалена из menu \`${menuId}\`.`,
  published: (menuId, channelId) => `Role-menu \`${menuId}\` опубликовано в <#${channelId}>.`,
  roleAdded: roleId => `Роль <@&${roleId}> выдана.`,
  roleRemoved: roleId => `Роль <@&${roleId}> снята.`
};

copy.customCommands = {
  ...copy.customCommands,
  title: 'Пользовательские команды',
  empty: 'Пользовательские триггеры пока не настроены.',
  notFound: 'Такой триггер не найден.',
  added: name => `Триггер \`${name}\` сохранён.`,
  removed: name => `Триггер \`${name}\` удалён.`
};

copy.stats = {
  ...copy.stats,
  leaderboardTitle: 'Таблица участников',
  leaderboardDescription: 'Премиальный срез репутации семьи в стиле BRHD / Phoenix.',
  leaderboardEmpty: 'Пока нет участников для таблицы.',
  voiceTitle: 'Голосовая активность',
  voiceDescription: 'Топ участников по времени в голосовых каналах.',
  voiceEmpty: 'Пока нет активности в голосовых каналах.',
  pointsField: 'Очки',
  voiceField: 'Голос',
  hours: liveHoursFormatter,
  leaderboardLine(index, member, roleName, points, voiceHours) {
    return `${index + 1}. ${roleName} • <@${member.id}> • ${points}/100 • ${liveHoursFormatter(voiceHours)}`;
  },
  voiceLine(index, member, hours, points) {
    return `${index + 1}. <@${member.id}> • ${liveHoursFormatter(hours)} • ${points}/100`;
  }
};

copy.ai = {
  ...copy.ai,
  advisorTitle: displayName => `AI-советник: ${displayName}`,
  advisorFooter: 'BRHD • Phoenix • AI Advisor',
  advisorUnavailable: 'AI-советник временно недоступен.',
  commandsOverviewTitle: 'Что тебе доступно сейчас',
  commandsOverviewEmpty: 'Не нашёл доступных команд для твоих прав.',
  nicknameMissingTarget: 'Для смены ника укажи пользователя и новый ник.',
  nicknameNoAccess: 'Для смены ника через AI нужны права администратора или Manage Nicknames.',
  nicknameTooLong: 'Новый ник должен быть от 1 до 32 символов.',
  nicknameDone: (userId, nickname) => `AI изменил ник для <@${userId}> на **${nickname}**.`,
  nicknameFailed: 'AI не смог изменить ник. Проверь права бота и иерархию ролей.'
};

copy.common = copy.common || {};
Object.assign(copy.common, {
  noAccess: 'У тебя нет доступа к этой команде.',
  moduleDisabled: 'Этот модуль сервера сейчас отключён.'
});

copy.profile = copy.profile || {};
Object.assign(copy.profile, {
  notFound: 'Участник не найден.'
});

copy.family = copy.family || {};
Object.assign(copy.family, {
  menuTitle: 'Панель семьи',
  refreshButton: 'Обновить',
  profileButton: 'Профиль',
  leaderboardButton: 'Топ',
  voiceButton: 'Голос',
  applyButton: 'Подать заявку',
  adminApplicationsButton: 'Заявки',
  adminAiAdvisorButton: 'AI-совет',
  adminPanelButton: 'Админка',
  adminBlacklistButton: 'ЧС',
  adminReportButton: 'Отчёт',
  aiAdvisorModalTitle: 'AI-советник',
  aiAdvisorModalLabel: 'Участник',
  aiAdvisorModalPlaceholder: 'ID, ник или @упоминание'
});

copy.moderation = {
  ...copy.moderation,
  noAccess: 'У тебя нет доступа к этой модераторской команде.',
  premiumOnly: 'Эта модераторская команда доступна только на Premium.',
  muteRoleMissing: 'Сначала задай mute-роль через /setrole.',
  invalidCount: 'Укажи количество от 1 до 500.',
  invalidSeconds: 'Укажи значение от 0 до 21600 секунд.',
  invalidConfirmation: 'Для полной очистки канала нужно написать `CLEAR`.',
  notTextChannel: 'Эта команда работает только с текстовыми каналами сервера.',
  purgeDone(count, channelId) {
    return `Удалено сообщений: **${count}** в канале <#${channelId}>.`;
  },
  purgeUserDone(count, userId, channelId) {
    return `Удалено сообщений участника <@${userId}>: **${count}** в канале <#${channelId}>.`;
  },
  purgeUserScanDone(count, matched, userId, channelId) {
    return `Удалено сообщений участника <@${userId}>: **${count}** из **${matched}** найденных в канале <#${channelId}>.`;
  },
  purgeUserDetailed(count, matched, blocked, system, userId, channelId) {
    const details = [
      `Удалено сообщений участника <@${userId}>: **${count}**`,
      `Найдено совпадений: **${matched}**`,
      `Канал: <#${channelId}>`
    ];
    if (blocked > 0) details.push(`Неудаляемых сообщений: **${blocked}**`);
    if (system > 0) details.push(`Системных записей Discord: **${system}**`);
    return details.join(' • ');
  },
  clearChannelDone(oldChannelId, newChannelId) {
    return `Канал <#${oldChannelId}> очищен. Новый канал: <#${newChannelId}>.`;
  },
  clearChannelPartial(channelId, deleted, skipped) {
    return `Канал <#${channelId}> очищен частично. Удалено: **${deleted}**. Осталось неудаляемых или системных сообщений: **${skipped}**.`;
  },
  muteDone(userId, roleId) {
    return `Участнику <@${userId}> выдан мут <@&${roleId}>.`;
  },
  unmuteDone(userId) {
    return `С участника <@${userId}> снят мут.`;
  },
  slowmodeDone(channelId, seconds) {
    return seconds > 0
      ? `Slowmode для <#${channelId}> установлен на **${seconds}** сек.`
      : `Slowmode для <#${channelId}> отключён.`;
  },
  lockDone(channelId) {
    return `Канал <#${channelId}> закрыт для @everyone.`;
  },
  unlockDone(channelId) {
    return `Канал <#${channelId}> снова открыт для @everyone.`;
  },
  warnHistoryTitle(userTag) {
    return `История выговоров: ${userTag}`;
  },
  warnHistoryEmpty: 'У участника пока нет сохранённых выговоров.',
  warnHistoryLine(index, entry) {
    return `${index + 1}. ${entry.reason} • модератор <@${entry.moderatorId}> • ${entry.createdAt}`;
  },
  clearWarnsDone(userId, count) {
    return `Для <@${userId}> очищено выговоров: **${count}**.`;
  },
  actionFailed(action) {
    return `Не удалось выполнить действие: ${action}. Проверь права бота и иерархию ролей.`;
  },
  kickRolessDone(kicked, failed) {
    return `Чистка безрольных завершена: кикнуто **${kicked}**, ошибок **${failed}**.`;
  }
};

copy.security = copy.security || {};
copy.security.banListLine = function banListLine(index, ban) {
  const username = ban?.user?.username || 'unknown';
  const reason = ban?.reason || 'без причины';
  return `${index + 1}. <@${ban.user.id}> • \`${ban.user.id}\` • ${username} • ${reason}`;
};
copy.security.blacklistLine = function blacklistLine(index, entry) {
  return `${index + 1}. <@${entry.userId}> • \`${entry.userId}\` • ${entry.reason}`;
};

copy.automod = copy.automod || {};
copy.automod.ruleLabel = function ruleLabel(rule) {
  const labels = {
    invites: 'Инвайты',
    links: 'Ссылки',
    caps: 'Капс',
    mentions: 'Упоминания',
    spam: 'Флуд',
    badWords: 'Стоп-слова'
  };
  return labels[rule] || rule;
};
copy.automod.targetLabel = function targetLabel(target) {
  const labels = {
    capsPercent: 'Порог капса',
    capsMinLength: 'Мин. длина капса',
    mentionLimit: 'Лимит упоминаний',
    spamCount: 'Лимит флуда',
    spamWindowSeconds: 'Окно флуда'
  };
  return labels[target] || target;
};
copy.automod.notice = function notice(userId, rule, detail = '') {
  return `<@${userId}>, automod удалил сообщение по правилу **${rule}**${detail ? ` (${detail})` : ''}.`;
};
copy.automod.toggleDone = function toggleDone(rule, enabled) {
  return `Правило automod **${rule}** теперь **${enabled ? 'включено' : 'выключено'}**.`;
};
copy.automod.limitDone = function limitDone(target, value) {
  return `Порог automod **${target}** обновлён: **${value}**.`;
};
copy.automod.wordAdded = function wordAdded(word) {
  return `Слова **${word}** добавлены в стоп-лист automod.`;
};
copy.automod.wordRemoved = function wordRemoved(word) {
  return `Слова **${word}** удалены из стоп-листа automod.`;
};
copy.automod.wordsCleared = 'Список стоп-слов automod очищен.';
copy.automod.wordMissing = 'Укажи слово или список слов через запятую для этой операции.';
copy.automod.actionUpdated = function actionUpdated(mode) {
  return `Режим наказания automod обновлён: ${mode}.`;
};

copy.welcome = copy.welcome || {};
Object.assign(copy.welcome, {
  statusTitle: '👋 Welcome',
  enabled: 'Включено',
  disabled: 'Выключено',
  channel: 'Канал',
  dm: 'ЛС',
  message: 'Текст',
  autorole: 'Автороль',
  messageCleared: 'Текст welcome очищен.',
  testSent: 'Тестовое welcome-сообщение отправлено.'
});
copy.welcome.updated = function updated(label) {
  return `Настройки welcome обновлены: ${label}.`;
};

copy.reactionRoles = copy.reactionRoles || {};
Object.assign(copy.reactionRoles, {
  title: '✨ Reaction Roles',
  empty: 'Связки реакций пока не настроены.',
  notFound: 'Такая reaction role не найдена.',
  messageMissing: 'Не удалось найти сообщение для этой reaction role.'
});
copy.reactionRoles.added = function added(emoji, roleId, messageId) {
  return `Reaction role добавлена: ${emoji} -> <@&${roleId}> для сообщения \`${messageId}\`.`;
};
copy.reactionRoles.removed = function removed(emoji, messageId) {
  return `Reaction role удалена: ${emoji} для сообщения \`${messageId}\`.`;
};

copy.reports = copy.reports || {};
Object.assign(copy.reports, {
  title: '📆 Расписание отчётов',
  periodWeekly: 'Weekly',
  periodMonthly: 'Monthly',
  channelMissing: 'Сначала укажи канал отчётов или передай канал в команду.'
});
copy.reports.enabled = function enabled(period, channelId) {
  return `${period} отчёт включён${channelId ? ` в <#${channelId}>` : ''}.`;
};
copy.reports.disabled = function disabled(period) {
  return `${period} отчёт выключен.`;
};
copy.reports.sent = function sent(period, channelId) {
  return `${period} отчёт отправлен${channelId ? ` в <#${channelId}>` : ''}.`;
};

copy.verification = copy.verification || {};
Object.assign(copy.verification, {
  title: 'Проверка новичков',
  enabled: 'Проверка включена.',
  disabled: 'Проверка выключена.',
  alreadyVerified: 'Ты уже прошёл подтверждение.',
  roleMissing: 'Сначала укажи роль после подтверждения или autorole.',
  noPermission: 'Бот не смог выдать роль после подтверждения. Проверь права и иерархию ролей.',
  modalTitle: 'Стартовая анкета',
  modalNick: 'Игровой ник',
  modalReason: 'Зачем пришёл',
  modalRules: 'Подтверди, что ознакомился с правилами',
  rulesButton: 'Правила',
  verifyButton: 'Подтвердить',
  applyButton: 'Подать заявку'
});
copy.verification.status = function status(enabled, roleId, questionnaireEnabled) {
  return [
    `Статус: ${enabled ? 'включено' : 'выключено'}`,
    `Роль после подтверждения: ${roleId ? `<@&${roleId}>` : 'не задана'}`,
    `Стартовая анкета: ${questionnaireEnabled ? 'включена' : 'выключена'}`
  ].join('\n');
};
copy.verification.updated = function updated(label) {
  return `Настройки verification обновлены: ${label}.`;
};
copy.verification.success = function success(roleId) {
  return `Подтверждение пройдено. Роль выдана${roleId ? `: <@&${roleId}>` : '.'}`;
};

copy.roleMenus = copy.roleMenus || {};
Object.assign(copy.roleMenus, {
  title: 'Меню ролей',
  empty: 'Role-menu пока не созданы.',
  notFound: 'Такое role-menu не найдено.'
});
copy.roleMenus.created = function created(menuId) {
  return `Role-menu \`${menuId}\` создано.`;
};
copy.roleMenus.itemAdded = function itemAdded(menuId, roleId) {
  return `Роль <@&${roleId}> добавлена в menu \`${menuId}\`.`;
};
copy.roleMenus.itemRemoved = function itemRemoved(menuId, roleId) {
  return `Роль <@&${roleId}> удалена из menu \`${menuId}\`.`;
};
copy.roleMenus.published = function published(menuId, channelId) {
  return `Role-menu \`${menuId}\` опубликовано в <#${channelId}>.`;
};
copy.roleMenus.roleAdded = function roleAdded(roleId) {
  return `Роль <@&${roleId}> выдана.`;
};
copy.roleMenus.roleRemoved = function roleRemoved(roleId) {
  return `Роль <@&${roleId}> снята.`;
};

copy.customCommands = copy.customCommands || {};
Object.assign(copy.customCommands, {
  title: 'Пользовательские команды',
  empty: 'Пользовательские триггеры пока не настроены.',
  notFound: 'Такой триггер не найден.'
});
copy.customCommands.added = function added(name) {
  return `Триггер \`${name}\` сохранён.`;
};
copy.customCommands.removed = function removed(name) {
  return `Триггер \`${name}\` удалён.`;
};

copy.stats = {
  ...copy.stats,
  leaderboardTitle: '🏆 Таблица участников',
  leaderboardDescription: 'Премиальный срез репутации семьи в стиле BRHD / Phoenix.',
  leaderboardEmpty: 'Пока нет участников для таблицы.',
  voiceTitle: '🎙 Голосовая активность',
  voiceDescription: 'Топ участников по времени в голосовых каналах.',
  voiceEmpty: 'Пока нет активности в голосовых каналах.',
  pointsField: 'Очки',
  voiceField: 'Голос',
  hours(value) {
    return `${Number(value || 0).toFixed(1)} ч`;
  },
  leaderboardLine(index, member, roleName, points, voiceHours) {
    return `${index + 1}. ${roleName} • <@${member.id}> • ${points}/100 • ${this.hours(voiceHours)}`;
  },
  voiceLine(index, member, hours, points) {
    return `${index + 1}. <@${member.id}> • ${this.hours(hours)} • ${points}/100`;
  }
};

copy.ai = copy.ai || {};
copy.ai.advisorTitle = function advisorTitle(displayName) {
  return `🤖 AI-советник: ${displayName}`;
};
copy.ai.advisorFooter = 'BRHD / Phoenix / AI Advisor';
copy.ai.advisorUnavailable = 'AI-советник временно недоступен.';
copy.ai.commandsOverviewTitle = 'Что тебе доступно сейчас';
copy.ai.commandsOverviewEmpty = 'Не нашёл доступных команд для твоих прав.';
copy.ai.nicknameMissingTarget = 'Для смены ника укажи пользователя и новый ник.';
copy.ai.nicknameNoAccess = 'Для смены ника через AI нужны права администратора или Manage Nicknames.';
copy.ai.nicknameTooLong = 'Новый ник должен быть от 1 до 32 символов.';
copy.ai.nicknameDone = function nicknameDone(userId, nickname) {
  return `AI изменил ник для <@${userId}> на **${nickname}**.`;
};
copy.ai.nicknameFailed = 'AI не смог изменить ник. Проверь права бота и иерархию ролей.';

copy.admin = copy.admin || {};
Object.assign(copy.admin, {
  noOwnerAccess: 'Эта команда доступна только владельцам бота.',
  premiumOnly: 'Эта функция доступна только на тарифе Premium.',
  setupSaved: 'Настройки сервера сохранены в базе.',
  setupTitle: '⚙️ Setup сервера',
  panelTitle: '🛠 Админ-панель сервера',
  panelFree: 'Free - 0$',
  panelPremium: 'Premium - 5$',
  panelFieldPlan: 'Тариф',
  panelFieldSetup: 'Setup',
  panelFieldFeatures: 'Возможности',
  panelFieldChannels: 'Каналы',
  panelFieldRoles: 'Роли',
  panelFieldVisuals: 'Баннеры',
  panelSetupDone: 'Настроен',
  panelSetupPending: 'Не настроен'
});
copy.admin.setupDescription = function setupDescription(guildName) {
  return `Конфигурация для сервера "${guildName}" сохранена.`;
};
copy.admin.panelFeatures = function panelFeatures(plan) {
  if (plan === 'premium') {
    return [
      '• всё из Free',
      '• лидерборд и голосовая активность',
      '• админ-отчёты по активности',
      '• оффлайн AI и AI-анализ заявок',
      '• авто-ранги и авто-DM',
      '• чёрный список и бан-лист',
      '• anti-leak и защита каналов',
      '• еженедельная очистка без ролей',
      '• AFK-предупреждения за 3 дня'
    ].join('\n');
  }

  return [
    '• панель семьи',
    '• заявки и кнопка подачи',
    '• профили участников',
    '• настройка ролей и каналов через Discord',
    '• ручные похвалы и преды',
    '• базовая админка сервера'
  ].join('\n');
};
copy.admin.channelLine = function channelLine(label, value) {
  return `${label}: ${value || 'не задан'}`;
};
copy.admin.roleLine = function roleLine(label, value) {
  return `${label}: ${value || 'не задана'}`;
};
copy.admin.visualLine = function visualLine(label, value) {
  return `${label}: ${value || 'не задан'}`;
};
copy.admin.subscriptionUpdated = function subscriptionUpdated(plan) {
  return `Подписка сервера обновлена: ${plan === 'premium' ? 'Premium - 5$' : 'Free - 0$'}.`;
};

copy.help = copy.help || {};
copy.help.title = function title(plan) {
  return `📚 Команды бота • ${plan === 'premium' ? 'Premium - 5$' : 'Free - 0$'}`;
};
copy.help.regularSection = 'Обычные команды';
copy.help.adminSection = 'Команды администрации';
copy.help.premiumRegularSection = 'Обычные команды в Premium';
copy.help.premiumAdminSection = 'Админ-команды в Premium';
copy.help.freeSection = 'Доступно сейчас';
copy.help.premiumSection = 'В Premium';
copy.help.none = 'Нет доступных команд для этого раздела.';
copy.help.line = function line(name, description) {
  return `/${name} - ${description}`;
};
