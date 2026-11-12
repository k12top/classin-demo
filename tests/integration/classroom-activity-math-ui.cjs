/* eslint-disable @typescript-eslint/no-require-imports -- Real classroom components in Electron with simulated API responses. */
const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict'),esbuild=require('esbuild'),http=require('node:http'),path=require('node:path'),fs=require('node:fs/promises');
const root=path.resolve(__dirname,'../..');let win,server;
async function main(){
 const source=`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{I18nProvider}from'@/lib/i18n/context';import{ActivityQuickCreator}from'@/components/classroom/activity-quick-creator';import{AnswerForm,QuestionPreview}from'@/components/classroom/activity-workspace';import{ActivityOverviewCharts}from'@/components/classroom/activity-overview-charts';
 const question={id:'q1',type:'single',prompt:'已知一元二次方程 $ax^2 + bx + c = 0$ （其中 $a \\\\neq 0$），请说明求根公式的推导步骤并判断实根数量',points:10,options:[{id:'a',text:'$\\\\frac{1}{2}$'},{id:'b',text:'2'}],correct:['a'],explanation:'因为 $x=1$'};const definition={questions:[question]};
 const quality={correct:1,incorrect:0,partial:0,pending:0,withheld:0,earnedPoints:10,gradedPoints:10};const overview={canManage:true,live:false,activityCount:1,questionCount:1,studentCount:1,submissions:1,participation:100,accuracy:100,quality,students:[],activities:[{id:'activity',title:'求 $x^2$ 的值',kind:'quiz',status:'closed',questionCount:1,responseCount:1,startedAt:'2026-11-08T00:00:00Z',accuracy:100,quality,questions:[{id:'q1',prompt:question.prompt,accuracy:100,quality,responseCount:1}]}]};
 window.fetch=async()=>Response.json({draft:{title:'题目',kind:'quiz',durationSec:null,definition}});
 function Fixture(){const [draft,setDraft]=useState(null);return <I18nProvider initialLocale="zh-CN"><ActivityQuickCreator sessionId="s" open hasActive={false} onClose={()=>{}} onPublished={()=>{}} onAdvanced={()=>{}}/><section id="student"><AnswerForm detail={{definition,status:'active'}} busy={false} enabled draft={draft} onDraft={setDraft} onSubmit={async()=>true}/></section><section id="preview"><QuestionPreview definition={definition}/></section><section id="summary"><ActivityOverviewCharts data={overview} onSelect={()=>{}}/></section></I18nProvider>};createRoot(document.getElementById('root')).render(<Fixture/>);`;
 const bundle=await esbuild.build({stdin:{contents:source,resolveDir:root,loader:'tsx'},bundle:true,write:false,outfile:'fixture.js',platform:'browser',format:'iife',define:{'process.env':'{}'},tsconfig:path.join(root,'tsconfig.json')});
 const js=bundle.outputFiles.find(f=>f.path.endsWith('.js')).text, css=await fs.readFile(path.join(root,'node_modules/katex/dist/katex.min.css'),'utf8')+'\n'+await fs.readFile(path.join(root,'src/app/globals.css'),'utf8')+'\n'+bundle.outputFiles.find(f=>f.path.endsWith('.css')).text;
 server=http.createServer(async(req,res)=>{if(req.url.startsWith('/fonts/')){try{return res.end(await fs.readFile(path.join(root,'node_modules/katex/dist',req.url)))}catch{res.statusCode=404;return res.end()}}if(req.url==='/fixture.js'){res.setHeader('content-type','text/javascript');return res.end(js)}if(req.url==='/fixture.css'){res.setHeader('content-type','text/css');return res.end(css)}res.end('<!doctype html><html lang="zh-CN"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script></html>')});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 win=new BrowserWindow({width:390,height:844,show:false,webPreferences:{backgroundThrottling:false}});const errors=[];win.webContents.on('console-message',e=>{if(e.level==='error'||e.level>=3)errors.push(e.message)});await win.loadURL(`http://127.0.0.1:${server.address().port}/`);const run=s=>win.webContents.executeJavaScript(s),wait=async s=>{for(let i=0;i<100;i++){if(await run(s))return;await new Promise(r=>setTimeout(r,50))}throw Error('timeout '+s+' '+errors.join(';'))};
 await wait(`document.querySelector('[data-quick-creator] textarea')`);
 await run(`(()=>{const e=document.querySelector('[data-quick-creator] textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'测试公式');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 await run(`[...document.querySelectorAll('[data-quick-creator] button')].find(e=>e.textContent.includes('生成题目')||e.textContent.includes('Generate question')).click()`);
 await wait(`document.querySelectorAll('[data-quick-creator] .katex').length>=2`);
 assert.equal(await run(`document.querySelector('[data-quick-creator] textarea[aria-label="题干"], [data-quick-creator] textarea[aria-label="Question"]').value`),'求 $x^2$ 的值');
 assert.equal(await run(`document.querySelectorAll('#student .katex').length`),2);
 assert.equal(await run(`document.querySelectorAll('#preview .katex').length`),2);
 assert.ok(await run(`document.querySelectorAll('#summary .katex').length>=2`),'ended-class summary renders math in the chart label and accessible data table');
 const label=`document.querySelector('#summary [data-chart-question-label]')`,popover=`document.querySelector('#summary [data-chart-question-popover]')`;
 assert.equal(await run(`getComputedStyle(${label}).webkitLineClamp`),'2','long chart labels use two lines');
 assert.ok(await run(`${popover}.querySelectorAll('.katex').length>=2`),'complete popover retains every formula');
 assert.equal(await run(`getComputedStyle(${popover}).visibility`),'hidden');await run(`${label}.focus()`);await wait(`getComputedStyle(${popover}).visibility==='visible'`);
 assert.equal(await run(`document.documentElement.scrollWidth>innerWidth`),false,'math preview fits a narrow viewport');
 await run(`document.querySelector('#student input[type=radio]').click()`);assert.equal(await run(`document.querySelector('#student input[type=radio]').checked`),true);
 assert.equal(errors.length,0,errors.join('\n'));console.log('PASS AI draft preview, student answers and question preview render math and remain editable');
}
app.whenReady().then(main).then(()=>{win?.destroy();server?.close();app.quit()}).catch(e=>{console.error(e);win?.destroy();server?.close();app.exit(1)});
