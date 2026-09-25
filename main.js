import '@wokwi/elements/dist/esm/arduino-uno-element.js';
import '@wokwi/elements/dist/esm/led-element.js';
import '@wokwi/elements/dist/esm/resistor-element.js';
import '@wokwi/elements/dist/esm/pushbutton-element.js';
import {Emulator,inspectCircuit,inspectSensor} from './engine.js';
import {missions} from './lessons.js';
import {componentNames,pinLabel,displayPin,pinDescription,connectionMarkup,ledConnections} from './circuit-labels.js';
import {readProgress, writeProgress, restoreWorkshop, clearWorkshop} from './progress.js';
import {analyzeSiren} from './case-two.js';
import {arduinoWords,serialWords,analyzeSketch,compilerDiagnostics,sketchSymbols} from './arduino-language.js';
import {Compartment,EditorState} from '@codemirror/state';
import {EditorView,drawSelection,highlightActiveLine,keymap,lineNumbers,highlightSpecialChars,placeholder} from '@codemirror/view';
import {defaultKeymap,history,historyKeymap,indentWithTab} from '@codemirror/commands';
import {bracketMatching,defaultHighlightStyle,HighlightStyle,indentOnInput,syntaxHighlighting} from '@codemirror/language';
import {autocompletion,closeBrackets,closeBracketsKeymap,completionKeymap,snippetCompletion} from '@codemirror/autocomplete';
import {lintGutter,linter,setDiagnosticsEffect} from '@codemirror/lint';
import {tags} from '@lezer/highlight';
import {cpp} from '@codemirror/lang-cpp';

const $=id=>document.getElementById(id), make=(tag,attrs={})=>Object.assign(document.createElement(tag),attrs);
const palette=['#e04f50','#2f3545','#3985c9','#65a947','#bf8a2e'];
let wires=[],selected=null,color=palette[0],mission=0,step=0,running=false,busy=false,sim=null,raf=0,compileWorker=null,cancelCompile=null,runId=0,lastHex=null,lastSource='',completed=new Set(),testRunning=false,serialText='';
const pins=new Map(),parts=new Map();
const FREE=missions.length;
let breadboard=false;
let workbenchMode='repair',drafts={},savingReady=false,restoringDraft=false,draftSaveTimer;
let temperature=25;
let layoutReady=false,layoutWidth=0;
const sensorPins=[{name:'VCC',x:16,y:14},{name:'GND',x:16,y:58},{name:'OUT',x:105,y:36}];
function saveWorkshop(){
  clearTimeout(draftSaveTimer);
  if(!savingReady||restoringDraft)return;
  const key=workbenchMode==='observe'?'3-observe':mission;
  drafts[key]={code:currentCode(),wires:wires.map(w=>({...w})),breadboard,temperature,step,positions:layoutReady?capturePositions():drafts[key]?.positions,canvasWidth:layoutWidth||drafts[key]?.canvasWidth};
  writeProgress('workshop',{drafts,completed:[...completed],activeIndex:mission,mode:workbenchMode});
}
function queueDraftSave(){if(!savingReady||restoringDraft)return;clearTimeout(draftSaveTimer);draftSaveTimer=setTimeout(saveWorkshop,180);}
window.addEventListener('pagehide',saveWorkshop);
document.addEventListener('visibilitychange',()=>{if(document.hidden)saveWorkshop();});
const board=$('board');const stage=make('div',{className:'stage'});board.append(stage);stage.append($('wires'));stage.append(board.querySelector('.board-hint'));
const svg=$('wires');
board.after(stage.querySelector('.board-hint'));
const pinHelp=make('div',{id:'pin-help',className:'pin-help',textContent:'Нажми на название контакта в инструкции — он подсветится на схеме.'});
pinHelp.setAttribute('role','status');board.before(pinHelp);
let selectedWire=null;
const wireTools=make('div',{className:'wire-tools',hidden:true});
wireTools.setAttribute('role','group');wireTools.setAttribute('aria-label','Выбранный провод');
const wireName=make('strong');
const wireDelete=make('button',{id:'delete-selected-wire',textContent:'Удалить провод'});
const wireCancel=make('button',{textContent:'×',ariaLabel:'Снять выбор провода'});
wireTools.append(wireName,wireDelete,wireCancel);stage.append(wireTools);
wireDelete.onclick=()=>removeWire(selectedWire);
wireCancel.onclick=()=>chooseWire(null);
board.addEventListener('click',event=>{if(!event.target.closest('.wire-tools,.wire-group'))chooseWire(null);});
const codeField=$('code'),codeMount=$('code-editor'),codeEditable=new Compartment();
let codeView=null,compileDiags=[];

const arduinoHighlight=HighlightStyle.define([
  {tag:tags.comment,color:'#a2b59c',fontStyle:'italic'},
  {tag:[tags.keyword,tags.controlKeyword],color:'#eea3ee',fontWeight:'700'},
  {tag:[tags.typeName,tags.definition(tags.typeName)],color:'#74d6ed',fontWeight:'650'},
  {tag:[tags.function(tags.variableName),tags.labelName],color:'#ffd38a'},
  {tag:tags.variableName,color:'#a9d4ff'},
  {tag:tags.number,color:'#ffb98e'},
  {tag:tags.bool,color:'#eea3ee',fontWeight:'700'},
  {tag:tags.string,color:'#a8dfac'},
  {tag:tags.operator,color:'#f7ada7'},
]);
const editorTheme=EditorView.theme({
  '&':{height:'100%',fontSize:'14px',background:'#172334',color:'#e8eff5'},
  '.cm-scroller':{fontFamily:'Consolas,Monaco,monospace',lineHeight:'1.65',overflow:'auto'},
  '.cm-content':{padding:'16px 0 22px',caretColor:'#c8f36b'},
  '.cm-line':{padding:'0 16px 0 10px'},
  '.cm-gutters':{background:'#172334',color:'#718296',border:0,borderRight:'1px solid #314256',minWidth:'40px'},
  '.cm-activeLine':{background:'#21334688'},
  '.cm-activeLineGutter':{background:'#25394c',color:'#c8f36b'},
  '.cm-selectionBackground, ::selection':{background:'#46657d99 !important'},
  '.cm-matchingBracket':{background:'#c8f36b55',outline:'1px solid #c8f36b'},
  '.cm-tooltip':{border:'1px solid #4a6178',background:'#192b3d',color:'#edf4f6',borderRadius:'7px',boxShadow:'0 12px 30px #0005'},
  '.cm-tooltip-autocomplete ul li[aria-selected]':{background:'#2d465b',color:'#fff'},
  '.cm-diagnostic':{padding:'5px 8px'},
  '.cm-diagnostic-error':{borderLeft:'3px solid #ef8d68'},
  '.cm-diagnostic-warning':{borderLeft:'3px solid #e4c15e'},
  '.cm-lintRange-error':{backgroundImage:'none',borderBottom:'2px wavy #ef8d68'},
  '.cm-lintRange-warning':{backgroundImage:'none',borderBottom:'2px wavy #e4c15e'},
  '.cm-lintPoint-error:after':{borderBottomColor:'#ef8d68'},
  '.cm-lintPoint-warning:after':{borderBottomColor:'#e4c15e'},
},{dark:true});

