import '@wokwi/elements/dist/esm/arduino-uno-element.js';
import '@wokwi/elements/dist/esm/led-element.js';
import '@wokwi/elements/dist/esm/resistor-element.js';
import '@wokwi/elements/dist/esm/pushbutton-element.js';
import {Emulator,inspectCircuit} from './engine.js';
import {missions} from './lessons.js';
import {readProgress, writeProgress, restoreWorkshop} from './progress.js';
import {analyzeSiren} from './case-two.js';
import {arduinoWords,serialWords,analyzeSketch,compilerDiagnostics,sketchSymbols} from './arduino-language.js';
import {Compartment,EditorState} from '@codemirror/state';
import {EditorView,drawSelection,highlightActiveLine,keymap,lineNumbers,highlightSpecialChars,placeholder} from '@codemirror/view';
import {defaultKeymap,history,historyKeymap,indentWithTab} from '@codemirror/commands';
import {bracketMatching,defaultHighlightStyle,HighlightStyle,indentOnInput,syntaxHighlighting} from '@codemirror/language';
import {autocompletion,closeBrackets,closeBracketsKeymap,completionKeymap,snippetCompletion} from '@codemirror/autocomplete';
import {lintGutter,linter,setDiagnosticsEffect} from '@codemirror/lint';
import {tags} from '@lezer/highlight';

const $=id=>document.getElementById(id), make=(tag,attrs={})=>Object.assign(document.createElement(tag),attrs);
const palette=['#e04f50','#2f3545','#3985c9','#65a947','#bf8a2e'];
let wires=[],selected=null,color=palette[0],mission=0,step=0,running=false,busy=false,sim=null,raf=0,compileWorker=null,cancelCompile=null,runId=0,lastHex=null,lastSource='',completed=new Set(),testRunning=false,serialText='';
const pins=new Map(),parts=new Map();
const FREE=missions.length;
let breadboard=false;
let workbenchMode='repair',drafts={},savingReady=false,restoringDraft=false,draftSaveTimer;
function saveWorkshop(){
  clearTimeout(draftSaveTimer);
  if(!savingReady||restoringDraft)return;
  drafts[workbenchMode==='observe'?'3-observe':mission]={code:currentCode(),wires:wires.map(w=>({...w})),breadboard,step};
  writeProgress('workshop',{drafts,completed:[...completed],activeIndex:mission,mode:workbenchMode});
}
function queueDraftSave(){if(!savingReady||restoringDraft)return;clearTimeout(draftSaveTimer);draftSaveTimer=setTimeout(saveWorkshop,180);}
window.addEventListener('pagehide',saveWorkshop);
document.addEventListener('visibilitychange',()=>{if(document.hidden)saveWorkshop();});
const board=$('board');const stage=make('div',{className:'stage'});board.append(stage);stage.append($('wires'));stage.append(board.querySelector('.board-hint'));
const svg=$('wires');svg.setAttribute('width','640');svg.setAttribute('height','430');
const codeField=$('code'),codeMount=$('code-editor'),codeEditable=new Compartment();
let codeView=null,compileDiags=[];

