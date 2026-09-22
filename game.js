import {readProgress, writeProgress, restoreGame, serializeGame, signalSnapshot, caseSnapshot, clearWorkshop, clearProgress} from './progress.js';
import {CASE_MISSIONS, extraCases} from './case-stories.js';
import {modelMarkup, bindModel} from './case-models.js';
import {loopTrace} from './case-two.js';
import {createImageCache, createSceneGate, artSource} from './story-media.js';
const $ = (id) => document.getElementById(id);

const initialState = () => ({
  started: false,
  activeCase: '001',
  completedCases: new Set(),
  unlockedCases: new Set(['001']),
  room: 'briefing',
  score: 0,
  clues: [],
  inventory: [],
  skills: new Set(),
  unlocked: new Set(['briefing']),
  completed: new Set(),
  inspectedPanel: false,
  askedMaya: false,
  recordedJournal: false,
  inspectedResistor: false,
  tookResistor: false,
  inspectedServer: false,
  inspectedButton: false,
  final: false,
  introStep: 0,
  introDone: false,
  journal: [], reports: {}, view: 'story', workbenchIndex: 0, workbenchMode: 'repair',
  case2Stage: 0, case2Reached: 0, observation: null, repairResult: null,
  traceStep: 0, traceBound: 2, traceComplete: false,
  caseStage:0, caseReached:0, modelSeen:[], modelValue:0, modelDone:false, modelSetting:'',
  caseSaves:{}, rewarded:new Set(),
});
const state = initialState();
const savedGame = restoreGame(readProgress().game);
if (savedGame) Object.assign(state, savedGame);
let saveTimer;
function saveGame() {
  clearTimeout(saveTimer);
  writeProgress('game', serializeGame(state));
}
function queueSave() { clearTimeout(saveTimer); saveTimer = setTimeout(saveGame, 150); }
window.addEventListener('pagehide', saveGame);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(); });
window.addEventListener('nexora:save-status', event => {
  setText('save-status', event.detail.ok ? '✓ Прогресс сохранён в этом браузере' : 'Не удалось сохранить прогресс в этом браузере');
  $('save-status')?.classList.toggle('save-error', !event.detail.ok);
});

const scene = $('scene');
const actions = $('dialogue-actions');
const comicIntro = $('comic-intro');

const roomNames = {
  briefing: 'Комната связи',
  workshop: 'Мастерская',
  server: 'Серверная',
  roof: 'Крыша',
};

const inventoryIcons = {
  'лог маяка': '▤',
  'резистор 220 Ω': '⌁',
  'схема питания': '⌬',
  'ключ доступа': '▣',
};

const skillCatalog = [
  { id: 'circuit', label: 'Сборка цепи', detail: 'соединять плату' },
  { id: 'variables', label: 'Переменные', detail: 'давать значениям имена' },
  { id: 'types', label: 'Типы данных', detail: 'int и bool' },
  { id: 'conditions', label: 'Условия', detail: 'if / else' },
  { id: 'loops', label: 'Циклы', detail: 'повторять действие' },
  { id: 'arrays', label: 'Массивы', detail: 'хранить список' },
  { id: 'functions', label: 'Функции', detail: 'собирать команды' },
];

const missionSkills = {
  0: ['circuit'],
  1: ['variables', 'types'],
  2: ['conditions'],
  3: ['loops'],
  4: ['arrays'],
  5: ['functions'],
  6: ['types','conditions'],
  7: ['circuit','variables','types','conditions','loops','arrays','functions'],
};

const caseCatalog = [
  {
    id: '001', title: 'Маяк замолчал',
    problem: 'До прихода комиссии нужно вернуть сигнал в учебной лаборатории.',
    board: 'Arduino Uno', topics: ['цепь', 'переменные', 'условия'], image: artSource('scene-briefing', 'thumb'), playable: true,
  },
  {
    id: '002', title: 'Сирена сбилась',
    problem: 'Аварийный сигнал повторяется не то число раз и сбивает дежурную смену.',
    board: 'Arduino Uno', topics: ['циклы', 'повторение'], image: artSource('c2-dispatch-call', 'thumb'), playable: true,
  },
  ...Object.entries(extraCases).map(([id,story])=>({id,title:story.title,problem:story.problem,board:'Arduino Uno',topics:story.topics,image:artSource(id==='005'?'scene-server':id==='006'?'c1-beacon-restored':'scene-workshop','thumb'),playable:true})),
];

function caseInfo(id = state.activeCase) {
  return caseCatalog.find((item) => item.id === id) || caseCatalog[0];
}

const sceneArt = {
  briefing: {
    src: artSource('scene-briefing'),
    alt: 'Стажёр входит в ночную лабораторию, где погас аварийный маяк',
    caption: 'КАДР 01 / ВХОДЯЩЕЕ ДЕЛО',
    position: 'center', zoom: 1,
  },
  workshop: {
    src: artSource('scene-workshop'),
    alt: 'Стажёр соединяет Arduino, резистор, светодиод и провод на верстаке, а наставница наблюдает',
    caption: 'КАДР 02 / МЕСТО РАЗРЫВА',
    position: 'center', zoom: 1,
  },
  server: {
    src: artSource('scene-server'),
    alt: 'Стажёр и оператор изучают слишком быстрый сигнал на мониторе серверной',
    caption: 'КАДР 03 / РИТМ СИГНАЛА',
    position: 'center', zoom: 1,
  },
  roof: {
    src: artSource('c1-roof-arrival'),
    alt: 'Стажёр и Мая выходят к погасшему маяку на крыше',
    caption: 'КАДР 11 / ПОСЛЕДНИЙ ЭТАЖ',
    position: 'center', zoom: 1,
  },
  mentor: { src: artSource('story-mentor-call'), alt: 'Мая рассказывает об аварии с экрана внутренней связи', caption: 'КАДР 02 / НА СВЯЗИ МАЯ', position: '78% 37%', zoom: 1.05 },
  panel: { src: artSource('story-panel-inspected'), alt: 'Героиня рассматривает два импульса и обрыв сигнала на аварийной панели', caption: 'КАДР 03 / ПОСЛЕДНИЙ ИМПУЛЬС', position: '75% 42%', zoom: 1.02 },
  journal: { src: artSource('scene-briefing'), alt: 'Героиня зарисовывает импульсы и место обрыва в журнале дела', caption: 'КАДР 04 / ЗАПИСЬ В ЖУРНАЛЕ', position: '28% 78%', zoom: 1.28 },
  resistor: { src: artSource('c1-resistor-found'), alt: 'Крупный план резистора под краем журнала на рабочем столе', caption: 'КАДР 06 / НАЙДЕННАЯ ДЕТАЛЬ', position: '74% 62%', zoom: 1.34 },
  taken: { src: artSource('c1-resistor-taken'), alt: 'Героиня берёт резистор со стола', caption: 'КАДР 07 / РЕЗИСТОР ПОЛУЧЕН', position: '48% 54%', zoom: 1.22 },
  restored: { src: artSource('c1-first-light'), alt: 'Зелёный светодиод на собранной цепи оживает перед героиней и Маей', caption: 'КАДР 08 / ПЕРВЫЙ СВЕТ', position: '68% 56%', zoom: 1.12 },
  signal: { src: artSource('c1-signal-inspect'), alt: 'Героиня и Саша изучают неровные импульсы крупным планом', caption: 'КАДР 09 / ЧТО НЕ ТАК С РИТМОМ', position: '78% 42%', zoom: 1.3 },
  rhythm: { src: artSource('c1-signal-restored'), alt: 'На экране ровные зелёные импульсы, героиня и Саша радуются восстановлению сигнала', caption: 'КАДР 10 / СИГНАЛ ПРИНЯТ', position: '55% 42%', zoom: 1.08 },
  button: { src: artSource('c1-button-inspect'), alt: 'Героиня осматривает кнопку и контроллер под пока погасшим маяком', caption: 'КАДР 12 / КНОПКА ЗАПУСКА', position: '74% 78%', zoom: 1.35 },
  final: { src: artSource('c1-beacon-restored'), alt: 'Героиня нажимает кнопку, зелёный маяк загорается над городом', caption: 'КАДР 13 / МАЯК ВОССТАНОВЛЕН', position: 'center', zoom: 1 },
  c2call: { src: artSource('c2-dispatch-call'), alt: 'Мая и стажёр слушают сообщение дежурного в диспетчерской', position: 'center' },
  c2observe: { src: artSource('c2-siren-observe'), alt: 'Стажёр осматривает сирену и контроллер на испытательном столе', position: 'center' },
  c2evidence: { src: artSource('c2-signal-evidence'), alt: 'Стажёр записывает результаты измерений рядом с осциллографом', position: 'center' },
  c2loop: { src: artSource('c2-loop-explained'), alt: 'Мая объясняет стажёру повторение команд за ноутбуком', position: 'center' },
  c2repair: { src: artSource('c2-program-repair'), alt: 'Стажёр редактирует программу подключённого контроллера', position: 'center' },
  c2fixed: { src: artSource('c2-siren-fixed'), alt: 'Мая и стажёр принимают работающую сирену с зелёным индикатором', position: 'center' },
};
sceneArt.workshop.caption = 'КАДР 05 / МАСТЕРСКАЯ';
sceneArt.server.caption = 'СЕРВЕРНАЯ / СИГНАЛ ДОШЁЛ';
scene.classList.add('story-active');
const mediaCache = createImageCache();
const mediaStatus = document.createElement('div');
mediaStatus.className = 'story-media-status'; mediaStatus.hidden = true;
mediaStatus.setAttribute('role','status'); mediaStatus.setAttribute('aria-live','polite');
scene.append(mediaStatus);
const sceneGate = createSceneGate(mediaCache, {
  pending(){
    scene.setAttribute('aria-busy','true'); comicIntro.inert = true;
    mediaStatus.hidden = false; mediaStatus.textContent = 'Подготавливаю следующий кадр…';
    mediaStatus.classList.remove('is-error');
  },
  ready(){ scene.removeAttribute('aria-busy'); comicIntro.inert = false; mediaStatus.hidden = true; },
  error(retry){
    scene.removeAttribute('aria-busy'); mediaStatus.hidden = false; mediaStatus.classList.add('is-error');
    mediaStatus.textContent = 'Кадр не загрузился. Проверь соединение. ';
    const button = document.createElement('button'); button.textContent = 'Загрузить ещё раз'; button.onclick = retry; mediaStatus.append(button);
  },
});
function presentStory(urls, commit) {
  return sceneGate.show(urls, () => { commit(); queueSave(); warmNextScenes(); });
}
function warmNextScenes() {
  let names;
  if (!state.started) names = ['story-mentor-call','scene-briefing'];
  else if (state.activeCase === '002') {
    names = ['c2-dispatch-call','c2-siren-observe','c2-signal-evidence','c2-loop-explained','c2-program-repair','c2-siren-fixed'].slice(state.case2Stage + 1,state.case2Stage + 3);
  } else if (extraCases[state.activeCase]) {
    names = extraCases[state.activeCase].frames.slice(state.caseStage + 1,state.caseStage + 3);
  } else if (!state.introDone) {
    names = ['story-mentor-call','scene-briefing','c1-reaching','c1-broken-board','scene-workshop'].slice(state.introStep + 1,state.introStep + 3);
  } else {
    const next = {briefing:['scene-workshop','c1-resistor-found'],workshop:state.completed.has(0)?['scene-server','c1-signal-inspect']:state.tookResistor?['c1-first-light','scene-server']:state.inspectedResistor?['c1-resistor-taken','c1-first-light']:['c1-resistor-found','c1-resistor-taken'],server:state.completed.has(1)?['c1-roof-arrival','c1-button-inspect']:state.inspectedServer?['c1-signal-restored','c1-roof-arrival']:['c1-signal-inspect','c1-signal-restored'],roof:state.final?['c2-dispatch-call']:['c1-button-inspect','c1-beacon-restored']};
    names = next[state.room] || [];
  }
  if (!globalThis.navigator?.connection?.saveData) mediaCache.prefetch(names.map(name=>sceneArt[name]?.src || artSource(name)));
}

