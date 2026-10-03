// Short, optional lessons before the ESP32 missions. Exercises never replace
// the learner's device program; only an explicit scaffold action can do that.
const field=(id,label,answer,hint)=>({id,label,answer,hint});
export const espLessons={
  9:{title:'Знакомая программа на новой плате',goal:'Перенесём кнопку и индикатор с Arduino на ESP32.',wiring:[['esp:25','r:1'],['r:2','led:A'],['led:C','esp:GND'],['button:1L','esp:32'],['button:2L','esp:GND']],steps:[
    {title:'GPIO — это номер контакта',text:'На плате написано GPIO25, а в программе нужен просто номер 25. OUTPUT означает выход. GPIO34 — только вход; для светодиода он не подходит.',example:'int ledPin = 25;\npinMode(ledPin, OUTPUT);',note:'Переменные, setup() и loop() работают так же, как на Arduino.',task:'Светодиод перенесли на GPIO26. Допиши его номер и режим.',exercise:'int ledPin = ____;\npinMode(ledPin, ____);',fields:[field('pin','Номер GPIO','26','В коде записываем число без GPIO.'),field('mode','Режим контакта','OUTPUT','Светодиоду нужна команда от платы: это выход.')],success:'Верно: номер в коде совпадает с контактом на схеме, OUTPUT позволяет управлять светом.'},
    {title:'Почему нажатие даёт LOW',text:'INPUT_PULLUP подтягивает вход к высокому уровню. Отпущенная кнопка даёт HIGH. Нажатая соединяет вход с GND и даёт LOW. Возьмём GPIO32, чтобы использовать встроенную подтяжку.',example:'pinMode(buttonPin, INPUT_PULLUP);\nbool pressed = digitalRead(buttonPin) == LOW;',task:'Допиши режим кнопки и уровень при нажатии.',exercise:'pinMode(buttonPin, ____);\nbool pressed = digitalRead(buttonPin) == ____;',fields:[field('mode','Режим кнопки','INPUT_PULLUP','Нужна подтяжка входа: INPUT_PULLUP.'),field('level','Уровень при нажатии','LOW','Нажатие соединяет GPIO с GND. На входе низкий уровень.')],success:'Да. Здесь LOW означает нажатую кнопку, потому что она замыкает вход на землю.'},
    {title:'Условие управляет выходом',text:'Читай кнопку внутри loop(), чтобы замечать каждое изменение. Условие выбирает команду: при нажатии HIGH, иначе LOW. В конце loop() достаточно короткой паузы.',example:'if (pressed) {\n  digitalWrite(ledPin, HIGH);\n} else {\n  digitalWrite(ledPin, LOW);\n}',task:'Какую команду отправляем индикатору в каждой ветке?',exercise:'if (pressed) digitalWrite(ledPin, ____);\nelse digitalWrite(ledPin, ____);',fields:[field('on','Когда кнопка нажата','HIGH','Включение выхода — HIGH.'),field('off','Когда отпущена','LOW','Выключение выхода — LOW.')],success:'Теперь перенеси это условие в каркас программы и проверь нажатие и отпускание.'}
  ]},
  10:{title:'Из показания — в действие',goal:'Научимся измерять батарею и задавать мощность привода.',wiring:[['battery:VCC','esp:3V3'],['battery:GND','esp:GND'],['battery:OUT','esp:34'],['driver:VCC','esp:3V3'],['driver:GND','esp:GND'],['driver:PWM','esp:25']],steps:[
    {title:'АЦП возвращает число',text:'analogRead() читает аналоговый вход. На этом стенде значение меняется от 0 до 4095. Это ещё не вольты. float сохраняет дробную часть: для 2234 расчёт даст примерно 3,60 В.',example:'int raw = analogRead(batteryPin);\nfloat batteryV = raw * 3.3 / 4095.0 * 2;',note:'Модуль стенда делит напряжение пополам, поэтому в конце умножаем на 2. Это модельное измерение; реальный АЦП требует настройки и калибровки.',task:'Допиши максимум АЦП и множитель делителя.',exercise:'float batteryV = raw * 3.3 / ____ * ____;',fields:[field('max','Максимум АЦП','4095.0','12 бит — это 4096 значений: от 0 до 4095.'),field('divider','Восстановить напряжение батареи','2','На вход приходит половина напряжения. Умножь её на 2.')],success:'Показание преобразовано в напряжение батареи. Считывай его в каждом loop(), иначе не заметишь разряд.'},
    {title:'ШИМ регулирует мощность',text:'digitalWrite() умеет только включить или выключить. Для мощности используем ШИМ: ledcAttach() настраивает выход один раз в setup(), ledcWrite() меняет значение в loop(). При 8 битах диапазон — 0–255.',example:'// setup(): GPIO, частота, число бит\nledcAttach(motorPin, 4000, 8);\n// loop(): GPIO, мощность\nledcWrite(motorPin, 180);',task:'Настрой 8 бит и задай остановку привода.',exercise:'ledcAttach(motorPin, 4000, ____);\nledcWrite(motorPin, ____);',fields:[field('bits','Число бит','8','В задании выбран диапазон 0–255: 8 бит.'),field('stop','Мощность при остановке','0','Остановка — нулевая мощность, а не LOW в настройке частоты.')],success:'Верно. Настройку делаем один раз, мощность меняем при каждой проверке условий.'},
    {title:'Защита проверяет границу',text:'Разрешение действует начиная с 3,6 В, включая ровно 3,6 В. Ниже порога привод должен остановиться. Поэтому сравнение использует >=, а не >.',example:'if (batteryV >= 3.6) {\n  ledcWrite(motorPin, 180);\n} else {\n  ledcWrite(motorPin, 0);\n}',task:'Заполни сравнение и мощность при достаточном заряде.',exercise:'if (batteryV ____ 3.6)\n  ledcWrite(motorPin, ____);',fields:[field('compare','Оператор сравнения','>=','Ровно 3,6 В тоже разрешает запуск: больше ИЛИ равно.'),field('power','Рабочая мощность','180','В требованиях этого устройства указана мощность 180 из 255.')],success:'Проверь на устройстве два направления: разряд выключает привод, заряд снова разрешает работу.'}
  ]},
  11:{title:'Как программа слышит два датчика',goal:'Разберём общую шину и условие безопасности.',wiring:[['imu:VCC','esp:3V3'],['imu:GND','esp:GND'],['imu:SDA','esp:21'],['imu:SCL','esp:22'],['range:VCC','esp:3V3'],['range:GND','esp:GND'],['range:SDA','esp:21'],['range:SCL','esp:22'],['driver:VCC','esp:3V3'],['driver:GND','esp:GND'],['driver:PWM','esp:25']],steps:[
    {title:'Общая шина I²C',text:'I²C использует две сигнальные линии: SDA передаёт данные, SCL задаёт такт. Оба датчика подключаем к тем же линиям. Адреса 0x68 и 0x29 позволяют различать устройства.',example:'#include <Wire.h>\n// setup(): сначала SDA, затем SCL\nWire.begin(21, 22);',note:'На нашем стенде учебные драйверы читают данные через readTilt() и readDistance(). Эти функции предоставляет NexoraModules.h.',task:'SDA подключён к GPIO21, SCL — к GPIO22. Допиши начало шины.',exercise:'Wire.begin(____, ____);',fields:[field('sda','GPIO для SDA','21','Первый аргумент Wire.begin — SDA, по нашей схеме GPIO21.'),field('scl','GPIO для SCL','22','Второй аргумент — SCL, по нашей схеме GPIO22.')],success:'Один Wire.begin запускает общую шину для обоих модулей. Питание и GND нужны каждому.'},
    {title:'Считываем оба значения',text:'Сначала сохрани показания в переменные. readTilt() возвращает градусы, readDistance() — сантиметры. Читай оба значения в loop(), чтобы условие использовало текущую ситуацию.',example:'float tilt = readTilt();\nfloat distance = readDistance();',task:'Подставь функции без скобок: скобки уже есть в примере.',exercise:'float tilt = ____();\nfloat distance = ____();',fields:[field('tilt','Функция наклона','readTilt','Угол читает readTilt. Не меняй её на readDistance.'),field('distance','Функция расстояния','readDistance','Сантиметры читает readDistance.')],success:'Угол и расстояние хранятся отдельно. Теперь их можно совместно проверить.'},
    {title:'Должны выполняться все условия',text:'Нужно одновременно свободное пространство и допустимый наклон. && означает «И». || разрешило бы движение даже тогда, когда прошла только одна проверка. Не забудь отрицательную границу.',example:'bool safe = distance >= 80\n  && tilt >= -15 && tilt <= 15;',task:'Допиши оператор «И» и обе границы угла.',exercise:'bool safe = distance >= 80 ____\n  tilt >= ____ && tilt <= ____;',fields:[field('and','Связь условий','&&','Разрешаем только когда прошли все проверки: &&.'),field('min','Нижняя граница наклона','-15','Проверяем также отрицательный угол: от −15°.'),field('max','Верхняя граница наклона','15','До +15° включительно.')],success:'Передай safe в if/else и задай ШИМ 180 или 0. Пауза не больше 100 мс позволяет вовремя заметить препятствие.'}
  ]},
  12:{title:'Одна команда — три снимка',goal:'Разберём камеру, новое нажатие и порядок съёмки.',wiring:[['button:1L','esp:32'],['button:2L','esp:GND'],['camera:VCC','esp:3V3'],['camera:GND','esp:GND'],['camera:SCK','esp:18'],['camera:MISO','esp:19'],['camera:MOSI','esp:23'],['camera:CS','esp:5'],['servo:V+','esp:5V'],['servo:GND','esp:GND'],['servo:SIG','esp:26']],steps:[
    {title:'Камера и привод — разные устройства',text:'SPI-камера использует SCK, MISO, MOSI и отдельный CS. На стенде это GPIO18, 19, 23 и 5. cameraBegin() получает номер CS. Сервопривод отдельно получает угол через свой сигнальный GPIO26.',example:'// setup(): контакт выбора камеры\ncameraBegin(5);\n// поворот камеры на средний угол\nservoWrite(26, 90);',note:'cameraBegin, servoWrite и cameraCapture — команды учебных драйверов NexoraModules.h. На настоящем оборудовании используются библиотеки конкретных модулей.',task:'Камеру выбрали через GPIO5, сервопривод подключили к GPIO26.',exercise:'cameraBegin(____);\nservoWrite(____, 90);',fields:[field('cs','GPIO для CS','5','CS — отдельный контакт GPIO5, а не номер линии SCK.'),field('servo','Сигнальный GPIO сервопривода','26','V+ подаёт питание, а управление приходит на SIG от GPIO26.')],success:'Питание камеры — 3,3 В, сервопривода стенда — 5 В. Земля у устройств общая.'},
    {title:'Нажатие отличается от удержания',text:'wasPressed хранит состояние с прошлого прохода loop(). Новое нажатие есть только когда сейчас нажато, а раньше не было нажато. ! означает «НЕ». После обработки сохраняем текущее состояние.',example:'bool wasPressed = false; // вне loop()\n// внутри loop():\nbool pressed = digitalRead(buttonPin) == LOW;\nif (pressed && !wasPressed) {\n  // одна серия снимков\n}\nwasPressed = pressed;',task:'Допиши проверку нового нажатия и сохранение состояния.',exercise:'if (pressed && ____) { /* съёмка */ }\nwasPressed = ____;',fields:[field('edge','Раньше кнопка не была нажата','!wasPressed','Используем отрицание прошлого состояния: !wasPressed.'),field('save','Состояние для следующего loop()','pressed','Сохраняем текущее состояние, чтобы удержание не стало новым нажатием.')],success:'Теперь серия запускается один раз. Отпускание обновляет память и позволяет принять следующее нажатие.'},
    {title:'Поворот → ожидание → снимок',text:'Массив задаёт углы 45, 90 и 135. Цикл посещает каждый угол. После поворота сервоприводу нужно 200 мс, иначе камера снимет прежнее направление. Последовательность важнее скорости.',example:'for (int i = 0; i < 3; i++) {\n  servoWrite(servoPin, angles[i]);\n  delay(200);\n  cameraCapture();\n}',task:'Допиши текущий угол из массива и выдержку перед кадром.',exercise:'servoWrite(servoPin, ____);\ndelay(____);\ncameraCapture();',fields:[field('angle','Текущий элемент массива','angles[i]','Цикл меняет i; элемент массива записывается angles[i].'),field('wait','Выдержка, мс','200','В задании сервоприводу нужно 200 мс после каждого поворота.')],success:'Собери цикл в каркасе. Проверь три кадра на одно нажатие и отсутствие новых кадров при удержании.'}
  ]}
};

