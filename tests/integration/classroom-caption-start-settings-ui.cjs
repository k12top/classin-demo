/* eslint-disable @typescript-eslint/no-require-imports -- Render the complete shipped creation dialog in Chromium. */
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const esbuild = require('esbuild');
const postcss = require('postcss');
const tailwind = require('tailwindcss');
const root = path.resolve(__dirname, '../..');
let win, server;

async function main() {
  const output = process.env.CLASSROOM_CONTROLS_OUTPUT || path.join(root, 'outputs/classroom-original-create-2026-10-28');
  await fs.mkdir(output, { recursive: true });
  // Only navigation is simulated. TeacherDashboard, the original two-column
  // dialog, form state, language controls and POST serialization are real.
  const bundle = await esbuild.build({
    stdin: {
      contents: `import React from 'react';
        import {createRoot} from 'react-dom/client';
        import {I18nProvider} from '@/lib/i18n/context';
        import {PortalFeedbackProvider} from '@/components/portal/portal-feedback';
        import TeacherDashboard from '@/components/TeacherDashboard';
        window.fetch = async (url, options = {}) => {
          if (url === '/api/courses' && options.method === 'POST') {
            window.submitted = JSON.parse(options.body);
            return new Response(JSON.stringify({course:{id:'fixture-course'}}));
          }
          return new Response(JSON.stringify({schedules:[],teachers:[],users:[],groups:[]}));
        };
        createRoot(document.getElementById('root')).render(
          <I18nProvider initialLocale="zh-CN"><PortalFeedbackProvider>
            <TeacherDashboard courses={[]} user={{userId:'teacher-fixture',displayName:'nkwill'}} fetchCourses={()=>{}} />
          </PortalFeedbackProvider></I18nProvider>);`,
      loader: 'tsx', resolveDir: root,
    },
    bundle: true, write: false, outdir: 'out', platform: 'browser', format: 'iife',
    define: { 'process.env': '{}' }, tsconfig: path.join(root, 'tsconfig.json'),
    plugins: [{ name: 'next-navigation-fixture', setup(build) {
      build.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'next-navigation', namespace: 'fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
        contents: `const router={push:path=>{window.navigated=path},prefetch:()=>{},refresh:()=>{},replace:()=>{}};
          export const useRouter=()=>router; export const usePathname=()=>'/';
          export const useSearchParams=()=>new URLSearchParams();`, loader: 'js',
      }));
    } }],
  });
  const globalCss = await fs.readFile(path.join(root, 'src/app/globals.css'), 'utf8');
  const compiled = await postcss([tailwind({ config: path.join(root, 'tailwind.config.ts') })])
    .process(globalCss, { from: path.join(root, 'src/app/globals.css') });
  const courseCss = await fs.readFile(path.join(root, 'src/app/course-details.css'), 'utf8');
  const classroomCss = (await Promise.all(['classroom-classin.css', 'classroom-light.css', 'classroom-responsive.css']
    .map(file => fs.readFile(path.join(root, 'src/app', file), 'utf8')))).join('\n');
  const styles = compiled.css.replace(/@import[^;]+;/g, '') + courseCss + classroomCss
    + bundle.outputFiles.find(file => file.path.endsWith('.css')).text;
  server = require('node:http').createServer((req, res) => {
    if (req.url === '/app.js') {
      res.setHeader('content-type', 'text/javascript');
      return res.end(bundle.outputFiles.find(file => file.path.endsWith('.js')).text);
    }
    if (req.url === '/style.css') { res.setHeader('content-type', 'text/css'); return res.end(styles); }
    res.end(`<!doctype html><html class="light" lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/app.js"></script></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  win = new BrowserWindow({ width: 1440, height: 1000, show: false,
    webPreferences: { backgroundThrottling: false, partition: 'original-creation-' + Date.now() } });
  const errors = [];
  win.webContents.on('console-message', event => { if (event.level === 'error' || event.level >= 3) errors.push(event.message); });
  const run = code => win.webContents.executeJavaScript(code);
  const pause = time => new Promise(resolve => setTimeout(resolve, time));
  const wait = async code => {
    for (let i = 0; i < 120; i++) { if (await run(code)) return; await pause(50); }
    throw new Error('timeout ' + code + ' ' + errors.join(';'));
  };
  const open = `([...document.querySelectorAll('button')].find(b=>b.textContent.includes('创建')))`;
  const dialog = `document.querySelector('[role="dialog"]')`;
  const settings = `document.querySelector('section[aria-label="开课字幕与同传"]')`;
  const switchFor = key => `document.querySelector('[aria-labelledby="caption-start-${key}"]')`;
  const checks = [];
  for (const [width, height, theme] of [[1440, 1000, 'light'], [390, 844, 'light'], [320, 740, 'light'], [1440, 1000, 'dark']]) {
    win.setContentSize(width, height);
    await win.loadURL('http://127.0.0.1:' + server.address().port + '/?lang=zh-CN');
    await wait(open);
    await run(`document.documentElement.className=${JSON.stringify(theme)}; ${open}.click()`);
    await wait(settings);
    await pause(350);
    assert.equal(await run(`${dialog}.querySelector('aside').textContent.includes('Classroom studio')`), true);
    for (const text of ['讲课老师', '课堂类型', '学生自动上台', '课程名称']) {
      assert.equal(await run(`${dialog}.textContent.includes(${JSON.stringify(text)})`), true, 'preserve original field: ' + text);
    }
    assert.equal(await run('document.body.scrollWidth > innerWidth'), false);
    if (width === 1440) {
      assert.equal(await run(`${dialog}.querySelector('aside').getBoundingClientRect().right <= ${dialog}.querySelector('[class*="formBody"]').getBoundingClientRect().left + 1`), true, 'original two-column layout');
    }
    await fs.writeFile(path.join(output, `original-create-${width}-${theme}-top.png`), (await win.webContents.capturePage()).toPNG());
    await run(`${settings}.scrollIntoView({block:'end'})`);
    await pause(100);
    assert.equal(await run(`${settings}.scrollWidth > ${settings}.clientWidth`), false, 'new controls fit original form');
    await fs.writeFile(path.join(output, `original-create-${width}-${theme}-settings.png`), (await win.webContents.capturePage()).toPNG());
    await run(`${switchFor('autoInterpretation')}.click()`);
    await wait(`!${settings}.querySelector('[class*="targets"]')`);
    await run(`${switchFor('autoCaptions')}.click()`);
    await wait(`!${settings}.querySelector('.classroom-v3-caption-select-field')`);
    await run(`${switchFor('autoInterpretation')}.click()`);
    await wait(`${settings}.querySelector('[class*="add"]')`);
    await run(`${settings}.querySelector('[class*="add"]').click()`);
    await wait(`${settings}.querySelectorAll('.classroom-v3-caption-select-field').length === 2`);
    await run(`${settings}.querySelectorAll('.classroom-v3-caption-select-field')[1].querySelector('button').click()`);
    await wait(`[...document.querySelectorAll('[role="option"]')].some(e=>e.textContent.includes('日本'))`);
    await run(`[...document.querySelectorAll('[role="option"]')].find(e=>e.textContent.includes('日本')).click()`);
    await wait(`${settings}.textContent.includes('日本')`);
    assert.equal(await run(`${dialog} !== null`), true, 'language selection keeps full creation dialog open');
    await run(`{
      const input=${dialog}.querySelector('input[maxlength="100"]') || ${dialog}.querySelector('input');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Python-S 26班');
      input.dispatchEvent(new Event('input',{bubbles:true}));
    }`);
    await pause(100);
    await run(`${dialog}.querySelector('[class*="createButton"]').click()`);
    await wait('!!window.submitted');
    assert.deepEqual(await run('submitted.captionStartPreferences'), {
      autoCaptions: false, autoInterpretation: true, sourceLanguage: 'zh-CN', targetLanguages: ['en-US', 'ja-JP'],
    });
    assert.equal(await run('submitted.autoStudentOnStage'), true);
    assert.equal(await run('submitted.name'), 'Python-S 26班');
    checks.push({ width, height, theme, originalPanel: true, newSettings: true, payload: true });
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(output, 'checks.json'), JSON.stringify(checks, null, 2));
  console.log('PASS original full creation dialog: original fields and two-column layout retained, added independent caption/interpretation defaults, language selection and actual POST payload; desktop, 390px, 320px and dark theme.');
}
app.whenReady().then(main).then(() => { win?.destroy(); server?.close(); app.quit(); })
  .catch(error => { console.error(error); win?.destroy(); server?.close(); app.exit(1); });
