/* eslint-disable @typescript-eslint/no-require-imports -- Actual classroom Chromium fixture with simulated HTTP/media/signaling. */
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');

if (!process.versions.electron) {
  const binary = require(path.join(root, 'clients/desktop/node_modules/electron'));
  const result = spawnSync(binary, [__filename], { cwd: root, stdio: 'inherit',
    env: { ...process.env, NODE_PATH: path.join(root, 'clients/desktop/node_modules') }, timeout: 180000 });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} else {
  const { app } = require('electron');
  const assert = require('node:assert/strict');
  const fs = require('node:fs/promises');
  const { createClassroomBrowserFixture } = require('../helpers/classroom-browser-fixture.cjs');
  let fixture;
  async function main() {
    const output = path.join(root, 'outputs/classroom-overtime-leave-2026-10-31/ui');
    fixture = await createClassroomBrowserFixture({ outputDirectory: output, transformSource(source) {
      source=source.replace('end=new Date(Date.now()+3600000).toISOString()', "end=new Date(Date.now()+(new URLSearchParams(location.search).has('overtime')?-60000:3600000)).toISOString()");
      return source.replace("  if(url.pathname==='/api/classroom/session')", `  if(url.pathname==='/api/classroom/session/leave'){
        (window.fixtureLeaves??=[]).push(body);
        if(window.fixtureLeaveFailure)return Response.json({error:'simulated failure'},{status:503});
        if(window.fixtureHoldLeave)await new Promise(resolve=>window.fixtureReleaseLeave=resolve);
        return Response.json({ok:true,classEnded:body.leaveIntent==='finishIfLastTeacher'});
      }
      if(url.pathname==='/api/classroom/session')`);
    } });
    const { win, run, wait, capture, url, checks } = fixture;
 const clickButton=async text=>assert(await run('(()=>{const e=[...document.querySelectorAll("button")].find(e=>e.textContent.trim()==='+JSON.stringify(text)+');if(!e)return false;e.click();return true})()'),'button '+text);
 const enter=async(width,height,query='&overtime=1',role='teacher')=>{win.setContentSize(width,height);await win.loadURL(url+'&role='+role+query);await wait('typeof fixtureReceive==="function"&&document.querySelector(".classroom-minimal-header button[aria-label=返回课程]")');};
 for(const [width,height] of [[1440,900],[390,844]]){
   await enter(width,height);
   await run('document.querySelector(".classroom-minimal-header button[aria-label=返回课程]").click()');
   await wait('document.querySelector("#overtime-leave-title")');
   assert.equal(await run('(window.fixtureLeaves||[]).length'),0);
   assert.equal(await run('document.activeElement.textContent.trim()'),'取消');
   await capture('dialog-'+width+'.png');
   const bounds=await run('(()=>{const e=document.querySelector("#overtime-leave-title").closest("section"),r=e.getBoundingClientRect();return{left:r.left,right:r.right,viewport:innerWidth,overflow:e.scrollWidth>e.clientWidth}})()');
   assert(bounds.left>=0&&bounds.right<=bounds.viewport&&!bounds.overflow);
   await clickButton('暂时离开');await wait('Boolean(window.fixtureNavigation)');
   assert.equal(await run('fixtureLeaves[0].leaveIntent'),'temporary');
   assert.equal(await run('fixtureLeaves[0].voluntary'),true);
   checks.push({width,temporary:true,bounds});
 }
 await enter(1440,900);
 await run('document.querySelector(".classroom-minimal-header button[aria-label=返回课程]").click()');await wait('document.querySelector("#overtime-leave-title")');
 await run('window.fixtureHoldLeave=true');await clickButton('下课退出');
 await wait('typeof fixtureReleaseLeave==="function"');
 assert.equal(await run('Boolean(window.fixtureNavigation)'),false);
 assert.equal(await run('document.querySelector("#overtime-leave-title").closest("section").querySelectorAll("button:not(:disabled)").length'),0);
 await run('fixtureReleaseLeave()');await wait('Boolean(window.fixtureNavigation)');
 assert.equal(await run('fixtureLeaves[0].leaveIntent'),'finishIfLastTeacher');
 assert.equal(await run('fixtureLeaves[0].cycleStartedAt===fixturePayload.runtime.startedAt'),true);
 checks.push({acknowledgmentBeforeNavigation:true});

 await enter(1440,900);
 await run('document.querySelector(".classroom-minimal-header button[aria-label=返回课程]").click()');await wait('document.querySelector("#overtime-leave-title")');
 await run('window.fixtureLeaveFailure=true');await clickButton('下课退出');
 await wait('document.querySelector("#overtime-leave-title").closest("section").querySelector("[role=alert]")');
 assert.equal(await run('Boolean(window.fixtureNavigation)'),false);
 await capture('retry-error.png');
 await run('window.fixtureLeaveFailure=false');await clickButton('下课退出');await wait('Boolean(window.fixtureNavigation)');
 checks.push({failedLeaveRetainsClassroom:true,retry:true});

 await enter(1440,900,'');
 await run('document.querySelector(".classroom-minimal-header button[aria-label=返回课程]").click()');await wait('Boolean(window.fixtureNavigation)');
 assert.equal(await run('fixtureLeaves[0].leaveIntent'),'temporary');
 assert.equal(await run('Boolean(document.querySelector("#overtime-leave-title"))'),false);
 checks.push({normalTimeLeaveIsTemporary:true});

 await enter(1440,900);
 await run('window.fixtureBeacons=[];navigator.sendBeacon=(url,blob)=>{fixtureBeacons.push({url,blob});return true};window.dispatchEvent(new PageTransitionEvent("pagehide",{persisted:false}))');
 assert.equal(await run('(window.fixtureLeaves||[]).length'),0);
 const beacon=await run('fixtureBeacons[0].blob.text()');
 assert.equal(JSON.parse(beacon).leaveIntent,undefined);
 assert.equal(JSON.parse(beacon).voluntary,undefined);
 checks.push({pagehideCannotFinish:true});
 await enter(1440,900,'&overtime=1','assistant');
 await run('document.querySelector(".classroom-minimal-header button[aria-label=返回课程]").click()');await wait('document.querySelector("#overtime-leave-title")');
 await clickButton('下课退出');await wait('Boolean(window.fixtureNavigation)');
 assert.equal(await run('fixtureLeaves[0].leaveIntent'),'finishIfLastTeacher');
 checks.push({assistantUsesExistingEndClassAuthority:true});
 await fs.writeFile(path.join(output,'checks.json'),JSON.stringify({passed:true,checks,boundary:'Actual ClassroomV3 and shipped CSS in Chromium; HTTP, RTC and signaling mocked.'},null,2));
 console.log('PASS overtime classroom UI: desktop/mobile dialog, temporary leave, acknowledgment, retry, normal leave and pagehide');
  }
  const cleanup=()=>{fixture?.win.destroy();fixture?.server.close();};
  app.whenReady().then(main).then(()=>{cleanup();app.quit();}).catch(error=>{console.error(error);cleanup();app.exit(1);});
}
