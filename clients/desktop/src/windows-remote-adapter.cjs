'use strict';
const path=require('node:path'),{randomUUID}=require('node:crypto');
const {launchNativeRemoteAdapter}=require('./native-remote-adapter.cjs');
const integer=value=>Number.isSafeInteger(value)&&value>=-0x80000000&&value<=0x7fffffff;
function physicalBounds(value){
 if(!value||!['x','y','width','height'].every(key=>integer(value[key]))||value.width<1||value.height<1||!integer(value.x+value.width)||!integer(value.y+value.height))throw Error('Invalid native display');
 return [value.x,value.y,value.width,value.height];
}
function launchWindowsRemoteAdapter({executable,bounds,roundingTolerance=0,parentPid=process.pid,stopId=randomUUID(),clock={set:setTimeout,clear:clearTimeout},...options}){
 if(typeof executable!=='string'||!path.win32.isAbsolute(executable)||!Number.isSafeInteger(parentPid)||parentPid<1||parentPid>0xffffffff||!Number.isInteger(roundingTolerance)||roundingTolerance<0||roundingTolerance>16||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stopId))throw Error('Invalid native input configuration');
 const rectangle=physicalBounds(bounds);
 return launchNativeRemoteAdapter({...options,executable,args:[...rectangle.map(String),String(roundingTolerance),String(parentPid),stopId],terminate:(child,spawn)=>{
  // Windows SIGTERM does not run cleanup. Signal a separate event so the
  // receiver releases input without executing queued writes after stopping.
  try{child.stdin.destroy();}catch{/* An exited helper already closed the pipe. */}
  if(child.exitCode!=null||child.signalCode!=null)return;
  try{const stopper=spawn(executable,['--stop',String(parentPid),stopId],{shell:false,stdio:'ignore',windowsHide:true});stopper.once('error',()=>{});}catch{/* EOF and the independent watchdog still stop control. */}
  const timer=clock.set(()=>{try{child.kill('SIGKILL');}catch{/* Already stopped. */}},3000);timer?.unref?.();
  child.once('close',()=>clock.clear(timer));
 }});
}
module.exports={launchWindowsRemoteAdapter,physicalBounds};
