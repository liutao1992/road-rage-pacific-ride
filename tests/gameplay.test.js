import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newRace,stepRace,damage,attack,ROUTES} from '../physics.js';
import {stepPursuit} from '../police.js';
function race(){const g=newRace();g.phase='racing';g.rivals=[];g.traffic=[];g.pickups=[];return g;}
function run(g,keys,seconds){for(let i=0;i<Math.ceil(seconds*120);i++)stepRace(g,new Set(keys),1/120);}
function chase(g){g.pursuit.active=true;Object.assign(g.pursuit.units[0],{active:true,s:g.player.s-4,lane:g.player.lane+1.5,speed:g.player.speed,stun:0,cooldown:5});}

test('sustained speeding dispatches police and normal safe riding cools heat',()=>{
  const g=race();g.player.speed=70;for(let i=0;i<1440;i++)stepPursuit(g,1/120,damage);assert.equal(g.pursuit.active,true);assert.equal(g.pursuit.units[0].active,true);assert.ok(g.pursuit.heat>=34);const heat=g.pursuit.heat;g.player.speed=15;stepPursuit(g,1,damage);assert.ok(g.pursuit.heat<heat);
});
test('police stop results in arrest, while accelerating breaks arrest progress',()=>{
  const g=race();chase(g);g.pursuit.arrest=.99;stepPursuit(g,.04,damage);assert.equal(g.phase,'finished');assert.equal(g.events.at(-1).value,'busted');
  const h=race();h.player.speed=25;chase(h);h.pursuit.arrest=.5;stepPursuit(h,.1,damage);assert.ok(h.pursuit.arrest<.5);assert.equal(h.phase,'racing');
});
test('police brake alongside a stopped player and complete a real arrest',()=>{
  const g=race();chase(g);g.pursuit.units[0].s=-20;g.pursuit.units[0].speed=45;
  for(let i=0;i<1200&&g.phase==='racing';i++)stepPursuit(g,1/120,damage);
  assert.equal(g.phase,'finished');assert.equal(g.events.at(-1).value,'busted');
});
test('disabled police recover their crash pose before a later dispatch',()=>{
  const g=race(),u=g.pursuit.units[0];u.crashed=2;u.stun=3;for(let i=0;i<360;i++)stepPursuit(g,1/120,damage);assert.equal(u.crashed,0);assert.ok(u.stun<.01);
});
test('pulling beyond police sight for five seconds rewards an escape exactly once',()=>{
  const g=race();g.player.speed=80;chase(g);g.pursuit.units[0].s=-130;g.pursuit.units[0].speed=40;g.pursuit.escape=4.99;g.player.nitro=20;stepPursuit(g,.02,damage);assert.equal(g.pursuit.active,false);assert.equal(g.pursuit.evaded,1);assert.equal(g.player.nitro,40);assert.equal(g.pursuit.units[0].active,false);stepPursuit(g,.02,damage);assert.equal(g.pursuit.evaded,1);
});
test('high heat requests roadblocks with a real gap on all three layouts',()=>{
  for(let i=0;i<3;i++){const g=race();g.player.s=900;g.player.speed=60;g.pursuit.heat=85;g.pursuit.blockCount=i;stepPursuit(g,.01,damage);const b=g.pursuit.roadblocks[0];assert.ok(b.s-g.player.s>=375);assert.equal(b.lanes.length,2);assert.ok(b.lanes.every(l=>Math.abs(l-b.gapLane)>2.45));g.player.s=b.s;g.player.lane=b.gapLane;stepPursuit(g,.01,damage);assert.equal(g.player.health,100);g.player.s=b.s+12;g.player.nitro=10;stepPursuit(g,.01,damage);assert.equal(b.passed,true);assert.equal(g.player.nitro,22);}
});
test('hitting roadblock cars damages the bike once and cancels clean-pass rewards',()=>{
  const g=race();g.player.speed=60;g.pursuit.roadblocks=[{s:0,lanes:[-3.6,3.6],gapLane:0,passed:false,hit:false}];g.player.lane=3.6;stepPursuit(g,.01,damage);assert.equal(g.player.health,72);assert.ok(g.player.crashed>0);const hp=g.player.health;stepPursuit(g,.01,damage);assert.equal(g.player.health,hp);g.player.s=15;const nitro=g.player.nitro;stepPursuit(g,.01,damage);assert.equal(g.player.nitro,nitro);
});
test('guard reduces melee damage, drains stamina and cannot protect from vehicles',()=>{
  const g=race();g.player.blocking=true;damage(g,10,'attack',{combat:true});assert.equal(g.player.health,98);assert.equal(g.player.stamina,92);g.player.invulnerable=0;damage(g,24,'car');assert.equal(g.player.health,74);run(g,[],1);assert.ok(g.player.stamina>92);
});
test('holding guard with exhausted stamina cannot regenerate or block for free',()=>{
  const g=race();g.player.stamina=7;run(g,['KeyL'],1);assert.equal(g.player.stamina,7);assert.equal(g.player.blocking,false);run(g,[],.5);assert.ok(g.player.stamina>15);
});
test('kicks cost stamina, push riders aside, and exhausted riders cannot attack',()=>{
  const g=newRace();g.phase='racing';const r=g.rivals[0];r.s=1;r.lane=3.8;const lane=r.lane;assert.equal(attack(g,1,'kick'),true);assert.ok(r.lane>lane+1);assert.equal(g.player.stamina,75);assert.equal(g.player.attackType,'kick');g.player.cooldown=0;g.player.stamina=5;const health=r.health;assert.equal(attack(g,1),false);assert.equal(r.health,health);
});
test('chain pickups have eight successful-hit durability and can knock out police',()=>{
  const g=race();g.pickups=[{id:0,s:0,lane:2.1,type:'chain',collected:false}];stepRace(g,new Set(),1/120);assert.equal(g.player.weapon,8);assert.equal(g.player.pickups,1);stepRace(g,new Set(),1/120);assert.equal(g.player.pickups,1);chase(g);const u=g.pursuit.units[0];u.s=g.player.s;u.lane=g.player.lane+2;u.health=40;assert.equal(attack(g,1),true);assert.equal(g.player.weapon,7);assert.equal(u.active,false);assert.equal(g.player.knockouts,1);
});
test('repair and nitro are capped and collected only in the pickup lane',()=>{
  for(const type of ['repair','nitro']){const g=race();g.player.health=90;g.player.nitro=85;g.pickups=[{s:0,lane:-3,type,collected:false}];stepRace(g,new Set(),1/120);assert.equal(g.pickups[0].collected,false);g.player.lane=-3;stepRace(g,new Set(),1/120);assert.equal(g.pickups[0].collected,true);assert.equal(type==='repair'?g.player.health:g.player.nitro,100);}
});
test('clean drifts award a short turbo, crashes lose the drift reward',()=>{
  const g=race();g.player.speed=30;g.player.drift=120;g.player.drifting=true;stepRace(g,new Set(['KeyW']),1/120);assert.ok(g.player.miniTurbo>1);assert.equal(g.player.driftTotal,120);
  const h=race();h.player.drift=120;damage(h,24,'collision');assert.equal(h.player.drift,0);assert.equal(h.player.driftTotal,0);assert.equal(h.player.miniTurbo,0);
});
test('nitro expiration decelerates smoothly rather than snapping to the normal cap',()=>{
  const g=race();g.player.speed=90;stepRace(g,new Set(['KeyW']),1/120);assert.ok(g.player.speed>89);assert.ok(g.player.speed<90);
});
test('new races reset police, pickup, stamina and weapon state; pause freezes all systems',()=>{
  const g=race();g.phase='paused';g.pursuit.heat=70;g.pursuit.arrest=.5;const before=structuredClone(g);run(g,['KeyW'],2);assert.deepEqual(g,before);const h=newRace('forest');assert.equal(h.pursuit.active,false);assert.equal(h.pursuit.heat,8);assert.equal(h.player.stamina,100);assert.equal(h.player.weapon,0);assert.ok(h.pickups.every(p=>!p.collected));
});
test('finish remains reachable on every route with pursuit active',()=>{
  for(const route of Object.keys(ROUTES)){const g=race();g.route=route;g.player.s=ROUTES[route].length-.1;g.player.speed=60;chase(g);stepRace(g,new Set(),1/120);assert.equal(g.phase,'finished');assert.equal(g.events.at(-1).value,'complete');}
});
