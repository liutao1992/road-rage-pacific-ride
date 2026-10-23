import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newRace,stepRace,attack,damage,roadAt,ROUTES,formatTime} from '../physics.js';
function race(){const g=newRace();g.phase='racing';g.rivals=[];g.traffic=[];return g;}
function run(g,keys,seconds){for(let t=0;t<seconds;t+=1/120)stepRace(g,new Set(keys),1/120);}

test('countdown gates motion and pause freezes elapsed time',()=>{
  const g=race();g.phase='countdown';run(g,['KeyW'],2);assert.equal(g.player.s,0);assert.equal(g.time,0);run(g,['KeyW'],2);assert.equal(g.phase,'racing');assert.ok(g.player.speed>0);g.phase='paused';const previous={s:g.player.s,time:g.time};run(g,['KeyW'],10);assert.equal(g.player.s,previous.s);assert.equal(g.time,previous.time);
});
test('gas accelerates, brakes slow down, steering responds in both directions',()=>{
  const g=race();run(g,['KeyW'],3);assert.ok(g.player.speed>25);const speed=g.player.speed;run(g,['KeyS'],.5);assert.ok(g.player.speed<speed-10);const lane=g.player.lane;run(g,['KeyD'],.3);assert.ok(g.player.lane>lane);run(g,['KeyA'],.8);assert.ok(g.player.lane<lane);
});
test('drift needs speed, scores on release and replenishes nitro',()=>{
  const g=race();g.player.speed=30;g.player.nitro=10;run(g,['KeyW','Space','KeyD'],.65);assert.equal(g.player.drifting,true);assert.ok(g.player.drift>30);const nitro=g.player.nitro;stepRace(g,new Set(['KeyW']),1/120);assert.equal(g.player.drifting,false);assert.ok(g.player.driftTotal>30);assert.ok(g.player.nitro>nitro);assert.equal(g.events[0].type,'drift');
});
test('nitro burns only when usable, cannot become negative',()=>{
  const g=race();g.player.speed=30;g.player.nitro=10;run(g,['KeyW','ShiftLeft'],.1);assert.equal(g.player.boosting,true);assert.ok(g.player.nitro<10);run(g,['KeyW','ShiftLeft'],1);assert.ok(g.player.nitro>=0);assert.ok(g.player.speed>30);
});
test('attacks require correct side and proximity, honor cooldown',()=>{
  const g=newRace();g.phase='racing';const r=g.rivals[0];r.s=g.player.s+1;r.lane=g.player.lane+1.8;assert.equal(attack(g,-1),false);g.player.cooldown=0;assert.equal(attack(g,1),true);assert.equal(g.player.hits,1);assert.ok(r.health<100);assert.equal(attack(g,1),false);
});
test('collisions consume health once during invulnerability and total damage ends race',()=>{
  const g=race();g.player.speed=40;g.traffic=[{s:g.player.s,lane:g.player.lane,speed:-20,kind:'car',hit:false,missed:false}];stepRace(g,new Set(),1/120);assert.equal(g.player.health,69);const hp=g.player.health;stepRace(g,new Set(),1/120);assert.equal(g.player.health,hp);g.player.invulnerable=0;damage(g,100);assert.equal(g.phase,'finished');assert.equal(g.player.health,0);
});
test('all routes finish with results, further simulation cannot mutate elapsed time',()=>{
  for(const route of Object.keys(ROUTES)){const g=race();g.route=route;g.player.s=ROUTES[route].length-.1;g.player.speed=40;stepRace(g,new Set(),1/120);assert.equal(g.phase,'finished');assert.equal(g.finishRank,1);assert.equal(g.events.at(-1).type,'finish');const elapsed=g.time;run(g,['KeyW'],1);assert.equal(g.time,elapsed);}
});
test('rivals that cross the finish first remain ahead in the final ranking',()=>{
  const g=race();g.rivals=[{name:'WINNER',finished:true,s:ROUTES.coast.length+10}];g.finished=['WINNER'];g.player.s=ROUTES.coast.length-.1;g.player.speed=40;stepRace(g,new Set(),1/120);assert.equal(g.finishRank,2);
});
test('world data is continuous and distinct for all three full routes',()=>{
  const signatures=new Set();for(const route of Object.keys(ROUTES)){signatures.add(roadAt(700,route).x);for(let s=0;s<=ROUTES[route].length;s+=3){const a=roadAt(s,route),b=roadAt(s+1,route);assert.ok(Number.isFinite(a.x)&&Number.isFinite(a.y));assert.ok(Math.abs(b.x-a.x)<1.5);assert.ok(Math.abs(b.y-a.y)<1);}}assert.equal(signatures.size,3);assert.equal(formatTime(125.5),'02:05.50');
});
