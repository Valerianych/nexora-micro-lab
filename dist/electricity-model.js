// Small DC teaching model, separate from the AVR emulator. Approximate LED
// forward voltage: 2 V; lesson current limit: 20 mA. No breakdown/thermal model.
export const electricityExperiments = [
  {
    title:'Куда возвращается ток?', short:'Замкнутая цепь',
    mission:'На маяке есть питание, но обратный провод отсоединён. Сравни разрыв, соединение с 5V и соединение с GND.',
    required:['open','5v','gnd'], labels:['разрыв','возврат к 5V','возврат к GND'],
    question:'Почему в этом опыте свет появляется при соединении с GND?',
    answers:['GND добавляет ещё 5 вольт.','Есть замкнутый путь через светодиод и разность напряжений.','Название GND включает светодиод в программе.'], correct:1,
    explanation:'GND — общая точка отсчёта 0 В и обратный путь к источнику. Ток не исчезает в GND: цепь должна быть замкнута. При соединении обоих концов с 5V разность напряжений равна нулю.'
  },
  {
    title:'Имеет ли значение порядок?', short:'Полярность и последовательность',
    mission:'Теперь цепь замкнута. Переверни светодиод, затем сравни резистор перед ним и после него.',
    required:['reverse','before','after'], labels:['LED наоборот','резистор перед LED','резистор после LED'],
    question:'Какие две схемы могут одинаково защитить светодиод?',
    answers:['Резистор последовательно перед LED или после LED.','Только резистор перед LED.','Резистор рядом с платой, без соединений.'], correct:0,
    explanation:'В одной последовательной ветви через резистор и LED проходит один и тот же ток. Поэтому резистор можно поставить с любой стороны LED и поменять его выводы 1/2 местами. У LED полярность есть: A — анод, C — катод.'
  },
  {
    title:'Почему именно резистор?', short:'Напряжение, ток и сопротивление',
    mission:'Сравни перемычку без резистора, 220 Ом и 1000 Ом. Смотри одновременно на ток и яркость.',
    required:['0','220','1000'], labels:['без резистора','220 Ом','1000 Ом'],
    question:'Что изменится, если заменить 220 Ом на 1000 Ом?',
    answers:['Ток станет больше.','Ток не изменится: питание всё ещё 5 В.','Ток уменьшится, свет станет слабее.'], correct:2,
    explanation:'Напряжение — разность электрических потенциалов, ток — движение заряда, сопротивление ограничивает ток. При одинаковом напряжении большее сопротивление даёт меньший ток. В опыте 220 Ом дают около 13,6 мА, а 1000 Ом — 3 мА.'
  },
  {
    title:'Питание или команда?', short:'Выход Arduino и код',
    mission:'Программа меняет только D13. Попробуй подключить готовую цепь к 5V, D12 и D13. В каждом опыте проверяются HIGH и LOW.',
    required:['5v','d12','d13'], labels:['питание 5V','выход D12','выход D13'],
    question:'Зачем подключать цепь к D13, если питание 5V тоже зажигает LED?',
    answers:['Питание 5V само повторяет все команды digitalWrite.','D13 меняет уровень по программе; 5V даёт постоянное питание.','На D13 встроен резистор для внешнего LED.'], correct:1,
    explanation:'Номер в ledPin связывает код с физическим выводом. 5V — постоянное питание, а D13 в режиме OUTPUT — управляемый выход. D12 здесь не настроен как выход. Если выбрать другой цифровой вывод, нужно изменить и провод, и номер в коде.'
  }
];

export const defaultElectricitySettings = () => [
  {returnTo:'open'}, {forward:false,placement:'before'}, {resistance:0}, {source:'5v'}
];

