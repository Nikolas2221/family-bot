interface WorkItem { id: string; kind: string; channelId?: string; ownerId?: string; createdAt: string }
interface RecordLike { id?: string; status: string; channelId?: string; ticketChannelId?: string; claimedBy?: string | null; reviewerId?: string; guildId?: string; createdAt: string }
export function pendingWork(applications: RecordLike[], tickets: RecordLike[], guildId: string, now = Date.now()): WorkItem[] {
  return [...applications.filter(item => item.status === 'pending').map(item => ({ ...item, kind: 'заявка' })),
    ...tickets.filter(item => ['open', 'claimed'].includes(item.status)).map(item => ({ ...item, kind: 'тикет' }))]
    .filter(item => (item.id || item.channelId) && item.guildId === guildId && Number.isFinite(Date.parse(item.createdAt)) && now - Date.parse(item.createdAt) >= 86400000)
    .sort((a,b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .map(item => ({ id: item.id || item.channelId!, kind: item.kind, channelId: item.channelId || item.ticketChannelId, ownerId: item.claimedBy || item.reviewerId, createdAt: item.createdAt }));
}
export function workQueueText(items: WorkItem[], now = Date.now()): string {
  return items.length ? 'Обращения без решения более суток: ' + items.length + '\n' + items.slice(0, 10).map(item =>
    item.kind + ' ' + item.id + (item.channelId ? ' <#' + item.channelId + '>' : '') + '; ожидание ' + Math.floor((now - Date.parse(item.createdAt)) / 3600000) + ' ч; ответственный: ' + (item.ownerId ? '<@' + item.ownerId + '>' : 'не назначен') + '; следующий шаг: ' + (item.kind === 'тикет' ? 'взять в работу и ответить' : 'проверить анкету и принять решение')).join('\n') : 'Зависших заявок и тикетов нет.';
}
export async function remindWork(items: WorkItem[], read: (key: string) => number, reserve: (keys: string[]) => void, send: (text: string) => Promise<unknown>): Promise<number> {
  const fresh = items.filter(item => !read('workqueue:' + item.kind + ':' + item.id)).slice(0, 10);
  if (!fresh.length) return 0;
  reserve(fresh.map(item => 'workqueue:' + item.kind + ':' + item.id));
  await send(workQueueText(fresh)); // An uncertain delivery is not retried automatically.
  return fresh.length;
}
