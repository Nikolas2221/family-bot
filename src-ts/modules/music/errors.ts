export type MusicFailureCode = 'voice' | 'source' | 'source_forbidden' | 'source_http' | 'ffmpeg' | 'codec' | 'audio_timeout' | 'audio_stream';
const reasons: Record<MusicFailureCode, string> = {
  voice: 'Не удалось подготовить голосовое соединение. Проверьте Connect/Speak и доступ хостинга к голосовому UDP Discord.',
  source: 'Не удалось загрузить аудиопоток источника.',
  source_forbidden: 'Источник отклонил загрузку аудио (HTTP 403). Поиск сработал, но сам поток недоступен с этого хостинга.',
  source_http: 'Источник вернул ошибку при загрузке аудио.',
  ffmpeg: 'FFmpeg не смог декодировать поток. Проверьте /music status и логи music.',
  codec: 'Не удалось создать аудиокодек Opus.',
  audio_timeout: 'Источник не дал воспроизводимое аудио за 15 секунд.',
  audio_stream: 'Аудиопоток прервался во время воспроизведения.'
};
export class MusicPlaybackError extends Error {
  constructor(public readonly stage: MusicFailureCode, public readonly diagnostic = '') { super(reasons[stage]); this.name = 'MusicPlaybackError'; }
}
export function musicFailure(error: unknown): { stage: string; message: string; diagnostic: string } {
  if (error instanceof MusicPlaybackError) return { stage: error.stage, message: error.message, diagnostic: error.diagnostic };
  return { stage: 'unknown', message: 'Не удалось запустить трек. Проверьте /music status.', diagnostic: '' };
}
