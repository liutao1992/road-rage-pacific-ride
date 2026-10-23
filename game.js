import * as THREE from './vendor/three.module.min.js';
import {ROUTES,clamp,lerp,roadAt,roadHeading,seeded,newRace,stepRace,attack,raceRank,formatTime} from './physics.js?v=2';
import {BackgroundMusic} from './music.js';

const $=id=>document.getElementById(id);
const canvas=$('world'), keys=new Set(), mobile=matchMedia('(pointer:coarse)').matches;
let renderer,scene,camera,world,playerBike,rivalBikes=[],trafficMeshes=[],policeBikes=[],roadblockModels=[],pickupModels=[],siren=null,sunLight,sky,sea;
let route='coast',game=newRace(),cameraMode=0,lastTime=0,accumulator=0,renderTime=0,menuS=145,toastUntil=0,impact=0,helpPrevious='menu',mapDirty=true;
let smoke=[],skidPool=[],skidCursor=0,sparkPool=[],sparkCursor=0,exhausts=[],disposed=false;
let frameNumber=0,lastCountdown='',audioEnabled=true,musicEnabled=true,engineAudio=null,audioContext=null,soundMaster=null,backgroundMusic=null;
const clock=new THREE.Clock(), vA=new THREE.Vector3(),vB=new THREE.Vector3(),vC=new THREE.Vector3(),dummy=new THREE.Object3D();
const materials=new Map(),geometries=new Map();
const quality={pixelRatio:Math.min(devicePixelRatio,mobile?1.4:1.75),shadow:mobile?1024:2048};
const shared={};
const curveFrame=(s,lane=0,y=0)=>{const p=roadAt(s,route),h=roadHeading(s,route);return new THREE.Vector3(p.x-Math.cos(h)*lane,p.y+y,p.z+Math.sin(h)*lane);};
const mat=(color,roughness=.8,metalness=0)=>{const key=`${color},${roughness},${metalness}`;if(!materials.has(key))materials.set(key,new THREE.MeshStandardMaterial({color,roughness,metalness}));return materials.get(key);};
function geo(type,...args){const k=type+args.join(',');if(!geometries.has(k))geometries.set(k,new THREE[type](...args));return geometries.get(k);}
function mesh(geometry,material,parent,x=0,y=0,z=0){const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;if(parent)parent.add(m);return m;}
function box(parent,sz,color,pos=[0,0,0],metal=0){return mesh(geo('BoxGeometry',...sz),mat(color,.6,metal),parent,...pos);}
function cylinder(parent,r1,r2,h,color,pos=[0,0,0],segments=10){return mesh(geo('CylinderGeometry',r1,r2,h,segments),mat(color,.65,.1),parent,...pos);}
function rod(parent,a,b,r,color){const delta=new THREE.Vector3().subVectors(b,a),m=cylinder(parent,r,r,delta.length(),color);m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return m;}
function canvasTexture(w,h,paint){const c=document.createElement('canvas');c.width=w;c.height=h;paint(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}
function labelTexture(lines,bg='#255b48',fg='#e8e7cb',w=512,h=256){return canvasTexture(w,h,(ctx)=>{ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);ctx.strokeStyle=fg;ctx.lineWidth=6;ctx.strokeRect(10,10,w-20,h-20);ctx.textAlign='center';ctx.fillStyle=fg;lines.forEach((txt,i)=>{ctx.font=`700 ${i===0?46:30}px Arial`;ctx.fillText(txt,w/2,65+i*60);});});}

function init(){
  try{
    renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
    renderer.setPixelRatio(quality.pixelRatio);renderer.setSize(innerWidth,innerHeight);
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
    scene=new THREE.Scene();scene.fog=new THREE.FogExp2(ROUTES.coast.fog,.00125);
    camera=new THREE.PerspectiveCamera(58,innerWidth/innerHeight,.15,5200);
    const ambient=new THREE.HemisphereLight(0xd6e3ef,0x5d5844,2.1);scene.add(ambient);
    sunLight=new THREE.DirectionalLight(0xffd7a4,3.1);sunLight.castShadow=true;
    sunLight.shadow.mapSize.set(quality.shadow,quality.shadow);Object.assign(sunLight.shadow.camera,{left:-55,right:55,top:65,bottom:-65,near:1,far:240});
    sunLight.shadow.bias=-.0003;sunLight.shadow.normalBias=.045;scene.add(sunLight);scene.add(sunLight.target);
    buildSky();buildEffects();buildWorld();bindEvents();
    $('loading').classList.add('hidden');requestAnimationFrame(loop);
  }catch(e){showError(e);}
}
function showError(e){console.error(e);$('loading').classList.add('hidden');$('errorText').textContent='3D 引擎无法启动。请开启浏览器硬件加速，使用新版 Chrome、Edge 或 Safari 重试。';$('error').classList.remove('hidden');}