let storyAction = null;
let workbenchWaitTimer = null;
let transitionTimer = null;

const missionResults = [
  {
    frame: 'restored',
    kicker: 'ЭПИЗОД 01 / ПЕРВЫЙ РЕЗУЛЬТАТ',
    title: 'Цепь снова говорит.',
    text: 'Светодиод вспыхнул в нужном ритме. Ты не просто запустила код — ты замкнула путь сигнала на настоящей схеме.',
    voice: '«Первый свет есть. Теперь разберёмся, как программа задаёт ритм».'
  },
  {
    frame: 'rhythm',
    kicker: 'ЭПИЗОД 02 / ПЕРЕМЕННАЯ ПРИНЯТА',
    title: 'Ритм пакетов выровнен.',
    text: 'Одно значение pauseMs изменило сразу две паузы. Маяк больше не сбивается — можно идти к финальной проверке.',
    voice: '«Вот зачем нужны переменные: меняешь одну коробку — меняется всё действие».'
  },
  {
    frame: 'final',
    kicker: 'ЭПИЗОД 03 / СИСТЕМА ПРИНЯТА',
    title: 'Маяк отвечает на нажатие.',
    text: 'Программа выбрала правильную ветку if/else, и зелёный сигнал поднялся над городом. Дело почти закрыто.',
    voice: '«Ты научилась не только собирать цепь, но и объяснять устройству, что делать».'
  },
  {
    frame: 'c2fixed',
    kicker: 'ДЕЛО 002 / НЕИСПРАВНОСТЬ УСТРАНЕНА',
    title: 'Третий импульс вернулся.',
    text: 'На твоей схеме проверены две полные серии: по три вспышки 200 мс и длинная пауза между сериями. Дежурная смена снова узнаёт сигнал.',
    voice: '«Теперь у нас есть доказательство: исправленная программа выдаёт нужный ритм».'
  },
  {
    frame: 'signal',
    kicker: 'УЧЕБНЫЙ МОДУЛЬ 05 / МАССИВЫ',
    title: 'Список сигналов сохранён.',
    text: 'Массив хранит несколько длительностей, а цикл читает их по очереди. Так маяку можно назначить целую последовательность.',
    voice: '«Список значений — это уже маленькая память для будущих сигналов».'
  },
  {
    frame: 'final',
    kicker: 'УЧЕБНЫЙ МОДУЛЬ 06 / ФУНКЦИИ',
    title: 'Команда собрана в функцию.',
    text: 'Повторяющееся действие получило собственное имя. Теперь его можно вызывать снова и передавать ему разные параметры.',
    voice: '«Хорошая функция — это инструмент, который можно взять в следующую задачу».'
  }
];

const introPanels = [
  {
    src: artSource('story-mentor-call'),
    position: '78% 37%',
    zoom: 1.08,
    alt: 'Мая выходит на связь и сообщает о пропавшем сигнале маяка',
    kicker: 'КАДР 01 / ВХОДЯЩЕЕ ДЕЛО',
    title: 'Маяк замолчал.',
    text: 'Мая выходит на связь: питание на плате есть, но сигнал исчез. До прихода комиссии остаётся меньше часа.',
    action: 'Ответить Мае →',
  },
  {
    src: artSource('scene-briefing'),
    position: '26% 58%',
    zoom: 1.22,
    alt: 'Стажёр оглядывает тихую лабораторию и ищет источник сбоя',
    kicker: 'КАДР 02 / ПОИСК',
    title: 'Сначала осмотрись.',
    text: 'Ты замечаешь аварийную панель и последний пакет данных. Никаких догадок — только наблюдения и улики.',
    action: 'Изучить панель →',
  },
  {
    src: artSource('c1-reaching'),
    position: '46% 63%',
    zoom: 1.3,
    alt: 'Стажёр тянется к рабочему столу с платой и незаконченной схемой',
    kicker: 'КАДР 03 / ДЕЙСТВИЕ',
    title: 'Рука тянется к схеме.',
    text: 'В мастерской ждут плата, светодиод и провода. Чтобы вернуть сигнал, придётся разобраться, как команда проходит через цепь.',
    action: 'Проверить схему →',
  },
  {
    src: artSource('c1-broken-board'),
    position: '75% 42%',
    zoom: 1.02,
    alt: 'Крупный план платы с отсоединённым проводом и погасшим светодиодом',
    kicker: 'КАДР 04 / УЛИКА',
    title: 'Вот где оборвалось.',
    text: 'На панели — два HIGH, затем LOW и тишина. Дело начинается: прочитай код, собери цепь и верни маяку голос.',
    action: 'Открыть мастерскую →',
  },
];

function setText(id, text) {
  const element = $(id);
  if (element) element.textContent = text;
}

function renderSkills() {
  const learned = state.skills.size;
  setText('skill-progress', `${learned} / ${skillCatalog.length}`);
  setText('player-level', `стажёр · уровень ${learned}`);
  document.querySelectorAll('.skill-row').forEach((row) => {
    const complete = state.skills.has(row.dataset.skill);
    row.classList.toggle('is-complete', complete);
    const mark = row.querySelector('em');
    if (mark) mark.textContent = complete ? '✓' : '—';
  });
}

function renderSkillSummary() {
  const learned = skillCatalog.filter((skill) => state.skills.has(skill.id));
  const chips = skillCatalog.map((skill) => `<span class="story-skill-chip${state.skills.has(skill.id) ? ' is-complete' : ''}"><i>${state.skills.has(skill.id) ? '✓' : '·'}</i>${skill.label}</span>`).join('');
  return `<div class="story-skill-summary"><div class="story-skill-summary-head"><span>НАВЫКИ, КОТОРЫЕ ПОМОГЛИ ДЕЛУ</span><b>${learned.length} / ${skillCatalog.length}</b></div><div class="story-skill-chips">${chips}</div><small>Каждая миссия оставляет в журнале не только улику, но и рабочий инструмент.</small></div>`;
}