const arduinoHighlight=HighlightStyle.define([
  {tag:tags.comment,color:'#6f876f',fontStyle:'italic'},
  {tag:[tags.keyword,tags.controlKeyword],color:'#c65bc7',fontWeight:'700'},
  {tag:[tags.typeName,tags.definition(tags.typeName)],color:'#167c9e',fontWeight:'650'},
  {tag:[tags.function(tags.variableName),tags.labelName],color:'#9a4d00'},
  {tag:tags.variableName,color:'#1c5f92'},
  {tag:tags.number,color:'#bb4f1e'},
  {tag:tags.bool,color:'#8b3c8f',fontWeight:'700'},
  {tag:tags.string,color:'#2b8152'},
  {tag:tags.operator,color:'#a23a3a'},
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
      codeEditable.of(EditorView.editable.of(true)),lineNumbers(),highlightSpecialChars(),history(),drawSelection(),bracketMatching(),closeBrackets(),indentOnInput(),syntaxHighlighting(defaultHighlightStyle),syntaxHighlighting(arduinoHighlight),editorTheme,highlightActiveLine(),
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
 {id:'uno',tag:'wokwi-arduino-uno',label:'ARDUINO UNO',x:24,y:125,w:275,h:202,scale:1,pins:['13','12','2','5V','GND.2']},
 {id:'r',tag:'wokwi-resistor',label:'РЕЗИСТОР · 220 Ω',x:377,y:72,w:120,h:25,scale:1.8},
 {id:'led',tag:'wokwi-led',label:'СВЕТОДИОД',x:515,y:165,w:72,h:80,scale:1.8},
 {id:'button',tag:'wokwi-pushbutton',label:'КНОПКА',x:407,y:296,w:102,h:75,scale:1.3},
];

function displayPin(id){const [part,pin]=id.split(':');return part==='bb'?'Плата '+pin.toUpperCase():part==='uno'?(pin.startsWith('GND')?'GND':/^\d+$/.test(pin)?'D'+pin:pin):part==='r'?'Резистор '+pin:part==='led'?'LED '+pin:'Кнопка '+pin;}
function feedback(text,type=''){const el=$('feedback');el.textContent=text;el.className='feedback '+type;}
function log(text){$('console').textContent=text;}
function setLight(data){parts.get('led').element.value=data.led;parts.get('uno').element.led13=data.led13;badge.textContent='Светодиод: '+(data.led?'включён':'выключен');badge.classList.toggle('lit',data.led);}

for(const spec of partSpecs){
 const part=make('div',{className:'part'});part.style.left=spec.x+'px';part.style.top=spec.y+'px';part.style.width=spec.w+'px';
 const title=make('span',{className:'part-title',textContent:spec.label});title.tabIndex=0;title.setAttribute('aria-label',spec.label+'. Перемещение: стрелки клавиатуры');
 const body=make('div',{className:'part-body'});body.style.width=spec.w+'px';body.style.height=spec.h+'px';
 const element=document.createElement(spec.tag);element.style.transform=`scale(${spec.scale})`;element.style.transformOrigin='top left';element.style.display='block';element.style.width='max-content';
 if(spec.id==='r')element.value='220';if(spec.id==='led')element.color='green';if(spec.id==='button'){element.color='green';element.addEventListener('button-press',()=>press(true));element.addEventListener('button-release',()=>press(false));}
 body.append(element);part.append(title,body);stage.append(part);parts.set(spec.id,{part,body,element,spec});
 for(const pin of element.pinInfo.filter(p=>!spec.pins||spec.pins.includes(p.name))){
   const id=spec.id+':'+pin.name,btn=make('button',{className:'pin',title:displayPin(id)});btn.setAttribute('aria-label','Контакт '+displayPin(id));btn.setAttribute('aria-pressed','false');
   btn.style.left=pin.x*spec.scale+'px';btn.style.top=pin.y*spec.scale+'px';
   const label=make('span',{className:'pin-label',textContent:spec.id==='uno'?displayPin(id):pin.name});btn.append(label);btn.onclick=()=>pickPin(id);body.append(btn);pins.set(id,{btn,part:spec.id});
   if(spec.id==='uno' && pin.y<100){btn.classList.add('top-pin');if(pin.name==='12'){btn.classList.add('second-row');btn.style.top='-22px';}}
   if(spec.id==='uno' && pin.name==='5V'){btn.classList.add('power-pin');btn.style.top='224px';}
   if(spec.id==='led'&&pin.name==='C')btn.classList.add('led-cathode');
 }
 if(spec.id==='button'){const btn=make('button',{className:'press-button',textContent:'Удерживать кнопку'});part.append(btn);btn.onpointerdown=e=>{btn.setPointerCapture(e.pointerId);press(true);};btn.onpointerup=btn.onpointercancel=()=>press(false);btn.onkeydown=e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();press(true);}};btn.onkeyup=e=>{if(e.key===' '||e.key==='Enter')press(false);};btn.onblur=()=>press(false);}
 let drag=null;
 title.onpointerdown=e=>{drag={x:e.clientX,y:e.clientY,left:parseFloat(part.style.left),top:parseFloat(part.style.top)};title.setPointerCapture(e.pointerId);};
 title.onpointermove=e=>{if(!drag)return;part.style.left=Math.max(10,Math.min(630-spec.w,drag.left+e.clientX-drag.x))+'px';part.style.top=Math.max(32,Math.min(385-spec.h,drag.top+e.clientY-drag.y))+'px';drawWires();};
 title.onpointerup=title.onpointercancel=()=>drag=null;
 title.onkeydown=e=>{const v={ArrowUp:[0,-8],ArrowDown:[0,8],ArrowLeft:[-8,0],ArrowRight:[8,0]}[e.key];if(v){e.preventDefault();part.style.left=Math.max(10,Math.min(630-spec.w,parseFloat(part.style.left)+v[0]))+'px';part.style.top=Math.max(32,Math.min(385-spec.h,parseFloat(part.style.top)+v[1]))+'px';drawWires();}};
}