const builtinCompletionItems=[...arduinoWords,...serialWords].map(([label,type,detail,info,template])=>template?snippetCompletion(template,{label,type,detail,info}):{label,type,detail,info});
function completionSource(context){
  const word=context.matchBefore(/[A-Za-z_]\w*$/);const dotted=context.matchBefore(/[A-Za-z_]\w*(?:\.[A-Za-z_]?\w*)?$/);const token=dotted||word;
  if(!token||token.from===token.to&&!context.explicit)return null;
  const typed=token.text;const isSerial=typed.startsWith('Serial.');const options=isSerial?builtinCompletionItems.filter(item=>['begin','print','println'].includes(item.label)):builtinCompletionItems;
  const symbols=sketchSymbols(codeField.value).map(item=>({label:item.label,type:item.type,detail:item.detail,info:item.info}));
  return {from:isSerial?token.from+'Serial.'.length:token.from,options:[...options,...symbols],validFor:/^[\w.]*$/};
}
function currentCode(){return codeView?codeView.state.doc.toString():codeField.value;}
function renderCodeHints(diagnostics){
  const box=$('code-hints');if(!box)return;
  box.replaceChildren();
  if(!diagnostics.length){const ok=make('span',{className:'code-ok',textContent:'✓ Синтаксис выглядит правильно. Можно запускать программу.'});box.append(ok);return;}
  const label=make('span',{className:'code-hints-label',textContent:`Подсказки редактора · ${diagnostics.length}`});box.append(label);
  diagnostics.slice(0,4).forEach(d=>{const item=make('div',{className:`code-hint ${d.severity}`});const line=currentCode().slice(0,d.from).split('\n').length;item.innerHTML=`<b>строка ${line}</b><span>${d.message}</span>`;box.append(item);});
}
function showCodeDiagnostics(diagnostics){
  renderCodeHints(diagnostics);
  if(codeView)codeView.dispatch({effects:setDiagnosticsEffect.of(diagnostics)});
}
function setCodeEditable(value){
  codeField.readOnly=!value;
  if(codeView)codeView.dispatch({effects:codeEditable.reconfigure(EditorView.editable.of(value))});
}
function setSource(source){
  codeField.value=source;
  if(codeView&&currentCode()!==source)codeView.dispatch({changes:{from:0,to:codeView.state.doc.length,insert:source}});
  compileDiags=[];showCodeDiagnostics(analyzeSketch(source));
}
function initCodeEditor(){
  if(!codeMount||!codeField)return;
  codeView=new EditorView({
    state:EditorState.create({doc:codeField.value,extensions:[
      codeEditable.of(EditorView.editable.of(true)),cpp(),lineNumbers(),highlightSpecialChars(),history(),drawSelection(),bracketMatching(),closeBrackets(),indentOnInput(),syntaxHighlighting(defaultHighlightStyle,{fallback:true}),syntaxHighlighting(arduinoHighlight),editorTheme,highlightActiveLine(),
      keymap.of([...closeBracketsKeymap,...completionKeymap,...defaultKeymap,...historyKeymap,indentWithTab]),
      autocompletion({override:[completionSource],activateOnTyping:true,defaultKeymap:true,maxRenderedOptions:12}),
      linter(view=>[...analyzeSketch(view.state.doc.toString()),...compileDiags],{delay:550}),lintGutter(),placeholder('Напиши программу Arduino…'),
      EditorView.updateListener.of(update=>{if(!update.docChanged)return;codeField.value=update.state.doc.toString();compileDiags=[];showCodeDiagnostics(analyzeSketch(codeField.value));if(running||busy)stop();queueDraftSave();}),
    ]}),parent:codeMount,
  });
  codeField.hidden=true;showCodeDiagnostics(analyzeSketch(codeField.value));
}
const menu=make('select',{id:'mission-select',ariaLabel:'Выбрать миссию'});
for(let i=0;i<missions.length;i++)menu.append(make('option',{value:String(i),textContent:`0${i+1} · ${missions[i].short}`}));
menu.append(make('option',{value:String(FREE),textContent:'Свободная мастерская'}));
document.querySelector('.lesson').prepend(menu);
menu.onchange=()=>loadMission(Number(menu.value));
const badge=make('span',{className:'led-readout',textContent:'Светодиод: выключен'});document.querySelector('.workspace-head').append(badge);
const partSpecs=[
 {id:'uno',tag:'wokwi-arduino-uno',label:'ARDUINO UNO',x:24,y:125,w:275,h:202,scale:1,pins:['13','12','2','5V','GND.2','A0']},
 {id:'r',tag:'wokwi-resistor',label:'РЕЗИСТОР · 220 Ω',x:377,y:72,w:120,h:25,scale:1.8},
 {id:'led',tag:'wokwi-led',label:'СВЕТОДИОД',x:515,y:165,w:72,h:80,scale:1.8},
 {id:'button',tag:'wokwi-pushbutton',label:'КНОПКА',x:407,y:272,w:102,h:75,scale:1.3},
 {id:'sensor',tag:'div',label:'ДАТЧИК TMP36',x:520,y:285,w:116,h:92,scale:1,virtualPins:sensorPins},
];

function feedback(text,type=''){const el=$('feedback');el.textContent=text;el.className='feedback '+type;}
function log(text){$('console').textContent=text;}
function setLight(data){parts.get('led').element.value=data.led;parts.get('uno').element.led13=data.led13;badge.textContent='Светодиод: '+(data.led?'включён':'выключен');badge.classList.toggle('lit',data.led);}

