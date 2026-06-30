export interface ActiveLockdownState {
  actorId: string;
  slowmodeSeconds: number;
  updatedAt: number;
}

const activeLockdowns = new Map<string, ActiveLockdownState>();

export function setActiveLockdown(guildId: string, state: ActiveLockdownState | null): void {
  const id = String(guildId || '').trim();
  if (!id) return;
  if (!state) {
    activeLockdowns.delete(id);
    return;
  }
  activeLockdowns.set(id, state);
}

export function getActiveLockdown(guildId: string): ActiveLockdownState | null {
  return activeLockdowns.get(String(guildId || '').trim()) || null;
}
