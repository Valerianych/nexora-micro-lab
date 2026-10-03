export const diagnosticChecks = {
  power:{label:'Проверить питание',title:'USB питает плату.',reading:'5,0 В между 5V и GND',text:'На плате есть напряжение питания. Версия «USB отключён» не объясняет погасший внешний LED.',voice:'«Питание подтверждено. Теперь выясним, есть ли команда и замкнутый путь тока».',frame:'panel'},
  program:{label:'Прочитать журнал сигнала',title:'Команды доходили до D13.',reading:'Журнал: HIGH → LOW → HIGH → LOW',text:'Это запись последнего запуска: программа переключала D13. Она не доказывает, что внешний LED был соединён с этим контактом.',voice:'«Запись команды и работа устройства — разные доказательства. Посмотри, куда подключён внешний индикатор».',frame:'signal'},
  circuit:{label:'Осмотреть путь тока',title:'Между выходом и LED есть разрыв.',reading:'Ветка внешнего LED не замкнута',text:'На схеме аварии выход D13 не соединён с анодом LED через ограничивающий резистор. Питание платы сохранилось, но ток через внешний LED не идёт.',voice:'«Нашли место для ремонта. Не замыкай разрыв перемычкой: в этой ветви нужно ограничить ток».',frame:'resistor'},
};
export function normalizeCaseOne(value,{legacyComplete=false}={}) {
  const checks=Array.isArray(value?.checks)?[...new Set(value.checks.filter(id=>Object.hasOwn(diagnosticChecks,id)))]:[];
  return {version:1,checks,selected:checks.includes(value?.selected)?value.selected:'',verdict:value?.verdict==='circuit'&&checks.length===3?'circuit':'',transferDone:value?.transferDone===true||(!value&&legacyComplete)};
}
export const diagnosisComplete=state=>state.verdict==='circuit'&&state.checks.length===3;

export const signalCommands={
  high:{code:'digitalWrite(ledPin, HIGH);',label:'Включить выход'},
  low:{code:'digitalWrite(ledPin, LOW);',label:'Выключить выход'},
  wait500:{code:'delay(500);',label:'Подождать 500 мс'},
  wait1000:{code:'delay(1000);',label:'Подождать 1000 мс'},
};
export function normalizeSignalExercise(value){
  return {setup:['OUTPUT','INPUT'].includes(value?.setup)?value.setup:'',lines:Array.from({length:4},(_,i)=>Object.hasOwn(signalCommands,value?.lines?.[i])?value.lines[i]:''),applied:value?.applied===true};
}
export function buildSignalSketch(value){
  const state=normalizeSignalExercise(value);
  if(!state.setup||state.lines.some(id=>!id))return null;
  return `int ledPin = 13;\n\nvoid setup() {\n  pinMode(ledPin, ${state.setup});\n}\n\nvoid loop() {\n${state.lines.map(id=>'  '+signalCommands[id].code).join('\n')}\n}\n`;
}
export function signalPreview(value){
  const state=normalizeSignalExercise(value);let level=false,time=0;const segments=[];
  for(const id of state.lines){
    if(id==='high')level=true;else if(id==='low')level=false;
    else if(id==='wait500'||id==='wait1000'){const duration=id==='wait500'?500:1000;segments.push({on:state.setup==='OUTPUT'&&level,start:time,duration});time+=duration;}
  }
  return {segments,duration:time,output:state.setup==='OUTPUT'};
}
