import assert from "node:assert/strict";
import test from "node:test";
import {closeBrowserClassroomWindow,openClassroomWindow,openDesktopClassroom,reserveClassroomWindow} from "../src/lib/classroom/open-desktop-window";

test("classroom entry uses the desktop window bridge and rejects other origins", async () => {
 const original=Object.getOwnPropertyDescriptor(globalThis,"window");
 let opened="";
 try {
  Object.defineProperty(globalThis,"window",{configurable:true,value:{location:{origin:"https://example.test"},classroomDesktop:{enterClassroom:async(url:string)=>{opened=url;return {ok:true};}}}});
  assert.equal(await openDesktopClassroom(new URL("https://example.test/classroom?sessionId=lesson")),true);
  assert.equal(opened,"https://example.test/classroom?sessionId=lesson");
  await assert.rejects(openDesktopClassroom(new URL("https://elsewhere.test/classroom?sessionId=lesson")));
  Object.defineProperty(globalThis,"window",{configurable:true,value:{location:{origin:"https://example.test"}}});
  assert.equal(await openDesktopClassroom(new URL("https://example.test/classroom?sessionId=lesson")),false);
  Object.defineProperty(globalThis,"window",{configurable:true,value:{location:{origin:"https://example.test"},classroomDesktop:{enterClassroom:async()=>({ok:false,error:"Existing classroom"})}}});
  await assert.rejects(openDesktopClassroom(new URL("https://example.test/classroom?sessionId=lesson")),/Existing classroom/);
 } finally {if(original)Object.defineProperty(globalThis,"window",original);else Reflect.deleteProperty(globalThis,"window");}
});

test("only marked browser classroom windows are candidates for closing", () => {
 const original=Object.getOwnPropertyDescriptor(globalThis,"window");let closed=0;
 try {
  Object.defineProperty(globalThis,"window",{configurable:true,value:{sessionStorage:{getItem:()=>"1"},close:()=>closed++}});
  assert.equal(closeBrowserClassroomWindow(),true);assert.equal(closed,1);
  Object.defineProperty(globalThis,"window",{configurable:true,value:{sessionStorage:{getItem:()=>null},close:()=>closed++}});
  assert.equal(closeBrowserClassroomWindow(),false);assert.equal(closed,1);
  Object.defineProperty(globalThis,"window",{configurable:true,value:{get sessionStorage(){throw new Error("blocked")}}});
  assert.equal(closeBrowserClassroomWindow(),false);
 } finally {if(original)Object.defineProperty(globalThis,"window",original);else Reflect.deleteProperty(globalThis,"window");}
});

test("browser reserves a separate window before verification and navigates only to the validated classroom", async () => {
 const original=Object.getOwnPropertyDescriptor(globalThis,"window");let destination="";
 const originalDocument=Object.getOwnPropertyDescriptor(globalThis,"document");
 const child={opener:{},closed:false,document:{title:"",body:{textContent:""}},location:{replace:(url:string)=>{destination=url;}}};
 try {
  Object.defineProperty(globalThis,"document",{configurable:true,value:{documentElement:{lang:"zh-CN"}}});
  Object.defineProperty(globalThis,"window",{configurable:true,value:{location:{origin:"https://example.test"},open:()=>child}});
  const reserved=reserveClassroomWindow();assert.equal(reserved,child);assert.equal(child.opener,null);assert.equal(child.document.body.textContent,"正在进入课堂…");
  await assert.rejects(openClassroomWindow(new URL("https://evil.test/classroom"),reserved));assert.equal(destination,"");
  assert.equal(await openClassroomWindow(new URL("https://example.test/classroom?sessionId=lesson"),reserved),true);
  assert.equal(destination,"https://example.test/classroom?sessionId=lesson");
  child.closed=true;await assert.rejects(openClassroomWindow(new URL("https://example.test/classroom"),reserved),/已关闭/);
  Object.defineProperty(globalThis,"window",{configurable:true,value:{open:()=>null}});assert.throws(()=>reserveClassroomWindow(),/弹出窗口/);
 } finally {if(original)Object.defineProperty(globalThis,"window",original);else Reflect.deleteProperty(globalThis,"window");if(originalDocument)Object.defineProperty(globalThis,"document",originalDocument);else Reflect.deleteProperty(globalThis,"document");}
});
