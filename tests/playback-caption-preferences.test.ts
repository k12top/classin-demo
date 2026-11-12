import assert from "node:assert/strict";
import test from "node:test";
import {readPlaybackCaptionPreferences,writePlaybackCaptionPreferences} from "../src/lib/classroom/playback-caption-preferences";

test("replay caption settings survive denied browser storage and restore saved values",()=>{
  const unavailable=()=>{throw new Error("Storage denied");};
  assert.deepEqual(readPlaybackCaptionPreferences(unavailable),{mode:"off",language:"",appearance:{background:"solid",size:"medium",position:"bottom"}});
  assert.doesNotThrow(()=>writePlaybackCaptionPreferences(unavailable,{mode:"bilingual",language:"en",appearance:{background:"transparent",size:"large",position:"top"}}));
  const values=new Map<string,string>();
  const storage=()=>({getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}});
  const preferences={mode:"bilingual" as const,language:"en",appearance:{background:"transparent" as const,size:"large" as const,position:"top" as const}};
  writePlaybackCaptionPreferences(storage,preferences);
  assert.deepEqual(readPlaybackCaptionPreferences(storage),preferences);
  values.set("playback_caption_mode","invalid");values.set("playback_caption_size","invalid");
  const restored=readPlaybackCaptionPreferences(storage);
  assert.equal(restored.mode,"off");assert.equal(restored.appearance.size,"medium");
});
