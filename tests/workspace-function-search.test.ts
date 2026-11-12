import test from 'node:test';import assert from 'node:assert/strict';
import {searchWorkspaceFunctions} from '../src/lib/workspace-function-search';
test('features match user task terms and obey teaching visibility',()=>{
 assert.ok(searchWorkspaceFunctions('麦克风',true,'zh-CN').some(item=>item.id==='devices'));
 assert.ok(searchWorkspaceFunctions('upload',false,'en').some(item=>item.id==='files'));
 assert.ok(searchWorkspaceFunctions('排课',true,'zh-CN').some(item=>item.id==='createLesson'));
 assert.ok(!searchWorkspaceFunctions('排课',false,'zh-CN').some(item=>item.id==='createLesson'));
 assert.ok(!searchWorkspaceFunctions('学生',false,'zh-CN').some(item=>item.id==='students'));
 assert.equal(searchWorkspaceFunctions('',false,'en').length,5);
});