for(const spec of partSpecs){
 const part=make('div',{className:'part'});part.dataset.part=spec.id;part.style.left=spec.x+'px';part.style.top=spec.y+'px';part.style.width=spec.w+'px';
 const title=make('span',{className:'part-title',textContent:componentNames[spec.id]});title.tabIndex=0;title.setAttribute('aria-label',componentNames[spec.id]+'. Перемещение: стрелки клавиатуры');
 const body=make('div',{className:'part-body'});body.style.width=spec.w+'px';body.style.height=spec.h+'px';
 const element=document.createElement(spec.tag);element.style.transform=`scale(${spec.scale})`;element.style.transformOrigin='top left';element.style.display='block';element.style.width='max-content';
 if(spec.id==='sensor'){element.className='virtual-sensor';element.innerHTML='<strong>TMP36</strong><span class="sensor-reading">25 °C</span><small>ползунок над схемой</small>';element.style.display='grid';element.style.width='116px';element.style.height='92px';}
 if(spec.id==='r')element.value='220';if(spec.id==='led')element.color='green';if(spec.id==='button'){element.color='green';element.addEventListener('button-press',()=>press(true));element.addEventListener('button-release',()=>press(false));}
 body.append(element);part.append(title,body);stage.append(part);parts.set(spec.id,{part,body,element,spec});
 for(const pin of (element.pinInfo||spec.virtualPins||[]).filter(p=>!spec.pins||spec.pins.includes(p.name))){
   const id=spec.id+':'+pin.name,btn=make('button',{className:'pin',title:displayPin(id)+'. '+pinDescription(id)});btn.dataset.pin=id;btn.setAttribute('aria-label','Контакт '+displayPin(id));btn.setAttribute('aria-pressed','false');btn.setAttribute('aria-describedby','pin-help');
   btn.style.left=pin.x*spec.scale+'px';btn.style.top=pin.y*spec.scale+'px';
   const label=make('span',{className:'pin-label',textContent:pinLabel(id)});btn.append(label);btn.onclick=()=>pickPin(id);body.append(btn);pins.set(id,{btn,part:spec.id});
   if(spec.id==='button')btn.classList.add(pin.name.endsWith('.l')?'label-left':'label-right');
   if(spec.id==='sensor')btn.classList.add(pin.name==='OUT'?'label-right':'label-left');
   if(spec.id==='led')btn.classList.add(pin.name==='C'?'label-left':'label-right');
   if(spec.id==='sensor')btn.classList.add('sensor-pin');
   if(spec.id==='uno' && pin.y<100){btn.classList.add('top-pin');if(pin.name==='12'){btn.classList.add('second-row');btn.style.top='-22px';}}
   if(spec.id==='uno' && pin.name==='5V'){btn.classList.add('power-pin');btn.style.top='224px';}
   if(spec.id==='led'&&pin.name==='C')btn.classList.add('led-cathode');
 }
 if(spec.id==='button'){const btn=make('button',{className:'press-button',textContent:'Удерживать кнопку'});part.append(btn);btn.onpointerdown=e=>{btn.setPointerCapture(e.pointerId);press(true);};btn.onpointerup=btn.onpointercancel=()=>press(false);btn.onkeydown=e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();press(true);}};btn.onkeyup=e=>{if(e.key===' '||e.key==='Enter')press(false);};btn.onblur=()=>press(false);}
 let drag=null;
 title.onpointerdown=e=>{if(e.button!==0)return;chooseWire(null);drag={x:e.clientX,y:e.clientY,left:parseFloat(part.style.left),top:parseFloat(part.style.top),bounds:partExtents(part)};title.setPointerCapture(e.pointerId);};
 title.onpointermove=e=>{if(!drag)return;placePart(part,drag.left+e.clientX-drag.x,drag.top+e.clientY-drag.y,drag.bounds);drawWires();};
 title.onpointerup=title.onpointercancel=()=>{drag=null;queueDraftSave();};
 title.onkeydown=e=>{const v={ArrowUp:[0,-8],ArrowDown:[0,8],ArrowLeft:[-8,0],ArrowRight:[8,0]}[e.key];if(v){e.preventDefault();chooseWire(null);placePart(part,parseFloat(part.style.left)+v[0],parseFloat(part.style.top)+v[1]);drawWires();queueDraftSave();}};
}

function capturePositions(){return Object.fromEntries([...parts].map(([id,{part}])=>[id,{x:parseFloat(part.style.left),y:parseFloat(part.style.top)}]));}
function partExtents(part){
  const rect=part.getBoundingClientRect();let left=0,top=0,right=part.offsetWidth,bottom=part.offsetHeight;
  for(const node of part.querySelectorAll('.part-title,.pin,.pin-label,.press-button,.part-body>:first-child')){
    const box=node.getBoundingClientRect();if(!box.width||!box.height)continue;
    left=Math.min(left,box.left-rect.left);top=Math.min(top,box.top-rect.top);right=Math.max(right,box.right-rect.left);bottom=Math.max(bottom,box.bottom-rect.top);
  }
  return {left,top,right,bottom};
}
function placePart(part,x,y,bounds=partExtents(part)){
  if(board.clientWidth&&stage.clientHeight&&!part.hidden){
    x=Math.max(12-bounds.left,Math.min(stage.clientWidth-12-bounds.right,x));
    y=Math.max(12-bounds.top,Math.min(stage.clientHeight-12-bounds.bottom,y));
  }
  part.style.left=x+'px';part.style.top=y+'px';
}
function applyPositions(positions){
  for(const [id,position] of Object.entries(positions||{})){
    if(parts.has(id)&&Number.isFinite(position.x)&&Number.isFinite(position.y)){
      const {part}=parts.get(id);part.style.left=position.x+'px';part.style.top=position.y+'px';
    }
  }
}
function arrangeParts(){
  const width=stage.clientWidth||760;
  const defaults={uno:{x:36,y:155},r:{x:Math.max(355,width*.46),y:68},led:{x:width-158,y:115},button:{x:Math.max(390,width*.52),y:325},sensor:{x:width-165,y:355}};
  applyPositions(defaults);layoutWidth=width;layoutReady=board.clientWidth>0;chooseWire(null);
  if(layoutReady)refreshCanvas();
}
function refreshCanvas(){
  if(!board.clientWidth||!stage.clientHeight)return;
  if(!layoutReady){arrangeParts();return;}
  const width=stage.clientWidth;
  for(const {part} of parts.values()){
    const bounds=partExtents(part);let x=parseFloat(part.style.left);
    if(layoutWidth&&width!==layoutWidth){
      const min=12-bounds.left,oldRange=layoutWidth-12-bounds.right-min,newRange=width-12-bounds.right-min;
      const fraction=oldRange>0?Math.max(0,Math.min(1,(x-min)/oldRange)):0;
      x=min+fraction*Math.max(0,newRange);
    }
    placePart(part,x,parseFloat(part.style.top),bounds);
  }
  layoutWidth=width;drawWires();if(selectedWire)chooseWire(selectedWire);queueDraftSave();
}
function clearPinGuide(){for(const {btn} of pins.values())btn.classList.remove('guide-highlight');}
function explainPin(id){pinHelp.replaceChildren(make('strong',{textContent:displayPin(id)}),make('span',{textContent:pinDescription(id)}));}
document.querySelector('.lesson').addEventListener('click',event=>{
  const reference=event.target.closest('[data-pin-ref]'),id=reference?.dataset.pinRef;
  if(!pins.has(id))return;
  chooseWire(null);selectPin(null);clearPinGuide();explainPin(id);
  const pin=pins.get(id).btn;pin.classList.add('guide-highlight');pin.scrollIntoView({block:'nearest',inline:'nearest'});pin.focus({preventScroll:true});
});

