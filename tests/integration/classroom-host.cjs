/* eslint-disable @typescript-eslint/no-require-imports -- Node/Electron CommonJS test runner. */
// Run with the repository desktop Electron runtime. Uses real cross-origin
// iframes and the production host hook with simulated session snapshots.
const { app, BrowserWindow } = require("electron");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const esbuild = require("esbuild");
const root = path.resolve(__dirname, "../..");
let window, host, child;
async function main() {
  const bundle = await esbuild.build({ stdin: { contents: `
    import React, { useEffect, useState } from "react";
    import { createRoot } from "react-dom/client";
    import { useClassroomHostEvents } from "@/lib/classroom/use-host-events";
    function Fixture() {
      const emit = useClassroomHostEvents(new URLSearchParams(location.search).get("parentOrigin"), false);
      const [session, setSession] = useState({course:{id:"course",sessionId:"lesson",status:"scheduled"},runtime:{status:"waiting",startedAt:null},credential:{userId:"teacher",role:"teacher"}});
      useEffect(() => { emit(session, "state_sync"); }, [emit, session]);
      useEffect(() => {
        const input = (event) => {
          if (event.source !== parent || event.data?.type !== "fixture.state") return;
          if (event.data.leave) emit(session, "user_leave", true);
          else setSession({...session, runtime:{...session.runtime,...event.data.runtime}});
        };
        addEventListener("message", input);
        return () => removeEventListener("message", input);
      }, [emit, session]);
      return <p>Host fixture {session.runtime.status}</p>;
    }
    createRoot(document.getElementById("root")).render(<Fixture/>);
  `, resolveDir: root, loader: "tsx" }, bundle: true, write: false, platform: "browser", format: "iife", tsconfig: path.join(root, "tsconfig.json") });
  const script = bundle.outputFiles[0].text;
  child = http.createServer((request, response) => {
    if (request.url === "/fixture.js") { response.setHeader("Content-Type", "application/javascript"); response.end(script); }
    else response.end('<div id="root"></div><script src="/fixture.js"></script>');
  });
  await new Promise((resolve) => child.listen(0, "127.0.0.1", resolve));
  const childOrigin = `http://127.0.0.1:${child.address().port}`;
  host = http.createServer((request, response) => {
    if (request.url === "/sibling") return response.end(`<script>parent.document.getElementById("frame").contentWindow.postMessage({type:"classroom.subscribe"},${JSON.stringify(childOrigin)})</script>`);
    const hostOrigin = `http://127.0.0.1:${host.address().port}`;
    response.end(`<script>window.events=[];window.addEventListener("message",e=>{if(e.origin===${JSON.stringify(childOrigin)} && e.source===document.getElementById("frame").contentWindow) window.events.push({origin:e.origin,data:e.data});});window.send=data=>document.getElementById("frame").contentWindow.postMessage(data,${JSON.stringify(childOrigin)});</script><iframe id="frame" src="${childOrigin}/?parentOrigin=${encodeURIComponent(hostOrigin)}"></iframe>`);
  });
  await new Promise((resolve) => host.listen(0, "127.0.0.1", resolve));
  await app.whenReady();
  window = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true } });
  await window.loadURL(`http://127.0.0.1:${host.address().port}`);
  const events = () => window.webContents.executeJavaScript("window.events");
  const waitFor = async (predicate) => {
    const deadline = Date.now() + 10_000;
    while (!predicate(await events())) { if (Date.now() > deadline) throw new Error("Iframe event timeout"); await new Promise((resolve) => setTimeout(resolve, 25)); }
  };
  await waitFor((list) => list.some((event) => event.data.type === "classroom.ready"));
  assert.equal((await events()).filter((event) => event.data.eventId).length, 0);
  await window.webContents.executeJavaScript('send({type:"fixture.state",runtime:{status:"live",startedAt:"2026-10-03T01:00:00Z"}})');
  await waitFor((list) => list.some((event) => event.data.type === "classroom.started"));
  const started = (await events()).find((event) => event.data.type === "classroom.started").data;
  assert.equal(started.courseId, "course");
  assert.equal(started.ended, false);
  await window.webContents.executeJavaScript('send({type:"classroom.subscribe"})');
  await waitFor((list) => list.filter((event) => event.data.eventId === started.eventId).length === 2);
  await window.webContents.executeJavaScript('const sibling=document.createElement("iframe");sibling.src="/sibling";document.body.append(sibling)');
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal((await events()).filter((event) => event.data.eventId === started.eventId).length, 2, "sibling cannot subscribe");
  await window.webContents.executeJavaScript('send({type:"fixture.state",runtime:{status:"ended"}})');
  await waitFor((list) => list.some((event) => event.data.type === "classroom.ended"));
  assert.equal((await events()).find((event) => event.data.type === "classroom.ended").data.ended, true);
  await window.webContents.executeJavaScript('send({type:"fixture.state",leave:true});send({type:"fixture.state",leave:true})');
  await waitFor((list) => list.some((event) => event.data.type === "classroom.user_left"));
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal((await events()).filter((event) => event.data.type === "classroom.user_left").length, 1);
  console.log("PASS: Chromium cross-origin iframe ready/subscription, exact origin, real hook start/end, stable replay IDs, sibling rejection and duplicate departure suppression.");
}
main().then(() => cleanup(0), (error) => { console.error(error); cleanup(1); });
function cleanup(code) { window?.destroy(); host?.close(); child?.close(); app.exit(code); }
