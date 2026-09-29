import JSCPP from 'JSCPP';
import {espNets,inspectEsp,gpioPins,outputPins} from './esp-hardware.js';

// Executes a C++ subset against explicit peripheral models. This is deliberately
// NOT an Xtensa emulator, an ESP-IDF compiler or a flight-dynamics simulation.
export class EspRuntime {
  constructor(source,wires,parts,inputs={}){
    this.wires=wires;this.parts=parts;this.inputs={button:false,battery:4.1,tilt:0,distance:120,...inputs};
    this.time=0;this.sleepUntil=0;this.modes=new Map();this.outputs=new Map();this.pwm=new Map();this.wirePins=null;this.cameraPin=null;
    this.angle=90;this.angleAt=0;this.servoPin=null;this.photos=[];this.events=[];this.serial='';this.access=new Set();
    if(source.length>24000)throw Error('Программа слишком длинная для учебного стенда. Максимум 24 000 символов.');
    if(/\b(?:main|__nexoraTick)\s*\(/.test(source))throw Error('В скетче используй setup() и loop(). main() создаётся стендом.');
    const header={load:rt=>this.install(rt)};
    const code='#include <Arduino.h>\n'+source+'\nint main(){ setup(); while(true){ loop(); __nexoraTick(); } return 0; }';
    this.debug=JSCPP.run(code,'',{debug:true,includes:{'Arduino.h':header,'Wire.h':{load(){}},'NexoraModules.h':{load(){}}},stdio:{write:s=>this.print(s)},unsigned_overflow:'ignore'});
  }
  print(value){this.serial=(this.serial+String(value)).slice(-3000);}
  fail(message){throw Error(message);}
  pin(pin,output=false){if(!(output?outputPins:gpioPins).includes(pin))this.fail(output&&pin===34?'GPIO34 — только вход. Выбери контакт с поддержкой выхода.':`GPIO${pin} отсутствует на этом стенде.`);return pin;}
  record(type,value){this.events.push({time:this.time,type,value});if(this.events.length>4000)this.events.shift();}
  install(rt){
    const I=rt.intTypeLiteral,V=rt.voidTypeLiteral,F=rt.floatTypeLiteral,B=rt.boolTypeLiteral;
    const register=(name,args,result,fn,owner='global')=>rt.regFunc((r,self,...values)=>r.val(result,fn(...values.map(v=>v.v))),owner,name,args,result);
    for(const [name,value] of Object.entries({HIGH:1,LOW:0,INPUT:0,OUTPUT:1,INPUT_PULLUP:2,LED_BUILTIN:2}))rt.scope[0].variables[name]=rt.val(I,value,false);
    register('__nexoraTick',[],V,()=>{this.time+=1;});
    register('pinMode',[I,I],V,(pin,mode)=>{this.pin(pin,mode===1);if(![0,1,2].includes(mode))this.fail('Неизвестный режим pinMode.');if(pin===34&&mode===2)this.fail('У GPIO34 нет внутренней подтяжки.');this.modes.set(pin,mode);});
    register('digitalWrite',[I,I],V,(pin,value)=>{this.pin(pin,true);if(this.modes.get(pin)!==1)this.fail(`GPIO${pin}: сначала задай pinMode(..., OUTPUT).`);this.outputs.set(pin,Boolean(value));this.record('gpio',{pin,value:Boolean(value)});this.checkElectrical();});
    register('digitalRead',[I],I,pin=>{
      this.pin(pin);this.access.add('digitalRead');const n=espNets(this.wires,this.inputs.button);
      if(n.same(`esp:${pin}`,'esp:GND'))return 0;if(n.same(`esp:${pin}`,'esp:3V3'))return 1;
      return this.outputs.has(pin)?Number(this.outputs.get(pin)):this.modes.get(pin)===2?1:0;
    });
    register('analogRead',[I],I,pin=>{
      this.pin(pin);if(![32,33,34].includes(pin))this.fail('На этом стенде АЦП доступен на GPIO32, GPIO33 и GPIO34.');
      this.access.add('analogRead');const c=inspectEsp(this.wires,this.parts);
      return c.powered('battery')&&c.n.same(`esp:${pin}`,'battery:OUT')?Math.min(4095,Math.max(0,Math.round(this.inputs.battery/2/3.3*4095))):0;
    });
    register('delay',[I],V,ms=>{if(ms<0||ms>60000)this.fail('delay должен быть от 0 до 60000 мс.');this.sleepUntil=this.time+ms;});
    register('millis',[],rt.unsignedlongTypeLiteral||rt.longTypeLiteral,()=>Math.floor(this.time));
    register('abs',[I],I,Math.abs);register('abs',[F],F,Math.abs);
    register('map',[I,I,I,I,I],I,(v,a,b,c,d)=>Math.trunc((v-a)*(d-c)/(b-a)+c));
    register('constrain',[I,I,I],I,(v,a,b)=>Math.max(a,Math.min(b,v)));
    register('ledcAttach',[I,I,I],B,(pin,freq,bits)=>{this.pin(pin,true);if(freq<1||freq>40000||bits<1||bits>16)this.fail('Проверь частоту и разрядность ledcAttach.');this.modes.set(pin,1);this.pwm.set(pin,{freq,bits,duty:0});return true;});
    register('ledcWrite',[I,I],B,(pin,duty)=>{const pwm=this.pwm.get(pin);if(!pwm)this.fail(`Для GPIO${pin} сначала вызови ledcAttach.`);if(duty<0||duty>2**pwm.bits-1)this.fail('Значение ШИМ не помещается в выбранную разрядность.');pwm.duty=duty;this.record('pwm',{pin,duty});this.checkElectrical();return true;});
    const wire=rt.newClass('NexoraWire',[]);rt.scope[0].variables.Wire={t:wire,v:{members:{}},left:false};
    register('begin',[I,I],B,(sda,scl)=>{this.pin(sda,true);this.pin(scl,true);if(sda===scl)this.fail('SDA и SCL должны быть разными контактами.');this.wirePins={sda,scl};return true;},wire);
    const readI2c=id=>{const c=inspectEsp(this.wires,this.parts);if(!this.wirePins)this.fail('Шина I²C не запущена. Вызови Wire.begin.');if(!c.powered(id)||!c.n.same(`${id}:SDA`,`esp:${this.wirePins.sda}`)||!c.n.same(`${id}:SCL`,`esp:${this.wirePins.scl}`)||c.n.same(`${id}:SDA`,`${id}:SCL`))this.fail(`${id==='imu'?'Модуль ориентации':'Дальномер'} не отвечает по I²C. Проверь питание и шину.`);};
    register('readTilt',[],F,()=>{readI2c('imu');this.access.add('readTilt');return this.inputs.tilt;});
    register('readDistance',[],I,()=>{readI2c('range');this.access.add('readDistance');return this.inputs.distance;});
    register('cameraBegin',[I],B,cs=>{this.pin(cs,true);const c=inspectEsp(this.wires,this.parts);if([18,19,23].includes(cs)||!c.powered('camera')||!['SCK:18','MISO:19','MOSI:23',`CS:${cs}`].every(pair=>{const [p,g]=pair.split(':');return c.n.same(`camera:${p}`,`esp:${g}`);}))this.fail('Камера не отвечает по SPI. Проверь питание, линии данных и CS.');this.cameraPin=cs;return true;});
    register('servoWrite',[I,I],V,(pin,angle)=>{this.pin(pin,true);const c=inspectEsp(this.wires,this.parts);if(!c.powered('servo')||!c.n.same('servo:SIG',`esp:${pin}`))this.fail('Сервопривод не подключён к питанию и выбранному GPIO.');if(angle<0||angle>180)this.fail('Угол камеры должен быть от 0 до 180°.');this.servoPin=pin;if(this.angle!==angle){this.angleAt=this.time;this.angle=angle;}this.access.add('servoWrite');this.record('angle',angle);});
    register('cameraCapture',[],I,()=>{if(this.cameraPin===null)this.fail('Камера не включена: вызови cameraBegin.');if(this.servoPin===null)this.fail('Направление камеры не задано.');if(this.time-this.angleAt<200)this.fail('Камера ещё поворачивается. После смены угла нужна выдержка 200 мс.');const photo={id:this.photos.length+1,angle:this.angle,time:this.time,inputs:{...this.inputs},motor:this.snapshot().motor};this.photos.push(photo);if(this.photos.length>60)this.fail('Буфер камеры заполнен. Проверь, не повторяется ли съёмка без новой команды.');this.record('photo',photo.angle);return photo.id;});
    const serial=rt.newClass('NexoraSerial',[]);rt.scope[0].variables.Serial={t:serial,v:{members:{}},left:false};
    register('begin',[I],V,()=>{},serial);
    for(const name of ['print','println'])for(const type of [I,F,rt.doubleTypeLiteral,B,rt.normalPointerType(rt.charTypeLiteral)])rt.regFunc((r,self,value)=>{let s;try{s=r.isPrimitiveType(value.t)?String(value.v):r.getStringFromCharArray(value);}catch{s=String(value.v);}this.print(s+(name==='println'?'\n':''));return r.val(V,undefined);},serial,name,[type],V);
  }
  checkElectrical(){
    const c=inspectEsp(this.wires,this.parts);if(c.problems.length)this.fail(c.problems[0]);
    const n=espNets(this.wires,this.inputs.button),levels=new Map([[n.root('esp:GND'),0],[n.root('esp:3V3'),1]]);
    for(const [pin,value] of [...this.outputs,...[...this.pwm].map(([p,v])=>[p,v.duty>0])]){const node=n.root(`esp:${pin}`),level=Number(value);if(levels.has(node)&&levels.get(node)!==level)this.fail(`GPIO${pin}: конфликт выходного сигнала с питанием, землёй или другим выходом.`);levels.set(node,level);}
  }
  setInputs(values){for(const [name,value] of Object.entries(values))if(name in this.inputs)this.inputs[name]=name==='button'?Boolean(value):Number(value);this.checkElectrical();}
  advance(ms){
    const target=this.time+ms;let steps=0;
    while(this.time<target){
      if(this.sleepUntil>this.time){this.time=Math.min(target,this.sleepUntil);if(this.time>=target)break;}
      if(++steps>200000)this.fail('Программа слишком долго не возвращает управление. Проверь условие цикла.');
      if(this.debug.done)this.fail('Программа завершилась до выполнения loop().');
      this.debug.next();
    }
    return this.snapshot();
  }
  snapshot(){
    const c=inspectEsp(this.wires,this.parts);let motor=0,driverPin=null;
    for(const [pin,pwm] of this.pwm)if(c.powered('driver')&&c.n.same('driver:PWM',`esp:${pin}`)){motor=Math.round(pwm.duty/(2**pwm.bits-1)*255);driverPin=pin;}
    return {time:this.time,led:c.ledPin!==null&&Boolean(this.outputs.get(c.ledPin)),motor,driverPin,angle:this.angle,photos:this.photos.map(p=>({...p})),serial:this.serial,inputs:{...this.inputs},access:[...this.access]};
  }
}

export function espError(error){
  const message=String(error?.message||error);
  const match=message.match(/(?:line |:)(\d+)(?::(\d+))?/i);
  return {message:message.replace(/line (\d+)/ig,(_,n)=>'строка '+Math.max(1,Number(n)-1)),line:match?Math.max(1,Number(match[1])-1):null};
}
