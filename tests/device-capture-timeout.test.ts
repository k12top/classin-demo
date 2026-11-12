import test from "node:test";
import assert from "node:assert/strict";
import {withDeviceCaptureTimeout} from "../src/lib/classroom/device-capture-timeout";

test("timed-out device checks stop every track when permission resolves later",async()=>{
 let resolve!:(stream:{getTracks:()=>{stop:()=>void}[]})=>void,stopped=0;
 const capture=new Promise<{getTracks:()=>{stop:()=>void}[]}>(done=>{resolve=done;});
 const pending=withDeviceCaptureTimeout(capture,stream=>stream.getTracks().forEach(track=>track.stop()),10);
 await assert.rejects(pending,/DEVICE_CAPTURE_TIMEOUT/);
 resolve({getTracks:()=>[{stop:()=>stopped++},{stop:()=>stopped++}]});
 await new Promise(setImmediate);assert.equal(stopped,2);
});

test("device failures propagate and successful tracks remain open",async()=>{
 let disposed=false;
 await assert.rejects(withDeviceCaptureTimeout(Promise.reject(new Error("denied")),()=>{disposed=true;}),/denied/);
 assert.equal(await withDeviceCaptureTimeout(Promise.resolve("device"),()=>{disposed=true;}),"device");
 assert.equal(disposed,false);
});
