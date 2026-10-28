import { spawn } from 'node:child_process';
import type { Guild } from 'discord.js';
import { joinVoiceChannel, createAudioPlayer, createAudioResource, entersState, VoiceConnectionStatus, AudioPlayerStatus, StreamType, NoSubscriberBehavior } from '@discordjs/voice';
import type { MusicBackend } from './manager';
import { openMedia, type ResolvedTrack } from './sources';
type Connection = ReturnType<typeof joinVoiceChannel>;
type Player = ReturnType<typeof createAudioPlayer>;
interface Playback { channelId: string; connection: Connection; player: Player; cancel?: () => void }
export class DiscordMusicBackend implements MusicBackend {
  private sessions = new Map<string, Playback>();
  constructor(private guild: (id: string) => Guild | undefined) {}
  async play(guildId: string, channelId: string, track: ResolvedTrack, outerSignal: AbortSignal): Promise<void> {
    const guild = this.guild(guildId); if (!guild) throw Error('Сервер недоступен.');
    let session = this.sessions.get(guildId);
    if (!session) {
      const connection = joinVoiceChannel({ guildId, channelId, adapterCreator: guild.voiceAdapterCreator, selfDeaf: true });
      const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Stop } });
      session = { channelId, connection, player }; this.sessions.set(guildId, session);
      player.on('error', () => session?.cancel?.());
      connection.on('error', () => { if (this.sessions.get(guildId) === session) this.stop(guildId); });
      connection.on(VoiceConnectionStatus.Disconnected, () => { if (this.sessions.get(guildId) === session) this.stop(guildId); });
      connection.subscribe(player);
    }
    if (session.channelId !== channelId) throw Error('Плеер занят другим каналом.');
    const cancellation = new AbortController();
    session.cancel = () => cancellation.abort();
    const signal = AbortSignal.any([outerSignal, cancellation.signal]);
    await entersState(session.connection, VoiceConnectionStatus.Ready, AbortSignal.any([signal, AbortSignal.timeout(15000)]));
    const input = await openMedia(track.url, signal);
    if (signal.aborted) { input.destroy(); throw Error('Воспроизведение отменено.'); }
    const ffmpeg = spawn(process.env.FFMPEG_PATH || 'ffmpeg', ['-nostdin','-hide_banner','-loglevel','error','-protocol_whitelist','pipe','-i','pipe:0','-vn','-f','s16le','-ar','48000','-ac','2','pipe:1'], { windowsHide: true, stdio: ['pipe','pipe','pipe'] });
    const playback = session;
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return; settled = true; clearTimeout(startTimer);
        signal.removeEventListener('abort', abort); playback.player.removeListener(AudioPlayerStatus.Idle, idle); playback.player.removeListener(AudioPlayerStatus.Playing, playing);
        input.unpipe(); input.destroy(); ffmpeg.stdin.destroy(); ffmpeg.stdout.destroy(); ffmpeg.kill('SIGKILL');
        playback.cancel = undefined;
        playback.player.stop(true);
        if (error) reject(error); else resolve();
      };
      const playing = () => clearTimeout(startTimer);
      const idle = () => finish();
      const abort = () => finish(Error('Воспроизведение отменено.'));
      const startTimer = setTimeout(() => finish(Error('Нет аудио в течение 15 секунд.')), 15000);
      playback.cancel = () => finish(Error('Аудиопоток остановлен.'));
      signal.addEventListener('abort', abort, { once: true });
      ffmpeg.once('error', () => finish(Error('FFmpeg недоступен.')));
      ffmpeg.once('close', code => { if (code && !settled) finish(Error('Декодирование не выполнено.')); });
      input.once('error', () => finish(Error('Ошибка аудиопотока.')));
      ffmpeg.stdin.on('error', () => finish(Error('Аудиопроцесс закрыт.')));
      ffmpeg.stdout.on('error', () => finish(Error('Ошибка декодирования.')));
      ffmpeg.stderr.resume();
      playback.player.once(AudioPlayerStatus.Idle, idle);
      playback.player.once(AudioPlayerStatus.Playing, playing);
      input.pipe(ffmpeg.stdin);
      try { playback.player.play(createAudioResource(ffmpeg.stdout, { inputType: StreamType.Raw })); } catch { finish(Error('Аудиокодек недоступен.')); }
      if (signal.aborted) abort();
    });
  }
  stop(guildId: string): void {
    const session = this.sessions.get(guildId); if (!session) return;
    this.sessions.delete(guildId); session.cancel?.(); session.player.stop(true);
    if (session.connection.state.status !== VoiceConnectionStatus.Destroyed) session.connection.destroy();
  }
  pause(guildId: string): boolean { return this.sessions.get(guildId)?.player.pause() || false; }
  resume(guildId: string): boolean { return this.sessions.get(guildId)?.player.unpause() || false; }
}
