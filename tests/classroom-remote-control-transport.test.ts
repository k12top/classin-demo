import assert from 'node:assert/strict';
import test from 'node:test';
import {createRemoteControlTransport} from '../src/lib/classroom/remote-control-transport';
import type {RemoteInput} from '../src/lib/classroom/remote-control-input';

function fixture(){
 let now=0,next=0,sequence=0,closed=false,reason='',resolveFirst:()=>void=()=>{};const timers=new Map<number,{at:number;fn:()=>void}>(),signed:RemoteInput[]=[],published:{user:string;event:{packet:{sequence:number;event:RemoteInput}}}[]=[];
 const clock={now:()=>now,set:(fn:()=>void,ms:number)=>{const id=++next;timers.set(id,{at:now+ms,fn});return id as unknown as ReturnType<typeof setTimeout>;},clear:(id:ReturnType<typeof setTimeout>)=>{timers.delete(id as unknown as number);}};
 const signer={sign:async(input:unknown)=>{const event=input as RemoteInput;signed.push(event);return {grantId:'grant',sequence:++sequence,event,signature:'test'};},close:()=>{closed=true;}};
 const first=new Promise<void>(resolve=>{resolveFirst=resolve;});let calls=0;
 const transport=createRemoteControlTransport({courseId:'lesson',targetUserId:'student',targetSignalingId:'student-device',signer,clock,onFailure:value=>{reason=value;},publish:async(user,event)=>{published.push({user,event});if(++calls===1)await first;}});
 return {transport,signed,published,get reason(){return reason;},get closed(){return closed;},resolveFirst,advance:(ms:number)=>{now+=ms;for(const [id,timer] of [...timers])if(timer.at<=now){timers.delete(id);timer.fn();}}};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('direct transport coalesces only adjacent moves and preserves action order',async()=>{
 const f=fixture();assert.equal(f.transport.enqueue({type:'move',x:0,y:0}),true);await tick();
 f.transport.enqueue({type:'move',x:0.1,y:0.1});f.transport.enqueue({type:'move',x:0.2,y:0.2});f.transport.enqueue({type:'button',x:0.2,y:0.2,button:'left',down:true});f.transport.enqueue({type:'move',x:0.3,y:0.3});f.transport.enqueue({type:'button',x:0.3,y:0.3,button:'left',down:false});
 f.resolveFirst();await tick();for(let i=0;i<5;i++){f.advance(40);await tick();}
 assert.deepEqual(f.signed.map(item=>item.type),['move','move','button','move','button']);assert.deepEqual(f.signed[1],{type:'move',x:0.2,y:0.2});assert.deepEqual(f.published.map(item=>item.event.packet.sequence),[1,2,3,4,5]);assert.ok(f.published.every(item=>item.user==='student-device'));f.transport.close();assert.equal(f.closed,true);
});
test('an undelivered message times out and closes rather than replaying input',async()=>{const f=fixture();f.transport.enqueue({type:'key',code:'KeyA',down:true});await tick();f.advance(1500);await tick();assert.equal(f.reason,'transport-unavailable');assert.equal(f.closed,true);assert.equal(f.transport.enqueue({type:'key',code:'KeyA',down:false}),false);f.resolveFirst();await tick();assert.equal(f.published.length,1);});
test('a full queue closes without dropping button or keyboard events',async()=>{const f=fixture();f.transport.enqueue({type:'key',code:'KeyA',down:true});await tick();for(let i=0;i<64;i++)assert.equal(f.transport.enqueue({type:'key',code:'KeyB',down:Boolean(i%2)}),true);assert.equal(f.transport.enqueue({type:'key',code:'KeyC',down:true}),false);assert.equal(f.reason,'input-backlog');assert.equal(f.closed,true);f.resolveFirst();});
