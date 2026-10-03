import assert from 'node:assert/strict';
import {espLessons,normalizeLearning,acceptsAnswer} from './esp-learning.js';
import {espMissions} from './career-cases.js';
import {checkEsp} from './esp-checks.js';
import {solutions} from './verify-career.mjs';

// Completing the actual student scaffolds must produce programs accepted by
// the behavioral checks; merely passing a lesson must not solve a mission.
const fills={
  9:[['// TODO: настрой buttonPin с внутренней подтяжкой','pinMode(buttonPin, INPUT_PULLUP);'],['// TODO: включи индикатор','digitalWrite(ledPin, HIGH);'],['// TODO: выключи индикатор','digitalWrite(ledPin, LOW);']],
  10:[['false; // TODO: сравни batteryV с порогом 3.6','batteryV >= 3.6;'],['// TODO: задай рабочую мощность через ledcWrite','ledcWrite(motorPin, 180);'],['// TODO: останови привод через ledcWrite','ledcWrite(motorPin, 0);']],
  11:[['false; // TODO: расстояние И обе границы наклона','distance >= 80 && tilt >= -15 && tilt <= 15;'],['// TODO: разреши рабочую мощность','ledcWrite(motorPin, 180);'],['// TODO: останови привод','ledcWrite(motorPin, 0);']],
  12:[['false; // TODO: pressed И НЕ wasPressed','pressed && !wasPressed;'],['// TODO: поверни сервопривод на angles[i]','servoWrite(servoPin, angles[i]);'],['// TODO: подожди 200 мс','delay(200);'],['// TODO: сохрани кадр','cameraCapture();'],['// TODO: сохрани pressed в wasPressed','wasPressed = pressed;']]
};
for(const [index,lesson] of Object.entries(espLessons)){
  const mission=espMissions.find(m=>m.index===Number(index));
  let source=mission.code;
  for(const [from,to] of fills[index]){assert(source.includes(from));source=source.replace(from,to);}
  assert.equal(/TODO/.test(source),false);
  await checkEsp({mission,source,wires:solutions[index].wires});
  await assert.rejects(checkEsp({mission,source:mission.code,wires:solutions[index].wires}));
  assert.equal(lesson.steps.length,3);
  assert.deepEqual(normalizeLearning(Number(index),{version:1,step:99,solved:[true,'true',false],collapsed:true}),{version:1,step:2,solved:[true,false,false],collapsed:true});
  console.log(`PASS case ${mission.id}: completed scaffold passes real checks, unfinished program rejected`);
}
assert.equal(espLessons[13],undefined);
assert(acceptsAnswer({answer:'4095.0'},'4095'));
assert(acceptsAnswer({answer:'!wasPressed'},' ! wasPressed '));
assert(!acceptsAnswer({answer:'>='},'>'));
assert(!acceptsAnswer({answer:'&&'},'||'));
assert(!acceptsAnswer({answer:'LOW'},'HIGH'));
assert(!acceptsAnswer({answer:'-15'},'15'));
console.log('PASS boundary, conjunction, pull-up, negative-angle feedback and persisted lesson state');
