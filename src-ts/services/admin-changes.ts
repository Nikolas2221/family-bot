import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { writeSnapshot, createWriteProbe } from './file-persistence';

export class AdminChangeError extends Error {}

export interface AdminChange {
  id: string;
  guildId: string;
  actorId: string;
  kind: 'settings' | 'rank';
  targetId: string;
  before: unknown;
  after: unknown;
  status: 'running' | 'completed' | 'failed' | 'interrupted' | 'reverting' | 'reverted';
  createdAt: number;
  revertedBy?: string;
}

// Persist intent before side effects. Interrupted changes are visible but never retried automatically.
export class AdminChanges {
  private entries: AdminChange[] = [];
  private unavailable = false;
  private readonly locks = new Set<string>();
  private readonly probe: () => boolean;
  constructor(private readonly file: string) {
    this.probe = createWriteProbe(file);
    let found = false;
    for (const name of [file, file + '.bak']) {
      if (!fs.existsSync(name)) continue;
      found = true;
      try {
        const value: unknown = JSON.parse(fs.readFileSync(name, 'utf8'));
        if (!Array.isArray(value) || !value.every(validChange)) continue;
        this.entries = value;
        for (const entry of this.entries) {
          if (name !== file || entry.status === 'running' || entry.status === 'reverting') entry.status = 'interrupted';
        }
        this.save();
        return;
      } catch { /* Try the backup without executing recorded changes. */ }
    }
    if (found) { this.unavailable = true; console.error('Журнал изменений повреждён; изменения с журналированием и откат отключены до восстановления.'); }
  }
  private save(): void {
    if (this.unavailable) throw new AdminChangeError('Журнал изменений недоступен. Восстановите его перед изменением настроек.');
    // Retain at most 1000 records, including unresolved interrupted operations.
    if (this.entries.length > 1000) {
      const removable = this.entries.findIndex(entry => ['completed', 'failed', 'reverted'].includes(entry.status));
      if (removable < 0) throw new Error('Журнал заполнен незавершёнными действиями. Проверьте /settings history.');
      this.entries.splice(removable, 1);
    }
    writeSnapshot(this.file, JSON.stringify(this.entries));
  }
  list(guildId: string): AdminChange[] { return structuredClone(this.entries.filter(entry => entry.guildId === guildId).slice(-20).reverse()); }
  healthLines(): string[] {
    return ['Журнал изменений: ' + (!this.unavailable && this.probe() ? 'доступен' : 'ошибка записи') + '; прервано ' + this.entries.filter(entry => entry.status === 'interrupted').length];
  }
  async run<T>(input: Pick<AdminChange, 'guildId' | 'actorId' | 'kind' | 'targetId' | 'before'>,
    apply: () => T | Promise<T>, readAfter: () => unknown): Promise<T> {
    if (this.unavailable) throw new AdminChangeError('Журнал изменений недоступен. Действие не выполнено.');
    const lock = input.guildId + ':' + input.kind + ':' + input.targetId;
    if (this.locks.has(lock)) throw new Error('Изменение этой цели уже выполняется. Повторите после завершения.');
    this.locks.add(lock);
    const entry: AdminChange = { ...structuredClone(input), id: randomBytes(6).toString('hex'), after: null, status: 'running', createdAt: Date.now() };
    try {
      this.entries.push(entry);
      this.save();
      const result = await apply();
      entry.after = structuredClone(await readAfter());
      entry.status = 'completed';
      this.save();
      return result;
    } catch (error) {
      // A request may have reached Discord even when its response was lost.
      entry.status = 'interrupted';
      try { this.save(); } catch { /* Original failure remains visible to the caller. */ }
      throw error;
    } finally { this.locks.delete(lock); }
  }
  async undo(guildId: string, id: string, actorId: string, readCurrent: (change: AdminChange) => Promise<unknown>,
    restore: (change: AdminChange) => Promise<void>): Promise<void> {
    if (this.unavailable) throw new AdminChangeError('Журнал изменений недоступен. Откат не выполнен.');
    const entry = this.entries.find(change => change.id === id && change.guildId === guildId);
    if (!entry || entry.status !== 'completed') throw new Error('Изменение не найдено или недоступно для отката.');
    const lock = entry.guildId + ':' + entry.kind + ':' + entry.targetId;
    if (this.locks.has(lock)) throw new Error('Изменение этой цели уже выполняется.');
    this.locks.add(lock);
    try {
      if (!isDeepStrictEqual(await readCurrent(structuredClone(entry)), entry.after)) throw new Error('Состояние уже изменилось. Автоматический откат отменён, чтобы сохранить последующие изменения.');
      entry.status = 'reverting';
      entry.revertedBy = actorId;
      this.save();
      await restore(structuredClone(entry));
      entry.status = 'reverted';
      this.save();
    } catch (error) {
      if (entry.status === 'reverting') { entry.status = 'interrupted'; try { this.save(); } catch { /* Do not replay. */ } }
      throw error;
    } finally { this.locks.delete(lock); }
  }
}
function validChange(value: unknown): value is AdminChange {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return ['id', 'guildId', 'actorId', 'targetId'].every(key => typeof entry[key] === 'string')
    && ['settings', 'rank'].includes(String(entry.kind))
    && ['running', 'completed', 'failed', 'interrupted', 'reverting', 'reverted'].includes(String(entry.status))
    && typeof entry.createdAt === 'number' && Number.isFinite(entry.createdAt) && 'before' in entry && 'after' in entry;
}

export function describeAdminChange(entry: AdminChange): string {
  if (entry.kind === 'rank') return 'участник ' + entry.targetId + ': ' + JSON.stringify(entry.before) + ' → ' + JSON.stringify(entry.after);
  const fields: string[] = [];
  const walk = (before: unknown, after: unknown, prefix: string) => {
    if (isDeepStrictEqual(before, after)) return;
    if (before && after && typeof before === 'object' && typeof after === 'object' && !Array.isArray(before) && !Array.isArray(after)) {
      const left = before as Record<string, unknown>, right = after as Record<string, unknown>;
      for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) walk(left[key], right[key], prefix ? prefix + '.' + key : key);
    } else fields.push(prefix + ': ' + String(JSON.stringify(before)).slice(0, 50) + ' → ' + String(JSON.stringify(after)).slice(0, 50));
  };
  walk(entry.before, entry.after, '');
  return fields.slice(0, 4).join('; ') + (fields.length > 4 ? '; ещё ' + (fields.length - 4) : '');
}
