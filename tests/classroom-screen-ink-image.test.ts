import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { normalizeScreenInkImage } from "../src/lib/classroom/server/screen-ink-image";

test("normalization preserves transparent screen ink and its dimensions",async()=>{
 const raw=Buffer.from([255,0,0,255,0,0,0,0]);
 const png=await sharp(raw,{raw:{width:2,height:1,channels:4}}).png().toBuffer();
 const result=await normalizeScreenInkImage(png),decoded=await sharp(result.data).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 assert.equal(result.contentType,"image/webp");assert.equal(result.width,2);assert.equal(result.height,1);
 assert.deepEqual([...decoded.data],[255,0,0,255,0,0,0,0]);
});
test("normalization rejects non-PNG, opaque, corrupt and oversized inputs",async()=>{
 const opaque=await sharp({create:{width:1,height:1,channels:3,background:"red"}}).png().toBuffer();
 const jpeg=await sharp({create:{width:1,height:1,channels:3,background:"red"}}).jpeg().toBuffer();
 for(const invalid of [opaque,jpeg,Buffer.from('bad'),Buffer.alloc(2*1024*1024+1)])await assert.rejects(normalizeScreenInkImage(invalid));
});
