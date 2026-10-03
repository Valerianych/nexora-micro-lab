import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {solutions,wire} from './verify-career.mjs';
import {emptySketch,careerCases} from './career-cases.js';
import {missions} from './lessons.js';
import {blockSolutions} from './verify-program-blocks.mjs';
import {espLessons} from './esp-learning.js';

const port=process.env.NEXORA_TEST_PORT||'8092',out=process.env.NEXORA_TEST_ARTIFACTS||'/tmp/nexora-career-check';await mkdir(out,{recursive:true});
const server=spawn(process.execPath,['serve.mjs'],{env:{...process.env,PORT:port},stdio:['ignore','pipe','pipe']});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
const browser=await chromium.launch({executablePath:process.env.NEXORA_BROWSER_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
const context=await browser.newContext({viewport:{width:1680,height:1050}}),page=await context.newPage(),errors=[],missing=[];
page.on('pageerror',error=>errors.push(error.message));page.on('response',r=>{if(r.status()>=400)missing.push(`${r.status()} ${r.url()}`);});page.setDefaultTimeout(20000);
const skipAvr=process.env.NEXORA_ESP_ONLY==='1';
const prior=['001','002','003','004','005','006'];
const fixture={version:1,game:{started:true,activeCase:'007',unlockedCases:[...prior,'007'],completedCases:prior,skills:['circuit','variables','types','conditions','loops','arrays','functions'],introDone:true,caseStage:0,caseReached:0,room:'briefing',unlocked:['briefing']},workshop:{activeIndex:7,drafts:{8:{code:'// old free workshop draft',wires:[wire('uno:13','r:1')]}}}};
if(skipAvr){fixture.game.activeCase='008';fixture.game.completedCases.push('007');fixture.game.unlockedCases.push('008');}
await page.addInitScript(fixture=>{if(!sessionStorage.getItem('fixture')){sessionStorage.setItem('fixture','yes');localStorage.setItem('nexora-progress-v1',JSON.stringify(fixture));}},fixture);
const state=()=>page.evaluate(()=>window.nexoraWorkshop.getState());
const progress=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('nexora-progress-v1')));
const action=()=>page.locator('[data-story-action]');
async function checkButtonContrast(selector){
 const ratio=await page.locator(selector).evaluate(el=>{
  const s=getComputedStyle(el),luminance=color=>{
   const values=color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
   return values.reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
  };
  const a=luminance(s.color),b=luminance(s.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
 });assert(ratio>=4.5,`${selector}: contrast ${ratio.toFixed(2)}`);
}
async function edit(value,esp=false){const editor=page.locator(esp?'#esp-editor .cm-content':'#code-editor .cm-content');await editor.focus();await page.keyboard.press('ControlOrMeta+a');await page.keyboard.insertText(value);assert.equal((await state()).code,value);}
async function enter(id){await page.locator(`.comic-intro-kicker`).filter({hasText:`ДЕЛО ${id}`}).waitFor();await action().click();await action().filter({hasText:'Принять задание'}).click();await action().filter({hasText:'Открыть верстак'}).click();await page.locator(['007','012'].includes(id)?'.program-builder:visible':'#esp-editor .cm-content').waitFor();}
function builder(esp=false){return page.locator(esp?'#esp-program-builder':'#program-builder-mount');}
async function assemble(kind){
 const ui=builder(kind==='esp32'),solution=blockSolutions[kind];
 for(const [field,value] of Object.entries(solution.fields))await ui.locator(`[data-block-field="${field}"]`).selectOption(value);
 for(const [zone,blocks] of Object.entries(solution.zones))for(const id of blocks)await ui.locator(`[data-block-zone="${zone}"] [data-add-block="${id}"]`).click();
 assert.deepEqual((await state()).program.zones,solution.zones);
}
async function add(wires,esp=false){for(const w of wires){await page.locator(`${esp?'#esp-stage':'#board'} [data-pin="${w.a}"]`).click();await page.locator(`${esp?'#esp-stage':'#board'} [data-pin="${w.b}"]`).click();}assert.equal((await state()).wires.length,wires.length);}
async function learn(index){
 const ui=page.locator('#esp-learning-mount'),before=(await state()).code;
 assert.equal(await ui.locator('.esp-learning').count(),1);
 if(index===9){await page.screenshot({path:`${out}/esp-learning.png`,fullPage:true});await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:`${out}/esp-learning-mobile.png`,fullPage:true});await page.setViewportSize({width:1680,height:1050});}
 for(const [i,step] of espLessons[index].steps.entries()){
  assert.equal((await state()).learning.step,i);
  if(i===0){await ui.locator('[data-lesson-field]').first().fill('неверно');await ui.getByRole('button',{name:'Проверить ответ'}).click();assert(await ui.locator('.esp-lesson-feedback.error').isVisible());assert.equal((await state()).learning.solved[0],false);assert(await ui.locator('.esp-lesson-next').isDisabled());}
  for(const field of step.fields)await ui.locator(`[data-lesson-field="${field.id}"]`).fill(field.answer);
  await ui.getByRole('button',{name:'Проверить ответ'}).click();assert(await ui.locator('.esp-lesson-feedback.success').isVisible());assert.equal((await state()).learning.solved[i],true);
  if(index===9&&i===0){await page.reload();await ui.locator('.esp-learning').waitFor();assert.equal((await state()).learning.solved[0],true);assert.equal((await state()).code,before);}
  if(i===espLessons[index].steps.length-1){await ui.getByRole('button',{name:'Разобрать соединения'}).click();assert.equal(await page.locator('#esp-wiring-lesson .esp-pin.is-guided').count(),0);assert.equal(await page.locator('#esp-stage .esp-pin.is-guided').count(),2);await page.locator('#esp-wiring-lesson summary').click();}
  await ui.locator('.esp-lesson-next').click();
 }
 assert.equal((await state()).learning.collapsed,true);assert.equal((await state()).code,before);assert.equal((await state()).wires.length,0);
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.setViewportSize({width:1680,height:1050});
 console.log(`PASS case${index-1}: lesson feedback, independent code/wires, lesson progress and responsive layout`);
}
async function finish(id){await page.locator('.mission-transition-action').waitFor({timeout:150000});await page.locator('.mission-transition-action').click();await page.locator('.mission-transition').waitFor({state:'detached'});await action().filter({hasText:'Закрыть папку'}).click();assert((await progress()).game.completedCases.includes(id));if(id!=='012'){await page.locator('.case-reveal-primary').click();await page.locator('.case-reveal').waitFor({state:'detached'});}else await page.locator('#archive-modal[open]').waitFor();}
try{
 await page.goto(`http://127.0.0.1:${port}`);await page.waitForFunction(()=>window.nexoraWorkshop);
 assert.equal(missions[6].sensor,true);assert.equal(missions[8].independent,true);
 if(!skipAvr){await enter('007');assert.equal((await state()).program.mode,'blocks');assert.equal((await state()).wires.length,0);assert.equal(await page.locator('#pin-help').isVisible(),false);
 await page.locator('#run').click();assert.match(await page.locator('#feedback').innerText(),/Выбери/);
 await assemble('arduino');
 const ui=builder();
 await ui.locator('[data-block-zone="blink"] [data-block-id="wait"] [data-order="up"]').click();
 assert.deepEqual((await state()).program.zones.blink,['wait','on','off','gap']);
 await ui.locator('[data-block-zone="blink"] [data-block-id="wait"]').dragTo(ui.locator('[data-block-zone="blink"] [data-block-id="on"]'));
 assert.deepEqual((await state()).program.zones.blink,blockSolutions.arduino.zones.blink);
 await ui.locator('[data-program-mode="code"]').click();await edit('// мой текстовый черновик\n'+emptySketch);
 await ui.locator('[data-program-mode="blocks"]').click();assert.match((await state()).code,/delay\(1000\)/);
 await ui.locator('[data-program-mode="code"]').click();assert.match((await state()).code,/мой текстовый черновик/);
 await ui.locator('[data-program-mode="blocks"]').click();
 await page.reload();await ui.waitFor();assert.deepEqual((await state()).program.zones,blockSolutions.arduino.zones);
 assert.match((await state()).program.manualCode,/мой текстовый черновик/);
 await page.screenshot({path:`${out}/arduino-blocks.png`,fullPage:true});
 const arduinoWires=[wire('uno:13','r:1'),wire('r:2','led:A'),wire('led:C','uno:GND.2'),wire('uno:2','button:1.l'),wire('button:2.l','uno:GND.2'),wire('uno:5V','sensor:VCC'),wire('uno:GND.2','sensor:GND'),wire('sensor:OUT','uno:A0')];
 await add(arduinoWires);
 await ui.locator('[data-block-field="pause"]').selectOption('1150');await page.locator('#run').click();await page.waitForFunction(()=>window.nexoraWorkshop.getState().running||!document.querySelector('#run').disabled,null,{timeout:180000});assert((await state()).running,await page.locator('#console').innerText());
 await page.locator('#check').click();await page.locator('#feedback.error').waitFor({timeout:150000});assert.match(await page.locator('#feedback').innerText(),/delay\(1000\).*1150.*1300/);
 await ui.locator('[data-block-field="pause"]').selectOption('1000');assert.match(await ui.locator('[data-block-zone="tail"] code').innerText(),/delay\(1000\)/);
 await page.locator('#run').click();await page.waitForFunction(()=>window.nexoraWorkshop.getState().running||!document.querySelector('#run').disabled,null,{timeout:180000});assert((await state()).running,await page.locator('#console').innerText());await page.locator('#check').click();await finish('007');console.log('PASS case007: blocks, drag/reorder, separate C++ draft, reload, real AVR timing failure/correction, behavioral checks and promotion');}
 for(const index of [9,10,11,12,13]){
  const id=String(index-1).padStart(3,'0'),solution=solutions[index];await enter(id);assert.equal((await state()).wires.length,0);assert.equal((await state()).mission,index);
  if(index===13){assert.equal((await state()).program.mode,'blocks');assert.equal(await page.locator('.esp-reference').count(),0);assert.equal(await page.locator('.esp-learning,#esp-wiring-lesson').count(),0);}else{assert(await page.locator('.esp-reference').count());await learn(index);}
  const containers=await page.locator('.esp-part').evaluateAll(parts=>parts.map(part=>{const s=getComputedStyle(part);return {bg:s.backgroundColor,image:s.backgroundImage,border:s.borderTopWidth,shadow:s.boxShadow};}));assert(containers.every(s=>s.bg==='rgba(0, 0, 0, 0)'&&s.image==='none'&&s.border==='0px'&&s.shadow==='none'));
  await page.locator('#esp-check').click();await page.locator('#esp-messages.error').waitFor();assert.equal(await page.locator('.mission-transition').count(),0);
  if(index===9){for(const tag of ['wokwi-resistor','wokwi-led','wokwi-pushbutton','wokwi-esp32-devkit-v1'])assert.equal(await page.locator('#esp-stage '+tag).count(),1);await page.locator('#esp-board').screenshot({path:`${out}/esp-components.png`});
   await checkButtonContrast('#esp-press');await page.locator('#esp-press').focus();await page.keyboard.down(' ');await checkButtonContrast('#esp-press');await page.keyboard.up(' ');await checkButtonContrast('#esp-press');
  }
  await add(solution.wires,true);if(index===13)await assemble('esp32');else await edit(solution.code,true);
  if(index===9){const before=await state();await page.locator('.esp-part-r .esp-part-handle').focus();await page.keyboard.press('ArrowRight');await page.locator('#esp-arrange').click();assert.equal((await state()).code,before.code);assert.deepEqual((await state()).wires,before.wires);await page.screenshot({path:`${out}/esp-circuit-connected.png`,fullPage:true});}
  await page.locator('#esp-run').click();await page.waitForFunction(()=>window.nexoraWorkshop.getState().running||document.querySelector('#esp-messages.error'),null,{timeout:15000});assert((await state()).running,await page.locator('#esp-messages').innerText());
  if(index===9){await page.locator('#esp-button-press').focus();await page.keyboard.down(' ');await page.waitForFunction(()=>window.nexoraWorkshop.getState().state?.led===true);assert(await page.locator('#esp-stage wokwi-led').evaluate(el=>el.value));await page.keyboard.up(' ');await page.waitForFunction(()=>window.nexoraWorkshop.getState().state?.led===false);await page.locator('#esp-stop').click();await page.locator('#esp-stage .esp-wire').first().focus();await page.keyboard.press('Enter');await page.locator('#esp-wire-delete').click();assert.equal((await state()).wires.length,solution.wires.length-1);await page.locator('#esp-stage [data-pin="esp:25"]').click();await page.locator('#esp-stage [data-pin="r:1"]').click();await page.reload();await page.locator('#esp-editor .cm-content').waitFor();assert.equal((await state()).wires.length,solution.wires.length);assert.equal((await state()).code,solution.code);}
  if(index>=12){const press=page.locator('#esp-press');await press.focus();await page.keyboard.down(' ');await page.waitForFunction(()=>window.nexoraWorkshop.getState().state?.photos.length===3);await page.keyboard.up(' ');assert.equal(await page.locator('#esp-photos figure').count(),3);await page.screenshot({path:`${out}/case-${id}-photos.png`,fullPage:true});await page.locator('#esp-stop').click();}
  await page.locator('#esp-check').click();await finish(id);console.log(`PASS case${id}: actual wiring, worker execution, behavior tests, completion and next-case transition`);
 }
 assert.match(await page.locator('#player-level').textContent(),/сотрудник/);assert.equal((await progress()).game.completedCases.length,12);
 // Replay clears only the chosen folder; other projects remain saved.
 const card=page.locator('.case-card').filter({has:page.getByRole('heading',{name:careerCases['012'].title,exact:true})});await card.getByRole('button',{name:'Пройти заново ↺'}).click();
 await page.locator('#replay-case').click();await enter('012');assert.equal((await state()).wires.length,0);assert.equal((await state()).program.mode,'blocks');assert(Object.values((await state()).program.zones).every(z=>!z.length));assert.equal((await progress()).espWorkshop[9].code,solutions[9].code);
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${out}/mobile.png`,fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.getByRole('button',{name:'Сброс',exact:true}).click();await page.locator('#reset-all').click();await page.locator('#confirm-reset-all').click();assert.equal((await progress()).game.activeCase,'001');assert.deepEqual((await progress()).espWorkshop||{},{});await page.reload();assert.equal((await progress()).game.activeCase,'001');
 assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);console.log('PASS twelve closed cases, isolated replay, responsive layout; no browser errors or missing assets');
}catch(error){await page.screenshot({path:`${out}/failure.png`,fullPage:true});console.log('ERRORS',errors,'MISSING',missing,'UI',await page.locator('#esp-messages,#console,#feedback').allTextContents());throw error;}
finally{await context.close();await browser.close();server.kill();}
