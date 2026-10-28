const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {PassThrough}=require('node:stream');
const cp=require('node:child_process');
const dns=require('node:dns/promises');
const https=require('node:https');
const {openTrackMedia,openMedia,resolveTrack,audioHeaders,youtubePage}=require('../dist-ts/modules/music/sources');
const {MusicManager}=require('../dist-ts/modules/music/manager');
const {MusicPlaybackError}=require('../dist-ts/modules/music/errors');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function main(){
 const originalSpawn=cp.spawn, originalLookup=dns.lookup, originalGet=https.get;
 try {
  assert.equal(youtubePage('https://www.youtube.com/watch?v=test'),'https://www.youtube.com/watch?v=test');
  assert.equal(youtubePage('https://youtube.com.evil.test/watch'),undefined);
  assert.deepEqual(audioHeaders({'User-Agent':'Player UA',Cookie:'private',Authorization:'private','Accept':'audio/*'}),{'user-agent':'Player UA',accept:'audio/*'});
  let args,kills=0,mode='metadata';
  cp.spawn=(_exe,arguments_)=>{
   args=arguments_;
   const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{kills++;};
   if(mode==='metadata') setImmediate(()=>{child.stdout.write(JSON.stringify({entries:[{title:'Song',url:'https://cdn.example/audio',webpage_url:'https://www.youtube.com/watch?v=test',http_headers:{'User-Agent':'Correct agent',Cookie:'private'}}]}));child.emit('close',0);});
   if(mode==='audio') setImmediate(()=>{child.stdout.end(Buffer.from([1,2,3,4]));child.emit('close',0);});
   if(mode==='abort-after-start') setImmediate(()=>child.stdout.write(Buffer.from([1])));
   return child;
  };
  const resolved=await resolveTrack({query:'Song',title:'Song',userId:'u'},new AbortController().signal);
  assert.equal(resolved.webpageUrl,'https://www.youtube.com/watch?v=test');
  assert.equal(resolved.headers['user-agent'],'Correct agent');
  assert.equal(resolved.headers.Cookie,undefined);
  assert.ok(args.includes('--force-ipv4'));
  mode='audio';
  const stream=await openTrackMedia(resolved,new AbortController().signal);
  const parts=[];for await(const chunk of stream)parts.push(chunk);
  assert.deepEqual(Buffer.concat(parts),Buffer.from([1,2,3,4]));
  assert.ok(args.includes('--output'));assert.equal(args.at(-1),resolved.webpageUrl,'download uses the selected video, not another search or a naked signed URL');
  mode='abort-before-start';const cancelled=new AbortController();cancelled.abort();
  await assert.rejects(openTrackMedia(resolved,cancelled.signal),MusicPlaybackError);
  mode='abort-after-start';const controller=new AbortController();
  const pending=await openTrackMedia(resolved,controller.signal);
  const failed=new Promise(resolve=>pending.once('error',resolve));controller.abort();
  assert.equal((await failed).diagnostic,'download_cancelled');assert.ok(kills>=3);
  dns.lookup=async()=>[{address:'8.8.8.8',family:4}];
  https.get=(_url,_options,callback)=>{const request=new EventEmitter();request.setTimeout=()=>request;request.destroy=()=>{};setImmediate(()=>{const response=new EventEmitter();response.statusCode=403;response.headers={};response.destroy=()=>{};request.emit('response',response);callback(response);});return request;};
  await assert.rejects(openMedia('https://public.example/audio',new AbortController().signal),error=>error.stage==='source_forbidden'&&error.diagnostic==='HTTP_403');
  const notices=[];
  const backend={play:async()=>{throw new MusicPlaybackError('source_forbidden');},stop(){},pause(){return false;},resume(){return false;}};
  const manager=new MusicManager(backend,async()=>resolved);
  manager.enqueue('g','v',{query:'Song',title:'Song',userId:'u'},async text=>notices.push(text));
  await tick();await tick();
  assert.match(manager.lastError('g'),/HTTP 403/);assert.ok(notices.some(text=>text.includes('HTTP 403')));
  assert.doesNotMatch(notices.join(' '),/cdn\.example|private/);
  console.log('PASS YouTube selected-video streaming, header filtering, IPv4 extraction, downloader cancellation, HTTP errors and retained music diagnostics');
 } finally {cp.spawn=originalSpawn;dns.lookup=originalLookup;https.get=originalGet;}
}
module.exports={main};