const arrangeButton=make('button',{id:'arrange-parts',textContent:'Разложить детали',title:'Расположить детали по всему полю. Код и провода сохранятся.'});
arrangeButton.onclick=arrangeParts;document.querySelector('.toolbar').append(arrangeButton);

const bbToggle=make('button',{textContent:'＋ Макетная плата',className:'bb-toggle'});
document.querySelector('.toolbar').append(bbToggle);
const sensorControl=make('label',{className:'sensor-control'});sensorControl.innerHTML='<span>Температура</span><input id="temperature" type="range" min="0" max="60" value="25" step="1"><b id="temperature-value">25 °C</b>';document.querySelector('.toolbar').append(sensorControl);
const temperatureInput=sensorControl.querySelector('input');
function syncTemperatureUI(){temperatureInput.value=String(temperature);sensorControl.querySelector('b').textContent=`${temperature} °C`;const reading=document.querySelector('.sensor-reading');if(reading)reading.textContent=`${temperature} °C`;}
temperatureInput.oninput=()=>{temperature=Number(temperatureInput.value);syncTemperatureUI();if(sim)sim.setTemperature(temperature);queueDraftSave();};

const bb=make('div',{className:'breadboard-panel'});bb.hidden=true;stage.append(bb);
const bbTitle=make('strong',{textContent:'МАКЕТНАЯ ПЛАТА · УЧЕБНЫЙ ФРАГМЕНТ'});bb.append(bbTitle);
const bbNote=make('p',{textContent:'В каждой колонке a–e соединены внутри, f–j — отдельно. Между группами разрыв.'});bb.append(bbNote);
const grid=make('div',{className:'breadboard-grid'});bb.append(grid);
grid.append(make('span'));
for(let col=1;col<=10;col++)grid.append(make('span',{textContent:String(col)}));
for(const row of 'abcdefghij'){
  const label=make('span',{textContent:row.toUpperCase()});if(row==='f')label.style.marginTop='14px';grid.append(label);
  for(let col=1;col<=10;col++){
    const id=`bb:${row}${col}`,button=make('button',{className:'breadboard-hole',title:`${row.toUpperCase()}${col}`});
    button.setAttribute('aria-label',`Отверстие ${row.toUpperCase()}${col}`);button.dataset.group=(row<'f'?'upper':'lower')+col;
    if(row==='f')button.style.marginTop='14px';button.onclick=()=>pickPin(id);
    button.onpointerenter=()=>{for(const item of grid.querySelectorAll('button'))item.classList.toggle('net-highlight',item.dataset.group===button.dataset.group);};
    button.onpointerleave=()=>{for(const item of grid.querySelectorAll('button'))item.classList.remove('net-highlight');};
    grid.append(button);pins.set(id,{btn:button,part:'bb'});
  }
}
bbToggle.onclick=()=>{
  if(testRunning||busy)return;
  chooseWire(null);stop();breadboard=!breadboard;bb.hidden=!breadboard;stage.classList.toggle('with-breadboard',breadboard);board.classList.toggle('with-breadboard',breadboard);
  if(!breadboard){wires=wires.filter(w=>!w.a.startsWith('bb:')&&!w.b.startsWith('bb:'));selectPin(null);}
  bbToggle.textContent=breadboard?'− Убрать макетную плату':'＋ Макетная плата';refreshCanvas();renderWires();
  feedback(breadboard?'Попробуй соединить D13 с A1, а E1 — с резистором. Между A1 и E1 провод не нужен: они уже соединены внутри платы.':'Макетная плата убрана. Её провода удалены.');
};

for(const c of palette){const btn=make('button',{title:'Выбрать цвет провода'});btn.style.background=c;btn.setAttribute('aria-label','Цвет провода: '+({[palette[0]]:'красный',[palette[1]]:'чёрный',[palette[2]]:'синий',[palette[3]]:'зелёный',[palette[4]]:'жёлтый'}[c]));btn.classList.toggle('selected',color===c);btn.onclick=()=>{color=c;for(const child of $('colors').children)child.classList.toggle('selected',child===btn);};$('colors').append(btn);}

