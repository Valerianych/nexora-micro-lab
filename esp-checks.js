import {EspRuntime} from './esp-runtime.js';
import {inspectEsp} from './esp-hardware.js';

export async function checkEsp({source,wires,mission,onProgress=()=>{},yieldTask=()=>Promise.resolve()}){
  const electrical=inspectEsp(wires,mission.parts);
  if(electrical.problems.length)throw Error(electrical.problems.join('\n'));
  const reports=[];
  const assert=(condition,message)=>{if(!condition)throw Error(message);};
  const fresh=inputs=>new EspRuntime(source,wires,mission.parts,inputs);
  const advance=async(runtime,ms)=>{for(let left=ms;left>0;left-=50){runtime.advance(Math.min(50,left));await yieldTask();}return runtime.snapshot();};
  const report=message=>{reports.push(message);onProgress(message);};
  const pwmCorrect=runtime=>{const state=runtime.snapshot();return state.driverPin!==null&&runtime.pwm.get(state.driverPin)?.freq===4000&&runtime.pwm.get(state.driverPin)?.bits===8;};
  if(mission.index===9){
    const runtime=fresh();
    for(const pressed of [false,true,false,true,false]){
      runtime.setInputs({button:pressed});const s=await advance(runtime,100);
      assert(s.led===pressed,pressed?'Кнопка нажата, индикатор не включён.':'Кнопка отпущена, индикатор должен быть выключен.');
    }
    assert(runtime.access.has('digitalRead'),'Программа должна читать состояние входа кнопки.');report('Пять последовательных нажатий и отпусканий пройдены.');
  }else if(mission.index===10){
    const runtime=fresh();
    for(const voltage of [3.4,3.59,3.6,4.1,3.5,3.8]){
      runtime.setInputs({battery:voltage});const s=await advance(runtime,100),expected=voltage>=3.6?180:0;
      assert(s.motor===expected,`При ${voltage} В мощность ${s.motor}; требуется ${expected}.`);
      report(`${voltage} В → мощность ${expected}: верно.`);
    }
    assert(pwmCorrect(runtime),'Для драйвера требуются ШИМ 4000 Гц и разрядность 8 бит.');assert(runtime.access.has('analogRead'),'Напряжение должно считываться с АЦП.');
  }else if(mission.index===11){
    const runtime=fresh();
    for(const [distance,tilt] of [[120,0],[80,15],[80,-15],[79,0],[120,16],[120,-16],[120,0],[20,20],[90,2]]){
      runtime.setInputs({distance,tilt});const s=await advance(runtime,100),expected=distance>=80&&Math.abs(tilt)<=15?180:0;
      assert(s.motor===expected,`Расстояние ${distance} см, наклон ${tilt}°: за 100 мс привод должен перейти на ${expected}, сейчас ${s.motor}.`);
      report(`${distance} см / ${tilt}° → ${expected}: верно.`);
    }
    assert(pwmCorrect(runtime),'Драйвер должен получать ШИМ 4000 Гц / 8 бит.');assert(runtime.access.has('readTilt')&&runtime.access.has('readDistance'),'Нужны показания обоих датчиков.');
  }else if(mission.index===12){
    const runtime=fresh();await advance(runtime,300);assert(runtime.photos.length===0,'Съёмка началась без нажатия кнопки.');
    runtime.setInputs({button:true});await advance(runtime,1400);
    assert(JSON.stringify(runtime.photos.map(p=>p.angle))==='[45,90,135]','На одно нажатие нужны три кадра: 45°, 90°, 135° в этом порядке.');
    await advance(runtime,1800);assert(runtime.photos.length===3,'Удержание кнопки запускает лишние серии.');
    runtime.setInputs({button:false});await advance(runtime,100);runtime.setInputs({button:true});await advance(runtime,1400);
    assert(JSON.stringify(runtime.photos.map(p=>p.angle))==='[45,90,135,45,90,135]','Повторное нажатие должно запустить ровно одну новую серию.');report('Ожидание, три кадра, удержание и повторное нажатие пройдены.');
  }else if(mission.index===13){
    const clean=source.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g,'');
    assert(/\b(?:for|while)\s*\(/.test(clean)&&/\w+\s*\[/.test(clean)&&/\b(?:void|bool|int|float)\s+(?!setup\b|loop\b)\w+\s*\(/.test(clean),'В самостоятельном проекте используй массив, цикл и собственную функцию. Имена выбираешь сама.');
    const runtime=fresh();let s=await advance(runtime,300);
    assert(s.motor===0&&s.photos.length===0,'До команды оператора привод должен стоять, а камера — ждать.');
    runtime.setInputs({button:true});s=await advance(runtime,1500);
    assert(JSON.stringify(s.photos.map(p=>p.angle))==='[45,90,135]'&&s.photos.every(p=>p.motor===180),'При нормальных условиях нужны три кадра 45°, 90°, 135° при мощности привода 180.');
    assert(s.motor===0,'После фотосерии привод должен остановиться.');assert(pwmCorrect(runtime),'Параметры драйвера: 4000 Гц / 8 бит.');
    await advance(runtime,1500);assert(runtime.photos.length===3,'Удержание запускает миссию повторно.');
    runtime.setInputs({button:false});await advance(runtime,100);runtime.setInputs({button:true});await advance(runtime,1500);assert(runtime.photos.length===6,'Новое нажатие после отпускания должно начать новую миссию.');
    report('Полётная последовательность: ожидание → команда → 3 кадра → остановка; повторное нажатие работает.');
    for(const bad of [{battery:3.4},{battery:3.59},{distance:79},{tilt:16},{tilt:-16}]){
      const test=fresh(bad);await advance(test,100);test.setInputs({button:true});s=await advance(test,1000);
      assert(s.motor===0&&s.photos.length===0,`Запуск должен быть заблокирован: ${Object.entries(bad).map(([k,v])=>`${{battery:'батарея',distance:'расстояние',tilt:'наклон'}[k]} ${v}`).join(', ')}.`);
    }
    report('Пять небезопасных начальных состояний блокируют запуск.');
    for(const bad of [{battery:3.4},{distance:30},{tilt:25}]){
      const test=fresh();await advance(test,100);test.setInputs({button:true});await advance(test,100);const photosBefore=test.photos.length;
      test.setInputs(bad);s=await advance(test,900);
      assert(s.motor===0&&s.photos.length===photosBefore,'После изменения условий во время миссии нужно остановиться и прервать съёмку до следующего кадра.');
    }
    report('Разряд батареи, препятствие и наклон после старта прерывают миссию.');
    const boundary=fresh({battery:3.6,distance:80,tilt:-15});await advance(boundary,100);boundary.setInputs({button:true});s=await advance(boundary,1500);
    assert(s.photos.length===3&&s.motor===0,'Допустимые граничные значения 3,6 В / 80 см / −15° не должны запрещать миссию.');report('Допустимые граничные значения пройдены.');
  }else throw Error('Неизвестное задание ESP32.');
  return reports;
}
