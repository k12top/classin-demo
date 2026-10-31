/* eslint-disable @typescript-eslint/no-require-imports -- Actual playback page, real H264/AAC and HLS in isolated Chromium. */
const {app,BrowserWindow}=require('electron'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),{execFileSync}=require('node:child_process'),esbuild=require('esbuild');
const root=path.resolve(__dirname,'../..');let win,server;
async function main(){
 const out=path.join(root,'outputs/playback-hls/ui'),cache=path.join(root,'node_modules/.cache/playback-hls');await fs.mkdir(out,{recursive:true});await fs.mkdir(path.join(cache,'hls'),{recursive:true});
 const media=path.join(cache,'fixture.mp4');execFileSync('ffmpeg',['-v','error','-y','-f','lavfi','-i','testsrc2=size=640x360:rate=12','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','180','-c:v','libx264','-threads','2','-preset','ultrafast','-g','24','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart',media]);
 execFileSync('ffmpeg',['-v','error','-y','-i',media,'-c','copy','-hls_time','4','-hls_playlist_type','vod','-hls_segment_type','fmp4','-hls_fmp4_init_filename','init.mp4','-hls_segment_filename',path.join(cache,'hls/seg-%03d.m4s'),path.join(cache,'hls/index.m3u8')]);
 const bytes=await fs.readFile(media);let failHls=false,hlsRequests=0;
 const stubs={
 'next/navigation':`const router={push:p=>window.fixtureNavigation=p};export const useRouter=()=>router;`,
 '@/lib/auth-context':`export const useAuth=()=>({user:{userId:'teacher',role:'teacher',displayName:'测试老师'},loading:false,logout:async()=>{}});`,
 '@/components/portal/portal-shell':`import React from'react';export function PortalShell({children}){return <div><header className="border-b p-4 font-semibold">课程回放 · HLS兼容性隔离验证</header><div className="p-6">{children}</div></div>}`,
 '@/lib/auth-login':`export const redirectToSsoLogin=()=>{};`,'@/lib/auth-refresh-client':`export const tryOAuthRefresh=async()=>false;`,
 };
 const source=`import React,{Suspense}from'react';import{createRoot}from'react-dom/client';import{I18nProvider}from'@/lib/i18n/context';import Page from'@/app/courses/[id]/playback/page';
 const scenario=new URLSearchParams(location.search).get('scenario');if(scenario==='unsupported'){window.MediaSource=undefined;HTMLVideoElement.prototype.canPlayType=()=>'';}
 const started=performance.now();window.fixtureStats={resolutions:0,polls:0,firstFrameMs:null};document.addEventListener('loadeddata',()=>{window.fixtureStats.firstFrameMs??=performance.now()-started},true);
 const nativeFetch=window.fetch.bind(window);window.fetch=async(input,init)=>{const url=new URL(String(input),location.href);let payload;
 if(url.pathname==='/api/courses/fixture')payload={course:{id:'fixture',name:'HLS回放兼容性验证',teacherName:'测试老师',status:'finished',canTeach:true}};
 else if(url.pathname==='/api/courses/fixture/sessions')payload={sessions:[{id:'lesson',title:'HLS回放兼容性验证',status:'finished',startTime:'2026-10-31T08:00:00Z',endTime:'2026-10-31T10:00:00Z',_count:{recordings:1}}]};
 else if(url.pathname==='/api/sessions/lesson/recordings'){fixtureStats.polls++;payload={refreshAfterMs:5000,recordings:[{id:'attempt:0',segment:1,status:'completed',startedAt:'2026-10-31T08:00:00Z',stoppedAt:'2026-10-31T10:00:00Z',playbackFormat:'mp4',playbackUrl:'/api/sessions/lesson/recordings/attempt/play?asset=clip.mp4',hlsPlaybackUrl:scenario==='mp4'?null:'/hls/index.m3u8'}]};}
 else if(url.pathname.includes('/summary'))payload={summary:null,captions:[],canManage:false};
 else if(url.pathname==='/api/sessions/lesson/recordings/attempt/play'){fixtureStats.resolutions++;payload={url:location.origin+'/media.mp4',format:'mp4'};}
 else return nativeFetch(input,init);return Response.json(payload);};
 createRoot(document.getElementById('root')).render(<I18nProvider initialLocale="zh-CN"><Suspense fallback={<p>准备回放…</p>}><Page params={Promise.resolve({id:'fixture'})} searchParams={Promise.resolve({})}/></Suspense></I18nProvider>);`;
 const bundle=await esbuild.build({stdin:{contents:source,resolveDir:root,loader:'tsx'},bundle:true,write:false,outfile:path.join(cache,'fixture.js'),platform:'browser',format:'iife',define:{'process.env':'{}'},tsconfig:path.join(root,'tsconfig.json'),plugins:[{name:'isolated-playback',setup(build){build.onResolve({filter:/.*/},args=>args.path in stubs?{path:args.path,namespace:'stub'}:undefined);build.onLoad({filter:/.*/,namespace:'stub'},args=>({contents:stubs[args.path],loader:'tsx',resolveDir:root}));}}]});
 const cssFile=path.join(cache,'fixture.css');execFileSync('node',[require.resolve('tailwindcss/lib/cli.js'),'-i',path.join(root,'src/app/globals.css'),'-o',cssFile,'--minify'],{stdio:'pipe'});const css=await fs.readFile(cssFile);
 server=http.createServer(async(req,res)=>{try{if(req.url==='/fixture.js'){res.setHeader('content-type','text/javascript');return res.end(bundle.outputFiles.find(f=>f.path.endsWith('.js')).text)}if(req.url==='/fixture.css'){res.setHeader('content-type','text/css');return res.end(css)}if(req.url==='/media.mp4'){const range=/bytes=(\d+)-(\d*)/.exec(req.headers.range||'');const start=range?Number(range[1]):0,end=range?.[2]?Math.min(Number(range[2]),bytes.length-1):bytes.length-1;res.writeHead(range?206:200,{'content-type':'video/mp4','accept-ranges':'bytes','content-length':end-start+1,...(range?{'content-range':`bytes ${start}-${end}/${bytes.length}`}:{})});return res.end(bytes.subarray(start,end+1))}if(req.url.startsWith('/hls/')){hlsRequests++;if(failHls){res.statusCode=503;return res.end('simulated HLS network failure')}const name=req.url.slice('/hls/'.length);assert(/^(index\.m3u8|init\.mp4|seg-\d+\.m4s)$/.test(name));res.setHeader('content-type',name.endsWith('.m4s')?'video/iso.segment':name.endsWith('.mp4')?'video/mp4':'application/vnd.apple.mpegurl');return res.end(await fs.readFile(path.join(cache,'hls',name)))}res.end('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script></html>')}catch(e){res.statusCode=500;res.end('Fixture error');console.error(e.message)}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const checks=[];
 for(const [scenario,width,height] of [['mp4',1366,900],['hls',1366,900],['hls-mobile',390,844],['harmony',390,844],['unsupported',1366,900]]){
 failHls=false;hlsRequests=0;win=new BrowserWindow({width,height,show:false,webPreferences:{backgroundThrottling:false,partition:'hls-'+scenario+'-'+Date.now()}});
 if(scenario==='harmony')win.webContents.setUserAgent('Mozilla/5.0 (Phone; OpenHarmony 5.0) AppleWebKit/537.36 HuaweiBrowser/5.0');
 const errors=[];win.webContents.on('console-message',event=>{if(event.level==='error'||event.level>=3)errors.push(event.message)});
 const run=code=>win.webContents.executeJavaScript(code),wait=async code=>{const end=Date.now()+22000;while(Date.now()<end){if(await run(code))return;await new Promise(resolve=>setTimeout(resolve,100))}throw Error('Timeout '+code+'\n'+errors.join('\n'))};
 await win.loadURL(`http://127.0.0.1:${server.address().port}/courses/fixture/playback?sessionId=lesson&scenario=${scenario}`);
 await wait('document.querySelector("video")?.readyState>=2');
 const expected=scenario.startsWith('hls')?'hls':'mp4';assert.equal(await run('document.querySelector("video").dataset.playbackFormat'),expected);
 assert.equal(await run('fixtureStats.resolutions'),expected==='hls'?0:1);if(expected==='mp4')assert.equal(hlsRequests,0);
 await run('window.initialVideo=document.querySelector("video");initialVideo.muted=true;initialVideo.play()');await wait('initialVideo.currentTime>.3');
 const result={scenario,width,height,initialFormat:expected,firstFrameMs:await run('fixtureStats.firstFrameMs'),hlsRequests,realDecode:true};
 if(scenario==='hls'){
 await fs.writeFile(path.join(out,'hls-initial.png'),(await win.webContents.capturePage()).toPNG());
 await wait('fixtureStats.polls>=2');assert.equal(await run('document.querySelector("video")===initialVideo'),true);
 failHls=true;await run('initialVideo.currentTime=120');await wait('initialVideo.dataset.playbackFormat==="mp4"&&initialVideo.readyState>=2&&initialVideo.currentTime>120.3&&!initialVideo.paused');assert.equal(await run('fixtureStats.resolutions'),1);result.networkFallbackPosition=await run('initialVideo.currentTime');result.automaticResume=true;failHls=false;
 }
 assert.equal(await run('document.documentElement.scrollWidth>innerWidth'),false);
 await fs.writeFile(path.join(out,scenario+'.png'),(await win.webContents.capturePage()).toPNG());checks.push(result);win.destroy();win=null;
 }
 await fs.writeFile(path.join(out,'checks.json'),JSON.stringify({passed:true,checks,boundary:'Actual page + real H264/AAC MP4 and hls.js decode in local Chromium; APIs mocked, HarmonyOS UA simulated, no physical HarmonyOS device.'},null,2));console.log(JSON.stringify({passed:true,checks}));
}
app.on('window-all-closed',()=>{});
app.whenReady().then(main).then(()=>{server?.close();app.quit()}).catch(e=>{console.error(e);win?.destroy();server?.close();app.exit(1)});
