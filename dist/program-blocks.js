// Ready-made statements, assembled by the learner and executed by the usual engines.
const block=(id,label,code)=>({id,label,code});
const zone=(id,title,description,blocks)=>({id,title,description,blocks});
const indent=(code,spaces)=>code.replace(/^/gm,' '.repeat(spaces));
export const blockPrograms={
  arduino:{
    title:'Сигнальная станция',
    globals:'int ledPin = 13;\nint buttonPin = 2;\nint sensorPin = A0;\nint durations[3] = {150, 300, 600};',
    fields:[{id:'logic',label:'Перегрев … нажатая кнопка',options:[['||','ИЛИ — достаточно одной причины'],['&&','И — нужны обе причины']]},{id:'pause',label:'Дополнительная пауза после цикла',options:[['500','500 мс'],['1000','1000 мс'],['1150','1150 мс']]}],
    zones:[
      zone('blink','Одна вспышка · blink(duration)','Расположи четыре действия в порядке исполнения.',[
        block('off','Выключить свет','digitalWrite(ledPin, LOW);'),block('gap','Пауза 150 мс','delay(150);'),block('on','Включить свет','digitalWrite(ledPin, HIGH);'),block('wait','Длительность вспышки','delay(duration);')]),
      zone('setup','Подготовка · setup()','Выполняется один раз при запуске.',[
        block('button','Настроить кнопку с подтяжкой','pinMode(buttonPin, INPUT_PULLUP);'),block('led','Настроить выход света','pinMode(ledPin, OUTPUT);')]),
      zone('read','Считать входы · loop()','Сначала напряжение, затем температура; прочитай и кнопку.',[
        block('temperature','Перевести в градусы с округлением','int temperature = (voltage - 0.5) * 100 + 0.5;'),block('button','Прочитать кнопку','bool pressed = digitalRead(buttonPin) == LOW;'),block('voltage','Считать напряжение TMP36','float voltage = analogRead(sensorPin) * 5.0 / 1024.0;')]),
      zone('repeat','Цикл · по каждой длительности','Внутри for: i от 0 до 2.',[block('blink','Вспышка из массива','blink(durations[i]);')]),
      zone('tail','После цикла','Последний blink уже добавил 150 мс. До следующей серии всего 1150 мс.',[block('pause','Дополнительная пауза','delay({pause});')]),
      zone('idle','Иначе · тревоги нет','Свет должен оставаться выключенным.',[block('off','Выключить свет','digitalWrite(ledPin, LOW);')]),
    ],
    flow:[{zone:'blink'},{zone:'setup'},{group:'Повторять · loop()',children:[{zone:'read'},{group:'Условие · температура ≥ 35 °C … кнопка',kind:'decision',children:[{group:'ДА · тревога',children:[{zone:'repeat'},{zone:'tail'}]},{group:'НЕТ · обычный режим',children:[{zone:'idle'}]}]}]}],
    generate:(z,f,g)=>`${g}\n\nvoid blink(int duration) {\n${z.blink}\n}\n\nvoid setup() {\n${z.setup}\n}\n\nvoid loop() {\n${z.read}\n  if (temperature >= 35 ${f.logic||'||'} pressed) {\n    for (int i = 0; i < 3; i++) {\n${indent(z.repeat,4)}\n    }\n${indent(z.tail,2)}\n  } else {\n${indent(z.idle,2)}\n  }\n}\n`,
  },
  esp32:{
    title:'Разведка насосной станции',
    globals:'#include <Wire.h>\n#include <NexoraModules.h>\n\nint angles[3] = {45, 90, 135};\nbool previous = false;\n// Кнопка 32; батарея 34; привод 25; SDA 21; SCL 22; CS 5; серво 26.',
    fields:[{id:'logic',label:'Для разрешения запуска нужны…',options:[['&&','Все условия одновременно — И'],['||','Хотя бы одно условие — ИЛИ']]}],
    zones:[
      zone('allowed','Проверить условия · allowed()','Вычисли значения и верни результат проверки.',[
        block('return','Сравнить все ограничения','return v >= 3.6 {logic} readDistance() >= 80 {logic} tilt >= -15 {logic} tilt <= 15;'),block('voltage','Измерить батарею','float v = analogRead(34) * 3.3 / 4095.0 * 2;'),block('tilt','Измерить наклон','float tilt = readTilt();')]),
      zone('setup','Подготовка · setup()','Подготовь кнопку, шину, привод и камеру.',[
        block('camera','Включить камеру','cameraBegin(5);'),block('button','Настроить кнопку','pinMode(32, INPUT_PULLUP);'),block('pwm','Настроить ШИМ','ledcAttach(25, 4000, 8);'),block('bus','Включить I²C','Wire.begin(21, 22);')]),
      zone('read','Считать кнопку · loop()','Состояние проверяется каждый проход.',[block('button','Прочитать кнопку','bool pressed = digitalRead(32) == LOW;')]),
      zone('start','Перед съёмкой','Запуск разрешён новым нажатием и проверкой allowed().',[block('motor','Включить привод','ledcWrite(25, 180);')]),
      zone('photos','Цикл · по каждому углу','Расставь наведение, ожидание, повторную проверку и снимок.',[
        block('capture','Сохранить кадр','cameraCapture();'),block('safety','При нарушении условий прервать цикл','if (!allowed()) { break; }'),block('turn','Навести камеру','servoWrite(26, angles[i]);'),block('wait','Дать камере 200 мс','delay(200);')]),
      zone('finish','После цикла','В том числе после досрочного прерывания.',[block('stop','Остановить привод','ledcWrite(25, 0);')]),
      zone('remember','Конец loop()','Запомни кнопку для следующего прохода.',[block('remember','Обновить прошлое состояние','previous = pressed;')]),
    ],
    flow:[{zone:'allowed'},{zone:'setup'},{group:'Повторять · loop()',children:[{zone:'read'},{group:'Новое нажатие И allowed()?',kind:'decision',children:[{group:'ДА · выполнить миссию',children:[{zone:'start'},{zone:'photos'},{zone:'finish'}]},{note:'НЕТ · ждать команду оператора'}]},{zone:'remember'}]}],
    generate:(z,f,g)=>`${g}\n\nbool allowed() {\n${z.allowed}\n}\n\nvoid setup() {\n${z.setup}\n}\n\nvoid loop() {\n${z.read}\n  if (pressed && !previous && allowed()) {\n${indent(z.start,2)}\n    for (int i = 0; i < 3; i++) {\n${indent(z.photos,4)}\n    }\n${indent(z.finish,2)}\n  }\n${z.remember}\n}\n`,
  },
};

