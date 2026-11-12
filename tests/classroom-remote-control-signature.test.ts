import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {createRemoteInputSigner} from '../src/lib/classroom/remote-control-signature';
const require=createRequire(import.meta.url);
const {createSignedRemoteReceiver}=require('../clients/desktop/src/remote-control-signed-receiver.cjs') as {createSignedRemoteReceiver:(input:unknown)=>{receive:(packet:unknown)=>boolean;close:(reason:string)=>void}};
const {createRemoteControlFence}=require('../clients/desktop/src/remote-control-fence.cjs') as {createRemoteControlFence:(input:unknown)=>{receive:(packet:unknown)=>boolean;renew:(binding:unknown,ms:number)=>boolean;close:(reason:string)=>void}};
const binding={sessionId:'lesson-1',grantId:'grant-1',shareClaimId:'screen-1'};
test('browser signatures authenticate ordered input to the desktop fence',async()=>{
 const signer=await createRemoteInputSigner(binding),events:unknown[]=[],released:string[]=[];
 const fence=createRemoteControlFence({grantId:binding.grantId,shareClaimId:binding.shareClaimId,adapter:{apply:(event:unknown)=>events.push(event),releaseKey:(code:string)=>released.push(code),releaseButton:()=>{}}});assert.equal(fence.renew({grantId:binding.grantId,shareClaimId:binding.shareClaimId},2000),true);
 const receiver=createSignedRemoteReceiver({binding,publicKey:signer.publicKey,receiver:fence});
 const [press,move,release]=await Promise.all([signer.sign({type:'key',code:'KeyA',down:true}),signer.sign({type:'move',x:0.25,y:0.75}),signer.sign({type:'key',code:'KeyA',down:false})]);
 assert.deepEqual([press.sequence,move.sequence,release.sequence],[1,2,3]);assert.equal(receiver.receive({...press,event:{...press.event,code:'KeyB'}}),false);assert.equal(events.length,0);assert.equal(receiver.receive(press),true);assert.equal(receiver.receive(move),true);assert.equal(receiver.receive(release),true);assert.equal(events.length,3);
 // An authenticated replay is rejected by the receiver fence and closes it.
 assert.equal(receiver.receive(press),false);assert.equal(receiver.receive(await signer.sign({type:'move',x:0,y:0})),false);receiver.close('test-end');signer.close();assert.deepEqual(released,[]);
});
test('a different key, lesson, grant or share cannot authenticate an input',async()=>{
 const teacher=await createRemoteInputSigner(binding),other=await createRemoteInputSigner(binding),packet=await teacher.sign({type:'move',x:0.1,y:0.2});let calls=0;
 const target={receive:()=>{calls++;return true;},close:()=>{}};
 for(const [current,key] of [[binding,other.publicKey],[{...binding,sessionId:'lesson-2'},teacher.publicKey],[{...binding,grantId:'grant-2'},teacher.publicKey],[{...binding,shareClaimId:'screen-2'},teacher.publicKey]] as const){const verifier=createSignedRemoteReceiver({binding:current,publicKey:key,receiver:target});assert.equal(verifier.receive(packet),false);}
 assert.equal(calls,0);teacher.close();other.close();
});
test('malformed data and invalid public keys cannot reach the adapter',async()=>{
 const signer=await createRemoteInputSigner(binding),packet=await signer.sign({type:'move',x:0.1,y:0.2});let calls=0;const receiver=createSignedRemoteReceiver({binding,publicKey:signer.publicKey,receiver:{receive:()=>{calls++;return true;},close:()=>{}}});
 for(const value of [{...packet,signature:'bad'}, {...packet,sequence:0}, {...packet,other:true}, {...packet,event:{type:'move',x:1e300,y:0}},null])assert.equal(receiver.receive(value),false);
 assert.throws(()=>createSignedRemoteReceiver({binding,publicKey:'A'.repeat(87),receiver:{receive:()=>true,close:()=>{}}}));assert.equal(calls,0);signer.close();
});
test('authenticated input silence releases held keys even while authorization is still valid',async()=>{
 const signer=await createRemoteInputSigner(binding),released:string[]=[];let now=0,timer:(()=>void)|undefined,reason='';
 const clock={now:()=>now,set:(fn:()=>void)=>{timer=fn;return 1;},clear:()=>{timer=undefined;}};
 const fence=createRemoteControlFence({grantId:binding.grantId,shareClaimId:binding.shareClaimId,adapter:{apply:()=>{},releaseKey:(code:string)=>released.push(code),releaseButton:()=>{}},onClose:(value:string)=>{reason=value;}});fence.renew({grantId:binding.grantId,shareClaimId:binding.shareClaimId},2000);
 const receiver=createSignedRemoteReceiver({binding,publicKey:signer.publicKey,receiver:fence,clock});
 assert.equal(receiver.receive(await signer.sign({type:'heartbeat'})),true);now=1000;assert.equal(receiver.receive(await signer.sign({type:'key',code:'KeyA',down:true})),true);now=2499;timer?.();assert.equal(reason,'');now=2500;timer?.();assert.equal(reason,'input-idle');assert.deepEqual(released,['KeyA']);assert.equal(receiver.receive(await signer.sign({type:'heartbeat'})),false);signer.close();
});
