import { MusicPlaybackError } from './errors';
import type { ResolvedTrack } from './sources';

const api = 'https://api.audius.co/v1';
const appName = 'family-bot';
const maximumResponse = 1024 * 1024;

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

export async function searchAudius(query: string, outerSignal: AbortSignal): Promise<ResolvedTrack> {
  const signal = AbortSignal.any([outerSignal, AbortSignal.timeout(20000)]);
  const url = new URL(api + '/tracks/search');
  url.search = new URLSearchParams({ query, limit: '10', app_name: appName }).toString();
  try {
    signal.throwIfAborted();
    const response = await fetch(url, { signal, redirect: 'error', headers: { accept: 'application/json' } });
    if (!response.ok) {
      await response.body?.cancel();
      throw new MusicPlaybackError(response.status === 429 ? 'audius_rate_limit' : 'audius_api', 'search_HTTP_' + response.status);
    }
    if (Number(response.headers.get('content-length')) > maximumResponse) {
      await response.body?.cancel();
      throw new MusicPlaybackError('audius_api', 'search_size_limit');
    }
    if (!response.body) throw new MusicPlaybackError('audius_api', 'search_empty_body');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        received += part.value.length;
        if (received > maximumResponse) throw new MusicPlaybackError('audius_api', 'search_size_limit');
        chunks.push(part.value);
      }
    } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
    const result = record(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    if (!result || !Array.isArray(result.data)) throw new MusicPlaybackError('audius_api', 'search_invalid_result');
    // Respect API relevance order; never select previews, gated or unavailable tracks.
    for (const value of result.data) {
      const item = record(value);
      if (!item || item.is_streamable !== true || item.is_stream_gated === true || item.is_available === false || item.is_delete === true) continue;
      if (record(item.access)?.stream === false || item.stream_conditions != null) continue;
      if (typeof item.duration !== 'number' || !Number.isFinite(item.duration) || item.duration <= 0 || item.duration > 900) continue;
      if (typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/u.test(item.id) || typeof item.title !== 'string' || !item.title.trim()) continue;
      const uploader = record(item.user)?.name;
      const title = (item.title.trim() + (typeof uploader === 'string' && uploader.trim() ? ' — ' + uploader.trim() : '')).slice(0, 160);
      return { title, url: api + '/tracks/' + encodeURIComponent(item.id) + '/stream?' + new URLSearchParams({ app_name: appName }), source: 'audius' };
    }
    throw new MusicPlaybackError('audius_not_found', 'search_no_playable_result');
  } catch (error) {
    if (outerSignal.aborted) throw error;
    if (signal.aborted) throw new MusicPlaybackError('audius_timeout', 'search_timeout');
    if (error instanceof MusicPlaybackError) throw error;
    throw new MusicPlaybackError('audius_api', 'search_request_failed');
  }
}
