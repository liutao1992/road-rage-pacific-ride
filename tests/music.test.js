import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BackgroundMusic} from '../music.js';

function fixture(){
  const sources=[];const context={currentTime:2,state:'running',createGain(){return {gain:{value:0,cancelScheduledValues(){},setTargetAtTime(v){this.value=v;}},connect(){},disconnect(){}};},async decodeAudioData(){return {duration:53.333333};},createBufferSource(){const node={connect(){},disconnect(){},start(){this.started=true;},stop(){this.stopped=true;}};sources.push(node);return node;}};
  return {context,sources,music:new BackgroundMusic(context,{},'/audio/test.mp3')};
}
function response(){return {ok:true,arrayBuffer:async()=>new ArrayBuffer(2)};}

test('concurrent starts fetch and decode once, and produce one looping source',async t=>{
  let requests=0;t.mock.method(globalThis,'fetch',async()=>{requests++;return response();});
  const {music,sources}=fixture();await Promise.all([music.start(),music.start(),music.start()]);
  assert.equal(requests,1);assert.equal(sources.length,1);assert.equal(sources[0].loop,true);assert.equal(music.getState().playing,true);assert.ok(music.getState().duration>53);
});
test('music disabled during load stays inaudible; re-enable does not stack tracks',async t=>{
  let release;t.mock.method(globalThis,'fetch',()=>new Promise(resolve=>{release=()=>resolve(response());}));
  const {music,sources}=fixture(),pending=music.start();music.setEnabled(false);release();await pending;
  assert.equal(music.getState().gain,0);music.setEnabled(true);await music.start();assert.equal(sources.length,1);assert.ok(music.getState().gain>0);
});
test('pause lowers music, hidden tabs mute it, and returning restores selected state',async t=>{
  t.mock.method(globalThis,'fetch',async()=>response());const {music,context}=fixture();await music.start();const normal=music.getState().gain;
  music.setEnvironment(true,false);assert.ok(music.getState().gain>0&&music.getState().gain<normal);music.setEnvironment(true,true);assert.equal(music.getState().gain,0);music.setEnabled(false);music.setEnvironment(false,false);assert.equal(music.getState().gain,0);context.state='suspended';assert.equal(music.getState().playing,false);
});
test('failed music request reports the error and can be retried successfully',async t=>{
  let requests=0;t.mock.method(globalThis,'fetch',async()=>++requests===1?{ok:false,status:404}:response());const {music,sources}=fixture();
  await assert.rejects(music.start(),/404/);assert.equal(sources.length,0);assert.match(music.getState().error,/404/);await music.start();assert.equal(music.getState().error,null);assert.equal(sources.length,1);music.dispose();assert.equal(sources[0].stopped,true);
});
