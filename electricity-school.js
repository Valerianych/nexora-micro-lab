import {electricityExperiments,normalizeElectricity,observeElectricity,hasElectricityEvidence} from './electricity-model.js';

const escape = value => String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const choices = (name,options,current) => `<div class="electric-options">${options.map(([value,label])=>`<button type="button" data-electric-option="${name}" data-value="${value}" aria-pressed="${String(value)===String(current)}">${label}</button>`).join('')}</div>`;

function controls(index,settings) {
  if(index===0) return `<fieldset><legend>Куда подключить обратный провод?</legend>${choices('returnTo',[['open','Оставить разрыв'],['5v','К питанию 5V'],['gnd','К GND']],settings.returnTo)}</fieldset>`;
  if(index===1) return `<fieldset><legend>Положение светодиода</legend>${choices('forward',[[true,'A к источнику'],[false,'C к источнику']],settings.forward)}</fieldset><fieldset><legend>Положение резистора</legend>${choices('placement',[['before','Перед LED'],['after','После LED']],settings.placement)}</fieldset>`;
  if(index===2) return `<fieldset><legend>Сопротивление в цепи</legend>${choices('resistance',[[0,'0 Ом · перемычка'],[100,'100 Ом'],[220,'220 Ом'],[1000,'1000 Ом']],settings.resistance)}</fieldset>`;
  return `<div class="electric-code"><span>Программа Arduino</span><code><b>int</b> ledPin = <em>13</em>;<br>pinMode(ledPin, <strong>OUTPUT</strong>);<br>digitalWrite(ledPin, <strong>HIGH</strong>);<br>digitalWrite(ledPin, <strong>LOW</strong>);</code></div><fieldset><legend>К какому контакту подключить цепь?</legend>${choices('source',[['5v','Питание 5V'],['d12','Контакт D12'],['d13','Контакт D13']],settings.source)}</fieldset>`;
}

function circuit(index,settings,result) {
  const {config}=observeElectricity(index,settings),on=result?.status==='on',unsafe=result?.status==='unsafe';
  const source=config.source==='5v'?'5V':config.source.toUpperCase(),returnTo=config.returnTo;
  const before=config.placement==='before',rY=before?130:240,rValue=config.resistance===0?'Перемычка':`${config.resistance} Ω`;
  const bottom=returnTo==='open'?'M 500 130 V 240 H 330 M 285 240 H 148':returnTo==='5v'?'M 500 130 V 240 H 176 V 130 H 148':'M 500 130 V 240 H 148';
  const mode=on?(index===3&&!result.onLow?' is-blinking':' is-on'):unsafe?' is-unsafe':'';
  return `<div class="electric-circuit${mode}" aria-label="Учебная схема цепи">
    <svg viewBox="0 0 640 330" role="img" aria-labelledby="electric-diagram-title">
      <title id="electric-diagram-title">${escape(source)} — резистор — светодиод — ${returnTo==='open'?'разрыв':returnTo==='5v'?'5V':'GND'}. ${result?escape(result.headline):'Выбери соединение и проведи опыт.'}</title>
      <defs><pattern id="electric-grid" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#527184" opacity=".3"/></pattern></defs>
      <rect width="640" height="330" fill="url(#electric-grid)"/>
      <rect x="18" y="76" width="130" height="200" rx="12" fill="#266481" stroke="#60a7c4" stroke-width="2"/>
      <rect x="26" y="91" width="25" height="37" rx="3" fill="#c0c9d1"/><rect x="30" y="207" width="32" height="34" rx="4" fill="#0d1a2c"/>
      <rect x="69" y="159" width="57" height="53" rx="4" fill="#112b3c"/><text x="83" y="113" text-anchor="middle" class="electric-board-title">UNO</text><text x="82" y="264" text-anchor="middle" class="electric-board-sub">USB · 5 В</text>
      <path d="M 148 130 H 365" class="electric-wire"/><path d="M 419 130 H 500" class="electric-wire"/><path d="${bottom}" class="electric-wire return-wire"/>
      <path d="M 148 130 H 365 M 419 130 H 500 V 240 H 148" class="electric-flow"/>
      ${returnTo==='open'?'<path d="M 285 240 H 330" class="electric-gap"/><text x="308" y="278" text-anchor="middle" class="electric-label">Разрыв</text>':''}
      <circle cx="148" cy="130" r="7" class="electric-contact"/><circle cx="148" cy="240" r="7" class="electric-contact"/><text x="136" y="148" text-anchor="end" class="electric-contact-label">${source}</text><text x="136" y="236" text-anchor="end" class="electric-contact-label">GND</text>
      <rect x="221" y="${rY-13}" width="80" height="26" rx="6" fill="#edd4a2" stroke="#8c6a40" stroke-width="2"/>
      ${config.resistance===0?`<path d="M 229 ${rY} H 293" stroke="#556574" stroke-width="5"/>`:`<path d="M 236 ${rY-12} V ${rY+12} M 250 ${rY-12} V ${rY+12}" stroke="#c75538" stroke-width="6"/><path d="M 267 ${rY-12} V ${rY+12}" stroke="#915828" stroke-width="6"/>`}
      <text x="262" y="${before?96:286}" text-anchor="middle" class="electric-label">${rValue}</text>
      <path d="M ${config.forward?'371 115 L 409 130 L 371 145':'413 115 L 375 130 L 413 145'} Z" class="electric-led"/>
      <path d="M ${config.forward?'409':'375'} 110 V 150" stroke="#dae6e8" stroke-width="4"/>
      <path d="M 391 96 l 9 -16 m -9 3 l 9 -3 l 2 9 M 405 103 l 9 -16 m -9 3 l 9 -3 l 2 9" class="electric-light-rays"/>
      <text x="354" y="175" text-anchor="middle" class="electric-contact-label">${config.forward?'A (+)':'C (−)'}</text><text x="432" y="175" text-anchor="middle" class="electric-contact-label">${config.forward?'C (−)':'A (+)'}</text><text x="392" y="59" text-anchor="middle" class="electric-label">Светодиод</text>
      <text x="554" y="213" text-anchor="middle" class="electric-reading">${result?unsafe?'!':on?'СВЕТ':'ТЕМНО':'?'}</text>
      <text x="554" y="237" text-anchor="middle" class="electric-label">${result?result.currentMa===null?'перегрузка':`${result.currentMa.toLocaleString('ru-RU',{maximumFractionDigits:1})} мА`:'ждём опыт'}</text>
    </svg>
    <div class="electric-diagram-caption">${index===3?'Программа проверяется в двух фазах: HIGH → LOW.':on?'Пунктир показывает условное направление тока в замкнутой цепи.':'Измени один параметр, затем проверь, появился ли ток.'}</div>
  </div>`;
}