function buildSky(){
  const skyMat=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{topColor:{value:new THREE.Color(0x648ba6)},horizonColor:{value:new THREE.Color(0xf4d2a4)},sunColor:{value:new THREE.Color(0xffd3a0)},sunDir:{value:new THREE.Vector3(.52,.13,.84).normalize()}},
    vertexShader:'varying vec3 vDirection; void main(){vDirection=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec3 vDirection; uniform vec3 topColor; uniform vec3 horizonColor; uniform vec3 sunColor; uniform vec3 sunDir;
      void main(){vec3 dir=normalize(vDirection);float h=max(dir.y,0.);vec3 col=mix(horizonColor,topColor,pow(h,.5));float s=max(dot(dir,sunDir),0.);col+=sunColor*pow(s,25.)*.22;col+=sunColor*pow(s,400.)*.6;col=mix(col,vec3(1.,.88,.64),smoothstep(.9995,.9998,s));gl_FragColor=vec4(col,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`});
  sky=new THREE.Mesh(new THREE.SphereGeometry(4000,32,16),skyMat);sky.frustumCulled=false;sky.renderOrder=-10;scene.add(sky);
  shared.asphalt=canvasTexture(512,512,(ctx,w,h)=>{const rng=seeded(17);ctx.fillStyle='#646661';ctx.fillRect(0,0,w,h);for(let i=0;i<65000;i++){let v=Math.floor(60+rng()*70);ctx.fillStyle=`rgba(${v},${v},${v-3},${rng()*.4})`;ctx.fillRect(rng()*w,rng()*h,1+rng()*2,1+rng()*2);}for(let i=0;i<13;i++){ctx.strokeStyle='#303b3518';ctx.lineWidth=1+rng()*2;ctx.beginPath();let x=rng()*w;ctx.moveTo(x,0);for(let z=0;z<h;z+=30){x+=(rng()-.5)*12;ctx.lineTo(x,z);}ctx.stroke();}});
  shared.asphalt.wrapS=shared.asphalt.wrapT=THREE.RepeatWrapping;shared.asphalt.anisotropy=renderer.capabilities.getMaxAnisotropy();
  shared.building=canvasTexture(256,512,(ctx,w,h)=>{ctx.fillStyle='#92908b';ctx.fillRect(0,0,w,h);const rng=seeded(213);for(let y=18;y<h;y+=36)for(let x=12;x<w;x+=38){ctx.fillStyle=rng()>.78?'#d4ba7b':'#384e56';ctx.fillRect(x,y,20,22);ctx.fillStyle='#b8b7a8';ctx.fillRect(x,y+22,23,3);}for(let i=0;i<1000;i++){ctx.fillStyle='#141b1610';ctx.fillRect(rng()*w,rng()*h,2,30);}});shared.building.wrapS=shared.building.wrapT=THREE.RepeatWrapping;
  shared.smoke=canvasTexture(64,64,ctx=>{const g=ctx.createRadialGradient(32,32,0,32,32,31);g.addColorStop(0,'rgba(224,221,203,.55)');g.addColorStop(.4,'rgba(224,221,203,.25)');g.addColorStop(1,'rgba(224,221,203,0)');ctx.fillStyle=g;ctx.fillRect(0,0,64,64);});
  shared.ground=canvasTexture(512,512,(ctx,w,h)=>{const rng=seeded(812);ctx.fillStyle='#b1b0a1';ctx.fillRect(0,0,w,h);for(let i=0;i<18000;i++){const n=95+rng()*90;ctx.fillStyle=`rgba(${n},${n},${n-8},${.08+rng()*.18})`;ctx.fillRect(rng()*w,rng()*h,1+rng()*7,1+rng()*7);}for(let i=0;i<100;i++){ctx.fillStyle=rng()>.5?'#6573530b':'#d8b8780c';ctx.beginPath();ctx.ellipse(rng()*w,rng()*h,10+rng()*30,4+rng()*12,rng()*6,0,Math.PI*2);ctx.fill();}});shared.ground.wrapS=shared.ground.wrapT=THREE.RepeatWrapping;shared.ground.anisotropy=8;
  shared.pine=canvasTexture(256,512,(ctx,w,h)=>{const rng=seeded(396);for(let y=40;y<500;y+=8){const width=(y/512)*112;for(let j=0;j<22;j++){const x=128+(rng()-.5)*width*2,yy=y+(rng()-.5)*20;ctx.strokeStyle=`rgb(${32+rng()*24},${55+rng()*32},${33+rng()*18})`;ctx.lineWidth=1+rng()*3;ctx.beginPath();ctx.moveTo(128,y-12);ctx.lineTo(x,yy+7);ctx.stroke();ctx.fillStyle=`rgba(${43+rng()*28},${63+rng()*42},${37+rng()*23},.85)`;ctx.beginPath();ctx.ellipse(x,yy,3+rng()*10,2+rng()*6,(rng()-.5)*1.5,0,Math.PI*2);ctx.fill();}}});
}

function roadSurface(start,end,offset,width,material,step=10,lift=0){
  const verts=[],uv=[],indices=[];let index=0;
  for(let s=start;s<=end+step*.5;s+=step){const d=Math.min(s,end),a=curveFrame(d,offset-width/2,lift),b=curveFrame(d,offset+width/2,lift);verts.push(a.x,a.y,a.z,b.x,b.y,b.z);uv.push(0,d/12,1,d/12);if(index>0){const k=index*2;indices.push(k-2,k-1,k,k-1,k+1,k);}index++;}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();const m=mesh(g,material,world);m.castShadow=false;return m;
}
function terrainHeight(s,off){
  const edge=Math.abs(off),base=roadAt(s,route).y;
  if(edge<11)return base-.12;
  const n=Math.sin(s*.018+off*.028)*Math.cos(s*.007-off*.02);
  if(route==='coast'){
    if(off<0)return lerp(base-1,-16,clamp((edge-11)/85,0,1))+n*Math.min(6,edge*.02);
    const valley=Math.exp(-(((s-1650)/140)**2))*clamp((edge-10)/30,0,1)*35;
    return base+Math.max(0,edge-14)*.25+Math.sin(s*.008+edge*.012)*Math.min(34,edge*.15)+n*Math.min(18,edge*.06)-valley;
  }
  if(route==='forest')return base+(edge-11)*.14+Math.sin(s*.012+off*.018)*Math.min(24,edge*.2)+n*Math.min(20,edge*.06);
  return base-.4+Math.sin(s*.004+off*.005)*Math.min(4,edge*.005);
}
function buildTerrain(){
  const positions=[],colors=[],uv=[],indices=[],offsets=[-2100,-1200,-700,-400,-220,-130,-80,-45,-25,-12,-9,0,9,12,25,45,80,130,220,400,700,1200,2100];
  const baseColor=new THREE.Color(ROUTES[route].ground),rock=new THREE.Color(route==='forest'?0x747765:0xa49979),rng=seeded(77);let rows=0;
  for(let s=-600;s<=ROUTES[route].length+1800;s+=25){
    for(const off of offsets){const p=curveFrame(s,off);p.y=terrainHeight(s,off);positions.push(p.x,p.y,p.z);uv.push(p.x/32,p.z/32);const c=baseColor.clone();const rocky=route==='coast'&&(off<-16&&off>-100||off>20&&off<90);if(rocky)c.lerp(rock,.55);c.multiplyScalar(1.1+rng()*.32+Math.sin(s*.006+off*.01)*.1);colors.push(c.r,c.g,c.b);}
    if(rows>0){for(let j=0;j<offsets.length-1;j++){const k=rows*offsets.length+j,p=k-offsets.length;indices.push(p,p+1,k,p+1,k+1,k);}}rows++;
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();const m=mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,map:shared.ground,bumpMap:shared.ground,bumpScale:.25,roughness:1}),world);m.castShadow=false;
  if(route==='coast'){
    const seaMat=new THREE.ShaderMaterial({transparent:false,uniforms:{time:{value:0},fogColor:{value:new THREE.Color(ROUTES[route].fog)}},vertexShader:'varying vec3 vWorld; void main(){vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',fragmentShader:`varying vec3 vWorld;uniform float time;uniform vec3 fogColor;void main(){float a=sin(vWorld.x*.16+vWorld.z*.06+time*.6);float b=sin(vWorld.x*.29-vWorld.z*.12-time*.45);float wave=a*b;vec3 col=mix(vec3(.06,.19,.23),vec3(.22,.4,.42),wave*.2+.45);float streak=pow(max(0.,sin(vWorld.x*.04+vWorld.z*.003+time*.1)),24.);col+=vec3(.45,.3,.12)*streak*.22;float dist=distance(cameraPosition,vWorld);col=mix(col,fogColor,1.-exp(-dist*.00065));gl_FragColor=vec4(col,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`});
    sea=mesh(new THREE.PlaneGeometry(22000,22000),seaMat,world,8500,-13,4000);sea.rotation.x=-Math.PI/2;sea.castShadow=false;
  }else sea=null;
}
function instanceBatch(geometry,material,items){
  if(!items.length)return;
  const inst=new THREE.InstancedMesh(geometry,material,items.length);items.forEach((it,i)=>{dummy.position.copy(it.pos);dummy.rotation.set(it.rx||0,it.rot||0,it.rz||0);dummy.scale.set(...(it.scale||[1,1,1]));dummy.updateMatrix();inst.setMatrixAt(i,dummy.matrix);if(it.color)inst.setColorAt(i,new THREE.Color(it.color));});inst.castShadow=true;inst.receiveShadow=true;world.add(inst);return inst;
}
function makeScenery(){
  const rng=seeded(ROUTES[route].seed),trunks=[],pineLow=[],pineMid=[],pineTop=[],rocks=[],poles=[],rails=[],grass=[],buildings=[],roadPosts=[];
  const total=ROUTES[route].length+1250;
  for(let s=-210;s<total;s+=7){
    if(s%21===0||Math.round(s)%3===0){for(const side of [-1,1]){const p=curveFrame(s,side*8.5,0);poles.push({pos:p.clone().add(new THREE.Vector3(0,.55,0)),scale:[.1,1.1,.12],rot:roadHeading(s,route)});}}
    if(s%14===0){for(const side of [-1,1]){const a=curveFrame(s,side*8.5,1.1),b=curveFrame(s+14,side*8.5,1.1),d=new THREE.Vector3().subVectors(b,a);rails.push({pos:a.add(b).multiplyScalar(.5),scale:[.16,.26,d.length()],rot:roadHeading(s+7,route),rx:-Math.atan2(d.y,14)});}}
    for(let j=0;j<(route==='forest'?5:3);j++){
      const side=rng()>.45?1:-1,sj=s+rng()*7;
      let off=side*(14+rng()*(route==='city'?35:210));
      if(route==='coast'&&off<-55)continue;
      const p=curveFrame(sj,off);p.y=terrainHeight(sj,off);const h=(route==='forest'?12:7)+rng()*(route==='forest'?18:11),rad=h*.18;
      if(route!=='city'&&(route==='forest'||rng()>.32)){
        trunks.push({pos:p.clone().add(new THREE.Vector3(0,h*.35,0)),scale:[h*.023,h*.7,h*.023],color:route==='forest'?0x56473a:0x625c47});
        const color=new THREE.Color(route==='forest'?0x284435:0x4e6041).multiplyScalar(.75+rng()*.5);
        const rotation=rng()*Math.PI;for(const [list,extra] of [[pineLow,0],[pineMid,Math.PI/3],[pineTop,Math.PI*2/3]])list.push({pos:p.clone().add(new THREE.Vector3(0,h*.6,0)),scale:[rad*2.8,h,1],rot:rotation+extra,color:new THREE.Color(0xdce0bb).multiplyScalar(.85+rng()*.25)});
      }
      if(rng()>.6&&route!=='city'){
        const r=.8+rng()*3.5;rocks.push({pos:p.clone(),scale:[r,r*.7,r*1.4],rot:rng()*6,color:new THREE.Color(0x929182).multiplyScalar(.8+rng()*.35)});
      }
    }
    if(route!=='city')for(let j=0;j<5;j++){
      const side=rng()>.5?1:-1,off=side*(9.4+rng()*8),sj=s+rng()*7,p=curveFrame(sj,off);p.y=terrainHeight(sj,off);grass.push({pos:p,scale:[.4+rng()*.5,.3+rng()*.9,.4+rng()*.5],rot:rng()*6,color:new THREE.Color(route==='coast'?0xa5a27b:0x7a875c).multiplyScalar(.75+rng()*.5)});
    }
    if(s%105===0){const p=curveFrame(s,8.9,1);roadPosts.push({pos:p,scale:[.2,1.8,.25],rot:roadHeading(s,route)});}
  }
  instanceBatch(geo('CylinderGeometry',1,1.25,1,7),mat(0xffffff),trunks);
  const needleMat=new THREE.MeshStandardMaterial({map:shared.pine,alphaTest:.45,side:THREE.DoubleSide,roughness:1});
  for(const list of [pineLow,pineMid,pineTop])instanceBatch(geo('PlaneGeometry',1,1),needleMat,list);
  instanceBatch(geo('DodecahedronGeometry',1,1),mat(0xffffff),rocks);
  instanceBatch(geo('BoxGeometry',1,1,1),mat(0x9c9e92,.65,.45),poles);
  instanceBatch(geo('BoxGeometry',1,1,1),mat(0xb6b6a2,.5,.6),rails);
  instanceBatch(geo('ConeGeometry',1,1,4),mat(0xffffff),grass);
  instanceBatch(geo('BoxGeometry',1,1,1),mat(0xe6ddc0),roadPosts);
  if(route==='city'){
    for(let s=-150;s<total;s+=42){for(const side of [-1,1])for(let row=0;row<2;row++){
      const off=side*(29+row*50+rng()*10),p=curveFrame(s+rng()*12,off);p.y=terrainHeight(s,off);const h=9+rng()*38,w=12+rng()*17,d=16+rng()*20;
      buildings.push({pos:p.clone().add(new THREE.Vector3(0,h/2,0)),scale:[w,h,d],rot:roadHeading(s,route),color:new THREE.Color(0xe6dfd1).multiplyScalar(.65+rng()*.5)});
      if(row===0&&rng()>.4){const roof=box(world,[w+.8,.4,d+.8],0x515650,[p.x,p.y+h+.2,p.z]);roof.rotation.y=roadHeading(s,route);}
    }}
    const buildingMat=new THREE.MeshStandardMaterial({map:shared.building,roughness:.9});instanceBatch(geo('BoxGeometry',1,1,1),buildingMat,buildings);
    for(let s=50;s<total;s+=72)makeStreetlight(s,s%144===50?1:-1);
    for(let s=300;s<total;s+=570)makeBillboard(s);
  }else{
    for(let s=180;s<total;s+=360){if(route==='coast'){makePalm(s,-17-rng()*8,12+rng()*5);makePalm(s+13,15+rng()*10,10+rng()*6);}if(s%720===180)makeHouse(s+90,route==='forest'?-25:30);}
    if(route==='coast')makeBridge(1540,1800);
  }
  for(let s=350;s<total;s+=650)makeSign(s);
  makeGantry(-10,false);makeGantry(ROUTES[route].length,true);
}
function makePalm(s,off,h){
  const p=curveFrame(s,off);p.y=terrainHeight(s,off);const group=new THREE.Group();group.position.copy(p);world.add(group);
  const trunk=cylinder(group,.18,.35,h,0x70644b,[0,h/2,0],9);trunk.rotation.z=.07;const top=new THREE.Vector3(-h*.07,h,0);
  for(let i=0;i<8;i++){const angle=i*Math.PI/4,points=[top.clone(),top.clone().add(new THREE.Vector3(Math.cos(angle)*2.2,.5,Math.sin(angle)*2.2)),top.clone().add(new THREE.Vector3(Math.cos(angle)*4.4,-1.5,Math.sin(angle)*4.4))];const curve=new THREE.CatmullRomCurve3(points);const leaf=mesh(new THREE.TubeGeometry(curve,6,.24,3,false),mat(0x465d3d),group);leaf.castShadow=false;}
}
function makeHouse(s,off){const p=curveFrame(s,off);p.y=terrainHeight(s,off);const g=new THREE.Group();g.position.copy(p);g.rotation.y=roadHeading(s,route);world.add(g);box(g,[10,5.5,12],route==='forest'?0x7b6d53:0xc0b18f,[0,2.75,0]);const roof=mesh(geo('ConeGeometry',8,3,4),mat(0x63544b),g,0,6.6,0);roof.rotation.y=Math.PI/4;for(const z of [-3,3])box(g,[.05,1.6,2],0x354d54,[off>0?-5.03:5.03,3,z]);box(g,[1.8,3,.1],0x4f584d,[0,1.5,-6.05]);}
function makeStreetlight(s,side){const p=curveFrame(s,side*10.5),g=new THREE.Group();g.position.copy(p);g.rotation.y=roadHeading(s,route);world.add(g);cylinder(g,.12,.17,10,0x676f6c,[0,5,0]);rod(g,new THREE.Vector3(0,10,0),new THREE.Vector3(-side*3,10.6,0),.1,0x747c77);const lamp=box(g,[1.2,.15,.6],0xdde1bd,[-side*3,10.6,0]);lamp.material=mat(0xf0dfb7);lamp.material.emissive=new THREE.Color(0xb89c52);lamp.material.emissiveIntensity=.6;}
function makeBillboard(s){const p=curveFrame(s,24,0),g=new THREE.Group();g.position.copy(p);g.rotation.y=roadHeading(s,route)-.15;world.add(g);cylinder(g,.18,.25,11,0x7a7f75,[0,5.5,0]);const tex=labelTexture(['FUEL THE REBELLION','ROAD RAGE  /  1996'],'#a95336','#e8dcc4',512,180);const panel=mesh(new THREE.PlaneGeometry(12,4.2),new THREE.MeshStandardMaterial({map:tex,side:THREE.DoubleSide,roughness:.8}),g,0,10.6,0);panel.rotation.y=Math.PI;}
function makeSign(s){const p=curveFrame(s,9.8,0),g=new THREE.Group();g.position.copy(p);g.rotation.y=roadHeading(s,route)+Math.PI;world.add(g);cylinder(g,.07,.08,4,0xa9ada0,[0,2,0],6);const remaining=Math.max(1,Math.ceil((ROUTES[route].length-s)/1000));const tex=labelTexture([route==='coast'?'PACIFIC COAST':route==='forest'?'SIERRA NEVADA':'CITY LIMITS',`FINISH  ${remaining} km`]);mesh(new THREE.PlaneGeometry(3.3,1.6),new THREE.MeshStandardMaterial({map:tex,side:THREE.DoubleSide}),g,0,3.6,0);if(route==='coast'){const tex2=labelTexture(['CALIFORNIA','1'],'#dedfcd','#354e43',256,256);mesh(new THREE.PlaneGeometry(.8,1),new THREE.MeshStandardMaterial({map:tex2,side:THREE.DoubleSide}),g,0,1.8,-.02);}}
function makeBridge(start,end){
  const color=0x946850;
  for(let s=start;s<=end;s+=26){for(const side of [-1,1]){const p=curveFrame(s,side*8,0);cylinder(world,.6,.9,22,0x938c75,[p.x,p.y-11,p.z],10);rod(world,curveFrame(s,side*7.5,0),curveFrame(s,side*7.5,6),.2,color);if(s<end){rod(world,curveFrame(s,side*7.5,6),curveFrame(s+26,side*7.5,6),.2,color);rod(world,curveFrame(s,side*7.5,0),curveFrame(s+26,side*7.5,6),.14,color);}}}
}
function makeGantry(s,finish){const g=new THREE.Group();g.position.copy(curveFrame(s));g.rotation.y=roadHeading(s,route);world.add(g);for(const side of [-1,1]){cylinder(g,.28,.3,7,0x777b70,[side*8,3.5,0]);box(g,[1.4,.6,1.2],0x969280,[side*8,.3,0]);}box(g,[16.4,.5,.55],0x6a726b,[0,7,0]);const tex=canvasTexture(1024,192,(ctx,w,h)=>{ctx.fillStyle='#172a31';ctx.fillRect(0,0,w,h);const cw=32;for(let y=0;y<2;y++)for(let x=0;x<w/cw;x++){ctx.fillStyle=(x+y)%2?'#e0dfce':'#23333a';ctx.fillRect(x*cw,y*cw,cw,cw);ctx.fillRect(x*cw,h-cw*(y+1),cw,cw);}ctx.fillStyle=finish?'#eee7cc':'#ff793b';ctx.font='italic 900 58px Arial';ctx.textAlign='center';ctx.fillText(finish?'FINISH  /  KEEP RIDING':'ROAD RAGE  /  PACIFIC RUN',w/2,116);});const banner=mesh(new THREE.PlaneGeometry(15,2.6),new THREE.MeshStandardMaterial({map:tex,side:THREE.DoubleSide}),g,0,6.1,0);banner.rotation.y=Math.PI;}

function batchStaticMeshes(){
  // Merge scenery by material and road section, preserving culling and shadows.
  world.updateMatrixWorld(true);const batches=new Map(),cached=new Set(geometries.values());
  world.traverse(o=>{
    if(!o.isMesh||o.isInstancedMesh||Array.isArray(o.material)||o.material.isShaderMaterial||o.material.vertexColors||o.geometry.attributes.position.count>5000)return;
    o.geometry.computeBoundingBox();const center=o.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(o.matrixWorld);
    const key=`${o.material.uuid}:${Math.floor(center.z/250)}:${o.castShadow}:${o.receiveShadow}`;
    if(!batches.has(key))batches.set(key,[]);batches.get(key).push(o);
  });
  for(const objects of batches.values()){
    if(objects.length<2)continue;const parts=objects.map(o=>{const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();g.applyMatrix4(o.matrixWorld);return g;});
    const merged=new THREE.BufferGeometry();for(const attr of ['position','normal','uv']){if(!parts.every(g=>g.attributes[attr]))continue;const size=parts[0].attributes[attr].itemSize,total=parts.reduce((n,g)=>n+g.attributes[attr].array.length,0),data=new Float32Array(total);let off=0;parts.forEach(g=>{data.set(g.attributes[attr].array,off);off+=g.attributes[attr].array.length;});merged.setAttribute(attr,new THREE.BufferAttribute(data,size));}
    const original=objects[0],combined=new THREE.Mesh(merged,original.material);combined.castShadow=original.castShadow;combined.receiveShadow=original.receiveShadow;world.add(combined);
    objects.forEach(o=>{o.removeFromParent();if(!cached.has(o.geometry))o.geometry.dispose();});parts.forEach(g=>g.dispose());
  }
}

function mergeLocalChildren(parent){
  const batches=new Map(),cached=new Set(geometries.values());
  for(const o of [...parent.children])if(o.isMesh&&!Array.isArray(o.material)){const key=o.material.uuid+o.castShadow;if(!batches.has(key))batches.set(key,[]);batches.get(key).push(o);}
  for(const parts of batches.values()){
    if(parts.length<2)continue;const gs=parts.map(o=>{o.updateMatrix();const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();return g.applyMatrix4(o.matrix);}),merged=new THREE.BufferGeometry();
    for(const attr of ['position','normal','uv']){if(!gs.every(g=>g.attributes[attr]))continue;const data=new Float32Array(gs.reduce((n,g)=>n+g.attributes[attr].array.length,0));let off=0;for(const g of gs){data.set(g.attributes[attr].array,off);off+=g.attributes[attr].array.length;}merged.setAttribute(attr,new THREE.BufferAttribute(data,gs[0].attributes[attr].itemSize));}
    const m=new THREE.Mesh(merged,parts[0].material);m.castShadow=parts[0].castShadow;m.receiveShadow=parts[0].receiveShadow;parent.add(m);parts.forEach(o=>{o.removeFromParent();if(!cached.has(o.geometry))o.geometry.dispose();});gs.forEach(g=>g.dispose());
  }
}

function buildWorld(){
  if(world){scene.remove(world);const uniqueGeos=new Set(),uniqueMats=new Set(),textures=new Set();world.traverse(o=>{if(o.geometry&&![...geometries.values()].includes(o.geometry))uniqueGeos.add(o.geometry);if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material])if(![...materials.values()].includes(m)){uniqueMats.add(m);if(m.map&&![...Object.values(shared)].includes(m.map))textures.add(m.map);}}});uniqueGeos.forEach(g=>g.dispose());uniqueMats.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());}
  world=new THREE.Group();scene.add(world);const r=ROUTES[route];scene.fog.color.setHex(r.fog);scene.fog.density=route==='forest'?.0018:.00115;
  sky.material.uniforms.topColor.value.setHex(route==='forest'?0x5d8b9b:route==='city'?0x738ba2:0x5a88a6);sky.material.uniforms.horizonColor.value.setHex(route==='forest'?0xc8d2b6:0xf1cfab);
  sunLight.color.setHex(r.sun);sunLight.intensity=route==='forest'?2.6:3.2;
  buildTerrain();const roadMat=new THREE.MeshStandardMaterial({map:shared.asphalt,color:0x777b76,roughness:.98});
  roadSurface(-600,r.length+1500,0,13.4,mat(route==='forest'?0x8a8b72:0xb8b195),10,.005);
  roadSurface(-600,r.length+1500,0,12.6,roadMat,10,.03);
  const white=mat(0xd6d8c7),yellow=mat(0xd9b85e);
  for(const off of [-5.95,5.95])roadSurface(-600,r.length+1500,off,.13,white,10,.049);
  for(const off of [-.12,.12])roadSurface(-600,r.length+1500,off,.11,yellow,10,.052);
  for(let s=-500;s<r.length+1200;s+=13){for(const side of [-1,1])roadSurface(s,s+4,side*3,.085,mat(0xe1dfcd),4,.05);}
  makeScenery();batchStaticMeshes();playerBike=createBike(0xe05b32,true);world.add(playerBike);rivalBikes=game.rivals.map(r=>{const b=createBike(r.color);world.add(b);return b;});
  trafficMeshes=game.traffic.map(t=>{const m=createVehicle(t);world.add(m);return m;});
  policeBikes=game.pursuit.units.map(()=>{const b=createBike(0xe1e5db);addPoliceLights(b.userData.body,1.42,-.9);box(b.userData.body,[.63,.42,.45],0x24324a,[0,.98,-.75]);world.add(b);b.visible=false;return b;});
  roadblockModels=Array.from({length:6},()=>{const group=new THREE.Group();for(let i=0;i<2;i++){const car=createVehicle({kind:'car',color:0x253349});addPoliceLights(car,1.98,0);box(car,[1.88,.5,1.4],0xe7e6db,[0,.95,0]);group.add(car);}world.add(group);group.visible=false;return group;});
  pickupModels=game.pickups.map(item=>{const group=new THREE.Group(),colors={chain:0xffb548,nitro:0x66ddec,repair:0x9de2a7},color=colors[item.type];const ring=mesh(geo('TorusGeometry',.68,.08,8,20),new THREE.MeshBasicMaterial({color}),group,0,1.6,0);const tex=labelTexture([item.type==='chain'?'CHAIN':item.type==='nitro'?'NITRO':'+ REPAIR'],'#172e35','#f3ead1',256,128);const label=mesh(new THREE.PlaneGeometry(2.2,1.1),new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide}),group,0,2.9,0);label.rotation.y=Math.PI;group.userData.ring=ring;world.add(group);return group;});
  menuS=route==='forest'?500:route==='city'?300:145;mapDirty=true;
  $('worldLabel').textContent=r.label;$('mapName').textContent=r.name;$('routeLength').textContent=(r.length/1000).toFixed(1);updateBest();
  updateScene(0,true);camera.position.copy(curveFrame(menuS-10,-7,4));camera.lookAt(curveFrame(menuS+10,2,2));
}

function createBike(color,isPlayer=false){
  const g=new THREE.Group(),body=new THREE.Group();g.add(body);g.userData.body=body;g.userData.wheels=[];
  const dark=0x1c2529,steel=0xa4a9a6;
  for(const z of [-.92,1.02]){
    const wheel=new THREE.Group();wheel.position.set(0,.48,z);body.add(wheel);
    const tire=mesh(geo('TorusGeometry',.37,.115,10,24),mat(0x202324,.96),wheel);tire.rotation.y=Math.PI/2;
    const hub=cylinder(wheel,.25,.25,.11,0x676d6d,[0,0,0],16);hub.rotation.z=Math.PI/2;
    const disc=cylinder(wheel,.2,.2,.012,steel,[.083,0,0],16);disc.rotation.z=Math.PI/2;
    for(let k=0;k<6;k++){const a=k*Math.PI/3;rod(wheel,new THREE.Vector3(.1,0,0),new THREE.Vector3(.1,Math.cos(a)*.25,Math.sin(a)*.25),.017,0xadb1a9);}
    g.userData.wheels.push(wheel);
  }
  for(const side of [-1,1]){
    rod(body,new THREE.Vector3(side*.16,.49,1.02),new THREE.Vector3(side*.16,1.35,.64),.046,steel);
    rod(body,new THREE.Vector3(side*.18,.49,-.92),new THREE.Vector3(side*.19,.8,-.25),.065,0x797e7b);
    rod(body,new THREE.Vector3(side*.18,.49,-.92),new THREE.Vector3(side*.18,1.08,-.34),.04,color);
    rod(body,new THREE.Vector3(side*.16,.75,-.1),new THREE.Vector3(side*.16,1.25,.6),.044,dark);
  }
  box(body,[.45,.48,.55],0x555e5c,[0,.79,-.02],.65);for(let i=0;i<5;i++)box(body,[.49,.023,.4],0xa0a39a,[0,.63+i*.075,-.02],.5);
  const tank=mesh(geo('SphereGeometry',1,16,10),mat(color,.35,.35),body,0,1.21,.25);tank.scale.set(.28,.26,.53);
  const fair=mesh(geo('SphereGeometry',1,16,10),mat(color,.4,.3),body,0,1.23,.83);fair.scale.set(.31,.38,.26);
  const glass=mesh(geo('SphereGeometry',1,12,8),new THREE.MeshStandardMaterial({color:0x8facb0,roughness:.16,metalness:.25,transparent:true,opacity:.65}),body,0,1.55,.88);glass.scale.set(.26,.24,.12);
  box(body,[.45,.13,.65],0x202528,[0,1.23,-.45]);const tail=box(body,[.45,.2,.38],color,[0,1.15,-.93]);tail.rotation.x=-.13;
  const lamp=box(body,[.28,.08,.04],0xff3f21,[0,1.15,-1.14]);lamp.material=new THREE.MeshStandardMaterial({color:0xfb4d2d,emissive:0xef2f0e,emissiveIntensity:2});
  const headlight=mesh(geo('SphereGeometry',.13,12,8),new THREE.MeshStandardMaterial({color:0xffedbb,emissive:0xffe1a1,emissiveIntensity:.7}),body,0,1.3,1.06);headlight.scale.set(1,1,.2);
  for(const side of [-1,1]){const ex=cylinder(body,.055,.075,.95,steel,[side*.26,.6,-.65],12);ex.rotation.x=Math.PI/2;rod(body,new THREE.Vector3(side*.17,1.43,.62),new THREE.Vector3(side*.43,1.5,.55),.032,dark);box(body,[.14,.04,.04],dark,[side*.44,1.48,.55]);}
  // Articulated rider, including arms that animate for directional attacks.
  const rider=new THREE.Group();body.add(rider);g.userData.rider=rider;
  const jacket=isPlayer?0x263d3e:color;
  const torso=mesh(geo('SphereGeometry',1,12,10),mat(jacket,.85),rider,0,1.73,-.2);torso.scale.set(.32,.48,.23);torso.rotation.x=.47;
  const back=box(rider,[.32,.43,.08],0x202e31,[0,1.77,-.42]);back.rotation.x=.4;
  rod(rider,new THREE.Vector3(-.13,1.35,-.5),new THREE.Vector3(-.35,.93,-.13),.12,0x28363c);rod(rider,new THREE.Vector3(.13,1.35,-.5),new THREE.Vector3(.35,.93,-.13),.12,0x28363c);
  for(const side of [-1,1]){rod(rider,new THREE.Vector3(side*.35,.93,-.13),new THREE.Vector3(side*.28,.65,-.48),.095,0x29373b);box(rider,[.18,.17,.32],0x1b272a,[side*.28,.62,-.35]);}
  const head=mesh(geo('SphereGeometry',.25,18,12),mat(isPlayer?0xd9d6bd:0xe3dcd1,.3,.2),rider,0,2.1,.12);head.scale.set(.95,1.05,1.02);head.rotation.x=.16;
  const visor=mesh(geo('SphereGeometry',.255,18,12,0,Math.PI*2,Math.PI*.3,Math.PI*.32),mat(0x263d43,.17,.6),rider,0,2.12,.14);visor.rotation.x=-.12;
  box(rider,[.09,.025,.38],isPlayer?color:0x3c5256,[0,2.36,.09]);
  const arms=[];
  for(const side of [-1,1]){const arm=new THREE.Group();arm.position.set(side*.24,1.94,-.08);rider.add(arm);rod(arm,new THREE.Vector3(),new THREE.Vector3(side*.12,-.31,.2),.09,jacket);rod(arm,new THREE.Vector3(side*.12,-.31,.2),new THREE.Vector3(side*.17,-.44,.66),.075,jacket);mesh(geo('SphereGeometry',.085,8,6),mat(0x26302f),arm,side*.17,-.44,.66);arms.push(arm);}
  g.userData.arms=arms;
  if(isPlayer){
    g.userData.chains=arms.map((arm,i)=>{const chain=new THREE.Group();const side=i===0?-1:1;arm.add(chain);for(let j=0;j<6;j++){const link=mesh(geo('TorusGeometry',.055,.018,5,8),mat(0xd0cbbb,.35,.8),chain,side*.17,-.44-j*.085,.66);link.rotation.y=j%2?Math.PI/2:0;}chain.visible=false;return chain;});
    g.userData.kicks=[-1,1].map(side=>{const leg=new THREE.Group();rod(leg,new THREE.Vector3(side*.18,1.2,-.2),new THREE.Vector3(side*1.12,.9,.2),.1,0x24383d);box(leg,[.28,.2,.34],0x18292d,[side*1.2,.9,.2]);body.add(leg);leg.visible=false;return leg;});
  }
  if(isPlayer){for(const side of [-1,1]){const flame=mesh(geo('ConeGeometry',.1,.8,8),new THREE.MeshBasicMaterial({color:0x91e3ff,transparent:true,opacity:.8,depthWrite:false}),body,side*.26,.6,-1.5);flame.rotation.x=-Math.PI/2;flame.visible=false;exhausts.push(flame);}}
  // Soft contact shadows keep every rider visually planted on the road.
  const shadowTex=shared.shadow||(shared.shadow=canvasTexture(64,128,ctx=>{ctx.scale(1,2);const gr=ctx.createRadialGradient(32,32,1,32,32,32);gr.addColorStop(0,'rgba(0,0,0,.6)');gr.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=gr;ctx.fillRect(0,0,64,64);}));
  const shadow=mesh(new THREE.PlaneGeometry(2,3.8),new THREE.MeshBasicMaterial({map:shadowTex,transparent:true,depthWrite:false}),g,0,.075,0);shadow.rotation.x=-Math.PI/2;shadow.castShadow=false;shadow.receiveShadow=false;
  mergeLocalChildren(body);mergeLocalChildren(rider);g.userData.wheels.forEach(mergeLocalChildren);g.userData.arms.forEach(mergeLocalChildren);
  return g;
}
function createVehicle(t){
  const g=new THREE.Group(),truck=t.kind==='truck',w=truck?2.25:1.85,len=truck?7:4.2;
  box(g,[w,.65,len],t.color,[0,.8,0],.25);
  if(truck){box(g,[2.15,2.6,4.2],0xc5c3ae,[0,2, -1.05]);box(g,[2.2,1.4,1.9],t.color,[0,1.75,2.2]);box(g,[1.8,.8,.04],0x34535b,[0,2.03,3.16]);for(let z=-3;z<1;z+=.5)box(g,[2.18,.035,.05],0x8f9388,[0,2.7,z]);}
  else{
    const cab=box(g,[1.6,.78,2.1],t.color,[0,1.46,-.2],.3);box(g,[1.45,.57,.035],0x34535b,[0,1.5,.88]);box(g,[1.45,.52,.035],0x34535b,[0,1.5,-1.27]);for(const side of [-1,1]){box(g,[.03,.53,1.73],0x34535b,[side*.812,1.5,-.2]);box(g,[.035,.6,.09],t.color,[side*.83,1.5,-.2]);box(g,[.16,.13,.25],0x3c4646,[side*1.02,1.32,.65]);}box(g,[1.9,.14,.12],0x92988d,[0,.68,2.1],.5);
  }
  const axles=truck?[-2.6,-1.6,2.25]:[-1.37,1.32];
  for(const z of axles)for(const side of [-1,1]){const wh=cylinder(g,truck?.47:.35,truck?.47:.35,.19,0x202726,[side*w*.51,.42,z],12);wh.rotation.z=Math.PI/2;const hub=cylinder(g,.17,.17,.2,0x929b95,[side*w*.52,.42,z],12);hub.rotation.z=Math.PI/2;}
  for(const side of [-1,1]){const front=box(g,[.4,.17,.06],0xffe6ac,[side*w*.35,truck?1.2:1.03,len/2+.025]);front.material=new THREE.MeshStandardMaterial({color:0xffe9bd,emissive:0xffc982,emissiveIntensity:.4});const back=box(g,[.3,.14,.05],0xd23c26,[side*w*.35,.95,-len/2-.025]);back.material=mat(0xe74029);}
  mergeLocalChildren(g);return g;
}
function addPoliceLights(parent,y,z){
  const lights=[];box(parent,[.9,.08,.25],0x182b35,[0,y,z]);
  for(const side of [-1,1]){const color=side<0?0xff3e35:0x42a4ff,m=box(parent,[.33,.14,.22],color,[side*.25,y+.1,z]);m.material=new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:2.5});lights.push(m);}
  parent.userData.policeLights=lights;
}
function flashPolice(parent,offset=0){const lights=parent.userData.policeLights;if(lights)lights.forEach((m,i)=>m.material.emissiveIntensity=(Math.floor(renderTime*6+offset)+i)%2?3.4:.1);}

function buildEffects(){
  for(let i=0;i<65;i++){const m=new THREE.Sprite(new THREE.SpriteMaterial({map:shared.smoke||null,color:0xd9d7c9,transparent:true,opacity:0,depthWrite:false}));m.visible=false;scene.add(m);smoke.push({mesh:m,life:0,max:1,velocity:new THREE.Vector3()});}
  for(let i=0;i<180;i++){const m=new THREE.Mesh(new THREE.PlaneGeometry(.12,1.5),new THREE.MeshBasicMaterial({color:0x222725,transparent:true,opacity:.6,depthWrite:false}));m.rotation.x=-Math.PI/2;m.visible=false;scene.add(m);skidPool.push({mesh:m,life:0});}
  for(let i=0;i<30;i++){const m=new THREE.Mesh(geo('SphereGeometry',.045,4,3),new THREE.MeshBasicMaterial({color:0xffb35c}));m.visible=false;scene.add(m);sparkPool.push({mesh:m,life:0,vel:new THREE.Vector3()});}
}
function emitSmoke(pos,strength=1){const p=smoke[frameNumber%smoke.length];p.mesh.material.map=shared.smoke;p.mesh.position.copy(pos);p.mesh.visible=true;p.life=p.max=.75+Math.random()*.5;p.velocity.set((Math.random()-.5)*2,.5+Math.random(),(Math.random()-.5)*2);p.mesh.scale.setScalar(.7*strength);}
function emitSparks(pos){for(let i=0;i<20;i++){const p=sparkPool[sparkCursor++%sparkPool.length];p.mesh.position.copy(pos);p.mesh.visible=true;p.life=.25+Math.random()*.5;p.vel.set((Math.random()-.5)*9,Math.random()*5,(Math.random()-.5)*8);}}
function updateEffects(dt){
  const p=game.player,active=game.phase==='racing';
  if(active&&p.drifting&&frameNumber%2===0){const pos=curveFrame(p.s-.9,p.lane,.25);emitSmoke(pos,1);for(const side of [-.13,.13]){const sk=skidPool[skidCursor++%skidPool.length];sk.mesh.position.copy(curveFrame(p.s-.9,p.lane+side,.065));sk.mesh.rotation.set(-Math.PI/2,0,-roadHeading(p.s,route)-p.heading);sk.mesh.visible=true;sk.life=15;}}
  if(active&&Math.abs(p.lane)>6.4&&p.speed>12&&frameNumber%4===0)emitSmoke(curveFrame(p.s-1,p.lane,.3),.8);
  for(const e of smoke)if(e.life>0){e.life-=dt;e.mesh.position.addScaledVector(e.velocity,dt);e.mesh.scale.addScalar(dt*1.6);e.mesh.material.opacity=clamp(e.life/e.max,0,1)*.38;if(e.life<=0)e.mesh.visible=false;}
  for(const sk of skidPool)if(sk.life>0){sk.life-=dt;sk.mesh.material.opacity=Math.min(.55,sk.life*.1);if(sk.life<=0)sk.mesh.visible=false;}
  for(const sk of sparkPool)if(sk.life>0){sk.life-=dt;sk.vel.y-=9*dt;sk.mesh.position.addScaledVector(sk.vel,dt);if(sk.life<=0)sk.mesh.visible=false;}
  for(const f of exhausts){f.visible=active&&p.boosting;f.scale.y=.7+Math.random()*.7;}
}
function animateBike(b,stats,dt,isPlayer=false){
  const body=b.userData.body;
  b.position.copy(curveFrame(stats.s,stats.lane,.09));b.rotation.y=roadHeading(stats.s,route)-(stats.heading||0);const ahead=roadAt(stats.s+1,route),behind=roadAt(stats.s-1,route);b.rotation.x=-Math.atan2(ahead.y-behind.y,2);
  body.rotation.z=-(stats.lean||Math.sin(stats.s*.008)*-.1);body.position.y=Math.sin(renderTime*35)*(stats.speed>5?.009:0);
  body.rotation.x=isPlayer&&stats.crashTimer>0?Math.sin(stats.crashTimer*18)*.09:0;
  if(stats.crashed>0){body.rotation.z=(stats.crashed>.25?1.2:stats.crashed*4.8);body.position.y=-.15;}
  b.userData.wheels.forEach(w=>{w.rotation.x+=stats.speed*dt/.47;});
  b.userData.arms.forEach((arm,i)=>{const side=i===0?1:-1;const on=stats.attack>0&&stats.attackSide===side;arm.rotation.z=on?side*Math.sin(stats.attack/.4*Math.PI)*1.5:lerp(arm.rotation.z,0,Math.min(1,dt*12));arm.rotation.y=on?-side*.7:0;});
  if(isPlayer){b.userData.chains.forEach(c=>c.visible=stats.weapon>0&&stats.attackType!=='kick');b.userData.kicks.forEach((leg,i)=>leg.visible=stats.attack>0&&stats.attackType==='kick'&&stats.attackSide===(i===0?1:-1));if(stats.blocking)b.userData.arms.forEach((arm,i)=>{arm.rotation.y=i?-.9:.9;arm.rotation.z=i?-.65:.65;});}
  if(isPlayer)b.visible=!(stats.invulnerable>0&&Math.floor(stats.invulnerable*14)%2===0);
}
function updateScene(dt,force=false){
  const menu=game.phase==='menu';
  if(menu){menuS+=dt*2.5;const s=menuS;animateBike(playerBike,{...game.player,s,lane:2,lean:-.04,speed:3},dt,true);
    rivalBikes.forEach((b,i)=>animateBike(b,{...game.rivals[i],s:s+35+i*19,lane:i%2?-2.5:2.4,speed:12},dt));
    trafficMeshes.forEach((m,i)=>{const t=game.traffic[i];m.position.copy(curveFrame(s+75+i*125,t.lane));m.rotation.y=roadHeading(s+75+i*125,route)+(t.speed<0?Math.PI:0);m.visible=i<12;});
  }else{
    animateBike(playerBike,game.player,dt,true);
    rivalBikes.forEach((b,i)=>{const r=game.rivals[i];b.visible=Math.abs(r.s-game.player.s)<1250;animateBike(b,r,dt);});
    trafficMeshes.forEach((m,i)=>{const t=game.traffic[i];m.position.copy(curveFrame(t.s,t.lane));m.rotation.y=roadHeading(t.s,route)+(t.speed<0?Math.PI:0);m.visible=Math.abs(t.s-game.player.s)<1500;});
  }
  policeBikes.forEach((b,i)=>{const u=game.pursuit.units[i];b.visible=!menu&&u.active;if(b.visible){animateBike(b,u,dt);flashPolice(b.userData.body,i);}});
  roadblockModels.forEach((group,i)=>{const block=game.pursuit.roadblocks[i];group.visible=!menu&&!!block&&Math.abs(block.s-game.player.s)<1000;if(group.visible)group.children.forEach((car,j)=>{car.position.copy(curveFrame(block.s,block.lanes[j]));car.rotation.y=roadHeading(block.s,route)+Math.PI/2;flashPolice(car,j);});});
  pickupModels.forEach((group,i)=>{const item=game.pickups[i];group.visible=!menu&&!item.collected&&Math.abs(item.s-game.player.s)<1100;if(group.visible){group.position.copy(curveFrame(item.s,item.lane,Math.sin(renderTime*3+i)*.16));group.rotation.y=roadHeading(item.s,route);group.userData.ring.rotation.y=renderTime*1.7;}});
  const s=menu?menuS:game.player.s,lane=menu?2:game.player.lane;
  const fast=!menu&&game.player.boosting;
  let target,look;
  if(menu){target=curveFrame(s-10,lane+6.8,3.5);look=curveFrame(s+6,lane+4.5,1.5);}
  else if(cameraMode===1){target=curveFrame(s-15,lane*.7,7);look=curveFrame(s+26,lane*.6,1.3);}
  else if(cameraMode===2){target=curveFrame(s+.45,lane,2.02);look=curveFrame(s+55,lane,1.7);}
  else {target=curveFrame(s-(fast?10:8.6),lane*.8,3.35+(game.player.speed/90)*.6);look=curveFrame(s+18+game.player.speed*.1,lane*.65,1.1);}
  if(!menu&&keys.has('KeyV')){target=curveFrame(s+5,lane,3.8);look=curveFrame(s-38,lane,1.6);}
  if(!menu&&game.player.crashTimer>0){target.x+=(Math.random()-.5)*game.player.crashTimer*.4;target.y+=(Math.random()-.5)*game.player.crashTimer*.3;}
  const follow=cameraMode===2?1:1-Math.exp(-dt*(menu?2.5:6));if(force)camera.position.copy(target);else camera.position.lerp(target,follow);
  if(!camera.userData.look||force)camera.userData.look=look.clone();else camera.userData.look.lerp(look,1-Math.exp(-dt*7));camera.lookAt(camera.userData.look);
  if(!menu&&cameraMode!==2)camera.rotateZ(game.player.lean*.045);
  const fov=menu?56:cameraMode===2?76:58+game.player.speed*.11+(fast?7:0);camera.fov=lerp(camera.fov,fov,Math.min(1,dt*3));camera.updateProjectionMatrix();
  const anchor=curveFrame(s+30,0,0);sunLight.position.copy(anchor).add(new THREE.Vector3(65,90,45));sunLight.target.position.copy(anchor);sunLight.target.updateMatrixWorld();sky.position.copy(camera.position);
  if(sea)sea.material.uniforms.time.value=renderTime;
}

function loop(now){
  if(disposed)return;requestAnimationFrame(loop);try{
    const realDt=lastTime?Math.min((now-lastTime)/1000,.05):.016;lastTime=now;renderTime+=realDt;frameNumber++;
    if(game.phase==='racing'||game.phase==='countdown'){
      accumulator+=realDt;while(accumulator>=1/120){stepRace(game,keys,1/120);for(const e of game.events)processEvent(e);accumulator-=1/120;}
      if(game.phase==='racing'){if(keys.has('KeyQ'))attackAndProcess(-1,'kick');else if(keys.has('KeyE'))attackAndProcess(1,'kick');else if(keys.has('KeyJ'))attackAndProcess(-1);else if(keys.has('KeyK'))attackAndProcess(1);}
    }else accumulator=0;
    if(game.phase==='menu'||game.phase==='racing'||game.phase==='countdown'||game.phase==='finished'){updateScene(realDt);updateEffects(realDt);}
    if(game.phase==='countdown'){const number=Math.ceil(game.countdown);if(String(number)!==lastCountdown){$('countdown').textContent=String(number);lastCountdown=String(number);playTone(280+number*40,.1,.15);}}
    if(frameNumber%3===0)updateHUD();updateAudio();
    if(toastUntil&&renderTime>toastUntil){$('toast').classList.remove('show');toastUntil=0;}
    impact=Math.max(0,impact-realDt*1.7);$('impact').style.opacity=impact;
    renderer.render(scene,camera);
  }catch(e){disposed=true;showError(e);}
}
function attackAndProcess(side,type){const before=game.events.length;attack(game,side,type);game.events.slice(before).forEach(processEvent);}
function toast(text){$('toast').textContent=text;$('toast').classList.add('show');toastUntil=renderTime+2.2;}
function processEvent(e){
  switch(e.type){
    case'go':$('countdown').textContent='GO!';$('countdown').classList.add('go');playTone(780,.2,.2);setTimeout(()=>$('countdown').classList.add('hidden'),750);toast('超速会引来巡警 · 赛道上的光环可以拾取');break;
    case'damage':impact=.7;emitSparks(curveFrame(game.player.s,game.player.lane,1));toast(e.value+' · 车况受损');playNoise(.25,.35);break;
    case'drift':toast(`干净漂移 +${e.value} · 出弯小喷！`);playTone(600,.1,.1);break;
    case'driftLost':toast('漂移中断 · 避免碰撞并留在柏油路上');break;
    case'blocked':toast('格挡成功 · 消耗体力减轻伤害');playTone(230,.08,.15);break;
    case'crash':toast('摔车！正在扶起摩托…');break;
    case'pickup':toast(({chain:'拾取铁链 · 8 次命中耐久',nitro:'氮气补给 +40',repair:'维修补给 · 车况 +28'})[e.value]);playTone(880,.16,.14);break;
    case'draft':case'evaded':case'blockCleared':toast(e.value);playTone(660,.2,.12);break;
    case'pursuit':case'reinforcement':toast(e.value);playTone(420,.25,.2);break;
    case'roadblock':toast(`前方 380 米警察路障 · 从${e.value===0?'中央':e.value>0?'右侧':'左侧'}缺口穿过`);playTone(250,.3,.18);break;
    case'hit':toast(`命中 ${e.value} · +7 氮气`);emitSparks(curveFrame(game.player.s,game.player.lane+game.player.attackSide,1.4));playNoise(.12,.3);break;
    case'knockout':toast(`${e.value} 已被击退！`);playNoise(.2,.4);break;
    case'swing':playNoise(.08,.08);break;
    case'nearMiss':toast('极限擦肩 · +5 氮气');playTone(530,.06,.08);break;
    case'finish':finishRace(e.value);break;
  }
}
function updateHUD(){
  if(game.phase==='menu')return;
  const p=game.player,r=ROUTES[route],rank=game.finishRank||raceRank(game);
  $('rank').textContent=rank;$('timer').textContent=formatTime(game.time);$('speed').textContent=String(Math.round(p.speed*3.6)).padStart(3,'0');$('gear').textContent=p.speed<1?'N':Math.min(6,1+Math.floor(p.speed/13));
  $('speedArc').style.strokeDasharray=`${clamp(p.speed*3.6/320*100,0,100)} 100`;
  $('healthText').textContent=Math.round(p.health)+'%';$('healthBar').style.width=p.health+'%';$('healthBar').style.background=p.health<30?'#ff6a32':'#d2e4c4';$('nitroText').textContent=Math.floor(p.nitro)+'%';$('nitroBar').style.width=p.nitro+'%';
  $('distance').textContent=`${Math.min(r.length/1000,Math.max(0,p.s/1000)).toFixed(2)} / ${(r.length/1000).toFixed(1)} km`;
  $('progress').style.width=clamp(p.s/r.length*100,0,100)+'%';
  $('rideState').textContent=p.boosting?'氮气全开':p.drifting?'侧滑过弯':Math.abs(p.lane)>6.35?'驶回公路':p.speed<5?'按 W 加速':'保持全油门';
  $('driftNotice').classList.toggle('hidden',!p.drifting);$('driftScore').textContent=Math.floor(p.drift);
  const h=game.pursuit,block=h.roadblocks.find(b=>!b.passed&&b.s>p.s-10);
  const stars=h.heat<34?0:h.heat<65?1:h.heat<85?2:3;$('wantedStars').textContent='★'.repeat(stars)+'☆'.repeat(3-stars);
  $('pursuitPanel').classList.toggle('chasing',h.active);$('heatBar').style.width=h.heat+'%';
  $('pursuitState').textContent=h.arrest>0?'正在拘捕！加速摆脱':h.active?'巡警追缉中':h.cooldown>0?'成功脱逃 · 保持距离':'公路巡逻中';
  $('pursuitHint').textContent=h.arrest>0?`拘捕进度 ${Math.round(h.arrest*100)}%`:block?`路障 ${Math.max(0,Math.ceil(block.s-p.s))}m · ${block.gapLane===0?'中央':block.gapLane>0?'右侧':'左侧'}缺口`:h.active?`脱逃 ${Math.min(100,Math.round(h.escape/5*100))}% · V 向后看`:'超速、逆行与攻击会提升通缉';
  $('arrestBar').style.width=h.arrest*100+'%';$('staminaBar').style.width=p.stamina+'%';$('staminaText').textContent=Math.round(p.stamina)+'%';
  $('weaponState').textContent=p.weapon>0?`铁链 ${p.weapon}/8`:'徒手';$('comboState').textContent=p.combo>1?`${p.combo} 连击`:p.draft>0?`尾流 ${Math.round(p.draft/3*100)}%`:'J/K 攻击 · Q/E 踢击';
  $('rideState').textContent=p.crashed>0?'倒地扶车':p.blocking?'格挡中':p.miniTurbo>0?'出弯小喷':p.boosting?'氮气全开':p.drifting?'侧滑过弯':Math.abs(p.lane)>6.35?'驶回公路':p.speed<5?'按 W 加速':'注意巡警与补给';
  const target=[...game.rivals,...h.units.filter(u=>u.active)].filter(r=>r.health>0&&!r.finished&&Math.abs(r.s-p.s)<12&&Math.abs(r.lane-p.lane)<4.2).sort((a,b)=>Math.abs(a.s-p.s)-Math.abs(b.s-p.s))[0];
  $('targetPanel').classList.toggle('hidden',!target);if(target){$('targetName').textContent=target.name;$('targetHealth').style.width=clamp(target.health/(target.police?110:100)*100,0,100)+'%';$('targetDirection').textContent=target.lane<p.lane?'← J / Q':'K / E →';}
  const positions=[...game.rivals.map(r=>({...r,me:false})),{name:'你',s:p.s,color:0xff6a32,me:true}].sort((a,b)=>b.s-a.s);
  let visible=positions.slice(0,4);if(rank>4)visible=[positions[0],...positions.slice(Math.max(1,rank-2),Math.min(8,rank+1))];
  $('leaderboard').innerHTML=visible.map(r=>`<div class="leader-row ${r.me?'me':''}"><b>${positions.indexOf(r)+1}</b><i class="dot" style="--rider-color:#${new THREE.Color(r.color).getHexString()}"></i><span>${r.name}</span><span>${r.me?'玩家':`${r.s-p.s>0?'+':''}${Math.round((r.s-p.s)/Math.max(15,p.speed))}s`}</span></div>`).join('');
  drawMinimap();
}
function drawMinimap(){
  const c=$('minimap'),ctx=c.getContext('2d'),w=c.width,h=c.height,len=ROUTES[route].length;
  ctx.clearRect(0,0,w,h);const pts=[];for(let s=0;s<=len;s+=35){const p=roadAt(s,route);pts.push({s,x:p.x,y:s});}
  const minX=Math.min(...pts.map(p=>p.x)),maxX=Math.max(...pts.map(p=>p.x)),scale=Math.min(130/(maxX-minX||1),142/len);
  const convert=s=>{const p=roadAt(s,route);return {x:w/2-(p.x-(minX+maxX)/2)*scale,y:161-s/len*141};};
  ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();pts.forEach((p,i)=>{const q=convert(p.s);if(i===0)ctx.moveTo(q.x,q.y);else ctx.lineTo(q.x,q.y);});ctx.strokeStyle='#192a35aa';ctx.lineWidth=9;ctx.stroke();ctx.strokeStyle='#e4e3cb80';ctx.lineWidth=2;ctx.stroke();
  ctx.beginPath();for(let s=0;s<=game.player.s;s+=25){const q=convert(s);if(s===0)ctx.moveTo(q.x,q.y);else ctx.lineTo(q.x,q.y);}ctx.strokeStyle='#ff8044';ctx.lineWidth=2;ctx.stroke();
  for(const r of game.rivals){const p=convert(clamp(r.s,0,len));ctx.fillStyle='#e5e9cf';ctx.beginPath();ctx.arc(p.x,p.y,2,0,Math.PI*2);ctx.fill();}
  for(const u of game.pursuit.units)if(u.active){const p=convert(clamp(u.s,0,len));ctx.fillStyle=Math.floor(renderTime*5)%2?'#ff6654':'#69b9ff';ctx.beginPath();ctx.arc(p.x+5,p.y,3,0,Math.PI*2);ctx.fill();}
  for(const block of game.pursuit.roadblocks)if(!block.passed){const p=convert(block.s);ctx.strokeStyle='#ff6750';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(p.x-5,p.y);ctx.lineTo(p.x+5,p.y);ctx.stroke();}
  const p=convert(clamp(game.player.s,0,len));ctx.fillStyle='#ff6a32';ctx.strokeStyle='#f2e6ca';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.fill();ctx.stroke();const f=convert(len);ctx.font='10px Arial';ctx.fillStyle='#f1ead2';ctx.fillText('⚑',f.x+7,f.y+3);
}

function startRace(){
  keys.clear();releaseTouch();game=newRace(route,$('difficulty').value);game.phase='countdown';accumulator=0;lastCountdown='';$('touchAttackMode').textContent='切换：拳击';
  $('menu').classList.add('hidden');$('hud').classList.remove('hidden');$('pauseModal').classList.add('hidden');$('resultModal').classList.add('hidden');$('touchControls').classList.remove('hidden');$('countdown').classList.remove('hidden','go');$('countdown').textContent='3';$('toast').classList.remove('show');document.body.classList.add('racing');
  for(const sk of skidPool){sk.mesh.visible=false;sk.life=0;}for(const s of smoke){s.mesh.visible=false;s.life=0;}
  if(!rivalBikes.length)buildWorld();updateScene(0,true);updateBest();updateHUD();if(audioEnabled)startAudio();
}
function setPaused(paused){
  if(paused){if(game.phase!=='racing'&&game.phase!=='countdown')return;game.previousPhase=game.phase;game.phase='paused';keys.clear();releaseTouch();$('pauseModal').classList.remove('hidden');$('touchControls').classList.add('hidden');$('resumeBtn').focus();}
  else{if(game.phase!=='paused')return;game.phase=game.previousPhase||'racing';$('pauseModal').classList.add('hidden');$('touchControls').classList.remove('hidden');lastTime=performance.now();if(audioEnabled)startAudio();}
}
function toMenu(){
  game=newRace(route,$('difficulty').value);keys.clear();releaseTouch();document.body.classList.remove('racing');$('menu').classList.remove('hidden');for(const id of ['hud','pauseModal','resultModal','countdown','touchControls','driftNotice'])$(id).classList.add('hidden');playerBike.visible=true;exhausts.forEach(f=>f.visible=false);menuS=route==='forest'?500:route==='city'?300:145;updateScene(0,true);$('startBtn').focus();
}
function showHelp(){
  if(!$('helpModal').classList.contains('hidden'))return;helpPrevious=game.phase;
  if(game.phase==='racing'||game.phase==='countdown'){game.helpPhase=game.phase;game.phase='help';keys.clear();releaseTouch();}
  $('helpModal').classList.remove('hidden');$('closeHelp').focus();
}
function hideHelp(){
  $('helpModal').classList.add('hidden');if(game.phase==='help'){game.phase=game.helpPhase||'racing';lastTime=performance.now();if(audioEnabled)startAudio();}else if(game.phase==='menu')$('startBtn').focus();else if(game.phase==='paused')$('resumeBtn').focus();
}
function finishRace(reason){
  keys.clear();releaseTouch();$('countdown').classList.add('hidden');$('touchControls').classList.add('hidden');$('driftNotice').classList.add('hidden');
  const completed=reason==='complete',p=game.player,rank=game.finishRank||raceRank(game),busted=reason==='busted';game.finishRank=rank;
  $('resultTitle').textContent=completed?(rank===1?'你，就是公路传奇。':'风景不错，再来一圈。'):'这次，公路赢了。';$('resultKicker').textContent=completed?'终点只是下一段路的开始':'车辆损毁 / 下次再战';$('resultRank').textContent=completed?rank:'—';$('resultSubtitle').textContent=completed?'已完成 '+ROUTES[route].name:'车况归零，比赛结束';$('resultTime').textContent=formatTime(game.time);$('resultSpeed').textContent=Math.round(p.topSpeed)+' km/h';$('resultDrift').textContent=p.driftTotal.toLocaleString();$('resultHits').textContent=p.hits;
  if(busted){$('resultTitle').textContent='被捕了，车手。';$('resultKicker').textContent='BUSTED / 巡警拦截成功';$('resultSubtitle').textContent='下次记得拉开与巡警的距离';}
  $('resultEvades').textContent=game.pursuit.evaded;$('resultKnockouts').textContent=p.knockouts;
  const key=`road-rage-best-v2-${route}-${game.difficulty}`;let best=null;try{best=Number(localStorage.getItem(key))||null;if(completed&&(!best||game.time<best)){localStorage.setItem(key,String(game.time));$('recordNote').textContent='新纪录！已保存在当前浏览器。';}else $('recordNote').textContent=best?'本地最佳 '+formatTime(best):'每一道弯，都是下一次的经验。';}catch{$('recordNote').textContent='当前浏览器未允许保存记录。';}
  $('resultModal').classList.remove('hidden');$('raceAgain').focus();playTone(completed?660:180,.4,.13);
}
function updateBest(){try{const v=Number(localStorage.getItem(`road-rage-best-v2-${route}-${$('difficulty').value}`));$('bestTime').textContent='本地最佳 '+(v?formatTime(v):'—');}catch{$('bestTime').textContent='本地最佳 —';}}
function selectRoute(next){if(game.phase!=='menu'||!ROUTES[next]||route===next)return;route=next;game=newRace(route,$('difficulty').value);exhausts=[];buildWorld();document.querySelectorAll('.route').forEach(b=>{const sel=b.dataset.route===route;b.classList.toggle('selected',sel);b.setAttribute('aria-pressed',sel?'true':'false');b.querySelector('em').textContent=sel?'已选择 ↗':'选择路线 ↗';});}
function releaseTouch(){document.querySelectorAll('[data-key]').forEach(b=>b.classList.remove('pressed'));}
function fullScreen(){if(document.fullscreenElement)document.exitFullscreen?.().catch(()=>{});else $('game').requestFullscreen?.().catch(()=>toast('此浏览器暂不支持全屏'));}

function bindEvents(){
  $('startBtn').onclick=startRace;$('controlsBtn').onclick=showHelp;$('helpBtn').onclick=showHelp;$('closeHelp').onclick=hideHelp;$('helpDone').onclick=hideHelp;$('pauseBtn').onclick=()=>setPaused(true);$('resumeBtn').onclick=()=>setPaused(false);$('restartBtn').onclick=startRace;$('raceAgain').onclick=startRace;$('menuBtn').onclick=toMenu;$('resultMenu').onclick=toMenu;$('fullBtn').onclick=fullScreen;$('soundBtn').onclick=toggleSound;$('musicBtn').onclick=toggleMusic;
  $('touchAttackMode').onclick=()=>{game.player.attackMode=game.player.attackMode==='punch'?'kick':'punch';$('touchAttackMode').textContent=game.player.attackMode==='kick'?'切换：踢击':'切换：拳击';};
  $('brand').onclick=e=>{e.preventDefault();if(game.phase==='racing'||game.phase==='countdown')setPaused(true);else if(game.phase==='menu')return;else toMenu();};
  document.querySelectorAll('.route').forEach(b=>{b.setAttribute('aria-pressed',b.dataset.route==='coast'?'true':'false');b.onclick=()=>selectRoute(b.dataset.route);});$('difficulty').onchange=updateBest;
  window.addEventListener('keydown',e=>{
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();
    if(e.target.tagName==='SELECT')return;
    if(!e.repeat){
      if(e.code==='Escape'){if(!$('helpModal').classList.contains('hidden'))hideHelp();else setPaused(game.phase!=='paused');return;}
      if(e.code==='KeyH'){if($('helpModal').classList.contains('hidden'))showHelp();else hideHelp();return;}
      if(e.code==='KeyM'){toggleSound();return;}if(e.code==='KeyB'){toggleMusic();return;}if(e.code==='KeyF'){fullScreen();return;}
      if(!$('helpModal').classList.contains('hidden'))return;
      if(e.code==='KeyP'){setPaused(game.phase!=='paused');return;}
      if(e.code==='KeyR'&&game.phase!=='menu'){startRace();return;}
      if(e.code==='KeyC'&&game.phase!=='menu'){cameraMode=(cameraMode+1)%3;toast(['追逐镜头','高位追逐','车手视角'][cameraMode]);return;}
      if(e.code==='Enter'&&game.phase==='menu'){e.preventDefault();startRace();return;}
      if(game.phase==='racing'&&['KeyJ','KeyK','KeyQ','KeyE'].includes(e.code))attackAndProcess(e.code==='KeyJ'||e.code==='KeyQ'?-1:1,e.code==='KeyQ'||e.code==='KeyE'?'kick':undefined);
    }
    if(game.phase==='racing'||game.phase==='countdown')keys.add(e.code);
  });
  window.addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='KeyL')game.player.blocking=false;});
  window.addEventListener('blur',()=>{keys.clear();releaseTouch();setPaused(true);});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){keys.clear();releaseTouch();setPaused(true);backgroundMusic?.setEnvironment(true,true);audioContext?.suspend().catch(()=>{});}else backgroundMusic?.setEnvironment(['paused','help'].includes(game.phase),false);});
  window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();setPaused(true);toast('图形上下文中断，请重新加载页面');});
  for(const b of document.querySelectorAll('[data-key]')){
    const key=b.dataset.key;const release=()=>{keys.delete(key);if(key==='KeyL')game.player.blocking=false;b.classList.remove('pressed');};
    b.addEventListener('pointerdown',e=>{e.preventDefault();if(game.phase!=='racing'&&game.phase!=='countdown')return;b.setPointerCapture(e.pointerId);keys.add(key);b.classList.add('pressed');if(game.phase==='racing'&&(key==='KeyJ'||key==='KeyK'))attackAndProcess(key==='KeyJ'?-1:1);});
    b.addEventListener('pointerup',release);b.addEventListener('pointercancel',release);b.addEventListener('lostpointercapture',release);b.addEventListener('contextmenu',e=>e.preventDefault());
  }
  // Keep keyboard navigation inside the currently visible dialog.
  window.addEventListener('keydown',e=>{if(e.code!=='Tab')return;const modal=[...document.querySelectorAll('.modal:not(.hidden)')].at(-1);if(!modal)return;const buttons=[...modal.querySelectorAll('button:not([disabled]),a,select')];if(!buttons.length)return;const first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}});
}
function startAudio(){
  try{
    if(!audioContext){audioContext=new(window.AudioContext||window.webkitAudioContext)();soundMaster=audioContext.createGain();soundMaster.gain.value=.32;soundMaster.connect(audioContext.destination);
      const engine=audioContext.createOscillator(),gain=audioContext.createGain(),filter=audioContext.createBiquadFilter();engine.type='sawtooth';filter.type='lowpass';filter.frequency.value=600;engine.connect(filter);filter.connect(gain);gain.connect(soundMaster);gain.gain.value=0;engine.start();
      const bass=audioContext.createOscillator(),bassGain=audioContext.createGain();bass.type='triangle';bass.connect(bassGain);bassGain.connect(soundMaster);bassGain.gain.value=.05;bass.start();engineAudio={engine,gain,filter,bass,bassGain};
      backgroundMusic=new BackgroundMusic(audioContext,soundMaster,new URL('./audio/pacific-rebellion.mp3',import.meta.url));backgroundMusic.setEnabled(musicEnabled);
      const osc=audioContext.createOscillator(),gainS=audioContext.createGain();osc.type='sine';osc.frequency.value=650;gainS.gain.value=0;osc.connect(gainS);gainS.connect(soundMaster);osc.start();siren={osc,gain:gainS};
    }audioContext.resume().catch(()=>toast('点击声音按钮，允许浏览器播放音频'));
    if(musicEnabled)backgroundMusic.start().catch(()=>{toast('背景音乐加载失败，可关闭再开启重试');});
  }catch{audioEnabled=false;$('soundState').textContent='关';$('soundBtn').setAttribute('aria-label','开启声音');$('soundBtn').setAttribute('aria-pressed','false');toast('当前浏览器不支持合成音效');}
}
function toggleSound(){audioEnabled=!audioEnabled;if(audioEnabled)startAudio();$('soundState').textContent=audioEnabled?'开':'关';$('soundBtn').setAttribute('aria-label',audioEnabled?'关闭声音':'开启声音');$('soundBtn').setAttribute('aria-pressed',String(audioEnabled));if(soundMaster&&audioContext)soundMaster.gain.setTargetAtTime(audioEnabled?.32:0,audioContext.currentTime,.1);}
function toggleMusic(){musicEnabled=!musicEnabled;if(musicEnabled&&audioEnabled)startAudio();backgroundMusic?.setEnabled(musicEnabled);$('musicState').textContent=musicEnabled?'开':'关';$('musicBtn').setAttribute('aria-label',musicEnabled?'关闭背景音乐':'开启背景音乐');$('musicBtn').setAttribute('aria-pressed',String(musicEnabled));}
function updateAudio(){if(!audioContext||!engineAudio)return;backgroundMusic?.setEnvironment(['paused','help'].includes(game.phase),document.hidden);if(!audioEnabled)return;const distance=Math.min(...game.pursuit.units.filter(u=>u.active).map(u=>Math.abs(u.s-game.player.s)),500);const pursuitSound=game.phase==='racing'&&distance<150;if(siren){siren.gain.gain.setTargetAtTime(pursuitSound?.085*(1-distance/170):0,audioContext.currentTime,.12);siren.osc.frequency.setTargetAtTime(Math.floor(renderTime*2.4)%2?960:620,audioContext.currentTime,.035);}
  const p=game.player,active=game.phase==='racing';const t=audioContext.currentTime,gear=Math.max(1,Math.min(6,Math.floor(p.speed/13)+1)),rpm=45+(p.speed%13)*6+gear*8;
  engineAudio.engine.frequency.setTargetAtTime(active?rpm:32,t,.09);engineAudio.filter.frequency.setTargetAtTime(active?350+p.speed*17:180,t,.1);engineAudio.gain.gain.setTargetAtTime(active?(keys.has('KeyW')?.09:.045):0,t,.1);engineAudio.bass.frequency.setTargetAtTime(active?rpm*.5:20,t,.1);engineAudio.bassGain.gain.setTargetAtTime(active?.035:0,t,.1);
}
function playTone(freq,duration,volume){if(!audioEnabled||!audioContext)return;const o=audioContext.createOscillator(),g=audioContext.createGain(),t=audioContext.currentTime;o.type='sine';o.frequency.value=freq;g.gain.setValueAtTime(volume,t);g.gain.exponentialRampToValueAtTime(.001,t+duration);o.connect(g);g.connect(soundMaster);o.start(t);o.stop(t+duration);}
function playNoise(duration,volume){if(!audioEnabled||!audioContext)return;const length=Math.floor(audioContext.sampleRate*duration),buffer=audioContext.createBuffer(1,length,audioContext.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<length;i++)data[i]=(Math.random()*2-1)*(1-i/length);const source=audioContext.createBufferSource(),gain=audioContext.createGain();source.buffer=buffer;gain.gain.value=volume;source.connect(gain);gain.connect(soundMaster);source.start();}

// A small read-only diagnostic surface makes runtime verification reproducible.
Object.defineProperty(window,'roadRage',{value:Object.freeze({getState:()=>({route,phase:game.phase,time:game.time,player:{...game.player},rank:raceRank(game),rivals:game.rivals.map(r=>({name:r.name,s:r.s,lane:r.lane})),traffic:game.traffic.map(t=>({s:t.s,lane:t.lane,speed:t.speed,kind:t.kind})),pursuit:JSON.parse(JSON.stringify(game.pursuit)),pickups:game.pickups.map(p=>({...p})),audio:{enabled:audioEnabled,sirenGain:siren?.gain.gain.value||0,sirenFrequency:siren?.osc.frequency.value||0,context:audioContext?.state||'not-started',masterGain:soundMaster?.gain.value||0,music:backgroundMusic?.getState()||{enabled:musicEnabled,loaded:false,playing:false}},render:renderer?{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries}:null})}),writable:false});
init();
