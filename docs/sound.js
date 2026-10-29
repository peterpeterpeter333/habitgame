class Soundscape{
 constructor(){this.ctx=null;this.ready=false;this.loop=null;this.step=0;this.bus=null}
 unlock(){try{const AC=window.AudioContext||window.webkitAudioContext;if(!AC){toast('このブラウザではBGMを再生できません。');return}if(!this.ctx){this.ctx=new AC();this.bus=this.ctx.createGain();this.bus.gain.value=.65;this.bus.connect(this.ctx.destination)}this.ctx.resume().catch(()=>{});this.ready=true;if(s().audio.bgm&&s().battle?.status==='active')this.start()}catch{toast('音声を開始できませんでした。')}}
 tone(f,t,d,v=.03,type='triangle',music=false){if(!this.ready)return;const o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=type;o.frequency.setValueAtTime(f,t);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(v,t+.012);g.gain.exponentialRampToValueAtTime(.0001,t+d);o.connect(g);g.connect(music?this.bus:this.ctx.destination);o.start(t);o.stop(t+d+.02)}
 start(){if(this.loop||!this.ready)return;this.step=0;this.loop=setInterval(()=>{const b=s().battle;if(!s().audio.bgm||b?.status!=='active'){this.stop();return}const boss=b.floor===b.floorCount-1,urgent=b.deadline-Date.now()<60000,minor=b.region==='volcano'||urgent,i=this.step++,t=this.ctx.currentTime;const roots=minor?[110,87.31,98,82.41]:[110,130.81,98,146.83],root=roots[Math.floor(i/16)%4],scale=minor?[1,1.5,2,2.378,2,1.5,1.335,1.5]:[1,1.5,2,2.378,2.67,2,1.5,1.335];this.tone(root*scale[i%8]*(boss?2:1),t,.24,boss?.022:.015,'triangle',true);if(i%2===0)this.tone(root/2,t,.43,.035,'sine',true);if(i%4===0){this.tone(root*2,t,.8,.008,'sine',true);this.tone(root*3,t,.8,.006,'sine',true)}if(boss||urgent)this.tone(i%4===0?55:110,t,.07,i%4===0?.04:.01,'sine',true)},250)}
 stop(){if(this.loop)clearInterval(this.loop);this.loop=null}
 duck(){if(this.bus)this.bus.gain.setTargetAtTime(.12,this.ctx.currentTime,.1)}
 restore(){if(this.bus)this.bus.gain.setTargetAtTime(.65,this.ctx.currentTime,.2)}
 se(kind){
  if(!this.ready||!s().audio.se)return;
  const t=this.ctx.currentTime,line=(frequencies,offset,step,duration,volume,type='triangle')=>frequencies.map((f,i)=>[f,offset+i*step,duration,volume,type]);
  // Layers stay quiet individually; SE bypasses the ducked music bus.
  const effects={
   charge:[...line([196,261.63,392],0,.045,.07,.014,'sine'),...line([783.99],.12,0,.12,.012)],
   attack:[...line([392,587.33,880,1318.51],0,.025,.055,.018),...line([146.83],0,0,.10,.018,'sine')],
   impact:[...line([94],0,0,.09,.04,'sine'),...line([293.66],.006,0,.06,.018),...line([1174.66],.015,0,.045,.009,'square'),...line([62],.05,0,.11,.025,'sine')],
   heavy:[...line([73],0,0,.17,.048,'sine'),...line([41],.02,0,.23,.032,'sine'),...line([1567.98],0,0,.035,.01,'square'),...line([293.66,146.83],.025,.045,.07,.014)],
   break:[...line([659.25,493.88,329.63],0,.045,.11,.021,'square'),...line([1318.51,1760,2093],.09,.035,.10,.01),...line([98],0,0,.12,.03,'sine'),...line([55],.065,0,.20,.028,'sine')],
   win:[...line([523.25,659.25,783.99,1046.5],0,.085,.18,.025),...line([261.63,329.63,392],.34,0,.42,.012,'sine'),...line([1567.98],.47,0,.27,.01)],
   'skill-power':[...line([164.81,220,329.63],0,.035,.075,.021,'sawtooth'),...line([440],.10,0,.13,.025,'square'),...line([88],.10,0,.17,.03,'sine')],
   'skill-heal':[...line([523.25,659.25,783.99],0,.065,.16,.021,'sine'),...line([1046.5],.13,0,.23,.013)],
   'skill-guard':[...line([196,293.66,392],0,0,.15,.018),...line([783.99],.13,0,.07,.014,'sine'),...line([196],.12,0,.15,.02,'sine')],
   'skill-pierce':[...line([880,1318.51,1760],0,.018,.04,.017,'square'),...line([220],.04,0,.09,.022,'sine'),...line([2637.02],.04,0,.06,.01)],
   'skill-drain':[...line([783.99,587.33,392],0,.04,.09,.019),...line([164.81],.10,0,.14,.025,'sine'),...line([329.63,493.88],.14,.055,.09,.012,'sine')],
   'skill-revive':[...line([261.63,392,523.25,783.99],0,.055,.13,.017,'sine'),...line([659.25,1046.5],.20,0,.26,.015)],
   combo:[...line([659.25,880,1174.66],0,.034,.07,.019,'square'),...line([293.66],0,0,.11,.02,'sine')],
   finisher:[...line([82.41,55],0,.035,.20,.039,'sine'),...line([1046.5,1567.98],.012,.025,.06,.013,'square'),...line([523.25,783.99,1046.5],.09,.045,.14,.017)]
  };
  const melodies={enter:[130.81,196,261.63],select:[523.25,659.25],bond:[261.63,392,523.25,659.25],boss:[82.41,110,164.81,220],drop:[523.25,659.25,783.99,1046.5],rise:[261.63,392,523.25,783.99,1046.5,1567.98],evolve:[261.63,392,523.25,659.25,783.99,1046.5,1318.51,1567.98],hurt:[180,105,60],heal:[392,523.25,659.25]};
  const cue=Object.hasOwn(effects,kind)?effects[kind]:Object.hasOwn(melodies,kind)?line(melodies[kind],0,['evolve','rise'].includes(kind)?.115:.055,kind==='evolve'?.7:.19,.045,kind==='hurt'?'sawtooth':'triangle'):effects.attack;
  for(const[f,offset,duration,volume,type]of cue)this.tone(f,t+offset,duration,volume,type);
 }

 speak(text){if(this.ready&&s().audio.voice&&typeof QuestNative!=='undefined'&&QuestNative.available){this.cancelSpeech();QuestNative.speak(text);return}if(!this.ready||!s().audio.voice||!window.speechSynthesis||!window.SpeechSynthesisUtterance)return;this.cancelSpeech();const u=new SpeechSynthesisUtterance(text);u.lang='ja-JP';u.rate=1.12;u.onstart=()=>{if(this.bus)this.bus.gain.setTargetAtTime(.14,this.ctx.currentTime,.05)};u.onend=u.onerror=()=>{if(this.bus)this.bus.gain.setTargetAtTime(.65,this.ctx.currentTime,.2)};window.speechSynthesis.speak(u)}
 cancelSpeech(){if(typeof QuestNative!=='undefined')QuestNative.cancelSpeech();window.speechSynthesis?.cancel();if(this.bus)this.bus.gain.setTargetAtTime(.65,this.ctx.currentTime,.05)}
}