const bbToggle=make('button',{textContent:'＋ Макетная плата',className:'bb-toggle'});
document.querySelector('.toolbar').append(bbToggle);
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
  stop();breadboard=!breadboard;bb.hidden=!breadboard;stage.classList.toggle('with-breadboard',breadboard);board.classList.toggle('with-breadboard',breadboard);
  if(!breadboard){wires=wires.filter(w=>!w.a.startsWith('bb:')&&!w.b.startsWith('bb:'));selectPin(null);}
  bbToggle.textContent=breadboard?'− Убрать макетную плату':'＋ Макетная плата';renderWires();
  feedback(breadboard?'Попробуй соединить D13 с A1, а E1 — с резистором. Между A1 и E1 провод не нужен: они уже соединены внутри платы.':'Макетная плата убрана. Её провода удалены.');
};

for(const c of palette){const btn=make('button',{title:'Выбрать цвет провода'});btn.style.background=c;btn.setAttribute('aria-label','Цвет провода: '+({[palette[0]]:'красный',[palette[1]]:'чёрный',[palette[2]]:'синий',[palette[3]]:'зелёный',[palette[4]]:'жёлтый'}[c]));btn.classList.toggle('selected',color===c);btn.onclick=()=>{color=c;for(const child of $('colors').children)child.classList.toggle('selected',child===btn);};$('colors').append(btn);}

