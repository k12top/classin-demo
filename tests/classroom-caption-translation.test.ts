import * as crypto from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";
import { loadModule } from "./helpers/load-module";
import { shouldReusePersistedCaption } from "../src/lib/classroom/caption-idempotency";
import { runClaimedCaptionTranslation, captionTranslationState } from "../src/lib/classroom/caption-translation";
import { planCaptionTranslations } from "../src/lib/classroom/caption-routing";
type Row = Record<string, unknown> & {text: string;translations: Record<string,string>};
function fixture(translate: (input: Row)=>Promise<Row>, provider = "wordly", targets = ["en-US"]) {
 let active = 0, calls = 0, row: Row | null = null, revision = 1; const jobs=new Map<string, {noticeId:string;payload:Record<string,unknown>}>();let prepareFailure=false,commitFailure=false,prepareHook:(()=>Promise<void>)|null=null;
 const runtime={id:"runtime",status:"live",interpretationEnabled:true,interpretationProvider:provider,sourceLanguage:"zh-CN",targetLanguages:targets,revision};
 const lesson={id:"session",title:"lesson",roomUuid:"room",createdAt:new Date(Date.now()-86_400_000),endedAt:null as Date|null,recordings:[] as {stoppedAt:Date}[]};
 const tx={classroomCaption:{findUnique:async({where}:{where:{sessionId_externalId?:{externalId:string}}})=>!where.sessionId_externalId||!row||row.externalId===where.sessionId_externalId.externalId?row:null,upsert:async({create,update}:{create:Row;update:Row})=>{row={...(row?{...row,...update}:{id:"stored",createdAt:new Date(),...create}),updatedAt:new Date()} as Row;return row;},update:async({data}:{data:Partial<Row>})=>{if(commitFailure){commitFailure=false;throw Error("commit unavailable");}row={...row!,...data,updatedAt:new Date()};return row;}},classroomMemberState:{findUnique:async()=>null},classroomRuntime:{findUnique:async()=>({...runtime,revision}),update:async()=>({...runtime,revision:++revision})},classroomProviderEvent:{
 findUnique:async({where}:{where:{noticeId:string}})=>jobs.get(where.noticeId)||null,
 update:async({where,data}:{where:{noticeId:string};data:{payload:Record<string,unknown>}})=>{const value=structuredClone({...jobs.get(where.noticeId)!,...data});jobs.set(where.noticeId,value);return value;},
 updateMany:async({where,data}:{where:{noticeId:string;payload:{equals:unknown}};data:{payload:Record<string,unknown>}})=>{const current=jobs.get(where.noticeId);if(!current||JSON.stringify(current.payload)!==JSON.stringify(where.payload.equals))return {count:0};jobs.set(where.noticeId,structuredClone({...current,...data}));return {count:1};},
},$queryRaw:async()=>[]};
 const prisma={...tx,courseSession:{findUniqueOrThrow:async()=>lesson},classroomProviderEvent:{...tx.classroomProviderEvent,createMany:async({data}:{data:{noticeId:string;payload:Record<string,unknown>}[]})=>{const id=data[0].noticeId;if(jobs.has(id))return {count:0};jobs.set(id,structuredClone(data[0]));return {count:1};}},$transaction:async<T>(fn:(tx:unknown)=>Promise<T>)=>{active++;try{return await fn(tx);}finally{active--;}}};
 Object.assign(tx.classroomProviderEvent,{createMany:prisma.classroomProviderEvent.createMany});
 Object.assign(tx.classroomCaption,{findMany:async()=>row?[{...row}]:[]});
 Object.assign(prisma.classroomProviderEvent,{findMany:async({where}:{where:{noticeId:{in:string[]}}})=>[...jobs.values()].filter(job=>where.noticeId.in.includes(job.noticeId))});
 const api=loadModule<typeof import("../src/lib/classroom/server/captions")>("src/lib/classroom/server/captions.ts",{
 "./caption-routing":{resolveCaptionTranslations:async(provider: "wordly" | "shengwang", source: string, targets: string[])=>planCaptionTranslations(provider,source,targets,{configured:true,targetLanguages:["en-US","bm","chm"],maxTargetLanguages:10})},
 "server-only":{},"node:crypto":crypto,"../caption-translation":{runClaimedCaptionTranslation,captionTranslationState},"@/lib/db":{prisma},"@/lib/classroom/server/runtime":{ensureClassroomRuntime:async()=>runtime},"@/lib/course-room":{courseIdToRoomUuid:()=>"room"},"@/lib/classroom/languages":{normalizeTargetLanguages:(value:string[])=>value},"@/lib/classroom/caption-idempotency":{shouldReusePersistedCaption},"@/lib/classroom/translation/wordly":{ensureWordlyRoom:async()=>{assert.equal(active,0);if(prepareHook)await prepareHook();if(prepareFailure)throw Error("prepare failed");},translateCaptionWithWordly:async(_id:string,input:Row)=>{assert.equal(active,0,"paid provider must not run in DB transaction");calls++;return translate(input);}},
 });
 return {api,runtime,lesson,get calls(){return calls;},get row(){return row;},get jobs(){return jobs.size;},get ledger(){return jobs;},set prepareHook(value:(()=>Promise<void>)|null){prepareHook=value;},set prepareFailure(value:boolean){prepareFailure=value;},set commitFailure(value:boolean){commitFailure=value;}};
}
const input={id:"caption",text:"正文",speakerId:"teacher",speakerName:"老师",sourceLanguage:"zh-CN",detectedLanguage:"zh-CN",translations:{},isFinal:true,provider:"shengwang" as const,occurredAt:new Date().toISOString()};
test("partial speech commits without finality, and a late partial can add translation without reverting final text", async()=>{
 const f=fixture(async value=>value,"shengwang",[]);
 await f.api.ingestClassroomCaption("course",{...input,isFinal:false},"session");
 assert.equal(f.row?.isFinal,false);assert.equal(f.row?.text,"正文");
 await f.api.ingestClassroomCaption("course",input,"session");
 await f.api.ingestClassroomCaption("course",{...input,isFinal:false,translations:{"en-US":"Saved translation"}},"session");
 assert.equal(f.row?.isFinal,true);assert.equal(f.row?.translations["en-US"],"Saved translation");
 await f.api.ingestClassroomCaption("course",{...input,isFinal:false,text:"正",translations:{"en-US":"Stale"}},"session");
 assert.equal(f.row?.text,"正文");assert.equal(f.row?.translations["en-US"],"Saved translation");assert.equal(f.calls,0);
});
test("ended lessons accept buffered partials and late translations, including recordings without lesson.endedAt", async()=>{
 const f=fixture(async value=>value,"shengwang",[]);
 f.runtime.status="ended";f.runtime.interpretationEnabled=false;
 const end=new Date(Date.now()-3_600_000);f.lesson.recordings=[{stoppedAt:end}];
 const speech={...input,isFinal:false,occurredAt:new Date(end.getTime()-60_000).toISOString()};
 const result=await f.api.ingestClassroomCaption("course",speech,"session");
 assert.ok("caption" in result);assert.equal(f.row?.text,"正文");
 await f.api.ingestClassroomCaption("course",{...speech,occurredAt:new Date().toISOString(),translations:{"en-US":"Late"}},"session");
 assert.equal(f.row?.translations["en-US"],"Late");
 await assert.rejects(f.api.ingestClassroomCaption("course",{...input,id:"post-class",occurredAt:new Date().toISOString()},"session"),/outside this lesson/);
 assert.equal(f.calls,0);
});
test("mixed Shengwang and bridge captions merge late native translations without billing again", async()=>{
 const f=fixture(async value=>({...value,translations:{bm:"Bridge text"}}),"shengwang",["en-US","bm"]);
 const first=await f.api.ingestClassroomCaption("course",input,"session");
 assert.ok("caption" in first);assert.equal(first.caption.translations.bm,"Bridge text");
 const late=await f.api.ingestClassroomCaption("course",{...input,translations:{"en-US":"Agora text"}},"session");
 assert.ok("caption" in late);assert.deepEqual(late.caption.translations,{bm:"Bridge text","en-US":"Agora text"});assert.equal(f.calls,1);
 await f.api.ingestClassroomCaption("course",input,"session");assert.equal(f.calls,1);
});
test("Amharic subtitles stay on Shengwang and never dispatch a bridge transcript", async()=>{
 const f=fixture(async value=>value,"shengwang",["am-ET"]);
 await f.api.ingestClassroomCaption("course",{...input,translations:{"am-ET":"ሰላም"}},"session");
 assert.equal(f.calls,0);assert.equal(f.jobs,0);assert.equal(f.row?.translations["am-ET"],"ሰላም");
});
test("translation is outside transactions, original caption commits before provider wait; duplicate requests reserve once",async()=>{
 let finish!:(value:Row)=>void;let started!:()=>void;const began=new Promise<void>(r=>started=r);
 const f=fixture(async value=>{started();return new Promise<Row>(r=>{finish=()=>r({...value,translations:{"en-US":"Text"}});});});
 const first=f.api.ingestClassroomCaption("course",input,"session");await began;assert.equal(f.row?.text,"正文");assert.equal(f.row?.translations["en-US"],undefined);
 await f.api.ingestClassroomCaption("course",input,"session");assert.equal(f.calls,1);finish({} as Row);const result=await first;assert.ok("caption" in result);assert.equal(result.caption?.translations["en-US"],"Text");assert.equal(f.jobs,1);
});
test("provider timeout preserves original and does not automatically replay a possibly paid request",async()=>{
 const f=fixture(async()=>{throw Error("timeout")});const result=await f.api.ingestClassroomCaption("course",input,"session");assert.ok("caption" in result);assert.equal(result.caption?.text,"正文");assert.deepEqual(result.caption?.translations,{});await f.api.ingestClassroomCaption("course",input,"session");assert.equal(f.calls,1);
});
test("late translation for an old text cannot replace a correction",async()=>{
 let finish!:(value:Row)=>void;let started!:()=>void;const began=new Promise<void>(r=>started=r);
 const f=fixture(async value=>{if(value.text==="正文"){started();return new Promise<Row>(r=>finish=()=>r({...value,translations:{"en-US":"Old"}}));}return {...value,translations:{"en-US":"Corrected"}};});
 const old=f.api.ingestClassroomCaption("course",input,"session");await began;await f.api.ingestClassroomCaption("course",{...input,text:"更正"},"session");finish({} as Row);const result=await old;assert.ok("caption" in result);assert.equal(f.row?.text,"更正");assert.equal(f.row?.translations["en-US"],"Corrected");assert.equal(result.caption?.text,"更正");
});
test("commit failure keeps reservation outstanding; external translation is not retried",async()=>{
 let calls=0,failed=0;await assert.rejects(runClaimedCaptionTranslation({reserve:async()=>true,translate:async()=>{calls++;return "ok";},commit:async()=>{throw Error("DB commit failed")},fail:async()=>{failed++;}}),/DB commit failed/);assert.equal(calls,1);assert.equal(failed,0);
});

