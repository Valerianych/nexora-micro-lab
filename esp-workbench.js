import {espComponentMarkup} from './esp-components.js';
import {createProgramBuilder} from './program-builder.js';
import {EditorState} from '@codemirror/state';
import {EditorView,keymap,lineNumbers,highlightActiveLine,drawSelection} from '@codemirror/view';
import {defaultKeymap,history,historyKeymap,indentWithTab} from '@codemirror/commands';
import {cpp} from '@codemirror/lang-cpp';
import {bracketMatching,HighlightStyle,syntaxHighlighting,syntaxTree} from '@codemirror/language';
import {autocompletion,closeBrackets,closeBracketsKeymap,completionKeymap} from '@codemirror/autocomplete';
import {lintGutter,linter,setDiagnostics} from '@codemirror/lint';
import {tags} from '@lezer/highlight';
import {espMissions} from './career-cases.js';
import {moduleSpecs,espPinLabel,espPinName,validateEspWires} from './esp-hardware.js';
import {readProgress,writeProgress} from './progress.js';
import {artSource} from './story-media.js';

let root=null,editor=null,mission=null,wires=[],positions={},inputs={},selected=null,selectedWire=null;
let worker=null,requestId=0,timeout=null,saving=null,active=false,status='stopped',lastState=null,photoCount=-1;
let wireColor='#d74f58',resetArmed=false,programBuilder=null;
const $=id=>root?.querySelector(`#esp-${id}`);
const esc=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const basePositions={esp:{x:65,y:185},r:{x:440,y:80},led:{x:720,y:80},button:{x:445,y:570},battery:{x:400,y:50},driver:{x:680,y:50},imu:{x:405,y:300},range:{x:680,y:290},camera:{x:945,y:180},servo:{x:945,y:465}};
const size=id=>({width:id==='esp'?290:250,height:id==='esp'?410:200});
const code=()=>editor?.state.doc.toString()||'';
function drafts(){const value=readProgress().espWorkshop;return value&&typeof value==='object'?value:{};}
function save(){clearTimeout(saving);if(!active||!mission||!editor)return;writeProgress('espWorkshop',{...drafts(),[mission.index]:{code:code(),program:programBuilder?.snapshot(),wires,positions,inputs:{...inputs,button:false}}});}
function queueSave(){clearTimeout(saving);saving=setTimeout(save,180);}
window.addEventListener('pagehide',save);
document.addEventListener('visibilitychange',()=>{if(document.hidden){save();if(active)press(false);}});
export const isEspOpen=()=>active;
export const getEspState=()=>({mission:mission?.index,code:code(),program:programBuilder?.snapshot(),wires:structuredClone(wires),inputs:{...inputs},running:status==='running',state:lastState});
export function resetEspProgress(indices=null){
  clearTimeout(saving);const data=drafts();
  if(!indices)writeProgress('espWorkshop',{});
  else {for(const index of indices)delete data[index];writeProgress('espWorkshop',data);}
  if(active&&(!indices||indices.includes(mission.index))){stopEsp();active=false;root.hidden=true;document.body.classList.remove('esp-open');}
}
export function closeEspWorkshop(){if(active)save();stopEsp();active=false;if(root)root.hidden=true;document.body.classList.remove('esp-open');}
function message(text,kind=''){const out=$('messages');if(out){out.textContent=text;out.className=`esp-message ${kind}`;}}
function syncButtons(){if(!root)return;$('run').disabled=status!=='stopped';$('stop').disabled=status==='stopped';$('check').disabled=status==='checking';$('status').textContent={running:'Программа работает',starting:'Запуск…',checking:'Испытания…',stopped:'Остановлено'}[status];root.classList.toggle('is-checking',status==='checking');programBuilder?.setDisabled(status==='checking'||status==='starting');if($('button-press'))$('button-press').disabled=status==='checking';root.querySelectorAll('[data-input]').forEach(input=>input.disabled=status==='checking');}
export function stopEsp(){requestId++;clearTimeout(timeout);worker?.terminate();worker=null;status='stopped';inputs.button=false;if(root){$('press')?.classList.remove('held');$('press')?.setAttribute('aria-pressed','false');root.querySelector('.esp-part-led')?.classList.remove('is-lit');syncComponentVisuals({led:false,inputs:{button:false}});if(lastState){lastState={...lastState,led:false,motor:0,inputs:{...lastState.inputs,button:false}};renderState(lastState);}syncButtons();}}
function fail(error){stopEsp();message(error.message||String(error),'error');if(error.line&&editor){const n=Math.min(editor.state.doc.lines,Math.max(1,error.line)),line=editor.state.doc.line(n);editor.dispatch(setDiagnostics(editor.state,[{from:line.from,to:line.to,severity:'error',message:error.message}]));}}
function start(action){
  save();stopEsp();const issue=programBuilder?.problem();if(issue){message(issue,'error');return;}photoCount=-1;lastState=null;$('photos').replaceChildren();
  editor.dispatch(setDiagnostics(editor.state,[]));
  status=action==='check'?'checking':'starting';syncButtons();const id=requestId;
  message(action==='check'?'Приёмка проверяет разные входные данные на твоей схеме…':'Запускаю программу ESP32…');
  try {worker=new Worker(new URL('esp-worker.js',document.baseURI),{type:'module'});}catch(e){fail(e);return;}
  timeout=setTimeout(()=>{if(requestId===id)fail(Error('Программа не ответила вовремя. Проверь бесконечные циклы или попробуй запустить ещё раз.'));},action==='check'?60000:12000);
  worker.onerror=event=>{if(requestId===id)fail(Error('Исполнитель ESP32: '+(event.message||'не удалось загрузить модуль. Обнови страницу и повтори запуск.')));};
  worker.onmessage=({data})=>{
    if(data.requestId!==requestId)return;
    if(data.type==='running'){clearTimeout(timeout);status='running';syncButtons();message('Плата выполняет код. Изменяй входные данные и наблюдай результат.');}
    if(data.state)renderState(data.state);
    if(data.type==='progress')message(data.message);
    if(data.type==='error')fail(data);
    if(data.type==='complete'){
      const index=mission.index,name=mission.title,report=data.report;stopEsp();message(report.join('\n'),'success');
      window.dispatchEvent(new CustomEvent('nexora:mission-complete',{detail:{mission:index,name,signal:{count:3,report}}}));
    }
  };
  worker.postMessage({action,requestId:id,index:mission.index,source:code(),wires,inputs});
}
export const runEsp=()=>{if(active)start('run');};
export const checkEspWorkbench=()=>{if(active)start('check');};
function press(value){if(!active||status==='checking')return;inputs.button=value;$('press')?.classList.toggle('held',value);$('press')?.setAttribute('aria-pressed',String(value));syncComponentVisuals({led:lastState?.led||false,inputs});if(worker)worker.postMessage({action:'input',inputs});}
function paletteMarkup(){return ['#d74f58','#26394e','#3484c8','#7b50b5','#8b6b17'].map((color,i)=>`<button class="esp-color${color===wireColor?' is-selected':''}" data-color="${color}" style="--wire-color:${color}" aria-label="Цвет провода ${['красный','чёрный','синий','фиолетовый','жёлтый'][i]}" aria-pressed="${color===wireColor}"></button>`).join('');}
function reference(){
 return `<details class="esp-reference"><summary>Справочник платы и модулей</summary><p>GPIO в коде — число без букв. Логика 3,3 В; GPIO34 допускает только INPUT. Входы АЦП стенда: 32, 33, 34.</p>${mission.parts.map(id=>`<p><b>${moduleSpecs[id].name}.</b> ${moduleSpecs[id].description}</p>`).join('')}<h4>Команды</h4><dl><dt>pinMode(pin, INPUT_PULLUP)</dt><dd>Подтяжка входа. Замыкание кнопкой на GND даёт LOW.</dd><dt>analogRead(pin)</dt><dd>Число 0–4095. Напряжение батареи: raw × 3.3 / 4095 × 2.</dd><dt>ledcAttach(pin, 4000, 8)</dt><dd>В setup: частота ШИМ 4000 Гц, разрешение 8 бит.</dd><dt>ledcWrite(pin, duty)</dt><dd>Мощность 0–255. Пин должен быть подключён к PWM драйвера.</dd><dt>Wire.begin(sda, scl)</dt><dd>Пины общей шины I²C. Типовой вариант 21 и 22.</dd><dt>readTilt() / readDistance()</dt><dd>Угол (градусы) / расстояние (см). Нужны питание и работающая шина.</dd><dt>cameraBegin(cs)</dt><dd>Включить SPI-камеру. SCK 18, MISO 19, MOSI 23; отдельный CS.</dd><dt>servoWrite(pin, angle)</dt><dd>Повернуть камеру, затем дать ей время: delay(200).</dd><dt>cameraCapture()</dt><dd>Сохранить один модельный кадр текущего направления.</dd></dl>${mission.index===12?'<h4>Нажатие и удержание</h4><p>Сохрани предыдущее состояние в bool. Новое нажатие — это «сейчас нажата И раньше не была нажата». После обработки обнови прошлое состояние. Переменная должна сохраняться между вызовами loop.</p>':''}<p>Wire.h и NexoraModules.h подключают учебные драйверы стенда. Их функции моделируют модули; они не заменяют библиотеки реального оборудования.</p></details>`;
}
function controls(){
  return `${mission.parts.includes('button')?'<button id="esp-press" type="button" aria-pressed="false">Удерживать кнопку</button>':''}${[['battery','Батарея',3,4.2,.01,'В'],['tilt','Наклон',-45,45,1,'°'],['distance','Расстояние',0,200,1,'см']].filter(([key])=>mission.parts.includes({battery:'battery',tilt:'imu',distance:'range'}[key])).map(([key,label,min,max,step,unit])=>`<label>${label} <output id="esp-${key}-value">${inputs[key]} ${unit}</output><input id="esp-input-${key}" data-input="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${inputs[key]}" aria-label="${label}"></label>`).join('')}`;
}
function createEditor(source){
 const colors=HighlightStyle.define([{tag:tags.comment,color:'#a8bbac',fontStyle:'italic'},{tag:[tags.keyword,tags.controlKeyword],color:'#f0a6ee'},{tag:tags.typeName,color:'#77dbea'},{tag:tags.number,color:'#ffbe92'},{tag:tags.string,color:'#bbeb9b'},{tag:tags.variableName,color:'#b8d9fc'},{tag:tags.function(tags.variableName),color:'#ffd99a'},{tag:tags.operator,color:'#ffa3ac'}]);
 const names=['pinMode','digitalRead','digitalWrite','analogRead','delay','millis','ledcAttach','ledcWrite','Wire.begin','readTilt','readDistance','cameraBegin','servoWrite','cameraCapture','HIGH','LOW','OUTPUT','INPUT','INPUT_PULLUP'];
 editor=new EditorView({parent:$('editor'),state:EditorState.create({doc:source,extensions:[cpp(),lineNumbers(),history(),drawSelection(),highlightActiveLine(),bracketMatching(),closeBrackets(),lintGutter(),syntaxHighlighting(colors),keymap.of([...defaultKeymap,...historyKeymap,...closeBracketsKeymap,...completionKeymap,indentWithTab]),autocompletion({override:[context=>{if(mission.independent)return null;const word=context.matchBefore(/[\w.]+/);return word?{from:word.from,options:names.map(label=>({label,type:'function'}))}:null;}]}),linter(view=>{const errors=[];syntaxTree(view.state).iterate({enter(node){if(node.type.isError)errors.push({from:node.from,to:Math.min(view.state.doc.length,node.to),severity:'error',message:'Проверь синтаксис около этого места.'});}});return errors.slice(0,8);}),EditorView.updateListener.of(update=>{if(update.docChanged){if(status!=='stopped')stopEsp();queueSave();}}),EditorView.theme({'&':{backgroundColor:'#172334',color:'#edf3fa',height:'440px',fontSize:'14px'},'.cm-scroller':{fontFamily:'Consolas,monospace',overflow:'auto',lineHeight:'1.65'},'.cm-gutters':{backgroundColor:'#172334',color:'#a3b7ce',borderRight:'1px solid #405065'},'.cm-content':{padding:'14px 0',caretColor:'#c9f571'},'.cm-activeLine':{backgroundColor:'#293c52'},'.cm-selectionBackground':{backgroundColor:'#436078 !important'},'.cm-tooltip':{backgroundColor:'#233950',color:'#fff',border:'1px solid #67819b'},'.cm-tooltip-autocomplete ul li[aria-selected]':{backgroundColor:'#3d596e',color:'#fff'}},{dark:true})]})});
}
export function openEspWorkshop(index,options={}){
  if(active)save();stopEsp();programBuilder?.destroy();programBuilder=null;editor?.destroy();mission=espMissions.find(m=>m.index===index);if(!mission)return;
  const draft=options.reset?null:drafts()[index];
  wires=validateEspWires(draft?.wires,mission.parts);positions={};for(const part of mission.parts){const p=draft?.positions?.[part];positions[part]=p&&Number.isFinite(p.x)&&Number.isFinite(p.y)?{x:Math.max(10,Math.min(1300,p.x)),y:Math.max(35,Math.min(850,p.y))}:{...basePositions[part]};}
  inputs={button:false,battery:4.1,tilt:0,distance:120};for(const [key,min,max] of [['battery',3,4.2],['tilt',-45,45],['distance',0,200]])if(Number.isFinite(draft?.inputs?.[key]))inputs[key]=Math.max(min,Math.min(max,draft.inputs[key]));
  selected=null;selectedWire=null;lastState=null;photoCount=-1;resetArmed=false;
  if(!root){root=document.createElement('main');root.id='esp-workbench';root.setAttribute('aria-label','Верстак ESP32');document.body.append(root);}
  root.hidden=false;root.className=mission.independent?'is-independent':'';
  root.innerHTML=`<header class="esp-backbar"><button id="esp-back">← Вернуться в дело</button><span><small>АРКА II · ДЕЛО ${mission.id}</small><b>${mission.title}</b></span><span class="esp-model-label">Учебная модель ESP32</span></header><div class="esp-layout"><aside class="esp-task"><span class="eyebrow">${mission.independent?'САМОСТОЯТЕЛЬНАЯ ПРИЁМКА':'ПОЛЕВЫЕ СИСТЕМЫ'}</span><h1>${mission.repair.title}</h1><p>${mission.evidence.text}</p><div class="esp-requirements"><b>Требования к результату</b><p>${mission.evidence.detail}</p><ul>${mission.evidence.values.map(value=>`<li>${value}</li>`).join('')}</ul></div>${mission.independent?'<p class="esp-independent-note">Собери схему и алгоритм из готовых команд. Можно выбрать самостоятельный режим C++.</p>':reference()}<button class="accent" id="esp-check">Проверить устройство</button><button id="esp-reset">Начать это устройство заново</button><p class="esp-model-note">Стенд выполняет учебное подмножество Arduino C++. Соединения, датчики, привод и снимки моделируются; это не эмуляция процессора или физики полёта.</p></aside><section class="esp-circuit"><div class="esp-circuit-head"><h2>Собери систему</h2><div class="esp-palette">${paletteMarkup()}</div><button id="esp-undo">↶ Удалить последний провод</button></div><p class="esp-pin-help" id="esp-pin-help">Провод: нажми на один контакт, затем на другой. Детали можно двигать за заголовок. Нажми на провод, чтобы удалить его.</p><div id="esp-board"><div id="esp-stage"><svg id="esp-wires" aria-label="Соединения компонентов"></svg><div id="esp-wire-tools" hidden></div></div></div><div class="esp-inputs">${controls()}</div><div class="esp-telemetry" aria-live="off"><span id="esp-status">Остановлено</span><span id="esp-time">0,00 с</span><span id="esp-output">Подключи компоненты</span></div><section class="esp-survey" ${mission.parts.includes('camera')?'':'hidden'}><div class="esp-survey-head"><h3>Отчёт камеры</h3><span id="esp-survey-status">Снимков пока нет</span></div><div id="esp-photos"></div><p>Здесь появятся модельные кадры только после вызова cameraCapture() в твоей программе. 45° — вход, 90° — кровля, 135° — водосброс.</p></section></section><section class="esp-code-panel"><div class="esp-code-head"><h2>Программа</h2><small>sketch.ino</small></div><p>${mission.independent?'Собери алгоритм из готовых команд. Во вкладке C++ можно писать самостоятельно.':'Подсветка и ошибки синтаксиса. Проверка исполнения — при запуске.'}</p><div id="esp-program-builder"></div><div id="esp-editor"></div><div class="esp-code-actions"><button id="esp-run" class="accent">▶ Запустить</button><button id="esp-stop" disabled>■ Стоп</button></div><h3>Сообщения платы</h3><pre id="esp-messages" class="esp-message" role="status">${draft?'Черновик восстановлен.':'Схема пока пуста. Подключи модули и подготовь программу.'}</pre><button id="esp-download">↓ Скачать учебную программу .ino</button></section></div>`;
  active=true;document.body.classList.add('workbench-open','esp-open');
  createEditor(typeof draft?.code==='string'?draft.code.slice(0,24000):mission.code);
  if(mission.independent)programBuilder=createProgramBuilder({mount:$('program-builder'),kind:'esp32',saved:draft?.program,readCode:code,writeCode:value=>{if(code()!==value)editor.dispatch({changes:{from:0,to:editor.state.doc.length,insert:value}});},onMode:mode=>{$('editor').hidden=mode==='blocks';root.querySelector('.esp-code-panel').classList.toggle('uses-blocks',mode==='blocks');if(mode==='code')requestAnimationFrame(()=>editor.requestMeasure());},onChange:queueSave,beforeChange:stopEsp});
  renderParts();renderWires();syncButtons();
  $('back').onclick=()=>document.getElementById('return-quest').click();$('run').onclick=runEsp;$('stop').onclick=()=>{stopEsp();message('Выполнение остановлено.');};$('check').onclick=checkEspWorkbench;
  $('reset').onclick=()=>{if(!resetArmed){resetArmed=true;$('reset').textContent='Подтвердить очистку кода и проводов';return;}resetEspProgress([index]);openEspWorkshop(index,{reset:true});save();};
  $('undo').onclick=()=>{if(status==='checking')return;stopEsp();wires.pop();selectedWire=null;renderWires();queueSave();};
  root.querySelectorAll('[data-color]').forEach(button=>button.onclick=()=>{wireColor=button.dataset.color;root.querySelectorAll('[data-color]').forEach(b=>{b.classList.toggle('is-selected',b===button);b.setAttribute('aria-pressed',String(b===button));});});
  root.querySelectorAll('[data-input]').forEach(input=>input.oninput=()=>{if(status==='checking')return;const key=input.dataset.input;inputs[key]=Number(input.value);$(`${key}-value`).textContent=`${inputs[key]} ${{battery:'В',tilt:'°',distance:'см'}[key]}`;worker?.postMessage({action:'input',inputs});queueSave();});
  for(const target of [$('press'),$('button-press')])if(target)bindPress(target);
  $('download').onclick=()=>{const url=URL.createObjectURL(new Blob(['// Учебный стенд NEXORA ESP32. NexoraModules.h — модельные драйверы.\n'+code()],{type:'text/plain;charset=utf-8'}));const a=Object.assign(document.createElement('a'),{href:url,download:`nexora-case-${mission.id}.ino`});a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  root.scrollIntoView({block:'start'});requestAnimationFrame(renderWires);queueSave();
  window.dispatchEvent(new CustomEvent('nexora:mission-change',{detail:{mission:index,name:mission.title}}));
}
function renderParts(){
  const stage=$('stage');stage.querySelectorAll('.esp-part').forEach(part=>part.remove());
  for(const id of mission.parts){const spec=moduleSpecs[id],part=document.createElement('section'),p=positions[id],s=size(id);part.className=`esp-part esp-part-${id}`;part.dataset.part=id;part.style.cssText=`left:${p.x}px;top:${p.y}px;width:${s.width}px;height:${s.height}px`;
    const pins=id==='esp'?['3V3','GND','5V','34','33','32','27','26','25','23','22','21','19','18','5']:spec.pins;
    part.innerHTML=`<button class="esp-part-handle" type="button" aria-label="Переместить ${spec.name}">${spec.name}</button>${espComponentMarkup(id)}${id==='button'?'<button type="button" id="esp-button-press" class="esp-button-press" aria-label="Нажать кнопку на схеме" aria-pressed="false"></button>':''}<span class="esp-part-value" id="esp-part-value-${id}"></span>${pins.map((pin,i)=>{const isEsp=id==='esp',col=isEsp?(i<8?0:1):i%2,row=isEsp?(i<8?i:i-8):Math.floor(i/2),x=col?s.width-14:14,y=(isEsp?86:90)+row*(isEsp?37:34);return `<button type="button" class="esp-pin ${col?'is-right':'is-left'}" data-pin="${id}:${pin}" style="left:${x}px;top:${y}px" title="${esc(espPinName(`${id}:${pin}`))}" aria-label="Контакт ${esc(espPinName(`${id}:${pin}`))}"><i></i><span>${esc(espPinLabel(`${id}:${pin}`))}</span></button>`;}).join('')}`;
    stage.append(part);part.querySelectorAll('.esp-pin').forEach(pin=>pin.onclick=()=>selectPin(pin.dataset.pin));
    const handle=part.querySelector('.esp-part-handle');handle.onpointerdown=e=>{if(status==='checking')return;e.preventDefault();handle.setPointerCapture(e.pointerId);const x=e.clientX,y=e.clientY,start={...positions[id]};handle.onpointermove=event=>{positions[id]={x:Math.max(12,Math.min(stage.clientWidth-s.width-12,start.x+event.clientX-x)),y:Math.max(12,Math.min(stage.clientHeight-s.height-12,start.y+event.clientY-y))};part.style.left=positions[id].x+'px';part.style.top=positions[id].y+'px';renderWires();};handle.onpointerup=handle.onpointercancel=()=>{handle.onpointermove=null;queueSave();};};
    handle.onkeydown=e=>{const delta={ArrowLeft:[-12,0],ArrowRight:[12,0],ArrowUp:[0,-12],ArrowDown:[0,12]}[e.key];if(!delta)return;e.preventDefault();positions[id]={x:Math.max(12,Math.min(stage.clientWidth-s.width-12,positions[id].x+delta[0])),y:Math.max(12,Math.min(stage.clientHeight-s.height-12,positions[id].y+delta[1]))};part.style.left=positions[id].x+'px';part.style.top=positions[id].y+'px';renderWires();queueSave();};
  }
}
function selectPin(id){
  if(status==='checking')return;
  selectedWire=null;
  if(selected&&selected!==id){if(!wires.some(w=>w.a===selected&&w.b===id||w.a===id&&w.b===selected)){stopEsp();wires.push({a:selected,b:id,color:wireColor});queueSave();}selected=null;}
  else selected=selected===id?null:id;
  $('pin-help').textContent=selected?`Выбран ${espPinName(selected)}. Теперь выбери второй контакт.`:'Провод: выбери два контакта. Удаление: нажми на провод. Детали перемещаются за заголовок.';
  root.querySelectorAll('.esp-pin').forEach(pin=>{pin.classList.toggle('is-selected',pin.dataset.pin===selected);pin.setAttribute('aria-pressed',String(pin.dataset.pin===selected));});renderWires();
}
function point(id){const pin=root.querySelector(`[data-pin="${id}"]`),stage=$('stage');if(!pin)return null;const p=pin.getBoundingClientRect(),s=stage.getBoundingClientRect();return {x:p.left-s.left+p.width/2,y:p.top-s.top+p.height/2};}
function renderWires(){
 if(!active)return;const svg=$('wires');svg.replaceChildren();svg.setAttribute('viewBox',`0 0 ${$('stage').clientWidth} ${$('stage').clientHeight}`);
 wires.forEach((wire,index)=>{const a=point(wire.a),b=point(wire.b);if(!a||!b)return;const group=document.createElementNS('http://www.w3.org/2000/svg','g');group.classList.add('esp-wire');group.setAttribute('tabindex','0');group.setAttribute('role','button');group.setAttribute('aria-label',`Провод: ${espPinName(wire.a)} — ${espPinName(wire.b)}. Нажми, чтобы удалить.`);const bend=Math.max(40,Math.abs(a.x-b.x)/2),d=`M${a.x},${a.y} C${a.x+bend},${a.y} ${b.x-bend},${b.y} ${b.x},${b.y}`;
 for(const [width,color] of [[15,'transparent'],[5,'#9bb3c477'],[selectedWire===index?6:3,wire.color]]){const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',d);path.setAttribute('stroke',color);path.setAttribute('stroke-width',width);path.setAttribute('fill','none');group.append(path);}
 const choose=()=>{selectedWire=index;const tools=$('wire-tools');tools.hidden=false;tools.style.left=Math.min(Math.max(10,(a.x+b.x)/2),$('stage').clientWidth-380)+'px';tools.style.top=Math.max(10,(a.y+b.y)/2-30)+'px';tools.innerHTML=`<b>${esc(espPinName(wire.a))} → ${esc(espPinName(wire.b))}</b><button type="button" id="esp-wire-delete">Удалить провод</button><button type="button" id="esp-wire-cancel" aria-label="Снять выбор">×</button>`;$('wire-delete').onclick=()=>{if(status==='checking')return;stopEsp();wires.splice(selectedWire,1);selectedWire=null;renderWires();queueSave();};$('wire-cancel').onclick=()=>{selectedWire=null;renderWires();};renderSelection();};
 group.onclick=choose;group.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();choose();}};svg.append(group);
 });if(selectedWire===null)$('wire-tools').hidden=true;
}
function renderSelection(){root.querySelectorAll('.esp-wire').forEach((g,i)=>g.classList.toggle('is-selected',i===selectedWire));}
function renderState(state){lastState=state;$('time').textContent=(state.time/1000).toFixed(2)+' с';$('output').textContent=mission.parts.includes('driver')?`Привод: ${Math.round(state.motor)}/255`:mission.parts.includes('led')?`Свет: ${state.led?'включён':'выключен'}`:`Камера: ${state.angle}°`;
 const values={battery:`${state.inputs.battery.toFixed(2)} В`,driver:`ШИМ ${Math.round(state.motor)}/255`,imu:`${state.inputs.tilt}°`,range:`${state.inputs.distance} см`,servo:`${state.angle}°`,camera:`${state.photos.length} кадров`,led:state.led?'ВКЛ':'ВЫКЛ',button:state.inputs.button?'НАЖАТА':'ОТПУЩЕНА'};
 for(const [id,value] of Object.entries(values)){const target=$(`part-value-${id}`);if(target)target.textContent=value;}
 root.querySelector('.esp-part-led')?.classList.toggle('is-lit',state.led);syncComponentVisuals(state);
 if(state.serial)$('messages').textContent=state.serial;
 if(mission.parts.includes('camera'))$('survey-status').textContent=`Кадров: ${state.photos.length} · привод ${Math.round(state.motor)}/255`;
 if(photoCount!==state.photos.length){photoCount=state.photos.length;$('survey-status').textContent=`Кадров: ${photoCount} · привод ${Math.round(state.motor)}/255`;$('photos').innerHTML=state.photos.slice(-9).map(photo=>{const panel=photo.angle<68?0:photo.angle<113?1:2;return `<figure><div class="esp-photo comic-sheet panel-${panel}"><img src="${artSource('camera-stills','thumb')}" alt="Модельный снимок ${['входа','кровли','водосброса'][panel]}" width="720" height="405"></div><figcaption>Кадр ${photo.id} · ${photo.angle}° · ${(photo.time/1000).toFixed(2)} с</figcaption></figure>`;}).join('');}
}

function bindPress(button){
 button.onpointerdown=e=>{e.preventDefault();button.setPointerCapture(e.pointerId);press(true);};
 button.onpointerup=button.onpointercancel=()=>press(false);
 button.onkeydown=e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();press(true);}};
 button.onkeyup=e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();press(false);}};
 button.onblur=()=>press(false);
}
function syncComponentVisuals(state){
 const led=root?.querySelector('wokwi-led'),button=root?.querySelector('wokwi-pushbutton'),servo=root?.querySelector('wokwi-servo');
 if(led)led.value=Boolean(state.led);if(button)button.pressed=Boolean(state.inputs?.button);
 if(servo&&Number.isFinite(state.angle))servo.angle=state.angle;
 $('button-press')?.setAttribute('aria-pressed',String(Boolean(state.inputs?.button)));
}
