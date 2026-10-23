import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultClassroomTargetLanguages,
  classroomLanguageForLocale,
  normalizeClassroomLanguage,
  normalizeTargetLanguages,
  captionLanguageOptions,
  classroomLanguageLabel,
  captionLanguageSelectOptions,
} from "../src/lib/classroom/languages";

test("caption choices sort by visible names and carry multilingual search aliases", () => {
  for (const provider of ["shengwang", "wordly"] as const) {
    const options = captionLanguageSelectOptions(provider, "zh-CN");
    const alphabet = new Intl.Collator("en", { sensitivity: "base", numeric: true });
    assert.equal(options.length, captionLanguageOptions(provider).length);
    for (let i = 1; i < options.length; i++) {
      assert.ok(alphabet.compare(options[i - 1].label, options[i].label) <= 0);
    }
    assert.ok(options.findIndex(option => option.value === "id-ID") < options.findIndex(option => option.value === "fr-FR"), "Bahasa Indonesia sorts under B, before Français");
    const indonesian = options.find(option => option.value === "id-ID")!;
    assert.match(indonesian.label, /印度尼西亚/);
    assert.match(indonesian.searchText, /Indonesian/);
    assert.match(indonesian.searchText, /Bahasa Indonesia/);
  }
});

test("caption language names show native scripts and follow the interface locale", () => {
  for (const [code, nativeName] of [["vi-VN", "Tiếng Việt"], ["id-ID", "Bahasa Indonesia"], ["ru-RU", "Русский"]]) {
    assert.equal(classroomLanguageLabel(code), nativeName);
    for (const locale of ["zh-CN", "en", "ru", "ar"]) {
      const label = classroomLanguageLabel(code, locale);
      assert.ok(label.startsWith(nativeName));
      assert.ok(label.includes(new Intl.DisplayNames([locale], { type: "language" }).of(code)!));
      assert.ok(!label.includes(code));
    }
  }
  assert.notEqual(classroomLanguageLabel("fr-CA", "zh-CN"), "fr-CA", "provider regional languages have readable names");
  assert.equal(classroomLanguageLabel("invalid_code", "zh-CN"), "invalid_code", "unknown identifiers do not throw");
});
import {
  effectiveCaptionLanguage,
  initialCaptionLanguage,
} from "../src/lib/classroom/caption-preferences";
import {
  languageOptions,
  getTranslation,
  locales,
  localeDirection,
  normalizeSupportedLocale,
  resolveLocalePreference,
} from "../src/lib/i18n/locales";

test("all 23 interface languages are available", () => {
  assert.equal(languageOptions.length, 23);
  assert.equal(new Set(languageOptions.map((item) => item.value)).size, 23);
});

test("all locale packs provide classroom V3 essentials", () => {
  const paths = [
    "common.language",
    "common.dismiss",
    "common.pleaseConfirm",
    "common.switchToDarkMode",
    "common.switchToLightMode",
    "classroom.v3.roleLead",
    "classroom.v3.roleAssistant",
    "classroom.v3.roleStudent",
    "classroom.v3.liveClass",
    "classroom.v3.classEndedLabel",
    "classroom.v3.readyRoom",
    "classroom.v3.screenShare",
    "classroom.v3.whiteboard",
    "classroom.v3.members",
    "classroom.v3.chat",
    "classroom.v3.captions",
    "classroom.v3.courseware",
    "classroom.v3.raiseHand",
    "classroom.v3.cancelHand",
    "classroom.v3.leave",
  ];

  for (const locale of languageOptions.map((item) => item.value)) {
    for (const path of paths) {
      const value = path.split(".").reduce<unknown>(
        (current, key) =>
          current && typeof current === "object"
            ? (current as Record<string, unknown>)[key]
            : undefined,
        locales[locale],
      );
      assert.equal(
        typeof value,
        "string",
        `${locale} is missing a local value for ${path}`,
      );
      assert.notEqual(value, "", `${locale} has an empty value for ${path}`);
    }
  }
});

test("legacy classroom shell copy resolves in every interface language", () => {
  const paths = [
    "classroom.v3.entering",
    "classroom.v3.cannotEnter",
    "classroom.v3.missingCourse",
    "classroom.v3.accessDenied",
    "classroom.v3.sessionCreateFailed",
    "classroom.v3.classroomLaunchFailed",
    "classroom.v3.mediaActionFailed",
    "classroom.v3.recordingActionFailed",
    "classroom.v3.spotlightMember",
    "classroom.v3.screenSharing",
    "classroom.v3.me",
    "classroom.v3.members",
    "classroom.v3.connected",
    "classroom.v3.reconnecting",
    "classroom.v3.startTeaching",
    "classroom.v3.waitForTeacher",
    "classroom.v3.stageWaiting",
    "classroom.v3.microphone",
    "classroom.v3.camera",
    "classroom.v3.screenShare",
    "classroom.v3.recordingNotConfigured",
    "classroom.v3.startRecording",
    "classroom.v3.stopRecording",
    "classroom.v3.leave",
    "classroom.v3.backToCourse",
  ];

  for (const locale of languageOptions.map((item) => item.value)) {
    for (const path of paths) {
      const localValue = getTranslation(locales[locale], path);
      const resolvedValue =
        localValue === path ? getTranslation(locales.en, path) : localValue;
      assert.notEqual(
        resolvedValue,
        path,
        `${locale} cannot resolve classroom shell copy for ${path}`,
      );
    }
  }
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

test("new lessons start without translation demand", () => {
  for (const source of ["zh-CN", "en-US", "ja-JP", "ar-SA"]) {
    const targets = defaultClassroomTargetLanguages(source);
    assert.equal(targets.length, 0);
    assert.equal(new Set(targets).size, 0);
    assert.equal(targets.includes(source), false);

  }
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

// Availability is independent of active target channels and interface locales.
test("translation catalog lists all documented provider languages and omits unsupported Wordly languages", () => {
  const shengwang = captionLanguageOptions("shengwang").map(item => item.code);
  const wordly = captionLanguageOptions("wordly").map(item => item.code);
  assert.equal(shengwang.length, 150);
  assert.equal(new Set(shengwang).size, shengwang.length);
  assert.ok(shengwang.includes("km-KH"));
  assert.ok(shengwang.includes("fr-FR"));
  assert.ok(shengwang.includes("tr-TR"));
  assert.ok(wordly.includes("ta-IN"));
  assert.ok(wordly.includes("en-US"));
  assert.ok(!wordly.includes("km-KH"));
  assert.ok(!wordly.includes("my-MM"));
  assert.equal(effectiveCaptionLanguage("ja-JP", shengwang), "ja-JP");
  assert.equal(effectiveCaptionLanguage("my-MM", wordly, "zh-CN"), "zh-CN");
});
