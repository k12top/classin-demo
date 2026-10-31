/* eslint-disable @typescript-eslint/no-require-imports -- Actual classroom UI with isolated HTTP, media and signaling. */
const path=require('node:path'),{spawnSync,execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
if(!process.versions.electron){
  execFileSync(process.execPath,[require.resolve('tailwindcss/lib/cli.js'),'-i',path.join(root,'src/app/globals.css'),'-o',path.join(root,'node_modules/.cache/classroom-overtime-browser-fixture/global.css'),'--minify'],{cwd:root,stdio:'pipe'});
  const r=spawnSync(require(path.join(root,'clients/desktop/node_modules/electron')),[__filename,'--reuse-css'],{cwd:root,stdio:'inherit',env:{...process.env,NODE_PATH:path.join(root,'clients/desktop/node_modules')},timeout:180000});
  if(r.error)throw r.error;process.exitCode=r.status??1;
}else{
  const {app}=require('electron'),assert=require('node:assert/strict'),fs=require('node:fs/promises');
  const {createClassroomBrowserFixture}=require('../helpers/classroom-browser-fixture.cjs');let fixture;
  async function main(){
    const output=path.join(root,'outputs/classroom-share-stop-2026-10-31');
    fixture=await createClassroomBrowserFixture({outputDirectory:output,transformMedia(source){return source.replace("stopScreenShare:async()=>{snapshot.local.screenSharing=false;", "stopScreenShare:async()=>{window.fixtureStats.stopRequests=(window.fixtureStats.stopRequests||0)+1;if(window.fixtureStopFail)throw new Error('Simulated screen stop failure');if(window.fixtureStopHold)await new Promise(resolve=>window.fixtureReleaseStop=resolve);snapshot.local.screenSharing=false;");},transformSource(source){
      return source.replace("scenario:'communication',auxiliaryCamera", "scenario:'communication',screenShare:{rtcUid:1200000002,token:'screen-fixture',userId:uid},auxiliaryCamera")
        .replace(" window.fixtureActivityList=", " credential.publishAllowed=true;members.find(m=>m.userId==='student').screenShareState='accepted'; window.fixtureActivityList=")
        .replace("if(body.action.type==='arrangeVideoGallery')", `if(body.action.type==='startScreenShare'){
          const lease={userId:uid,clientId:body.clientId,claimId:body.action.claimId,rtcUid:1200000002};payload.runtime.composition.screenShares={['main:'+body.clientId]:lease,...(!new URLSearchParams(location.search).has('prepared')?{main:lease}:{})};payload.runtime.revision++;
        }if(body.action.type==='releaseScreenShare'){
          payload.runtime.composition.screenShares=Object.fromEntries(Object.entries(payload.runtime.composition.screenShares||{}).filter(([,v])=>v.claimId!==body.action.claimId));payload.runtime.revision++;
        }if(body.action.type==='arrangeVideoGallery')`);
    }});
    const {win,run,wait,capture,url,checks}=fixture;
    const enter=async(width,height,role='teacher',prepared=false)=>{
      win.setContentSize(width,height);await win.loadURL(url+'&role='+role+(prepared?'&prepared=1':''));
      await wait('document.querySelector("[data-dock-action=share]") && typeof fixtureReceive==="function"');
      await wait('!document.querySelector("[data-dock-action=share]").disabled');
      await run('document.querySelector("[data-dock-action=share]").click()');
      await wait('document.querySelector(".classroom-share-menu")');
      await run(`[...document.querySelectorAll('.classroom-share-menu button')].find(e=>e.textContent.trim()==='仅共享').click()`);
      await wait('document.querySelector("[data-dock-action=stop-share]") && !document.querySelector("[data-dock-action=stop-share]").disabled');
    };
    for(const [width,height,role,prepared] of [[1440,900,'teacher',false],[390,844,'teacher',false],[320,740,'teacher',false],[390,844,'student',false],[320,740,'student',true]]){
      await enter(width,height,role,prepared);
      assert.equal(await run('Boolean(document.querySelector(".classroom-screen-prepared"))'),false);
      const bounds=await run(`(()=>{const b=document.querySelector('[data-dock-action=stop-share]'),r=b.getBoundingClientRect(),d=b.closest('footer'),p=b.querySelector('span');return {left:r.left,right:r.right,width:r.width,height:r.height,label:p.textContent,labelDisplay:getComputedStyle(p).display,labelOpacity:getComputedStyle(p).opacity,labelInside:p.getBoundingClientRect().top>=r.top&&p.getBoundingClientRect().bottom<=r.bottom,dockOverflow:d.scrollWidth>d.clientWidth+1,buttonDisplay:getComputedStyle(b).display}})()`);
      assert.equal(bounds.label,'停止共享');assert.notEqual(bounds.labelDisplay,'none');assert.equal(bounds.labelOpacity,'1');assert(bounds.labelInside);assert.notEqual(bounds.buttonDisplay,'none');
      assert(bounds.left>=0&&bounds.right<=width&&bounds.height>=44&&!bounds.dockOverflow,JSON.stringify({width,role,bounds}));
      await capture('sharing-'+role+'-'+width+'.png');
      const crop=await run(`(()=>{const r=document.querySelector('.classroom-v3-dock').getBoundingClientRect();return{x:Math.max(0,Math.floor(r.left)-16),y:Math.max(0,Math.floor(r.top)-16),width:Math.ceil(r.width)+32,height:Math.ceil(r.height)+32}})()`);
      await fs.writeFile(path.join(output,'toolbar-'+role+'-'+width+'.png'),(await win.webContents.capturePage(crop)).toPNG());
      if(width<=760) assert.equal(await run('getComputedStyle(document.querySelector("[data-dock-action=fullscreen]")).display'),'none');
      await run('document.querySelector(".classroom-v3-dock .classroom-header-more").dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}))');
      await wait(`[...document.querySelectorAll('[role=menuitem]')].some(e=>e.textContent.trim()==='共享设置')`);
      if(width<=760) assert.equal(await run(`[...document.querySelectorAll('[role=menuitem]')].some(e=>e.textContent.trim()==='全屏课堂')`),true);
      await run(`[...document.querySelectorAll('[role=menuitem]')].find(e=>e.textContent.trim()==='共享设置').click()`);
      await wait('document.querySelector(".classroom-share-menu")');
      await run('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');
      await wait('!document.querySelector(".classroom-share-menu")');
      await run('document.querySelector("[data-dock-action=stop-share]").click()');
      await wait('!document.querySelector("[data-dock-action=stop-share]") && fixtureActions.includes("releaseScreenShare")');
      assert.equal(await run('fixtureStats.stopRequests'),1);assert.equal(await run('fixturePayload.runtime.status'),'live');
      assert.equal(await run('Boolean(window.fixtureNavigation)'),false);
      assert.equal(await run('Object.keys(fixturePayload.runtime.composition.screenShares).length'),0);
      checks.push({width,role,prepared,bounds,settingsReachable:true,oneClickStopsCaptureAndReleasesClaim:true,classroomRetained:true});
    }
    await enter(1440,900);
    await run('window.fixtureStopHold=true;document.querySelector("[data-dock-action=stop-share]").click()');
    await wait('typeof fixtureReleaseStop==="function" && document.querySelector("[data-dock-action=stop-share]").disabled');
    await run('document.querySelector("[data-dock-action=stop-share]").click()');
    assert.equal(await run('fixtureStats.stopRequests'),1);
    await run('fixtureReleaseStop()');await wait('!document.querySelector("[data-dock-action=stop-share]")');
    checks.push({duplicateStopsBlockedWhileBusy:true});
    await enter(1440,900);
    await run('window.fixtureStopFail=true;document.querySelector("[data-dock-action=stop-share]").click()');
    await wait('document.body.innerText.includes("Simulated screen stop failure") && !document.querySelector("[data-dock-action=stop-share]").disabled');
    await run('window.fixtureStopFail=false;document.querySelector("[data-dock-action=stop-share]").click()');
    await wait('!document.querySelector("[data-dock-action=stop-share]") && fixtureActions.includes("releaseScreenShare")');
    assert.equal(await run('fixtureStats.stopRequests'),2);checks.push({stopFailureRemainsRetryable:true});
    await fs.writeFile(path.join(output,'checks.json'),JSON.stringify({passed:true,checks,boundary:'Actual ClassroomV3 and shipped CSS in Chromium; HTTP, capture and signaling mocked. No production screens shared.'},null,2));
    console.log('PASS stop-share UI: no banner, visible desktop/mobile stop action, settings access, capture/claim cleanup, duplicate protection and retry');
  }
  const cleanup=()=>{fixture?.win.destroy();fixture?.server.close();};
  app.whenReady().then(main).then(()=>{cleanup();app.quit();}).catch(e=>{console.error(e);cleanup();app.exit(1);});
}
