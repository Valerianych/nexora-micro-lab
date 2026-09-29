import assert from 'node:assert/strict';
import {EspRuntime} from './esp-runtime.js';
import {checkEsp} from './esp-checks.js';
import {espMissions} from './career-cases.js';

export const wire=(a,b)=>({a,b,color:'#d74f58'});
const power=id=>[wire('esp:3V3',id+':VCC'),wire('esp:GND',id+':GND')];
const button=[wire('esp:32','button:1L'),wire('esp:GND','button:2L')];
const driver=[...power('driver'),wire('esp:25','driver:PWM')];
const battery=[...power('battery'),wire('esp:34','battery:OUT')];
const sensors=['imu','range'].flatMap(id=>[...power(id),wire('esp:21',id+':SDA'),wire('esp:22',id+':SCL')]);
const camera=[...power('camera'),...['SCK:18','MISO:19','MOSI:23','CS:5'].map(pair=>{const [pin,gpio]=pair.split(':');return wire('esp:'+gpio,'camera:'+pin);}),wire('esp:5V','servo:V+'),wire('esp:GND','servo:GND'),wire('esp:26','servo:SIG')];
export const solutions={
9:{wires:[wire('esp:25','r:1'),wire('r:2','led:A'),wire('led:C','esp:GND'),...button],code:'void setup(){ pinMode(25, OUTPUT); pinMode(32, INPUT_PULLUP); }\nvoid loop(){ digitalWrite(25, digitalRead(32)==LOW); }'},
10:{wires:[...battery,...driver],code:'void setup(){ledcAttach(25,4000,8);}\nvoid loop(){float volts=analogRead(34)*3.3/4095.0*2;ledcWrite(25,volts>=3.6?180:0);}'},
11:{wires:[...sensors,...driver],code:'#include <Wire.h>\n#include <NexoraModules.h>\nvoid setup(){Wire.begin(21,22);ledcAttach(25,4000,8);}\nvoid loop(){float tilt=readTilt();int cm=readDistance();ledcWrite(25,cm>=80 && tilt>=-15 && tilt<=15?180:0);}'},
12:{wires:[...camera,...button],code:'#include <NexoraModules.h>\nint angles[]={45,90,135};bool previous=false;\nvoid setup(){pinMode(32,INPUT_PULLUP);cameraBegin(5);}\nvoid loop(){bool pressed=digitalRead(32)==LOW;if(pressed && !previous){for(int i=0;i<3;i++){servoWrite(26,angles[i]);delay(200);cameraCapture();}}previous=pressed;}'},
13:{wires:[...battery,...driver,...sensors,...camera,...button],code:'#include <Wire.h>\n#include <NexoraModules.h>\nint angles[]={45,90,135};bool previous=false;\nbool allowed(){float v=analogRead(34)*3.3/4095.0*2;float tilt=readTilt();return v>=3.6 && readDistance()>=80 && tilt>=-15 && tilt<=15;}\nvoid setup(){pinMode(32,INPUT_PULLUP);Wire.begin(21,22);ledcAttach(25,4000,8);cameraBegin(5);}\nvoid loop(){bool pressed=digitalRead(32)==LOW;if(pressed && !previous && allowed()){ledcWrite(25,180);for(int i=0;i<3;i++){servoWrite(26,angles[i]);delay(200);if(!allowed())break;cameraCapture();}ledcWrite(25,0);}previous=pressed;}'}
};
export async function verifyCareer(){
 for(const mission of espMissions){const solution=solutions[mission.index];const reports=await checkEsp({mission,source:solution.code,wires:solution.wires});assert(reports.length);console.log(`PASS case ${mission.id}: ${reports.length} groups`);
   await assert.rejects(checkEsp({mission,source:solution.code,wires:solution.wires.filter(w=>!w.a.endsWith(':GND'))}));
 }
 await assert.rejects(checkEsp({mission:espMissions[0],source:solutions[9].code.replace('digitalRead(32)==LOW','HIGH'),wires:solutions[9].wires}),/отпущена/);
 await assert.rejects(checkEsp({mission:espMissions[1],source:solutions[10].code.replace('volts>=3.6','true'),wires:solutions[10].wires}),/3.4/);
 await assert.rejects(checkEsp({mission:espMissions[2],source:solutions[11].code.replace(' && tilt>=-15',''),wires:solutions[11].wires}),/−?16|\-16/);
 await assert.rejects(checkEsp({mission:espMissions[3],source:solutions[12].code.replace(' && !previous',''),wires:solutions[12].wires}),/три кадра|Удержание/);
 await assert.rejects(checkEsp({mission:espMissions[4],source:solutions[13].code.replace('if(!allowed())break;',''),wires:solutions[13].wires}),/изменения условий/);
 const runtime=new EspRuntime('void setup(){Serial.begin(9600);Serial.println("ready");} void loop(){delay(100);}',[],['esp']);runtime.advance(150);assert.equal(runtime.serial,'ready\n');
 assert.throws(()=>new EspRuntime('void setup(){} void loop(){while(true){}}',[],['esp']).advance(5),/цикла/);
 console.log('PASS incorrect wiring, hardcoded outputs, missed negative tilt, repeated photos, unsafe continuation, Serial and infinite-loop guard');
}
if(process.argv[1]===new URL(import.meta.url).pathname)await verifyCareer();
