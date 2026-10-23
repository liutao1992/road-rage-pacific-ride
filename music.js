export class BackgroundMusic {
  constructor(context,output,url){
    this.context=context;this.url=url;this.gain=context.createGain();this.gain.gain.value=0;this.gain.connect(output);
    this.source=null;this.buffer=null;this.loading=null;this.enabled=true;this.paused=false;this.hidden=false;this.error=null;
  }
  async load(){
    if(this.buffer)return this.buffer;if(this.loading)return this.loading;
    this.loading=(async()=>{const response=await fetch(this.url);if(!response.ok)throw new Error(`Music HTTP ${response.status}`);const bytes=await response.arrayBuffer();this.buffer=await this.context.decodeAudioData(bytes);return this.buffer;})();
    try{return await this.loading;}catch(error){this.error=error.message;throw error;}finally{this.loading=null;}
  }
  async start(){
    await this.load();if(this.source)return;
    const source=this.context.createBufferSource();source.buffer=this.buffer;source.loop=true;source.connect(this.gain);source.start();this.source=source;this.error=null;this.updateGain();
  }
  setEnabled(enabled){this.enabled=enabled;this.updateGain();}
  setEnvironment(paused,hidden){if(this.paused===paused&&this.hidden===hidden)return;this.paused=paused;this.hidden=hidden;this.updateGain();}
  updateGain(){const volume=this.hidden||!this.enabled?0:this.paused?.24:.7;this.gain.gain.cancelScheduledValues(this.context.currentTime);this.gain.gain.setTargetAtTime(volume,this.context.currentTime,.12);}
  getState(){return {enabled:this.enabled,loaded:!!this.buffer,playing:!!this.source&&this.context.state==='running',loop:this.source?.loop||false,duration:this.buffer?.duration||0,gain:this.gain.gain.value,error:this.error};}
  dispose(){if(this.source){this.source.stop();this.source.disconnect();this.source=null;}this.gain.disconnect();}
}
