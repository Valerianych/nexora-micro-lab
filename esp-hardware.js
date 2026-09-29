export const gpioPins=[5,18,19,21,22,23,25,26,27,32,33,34];
export const outputPins=gpioPins.filter(pin=>pin!==34);
export const moduleSpecs={
  esp:{name:'ESP32 DevKit',pins:['3V3','GND','5V',...gpioPins.map(String)],description:'GPIO — номера контактов в программе. Логика 3,3 В. GPIO34 — только вход. VIN (5V) — питание стенда, не сигнальный выход.'},
  r:{name:'Резистор · 220 Ω',pins:['1','2'],description:'Ограничивает ток светодиода; полярности нет.'},
  led:{name:'Светодиод',pins:['A','C'],description:'A (+) — анод, C (−) — катод. Нужен последовательный резистор.'},
  button:{name:'Кнопка',pins:['1L','1R','2L','2R'],description:'Внутри соединены 1L–1R и 2L–2R. Нажатие соединяет обе группы.'},
  battery:{name:'Измеритель батареи',pins:['VCC','GND','OUT'],description:'Питание 3,3 В. На OUT половина напряжения батареи: делитель 1:2, АЦП 0–4095.'},
  driver:{name:'Драйвер привода',pins:['VCC','GND','PWM'],description:'Логика 3,3 В. PWM — управляющий вход. Силовое питание моторов встроено в модуль стенда; GPIO не питает мотор.'},
  imu:{name:'Ориентация · 0x68',pins:['VCC','GND','SDA','SCL'],description:'Учебная модель IMU: 3,3 В, I²C, адрес 0x68. readTilt() возвращает угол в градусах.'},
  range:{name:'Дальномер · 0x29',pins:['VCC','GND','SDA','SCL'],description:'Учебная модель ToF: 3,3 В, I²C, адрес 0x29. readDistance() возвращает сантиметры.'},
  camera:{name:'Камера · SPI',pins:['VCC','GND','SCK','MISO','MOSI','CS'],description:'Учебный модуль камеры: 3,3 В, SPI. SCK 18, MISO 19, MOSI 23; CS задаётся в cameraBegin(cs). Сохраняет отдельные модельные кадры.'},
  servo:{name:'Поворот камеры',pins:['V+','GND','SIG'],description:'Питание 5 В от стенда и общий GND. SIG принимает управление от GPIO. servoWrite(pin, angle): угол 0–180°.'},
};
export const espPinIds=new Set(Object.entries(moduleSpecs).flatMap(([id,spec])=>spec.pins.map(pin=>`${id}:${pin}`)));
export function espPinLabel(id){const [part,pin]=id.split(':');return part==='esp'?gpioPins.includes(Number(pin))?`GPIO${pin}`:pin==='5V'?'VIN · 5V':pin:part==='led'?pin==='A'?'A (+)':'C (−)':pin;}
export function espPinName(id){return `${moduleSpecs[id.split(':')[0]]?.name||''} ${espPinLabel(id)}`;}
export function espNets(wires,pressed=false){
  const parents=new Map();
  const root=id=>{if(!parents.has(id))parents.set(id,id);if(parents.get(id)!==id)parents.set(id,root(parents.get(id)));return parents.get(id);};
  const join=(a,b)=>parents.set(root(a),root(b));
  for(const wire of wires){if(!espPinIds.has(wire.a)||!espPinIds.has(wire.b))throw Error('В схеме есть неизвестный контакт. Удали это соединение.');join(wire.a,wire.b);}
  join('button:1L','button:1R');join('button:2L','button:2R');if(pressed)join('button:1L','button:2L');
  return {root,same:(a,b)=>root(a)===root(b)};
}
export function inspectEsp(wires,parts){
  const n=espNets(wires),same=n.same;
  const problems=[];
  if(same('esp:3V3','esp:GND')||same('esp:5V','esp:GND')||same('esp:5V','esp:3V3'))problems.push('Короткое замыкание шин питания.');
  for(const pin of gpioPins)if(same(`esp:${pin}`,'esp:5V'))problems.push(`На GPIO${pin} поданы 5 В. Входы ESP32 рассчитаны на логику 3,3 В.`);
  const powered=id=>same(`${id}:${id==='servo'?'V+':'VCC'}`,`esp:${id==='servo'?'5V':'3V3'}`)&&same(`${id}:GND`,'esp:GND');
  for(const id of parts.filter(p=>['battery','driver','imu','range','camera','servo'].includes(p)))if(!powered(id))problems.push(`${moduleSpecs[id].name}: проверь питание и общий GND.`);
  // Signal buses cannot be tied to power, ground or unrelated signal outputs.
  const signals=parts.flatMap(id=>({battery:['OUT'],driver:['PWM'],imu:['SDA','SCL'],range:['SDA','SCL'],camera:['SCK','MISO','MOSI','CS'],servo:['SIG']}[id]||[]).map(pin=>`${id}:${pin}`));
  for(const signal of signals)if(['esp:GND','esp:3V3','esp:5V'].some(rail=>same(signal,rail)))problems.push(`${espPinName(signal)}: сигнальный контакт замкнут на питание или землю.`);
  for(let a=0;a<signals.length;a++)for(let b=a+1;b<signals.length;b++){
    const x=signals[a],y=signals[b],sharedI2c=['imu','range'].includes(x.split(':')[0])&&['imu','range'].includes(y.split(':')[0])&&x.split(':')[1]===y.split(':')[1];
    if(!sharedI2c&&same(x,y))problems.push(`${espPinName(x)} и ${espPinName(y)}: разные сигналы соединены вместе.`);
  }
  let ledPin=null;
  const series=(a,b)=>same(a,'r:1')&&same(b,'r:2')||same(a,'r:2')&&same(b,'r:1');
  if(parts.includes('led')){
    for(const pin of outputPins){const a=`esp:${pin}`;if(!same('r:1','r:2')&&(series(a,'led:A')&&same('led:C','esp:GND')||same(a,'led:A')&&series('led:C','esp:GND')))ledPin=pin;}
    if(ledPin===null)problems.push('У светодиода нет замкнутой цепи с выходом, резистором и землёй.');
  }
  return {n,powered,ledPin,problems};
}
export function validateEspWires(value,parts){const allowed=new Set(parts);return Array.isArray(value)?value.filter(w=>w&&espPinIds.has(w.a)&&espPinIds.has(w.b)&&w.a!==w.b&&allowed.has(w.a.split(':')[0])&&allowed.has(w.b.split(':')[0])).slice(0,80).map(w=>({a:w.a,b:w.b,color:/^#[\da-f]{6}$/i.test(w.color)?w.color:'#d74f58'})):[];}
