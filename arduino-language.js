import { cppLanguage } from '@codemirror/lang-cpp';

export const arduinoWords = [
  ['pinMode', 'function', 'pinMode(контакт, режим)', 'Задаёт режим контакта: OUTPUT — выход, INPUT_PULLUP — вход с подтяжкой.', 'pinMode(${pin}, ${OUTPUT})'],
  ['digitalWrite', 'function', 'digitalWrite(контакт, уровень)', 'HIGH включает высокий уровень на выходе, LOW — низкий.', 'digitalWrite(${pin}, ${HIGH})'],
  ['digitalRead', 'function', 'digitalRead(контакт)', 'Читает HIGH или LOW на входе. При INPUT_PULLUP нажатая кнопка даёт LOW.', 'digitalRead(${pin})'],
  ['delay', 'function', 'delay(миллисекунды)', 'Пауза в миллисекундах. 1000 мс = 1 секунда.', 'delay(${500})'],
  ['millis', 'function', 'millis()', 'Количество миллисекунд с запуска программы. Храни в unsigned long.', 'millis()'],
  ['setup', 'function', 'void setup()', 'Выполняется один раз после запуска платы.', 'void setup() {\n  ${}\n}'],
  ['loop', 'function', 'void loop()', 'Плата повторяет эти команды снова и снова.', 'void loop() {\n  ${}\n}'],
  ['HIGH', 'constant', 'высокий уровень', 'Высокий логический уровень на цифровом контакте.'],
  ['LOW', 'constant', 'низкий уровень', 'Низкий логический уровень на цифровом контакте.'],
  ['OUTPUT', 'constant', 'режим выхода', 'Контакт отправляет сигнал устройству.'],
  ['INPUT', 'constant', 'режим входа', 'Контакт считывает внешний сигнал.'],
  ['INPUT_PULLUP', 'constant', 'вход с подтяжкой', 'Отпущенная кнопка: HIGH. Кнопка соединяет вход с GND: LOW.'],
  ['LED_BUILTIN', 'constant', 'встроенный светодиод', 'Номер контакта встроенного светодиода. У Arduino Uno это 13.'],
  ['int', 'type', 'целое число', 'Например: int ledPin = 13;'],
  ['bool', 'type', 'true или false', 'Логическое значение: да или нет.'],
  ['float', 'type', 'дробное число', 'Например: float value = 2.5;'],
  ['char', 'type', 'один символ', "Например: char letter = 'A';"],
  ['byte', 'type', 'число от 0 до 255', 'Небольшое целое число без знака.'],
  ['long', 'type', 'большое целое число', 'Для длинных интервалов часто используют unsigned long.'],
  ['unsigned', 'keyword', 'без знака', 'Число не может быть отрицательным.'],
  ['const', 'keyword', 'неизменяемое значение', 'Например: const int ledPin = 13;'],
  ['void', 'type', 'без результата', 'Функция выполняет команды, но не возвращает значение.'],
  ['true', 'constant', 'истина', 'Условие выполнено.'],
  ['false', 'constant', 'ложь', 'Условие не выполнено.'],
  ['if', 'keyword', 'условие', 'Выполнить команды, если условие истинно.', 'if (${condition}) {\n  ${}\n}'],
  ['ifelse', 'keyword', 'две ветки if / else', 'Выбрать одно из двух действий.', 'if (${condition}) {\n  ${}\n} else {\n  ${}\n}'],
  ['else', 'keyword', 'иначе', 'Выполняется, когда условие if ложно.', 'else {\n  ${}\n}'],
  ['for', 'keyword', 'повторение со счётчиком', 'i начинается с 0; цикл повторяется, пока условие истинно.', 'for (int ${i} = 0; ${i} < ${3}; ${i}++) {\n  ${}\n}'],
  ['while', 'keyword', 'повторение по условию', 'Повторять команды, пока условие истинно.', 'while (${condition}) {\n  ${}\n}'],
  ['return', 'keyword', 'вернуть результат', 'Завершает функцию. Может передать значение вызывающему коду.'],
  ['Serial', 'variable', 'сообщения платы', 'Serial.begin задаёт скорость, Serial.println выводит сообщение.'],
];

export const serialWords = [
  ['begin', 'function', 'begin(скорость)', 'Открывает обмен сообщениями. Например: Serial.begin(9600);', 'begin(${9600})'],
  ['println', 'function', 'println(значение)', 'Выводит значение и переводит строку в сообщениях платы.', 'println(${value})'],
  ['print', 'function', 'print(значение)', 'Выводит значение без перевода строки.', 'print(${value})'],
];

