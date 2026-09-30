import assert from 'node:assert/strict';
import {blockPrograms,normalizeBlocks,blockProblem,generateBlockCode} from './program-blocks.js';
import {matchesAlarmPattern,alarmTimingHint} from './alarm-timing.js';
import {capstoneMission,espMissions} from './career-cases.js';
import {checkEsp} from './esp-checks.js';
import {solutions} from './verify-career.mjs';
import {restoreWorkshop} from './progress.js';

export const blockSolutions={
  arduino:{fields:{logic:'||',pause:'1000'},zones:{blink:['on','wait','off','gap'],setup:['led','button'],read:['voltage','temperature','button'],repeat:['blink'],tail:['pause'],idle:['off']}},
  esp32:{fields:{logic:'&&'},zones:{allowed:['voltage','tilt','return'],setup:['button','bus','pwm','camera'],read:['button'],start:['motor'],photos:['turn','wait','safety','capture'],finish:['stop'],remember:['remember']}},
};
export const readyProgram=kind=>normalizeBlocks(kind,{version:1,kind,...structuredClone(blockSolutions[kind])});

export async function verifyProgramBlocks(){
  for(const kind of Object.keys(blockPrograms)){
    assert(blockProblem(kind,null));
    const ready=readyProgram(kind);assert.equal(blockProblem(kind,ready),'');
    const code=generateBlockCode(kind,ready);assert.doesNotMatch(code,/\{(?:pause|logic)\}/);
    assert.equal(normalizeBlocks(kind,{...ready,fields:{logic:'injected();'}}).fields.logic,'');
    const zone=blockPrograms[kind].zones[0];
    const invalid=normalizeBlocks(kind,{...ready,zones:{...ready.zones,[zone.id]:['unknown',zone.blocks[0].id,zone.blocks[0].id]}});
    assert.equal(invalid.zones[zone.id].length,1);assert(blockProblem(kind,invalid));
    assert.deepEqual(normalizeBlocks(kind,JSON.parse(JSON.stringify(ready))),ready);
  }
  const ready=readyProgram('arduino'),code=generateBlockCode('arduino',ready);
  assert.match(code,/delay\(1000\)/);assert.match(code,/temperature >= 35 \|\| pressed/);
  const restored=restoreWorkshop({drafts:{8:{code,program:ready,independent:true}}},new Set(),14);
  assert.deepEqual(restored.drafts[8].program,ready,'block order and choices survive the production progress sanitizer');
  const pattern=capstoneMission.pattern,correct=[...pattern,...pattern];
  assert(matchesAlarmPattern(correct,pattern));
  const wrong=correct.map((v,i)=>i%pattern.length===5?1.3:v);
  assert.equal(matchesAlarmPattern(wrong,pattern),false,'150 ms + delay(1150) must fail');
  const hint=alarmTimingHint(wrong,pattern);
  for(const text of ['delay(150)','delay(1000)','150 + 1000 = 1150','1300'])assert(hint.includes(text),hint);
  assert.equal(matchesAlarmPattern(pattern,pattern),false,'wait for two complete series');
  assert.equal(matchesAlarmPattern(correct.map((v,i)=>i===0?.3:v),pattern),false);
  const esp=readyProgram('esp32'),mission=espMissions.find(m=>m.index===13),wires=solutions[13].wires;
  await checkEsp({mission,wires,source:generateBlockCode('esp32',esp)});
  await assert.rejects(checkEsp({mission,wires,source:generateBlockCode('esp32',{...esp,fields:{logic:'||'}})}),/3.4|запуск|услов|привод/i);
  await assert.rejects(checkEsp({mission,wires,source:generateBlockCode('esp32',{...esp,zones:{...esp.zones,photos:['capture','turn','wait','safety']}})}));
  console.log('PASS block validation, persistence, strict alarm timing, generated ESP32 mission and rejection of wrong logic/order');
}
if(process.argv[1]===new URL(import.meta.url).pathname)await verifyProgramBlocks();
