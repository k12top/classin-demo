const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {launchWindowsRemoteAdapter,physicalBounds}=require('../src/windows-remote-adapter.cjs');
const id='12345678-1234-4567-89ab-123456789abc';
function fixture(options={}){
 const child=new EventEmitter(),stdin=new EventEmitter(),stdout=new EventEmitter(),calls=[],writes=[],signals=[],timers=new Map();let next=0,closed;
 Object.assign(stdin,{destroyed:false,writableEnded:false,write:value=>(writes.push(JSON.parse(value)),!options.backpressure),destroy:()=>{stdin.destroyed=true;}});
 Object.assign(child,{stdin,stdout,kill:signal=>signals.push(signal)});
 const spawn=(file,args,config)=>{calls.push({file,args,config});if(calls.length===1)return child;return new EventEmitter();};
 const adapter=launchWindowsRemoteAdapter({executable:'C:\\Classroom\\RemoteInput.exe',bounds:{x:-3840,y:0,width:3840,height:2160},parentPid:123,stopId:id,spawn,onClose:reason=>{closed=reason;},clock:{set:(fn,delay)=>{assert.equal(delay,3000);timers.set(++next,fn);return next;},clear:key=>timers.delete(key)}});
 return{adapter,child,calls,writes,signals,timers,get closed(){return closed;}};
}
test('Windows launches only the fixed physical display and waits for helper readiness',async()=>{
 const f=fixture();assert.deepEqual(f.calls[0].args,['-3840','0','3840','2160','0','123',id]);assert.equal(f.calls[0].config.shell,false);assert.equal(f.calls[0].config.windowsHide,true);assert.throws(()=>f.adapter.apply({}));
 f.child.stdout.emit('data',Buffer.from('ready\n'));await f.adapter.ready;f.adapter.renew();f.adapter.apply({type:'move',x:1,y:0});assert.deepEqual(f.writes,[{type:'renew'},{type:'event',event:{type:'move',x:1,y:0}}]);f.adapter.close();f.child.emit('close',0);
});
test('stopping Windows input drops queued writes and signals a separate event before any forced termination',async()=>{
 const f=fixture();f.child.stdout.emit('data',Buffer.from('ready\n'));await f.adapter.ready;f.adapter.releaseKey('KeyA');
 assert.equal(f.child.stdin.destroyed,true);assert.deepEqual(f.calls[1].args,['--stop','123',id]);assert.equal(f.calls[1].config.stdio,'ignore');assert.deepEqual(f.signals,[]);assert.equal(f.timers.size,1);assert.throws(()=>f.adapter.renew());
 f.child.emit('close',0);assert.equal(f.timers.size,0);assert.deepEqual(f.signals,[]);assert.equal(f.closed,'release-input');
});
test('backpressure closes the Windows receiver and an unresponsive helper is eventually terminated',async()=>{
 const f=fixture({backpressure:true});f.child.stdout.emit('data',Buffer.from('ready\n'));await f.adapter.ready;assert.throws(()=>f.adapter.renew());assert.equal(f.closed,'input-unavailable');[...f.timers.values()][0]();assert.deepEqual(f.signals,['SIGKILL']);f.child.emit('close',1);
});
test('Windows bounds and startup arguments reject relative paths, invalid pixels and injected event names',()=>{
 assert.deepEqual(physicalBounds({x:-3000,y:-500,width:3000,height:2000}),[-3000,-500,3000,2000]);
 for(const bounds of [{x:0,y:0,width:0,height:1},{x:1.2,y:0,width:1,height:1},{x:0x7fffffff,y:0,width:2,height:1},null])assert.throws(()=>physicalBounds(bounds));
 const base={executable:'C:\\Classroom\\RemoteInput.exe',bounds:{x:0,y:0,width:100,height:100},parentPid:123,stopId:id};
 for(const input of [{...base,executable:'relative.exe'},{...base,parentPid:0},{...base,stopId:'other-event'}])assert.throws(()=>launchWindowsRemoteAdapter(input));
});
test('an already exited Windows helper does not start a redundant stopper or kill timer',async()=>{
 const f=fixture();f.child.stdout.emit('data',Buffer.from('ready\n'));await f.adapter.ready;f.child.exitCode=1;f.child.emit('close',1);assert.equal(f.calls.length,1);assert.equal(f.timers.size,0);assert.equal(f.closed,'helper-exit');
});
