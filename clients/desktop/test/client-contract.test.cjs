const test = require('node:test');
const assert = require('node:assert/strict');
const { webBase, classroomContext, requestFor } = require('../src/client-contract.cjs');
test('client origins require HTTPS except loopback development', () => {
  assert.equal(webBase('https://live.bytecome.com/'), 'https://live.bytecome.com');
  assert.equal(webBase('http://127.0.0.1:3180'), 'http://127.0.0.1:3180');
  for (const value of ['http://example.com','file:///tmp/app','https://user:secret@example.com','https://example.com/?target=other']) assert.throws(() => webBase(value));
});
test('classroom context comes only from the trusted classroom page', () => {
  assert.equal(classroomContext('https://evil.example/classroom?sessionId=lesson','https://live.bytecome.com'), null);
  assert.equal(classroomContext('https://live.bytecome.com/courses?sessionId=lesson','https://live.bytecome.com'), null);
  assert.deepEqual(classroomContext('https://live.bytecome.com/classroom?sessionId=lesson&shareAccess=share','https://live.bytecome.com'),{sessionId:'lesson',shareAccess:'share'});
});
test('fixed operations cannot request arbitrary URLs or destructive classroom actions', () => {
  for (const operation of ['https://evil.example','fetch','deleteCourse','endClass']) assert.throws(() => requestFor(operation));
  assert.throws(() => requestFor('command',{commandId:'test',action:{type:'endClass'}},{sessionId:'lesson'}));
  assert.throws(() => requestFor('command',{commandId:'test',action:{type:'inviteStage',targetUserId:'student'}}));
  const command=requestFor('command',{commandId:'stable-id',expectedRevision:4,action:{type:'inviteStage',targetUserId:'student'}},{sessionId:'lesson',shareAccess:'share'});
  assert.equal(command.body.commandId,'stable-id'); assert.equal(command.body.expectedRevision,4); assert.equal(command.body.shareAccess,'share');
});
test('group batch requests are bounded, explicit and safely encoded', () => {
  assert.throws(() => requestFor('addMembers',{groupId:'group',members:Array.from({length:101},()=>({userId:'student'}))}));
  assert.throws(() => requestFor('removeMembers',{groupId:'group',userIds:[]}));
  const search=requestFor('searchStudents',{query:'a&role=teacher'});
  assert.equal(search.path,'/api/users/search?role=student&q=a%26role%3Dteacher');
  const added=requestFor('addMembers',{groupId:'group',members:[{userId:'student',userName:'Name',role:'teacher'}]});
  assert.equal(added.body.members[0].role,undefined);
});
