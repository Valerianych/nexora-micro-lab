import {signalCommands,normalizeSignalExercise,buildSignalSketch,signalPreview} from './case-one.js';

export function createSignalExercise({mount,saved,onChange=()=>{},onApply=()=>{}}){
  let state=normalizeSignalExercise(saved),disabled=false;
  const root=document.createElement('section');root.className='signal-exercise';root.setAttribute('aria-label','Собери первую программу из строк');mount.append(root);
  const changed=()=>onChange(structuredClone(state));
  const commandLabel={high:'HIGH · включить',low:'LOW · выключить',wait500:'delay · 500 мс',wait1000:'delay · 1000 мс'};
  function render(){
    const preview=signalPreview(state),ready=buildSignalSketch(state);
    root.innerHTML=`<span class="signal-exercise-kicker">МАЯ / ПОПРОБУЙ СОБРАТЬ КОМАНДЫ</span><h3>Как получается мигание?</h3><p>В <code>setup()</code> выбери режим контакта. В <code>loop()</code> собери четыре строки: уровень, ожидание, другой уровень, ожидание.</p><label>Режим в setup()<select data-signal-setup aria-label="Режим контакта в setup"><option value="">Выбери режим</option><option value="OUTPUT" ${state.setup==='OUTPUT'?'selected':''}>OUTPUT · управлять</option><option value="INPUT" ${state.setup==='INPUT'?'selected':''}>INPUT · читать</option></select></label><div class="signal-exercise-lines">${state.lines.map((id,i)=>`<label><span>${i+1}</span><select data-signal-line="${i}" aria-label="Строка ${i+1} в loop"><option value="">Выбери команду</option>${Object.entries(signalCommands).map(([key,item])=>`<option value="${key}" ${key===id?'selected':''}>${commandLabel[key]}</option>`).join('')}</select></label><code class="signal-selected-code">${id?signalCommands[id].code:'// выбери строку выше'}</code>`).join('')}</div><div class="signal-preview" role="img" aria-label="Предпросмотр пауз и уровней">${preview.segments.length?preview.segments.map(s=>`<span class="${s.on?'is-on':''}" style="flex-grow:${s.duration}">${s.on?'свет':'темно'}<small>${s.duration} мс</small></span>`).join(''):'Добавь ожидание, чтобы уровень сохранялся некоторое время.'}</div><p class="signal-preview-note">Это разбор команд, а не запуск платы. ${state.setup==='INPUT'?'Режим INPUT читает вход; он не управляет внешним LED.':preview.duration?'Показан первый проход loop(). На плате функция будет повторяться.':'Без delay переключения будут слишком быстрыми для наблюдения.'}</p><button type="button" data-signal-apply ${!ready||disabled?'disabled':''}>Испытать мой фрагмент на плате →</button><p class="signal-exercise-status" role="status">${state.applied?'Фрагмент отправлен в редактор. Наблюдай за внешним LED и проверь миссию.':'Цель: по 500 мс свет и темнота. Варианты можно проверять и исправлять.'}</p>`;
    root.querySelectorAll('select').forEach(el=>el.disabled=disabled);
  }
  root.addEventListener('change',event=>{
    if(disabled)return;
    if(event.target.hasAttribute('data-signal-setup'))state.setup=event.target.value;
    else if(event.target.hasAttribute('data-signal-line'))state.lines[Number(event.target.dataset.signalLine)]=event.target.value;
    else return;
    state.applied=false;render();changed();
  });
  root.addEventListener('click',event=>{
    if(!event.target.closest('[data-signal-apply]')||disabled)return;
    const code=buildSignalSketch(state);if(!code)return;
    state.applied=true;render();changed();onApply(code);
  });
  render();return {snapshot:()=>structuredClone(state),setDisabled(value){disabled=value;render();},destroy:()=>root.remove()};
}
