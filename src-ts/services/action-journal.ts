import fs from 'node:fs';
import path from 'node:path';
import type { PendingBrainAction } from '../event-runtime';

export interface ActionJob {
  id: string;
  guildId: string;
  action: string;
  status: 'running' | 'completed' | 'failed' | 'interrupted';
  recipients: Record<string, 'sending' | 'delivered' | 'failed'>;
  recipientTimes?: Record<string, number>;
  updatedAt: number;
}

// A 'sending' record after a crash is deliberately not retried: delivery is unknown.
export class ActionJournal {
  private jobs: Record<string, ActionJob> = {};
  private pending: Record<string, PendingBrainAction> = {};
  private unavailable = false;
  private recoveryBlockUntil = 0;
  constructor(private readonly file: string) {
    const exists = fs.existsSync(file) || fs.existsSync(`${file}.bak`);
    if (!exists) return;
    const read = (name: string): JournalState | null => {
      try {
        const value: unknown = JSON.parse(fs.readFileSync(name, 'utf8'));
        return isJournalState(value) ? value : null;
      } catch { return null; }
    };
    const primary = read(file);
    const state = primary || read(`${file}.bak`);
    if (!state) {
      this.unavailable = true;
      console.error('Action journal is damaged; bulk actions disabled until the journal is restored.');
      return;
    }
    this.jobs = state.jobs;
    this.pending = primary ? state.pending : {};
    // A restored backup may omit the most recent delivery or consumed confirmation.
    this.recoveryBlockUntil = Math.max(state.recoveryBlockUntil || 0, primary ? 0 : Date.now() + 86400000);
    if (!primary) console.warn('Action journal restored from backup; confirmations discarded and bulk delivery paused for 24 hours.');
    for (const job of Object.values(this.jobs)) {
      if (job.status === 'running') job.status = 'interrupted';
      job.recipientTimes ||= Object.fromEntries(Object.keys(job.recipients).map(id => [id, job.updatedAt]));
    }
    try { this.save(); } catch (error) {
      this.unavailable = true;
      console.error('Action journal cannot be saved; bulk actions disabled:', error);
    }
  }
  isAvailable(): boolean { return !this.unavailable; }
  private save(): void {
    if (this.unavailable) throw new Error('Action journal unavailable; restore it before executing bulk actions');
    const cutoff = Date.now() - 30 * 86400000;
    for (const [id, job] of Object.entries(this.jobs)) {
      if (job.status !== 'running' && job.updatedAt < cutoff) delete this.jobs[id];
    }
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const payload = JSON.stringify({ jobs: this.jobs, pending: this.pending, recoveryBlockUntil: this.recoveryBlockUntil });
    fs.writeFileSync(`${this.file}.tmp`, payload, { mode: 0o600, flush: true });
    fs.renameSync(`${this.file}.tmp`, this.file);
    fs.writeFileSync(`${this.file}.bak.tmp`, payload, { mode: 0o600, flush: true });
    fs.renameSync(`${this.file}.bak.tmp`, `${this.file}.bak`);
  }
  start(id: string, guildId: string, action: string): void {
    if (this.jobs[id]) throw new Error('Action ID already exists');
    this.jobs[id] = { id, guildId, action, status: 'running', recipients: {}, recipientTimes: {}, updatedAt: Date.now() };
    this.save();
  }
  recipient(id: string, userId: string, status: ActionJob['recipients'][string]): void {
    const job = this.jobs[id];
    job.recipients[userId] = status;
    job.recipientTimes ||= {};
    job.recipientTimes[userId] = Date.now();
    job.updatedAt = Date.now();
    this.save();
  }
  finish(id: string, status: 'completed' | 'failed'): void {
    this.jobs[id].status = status;
    this.jobs[id].updatedAt = Date.now();
    this.save();
  }
  recentlySent(guildId: string, action: string, userId: string): boolean {
    if (this.unavailable || Date.now() < this.recoveryBlockUntil) return true;
    return Object.values(this.jobs).some(job => job.guildId === guildId && job.action === action
      && Date.now() - (job.recipientTimes?.[userId] ?? job.updatedAt) < 86400000
      && ['sending', 'delivered'].includes(job.recipients[userId] || ''));
  }
  list(): ActionJob[] { return Object.values(this.jobs); }
  confirmations(): Map<string, PendingBrainAction> {
    const journal = this;
    const result = new class extends Map<string, PendingBrainAction> {
      override set(key: string, value: PendingBrainAction): this {
        journal.pending[key] = value;
        journal.save();
        return super.set(key, value);
      }
      override delete(key: string): boolean {
        delete journal.pending[key];
        journal.save();
        return super.delete(key);
      }
    }();
    if (this.unavailable) return result;
    for (const [key, value] of Object.entries(this.pending)) {
      if (value.expiresAt > Date.now()) result.set(key, value);
      else delete this.pending[key];
    }
    this.save();
    return result;
  }
}

interface JournalState {
  jobs: Record<string, ActionJob>;
  pending: Record<string, PendingBrainAction>;
  recoveryBlockUntil?: number;
}
function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
function isJournalState(value: unknown): value is JournalState {
  if (!record(value) || !record(value.jobs) || !record(value.pending)) return false;
  if (value.recoveryBlockUntil !== undefined && (typeof value.recoveryBlockUntil !== 'number' || !Number.isFinite(value.recoveryBlockUntil))) return false;
  for (const [id, job] of Object.entries(value.jobs)) {
    if (!record(job) || job.id !== id || typeof job.guildId !== 'string' || typeof job.action !== 'string'
      || !['running', 'completed', 'failed', 'interrupted'].includes(String(job.status))
      || typeof job.updatedAt !== 'number' || !Number.isFinite(job.updatedAt) || !record(job.recipients)
      || !Object.values(job.recipients).every(status => ['sending', 'delivered', 'failed'].includes(String(status)))) return false;
    if (job.recipientTimes !== undefined && (!record(job.recipientTimes)
      || !Object.values(job.recipientTimes).every(time => typeof time === 'number' && Number.isFinite(time)))) return false;
  }
  for (const [code, pending] of Object.entries(value.pending)) {
    if (!record(pending) || pending.code !== code || typeof pending.guildId !== 'string' || typeof pending.actorId !== 'string'
      || typeof pending.targetId !== 'string' || typeof pending.reason !== 'string' || typeof pending.summary !== 'string'
      || !['ban', 'kick', 'inactive_dm', 'inactive_ping'].includes(String(pending.action))
      || !['read', 'low', 'medium', 'high'].includes(String(pending.risk))
      || typeof pending.expiresAt !== 'number' || !Number.isFinite(pending.expiresAt)) return false;
    for (const field of ['channelId', 'prompt', 'text']) if (pending[field] !== undefined && typeof pending[field] !== 'string') return false;
    if (pending.recipientIds !== undefined && (!Array.isArray(pending.recipientIds) || !pending.recipientIds.every(id => typeof id === 'string'))) return false;
  }
  return true;
}
