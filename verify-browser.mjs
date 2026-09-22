import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {missions} from './lessons.js';

// Only cases 001–002 are fixture progress. Every new case is completed through
// the UI, real browser compiler, real wiring and the production task checker.
const port=process.env.NEXORA_TEST_PORT||'8087';
const server=spawn(process.execPath,['serve.mjs'],{cwd:import.meta.dirname,env:{...process.env,PORT:port},stdio:['ignore','pipe','pipe']});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(Error(`Server exited: ${code}`)));});
const browser=await chromium.launch({executablePath:process.env.NEXORA_BROWSER_PATH||undefined,args:['--no-sandbox']});
const errors=[],missing=[];
const context=await browser.newContext({viewport:{width:1536,height:1050}});
const page=await context.newPage();
page.setDefaultTimeout(20000);
page.on('pageerror',error=>errors.push(error.message));
page.on('response',response=>{if(response.status()>=400)missing.push(`${response.status()} ${response.url()}`);});
const out=process.env.NEXORA_TEST_ARTIFACTS||'/tmp/nexora-browser-check';await mkdir(out,{recursive:true});
const fixture={version:1,game:{started:true,activeCase:'003',unlockedCases:['001','002','003'],completedCases:['001','002'],skills:['circuit','variables','types','conditions','loops'],introDone:true,caseStage:0,caseReached:0,room:'briefing',unlocked:['briefing'],score:180},workshop:{completed:[0,1,2,3],drafts:{}}};
await page.addInitScript(fixture=>{if(!sessionStorage.getItem('fixture-installed')){localStorage.setItem('nexora-progress-v1',JSON.stringify(fixture));sessionStorage.setItem('fixture-installed','yes');}},fixture);
const action=()=>page.locator('[data-story-action]');
const read=()=>page.evaluate(()=>window.nexoraWorkshop.getState());
const progress=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('nexora-progress-v1')));
const pin=name=>page.getByRole('button',{name:'Контакт '+name,exact:true});
async function connect(a,b){await pin(a).click();await pin(b).click();}
async function source(text){await page.locator('.cm-content').focus();await page.keyboard.press('ControlOrMeta+a');await page.keyboard.insertText(text);assert.equal((await read()).code,text);}
async function run(seconds=0){await page.locator('#run').click();await page.waitForFunction(()=>window.nexoraWorkshop.getState().running||!document.querySelector('#run').disabled,null,{timeout:90000});assert.equal((await read()).running,true,await page.locator('#console').innerText());if(seconds)await page.waitForFunction(seconds=>parseFloat(document.querySelector('#sim-time').textContent)>=seconds,seconds,{timeout:60000});}
async function checkFailure(){await page.locator('#check').click();await page.waitForFunction(()=>document.querySelector('#feedback').classList.contains('error'),null,{timeout:90000});assert.equal(await page.locator('.mission-transition').count(),0);}
async function checkSuccess(){await page.locator('#check').click();await page.locator('.mission-transition-action').waitFor({timeout:150000});await page.locator('.mission-transition-action').click();await page.locator('.mission-transition').waitFor({state:'detached'});}
async function enterWorkbench(){await action().filter({hasText:'Перейти к ремонту'}).click();await action().filter({hasText:'Открыть верстак'}).click();await page.locator('.cm-content').waitFor();}
async function closeFolder(id){await action().filter({hasText:'Закрыть папку'}).click();if(id!=='006'){await page.locator('.case-reveal-primary').click();}else await page.locator('#archive-modal[open]').waitFor();}
async function contrast(){
  const results=await page.evaluate(()=>{
    function rgb(text){return [...text.matchAll(/[\d.]+/g)].map(x=>Number(x[0]));}
    function lum(v){return v.slice(0,3).map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);}
    return ['#reset','#undo','.bb-toggle','.chip','#wire-list li','#wire-list button','#check-code','#stop','.code-panel summary','#prev','#run','.header-actions button'].map(selector=>{
      const el=document.querySelector(selector),style=getComputedStyle(el);let current=el,bg;
      while(current){bg=rgb(getComputedStyle(current).backgroundColor);if(bg.length===3||bg[3]>0)break;current=current.parentElement;}
      const a=lum(rgb(style.color)),b=lum(bg);return {selector,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),opacity:style.opacity};
    });
  });
  for(const result of results){assert.ok(result.ratio>=4.5,JSON.stringify(result));assert.equal(result.opacity,'1',JSON.stringify(result));}
  console.log('PASS button and connection text contrast',Math.min(...results.map(r=>r.ratio)).toFixed(2));
}
try{
  await page.goto(`http://127.0.0.1:${port}`);await page.waitForFunction(()=>window.nexoraWorkshop);
  for(const [id,index] of [['003',4],['004',5],['005',6],['006',7]]){
    await action().filter({hasText:'Осмотреть устройство'}).click();
    await action().filter({hasText:'Разобрать улику'}).click();
    await page.locator('#case-model button').first().waitFor();
    assert.equal(await action().isDisabled(),true);
    if(id==='003'){
      for(const value of [2,0])await page.locator(`[data-model-value="${value}"]`).click();
      assert.equal(await action().isDisabled(),true);
      await page.reload();await page.locator('#case-model button').first().waitFor();
      assert.equal(await action().isDisabled(),true,'partly completed model survives reload');
      await page.locator('[data-model-value="1"]').click();
      assert.match(await page.locator('.case-model-log').innerText(),/durations\[1\] = 250/);
    }else if(id==='004'){
      for(const value of [600,200])await page.locator(`[data-model-value="${value}"]`).click();
      assert.match(await page.locator('.case-model-log').innerText(),/duration = 200/);
    }else{
      const values=id==='005'?[40,35,34]:[3,0,2,1];
      for(const value of values)await page.locator(`[data-model-value="${value}"]`).click();
      assert.equal(await action().isDisabled(),true,'wrong condition cannot complete model');
      await page.locator('#model-setting').selectOption(id==='005'?'35':'or');
      for(const value of values)await page.locator(`[data-model-value="${value}"]`).click();
      await page.reload();await page.locator('#case-model button').first().waitFor();
    }
    assert.equal(await action().isDisabled(),false);
    if(id==='005')await page.locator('#case-model').screenshot({path:`${out}/temperature-model.png`});
    await enterWorkbench();assert.equal((await read()).mission,index);
    assert.ok((await page.locator('.lesson h1').innerText()).length>5);
    assert.match(await page.locator('.goal p').innerText(),id==='005'?/35/:id==='004'?/600/:/500/);
    if(id==='003'){
      await connect('D13','Резистор 1');await connect('Резистор 2','LED A');await connect('LED C','GND');
      assert.equal((await read()).wires.length,3);
      // Click the physical path, then delete using the in-canvas controls.
      const point=await page.locator('.wire-visible').first().evaluate(path=>{const p=path.getPointAtLength(path.getTotalLength()*.5),r=path.ownerSVGElement.getBoundingClientRect();return {x:r.x+p.x,y:r.y+p.y};});
      await page.mouse.click(point.x,point.y);await page.locator('#delete-selected-wire').waitFor();
      await page.locator('.workspace').screenshot({path:`out/wire-selection.png`.replace('out',out)});
      await page.locator('#delete-selected-wire').click();assert.equal((await read()).wires.length,2);
      await connect('D13','Резистор 1');
      await page.getByRole('button',{name:'Удалить LED C — GND',exact:true}).click();assert.equal((await read()).wires.length,2);await connect('LED C','GND');
      await contrast();
      const styles=await page.locator('.cm-line span').evaluateAll(nodes=>[...new Set(nodes.map(n=>getComputedStyle(n).color))]);assert.ok(styles.length>=4,'C++ syntax is highlighted');
      await page.screenshot({path:`${out}/workbench-desktop.png`,fullPage:true});
    }
    if(id==='005'){await connect('Датчик VCC','5V');await connect('Датчик GND','GND');await connect('Датчик OUT','A0');}
    if(id==='006'){await connect('D2','Кнопка 1.l');await connect('Кнопка 2.l','GND');}
    await run(index<6?5.5:0);await checkFailure();
    const fixed=index===4?missions[index].code.replace('{100, 250, 250}','{100, 250, 500}'):
      index===5?missions[index].code.replace('blink(200); // нужна вспышка 600 мс','blink(600);'):
      index===6?missions[index].code.replace('limitC = 45','limitC = 35'):
      missions[index].code.replace('{100, 250, 250}','{100, 250, 500}').replace('35 && pressed','35 || pressed');
    await source(fixed);
    if(id==='003'){await page.reload();await page.locator('.cm-content').waitFor();assert.equal((await read()).code,fixed);assert.equal((await read()).wires.length,3);}
    if(id==='006'){
      // A firmware that still has AND (but mentions OR in an unused function)
      // must fail behavioral validation, not merely pass a source text match.
      await source(fixed.replace('35 || pressed','35 && pressed')+'\nbool example(bool a, bool b) { return a || b; }');
      await run();await checkFailure();await source(fixed);
    }
    await run(index<6?5.5:0);
    if(id==='006'){
      await page.locator('#check').click();await page.waitForFunction(()=>document.querySelector('#runtime-status').textContent==='Испытываю устройство');
      await page.locator('#stop').click();assert.equal(await page.locator('#run').isEnabled(),true,'automated test can be stopped');
      await run();
    }
    await checkSuccess();
    assert.ok((await progress()).game.completedCases.includes(id));
    console.log(`PASS case ${id}: model → wiring → reject defect → compile correction → real check → report`);
    await closeFolder(id);
  }
  await page.locator('#close-archive').click();
  await page.locator('#progress-settings').click();await page.locator('#replay-case').click();
  assert.equal((await read()).wires.length,0,'replay clears in-memory wires');assert.equal((await read()).code,missions[7].code,'replay restores initial code');
  await page.reload();await page.waitForFunction(()=>window.nexoraWorkshop);assert.equal((await read()).code,missions[7].code);assert.ok((await progress()).game.completedCases.includes('005'),'other case progress preserved');
  console.log('PASS replay and reload: old solution does not resurrect, other cases preserved');
  await page.locator('#progress-settings').click();await page.locator('#reset-all').click();await page.locator('#confirm-reset-all').click();
  await page.reload();await page.waitForFunction(()=>window.nexoraWorkshop);assert.deepEqual((await progress()).game.completedCases,[]);assert.deepEqual((await progress()).game.unlockedCases,['001']);assert.equal((await read()).wires.length,0);assert.equal((await read()).code,missions[0].code);
  console.log('PASS full reset and reload');
  // Recheck the wire controls on a phone viewport without changing story progress.
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.nexoraWorkshop.open(0));
  await connect('D13','Резистор 1');
  await page.locator('.wire-group').first().focus();await page.keyboard.press('Enter');
  const toolBox=await page.locator('.wire-tools').boundingBox();assert.ok(toolBox.x>=0&&toolBox.x+toolBox.width<=391,'wire controls stay inside phone viewport');
  await page.locator('#board').screenshot({path:`${out}/workbench-phone.png`});
  await page.locator('#delete-selected-wire').click();assert.equal((await read()).wires.length,0);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no page-level horizontal overflow');
  assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
  console.log('PASS mobile, keyboard wire deletion, no browser exceptions or failed assets');
}catch(error){await page.screenshot({path:`out/failure.png`.replace('out',out),fullPage:true}).catch(()=>{});console.error('Browser errors:',errors,'Failed assets:',missing);throw error;
}finally{await browser.close();server.kill();}
