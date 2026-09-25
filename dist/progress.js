import {CASE_MISSIONS, caseIds, modelComplete} from './case-stories.js';
// Shared by the story and workbench. Each writer preserves the other section.
export const PROGRESS_KEY = 'nexora-progress-v1';
const rooms = ['briefing', 'workshop', 'server', 'roof'];
const skills = ['circuit', 'variables', 'types', 'conditions', 'loops', 'arrays', 'functions'];
const cases = caseIds;
const flags = ['started', 'inspectedPanel', 'askedMaya', 'recordedJournal', 'inspectedResistor', 'tookResistor', 'inspectedServer', 'inspectedButton', 'final', 'introDone', 'traceComplete'];
const integer = (v, min, max, fallback = min) => Number.isInteger(v) && v >= min && v <= max ? v : fallback;
const list = (v, allowed) => Array.isArray(v) ? [...new Set(v.filter(x => allowed.includes(x)))] : [];
const strings = v => Array.isArray(v) ? v.filter(x => typeof x === 'string').slice(0, 120).map(x => x.slice(0, 240)) : [];
const entries = v => Array.isArray(v) ? v.filter(x => x && typeof x.title === 'string' && typeof x.text === 'string').slice(-80).map(x => ({title:x.title.slice(0,160), text:x.text.slice(0,1000)})) : [];

export function readProgress(storage) {
  try {
    storage ??= globalThis.localStorage;
    const data = JSON.parse(storage.getItem(PROGRESS_KEY));
    return data?.version === 1 && typeof data === 'object' ? data : {};
  } catch { return {}; }
}

export function writeProgress(section, value, storage) {
  try {
    storage ??= globalThis.localStorage;
    const data = readProgress(storage);
    storage.setItem(PROGRESS_KEY, JSON.stringify({...data, version:1, [section]:value}));
    globalThis.dispatchEvent?.(new CustomEvent('nexora:save-status', {detail:{ok:true}}));
    return true;
  } catch {
    globalThis.dispatchEvent?.(new CustomEvent('nexora:save-status', {detail:{ok:false}}));
    return false;
  }
}

export function signalSnapshot(value) {
  if (!value || !Number.isInteger(value.count) || value.count < 1 || value.count > 30) return null;
  const durations = Array.isArray(value.durations) ? value.durations.filter(x => Number.isFinite(x) && x >= 0 && x < 60).slice(0,60) : [];
  return {count:value.count, durations, series:integer(value.series, 1, 100, 1)};
}

export function restoreGame(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const game = {};
  for (const flag of flags) game[flag] = raw[flag] === true;
  game.activeCase = cases.includes(raw.activeCase) ? raw.activeCase : '001';
  game.room = rooms.includes(raw.room) ? raw.room : 'briefing';
  game.score = integer(raw.score, 0, 100000);
  game.introStep = integer(raw.introStep, 0, 3);
  game.case2Stage = integer(raw.case2Stage, 0, 5);
  game.case2Reached = Math.max(game.case2Stage, integer(raw.case2Reached, 0, 5));
  game.caseStage = integer(raw.caseStage, 0, 4);
  game.caseReached = Math.max(game.caseStage,integer(raw.caseReached,0,4));
  game.modelSeen = list(raw.modelSeen,[0,1,2,3,25,34,35,40,200,600]);
  game.modelValue = integer(raw.modelValue,0,600,0);
  game.modelSetting = ['35','45','and','or'].includes(raw.modelSetting) ? raw.modelSetting : '';
  game.modelDone = modelComplete(game.activeCase,game.modelSeen,game.modelValue,game.modelSetting);
  game.traceBound = raw.traceBound === 3 ? 3 : 2;
  game.traceStep = integer(raw.traceStep, 0, 14);
  game.observation = signalSnapshot(raw.observation);
  game.repairResult = signalSnapshot(raw.repairResult);
  for (const [field, allowed] of Object.entries({skills, completedCases:cases, unlockedCases:cases, unlocked:rooms, completed:[0,1,2,3,4,5,6,7]})) game[field] = new Set(list(raw[field],allowed));
  game.unlockedCases.add('001');
  game.unlocked.add('briefing');
  for (const id of game.completedCases) { const next = cases[cases.indexOf(id)+1]; if (next) game.unlockedCases.add(next); }
  if (!game.unlockedCases.has(game.activeCase)) return null;
  game.clues = strings(raw.clues);
  game.inventory = strings(raw.inventory);
  game.journal = entries(raw.journal);
  game.reports = Object.fromEntries(cases.filter(id => Array.isArray(raw.reports?.[id])).map(id => [id,entries(raw.reports[id])]));
  game.view = raw.view === 'workbench' ? 'workbench' : 'story';
  game.workbenchIndex = integer(raw.workbenchIndex, 0, 7);
  if (!CASE_MISSIONS[game.activeCase].includes(game.workbenchIndex)) { game.workbenchIndex=CASE_MISSIONS[game.activeCase][0]; game.view='story'; }
  game.workbenchMode = raw.workbenchMode === 'observe' && game.workbenchIndex === 3 ? 'observe' : 'repair';
  if (game.activeCase === '002' && game.final) { game.case2Stage = 5; game.case2Reached = 5; game.room = 'roof'; }
  if (Number(game.activeCase)>=3 && game.final) { game.caseStage=4; game.caseReached=4; game.room='roof'; }
  game.rewarded = new Set(strings(raw.rewarded));
  // Preserve paused folders without nesting their global progress or snapshots.
  game.caseSaves = {};
  for (const id of cases) {
    const saved = raw.caseSaves?.[id];
    if (!saved || typeof saved !== 'object') continue;
    const restored = restoreGame({...saved, activeCase:id, unlockedCases:cases, caseSaves:null});
    if (restored) game.caseSaves[id] = caseSnapshot(restored);
  }
  return game;
}