test("caption versions reject older final revisions and keep translations on duplicate delivery",async()=>{
 const {mergeCaptionSnapshots}=await import("../src/lib/classroom/caption-display");
 const base={...input,translations:{"de-DE":"Old text"},createdAt:"2026-10-21T01:00:00Z",updatedAt:"2026-10-21T01:00:02Z"};
 const newer={...base,text:"更正",translations:{"en-US":"Corrected"},updatedAt:"2026-10-21T01:00:03Z"};
 const merged=mergeCaptionSnapshots([newer],[base,{...base,isFinal:false}]);assert.equal(merged[0].text,"更正");assert.equal(merged[0].translations["en-US"],"Corrected");assert.equal(merged[0].translations["de-DE"],undefined);assert.deepEqual(mergeCaptionSnapshots(merged,[newer]),merged);
});

test("an incomplete provider response cannot report successful translation",async()=>{
 const f=fixture(async value=>({...value,translations:{}}));const result=await f.api.ingestClassroomCaption("course",input,"session");assert.ok("caption" in result);assert.equal(result.caption.text,"正文");assert.deepEqual(result.caption.translations,{});await f.api.ingestClassroomCaption("course",input,"session");assert.equal(f.calls,1);
});

test("saved translation survives DB commit failure and is recovered without a provider call",async()=>{
 const f=fixture(async value=>({...value,translations:{"en-US":"Saved text"}}));f.commitFailure=true;
 await assert.rejects(f.api.ingestClassroomCaption("course",input,"session"),/commit unavailable/);
 assert.equal([...f.ledger.values()][0].payload.state,"translated");assert.equal(f.calls,1);
 const recovered=await f.api.recoverClassroomCaptionTranslation("course","session","caption");assert.ok("caption" in recovered);assert.equal(recovered.caption.translations["en-US"],"Saved text");assert.equal(recovered.caption.translationStatus,"completed");assert.equal(f.calls,1);
});
test("only explicit recovery retries a failed preparation before any transcript request",async()=>{
 const f=fixture(async value=>({...value,translations:{"en-US":"Text"}}));f.prepareFailure=true;
 const failed=await f.api.ingestClassroomCaption("course",input,"session");assert.ok("caption" in failed);assert.equal(failed.caption.translationStatus,"failed");assert.equal(f.calls,0);
 f.prepareFailure=false;await f.api.ingestClassroomCaption("course",input,"session");assert.equal(f.calls,0);
 const restored=await f.api.recoverClassroomCaptionTranslation("course","session","caption");assert.ok("caption" in restored);assert.equal(restored.caption.translationStatus,"completed");assert.equal(f.calls,1);
});
test("explicit recovery never replays a timed-out paid request or a legacy ambiguous reservation",async()=>{
 const f=fixture(async()=>{throw Error("timeout")});await f.api.ingestClassroomCaption("course",input,"session");
 const result=await f.api.recoverClassroomCaptionTranslation("course","session","caption");assert.ok("caption" in result);assert.equal(result.caption.translationStatus,"unknown");assert.equal(f.calls,1);
 const job=[...f.ledger.values()][0];job.payload={...job.payload,state:"running"};await f.api.recoverClassroomCaptionTranslation("course","session","caption");assert.equal(f.calls,1);
});
test("reservation state makes stale preparations retryable but stale dispatched requests unknown",()=>{
 const at=new Date(Date.now()-90_000).toISOString();assert.equal(captionTranslationState({state:"preparing",at}),"failed");assert.equal(captionTranslationState({state:"requesting",at}),"unknown");assert.equal(captionTranslationState({state:"requesting",at:new Date().toISOString()}),"pending");assert.equal(captionTranslationState({state:"translated"}),"recoverable");
});

test("snapshot exposes a real unknown reservation instead of silently displaying untranslated text",async()=>{
 const f=fixture(async()=>{throw Error("timeout")});await f.api.ingestClassroomCaption("course",input,"session");const captions=await f.api.getClassroomCaptions("course",100,"session");assert.equal(captions[0].translationStatus,"unknown");assert.equal(captions[0].text,"正文");assert.equal(f.calls,1);
});
test("a delayed preparation failure cannot overwrite a newer owner's requesting reservation",async()=>{
 let begun!:()=>void,fail!:()=>void;const started=new Promise<void>(r=>begun=r);const f=fixture(async value=>({...value,translations:{"en-US":"Text"}}));f.prepareHook=()=>{begun();return new Promise<void>((_resolve,reject)=>{fail=()=>reject(Error("late prepare failure"));});};
 const pending=f.api.ingestClassroomCaption("course",input,"session");await started;const job=[...f.ledger.values()][0];job.payload={...job.payload,claim:"new-owner",state:"requesting"};fail();await pending;assert.equal([...f.ledger.values()][0].payload.claim,"new-owner");assert.equal([...f.ledger.values()][0].payload.state,"requesting");assert.equal(f.calls,0);
});
