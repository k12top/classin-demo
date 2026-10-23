import assert from "node:assert/strict";
import test from "node:test";
import { avatarInitials, userAvatarSource } from "../src/lib/user-avatar";
import { enrichGroupIdentities } from "../src/lib/group-member-identity";
import { paginateScheduleGroups } from "../src/lib/schedule-pagination";
import { locales, getTranslation } from "../src/lib/i18n/locales";
import { portalUpdates } from "../src/lib/i18n/locales/portal-updates";

test("name avatars respect Han limits, Latin word boundaries and Unicode graphemes", () => {
  for (const [name, expected] of [["陈鸿健", "陈鸿健"], ["欧阳小明", "欧阳小"], ["𠮷田太郎", "𠮷田太"], [" alice smith ", "AS"], ["test1", "TE"], ["e\u0301mile", "E\u0301M"], ["Mary-Jane Watson", "MJW"], ["", "?"]]) {
    assert.equal(avatarInitials(name), expected);
  }
  assert.equal(userAvatarSource("https://cdn.casbin.org/img/casbin.svg"), undefined);
  assert.equal(userAvatarSource("https://personal.example.com/photo.png"), "https://personal.example.com/photo.png");
});

test("group rows distinguish duplicate display names using actual directory login names", () => {
  const uuid = "a1234567-1234-5678-abcd-a123456789ab";
  const groups = [{ members: [{ userId: uuid, userName: "Same name" }, { userId: "org/student2", userName: "Same name" }], children: [{ members: [{ userId: "student3" }] }] }];
  const result = enrichGroupIdentities(groups, [{ id: uuid, name: "student1", owner: "org" }]);
  assert.deepEqual(result[0].members.map(member => (member as typeof member & { username: string }).username), ["student1", "student2"]);
  assert.equal((result[0].children[0].members[0] as { username?: string }).username, "student3");
  assert.equal("username" in groups[0].members[0], false);
});

test("pagination bounds a busy day and preserves lesson order across day boundaries", () => {
  const groups = [["2026-10-23", [1, 2, 3, 4, 5, 6]], ["2026-10-24", [7, 8]]] as const;
  const first = paginateScheduleGroups<number>(groups, 0, 5), second = paginateScheduleGroups<number>(groups, 1, 5);
  assert.deepEqual(first.groups, [["2026-10-23", [1, 2, 3, 4, 5]]]);
  assert.deepEqual(second.groups, [["2026-10-23", [6]], ["2026-10-24", [7, 8]]]);
  assert.equal(first.pages, 2);
  assert.equal(paginateScheduleGroups(groups, 999).page, 1);
  assert.equal(paginateScheduleGroups([], 99).page, 0);
});

test("all supported languages have translated portal refinement keys and retain interpolation", () => {
  for (const [locale, dictionary] of Object.entries(locales)) {
    assert(locale in portalUpdates, locale);
    for (const key of Object.keys(portalUpdates.en)) {
      assert.notEqual(getTranslation(dictionary, `portalUpdates.${key}`), `portalUpdates.${key}`, `${locale}:${key}`);
    }
    const page = getTranslation(dictionary, "portalUpdates.page", { page: 2, pages: 4 });
    assert(page.includes("2") && page.includes("4"), locale);
    assert(!page.includes("{"), locale);
  }
});