function renderArchive() {
  const list = $('case-list');
  if (!list) return;
  list.replaceChildren();
  caseCatalog.forEach((item, index) => {
    const unlocked = state.unlockedCases.has(item.id);
    const active = item.id === state.activeCase;
    const solved = state.completedCases.has(item.id);
    const playable = Boolean(item.playable && unlocked && !solved);
    const status = solved ? 'ДЕЛО ЗАКРЫТО' : active && state.started ? 'В РАБОТЕ' : unlocked ? 'ОТКРЫТО' : 'СЛЕДУЮЩЕЕ ДЕЛО';
    const previous = caseCatalog[index - 1];
    const card = document.createElement('article');
    card.className = `case-card${playable ? ' is-open' : ' is-locked'}${active ? ' is-current' : ''}${solved ? ' is-solved' : ''}`;
    const action = playable
      ? `<button class="accent case-card-action" type="button">${active && state.started ? 'Продолжить дело' : 'Взять дело'} <span>→</span></button>`
      : solved
        ? '<button class="case-report-action" type="button">Прочитать отчёт ✓</button><button class="case-replay-action" type="button">Пройти заново ↺</button>'
        : unlocked
          ? '<small class="case-card-lock">Сюжет и верстак готовятся</small>'
          : `<small class="case-card-lock">Станет доступно после Дела ${previous?.id || '001'}</small>`;
    card.innerHTML = `<div class="case-card-image"><img src="${item.image}" alt="Иллюстрация дела «${item.title}»" loading="lazy" decoding="async"><span>${item.id}</span></div><div class="case-card-copy"><div class="case-card-status"><span>${status}</span>${solved ? '<b>✓</b>' : ''}</div><h3>${item.title}</h3><p>${item.problem}</p><div class="case-card-meta"><span>${item.board}</span><span>${item.topics.join(' · ')}</span></div>${action}</div>`;
    list.append(card);
    const button = card.querySelector('.case-card-action');
    if (button) button.onclick = () => {
      $('archive-modal')?.close();
      if (item.id === state.activeCase && state.started) { window.nexoraWorkshop?.close?.(); state.view = 'story'; renderRoom(); }
      else beginCase(item.id);
    };
    const report = card.querySelector('.case-report-action');
    if (report) report.onclick = () => showReport(item.id);
    const replay=card.querySelector('.case-replay-action');
    if(replay) replay.onclick=()=>showResetDialog(item.id);
  });
}

function renderCaseChrome() {
  const info = caseInfo();
  setText('brand-case-sub', `/ дело ${info.id}`);
  setText('case-topbar-label', `ДЕЛО ${info.id} / ТЕКУЩАЯ СЦЕНА`);
  setText('quest-title', info.id === '001' ? 'Тихая лаборатория' : info.title);
  setText('case-drawer-eyebrow', `ЖУРНАЛ ДЕЛА ${info.id}`);
  setText('case-drawer-title', info.title);
  setText('case-drawer-description', `Цель: ${info.problem}`);
  const labels = info.id !== '001'
    ? [['Входящее дело', 'Жалоба смены'], ['Осмотр', 'Измерить сигнал'], ['Мастерская', 'Разобрать и исправить'], ['Отчёт', 'Проверить результат']]
    : [['Комната связи', 'Входящее дело'], ['Мастерская', 'Собрать цепь'], ['Серверная', 'Найти ритм сигнала'], ['Крыша', 'Финальный запуск']];
  document.querySelectorAll('.room').forEach((button, index) => {
    const title = button.querySelector('b');
    const detail = button.querySelector('small');
    if (title) title.textContent = labels[index]?.[0] || '';
    if (detail) detail.textContent = labels[index]?.[1] || '';
  });
}

function syncRoomButtons() {
  document.querySelectorAll('.room').forEach((button) => {
    const room = button.dataset.room;
    const available = state.unlocked.has(room);
    button.disabled = !available;
    button.classList.toggle('locked', !available);
    button.classList.toggle('available', available);
    const mark = button.querySelector('em');
    if (mark) mark.textContent = room === 'briefing' ? '●' : available ? '→' : '×';
  });
}

function dismissCaseReveal() {
  document.querySelectorAll('.case-reveal').forEach((reveal) => reveal.remove());
  document.body.classList.remove('case-reveal-open');
}

function resetCaseProgress({ resetScore = false } = {}) {
  sceneGate.cancel();
  clearTimeout(transitionTimer); storyAction=null;
  if (workbenchWaitTimer) { window.clearInterval(workbenchWaitTimer); workbenchWaitTimer = null; }
  document.querySelectorAll('.mission-transition').forEach((transition) => transition.remove());
  window.nexoraWorkshop?.close?.();
  document.body.classList.remove('workbench-open');
  state.view = 'story';
  if (resetScore) state.score = 0;
  state.room = 'briefing';
  state.clues = [];
  state.inventory = [];
  state.unlocked = new Set(['briefing']);
  state.completed = new Set();
  state.inspectedPanel = false;
  state.askedMaya = false;
  state.recordedJournal = false;
  state.inspectedResistor = false;
  state.tookResistor = false;
  state.inspectedServer = false;
  state.inspectedButton = false;
  state.final = false;
  state.introStep = 0;
  state.introDone = false;
  state.case2Stage = 0;
  state.case2Reached = 0;
  state.observation = null;
  state.repairResult = null;
  state.traceStep = 0;
  state.traceBound = 2;
  state.traceComplete = false;
  state.caseStage=0; state.caseReached=0; state.modelDone=false;state.modelSeen=[];state.modelValue=0;state.modelSetting='';
  state.workbenchIndex=CASE_MISSIONS[state.activeCase][0];state.workbenchMode='repair';
  const info = caseInfo();
  state.journal = [{title:`Входящее дело ${info.id}`, text:info.problem}];
  renderJournal();
  if ($('case-drawer')) $('case-drawer').hidden = true;
  syncRoomButtons();
}

function beginCase(id, {replay=false}={}) {
  const item = caseCatalog.find(item=>item.id===id);
  if (!item || !state.unlockedCases.has(id) || !item.playable) return;
  if(state.started && state.activeCase!==id) state.caseSaves[state.activeCase]=caseSnapshot(state);
  const saved = !replay && state.caseSaves[id];
  dismissCaseReveal();
  $('archive-modal')?.close();
  state.activeCase = id;
  state.started = true;
  resetCaseProgress();
  if(replay){
    delete state.caseSaves[id];
    if(window.nexoraWorkshop?.resetProgress)window.nexoraWorkshop.resetProgress(CASE_MISSIONS[id]);
    else writeProgress('workshop',clearWorkshop(readProgress().workshop,CASE_MISSIONS[id]));
  } else if(saved){
    const restored=restoreGame({...serializeGame(state),...saved,activeCase:id,caseSaves:null});
    if(restored) for(const key of Object.keys(saved)) if(key in restored) state[key]=restored[key];
    state.view='story';
  }
  document.body.classList.add('game-started');
  if (id !== '001') state.introDone = true;
  syncRoomButtons();renderJournal();renderStats();renderRoom();saveGame();
}

function casePaperMarkup(item, kind, stamp) {
  return `<article class="case-paper ${kind}"><div class="case-paper-top"><span>CASE / ${item.id}</span><b>${stamp}</b></div><div class="case-paper-photo"><img src="${item.image}" alt="" width="1280" height="720" loading="eager" decoding="sync"></div><h3>${item.title}</h3><p>«${item.problem}»</p><div class="case-paper-sign">— Архив NEXORA</div></article>`;
}

function showCaseReveal(currentId, nextId) {
  dismissCaseReveal();
  const current = caseInfo(currentId);
  const next = caseInfo(nextId);
  const canStart = Boolean(next.playable && state.unlockedCases.has(next.id));
  return presentStory([current.image,next.image], () => {
  const reveal = document.createElement('div');
  reveal.className = 'case-reveal';
  reveal.tabIndex = -1;
  reveal.setAttribute('role', 'dialog');
  reveal.setAttribute('aria-modal', 'true');
  reveal.setAttribute('aria-label', 'Новое дело в архиве');
  reveal.innerHTML = `<div class="case-reveal-scrim"></div><section class="case-reveal-stage"><div class="case-paper-stack">${casePaperMarkup(current, 'case-paper-done', 'ЗАКРЫТО')}${casePaperMarkup(next, 'case-paper-next', 'НОВОЕ')}</div><div class="case-reveal-copy"><span class="eyebrow">ДЕЛО ${current.id} ЗАКРЫТО / АРХИВ ПОПОЛНЕН</span><h2>Появилось новое расследование.</h2><p>${canStart ? `Дело ${next.id}: ${next.problem} Следующий инструмент — ${next.topics.join(', ')}.` : `Следующая карточка уже появилась в архиве. Сюжет и отдельный верстак для неё откроются следующим обновлением.`}</p><div class="case-reveal-note"><b>Новый фокус</b><span>${next.topics.join(' · ')}</span></div><div class="case-reveal-actions"><button class="accent case-reveal-primary" type="button">${canStart ? `Открыть дело ${next.id}` : 'Открыть архив дел'} <span>→</span></button><button class="case-reveal-later" type="button">Остаться в архиве</button></div></div></section>`;
  document.body.append(reveal);
  document.body.classList.add('case-reveal-open');
  const close = () => dismissCaseReveal();
  reveal.querySelector('.case-reveal-scrim').onclick = close;
  reveal.querySelector('.case-reveal-later').onclick = () => { close(); renderArchive(); $('archive-modal')?.showModal(); };
  reveal.querySelector('.case-reveal-primary').onclick = () => {
    close();
    if (canStart) beginCase(next.id);
    else { renderArchive(); $('archive-modal')?.showModal(); }
  };
  requestAnimationFrame(() => { reveal.classList.add('is-visible'); reveal.focus(); });
  });
}

function completeCurrentCase() {
  const current = caseInfo();
  const index = caseCatalog.findIndex((item) => item.id === current.id);
  const next = caseCatalog[index + 1];
  state.completedCases.add(current.id);
  if (next) state.unlockedCases.add(next.id);
  state.reports[current.id] = state.journal.map(entry => ({...entry}));
  saveGame();
  renderStats();
  if (next) showCaseReveal(current.id, next.id);
  else { renderArchive(); $('archive-modal')?.showModal(); }
}

