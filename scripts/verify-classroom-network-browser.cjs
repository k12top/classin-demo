/* eslint-disable @typescript-eslint/no-require-imports -- Local browser validation server; never deployed. */
// Synthetic media only. Credentials are minted for one isolated channel and
// returned only to localhost. App certificates never leave this process.
const fs = require("node:fs/promises");
const path = require("node:path");
const http = require("node:http");
const { randomUUID } = require("node:crypto");
const dotenv = require("dotenv");
const esbuild = require("esbuild");
const { RtcTokenBuilder, RtcRole } = require("agora-token");
const { execFileSync } = require("node:child_process");

async function main() {
  const root = path.resolve(__dirname, "..");
  const env = dotenv.parse(await fs.readFile(path.join(root, ".env.local")));
  if (!env.AGORA_APP_ID || !env.AGORA_APP_CERTIFICATE) throw Error("Agora configuration is missing");
  const channelName = `network-check-${randomUUID().slice(0, 12)}`;
  const scenario = process.env.NETWORK_BROWSER_TEST_SCENARIO === "liveBroadcasting" ? "liveBroadcasting" : "communication";
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const output = path.join(root, "outputs/classroom-network-2026-11-04/browser", runId);
  await fs.mkdir(output, { recursive: true });
  const bundle = await esbuild.build({ entryPoints: [path.join(root, "tests/fixtures/classroom-network-browser.jsx")],
    bundle: true, write: false, platform: "browser", format: "iife", tsconfig: path.join(root,"tsconfig.json"),
    define: {"process.env":"{}"} });
  const cssPath = path.join(output, "fixture.css");
  execFileSync("node", [require.resolve("tailwindcss/lib/cli.js"), "-i", path.join(root,"src/app/globals.css"), "-o", cssPath,"--minify"], {stdio:"pipe"});
  const css = await fs.readFile(cssPath,"utf8") + (await Promise.all(["classroom-classin.css","classroom-light.css","classroom-responsive.css"].map(name=>fs.readFile(path.join(root,"src/app",name),"utf8")))).join("\n");
  const identities = { teacher:101, student:201, healthy:202 };
  function credential(role) {
    const rtcUid = identities[role];
    const token = uid => RtcTokenBuilder.buildTokenWithUid(env.AGORA_APP_ID,env.AGORA_APP_CERTIFICATE,channelName,uid,role === "teacher" ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER,3600,3600);
    return {provider:"agora",appId:env.AGORA_APP_ID,channelName,rtcUid,userId:role,role:role === "teacher" ? "teacher" : "student",scenario,token:token(rtcUid),
      ...(role === "teacher" && {screenShare:{rtcUid:1_000_000_101,userId:"teacher::screen",token:token(1_000_000_101)}})};
  }
  const server = http.createServer(async (req,res)=>{
    const url = new URL(req.url,"http://127.0.0.1");
    const role = url.searchParams.get("role") || "student";
    res.setHeader("Cache-Control","no-store");
    if (url.pathname === "/fixture.js") {res.setHeader("Content-Type","application/javascript");return res.end(bundle.outputFiles[0].text);}
    if (url.pathname === "/fixture.css") {res.setHeader("Content-Type","text/css");return res.end(css);}
    if (url.pathname === "/credential" && req.method === "GET" && Object.hasOwn(identities,role)) {
      res.setHeader("Content-Type","application/json");return res.end(JSON.stringify(credential(role)));
    }
    if (url.pathname === "/evidence" && req.method === "POST" && Object.hasOwn(identities,role)) {
      let body="";for await (const chunk of req) {body+=chunk;if(body.length>2_000_000){res.writeHead(413);return res.end();}}
      try {
        const value=JSON.parse(body);
        // Evidence accepts only the fixture's explicitly sanitized media stats.
        await fs.writeFile(path.join(output,`${role}.json`),JSON.stringify({runId,role,...value},(key,item)=>/deviceId$/i.test(key)?undefined:item,2));
        res.setHeader("Content-Type","application/json");return res.end(JSON.stringify({saved:true}));
      } catch {res.writeHead(400);return res.end();}
    }
    if(url.pathname!=="/"){res.writeHead(404);return res.end();}
    res.setHeader("Content-Type","text/html; charset=utf-8");
    res.end('<!doctype html><html lang="zh-CN" class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>课堂真实 RTC 弱网验证</title><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
  });
  server.listen(Number(process.env.NETWORK_BROWSER_TEST_PORT || 4179),"127.0.0.1",()=>console.log(JSON.stringify({ready:true,url:`http://127.0.0.1:${server.address().port}/`,scenario,output,boundary:"Real Agora media with synthetic canvas/audio; no lesson database, recordings, physical microphone or camera."})));
  process.on("SIGTERM",()=>server.close(()=>process.exit(0)));
}
main().catch(error=>{console.error(error.code || error.name);process.exit(1);});
