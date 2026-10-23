// Original instrumental composition: "Pacific Rebellion". No sampled music.
// Rebuild with: node scripts/generate-soundtrack.mjs
// Then encode the generated WAV with the ffmpeg command documented in README.
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const rate=32000,bpm=144,beat=60/bpm,bars=32,duration=bars*4*beat;
const frames=Math.round(rate*duration),left=new Float32Array(frames),right=new Float32Array(frames);
let seed=1996;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
const hz=midi=>440*2**((midi-69)/12);
function add(start,length,level,pan,synth){
  const at=Math.round(start*rate),count=Math.round(length*rate),l=Math.sqrt((1-pan)/2),r=Math.sqrt((1+pan)/2);
  for(let i=0;i<count;i++){const t=i/rate,v=synth(t,i,count)*level,j=(at+i)%frames;left[j]+=v*l;right[j]+=v*r;}
}
function power(start,midi,length,level,pan,detune=1){
  const notes=[hz(midi)*detune,hz(midi+7)*detune,hz(midi+12)*detune];
  add(start,length,level,pan,(t,i,n)=>{
    const attack=Math.min(1,t/.004),release=Math.min(1,(n-i)/rate/.035),env=attack*release*Math.exp(-t*3.5);
    let v=0;for(const f of notes)v+=Math.sin(2*Math.PI*f*t)+.45*Math.sin(2*Math.PI*f*2*t)+.18*Math.sin(2*Math.PI*f*3*t);
    return Math.tanh(v*1.8)*env*.56;
  });
}
function bass(start,midi,length){const f=hz(midi);add(start,length,.26,0,(t,i,n)=>{const env=Math.min(1,t/.006)*Math.min(1,(n-i)/rate/.035);return (Math.sin(2*Math.PI*f*t)+.25*Math.sin(2*Math.PI*f*2*t)+.1*Math.sin(2*Math.PI*f*3*t))*env*Math.exp(-t*.8);});}
function kick(start){add(start,.28,.74,0,t=>{const phase=2*Math.PI*(47*t+55*.018*(1-Math.exp(-t/.018)));return Math.sin(phase)*Math.exp(-t*20)+(rand()-.5)*Math.exp(-t*280)*.25;});}
function snare(start,level=.46){let previous=0;add(start,.21,level,.08,t=>{const n=rand()*2-1,noise=n-previous*.75;previous=n;return (noise*.55+Math.sin(2*Math.PI*183*t)*.35)*Math.exp(-t*25)*Math.min(1,t/.001);});}
function hat(start,open=false,level=.11){let prev=0;const length=open?.16:.055;add(start,length,level,-.25,t=>{const n=rand()*2-1,v=n-prev;prev=n;return v*Math.exp(-t*(open?22:85));});}
function crash(start){let prev=0;add(start,1.8,.2,.2,t=>{const n=rand()*2-1,v=n-prev*.9;prev=n;return v*Math.exp(-t*3.8);});}
function lead(start,midi,length){const f=hz(midi);add(start,length,.105,.25,(t,i,n)=>{const env=Math.min(1,t/.014)*Math.min(1,(n-i)/rate/.07);const vibrato=1+Math.sin(t*33)*.002;return Math.tanh((Math.sin(2*Math.PI*f*vibrato*t)+.3*Math.sin(2*Math.PI*f*2*t))*1.9)*env*Math.exp(-t*.9);});}

const roots=[40,40,43,45,40,38,36,38];
const leadPhrase=[76,79,76,74,71,74,76,71,79,81,79,76,74,76,71,69];
for(let bar=0;bar<bars;bar++){
  const start=bar*4*beat,root=roots[bar%8],section=Math.floor(bar/8);
  for(let eighth=0;eighth<8;eighth++){
    const t=start+eighth*beat/2,accent=eighth===0||eighth===4;
    const note=eighth===6&&bar%2===1?root+3:root;
    power(t,note,beat*(accent?.46:.35),accent?.23:.16,-.67,.998);
    power(t+.009,note,beat*(accent?.46:.35),accent?.21:.14,.67,1.003);
    bass(t,root-12,beat*.43);
    hat(t,eighth===7&&bar%4===3,eighth%2?.105:.075);
  }
  kick(start);kick(start+beat*2);if(bar%2===0)kick(start+beat*2.5);else kick(start+beat*3.5);
  snare(start+beat);snare(start+beat*3);
  if(bar%8===0)crash(start);
  if(bar%8===7){for(let i=0;i<4;i++)snare(start+beat*(3+i*.25),.19+i*.045);}
  if(section>=2){for(let i=0;i<4;i++){const note=leadPhrase[(bar%4)*4+i]+(section===3&&bar%8>3?-12:0);lead(start+i*beat,note,beat*.82);}}
}

// Short stereo echo adds room without smearing the rhythm; wrap the tail for looping.
const dryL=left.slice(),dryR=right.slice(),delay=Math.round(beat*.75*rate);
for(let i=0;i<frames;i++){const source=(i-delay+frames)%frames;left[i]+=dryR[source]*.11;right[i]+=dryL[source]*.11;}
let peak=0;for(let i=0;i<frames;i++){left[i]=Math.tanh(left[i]*1.15);right[i]=Math.tanh(right[i]*1.15);peak=Math.max(peak,Math.abs(left[i]),Math.abs(right[i]));}
const scale=.86/peak,bytes=frames*4,wav=Buffer.alloc(44+bytes);
wav.write('RIFF',0);wav.writeUInt32LE(36+bytes,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(2,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*4,28);wav.writeUInt16LE(4,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(bytes,40);
for(let i=0;i<frames;i++){wav.writeInt16LE(Math.round(left[i]*scale*32767),44+i*4);wav.writeInt16LE(Math.round(right[i]*scale*32767),46+i*4);}
const output=fileURLToPath(new URL('../dist/audio/pacific-rebellion.wav',import.meta.url));mkdirSync(fileURLToPath(new URL('../dist/audio',import.meta.url)),{recursive:true});writeFileSync(output,wav);
console.log(JSON.stringify({track:'Pacific Rebellion',bpm,bars,duration,sampleRate:rate,output}));
