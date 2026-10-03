export interface ActivityHistory {
  observedSince?: number;
  lastSeenAt?: number;
  lastMessageAt?: number;
  lastVoiceAt?: number;
}

export function lastActivityAt(data: ActivityHistory): number {
  return Math.max(Number(data.lastSeenAt) || 0, Number(data.lastMessageAt) || 0, Number(data.lastVoiceAt) || 0);
}

export function assessInactivity(data: ActivityHistory, joinedTimestamp: number | null | undefined,
  thresholdMs: number, now = Date.now()): 'active' | 'inactive' | 'insufficient' {
  if (!Number.isFinite(thresholdMs) || thresholdMs <= 0) return 'insufficient';
  const activity = lastActivityAt(data);
  const observed = Number(data.observedSince) || activity;
  if (!observed || now - Math.max(observed, Number(joinedTimestamp) || 0) < thresholdMs) return 'insufficient';
  return now - Math.max(activity || observed, Number(joinedTimestamp) || 0) >= thresholdMs ? 'inactive' : 'active';
}

export function isMemberInactive(data: ActivityHistory, joinedTimestamp: number | null | undefined,
  thresholdMs: number, now = Date.now()): boolean {
  return assessInactivity(data, joinedTimestamp, thresholdMs, now) === 'inactive';
}
