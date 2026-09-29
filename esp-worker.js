import {EspRuntime,espError} from './esp-runtime.js';
import {checkEsp} from './esp-checks.js';
import {espMissions} from './career-cases.js';
let runtime=null,timer=null,revision=0;
const stop=()=>{revision++;clearInterval(timer);timer=null;runtime=null;};
onmessage=async({data})=>{
  const {action,requestId}=data;
  try{
    if(action==='stop'){stop();return;}
    if(action==='input'){runtime?.setInputs(data.inputs);return;}
    stop();const token=revision,mission=espMissions.find(m=>m.index===data.index);if(!mission)throw Error('Задание ESP32 не найдено.');
    if(action==='check'){
      const report=await checkEsp({source:data.source,wires:data.wires,mission,onProgress:message=>postMessage({type:'progress',requestId,message}),yieldTask:()=>new Promise((resolve,reject)=>setTimeout(()=>token===revision?resolve():reject(Error('Проверка остановлена')),0))});
      if(token===revision)postMessage({type:'complete',requestId,report});return;
    }
    runtime=new EspRuntime(data.source,data.wires,mission.parts,data.inputs);runtime.advance(1);
    postMessage({type:'running',requestId,state:runtime.snapshot()});
    timer=setInterval(()=>{try{if(token!==revision)return;const state=runtime.advance(40);postMessage({type:'state',requestId,state});}catch(e){stop();postMessage({type:'error',requestId,...espError(e)});}},40);
  }catch(e){stop();postMessage({type:'error',requestId,...espError(e)});}
};