export function normalizeBlocks(kind,raw){
  const def=blockPrograms[kind];if(!def)return null;
  const valid=raw?.version===1&&raw.kind===kind?raw:{};
  return {version:1,kind,mode:valid.mode==='code'?'code':'blocks',
    zones:Object.fromEntries(def.zones.map(z=>[z.id,Array.isArray(valid.zones?.[z.id])?[...new Set(valid.zones[z.id].filter(id=>z.blocks.some(b=>b.id===id)))]:[]])),
    fields:Object.fromEntries(def.fields.map(f=>[f.id,f.options.some(([value])=>value===valid.fields?.[f.id])?valid.fields[f.id]:''])),
    manualCode:typeof valid.manualCode==='string'?valid.manualCode.slice(0,100000):null};
}
export function blockProblem(kind,raw){
  const def=blockPrograms[kind],state=normalizeBlocks(kind,raw);
  for(const f of def.fields)if(!state.fields[f.id])return `Выбери: ${f.label.toLowerCase()}.`;
  for(const z of def.zones)if(state.zones[z.id].length<z.blocks.length)return `Дополни блок «${z.title}»: осталось команд — ${z.blocks.length-state.zones[z.id].length}.`;
  return '';
}
export function generateBlockCode(kind,raw){
  const def=blockPrograms[kind],state=normalizeBlocks(kind,raw);
  const defaults={logic:kind==='arduino'?'||':'&&',pause:'1000'};
  const fields=Object.fromEntries(Object.keys(defaults).map(k=>[k,state.fields[k]||defaults[k]]));
  const lines=Object.fromEntries(def.zones.map(z=>[z.id,state.zones[z.id].map(id=>'  '+z.blocks.find(b=>b.id===id).code.replace(/\{(\w+)\}/g,(_,key)=>fields[key])).join('\n')||'  // Добавь команды в блок.']));
  return def.generate(lines,fields,def.globals);
}
