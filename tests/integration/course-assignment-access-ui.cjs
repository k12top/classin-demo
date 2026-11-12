/* eslint-disable @typescript-eslint/no-require-imports -- standalone Electron fixture */
const assert=require('node:assert/strict'),http=require('node:http'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const {app,BrowserWindow}=require('electron'),esbuild=require('esbuild');
const root=path.resolve(__dirname,'../..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'assignment-access-'));
app.setPath('userData',temp);app.on('window-all-closed',()=>{});
let server,win,status=200;
const wait=async(expr)=>{for(let i=0;i<100;i++){if(await win.webContents.executeJavaScript(expr))return;await new Promise(r=>setTimeout(r,50));}throw Error(`Timed out: ${expr}`);};
async function main(){
 await app.whenReady();
 const mocks={'@/lib/auth-context':'export const useAuth=()=>({user:{userId:"teacher"}});','@/lib/use-time-zone':'export const useTimeZone=()=>({timeZone:"UTC"});'};
 const source=`import React from 'react';import{createRoot}from'react-dom/client';import{CourseAssignmentResponses}from'@/components/workspace/course-assignment-responses';createRoot(document.getElementById('root')).render(<CourseAssignmentResponses courseId="c" assignmentId="a" locale="zh-CN" onBusy={()=>{}}/>);`;
 const bundle=await esbuild.build({stdin:{contents:source,loader:'tsx',resolveDir:root},bundle:true,write:false,outfile:'app.js',format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},tsconfig:path.join(root,'tsconfig.json'),plugins:[{name:'fixture-auth',setup(build){build.onResolve({filter:/.*/},args=>args.path in mocks?{path:args.path,namespace:'mock'}:undefined);build.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'js'}));}}]});
 const js=bundle.outputFiles.find(f=>f.path.endsWith('.js')).contents;
 server=http.createServer((req,res)=>{const url=new URL(req.url,'http://fixture');if(url.pathname==='/app.js'){res.setHeader('content-type','text/javascript');return res.end(js);}if(url.pathname.includes('/submissions')){res.setHeader('content-type','application/json');res.statusCode=url.search?status:200;return res.end(JSON.stringify(res.statusCode===200?{canSubmit:false,submissions:[{id:'s',studentId:'s',studentName:'Fixture student',content:'private answer',version:1,updatedAt:'2026-01-01T00:00:00Z',review:null}],nextCursor:'s'}:{error:'unavailable'}));}res.setHeader('content-type','text/html');res.end('<div id="root"></div><script src="/app.js"></script>');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));win=new BrowserWindow({show:false,webPreferences:{backgroundThrottling:false}});const url=`http://127.0.0.1:${server.address().port}`;
 for(const code of [503,401,403,404]){status=code;await win.loadURL(url);await wait(`document.body.innerText.includes('private answer')`);await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='加载更多').click()`);await wait(`!!document.querySelector('[role=alert]')`);const body=await win.webContents.executeJavaScript('document.body.innerText');assert.equal(body.includes('private answer'),code===503,`status ${code}`);}
 console.log('Assignment pagination preserves transient failures and clears unavailable records');
}
main().then(()=>{win?.destroy();server?.close();fs.rmSync(temp,{recursive:true,force:true});app.exit(0);}).catch(err=>{console.error(err);win?.destroy();server?.close();fs.rmSync(temp,{recursive:true,force:true});app.exit(1);});
