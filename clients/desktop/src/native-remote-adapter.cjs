'use strict';
const {spawn:spawnProcess}=require('node:child_process');

/** Main-process transport. Platform wrappers validate every path and argument. */
function launchNativeRemoteAdapter({executable,args,onClose=()=>{},spawn=spawnProcess,timeoutMs=1800,terminate}){
 if(!Number.isFinite(timeoutMs)||timeoutMs<=0||timeoutMs>2000)throw Error('Invalid native input configuration');
 const child=spawn(executable,args,{shell:false,stdio:['pipe','pipe','ignore'],windowsHide:true});
 let state='starting',pending='',timer,resolveReady,rejectReady;
 const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
 const stop=reason=>{
  if(state==='closed')return;const starting=state==='starting';state='closed';clearTimeout(timer);
  if(terminate)terminate(child,spawn);else{
   try{child.kill('SIGTERM');}catch{/* A failed child is already unavailable. */}
   try{child.stdin.end();}catch{/* The pipe may already be closed. */}
  }
  if(starting)rejectReady(Error('Native input unavailable'));onClose(reason);
 };
 const send=value=>{if(state!=='ready'||child.stdin.destroyed||child.stdin.writableEnded)throw Error('Native input unavailable');try{if(!child.stdin.write(JSON.stringify(value)+'\n'))throw Error('Native input backlog');}catch(error){stop('input-unavailable');throw error;}};
 child.once('error',()=>stop('helper-error'));child.once('exit',()=>{if(state!=='starting')stop('helper-exit');});child.once('close',()=>stop('helper-exit'));child.stdin.on('error',()=>stop('input-unavailable'));child.stdout.on('error',()=>stop('helper-error'));
 child.stdout.on('data',chunk=>{if(state!=='starting')return;pending+=chunk.toString('utf8');if(pending.length>64){stop('invalid-helper');return;}const end=pending.indexOf('\n');if(end<0)return;const message=pending.slice(0,end);if(pending.slice(end+1)){stop('invalid-helper');return;}if(message==='permission-required'){stop('permission-required');return;}if(message!=='ready'){stop('invalid-helper');return;}state='ready';clearTimeout(timer);resolveReady();});
 timer=setTimeout(()=>stop('helper-timeout'),timeoutMs);
 return {ready,renew:()=>send({type:'renew'}),apply:event=>send({type:'event',event}),releaseKey:()=>stop('release-input'),releaseButton:()=>stop('release-input'),close:()=>stop('closed'),isOpen:()=>state==='ready'};
}
module.exports={launchNativeRemoteAdapter};
