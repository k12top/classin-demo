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
    import {I18nProvider,useTranslation} from '@/lib/i18n/context';
    import {TestPlaybackCaptionSettings} from '@/app/courses/[id]/playback/page';
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
    const media = {participants:[],local:{microphoneOn:true,cameraOn:false}};
    function Fixture(){
      const {setLocale}=useTranslation();
      const [playbackSettings,setPlaybackSettings]=useState(false);
      const [preferredLanguage,setPreferredLanguage]=useState('en-US');
      const [overlayVisible,setOverlayVisible]=useState(true);
      const [interpretation,setInterpretation]=useState(runtime.interpretation);
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
        setMode,setMicrophoneOn,setHasVideo,setClock,baseTime,setLocale,setPlaybackSettings,
      };
      const live=useLiveCaptions(captions,'en-US',mode,clock);
      if(playbackSettings) return <TestPlaybackCaptionSettings mode={mode} onModeChange={setMode}
        language={preferredLanguage} languages={['vi-VN','id-ID','ru-RU']} onLanguageChange={setPreferredLanguage}
        appearance={{background:'solid',size:'medium',position:'bottom'}} onAppearanceChange={()=>{}} chinese={false}/>;
      return <main className="classroom-v3-shell is-classin-layout fixture" data-responsive-workspace="true">
        <div className="classroom-v3-live-rail"><div className="classroom-v3-seats">
          <TestLiveRailSeat member={member} participant={{id:'student-rtc',displayName:'student-rtc',isLocal:false,kind:'camera',hasAudio:microphoneOn,hasVideo}}
            provider={provider} media={media} currentUserId="teacher" canManage={false} canReward={false} busy={false} canReorder={false} previewPlacesOnBoard={false} />
        </div></div>
        <div className="fixture-workspace">
          <section className="classroom-v3-stage"><div className="fixture-board">课堂白板</div>
            <LiveCaptionOverlay captions={live} language="en-US" mode={mode} background="text" color="#202124" />
          </section>
          <aside className="classroom-v3-drawer"><CaptionsPanel runtime={{...runtime,interpretation}} captions={captions} availability={{shengwang:true,wordly:true}}
            canManage={true} displayMode={mode} overlayVisible={overlayVisible} preferredLanguage={preferredLanguage} onRetryPreference={()=>{}}
            onApplySettings={async settings=>{window.appliedCalls=(window.appliedCalls||0)+1;
              if(window.holdSave)await new Promise(resolve=>window.releaseSave=resolve);
              if(window.failNextSave){window.failNextSave=false;return false;}
              window.appliedSettings=settings;setMode(settings.displayMode);
              setOverlayVisible(settings.overlayVisible);setPreferredLanguage(settings.preferredLanguage);
              if(settings.interpretation)setInterpretation({...interpretation,...settings.interpretation});return true}} />
          </aside>
        </div>
      </main>;
    }
    createRoot(document.getElementById('root')).render(<I18nProvider initialLocale="zh-CN"><Fixture/></I18nProvider>);
  `, resolveDir: root, loader: "tsx" }, bundle: true, write: false, outdir: "out", platform: "browser", format: "iife", tsconfig: path.join(root, "tsconfig.json"),
    define: { "process.env": "{}" },
    plugins: [{ name: "private-seat-fixture-export", setup(build) {
      build.onLoad({ filter: /\.module\.css$/ }, () => ({ contents: "export default {};", loader: "js" }));
      build.onLoad({ filter: /courses[\\/]\[id\][\\/]playback[\\/]page\.tsx$/ }, async args => ({
        contents: await fs.readFile(args.path, "utf8") + "\nexport {CaptionSettings as TestPlaybackCaptionSettings};", loader: "tsx", resolveDir: path.dirname(args.path),
      }));
      build.onLoad({ filter: /classroom-v3\.tsx$/ }, async args => ({
        contents: await fs.readFile(args.path, "utf8") + "\nexport {LiveRailSeat as TestLiveRailSeat};", loader: "tsx", resolveDir: path.dirname(args.path),
      }));
    } }],
  });
  const styles = (await Promise.all(["globals.css", "classroom-classin.css", "classroom-light.css", "classroom-responsive.css"].map(name => fs.readFile(path.join(root, "src/app", name), "utf8")))).join("\n");
  server = http.createServer((request, response) => {
    if (request.url === "/fixture.js") { response.setHeader("Content-Type", "application/javascript"); response.end(bundle.outputFiles.find(file=>file.path.endsWith(".js")).text); }
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
  const run = async code => { try { return await window.webContents.executeJavaScript(code); } catch(error) { throw new Error("Browser script failed: "+code+"; "+error.message); } };
  const waitFor = async (code) => {
    const deadline = Date.now() + 10_000;
    while (!await run(code)) {
      if (Date.now() > deadline) throw new Error(`Browser timeout: ${code}; errors: ${errors.join("; ")}`);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  };
  await waitFor("Boolean(window.fixture) && !!document.querySelector('[role=meter]')");
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
  const output = path.join(root, "outputs/classroom-caption-controls-2026-10-23");
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
  await run("fixture.setLocale('zh-CN')");
  await waitFor("document.documentElement.lang==='zh-CN'");
  await run("document.querySelector('.classroom-v3-caption-settings-summary').click()");
  await waitFor("document.querySelector('.classroom-v3-caption-settings-disclosure').dataset.open==='true'");
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.ok(await run("document.querySelectorAll('.classroom-v3-caption-settings-card .classroom-v3-caption-toggles button').length===2"), "quick switches stay at the top of the settings card");
  assert.equal(await run("document.querySelector('.classroom-v3-interpretation-save')===null"),true,"no Apply button remains");
  assert.deepEqual(await run("Array.from(document.querySelectorAll('.classroom-v3-caption-toggles button')).map(button=>button.getAttribute('aria-label'))"), ['舞台字幕浮窗','课堂同传']);
  assert.ok(await run("document.documentElement.scrollWidth<=innerWidth"), "mobile settings have no horizontal overflow");
  await fs.writeFile(path.join(output, "mobile-settings.png"), (await window.webContents.capturePage()).toPNG());
  window.setContentSize(1280, 850);
  await waitFor("innerWidth===1280");
  await fs.writeFile(path.join(output, "desktop-settings.png"), (await window.webContents.capturePage()).toPNG());
  const capturePanel = async name => {
    // capturePage reads the compositor frame; let the disclosure transition and paint finish.
    await new Promise(resolve => setTimeout(resolve, 250));
    const rect = await run("(()=>{const panel=document.querySelector('.classroom-v3-drawer').getBoundingClientRect();const popup=document.querySelector('.classroom-v3-caption-language-content')?.getBoundingClientRect();const x=Math.max(0,Math.floor(Math.min(panel.left,popup?.left??panel.left))-10);const y=Math.max(0,Math.floor(Math.min(panel.top,popup?.top??panel.top))-10);return {x,y,width:Math.min(innerWidth-x,Math.ceil(Math.max(panel.right,popup?.right??panel.right))-x+10),height:Math.min(innerHeight-y,Math.ceil(Math.max(panel.bottom,popup?.bottom??panel.bottom))-y+10)}})()");
    await fs.writeFile(path.join(output, name), (await window.webContents.capturePage(rect)).toPNG());
  };
  await capturePanel("desktop-controls.png");
  const quickButtons = "document.querySelectorAll('.classroom-v3-caption-toggles button')";
  await run(`${quickButtons}[0].dispatchEvent(new MouseEvent('mouseover',{bubbles:true}))`);
  await waitFor("document.querySelector('.classroom-v3-caption-quick-toggle [role=tooltip]')!==null");
  await capturePanel("desktop-tooltip.png");
  await run(`${quickButtons}[0].dispatchEvent(new MouseEvent('mouseout',{bubbles:true,relatedTarget:document.body}))`);
  await run(`${quickButtons}[0].click()`);
  await waitFor("window.appliedSettings?.overlayVisible===false");
  await run(`${quickButtons}[1].click()`);
  await waitFor("window.appliedSettings?.interpretation?.enabled===false");
  await run(`window.failNextSave=true;${quickButtons}[1].click()`);
  await waitFor("document.querySelector('.classroom-v3-caption-preference-error [type=button]')!==null");
  assert.equal(await run(`${quickButtons}[1].getAttribute('aria-pressed')`),'true','failed selection remains visible for retry');
  await run("document.querySelector('.classroom-v3-caption-preference-error [type=button]').click()");
  await waitFor("window.appliedSettings?.interpretation?.enabled===true");
  await run(`window.holdSave=true;window.callsBefore=window.appliedCalls;${quickButtons}[1].click()`);
  await waitFor("Boolean(window.releaseSave)");
  await run(`${quickButtons}[0].click();${quickButtons}[0].click();${quickButtons}[0].click()`);
  assert.equal(await run("window.appliedCalls-window.callsBefore"),1,'only one request runs while newer selections queue');
  await run("window.holdSave=false;window.releaseSave()");
  await waitFor("window.appliedSettings?.overlayVisible===true");
  await waitFor("document.querySelector('.classroom-caption-save-status').textContent==='已保存'");
  const languageTrigger = "document.querySelector('.classroom-v3-caption-view-settings .classroom-v3-caption-select-field:nth-child(2) button')";
  await run(`${languageTrigger}.click()`);
  await waitFor("document.querySelector('.classroom-v3-caption-language-search input')===document.activeElement");
  const optionValues = await run("Array.from(document.querySelectorAll('[role=option]')).map(option=>option.textContent)");
  const alphabet = new Intl.Collator('en',{sensitivity:'base',numeric:true});
  assert.ok(optionValues.every((label,index)=>index===0 || alphabet.compare(optionValues[index-1],label)<=0), "visible language names are alphabetical");
  assert.ok(optionValues.findIndex(label=>label.startsWith('Bahasa Indonesia')) < optionValues.findIndex(label=>label.startsWith('Français')), "Indonesian is under B");
  await capturePanel("desktop-language-list.png");
  const searchFor = async query => {
    await run(`(()=>{const input=document.querySelector('.classroom-v3-caption-language-search input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(query)});input.dispatchEvent(new Event('input',{bubbles:true}))})()`);
    await waitFor(`document.querySelector('.classroom-v3-caption-language-search input').value===${JSON.stringify(query)}`);
  };
  for(const query of ['Bahasa Indo','Indonesian','印度尼西亚语','id-ID']) {
    await searchFor(query);
    await waitFor("document.querySelectorAll('[role=option]').length===1 && document.querySelector('[role=option]').textContent.includes('Bahasa Indonesia')");
  }
  await searchFor('印度尼西亚');
  await waitFor("document.querySelectorAll('[role=option]').length===2");
  await capturePanel("desktop-language-search.png");
  await searchFor('zzzz-no-language');
  await waitFor("document.querySelectorAll('[role=option]').length===0 && document.querySelector('.classroom-v3-caption-language-empty')!==null");
  await searchFor('francais');
  await waitFor("document.querySelector('[role=option]').textContent.includes('Français')");
  await run("document.querySelector('.classroom-v3-caption-language-search button').click()");
  await waitFor("document.querySelectorAll('[role=option]').length===150");
  window.webContents.sendInputEvent({type:'keyDown',keyCode:'ESC'}); window.webContents.sendInputEvent({type:'keyUp',keyCode:'ESC'});
  await waitFor("document.querySelector('.classroom-v3-caption-language-content')===null");
  assert.equal(await run("document.querySelector('.classroom-v3-caption-settings-disclosure').dataset.open"), 'true', "Escape closes only the language popup");
  assert.ok(await run(`${languageTrigger}===document.activeElement`), "popup restores focus to its trigger");
  await run(`${languageTrigger}.click()`);
  await waitFor("document.querySelector('.classroom-v3-caption-language-search input')===document.activeElement");
  await searchFor('Bahasa Indo');
  await waitFor("document.querySelectorAll('[role=option]').length===1");
  window.webContents.sendInputEvent({type:'keyDown',keyCode:'Down'}); window.webContents.sendInputEvent({type:'keyUp',keyCode:'Down'});
  window.webContents.sendInputEvent({type:'keyDown',keyCode:'Return'}); window.webContents.sendInputEvent({type:'keyUp',keyCode:'Return'});
  await waitFor("document.querySelector('.classroom-v3-caption-language-content')===null");
  assert.ok(await run(`${languageTrigger}.textContent.includes('Bahasa Indonesia')`), "keyboard selection updates the draft");
  await waitFor("window.appliedSettings.preferredLanguage==='id-ID'");
  assert.equal(await run("document.querySelector('.classroom-v3-caption-settings-disclosure').dataset.open"),'true','changing a language saves without closing settings');
  window.setContentSize(390, 844);
  await waitFor("innerWidth===390");
  await run(`${languageTrigger}.click()`);
  await waitFor("document.querySelector('.classroom-v3-caption-language-search input')===document.activeElement");
  assert.ok(await run("(()=>{const r=document.querySelector('.classroom-v3-caption-language-content').getBoundingClientRect();return r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight})()"), "mobile popup fits the viewport");
  await fs.writeFile(path.join(output, "mobile-language-list.png"), (await window.webContents.capturePage()).toPNG());
  await searchFor('Indonesian');
  await waitFor("document.querySelectorAll('[role=option]').length===1");
  await new Promise(resolve => setTimeout(resolve, 250));
  await fs.writeFile(path.join(output, "mobile-language-search.png"), (await window.webContents.capturePage()).toPNG());
  window.webContents.sendInputEvent({type:'keyDown',keyCode:'ESC'}); window.webContents.sendInputEvent({type:'keyUp',keyCode:'ESC'});
  await waitFor("document.querySelector('.classroom-v3-caption-language-content')===null");
  await run("document.querySelector('.classroom-v3-caption-settings-summary').click()");
  await waitFor("document.querySelector('.classroom-v3-caption-settings-disclosure').dataset.open==='false'");
  await waitFor("getComputedStyle(document.querySelector('.classroom-v3-caption-settings-disclosure')).visibility==='hidden'");
  await new Promise(resolve => setTimeout(resolve, 250));
  await fs.writeFile(path.join(output, "mobile-header-collapsed.png"), (await window.webContents.capturePage()).toPNG());
  for (const locale of ['zh-CN','en','ru','ar']) {
    await run(`fixture.setLocale(${JSON.stringify(locale)});fixture.setPlaybackSettings(true)`);
    await waitFor(`document.documentElement.lang===${JSON.stringify(locale)} && document.querySelector('#playback-caption-settings')!==null`);
    const labels = await run("Array.from(document.querySelector('#playback-caption-settings select').options).filter(option=>option.value.includes('-')).map(option=>option.textContent)");
    for (const [index, name] of ['Tiếng Việt','Bahasa Indonesia','Русский'].entries()) {
      assert.ok(labels[index].startsWith(name), `${locale} keeps native language names`);
      assert.ok(!labels[index].includes(['vi-VN','id-ID','ru-RU'][index]), `${locale} does not expose language codes`);
    }
  }
  assert.deepEqual(errors, [], "no browser errors");
  console.log("PASS: heading quick toggles save immediately, failure and in-flight guards; alphabetic language list, Chinese/English/native/code search, accents, clear/empty results, keyboard selection, Escape/focus restoration; desktop/mobile popup layout; existing caption, follow and playback checks. Media and translation delivery are simulated. Screenshots: " + output);
}
main().then(() => cleanup(0), error => { console.error(error); cleanup(1); });
function cleanup(code) { window?.destroy(); server?.close(); app.exit(code); }
