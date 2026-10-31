import {caseIds,CASE_MISSIONS} from './case-stories.js';
import {restoreGame,PROGRESS_KEY} from './progress.js';
import {reflections,threadClues} from './case-reflections.js';

export const BACKUP_KEY='nexora-progress-backup-v1';
export const SAVE_LIMIT=2*1024*1024;
export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const text=(value,max=1000)=>typeof value==='string'?value.slice(0,max):'';
const count=value=>Number.isSafeInteger(value)&&value>=0?Math.min(value,1000000):0;
const stamp=value=>Number.isSafeInteger(value)&&value>=0?value:0;

export function normalizeStudy(raw) {
  const data={version:1,profile:{name:text(raw?.profile?.name,100),group:text(raw?.profile?.group,50)},cases:{}};
  for(const id of caseIds){
    const r=raw?.cases?.[id];if(!r||typeof r!=='object')continue;
    data.cases[id]={startedAt:stamp(r.startedAt),activeMs:Math.min(stamp(r.activeMs),366*86400000),runs:count(r.runs),checks:count(r.checks),hints:count(r.hints),
      successes:Array.isArray(r.successes)?[...new Set(r.successes.filter(n=>CASE_MISSIONS[id].includes(n)))]:[],
      errors:Array.isArray(r.errors)?r.errors.filter(e=>e&&typeof e.message==='string').slice(-12).map(e=>({message:text(e.message,500),at:stamp(e.at)})):[],
      reflection:{attempts:count(r.reflection?.attempts),passed:r.reflection?.passed===true,answer:text(r.reflection?.answer,30),reason:Number.isInteger(r.reflection?.reason)?r.reflection.reason:-1},
      explanation:text(r.explanation,1200)};
  }
  return data;
}

export function ensureRecord(study,id,now=Date.now()) {
  if(!caseIds.includes(id))return null;
  if(!study.cases[id])study.cases[id]={startedAt:now,activeMs:0,runs:0,checks:0,hints:0,successes:[],errors:[],reflection:{attempts:0,passed:false,answer:'',reason:-1},explanation:''};
  return study.cases[id];
}

function inspectJSON(value,depth=0,state={nodes:0}) {
  if(++state.nodes>60000||depth>18)throw Error('Сохранение слишком сложное. Выбери файл, скачанный из «Нексоры».');
  if(typeof value==='string'&&value.length>120000)throw Error('В сохранении слишком длинное текстовое поле.');
  if(!value||typeof value!=='object')return;
  if(Array.isArray(value)&&value.length>3000)throw Error('В сохранении слишком много элементов.');
  for(const [key,item] of Object.entries(value)){
    if(['__proto__','constructor','prototype'].includes(key))throw Error('В файле обнаружена неподдерживаемая структура.');
    inspectJSON(item,depth+1,state);
  }
}

export function validateProgress(value) {
  if(!value||typeof value!=='object'||Array.isArray(value)||value.version!==1)throw Error('Версия сохранения не поддерживается.');
  inspectJSON(value);
  if(value.game && !restoreGame(value.game))throw Error('В сохранении повреждён учебный прогресс.');
  const result={version:1};
  for(const key of ['game','workshop','espWorkshop','electricity','study']){
    if(value[key]!==undefined){
      if(!value[key]||typeof value[key]!=='object'||Array.isArray(value[key]))throw Error('Раздел сохранения повреждён: '+key);
      result[key]=structuredClone(value[key]);
    }
  }
  if(!result.game && !result.workshop && !result.espWorkshop)throw Error('В файле нет прохождения или черновиков.');
  if(result.study)result.study=normalizeStudy(result.study);
  return result;
}

export function createSave(progress,now=new Date()) {
  return JSON.stringify({format:'nexora-save',version:1,exportedAt:now.toISOString(),progress:validateProgress(progress)},null,2);
}

export function parseSave(source) {
  if(typeof source!=='string'||new TextEncoder().encode(source).length>SAVE_LIMIT)throw Error('Файл слишком большой. Допустимо до 2 МБ.');
  let file;try{file=JSON.parse(source);}catch{throw Error('Не удалось прочитать файл JSON. Выбери сохранение «Нексоры».');}
  if(file?.format!=='nexora-save'||file.version!==1)throw Error('Это не поддерживаемое сохранение «Нексоры».');
  return {progress:validateProgress(file.progress),exportedAt:text(file.exportedAt,40)};
}

export function installSave(storage,progress) {
  const checked=validateProgress(progress),current=storage.getItem(PROGRESS_KEY);
  // Keep a recovery copy before the single atomic replacement of the main key.
  if(current)storage.setItem(BACKUP_KEY,current);
  storage.setItem(PROGRESS_KEY,JSON.stringify(checked));
  return checked;
}

