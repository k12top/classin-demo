const test=require('node:test'),assert=require('node:assert/strict');
const {startWindowsRemoteReceiver}=require('../src/windows-remote-receiver.cjs');
const binding={grantId:'grant',sessionId:'lesson',teacherId:'teacher',teacherClientId:'device',shareClaimId:'share'};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('Windows converts the verified display only after authorization and waits for a renewed lease',async()=>{
 const display={id:12,bounds:{x:-1920,y:0,width:1920,height:1080},scaleFactor:2,rotation:0};let reads=0,convert=0,resolve,closed=false;const events=[],abort=new AbortController();
 const pending=startWindowsRemoteReceiver({binding,display,getDisplays:()=>[display],readLease:async()=>++reads===1?{...binding,leaseMs:2000}:new Promise(done=>{resolve=done;}),executable:'C:\\App\\RemoteInput.exe',signal:abort.signal,getPhysicalBounds:verified=>{assert.deepEqual(verified,display);convert++;return{x:-3840,y:0,width:3840,height:2160};},launch:options=>{assert.deepEqual(options.bounds,{x:-3840,y:0,width:3840,height:2160});return{ready:Promise.resolve(),renew:()=>{},apply:event=>events.push(event),releaseKey:()=>{},releaseButton:()=>{},close:()=>{closed=true;}};}});
 await tick();assert.equal(convert,1);assert.equal(reads,2);resolve({...binding,leaseMs:2000});const receiver=await pending;
 assert.equal(receiver.receive({grantId:'grant',sequence:1,event:{type:'move',x:1,y:0}}),true);assert.equal(events.length,1);abort.abort();assert.equal(closed,true);assert.equal(receiver.isOpen(),false);
});
test('Windows cannot map a display or launch a helper after a denied lease',async()=>{
 const display={id:12,bounds:{x:0,y:0,width:1920,height:1080},scaleFactor:1,rotation:0};let touched=false;
 await assert.rejects(startWindowsRemoteReceiver({binding,display,getDisplays:()=>[display],readLease:async()=>null,signal:new AbortController().signal,getPhysicalBounds:()=>{touched=true;},launch:()=>{touched=true;}}));
 assert.equal(touched,false);
});
