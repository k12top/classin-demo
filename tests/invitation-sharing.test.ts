import assert from "node:assert/strict";
import { test } from "node:test";
import { copyInvitationText, shareInvitation } from "../src/lib/invitation-sharing";
import { zhCN } from "../src/lib/i18n/locales/zh-CN";
import { en } from "../src/lib/i18n/locales/en";

test("copy uses the Clipboard API and treats unavailable APIs as manual copy", async () => {
  const writes: string[] = [];
  const navigator = { clipboard: { writeText: async (text: string) => { writes.push(text); } } } as unknown as Navigator;
  assert.equal(await copyInvitationText("Name\nhttps://example.test", { navigator }), true);
  assert.deepEqual(writes, ["Name\nhttps://example.test"]);
  assert.equal(await copyInvitationText("invite", {}), false);
  assert.equal(await copyInvitationText("invite", { navigator: { clipboard: { writeText: async () => { throw new Error("denied"); } } } as unknown as Navigator }), false);
});

test("native sharing is serialized and keeps cancellation separate from failure", async () => {
  let finish!: () => void;
  let calls = 0;
  let copies = 0;
  const navigator = { share: async () => { calls++; await new Promise<void>((resolve) => { finish = resolve; }); } };
  const copy = async () => { copies++; return true; };
  const data = { title: "Name", text: "Name\nhttps://example.test" };
  const pending = shareInvitation(data, navigator, copy);
  assert.equal(await shareInvitation(data, navigator, copy), "busy");
  assert.equal(calls, 1);
  finish();
  assert.equal(await pending, "shared");
  assert.equal(copies, 0);
  assert.equal(await shareInvitation(data, { share: async () => { throw { name: "AbortError" }; } }, copy), "cancelled");
  assert.equal(copies, 0);
  assert.equal(await shareInvitation(data, { share: async () => { throw { name: "InvalidStateError" }; } }, copy), "copied");
  assert.equal(copies, 1);
  assert.equal(await shareInvitation(data, {} as unknown as Navigator, async () => false), "manual");
});


test("localized course invitation templates place the name above the URL and retain the passcode", () => {
  for (const locale of [zhCN, en]) {
    const text = locale.courseDetail.invitationTemplate
      .replace("{course}", "Lesson name")
      .replace("{url}", "https://example.test/join")
      .replace("{passcodeLine}", "\n123456");
    const lines = text.split("\n");
    assert.ok(lines[0].includes("Lesson name"));
    assert.equal(lines[1], "https://example.test/join");
    assert.equal(lines[2], "123456");
  }
});
