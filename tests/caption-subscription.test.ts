import assert from "node:assert/strict";
import test from "node:test";
import { captionPreferenceLanguage } from "../src/lib/classroom/use-caption-subscription";

test("display mode alone controls translation demand", () => {
  assert.equal(captionPreferenceLanguage("bilingual", "en-US", "zh-CN"), "en-US");
  assert.equal(captionPreferenceLanguage("translated", "en-US", "zh-CN"), "en-US");
  assert.equal(captionPreferenceLanguage("original", "en-US", "zh-CN"), null);
});

test("selecting the source language does not open a redundant translation channel", () => {
  assert.equal(captionPreferenceLanguage("bilingual", "zh-CN", "zh-CN"), null);
});