function selectPin(id){selected=id;for(const [key,{btn}] of pins){btn.classList.toggle('selected',key===id);btn.setAttribute('aria-pressed',String(key===id));}}
function pickPin(id){if(testRunning||busy)return;if(selected===id){selectPin(null);return;}if(!selected){selectPin(id);$('connect-help').textContent=`Выбран ${displayPin(id)}. Теперь нажми на контакт назначения. Esc — отмена.`;return;}addWire(selected,id);selectPin(null);}
function addWire(a,b){if(!pins.has(a)||!pins.has(b)||a===b||(!breadboard&&(a.startsWith('bb:')||b.startsWith('bb:'))))throw new Error('Выбери два разных доступных контакта');if(wires.some(w=>w.a===a&&w.b===b||w.a===b&&w.b===a)){feedback('Это соединение уже есть.');return;}stop();wires.push({a,b,color});renderWires();feedback(inspectCircuit(wires,false,breadboard).reason);}
function drawWires(){svg.replaceChildren();const rect=stage.getBoundingClientRect();for(const w of wires){const a=pins.get(w.a).btn.getBoundingClientRect(),b=pins.get(w.b).btn.getBoundingClientRect(),x1=a.x+a.width/2-rect.x,y1=a.y+a.height/2-rect.y,x2=b.x+b.width/2-rect.x,y2=b.y+b.height/2-rect.y;const p=document.createElementNS('http://www.w3.org/2000/svg','path');const middle=(x1+x2)/2;p.setAttribute('d',`M ${x1},${y1} C ${middle},${y1} ${middle},${y2} ${x2},${y2}`);p.setAttribute('stroke',w.color);svg.append(p);}}
function renderWires(){drawWires();$('wire-count').textContent=`Проводов: ${wires.length}`;$('wire-list').replaceChildren();wires.forEach((w,i)=>{const li=make('li');const text=make('span',{textContent:`${displayPin(w.a)} — ${displayPin(w.b)}`});const remove=make('button',{textContent:'×',title:'Удалить провод'});remove.setAttribute('aria-label','Удалить '+text.textContent);remove.onclick=()=>{stop();wires.splice(i,1);renderWires();feedback(inspectCircuit(wires,false,breadboard).reason);};li.append(text,remove);$('wire-list').append(li);});$('connect-help').textContent='Контакты отмечены кружками. Компоненты можно перемещать за название. На узком экране прокрути стол вправо.';queueDraftSave();}
window.addEventListener('resize',drawWires);document.addEventListener('keydown',e=>{if(e.key==='Escape')selectPin(null);});
$('undo').onclick=()=>{stop();wires.pop();renderWires();feedback(inspectCircuit(wires,false,breadboard).reason);};
$('reset').onclick=()=>{if(!window.confirm('Сбросить программу и провода текущего задания?'))return;loadMission(mission,{mode:workbenchMode,reset:true});};

function renderLesson(){
 const free=mission===FREE, m=missions[Math.min(mission,FREE-1)], observing=workbenchMode==='observe';
 document.querySelector('.lesson>.eyebrow').textContent=observing?'ДЕЛО 002 / НАБЛЮДЕНИЕ':mission===3?'ДЕЛО 002 / РЕМОНТ':free?'СВОБОДНЫЙ ЭКСПЕРИМЕНТ':`ПЕРВЫЕ ШАГИ / МИССИЯ 0${mission+1}`;
 document.querySelector('.lesson h1').textContent=observing?'Найди сбой.':free?'Твоя идея.':['Подай сигнал.','Измени ритм.','Управляй светом.','Повтори трижды.','Собери ритм.','Дай имя действию.'][mission];
 document.querySelector('.intro').textContent=observing?'Код исходного устройства. Запусти и посмотри, как ведёт себя световой индикатор.':free?'Экспериментируй с кодом, проводами и кнопкой.':'Собери устройство, попробуй новый приём и проверь результат.';
 document.querySelector('.goal p').textContent=observing?'Запусти программу, дождись двух серий и запиши наблюдение.':free?'Например, сделай мигание только при нажатой кнопке.':m.goal;
 $('check').textContent=observing?'Записать наблюдение':free?'Проверить цепь':completed.has(mission)?'✓ Пройдено · проверить ещё':'Проверить миссию';
 $('steps').replaceChildren();
 if(observing){$('lesson-content').innerHTML='<span class="step-counter">ОСМОТР УСТРОЙСТВА</span><h3>Сколько импульсов?</h3><p>Запусти исходную программу справа. Смотри на светодиод: посчитай вспышки до длинной паузы.</p><p>Для замера нужна цепь <b>D13 → резистор → LED A</b> и <b>LED C → GND</b>. Если она осталась с прошлого дела, пересобирать её не нужно.</p><p class="tip">Код пока только для чтения. Через несколько секунд нажми «Записать наблюдение». Мы измерим реальные переключения на твоей схеме.</p>'; }
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
 step=Math.min(draft?.step||0,missions[Math.min(index,FREE-1)].steps.length-1);
 if(draft){wires=draft.wires.map(w=>({...w}));breadboard=draft.breadboard;}
 if(options.reset){wires=[];breadboard=false;step=0;}
 if(index<FREE)setSource(workbenchMode==='observe'?missions[index].code:draft?.code??missions[index].code);
 else if(draft)setSource(draft.code);
 bb.hidden=!breadboard;stage.classList.toggle('with-breadboard',breadboard);board.classList.toggle('with-breadboard',breadboard);bbToggle.textContent=breadboard?'− Убрать макетную плату':'＋ Макетная плата';
 selectPin(null);lastHex=null;lastSource='';setCodeEditable(workbenchMode!=='observe');renderLesson();renderWires();
 feedback(draft?'Черновик восстановлен: код и соединения на месте. Нажми «Запустить», чтобы включить плату.':workbenchMode==='observe'?'Исходная программа готова к наблюдению. Проверь провода и нажми «Запустить».':'Начни с объяснения слева. Существующие соединения остаются на столе.');
 restoringDraft=false;queueDraftSave();
 window.dispatchEvent(new CustomEvent('nexora:mission-change',{detail:{mission:index,name:index<FREE?missions[index].name:'Свободная мастерская'}}));
}
$('prev').onclick=()=>{step=Math.max(0,step-1);renderLesson();};
$('next').onclick=()=>{if(workbenchMode==='observe'||step===missions[mission].steps.length-1)checkMission();else{step++;renderLesson();}};