export function serializeGame(state) {
  return Object.fromEntries(Object.entries(state).map(([key,value]) => [key, value instanceof Set ? [...value] : value]));
}

export function restoreWorkshop(raw, validPins, missionCount) {
  const drafts = {};
  for (const [key, value] of Object.entries(raw?.drafts || {})) {
    if ((!/^\d+$/.test(key) && key !== '3-observe') || (key !== '3-observe' && Number(key) > missionCount) || !value || typeof value.code !== 'string') continue;
    drafts[key] = {
      code:value.code.slice(0,100000), temperature:integer(value.temperature,0,80,25), step:integer(value.step,0,20), breadboard:value.breadboard === true,
      canvasWidth:integer(value.canvasWidth,1,10000),
      positions:Object.fromEntries(Object.entries(value.positions||{}).filter(([id,p])=>['uno','r','led','button','sensor'].includes(id)&&p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.y>=0&&p.x<=10000&&p.y<=10000).map(([id,p])=>[id,{x:p.x,y:p.y}])),
      wires:Array.isArray(value.wires) ? value.wires.filter(w => w && validPins.has(w.a) && validPins.has(w.b) && w.a !== w.b && (value.breadboard || (!w.a.startsWith('bb:') && !w.b.startsWith('bb:')))).slice(0,100).map(w => ({a:w.a,b:w.b,color:/^#[0-9a-f]{6}$/i.test(w.color) ? w.color : '#e04f50'})) : [],
    };
  }
  return {drafts, activeIndex:integer(raw?.activeIndex,0,missionCount), mode:raw?.mode === 'observe' ? 'observe' : 'repair', completed:new Set(list(raw?.completed,Array.from({length:missionCount},(_,i)=>i)))};
}

const caseFields = ['started','room','clues','inventory','unlocked','completed',...flags,'introStep','journal','view','workbenchIndex','workbenchMode','case2Stage','case2Reached','observation','repairResult','traceStep','traceBound','caseStage','caseReached','modelSeen','modelValue','modelDone','modelSetting'];
export function caseSnapshot(state){
  const serial=serializeGame(state);
  return Object.fromEntries(caseFields.filter(key=>key in serial).map(key=>[key,structuredClone(serial[key])]));
}
export function clearWorkshop(raw,indices=null){
  if(!indices)return {drafts:{},completed:[],activeIndex:0,mode:'repair'};
  const keys=new Set(indices.map(String));if(indices.includes(3))keys.add('3-observe');
  return {...raw,drafts:Object.fromEntries(Object.entries(raw?.drafts||{}).filter(([key])=>!keys.has(key))),completed:(raw?.completed||[]).filter(i=>!indices.includes(i))};
}
export function clearProgress(storage){
  try { (storage??globalThis.localStorage).removeItem(PROGRESS_KEY); return true; } catch { return false; }
}
