const assert = require('node:assert/strict');
const cp = require('node:child_process');
const { EventEmitter } = require('node:events');
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { searchAudius } = require('../dist-ts/modules/music/audius');
const { resolveTrack, openTrackMedia } = require('../dist-ts/modules/music/sources');
const { MusicManager } = require('../dist-ts/modules/music/manager');
const { createMusicService } = require('../dist-ts/modules/music/service');
const dns = require('node:dns/promises');
const https = require('node:https');
const { PassThrough } = require('node:stream');
const tick = () => new Promise(resolve => setImmediate(resolve));
async function main() {
  const originalFetch = global.fetch, originalSpawn = cp.spawn, originalLookup = dns.lookup, originalGet = https.get;
  const controller = new AbortController();
  const song = { id: 'abc123', title: 'Кино — Группа крови', duration: 191, is_streamable: true, is_available: true, is_stream_gated: false, stream_conditions: null, access: { stream: true }, user: { name: 'Uploader' } };
  let requested;
  try {
    cp.spawn = () => { throw Error('Name search must not spawn yt-dlp'); };
    global.fetch = async (url, options) => { requested = new URL(url); assert.equal(options.redirect, 'error'); return Response.json({ data: [
      { ...song, id: 'paid', is_stream_gated: true }, { ...song, id: 'long', duration: 901 },
      { ...song, id: 'blocked', access: { stream: false } }, { ...song, id: 'gone', is_available: false },
      { ...song, id: 'deleted', is_delete: true }, { ...song, id: 'preview', is_streamable: false },
      { ...song, id: 'bad/../../id' }, { ...song, duration: null }, song
    ] }); };
    const resolved = await resolveTrack({ query: 'Кино Группа крови', title: 'query', userId: 'u' }, controller.signal);
    assert.equal(requested.origin, 'https://api.audius.co');
    assert.equal(requested.searchParams.get('query'), 'Кино Группа крови');
    assert.equal(resolved.source, 'audius'); assert.equal(resolved.title, 'Кино — Группа крови — Uploader');
    assert.equal(new URL(resolved.url).pathname, '/v1/tracks/abc123/stream');
    assert.equal(resolved.webpageUrl, undefined);
    const notices = [];
    const manager = new MusicManager({ play: async () => {}, stop() {}, pause() {}, resume() {} }, async () => resolved);
    manager.enqueue('g', 'v', { query: 'song', title: 'song', userId: 'u' }, async text => notices.push(text));
    await tick(); await tick(); assert.ok(notices.some(text => text.includes('в Audius')));
    for (const data of [[], [{ ...song, stream_conditions: { nft_collection: {} } }], [{ ...song, duration: Infinity }]]) {
      global.fetch = async () => Response.json({ data });
      await assert.rejects(searchAudius('song', controller.signal), error => error.stage === 'audius_not_found');
    }
    for (const [response, stage] of [
      [new Response('private error url token=secret', { status: 429 }), 'audius_rate_limit'],
      [new Response('private error url token=secret', { status: 503 }), 'audius_api'],
      [Response.json({ error: 'private' }), 'audius_api'],
      [new Response('{broken'), 'audius_api'],
      [new Response('x'.repeat(1024 * 1024 + 1)), 'audius_api']
    ]) {
      global.fetch = async () => response;
      await assert.rejects(searchAudius('song', controller.signal), error => error.stage === stage && !/private|secret/.test(error.message));
    }
    global.fetch = async () => { throw Error('network private token=secret'); };
    await assert.rejects(searchAudius('song', controller.signal), error => error.stage === 'audius_api' && !/secret/.test(error.message));
    let fetchCalls = 0;
    global.fetch = async (_url, { signal }) => { fetchCalls++; return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })); };
    const cancelled = new AbortController(); cancelled.abort();
    await assert.rejects(searchAudius('song', cancelled.signal)); assert.equal(fetchCalls, 0);
    const active = new AbortController(), pending = searchAudius('song', active.signal);
    active.abort(); await assert.rejects(pending); assert.equal(fetchCalls, 1);
    dns.lookup = async () => [{ address: '8.8.8.8', family: 4 }];
    const mediaUrls = [];
    https.get = (url, _options, callback) => {
      mediaUrls.push(new URL(url)); const request = new EventEmitter(); request.setTimeout = () => request;
      request.destroy = () => {};
      setImmediate(() => {
        const response = new PassThrough(); response.statusCode = mediaUrls.length === 1 ? 307 : 200;
        response.headers = mediaUrls.length === 1 ? { location: 'https://cdn.example/song.mp3' } : { 'content-type': 'audio/mpeg' };
        request.emit('response', response); callback(response);
        if (response.statusCode === 200) setImmediate(() => response.end(Buffer.from([1, 2, 3])));
      }); return request;
    };
    const stream = await openTrackMedia(resolved, controller.signal);
    const bytes = []; for await (const chunk of stream) bytes.push(chunk);
    assert.deepEqual(Buffer.concat(bytes), Buffer.from([1, 2, 3]));
    assert.equal(mediaUrls.length, 2, 'Audius redirect is handled through the public DNS checked loader');
    // Audius remains usable when yt-dlp is absent; status never claims the API was probed.
    cp.spawn = (_exe, args) => { const child = new EventEmitter(); child.kill = () => {}; setImmediate(() => child.emit('close', args[0] === '-version' ? 0 : 1)); return child; };
    const client = new EventEmitter(); client.guilds = { cache: new Map() };
    const service = createMusicService(client, () => true);
    const replies = [];
    const interaction = { commandName: 'music', guildId: 'g', user: { id: 'u' }, deferred: false,
      isChatInputCommand: () => true, inCachedGuild: () => true,
      deferReply: async () => { interaction.deferred = true; }, editReply: async value => replies.push(value.content),
      options: { getSubcommand: () => 'status' }
    };
    await service.handleInteraction(interaction);
    assert.match(replies.at(-1), /Поиск по названию: Audius/);
    assert.match(replies.at(-1), /yt-dlp: не установлен/);
    global.fetch = async () => Response.json({ data: [] });
    interaction.options = { getSubcommand: () => 'play', getString: () => 'song', getAttachment: () => null };
    interaction.member = { voice: { channel: { id: 'v', type: ChannelType.GuildVoice, permissionsFor: () => ({ has: permissions => permissions.includes(PermissionFlagsBits.Speak) }) } } };
    interaction.guild = { members: { me: {} } };
    await service.handleInteraction(interaction);
    assert.match(replies.at(-1), /Поиск в Audius/);
    await tick(); service.stop();
    console.log('PASS Audius name search, playable-track filtering, bounded API errors/cancellation, stream redirects and operation without yt-dlp');
  } finally { global.fetch = originalFetch; cp.spawn = originalSpawn; dns.lookup = originalLookup; https.get = originalGet; }
}
module.exports = { main };
