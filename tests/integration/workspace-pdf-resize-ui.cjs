/* eslint-disable @typescript-eslint/no-require-imports -- standalone Electron test */
const assert=require('node:assert/strict'),http=require('node:http'),path=require('node:path'),fs=require('node:fs/promises'),os=require('node:os');
const {app,BrowserWindow}=require('electron'),esbuild=require('esbuild');
const root=path.resolve(__dirname,'../..'),temp=require('node:fs').mkdtempSync(path.join(os.tmpdir(),'classin-pdf-preview-'));
app.setPath('userData',temp);app.on('window-all-closed',()=>undefined);
let server,window;const errors=[];
function samplePdf(){
 const streams=['BT /F1 20 Tf 72 700 Td (First page) Tj ET','BT /F1 20 Tf 72 700 Td (Second page) Tj ET'];
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',...['6','7'].map(id=>`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents ${id} 0 R >>`),'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',...streams.map(s=>`<< /Length ${Buffer.byteLength(s)} >>\nstream\n${s}\nendstream`)];
 let pdf='%PDF-1.4\n';const offsets=[0];objects.forEach((value,index)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${index+1} 0 obj\n${value}\nendobj\n`;});const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 ${offsets.length}\n0000000000 65535 f \n${offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;return Buffer.from(pdf);
}
const wait=async(expression)=>{for(let i=0;i<180;i++){if(await window.webContents.executeJavaScript(expression))return;await new Promise(resolve=>setTimeout(resolve,100));}throw new Error(`Timed out: ${expression}\n${await window.webContents.executeJavaScript('document.body.innerText')}`);};
async function main(){
 await app.whenReady();const source=`import React from 'react';import{createRoot}from'react-dom/client';import{I18nProvider}from'@/lib/i18n/context';import{WorkspacePdfPreview}from'@/components/workspace/workspace-pdf-preview';createRoot(document.getElementById('root')).render(<I18nProvider initialLocale="vi"><WorkspacePdfPreview src="/fixture.pdf" name="lesson.pdf"/></I18nProvider>);`;
 const bundle=await esbuild.build({stdin:{contents:source,loader:'tsx',resolveDir:root},bundle:true,write:false,outfile:'app.js',format:'esm',platform:'browser',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},tsconfig:path.join(root,'tsconfig.json')});
 const js=bundle.outputFiles.find(file=>file.path.endsWith('.js')).contents,css=bundle.outputFiles.find(file=>file.path.endsWith('.css'))?.contents||'',pdf=samplePdf();
 const worker=await fs.readFile(require.resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs'));
 server=http.createServer((req,res)=>{const url=new URL(req.url,'http://fixture');if(url.pathname==='/app.js'){res.setHeader('content-type','text/javascript');return res.end(js);}if(url.pathname==='/app.css'){res.setHeader('content-type','text/css');return res.end(css);}if(url.pathname==='/pdfjs-dist/legacy/build/pdf.worker.min.mjs'){res.setHeader('content-type','text/javascript');return res.end(worker);}if(url.pathname==='/fixture.pdf'){res.setHeader('content-type','application/pdf');return res.end(pdf);}res.setHeader('content-type','text/html; charset=utf-8');res.end('<!doctype html><html><link rel="stylesheet" href="/app.css"><style>html,body,#root{margin:0;height:100%;display:flex;min-width:0;width:100%}</style><div id="root"></div><script type="module" src="/app.js"></script></html>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));window=new BrowserWindow({show:false,width:1024,height:768,webPreferences:{backgroundThrottling:false}});
 window.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message);});
 await window.loadURL(`http://127.0.0.1:${server.address().port}/?lang=vi`);
 await wait(`document.querySelector('[role=document]')?.textContent.includes('First page') && [...document.querySelectorAll('button')].some(b=>b.textContent==='Trang tiếp'&&!b.disabled)`);
 const wide=await window.webContents.executeJavaScript(`document.querySelector('canvas').getBoundingClientRect().width`);
 assert.equal(await window.webContents.executeJavaScript(`document.querySelector('[role=document]').parentElement.querySelectorAll('canvas').length`),1);
 window.setContentSize(480,700);await wait(`document.querySelector('canvas').getBoundingClientRect().width < ${wide-100} && [...document.querySelectorAll('button')].some(b=>b.textContent==='Trang tiếp'&&!b.disabled)`);
 const narrow=await window.webContents.executeJavaScript(`document.querySelector('canvas').getBoundingClientRect().width`);
 assert.equal(await window.webContents.executeJavaScript(`document.querySelector('[role=document]').parentElement.querySelectorAll('canvas').length`),1);
 await window.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Trang tiếp').click()`,true);
 await wait(`document.querySelector('[role=document]')?.textContent.includes('Second page') && [...document.querySelectorAll('button')].some(b=>b.textContent==='Trang trước'&&!b.disabled)`);
 assert.match(await window.webContents.executeJavaScript(`document.querySelector('[role=document]').getAttribute('aria-label')`),/Trang 2/);
 window.setContentSize(900,700);window.setContentSize(540,700);await wait(`document.querySelector('canvas').getBoundingClientRect().width > ${narrow+30} && document.querySelector('[role=document]')?.textContent.includes('Second page') && [...document.querySelectorAll('button')].some(b=>b.textContent==='Trang trước'&&!b.disabled)`);
 assert.equal(await window.webContents.executeJavaScript(`document.querySelector('[role=document]').parentElement.querySelectorAll('canvas').length`),1);
 assert.deepEqual(errors,[]);console.log('PASS PDF resize, page navigation and localized text layer in isolated Electron');
}
async function cleanup(){if(window&&!window.isDestroyed())window.destroy();if(server)await new Promise(resolve=>server.close(resolve));await fs.rm(temp,{recursive:true,force:true});}
main().then(async()=>{await cleanup();app.exit(0);},async error=>{console.error(error);await cleanup();app.exit(1);});
