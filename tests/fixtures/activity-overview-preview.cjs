/* eslint-disable @typescript-eslint/no-require-imports -- Local-only real-service preview; browser interaction uses CUA. */
const path = require('node:path'), http = require('node:http'), esbuild = require('esbuild');
const { openHarness } = require('../integration/activity-harness.cjs');
(async () => {
  const h = await openHarness(), { api, actor } = h;
  const make = async (title, type, correct, kind = 'quiz') => api.createActivity(actor('teacher'), { title, kind, definition: { questions: [{ id: 'q', type, prompt: title, points: 10, options: type === 'essay' ? [] : type === 'boolean' ? [{ id: 'a', text: '正确' }, { id: 'b', text: '错误' }] : [{ id: 'a', text: '2 和 3' }, { id: 'b', text: '4 和 6' }, { id: 'c', text: type === 'multiple' ? '5 和 7' : '9 和 15' }], ...(correct ? { correct } : {}) }] } }, crypto.randomUUID(), true);
  const first = await make('哪些数字都是质数？', 'single', ['a']);
  await api.commandActivity(actor('student'), first.id, { action: 'answer', expectedVersion: 0, answers: { q: ['b'] } });
  await api.commandActivity(actor('student2'), first.id, { action: 'answer', expectedVersion: 0, answers: { q: ['a'] } });
  await api.commandActivity(actor('teacher'), first.id, { action: 'release', scope: 'answered' });
  const second = await make('选择所有由质数组成的选项', 'multiple', ['a', 'c']);
  await api.commandActivity(actor('student'), second.id, { action: 'answer', expectedVersion: 0, answers: { q: ['a', 'c'] } });
  const written = await make('请解释为什么 1 不是质数', 'essay');
  await api.commandActivity(actor('student'), written.id, { action: 'answer', expectedVersion: 0, answers: { q: '只有一个正因数' } });
  for (let i = 0; i < 4; i++) {
    const extra = await make(`质数巩固 ${i + 1}：哪组选项都是质数？`, 'single', ['a']);
    await api.commandActivity(actor('student'), extra.id, { action: 'answer', expectedVersion: 0, answers: { q: [i === 1 ? 'b' : 'a'] } });
    await api.commandActivity(actor('student2'), extra.id, { action: 'answer', expectedVersion: 0, answers: { q: [i === 2 ? 'b' : 'a'] } });
    if (i < 2) await api.commandActivity(actor('teacher'), extra.id, { action: 'release', scope: 'answered' });
  }
  const poll = await make('这节课你理解了多少？', 'single', null, 'poll');
  const current = await make('判断：2 是唯一的偶质数。', 'boolean', ['a']);
  const root = process.cwd();
  const bundle = await esbuild.build({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import{I18nProvider}from'@/lib/i18n/context';import{ActivityDashboard}from'@/components/classroom/activity-dashboard';const p=new URLSearchParams(location.search);createRoot(document.getElementById('root')).render(<I18nProvider initialLocale="zh-CN"><main style={{maxWidth:p.has('narrow')?350:960,margin:'20px auto',background:'hsl(var(--card))'}}><nav aria-label="本地测试角色"><a href="/?lang=zh-CN&role=teacher">老师</a><a href="/?lang=zh-CN&role=student">学生本人</a><a href="/?lang=zh-CN&role=student2">另一学生</a><a href="/?lang=zh-CN&role=teacher&review=1">老师回看</a><a href="/?lang=zh-CN&role=student&review=1&dark=1">学生深色回看</a></nav><ActivityDashboard sessionId=${JSON.stringify(h.lesson.id)} review={p.has('review')}/><footer><button onClick={async()=>{await fetch('/fixture/answer',{method:'POST'});document.getElementById('action-status').textContent='学生已提交';}}>模拟当前题学生提交</button><button onClick={async()=>{await fetch('/fixture/end',{method:'POST'});location.href='/?role=teacher&review=1';}}>结束课堂并回看</button><span id="action-status" role="status"/></footer></main></I18nProvider>);`, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, outdir: path.join(root, 'node_modules/.cache/activity-overview-preview'), entryNames: 'app', splitting: true, format: 'esm', metafile: true, platform: 'browser', jsx: 'automatic', define: { 'process.env': '{}' }, tsconfig: path.join(root, 'tsconfig.json') });
  const assets = new Map(bundle.outputFiles.map(file => ['/' + path.basename(file.path), file.text]));
  console.log(JSON.stringify({ previewAssets: bundle.outputFiles.map(file => ({ name: path.basename(file.path), bytes: file.contents.length, gzip: require('node:zlib').gzipSync(file.contents).length })) }));
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost'), role = /fixture-role=(teacher|student2?)(?:;|$)/.exec(req.headers.cookie || '')?.[1] || 'student';
      res.setHeader('Cache-Control', 'no-store');
      if (/^\/activity-echart-.*\.js$/.test(url.pathname)) {
        if (/fixture-charts=failed(?:;|$)/.test(req.headers.cookie || '')) { res.statusCode = 503; return res.end('Synthetic chart chunk failure'); }
        if (/fixture-charts=slow(?:;|$)/.test(req.headers.cookie || '')) await new Promise(resolve => setTimeout(resolve, 2500));
      }
      if (assets.has(url.pathname)) { res.setHeader('Content-Type', url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript'); return res.end(assets.get(url.pathname)); }
      if (url.pathname.startsWith('/api/')) {
        let value;
        if (url.searchParams.has('overview')) value = await api.activityOverview(actor(role));
        else if (url.searchParams.has('versionOnly')) value = { revision: (await h.db.classroomRuntime.findUnique({ where: { id: h.runtime.id } })).activityRevision };
        else value = await api.activityDetail(actor(role), url.pathname.split('/').at(-1));
        res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(value));
      }
      if (url.pathname === '/fixture/answer' && req.method === 'POST') { await api.commandActivity(actor('student2'), current.id, { action: 'answer', expectedVersion: 0, answers: { q: ['b'] } }); return res.end('ok'); }
      if (url.pathname === '/fixture/end' && req.method === 'POST') { await h.db.courseSession.update({ where: { id: h.lesson.id }, data: { status: 'finished', endedAt: new Date() } }); await h.db.classroomRuntime.update({ where: { id: h.runtime.id }, data: { status: 'ended' } }); return res.end('ok'); }
      if (url.pathname !== '/') { res.statusCode = 404; return res.end(); }
      const previewRole = ['teacher', 'student', 'student2'].includes(url.searchParams.get('role')) ? url.searchParams.get('role') : 'teacher';
      res.setHeader('Set-Cookie', [`fixture-role=${previewRole}; Path=/; SameSite=Strict`, `fixture-charts=${['failed', 'slow'].includes(url.searchParams.get('engine')) ? url.searchParams.get('engine') : 'normal'}; Path=/; SameSite=Strict`]); res.setHeader('Content-Type', 'text/html;charset=utf-8');
      res.end(`<!doctype html><html lang="zh-CN" class="${url.searchParams.has('dark') ? 'dark' : ''}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{--card:0 0% 100%;--foreground:240 10% 10%;--muted-foreground:240 4% 42%;--muted:240 5% 95%;--border:240 6% 90%}.dark{--card:240 10% 6%;--foreground:0 0% 98%;--muted-foreground:240 5% 65%;--muted:240 4% 16%;--border:240 4% 16%}body{margin:0;background:#eff1f6;font-family:system-ui}html.dark body{background:#15151c}*{box-sizing:border-box}nav,footer{display:flex;gap:12px;padding:16px;flex-wrap:wrap;font-size:12px}nav a{color:#6452ba}footer button{font:inherit}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}</style><link rel="stylesheet" href="/app.css"><div id="root"></div><script type="module" src="/app.js"></script></html>`);
    } catch (error) { res.statusCode = error.status || 500; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: error.message })); }
  }).listen(3130, '127.0.0.1', () => console.log('Overview real-service preview: http://127.0.0.1:3130'));
  for (const signal of ['SIGINT','SIGTERM']) process.once(signal, () => server.close(async () => { await h.close(); process.exit(); }));
  void poll;
})().catch(error => { console.error(error); process.exitCode = 1; });
