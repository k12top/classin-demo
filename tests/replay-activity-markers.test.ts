import test from "node:test";
import assert from "node:assert/strict";
import {replayActivityMarkers} from "../src/lib/classroom/replay-activity-markers";

test("markers use the selected recording's real time boundaries and exclude unknown, cancelled and outside activities",()=>{
 const recording={id:"segment",startedAt:"2026-01-01T00:00:00Z",stoppedAt:"2026-01-01T00:01:40Z"};
 const rows=[
  {id:"end",title:"End",startedAt:"2026-01-01T00:01:40Z",status:"closed"},
  {id:"inside",title:"Inside",startedAt:"2026-01-01T00:00:25Z",status:"closed"},
  {id:"gap",title:"Outside",startedAt:"2026-01-01T00:02:00Z",status:"closed"},
  {id:"cancelled",title:"Cancelled",startedAt:"2026-01-01T00:00:10Z",status:"cancelled"},
  {id:"draft",title:"Draft",startedAt:null,status:"draft"},
 ];
 assert.deepEqual(replayActivityMarkers(rows,recording).map(m=>[m.id,m.seconds,m.fraction]),[["inside",25,.25],["end",100,1]]);
 assert.deepEqual(replayActivityMarkers(rows,{...recording,stoppedAt:null}),[]);
 assert.deepEqual(replayActivityMarkers(rows,{...recording,stoppedAt:recording.startedAt}),[]);
});