function press(value){if(testRunning)return;const button=parts.get('button').element;button.pressed=value;document.querySelector('.press-button').classList.toggle('held',value);if(sim&&running)sim.setButton(value);}
function stop(){runId++;running=false;busy=false;testRunning=false;cancelAnimationFrame(raf);if(cancelCompile){const cancel=cancelCompile;cancelCompile=null;cancel();}else if(compileWorker){compileWorker.terminate();compileWorker=null;}parts.get('uno').element.ledPower=false;parts.get('button').element.pressed=false;document.querySelector('.press-button').classList.remove('held');sim=null;setLight({led:false,led13:false});$('run').disabled=false;$('run').textContent='▶ Запустить';$('stop').disabled=true;$('runtime-status').textContent='Остановлено';$('check').disabled=false;menu.disabled=false;setCodeEditable(workbenchMode!=='observe');}
function compileSource(source){return new Promise((resolve,reject)=>{const worker=new Worker(new URL('avr/worker.js',document.baseURI),{type:'module'});compileWorker=worker;const timeout=setTimeout(()=>{worker.terminate();if(compileWorker===worker)compileWorker=null;reject(new Error('Компилятор не ответил за 3 минуты. Обнови страницу и попробуй ещё раз.'));},180000);const cleanup=()=>{clearTimeout(timeout);worker.terminate();if(compileWorker===worker){compileWorker=null;cancelCompile=null;}};cancelCompile=()=>{cleanup();reject(new Error('Компиляция остановлена'));};worker.onmessage=e=>{cleanup();e.data.ok?resolve(e.data.result):reject(new Error(e.data.error?.message||'Не удалось скомпилировать программу'));};worker.onerror=e=>{cleanup();reject(new Error(e.message||'Не удалось загрузить компилятор'));};worker.postMessage({source:'#include <Arduino.h>\n#line 1 "sketch.ino"\n'+source,sensors:[],assetsBase:new URL('avr/',document.baseURI).href});});}
async function run(){
 stop();const id=runId,source=currentCode();compileDiags=[];showCodeDiagnostics(analyzeSketch(source));
 const circuit=inspectCircuit(wires,false,breadboard);
 busy=true;$('run').disabled=true;$('run').textContent='Собираю программу…';$('stop').disabled=false;$('check').disabled=true;$('runtime-status').textContent='Компиляция';
 log('Компиляция Arduino C++…\nПри первом запуске загружаются инструменты (~18 МБ и файлы Arduino).');
 try{
   let result;if(lastHex&&lastSource===source)result={hex:lastHex,fitsTarget:true};else result=await compileSource(source);
   if(id!==runId)return;if(!result.fitsTarget)throw new Error('Программа не помещается в память Arduino Uno.');lastHex=result.hex;lastSource=source;
   busy=false;serialText='';let faultMessage=null;
   sim=new Emulator(result.hex,wires.map(w=>({...w})),{breadboard,onChange:setLight,onSerial:char=>{serialText=(serialText+char).slice(-3000);},onFault:message=>{faultMessage=message;}});
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
   const structure=mission===4?/\bdurations\s*\[/.test(source)&&/\bdurations\s*\[\s*i\s*\]/.test(source):/\bvoid\s+blink\s*\(\s*int\s+/.test(source);
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
 else feedback(fault||'Проверь провод D2, две разные группы контактов кнопки и ветки if/else. Свет должен гореть только при нажатии.','error');
}
function complete(signal=null){completed.add(mission);saveWorkshop();renderLesson();feedback(`Миссия «${missions[mission].name}» выполнена! ${mission===0?'Ты собрал цепь и запустил первую программу.':mission===1?'Ты изменил поведение устройства с помощью переменной.':mission===2?'Твоя программа реагирует на вход и выбирает действие.':'Ты создал нужный сигнал с помощью '+missions[mission].short.toLowerCase()+'.'}`,'success');window.dispatchEvent(new CustomEvent('nexora:mission-complete',{detail:{mission,name:missions[mission].name,signal}}));}
$('check').onclick=checkMission;
 $('download').onclick=()=>{const blob=new Blob([currentCode()],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),a=make('a',{href:url,download:'nexora-sketch.ino'});a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('about').onclick=()=>$('modal').showModal();$('close-modal').onclick=()=>$('modal').close();
const restoredWorkshop=restoreWorkshop(readProgress().workshop,pins,FREE);drafts=restoredWorkshop.drafts;completed=restoredWorkshop.completed;
initCodeEditor();loadMission(restoredWorkshop.activeIndex,{mode:restoredWorkshop.mode});savingReady=true;renderWires();Promise.all([...parts.values()].map(p=>p.element.updateComplete)).then(drawWires);

window.nexoraWorkshop={
  open(index=0,options={}){loadMission(Math.max(0,Math.min(FREE,index)),options);document.body.classList.add('workbench-open');requestAnimationFrame(drawWires);document.getElementById('sim-main')?.scrollIntoView({block:'start'});},
  close(){saveWorkshop();stop();document.body.classList.remove('workbench-open');},
  run,stop,check:checkMission,
  getState:()=>({mission,step,mode:workbenchMode,running,wires:[...wires],breadboard,code:currentCode()})
};

window.dispatchEvent(new Event('nexora:workshop-ready'));
const context=document.modelContext;
if(context?.registerTool){const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});for(const tool of [
 {name:'read_workshop',description:'Read the current lesson, available pins, wires, code and execution state.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>({mission,step,wires,code:currentCode(),running,pins:[...pins.keys()].filter(p=>breadboard||!p.startsWith('bb:')),feedback:$('feedback').textContent})},
 {name:'connect_workshop_pins',description:'Add wires between available contacts in the visible circuit. Stops the running program.',inputSchema:{type:'object',properties:{connections:{type:'array',maxItems:20,items:{type:'object',properties:{a:{type:'string'},b:{type:'string'}},required:['a','b'],additionalProperties:false}}},required:['connections'],additionalProperties:false},annotations:{readOnlyHint:false},execute:input=>{if(busy||testRunning)throw new Error('Wait until compilation or checking finishes');if(!Array.isArray(input.connections)||input.connections.length>20||input.connections.some(w=>!pins.has(w.a)||!pins.has(w.b)||w.a===w.b||(!breadboard&&(w.a.startsWith('bb:')||w.b.startsWith('bb:')))))throw new Error('Invalid contacts');for(const w of input.connections)addWire(w.a,w.b);return{wires,feedback:$('feedback').textContent};}},
 ])try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{} }