function speak({ avatar = 'М', name = 'Мая · инженер', role = 'внутренняя связь', text, options = [] }) {
  setText('speaker-avatar', avatar);
  setText('speaker-name', name);
  setText('speaker-role', role);
  setText('dialogue-text', text);
  actions.replaceChildren();
  options.forEach(({ label, action, disabled = false }) => {
    const button = document.createElement('button');
    button.textContent = label;
    button.dataset.action = action;
    button.disabled = disabled;
    actions.append(button);
  });
}

function addClue(name, item = null, points = 10) {
  if (!state.clues.includes(name)) {
    state.clues.push(name);
    const reward=`${state.activeCase}:${name}`;
    if(!state.rewarded.has(reward)&&!state.completedCases.has(state.activeCase)){state.score+=points;state.rewarded.add(reward);}
  }
  if (item && !state.inventory.includes(item)) state.inventory.push(item);
  renderStats();
}

function renderStats() {
  setText('clue-count', String(state.clues.length));
  setText('score', String(state.score).padStart(3, '0'));
  setText('inventory-count', `${state.inventory.length} / ${state.activeCase === '001' ? 4 : 2}`);
  const inventory = $('inventory-items');
  inventory.replaceChildren();
  if (!state.inventory.length) {
    const empty = document.createElement('span');
    empty.className = 'empty-inventory';
    empty.textContent = 'Пока пусто';
    inventory.append(empty);
  } else {
    state.inventory.forEach((item) => {
      const chip = document.createElement('span');
      chip.className = 'inventory-item';
      const icon = document.createElement('i'); icon.textContent = inventoryIcons[item] || '◇';
      const label = document.createElement('b'); label.textContent = item;
      chip.append(icon, label);
      inventory.append(chip);
    });
  }
  renderCaseChrome();
  renderSkills();
  renderArchive();
  queueSave();
}

function unlock(room) {
  state.unlocked.add(room);
  const button = document.querySelector(`.room[data-room="${room}"]`);
  if (button) {
    button.disabled = false;
    button.classList.remove('locked');
    button.classList.add('available');
    const mark = button.querySelector('em');
    if (mark) mark.textContent = '→';
  }
}

function updateMap() {
  const stage = `ЭТАП ${Object.keys(roomNames).indexOf(state.room) + 1} / 4`;
  document.querySelector('.map-heading small').textContent = stage;
  document.querySelectorAll('.room').forEach((button) => {
    const room = button.dataset.room;
    button.classList.toggle('active', room === state.room);
    button.classList.toggle('complete', state.activeCase === '002' ? state.case2Reached > ({briefing:0,workshop:2,server:4,roof:5}[room]) || (room === 'roof' && state.final) : extraCases[state.activeCase] ? state.caseReached>({briefing:0,workshop:1,server:3,roof:4}[room])||(room==='roof'&&state.final) : state.completed.has({ workshop: 0, server: 1, roof: 2 }[room]));
    if (state.unlocked.has(room)) button.classList.remove('locked');
  });
}

