import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { buildFirmware } from '@horang-corp/avr-gcc-wasm';
import { Emulator, inspectCircuit } from './engine.js';
import { missions } from './lessons.js';
import {analyzeSiren} from './case-two.js';

// Exercise the production compiler and emulator without starting a browser/server.
const fetchOriginal=globalThis.fetch;
globalThis.fetch=async(url,opts)=>String(url).startsWith('file:')?new Response(await fs.readFile(new URL(url)),{headers:{'Content-Type':String(url).endsWith('.wasm')?'application/wasm':'application/octet-stream'}}):fetchOriginal(url,opts);
const wires=[{a:'uno:13',b:'r:1'},{a:'r:2',b:'led:A'},{a:'led:C',b:'uno:GND.2'}];
assert.ok(inspectCircuit(wires).led);
assert.equal(inspectCircuit(wires.slice(0,2)).led,null);
assert.ok(inspectCircuit([{a:'uno:13',b:'led:A'},{a:'led:C',b:'uno:GND.2'}]).error);
assert.equal(inspectCircuit(wires.map(w=>({a:w.a,b:w.b==='led:A'?'led:C':w.b==='uno:GND.2'?'uno:GND.2':w.b}))).led,null);
const cathodeResistor=[{a:'uno:13',b:'led:A'},{a:'led:C',b:'r:2'},{a:'r:1',b:'uno:GND.2'}];assert.ok(inspectCircuit(cathodeResistor).led);
const bb=[{a:'uno:13',b:'bb:a1'},{a:'bb:e1',b:'r:1'},...wires.slice(1)];assert.ok(inspectCircuit(bb,false,true).led);assert.equal(inspectCircuit(bb,false,false).led,null);
assert.equal(inspectCircuit(bb.map(w=>({...w,a:w.a==='bb:e1'?'bb:f1':w.a})),false,true).led,null);
const built=[];
for(let i=0;i<missions.length;i++){
  let source=missions[i].code;
  if(i===1)source=source.replace('pauseMs = 500','pauseMs = 250');
  if(i===2)source=source.replace('LOW); // замени LOW','HIGH); // исправлено');
  if(i===3)source=source.replace('i < 2','i < 3');
  if(i===4)source=source.replace('{100, 250, 250}','{100, 250, 500}');
  if(i===5)source=source.replace('blink(200); // нужна вспышка 600 мс','blink(600);');
  const output=await buildFirmware({source:'#include <Arduino.h>\n'+source});assert.ok(output.fitsTarget);built.push(output.hex);
  const circuit=i===2?[...wires,{a:'uno:2',b:'button:1.l'},{a:'button:2.l',b:'uno:GND.2'}]:wires;
  const emu=new Emulator(output.hex,circuit);
  if(i===2){for(const pressed of [false,true,false,true,false]){emu.setButton(pressed);emu.advance(2000000);assert.equal(emu.led,pressed);}}
  else{
    const pattern=i===0?[.5,.5]:i===1?[.25,.25]:missions[i].pattern;
    emu.advance(Math.ceil((pattern.reduce((a,b)=>a+b,0)*2+.1)*16000000));
    const intervals=emu.transitions.slice(1).map((v,j)=>v.time-emu.transitions[j].time);
    assert.ok(intervals.length>=pattern.length*2-1,`enough transitions for ${i}`);
    assert.ok(intervals.every((v,j)=>Math.abs(v-pattern[j%pattern.length])<.025),`timing for ${i}: ${intervals}`);
  }
  assert.equal(emu.fault,null);console.log(`PASS mission ${i+1}: ${missions[i].name}`);
}
const noWire=new Emulator(built[0],wires.slice(0,2));noWire.advance(9000000);assert.equal(noWire.led,false);
// The new case observes a real defect, and only accepts two measured correct series.
const faultyFirmware=await buildFirmware({source:'#include <Arduino.h>\n'+missions[3].code});
const faultySiren=new Emulator(faultyFirmware.hex,wires);faultySiren.advance(4*16000000);
const observation=analyzeSiren(faultySiren.transitions);
assert.equal(observation.stable,true);assert.equal(observation.snapshot.count,2);assert.equal(observation.repaired,false);
const repairedSiren=new Emulator(built[3],wires);repairedSiren.advance(2*16000000);
assert.equal(analyzeSiren(repairedSiren.transitions).stable,false,'one series is insufficient');
repairedSiren.advance(3*16000000);assert.equal(analyzeSiren(repairedSiren.transitions).repaired,true);
const wrongTiming=await buildFirmware({source:'#include <Arduino.h>\n'+missions[3].code.replace('i < 2','i < 3').replaceAll('delay(200)','delay(300)')});
const wrongSiren=new Emulator(wrongTiming.hex,wires);wrongSiren.advance(7*16000000);
assert.equal(analyzeSiren(wrongSiren.transitions).snapshot.count,3);assert.equal(analyzeSiren(wrongSiren.transitions).repaired,false,'three incorrectly timed pulses must fail');
repairedSiren.advance(20*16000000);assert.equal(analyzeSiren(repairedSiren.transitions).repaired,true,'rolling transition window');
console.log('PASS case 002: measured faulty signal, two-series repair, wrong timing rejected, rolling window.');
const moved=new Emulator(built[0],wires.map(w=>({...w,a:w.a==='uno:13'?'uno:12':w.a})));moved.advance(9000000);assert.equal(moved.led,false);
const short=new Emulator(built[0],[...wires,{a:'uno:13',b:'uno:GND.2'}]);short.advance(100000);assert.ok(short.fault);
await assert.rejects(buildFirmware({source:'#include <Arduino.h>\nvoid setup(){this_is_an_error;}\nvoid loop(){}'}));
console.log('PASS wrong pin, open circuit, short circuit, breadboard groups and compiler error.');
const html=await fs.readFile('dist/index.html','utf8');
for(const file of [...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map(m=>m[1]).filter(s=>!s.startsWith('data:')&&!s.startsWith('http')&&s!=='./'))await fs.access('dist/'+file);
console.log('PASS local HTML asset references. Browser and WebMCP context validation were not run.');
