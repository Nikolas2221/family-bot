export interface PersonalRecord { id?: string; userId?: string; guildId?: string; status?: string; createdAt?: string; closedAt?: string | null; reviewedAt?: string; decisionDelivery?: { remaining?: string[] } }
export function pruneClosedRecords<T extends PersonalRecord>(records: T[], days: number, now = Date.now()): T[] {
  if (!Number.isFinite(days) || days < 1) return records;
  return records.filter(record => {
    const terminal = ['accepted', 'rejected', 'closed', 'cancelled'].includes(record.status || '');
    const time = Date.parse(record.closedAt || record.reviewedAt || '');
    return !terminal || !Number.isFinite(time) || now - time < days * 86400000 || Boolean(record.decisionDelivery?.remaining?.length);
  });
}
export function redactDiagnostic(value: unknown): string {
  const error = value && typeof value === 'object' ? value as { name?: string; code?: unknown; status?: unknown } : {};
  return [error.name || 'Error', typeof error.code === 'number' || /^[A-Z_0-9]+$/u.test(String(error.code || '')) ? error.code : '', Number.isFinite(Number(error.status)) ? error.status : ''].filter(Boolean).join(' ');
}

export function forgetClosedPersonalData(store: Record<string, unknown>, guildId: string, userId: string): number {
  let removed = 0;
  for (const key of ['applications', 'supportTickets', 'afkRequests']) {
    const records = store[key];
    if (!Array.isArray(records)) continue;
    store[key] = records.filter((item: PersonalRecord) => {
      const discard = item.guildId === guildId && item.userId === userId && ['accepted', 'rejected', 'closed', 'cancelled'].includes(item.status || '') && !item.decisionDelivery?.remaining?.length;
      if (discard) removed++;
      return !discard;
    });
  }
  const drafts = store.applicationDrafts as Record<string, unknown> | undefined;
  if (drafts?.[guildId + ':' + userId]) { delete drafts[guildId + ':' + userId]; removed++; }
  return removed;
}
