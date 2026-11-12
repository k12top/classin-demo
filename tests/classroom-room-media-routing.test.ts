import test from "node:test";
import assert from "node:assert/strict";
import {controlsAssignedRoomMedia,muteMainBeforeRoom} from "../src/lib/classroom/room-media-routing";

test("only assigned assistants and offstage students control their connected group media",()=>{
 const common={mode:"largeClass",roomConnected:true,roomMember:true,studentOnStage:false};
 assert.equal(controlsAssignedRoomMedia({...common,role:"assistant"}),true);
 assert.equal(controlsAssignedRoomMedia({...common,role:"assistant",roomMember:false}),false);
 assert.equal(controlsAssignedRoomMedia({...common,role:"assistant",roomConnected:false}),false);
 assert.equal(controlsAssignedRoomMedia({...common,role:"teacher"}),false);
 assert.equal(controlsAssignedRoomMedia({...common,role:"observer"}),false);
 assert.equal(controlsAssignedRoomMedia({...common,role:"student"}),true);
 assert.equal(controlsAssignedRoomMedia({...common,role:"student",studentOnStage:true}),false);
 assert.equal(controlsAssignedRoomMedia({...common,role:"assistant",mode:"smallClass"}),false);
});

test("switch waits for the main microphone to mute and fails closed if it cannot",async()=>{
 let on=true,finish!:()=>void;
 const provider={getSnapshot:()=>({local:{microphoneOn:on}}),muteMicrophone:()=>new Promise<void>(resolve=>{finish=()=>{on=false;resolve();};})};
 let ready=false;const pending=muteMainBeforeRoom(provider).then(()=>{ready=true;});
 await Promise.resolve();assert.equal(ready,false);finish();await pending;assert.equal(ready,true);
 on=true;await assert.rejects(muteMainBeforeRoom({getSnapshot:provider.getSnapshot}),/unavailable/);
 await assert.rejects(muteMainBeforeRoom({getSnapshot:provider.getSnapshot,muteMicrophone:async()=>{}}),/still-on/);
});