function renderIntro() {
  if (!comicIntro) return;
  const visiblePanels = introPanels.slice(0, state.introStep + 1);
  return presentStory(visiblePanels.map(panel=>panel.src), () => {
  scene.dataset.room = 'briefing';
  scene.classList.add('intro-active');
  scene.classList.remove('story-active');
  scene.classList.remove('scene-art-pending');
  comicIntro.hidden = false;
  comicIntro.className = 'comic-intro';
  storyAction = advanceIntro;
  comicIntro.innerHTML = `<div class="comic-intro-head"><div><span class="comic-intro-kicker">ВИЗУАЛЬНАЯ НОВЕЛЛА / ДЕЛО 001</span><h2>Тишина перед первым импульсом</h2></div><span class="comic-intro-count">${String(state.introStep + 1).padStart(2, '0')} / ${String(introPanels.length).padStart(2, '0')}</span></div><div class="comic-intro-grid">${visiblePanels.map((panel, index) => `<article class="comic-intro-panel${index === state.introStep ? ' is-new' : ''}" data-index="${index}"><div class="comic-intro-image"><img src="${panel.src}" alt="${panel.alt}" width="1280" height="720" loading="eager" decoding="sync" style="object-position:${panel.position}"><span class="comic-intro-number">${String(index + 1).padStart(2, '0')}</span></div><div class="comic-intro-caption"><span class="comic-intro-panel-kicker">${panel.kicker}</span><h3>${panel.title}</h3><p>${panel.text}</p>${index === state.introStep ? `<button class="accent comic-intro-action" data-intro-action="advance">${panel.action}</button>` : ''}</div></article>`).join('')}</div>`;
  const newest = comicIntro.querySelector('.comic-intro-panel.is-new');
  if (newest && state.introStep > 0) requestAnimationFrame(() => newest.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  });
}

function advanceIntro() {
  if (sceneGate.busy || comicIntro.inert) return;
  // The comic is the briefing itself. Store each discovery here so the old
  // briefing buttons are not shown again after the last panel.
  if (state.introStep === 1 && !state.inspectedPanel) {
    state.inspectedPanel = true;
    unlock('workshop');
    addClue('лог 08:39', 'лог маяка', 15);
    appendJournal('08:44 / Панель', 'Питание есть, два импульса HIGH, затем разрыв после LOW.');
  }
  if (state.introStep < introPanels.length - 1) {
    state.introStep += 1;
    renderIntro();
    return;
  }
  if (!state.recordedJournal) {
    state.recordedJournal = true;
    addClue('запись в журнале', null, 5);
    appendJournal('08:45 / Решение', 'Улика сохранена. Следующий шаг — собрать цепь и вернуть сигнал.');
  }
  state.introDone = true;
  state.askedMaya = true;
  state.room = 'workshop';
  renderRoom();
}

function renderStoryBeat({ room, location, status, frame, kicker, title, text, actionLabel, action, voice = '', extra = '', caption, onReady }) {
  const image = sceneArt[frame] || sceneArt[room] || sceneArt.briefing;
  return presentStory([image.src], () => {
  scene.dataset.room = room;
  setText('scene-location', location);
  setText('scene-status', status);
  scene.classList.remove('intro-active', 'scene-art-pending');
  scene.classList.add('story-active');
  if (!comicIntro) return;
  comicIntro.hidden = false;
  comicIntro.className = 'comic-intro story-card';
  storyAction = action;
  comicIntro.innerHTML = `<div class="comic-intro-head"><div><span class="comic-intro-kicker">${kicker}</span><h2>Следующий шаг дела</h2></div><span class="comic-intro-count">${caption || image.caption || 'NEXORA'}</span></div><div class="comic-intro-grid"><article class="comic-intro-panel story-beat-panel is-new" data-index="0"><div class="comic-intro-image"><img src="${image.src}" alt="${image.alt}" width="1280" height="720" loading="eager" decoding="sync" style="object-position:${image.position || 'center'}"><span class="comic-intro-number">●</span></div><div class="comic-intro-caption"><span class="comic-intro-panel-kicker">${kicker}</span><h3>${title}</h3><p>${text}</p>${voice ? `<blockquote class="comic-voice">${voice}</blockquote>` : ''}${extra}<button class="accent comic-intro-action" data-story-action="advance">${actionLabel}</button></div></article></div>`;
  onReady?.();
  });
}

function objectCard({ icon, title, detail, label, action }) {
  const object = $('scene-object');
  object.className = 'scene-object clickable-object';
  object.innerHTML = `<div class="object-icon">${icon}</div><div><b>${title}</b><small>${detail}</small></div><button id="scene-object-action">${label}</button>`;
  $('scene-object-action').onclick = action;
}

function appendJournal(title, text) {
  state.journal.push({title, text});
  renderJournal();
  queueSave();
}

function renderJournal(entries = state.journal) {
  const container = $('case-entries');
  container.replaceChildren();
  for (const item of entries) {
    const entry = document.createElement('div'); entry.className = 'case-entry active';
    const title = document.createElement('b'); title.textContent = item.title;
    const text = document.createElement('span'); text.textContent = item.text;
    entry.append(title, text); container.append(entry);
  }
}

function showReport(id) {
  const item = caseInfo(id), dialog = $('report-modal');
  $('report-title').textContent = `Дело ${id} · ${item.title}`;
  const entries = state.reports[id] || (id === state.activeCase ? state.journal : []);
  const container = $('report-entries'); container.replaceChildren();
  for (const item of entries) {
    const entry = document.createElement('div'); entry.className = 'case-entry active';
    const title = document.createElement('b'); title.textContent = item.title;
    const text = document.createElement('span'); text.textContent = item.text;
    entry.append(title, text); container.append(entry);
  }
  dialog.showModal();
}

function renderBriefing() {
  if (state.recordedJournal) {
    renderStoryBeat({ room: 'briefing', location: 'КОМНАТА СВЯЗИ · 08:45', status: 'УЛИКА СОХРАНЕНА', frame: 'journal', kicker: 'ДЕЛО 001 / ПЕРВАЯ ЗАПИСЬ', title: 'Улика готова к проверке.', text: 'Два HIGH, затем LOW. Запись сохранена — теперь сравни её со схемой и найди место, где исчез ток.', actionLabel: 'Войти в мастерскую →', action: () => enterRoom('workshop'), voice: '«Переходим от наблюдения к сборке. На верстаке проверим каждую деталь».' });
    return;
  }
  if (state.inspectedPanel) {
    renderStoryBeat({ room: 'briefing', location: 'КОМНАТА СВЯЗИ · 08:44', status: 'УЛИКА НАЙДЕНА', frame: 'panel', kicker: 'ДЕЛО 001 / ПОСЛЕДНИЙ ИМПУЛЬС', title: 'Питание есть. Сигнала нет.', text: 'На панели видны два HIGH, затем LOW. Питание осталось, а линия оборвалась после последнего импульса.', actionLabel: 'Записать улику →', action: recordJournal, voice: '«Не угадывай причину. Сначала сохрани факт — потом проверим его на схеме».' });
    return;
  }
  renderStoryBeat({ room: 'briefing', location: 'КОМНАТА СВЯЗИ · 08:42', status: 'СИГНАЛ ПОТЕРЯН', frame: state.askedMaya ? 'mentor' : 'briefing', kicker: 'ДЕЛО 001 / ВХОДЯЩЕЕ ДЕЛО', title: state.askedMaya ? 'Мая выходит на связь.' : 'Здесь слишком тихо.', text: state.askedMaya ? 'Наставница показывает незаконченный стол и просит проверить последний пакет данных.' : 'Перед тобой мигает аварийная панель. На экране — последний лог маяка.', actionLabel: state.askedMaya ? 'Осмотреть панель →' : 'Ответить Мае →', action: state.askedMaya ? inspectPanel : () => { state.askedMaya = true; renderBriefing(); }, voice: '«Питание на плате есть, но маяк не отвечает. Разберись, что произошло, прежде чем подключать провода».' });
}

function recordJournal() {
  state.recordedJournal = true;
  addClue('запись в журнале', null, 5);
  renderBriefing();
}

function inspectPanel() {
  if (state.inspectedPanel) return renderBriefing();
  state.inspectedPanel = true;
  unlock('workshop');
  addClue('лог 08:39', 'лог маяка', 15);
  appendJournal('08:44 / Панель', 'Питание есть, два импульса HIGH, затем разрыв после LOW.');
  renderBriefing();
}

function renderWorkshop() {
  if (state.completed.has(0)) {
    renderStoryBeat({ room: 'workshop', location: 'МАСТЕРСКАЯ · 09:02', status: 'ЦЕПЬ ВОССТАНОВЛЕНА', frame: 'restored', kicker: 'ЭПИЗОД 01 / РЕЗУЛЬТАТ', title: 'Первый свет. Получилось!', text: 'Светодиод оживает. Сигнал снова проходит через резистор и возвращается к плате.', actionLabel: 'Идти в серверную →', action: () => enterRoom('server'), voice: '«Цепь работает. Теперь проверим, каким ритмом маяк отправляет пакеты».' });
    return;
  }
  if (state.tookResistor) {
    renderStoryBeat({ room: 'workshop', location: 'МАСТЕРСКАЯ · 08:55', status: 'ДЕТАЛЬ В ИНВЕНТАРЕ', frame: 'taken', kicker: 'ЭПИЗОД 01 / СБОРКА', title: 'Деталь у тебя. Можно собирать.', text: 'Резистор 220 Ом получен. Соедини его последовательно со светодиодом и запусти первую программу.', actionLabel: 'Открыть верстак →', action: () => openWorkbench(0), voice: '«На верстаке будут схема, подсказка по проводам и редактор Arduino-кода».' });
  } else if (state.inspectedResistor) {
    renderStoryBeat({ room: 'workshop', location: 'МАСТЕРСКАЯ · 08:53', status: 'РЕЗИСТОР НАЙДЕН', frame: 'resistor', kicker: 'ЭПИЗОД 01 / ДЕТАЛЬ', title: 'Маленькая деталь с важной задачей.', text: 'Под журналом лежит резистор 220 Ом. Он ограничивает ток и защищает светодиод от перегрузки.', actionLabel: 'Взять резистор →', action: takeResistor, voice: '«Резистор — не украшение. В цепи он должен стоять последовательно со светодиодом».' });
  } else {
    renderStoryBeat({ room: 'workshop', location: 'МАСТЕРСКАЯ · 08:51', status: 'СХЕМА НЕПОЛНА', frame: 'workshop', kicker: 'ЭПИЗОД 01 / ВЕЩЕСТВЕННАЯ УЛИКА', title: 'На столе не хватает одного решения.', text: 'Из-под журнала выглядывает деталь с цветными полосами. Сначала рассмотри её, затем подключай плату.', actionLabel: 'Осмотреть деталь →', action: inspectResistor, voice: '«Не подключай светодиод напрямую. Найди, что ограничит ток».' });
  }
}

function inspectResistor() {
  state.inspectedResistor = true;
  renderWorkshop();
}

function takeResistor() {
  if (state.tookResistor) return renderWorkshop();
  state.tookResistor = true;
  addClue('ограничение тока', 'резистор 220 Ω', 20);
  appendJournal('08:53 / Деталь', 'Резистор 220 Ω должен стоять последовательно со светодиодом.');
  renderWorkshop();
}

function renderServer() {
  if (state.completed.has(1)) {
    renderStoryBeat({ room: 'server', location: 'СЕРВЕРНАЯ · 09:18', status: 'РИТМ ВОССТАНОВЛЕН', frame: 'rhythm', kicker: 'ЭПИЗОД 02 / РЕЗУЛЬТАТ', title: 'Маяк снова отвечает.', text: 'Пакеты идут ровно. Осталась финальная проверка: сможет ли устройство реагировать на входной сигнал.', actionLabel: 'Открыть крышу →', action: () => enterRoom('roof'), voice: '«Ритм чистый. Осталось проверить условие if/else на настоящей кнопке».' });
  } else if (state.inspectedServer) {
    renderStoryBeat({ room: 'server', location: 'СЕРВЕРНАЯ · 09:10', status: 'НУЖЕН НОВЫЙ РИТМ', frame: 'signal', kicker: 'ЭПИЗОД 02 / ПЕРЕМЕННАЯ', title: 'Посмотри на расстояния между импульсами.', text: 'Поставь 250 миллисекунд в переменную pauseMs и используй её в обеих командах delay — свет и темнота должны быть одинаковыми.', actionLabel: 'Настроить ритм в коде →', action: () => openWorkbench(1), voice: '«Переменная — это подписанная коробка со значением. Одно имя управляет двумя паузами».' });
  } else {
    renderStoryBeat({ room: 'server', location: 'СЕРВЕРНАЯ · 09:07', status: 'РИТМ СБОИТ', frame: 'server', kicker: 'ЭПИЗОД 02 / СЛУШАЙ СИГНАЛ', title: 'Сигнал есть, но он слишком быстрый.', text: 'После сборки линия ожила, но вспышки разной длины похожи на помехи. Оператор показывает график пакетов.', actionLabel: 'Рассмотреть сигнал →', action: inspectServer, voice: '«Я вижу импульсы. Давай измерим их, прежде чем менять программу».' });
  }
}

function inspectServer() {
  state.inspectedServer = true;
  renderServer();
}

function renderRoof() {
  if (state.final) {
    renderStoryBeat({ room: 'roof', location: 'КРЫША · 09:31', status: 'ДЕЛО ЗАКРЫТО', frame: 'final', kicker: 'ЭПИЗОД 03 / ФИНАЛ', title: 'Сигнал снова виден всему городу.', text: 'Маяк передаёт чистую последовательность. Ты научилась читать цепь, задавать значения и заставлять программу выбирать действие.', actionLabel: 'Открыть новое дело →', action: completeCurrentCase, voice: '«Комиссия увидит работающий маяк. Дело закрыто».', extra: renderSkillSummary() });
  } else if (state.inspectedButton) {
    renderStoryBeat({ room: 'roof', location: 'КРЫША · 09:25', status: 'НУЖНА РЕАКЦИЯ', frame: 'button', kicker: 'ЭПИЗОД 03 / УСЛОВИЕ', title: 'Нажатие есть. Нужна реакция.', text: 'Вход D2 сообщает о нажатии, а D13 управляет светом. Программа должна выбрать ветку if/else.', actionLabel: 'Открыть финальный верстак →', action: () => openWorkbench(2), voice: '«Проверь обе ситуации: отпущена и нажата. Свет должен загораться только по условию».' });
  } else {
    renderStoryBeat({ room: 'roof', location: 'КРЫША · 09:23', status: 'ФИНАЛЬНАЯ ПРОВЕРКА', frame: 'roof', kicker: 'ЭПИЗОД 03 / РЕШЕНИЕ', title: 'Один импульс отделяет систему от запуска.', text: 'У маяка появилась кнопка. Свет должен загораться только в момент нажатия — иначе комиссия сочтёт систему неисправной.', actionLabel: 'Осмотреть кнопку →', action: inspectButton, voice: '«Нам нужен свет именно по нажатию. Посмотри на вход контроллера».' });
  }
}

function inspectButton() {
  state.inspectedButton = true;
  renderRoof();
}

function pulseStrip(count, label, good = false) {
  return `<div class="evidence-strip${good ? ' is-good' : ''}"><b>${label}</b><div class="pulse-slots" role="img" aria-label="${count} импульса из трёх">${[1,2,3].map(n => `<span class="pulse-slot${n <= count ? ' is-lit' : ' is-missing'}">${n <= count ? '●' : '?'}<small>${n}</small></span>`).join('')}<span class="pulse-gap">пауза<br>1200 мс</span></div><small>${count} × 200 мс · короткие паузы 200 мс</small></div>`;
}

function setCaseTwoStage(stage) {
  if (stage === 1 && !state.clues.includes('протокол сирены')) {
    addClue('протокол сирены', 'протокол сирены', 5);
    appendJournal('10:04 / Протокол', 'Серия: 3 вспышки по 200 мс, короткие паузы 200 мс. После серии темнота 1200 мс.');
  }
  state.case2Stage = stage;
  state.case2Reached = Math.max(state.case2Reached,stage);
  state.room = stage === 0 ? 'briefing' : stage <= 2 ? 'workshop' : stage <= 4 ? 'server' : 'roof';
  if (state.case2Reached >= 1) state.unlocked.add('workshop');
  if (state.case2Reached >= 3) state.unlocked.add('server');
  if (state.case2Reached >= 5) state.unlocked.add('roof');
  syncRoomButtons();
  renderRoom();
}

function renderLoopModel() {
  const host = $('loop-model'); if (!host) return;
  const trace = loopTrace(state.traceBound);
  state.traceStep = Math.min(state.traceStep,trace.length-1);
  const current = trace[state.traceStep];
  const done = state.traceStep === trace.length-1;
  if (done && state.traceBound === 2 && !state.traceComplete) {
    state.traceComplete = true;
    addClue('граница цикла найдена', null, 10);
    appendJournal('Разбор программы', 'При i < 2 тело выполняется для i = 0 и i = 1. При i = 2 условие уже ложно. Третьей вспышки нет.');
  }
  const active = name => current.part === name ? ' class="trace-active"' : '';
  host.innerHTML = `<div class="loop-model-heading"><span>ПРОЙДИ ПО КОДУ · МОДЕЛЬ ЦИКЛА</span><b>шаг ${state.traceStep+1} / ${trace.length}</b></div>
    <div class="loop-model-code"><code>for (<span${active('init')}>int i = 0</span>; <span${active('test')}>i &lt; ${state.traceBound}</span>; <span${active('increment')}>i++</span>) {<br>  <span${active('body')}>вспышка();</span><br>}<br><span${active('exit')}>delay(1000);</span></code></div>
    <div class="loop-values"><span>счётчик <b>i = ${current.i}</b></span><span>вспышек <b>${current.pulses} / ${state.traceBound}</b></span><div class="trace-lights" aria-hidden="true">${[0,1,2].map(i=>`<i class="${i<current.pulses?'lit':''}"></i>`).join('')}</div></div>
    <p class="trace-explanation" role="status">${current.text}</p>
    <div class="trace-controls"><button type="button" id="trace-back" ${state.traceStep === 0?'disabled':''}>← Назад</button><button type="button" class="accent" id="trace-next">${done ? 'Повторить разбор ↺' : 'Следующая команда →'}</button>${state.traceComplete ? `<button type="button" id="trace-compare">Модель: ${state.traceBound === 2?'попробовать границу 3':'вернуть границу 2'}</button>` : ''}</div>
    <small class="trace-note">«вспышка()» здесь обозначает четыре команды digitalWrite и delay. Эта модель объясняет for; программу на плате ты исправишь сама.</small>`;
  $('trace-back').onclick = () => { state.traceStep--; renderLoopModel(); };
  $('trace-next').onclick = () => { state.traceStep = done ? 0 : state.traceStep+1; renderLoopModel(); };
  if ($('trace-compare')) $('trace-compare').onclick = () => { state.traceBound = state.traceBound === 2 ? 3 : 2; state.traceStep = 0; renderLoopModel(); };
  const next = comicIntro.querySelector('[data-story-action]');
  next.disabled = !state.traceComplete;
  next.textContent = state.traceComplete ? 'Исправить настоящую программу →' : 'Сначала пройди цикл по шагам';
  queueSave();
}

function setExtraStage(stage){
  const id=state.activeCase;if(!extraCases[id])return;
  state.caseStage=stage;state.caseReached=Math.max(state.caseReached,stage);
  state.room=stage===0?'briefing':stage===1?'workshop':stage<=3?'server':'roof';
  if(stage>=1)state.unlocked.add('workshop');if(stage>=2)state.unlocked.add('server');if(stage>=4)state.unlocked.add('roof');
  if(stage===1&&!state.clues.includes(extraCases[id].evidence.clue)){addClue(extraCases[id].evidence.clue,extraCases[id].evidence.item,15);appendJournal(`${id} / Улика`,extraCases[id].evidence.detail);}
  syncRoomButtons();saveGame();renderRoom();
}
function renderExtraCase(){
  const id=state.activeCase,story=extraCases[id],stage=state.caseStage;
  const common={room:state.room,location:`${story.location} · ДЕЛО ${id}`,caption:`РАССЛЕДОВАНИЕ / ${stage+1} ИЗ 5`};
  if(stage===0)return renderStoryBeat({...common,frame:story.frames[0],status:'НОВАЯ ЖАЛОБА',kicker:`ДЕЛО ${id} / ВХОДЯЩИЙ СИГНАЛ`,title:story.opening.title,text:story.opening.text,voice:story.opening.voice,actionLabel:'Осмотреть устройство →',action:()=>setExtraStage(1)});
  if(stage===1)return renderStoryBeat({...common,frame:story.frames[1],status:'УЛИКА НАЙДЕНА',kicker:`ДЕЛО ${id} / ИЗМЕРЕНИЕ`,title:story.evidence.title,text:story.evidence.text,voice:`«${story.evidence.detail}»`,extra:`<div class="signal-comparison">${story.evidence.values.map((value,i)=>`<div class="evidence-strip${i===story.evidence.values.length-1?' is-good':''}"><b>ФАКТ ${i+1}</b><small>${value}</small></div>`).join('')}</div>`,actionLabel:'Разобрать улику →',action:()=>setExtraStage(2)});
  if(stage===2)return renderStoryBeat({...common,frame:story.frames[2],status:'ГИПОТЕЗА',kicker:`ДЕЛО ${id} / ОБУЧАЮЩИЙ РАЗБОР`,title:story.lesson.title,text:story.lesson.text,voice:story.lesson.voice,extra:modelMarkup(),actionLabel:state.modelDone?'Открыть верстак ремонта →':'Сначала пройти микропроверку',action:()=>{if(state.modelDone)setExtraStage(3);},onReady:()=>bindModel(id,state,queueSave)});
  if(stage===3)return renderStoryBeat({...common,frame:story.frames[3],status:'ПРОВЕРЯЕМ ГИПОТЕЗУ',kicker:`ДЕЛО ${id} / РЕМОНТ`,title:story.repair.title,text:story.repair.text,voice:`«${story.repair.hint}»`,extra:`<details class="repair-hint"><summary>Подсказка по ремонту</summary><p>${story.repair.hint}</p></details>`,actionLabel:'Открыть верстак →',action:()=>openWorkbench(story.mission)});
  return renderStoryBeat({...common,frame:story.frames[4],status:'ДЕЛО ЗАКРЫТО',kicker:`ДЕЛО ${id} / ОТЧЁТ ПРИНЯТ`,title:story.ending.title,text:story.ending.text,voice:story.ending.voice,extra:renderSkillSummary(),actionLabel:'Закрыть папку и открыть архив →',action:completeCurrentCase});
}

function renderCaseTwo() {
  const common = {room:'server', location:'СЕРВЕРНАЯ · ДЕЛО 002', caption:`РАССЛЕДОВАНИЕ / ${state.case2Stage+1} ИЗ 6`};
  if (state.case2Stage === 0) {
    renderStoryBeat({...common,frame:'c2call',status:'НОВАЯ ЖАЛОБА',kicker:'ДЕЛО 002 / ВХОДЯЩИЙ ЗВОНОК',title:'«Мы больше не узнаём сигнал».',text:'Мая передаёт сообщение дежурного: после запуска сирена выдаёт только два коротких импульса. По протоколу их должно быть три. Питание исправно — но этого мало, чтобы доверять сигналу.',voice:'«Сначала запишем, что устройство делает на самом деле. Потом найдём причину в программе».',actionLabel:'Открыть протокол и осмотреть устройство →',action:()=>setCaseTwoStage(1)});
  } else if (state.case2Stage === 1) {
    renderStoryBeat({...common,frame:'c2observe',status:'НУЖНО НАБЛЮДЕНИЕ',kicker:'ДЕЛО 002 / ОСМОТР',title:'Увидеть сбой своими глазами.',text:'На стенде светодиод повторяет управляющие импульсы сирены. Запусти исходную программу, дождись двух полных серий и нажми «Записать наблюдение». Код пока защищён от изменений — сохраняем исходную улику.',voice:'«Не считай вспышки по тексту программы. Посмотри, что выдаёт подключённая плата».',extra:pulseStrip(3,'ПРОТОКОЛ: ТАК ДОЛЖНО БЫТЬ',true),actionLabel:state.observation?'Вернуться к записанной улике →':'Наблюдать на верстаке →',action:state.observation?()=>setCaseTwoStage(2):()=>openWorkbench(3,{mode:'observe'})});
  } else if (state.case2Stage === 2) {
    const count = state.observation?.count || 2;
    renderStoryBeat({...common,frame:'c2evidence',status:'УЛИКА ЗАПИСАНА',kicker:'ДЕЛО 002 / СРАВНЕНИЕ',title:'Третьего импульса действительно нет.',text:'Две полные серии показали одинаковый сбой. Длительность вспышек верная, но серия обрывается раньше. Ищем место, которое решает, сколько раз повторять действие.',voice:'«Раньше условие выбирало действие по кнопке. Теперь условие решает, продолжать ли повторение».',extra:`<div class="signal-comparison">${pulseStrip(count,'ИЗМЕРЕНО НА ТВОЕЙ СХЕМЕ')}${pulseStrip(3,'ТРЕБУЕТ ПРОТОКОЛ',true)}</div>`,actionLabel:'Проследить за счётчиком →',action:()=>setCaseTwoStage(3)});
  } else if (state.case2Stage === 3) {
    renderStoryBeat({...common,frame:'c2loop',status:'ИЩЕМ ПРИЧИНУ',kicker:'ДЕЛО 002 / РАЗБОР ЦИКЛА',title:'Куда исчезло третье повторение?',text:'Нажимай «Следующая команда» и наблюдай за i. Счётчик начинается с нуля, условие проверяется перед каждым повторением, а i++ выполняется после тела цикла.',voice:'«Следи за условием. В какой момент оно перестаёт пускать нас к вспышке?»',extra:'<section id="loop-model" class="loop-model" aria-label="Пошаговый разбор цикла for"></section>',actionLabel:'Сначала пройди цикл по шагам',action:()=>{if(state.traceComplete)setCaseTwoStage(4);},onReady:renderLoopModel});
  } else if (state.case2Stage === 4) {
    renderStoryBeat({...common,frame:'c2repair',status:'ПРОВЕРЯЕМ ГИПОТЕЗУ',kicker:'ДЕЛО 002 / РЕМОНТ',title:'Одно условие — другое поведение.',text:'Верни третью вспышку, изменив условие for в исходной программе. Сохрани вспышки и короткие паузы по 200 мс, а после цикла оставь delay(1000). Проверка измерит две полные серии на твоей схеме.',voice:'«Исправить текст — только гипотеза. Работающее устройство подтвердит её».',extra:'<details class="repair-hint"><summary>Нужна подсказка?</summary><p>Для трёх повторений счётчик должен успеть принять значения 0, 1 и 2. Подумай, с каким числом нужно сравнить i в условии «меньше».</p></details>',actionLabel:'Исправить код на верстаке →',action:()=>openWorkbench(3,{mode:'repair'})});
  } else {
    renderStoryBeat({...common,frame:'c2fixed',status:'ДЕЛО ЗАКРЫТО',kicker:'ДЕЛО 002 / ОТЧЁТ ПРИНЯТ',title:'Теперь смена узнаёт сигнал.',text:'Причина: условие i < 2 разрешало только два повторения. Ты изменила границу цикла и проверила результат на устройстве. В двух полных сериях плата выдала по три коротких импульса.',voice:'«Мы знаем не только что работает, но и почему. Приложи измерения к делу».',extra:pulseStrip(state.repairResult?.count || 3,'ПОДТВЕРЖДЕНО НА ТВОЕЙ СХЕМЕ',true)+renderSkillSummary(),actionLabel:'Закрыть папку и увидеть следующее дело →',action:completeCurrentCase});
  }
}

function renderRoom() {
  renderCaseChrome();
  updateMap();
  if (state.activeCase === '002') { renderCaseTwo(); return; }
  if (extraCases[state.activeCase]) { renderExtraCase(); return; }
  if (state.room === 'briefing' && !state.introDone) { renderIntro(); return; }
  if (state.room === 'briefing') renderBriefing();
  if (state.room === 'workshop') renderWorkshop();
  if (state.room === 'server') renderServer();
  if (state.room === 'roof') renderRoof();
}

function enterRoom(room) {
  if (!state.unlocked.has(room)) return;
  if(extraCases[state.activeCase]){
    const target={briefing:0,workshop:1,server:state.caseReached>=3?3:2,roof:4}[room];
    if(target<=state.caseReached)setExtraStage(target);
    return;
  }
  if (state.activeCase === '002') {
    const target = {briefing:0, workshop:state.observation?2:1, server:state.case2Reached>=4?4:3, roof:5}[room];
    if (target <= state.case2Reached) setCaseTwoStage(target);
    return;
  }
  state.room = room;
  renderRoom();
}

function openWorkbench(index, options = {mode:'repair'}) {
  sceneGate.cancel();
  state.view = 'workbench'; state.workbenchIndex = index; state.workbenchMode = options.mode || 'repair';
  saveGame();
  const objectives = ['Собери первую цепь и верни сигнал', 'Настрой ритм пакетов через переменную', 'Сделай маяк реагирующим на кнопку', options.mode === 'observe' ? 'Запусти исходную программу и запиши две серии' : 'Верни третью вспышку и проверь две серии', 'Собери список световых сигналов', 'Вынеси повторяющееся действие в функцию','Подключи датчик и настрой включение при 35 °C','Проверь перегрев и кнопку как независимые причины тревоги'];
  const activeWorkshop = window.nexoraWorkshop;
  if (activeWorkshop && typeof activeWorkshop.open === 'function') {
    setText('workbench-objective', objectives[index] || 'Выполни задание');
    activeWorkshop.open(index, options);
    return;
  }
  const button = comicIntro?.querySelector('[data-story-action], [data-intro-action]');
  if (button) {
    button.disabled = true;
    button.dataset.originalLabel = button.textContent;
    button.textContent = 'Загружаю верстак…';
  }
  if (workbenchWaitTimer) return;
  let attempts = 0;
  workbenchWaitTimer = window.setInterval(() => {
    const ready = window.nexoraWorkshop;
    if (ready && typeof ready.open === 'function') {
      window.clearInterval(workbenchWaitTimer);
      workbenchWaitTimer = null;
      setText('workbench-objective', objectives[index] || 'Выполни задание');
      ready.open(index, options);
      return;
    }
    attempts += 1;
    if (attempts >= 150) {
      window.clearInterval(workbenchWaitTimer);
      workbenchWaitTimer = null;
      if (button) {
        button.disabled = false;
        button.textContent = 'Повторить запуск';
      }
    }
  }, 100);
}

function resetCase() {
  clearTimeout(saveTimer);clearTimeout(transitionTimer);sceneGate.cancel();
  dismissCaseReveal();$('archive-modal').close();$('report-modal').close();
  resetCaseProgress();
  window.nexoraWorkshop?.resetProgress?.();
  Object.assign(state,initialState());
  clearProgress();
  document.body.classList.remove('game-started','workbench-open');
  storyAction=null;comicIntro.replaceChildren();comicIntro.hidden=true;
  renderJournal();renderStats();saveGame();
  $('start-game').focus();
}

function showResetDialog(id=state.activeCase){
  const dialog=$('reset-modal'),story=caseInfo(id);
  $('reset-case-description').textContent=`Начать дело ${id} «${story.title}» с первой сцены и исходной программы. Остальные дела, достижения и доступ к ним сохранятся.`;
  const single=$('replay-case');single.disabled=!state.started&&!state.completedCases.has(id);
  single.onclick=()=>{dialog.close();beginCase(id,{replay:true});};
  $('reset-all').onclick=()=>{
    $('reset-all-confirm').hidden=false;$('confirm-reset-all').focus();
  };
  $('reset-all-confirm').hidden=true;
  dialog.showModal();
}

function showMissionTransition(mission, name) {
  finishMission(mission);
  const story=extraCases[state.activeCase];
  const result = story&&story.mission===mission ? {frame:story.frames[4],kicker:`ДЕЛО ${state.activeCase} / ПРОВЕРКА ПРОЙДЕНА`,title:story.ending.title,text:story.ending.text,voice:story.ending.voice} : missionResults[mission];
  if (!result) return;
  document.querySelectorAll('.mission-transition').forEach((transition) => transition.remove());
  window.nexoraWorkshop?.close?.();
  document.body.classList.remove('workbench-open');
  const image = sceneArt[result.frame] || sceneArt.workshop;
  return presentStory([image.src], () => {
  const transition = document.createElement('div');
  transition.className = 'mission-transition';
  transition.setAttribute('role', 'dialog');
  transition.setAttribute('aria-modal', 'true');
  transition.setAttribute('aria-label', 'Результат миссии');
  const unlockedSkills = (missionSkills[mission] || []).map((id) => skillCatalog.find((skill) => skill.id === id)?.label).filter(Boolean);
  const skillLine = unlockedSkills.length ? `<div class="mission-transition-skills"><span>Новый инструмент дела</span><b>${unlockedSkills.join(' · ')}</b></div>` : '';
  transition.innerHTML = `<section class="mission-transition-card"><div class="mission-transition-image"><img src="${image.src}" alt="${image.alt}" width="1280" height="720" loading="eager" decoding="sync"><span class="mission-transition-stamp">✓</span></div><div class="mission-transition-copy"><span class="comic-intro-kicker">${result.kicker}</span><span class="mission-transition-name">${name}</span><h2>${result.title}</h2><p>${result.text}</p><blockquote>${result.voice}</blockquote>${skillLine}<button class="accent mission-transition-action">Продолжить дело <span>→</span></button><small class="mission-transition-hint">Enter / пробел</small></div></section>`;
  document.body.append(transition);
  const continueButton = transition.querySelector('.mission-transition-action');
  const close = () => {
    if (continueButton.disabled) return;
    continueButton.disabled = true;
    transition.classList.remove('is-visible');
    transition.classList.add('is-leaving');
    transitionTimer=window.setTimeout(() => { transition.remove(); if(state.started)renderRoom(); }, 260);
  };
  continueButton.addEventListener('click', close, { once: true });
  transition.addEventListener('keydown', (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target === transition) { event.preventDefault(); close(); }
  });
  transition.tabIndex = -1;
  requestAnimationFrame(() => {
    transition.classList.add('is-visible');
    continueButton.focus();
  });
  });
}

