import {readProgress,writeProgress} from './progress.js';
import {CASE_MISSIONS} from './case-stories.js';
import {reflections,checkReflection,threadClues} from './case-reflections.js';
import {normalizeStudy,ensureRecord,createSave,parseSave,installSave,validateProgress,reportHtml,BACKUP_KEY,SAVE_LIMIT,escapeHtml as e} from './learning-record.js';

function download(source,name,type) {
  const url=URL.createObjectURL(new Blob([source],{type}));
  const link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const filename=value=>String(value||'student').replace(/[^\p{L}\p{N}_-]+/gu,'_').slice(0,80);
const currentCase=mission=>Object.entries(CASE_MISSIONS).find(([,indices])=>indices.includes(mission))?.[0];

export function createStudyTools({catalog,getGame,flushGame}) {
  let study=normalizeStudy(readProgress().study),pending=null,onReviewed=null,reviewId='',lastTick=Date.now(),lastInteraction=Date.now();
  const dialog=document.createElement('dialog');dialog.id='study-dialog';dialog.className='study-dialog';dialog.setAttribute('aria-labelledby','study-title');
  const review=document.createElement('dialog');review.id='reflection-dialog';review.className='study-dialog reflection-dialog';review.setAttribute('aria-labelledby','reflection-title');
  document.body.append(dialog,review);
  for(const host of [dialog,review])host.addEventListener('keydown',event=>event.stopPropagation());
  const persist=()=>writeProgress('study',study);
  function player() {
    const name=study.profile.name.trim()||'Стажёр';
    const label=document.getElementById('player-name'),avatar=document.getElementById('player-avatar');
    if(label)label.textContent=name;if(avatar)avatar.textContent=name.slice(0,1).toLocaleUpperCase('ru-RU');
  }
  function tick() {
    const now=Date.now(),game=getGame(),elapsed=Math.min(30000,Math.max(0,now-lastTick));lastTick=now;
    if(game.started&&!document.hidden&&now-lastInteraction<120000){const r=ensureRecord(study,game.activeCase);r.activeMs+=elapsed;}
  }
  function flush() {tick();window.dispatchEvent(new Event('nexora:flush-progress'));flushGame();persist();return readProgress();}
  function status(message,error=false) {const out=dialog.querySelector('#study-status');if(out){out.textContent=message;out.classList.toggle('is-error',error);}}
  function record(id) {return ensureRecord(study,id||getGame().activeCase);}
  function render() {
    const game=getGame(),closed=game.completedCases||[],unlocked=game.unlockedCases||['001'];pending=null;
    let backup=false;try{backup=Boolean(localStorage.getItem(BACKUP_KEY));}catch{}
    dialog.innerHTML=`<div class="study-heading"><div><span class="eyebrow">ЛИЧНАЯ УЧЕБНАЯ ПАПКА</span><h2 id="study-title">Учебный прогресс</h2></div><button type="button" data-study-close aria-label="Закрыть учебный прогресс">×</button></div>
      <p class="study-lead">Сохрани прохождение для другого компьютера или передай преподавателю отчёт о работе.</p>
      <div class="study-profile"><label>Имя и фамилия<input id="study-name" maxlength="100" autocomplete="name" value="${e(study.profile.name)}" placeholder="Как подписать отчёт"></label><label>Группа<input id="study-group" maxlength="50" value="${e(study.profile.group)}" placeholder="Например, П-240"></label></div>
      <div class="study-actions"><button type="button" data-study-export class="accent">↓ Скачать сохранение</button><button type="button" data-study-import>↑ Загрузить сохранение</button><button type="button" data-study-report>↓ Отчёт преподавателю</button>${backup?'<button type="button" data-study-backup>Вернуть предыдущее сохранение</button>':''}</div>
      <p class="study-note">Сохранение переносит дела, код, провода и результаты. Отчёт открывается в браузере и подходит для печати.</p>
      <input type="file" id="study-file" accept=".json,application/json" hidden><div id="study-import-preview"></div><p id="study-status" class="study-status" role="status" aria-live="polite"></p>
      <div class="study-overview"><b>${closed.length} / ${catalog.length}<small>дел закрыто</small></b><b>${Object.values(study.cases).filter(r=>r.reflection.passed).length}<small>самопроверок пройдено</small></b><span>Время, проверки и подсказки учитываются с этого обновления.</span></div>
      <div class="study-table-wrap"><table class="study-table"><thead><tr><th>Дело</th><th>Прохождение</th><th>Самопроверка</th><th></th></tr></thead><tbody>${catalog.map(item=>{const r=study.cases[item.id];return `<tr><td><b>${item.id}</b> ${e(item.title)}</td><td>${closed.includes(item.id)?'Закрыто':game.started&&game.activeCase===item.id?'В работе':unlocked.includes(item.id)?'Доступно':'Позже'}</td><td>${r?.reflection.passed?'✓ Пройдена':r?.reflection.attempts?'Можно повторить':'—'}</td><td><button type="button" data-study-review="${item.id}" ${unlocked.includes(item.id)?'':'disabled'}>${r?.reflection.passed?'Повторить':'Проверить себя'}</button></td></tr>`;}).join('')}</tbody></table></div>
      <details class="study-thread"><summary>Общая папка TEST-04 · ${closed.length} / ${catalog.length} находок</summary><p>У нескольких неисправностей обнаруживается общая история переноса тестовых настроек. Новые записи появляются после закрытия дел.</p>${closed.length?'<ol>'+catalog.filter(item=>closed.includes(item.id)).map(item=>`<li><b>Дело ${item.id}.</b> ${e(threadClues[item.id])}</li>`).join('')+'</ol>':'<p>Первая находка появится после дела 001.</p>'}</details>`;
  }
  function preview(file) {
    pending=file;const game=file.progress.game||{},profile=normalizeStudy(file.progress.study).profile;
    const count=(game.completedCases||[]).length;
    dialog.querySelector('#study-import-preview').innerHTML=`<section class="study-import-preview"><h3>Подтверди загрузку</h3><p><b>${e(profile.name||'Сохранение без имени')}</b>${profile.group?' · '+e(profile.group):''}<br>Закрыто дел: ${count}. Текущее дело: ${e(game.activeCase||'001')}.</p><p>Прохождение на этом компьютере будет заменено. Предыдущая версия останется доступна в этой папке.</p><div class="study-actions"><button type="button" data-study-apply class="accent">Загрузить это прохождение</button><button type="button" data-study-cancel>Отмена</button></div></section>`;
    dialog.querySelector('[data-study-apply]').focus();
  }
  dialog.addEventListener('input',event=>{
    if(event.target.id==='study-name'||event.target.id==='study-group'){
      study.profile.name=dialog.querySelector('#study-name').value.slice(0,100);study.profile.group=dialog.querySelector('#study-group').value.slice(0,50);persist();player();
    }
  });
  dialog.addEventListener('change',async event=>{
    if(event.target.id!=='study-file')return;
    const file=event.target.files?.[0];if(!file)return;
    try{if(file.size>SAVE_LIMIT)throw Error('Файл слишком большой. Допустимо до 2 МБ.');preview(parseSave(await file.text()));status('Файл проверен. Подтверди, какое прохождение загрузить.');}
    catch(error){pending=null;dialog.querySelector('#study-import-preview').replaceChildren();status(error.message,true);}
    event.target.value='';
  });
  dialog.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button||button.disabled)return;
    try{
      if(button.hasAttribute('data-study-close'))dialog.close();
      if(button.hasAttribute('data-study-export')){const data=flush();download(createSave(data),`Нексора_сохранение_${filename(study.profile.name)}.json`,'application/json;charset=utf-8');status('Сохранение скачано. Его можно загрузить на другом компьютере.');}
      if(button.hasAttribute('data-study-report')){const data=flush();download(reportHtml(data,catalog),`Нексора_отчёт_${filename(study.profile.name)}.html`,'text/html;charset=utf-8');status('Отчёт скачан. Открой файл в браузере или передай преподавателю.');}
      if(button.hasAttribute('data-study-import'))dialog.querySelector('#study-file').click();
      if(button.hasAttribute('data-study-cancel')){pending=null;dialog.querySelector('#study-import-preview').replaceChildren();status('Загрузка отменена.');}
      if(button.hasAttribute('data-study-backup')){const raw=localStorage.getItem(BACKUP_KEY);if(!raw)throw Error('Предыдущее сохранение не найдено.');preview({progress:validateProgress(JSON.parse(raw))});}
      if(button.hasAttribute('data-study-apply')&&pending){
        flush();window.nexoraWorkshop?.close?.();
        // The pagehide writers must not overwrite imported data during reload.
        globalThis.__nexoraProgressReplacing=true;
        try{installSave(localStorage,pending.progress);location.reload();}catch(error){globalThis.__nexoraProgressReplacing=false;throw error;}
      }
      if(button.dataset.studyReview){const id=button.dataset.studyReview;dialog.close();openReview(id);}
    }catch(error){status(error.message||'Не удалось выполнить действие. Попробуй ещё раз.',true);}
  });

  function openReview(id,callback=null) {
    const task=reflections[id],item=catalog.find(item=>item.id===id);if(!task||!item)return;
    reviewId=id;onReviewed=callback;const r=record(id);
    review.innerHTML=`<div class="study-heading"><div><span class="eyebrow">ДЕЛО ${id} / НОВЫЕ УСЛОВИЯ</span><h2 id="reflection-title">Проверь понимание</h2></div><button type="button" data-review-close aria-label="Закрыть самопроверку">×</button></div><p class="study-lead">${callback?'Устройство уже испытано. Теперь примени тот же принцип к другой ситуации.':'Примени принцип из этого дела к новым условиям. Самопроверка сохраняется отдельно от испытаний устройства.'}</p><form id="reflection-form"><label class="reflection-question" for="reflection-answer">${e(task.question)}</label><input id="reflection-answer" name="answer" type="text" inputmode="decimal" maxlength="30" autocomplete="off" required value="${e(r.reflection.passed?r.reflection.answer:'')}" placeholder="Твой числовой ответ"><fieldset class="reflection-reasons"><legend>Почему?</legend>${task.choices.map((choice,i)=>`<label><input type="radio" name="reason" value="${i}" required ${r.reflection.passed&&r.reflection.reason===i?'checked':''}><span>${e(choice)}</span></label>`).join('')}</fieldset><details class="learning-hint" data-case-id="${id}"><summary>Нужна подсказка</summary><p>${e(task.hint)}</p></details><button type="submit" class="accent">Проверить ответ</button><div id="reflection-feedback" class="reflection-feedback" role="status" aria-live="polite">${r.reflection.passed?'✓ Эта самопроверка уже пройдена. Можно решить её ещё раз.':''}</div><label class="reflection-note">Объясни решение своими словами <small>Необязательно · попадёт в отчёт преподавателю</small><textarea id="reflection-explanation" maxlength="1200" rows="3" placeholder="Что изменилось в новых условиях и почему решение работает?">${e(r.explanation)}</textarea></label><button type="button" data-review-continue class="accent" ${r.reflection.passed?'':'hidden'}>${callback?'Закрыть дело и продолжить →':'Вернуться к прогрессу →'}</button></form>`;
    if(!review.open)review.showModal();review.querySelector('#reflection-answer').focus();
  }
  review.addEventListener('input',event=>{if(event.target.id==='reflection-explanation'){record(reviewId).explanation=event.target.value.slice(0,1200);persist();}});
  review.addEventListener('submit',event=>{
    event.preventDefault();const form=event.target,task=reflections[reviewId],r=record(reviewId),answer=form.elements.answer.value.trim(),reason=Number(form.elements.reason.value);
    const passed=checkReflection(reviewId,answer,reason);r.reflection.attempts++;
    if(passed){r.reflection.passed=true;r.reflection.answer=answer;r.reflection.reason=reason;}
    else if(!r.reflection.passed){r.reflection.answer=answer;r.reflection.reason=reason;}
    const feedback=review.querySelector('#reflection-feedback');feedback.classList.toggle('is-error',!passed);
    feedback.textContent=passed?'✓ Верно. '+task.explanation:'Пока не совпали ответ и объяснение. Проверь оба пункта; можно открыть подсказку и попробовать снова.';
    review.querySelector('[data-review-continue]').hidden=!passed;persist();
  });
  review.addEventListener('click',event=>{
    if(event.target.closest('[data-review-close]')){onReviewed=null;review.close();}
    if(event.target.closest('[data-review-continue]')){const callback=onReviewed;onReviewed=null;review.close();if(callback)callback();else{render();dialog.showModal();}}
  });
  review.addEventListener('cancel',()=>{onReviewed=null;});

  document.getElementById('study-open')?.addEventListener('click',()=>{flush();render();dialog.showModal();});
  document.addEventListener('pointerdown',()=>{lastInteraction=Date.now();},{passive:true,capture:true});
  document.addEventListener('keydown',()=>{lastInteraction=Date.now();},{capture:true});
  document.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button||button.disabled||!getGame().started)return;
    if(['run','esp-run'].includes(button.id)){record().runs++;persist();}
    if(['check','esp-check'].includes(button.id)){record().checks++;persist();}
  },true);
  document.addEventListener('toggle',event=>{
    const target=event.target;
    if(target.tagName==='DETAILS'&&target.open&&target.matches('.first-circuit-hint,.repair-hint,.esp-wiring-lesson,.esp-reference,.learning-hint')){record(target.dataset.caseId).hints++;persist();}
  },true);
  window.addEventListener('nexora:mission-complete',event=>{
    const id=currentCase(event.detail?.mission);if(!id)return;const r=record(id);if(!r.successes.includes(event.detail.mission))r.successes.push(event.detail.mission);persist();
  });
  window.addEventListener('nexora:learning-feedback',event=>{
    if(event.detail?.kind!=='error'||typeof event.detail.text!=='string')return;
    const id=currentCase(event.detail.mission);if(!id)return;const r=record(id),message=event.detail.text.slice(0,500);
    if(r.errors.at(-1)?.message!==message)r.errors.push({message,at:Date.now()});r.errors=r.errors.slice(-12);persist();
  });
  setInterval(()=>{tick();if(getGame().started)persist();},15000);
  document.addEventListener('visibilitychange',()=>{tick();persist();});
  window.addEventListener('pagehide',()=>{tick();persist();});
  player();
  return {
    beforeClose(id,callback){if(study.cases[id]?.reflection.passed||(getGame().completedCases||[]).includes(id))return true;openReview(id,callback);return false;},
    switchCase(){tick();lastTick=Date.now();},
    resetCase(id){delete study.cases[id];persist();},
    reset(){study=normalizeStudy();lastTick=Date.now();persist();player();},
  };
}
