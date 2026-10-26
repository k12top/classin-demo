/* eslint-disable @typescript-eslint/no-require-imports -- Isolated Electron caption acceptance. */
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
    function Fixture(){
      const [language,setLanguage]=useState('en-US');
      const runtime={status:'live',interpretation:{enabled:true,provider:'shengwang',sourceLanguage:'zh-CN',targetLanguages:[],status:'running'}};
      return <main className="classroom-v3-shell is-classin-layout"><aside className="classroom-v3-drawer">
        <CaptionsPanel runtime={runtime} captions={[]} availability={{shengwang:true,wordly:true,wordlyTargetLanguages:['bm','chm']}}
          canManage={true} displayMode="bilingual" overlayVisible={true} preferredLanguage={language}
          onRetryPreference={()=>{}} onApplySettings={async value=>{window.saved=value;setLanguage(value.preferredLanguage);return true;}}/>
      </aside></main>;
    }
    createRoot(document.getElementById('root')).render(<I18nProvider initialLocale="zh-CN"><Fixture/></I18nProvider>);
  `, resolveDir: root, loader: "tsx" }, bundle: true, write: false, platform: "browser", format: "iife", tsconfig: path.join(root, "tsconfig.json"), define: { "process.env": "{}" } });
  const styles = (await Promise.all(["globals.css", "classroom-classin.css", "classroom-light.css", "classroom-responsive.css"].map(name => fs.readFile(path.join(root, "src/app", name), "utf8")))).join("\n");
  server = http.createServer((request, response) => {
    if (request.url === "/fixture.js") { response.setHeader("Content-Type", "application/javascript"); response.end(bundle.outputFiles[0].text); }
    else if (request.url === "/fixture.css") { response.setHeader("Content-Type", "text/css"); response.end(styles); }
    else response.end(`<!doctype html><html class="light" lang="zh-CN"><meta charset="utf-8"><link rel="stylesheet" href="/fixture.css"><style>
      *{box-sizing:border-box}body{margin:0;font-family:system-ui}button{font:inherit}
      .classroom-v3-shell{height:100vh!important;min-height:0!important;display:flex!important;justify-content:center;padding:16px}
      .classroom-v3-drawer{position:static!important;display:flex!important;width:360px!important;max-width:none!important;height:100%!important;max-height:none!important;transform:none!important;border:1px solid #cad5e0;border-radius:12px;overflow:hidden}
      .is-captions{display:flex;flex-direction:column;min-height:0;width:100%;overflow:hidden}
      @media(max-width:600px){.classroom-v3-shell{padding:8px}.classroom-v3-drawer{width:100%!important}}
      </style><div id="root"></div><script src="/fixture.js"></script></html>`);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  await app.whenReady();
  window = new BrowserWindow({ show: false, width: 1280, height: 850, webPreferences: { nodeIntegration: false, contextIsolation: true, backgroundThrottling: false } });
  const errors = [];
  window.webContents.on("console-message", event => { if (event.level === "error") errors.push(event.message); });
  await window.loadURL(`http://127.0.0.1:${server.address().port}/?lang=zh-CN`);
  const run = code => window.webContents.executeJavaScript(code);
  const waitFor = async code => {
    const deadline = Date.now() + 10_000;
    while (!await run(code)) {
      if (Date.now() > deadline) throw new Error(`Browser timeout: ${code}; ${errors.join("; ")}`);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  };
  const output = path.join(root, "outputs/classroom-caption-fallback-2026-10-26");
  await fs.mkdir(output, { recursive: true });
  const search = async query => {
    await run(`(()=>{const input=document.querySelector('.classroom-v3-caption-language-search input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(query)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await waitFor("document.querySelectorAll('[role=option]').length===1");
  };
  for (const [name, width, height] of [["desktop",1280,850],["mobile",390,844]]) {
    window.setContentSize(width, height);
    await waitFor(`innerWidth===${width} && Boolean(document.querySelector('.classroom-v3-caption-settings-summary'))`);
    await run("document.querySelector('.classroom-v3-caption-settings-summary').click()");
    await waitFor("document.querySelector('.classroom-v3-caption-settings-disclosure').dataset.open==='true'");
    await run("document.querySelector('.classroom-v3-caption-view-settings .classroom-v3-caption-select-field:nth-child(2) button').click()");
    await waitFor("document.querySelector('.classroom-v3-caption-language-search input')===document.activeElement");
    for (const query of ['Amharic','አማርኛ','阿姆哈拉','埃塞俄比亚','am-ET']) {
      await search(query);
      assert.match(await run("document.querySelector('[role=option]').textContent"), /አማርኛ/);
    }
    assert.ok(await run("(()=>{const r=document.querySelector('.classroom-v3-caption-language-content').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()"));
    await new Promise(resolve => setTimeout(resolve, 250));
    await fs.writeFile(path.join(output, `${name}-amharic.png`), (await window.webContents.capturePage()).toPNG());
    for (const query of ['bm','chm']) await search(query);
    await new Promise(resolve => setTimeout(resolve, 250));
    await fs.writeFile(path.join(output, `${name}-fallback.png`), (await window.webContents.capturePage()).toPNG());
    window.webContents.sendInputEvent({type:'keyDown',keyCode:'ESC'});
    window.webContents.sendInputEvent({type:'keyUp',keyCode:'ESC'});
    await waitFor("!document.querySelector('.classroom-v3-caption-language-content')");
    await run("document.querySelector('.classroom-v3-caption-settings-summary').click()");
    await waitFor("document.querySelector('.classroom-v3-caption-settings-disclosure').dataset.open==='false'");
    console.log(`PASS ${name}: Amharic native/Chinese/English/country/code search, discovered bridge languages, popup bounds`);
  }
  assert.deepEqual(errors, []);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { window?.destroy(); server?.close(); app.quit(); });
