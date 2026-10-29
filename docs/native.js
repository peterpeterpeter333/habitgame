/* Optional iPhone capabilities. The browser game has no dependency on the native host. */
const QuestNative={
 get available(){return typeof window.webkit?.messageHandlers?.questNative?.postMessage==='function'},
 post(action,payload={}){if(!this.available)return false;try{window.webkit.messageHandlers.questNative.postMessage({action,...payload});return true}catch{return false}},
 speak(text){return this.post('speak',{text:String(text).slice(0,500)})},
 cancelSpeech(){return this.post('cancelSpeech')},
 exportBackup(json){return this.post('export',{json})},
 importBackup(){return this.post('import')},
 haptic(style='light'){return this.post('haptic',{style})},
 _reminderKey:'',
 syncBattle(b,voice){
  if(!this.available)return false;
  const active=b?.status==='active'&&voice===true&&Number.isFinite(b.deadline),key=active?`${b.deadline}:${b.index}:${b.mode}:${voice}`:'clear';
  if(key===this._reminderKey)return false;
  const sent=active?this.post('scheduleReminder',{seconds:Math.max(1,Math.ceil((b.deadline-Date.now())/1000)),title:'集中の時間を確認しましょう',body:'課題の制限時間になりました。ゲームに戻って進み具合を確認しましょう。'}):this.post('clearReminders');
  if(sent)this._reminderKey=key;
  return sent;
 }
};
