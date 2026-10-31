/* eslint-disable @typescript-eslint/no-require-imports -- Real classroom component in Chromium with simulated server awards. */
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
if (!process.versions.electron) {
  const binary = require(path.join(root, 'clients/desktop/node_modules/electron'));
  execFileSync(process.execPath, [require.resolve('tailwindcss/lib/cli.js'), '-i', path.join(root, 'src/app/globals.css'),
    '-o', path.join(root, 'node_modules/.cache/classroom-overtime-browser-fixture/global.css'), '--minify'], { cwd: root, stdio: 'pipe' });
  const result = spawnSync(binary, [__filename, '--reuse-css', ...process.argv.slice(2)], { cwd: root, stdio: 'inherit',
    env: { ...process.env, NODE_PATH: path.join(root, 'clients/desktop/node_modules') }, timeout: 180000 });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} else {
  const { app } = require('electron');
  const fs = require('node:fs/promises');
  const assert = require('node:assert/strict');
  const { createClassroomBrowserFixture } = require('../helpers/classroom-browser-fixture.cjs');
  let fixture;
  async function main() {
    const output = path.join(root, 'outputs/classroom-trophy-feedback-2026-10-31');
    fixture = await createClassroomBrowserFixture({ outputDirectory: output, offscreen: process.argv.includes('--preview-only'), transformSource(source) {
      return source.replace(" window.fixtureActivityList=", `
        window.fixtureGpuStarts=0;const originalContext=HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext=function(kind,...args){if(kind==='webgl')window.fixtureGpuStarts++;return originalContext.call(this,kind,...args)};
        members.find(m=>m.userId==='student').rewardCount=3;
        window.fixtureAward=(ids=['student'])=>{
          for(const id of ids)members.find(m=>m.userId===id).rewardCount++;
          payload.runtime.revision++;
          window.fixtureReceive({courseId:'fixture-session',topic:'runtime',revision:payload.runtime.revision},'teacher:tab');
        };
        window.fixtureActivityList=`);
    } });
    const { win, run, wait, capture, url, checks } = fixture;
    const enter = async (width, height, role = 'student', reduced = false, touch = false) => {
      win.setContentSize(width, height);
      await win.loadURL(url + '&role=' + role);
      if (!win.webContents.debugger.isAttached()) win.webContents.debugger.attach('1.3');
      await win.webContents.debugger.sendCommand('Emulation.setTouchEmulationEnabled', { enabled: touch });
      await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }],
      });
      await wait('typeof fixtureReceive==="function" && document.querySelector(".classroom-v3-seat-reward")');
      win.webContents.sendInputEvent({ type: 'mouseMove', x: width - 2, y: height - 2 });
      assert.equal(await run('Boolean(document.querySelector(".classroom-v3-award-notice"))'), false, 'historical awards stay quiet');
      assert.equal(await run('fixtureGpuStarts'),0,'No GPU work at classroom entry');
    };
    const award = async (ids = ['student']) => {
      await run('fixtureAward(' + JSON.stringify(ids) + ')');
      await wait('document.querySelector(".classroom-v3-award-notice")');
    };
    if(process.argv.includes('--preview-only')){
      await enter(1440,900,'student');
      const directory=path.join(output,'animation-frames-3d-smooth');
      await fs.mkdir(directory,{recursive:true});
      const frameTimes=[],writes=[];let last=0;const start=Date.now();
      win.webContents.setFrameRate(30);
      const onPaint=(_event,_rect,image)=>{
        const elapsed=(Date.now()-start)/1000;
        if(elapsed-last<.05)return;
        last=elapsed;const index=frameTimes.length;frameTimes.push(elapsed);
        const bytes=image.resize({width:960,height:600,quality:'good'}).toPNG();
        writes.push(fs.writeFile(path.join(directory,String(index).padStart(3,'0')+'.png'),bytes));
      };
      win.webContents.on('paint',onPaint);
      await award();
      await new Promise(resolve=>setTimeout(resolve,3800));
      win.webContents.removeListener('paint',onPaint);
      await Promise.all(writes);
      assert(frameTimes.length>20,'Compositor preview frames available');
      await fs.writeFile(path.join(output,'animation-frame-times-smooth.json'),JSON.stringify(frameTimes));
      console.log('EXPORTED 3D animation preview frames: '+frameTimes.length);
      return;
    }
    for (const [width, height, touch] of [[1440, 900, false], [390, 844, true]]) {
      await enter(width, height, 'student', false, touch);
      const badge = await run(`(()=>{const e=document.querySelector('.classroom-v3-seat-reward'),s=getComputedStyle(e);return {opacity:s.opacity,visibility:s.visibility,count:e.textContent.trim(),video:!!e.closest('.has-video'),hover:e.closest('article').matches(':hover'),touch:matchMedia('(hover: none)').matches}})()`);
      assert.equal(badge.opacity, '1');
      assert.equal(badge.visibility, 'visible');
      assert.equal(badge.count, '3');
      assert.equal(badge.video, true);
      assert.equal(badge.hover, false);
      assert.equal(badge.touch, touch);
      if(touch) await run("document.querySelector('.classroom-v3-seat-reward').closest('article').scrollIntoView({block:'nearest',inline:'center',behavior:'instant'})");
      await capture('badge-always-visible-' + width + '.png');
      if(touch) await run("document.querySelector('.classroom-v3-seats').scrollTo({left:0,behavior:'instant'})");
      await award();
      await wait('document.querySelector(".classroom-v3-award-notice[data-personal=true]")?.textContent.includes("累计 4 个奖杯")');
      await wait('document.querySelector("[data-award-trophy] canvas[data-renderer=webgl]")');
      const bounds = await run(`(()=>{const e=document.querySelector('.classroom-v3-award-notice'),r=e.getBoundingClientRect();return {left:r.left,right:r.right,bottom:r.bottom,viewport:innerWidth,pointerEvents:getComputedStyle(e).pointerEvents,overflow:e.scrollWidth>e.clientWidth}})()`);
      assert(bounds.left >= 0 && bounds.right <= width && bounds.bottom <= height && !bounds.overflow);
      assert.equal(bounds.pointerEvents, 'none');
      await capture('student-celebration-' + width + '.png');
      await wait('document.querySelector(".classroom-v3-award-notice[data-phase=flying]")');
      await new Promise(resolve=>setTimeout(resolve,250));
      const midFlight=await run(`(()=>{const e=document.querySelector('[data-award-trophy]'),r=e.getBoundingClientRect(),n=e.closest('.classroom-v3-award-notice');return {phase:n.dataset.phase,x:r.left+r.width/2,y:r.top+r.height/2,transform:e.style.transform,captionOpacity:getComputedStyle(n.querySelector('[class*=caption]')).opacity}})()`);
      assert.equal(midFlight.phase,'flying');assert.notEqual(midFlight.transform,'');
      assert(Number(midFlight.captionOpacity)<.1,JSON.stringify(midFlight));
      checks.push({width,midFlight});
      await fs.writeFile(path.join(output,'student-trophy-in-flight-'+width+'.png'),(await win.webContents.capturePage()).toPNG());
      await wait('document.querySelector(".classroom-v3-award-notice[data-phase=landed]")');
      const landing=await run(`(()=>{const e=document.querySelector('[data-award-trophy]'),r=e.getBoundingClientRect(),b=document.querySelector('[data-reward-user-id="student"] svg').getBoundingClientRect();return {target:e.dataset.flightTarget,distance:Math.hypot(r.left+r.width/2-b.left-b.width/2,r.top+r.height/2-b.top-b.height/2)}})()`);
      assert.equal(landing.target,'seat');assert(landing.distance<8,JSON.stringify(landing));
      checks.push({width,landing});
      await run('fixtureAward();fixtureAward()');
      await wait('document.querySelector(".classroom-v3-award-notice[data-personal=true]")?.textContent.includes("累计 6 个奖杯")');
      await wait('!document.querySelector(".classroom-v3-award-notice")');
      assert.equal(await run('document.querySelector(".classroom-v3-seat-reward").textContent.trim()'), '6');
      await win.reload();
      await wait('typeof fixtureReceive==="function" && document.querySelector(".classroom-v3-seat-reward")');
      assert.equal(await run('Boolean(document.querySelector(".classroom-v3-award-notice"))'), false);
      await award(['stage-0']);
      assert.equal(await run('document.querySelector(".classroom-v3-award-notice").dataset.personal'), 'false');
      assert.equal(await run('document.querySelector(".classroom-v3-award-notice").textContent.includes("同学 1")'), true);
      assert.equal(await run('fixtureGpuStarts'),0,'Classmate notice does not load WebGL');
      await capture('classmate-light-notice-' + width + '.png');
      checks.push({ width, badge, bounds, ownAward: true, rapidAwards: true, refreshQuiet: true, classmateLightNotice: true });
    }
    await enter(1440, 900, 'teacher');
    await award();
    assert.equal(await run('document.querySelector(".classroom-v3-award-notice").dataset.personal'), 'false');
    assert.equal(await run('fixtureGpuStarts'),0,'Teacher notice does not load WebGL');
    checks.push({ teacherLightNotice: true, gpuStarts:0 });
    await enter(390, 844, 'student', true, true);
    await award();
    await wait('document.querySelector(".classroom-v3-award-notice[data-personal=true]")');
    const reduced = await run(`(()=>{const e=document.querySelector('.classroom-v3-award-notice');return {text:e.textContent,animations:[...e.querySelectorAll('svg,i,span')].map(x=>getComputedStyle(x).animationName).filter(x=>x!=='none'),particles:[...e.querySelectorAll('i')].every(x=>getComputedStyle(x).display==='none')}})()`);
    assert.equal(reduced.animations.length, 0);
    assert.equal(reduced.particles, true);
    assert(reduced.text.includes('累计 4 个奖杯'));
    await capture('student-reduced-motion.png');
    checks.push({ reducedMotion: true, reduced });
    await enter(1440, 900, 'student');
    await run("document.documentElement.className='dark'");
    await award();
    await capture('student-celebration-dark.png');
    assert.equal(await run("getComputedStyle(document.querySelector('.classroom-v3-award-notice')).backgroundColor==='rgb(255, 255, 255)'"),false);
    checks.push({ darkTheme: true });
    await enter(390, 844, 'student',false,true);
    await run("fixturePayload.runtime.members.find(m=>m.userId==='student').onStage=false;fixturePayload.runtime.revision++;fixtureReceive({courseId:'fixture-session',topic:'runtime',revision:fixturePayload.runtime.revision},'teacher:tab')");
    await wait('!document.querySelector("[data-reward-user-id=student]")');
    await wait('document.querySelector("[data-award-personal-counter=student]")');
    await award();
    await wait('document.querySelector(".classroom-v3-award-notice[data-phase=landed]")');
    assert.equal(await run('document.querySelector("[data-award-trophy]").dataset.flightTarget'),'personal-counter');
    assert.equal(await run('document.querySelector("[data-award-personal-counter=student]").textContent.trim()'),'4');
    await capture('offstage-personal-counter.png');
    checks.push({offstagePersonalCounter:true});
    await enter(1440,900,'student');
    await award();
    await wait('document.querySelector(".classroom-v3-award-notice[data-phase=flying]")');
    win.setContentSize(900,700);
    await wait('document.querySelector(".classroom-v3-award-notice[data-phase=landed]")');
    const resizedLanding=await run(`(()=>{const e=document.querySelector('[data-award-trophy]'),r=e.getBoundingClientRect(),b=document.querySelector('[data-reward-user-id="student"] svg').getBoundingClientRect();return Math.hypot(r.left+r.width/2-b.left-b.width/2,r.top+r.height/2-b.top-b.height/2)})()`);
    assert(resizedLanding<8,String(resizedLanding));
    checks.push({resizeDuringFlight:true,distance:resizedLanding});
    await enter(1440,900,'student');
    await award();
    await wait('document.querySelector("[data-award-trophy] canvas[data-renderer=webgl]")');
    await run("document.querySelector('[data-award-trophy] canvas').getContext('webgl').getExtension('WEBGL_lose_context').loseContext()");
    await wait('getComputedStyle(document.querySelector("[data-renderer=fallback]")).display!=="none"');
    await wait('document.querySelector(".classroom-v3-award-notice[data-phase=landed]")');
    assert.equal(await run('document.querySelector("[data-award-trophy]").dataset.flightTarget'),'seat');
    checks.push({webglContextLossKeepsRewardAndFlight:true});
    await enter(1440, 900, 'student');
    await award();
    await fs.mkdir(path.join(output,'animation-frames-3d'),{recursive:true});
    const frameTimes=[]; const captureStart=Date.now();
    for(let i=0;i<34;i++){
      frameTimes.push((Date.now()-captureStart)/1000);
      await fs.writeFile(path.join(output,'animation-frames-3d',String(i).padStart(3,'0')+'.png'),(await win.webContents.capturePage()).toPNG());
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    await fs.writeFile(path.join(output,'animation-frame-times.json'),JSON.stringify(frameTimes));
    await fs.writeFile(path.join(output, 'ui-checks.json'), JSON.stringify({ passed: true, checks,
      boundary: 'Actual ClassroomV3, award component and shipped CSS in Chromium. Server state, media and signaling simulated; no production awards issued.' }, null, 2));
    console.log('PASS trophy UI: persistent badges, real WebGL trophy, correct desktop/mobile landing, resize, offstage fallback, context loss, rapid awards, quiet refresh, reduced motion');
  }
  const cleanup = () => { fixture?.win.destroy(); fixture?.server.close(); };
  app.whenReady().then(main).then(() => { cleanup(); app.quit(); }).catch(error => { console.error(error); cleanup(); app.exit(1); });
}
