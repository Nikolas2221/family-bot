export type MusicFailureCode = 'voice' | 'source' | 'source_forbidden' | 'source_http' | 'ffmpeg' | 'codec' | 'audio_timeout' | 'audio_stream' | 'search' | 'search_timeout' | 'search_busy' | 'track_limit' | 'yt_auth' | 'yt_rate_limit' | 'yt_format' | 'yt_runtime' | 'yt_unavailable' | 'yt_network' | 'audius_api' | 'audius_timeout' | 'audius_rate_limit' | 'audius_not_found';
const reasons: Record<MusicFailureCode, string> = {
  voice: 'Не удалось подготовить голосовое соединение. Проверьте Connect/Speak и доступ хостинга к голосовому UDP Discord.',
  source: 'Не удалось загрузить аудиопоток источника.',
  source_forbidden: 'Источник отклонил загрузку аудио (HTTP 403). Поиск сработал, но сам поток недоступен с этого хостинга.',
  source_http: 'Источник вернул ошибку при загрузке аудио.',
  ffmpeg: 'FFmpeg не смог декодировать поток. Проверьте /music status и логи music.',
  codec: 'Не удалось создать аудиокодек Opus.',
  audio_timeout: 'Источник не дал воспроизводимое аудио за 15 секунд.',
  audio_stream: 'Аудиопоток прервался во время воспроизведения.',
  search: 'Поиск yt-dlp не смог получить трек. Уточните исполнителя или попробуйте прямую аудиоссылку.',
  search_timeout: 'Поиск yt-dlp не завершился за 20 секунд. Попробуйте позже или укажите прямую аудиоссылку.',
  search_busy: 'Поиск музыки занят. Попробуйте позже.',
  track_limit: 'Источник не предоставил аудиотрек до 15 минут без прямого эфира.',
  yt_auth: 'YouTube требует вход или проверку «не бот» с этого хостинга. Уточнение названия не поможет; используйте прямую аудиоссылку.',
  yt_rate_limit: 'YouTube ограничил запросы с этого хостинга (HTTP 429). Попробуйте позже.',
  yt_format: 'yt-dlp не нашёл доступный аудиоформат. Проверьте обновление yt-dlp и компонент EJS на хостинге.',
  yt_runtime: 'yt-dlp не смог выполнить JavaScript-проверку YouTube. Проверьте Node.js и компонент EJS на хостинге.',
  yt_unavailable: 'Видео недоступно, закрыто или ограничено по региону/возрасту. Выберите другой трек.',
  yt_network: 'yt-dlp не смог связаться с источником: ошибка сети или таймаут. Попробуйте позже.',
  audius_api: 'Поиск Audius временно недоступен. Попробуйте позже или отправьте аудиофайл.',
  audius_timeout: 'Audius не ответил за 20 секунд. Попробуйте позже.',
  audius_rate_limit: 'Audius ограничил запросы (HTTP 429). Попробуйте позже.',
  audius_not_found: 'В Audius не найден доступный полный трек до 15 минут. Уточните исполнителя и название или отправьте аудиофайл.'
};
export class MusicPlaybackError extends Error {
  constructor(public readonly stage: MusicFailureCode, public readonly diagnostic = '') { super(reasons[stage]); this.name = 'MusicPlaybackError'; }
}
// Never expose raw extractor output: it can contain signed URLs and account data.
export function ytDlpFailure(stderr: string, diagnostic: string, fallback: MusicFailureCode = 'search'): MusicPlaybackError {
  let stage = fallback;
  if (/sign in to confirm|not a bot|login required|use --cookies|authentication required/iu.test(stderr)) stage = 'yt_auth';
  else if (/\b429\b|too many requests/iu.test(stderr)) stage = 'yt_rate_limit';
  else if (/no supported javascript runtime|javascript challenge|challenge solving failed|n challenge|signature solving|yt-dlp-ejs/iu.test(stderr)) stage = 'yt_runtime';
  else if (/requested format.*not available|no video formats|only images are available/iu.test(stderr)) stage = 'yt_format';
  else if (/video unavailable|private video|removed by|not available in your country|age.restricted|confirm your age/iu.test(stderr)) stage = 'yt_unavailable';
  else if (/(?:HTTP Error|HTTP error|status)[^\r\n]{0,30}403/iu.test(stderr)) stage = 'source_forbidden';
  else if (/timed? out|timeout|unable to download|name resolution|network is unreachable|connection (?:refused|reset)/iu.test(stderr)) stage = 'yt_network';
  return new MusicPlaybackError(stage, diagnostic);
}
export function musicFailure(error: unknown): { stage: string; message: string; diagnostic: string } {
  if (error instanceof MusicPlaybackError) return { stage: error.stage, message: error.message, diagnostic: error.diagnostic };
  return { stage: 'unknown', message: 'Не удалось запустить трек. Проверьте /music status.', diagnostic: '' };
}