export function observeElectricity(index, settings = {}) {
  const config = {source:'5v', returnTo:'gnd', forward:true, placement:'before', resistance:220, ...settings};
  if (index === 3) config.source = ['5v','d12','d13'].includes(settings.source) ? settings.source : '5v';
  const voltage = config.returnTo === '5v' ? 0 : config.source === 'd12' ? null : 5;
  const key = index === 0 ? config.returnTo : index === 1 ? config.forward ? config.placement : 'reverse' : index === 2 ? String(config.resistance) : config.source;
  const base = {key,config,voltage,currentMa:0,status:'off',onHigh:false,onLow:false};
  if (config.returnTo === 'open') return {...base,headline:'Питание есть, пути нет.',message:'Обратный провод оборван. Заряд не может непрерывно двигаться по этой ветви: ток 0 мА, светодиод погашен.'};
  if (voltage === 0) return {...base,headline:'Два конца на одном уровне.',message:'Оба конца ветви подключены к 5V. Разность напряжений 5 − 5 = 0 В: ток не течёт, даже если провода соединены.'};
  if (!config.forward) return {...base,headline:'LED развёрнут против направления.',message:'В этом низковольтном опыте LED не проводит ток в обратном направлении. Обозначения A (+) и C (−) нельзя менять местами, как выводы резистора.'};
  if (config.source === 'd12') return {...base,headline:'Код управляет другим выводом.',message:'Программа настроила D13, а не D12. D12 здесь остаётся входом с высоким сопротивлением: управляемого питания для LED нет.'};
  if (config.resistance === 0) return {...base,status:'unsafe',currentMa:null,headline:'Ток ничем не ограничен.',message:'Перемычка не заменяет резистор. Такая схема может повредить LED и вывод платы. Учебная модель показывает перегрузку и не рассчитывает ток короткого замыкания.'};
  const currentMa = (5 - 2) / config.resistance * 1000;
  const onLow = config.source === '5v';
  const message = index === 3
    ? onLow ? 'Команда для D13 стала LOW, но на контакте 5V по-прежнему 5 В. LED горит в обеих фазах: программа не управляет этим питанием.' : 'При HIGH на D13 около 5 В: LED светится. При LOW около 0 В: ток прекращается. Цепь повторяет команды программы.'
    : index === 0 ? 'Между питанием 5V и GND есть разность 5 В. Обратный провод замкнул путь через LED и резистор: ток появился. GND соединён с источником внутри платы.'
    : index === 1 ? `LED включён правильно, резистор стоит ${config.placement === 'before' ? 'перед ним' : 'после него'}. Ток одинаков во всей последовательной ветви — около 13,6 мА.`
    : `На резисторе примерно 5 − 2 = 3 В. При ${config.resistance} Ом ток около ${currentMa.toLocaleString('ru-RU',{maximumFractionDigits:1})} мА.${config.resistance >= 1000 ? ' Свет слабее, чем с 220 Ом.' : ''}`;
  return {...base,currentMa,status:currentMa > 20 ? 'unsafe':'on',onHigh:true,onLow,headline:currentMa > 20 ? 'Ток выше учебного предела 20 мА.' : index === 3 ? onLow ? 'Свет горит постоянно.' : 'Свет подчиняется программе.' : 'Замкнутая цепь работает.',message};
}

export function hasElectricityEvidence(index, seen) {
  return electricityExperiments[index].required.every(key=>seen?.includes(key));
}

export function normalizeElectricity(saved) {
  const defaults = defaultElectricitySettings();
  const allowed = [{returnTo:['open','5v','gnd']},{forward:[true,false],placement:['before','after']},{resistance:[0,100,220,1000]},{source:['5v','d12','d13']}];
  const settings = defaults.map((item,i)=>Object.fromEntries(Object.entries(item).map(([key,value])=>[key,allowed[i][key].includes(saved?.settings?.[i]?.[key])?saved.settings[i][key]:value])));
  const seen = electricityExperiments.map((item,i)=>[...new Set((Array.isArray(saved?.seen?.[i])?saved.seen[i]:[]).filter(x=>item.required.includes(x)))]);
  const solved = electricityExperiments.map((item,i)=>saved?.solved?.[i]===true&&hasElectricityEvidence(i,seen[i]));
  // A saved completion never unlocks a gap in the learning sequence.
  for(let i=1;i<solved.length;i++) if(!solved[i-1])solved[i]=false;
  const reached=solved.every(Boolean)?4:solved.findIndex(value=>!value);
  return {version:1,page:Number.isInteger(saved?.page)?Math.max(0,Math.min(saved.page,reached)):0,settings,seen,solved};
}