function renderTrainingResult(mission) {
  const result = missionResults[mission];
  if (!result) return renderRoom();
  const nextMission = mission + 1;
  renderStoryBeat({
    room: state.room,
    location: `УЧЕБНЫЙ АРХИВ · МОДУЛЬ 0${mission + 1}`,
    status: 'НАВЫК ПОЛУЧЕН',
    frame: result.frame,
    kicker: result.kicker,
    title: result.title,
    text: result.text,
    actionLabel: nextMission < 6 ? 'Открыть следующий модуль →' : 'Вернуться к делу →',
    action: nextMission < 6 ? () => openWorkbench(nextMission) : renderRoom,
    voice: result.voice,
    extra: renderSkillSummary(),
  });
}

function markCaseClosed() {
  state.completedCases.add(state.activeCase);
  const next = caseCatalog[caseCatalog.findIndex(item => item.id === state.activeCase)+1];
  if (next) state.unlockedCases.add(next.id);
  state.reports[state.activeCase] = state.journal.map(entry=>({...entry}));
  saveGame();
}

function finishMission(mission) {
  state.view = 'story';
  const wasComplete = state.completed.has(mission);
  const newSkills = (missionSkills[mission] || []).filter((id) => !state.skills.has(id));
  (missionSkills[mission] || []).forEach((id) => state.skills.add(id));
  state.completed.add(mission);
  const story=extraCases[state.activeCase];
  if(story&&story.mission===mission){
    state.final=true;state.caseStage=4;state.caseReached=4;state.room='roof';state.unlocked.add('roof');
    addClue('проверка устройства пройдена', 'акт проверки',35);
    if(!wasComplete)appendJournal('Результат испытания',story.ending.report);
    markCaseClosed();syncRoomButtons();renderStats();renderRoom();return;
  }
  if (mission === 0) {
    addClue('собранный маяк', 'схема питания', 35);
    unlock('server');
    if (!wasComplete) appendJournal('09:02 / Мастерская', 'Первая цепь собрана. Маяк отвечает двумя импульсами.');
    state.room = 'workshop';
  } else if (mission === 1) {
    unlock('roof');
    if (!wasComplete) appendJournal('09:18 / Серверная', 'Ритм пакетов выровнен переменной pauseMs.');
    state.room = 'server';
  } else if (mission === 2) {
    state.final = true;
    addClue('дело закрыто', 'ключ доступа', 50);
    if (!wasComplete) appendJournal('09:31 / Крыша', 'Маяк реагирует на кнопку. Система принята комиссией.');
    state.room = 'roof';
  } else if (mission >= 3) {
    if (state.activeCase === '002' && mission === 3) {
      state.final = true;
      addClue('серия сирены восстановлена', null, 35);
      if (!wasComplete) appendJournal('10:18 / Серверная', 'Сирена повторяет три коротких импульса через цикл for.');
      if (!wasComplete && newSkills.length) appendJournal('Навык добавлен в дело', newSkills.map((id) => skillCatalog.find((skill) => skill.id === id)?.label).filter(Boolean).join(' · '));
      state.room = 'roof';
      state.case2Stage = 5; state.case2Reached = 5; state.unlocked.add('roof');
      syncRoomButtons();
      markCaseClosed();
      renderStats();
      renderRoom();
      return;
    }
    if (!wasComplete) appendJournal(`Учебный модуль 0${mission + 1}`, `Освоено: ${(missionSkills[mission] || []).map((id) => skillCatalog.find((skill) => skill.id === id)?.label).filter(Boolean).join(', ')}. Навык пригодится в следующем деле.`);
    renderStats();
    renderTrainingResult(mission);
    return;
  }
  if (!wasComplete && newSkills.length) {
    appendJournal('Навык добавлен в дело', newSkills.map((id) => skillCatalog.find((skill) => skill.id === id)?.label).filter(Boolean).join(' · '));
  }
  if (state.final) markCaseClosed();
  renderStats();
  renderRoom();
}

