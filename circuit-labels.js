// Display names are shared by lessons, pin labels, wire lists and tooltips.
// Internal pin IDs remain unchanged so existing circuits continue to work.
export const componentNames={uno:'Arduino Uno',r:'Резистор · 220 Ω',led:'Светодиод (LED)',button:'Кнопка',sensor:'Датчик TMP36'};

export function pinLabel(id){
  const [part,pin]=id.split(':');
  if(part==='uno')return pin.startsWith('GND')?'GND':/^\d+$/.test(pin)?'D'+pin:pin;
  if(part==='led')return pin==='A'?'A (+)':'C (−)';
  if(part==='button')return pin.replace('.l','L').replace('.r','R');
  return part==='bb'?pin.toUpperCase():pin;
}
export function displayPin(id){
  const part=id.split(':')[0],prefix={uno:'Arduino',r:'Резистор',led:'Светодиод',button:'Кнопка',sensor:'Датчик',bb:'Макетная плата'}[part];
  return `${prefix||part} ${pinLabel(id)}`;
}
export function pinDescription(id){
  const [part,pin]=id.split(':');
  if(part==='led')return pin==='A'?'A — анод (+). В нашей схеме он получает сигнал от Arduino через резистор.':'C — катод (−). В нашей схеме он соединяется с Arduino GND.';
  if(part==='button'){
    const group=pin[0],side=pin.endsWith('l')?'левый':'правый';
    return `${group}${side==='левый'?'L':'R'} — ${group==='1'?'верхний':'нижний'} ${side} контакт. L означает «слева», R — «справа». ${group}L и ${group}R соединены внутри. Нажатие соединяет группы 1 и 2.`;
  }
  if(part==='sensor')return {VCC:'Питание датчика. Подключается к Arduino 5V.',GND:'Земля датчика. Подключается к Arduino GND.',OUT:'Выход измерения. Подключается к аналоговому входу Arduino A0.'}[pin];
  if(part==='r')return `Вывод ${pin} резистора. У резистора нет полярности: выводы 1 и 2 можно поменять местами.`;
  if(part==='uno')return pin.startsWith('GND')?'Общий контакт земли на Arduino. К нему возвращается ток от схемы.':pin==='5V'?'Выход питания 5 вольт для датчика.':pin==='A0'?'Аналоговый вход: программа читает его командой analogRead(A0).':`Цифровой контакт ${pin}. В программе ему соответствует число ${pin}.`;
  return 'В одной колонке A–E соединены внутри макетной платы, F–J — отдельно.';
}
export const ledConnections=[['uno:13','r:1'],['r:2','led:A'],['led:C','uno:GND.2']];
export const buttonConnections=[['uno:2','button:1.l'],['button:2.l','uno:GND.2']];
export const sensorConnections=[['sensor:VCC','uno:5V'],['sensor:GND','uno:GND.2'],['sensor:OUT','uno:A0']];
export const pinReference=id=>`<button type="button" class="pin-reference" data-pin-ref="${id}" aria-label="Показать контакт ${displayPin(id)}">${displayPin(id)}</button>`;
export const connectionText=pairs=>pairs.map(([a,b])=>`${displayPin(a)} → ${displayPin(b)}`).join('; ');
export const connectionMarkup=pairs=>`<span class="connection-instruction">${pairs.map(([a,b])=>`<span class="connection-instruction-row">${pinReference(a)} <span aria-hidden="true">→</span> ${pinReference(b)}</span>`).join('')}</span>`;
