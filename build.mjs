import {build} from 'esbuild';
import {cp,mkdir,writeFile,readFile} from 'node:fs/promises';
await mkdir('dist/avr',{recursive:true});
await cp('node_modules/@horang-corp/avr-gcc-wasm','dist/avr',{recursive:true});
// The package manifest contains headers for every AVR board and optional
// library. The AVR branch targets Arduino Uno, so shipping all
// 500+ headers makes the first browser compile needlessly download ~30 MB and
// hundreds of files. Keep the Arduino core and the Uno system headers used by
// the lessons; the compiler still has the full object/linker assets.
const manifestPath='dist/avr/assets/manifest.json';
const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
manifest.headerFiles=manifest.headerFiles.filter(file=>{
  if(file.startsWith('/arduino/core/')||file==='/arduino/variant/pins_arduino.h'||file.startsWith('/sysroot/gcc/include/'))return true;
  if(!file.startsWith('/sysroot/avr/include/'))return false;
  if(/\/avr\/io[^/]*\.h$/.test(file))return /\/avr\/(io\.h|iom328p\.h)$/.test(file);
  return true;
});
await writeFile(manifestPath,JSON.stringify(manifest));
await build({entryPoints:['main.js'],bundle:true,format:'esm',outfile:'dist/app.js',minify:true,target:'es2022'});
await build({entryPoints:['esp-worker.js'],bundle:true,alias:{stream:'stream-browserify',util:'util/'},inject:['esp-browser-globals.js'],define:{global:'globalThis'},format:'esm',outfile:'dist/esp-worker.js',minify:true,target:'es2022'});
await cp('career-cases.js','dist/career-cases.js');
await cp('game.js','dist/game.js');
await cp('case-one.js','dist/case-one.js');
await cp('electricity-school.js','dist/electricity-school.js');
await cp('electricity-model.js','dist/electricity-model.js');
await cp('progress.js','dist/progress.js');
await cp('program-blocks.js','dist/program-blocks.js');
await cp('case-two.js','dist/case-two.js');
await cp('story-media.js','dist/story-media.js');
await cp('case-stories.js','dist/case-stories.js');
await cp('case-models.js','dist/case-models.js');
await cp('circuit-labels.js','dist/circuit-labels.js');
await mkdir('dist/licenses',{recursive:true});
for(const [name,path] of [['JSCPP','node_modules/JSCPP/LICENSE'],['avr8js','node_modules/avr8js/LICENSE'],['wokwi-elements','node_modules/@wokwi/elements/LICENSE'],['avr-gcc-wasm','node_modules/@horang-corp/avr-gcc-wasm/THIRD_PARTY_NOTICES.md']])await cp(path,`dist/licenses/${name}.txt`);
await writeFile('dist/licenses.html',`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Компоненты и лицензии — NEXORA</title><link rel="stylesheet" href="style.css"><body style="padding:32px;max-width:800px;margin:auto"><a href="./">← В мастерскую</a><h1 style="color:#172133;font-size:32px">Компоненты и лицензии</h1><p>Эмуляция Arduino Uno: <a href="https://github.com/wokwi/avr8js">AVR8js</a> (MIT). Изображения компонентов: <a href="https://github.com/wokwi/wokwi-elements">Wokwi Elements</a> (MIT). Эти элементы отображают детали, а проверку соединений выполняет NEXORA.</p><p>Компиляция: <a href="https://github.com/horang-corp/avr-gcc-wasm">AVR GCC WASM</a>. Инструменты GCC и GNU binutils распространяются по GPL v3 или новее; Arduino core и другие библиотеки имеют собственные лицензии. Эта версия размещена как частный прототип.</p><ul><li><a href="licenses/avr8js.txt">AVR8js — лицензия</a></li><li><a href="licenses/wokwi-elements.txt">Wokwi Elements — лицензия</a></li><li><a href="licenses/avr-gcc-wasm.txt">Компилятор — уведомления</a></li></ul><p>Поддерживается ATmega328P, цифровые выводы D0–D13, таймеры и Serial. Внешняя схема ограничена светодиодом, резистором 220 Ом и кнопкой. Учебная макетная плата моделирует соединения в двух группах по пять отверстий. В первой арке также моделируется TMP36. Во второй арке ESP32 выполняет учебное подмножество C++ через <a href="https://github.com/felixhao28/JSCPP">JSCPP</a> (<a href="licenses/JSCPP.txt">MIT</a>). GPIO, АЦП, ШИМ, I²C и SPI-модули моделируются программно: это не полная эмуляция процессора ESP32. NexoraModules.h — учебный API, не библиотека для реального дрона.</p></body></html>`);
console.log('Built NEXORA with local compiler assets.');
