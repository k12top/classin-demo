/* eslint-disable @typescript-eslint/no-require-imports -- Actual classroom UI with simulated media and HTTP. */
const { app } = require("electron");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { createClassroomBrowserFixture } = require("../helpers/classroom-browser-fixture.cjs");
let fixture;
async function main() {
  const output = path.resolve(__dirname, "../../outputs/classroom-camera-stage-2026-11-03");
  fixture = await createClassroomBrowserFixture({ outputDirectory: output, transformSource(source) {
    return source.replace("window.fixtureVisibility=", "import { classroomCompositionKey, placeClassroomBoardItem, touchComposition } from '@/lib/classroom/composition'; window.fixtureVisibility=")
      .replace("if(url.pathname==='/api/fixture/file')", `if(url.pathname.endsWith('/actions') && body.action?.type === 'placeBoardItem') {
        window.fixturePlacementBody = body;
        payload.runtime.revision += 50; // Another caption/presence update just before the write.
        if(window.fixtureLayoutChanged) payload.runtime.composition = touchComposition(placeClassroomBoardItem(payload.runtime.composition, {
          id: 'camera:assistant', kind: 'camera', sourceId: 'assistant', rect: {x:.1,y:.1,width:.2,height:.2}, locked:false,visible:true
        }), 'assistant');
        const conflict = body.expectedCompositionKey !== classroomCompositionKey(payload.runtime.composition);
        window.fixturePlacementStatus = conflict ? 409 : 200;
        if(!conflict) { payload.runtime.composition = touchComposition(placeClassroomBoardItem(payload.runtime.composition, body.action.item), uid); payload.runtime.revision++; }
        return Response.json({ runtime:payload.runtime, ...(conflict && {error:'课堂状态已更新，请重试'}) }, {status:window.fixturePlacementStatus});
      }
      if(url.pathname==='/api/fixture/file')`);
  } });
  const { win, run, wait, url, capture, settle } = fixture;
  const checks = [];
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    win.setContentSize(width, height);
    await win.loadURL(url + "&role=teacher");
    await wait("document.querySelector('button.classroom-v3-seat-preview') && typeof fixtureReceive==='function'");
    await run("document.querySelector('button.classroom-v3-seat-preview').click()");
    await wait("fixturePlacementStatus === 200 && document.querySelector('.classroom-v3-board-item video')");
    await settle();
    assert.equal(await run("document.querySelectorAll('.classroom-v3-board-item').length"), 1);
    assert.equal(await run("document.body.innerText.includes('课堂状态已更新，请重试')"), false);
    assert.equal(await run("fixturePlacementBody.expectedRevision < fixturePayload.runtime.revision - 40"), true);
    assert.equal(await run("typeof fixturePlacementBody.expectedCompositionKey"), "string");
    await capture(`camera-${width}.png`);
    checks.push(`camera persists with unrelated revisions at ${width}px`);
  }
  await win.loadURL(url + "&role=teacher");
  await wait("document.querySelector('button.classroom-v3-seat-preview') && typeof fixtureReceive==='function'");
  await run("window.fixtureLayoutChanged=true;document.querySelector('button.classroom-v3-seat-preview').click()");
  await wait("fixturePlacementStatus === 409 && document.body.innerText.includes('课堂状态已更新，请重试')");
  assert.deepEqual(await run("fixturePayload.runtime.composition.boardItems.map(item=>item.id)"), ["camera:assistant"]);
  checks.push("another teacher's layout is preserved after a conflict");
  await fs.writeFile(path.join(output, "checks.json"), JSON.stringify({ passed: true, checks, boundary: "Actual ClassroomV3, shipped CSS and camera click in Chromium; HTTP, RTC and whiteboard simulated. No physical camera or production classroom changes." }, null, 2));
  console.log("PASS", checks.join("; "));
}
app.whenReady().then(main).then(() => { fixture?.win.destroy(); fixture?.server.close(); app.quit(); }).catch(error => { console.error(error); fixture?.win.destroy(); fixture?.server.close(); app.exit(1); });