function selectPin(id){selected=id;for(const [key,{btn}] of pins){btn.classList.toggle('selected',key===id);btn.setAttribute('aria-pressed',String(key===id));}}
function pickPin(id){if(testRunning||busy)return;chooseWire(null);clearPinGuide();explainPin(id);if(selected===id){selectPin(null);return;}if(!selected){selectPin(id);$('connect-help').textContent=`Выбран ${displayPin(id)}. Теперь нажми на контакт назначения. Esc — отмена.`;return;}addWire(selected,id);selectPin(null);}
function addWire(a,b){if(!pins.has(a)||!pins.has(b)||a===b||(!breadboard&&(a.startsWith('bb:')||b.startsWith('bb:'))))throw new Error('Выбери два разных доступных контакта');if(wires.some(w=>w.a===a&&w.b===b||w.a===b&&w.b===a)){feedback('Это соединение уже есть.');return;}stop();wires.push({a,b,color});renderWires();feedback(inspectCircuit(wires,false,breadboard).reason);}
function wireLabel(w){return `${displayPin(w.a)} — ${displayPin(w.b)}`;}
function chooseWire(w,x=board.scrollLeft+20,y=board.scrollTop+20){
  selectedWire=w;wireTools.hidden=!w;
  if(w){
    selectPin(null);wireName.textContent=wireLabel(w);
    const width=Math.min(290,board.clientWidth-24);
    wireTools.style.width=width+'px';
    wireTools.style.left=Math.max(board.scrollLeft+12,Math.min(x,board.scrollLeft+board.clientWidth-width-12))+'px';
    wireTools.style.top=Math.max(board.scrollTop+12,Math.min(y,board.scrollTop+board.clientHeight-115))+'px';
  }
  svg.querySelectorAll('.wire-group').forEach((group,i)=>{group.classList.toggle('is-selected',wires[i]===w);group.setAttribute('aria-pressed',String(wires[i]===w));});
}
function removeWire(w){
  const index=wires.indexOf(w);if(index<0||testRunning||busy)return;
  stop();wires.splice(index,1);chooseWire(null);renderWires();
  feedback(`Удалён провод ${wireLabel(w)}. ${inspectCircuit(wires,false,breadboard).reason}`);
}
function drawWires(){
  svg.setAttribute('width',String(stage.clientWidth));svg.setAttribute('height',String(stage.clientHeight));
  svg.replaceChildren();const rect=stage.getBoundingClientRect();
  for(const w of wires){
    const a=pins.get(w.a).btn.getBoundingClientRect(),b=pins.get(w.b).btn.getBoundingClientRect();
    const x1=a.x+a.width/2-rect.x,y1=a.y+a.height/2-rect.y,x2=b.x+b.width/2-rect.x,y2=b.y+b.height/2-rect.y,middle=(x1+x2)/2;
    const group=document.createElementNS('http://www.w3.org/2000/svg','g');
    group.setAttribute('class','wire-group'+(selectedWire===w?' is-selected':''));
    group.setAttribute('role','button');group.setAttribute('tabindex','0');group.setAttribute('aria-label','Выбрать провод '+wireLabel(w));group.setAttribute('aria-pressed',String(selectedWire===w));
    const d=`M ${x1},${y1} C ${middle},${y1} ${middle},${y2} ${x2},${y2}`;
    for(const [cls,stroke] of [['wire-visible',w.color],['wire-hit','transparent']]){
      const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('class',cls);path.setAttribute('d',d);path.setAttribute('stroke',stroke);group.append(path);
    }
    group.onclick=event=>{if(testRunning||busy)return;event.stopPropagation();chooseWire(w,event.clientX-rect.x+12,event.clientY-rect.y+12);};
    group.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();chooseWire(w);wireDelete.focus();}else if(event.key==='Delete'){event.preventDefault();removeWire(w);}};
    svg.append(group);
  }
}
function renderWires(){
  if(!wires.includes(selectedWire))chooseWire(null);
  drawWires();$('wire-count').textContent=`Проводов: ${wires.length}`;$('wire-list').replaceChildren();
  wires.forEach(w=>{const li=make('li');const label=make('span',{textContent:wireLabel(w)});const remove=make('button',{textContent:'×',title:'Удалить провод'});remove.setAttribute('aria-label','Удалить '+wireLabel(w));remove.onclick=()=>removeWire(w);li.append(label,remove);$('wire-list').append(li);});
  $('connect-help').textContent='Для удаления нажми на провод на схеме, затем «Удалить провод». Контакты соединяются двумя нажатиями. Детали можно двигать за название.';queueDraftSave();
}
window.addEventListener('resize',refreshCanvas);
new ResizeObserver(refreshCanvas).observe(stage);
document.addEventListener('keydown',e=>{if(e.key==='Escape'){selectPin(null);chooseWire(null);}if(e.key==='Delete'&&selectedWire&&!e.target.closest('input,textarea,[contenteditable="true"],.cm-editor')){e.preventDefault();removeWire(selectedWire);}});
$('undo').onclick=()=>{if(testRunning||busy)return;stop();wires.pop();renderWires();feedback(inspectCircuit(wires,false,breadboard).reason);};
$('reset').onclick=()=>{if(!window.confirm('Сбросить программу и провода текущего задания?'))return;loadMission(mission,{mode:workbenchMode,reset:true});};

function renderLesson(){
 const sensorVisible=mission>=6; sensorControl.hidden=!sensorVisible; const sensorPart=parts.get('sensor'); if(sensorPart) sensorPart.part.hidden=!sensorVisible;
 const free=mission===FREE, m=missions[Math.min(mission,FREE-1)], observing=workbenchMode==='observe';
 document.querySelector('.lesson>.eyebrow').textContent=observing?'ДЕЛО 002 / НАБЛЮДЕНИЕ':free?'СВОБОДНЫЙ ЭКСПЕРИМЕНТ':`ДЕЛО ${String(mission<3?1:mission-1).padStart(3,'0')} / РЕМОНТ`;
 document.querySelector('.lesson h1').textContent=observing?'Найди сбой.':free?'Твоя идея.':['Подай сигнал.','Измени ритм.','Управляй светом.','Повтори трижды.','Собери ритм.','Дай имя действию.','Поймай перегрев.','Запусти протокол.'][mission];
 document.querySelector('.workspace-head h2').textContent=free?'Собственное устройство':m.name;
 document.querySelector('.intro').textContent=observing?'Код исходного устройства. Запусти и посмотри, как ведёт себя световой индикатор.':free?'Экспериментируй с кодом, проводами и кнопкой.':'Собери устройство, попробуй новый приём и проверь результат.';
 document.querySelector('.goal p').textContent=observing?'Запусти программу, дождись двух серий и запиши наблюдение.':free?'Например, сделай мигание только при нажатой кнопке.':m.goal;
 $('check').textContent=observing?'Записать наблюдение':free?'Проверить цепь':completed.has(mission)?'✓ Пройдено · проверить ещё':'Проверить миссию';
 $('steps').replaceChildren();
 if(observing){$('lesson-content').innerHTML='<span class="step-counter">ОСМОТР УСТРОЙСТВА</span><h3>Сколько импульсов?</h3><p>Запусти исходную программу справа. Смотри на светодиод: посчитай вспышки до длинной паузы.</p><p>Для замера нужны эти провода:</p>'+connectionMarkup(ledConnections)+'<p>Если цепь осталась с прошлого дела, пересобирать её не нужно.</p><p class="tip">Код пока только для чтения. Через несколько секунд нажми «Записать наблюдение». Мы измерим реальные переключения на твоей схеме.</p>'; }
 else if(free){$('lesson-content').innerHTML='<h3>Мастерская открыта</h3><p>Можно менять программу целиком. Доступны выводы <code>D13</code>, <code>D12</code>, <code>D2</code>, <code>5V</code> и <code>GND</code>.</p><p>Попробуй перенести светодиод на D12 и исправить программу. Или создай функцию, которая мигает три раза.</p><p class="tip">Поддерживаемые компоненты: один светодиод, резистор 220 Ом и кнопка. Функции объявляй перед местом вызова.</p>';}
 else {m.steps.forEach((s,i)=>{const b=make('button',{className:'step'+(i<=step?' active':''),title:`Шаг ${i+1}: ${s[0]}`});b.setAttribute('aria-label',b.title);b.onclick=()=>{step=i;renderLesson();};$('steps').append(b);});const [title,body,tip]=m.steps[step];$('lesson-content').innerHTML=`<span class="step-counter">ШАГ ${step+1} ИЗ ${m.steps.length}</span><h3>${title}</h3><p>${body}</p><p class="tip">${tip}</p>`;}
 $('prev').disabled=step===0||free||observing;$('next').disabled=free;$('next').textContent=observing?'Записать наблюдение':step===m.steps.length-1?'Проверить результат':'Дальше →';menu.value=String(mission);
 const intro=document.querySelector('.code-intro');intro.textContent=observing?'Исходная программа · только чтение. Сначала измерь сигнал, затем вернись к расследованию.':'Редактор Arduino C++: подсветка синтаксиса, подсказки при вводе и указание ошибок.';
 document.querySelector('.code-panel').classList.toggle('code-observing',observing);queueDraftSave();
}
function loadMission(index,options={}){
 if(!Number.isInteger(index)||index<0||index>FREE)return;
 saveWorkshop();stop();restoringDraft=true;
 mission=index;workbenchMode=options.mode==='observe'&&index===3?'observe':'repair';
 const key=workbenchMode==='observe'?'3-observe':index;
 if(options.reset)delete drafts[key];
 const draft=drafts[key];
 if(!draft){temperature=25;syncTemperatureUI();}
 step=Math.min(draft?.step||0,missions[Math.min(index,FREE-1)].steps.length-1);
 if(draft){wires=draft.wires.map(w=>({...w}));breadboard=draft.breadboard;temperature=Number.isFinite(draft.temperature)?draft.temperature:25;syncTemperatureUI();}
 if(options.reset){wires=[];breadboard=false;step=0;temperature=25;syncTemperatureUI();}
 if(index<FREE)setSource(workbenchMode==='observe'?missions[index].code:draft?.code??missions[index].code);
 else if(draft)setSource(draft.code);
 bb.hidden=!breadboard;stage.classList.toggle('with-breadboard',breadboard);board.classList.toggle('with-breadboard',breadboard);bbToggle.textContent=breadboard?'− Убрать макетную плату':'＋ Макетная плата';
 if(draft?.positions&&Object.keys(draft.positions).length){applyPositions(draft.positions);layoutWidth=draft.canvasWidth||stage.clientWidth||760;layoutReady=true;}
 else if(options.reset||!layoutReady)arrangeParts();
 selectPin(null);chooseWire(null);clearPinGuide();lastHex=null;lastSource='';setCodeEditable(workbenchMode!=='observe');renderLesson();refreshCanvas();renderWires();
 feedback(draft?'Черновик восстановлен: код и соединения на месте. Нажми «Запустить», чтобы включить плату.':workbenchMode==='observe'?'Исходная программа готова к наблюдению. Проверь провода и нажми «Запустить».':'Начни с объяснения слева. Существующие соединения остаются на столе.');
 restoringDraft=false;queueDraftSave();
 window.dispatchEvent(new CustomEvent('nexora:mission-change',{detail:{mission:index,name:index<FREE?missions[index].name:'Свободная мастерская'}}));
}
$('prev').onclick=()=>{step=Math.max(0,step-1);renderLesson();};
$('next').onclick=()=>{if(workbenchMode==='observe'||step===missions[mission].steps.length-1)checkMission();else{step++;renderLesson();}};

