import assert from "node:assert/strict";
import test from "node:test";
import { classroomAvatarSource, googleClassroomAvatarUrl } from "../src/lib/classroom/avatar";

test("Google profile pictures load through the cached classroom origin", () => {
  for (const host of ["lh3", "lh4", "lh5", "lh6"]) {
    const original = `http://${host}.googleusercontent.com/a-/profile=s96-c#avatar`;
    const target = `https://${host}.googleusercontent.com/a-/profile=s96-c`;
    assert.equal(googleClassroomAvatarUrl(original), target);
    assert.equal(classroomAvatarSource(` ${original} `), `/api/classroom/avatar?url=${encodeURIComponent(target)}`);
  }
  assert.equal(googleClassroomAvatarUrl("https://lh3.googleusercontent.com/a/profile"), "https://lh3.googleusercontent.com/a/profile");
});

test("the image proxy accepts neither arbitrary destinations nor non-profile paths", () => {
  for (const value of ["", "https://localhost/a/profile", "https://lh3.googleusercontent.com.evil.test/a/profile", "https://user@lh3.googleusercontent.com/a/profile", "https://lh3.googleusercontent.com:8443/a/profile", "ftp://lh3.googleusercontent.com/a/profile", "https://lh3.googleusercontent.com/anything", "https://lh3.googleusercontent.com/a/../other"]) {
    assert.equal(googleClassroomAvatarUrl(value), null, value);
  }
  assert.equal(classroomAvatarSource(" https://cdn.casbin.org/avatar.svg "), "https://cdn.casbin.org/avatar.svg");
  assert.equal(classroomAvatarSource(""), "");
});
