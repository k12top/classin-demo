import assert from "node:assert/strict";
import { before, beforeEach, test } from "node:test";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { NextRequest, NextResponse } from "next/server";

const fixture = {
  status: "finished", enrolled: true,
  startTime: new Date(Date.now() - 7_200_000),
  endTime: new Date(Date.now() - 3_600_000),
};
Object.assign(globalThis, { __activityAccessFixture: fixture });
const stubs: Record<string, string> = {
  "server-only": "",
  "@/lib/db": "export const databasePoolSnapshot=()=>null;export const isTransientDatabaseError=()=>false;export const prisma={};",
  "@/lib/course-session-status": "export const syncCourseStatusFromSessions=async()=>{};",
  "@/lib/session": "export const getSessionFromRequest=async request=>{const userId=request.headers.get('x-test-user');return userId?{userId,name:userId,displayName:userId}:null};",
  "@/lib/join-link": "export const verifyShareAccessToken=async()=>({ok:false});",
  "@/lib/course-session-roster": `
    export async function resolveCourseSessionReference(id) {
      if(id!=='lesson')return null;
      const f=globalThis.__activityAccessFixture;
      return {id,courseId:'course',title:'Lesson',status:f.status,startTime:f.startTime,endTime:f.endTime,endedAt:null,roomUuid:'room',roomType:4};
    }
    export async function getEffectiveSessionRoster(){return {leadTeacherId:'teacher',teachers:[{userId:'teacher',displayName:'Teacher',avatar:'',role:'teacher'}]};}
    export function rosterContainsUser(roster,ids){
      if(ids.includes('teacher'))return {kind:'teacher',member:roster.teachers[0]};
      if(ids.includes('student')&&globalThis.__activityAccessFixture.enrolled)return {kind:'student',member:{temporary:false}};
      return null;
    }`,
};
let api: {
  activityActor: (request: NextRequest, id: string, shareAccess?: string, purpose?: "activities") => Promise<NextResponse | { role: string }>;
  clearCourseSessionAccessCache: () => void;
};
before(async () => {
  const bundle = await build({
    stdin: { contents: `export {activityActor} from '@/lib/classroom/server/activity-route';export {clearCourseSessionAccessCache} from '@/lib/course-session-access';`, resolveDir: process.cwd() },
    bundle: true, write: false, platform: "node", format: "cjs", packages: "external", tsconfig: "tsconfig.json",
    plugins: [{ name: "activity-access-boundaries", setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: "fixture" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: stubs[args.path], loader: "js" }));
    } }],
  });
  const moduleObject = { exports: {} };
  new Function("require", "module", "exports", bundle.outputFiles[0].text)(createRequire(`${process.cwd()}/package.json`), moduleObject, moduleObject.exports);
  api = moduleObject.exports as typeof api;
});
beforeEach(() => {
  fixture.status = "finished";
  fixture.enrolled = true;
  fixture.startTime = new Date(Date.now() - 7_200_000);
  fixture.endTime = new Date(Date.now() - 3_600_000);
  api.clearCourseSessionAccessCache();
});
const request = (user = "student") => new NextRequest("http://localhost/api/sessions/lesson/classroom/activities", { headers: { "x-test-user": user } });

test("authorized activity review survives lesson end without admitting classroom/image requests", async () => {
  for (const user of ["teacher", "student"]) {
    const review = await api.activityActor(request(user), "lesson", undefined, "activities");
    assert.ok(!(review instanceof NextResponse));
    assert.equal(review.role, user);
    const admission = await api.activityActor(request(user), "lesson");
    assert.ok(admission instanceof NextResponse);
    assert.equal(admission.status, 403);
  }
});
test("review still requires login and enrollment and rechecks a revoked roster", async () => {
  assert.equal((await api.activityActor(request(""), "lesson", undefined, "activities") as NextResponse).status, 401);
  assert.equal((await api.activityActor(request("outsider"), "lesson", undefined, "activities") as NextResponse).status, 403);
  assert.ok(!(await api.activityActor(request(), "lesson", undefined, "activities") instanceof NextResponse));
  fixture.enrolled = false;
  assert.equal((await api.activityActor(request(), "lesson", undefined, "activities") as NextResponse).status, 403);
});
test("preparation bypasses early-entry timing only for activities; cancellation stays denied", async () => {
  fixture.status = "scheduled";
  fixture.startTime = new Date(Date.now() + 86_400_000);
  fixture.endTime = new Date(Date.now() + 90_000_000);
  assert.ok(!(await api.activityActor(request("teacher"), "lesson", undefined, "activities") instanceof NextResponse));
  assert.equal((await api.activityActor(request("teacher"), "lesson") as NextResponse).status, 403);
  fixture.status = "cancelled";
  assert.equal((await api.activityActor(request("teacher"), "lesson", undefined, "activities") as NextResponse).status, 403);
  assert.equal((await api.activityActor(request(), "missing", undefined, "activities") as NextResponse).status, 404);
});
