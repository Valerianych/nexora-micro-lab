import assert from 'node:assert/strict';
import {electricityExperiments,normalizeElectricity,observeElectricity,hasElectricityEvidence} from './electricity-model.js';
import {inspectCircuit} from './engine.js';
import {readProgress,writeProgress} from './progress.js';

for(const returnTo of ['open','5v']){
  const result=observeElectricity(0,{returnTo});
  assert.equal(result.status,'off');assert.equal(result.currentMa,0);
}
const closed=observeElectricity(0,{returnTo:'gnd'});
assert.equal(closed.status,'on');assert.ok(Math.abs(closed.currentMa-13.636)<.001);
assert.equal(observeElectricity(1,{forward:false}).status,'off');
const before=observeElectricity(1,{forward:true,placement:'before'}),after=observeElectricity(1,{forward:true,placement:'after'});
assert.equal(before.currentMa,after.currentMa);assert.equal(after.status,'on');
assert.equal(observeElectricity(2,{resistance:0}).currentMa,null);
assert.equal(observeElectricity(2,{resistance:0}).status,'unsafe');
assert.equal(observeElectricity(2,{resistance:100}).status,'unsafe');
assert.equal(observeElectricity(2,{resistance:1000}).currentMa,3);
const fixed=observeElectricity(3,{source:'5v'}),signal=observeElectricity(3,{source:'d13'}),other=observeElectricity(3,{source:'d12'});
assert.equal(fixed.onHigh,true);assert.equal(fixed.onLow,true);
assert.equal(signal.onHigh,true);assert.equal(signal.onLow,false);
assert.equal(other.onHigh,false);assert.equal(other.voltage,null);

const evidence=electricityExperiments.map(item=>[...item.required]);
assert.equal(hasElectricityEvidence(0,['gnd']),false);
assert.equal(hasElectricityEvidence(0,evidence[0]),true);
assert.deepEqual(normalizeElectricity({page:4,solved:[true,true,true,true]}).solved,[false,false,false,false]);
const partial=normalizeElectricity({page:3,seen:[evidence[0],evidence[1]],solved:[true,true,true,true],settings:[{returnTo:'gnd'},{forward:true,placement:'after'}]});
assert.equal(partial.page,2);assert.deepEqual(partial.solved,[true,true,false,false]);
assert.equal(partial.settings[1].placement,'after');
assert.deepEqual(normalizeElectricity({page:-10,seen:[['evil','open','open']],settings:[{returnTo:'invalid'}]}).seen[0],['open']);
const complete=normalizeElectricity({page:4,seen:evidence,solved:[true,true,true,true]});
assert.ok(complete.solved.every(Boolean));assert.equal(complete.page,4);
assert.deepEqual(normalizeElectricity(),normalizeElectricity(null));
// Learning, story and compiler drafts share storage without overwriting each other.
const values=new Map(),storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
writeProgress('workshop',{drafts:{0:{code:'student draft'}}},storage);
writeProgress('electricity',partial,storage);writeProgress('game',{activeCase:'001'},storage);
assert.deepEqual(normalizeElectricity(readProgress(storage).electricity),partial);
assert.equal(readProgress(storage).workshop.drafts[0].code,'student draft');

const wire=(a,b)=>({a,b});
for(const circuit of [
  [wire('uno:13','r:1'),wire('r:2','led:A'),wire('led:C','uno:GND.2')],
  [wire('uno:13','led:A'),wire('led:C','r:2'),wire('r:1','uno:GND.3')],
])assert.equal(inspectCircuit(circuit).led?.source,'uno:13');
assert.equal(inspectCircuit([wire('uno:13','led:A'),wire('led:C','uno:GND.2')]).error?.includes('резистора'),true);
assert.equal(inspectCircuit([wire('uno:13','r:1')]).reason.includes('Подключи Arduino D13'),false);
console.log('PASS electricity experiments, current/polarity/return paths, power versus GPIO, evidence-gated progress, storage merge and both resistor placements on the real workbench.');