function press(value){if(testRunning)return;const button=parts.get('button').element;button.pressed=value;document.querySelector('.press-button').classList.toggle('held',value);if(sim&&running)sim.setButton(value);}
function stop(){temperatureInput.disabled=false;runId++;running=false;busy=false;testRunning=false;cancelAnimationFrame(raf);if(cancelCompile){const cancel=cancelCompile;cancelCompile=null;cancel();}else if(compileWorker){compileWorker.terminate();compileWorker=null;}parts.get('uno').element.ledPower=false;parts.get('button').element.pressed=false;document.querySelector('.press-button').classList.remove('held');sim=null;setLight({led:false,led13:false});$('run').disabled=false;$('run').textContent='▶ Запустить';$('stop').disabled=true;$('runtime-status').textContent='Остановлено';$('check').disabled=false;menu.disabled=false;setCodeEditable(workbenchMode!=='observe');}
function compileSource(source){return new Promise((resolve,reject)=>{const worker=new Worker(new URL('avr/worker.js',document.baseURI),{type:'module'});compileWorker=worker;const timeout=setTimeout(()=>{worker.terminate();if(compileWorker===worker)compileWorker=null;reject(new Error('Компилятор не ответил за 3 минуты. Обнови страницу и попробуй ещё раз.'));},180000);const cleanup=()=>{clearTimeout(timeout);worker.terminate();if(compileWorker===worker){compileWorker=null;cancelCompile=null;}};cancelCompile=()=>{cleanup();reject(new Error('Компиляция остановлена'));};worker.onmessage=e=>{cleanup();e.data.ok?resolve(e.data.result):reject(new Error(e.data.error?.message||'Не удалось скомпилировать программу'));};worker.onerror=e=>{cleanup();reject(new Error(e.message||'Не удалось загрузить компилятор'));};worker.postMessage({source:'#include <Arduino.h>\n#line 1 "sketch.ino"\n'+source,sensors:[],assetsBase:new URL('avr/',document.baseURI).href});});}
async function run(){
 stop();const id=runId,source=currentCode();compileDiags=[];showCodeDiagnostics(analyzeSketch(source));
 const circuit=inspectCircuit(wires,false,breadboard);
 busy=true;$('run').disabled=true;$('run').textContent='Собираю программу…';$('stop').disabled=false;$('check').disabled=true;$('runtime-status').textContent='Компиляция';
 feedback('Собираю программу. После компиляции плата запустится автоматически.');
 log('Компиляция Arduino C++…\nПри первом запуске загружаются инструменты (~18 МБ и файлы Arduino).');
 try{
   let result;if(lastHex&&lastSource===source)result={hex:lastHex,fitsTarget:true};else result=await compileSource(source);
   if(id!==runId)return;if(!result.fitsTarget)throw new Error('Программа не помещается в память Arduino Uno.');lastHex=result.hex;lastSource=source;
   busy=false;serialText='';let faultMessage=null;
   sim=new Emulator(result.hex,wires.map(w=>({...w})),{breadboard,temperature,onChange:setLight,onSerial:char=>{serialText=(serialText+char).slice(-3000);},onFault:message=>{faultMessage=message;}});
   running=true;$('run').textContent='▶ Выполняется';$('run').disabled=true;$('check').disabled=false;$('runtime-status').textContent='Программа работает';parts.get('uno').element.ledPower=true;
   log('Программа скомпилирована.\nВыполняется на виртуальном ATmega328P.');feedback(circuit.reason,circuit.led?'success':'');window.dispatchEvent(new CustomEvent('nexora:program-run',{detail:{mission,hasCircuit:Boolean(circuit.led)}}));
   let previous=performance.now();
   function frame(now){if(!running||id!==runId)return;const elapsed=Math.min(30,Math.max(1,now-previous));previous=now;sim.advance(Math.round(16000*elapsed));if(faultMessage){stop();feedback(faultMessage,'error');log(faultMessage);return;}$('sim-time').textContent=(sim.cpu.cycles/16000000).toFixed(2)+' с';if(serialText)log(serialText);raf=requestAnimationFrame(frame);}
   raf=requestAnimationFrame(frame);
 }catch(e){if(id!==runId)return;stop();const compilerMessage=e.message.replaceAll('/build/HorangFirmware.cpp','sketch.ino');compileDiags=compilerDiagnostics(source,compilerMessage);showCodeDiagnostics([...analyzeSketch(source),...compileDiags]);feedback('Программа пока не запускается. Посмотри подсказку у нужной строки.','error');log(compilerMessage);}
}
$('run').onclick=run;$('stop').onclick=()=>{stop();feedback('Программа остановлена. Можно изменить схему или код.');};
 $('check-code').onclick=()=>showCodeDiagnostics([...analyzeSketch(currentCode()),...compileDiags]);

