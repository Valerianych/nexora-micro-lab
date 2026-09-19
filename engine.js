import { CPU, AVRADC, adcConfig, avrInstruction, AVRIOPort, AVRTimer, AVRUSART, portBConfig, portCConfig, portDConfig, timer0Config, timer1Config, timer2Config, usart0Config, PinState } from 'avr8js';

export function readHex(hex) {
  const bytes = new Uint8Array(32768); let base=0;
  for (const line of hex.trim().split(/\r?\n/)) {
    if (!/^:[\da-f]+$/i.test(line)) throw new Error('Некорректный HEX');
    const row=Uint8Array.from(line.slice(1).match(/../g).map(x=>parseInt(x,16)));
    if(row.length!==row[0]+5 || row.reduce((a,b)=>a+b,0)%256)throw new Error('Повреждён HEX');
    const address=(row[1]<<8)|row[2], type=row[3];
    if(type===0) {if(base+address+row[0]>bytes.length)throw new Error('Программа не помещается в Uno'); bytes.set(row.slice(4,4+row[0]),base+address);}
    if(type===4)base=((row[4]<<8)|row[5])*65536;
    if(type===2)base=((row[4]<<8)|row[5])*16;
  }
  return new Uint16Array(bytes.buffer);
}

export function nets(wires, pressed=false, breadboard=false) {
  const p=new Map();
  const root=x=>{if(!p.has(x))p.set(x,x); if(p.get(x)!==x)p.set(x,root(p.get(x))); return p.get(x);};
  const join=(a,b)=>p.set(root(a),root(b));
  for(const w of wires)join(w.a,w.b);
  join('uno:GND.1','uno:GND.2');join('uno:GND.1','uno:GND.3');
  join('button:1.l','button:1.r');join('button:2.l','button:2.r');
  if(pressed)join('button:1.l','button:2.l');
  if(breadboard)for(let c=1;c<=10;c++)for(const group of ['abcde','fghij'])for(const r of group)join(`bb:${group[0]}${c}`,`bb:${r}${c}`);
  return {root,same:(a,b)=>root(a)===root(b)};
}

// Limited DC model: one LED, one series resistor and digital sources.
// Both resistor placements are accepted; a direct parallel bypass is rejected.
export function inspectCircuit(wires, pressed=false, breadboard=false) {
  const n=nets(wires,pressed,breadboard), same=n.same;
  const sources=['uno:5V',...Array.from({length:14},(_,i)=>`uno:${i}`)];
  const path=(a,b)=>{
    if(same(a,b))return {connected:true,resistor:false};
    if((same(a,'r:1')&&same(b,'r:2'))||(same(a,'r:2')&&same(b,'r:1')))return {connected:true,resistor:true};
    return {connected:false,resistor:false};
  };
  let led=null,reversed=false,unprotected=false;
  for(const source of sources){
    const a=path(source,'led:A'), c=path('led:C','uno:GND.1');
    if(a.connected&&c.connected){
      if(a.resistor!==c.resistor && !same('r:1','r:2'))led={source};
      else unprotected=true;
    }
    if(path(source,'led:C').connected&&path('led:A','uno:GND.1').connected)reversed=true;
  }
  let error=null;
  if(same('uno:5V','uno:GND.1'))error='Питание 5V соединено напрямую с GND. Удали это соединение перед запуском.';
  if(unprotected)error='Светодиод подключён без последовательного резистора. Добавь резистор в цепь: он ограничивает ток.';
  const reason=error||(!led?(reversed?'Светодиод подключён наоборот. Анод A должен быть со стороны выхода, катод C — со стороны GND.':'Цепь пока не замкнута. Соедини выход платы с анодом A через резистор, а катод C — с GND.'):'Цепь со светодиодом собрана. Можно проверять программу.');
  return {led,error,reason,n};
}

