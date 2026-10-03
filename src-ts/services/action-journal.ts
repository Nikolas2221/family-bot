import fs from 'node:fs';
import path from 'node:path';
import type { PendingBrainAction } from '../event-runtime';

export interface ActionJob {
  id: string;
  guildId: string;
  action: string;
  status: 'running' | 'completed' | 'failed' | 'interrupted';
  recipients: Record<string, 'sending' | 'delivered' | 'failed'>;
  updatedAt: number;
}

// A 'sending' record after a crash is deliberately not retried: delivery is unknown.
export class ActionJournal {
  private jobs: Record<string, ActionJob> = {};
  private pending: Record<string, PendingBrainAction> = {};
  constructor(private readonly file: string) {
    if (fs.existsSync(file)) {
      const state = JSON.parse(fs.readFileSync(file, 'utf8')) as { jobs: Record<string, ActionJob>; pending: Record<string, PendingBrainAction> };
      this.jobs = state.jobs;
      this.pending = state.pending;
      for (const job of Object.values(this.jobs)) if (job.status === 'running') job.status = 'interrupted';
      this.save();
    }
  }
  private save(): void {
    const cutoff = Date.now() - 30 * 86400000;
    for (const [id, job] of Object.entries(this.jobs)) {
      if (job.status !== 'running' && job.updatedAt < cutoff) delete this.jobs[id];
    }
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(`${this.file}.tmp`, JSON.stringify({ jobs: this.jobs, pending: this.pending }), { mode: 0o600, flush: true });
    fs.renameSync(`${this.file}.tmp`, this.file);
  }
  start(id: string, guildId: string, action: string): void {
    if (this.jobs[id]) throw new Error('Action ID already exists');
    this.jobs[id] = { id, guildId, action, status: 'running', recipients: {}, updatedAt: Date.now() };
    this.save();
  }
  recipient(id: string, userId: string, status: ActionJob['recipients'][string]): void {
    const job = this.jobs[id];
    job.recipients[userId] = status;
    job.updatedAt = Date.now();
    this.save();
  }
  finish(id: string, status: 'completed' | 'failed'): void {
    this.jobs[id].status = status;
    this.jobs[id].updatedAt = Date.now();
    this.save();
  }
  recentlySent(guildId: string, action: string, userId: string): boolean {
    return Object.values(this.jobs).some(job => job.guildId === guildId && job.action === action
      && Date.now() - job.updatedAt < 86400000
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
    for (const [key, value] of Object.entries(this.pending)) {
      if (value.expiresAt > Date.now()) result.set(key, value);
      else delete this.pending[key];
    }
    this.save();
    return result;
  }
}