const date=value=>{try{return new Intl.DateTimeFormat('ru-RU',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Yekaterinburg'}).format(new Date(value));}catch{return '—';}};
const minutes=value=>value<60000?'менее 1 мин':Math.round(value/60000)+' мин';
export function reportHtml(progress,catalog,now=new Date()) {
  const e=escapeHtml,study=normalizeStudy(progress.study),game=progress.game||{},closed=Array.isArray(game.completedCases)?game.completedCases:[];
  const skills=Array.isArray(game.skills)?game.skills:[];
  const rows=catalog.map(item=>{
    const r=study.cases[item.id],status=closed.includes(item.id)?'Закрыто':game.started&&game.activeCase===item.id?'В работе':'Не пройдено';
    return '<tr><td>'+e(item.id+' · '+item.title)+'</td><td>'+status+'</td><td>'+(r?minutes(r.activeMs):'—')+'</td><td>'+(r?r.runs:'—')+'</td><td>'+(r?r.checks:'—')+'</td><td>'+(r?r.hints:'—')+'</td><td>'+(r?.reflection.passed?'Пройдена ('+r.reflection.attempts+' попыт.)':'—')+'</td></tr>';
  }).join('');
  const details=catalog.filter(item=>study.cases[item.id]||closed.includes(item.id)||(game.started&&game.activeCase===item.id)||CASE_MISSIONS[item.id].some(index=>progress.espWorkshop?.[index]||progress.workshop?.drafts?.[index]||(index===0&&progress.workshop?.drafts?.['0-transfer']))).map(item=>{
    const r=study.cases[item.id],indices=CASE_MISSIONS[item.id];
    const programs=indices.flatMap(index=>[{index,label:'Программа · модуль '+(index+1),draft:index>=9?progress.espWorkshop?.[index]:progress.workshop?.drafts?.[index]},...(index===0?[{index,label:'Перенос маяка на D12',draft:progress.workshop?.drafts?.['0-transfer']}]:[])]).filter(({draft})=>typeof draft?.code==='string');
    return '<section><h2>Дело '+e(item.id)+' · '+e(item.title)+'</h2>'+
      (r?.reflection.passed?'<p><b>Самопроверка:</b> '+e(reflections[item.id].question)+' Ответ: '+e(r.reflection.answer)+'. '+e(reflections[item.id].choices[r.reflection.reason])+'</p>':'')+
      (r?.explanation?'<p><b>Вывод студента:</b> '+e(r.explanation)+'</p>':'')+
      (r?.errors.length?'<h3>Сообщения, полученные на стенде</h3><ul>'+r.errors.map(x=>'<li>'+e(x.message)+'</li>').join('')+'</ul>':'')+
      programs.map(({label,draft})=>'<details open><summary>'+e(label)+'</summary><pre>'+e(draft.code)+'</pre><p>Соединений: '+(Array.isArray(draft.wires)?draft.wires.length:0)+'</p></details>').join('')+
      (closed.includes(item.id)?'<p class="clue"><b>Общая папка TEST-04:</b> '+e(threadClues[item.id])+'</p>':'')+'</section>';
  }).join('');
  return '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Нексора · учебный отчёт</title><style>body{max-width:1000px;margin:40px auto;padding:0 24px;font:16px/1.6 Arial,sans-serif;color:#203044}h1{font-size:32px}h2{font-size:21px;margin-top:30px}h3{font-size:16px}table{border-collapse:collapse;width:100%;font-size:13px}td,th{padding:9px;border:1px solid #cbd3df;text-align:left}th{background:#edf3e4}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f0f3f6;padding:16px;font:12px/1.55 monospace}.meta,.clue{padding:16px;background:#f1f5ed}section{border-top:1px solid #cad4db;margin-top:25px}.note{color:#5e6b77;font-size:13px}@media print{body{margin:0;max-width:none}section{break-inside:avoid}pre{font-size:10px}table{font-size:10px}}</style></head><body><h1>Нексора · учебный отчёт</h1><div class="meta"><b>Студент:</b> '+e(study.profile.name||'Имя не указано')+'<br><b>Группа:</b> '+e(study.profile.group||'Не указана')+'<br><b>Сформирован:</b> '+e(date(now))+'<br><b>Дел закрыто:</b> '+closed.length+' / '+catalog.length+' · <b>Навыков:</b> '+skills.length+'</div><p class="note">Сводка отражает прохождение и черновики на момент выгрузки. Время — активная работа с игрой. Подсказки — открытия справочных подсказок. Для старых прохождений без истории показано «—». Самопроверка проверяет понимание на новых примерах; её результат указан отдельно от испытаний устройства.</p><table><thead><tr><th>Дело</th><th>Состояние</th><th>Время</th><th>Запуски</th><th>Проверки устройства</th><th>Подсказки</th><th>Самопроверка</th></tr></thead><tbody>'+rows+'</tbody></table>'+details+'</body></html>';
}
