import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { loadModule } from "./helpers/load-module";
import * as playback from "../src/lib/classroom/recording-playback";

test("HLS manifest stays authenticated and signs media directly while preserving nested manifest auth",async()=>{
  let identity:object|null={userId:"student"},allowed=true,gets=0;
  const mp4="recordings/lesson/task/rec_0.mp4",hls="recordings/lesson/task/rec.m3u8";
  let manifest='#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.key"\n#EXTINF:6,\nseg.ts\nchild/index.m3u8\n#EXT-X-ENDLIST';
  const signed:string[]=[];
  const api=loadModule<typeof import("../src/app/api/sessions/[sessionId]/recordings/[recordingId]/play/route")>("src/app/api/sessions/[sessionId]/recordings/[recordingId]/play/route.ts",{
    "@/lib/session":{getSessionFromRequest:async()=>identity},"@/lib/courseware-access":{resolveCoursewareAccess:async()=>({allowed})},
    "@/lib/db":{prisma:{classroomRecording:{findFirst:async()=>({courseId:"course",status:"completed",playbackObjectKey:mp4,playbackFormat:"mp4",files:[{fileName:mp4},{fileName:hls}]})}}},
    "@/lib/classroom/recording-playback":playback,
    "@/lib/aliyun-oss":{CoursewareStorageConfigurationError:class extends Error{},getCoursewareOssClient:()=>({get:async()=>{gets++;return{content:Buffer.from(manifest)}},signatureUrl:(key:string,options:{expires:number})=>{assert.equal(options.expires,21600);signed.push(key);return "https://media.test/"+key+"?signature=test";}})},
  },{console:{error:()=>{}}});
  const context={params:Promise.resolve({sessionId:"lesson",recordingId:"task"})};
  const req=()=>new NextRequest("https://classroom.test/api/sessions/lesson/recordings/task/play?asset="+encodeURIComponent(hls));
  const r=await api.GET(req(),context);assert.equal(r.status,200);assert.equal(r.headers.get("cache-control"),"private, no-store");
  const body=await r.text();assert.match(body,/https:\/\/media.test\/recordings\/lesson\/task\/seg.ts\?signature=test/);
  assert.match(body,/hlsAsset=recordings%2Flesson%2Ftask%2Fchild%2Findex.m3u8/);assert.deepEqual(signed,["recordings/lesson/task/key.key","recordings/lesson/task/seg.ts"]);
  manifest="#EXTM3U\n../../secret.ts";assert.equal((await api.GET(req(),context)).status,500);assert.equal(signed.length,2);
  allowed=false;assert.equal((await api.GET(req(),context)).status,403);identity=null;assert.equal((await api.GET(req(),context)).status,401);assert.equal(gets,2);
});
