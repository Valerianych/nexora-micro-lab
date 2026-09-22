import {modelComplete} from './case-stories.js';

const values = {'003':[0,1,2], '004':[200,600], '005':[34,35,40], '006':[0,1,2,3]};
const labels = {
  '003':['Открыть durations[0]','Открыть durations[1]','Открыть durations[2]'],
  '004':['Вызвать blink(200)','Вызвать blink(600)'],
  '005':['Проверить 34 °C','Проверить 35 °C','Проверить 40 °C'],
  '006':['25 °C · отпущена','40 °C · отпущена','25 °C · нажата','40 °C · нажата'],
};

function contents(id, state) {
  const seen = state.modelSeen, value = state.modelValue, hasResult = seen.includes(value);
  let visual = '', result = '', controls = '';
  if (id === '003') {
    visual = `<div class="array-cells">${[100,250,250].map((duration,i)=>`<div class="array-cell${hasResult&&value===i?' is-current':''}"><code>durations[${i}]</code><strong>${seen.includes(i)?duration:'?'}</strong><small>${seen.includes(i)?'миллисекунд':'ячейка закрыта'}</small></div>`).join('')}</div>`;
    result = hasResult ? `i = ${value} → durations[${value}] = ${[100,250,250][value]} → delay(${[100,250,250][value]}). ${value===2?'Это третья вспышка. Приёмник ждёт 500 мс, а в ячейке 250: здесь ошибка.':'Эта длительность совпадает с протоколом.'}` : 'Открой три ячейки. Найди ту, где длительность отличается от протокола 100, 250, 500 мс.';
  } else if (id === '004') {
    const duration = hasResult ? value : 200;
    visual = `<pre class="model-code"><code>void blink(int duration) {\n  digitalWrite(ledPin, HIGH);\n  delay(duration);\n  digitalWrite(ledPin, LOW);\n  delay(200);\n}</code></pre><div class="model-pulse"><span style="width:${duration/6}%">HIGH · ${duration} мс</span></div>`;
    result = hasResult ? `blink(${value}) → параметр duration = ${value} → delay(${value}). Свет включён ${value} мс, затем выключен 200 мс. ${value===600?'Это длинная команда инженеру.':'Это короткая команда оператору.'}` : 'Вызови функцию с каждым аргументом. Сравни длину светового импульса.';
  } else if (id === '005') {
    const limit = state.modelSetting === '35' ? 35 : 45;
    controls = `<label class="model-setting">Порог limitC <select id="model-setting"><option value="45" ${limit===45?'selected':''}>45 °C — исходный</option><option value="35" ${limit===35?'selected':''}>35 °C — по регламенту</option></select></label>`;
    visual = `<div class="model-reading"><code>temperature &gt;= ${limit}</code><strong>${hasResult?`${value} °C`: 'Выбери показание'}</strong><span class="model-lamp${hasResult&&value>=limit?' is-on':''}">${hasResult&&value>=limit?'● Охлаждение включено':'○ Охлаждение выключено'}</span></div>`;
    result = hasResult ? `${value} >= ${limit} → ${value>=limit?'true: HIGH':'false: LOW'}. ${value>=35&&value<limit?'Команда запаздывает. По регламенту уже нужно охлаждение — измени порог.':value===35&&limit===35?'На границе условие истинно: знак >= включает и само число 35.':'Сравни результат с регламентом: ниже 35 — выключено, от 35 — включено.'}` : 'Сначала проверь исходный порог, затем выбери 35 °C и испытай все три температуры.';
  } else if (id === '006') {
    const isOr = state.modelSetting === 'or', hot = value===1||value===3, pressed = value>=2;
    const alarm = isOr ? hot||pressed : hot&&pressed;
    controls = `<label class="model-setting">Условие тревоги <select id="model-setting"><option value="and" ${!isOr?'selected':''}>&& — обе причины сразу</option><option value="or" ${isOr?'selected':''}>|| — хотя бы одна причина</option></select></label>`;
    visual = `<div class="model-reading"><code>hot ${isOr?'||':'&amp;&amp;'} pressed</code><strong>${hasResult?`${hot?'40':'25'} °C · кнопка ${pressed?'нажата':'отпущена'}`:'Выбери сочетание входов'}</strong><span class="model-lamp${hasResult&&alarm?' is-on':''}">${hasResult&&alarm?'● Аварийная серия':'○ Тишина'}</span></div><table class="model-truth"><caption>Проверенные сочетания</caption><thead><tr><th>Перегрев</th><th>Кнопка</th><th>Результат</th></tr></thead><tbody>${[0,1,2,3].map(v=>{const h=v===1||v===3,p=v>=2,a=isOr?h||p:h&&p;return `<tr><td>${h?'да':'нет'}</td><td>${p?'нажата':'отпущена'}</td><td>${seen.includes(v)?a?'тревога':'тишина':'ещё не проверено'}</td></tr>`;}).join('')}</tbody></table>`;
    result = hasResult ? `${hot} ${isOr?'||':'&&'} ${pressed} → ${alarm}. ${!isOr&&(hot!==pressed)?'Одна причина есть, а тревоги нет. По протоколу этого недостаточно — попробуй ИЛИ.':alarm?'Устройство должно передать серию из трёх вспышек.':'Нет ни перегрева, ни нажатия. Тишина — правильный результат.'}` : 'Сравни И и ИЛИ. Выбери связку по протоколу и проверь все четыре сочетания.';
  }
  const correctSetting = id==='005'?state.modelSetting==='35':id==='006'?state.modelSetting==='or':true;
  return `<div class="case-model-head"><span>ИСПЫТАНИЕ / ДЕЛО ${id}</span><b>${seen.length} / ${values[id].length} проверок${correctSetting?'':' · исходное условие'}</b></div>${controls}${visual}<div class="case-model-buttons">${values[id].map((v,i)=>`<button type="button" data-model-value="${v}" aria-pressed="${hasResult&&value===v}">${seen.includes(v)?'✓ ':''}${labels[id][i]}</button>`).join('')}</div><p class="case-model-log" role="status">${result}</p>${state.modelDone?'<p class="model-complete">✓ Гипотеза проверена. Теперь исправь программу на плате.</p>':''}`;
}

export function modelMarkup() {
  return '<section class="case-model" id="case-model" aria-label="Интерактивный разбор неисправности"></section>';
}

export function bindModel(id, state, onChange) {
  const host = document.getElementById('case-model');
  if (!host || !values[id]) return;
  const render = () => {
    state.modelDone = modelComplete(id, state.modelSeen, state.modelValue, state.modelSetting);
    host.innerHTML = contents(id, state);
    const next = document.querySelector('#comic-intro [data-story-action]');
    if (next) {
      next.disabled = !state.modelDone;
      next.textContent = state.modelDone ? 'Перейти к ремонту →' : 'Сначала заверши испытание выше';
    }
  };
  host.onclick = event => {
    const button = event.target.closest('[data-model-value]');
    if (!button) return;
    const value = Number(button.dataset.modelValue);
    if (!values[id].includes(value)) return;
    if (!state.modelSeen.includes(value)) state.modelSeen.push(value);
    state.modelValue = value;
    render();
    host.querySelector(`[data-model-value="${value}"]`).focus({preventScroll:true});
    onChange();
  };
  host.onchange = event => {
    if (event.target.id !== 'model-setting') return;
    state.modelSetting = event.target.value;
    state.modelSeen = [];
    render();
    host.querySelector('#model-setting').focus({preventScroll:true});
    onChange();
  };
  render();
}