export function createElectricitySchool({saved,onChange=()=>{}}={}) {
  let state=normalizeElectricity(saved),result=null,answerFeedback='',onFinish=null;
  const dialog=document.createElement('dialog');dialog.id='electricity-school';dialog.className='electricity-school';dialog.setAttribute('aria-labelledby','electricity-title');document.body.append(dialog);
  const changed=()=>onChange(structuredClone(state));
  const complete=()=>state.solved.every(Boolean);
  const reached=()=>complete()?4:state.solved.findIndex(value=>!value);
  const dirty=()=>{result=null;answerFeedback='';};
  function render(focusSelector) {
    const page=state.page,finished=page===4,lesson=electricityExperiments[page];
    dialog.innerHTML=`<header class="electric-header"><div><span class="electric-eyebrow">МАЯ / ЛАБОРАТОРИЯ ГИПОТЕЗ</span><h2 id="electricity-title">${finished?'Теперь ты знаешь, что проверять.':'Почему маяк молчит?'}</h2></div><button type="button" class="electric-close" data-electric-close aria-label="Закрыть урок">×</button></header>
      <nav class="electric-nav" aria-label="Опыты по электрическим цепям">${electricityExperiments.map((item,i)=>`<button type="button" data-electric-page="${i}" ${i>reached()?'disabled':''} aria-current="${page===i?'step':'false'}"><span>${state.solved[i]?'✓':i+1}</span>${item.short}</button>`).join('')}</nav>
      ${finished?summary():`<div class="electric-body"><section class="electric-lab"><span class="electric-eyebrow">ОПЫТ ${page+1} / 4</span><h3>${lesson.title}</h3><p class="electric-mission">${lesson.mission}</p>${circuit(page,state.settings[page],result)}${controls(page,state.settings[page])}<button type="button" class="electric-run" data-electric-run>Провести опыт →</button><div class="electric-observation" role="status" aria-live="polite">${result?`<b>${result.headline}</b><p>${result.message}</p>${page===3?`<div class="electric-phases"><span>Код HIGH <i class="${result.onHigh?'lit':''}"></i> ${result.onHigh?'свет':'темно'}</span><span>Код LOW <i class="${result.onLow?'lit':''}"></i> ${result.onLow?'свет':'темно'}</span></div>`:''}`:'Сначала выбери свой вариант. Опыт покажет результат; ошибка здесь — повод проверить гипотезу.'}</div></section>
      <aside class="electric-investigation"><span class="electric-eyebrow">СОБЕРИ ДОКАЗАТЕЛЬСТВА</span><ul class="electric-evidence">${lesson.required.map((key,i)=>`<li class="${state.seen[page].includes(key)?'observed':''}"><span>${state.seen[page].includes(key)?'✓':'○'}</span>${lesson.labels[i]}</li>`).join('')}</ul><p class="electric-evidence-note">Сравни все три варианта, затем объясни наблюдение.</p><fieldset class="electric-question"><legend>${lesson.question}</legend>${lesson.answers.map((text,i)=>`<button type="button" data-electric-answer="${i}" ${!hasElectricityEvidence(page,state.seen[page])?'disabled':''} class="${state.solved[page]&&i===lesson.correct?'correct':''}">${text}</button>`).join('')}</fieldset><div class="electric-answer-feedback" role="status" aria-live="polite">${answerFeedback|| (state.solved[page]?`<b>Верно.</b> ${lesson.explanation}`:'')}</div>${page===2?'<details class="electric-assumptions"><summary>Откуда берутся числа?</summary><p>Это упрощённая модель: питание 5 В, падение на LED около 2 В, учебный предел 20 мА. <code>I = (5 − 2) / R</code>. Значения зависят от реального LED и платы.</p></details>':''}<button type="button" class="electric-next" data-electric-next ${!state.solved[page]?'disabled':''}>${page===3?'К самостоятельной сборке →':'Следующий опыт →'}</button></aside></div>`}
      <footer class="electric-footer"><span>Урок сохраняется в этом браузере. Можно закрыть и продолжить.</span><a href="https://docs.arduino.cc/built-in-examples/basics/Blink/" target="_blank" rel="noopener">Справка Arduino ↗</a></footer>`;
    if(focusSelector)dialog.querySelector(focusSelector)?.focus({preventScroll:true});
  }
  function summary() {
    return `<div class="electric-summary"><div class="electric-summary-badge">✓</div><h3>Верни маяку управляемый свет.</h3><p>На верстаке будет настоящая схема и работающая программа. Соединения выбери сама: единственного правильного порядка проводов нет.</p><ul><li>Нужен замкнутый путь от управляемого выхода к GND через LED.</li><li>A — к более высокому уровню, C — к более низкому.</li><li>Резистор 220 Ом должен ограничивать ток в этой же ветви.</li><li>Контакт на плате должен совпадать с <code>ledPin</code> в коде.</li></ul><p class="electric-transfer">Проверь себя: будет ли работать цепь, если поставить резистор между C и GND? Испытай это на верстаке.</p><button type="button" class="electric-run" data-electric-finish>${onFinish?'Собрать и проверить маяк →':'Вернуться к делу →'}</button></div>`;
  }
  dialog.addEventListener('click',event=>{
    const target=event.target.closest('button');if(!target||target.disabled)return;
    if(target.hasAttribute('data-electric-close')){dialog.close();return;}
    if(target.hasAttribute('data-electric-page')){state.page=Number(target.dataset.electricPage);dirty();render(`[data-electric-page="${state.page}"]`);changed();return;}
    if(target.hasAttribute('data-electric-option')){
      const key=target.dataset.electricOption,value=target.dataset.value;
      state.settings[state.page][key]=key==='forward'?value==='true':key==='resistance'?Number(value):value;
      dirty();render(`[data-electric-option="${key}"][data-value="${value}"]`);changed();return;
    }
    if(target.hasAttribute('data-electric-run')){
      result=observeElectricity(state.page,state.settings[state.page]);
      if(electricityExperiments[state.page].required.includes(result.key)&&!state.seen[state.page].includes(result.key))state.seen[state.page].push(result.key);
      render('[data-electric-run]');changed();return;
    }
    if(target.hasAttribute('data-electric-answer')){
      const lesson=electricityExperiments[state.page];
      if(Number(target.dataset.electricAnswer)===lesson.correct){state.solved[state.page]=true;answerFeedback=`<b>Верно.</b> ${lesson.explanation}`;}
      else answerFeedback=`<b>Сравни результаты ещё раз.</b> ${state.page===0?'При 5V на обоих концах свет не появился. А при 5V и GND появился.':state.page===1?'Сравни два опыта с правильно включённым LED: ток одинаков и перед ним, и после него.':state.page===2?'Сопоставь ток в опытах с 220 и 1000 Ом, а не только напряжение питания.':'Сравни фазы HIGH и LOW: какой контакт меняется по команде программы?'}`;
      render(`[data-electric-answer="${target.dataset.electricAnswer}"]`);changed();return;
    }
    if(target.hasAttribute('data-electric-next')){state.page++;dirty();render();dialog.querySelector('h3')?.scrollIntoView({block:'nearest'});dialog.querySelector('[data-electric-option], [data-electric-finish]')?.focus({preventScroll:true});changed();return;}
    if(target.hasAttribute('data-electric-finish')){const callback=onFinish;dialog.close();callback?.();}
  });
  dialog.addEventListener('close',()=>{onFinish=null;});
  return {
    open({onComplete}={}){onFinish=onComplete||null;dirty();render();if(!dialog.open)dialog.showModal();},
    close(){if(dialog.open)dialog.close();onFinish=null;},
    reset(){state=normalizeElectricity();dirty();if(dialog.open)render();changed();},
    isComplete:complete,
    snapshot:()=>structuredClone(state),
  };
}