async function checkMission(){
 if(testRunning||busy)return;
 const circuit=inspectCircuit(wires,false,breadboard);
 if(mission===FREE){feedback(circuit.reason,circuit.led?'success':'error');return;}
 if(!circuit.led||circuit.error){feedback(circuit.reason,'error');return;}
 if(!running||!sim){feedback('Сначала запусти программу и дай устройству поработать.');return;}
 if(mission<2){
   const changes=sim.transitions;if(changes.length<5){feedback('Пока недостаточно переключений. Подожди несколько миганий и проверь снова.');return;}
   const intervals=changes.slice(-5).slice(1).map((x,i)=>x.time-changes.slice(-5)[i].time),target=mission===0?.5:.25;
   if(!intervals.every(t=>Math.abs(t-target)<.025)){feedback(`Светодиод переключается, но ритм отличается от задания. Каждое состояние должно длиться ${target*1000} мс. Проверь delay().`,'error');return;}
   if(mission===1&&(!/\bint\s+pauseMs\s*=/.test(currentCode())||(currentCode().match(/delay\s*\(\s*pauseMs\s*\)/g)||[]).length<2)){feedback('Ритм правильный. В этой миссии также создай переменную int pauseMs и используй её для обеих пауз.');return;}
   complete();return;
 }
 if(mission===6||mission===7){
   const sensor=inspectSensor(wires,breadboard);
   if(!sensor.connected){feedback(sensor.reason,'error');return;}
   const source=currentCode().replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g,'');
   if(mission===6&&(!/\banalogRead\s*\(/.test(source)||!/\btemperature\s*>=\s*limitC/.test(source)||!/\bint\s+limitC\s*=\s*35\b/.test(source))){feedback('Нужны analogRead(A0), переменная limitC = 35 и сравнение temperature >= limitC.','error');return;}
   if(mission===7&&(!/\banalogRead\s*\(/.test(source)||!/\bdigitalRead\s*\(/.test(source)||!source.includes('||')||!/\bdurations\s*\[\s*i\s*\]/.test(source)||!/\bfor\s*\(/.test(source)||!/\bvoid\s+blink\s*\(\s*int\s+/.test(source))){feedback('В итоговом протоколе нужны датчик, кнопка, оператор ||, массив durations, цикл for и функция blink.','error');return;}
   const hex=lastHex,snapshot=wires.map(w=>({...w})),checkingMission=mission;
   stop();const id=runId;testRunning=true;chooseWire(null);setCodeEditable(false);temperatureInput.disabled=true;menu.disabled=true;
   $('check').disabled=true;$('run').disabled=true;$('stop').disabled=false;$('runtime-status').textContent='Испытываю устройство';
   // Yield between CPU slices so Stop, drawing and progress remain responsive.
   const advance=async(test,cycles)=>{
     for(let left=cycles;left>0;left-=500000){
       if(id!==runId)return false;
       test.advance(Math.min(left,500000));
       if(test.fault)throw Error(test.fault);
       await new Promise(resolve=>setTimeout(resolve,0));
     }
     return id===runId;
   };
   try{
     if(checkingMission===6){
       const test=new Emulator(hex,snapshot,{breadboard,temperature:25});
       const readings=[25,34,35,40,34,45,25];
       for(const value of readings){
         feedback(`Проверяю ${value} °C: ожидается ${value>=35?'включение':'выключение'} охлаждения…`);
         test.setTemperature(value);
         if(!await advance(test,2000000))return;
         if(test.led!==(value>=35))throw Error(`При ${value} °C свет должен быть ${value>=35?'включён':'выключен'}. Проверь порог, сравнение и обе ветки условия.`);
       }
       stop();complete({count:readings.length});log('Проверены 25, 34, 35, 40, 34, 45 и 25 °C. Включение на границе и выключение после остывания работают.');return;
     }
     const trials=[{value:25,pressed:false,alarm:false,label:'обычный режим'},{value:35,pressed:false,alarm:true,label:'ровно 35 °C'},{value:40,pressed:false,alarm:true,label:'только перегрев'},{value:25,pressed:true,alarm:true,label:'только кнопка'},{value:40,pressed:true,alarm:true,label:'обе причины'}];
     const pattern=missions[7].pattern;
     for(const [index,trial] of trials.entries()){
       feedback(`Испытание ${index+1} из ${trials.length}: ${trial.label}. Проверяю сигнал…`);
       const test=new Emulator(hex,snapshot,{breadboard,temperature:trial.value});test.setButton(trial.pressed);
       if(!await advance(test,80000000))return;
       const intervals=test.transitions.slice(1).map((item,i)=>item.time-test.transitions[i].time);
       const correct=trial.alarm?intervals.length>=pattern.length*2&&intervals.every((duration,i)=>Math.abs(duration-pattern[i%pattern.length])<.04):test.transitions.length===0&&!test.led;
       if(!correct)throw Error(`Не пройдено испытание «${trial.label}». ${trial.alarm?'Нужны повторяющиеся серии 100, 250, 500 мс с паузами 150 и 1150 мс.':'Без перегрева и нажатия свет должен быть выключен.'}`);
       if(trial.alarm){
         feedback(`Испытание ${index+1}: убираю обе причины. Текущая серия должна закончиться, а новая не начаться…`);
         test.setTemperature(25);test.setButton(false);const normalAt=test.cpu.cycles/16000000;
         if(!await advance(test,80000000))return;
         if(test.led||test.transitions.some(t=>t.time>normalAt+2.5))throw Error('После остывания и отпускания кнопки тревога продолжается. Заверши текущую серию и снова прочитай входы.');
       }
     }
     stop();complete({count:trials.length});log('Пройдены 5 сочетаний входов, включая границу 35 °C, и возврат к норме после каждой тревоги.');
   }catch(error){if(id!==runId)return;stop();feedback(error.message,'error');log(error.message);}
   return;
 }

 if(mission>2){
   const source=currentCode().replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g,'');
   if(mission===3){
     const result=analyzeSiren(sim.transitions);
     if(!result.stable){feedback('Нужно две полные одинаковые серии, включая длинную паузу. Дай плате поработать ещё несколько секунд.');return;}
     if(workbenchMode==='observe'){
       if(result.snapshot.count!==2){feedback('Исходная улика пока не читается. Проверь соединение светодиода с D13 через резистор.','error');return;}
       window.dispatchEvent(new CustomEvent('nexora:signal-observed',{detail:result.snapshot}));return;
     }
     if(result.repaired&&/\bfor\s*\(/.test(source))complete(result.snapshot);
     else feedback(`Измерено: ${result.snapshot.count} вспышки в серии. Нужно 3 вспышки по 200 мс, короткие паузы 200 мс, между сериями 1200 мс. Проверь условие for и delay().`,'error');
     return;
   }
   const pattern=missions[mission].pattern,changes=sim.transitions;
   if(changes.length<pattern.length*2+1){feedback('Дождись двух полных серий сигналов, затем проверь ещё раз.');return;}
   const tail=changes.slice(-(pattern.length*2+1)),intervals=tail.slice(1).map((v,i)=>v.time-tail[i].time);
   const matched=pattern.some((_,offset)=>intervals.every((v,i)=>Math.abs(v-pattern[(offset+i)%pattern.length])<.025));
   const structure=mission===4?/\bfor\s*\(/.test(source)&&/\bdurations\s*\[\s*i\s*\]/.test(source):/\bvoid\s+blink\s*\(\s*int\s+/.test(source)&&/\bdelay\s*\(\s*duration\s*\)/.test(source);
   if(matched&&structure)complete();else feedback('Ритм или конструкция программы пока не соответствуют заданию. Проверь длительности вспышек, паузы и изучаемую конструкцию.','error');
   return;
 }

 // Re-run the student's actual firmware against their actual netlist.
 const hex=lastHex,snapshot=wires.map(w=>({...w}));stop();const id=runId;testRunning=true;$('check').disabled=true;setCodeEditable(false);menu.disabled=true;$('runtime-status').textContent='Проверяю кнопку';
 let fault=null;const test=new Emulator(hex,snapshot,{breadboard,onChange:setLight,onFault:m=>fault=m});
 const results=[];
 for(const held of [false,true,false,true,false]){
   if(id!==runId)return;test.setButton(held);
   for(let i=0;i<4;i++){test.advance(500000);await new Promise(r=>setTimeout(r,0));if(id!==runId)return;}
   results.push(test.led===held&&!fault);
 }
 stop();
 const code=currentCode().replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g,'');
 if(results.every(Boolean)&&/\bif\s*\(/.test(code)&&/\belse\b/.test(code)){complete();log('Проверено: отпущена → нажата → отпущена → нажата → отпущена.\nВсе пять состояний верны.');}
 else feedback(fault||'Проверь провод от Arduino D2 к кнопке 1L, от кнопки 2L к Arduino GND и ветки if/else. Свет должен гореть только при нажатии.','error');
}
function complete(signal=null){completed.add(mission);saveWorkshop();renderLesson();feedback(`Миссия «${missions[mission].name}» выполнена! ${mission===0?'Ты собрал цепь и запустил первую программу.':mission===1?'Ты изменил поведение устройства с помощью переменной.':mission===2?'Твоя программа реагирует на вход и выбирает действие.':'Ты создал нужный сигнал с помощью '+missions[mission].short.toLowerCase()+'.'}`,'success');window.dispatchEvent(new CustomEvent('nexora:mission-complete',{detail:{mission,name:missions[mission].name,signal}}));}
$('check').onclick=checkMission;
 $('download').onclick=()=>{const blob=new Blob([currentCode()],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),a=make('a',{href:url,download:'nexora-sketch.ino'});a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('about').onclick=()=>$('modal').showModal();$('close-modal').onclick=()=>$('modal').close();
const restoredWorkshop=restoreWorkshop(readProgress().workshop,pins,FREE);drafts=restoredWorkshop.drafts;completed=restoredWorkshop.completed;
initCodeEditor();loadMission(restoredWorkshop.activeIndex,{mode:restoredWorkshop.mode});savingReady=true;renderWires();Promise.all([...parts.values()].map(p=>p.element.updateComplete)).then(refreshCanvas);

window.nexoraWorkshop={
  open(index=0,options={}){document.body.classList.add('workbench-open');loadMission(Math.max(0,Math.min(FREE,index)),options);requestAnimationFrame(refreshCanvas);document.getElementById('sim-main')?.scrollIntoView({block:'start'});},
  close(){saveWorkshop();stop();document.body.classList.remove('workbench-open');},
  run,stop,check:checkMission,
  resetProgress(indices=null){
    saveWorkshop();
    const clean=clearWorkshop({drafts,completed:[...completed],activeIndex:mission,mode:workbenchMode},indices);
    drafts=clean.drafts;completed=new Set(clean.completed);
    // Clear the in-memory draft too, otherwise the next load/pagehide saves it back.
    if(!indices||indices.includes(mission)){
      savingReady=false;clearTimeout(draftSaveTimer);
      loadMission(indices?mission:0,{reset:true});savingReady=true;
    }
    writeProgress('workshop',{drafts,completed:[...completed],activeIndex:mission,mode:workbenchMode});
  },
  getState:()=>({mission,step,mode:workbenchMode,running,wires:[...wires],breadboard,temperature,code:currentCode()})
};

window.dispatchEvent(new Event('nexora:workshop-ready'));
const context=document.modelContext;
if(context?.registerTool){const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});for(const tool of [
 {name:'read_workshop',description:'Read the current lesson, available pins, wires, code and execution state.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>({mission,step,wires,code:currentCode(),running,pins:[...pins.keys()].filter(p=>breadboard||!p.startsWith('bb:')),feedback:$('feedback').textContent})},
 {name:'connect_workshop_pins',description:'Add wires between available contacts in the visible circuit. Stops the running program.',inputSchema:{type:'object',properties:{connections:{type:'array',maxItems:20,items:{type:'object',properties:{a:{type:'string'},b:{type:'string'}},required:['a','b'],additionalProperties:false}}},required:['connections'],additionalProperties:false},annotations:{readOnlyHint:false},execute:input=>{if(busy||testRunning)throw new Error('Wait until compilation or checking finishes');if(!Array.isArray(input.connections)||input.connections.length>20||input.connections.some(w=>!pins.has(w.a)||!pins.has(w.b)||w.a===w.b||(!breadboard&&(w.a.startsWith('bb:')||w.b.startsWith('bb:')))))throw new Error('Invalid contacts');for(const w of input.connections)addWire(w.a,w.b);return{wires,feedback:$('feedback').textContent};}},
 ])try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{} }
