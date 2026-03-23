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

module.exports = copy;
