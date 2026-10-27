import assert from 'node:assert/strict';
import test from 'node:test';
import { initialCaptionStartView, automaticCaptionServiceEnabled, captionStartPreferences, newCaptionStartPreferences, validateCaptionStartPreferences } from '../src/lib/classroom/caption-start-preferences';

test('legacy classrooms keep recognition without preselecting paid translation tracks', () => {
  assert.deepEqual(captionStartPreferences({}), { autoCaptions: true, autoInterpretation: true, sourceLanguage: 'zh-CN', targetLanguages: [] });
  assert.equal(automaticCaptionServiceEnabled(undefined), true);
});
test('new course defaults include a selectable interpretation language', () => {
  const value = newCaptionStartPreferences();
  assert.deepEqual(validateCaptionStartPreferences(value), value);
  assert.deepEqual(value.targetLanguages, ['en-US']);
});
test('turning both automatic services off stays off, while source-only captions still start recognition', () => {
  const value = { ...newCaptionStartPreferences(), autoCaptions: false, autoInterpretation: false };
  assert.equal(automaticCaptionServiceEnabled(value), false);
  assert.equal(automaticCaptionServiceEnabled({ ...value, autoCaptions: true }), true);
});
test('invalid types, source languages, unsupported targets and empty interpretation choices are rejected', () => {
  const value = newCaptionStartPreferences();
  for (const invalid of [null, [], { ...value, autoCaptions: 'false' }, { ...value, sourceLanguage: 'nonsense' }, { ...value, targetLanguages: ['bad-code'] }, { ...value, targetLanguages: [] }, { ...value, targetLanguages: ['zh-CN'] }, { ...value, targetLanguages: Array(11).fill('en-US') }]) {
    assert.throws(() => validateCaptionStartPreferences(invalid));
  }
  assert.deepEqual(validateCaptionStartPreferences({ ...value, targetLanguages: ['en-US', 'en-US', 'ja-JP'] }).targetLanguages, ['en-US', 'ja-JP']);
});

test('entry defaults reflect independent switches and preserve a valid personal saved selection', () => {
  const defaults = newCaptionStartPreferences();
  assert.deepEqual(initialCaptionStartView(defaults, null), { displayMode: "bilingual", preferredLanguage: "en-US", overlayVisible: true });
  assert.equal(initialCaptionStartView({ ...defaults, autoInterpretation: false }, undefined).displayMode, "original");
  assert.equal(initialCaptionStartView({ ...defaults, autoInterpretation: false, autoCaptions: false }, []).displayMode, "off");
  assert.deepEqual(initialCaptionStartView(defaults, { displayMode: "original", preferredLanguage: "ja-JP", overlayVisible: false }), { displayMode: "original", preferredLanguage: "ja-JP", overlayVisible: false });
  assert.deepEqual(initialCaptionStartView(defaults, { displayMode: "invalid", overlayVisible: "false" }), initialCaptionStartView(defaults, null));
});
