export function explainDiscordError(error: unknown): string {
  const data = error && typeof error === 'object' ? error as { code?: unknown; status?: unknown; message?: unknown } : {};
  const code = Number(data.code);
  if (code === 50013) return 'Недостаточно прав или цель выше роли бота. Проверьте разрешения и иерархию ролей.';
  if (code === 50001 || Number(data.status) === 403) return 'У бота нет доступа. Проверьте права в выбранном канале и его категории.';
  if (code === 10003) return 'Канал удалён или недоступен. Выберите существующий канал в /settings channel.';
  if (code === 10007) return 'Участник больше не находится на сервере.';
  if (code === 10011) return 'Роль удалена. Выберите существующую роль в /settings role.';
  if (code === 50007) return 'Личные сообщения закрыты. Попросите участника разрешить сообщения с этого сервера.';
  if (Number(data.status) === 429) return 'Discord ограничил запросы. Дождитесь окончания паузы; состояние доступно в /health.';
  if (Number(data.status) === 401) return 'Discord отклонил токен бота. Администратору нужно проверить TOKEN.';
  const message = String(data.message || '');
  if (/queue|safety pause|suspended/iu.test(message)) return 'Запрос отложен защитой Discord. Проверьте очередь и ограничения в /health.';
  if (/timeout|abort|ECONN|network|fetch failed/iu.test(message)) return 'Соединение прервано. Результат действия может быть неизвестен; проверьте его перед повтором.';
  return 'Действие не завершено. Проверьте права бота и /health; подробности доступны в журнале сервера.';
}