// Keep positions unchanged while ignoring comments and quoted text.
export function maskText(source) {
  return source.replace(/\/\*[\s\S]*?(?:\*\/|$)|\/\/[^\n]*|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'/g, text => text.replace(/[^\n]/g, ' '));
}

export function sketchSymbols(source) {
  const masked = maskText(source);
  const symbols = new Map();
  const declarations = /\b(?:const\s+)?(?:unsigned\s+)?(?:int|bool|float|double|char|byte|long|short|String|void|u?int(?:8|16|32)_t)\s+[*&\s]*([A-Za-z_]\w*)/g;
  for (const match of masked.matchAll(declarations)) {
    const name = match[1];
    const tail = masked.slice(match.index + match[0].length);
    symbols.set(name, { label: name, type: /^\s*\(/.test(tail) ? 'function' : 'variable', detail: 'из твоей программы', info: 'Имя, объявленное в текущем коде.' });
  }
  for (const match of masked.matchAll(/^\s*#define\s+(\w+)/gm)) symbols.set(match[1], { label: match[1], type: 'constant', detail: 'из #define' });
  return [...symbols.values()];
}

function distance(a, b) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}

function oneSwapAway(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length - 1; i++) {
    if (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(0, i) === b.slice(0, i) && a.slice(i + 2) === b.slice(i + 2)) return true;
  }
  return false;
}

export function analyzeSketch(source) {
  const diagnostics = [];
  const tree = cppLanguage.parser.parse(source);
  const masked = maskText(source);
  const max = source.length;
  const add = (from, to, message, severity = 'error') => diagnostics.push({ from: Math.max(0, Math.min(from, max)), to: Math.max(0, Math.min(to, max)), severity, message, source: 'Проверка при вводе' });
  const stack = [];
  const pairs = { ')': '(', ']': '[', '}': '{' };
  for (let i = 0; i < masked.length; i++) {
    const ch = masked[i];
    if ('([{'.includes(ch)) stack.push({ ch, i });
    else if (pairs[ch]) {
      if (stack.at(-1)?.ch === pairs[ch]) stack.pop();
      else add(i, i + 1, `Для «${ch}» нет парной открывающей скобки. Проверь порядок скобок.`);
    }
  }
  for (const { ch, i } of stack) add(i, i + 1, `Не закрыта скобка «${ch}». Добавь «${{ '(': ')', '[': ']', '{': '}' }[ch]}».`);
  const symbols = sketchSymbols(source);
  const known = new Set([...arduinoWords.map(w => w[0]), ...serialWords.map(w => w[0]), ...symbols.map(s => s.label)]);
  tree.iterate({ enter(node) {
    if (diagnostics.length >= 15) return false;
    if (node.type.isError && !stack.length) {
      const before = masked.slice(0, node.from).trimEnd();
      const after = masked.slice(node.from);
      const missingSemicolon = /[\w)\]]$/.test(before) && (/^\s*(?:void|int|bool|float|const|digitalWrite|delay|pinMode)\b/.test(after) || node.from === max);
      const from = node.from === node.to ? Math.max(0, before.length - 1) : node.from;
      add(from, Math.max(from + 1, node.to), missingSemicolon ? 'Возможно, пропущена точка с запятой ; после команды.' : 'Проверь запись рядом: скобки, запятую между аргументами и ; после команды.');
    }
    if (node.name === 'Identifier') {
      const word = source.slice(node.from, node.to);
      if (known.has(word) || word.length < 3) return;
      const candidate = [...known].find(name => name.length >= 3 && Math.abs(name.length - word.length) <= 1 && (distance(name, word) === 1 || oneSwapAway(name, word)));
      if (candidate) add(node.from, node.to, `Возможно, опечатка: «${word}». Ты имела в виду «${candidate}»? Регистр букв важен.`, 'warning');
    }
  }});
  const seen = new Set();
  return diagnostics.filter(d => { const key = `${d.from}:${d.to}:${d.message}`; if (seen.has(key)) return false; seen.add(key); return true; }).sort((a, b) => a.from - b.from).slice(0, 15);
}

function explainCompiler(message) {
  const unknown = message.match(/['‘]([^'’]+)['’] was not declared/);
  if (unknown) return `Имя «${unknown[1]}» не объявлено. Проверь написание или создай переменную до её использования.`;
  if (/expected ['‘];['’]/.test(message)) return 'Пропущена точка с запятой ; после команды.';
  if (/expected ['‘]}['’]/.test(message)) return 'Не хватает закрывающей фигурной скобки }.';
  if (/expected ['‘]\)['’]/.test(message)) return 'Не хватает закрывающей круглой скобки ).';
  if (/too few arguments/.test(message)) return 'Передано слишком мало аргументов. Посмотри подсказку к функции.';
  if (/too many arguments/.test(message)) return 'Передано слишком много аргументов. Посмотри подсказку к функции.';
  if (/redefinition/.test(message)) return 'Это имя уже объявлено. Удали повторное объявление или выбери другое имя.';
  if (/invalid conversion|cannot convert/.test(message)) return 'Тип значения не подходит. Проверь тип переменной и аргументы функции.';
  return message;
}

export function compilerDiagnostics(source, output) {
  const lines = source.split('\n');
  const starts = []; let offset = 0;
  for (const line of lines) { starts.push(offset); offset += line.length + 1; }
  const diagnostics = [];
  for (const match of output.matchAll(/(?:sketch\.ino|HorangFirmware\.cpp):(\d+):(\d+):\s*(?:fatal )?(error|warning):\s*([^\n]+)/g)) {
    const index = Math.max(0, Math.min(lines.length - 1, Number(match[1]) - 1));
    const column = Math.max(0, Math.min(lines[index].length, Number(match[2]) - 1));
    const from = starts[index] + column;
    const word = source.slice(from).match(/^\w+/)?.[0] || '';
    diagnostics.push({ from, to: Math.min(source.length, from + Math.max(1, word.length)), severity: match[3], source: 'Компилятор Arduino', message: explainCompiler(match[4]) });
  }
  return diagnostics.slice(0, 15);
}
