import test from "node:test";
import assert from "node:assert/strict";
import {distinctTranslation,parseTranslationPreference,releaseTranslationRetries,translationNotConfigured,translationPreferenceKey,translationTarget} from "../src/lib/workspace-translation-preferences";

test("translation preferences are account scoped, validated and default to following the interface",()=>{
 assert.notEqual(translationPreferenceKey("a"),translationPreferenceKey("b"));
 assert.deepEqual(parseTranslationPreference(null),{enabled:true,target:"auto"});
 assert.deepEqual(parseTranslationPreference('{"enabled":false,"target":"en-US"}'),{enabled:false,target:"en-US"});
 assert.deepEqual(parseTranslationPreference('{"enabled":"false","target":"invalid"}'),{enabled:true,target:"auto"});
 assert.deepEqual(parseTranslationPreference("{"),{enabled:true,target:"auto"});
 assert.equal(translationTarget("auto","zh-CN"),"zh-CN");assert.equal(translationTarget("auto","en"),"en-US");
 assert.equal(translationTarget("zh-CN","en"),"zh-CN");
});
test("identical translations do not duplicate the original message",()=>{
 assert.equal(distinctTranslation(" Hello ","Hello"),null);assert.equal(distinctTranslation("你好","Hello"),"Hello");assert.equal(distinctTranslation("hello",undefined),null);
});
test("reconnect releases temporary translation failures across conversations while retaining permanent failures",()=>{
 const attempted=new Set(["class-a:en:1","class-b:zh:2","class-a:en:permanent"]),retryable=new Set(["class-a:en:1","class-b:zh:2"]);
 assert.deepEqual(releaseTranslationRetries(retryable,attempted),["class-a:en:1","class-b:zh:2"]);
 assert.deepEqual([...attempted],["class-a:en:permanent"]);assert.equal(retryable.size,0);
 assert.deepEqual(releaseTranslationRetries(retryable,attempted),[]);
});
test("missing translation configuration is distinguished from temporary failures",()=>{
 assert.equal(translationNotConfigured({status:503,code:"TRANSLATION_NOT_CONFIGURED"}),true);
 assert.equal(translationNotConfigured({status:503}),false);assert.equal(translationNotConfigured(new Error("offline")),false);
});
