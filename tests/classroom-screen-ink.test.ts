import assert from "node:assert/strict";
import test from "node:test";
import { screenInkRegion } from "../src/lib/classroom/whiteboard/screen-ink";
import { createScreenAnnotationController, insertDesktopScreenInk } from "../src/lib/classroom/whiteboard/screen-annotations";
import type { Room, View } from "white-web-sdk";

const stroke={points:[{x:0.25,y:0.25},{x:0.75,y:0.75}],width:0.01,aspect:9/16,color:"#ff0000"};
test("desktop ink maps normalized screen coordinates into the shared scene",()=>{
 const region=screenInkRegion(stroke)!;
 assert.equal(region.centerX,0);assert.equal(region.centerY,0);assert.equal(region.strokeWidth,12.8);
 assert.equal(region.points[0].x,320);assert.equal(region.points[0].y,180);
 assert.equal(screenInkRegion({...stroke,points:[{x:1.1,y:0.5}]}),null);
 assert.equal(screenInkRegion({...stroke,points:Array.from({length:2049},()=>({x:0,y:0}))}),null);
 assert.equal(screenInkRegion({...stroke,aspect:Infinity}),null);
});

test("screen ink requires an HTTPS upload and rejects a stale session",async()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,"document"),calls:unknown[]=[];
 const context={beginPath(){},moveTo(){},lineTo(){},stroke(){},arc(){},fill(){}};
 const canvas={width:0,height:0,getContext:()=>context,toDataURL:()=>"data:image/png;base64,dGVzdA=="};
 const room={phase:"connected",isWritable:true} as unknown as Room;
 const view={insertImage:(value:unknown)=>calls.push(value),completeImageUpload:(_id:string,data:string)=>calls.push(data)} as unknown as View;
 try {
  Object.defineProperty(globalThis,"document",{configurable:true,value:{createElement:()=>canvas}});
  const upload=async()=>"https://example.test/ink.png";
  assert.equal(await insertDesktopScreenInk(room,view,stroke,()=>true,upload),true);
  assert.equal((calls[0] as {centerX:number}).centerX,0);assert.equal((calls[0] as {locked:boolean}).locked,true);
  assert.equal(calls[1],"https://example.test/ink.png");
  const controller=createScreenAnnotationController(room,view,{dataset:{}} as HTMLDivElement,()=>true);
  assert.equal(await controller.insertDesktopInk?.(stroke,upload),true);assert.equal(calls.length,4);
  assert.equal(await insertDesktopScreenInk(room,view,stroke,()=>true,async()=>"data:image/png;base64,dGVzdA=="),false);
  let active=true;assert.equal(await insertDesktopScreenInk(room,view,stroke,()=>active,async()=>{active=false;return 'https://example.test/ink.png'}),false);
  assert.equal(await insertDesktopScreenInk(room,view,stroke,()=>false,upload),false);assert.equal(calls.length,4);
  Object.assign(room,{phase:"disconnected"});assert.equal(await controller.insertDesktopInk?.(stroke,upload),false);assert.equal(calls.length,4);
 } finally {if(original)Object.defineProperty(globalThis,"document",original);else Reflect.deleteProperty(globalThis,"document");}
});
