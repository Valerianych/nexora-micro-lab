import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {solutions,wire} from './verify-career.mjs';
import {emptySketch,careerCases} from './career-cases.js';
import {missions} from './lessons.js';

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
async function edit(value,esp=false){const editor=page.locator(esp?'#esp-editor .cm-content':'#code-editor .cm-content');await editor.focus();await page.keyboard.press('ControlOrMeta+a');await page.keyboard.insertText(value);assert.equal((await state()).code,value);}
async function enter(id){await page.locator(`.comic-intro-kicker`).filter({hasText:`ДЕЛО ${id}`}).waitFor();await action().click();await action().filter({hasText:'Принять задание'}).click();await action().filter({hasText:'Открыть верстак'}).click();await page.locator(id==='007'?'#code-editor .cm-content':'#esp-editor .cm-content').waitFor();}
async function add(wires,esp=false){for(const w of wires){await page.locator(`${esp?'#esp-stage':'#board'} [data-pin="${w.a}"]`).click();await page.locator(`${esp?'#esp-stage':'#board'} [data-pin="${w.b}"]`).click();}assert.equal((await state()).wires.length,wires.length);}
async function finish(id){await page.locator('.mission-transition-action').waitFor({timeout:150000});await page.locator('.mission-transition-action').click();await page.locator('.mission-transition').waitFor({state:'detached'});await action().filter({hasText:'Закрыть папку'}).click();assert((await progress()).game.completedCases.includes(id));if(id!=='012'){await page.locator('.case-reveal-primary').click();await page.locator('.case-reveal').waitFor({state:'detached'});}else await page.locator('#archive-modal[open]').waitFor();}
try{
 await page.goto(`http://127.0.0.1:${port}`);await page.waitForFunction(()=>window.nexoraWorkshop);
 assert.equal(missions[6].sensor,true);assert.equal(missions[8].independent,true);
 if(!skipAvr){await enter('007');assert.equal((await state()).code,emptySketch);assert.equal((await state()).wires.length,0);assert.equal(await page.locator('#pin-help').isVisible(),false);
 const arduinoWires=[wire('uno:13','r:1'),wire('r:2','led:A'),wire('led:C','uno:GND.2'),wire('uno:2','button:1.l'),wire('button:2.l','uno:GND.2'),wire('uno:5V','sensor:VCC'),wire('uno:GND.2','sensor:GND'),wire('sensor:OUT','uno:A0')];
 await add(arduinoWires);
 const arduinoCode='int pulses[3]={150,300,600};\nvoid light(int span){digitalWrite(13,HIGH);delay(span);digitalWrite(13,LOW);delay(150);}\nvoid setup(){pinMode(13,OUTPUT);pinMode(2,INPUT_PULLUP);}\nvoid loop(){float volts=analogRead(A0)*5.0/1024.0;int temp=(volts-0.5)*100+0.5;if(temp>=35 || digitalRead(2)==LOW){for(int n=0;n<3;n++)light(pulses[n]);delay(1000);}else{digitalWrite(13,LOW);}}';
 await edit(arduinoCode);await page.locator('#run').click();await page.waitForFunction(()=>window.nexoraWorkshop.getState().running||!document.querySelector('#run').disabled,null,{timeout:180000});assert((await state()).running,await page.locator('#console').innerText());await page.locator('#check').click();await finish('007');console.log('PASS case007: empty migration, actual AVR compile and independent behavioral checks, employment promotion');}
 for(const index of [9,10,11,12,13]){
  const id=String(index-1).padStart(3,'0'),solution=solutions[index];await enter(id);assert.equal((await state()).wires.length,0);assert.equal((await state()).mission,index);
  if(index===13){assert.equal((await state()).code,emptySketch);assert.equal(await page.locator('.esp-reference').count(),0);}else assert(await page.locator('.esp-reference').count());
  await page.locator('#esp-check').click();await page.locator('#esp-messages.error').waitFor();assert.equal(await page.locator('.mission-transition').count(),0);
  await add(solution.wires,true);await edit(solution.code,true);await page.locator('#esp-run').click();await page.waitForFunction(()=>window.nexoraWorkshop.getState().running||document.querySelector('#esp-messages.error'),null,{timeout:15000});assert((await state()).running,await page.locator('#esp-messages').innerText());
  if(index===9){await page.locator('#esp-press').focus();await page.keyboard.down(' ');await page.waitForFunction(()=>window.nexoraWorkshop.getState().state?.led===true);await page.keyboard.up(' ');await page.waitForFunction(()=>window.nexoraWorkshop.getState().state?.led===false);await page.locator('#esp-stop').click();await page.locator('#esp-stage .esp-wire').first().focus();await page.keyboard.press('Enter');await page.locator('#esp-wire-delete').click();assert.equal((await state()).wires.length,solution.wires.length-1);await page.locator('#esp-stage [data-pin="esp:25"]').click();await page.locator('#esp-stage [data-pin="r:1"]').click();await page.reload();await page.locator('#esp-editor .cm-content').waitFor();assert.equal((await state()).wires.length,solution.wires.length);assert.equal((await state()).code,solution.code);}
  if(index>=12){const press=page.locator('#esp-press');await press.focus();await page.keyboard.down(' ');await page.waitForFunction(()=>window.nexoraWorkshop.getState().state?.photos.length===3);await page.keyboard.up(' ');assert.equal(await page.locator('#esp-photos figure').count(),3);await page.screenshot({path:`${out}/case-${id}-photos.png`,fullPage:true});await page.locator('#esp-stop').click();}
  await page.locator('#esp-check').click();await finish(id);console.log(`PASS case${id}: actual wiring, worker execution, behavior tests, completion and next-case transition`);
 }
 assert.match(await page.locator('#player-level').textContent(),/сотрудник/);assert.equal((await progress()).game.completedCases.length,12);
 // Replay clears only the chosen folder; other projects remain saved.
 const card=page.locator('.case-card').filter({has:page.getByRole('heading',{name:careerCases['012'].title,exact:true})});await card.getByRole('button',{name:'Пройти заново ↺'}).click();
 await page.locator('#replay-case').click();await enter('012');assert.equal((await state()).wires.length,0);assert.equal((await state()).code,emptySketch);assert.equal((await progress()).espWorkshop[9].code,solutions[9].code);
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${out}/mobile.png`,fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.getByRole('button',{name:'Сброс',exact:true}).click();await page.locator('#reset-all').click();await page.locator('#confirm-reset-all').click();assert.equal((await progress()).game.activeCase,'001');assert.deepEqual((await progress()).espWorkshop||{},{});await page.reload();assert.equal((await progress()).game.activeCase,'001');
 assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);console.log('PASS twelve closed cases, isolated replay, responsive layout; no browser errors or missing assets');
}catch(error){await page.screenshot({path:`${out}/failure.png`,fullPage:true});console.log('ERRORS',errors,'MISSING',missing,'UI',await page.locator('#esp-messages,#console,#feedback').allTextContents());throw error;}
finally{await context.close();await browser.close();server.kill();}
