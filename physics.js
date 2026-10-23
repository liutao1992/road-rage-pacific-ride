import {newPursuit,addHeat,stepPursuit} from './police.js?v=2';
export const ROUTES = {
  coast: {name:'落日海岸', label:'太平洋海岸 · 黄昏', length:4800, sky:0xbccace, fog:0xc8c2a6, ground:0x7a8461, sun:0xffd4a0, seed:21},
  forest:{name:'红杉山道', label:'内华达山脉 · 清晨', length:5600, sky:0x9fb9bb, fog:0x9faea1, ground:0x4d6243, sun:0xe5e6b6, seed:88},
  city:  {name:'钢铁边缘', label:'工业城区 · 日落', length:4200, sky:0xb7bdc6, fog:0xb3b4ae, ground:0x727776, sun:0xffcea2, seed:42}
};
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const lerp=(a,b,t)=>a+(b-a)*t;
export function roadAt(s, route='coast') {
  if(route==='forest') return {x:Math.sin(s*.0022)*110+Math.sin(s*.0062)*48,y:26+Math.sin(s*.0035)*17+Math.sin(s*.008)*4,z:s};
  if(route==='city') return {x:Math.sin(s*.0017)*90+Math.sin(s*.0044)*30,y:9+Math.sin(s*.003)*2,z:s};
  return {x:Math.sin(s*.0016)*145+Math.sin(s*.0047)*42+Math.sin(s*.009)*10,y:15+Math.sin(s*.0022)*6+Math.sin(s*.006)*2,z:s};
}
export function roadHeading(s,route) {const a=roadAt(s-1,route),b=roadAt(s+1,route);return Math.atan2(b.x-a.x,2);}
export function curvatureAt(s,route){return (roadHeading(s+2,route)-roadHeading(s-2,route))/4;}
export function seeded(seed) {let n=seed;return ()=>{n=(n*1664525+1013904223)>>>0;return n/4294967296;};}
export function newRace(route='coast',difficulty='normal') {
  const rng=seeded(ROUTES[route].seed), names=['RAVEN','VEX','SNAKE','DIESEL','NOVA','GHOST','BLAZE'];
  return {route,difficulty,phase:'menu',time:0,countdown:3.4,toast:'',events:[],finishRank:0,pursuit:newPursuit(),
    pickups:Array.from({length:9},(_,i)=>({id:i,s:230+i*470,lane:[2.2,-2.4,3.4,0][i%4],type:['chain','nitro','repair'][i%3],collected:false})).filter(o=>o.s<ROUTES[route].length-100),
    player:{s:0,lane:2.1,speed:0,lateral:0,health:100,nitro:100,drift:0,driftTotal:0,drifting:false,boosting:false,heading:0,lean:0,attack:0,attackSide:0,cooldown:0,invulnerable:0,hits:0,topSpeed:0,nearMisses:0,crashTimer:0,crashed:0,stamina:100,blocking:false,attackType:'punch',attackMode:'punch',weapon:0,miniTurbo:0,knockouts:0,combo:0,comboTime:0,draft:0,pickups:0},
    rivals:names.map((name,i)=>({name,color:[0xf4c444,0x549ba8,0xb75643,0x9dbba1,0x7b6b91,0xce844f,0x738596][i],s:11+Math.floor(i/2)*11,lane:i%2?-2.2:2.2,speed:0,targetSpeed:62+i*.95+rng()*3,health:100,stun:0,crashed:0,attack:0,attackSide:0,cooldown:1+rng()*2,laneTarget:i%2?-2.2:2.2,finished:false})),
    traffic:Array.from({length:25},(_,i)=>({s:230+i*191+(rng()*50),lane:i%3===0?-3.2:3.1,speed:i%3===0?-(17+rng()*8):19+rng()*10,kind:i%5===0?'truck':'car',color:[0xd8c9ac,0x587e86,0x7b5450,0x929d91,0xd9d5ca][i%5],hit:false,missed:false})),
    particles:[],finished:[]};
}
function event(g,type,value){g.events.push({type,value});}
export function damage(g,amount,source='碰撞',options={}) {
  const p=g.player;if(p.invulnerable>0||g.phase!=='racing')return false;
  if(options.combat&&p.blocking&&p.stamina>=8){p.stamina=Math.max(0,p.stamina-8);amount*=.2;event(g,'blocked',source);}
  const before=p.speed;p.health=Math.max(0,p.health-amount);p.speed*=amount>18?.45:.87;p.invulnerable=options.combat?.75:1.65;p.lateral+=(p.lane>=0?-1:1)*2.2;
  p.crashTimer=amount>18?1:.35;p.miniTurbo=0;p.combo=0;p.comboTime=0;
  if(p.drift>0){p.drift=0;p.drifting=false;event(g,'driftLost');}
  if(amount>=22&&before>42){p.crashed=1.9;event(g,'crash');}
  event(g,'damage',source);if(p.health<=0){g.phase='finished';event(g,'finish','wreck');}return true;
}
export function attack(g,side,kind) {
  const p=g.player;if(g.phase!=='racing'||p.cooldown>0||p.crashed>0||p.blocking)return false;
  const type=kind||p.attackMode||'punch',chain=type!=='kick'&&p.weapon>0,cost=type==='kick'?25:chain?19:13;
  if(p.stamina<cost)return false;
  p.stamina-=cost;p.attack=.4;p.attackSide=side;p.attackType=type;p.cooldown=type==='kick'?.95:chain?.8:.58;event(g,'swing',side);
  let hit=false;
  const targets=[...g.rivals,...(g.pursuit?.units.filter(u=>u.active)||[])];
  targets.sort((a,b)=>Math.abs(a.s-p.s)-Math.abs(b.s-p.s));
  for(const r of targets){const gap=(r.lane-p.lane)*side;
    if(!r.finished&&r.stun<=0&&Math.abs(r.s-p.s)<(chain?6:4.5)&&gap>.3&&gap<(chain?3.8:type==='kick'?3.1:2.8)){
      r.health-=chain?48:type==='kick'?38:26;r.speed*=type==='kick'?.65:.78;r.stun=chain?.8:.48;
      r.lane=clamp(r.lane+side*(type==='kick'?1.5:.45),-6.5,6.5);r.laneTarget=r.lane;p.hits++;hit=true;
      p.nitro=clamp(p.nitro+5,0,100);p.combo=p.comboTime>0?p.combo+1:1;p.comboTime=3.5;addHeat(g,r.police?14:8);
      if(chain)p.weapon=Math.max(0,p.weapon-1);
      if(r.health<=0){r.crashed=3;r.stun=3;p.knockouts++;if(r.police){r.active=false;r.stun=16;}event(g,'knockout',r.name);}else event(g,'hit',r.name);
      break; // A directional strike hits only the nearest eligible rider.
    }
  }return hit;
}
export function raceRank(g){return 1+g.rivals.filter(r=>r.s>g.player.s||r.finished).length;}
export function stepRace(g,keys,dt){
  g.events=[];
  if(g.phase==='countdown'){g.countdown-=dt;if(g.countdown<=0){g.phase='racing';event(g,'go');}return;}
  if(g.phase!=='racing')return;
  dt=Math.min(dt,.04);g.time+=dt;const p=g.player;
  const input=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0);
  const gas=keys.has('KeyW')||keys.has('ArrowUp'),brake=keys.has('KeyS')||keys.has('ArrowDown');
  const drift=keys.has('Space')&&(Math.abs(input)>.1||p.drifting&&Math.abs(p.lateral)>1)&&p.speed>16&&p.crashed<=0;
  const boost=(keys.has('ShiftLeft')||keys.has('ShiftRight'))&&p.nitro>1&&gas&&p.speed>8&&!drift&&p.crashed<=0;
  const offRoad=Math.abs(p.lane)>6.35;
  p.miniTurbo=Math.max(0,p.miniTurbo-dt);p.crashed=Math.max(0,p.crashed-dt);p.comboTime=Math.max(0,p.comboTime-dt);if(p.comboTime<=0)p.combo=0;
  const guarding=keys.has('KeyL');p.blocking=guarding&&p.stamina>=8&&p.crashed<=0;p.stamina=clamp(p.stamina+(guarding?(p.blocking?-7:0):17)*dt,0,100);
  p.boosting=boost||p.miniTurbo>0;p.drifting=drift;p.cooldown=Math.max(0,p.cooldown-dt);p.attack=Math.max(0,p.attack-dt);p.invulnerable=Math.max(0,p.invulnerable-dt);p.crashTimer=Math.max(0,p.crashTimer-dt);
  const turbo=p.miniTurbo>0;
  let acc=gas?(boost||turbo?22:11.8):(-1.25-p.speed*.027);
  if(p.crashed>0)acc=-24;else if(p.blocking)acc-=3;
  if(!boost&&!turbo&&p.speed>76)acc-=16;
  if(gas)acc-=p.speed*p.speed*.00185;
  if(brake)acc-=27;if(drift)acc-=5.5;if(offRoad)acc-=9+p.speed*.07;
  p.speed=clamp(p.speed+acc*dt,0,boost||turbo?92:Math.max(76,p.speed));
  if(boost)p.nitro=Math.max(0,p.nitro-24*dt);else p.nitro=clamp(p.nitro+1.5*dt,0,100);
  const target=p.crashed>0?0:input*(drift?7.1:5.3)*clamp(p.speed/24,.08,1.35);
  const follow=drift?2.2:6.2;
  p.lateral=lerp(p.lateral,target,Math.min(1,dt*follow));
  p.lateral+=curvatureAt(p.s,g.route)*p.speed*p.speed*(drift?1.75:1.05)*dt;
  p.lane+=p.lateral*dt;
  if(Math.abs(p.lane)>9.6){p.lane=clamp(p.lane,-9.6,9.6);damage(g,12,'擦碰护栏');p.lateral*=-.5;}
  p.s+=p.speed*dt;p.topSpeed=Math.max(p.topSpeed,p.speed*3.6);
  p.lean=lerp(p.lean,-input*(drift?.55:.37)*clamp(p.speed/25,0,1),Math.min(1,dt*6));
  p.heading=lerp(p.heading,(drift?input*.48:p.lateral*.035),Math.min(1,dt*4));
  if((Math.abs(p.lane)>=6.3||p.crashed>0)&&p.drift>0){p.drift=0;event(g,'driftLost');}
  if(drift&&Math.abs(p.lane)<6.3){p.drift+=dt*p.speed*(1.5+Math.min(1.5,Math.abs(p.lateral)/4));}
  else if(p.drift>0){if(p.drift>30){const score=Math.round(p.drift);p.driftTotal+=score;p.nitro=clamp(p.nitro+score/10,0,100);p.miniTurbo=score>=180?1.8:score>=90?1.15:.65;event(g,'drift',score);}p.drift=0;}
  const difficulty=g.difficulty==='easy'?.85:g.difficulty==='hard'?1.09:1;
  for(const r of g.rivals){
    r.cooldown-=dt;r.attack=Math.max(0,r.attack-dt);const recovering=r.stun>0;r.stun=Math.max(0,r.stun-dt);r.crashed=Math.max(0,(r.crashed||0)-dt);if(recovering&&r.stun<=0&&r.health<=0)r.health=100;
    if(r.finished)continue;
    const catchUp=clamp((p.s-r.s)*.013,-5,7);
    const targetSpeed=(r.targetSpeed+catchUp)*difficulty*(r.stun>0?.35:1);
    r.speed+=clamp(targetSpeed-r.speed,-18,10.5)*dt;
    if(r.stun<=0){r.laneTarget=Math.sin(r.s*.006+r.targetSpeed)*3.3;
      // Riders avoid slower traffic, but do not teleport between lanes.
      for(const car of g.traffic){if(car.s>r.s&&car.s-r.s<40&&Math.abs(car.lane-r.laneTarget)<1.6)r.laneTarget=car.lane>0?-.6:2.8;}
    }
    r.lane=lerp(r.lane,r.laneTarget,dt*.8);r.s+=r.speed*dt;
    if(Math.abs(r.s-p.s)<3.2&&Math.abs(r.lane-p.lane)<1.05){p.lateral+=(p.lane>=r.lane?1:-1)*dt*12;}
    if(Math.abs(r.s-p.s)<4.5&&Math.abs(r.lane-p.lane)<2.8&&r.cooldown<=0&&r.stun<=0){r.attack=.4;r.attackSide=p.lane>r.lane?1:-1;r.cooldown=3+(r.targetSpeed%2);if(g.difficulty!=='easy')damage(g,7,r.name+' 的反击',{combat:true});}
    if(r.s>=ROUTES[g.route].length){r.finished=true;g.finished.push(r.name);}
  }
  for(const car of g.traffic){
    car.s+=car.speed*dt;
    if(car.s<p.s-160){car.s=p.s+900+(car.s%200+200)%200;car.hit=false;car.missed=false;}
    if(Math.abs(car.s-p.s)<(car.kind==='truck'?5.5:3.8)&&Math.abs(car.lane-p.lane)<1.45){if(damage(g,car.speed<0?31:24,'撞上'+(car.speed<0?'迎面来车':'社会车辆')))car.hit=true;}
    if(!car.missed&&car.s<p.s-5&&car.s>p.s-15){car.missed=true;if(!car.hit&&Math.abs(car.lane-p.lane)<2.6&&p.speed>35){p.nearMisses++;p.nitro=clamp(p.nitro+5,0,100);addHeat(g,4);event(g,'nearMiss');}}
  }
  if(g.phase!=='racing')return;
  const drafting=g.rivals.some(r=>r.s>p.s+6&&r.s<p.s+32&&Math.abs(r.lane-p.lane)<1&&r.stun<=0);
  p.draft=clamp(p.draft+(drafting&&p.speed>30?dt:-dt*2),0,3);
  if(p.draft>=3){p.nitro=clamp(p.nitro+15,0,100);p.draft=0;event(g,'draft','尾流跟车 · +15 氮气');}
  for(const item of g.pickups){if(!item.collected&&Math.abs(item.s-p.s)<4&&Math.abs(item.lane-p.lane)<1.3){item.collected=true;p.pickups++;
    if(item.type==='chain')p.weapon=8;else if(item.type==='repair')p.health=clamp(p.health+28,0,100);else p.nitro=clamp(p.nitro+40,0,100);event(g,'pickup',item.type);
  }}
  stepPursuit(g,dt,damage);
  if(g.phase==='racing'&&p.s>=ROUTES[g.route].length){g.finishRank=1+g.finished.length;g.phase='finished';event(g,'finish','complete');}
}
export function formatTime(t){const m=Math.floor(t/60),s=Math.floor(t%60),cs=Math.floor((t%1)*100);return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`;}
