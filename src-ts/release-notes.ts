import type { ReleaseNoteGroups } from './types';

export const releaseNotes: Record<string, ReleaseNoteGroups> = {
  '1.0.45': {
    added: [
      'модуль GitHub backup сервера с командами /serverbackup create, /serverbackup list и /serverbackup restore',
      'автоматический backup структуры Discord-сервера по таймеру через SERVER_BACKUP_ENABLED и SERVER_BACKUP_INTERVAL_HOURS'
    ],
    updated: [
      'диагностика запуска теперь показывает статус server backup и целевой GitHub-репозиторий'
    ],
    fixed: [
      'restore требует подтверждение RESTORE и создаёт роли/каналы без удаления текущей структуры сервера'
    ]
  },
  '1.0.44': {
    added: [
      'автоматическое извлечение прямой картинки из Imgur-ссылок для /setart'
    ],
    updated: [
      'описание параметра /setart url теперь явно поддерживает изображение, GIF и Imgur'
    ],
    fixed: [
      'ссылки вида imgur.com/a/... больше не отклоняются сразу: бот пытается найти og:image и сохранить прямой image URL'
    ]
  },
  '1.0.43': {
    added: [],
    updated: [
      'панель состава снова показывает участника только в одной секции роли'
    ],
    fixed: [
      'если у участника несколько выбранных ролей панели, он отображается только в самой высокой Discord-роли'
    ]
  },
  '1.0.42': {
    added: [
      'команда /setpanelroles roles:<список> для массового выбора ролей, которые отображаются в панели состава',
      'поддержка GIF-баннеров в /setart для панели семьи и подачи заявки'
    ],
    updated: [
      'если список ролей панели задан через /setpanelroles, панель показывает только эти роли',
      'роли панели автоматически сортируются от высшей Discord-роли к низшей'
    ],
    fixed: [
      'ссылки на GIF теперь проходят проверку как поддерживаемые баннеры, если это прямой image/GIF URL'
    ]
  },
  '1.0.41': {
    added: [],
    updated: [
      'панель состава показывает участников в каждой назначенной роли, даже если у человека несколько семейных ролей',
      'списки ролей автоматически разбиваются по нескольким embed-карточкам, если участников слишком много для одного поля Discord'
    ],
    fixed: [
      'новые роли больше не скрывают участников из-за дедупликации по первой найденной роли',
      'порядок секций состава закреплён от высшей Discord-роли к низшей по позиции роли'
    ]
  },
  '1.0.40': {
    added: [
      'дополнительные семейные роли ROLE_RANK_6 - ROLE_RANK_15 для панели состава, профилей, рангов и /setrole'
    ],
    updated: [
      'панель состава теперь показывает реальные названия Discord-ролей вместо фиксированных подписей Лидер/Заместитель/Старший',
      'админ-панель ролей показывает семейные роли списком упоминаний без фиксированных названий'
    ],
    fixed: [
      'кнопки Обновить, Заявки, AI-совет, Админка, ЧС и Отчёт на панели семьи теперь доступны только пользователям с правом Administrator'
    ]
  },
  '1.0.39': {
    added: [],
    updated: [
      'welcome-сообщения теперь отправляются через короткую очередь, чтобы при массовом входе участников номера считались последовательно'
    ],
    fixed: [
      'счётчик "Ты — наш N-й участник" больше не сбивается, когда несколько людей заходят почти одновременно',
      'очистка участников без ролей больше не кикает людей, которые бустят сервер'
    ]
  },
  '1.0.38': {
    added: [
      'настраиваемое полное удаление старых application-ticket тредов через несколько секунд после закрытия',
      'название семьи из настроек в панели подачи, modal-форме и карточке заявки'
    ],
    updated: [
      'новая заявка в семью публикуется одной карточкой подтверждения прямо в канале заявок без создания ticket/thread',
      'после принятия или отказа карточка остаётся с итоговым статусом без кнопки закрытия тикета'
    ],
    fixed: [
      'старые application tickets теперь удаляются полностью, а архивирование используется только при ошибке удаления',
      'из текстов карточки заявки удалено фиксированное название Phoenix Intake',
      'повторное нажатие закрытия одного тикета больше не дублирует уведомление в Telegram'
    ]
  },
  '1.0.37': {
    added: [
      'отдельная настройка DISCORD_ONLINE_GUILD_ID для выбора сервера в Telegram-команде /online',
      'Telegram-команда /afkdecline ID причина для безопасного отклонения АФК-заявки с обязательным объяснением'
    ],
    updated: [
      'кнопка отказа в Telegram теперь только запрашивает причину и не меняет статус заявки до команды /afkdecline',
      'Discord modal и slash-команда отклонения требуют непустую причину'
    ],
    fixed: [
      'Telegram /online больше не обязан использовать старый основной GUILD_ID и показывает явно выбранный Discord-сервер',
      'АФК-заявку нельзя отклонить без причины через старую кнопку, команду или прямой вызов обработчика'
    ]
  },
  '1.0.36': {
    added: [
      'дублирование новых заявок на АФК-отпуск в Telegram с кнопками одобрения, отклонения и открытия Discord-сообщения',
      'выдача настроенной Discord-роли после одобрения АФК-заявки через Discord или Telegram',
      'команда /online в Discord и Telegram со списком участников Discord в статусах online, idle и dnd'
    ],
    updated: [
      'решение из Telegram синхронно обновляет Discord embed, реакцию, лог, persistent storage и личное уведомление пользователя',
      'Telegram-кнопки АФК доступны только администраторам или владельцу настроенного Telegram-чата'
    ],
    fixed: [
      'повторное или одновременное рассмотрение одной АФК-заявки блокируется независимо от платформы',
      'ошибка Telegram или выдачи Discord-роли не останавливает основной процесс создания и рассмотрения заявки'
    ]
  },
  '1.0.35': {
    added: [
      'полноценная система АФК-отпусков с постоянной панелью, modal-формой и подачей заявки обычным сообщением',
      'команды /afk setup, list, approve, decline, status и refresh с проверкой роли управления или права Administrator',
      'сохранение панели и заявок в общем persistent storage, логи решений, реакции и личные уведомления пользователей'
    ],
    updated: [
      'панель АФК-отпуска обновляется без дубликатов, восстанавливается после удаления и по возможности закрепляется в канале',
      'заявки получают статусы на рассмотрении, одобрено или отклонено, а повторная активная заявка блокируется'
    ],
    fixed: [
      'ошибки лог-канала, закрепления панели и закрытых личных сообщений больше не останавливают обработку заявки',
      'одновременные нажатия администраторов защищены от повторного решения по одной заявке'
    ]
  },
  '1.0.34': {
    added: [
      'отдельная нейтральная система support tickets с командами /ticket setup, info, close, claim, add, remove и list',
      'modal создания обращения с темой, описанием и доказательствами, приватный канал и persistent-кнопки управления',
      'claim, добавление и удаление участников, подтверждение закрытия, причина, подробные логи и текстовый transcript',
      'настройки категории, роли поддержки, логов, панели, cooldown, лимита и задержки удаления через env'
    ],
    updated: [
      'support tickets хранятся отдельно от Discord application tickets в существующем JSON storage',
      'создание защищено от повторных кликов, параллельных запросов и частично созданных каналов'
    ],
    fixed: [
      'ошибки Telegram, лог-канала и transcript не останавливают основной ticket flow',
      'после закрытия пользователь снова может создать обращение, а обычные участники не получают доступ к чужим каналам'
    ]
  },
  '1.0.33': {
    added: [],
    updated: [
      'welcome-сообщение снаружи содержит только упоминание нового участника для Discord-уведомления'
    ],
    fixed: [
      'приветственная фраза больше не дублируется над embed-карточкой и внутри неё'
    ]
  },
  '1.0.32': {
    added: [
      'Telegram-уведомление о входе нового Discord-участника с кнопкой подтверждения',
      'подкоманда /welcome rules для назначения канала правил',
      'автоматическая строка «Ты — наш N-й участник!» в welcome-карточке'
    ],
    updated: [
      'кнопка подтверждения привязана к конкретному новичку и сразу выдаёт настроенную стартовую роль',
      'welcome объясняет отдельным пунктом, что после стартовой роли нужно перейти в канал заявок и подать анкету'
    ],
    fixed: [
      'подтверждение в Discord доступно только владельцу сервера или пользователю с разрешением Administrator',
      'стартовая verification-анкета, её настройка и кнопка подачи заявки удалены из welcome-кнопок'
    ]
  },
  '1.0.31': {
    added: [
      'строгий TypeScript-контракт для асинхронного сервиса ответов /law'
    ],
    updated: [
      'локальный ответ по законодательству используется после любой ошибки DeepSeek, включая HTTP 402'
    ],
    fixed: [
      'обработчик /law теперь ожидает завершения lawService.answer и не передаёт undefined в EmbedBuilder.setTitle',
      'Discord больше не остаётся без ответа при отсутствии баланса DeepSeek'
    ]
  },
  '1.0.30': {
    added: [
      'жёсткий 10-секундный таймаут DeepSeek с автоматическим локальным ответом'
    ],
    updated: [
      'максимальная длина генерации DeepSeek уменьшена для более быстрого ответа в Discord'
    ],
    fixed: [
      'команда /law больше не остаётся надолго в состоянии «бот думает», если DeepSeek завис или отвечает медленно'
    ]
  },
  '1.0.29': {
    added: [
      'DeepSeek API integration для развёрнутых ответов команды /law по найденным нормам',
      'переменные DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL и DEEPSEEK_MODEL без вывода ключа в логи'
    ],
    updated: [
      'DeepSeek получает только вопрос и три релевантные выдержки из локальной базы законодательства',
      'ответ содержит проверяемый список источников со ссылками на темы Majestic RP',
      'discord.js, undici, ws и lodash обновлены до последних совместимых версий без перехода на несовместимый Discord API'
    ],
    fixed: [
      'при таймауте или ошибке DeepSeek команда /law автоматически возвращает локальный ответ и не падает'
    ]
  },
  '1.0.28': {
    added: [
      'локальная база из 27 документов законодательства Majestic RP с 1353 поисковыми фрагментами',
      'slash-команда /law question для подробного разбора ситуации обычным разговорным языком',
      'ссылки на исходные статьи форума и отказ от выдуманного ответа при слабом совпадении'
    ],
    updated: [
      'поиск понимает разговорные формулировки про госников, транспорт, задержания, обыски и служебное оружие',
      'ответ содержит короткий вывод, несколько применимых норм, выдержки и предупреждение о проверке фактов'
    ],
    fixed: [
      'бот больше не зависит от доступности форума при поиске по сохранённой законодательной базе'
    ]
  },
  '1.0.27': {
    added: [
      'anti-leak проверка отредактированных сообщений через messageUpdate',
      'security-тесты для Unicode, zero-width, spaced invite, edit bypass и ошибки удаления',
      'сканирование текста embed-полей и attachment metadata на Discord invite-ссылки'
    ],
    updated: [
      'invite detector нормализует Unicode, пробелы, скобки, обратные слеши и варианты dot/точка',
      'LEAK_GUARD_ALLOWED_ROLES стал строгим allowlist: Manage Messages и Manage Server больше не дают автоматический bypass',
      'обход anti-leak разрешён владельцу сервера и явно настроенным ролям'
    ],
    fixed: [
      'бот больше не сообщает об успешном удалении, если Discord отклонил message.delete',
      'security log содержит автора, канал, результат удаления и безопасный короткий фрагмент',
      'invite-ссылка больше не проходит через редактирование безопасного сообщения',
      'premium-проверка сохранена без изменений'
    ]
  },
  '1.0.26': {
    added: [
      'постоянная Discord-копия для объявлений и событий, созданных slash-командами /announce и /event'
    ],
    updated: [
      'Discord-origin объявление теперь сначала публикуется в DISCORD_ANNOUNCEMENTS_CHANNEL_ID, затем дублируется в Telegram',
      'одна announcement-запись сохраняет одновременно discordMessageId и telegramMessageId'
    ],
    fixed: [
      'в Discord больше не остаётся только временное ephemeral-подтверждение без самого объявления',
      'шаблоны Discord-объявлений очищены от битой кириллицы'
    ]
  },
  '1.0.25': {
    added: [
      'двусторонний Telegram ↔ Discord bridge для объявлений и семейных событий',
      'Telegram-команды /reply, /announce, /event и кнопка «Взять в работу» под новой заявкой',
      'Discord slash-команды /announce, /event и /close с проверкой ролей или Administrator',
      'ticket service с persistent состояниями open, in_progress, approved, rejected и closed',
      'уведомления о сообщениях Discord ticket с 60-секундным антиспамом и digest-счётчиком'
    ],
    updated: [
      'Telegram runtime запускает Telegraf polling и корректно останавливается при SIGINT/SIGTERM',
      'новая заявка получает кнопки открытия ticket и принятия в работу, а ticket metadata сохраняется в storage',
      'объявления сохраняют source, target platform и Discord/Telegram message IDs для защиты от дублей',
      'README и .env.example описывают announcement chats, Discord channel и CSV-список разрешённых ролей'
    ],
    fixed: [
      'ошибки Telegram по-прежнему не блокируют Discord application flow',
      'сообщения ботов, пустые сообщения, закрытые тикеты и посторонние серверные каналы не мостятся',
      'fallback applications channel хранится отдельно от thread ID и не может быть случайно удалён cleanup-логикой',
      'Telegram admin-команды отклоняются вне TELEGRAM_ADMIN_CHAT_ID'
    ]
  },
  '1.0.24': {
    added: [
      'Telegram Bot API integration через telegraf для уведомлений администратора',
      'переменные окружения TELEGRAM_BOT_TOKEN и TELEGRAM_ADMIN_CHAT_ID',
      'Telegram-уведомления при создании, одобрении, отклонении заявки и закрытии Discord ticket'
    ],
    updated: [
      'уведомление о новой заявке содержит Discord-кандидата, игровой ник, level, инвайтера, источник, ID анкеты, текст о себе и ссылку на ticket',
      'startup diagnostics показывает только статус Telegram integration без вывода токена',
      'application tests покрывают все четыре Telegram-события и конфигурацию интеграции'
    ],
    fixed: [
      'ошибка Telegram API больше не блокирует создание Discord application ticket',
      'Telegram sender изолирован от Discord application lifecycle безопасной обработкой ошибок',
      'неполная Telegram-конфигурация определяется на старте и отключает уведомления с предупреждением'
    ]
  },
  '1.0.23': {
    added: [
      'бот регистрирует slash-команды сразу при добавлении на новый Discord-сервер',
      'тест client-ready runtime проверяет регистрацию команд через событие guildCreate',
      'тест guild-runtime фиксирует, что новые серверы не наследуют старые env-настройки'
    ],
    updated: [
      'env-дефолты CHANNEL_ID, ROLE_* и лог-каналов теперь применяются только к основному GUILD_ID',
      'новые серверы стартуют с пустыми каналами и ролями до отдельной настройки через /setup, /setchannel и /setrole',
      'runtime готовит новый guild сразу после подключения: регистрирует команды и прогревает состояние сервера'
    ],
    fixed: [
      'новый сервер больше не показывает каналы и роли старого сервера в /adminpanel',
      'команды больше не пропадают до рестарта, если бот был добавлен на сервер во время работы',
      'release notes текущей версии теперь описывают мульти-серверный фикс, а не предыдущую embed-чистку'
    ]
  },
  '1.0.22': {
    added: [
      'чистый TypeScript embed-source без @ts-nocheck и без каскада module.exports override-слоёв',
      'тест embeds public api stays complete фиксирует полный публичный API embed-builder функций'
    ],
    updated: [
      'src-ts/embeds-source.ts пересобран как единый typed source of truth для family panel, заявок, help, welcome, automod, role menu и changelog',
      'tests/ts-debt.test.js теперь требует нулевой остаточный TypeScript-долг в src-ts',
      'embed-кнопки и служебные карточки используют чистые русские строки для ЧС, Голос, статусов, рангов и update-card'
    ],
    fixed: [
      'последний разрешённый @ts-nocheck удалён из проекта',
      'риск возврата битых слов из старых release106/release107/live override-слоёв',
      'риск потери embed-функций при будущей чистке теперь ловится тестом'
    ]
  },
  '1.0.21': {
    added: [
      'утилита scripts/annotate-implicit-any.js — массовая расстановка : any по выводу tsc для снятия @ts-nocheck',
      'тест tests/mojibake.test.js ловит регрессии битой кириллицы в src-ts через детектор scripts/detect-mojibake.js'
    ],
    updated: [
      'снят @ts-nocheck с src-ts/copy-source.ts — файл стал нормальным TS-модулем с export default copy',
      'снят @ts-nocheck с src-ts/index.ts — entrypoint теперь под полной TS-проверкой',
      'src-ts/copy.ts использует import вместо require для copy-source',
      'tests/ts-debt.test.js обновлён: copy-source.ts и index.ts убраны из allowlist остаточного TS-долга',
      'корневые JS-модули стали тонкими адаптерами над dist-ts — тесты теперь проверяют скомпилированный TS-код',
      'mock storage в tests/ranks.test.js приведён к актуальному API getActivityScore вместо устаревшего activityScore',
      'typescript в devDependencies зафиксирован на ~6.0.2 — minor-обновления больше не подтянутся автоматически',
      '.env.example уточнён: DATABASE_FILE и STORAGE_FILE помечены как optional с подсказкой про persistent volume на Railway',
      '.gitignore исключает database.local.json, storage.local.json, *.bak, .gitignoregit и .claude/'
    ],
    fixed: [
      'битая кириллица в src-ts/ai.ts — ключевые слова анализа заявок и текст рекомендаций теперь корректные',
      'битая кириллица в src-ts/applications.ts — алиасы рангов 1ранг, ранг1 и т.п. снова работают',
      'битая кириллица в src-ts/embeds-source.ts — welcome embed и admin panel выводят читаемый русский',
      'битая кириллица в src-ts/command-runtime.ts и src-ts/event-runtime.ts — ярлыки automod и сообщения защиты каналов',
      'параметры функций-шаблонов в copy-source.ts получили явные аннотации : any вместо неявного',
      'индексирование labels по any-ключу приведено к as keyof typeof labels',
      'скрытый ReferenceError на updateAutomodConfig в index.ts:1616 — функция нигде не была определена, но вызывалась; заменена на database.updateGuildSettings(guildId, { automod: patch })',
      'auto-rank sync теперь сразу обновляет панель семьи: doPanelUpdate вызывается с force=true, иначе throttle на 15 сек блокировал отображение новых рангов'
    ]
  },
  '1.0.17': {
    added: [
      'добавлен отдельный runtime-automation helper-модуль для role menu, custom triggers, scheduled reports и automod'
    ],
    updated: [
      'src-ts/index.ts стал тоньше: menu, custom trigger, scheduled report и automod-логика вынесены из entrypoint',
      'clientReady, event runtime и interaction runtime теперь получают automation-flow через единый helper-слой'
    ],
    fixed: [
      'риск скрытой регрессии scheduled reports после выноса логики из entrypoint',
      'локальные дубли role menu, custom command и automod-обработки больше не живут внутри src-ts/index.ts'
    ]
  },
  '1.0.16': {
    added: [
      'добавлен отдельный runtime-notification helper-модуль для DM, логов, welcome, automod и verification'
    ],
    updated: [
      'src-ts/index.ts стал тоньше: уведомления, лог-каналы и welcome-flow вынесены из entrypoint',
      'build-update, automod log и verification/autorole теперь проходят через единый notification helper-слой'
    ],
    fixed: [
      'битая кириллица в новом notification helper-слое',
      'риск дублирования DM и логической рассинхронизации между локальными функциями и вынесенным runtime-модулем'
    ]
  },
  '1.0.15': {
    added: [
      'добавлен отдельный runtime-family helper-модуль для family dashboard, leaderboard, voice summary и activity report'
    ],
    updated: [
      'src-ts/index.ts стал заметно тоньше: family/profile/report helper-логика вынесена из entrypoint',
      'runtime family-статистика теперь собирается через единый helper-слой вместо набора локальных функций'
    ],
    fixed: [
      'риск дальнейшего разрастания монолитного index.ts перед снятием @ts-nocheck',
      'повторяющаяся family dashboard и activity report логика больше не размазана по entrypoint'
    ]
  },
  '1.0.14': {
    added: [
      'добавлен тест, который ловит кракозябры в описаниях slash-команд до релиза'
    ],
    updated: [
      'описания subcommand-ов для customcommand, rolemenu и verification переведены на чистый UTF-8'
    ],
    fixed: [
      'битые подписи у /customcommand',
      'битые подписи у /rolemenu',
      'битые подписи у /verification'
    ]
  },
  '1.0.13': {
    added: [
      'добавлен typed helper-модуль для access, moderation checks и text-channel runtime-утилит',
      'добавлен unit-тест на runtime-access helpers'
    ],
    updated: [
      'src-ts/index.ts стал компактнее: access и moderation helper-ы вынесены из entrypoint',
      'права, bypass-проверки и channel resolver теперь живут в отдельном TS-модуле'
    ],
    fixed: [
      'убрана дублирующая access-логика из середины src-ts/index.ts',
      'formatModerationTimestamp и text-channel resolver больше не спрятаны внутри монолитного entrypoint'
    ]
  },
  '1.0.12': {
    added: [
      'добавлен typed helper-модуль для AI-overview, update-log и automod rule/limit логики',
      'добавлен unit-тест на runtime-command helpers'
    ],
    updated: [
      'src-ts/index.ts стал тоньше: чистые runtime helper-функции вынесены из середины entrypoint',
      'карточка обновления теперь берёт release groups через единый helper без дублирующего splitUpdateChangeLines'
    ],
    fixed: [
      'убран мёртвый дублирующий код вокруг update-log parsing внутри src-ts/index.ts',
      'automod state/rule/limit helper-ы больше не спрятаны в монолите entrypoint'
    ]
  },
  '1.0.11': {
    added: [
      'добавлен отдельный тест-контур для остаточного TypeScript-долга в src-ts',
      'check теперь фиксирует точный список файлов, где временно разрешён @ts-nocheck'
    ],
    updated: [
      'инженерный checkpoint после полного TS-переезда теперь оформляется как отдельный semver-релиз',
      'процесс миграции стал безопаснее: новый @ts-nocheck больше не сможет тихо попасть в проект'
    ],
    fixed: [
      'риск незаметного расползания TS-долга после релиза 1.0.10',
      'риск случайного снятия одного из оставшихся @ts-nocheck без реальной типизации файла'
    ]
  },
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
