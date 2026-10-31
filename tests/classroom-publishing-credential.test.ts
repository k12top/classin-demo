import assert from "node:assert/strict";
import test from "node:test";
import { requestClassroomPublishingCredential } from "../src/lib/classroom/publishing-credential";
import { studentScreenShareReady } from "../src/lib/classroom/screen-share-state";
import type { ClassroomJoinCredential } from "../src/lib/classroom/types";

const credential = { publishAllowed: true, screenShare: { rtcUid: 10000001, token: "fixture" } } as ClassroomJoinCredential;
const base = () => ({ sessionId: "lesson", clientId: "client", screen: true, signal: new AbortController().signal, wait: async () => {} });

test("being onstage is not screen readiness: the token, permission and publisher slot must all be ready", () => {
  const ready = { publishing: true, screenCredential: true, permitted: true, mayClaim: true };
  assert.equal(studentScreenShareReady(ready), true);
  for (const key of Object.keys(ready)) assert.equal(studentScreenShareReady({ ...ready, [key]: false }), false);
});

test("preparation retries temporary failures and a missing screen token finitely", async () => {
  let calls = 0;
  const result = await requestClassroomPublishingCredential({ ...base(), fetcher: async () => {
    calls++;
    return calls === 1 ? Response.json({ error: "busy" }, { status: 503 })
      : calls === 2 ? Response.json({ credential: { publishAllowed: true } }) : Response.json({ credential });
  } });
  assert.deepEqual(result, credential);assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(requestClassroomPublishingCredential({ ...base(), fetcher: async () => { calls++;return Response.json({ credential: { publishAllowed: true } }); } }));
  assert.equal(calls, 3);
});

test("revoked permissions fail once and a user can explicitly retry after authorization is restored", async () => {
  let calls = 0;
  await assert.rejects(requestClassroomPublishingCredential({ ...base(), fetcher: async () => { calls++;return Response.json({}, { status: 403 }); } }));
  assert.equal(calls, 1);
  assert.deepEqual(await requestClassroomPublishingCredential({ ...base(), fetcher: async () => Response.json({ credential }) }), credential);
});

test("ordinary promotion does not require a screen grant, and leaving aborts all retries", async () => {
  const ordinary = { publishAllowed: true } as ClassroomJoinCredential;
  assert.deepEqual(await requestClassroomPublishingCredential({ ...base(), screen: false, fetcher: async () => Response.json({ credential: ordinary }) }), ordinary);
  const controller = new AbortController();let calls = 0;
  await assert.rejects(requestClassroomPublishingCredential({ ...base(), signal: controller.signal, fetcher: async () => { calls++;controller.abort();return Response.json({}, { status: 503 }); } }));
  assert.equal(calls, 1);
});
