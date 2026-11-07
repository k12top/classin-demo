/* eslint-disable @typescript-eslint/no-require-imports -- Real React components in Chromium with isolated HTTP fixtures. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const esbuild = require('esbuild');
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const root = path.resolve(__dirname, '../..');
const output = process.env.CLASSROOM_REVIEW_OUTPUT || path.join(root, 'node_modules/.cache/reported-issues-ui');

async function main() {
  await fs.mkdir(output, { recursive: true });
  const source = `import React,{useRef} from 'react';import{createRoot}from'react-dom/client';
    import{I18nProvider}from'@/lib/i18n/context';
    import{StudentActivityOverlay}from'@/components/classroom/student-activity-overlay';
    import{ActivityChatCard}from'@/components/classroom/activity-chat-card';
    import{usePlaybackMedia,PlaybackQualityControl}from'@/components/course-sessions/playback-compatibility';
    import{useChatActivities}from'@/lib/classroom/use-chat-activities';
    function Playback(){const ref=useRef(null);const media=usePlaybackMedia(ref,'/fixture.webm',false,'/unavailable.m3u8');
      return <section style={{background:'#141a27',color:'white',padding:16}}><video ref={ref} controls style={{width:'100%',maxWidth:640}}/>
      <PlaybackQualityControl quality={media.quality} onChange={media.setQuality} info={media.qualityInfo}/></section>}
    function Fixture(){const feed=useChatActivities('lesson',null,true);return location.search.includes('playback')?<Playback/>:
      <main className="classroom-v3-shell" style={{height:'100vh',position:'relative',overflow:'hidden',background:'#f5f5f7'}}>
        <div className="classroom-v3-stage" style={{position:'absolute',inset:0}}/>
        <aside style={{position:'absolute',right:12,top:12,width:'min(360px,calc(100% - 24px))'}}>
          {feed.activities.map(activity=><ActivityChatCard key={activity.id} activity={activity} sessionId="lesson" student onChanged={()=>{}} onManage={()=>{}}/>)}</aside>
        <StudentActivityOverlay sessionId="lesson" currentUserId="student" onChanged={()=>{}}/>
      </main>}
    document.cookie='NEXT_LOCALE=zh-CN;path=/';localStorage.setItem('locale','zh-CN');
    createRoot(document.getElementById('root')).render(<I18nProvider initialLocale="zh-CN"><Fixture/></I18nProvider>);`;
  const bundle = await esbuild.build({ stdin: { contents: source, resolveDir: root, loader: 'tsx' }, bundle: true,
    write: false, outfile: 'fixture.js', platform: 'browser', format: 'iife', tsconfig: path.join(root, 'tsconfig.json'), define: { 'process.env': '{}' } });
  const globalCss = path.join(output, 'global.css');
  execFileSync(process.execPath, [require.resolve('tailwindcss/lib/cli.js'), '-i', path.join(root,'src/app/globals.css'), '-o', globalCss, '--minify'], { stdio: 'pipe' });
  const css = await fs.readFile(globalCss, 'utf8') + '\n' + (bundle.outputFiles.find(file => file.path.endsWith('.css'))?.text || '');
  const script = bundle.outputFiles.find(file => file.path.endsWith('.js')).text;
  let media = null, newer = false;
  function activity(id) {
    const old = id === 'old';
    const status = old ? 'closed' : id === 'new' && newer ? 'closed' : 'active';
    return { id, title: old ? '反转字符串' : '反转元音', kind:'quiz', status, questionCount:1, responseCount:old?1:0,
      startedAt:old?'2026-11-07T02:00:00Z':'2026-11-07T02:10:00Z', createdAt:'2026-11-07T02:00:00Z', updatedAt:'2026-11-07T02:10:00Z',
      durationSec:null,deadlineAt:null,version:1,presented:false,presentedQuestion:0,
      definition:{questions:[{id:'q',type:'essay',prompt:old?'编写一个函数，将字符串反转。':'仅反转字符串中的元音字母。',options:[],points:10}]},
      ownResponse:old?{id:'answer',userId:'student',displayName:'学生',answers:{q:'双指针交换首尾字符'},grading:null,feedback:null,submittedAt:'2026-11-07T02:01:00Z',updatedAt:'2026-11-07T02:01:00Z',version:1}:null,
      responses:[],responseCursor:null,statistics:null,roster:[] };
  }
  const server = http.createServer(async (req,res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/fixture.js') { res.setHeader('Content-Type','text/javascript'); return res.end(script); }
    if (url.pathname === '/fixture.css') { res.setHeader('Content-Type','text/css'); return res.end(css); }
    if (url.pathname === '/unavailable.m3u8') { res.statusCode=404; return res.end(); }
    if (url.pathname === '/fixture.webm') {
      if (!media) { res.statusCode=404; return res.end(); }
      const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
      const start = range ? Number(range[1]) : 0, end = range?.[2] ? Math.min(Number(range[2]),media.length-1) : media.length-1;
      res.writeHead(range ? 206 : 200, {'Content-Type':'video/webm','Accept-Ranges':'bytes','Content-Length':end-start+1,
        ...(range?{'Content-Range':`bytes ${start}-${end}/${media.length}`}:{})});
      return res.end(media.subarray(start,end+1));
    }
    if (url.pathname.startsWith('/api/')) {
      res.setHeader('Content-Type','application/json');
      if (url.pathname.endsWith('/activities')) {
        const active = activity(newer?'next':'new');
        return res.end(JSON.stringify({activities:[active,activity('old')],active,nextCursor:null,canAnswer:true,canManage:false,live:true}));
      }
      const id = url.pathname.split('/').at(-1);
      if (['old','new','next'].includes(id)) {
        // Opening history must stay pinned even before its detail has arrived.
        if(id==='old')await new Promise(resolve=>setTimeout(resolve,120));
        return res.end(JSON.stringify(activity(id)));
      }
      return res.end('{}');
    }
    res.setHeader('Content-Type','text/html');
    res.end('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script></html>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser = await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL || 'chrome'});
  try {
    const base=`http://127.0.0.1:${server.address().port}`;
    for(const width of [1440,390]) {
      newer=false;
      const page=await browser.newPage({viewport:{width,height:1000}});
      const errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.goto(base);
      await page.locator('[data-student-activity="new"] textarea').waitFor();
      const old=page.locator('[data-activity-card="old"]');
      // Trigger the real chat-card button while the new question is active.
      await old.getByRole('button',{name:'查看答案',exact:true}).evaluate(button=>button.click());
      const overlay=page.locator('[data-student-activity="old"]');
      await overlay.locator('textarea').waitFor();
      assert.equal(await overlay.locator('textarea').inputValue(),'双指针交换首尾字符');
      assert.equal(await overlay.locator('textarea').getAttribute('readonly'),'');
      await page.waitForTimeout(250);
      assert.equal(await page.locator('[data-student-activity="new"]').count(),0);
      await page.screenshot({path:path.join(output,`historical-answer-${width}.png`)});
      await overlay.getByRole('button',{name:'返回当前题目',exact:true}).click();
      await page.locator('[data-student-activity="new"] textarea').waitFor();
      // Manually opening the active question must still follow subsequent ones.
      await page.evaluate(()=>window.dispatchEvent(new CustomEvent('classroom-activity-open',{detail:{sessionId:'lesson',activityId:'new'}})));
      newer=true;
      await page.evaluate(()=>window.dispatchEvent(new CustomEvent('classroom-activity-refresh',{detail:{sessionId:'lesson'}})));
      await page.locator('[data-student-activity="next"] textarea').waitFor();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      assert.deepEqual(errors,[]);
      await page.close();
    }
    const page=await browser.newPage({viewport:{width:390,height:844}});
    await page.goto(base);
    // Make portable media with Chromium itself; no ffmpeg or production assets.
    const bytes=await page.evaluate(async()=>{
      const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;
      const context=canvas.getContext('2d'),stream=canvas.captureStream(15),chunks=[];
      const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'});
      recorder.ondataavailable=event=>chunks.push(event.data);
      const stopped=new Promise(resolve=>recorder.onstop=resolve);
      recorder.start(100);
      const timer=setInterval(()=>{context.fillStyle='#4f46e5';context.fillRect(0,0,640,360);context.fillStyle='white';context.font='32px sans-serif';context.fillText('Playback quality',80,180);},60);
      await new Promise(resolve=>setTimeout(resolve,2200));recorder.stop();await stopped;clearInterval(timer);stream.getTracks().forEach(track=>track.stop());
      return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()));
    });
    media=Buffer.from(bytes);
    await page.goto(base+'/?playback');
    await page.waitForFunction(()=>document.querySelector('video')?.readyState>=1);
    await page.evaluate(()=>{document.querySelector('video').currentTime=1;});
    await page.waitForFunction(()=>!document.querySelector('video').seeking);
    await page.getByRole('combobox',{name:'回放画质'}).selectOption('high');
    await page.waitForFunction(()=>document.querySelector('video')?.readyState>=1&&document.querySelector('video').currentTime>=0.9);
    assert.equal(await page.locator('[data-playback-quality]').innerText().then(text=>text.includes('360p')),true);
    assert.equal(await page.locator('video').evaluate(video=>video.paused),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:path.join(output,'playback-high-mobile.png')});
    await page.locator('video').evaluate(video=>video.play());
    await page.getByRole('combobox',{name:'回放画质'}).selectOption('auto');
    await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2&&!document.querySelector('video').paused);
    console.log('PASS desktop/mobile history pinning, active-question following, original quality selection and playback-position/pause retention');
  } finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
