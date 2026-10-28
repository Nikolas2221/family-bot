import { spawn } from 'node:child_process';
import { get } from 'node:https';
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import type { IncomingMessage } from 'node:http';
export interface Track { query: string; title: string; url?: string; userId: string }
export interface ResolvedTrack { title: string; url: string }
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
    const child = spawn(process.env.YTDLP_PATH || 'yt-dlp', ['--ignore-config', '--no-playlist', '--no-warnings', '--no-progress', '--skip-download', '--dump-single-json', '--format', 'bestaudio/best', '--js-runtimes', 'node', '--', target], { windowsHide: true, stdio: ['ignore','pipe','pipe'] });
    let output = '', finished = false;
    const finish = (error?: Error, value?: ResolvedTrack) => {
      if (finished) return; finished = true; clearTimeout(timer); signal.removeEventListener('abort', abort);
      child.kill(); if (error) reject(error); else resolve(value!);
    };
    const abort = () => finish(Error('Поиск отменён.'));
    const timer = setTimeout(() => finish(Error('Поиск музыки превысил 20 секунд.')), 20000);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    child.stdout.on('data', data => { output += data.toString(); if (output.length > 2_000_000) finish(Error('Слишком большой результат поиска.')); });
    child.stderr.resume();
    child.on('error', () => finish(Error('Поиск недоступен: установите yt-dlp и проверьте YTDLP_PATH.')));
    child.on('close', code => {
      if (finished) return;
      try {
        if (code !== 0) throw Error();
        const data = JSON.parse(output) as { entries?: Array<{ title?: string; url?: string; duration?: number; is_live?: boolean }>; title?: string; url?: string; duration?: number; is_live?: boolean };
        const item = data.entries?.[0] || data;
        if (!item.url || item.is_live || (item.duration && item.duration > 900)) return finish(Error('Для поиска доступны треки до 15 минут, без прямых эфиров.'));
        finish(undefined, { title: String(item.title || track.title).slice(0, 160), url: mediaUrl(item.url).href });
      } catch { finish(Error('Песня не найдена или источник недоступен. Попробуйте уточнить исполнителя.')); }
    });
  });
}
// Pin a public DNS result for each HTTPS connection; FFmpeg receives bytes, never remote URLs.
export async function openMedia(value: string, signal: AbortSignal, redirects = 0): Promise<IncomingMessage> {
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
  const response = await new Promise<IncomingMessage>((resolve, reject) => {
    const request = get(url, { signal, lookup: (_host, _options, callback) => {
      // Node may request all addresses for automatic family selection.
      if (typeof _options === 'object' && _options.all) callback(null, addresses);
      else callback(null, addresses[0]!.address, addresses[0]!.family);
    } }, resolve);
    const timeout = setTimeout(() => request.destroy(Error('Источник не ответил за 15 секунд.')), 15000);
    request.once('response', () => clearTimeout(timeout)); request.once('error', error => { clearTimeout(timeout); reject(error); });
    request.setTimeout(20000, () => request.destroy(Error('Поток аудио перестал отвечать.')));
  });
  response.on('error', () => {}); // Safe until the playback backend attaches its error handler.
  if ([301,302,303,307,308].includes(response.statusCode || 0) && response.headers.location) {
    response.destroy(); return openMedia(new URL(response.headers.location, url).href, signal, redirects + 1);
  }
  if (response.statusCode !== 200 || !/^(audio\/|video\/|application\/octet-stream)/iu.test(response.headers['content-type'] || '')) { response.destroy(); throw Error('Ссылка не вернула аудио. Укажите название песни или прямую аудиоссылку.'); }
  const maximum = 100 * 1024 * 1024;
  if (Number(response.headers['content-length']) > maximum) { response.destroy(); throw Error('Файл больше 100 МБ.'); }
  let received = 0;
  response.on('data', chunk => { received += chunk.length; if (received > maximum) response.destroy(Error('Поток превысил 100 МБ.')); });
  response.pause();
  return response;
}
