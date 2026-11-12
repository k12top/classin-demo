import assert from 'node:assert/strict';
import test from 'node:test';
import {parseRemoteInput,remotePointFromVideo,remotePointToDisplay} from '../src/lib/classroom/remote-control-input';
test('map only visible video content, accounting for letterboxing and display offsets',()=>{
 const box={left:100,top:50,width:800,height:800},video={width:1920,height:1080};
 assert.equal(remotePointFromVideo(500,100,box,video),null);
 assert.deepEqual(remotePointFromVideo(500,450,box,video),{x:.5,y:.5});
 assert.deepEqual(remotePointToDisplay({x:0,y:0},{left:-1920,top:0,width:1920,height:1080}),{x:-1920,y:0});
 assert.deepEqual(remotePointToDisplay({x:1,y:1},{left:-1920,top:0,width:1920,height:1080}),{x:-1,y:1079});
 assert.equal(remotePointFromVideo(0,0,{...box,width:0},video),null);assert.equal(remotePointToDisplay({x:NaN,y:0},box),null);
});
test('reject malformed, excessive or command-shaped remote input',()=>{
 assert.deepEqual(parseRemoteInput({type:'button',x:.5,y:.2,button:'left',down:true}),{type:'button',x:.5,y:.2,button:'left',down:true});
 for(const value of [{type:'heartbeat',extra:true},{type:'move',x:-.1,y:.2},{type:'move',x:Infinity,y:0},{type:'move',x:.5,y:.5,command:'open'}, {type:'button',x:0,y:0,button:'unknown',down:true}, {type:'wheel',x:0,y:0,deltaX:1e9,deltaY:0}, {type:'key',code:'execute-command',down:true}])assert.equal(parseRemoteInput(value),null);
 assert.deepEqual(parseRemoteInput({type:'key',code:'KeyA',down:true}),{type:'key',code:'KeyA',down:true});
});

test('desktop receiver and sender agree on supported input shapes',async()=>{
 const {createRequire}=await import('node:module');const require=createRequire(import.meta.url);
 const {createRemoteControlFence}=require('../clients/desktop/src/remote-control-fence.cjs') as {createRemoteControlFence:(options:unknown)=>{renew:(binding:unknown,ms:number)=>boolean;receive:(packet:unknown)=>boolean;close:(reason:string)=>void}};
 const samples:unknown[]=[{type:'heartbeat'},{type:'heartbeat',extra:true},{type:'move',x:0,y:1},{type:'wheel',x:.5,y:.5,deltaX:0,deltaY:100},{type:'key',code:'NumpadEnter',down:true},{type:'button',x:1,y:0,button:'right',down:true},{type:'key',code:'Bad',down:true},{type:'move',x:5,y:0},{type:'move',x:0,y:0,extra:1}];
 for(const event of samples){const fence=createRemoteControlFence({grantId:'g',shareClaimId:'s',adapter:{apply:()=>{},releaseKey:()=>{},releaseButton:()=>{}}});fence.renew({grantId:'g',shareClaimId:'s'},1000);assert.equal(fence.receive({grantId:'g',sequence:1,event}),parseRemoteInput(event)!==null);fence.close('test');}
});
