/* eslint-disable @typescript-eslint/no-require-imports -- Electron browser acceptance with simulated media and captions. */
// Run: clients/desktop/node_modules/.bin/electron tests/integration/classroom-caption-ui.cjs
const { app, BrowserWindow } = require("electron");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs/promises");
const esbuild = require("esbuild");
const root = path.resolve(__dirname, "../..");
let window, server;

async function main() {
  const bundle = await esbuild.build({ stdin: { contents: `
    import React, {useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {I18nProvider} from '@/lib/i18n/context';
    import {CaptionsPanel} from '@/components/classroom/captions-panel';
    import {LiveCaptionOverlay} from '@/components/classroom/live-caption-overlay';
    import {TestLiveRailSeat} from '@/components/classroom/classroom-v3';
    import {useLiveCaptions} from '@/lib/classroom/use-live-captions';
    const baseTime = Date.now();
    const caption = (id, secondsAgo, translations = {'en-US':id==='first'?'First, observe the changes in the picture.':id==='second'?'Then explain the reason in your own words.':'Let us practise with an example.'}) => ({
      id, text: id==='first'?'我们先观察图片中的变化。':id==='second'?'接着用自己的话说明原因。':'下面我们用一个例子来练习。', speakerId: 'teacher', speakerName: '王老师',
      sourceLanguage: 'zh-CN', detectedLanguage: 'zh-CN', translations, provider: 'shengwang', isFinal: true,
      occurredAt: new Date(baseTime - secondsAgo * 1000).toISOString(), createdAt: new Date(baseTime - secondsAgo * 1000).toISOString(),
    });
    const initial = [...Array.from({length: 22}, (_, i) => caption('history-' + i, 100 - i)), caption('first', 3), caption('second', 2), caption('third', 1, {})];
    window.microphoneLevel = .7;
    const provider = {attachVideo(){}, detachVideo(){}, getMicrophoneLevel(){return window.microphoneLevel}};
    const runtime = {status: 'live', interpretation: {enabled: true, provider: 'shengwang', sourceLanguage: 'zh-CN', targetLanguages: ['en-US'], status: 'running', error: null}};
    const member = {userId:'student',displayName:'李明 · Alex',role:'student',avatar:'',onStage:true,microphoneAllowed:true,cameraAllowed:true,rewardCount:0};
    const media = {local:{microphoneOn:true,cameraOn:false}};
    function Fixture(){
      const [captions,setCaptions]=useState(initial);
      const [mode,setMode]=useState('bilingual');
      const [microphoneOn,setMicrophoneOn]=useState(true);
      const [hasVideo,setHasVideo]=useState(false);
      const [clock,setClock]=useState(baseTime);
      window.fixture = {
        append(){setCaptions(current=>[...current,caption('next-'+current.length,0)])},
        late(){setCaptions(current=>current.map(value=>value.id==='third'?{...value,translations:{'en-US':'The delayed translation is now visible.'}}:value))},
        oldLate(){setCaptions(current=>current.map(value=>value.id==='history-0'?{...value,translations:{'en-US':'A late translation from an earlier sentence.'}}:value))},
        poll(){setCaptions(current=>current.map(value=>({...value,translations:{...value.translations}})))},
        preview(){setClock(baseTime+20000);setMode('bilingual');setCaptions(current=>[...current.filter(value=>value.id.startsWith('history-')),caption('first',-17),caption('second',-18),caption('third',-19)])},
        setMode,setMicrophoneOn,setHasVideo,setClock,baseTime,
      };
      const live=useLiveCaptions(captions,'en-US',mode,clock);
      return <main className="classroom-v3-shell is-classin-layout fixture">
        <div className="classroom-v3-live-rail"><div className="classroom-v3-seats">
          <TestLiveRailSeat member={member} participant={{id:'student-rtc',displayName:'student-rtc',isLocal:false,kind:'camera',hasAudio:microphoneOn,hasVideo}}
            provider={provider} media={media} currentUserId="teacher" canManage={false} canReward={false} busy={false} canReorder={false} previewPlacesOnBoard={false} />
        </div></div>
        <div className="fixture-workspace">
          <section className="classroom-v3-stage"><div className="fixture-board">课堂白板</div>
            <LiveCaptionOverlay captions={live} language="en-US" mode={mode} background="text" color="#202124" />
          </section>
          <aside className="classroom-v3-drawer"><CaptionsPanel runtime={runtime} captions={captions} availability={{shengwang:true,wordly:true}}
            canManage={true} displayMode={mode} overlayVisible={true} preferredLanguage="en-US" onRetryPreference={()=>{}}
            onApplySettings={async settings=>{setMode(settings.displayMode);return true}} />
          </aside>
        </div>
      </main>;
    }
    createRoot(document.getElementById('root')).render(<I18nProvider initialLocale="zh-CN"><Fixture/></I18nProvider>);
  `, resolveDir: root, loader: "tsx" }, bundle: true, write: false, platform: "browser", format: "iife", tsconfig: path.join(root, "tsconfig.json"),
    define: { "process.env": "{}" },
    plugins: [{ name: "private-seat-fixture-export", setup(build) {
      build.onLoad({ filter: /\.module\.css$/ }, () => ({ contents: "export default {};", loader: "js" }));
      build.onLoad({ filter: /classroom-v3\.tsx$/ }, async args => ({
        contents: await fs.readFile(args.path, "utf8") + "\nexport {LiveRailSeat as TestLiveRailSeat};", loader: "tsx", resolveDir: path.dirname(args.path),
      }));
    } }],
  });
  const styles = (await Promise.all(["globals.css", "classroom-classin.css", "classroom-light.css"].map(name => fs.readFile(path.join(root, "src/app", name), "utf8")))).join("\n");
  server = http.createServer((request, response) => {
    if (request.url === "/fixture.js") { response.setHeader("Content-Type", "application/javascript"); response.end(bundle.outputFiles[0].text); }
    else if (request.url === "/fixture.css") { response.setHeader("Content-Type", "text/css"); response.end(styles); }
    else response.end(`<!doctype html><html class="light" lang="zh-CN"><meta charset="utf-8"><link rel="stylesheet" href="/fixture.css"><style>
      *{box-sizing:border-box}body{margin:0;font-family:system-ui}button{font:inherit}#root{height:100vh}
      .fixture{display:flex!important;flex-direction:column;height:100vh!important;min-height:0!important}.fixture-workspace{display:flex;flex:1;min-height:0;gap:16px;padding:16px}
      .fixture .classroom-v3-stage{position:relative;flex:1;min-width:0;background:#f7fafc;border:1px solid #cad5e0;border-radius:12px;overflow:hidden}
      .fixture-board{padding:24px;color:#506176}.fixture .classroom-v3-drawer{position:static!important;display:flex!important;width:340px;min-width:0;transform:none!important;overflow:hidden;border:1px solid #cad5e0;border-radius:12px}
      .fixture .is-captions{display:flex;flex-direction:column;min-height:0;max-height:100%;width:100%;overflow:hidden}.fixture .classroom-v3-seat{width:190px;flex-basis:190px;height:106px}
      @media(max-width:600px){.fixture-workspace{flex-direction:column;padding:8px;gap:8px}.fixture .classroom-v3-stage{flex:0 0 36%;min-height:200px}.fixture .classroom-v3-drawer{width:100%;flex:1}.fixture .classroom-v3-caption-overlay{max-height:100%!important}}
      </style><div id="root"></div><script src="/fixture.js"></script></html>`);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  await app.whenReady();
  window = new BrowserWindow({ show: false, width: 1280, height: 850, webPreferences: { nodeIntegration: false, contextIsolation: true, backgroundThrottling: false } });
  const errors = [];
  window.webContents.on("console-message", event => { if (event.level === "error") errors.push(event.message); });
  await window.loadURL(`http://127.0.0.1:${server.address().port}/?lang=zh-CN`);
  const run = code => window.webContents.executeJavaScript(code);
  const waitFor = async (code) => {
    const deadline = Date.now() + 10_000;
    while (!await run(code)) {
      if (Date.now() > deadline) throw new Error(`Browser timeout: ${code}; errors: ${errors.join("; ")}`);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  };
  await waitFor("Boolean(window.fixture)");
  await waitFor("document.querySelector('[role=meter]').getAttribute('aria-valuenow') === '70'");
  await waitFor("getComputedStyle(document.querySelector('[role=meter]')).visibility === 'visible'");
  assert.equal(await run("document.querySelector('.classroom-v3-seat-name').textContent"), "李明 · Alex");
  assert.deepEqual(await run("Array.from(document.querySelectorAll('[data-caption-id]')).map(el=>el.dataset.captionId)"), ["first", "second", "third"]);
  await run("fixture.late()");
  await waitFor("document.querySelector('[data-caption-id=third]').textContent.includes('delayed translation')");
  assert.ok(await run("(()=>{const row=document.querySelector('[data-caption-id=third]');return row.querySelector('p:not(.is-translation)').textContent==='下面我们用一个例子来练习。' && row.querySelector('p.is-translation').textContent==='The delayed translation is now visible.'})()"), "late translation stays inside its matching original group");
  await run("fixture.setHasVideo(true)");
  await waitFor("document.querySelector('.classroom-v3-seat.has-video') !== null");
  assert.equal(await run("getComputedStyle(document.querySelector('.classroom-v3-seat-name')).opacity"), "1", "name stays visible with video");
  await run("window.microphoneLevel=.25");
  await waitFor("document.querySelector('[role=meter]').getAttribute('aria-valuenow') === '25'");
  await run("window.microphoneLevel=0");
  await waitFor("getComputedStyle(document.querySelector('[role=meter]')).visibility === 'hidden'");
  await run("window.microphoneLevel=.01");
  await waitFor("document.querySelector('[role=meter]').getAttribute('aria-valuenow') === '1'");
  assert.equal(await run("getComputedStyle(document.querySelector('[role=meter]')).visibility"), "hidden", "low background noise does not show the meter");
  await run("window.microphoneLevel=.25");
  await waitFor("getComputedStyle(document.querySelector('[role=meter]')).visibility === 'visible'");
  await run("fixture.setMicrophoneOn(false)");
  await waitFor("document.querySelector('[role=meter]').getAttribute('aria-valuenow') === '0'");
  assert.equal(await run("getComputedStyle(document.querySelector('[role=meter]')).visibility"), "hidden", "muting hides the meter immediately");
  await run("fixture.setMicrophoneOn(true);fixture.setHasVideo(false);window.microphoneLevel=.7");
  const atBottom = "(()=>{const el=document.querySelector('.classroom-v3-caption-history');return el.scrollHeight-el.clientHeight-el.scrollTop<2})()";
  await waitFor(atBottom);
  await run("fixture.append()");
  await waitFor(atBottom);
  await run("document.querySelector('[role=switch]').click()");
  await waitFor("document.querySelector('[role=switch]').getAttribute('aria-checked')==='false'");
  await run("document.querySelector('.classroom-v3-caption-history').scrollTop=50");
  const scrollBefore = await run("document.querySelector('.classroom-v3-caption-history').scrollTop");
  await run("fixture.append();fixture.late()");
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(await run("document.querySelector('.classroom-v3-caption-history').scrollTop"), scrollBefore, "reading position stays while follow is off");
  await run("document.querySelector('[role=switch]').click()");
  await waitFor(atBottom);
  await run("fixture.setMode('translated');fixture.oldLate()");
  await waitFor("document.querySelector('[data-caption-id=history-0]') !== null");
  await run("fixture.setClock(fixture.baseTime+13000);fixture.poll()");
  await waitFor("document.querySelectorAll('[data-caption-id]').length === 0");
  await run("fixture.preview()");
  await waitFor("Array.from(document.querySelectorAll('[data-caption-id]')).map(row=>row.dataset.captionId).join(',')==='first,second,third' && document.querySelector('[data-caption-id] p:not(.is-translation)') !== null");
  await waitFor("document.querySelector('[role=switch]').getAttribute('aria-label')==='跟随最新'");
  const overlayAtBottom = "(()=>{const el=document.querySelector('.classroom-v3-caption-overlay');return el.scrollHeight-el.clientHeight-el.scrollTop<2})()";
  await waitFor(overlayAtBottom);
  const output = path.join(root, "outputs/classroom-feedback-2026-10-17");
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, "desktop.png"), (await window.webContents.capturePage()).toPNG());
  window.setContentSize(390, 844);
  await waitFor("innerWidth===390");
  await waitFor(atBottom);
  await waitFor(overlayAtBottom);
  assert.ok(await run("document.documentElement.scrollWidth <= innerWidth"), "mobile has no horizontal overflow");
  assert.ok(await run("document.querySelector('.classroom-v3-caption-history').clientHeight > 100"), "mobile history remains scrollable");
  assert.ok(await run("(()=>{const overlay=document.querySelector('.classroom-v3-caption-overlay').getBoundingClientRect();return Array.from(document.querySelectorAll('[data-caption-id]:not([hidden])')).every(row=>{const rect=row.getBoundingClientRect();return row.querySelector('p:not(.is-translation)') && row.querySelector('p.is-translation') && rect.top>=overlay.top && rect.bottom<=overlay.bottom})})()"), "mobile shows complete original/translation groups without orphaned or clipped lines");
  await fs.writeFile(path.join(output, "mobile.png"), (await window.webContents.capturePage()).toPNG());
  await run("document.querySelector('[role=switch]').click()");
  await window.reload();
  await waitFor("Boolean(window.fixture)");
  assert.equal(await run("document.querySelector('[role=switch]').getAttribute('aria-checked')"), "false", "follow preference survives reload");
  assert.deepEqual(errors, [], "no browser errors");
  console.log("PASS: production seat/name, changing microphone level and mute; three ordered captions and late translations; follow on/off, reading position, preference persistence; desktop/mobile layout. Media and translation delivery are simulated.");
}
main().then(() => cleanup(0), error => { console.error(error); cleanup(1); });
function cleanup(code) { window?.destroy(); server?.close(); app.exit(code); }
