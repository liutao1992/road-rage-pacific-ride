const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const emit=(g,type,value)=>g.events.push({type,value});
export function newPursuit(){return {heat:8,active:false,escape:0,arrest:0,cooldown:0,evaded:0,roadblocks:[],nextBlock:800,blockCount:0,units:Array.from({length:2},(_,i)=>({name:i?'巡警 BRAVO':'巡警 ALPHA',police:true,active:false,s:-80-i*20,lane:i?-2:2,speed:0,health:110,stun:0,crashed:0,cooldown:2,attack:0,attackSide:0}))};}
export function addHeat(g,amount){if(g.pursuit)g.pursuit.heat=clamp(g.pursuit.heat+amount,0,100);}
export function stepPursuit(g,dt,damage){
  const p=g.player,h=g.pursuit;if(!h||g.phase!=='racing')return;
  h.cooldown=Math.max(0,h.cooldown-dt);
  const speeding=p.speed>65?2.5:p.speed>50?1.25:0,incoming=p.lane<-.5&&p.speed>22?.9:0;
  h.heat=clamp(h.heat+(speeding+incoming-(speeding||incoming?0:1.4))*dt,h.active?34:0,100);
  if(!h.active&&h.cooldown<=0&&h.heat>=34){
    h.active=true;h.escape=0;emit(g,'pursuit','警用摩托已出动！拉开距离或击退巡警');
    const u=h.units[0];Object.assign(u,{active:true,s:p.s-48,lane:clamp(p.lane+2,-4.5,4.5),speed:Math.max(28,p.speed),health:110,stun:0,crashed:0,cooldown:2});
  }
  if(h.active&&h.heat>=77&&!h.units[1].active&&h.units[1].stun<=0){const u=h.units[1];Object.assign(u,{active:true,s:p.s-65,lane:-2.5,speed:p.speed+2,health:110,stun:0,crashed:0,cooldown:2});emit(g,'reinforcement','第二辆巡警加入追缉');}
  let nearby=false,allBehind=true,activeCount=0;
  for(const u of h.units){
    u.stun=Math.max(0,u.stun-dt);u.crashed=Math.max(0,(u.crashed||0)-dt);u.cooldown-=dt;u.attack=Math.max(0,u.attack-dt);
    if(!u.active)continue;activeCount++;
    const gap=p.s-u.s,target=u.stun>0?p.speed*.38:p.speed<18?clamp(p.speed+(gap-2)*1.7,-9,72):clamp(p.speed+6+gap*.1,30,g.difficulty==='easy'?83:90);
    u.speed+=clamp(target-u.speed,p.speed<18?-38:-20,17)*dt;
    u.s+=u.speed*dt;
    const targetLane=clamp(p.lane+(u===h.units[0]?1.7:-1.7),-5.2,5.2);u.lane+=(targetLane-u.lane)*Math.min(1,dt*1.5);
    if(gap<58)allBehind=false;
    if(Math.abs(u.s-p.s)<8&&u.stun<=0){nearby=true;if(p.speed>12&&Math.abs(u.lane-p.lane)<2.6&&u.cooldown<=0){u.attack=.4;u.attackSide=p.lane>u.lane?1:-1;u.cooldown=3.7;damage(g,9,u.name+' 逼停',{combat:true});}}
  }
  if(h.active){
    h.escape=allBehind&&p.speed>52?h.escape+dt:Math.max(0,h.escape-dt*.65);
    if(h.escape>=5||activeCount===0){h.active=false;h.escape=0;h.arrest=0;h.cooldown=14;h.evaded++;h.heat=Math.max(5,h.heat-38);h.units.forEach(u=>u.active=false);p.nitro=clamp(p.nitro+20,0,100);emit(g,'evaded','成功甩开巡警 · +20 氮气');}
    if(nearby&&p.speed<10)h.arrest=clamp(h.arrest+dt/2.8,0,1);else h.arrest=Math.max(0,h.arrest-dt*.8);
    if(h.arrest>=1&&g.phase==='racing'){g.phase='finished';emit(g,'finish','busted');return;}
  }else h.arrest=0;
  const length=g.route==='forest'?5600:g.route==='city'?4200:4800;
  if(h.heat>=65&&p.s>=h.nextBlock&&p.s<length-650&&!h.roadblocks.some(b=>!b.passed)){
    const gaps=[0,4.5,-4.5],gapLane=gaps[h.blockCount%3];h.blockCount++;
    const b={s:p.s+380,gapLane,lanes:[-3.6,0,3.6].filter(l=>Math.abs(l-gapLane)>2.5),passed:false,hit:false};h.roadblocks.push(b);h.nextBlock=p.s+950;emit(g,'roadblock',gapLane);
  }
  for(const b of h.roadblocks){
    if(b.passed)continue;
    if(Math.abs(p.s-b.s)<4.5&&b.lanes.some(l=>Math.abs(l-p.lane)<2.45)&&!b.hit){b.hit=true;damage(g,28,'撞上警察路障');}
    if(p.s>b.s+10){b.passed=true;if(!b.hit){h.heat=Math.max(0,h.heat-10);p.nitro=clamp(p.nitro+12,0,100);emit(g,'blockCleared','穿过路障缺口 · +12 氮气');}}
  }
}
