/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS DOM test harness executed by Node. */
/* DOM simulation only: mock HTTP/OSS, no browser automation or real uploads.
 * Run with CLASSROOM_JSDOM_MODULE pointing to an existing jsdom installation when needed.
 * CaptionSelect is replaced by native selects here; the SSR component test renders real selectors.
 */
const path = require('node:path');
const fs = require('node:fs');
const { buildSync } = require('esbuild');
const root = path.resolve(__dirname, '../..');
const code = `
const React=require('react'),{act}=React,{createRoot}=require('react-dom/client');
const {JSDOM}=require(process.env.CLASSROOM_JSDOM_MODULE||'jsdom');
const assert=require('node:assert/strict');
import {CoursewareUploader} from './src/components/courseware-uploader';
import {CaptionsPanel} from './src/components/classroom/captions-panel';
const dom=new JSDOM('<div id="root"></div>',{url:'https://classroom.test/'});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class{observe(){}disconnect(){}}});
const app=createRoot(document.getElementById('root'));
const render=async element=>act(async()=>app.render(element));
let requests=[],refreshed=0,mode='deny-sign',release;
globalThis.fetch=async(url,options)=>{requests.push({url,method:options?.method});
 if(url.endsWith('/upload-url')){
  if(mode==='pending')await new Promise(r=>{release=r});
  return Response.json(mode==='deny-sign'?{error:'Only the teacher can upload courseware',code:'COURSEWARE_UPLOAD_FORBIDDEN'}:{objectKey:'course/mock.pptx',uploadUrl:'https://storage.test/mock',contentType:'application/octet-stream'},{status:mode==='deny-sign'?403:200});
 }
 if(url==='https://storage.test/mock')return new Response(null,{status:mode==='storage-fail'?500:200});
 return Response.json(mode==='deny-create'?{error:'Forbidden'}:{courseware:{id:'file'}},{status:mode==='deny-create'?403:201});
};
const upload=canUpload=>React.createElement(CoursewareUploader,{key:canUpload?'allowed':'denied',courseId:'course',canUpload,onUploaded:async()=>{refreshed++}});
const file=async()=>act(async()=>{const input=document.querySelector('input[type=file]');Object.defineProperty(input,'files',{value:[new window.File(['mock'],'lesson.pptx',{type:'application/octet-stream'})],configurable:true});input.dispatchEvent(new window.Event('change',{bubbles:true}))});
const submit=()=>document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
const alert=()=>document.querySelector('[role=alert]')?.textContent||'';
(async()=>{
 await render(upload(false));assert(document.querySelector('button[type=submit]').disabled);assert(alert().includes('授课教师分配'));assert.equal(requests.length,0);
 console.log('PASS upload capability: explicit denied state, disabled form and localized alert');
 await render(upload(true));await file();await act(async()=>submit());assert.equal(requests.length,1);assert(alert().includes('授课教师分配'));assert(!alert().includes('Only the teacher'));assert.equal(document.querySelector('input[type=file]').files.length,1);assert.equal(refreshed,0);
 console.log('PASS signing 403: localized feedback, file retained, no OSS or registration request');
 mode='deny-create';requests=[];await act(async()=>submit());assert.equal(requests.length,3);assert(alert().includes('授课教师分配'));assert.equal(refreshed,0);assert(!document.querySelector('[role=status]'));
 console.log('PASS registration 403: retry remains available and no success is fabricated');
 mode='storage-fail';requests=[];await act(async()=>submit());assert.equal(requests.length,2);assert(alert().includes('OSS'));assert.equal(refreshed,0);
 console.log('PASS storage failure: registration is not attempted');
 mode='pending';requests=[];await act(async()=>{submit();submit()});assert.equal(requests.length,1);assert(document.querySelector('button[type=submit]').disabled);assert.equal(document.querySelector('form').getAttribute('aria-busy'),'true');assert(document.body.textContent.includes('上传'));
 await act(async()=>release());assert.equal(requests.length,3);assert.equal(refreshed,1);assert(document.querySelector('[role=status]').textContent.includes('已上传'));assert.equal(document.querySelector('input:not([type=file])').value,'');
 console.log('PASS upload pending/success: duplicate suppression, locked controls, confirmed registration and library refresh');
 const runtime={status:'live',interpretation:{enabled:true,provider:'shengwang',sourceLanguage:'zh-CN',targetLanguages:['en-US'],status:'running',error:null}};
 let applied,saveSuccess=false;
 const captions=canManage=>React.createElement(CaptionsPanel,{runtime,captions:[],availability:{shengwang:true,wordly:true},canManage,displayMode:'bilingual',overlayVisible:true,preferredLanguage:'en-US',onRetryPreference(){},onApplySettings:async settings=>{applied=settings;return saveSuccess}});
 await render(captions(true));await act(async()=>document.querySelector('.classroom-v3-caption-settings-summary').click());
 let card=document.querySelector('.classroom-v3-caption-settings-card');assert(card.querySelector('.classroom-v3-caption-toggles').compareDocumentPosition(card.querySelector('.classroom-v3-caption-view-settings'))&Node.DOCUMENT_POSITION_FOLLOWING);
 const toggles=[...card.querySelectorAll('.classroom-v3-caption-toggles button')];assert.deepEqual(toggles.map(b=>b.getAttribute('aria-label')),['舞台字幕浮窗','课堂同传']);
 await act(async()=>toggles.forEach(b=>b.click()));
 const selects=[...card.querySelectorAll('select')];await act(async()=>{selects[1].value='fr-FR';selects[1].dispatchEvent(new window.Event('change',{bubbles:true}));selects[2].value='en-US';selects[2].dispatchEvent(new window.Event('change',{bubbles:true}))});
 await act(async()=>card.querySelector('.classroom-v3-interpretation-save').click());assert.equal(applied.overlayVisible,false);assert.equal(applied.preferredLanguage,'fr-FR');assert.equal(applied.displayMode,'bilingual');assert.equal(applied.interpretation.enabled,false);assert.equal(applied.interpretation.sourceLanguage,'en-US');assert(document.querySelector('[role=alert]'));assert.equal(document.querySelector('.classroom-v3-caption-settings-disclosure').getAttribute('data-open'),'true');
 saveSuccess=true;await act(async()=>card.querySelector('.classroom-v3-interpretation-save').click());assert.equal(document.querySelector('.classroom-v3-caption-settings-disclosure').getAttribute('data-open'),'false');
 console.log('PASS captions: top switch order, source/display/translation settings retained, failed apply stays open and retry succeeds');
 await render(captions(false));await act(async()=>document.querySelector('.classroom-v3-caption-settings-summary').click());assert.equal(document.querySelectorAll('.classroom-v3-caption-toggles button').length,1);assert(!document.querySelector('[aria-label="课堂同传"]'));
 console.log('PASS student captions: personal overlay retained, teacher-only controls absent');
 const pendingCaption={id:'recover-caption',text:'原文',speakerId:'teacher',speakerName:'老师',provider:'wordly',sourceLanguage:'zh-CN',detectedLanguage:'zh-CN',translations:{},isFinal:true,occurredAt:new Date().toISOString(),createdAt:new Date().toISOString()};
 let recoveryCalls=0,finishRecovery;
 const recoveryPanel=(state,canManage=true)=>React.createElement(CaptionsPanel,{runtime,captions:[{...pendingCaption,translationStatus:state}],availability:{shengwang:true,wordly:true},canManage,displayMode:'bilingual',overlayVisible:true,preferredLanguage:'en-US',onRetryPreference(){},onApplySettings:async()=>true,onRecoverTranslation:async()=>{recoveryCalls++;return new Promise(r=>finishRecovery=r)}});
 await render(recoveryPanel('unknown'));assert(document.querySelector('[data-translation-state=unknown]'));assert.equal(document.querySelector('[data-translation-state] button'),null);
 await render(recoveryPanel('recoverable'));let recoveryButton=document.querySelector('[data-translation-state] button');await act(async()=>{recoveryButton.click();recoveryButton.click()});assert.equal(recoveryCalls,1);assert.equal(recoveryButton.disabled,true);await act(async()=>finishRecovery(false));assert(document.querySelector('[data-translation-state] [role=alert]'));assert.equal(document.querySelector('[data-translation-state] button').disabled,false);
 await render(recoveryPanel('failed',false));assert.equal(document.querySelector('[data-translation-state] button'),null);await render(recoveryPanel('pending'));assert(document.querySelector('[data-translation-state=pending]'));console.log('PASS caption translation recovery: pending/unknown/failed/saved states, teacher-only controls, duplicate lock and accurate failure');await act(async()=>app.unmount());
})().catch(error=>{console.error(error);process.exitCode=1});
`;
const output = path.join(root, '.verification/courseware-upload-dom.cjs');
fs.mkdirSync(path.dirname(output), { recursive: true });
const i18n = `export {useTranslation} from '${path.join(root, 'tests/fixtures/caption-order-i18n.ts')}';`;
const select = `import React from 'react';export function CaptionSelect({label,value,options,disabled,onChange}){return <label>{label}<select value={value} disabled={disabled} onChange={e=>onChange(e.target.value)}>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>}`;
fs.writeFileSync(path.join(root,'.verification/upload-i18n.ts'), i18n);
fs.writeFileSync(path.join(root,'.verification/upload-caption-select.tsx'), select);
buildSync({ absWorkingDir: root, stdin: { contents: code, resolveDir: root, loader: 'tsx' }, bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic', outfile: output,
  external: ['react','react-dom/client','node:assert/strict'],
  tsconfig: path.join(root,'tsconfig.json'),
  alias: { '@/lib/i18n/context': path.join(root,'.verification/upload-i18n.ts'), '@/components/classroom/caption-select': path.join(root,'.verification/upload-caption-select.tsx') },
  plugins: [],
});
require(output);