function handleAction(action) {
  if (action === 'ask') { state.askedMaya = true; renderBriefing(); }
  if (action === 'panel') inspectPanel();
  if (action === 'journal') recordJournal();
  if (action === 'workshop') enterRoom('workshop');
  if (action === 'resistor') inspectResistor();
  if (action === 'take-resistor') takeResistor();
  if (action === 'inspect-server') inspectServer();
  if (action === 'inspect-button') inspectButton();
  if (action === 'server') enterRoom('server');
  if (action === 'roof') enterRoom('roof');
  if (action === 'workbench') openWorkbench(state.room === 'workshop' ? 0 : state.room === 'server' ? 1 : 2);
}

$('start-game').onclick = () => { if (state.started) { document.body.classList.add('game-started'); renderRoom(); } else beginCase('001'); };

document.querySelectorAll('.room').forEach((button) => button.addEventListener('click', () => enterRoom(button.dataset.room)));
actions.addEventListener('click', (event) => { const action = event.target.closest('button')?.dataset.action; if (action) handleAction(action); });
comicIntro?.addEventListener('click', (event) => {
  if (!sceneGate.busy && !comicIntro.inert && event.target.closest('[data-intro-action="advance"], [data-story-action="advance"]')) storyAction?.();
});
$('inspect-object').onclick = inspectPanel;
$('return-quest').onclick = () => { state.view = 'story'; if (workbenchWaitTimer) { clearInterval(workbenchWaitTimer); workbenchWaitTimer = null; } window.nexoraWorkshop?.close?.(); document.body.classList.remove('workbench-open'); renderRoom(); };
$('progress-settings').onclick=()=>showResetDialog();
$('close-reset').onclick=()=>$('reset-modal').close();
$('confirm-reset-all').onclick=()=>{$('reset-modal').close();resetCase();};
$('cancel-reset-all').onclick=()=>{$('reset-all-confirm').hidden=true;};
$('close-report').onclick = () => $('report-modal').close();
$('case-log').onclick = () => { renderJournal(); $('case-drawer').hidden = !$('case-drawer').hidden; };
$('close-case').onclick = () => { $('case-drawer').hidden = true; };
$('case-archive').onclick = () => { renderArchive(); $('archive-modal')?.showModal(); };
$('close-archive').onclick = () => { $('archive-modal')?.close(); };
$('archive-modal')?.addEventListener('click', (event) => { if (event.target === $('archive-modal')) $('archive-modal').close(); });
$('about').onclick = () => $('modal').showModal();
$('close-modal').onclick = () => $('modal').close();
document.addEventListener('keydown', (event) => { if (event.key.toLowerCase() === 'j' && !event.ctrlKey && !event.metaKey && !event.target.closest('textarea, input, [contenteditable="true"], .cm-editor')) $('case-drawer').hidden = !$('case-drawer').hidden; });
document.addEventListener('keydown', (event) => { if ((event.key === ' ' || event.key === 'Enter') && state.started && !state.introDone && !event.target.closest('button, a, textarea, input, [contenteditable="true"], .cm-editor')) { event.preventDefault(); advanceIntro(); } });

