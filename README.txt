Family Bot for Discord

Что делает бот:
- показывает панель семьи по ролям
- считает активность участников
- принимает заявки в семью
- даёт выговоры и похвалы
- поддерживает ручные ранги, авто-ранги и защитные функции
- умеет отвечать через DeepSeek API, а без ключа автоматически использует локальный режим
- разбирает вопросы по законодательству Majestic RP через `/law question:<ситуация>` и прикладывает ссылки на найденные нормы
- создаёт приватные обращения поддержки через `/ticket` с логами, transcript и системой прав
- хранит setup и подписки серверов в JSON-базе без SQL

Быстрый старт:
1. Установи зависимости:
   `npm install`
2. Скопируй шаблон окружения:
   `.env.example` -> `.env`
3. Заполни минимум эти переменные:
   `TOKEN`, `GUILD_ID`, `CHANNEL_ID`
4. Укажи роли семьи:
   `ROLE_LEADER`, `ROLE_DEPUTY`, `ROLE_ELDER`, `ROLE_MEMBER`, `ROLE_NEWBIE`
5. Чтобы включить AI-помощника, укажи:
   `AI_ENABLED=true`
   `DEEPSEEK_API_KEY=...` (необязательно; задаётся только в Railway Variables или локальном `.env`)
6. Если хочешь owner-доступ к тарифам, укажи:
   `BOT_OWNER_IDS=твой_discord_id`
7. Для Railway лучше укажи пути к постоянным файлам:
   `DATABASE_FILE=/data/database.json`
   `STORAGE_FILE=/data/storage.json`

Support tickets:
- `TICKET_CATEGORY_ID` — категория приватных тикетов
- `TICKET_SUPPORT_ROLE_ID` — роль поддержки
- `TICKET_LOG_CHANNEL_ID` — канал логов (необязательно)
- `TICKET_PANEL_CHANNEL_ID` — канал панели (необязательно; иначе текущий канал)
- `TICKET_PING_SUPPORT=true`
- `TICKET_COOLDOWN_SECONDS=60`
- `TICKET_MAX_OPEN_PER_USER=1`
- `TICKET_DELETE_DELAY_SECONDS=5`

Команды: `/ticket setup`, `/ticket info`, `/ticket close`, `/ticket claim`, `/ticket add`, `/ticket remove`, `/ticket list`.
8. Если нужен AI-анализ заявок, задай:
   `ACCESS_APPLICATIONS`
9. Для Telegram-моста укажи:
   `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID`
   Опционально: `TELEGRAM_ANNOUNCEMENTS_CHAT_ID`, `DISCORD_ANNOUNCEMENTS_CHANNEL_ID`, `DISCORD_ANNOUNCER_ROLE_IDS`
10. Запусти проверки:
   `npm run check`
11. Запусти бота:
   `npm start`

Что проверяется на старте:
- обязательные переменные `TOKEN`, `GUILD_ID`, `CHANNEL_ID`
- корректность Discord ID в каналах и ролях
- настройки авто-рангов и прав доступа
- мягкие предупреждения для необязательных настроек и fallback-поведения

Полезные команды:
- `npm test` - smoke-тесты заявок, embed'ов и рангов
- `npm run check` - синтаксис + smoke-тесты
- `npm start` - запуск бота
- `/setup` - сохранить настройки сервера в JSON-базе
- `/adminpanel` - встроенная админка сервера в Discord
- `/subscription` - owner-команда для смены `free/premium`
- `/help` - показать доступные команды по тарифу сервера
- `/debugconfig` - безопасная сводка конфигурации для админов без секретов
- `/announce text:...` - отправить семейное объявление из Discord в Telegram
- `/event text:...` - отправить семейное событие из Discord в Telegram
- `/close reason:...` - закрыть текущий ticket

Telegram-команды:
- `/reply <ticketId> <text>` - ответить из Telegram в Discord ticket
- `/announce <text>` - отправить объявление из Telegram в Discord
- `/event <text>` - отправить событие из Telegram в Discord

Как это работает:
- Бот использует `storage.json` для текущей игровой активности и `database.json` для мульти-серверных setup/подписок.
- На `free` доступны базовые команды семьи и одна серверная конфигурация.
- На `premium` включаются premium-функции: локальный AI, авто-ранги и логи.
- `/setup` сохраняет сервер в JSON-базу, `/adminpanel` показывает текущий тариф и настройки, `/help` показывает команды по текущему плану.
- Для Railway нужен persistent volume или путь вроде `/data/database.json`, иначе JSON-файлы будут теряться после redeploy/restart.

Основные файлы:
- `index.js` - запуск и wiring
- `copy.js` - все пользовательские тексты
- `database.js` - JSON-база setup и подписок
- `applications.js` - сценарии заявок
- `embeds.js` - embeds, кнопки, модалки и диагностические карточки
- `storage.js` - локальное хранилище
- `ai.js` - локальный оффлайн AI
- `commands.js` - регистрация slash-команд
