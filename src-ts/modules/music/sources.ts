import { PassThrough, type Readable } from 'node:stream';
import { MusicPlaybackError, ytDlpFailure } from './errors';
import { spawn } from 'node:child_process';
import { get } from 'node:https';
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import type { IncomingMessage } from 'node:http';
export interface Track { query: string; title: string; url?: string; userId: string }
export interface ResolvedTrack { title: string; url: string; headers?: Record<string, string>; webpageUrl?: string }
const blocked = new BlockList();
for (const [address, prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.168.0.0',16],['192.0.0.0',24],['192.0.2.0',24],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]] as const) blocked.addSubnet(address, prefix, 'ipv4');
export function publicAddress(address: string): boolean {
  if (address.toLowerCase().startsWith('::ffff:')) return publicAddress(address.slice(7));
  if (isIP(address) === 4) return !blocked.check(address, 'ipv4');
  // Globally routed IPv6 unicast only, excluding documentation and transition ranges.
  return isIP(address) === 6 && /^[23]/u.test(address) && !/^(?:2001:(?:db8|0):|2002:)/iu.test(address);
}
export function mediaUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || (isIP(url.hostname.replace(/[\[\]]/gu,'')) && !publicAddress(url.hostname.replace(/[\[\]]/gu,'')))) throw Error('Нужна публичная HTTPS-аудиоссылка.');
  return url;
}
export async function resolveTrack(track: Track, signal: AbortSignal): Promise<ResolvedTrack> {
  const query = track.query.trim();
  if (/^https?:\/\//iu.test(query)) {
    const url = mediaUrl(query);
    if (!['youtube.com','www.youtube.com','music.youtube.com','youtu.be'].includes(url.hostname)) return { title: track.title, url: url.href };
  }
  const target = /^https:\/\//iu.test(query) ? query : 'ytsearch1:' + query;
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.YTDLP_PATH || 'yt-dlp', ['--ignore-config', '--force-ipv4', '--no-playlist', '--no-warnings', '--no-progress', '--skip-download', '--dump-single-json', '--format', 'bestaudio/best', '--js-runtimes', 'node', '--', target], { windowsHide: true, stdio: ['ignore','pipe','pipe'] });
    let output = '', stderrTail = '', finished = false;
    const finish = (error?: Error, value?: ResolvedTrack) => {
      if (finished) return; finished = true; clearTimeout(timer); signal.removeEventListener('abort', abort);
      child.kill(); if (error) reject(error); else resolve(value!);
    };
    const abort = () => finish(Error('Поиск отменён.'));
    const timer = setTimeout(() => finish(new MusicPlaybackError('search_timeout', 'metadata_timeout')), 20000);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    child.stdout.on('data', data => { if (finished) return; output += data.toString(); if (output.length > 2_000_000) finish(new MusicPlaybackError('search', 'metadata_size_limit')); });
    child.stderr.on('data', data => { stderrTail = (stderrTail + String(data)).slice(-8192); });
    child.stdout.on('error', () => finish(new MusicPlaybackError('search', 'metadata_stream_failed')));
    child.on('error', () => finish(new MusicPlaybackError('search', 'yt_dlp_spawn_failed')));
    child.on('close', code => {
      if (finished) return;
      try {
        if (code !== 0) return finish(ytDlpFailure(stderrTail, 'metadata_exit_' + code));
        const data = JSON.parse(output) as { entries?: Array<{ title?: string; url?: string; duration?: number; is_live?: boolean; http_headers?: Record<string, unknown>; webpage_url?: string }>; title?: string; url?: string; duration?: number; is_live?: boolean; http_headers?: Record<string, unknown>; webpage_url?: string };
        const item = data.entries?.[0] || data;
        if (item.is_live || (item.duration && item.duration > 900)) return finish(new MusicPlaybackError('track_limit', 'metadata_track_limit'));
        if (!item.url) return finish(ytDlpFailure(stderrTail, 'metadata_missing_audio'));
        finish(undefined, { title: String(item.title || track.title).slice(0, 160), url: mediaUrl(item.url).href, headers: audioHeaders(item.http_headers || data.http_headers), webpageUrl: youtubePage(item.webpage_url || data.webpage_url) });
      } catch { finish(ytDlpFailure(stderrTail, 'metadata_invalid_result')); }
    });
  });
}
// Pin a public DNS result for each HTTPS connection; FFmpeg receives bytes, never remote URLs.
export async function openMedia(value: string, signal: AbortSignal, redirects = 0, headers: Record<string, string> = {}): Promise<IncomingMessage> {
  if (redirects > 4) throw Error('Слишком много перенаправлений аудио.');
  const url = mediaUrl(value);
  let dnsTimer: ReturnType<typeof setTimeout> | undefined;
  let cancelDns: () => void = () => {};
  const addresses = await Promise.race([lookup(url.hostname.replace(/[\[\]]/gu,''), { all: true }), new Promise<never>((_resolve, reject) => {
    cancelDns = () => reject(Error('Загрузка отменена.'));
    signal.addEventListener('abort', cancelDns, { once: true });
    dnsTimer = setTimeout(() => reject(Error('DNS источника не ответил вовремя.')), 10000);
    if (signal.aborted) cancelDns();
  })]).finally(() => { if (dnsTimer) clearTimeout(dnsTimer); signal.removeEventListener('abort', cancelDns); });
  if (!addresses.length || addresses.some(item => !publicAddress(item.address))) throw Error('Источник аудио использует непубличный адрес.');
  if (signal.aborted) throw Error('Загрузка отменена.');
  const ipv4 = addresses.filter(item => item.family === 4);
  const pinned = ipv4.length ? ipv4 : addresses;
  const response = await new Promise<IncomingMessage>((resolve, reject) => {
    const request = get(url, { signal, headers: audioHeaders(headers), lookup: (_host, _options, callback) => {
      // Node may request all addresses for automatic family selection.
      if (typeof _options === 'object' && _options.all) callback(null, pinned);
      else callback(null, pinned[0]!.address, pinned[0]!.family);
    } }, resolve);
    const timeout = setTimeout(() => request.destroy(Error('Источник не ответил за 15 секунд.')), 15000);
    request.once('response', () => clearTimeout(timeout)); request.once('error', error => { clearTimeout(timeout); reject(error); });
    request.setTimeout(20000, () => request.destroy(Error('Поток аудио перестал отвечать.')));
  });
  response.on('error', () => {}); // Safe until the playback backend attaches its error handler.
  if ([301,302,303,307,308].includes(response.statusCode || 0) && response.headers.location) {
    response.destroy(); return openMedia(new URL(response.headers.location, url).href, signal, redirects + 1, headers);
  }
  if (response.statusCode !== 200) { response.destroy(); throw new MusicPlaybackError(response.statusCode === 403 ? 'source_forbidden' : 'source_http', 'HTTP_' + response.statusCode); }
  if ( !/^(audio\/|video\/|application\/octet-stream)/iu.test(response.headers['content-type'] || '')) { response.destroy(); throw Error('Ссылка не вернула аудио. Укажите название песни или прямую аудиоссылку.'); }
  const maximum = 100 * 1024 * 1024;
  if (Number(response.headers['content-length']) > maximum) { response.destroy(); throw Error('Файл больше 100 МБ.'); }
  let received = 0;
  response.on('data', chunk => { received += chunk.length; if (received > maximum) response.destroy(Error('Поток превысил 100 МБ.')); });
  response.pause();
  return response;
}

