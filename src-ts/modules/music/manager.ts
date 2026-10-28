import { musicFailure } from './errors';
import type { Track, ResolvedTrack } from './sources';
export interface MusicBackend {
  play(guildId: string, channelId: string, track: ResolvedTrack, signal: AbortSignal): Promise<void>;
  stop(guildId: string): void;
  pause(guildId: string): boolean;
  resume(guildId: string): boolean;
}
interface Session { channelId: string; queue: Track[]; current?: Track; abort?: AbortController; running: boolean; notify: (text: string) => Promise<unknown> }
export class MusicManager {
  private sessions = new Map<string, Session>();
  private searches = 0;
  private failures = new Map<string, { time: number; message: string }>();
  lastError(guildId: string): string { const failure = this.failures.get(guildId); return failure && Date.now() - failure.time < 3600000 ? failure.message : ''; }
  constructor(private backend: MusicBackend, private resolve: (track: Track, signal: AbortSignal) => Promise<ResolvedTrack>, private maxTrackMs = 900000, private maxSessions = 3) {}
  snapshot(guildId: string): { channelId: string; current?: Track; queue: Track[] } | undefined {
    const session = this.sessions.get(guildId);
    return session ? { channelId: session.channelId, current: session.current && { ...session.current }, queue: session.queue.map(track => ({ ...track })) } : undefined;
  }
  enqueue(guildId: string, channelId: string, track: Track, notify: Session['notify']): number {
    let session = this.sessions.get(guildId);
    if (session && session.channelId !== channelId) throw Error('Музыка уже играет в другом канале этого сервера.');
    if (!session && this.sessions.size >= this.maxSessions) throw Error('Музыкальный модуль занят на других серверах. Попробуйте позже.');
    if (!session) { session = { channelId, queue: [], running: false, notify }; this.sessions.set(guildId, session); }
    if (session.queue.length >= 25) throw Error('Очередь заполнена: максимум 25 ожидающих треков.');
    if ([...session.queue, ...(session.current ? [session.current] : [])].filter(item => item.userId === track.userId).length >= 5) throw Error('От одного участника допускается не более 5 треков.');
    session.queue.push({ ...track });
    const position = session.queue.length;
    if (!session.running) void this.pump(guildId, session);
    return position;
  }
  private async pump(guildId: string, session: Session): Promise<void> {
    session.running = true;
    try {
      while (this.sessions.get(guildId) === session && session.queue.length) {
        session.current = session.queue.shift()!;
        const controller = new AbortController(); session.abort = controller;
        const timer = setTimeout(() => controller.abort(), this.maxTrackMs);
        try {
          if (this.searches >= 3) throw Error('Поиск музыки занят. Попробуйте позже.');
          this.searches++;
          let resolved: ResolvedTrack;
          try { resolved = await this.resolve(session.current, controller.signal); } finally { this.searches--; }
          if (controller.signal.aborted || this.sessions.get(guildId) !== session) continue;
          session.current.title = resolved.title;
          // A failed text notification must not stop the audio queue.
          void Promise.resolve().then(() => session.notify('🎵 Найдено: ' + resolved.title)).catch(() => undefined);
          await this.backend.play(guildId, session.channelId, resolved, controller.signal);
          this.failures.delete(guildId);
        } catch (error) {
          const failure = musicFailure(error);
          if (!controller.signal.aborted && this.sessions.get(guildId) === session) {
            this.failures.set(guildId, { time: Date.now(), message: failure.message });
            while (this.failures.size > 500) this.failures.delete(this.failures.keys().next().value!);
            console.warn('[music] guild=' + guildId + ' stage=' + failure.stage + ' diagnostic=' + failure.diagnostic);
          }
          if (!controller.signal.aborted && this.sessions.get(guildId) === session) void Promise.resolve().then(() => session.notify(failure.message + ' Трек пропущен.')).catch(() => undefined);
        } finally { clearTimeout(timer); controller.abort(); session.current = undefined; session.abort = undefined; }
      }
    } finally {
      // An old cancelled worker must never destroy a newly created session.
      if (this.sessions.get(guildId) === session) { this.sessions.delete(guildId); this.backend.stop(guildId); }
    }
  }
  skip(guildId: string): void { this.sessions.get(guildId)?.abort?.abort(); }
  pause(guildId: string): boolean { return this.backend.pause(guildId); }
  resume(guildId: string): boolean { return this.backend.resume(guildId); }
  stop(guildId: string): void {
    const session = this.sessions.get(guildId); if (!session) return;
    this.sessions.delete(guildId); session.queue = []; session.abort?.abort(); this.backend.stop(guildId);
  }
  stopChannel(guildId: string, channelId: string): void { if (this.sessions.get(guildId)?.channelId === channelId) this.stop(guildId); }
  stopAll(): void { for (const id of this.sessions.keys()) this.stop(id); }
}
