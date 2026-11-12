import assert from "node:assert/strict";
import test from "node:test";
import {workspacePreviewKind,workspacePreviewable} from "../src/lib/workspace-preview-kind";
import {readWorkspaceTextPreview,TEXT_PREVIEW_LIMIT} from "../src/lib/workspace-text-preview";

test("preview routing recognizes media and PDF without treating active files as media",()=>{
 assert.equal(workspacePreviewKind("lesson.MP4"),"video");
 assert.equal(workspacePreviewKind("lesson.mp3"),"audio");
 assert.equal(workspacePreviewKind("lesson.PDF"),"pdf");
 assert.equal(workspacePreviewKind("lesson.JPEG"),"image");
 assert.equal(workspacePreviewKind("notes.TXT"),"text");
 assert.equal(workspacePreviewKind("notes.json"),"text");
 assert.equal(workspacePreviewKind("notes.txt.html"),"document");
 assert.equal(workspacePreviewKind("lesson.svg"),"document");
 assert.equal(workspacePreviewKind("lesson.png.html"),"document");
 assert.equal(workspacePreviewKind("lesson.pdf.html"),"document");
 for(const name of ["notes.TXT","lesson.md","results.csv","data.JSON","lesson.pdf","photo.webp","clip.mp4","audio.mp3"])assert.equal(workspacePreviewable(name),true,name);
 for(const name of ["notes.txt.html","lesson.svg","lesson.pdf.html"])assert.equal(workspacePreviewable(name),false,name);
});

test("text preview decodes split UTF-8 and bounds large files",async()=>{
 const encoded=new TextEncoder().encode("课堂 <script>alert(1)</script>");
 const stream=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(encoded.slice(0,2));controller.enqueue(encoded.slice(2));controller.close();}});
 assert.deepEqual(await readWorkspaceTextPreview(new Response(stream)),{text:"课堂 <script>alert(1)</script>",truncated:false});
 const oversized=new Response(new Uint8Array(TEXT_PREVIEW_LIMIT+100).fill(65));
 const result=await readWorkspaceTextPreview(oversized);
 assert.equal(result.truncated,true);assert.equal(result.text.length,TEXT_PREVIEW_LIMIT);
 assert.deepEqual(await readWorkspaceTextPreview(new Response(new Uint8Array(TEXT_PREVIEW_LIMIT).fill(65))),{text:"A".repeat(TEXT_PREVIEW_LIMIT),truncated:false});
 await assert.rejects(readWorkspaceTextPreview(new Response("no",{status:403})));
});