export function audioHeaders(value: Record<string, unknown> | undefined): Record<string, string> {
  const headers: Record<string, string> = { 'user-agent': 'Mozilla/5.0' };
  for (const [key, item] of Object.entries(value || {})) {
    const name = key.toLowerCase();
    if (['user-agent', 'accept', 'accept-language'].includes(name) && typeof item === 'string' && item.length < 2048 && !/[\r\n]/u.test(item)) headers[name] = item;
  }
  return headers;
}

export function youtubePage(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try { const url = mediaUrl(value); return ['www.youtube.com', 'youtube.com', 'music.youtube.com', 'youtu.be'].includes(url.hostname) ? url.href : undefined; } catch { return undefined; }
}
export async function openTrackMedia(track: ResolvedTrack, signal: AbortSignal): Promise<Readable> {
  if (!track.webpageUrl) return openMedia(track.url, signal, 0, track.headers);
  const page = youtubePage(track.webpageUrl);
  if (!page) throw new MusicPlaybackError('source', 'invalid_youtube_page');
  return new Promise<Readable>((resolve, reject) => {
    const child = spawn(process.env.YTDLP_PATH || 'yt-dlp', ['--ignore-config', '--force-ipv4', '--no-playlist', '--no-warnings', '--no-progress', '--format', 'bestaudio/best', '--js-runtimes', 'node', '--output', '-', '--', page], { windowsHide: true, stdio: ['ignore','pipe','pipe'] });
    const output = new PassThrough(); output.on('error', () => {});
    let started = false, finished = false, bytes = 0, stderrTail = '';
    let timer: ReturnType<typeof setTimeout>;
    const fail = (diagnostic: string) => {
      if (finished) return; finished = true; clearTimeout(timer); signal.removeEventListener('abort', abort);
      const error = ytDlpFailure(stderrTail, diagnostic, 'source');
      child.stdout.unpipe(output); child.kill(); output.destroy(error); reject(error);
    };
    const abort = () => fail('download_cancelled');
    timer = setTimeout(() => fail('download_start_timeout'), 30000);
    signal.addEventListener('abort', abort, { once: true });
    child.on('error', () => fail('yt_dlp_spawn_failed'));
    child.stdout.on('error', () => fail('yt_dlp_stream_failed'));
    child.stderr.on('data', chunk => { stderrTail = (stderrTail + String(chunk)).slice(-4096); });
    child.stdout.on('data', chunk => {
      if (finished) return;
      bytes += chunk.length;
      if (bytes > 100 * 1024 * 1024) { fail('download_size_limit'); return; }
      clearTimeout(timer); timer = setTimeout(() => fail('download_stalled'), 20000);
      if (!started) { started = true; resolve(output); }
    });
    child.stdout.pipe(output);
    child.on('close', code => {
      if (code !== 0 || !started) { fail('yt_dlp_exit_' + code); return; }
      finished = true; clearTimeout(timer); signal.removeEventListener('abort', abort);
    });
    output.once('close', () => { clearTimeout(timer); signal.removeEventListener('abort', abort); child.kill(); });
    if (signal.aborted) abort();
  });
}
