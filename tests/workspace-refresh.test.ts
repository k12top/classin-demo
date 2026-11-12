import test from "node:test";
import assert from "node:assert/strict";
import {watchWorkspaceRefresh,WORKSPACE_REFRESH_INTERVAL_MS} from "../src/lib/workspace-refresh";
import {WORKSPACE_LESSON_CHANGED_EVENT} from "../src/lib/workspace-lesson-events";

test("workspace refreshes on visible focus, reconnect, local changes and its timer, then cleans up",()=>{
 const win=new EventTarget(),doc=new EventTarget();let online=true,visible:DocumentVisibilityState="visible",tick:()=>void=()=>{},cleared=false,refreshes=0;
 const env={window:Object.assign(win,{setInterval:(callback:()=>void,ms:number)=>{assert.equal(ms,WORKSPACE_REFRESH_INTERVAL_MS);tick=callback;return 1;},clearInterval:(id:number)=>{assert.equal(id,1);cleared=true;}}) as unknown as Window,
  document:Object.assign(doc,{get visibilityState(){return visible;}}) as unknown as Document,isOnline:()=>online};
 // Object.assign evaluates getters, so keep visibility dynamic for the checks below.
 Object.defineProperty(env.document,"visibilityState",{get:()=>visible});
 const stop=watchWorkspaceRefresh(()=>refreshes++,env);
 win.dispatchEvent(new Event("focus"));win.dispatchEvent(new Event(WORKSPACE_LESSON_CHANGED_EVENT));tick();assert.equal(refreshes,3);
 visible="hidden";doc.dispatchEvent(new Event("visibilitychange"));tick();assert.equal(refreshes,3);
 visible="visible";online=false;win.dispatchEvent(new Event("online"));tick();assert.equal(refreshes,3);
 online=true;win.dispatchEvent(new Event("online"));doc.dispatchEvent(new Event("visibilitychange"));assert.equal(refreshes,5);
 stop();assert.equal(cleared,true);win.dispatchEvent(new Event("focus"));doc.dispatchEvent(new Event("visibilitychange"));assert.equal(refreshes,5);
});
