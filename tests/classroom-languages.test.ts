import assert from "node:assert/strict";
import test from "node:test";
import {
  classroomLanguageForLocale,
  normalizeClassroomLanguage,
  normalizeTargetLanguages,
} from "../src/lib/classroom/languages";
import {
  effectiveCaptionLanguage,
  initialCaptionLanguage,
} from "../src/lib/classroom/caption-preferences";
import {
  languageOptions,
  localeDirection,
  normalizeSupportedLocale,
  resolveLocalePreference,
} from "../src/lib/i18n/locales";

test("all 23 interface languages are available", () => {
  assert.equal(languageOptions.length, 23);
  assert.equal(new Set(languageOptions.map((item) => item.value)).size, 23);
});

test("interface locale maps to its classroom caption language", () => {
  assert.equal(classroomLanguageForLocale("zh-TW"), "zh-TW");
  assert.equal(classroomLanguageForLocale("th"), "th-TH");
  assert.equal(classroomLanguageForLocale("sw"), "sw-KE");
  assert.equal(classroomLanguageForLocale("unknown"), "en-US");
});

test("caption preference follows UI only before the user chooses", () => {
  assert.equal(initialCaptionLanguage(null, "th"), "th-TH");
  assert.equal(initialCaptionLanguage("ja-JP", "th"), "ja-JP");
  assert.equal(
    effectiveCaptionLanguage("ja-JP", ["en-US", "th-TH"]),
    "en-US",
  );
  assert.equal(
    effectiveCaptionLanguage("ja-JP", ["ja-JP", "th-TH"]),
    "ja-JP",
  );
});

test("Shengwang targets are normalized, unique and capped at ten", () => {
  const targets = normalizeTargetLanguages(
    [
      "en-US",
      "en-US",
      "th-TH",
      "vi-VN",
      "id-ID",
      "ms-MY",
      "fil-PH",
      "km-KH",
      "lo-LA",
      "my-MM",
      "ja-JP",
      "ko-KR",
      "invalid",
      "zh-CN",
    ],
    "zh-CN",
    10,
  );
  assert.equal(targets.length, 10);
  assert.equal(targets.includes("zh-CN"), false);
  assert.equal(targets.includes("invalid"), false);
  assert.equal(normalizeClassroomLanguage("zh-TW"), "zh-TW");
});

test("Arabic is the only right-to-left interface locale", () => {
  assert.equal(localeDirection("ar"), "rtl");
  assert.equal(localeDirection("en"), "ltr");
  assert.equal(localeDirection("th"), "ltr");
});

test("embedded and browser locale codes normalize without URL prefixes", () => {
  assert.equal(normalizeSupportedLocale("th-TH"), "th");
  assert.equal(normalizeSupportedLocale("zh-Hant"), "zh-TW");
  assert.equal(normalizeSupportedLocale("zh-Hans-CN"), "zh-CN");
  assert.equal(normalizeSupportedLocale("en-US"), "en");
  assert.equal(normalizeSupportedLocale("xx-YY"), null);
});

test("locale preference follows URL, cookie, storage, then browser", () => {
  assert.equal(
    resolveLocalePreference({
      url: "ar-SA",
      cookie: "th",
      storage: "vi",
      browser: "en-US",
    }),
    "ar",
  );
  assert.equal(
    resolveLocalePreference({
      cookie: "th",
      storage: "vi",
      browser: "en-US",
    }),
    "th",
  );
  assert.equal(
    resolveLocalePreference({ storage: "vi", browser: "en-US" }),
    "vi",
  );
  assert.equal(resolveLocalePreference({ browser: "de-DE" }), "de");
});