window.addEventListener('nexora:mission-complete', (event) => {
  const mission = event.detail?.mission;
  if (!state.started || state.view !== 'workbench') return;
  const allowed = state.activeCase === '001' ? mission >= 0 && mission < 3 : state.activeCase==='002' ? mission === 3 && state.case2Stage === 4 : mission===extraCases[state.activeCase]?.mission && state.caseStage===3;
  if (Number.isInteger(mission) && mission === state.workbenchIndex && allowed) {
    state.repairResult = mission === 3 ? signalSnapshot(event.detail.signal) : null;
    showMissionTransition(mission, event.detail.name);
  }
});

window.addEventListener('nexora:signal-observed', event => {
  if (state.activeCase !== '002' || state.case2Stage !== 1 || state.workbenchMode !== 'observe') return;
  const result = signalSnapshot(event.detail); if (!result || result.count !== 2) return;
  state.observation = result; state.view = 'story';
  window.nexoraWorkshop?.close?.();
  addClue('два импульса вместо трёх', 'запись сигнала', 15);
  appendJournal('10:06 / Наблюдение', 'На подключённой схеме измерены две одинаковые серии: 2 вспышки по 200 мс. Между сериями 1200 мс. Протокол требует 3 вспышки.');
  setCaseTwoStage(2);
  saveGame();
});

window.addEventListener('nexora:program-run', (event) => {
  if (!event.detail?.hasCircuit) {
    const feedback = document.getElementById('feedback');
    if (feedback) { feedback.textContent = 'Программа запущена, но цепь пока не замкнута. Проверь провода на столе.'; feedback.className = 'feedback error'; }
  }
});

renderStats();
renderJournal();
if (state.started) {
  document.body.classList.add('game-started');
  syncRoomButtons();
  renderRoom();
  if (state.view === 'workbench') openWorkbench(state.workbenchIndex, {mode:state.workbenchMode});
}

warmNextScenes();
