import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {missions} from './lessons.js';
import {inspectCircuit,inspectSensor} from './engine.js';

const port=process.env.NEXORA_TEST_PORT||'8090';
const server=spawn(process.execPath,['serve.mjs'],{cwd:import.meta.dirname,env:{...process.env,PORT:port},stdio:['ignore','pipe','pipe']});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(Error(`Server exited: ${code}`)));});
const browser=await chromium.launch({executablePath:process.env.NEXORA_BROWSER_PATH||undefined,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1920,height:1100}}),errors=[],missing=[];
page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)missing.push(r.url());});
const out=process.env.NEXORA_TEST_ARTIFACTS||'/tmp/nexora-workspace-check';await mkdir(out,{recursive:true});
const studentCode=missions[7].code+'\n// мой черновик';
const fixture={version:1,game:{started:true,activeCase:'006',unlockedCases:['001','002','003','004','005','006'],completedCases:['001','002','003','004','005'],introDone:true,caseStage:3,caseReached:3,room:'server',unlocked:['briefing','workshop','server'],view:'workbench',workbenchIndex:7},workshop:{activeIndex:7,mode:'repair',drafts:{7:{code:studentCode,wires:[],temperature:38,step:0,breadboard:false}}}};
await page.addInitScript(fixture=>{if(!sessionStorage.getItem('fixture-installed')){localStorage.setItem('nexora-progress-v1',JSON.stringify(fixture));sessionStorage.setItem('fixture-installed','yes');}},fixture);
const state=()=>page.evaluate(()=>window.nexoraWorkshop.getState());
const pin=id=>page.locator(`.pin[data-pin="${id}"]`);
const positions=()=>page.locator('.part').evaluateAll(parts=>Object.fromEntries(parts.map(p=>[p.dataset.part,{x:parseFloat(p.style.left),y:parseFloat(p.style.top)}])));
const canvasResized=()=>page.waitForFunction(()=>{
  const stage=document.querySelector('.stage'),svg=document.querySelector('#wires');
  return Number(svg.getAttribute('width'))===stage.clientWidth&&Number(svg.getAttribute('height'))===stage.clientHeight;
});
async function withinCanvas(){
  const violations=await page.evaluate(()=>{
    const stage=document.querySelector('.stage').getBoundingClientRect();
    return [...document.querySelectorAll('.part:not([hidden]) .part-title,.part:not([hidden]) .pin-label,.part:not([hidden]) .press-button')].filter(n=>{const r=n.getBoundingClientRect();return r.left<stage.left-1||r.top<stage.top-1||r.right>stage.right+1||r.bottom>stage.bottom+1;}).map(n=>n.textContent);
  });assert.deepEqual(violations,[],'all component labels and controls remain inside canvas');
}
async function readableArrangement(){
  const overlaps=await page.evaluate(()=>{
    const overlap=(a,b)=>a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom;
    const parts=[...document.querySelectorAll('.part:not([hidden])')].map(part=>{
      const boxes=[...part.querySelectorAll('.part-title,.part-body,.pin-label,.press-button')].map(n=>n.getBoundingClientRect());
      return {id:part.dataset.part,left:Math.min(...boxes.map(b=>b.left)),right:Math.max(...boxes.map(b=>b.right)),top:Math.min(...boxes.map(b=>b.top)),bottom:Math.max(...boxes.map(b=>b.bottom))};
    });
    const collisions=parts.flatMap((a,i)=>parts.slice(i+1).filter(b=>overlap(a,b)).map(b=>a.id+' / '+b.id));
    const sensor=[...document.querySelectorAll('.virtual-sensor>*')].map(n=>n.getBoundingClientRect());
    if(sensor.some((a,i)=>sensor.slice(i+1).some(b=>overlap(a,b))))collisions.push('sensor text');
    return collisions;
  });assert.deepEqual(overlaps,[],'automatically arranged parts and sensor text do not overlap');
}
async function wireEndpoints(){
  const diffs=await page.evaluate(()=>{
    const wires=window.nexoraWorkshop.getState().wires,stage=document.querySelector('.stage').getBoundingClientRect();
    return [...document.querySelectorAll('.wire-visible')].flatMap((path,index)=>{
      const points=[path.getPointAtLength(0),path.getPointAtLength(path.getTotalLength())];
      return [wires[index].a,wires[index].b].map((id,j)=>{
        const r=document.querySelector(`[data-pin="${id}"]`)?.getBoundingClientRect();if(!r)return 0;
        return Math.hypot(points[j].x-(r.x+r.width/2-stage.x),points[j].y-(r.y+r.height/2-stage.y));
      });
    });
  });assert.ok(diffs.every(d=>d<1.5),'wires follow physical contacts after drag, resize and scrolling');
}
async function drag(id,to){
  const title=page.locator(`[data-part="${id}"] .part-title`);await title.scrollIntoViewIfNeeded();const b=await title.boundingBox();await page.mouse.move(b.x+10,b.y+b.height/2);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:12});await page.mouse.up();
}
try{
  await page.goto(`http://127.0.0.1:${port}`);await page.locator('body.workbench-open .cm-content').waitFor();
  const dimensions=await page.evaluate(()=>({board:document.querySelector('#board').clientWidth,stage:document.querySelector('.stage').clientWidth,svg:document.querySelector('#wires').getBoundingClientRect().width}));
  assert.ok(dimensions.board>1000);assert.equal(dimensions.stage,dimensions.board);assert.equal(dimensions.svg,dimensions.stage);
  const rows=await page.locator('.connection-instruction-row').evaluateAll(rows=>rows.map(row=>[...row.querySelectorAll('[data-pin-ref]')].map(b=>({id:b.dataset.pinRef,label:b.textContent}))));assert.equal(rows.length,8);
  for(const row of rows){for(const reference of row){assert.equal(await pin(reference.id).getAttribute('aria-label'),'Контакт '+reference.label);}}
  await page.locator('[data-pin-ref="button:1.l"]').click();assert.equal(await pin('button:1.l').innerText(),'1L');assert.equal(await pin('button:1.l').evaluate(n=>n.classList.contains('guide-highlight')),true);assert.match(await page.locator('#pin-help').innerText(),/верхний левый/);assert.equal((await state()).wires.length,0,'locating a contact never adds a wire');
  const labelBoxes=await page.locator('[data-part="button"] .pin-label').evaluateAll(ns=>ns.map(n=>{const r=n.getBoundingClientRect();return {text:n.textContent,x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
  for(let i=0;i<labelBoxes.length;i++)for(let j=i+1;j<labelBoxes.length;j++){const a=labelBoxes[i],b=labelBoxes[j];assert.ok(a.right<=b.x||b.right<=a.x||a.bottom<=b.y||b.bottom<=a.y,'button labels do not overlap');}
  for(const [a,b] of rows){await pin(a.id).click();await pin(b.id).click();}
  const before=await state();assert.equal(before.wires.length,8);assert.ok(inspectCircuit(before.wires).led);assert.ok(inspectSensor(before.wires).connected);
  console.log('PASS instruction names match physical contacts; all 8 connections assemble correctly');
  await page.locator('#board').scrollIntoViewIfNeeded();let b=await page.locator('#board').boundingBox();
  await drag('r',{x:b.x+b.width-190,y:b.y+80});
  assert.ok((await positions()).r.x>640,'right side beyond old 640px boundary is usable');
  b=await page.locator('#board').boundingBox();await drag('sensor',{x:b.x+b.width-20,y:b.y+b.height-20});
  assert.ok((await positions()).sensor.y>385,'bottom area beyond old boundary is usable');
  await withinCanvas();await wireEndpoints();
  const current=await positions();await page.locator('[data-part="r"] .part-title').focus();await page.keyboard.press('ArrowLeft');assert.equal((await positions()).r.x,current.r.x-8);
  const saved=await positions();await page.reload();await page.locator('body.workbench-open .cm-content').waitFor();assert.deepEqual(await positions(),saved,'layout survives reload');assert.equal((await state()).code,studentCode);assert.equal((await state()).wires.length,8);assert.equal((await state()).temperature,38);await wireEndpoints();
  await page.locator('#board').screenshot({path:`${out}/full-canvas.png`});
  console.log('PASS drag to right and bottom, keyboard move, attached wires and saved layout');
  await page.locator('#arrange-parts').click();assert.equal((await state()).code,studentCode);assert.deepEqual((await state()).wires,before.wires);await withinCanvas();await wireEndpoints();await readableArrangement();
  await page.screenshot({path:`${out}/desktop.png`,fullPage:true});
  await page.setViewportSize({width:1280,height:900});await canvasResized();await withinCanvas();await wireEndpoints();await readableArrangement();
  await page.setViewportSize({width:390,height:844});await canvasResized();await page.locator('[data-pin-ref="sensor:OUT"]').click();assert.ok(await page.locator('#board').evaluate(b=>b.scrollLeft>0),'reference scrolls phone canvas to the requested contact');assert.equal(await pin('sensor:OUT').evaluate(n=>n.classList.contains('guide-highlight')),true);await withinCanvas();await wireEndpoints();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'only the canvas scrolls horizontally');
  await readableArrangement();
  await page.locator('#board').screenshot({path:`${out}/phone.png`});
  await page.locator('.bb-toggle').click();await page.waitForFunction(()=>document.querySelector('#wires').getBoundingClientRect().height===1000);await page.getByRole('button',{name:'Отверстие A1',exact:true}).click();await page.getByRole('button',{name:'Отверстие F1',exact:true}).click();assert.equal((await state()).wires.length,9);await wireEndpoints();
  assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
  console.log('PASS arrange without resetting code/wires, responsive boundaries, mobile guide and full-height breadboard');
}catch(error){console.error('Browser errors',errors,'Failed assets',missing);await page.screenshot({path:`${out}/failure.png`,fullPage:true}).catch(()=>{});throw error;
}finally{await browser.close();server.kill();}
