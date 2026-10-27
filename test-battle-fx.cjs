const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
let immediate=true,timers=[],elements={},sounds=[];
const node=()=>({innerHTML:'',textContent:'',style:{},hidden:true,classList:{add(){},remove(){},toggle(){}},remove(){},append(){},querySelector(){return{focus(){}}}});
const document={querySelector:q=>elements[q]||(elements[q]=node()),createElement:node,body:node(),addEventListener(){}};
const ctx={document,console,ASSETS:{},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},window:{addEventListener(){},matchMedia:()=>({matches:false})},setInterval:()=>1,clearInterval(){},setTimeout:fn=>{if(immediate)fn();else timers.push(fn);return 1},clearTimeout(){}};
vm.createContext(ctx);
for(const f of ['catalog','engine','art','sound','app']){vm.runInContext(fs.readFileSync('src/'+f+'.js','utf8'),ctx);if(f==='art')vm.runInContext("art=()=>'<svg></svg>'",ctx)}
const run=s=>vm.runInContext(s,ctx),json=s=>JSON.parse(run('JSON.stringify('+s+')'));
ctx.fxSounds=sounds;
run("audio.se=kind=>fxSounds.push(kind);art=()=>'<svg></svg>'");
function setup(kind='power',boss=false){
 elements={};sounds.length=0;timers=[];
 run(`game=new QuestEngine();game.choose('fire');game.setTaskCount(10);s().tasks.fill('検証用課題');game.start('forest-0',100000);page='home';render();s().battle.team[0].kind='${kind}';s().battle.team[0].skill=KIND_INFO['${kind}'].name;s().battle.armed='fire';s().battle.deadline=Date.now()+300000;${boss?"s().battle.floor=2;game.loadEnemy();":''}`);
}
async function step(){assert(timers.length,'animation has a pending phase');timers.shift()();await Promise.resolve();await Promise.resolve();}
async function cancel(animation){run('skipAnimation()');while(timers.length)await step();await animation;}
(async()=>{
 // complete() may load the next enemy immediately; the presentation must keep the defeated one.
 setup();run('var view=battlePresentation();var event=game.complete()');
 assert.equal(run('view.enemyMax'),34);assert.equal(run('s().battle.enemyMax'),46);assert.equal(run('view.skill.kind'),'power');assert.equal(run('s().battle.armed'),null);
 const committed=json('s()');immediate=false;
 let animation=run('animateBattle(event,view)');assert(elements['#battlefx'].innerHTML.includes('skill-power'));assert.equal(run('busy'),true);assert.equal(elements['.battle-skip'].hidden,false);
 await cancel(animation);assert.equal(run('busy'),false);assert.deepEqual(json('s()'),committed);assert.deepEqual(sounds,['skill-power']);
 console.log('PASS: consumed skill and defeated enemy remain in the presentation; skipping skill does not repeat task, floor or rewards');
 // Skip while a hit is on screen, including old asynchronous callbacks.
 immediate=true;setup('guard');run('s().battle.armed=null;s().battle.enemy=s().battle.enemyMax=1000000;view=battlePresentation();event=game.complete()');
 const afterHit=json('s()');immediate=false;animation=run('animateBattle(event,view)');await step();await step();
 assert(elements['#battlefx'].innerHTML.includes('impact-fire'));assert.equal(parseFloat(elements['.enemy-hp i'].style.width),run('(view.enemy-event.parts[0].damage)/view.enemyMax*100'));
 assert.equal(elements['.enemy-info > small'].textContent,run('(view.enemy-event.parts[0].damage).toLocaleString()+" / "+view.enemyMax.toLocaleString()'));
 await cancel(animation);assert.deepEqual(json('s()'),afterHit);assert.equal(run('busy'),false);assert(!sounds.includes('break'));
 console.log('PASS: each hit drains the visible enemy HP; stale hit callbacks cannot overwrite a skipped battle');
 // Every skill has its own cut-in, and ordinary enemies and bosses have different finales.
 for(const kind of ['power','heal','guard','pierce','drain','revive']){
  immediate=true;setup(kind);run('view=battlePresentation();event=game.complete()');immediate=false;animation=run('animateBattle(event,view)');
  assert(elements['#battlefx'].innerHTML.includes('skill-'+kind));assert.equal(sounds[0],'skill-'+kind);await cancel(animation);
 }
 for(const boss of [false,true]){
  immediate=true;setup('power',boss);run('view=battlePresentation();event=game.complete()');const finalState=json('s()');immediate=false;animation=run('animateBattle(event,view)');
  let guard=30;while(!elements['#battlefx'].innerHTML.includes('defeat-finale')&&guard--)await step();
  assert(guard>0);assert.equal(elements['#battlefx'].innerHTML.includes('boss-finale'),boss);assert(elements['#battlefx'].innerHTML.includes(boss?'DUNGEON CLEAR':'撃破'));assert(sounds.includes(boss?'finisher':'break'));
  await cancel(animation);assert.deepEqual(json('s()'),finalState);
 }
 console.log('PASS: six skill identities, normal defeat and boss clear; skipping finales preserves committed rewards');
 // Reduced motion keeps useful feedback with short waits; all tasks still complete once.
 immediate=true;setup('heal');run("window.matchMedia=()=>({matches:true});view=battlePresentation();event=game.complete()");const reducedState=json('s()');await run('animateBattle(event,view)');assert.deepEqual(json('s()'),reducedState);assert.equal(run('busy'),false);
 console.log('PASS: reduced-motion feedback completes without changing gameplay');
})().catch(e=>{console.error(e);process.exitCode=1});