export function inspectSensor(wires,breadboard=false){
  const n=nets(wires,false,breadboard);
  const powered=n.same('sensor:VCC','uno:5V')&&n.same('sensor:GND','uno:GND.2');
  const connected=powered&&n.same('sensor:OUT','uno:A0');
  const short=n.same('sensor:OUT','uno:GND.2')||n.same('sensor:OUT','uno:5V');
  return {connected:connected&&!short,reason:short?'Выход датчика замкнут на питание или землю. Подключи OUT только к A0.':!connected?'Подключи датчик: VCC → 5V, GND → GND, OUT → A0.':'Датчик подключён к A0.'};
}

export class Emulator {
  constructor(hex,wires,{breadboard=false,temperature=25,onChange=()=>{},onSerial=()=>{},onFault=()=>{}}={}){
    this.cpu=new CPU(readHex(hex));this.wires=wires;this.breadboard=breadboard;this.pressed=false;this.led=false;this.transitions=[];this.fault=null;this.onChange=onChange;this.onFault=onFault;this.ready=false;
    this.ports={B:new AVRIOPort(this.cpu,portBConfig),C:new AVRIOPort(this.cpu,portCConfig),D:new AVRIOPort(this.cpu,portDConfig)};
    this.adc=new AVRADC(this.cpu,adcConfig);this.temperature=temperature;this.setTemperature(temperature);
    this.timers=[timer0Config,timer1Config,timer2Config].map(config=>new AVRTimer(this.cpu,config));
    this.serial=new AVRUSART(this.cpu,usart0Config,16000000);this.serial.onByteTransmit=value=>onSerial(String.fromCharCode(value));
    for(const port of Object.values(this.ports))port.addListener(()=>this.update());
    this.ready=true;this.update();
  }
  portPin(i){return i<8?[this.ports.D,i]:[this.ports.B,i-8];}
  state(i){const [p,b]=this.portPin(i);return p.pinState(b);}
  update(){
    if(!this.ready||this.updating||this.fault)return;
    this.updating=true;
    const circuit=inspectCircuit(this.wires,this.pressed,this.breadboard),n=circuit.n;
    const levels=new Map();const drive=(node,value)=>{const root=n.root(node); if(levels.has(root)&&levels.get(root)!==value)this.fault='В одной цепи встретились противоположные уровни. Проверь соединения выходов с 5V, GND и кнопкой.'; levels.set(root,value);};
    drive('uno:GND.1',false);drive('uno:5V',true);
    for(let i=0;i<14;i++){const s=this.state(i); if(s===PinState.Low||s===PinState.High)drive(`uno:${i}`,s===PinState.High);}
    for(let i=0;i<14;i++){const [p,b]=this.portPin(i),s=this.state(i); if(s===PinState.Input||s===PinState.InputPullUp)p.setPin(b,levels.get(n.root(`uno:${i}`))??s===PinState.InputPullUp);}
    let value=false;
    if(circuit.led&&!this.fault){const source=circuit.led.source;value=source==='uno:5V'||this.state(Number(source.split(':')[1]))===PinState.High;}
    if(value!==this.led){this.led=value;this.transitions.push({time:this.cpu.cycles/16000000,value}); if(this.transitions.length>50)this.transitions.shift();}
    this.onChange({led:this.led,led13:this.state(13)===PinState.High,time:this.cpu.cycles/16000000,pressed:this.pressed});
    this.updating=false;if(this.fault)this.onFault(this.fault);
  }
  setTemperature(value){
    this.temperature=Math.max(0,Math.min(80,Number(value)||0));
    this.adc.channelValues[0]=inspectSensor(this.wires,this.breadboard).connected ? 0.5+this.temperature*0.01 : 0;
  }
  setButton(value){this.pressed=value;this.update();}
  advance(cycles){const end=this.cpu.cycles+cycles;while(this.cpu.cycles<end&&!this.fault){avrInstruction(this.cpu);this.cpu.tick();}return this.cpu.cycles;}
}
