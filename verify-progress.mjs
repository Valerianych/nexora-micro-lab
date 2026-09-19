import assert from 'node:assert/strict';
import {readProgress,writeProgress,restoreGame,serializeGame,restoreWorkshop,PROGRESS_KEY} from './progress.js';
import {loopTrace,analyzeSiren} from './case-two.js';

const memory = new Map();
const storage = {getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)};
const game = {
  started:true,activeCase:'002',completedCases:new Set(['001']),unlockedCases:new Set(['001','002']),
  skills:new Set(['circuit','variables','types','conditions']),room:'server',unlocked:new Set(['briefing','workshop','server']),
  completed:new Set(),score:155,introDone:true,case2Stage:4,case2Reached:4,traceComplete:true,traceStep:8,traceBound:2,
  observation:{count:2,series:2,durations:[.2,.2,.2,1.2]},view:'workbench',workbenchIndex:3,workbenchMode:'repair',
  journal:[{title:'Наблюдение',text:'Две вспышки.'}],reports:{'001':[{title:'Финал',text:'Кнопка работает.'}]},clues:['два импульса'],inventory:['запись сигнала'],
};
assert.equal(writeProgress('game',serializeGame(game),storage),true);
const wire={a:'uno:13',b:'r:1',color:'#e04f50'};
const code='void setup() {}\nvoid loop() { for (int i=0; i<3; i++) {} }';
writeProgress('workshop',{activeIndex:3,mode:'repair',drafts:{3:{code,wires:[wire],step:2,breadboard:false},'3-observe':{code:'original',wires:[],step:0}},completed:[0,1,2]},storage);
const restored = restoreGame(readProgress(storage).game);
assert.equal(restored.case2Stage,4);
assert.equal(restored.view,'workbench');
assert.equal(restored.traceComplete,true);
assert.ok(restored.completedCases.has('001'));
assert.ok(restored.unlockedCases.has('002'));
assert.equal(restored.reports['001'][0].text,'Кнопка работает.');
const workshop = restoreWorkshop(readProgress(storage).workshop,new Set(['uno:13','r:1']),6);
assert.equal(workshop.drafts[3].code,code);
assert.deepEqual(workshop.drafts[3].wires,[wire]);
assert.equal(workshop.drafts[3].step,2);
assert.equal(workshop.drafts['3-observe'].code,'original');
// A story save must preserve a separately written code draft, and vice versa.
writeProgress('game',{...serializeGame(game),case2Stage:5,final:true,completedCases:['001','002']},storage);
assert.equal(readProgress(storage).workshop.drafts[3].code,code);
assert.ok(restoreGame(readProgress(storage).game).unlockedCases.has('003'));
memory.set(PROGRESS_KEY,'{broken');assert.deepEqual(readProgress(storage),{});
assert.equal(writeProgress('game',serializeGame(game),storage),true);
assert.equal(writeProgress('game',{}, {getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}}),false);
assert.deepEqual(readProgress({getItem(){throw Error('blocked');}}),{});
assert.equal(restoreGame({activeCase:'002',unlockedCases:['001']}),null);
const invalid = restoreWorkshop({drafts:{3:{code,wires:[wire,{a:'missing',b:'r:1'},null],step:999}}},new Set(['uno:13','r:1']),6);
assert.deepEqual(invalid.drafts[3].wires,[wire]);
assert.equal(invalid.drafts[3].step,0);
for(const bound of [2,3]){
  const trace=loopTrace(bound);
  assert.equal(trace.at(-1).pulses,bound);
  assert.deepEqual(trace.filter(s=>s.part==='body').map(s=>s.i),Array.from({length:bound},(_,i)=>i));
  assert.equal(trace.at(-2).part,'test');
}
assert.equal(analyzeSiren([]).stable,false);
console.log('PASS progress merge, reload, closed cases, journal, drafts, blocked/corrupt storage and loop teaching model.');
