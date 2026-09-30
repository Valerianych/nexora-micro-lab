import {blockPrograms,normalizeBlocks,generateBlockCode,blockProblem} from './program-blocks.js';
const el=(tag,props={})=>Object.assign(document.createElement(tag),props);

export function createProgramBuilder({mount,kind,saved,readCode,writeCode,onMode=()=>{},onChange=()=>{},beforeChange=()=>{}}){
  const def=blockPrograms[kind];let state=normalizeBlocks(kind,saved),disabled=false;
  if(!saved&&readCode().replace(/\s/g,'')!=='voidsetup(){}voidloop(){}')state.mode='code';
  if(state.mode==='code')state.manualCode=readCode();
  const root=el('div',{className:'program-builder'});mount.append(root);
  const tabs=el('div',{className:'builder-tabs',role:'group',ariaLabel:'Способ сборки программы'});
  const blocksTab=el('button',{type:'button',textContent:'Собрать блоками'}),codeTab=el('button',{type:'button',textContent:'C++'});
  blocksTab.dataset.programMode='blocks';codeTab.dataset.programMode='code';tabs.append(blocksTab,codeTab);root.append(tabs);
  const panel=el('div',{className:'builder-panel'});root.append(panel);
  const intro=el('p',{className:'builder-intro',textContent:'Добавляй готовые команды кнопками «+». Порядок меняй стрелками или перетаскиванием. Схема читается сверху вниз; ветки ДА и НЕТ показывают условие.'});panel.append(intro);
  const data=el('details',{className:'builder-data'});data.append(el('summary',{textContent:'Контакты и исходные данные'}),el('pre',{textContent:def.globals}));panel.append(data);
  const fields=el('div',{className:'builder-fields'});panel.append(fields);
  const feedback=el('p',{className:'builder-progress',role:'status'});panel.append(feedback);
  const canvas=el('div',{className:'builder-flow'});panel.append(canvas);
  const exportButton=el('button',{type:'button',className:'builder-export',textContent:'Открыть собранную программу в C++'});panel.append(exportButton);
  const note=el('p',{className:'builder-code-note',textContent:'Текстовый режим. Твой черновик C++ сохраняется отдельно от блоков.'});root.append(note);
  function snapshot(){return {...structuredClone(state),manualCode:state.mode==='code'?readCode():state.manualCode};}
  function changed(){beforeChange();writeCode(generateBlockCode(kind,state));renderProgress();onChange(snapshot());}
  function mode(value){
    if(disabled||state.mode===value)return;
    beforeChange();
    if(state.mode==='code')state.manualCode=readCode();
    state.mode=value;
    if(value==='blocks')writeCode(generateBlockCode(kind,state));
    else writeCode(state.manualCode??generateBlockCode(kind,state));
    renderMode();onChange(snapshot());
  }
  function renderMode(){
    panel.hidden=state.mode!=='blocks';note.hidden=state.mode!=='code';
    blocksTab.setAttribute('aria-pressed',String(state.mode==='blocks'));codeTab.setAttribute('aria-pressed',String(state.mode==='code'));
    onMode(state.mode);
  }
  function renderProgress(){
    const used=Object.values(state.zones).reduce((n,x)=>n+x.length,0),total=def.zones.reduce((n,z)=>n+z.blocks.length,0);
    feedback.textContent=`Команд: ${used} / ${total}. ${blockProblem(kind,state)||'Все команды на схеме. Проверь порядок и запусти устройство.'}`;
  }
  const displayCode=code=>code.replace(/\{(\w+)\}/g,(_,key)=>state.fields[key]||'…');
  function redrawFlow(){canvas.replaceChildren();drawFlow(def.flow,canvas);}
  for(const field of def.fields){
    const label=el('label',{textContent:field.label}),select=el('select',{ariaLabel:field.label});select.dataset.blockField=field.id;
    select.append(el('option',{value:'',textContent:'Выбери…'}));for(const [value,textContent] of field.options)select.append(el('option',{value,textContent}));
    select.value=state.fields[field.id];select.onchange=()=>{state.fields[field.id]=select.value;changed();redrawFlow();};label.append(select);fields.append(label);
  }
  function drawZone(z){
    const box=el('section',{className:'builder-zone'});box.dataset.blockZone=z.id;
    box.append(el('h4',{textContent:z.title}),el('p',{textContent:z.description}));
    const list=el('ol',{className:'builder-statements',ariaLabel:z.title});box.append(list);
    const bank=el('div',{className:'builder-bank',role:'group',ariaLabel:'Готовые команды: '+z.title});box.append(bank);
    function render(focusId){
      list.replaceChildren();bank.replaceChildren();
      if(!state.zones[z.id].length)list.append(el('li',{className:'builder-empty',textContent:'↓ Добавь первую команду из набора ниже'}));
      state.zones[z.id].forEach((id,index)=>{
        const b=z.blocks.find(b=>b.id===id),row=el('li',{className:'builder-statement',draggable:!disabled});row.dataset.blockId=id;
        const copy=el('span');copy.append(el('b',{textContent:b.label}),el('code',{textContent:displayCode(b.code)}));row.append(copy);
        const actions=el('span',{className:'builder-order'});
        for(const [action,text,label] of [['up','↑','Выше'],['down','↓','Ниже'],['remove','×','Убрать']]){
          const button=el('button',{type:'button',textContent:text,ariaLabel:`${label}: ${b.label}`,disabled:disabled||action==='up'&&index===0||action==='down'&&index===state.zones[z.id].length-1});button.dataset.order=action;
          button.onclick=()=>{if(disabled)return;const items=state.zones[z.id];if(action==='remove')items.splice(index,1);else{const next=index+(action==='up'?-1:1);[items[index],items[next]]=[items[next],items[index]];}changed();render(id);};actions.append(button);
        }
        row.append(actions);row.ondragstart=e=>{if(disabled)return;e.dataTransfer.setData('text/plain',JSON.stringify({zone:z.id,id}));e.dataTransfer.effectAllowed='move';};
        row.ondragover=e=>e.preventDefault();row.ondrop=e=>{e.preventDefault();e.stopPropagation();drop(e,index);};list.append(row);
      });
      for(const b of z.blocks.filter(b=>!state.zones[z.id].includes(b.id))){
        const button=el('button',{type:'button',className:'builder-add',disabled,draggable:!disabled,ariaLabel:'Добавить: '+b.label});button.dataset.addBlock=b.id;
        button.append(el('b',{textContent:'+ '+b.label}),el('code',{textContent:displayCode(b.code)}));
        button.onclick=()=>{if(disabled)return;state.zones[z.id].push(b.id);changed();render(b.id);};
        button.ondragstart=e=>{e.dataTransfer.setData('text/plain',JSON.stringify({zone:z.id,id:b.id}));e.dataTransfer.effectAllowed='move';};bank.append(button);
      }
      if(focusId)box.querySelector(`[data-block-id="${focusId}"] button:not(:disabled), [data-add-block="${focusId}"]`)?.focus({preventScroll:true});
    }
    function drop(event,index){
      if(disabled)return;
      let item;try{item=JSON.parse(event.dataTransfer.getData('text/plain'));}catch{return;}
      if(item.zone!==z.id||!z.blocks.some(b=>b.id===item.id))return;
      const items=state.zones[z.id],old=items.indexOf(item.id);if(old>=0)items.splice(old,1);
      items.splice(Math.min(index,items.length),0,item.id);changed();render(item.id);
    }
    list.ondragover=e=>e.preventDefault();list.ondrop=e=>{e.preventDefault();drop(e,state.zones[z.id].length);};
    render();return box;
  }
  function drawFlow(items,parent){for(const item of items){
    if(item.zone){parent.append(drawZone(def.zones.find(z=>z.id===item.zone)));continue;}
    if(item.note){parent.append(el('p',{className:'builder-wait',textContent:item.note}));continue;}
    const title=kind==='arduino'?item.group.replace('…',state.fields.logic==='||'?'ИЛИ':state.fields.logic==='&&'?'И':'…'):item.group;
    const group=el('div',{className:'builder-group '+(item.kind||'')});group.append(el('h4',{textContent:title}));drawFlow(item.children,group);parent.append(group);
  }}
  drawFlow(def.flow,canvas);
  blocksTab.onclick=()=>mode('blocks');codeTab.onclick=()=>mode('code');
  exportButton.onclick=()=>{if(disabled)return;if(state.manualCode&&state.manualCode!==generateBlockCode(kind,state)&&!window.confirm('Заменить текстовый черновик программой из блоков?'))return;state.manualCode=generateBlockCode(kind,state);mode('code');};
  if(state.mode==='blocks')writeCode(generateBlockCode(kind,state));renderMode();renderProgress();
  return {snapshot,problem:()=>state.mode==='blocks'?blockProblem(kind,state):'',setMode:mode,
    setDisabled(value){if(disabled===value)return;disabled=value;root.querySelectorAll('button,select').forEach(b=>b.disabled=value);redrawFlow();},
    destroy(){root.remove();}};
}