const compact=value=>String(value).replace(/\s+/g,'').replace(/−/g,'-');
export function acceptsAnswer(field,value){
  const a=compact(field.answer),v=compact(value);
  if(/^[-\d.]+$/.test(a))return v!==''&&/^[-\d.]+$/.test(v)&&Number(v)===Number(a);
  return v===a;
}
export function normalizeLearning(index,saved){
  const lesson=espLessons[index],count=lesson?.steps.length||0;
  const solved=Array.from({length:count},(_,i)=>saved?.version===1&&saved?.solved?.[i]===true);
  const step=Number.isInteger(saved?.step)?Math.max(0,Math.min(count-1,saved.step)):0;
  return {version:1,step:Math.max(0,step),solved,collapsed:saved?.version===1&&saved.collapsed===true};
}
const element=(tag,properties={})=>Object.assign(document.createElement(tag),properties);
const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function sample(source){
  const pre=element('pre',{className:'esp-lesson-code'});
  pre.innerHTML=source.split(/(\/\/[^\n]*|\b(?:int|float|bool|void|if|else|for|true|false|OUTPUT|INPUT_PULLUP|HIGH|LOW)\b|\b\d+(?:\.\d+)?\b|____)/g).map(token=>/^\/\//.test(token)?`<span class="code-comment">${escape(token)}</span>`:/^\d/.test(token)?`<span class="code-number">${token}</span>`:/^____$/.test(token)?'<span class="code-blank">____</span>':/^(int|float|bool|void|if|else|for|true|false|OUTPUT|INPUT_PULLUP|HIGH|LOW)$/.test(token)?`<span class="code-keyword">${token}</span>`:escape(token)).join('');
  return pre;
}
export function createEspLearning({mount,index,saved,onChange=()=>{},onScaffold=()=>{},onShowWiring=()=>{}}){
  const lesson=espLessons[index];if(!lesson)return null;
  let state=normalizeLearning(index,saved),disabled=false;
  const root=element('section',{className:'esp-learning',ariaLabel:'Обучение с Маей'});mount.append(root);
  const changed=()=>onChange();
  function render(){
    root.replaceChildren();
    const done=state.solved.filter(Boolean).length;
    const heading=element('button',{type:'button',className:'esp-learning-toggle',textContent:`Мая · разберём вместе ${done}/${lesson.steps.length}`});heading.setAttribute('aria-expanded',String(!state.collapsed));heading.onclick=()=>{state.collapsed=!state.collapsed;render();changed();};root.append(heading);
    if(state.collapsed)return;
    const body=element('div',{className:'esp-lesson-body'});root.append(body);
    body.append(element('p',{className:'esp-lesson-goal',textContent:lesson.goal}));
    const nav=element('nav',{className:'esp-lesson-nav',ariaLabel:'Шаги обучения'});body.append(nav);
    lesson.steps.forEach((step,i)=>{const button=element('button',{type:'button',textContent:`${state.solved[i]?'✓':i+1} ${step.title}`,disabled});button.dataset.lessonStep=i;button.setAttribute('aria-current',i===state.step?'step':'false');button.onclick=()=>{state.step=i;render();changed();};nav.append(button);});
    const step=lesson.steps[state.step];
    body.append(element('h3',{className:'esp-lesson-title',textContent:step.title}),element('p',{textContent:step.text}),sample(step.example));
    if(step.note)body.append(element('p',{className:'esp-lesson-note',textContent:step.note}));
    const form=element('form',{className:'esp-lesson-exercise'});body.append(form);
    form.append(element('p',{textContent:step.task}),sample(step.exercise));
    const feedback=element('p',{className:'esp-lesson-feedback',role:'status'}),fields=element('div',{className:'esp-lesson-fields'});form.append(fields);
    step.fields.forEach(field=>{
      const label=element('label',{textContent:field.label}),input=element('input',{type:'text',name:field.id,disabled,autocomplete:'off',spellcheck:false});
      input.dataset.lessonField=field.id;input.maxLength=60;input.setAttribute('aria-label',field.label);if(state.solved[state.step])input.value=field.answer;
      label.append(input);fields.append(label);
    });
    const submit=element('button',{type:'submit',className:'accent',textContent:'Проверить ответ',disabled});form.append(submit,feedback);
    const next=element('button',{type:'button',className:'esp-lesson-next',textContent:state.step===lesson.steps.length-1?'К устройству →':'Следующий шаг →',disabled:disabled||!state.solved[state.step]});body.append(next);
    if(state.solved[state.step]){feedback.textContent=step.success;feedback.classList.add('success');}
    form.onsubmit=event=>{
      event.preventDefault();if(disabled)return;
      let issue=null;
      for(const field of step.fields){const input=form.elements.namedItem(field.id),valid=acceptsAnswer(field,input.value);input.setAttribute('aria-invalid',String(!valid));if(!valid&&!issue)issue={field,input};}
      if(issue){feedback.textContent=issue.field.hint;feedback.className='esp-lesson-feedback error';issue.input.focus();return;}
      state.solved[state.step]=true;feedback.textContent=step.success;feedback.className='esp-lesson-feedback success';next.disabled=false;changed();
    };
    next.onclick=()=>{if(state.step<lesson.steps.length-1)state.step++;else state.collapsed=true;render();changed();};
    const actions=element('div',{className:'esp-lesson-actions'});
    const scaffold=element('button',{type:'button',textContent:'Вернуть учебный каркас',disabled});scaffold.onclick=onScaffold;
    const wiring=element('button',{type:'button',textContent:'Разобрать соединения',disabled});wiring.onclick=onShowWiring;
    actions.append(wiring,scaffold);body.append(actions);
    body.append(element('p',{className:'esp-lesson-note',textContent:'Урок можно свернуть и вернуться к нему позже. Ответы здесь помогают разобраться; устройство проверяется отдельно на твоей схеме.'}));
  }
  render();
  return {snapshot:()=>structuredClone(state),setDisabled:value=>{disabled=value;root.querySelectorAll('input,button').forEach(node=>{if(node.classList.contains('esp-learning-toggle'))return;node.disabled=value||(node.classList.contains('esp-lesson-next')&&!state.solved[state.step]);});},destroy:()=>root.remove()};
}
