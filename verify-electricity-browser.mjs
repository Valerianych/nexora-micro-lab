import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';

const port=process.env.NEXORA_TEST_PORT||'8093',out=process.env.NEXORA_TEST_ARTIFACTS||'/tmp/nexora-electricity-check';
await mkdir(out,{recursive:true});
const server=spawn(process.execPath,['serve.mjs'],{env:{...process.env,PORT:port},stdio:['ignore','pipe','pipe']});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(Error(`Server exited: ${code}`)));});
let browser;
try{
  browser=await chromium.launch({executablePath:process.env.NEXORA_BROWSER_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],missing=[];
  page.setDefaultTimeout(25000);page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)missing.push(`${r.status()} ${r.url()}`);});
  const school=page.locator('#electricity-school'),progress=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('nexora-progress-v1')));
  const option=(name,value)=>school.locator(`[data-electric-option="${name}"][data-value="${value}"]`),run=()=>school.locator('[data-electric-run]').click(),next=()=>school.locator('[data-electric-next]').click();
  async function observed(name,value){await option(name,value).click();await run();}
  async function explain(answer){await school.locator(`[data-electric-answer="${answer}"]`).click();assert.equal(await school.locator('[data-electric-next]').isDisabled(),false);}
  async function contained(){
    const boxes=await school.evaluate(el=>({client:el.clientWidth,scroll:el.scrollWidth,body:document.body.scrollWidth,viewport:innerWidth}));
    assert.ok(boxes.scroll<=boxes.client+1,JSON.stringify(boxes));assert.ok(boxes.body<=boxes.viewport+1,JSON.stringify(boxes));
  }
  await page.goto(`http://127.0.0.1:${port}`);await page.waitForFunction(()=>window.nexoraWorkshop);
  await page.locator('#start-game').click();
  for(let i=0;i<4;i++)await page.locator('[data-intro-action]').click();
  await page.locator('[data-diagnostic-check="program"]').click();
  const firstDiagnosis=await progress();await page.locator('[data-diagnostic-check="program"]').click();
  assert.equal((await progress()).game.score,firstDiagnosis.game.score);assert.equal((await progress()).game.journal.length,firstDiagnosis.game.journal.length);
  await page.reload();await page.locator('[data-diagnostic-check="circuit"]').click();await page.locator('[data-diagnostic-check="power"]').click();
  await page.locator('[data-diagnostic-verdict="power"]').click();assert.match(await page.locator('.diagnosis-feedback').innerText(),/5 В/);
  assert.equal(await page.locator('[data-story-action]').isDisabled(),true);
  await page.locator('[data-diagnostic-verdict="circuit"]').click();
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.locator('.case-diagnosis').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
  await page.screenshot({path:`${out}/diagnosis-mobile.png`,fullPage:true});await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:`${out}/diagnosis.png`,fullPage:true});
  await page.locator('[data-story-action]').filter({hasText:'Найти деталь'}).click();
  await page.locator('[data-story-action]').filter({hasText:'Осмотреть деталь'}).click();
  await page.locator('[data-story-action]').filter({hasText:'Взять резистор'}).click();
  await page.locator('[data-story-action]').filter({hasText:'Разобраться вместе с Маей'}).click();
  await school.locator('[data-electric-run]').waitFor();assert.equal(await page.locator('body').evaluate(n=>n.classList.contains('workbench-open')),false);
  assert.equal(await school.locator('[data-electric-answer="1"]').isDisabled(),true);
  await observed('returnTo','open');await observed('returnTo','5v');
  assert.equal(await school.locator('[data-electric-answer="1"]').isDisabled(),true);
  await observed('returnTo','gnd');
  await school.locator('[data-electric-answer="0"]').click();assert.equal(await school.locator('[data-electric-next]').isDisabled(),true);
  assert.match(await school.locator('.electric-answer-feedback').innerText(),/Сравни результаты/);
  await explain(1);await contained();await page.screenshot({path:`${out}/return-path.png`,fullPage:true});
  const saved=(await progress()).electricity;assert.equal(saved.solved[0],true);assert.equal((await progress()).game.activeCase,'001');
  await page.reload();await page.locator('[data-story-action]').filter({hasText:'Разобраться вместе с Маей'}).click();
  assert.equal(await school.locator('[data-electric-next]').isDisabled(),false);assert.equal(await school.locator('.electric-evidence .observed').count(),3);
  await next();await observed('forward',false);await observed('forward',true);await observed('placement','after');await explain(0);await next();
  await observed('resistance',0);assert.match(await school.locator('.electric-observation').innerText(),/повредить/);
  await observed('resistance',220);assert.match(await school.locator('.electric-circuit').getAttribute('class'),/is-on/);
  await observed('resistance',1000);assert.match(await school.locator('.electric-circuit svg').textContent(),/3 мА/);await explain(2);await next();
  await observed('source','5v');assert.equal(await school.locator('.electric-phases .lit').count(),2);
  await observed('source','d12');assert.equal(await school.locator('.electric-phases .lit').count(),0);
  await observed('source','d13');assert.equal(await school.locator('.electric-phases .lit').count(),1);await explain(1);
  await page.screenshot({path:`${out}/power-and-signal.png`,fullPage:true});
  await page.setViewportSize({width:390,height:844});await contained();await page.screenshot({path:`${out}/mobile.png`,fullPage:true});
  assert.ok(await school.locator('[data-electric-close]').isVisible());
  const closeBox=await school.locator('[data-electric-close]').boundingBox();assert.ok(closeBox.y>=0&&closeBox.y+closeBox.height<=844,'close control remains in the mobile viewport');
  // Buttons remain readable against their actual backgrounds, including disabled choices.
  const contrasts=await school.locator('button').evaluateAll(nodes=>nodes.map(el=>{
    const s=getComputedStyle(el),lum=color=>color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>(v/=255)<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0),a=lum(s.color),b=lum(s.backgroundColor);
    return {text:el.textContent,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
  }));for(const item of contrasts)assert.ok(item.ratio>=4.5,JSON.stringify(item));
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await school.locator('.electric-flow').evaluate(el=>getComputedStyle(el).animationName),'none');
  await next();await school.locator('[data-electric-finish]').click();
  await page.locator('body.workbench-open #code-editor .cm-content').waitFor();await page.setViewportSize({width:1440,height:1000});
  assert.equal((await progress()).electricity.solved.every(Boolean),true);
  assert.equal(await page.locator('.connection-instruction-row:visible').count(),0,'wiring solution is hidden by default');
  await page.locator('#next').click();assert.match(await page.locator('#lesson-content').innerText(),/Выбери соединения сама/);
  assert.equal(await page.locator('.first-circuit-hint').getAttribute('open'),null);
  for(const [a,b] of [['uno:13','led:A'],['led:C','r:2'],['r:1','uno:GND.2']]){
    await page.locator(`#board [data-pin="${a}"]`).click();await page.locator(`#board [data-pin="${b}"]`).click();
  }
  assert.equal(await page.evaluate(()=>window.nexoraWorkshop.getState().wires.length),3);
  await page.locator('#check').click();await page.locator('[data-signal-setup]').waitFor();
  await page.locator('[data-signal-setup]').selectOption('OUTPUT');
  for(const [i,id] of ['high','wait500','high','wait500'].entries())await page.locator(`[data-signal-line="${i}"]`).selectOption(id);
  await page.locator('[data-signal-apply]').click();await page.waitForFunction(()=>window.nexoraWorkshop.getState().running,{},{timeout:120000});
  await page.waitForFunction(()=>parseFloat(document.querySelector('#sim-time').textContent)>3,{},{timeout:45000});
  await page.locator('#check').click();assert.equal(await page.locator('.mission-transition-action').count(),0);
  assert.match(await page.locator('#feedback').innerText(),/переключений/);
  await page.locator('[data-signal-line="2"]').selectOption('low');
  await page.reload();await page.locator('[data-signal-line="2"]').waitFor();assert.equal(await page.locator('[data-signal-line="2"]').inputValue(),'low');
  await page.screenshot({path:`${out}/signal-exercise.png`,fullPage:true});
  const labels=await page.locator('[data-signal-line]').evaluateAll(nodes=>nodes.map(n=>n.selectedOptions[0].textContent));assert.match(labels[0],/HIGH/);assert.match(labels[2],/LOW/);
  await page.setViewportSize({width:390,height:844});assert.equal(await page.locator('.signal-exercise').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
  await page.screenshot({path:`${out}/signal-exercise-mobile.png`,fullPage:true});await page.setViewportSize({width:1440,height:1000});
  await page.locator('[data-signal-apply]').click();await page.waitForFunction(()=>window.nexoraWorkshop.getState().running,{},{timeout:120000});
  await page.waitForFunction(()=>/\d\.\d\d с/.test(document.querySelector('#sim-time').textContent)&&parseFloat(document.querySelector('#sim-time').textContent)>3,{},{timeout:45000});
  await page.locator('#check').click();await page.locator('.mission-transition-action').waitFor();
  await page.locator('.mission-transition-action').click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('nexora-progress-v1')).game.completed.includes(0));
  await page.locator('[data-story-action]').filter({hasText:'Испытать маяк на D12'}).click();
  assert.equal(await page.evaluate(()=>window.nexoraWorkshop.getState().mode),'transfer');
  const firstSketch=(await progress()).workshop.drafts[0].code;
  await page.locator('#run').click();await page.waitForFunction(()=>window.nexoraWorkshop.getState().running,{},{timeout:120000});
  await page.locator('#check').click();assert.match(await page.locator('#feedback').innerText(),/другой вывод/);
  await page.locator('#stop').click();
  const originalWire=await page.locator('#wire-list li').filter({hasText:'Arduino D13'}).first();await originalWire.locator('button').click();
  await page.locator('#board [data-pin="uno:12"]').click();await page.locator('#board [data-pin="led:A"]').click();
  await page.locator('#run').click();await page.waitForFunction(()=>window.nexoraWorkshop.getState().running,{},{timeout:120000});
  await page.waitForFunction(()=>parseFloat(document.querySelector('#sim-time').textContent)>3,{},{timeout:45000});
  await page.locator('#check').click();assert.equal((await progress()).game.caseOne.transferDone,false,'moving only the wire does not pass');
  await page.locator('#stop').click();
  const editor=page.locator('#code-editor .cm-content');await editor.focus();await page.keyboard.press('ControlOrMeta+a');await page.keyboard.insertText(firstSketch.replace('ledPin = 13','ledPin = 12'));
  await page.reload();await page.locator('body.workbench-open #code-editor .cm-content').waitFor();
  assert.equal(await page.evaluate(()=>window.nexoraWorkshop.getState().mode),'transfer');
  assert.match(await page.evaluate(()=>window.nexoraWorkshop.getState().code),/ledPin = 12/);
  assert.equal((await progress()).workshop.drafts[0].code,firstSketch,'transfer preserves the initial repair draft');
  await page.locator('#run').click();await page.waitForFunction(()=>window.nexoraWorkshop.getState().running,{},{timeout:120000});
  await page.waitForFunction(()=>parseFloat(document.querySelector('#sim-time').textContent)>3,{},{timeout:45000});
  await page.locator('#check').click();await page.locator('[data-story-action]').filter({hasText:'Идти в серверную'}).waitFor();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('nexora-progress-v1')).game.caseOne.transferDone);
  await page.locator('[data-story-action]').filter({hasText:'Идти в серверную'}).click();
  await page.locator('[data-story-action]').filter({hasText:'Рассмотреть сигнал'}).click();await page.locator('[data-story-action]').filter({hasText:'Настроить ритм'}).click();
  assert.match(await page.evaluate(()=>window.nexoraWorkshop.getState().code),/ledPin = 12/);
  await editor.focus();await page.keyboard.press('ControlOrMeta+a');const rhythm=await page.evaluate(()=>window.nexoraWorkshop.getState().code);await page.keyboard.insertText(rhythm.replace('pauseMs = 500','pauseMs = 250'));
  await page.locator('#run').click();await page.waitForFunction(()=>window.nexoraWorkshop.getState().running,{},{timeout:120000});await page.waitForFunction(()=>parseFloat(document.querySelector('#sim-time').textContent)>2,{},{timeout:45000});
  await page.locator('#check').click();await page.locator('.mission-transition-action').click();await page.locator('[data-story-action]').filter({hasText:'Открыть крышу'}).click();
  await page.locator('[data-story-action]').filter({hasText:'Осмотреть кнопку'}).click();await page.locator('[data-story-action]').filter({hasText:'Открыть финальный верстак'}).click();
  assert.match(await page.evaluate(()=>window.nexoraWorkshop.getState().code),/ledPin = 12/);
  for(const [a,b] of [['uno:2','button:1.l'],['button:2.l','uno:GND.2']]){await page.locator(`#board [data-pin="${a}"]`).click();await page.locator(`#board [data-pin="${b}"]`).click();}
  const buttonCode=await page.evaluate(()=>window.nexoraWorkshop.getState().code);await editor.focus();await page.keyboard.press('ControlOrMeta+a');await page.keyboard.insertText(buttonCode.replace('digitalWrite(ledPin, LOW); // замени LOW','digitalWrite(ledPin, HIGH);'));
  await page.locator('#run').click();await page.waitForFunction(()=>window.nexoraWorkshop.getState().running,{},{timeout:120000});await page.locator('#check').click();await page.locator('.mission-transition-action').click();
  await page.locator('[data-story-action]').filter({hasText:'Открыть новое дело'}).click();await page.locator('.case-reveal-primary').click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('nexora-progress-v1')).game.activeCase==='002');
  assert.ok((await progress()).game.completedCases.includes('001'));
  // Replaying 001 clears its lesson and firmware while retaining other sections.
  await page.locator('#case-archive').click();await page.locator('#case-list .case-card').filter({hasText:'Маяк замолчал'}).locator('.case-replay-action').click();await page.locator('#replay-case').click();
  assert.deepEqual((await progress()).game.caseOne.checks,[]);assert.equal((await progress()).game.caseOne.transferDone,false);assert.equal((await progress()).workshop.drafts['0-transfer'],undefined);
  assert.deepEqual((await progress()).electricity.solved,[false,false,false,false]);
  await page.locator('#electricity-open').click();assert.equal(await school.locator('[data-electric-page="1"]').isDisabled(),true);
  await observed('returnTo','gnd');await school.locator('[data-electric-close]').click();
  await page.locator('#progress-settings').click();await page.locator('#reset-all').click();await page.locator('#confirm-reset-all').click();
  await page.locator('#start-game').waitFor({state:'visible'});assert.equal((await progress()).electricity,undefined);
  await page.locator('#electricity-open').click();assert.equal(await school.locator('.electric-evidence .observed').count(),0);
  // Opening a lesson at the title screen does not advance the comic by keyboard.
  await page.keyboard.press('j');assert.equal(await page.locator('#case-drawer').isVisible(),false);
  await page.keyboard.press('Escape');assert.equal(await school.getAttribute('open'),null);
  assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
  console.log('PASS complete case 001: evidence diagnosis, electricity lessons, executable line exercise (wrong/right), D12 transfer (wire-only rejected), isolated/reloaded drafts, rhythm/button continuity, case 002 unlock, replay/full reset, mobile, contrast and reduced motion.');
} finally {await browser?.close();server.kill();}
