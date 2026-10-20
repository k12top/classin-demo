import assert from "node:assert/strict";
import test from "node:test";
import { loadModule } from "./helpers/load-module";

type Api = typeof import("../src/lib/whiteboard-convert");
function api(fetch: (url: string, init: RequestInit) => Promise<Response>, env: Record<string, string> = { WHITEBOARD_SDK_TOKEN: " secret-token ", WHITEBOARD_REGION: "sg" }) {
  return loadModule<Api>("src/lib/whiteboard-convert.ts", {}, { fetch, process: { env } });
}
const json = (data: unknown, status = 200) => Promise.resolve(Response.json(data, { status }));

test("Projector creation sends resource and configured region for both PDF and PPTX", async () => {
  const client = api(async (url, init) => {
    assert.equal(url, "https://api.netless.link/v5/projector/tasks");
    assert.deepEqual(init.headers, { Accept: "application/json", "Content-Type": "application/json", token: "secret-token", region: "sg" });
    const body = JSON.parse(String(init.body));
    assert.deepEqual(Object.keys(body).sort(), ["preview", "resource", "type"]);
    assert.equal(body.resource, "https://storage.test/document?signature=private");
    assert.equal(body.preview, true);
    return json({ uuid: `task-${body.type}`, status: "Waiting" });
  });
  assert.deepEqual(await client.startWhiteboardConversion("https://storage.test/document?signature=private", "pdf"), { taskUuid: "task-static", status: "Pending", type: "static", region: "sg" });
  assert.deepEqual(await client.startWhiteboardConversion("https://storage.test/document?signature=private", "PPTX"), { taskUuid: "task-dynamic", status: "Pending", type: "dynamic", region: "sg" });
});

test("Projector errors retain HTTP/code and never expose credentials or signed URLs", async () => {
  const client = api(() => json({ error: { code: 1, title: "invalid format", messages: ["https://storage.test/?signature=private", "secret-token"] } }, 400));
  await assert.rejects(client.startWhiteboardConversion("https://storage.test", "pdf"), error => {
    assert.match(String(error), /HTTP 400.*错误码 1/);
    assert.doesNotMatch(String(error), /signature|secret-token|storage.test/);
    return true;
  });
  await assert.rejects(api(() => json({}, 401)).startWhiteboardConversion("https://storage.test", "pdf"), /鉴权失败/);
  await assert.rejects(api(() => json({ error: { title: "service not enable" } }, 403)).startWhiteboardConversion("https://storage.test", "pdf"), /sg 区域尚未开通文档转换服务/);
  await assert.rejects(api(() => json({ status: "Waiting" })).startWhiteboardConversion("https://storage.test", "pdf"), /UUID/);
});

test("static Projector images become ordered whiteboard pages; dynamic tasks retain their actual prefix", async () => {
  const client = api(async (url, init) => {
    assert.equal((init.headers as Record<string, string>).region, "sg");
    return json(url.endsWith("/static") ? {
      status: "Finished", images: { "10": { width: 100, height: 200, url: "https://cdn/10.png" }, "2": { width: 200, height: 100, url: "https://cdn/2.png" } },
    } : { status: "Finished", prefix: "https://custom-cdn/dynamicConvert" });
  });
  const result = await client.getWhiteboardConversionStatus("static", "static");
  assert.deepEqual(result.scenes.map(scene => [scene.name, scene.ppt?.src]), [["2", "https://cdn/2.png"], ["10", "https://cdn/10.png"]]);
  assert.equal((await client.getWhiteboardConversionStatus("dynamic", "dynamic")).prefix, "https://custom-cdn/dynamicConvert");
});

test("provider Fail is terminal, while malformed completed results are rejected", async () => {
  const result = await api(() => json({ status: "Fail", errorCode: 203001, errorMessage: "https://private?signature=secret" })).getWhiteboardConversionStatus("task", "static");
  assert.equal(result.status, "Failed");
  assert.match(result.errorMessage!, /203001/);
  assert.doesNotMatch(result.errorMessage!, /signature/);
  await assert.rejects(api(() => json({ status: "Finished" })).getWhiteboardConversionStatus("task", "static"), /缺少/);
  await assert.rejects(api(() => json({ status: "Finished" })).getWhiteboardConversionStatus("task", "dynamic"), /缺少/);
});


test("conversion region is independent of the room, and existing tasks keep their region", async () => {
  const regions: string[] = [];
  const client = api(async (_url, init) => {
    regions.push((init.headers as Record<string, string>).region);
    return json(init.method === "POST" ? {uuid: "task", status: "Waiting"} : {status: "Converting"});
  }, { WHITEBOARD_SDK_TOKEN: "token", WHITEBOARD_REGION: "cn-hz", WHITEBOARD_CONVERSION_REGION: "sg" });
  assert.equal((await client.startWhiteboardConversion("https://storage.test/lesson.pdf", "pdf")).region, "sg");
  assert.equal((await client.getWhiteboardConversionStatus("old-task", "static", "cn-hz")).region, "cn-hz");
  assert.deepEqual(regions, ["sg", "cn-hz"]);
});
