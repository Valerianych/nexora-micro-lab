import assert from 'node:assert/strict';
import {createSave,parseSave,installSave,normalizeStudy,ensureRecord,reportHtml,BACKUP_KEY} from './learning-record.js';
import {PROGRESS_KEY,writeProgress} from './progress.js';
import {reflections,checkReflection,threadLead,threadClues} from './case-reflections.js';

const progress={version:1,game:{started:true,activeCase:'002',unlockedCases:['001','002'],completedCases:['001'],skills:['circuit'],caseOne:{transferDone:true}},workshop:{activeIndex:3,mode:'repair',drafts:{'0-transfer':{code:'int ledPin = 12;',wires:[{a:'uno:12',b:'r:1',color:'#e04f50'}],positions:{led:{x:300,y:50}}},3:{code:'void setup() {}\nvoid loop() {}',wires:[]}}},espWorkshop:{9:{code:'// ESP32 draft',wires:[],inputs:{battery:4.1},learning:{page:1}}},electricity:{page:2,solved:[true,true,false,false]},study:{profile:{name:'Студент <script>',group:'П-240'},cases:{}}};
assert.deepEqual(parseSave(createSave(progress)).progress,{...progress,study:normalizeStudy(progress.study)});
for(const source of ['{broken','{}',JSON.stringify({format:'nexora-save',version:99,progress}),JSON.stringify({format:'nexora-save',version:1,progress:{version:2}})])assert.throws(()=>parseSave(source));
assert.throws(()=>parseSave('{"format":"nexora-save","version":1,"progress":{"version":1,"game":{"__proto__":{"x":1}}}}'));
assert.throws(()=>parseSave(' '.repeat(2*1024*1024+1)));
const saved=new Map([[PROGRESS_KEY,JSON.stringify(progress)]]),storage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)};
const alternate={...progress,game:{...progress.game,score:77}};
installSave(storage,alternate);assert.equal(JSON.parse(saved.get(PROGRESS_KEY)).game.score,77);assert.deepEqual(JSON.parse(saved.get(BACKUP_KEY)),progress);
const before=saved.get(PROGRESS_KEY);assert.throws(()=>installSave({getItem:storage.getItem,setItem(){throw Error('quota');}},progress));assert.equal(saved.get(PROGRESS_KEY),before);
globalThis.__nexoraProgressReplacing=true;assert.equal(writeProgress('game',{score:0},storage),false);assert.equal(saved.get(PROGRESS_KEY),before);delete globalThis.__nexoraProgressReplacing;
const study=normalizeStudy();const now=Date.now(),record=ensureRecord(study,'001',now);record.activeMs=45*60000;record.errors.push({message:'Ошибка',at:now});
const restored=normalizeStudy(study);assert.equal(restored.cases['001'].startedAt,now);assert.equal(restored.cases['001'].activeMs,45*60000);assert.equal(restored.cases['001'].errors[0].at,now);
for(const [id,task] of Object.entries(reflections)){assert(checkReflection(id,String(task.answer),task.correct));assert(!checkReflection(id,String(task.answer),-1));assert(!checkReflection(id,String(task.answer+1),task.correct));assert(!checkReflection(id,'Infinity',task.correct));}
assert(checkReflection('009','6,6',2));assert(!checkReflection('missing','1',0));
assert(!threadLead('002',[]).includes(threadClues['002']));assert(threadLead('003',['001','002']).includes(threadClues['002']));
const report=reportHtml(progress,[{id:'001',title:'Тест <img>'},{id:'002',title:'Сирена'}]);assert(!report.includes('<script>'));assert(report.includes('&lt;script&gt;'));assert(report.includes('&lt;img&gt;'));assert(report.includes('int ledPin'));assert(report.includes('Перенос маяка на D12'));assert(report.includes('void setup()'));
console.log('PASS portable saves, both board drafts, corruption/size/version checks, backup and reload guard, time records, every transfer question, story progression and report escaping.');
