// Full series are delimited by the measured long LOW gap, not by source text.
export function signalSeries(transitions, gap = 0.7) {
  const series = [];
  let start = 0;
  for (let i = 1; i < transitions.length; i++) {
    const previous = transitions[i-1], current = transitions[i];
    if (!previous.value && current.value && current.time - previous.time > gap) {
      const segment = transitions.slice(start,i+1);
      // The emulator retains a rolling window. Ignore a truncated first pulse.
      if (segment[0]?.value) series.push({
        count:segment.slice(0,-1).filter(x=>x.value).length,
        durations:segment.slice(1).map((x,j)=>x.time-segment[j].time),
      });
      start = i;
    }
  }
  return series;
}

export function analyzeSiren(transitions) {
  const series = signalSeries(transitions);
  const last = series.at(-1);
  const stable = series.length >= 2 && series.slice(-2).every(s => s.count === last.count && s.durations.length === last.durations.length && s.durations.every((d,i)=>Math.abs(d-last.durations[i])<0.025));
  const repaired = stable && last.count === 3 && last.durations.length === 6 && last.durations.every((d,i)=>Math.abs(d-(i===5?1.2:0.2))<0.025);
  return {stable,repaired,snapshot:last ? {...last,series:series.length} : null};
}

// A teaching model, separate from the AVR execution used to validate the repair.
export function loopTrace(bound = 2) {
  const trace = [{part:'init',i:0,pulses:0,text:'int i = 0: создаём целочисленный счётчик. Пока ни одной вспышки.'}];
  for (let i=0;i<bound;i++) {
    trace.push({part:'test',i,pulses:i,text:`${i} < ${bound} — верно. Можно войти в тело цикла.`});
    trace.push({part:'body',i,pulses:i+1,text:`Выполняем команды внутри фигурных скобок: вспышка № ${i+1}, затем короткая пауза.`});
    trace.push({part:'increment',i:i+1,pulses:i+1,text:`i++ увеличивает счётчик на один. Теперь i = ${i+1}. Возвращаемся к проверке.`});
  }
  trace.push({part:'test',i:bound,pulses:bound,text:`${bound} < ${bound} — неверно. Выходим из for. В этой серии ${bound} вспышки.`});
  trace.push({part:'exit',i:bound,pulses:bound,text:'После цикла ждём ещё 1000 мс. Вместе с последней паузой 200 мс получаем 1200 мс темноты. Затем loop() начинает новую серию.'});
  return trace;
}
