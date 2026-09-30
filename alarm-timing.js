export function matchesAlarmPattern(intervals,pattern){
  return intervals.length>=pattern.length*2&&intervals.every((duration,i)=>Math.abs(duration-pattern[i%pattern.length])<.04);
}
export function alarmTimingHint(intervals,pattern){
  const flashes=pattern.filter((_,i)=>i%2===0).map(v=>Math.round(v*1000)).join(', ');
  const gap=Math.round(pattern[1]*1000),total=Math.round(pattern.at(-1)*1000),tail=total-gap;
  const measured=intervals[pattern.length-1];
  return `Вспышки: ${flashes} мс. В blink — delay(${gap}) после выключения света; после цикла — delay(${tail}). Вместе между сериями: ${gap} + ${tail} = ${total} мс.${Number.isFinite(measured)?` На твоей схеме сейчас около ${Math.round(measured*100)*10} мс между сериями.`:''}`;
}
