import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";

test("whiteboard renewal respects current role even with an old write grant", async () => {
  const directory = await mkdtemp(path.join(process.cwd(), "node_modules/.whiteboard-role-"));
  try {
    const output = path.join(directory, "route.cjs");
    const mocks: Record<string, string> = {
      "server-only": "",
      "@/lib/db": `export const prisma={classroomMemberState:{findUnique:async()=>({whiteboardWritable:globalThis.fixtureWritable,onStage:true,stageState:'accepted'})}};`,
      "@/lib/classroom/server/connections": `export const classroomConnectionReplaced=async()=>false;export const normalizeClassroomClientId=()=>undefined;`,
      "@/lib/classroom/server/request-access": `export const resolveClassroomRequestAccess=async()=>({ok:true,access:{role:globalThis.fixtureRole,sessionId:'lesson',courseId:'course'},session:{userId:'user'}});`,
      "@/lib/classroom/server/recorder-access": `export const resolveRecorderAccess=async()=>null;`,
      "@/lib/classroom/whiteboard/provider-factory": `export const calls=[];export const getWhiteboardProvider=()=>({issueJoinCredential:async input=>{calls.push(input);return {writable:input.writable}}});`,
    };
    await build({
      stdin: { contents: `export {POST} from './src/app/api/classroom/session/whiteboard-credential/route';export {calls} from '@/lib/classroom/whiteboard/provider-factory';`, resolveDir: process.cwd(), loader: "ts" },
      outfile: output, bundle: true, format: "cjs", platform: "node", packages: "external", tsconfig: "tsconfig.json",
      plugins: [{ name: "credential-test-dependencies", setup(builder) {
        builder.onResolve({ filter: /.*/ }, ({ path: name }) => name in mocks ? { path: name, namespace: "mock" } : undefined);
        builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path: name }) => ({ contents: mocks[name], loader: "js" }));
      } }],
    });
    const api = createRequire(import.meta.url)(output);
    const fixture = globalThis as typeof globalThis & { fixtureRole?: string; fixtureWritable?: boolean };
    for (const [role, grant, expected] of [
      ["observer", true, false], ["unknown", true, false], ["student", true, true],
      ["student", false, false], ["teacher", false, true], ["assistant", false, true],
    ] as const) {
      fixture.fixtureRole = role;
      fixture.fixtureWritable = grant;
      const response = await api.POST(new Request("https://example.test/api/classroom/session/whiteboard-credential", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: "lesson" }),
      }));
      assert.equal(response.status, 200);
      assert.equal((await response.json()).whiteboard.writable, expected, `${role} with grant ${grant}`);
      assert.equal(api.calls.at(-1).writable, expected);
    }
  } finally {
    const fixture = globalThis as typeof globalThis & { fixtureRole?: string; fixtureWritable?: boolean };
    delete fixture.fixtureRole;
    delete fixture.fixtureWritable;
    await rm(directory, { recursive: true, force: true });
  }
});
