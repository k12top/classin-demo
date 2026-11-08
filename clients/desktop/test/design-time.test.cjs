const {test}=require('node:test');const assert=require('node:assert/strict');
const time=require('../design/classin-v5/time.js');
test('cross-country display preserves the UTC instant and local date boundary',()=>{
  const startsAt=time.fromWall('2026-11-08','00:30','Asia/Shanghai');assert.equal(startsAt,'2026-11-07T16:30:00.000Z');
  assert.deepEqual(time.project({startsAt,endsAt:'2026-11-07T18:00:00Z'},'America/New_York'),{startsAt,endsAt:'2026-11-07T18:00:00Z',date:'2026-11-07',start:'11:30',end:'13:00',endDate:'2026-11-07'});
});
test('spring DST gap is rejected instead of silently moving the lesson',()=>{assert.throws(()=>time.fromWall('2027-03-14','02:30','America/New_York'),/NONEXISTENT_TIME/);});
test('autumn DST ambiguity requires an explicit choice',()=>{
  assert.throws(()=>time.fromWall('2026-11-01','01:30','America/New_York'),/AMBIGUOUS_TIME/);
  assert.equal(time.fromWall('2026-11-01','01:30','America/New_York','earlier'),'2026-11-01T05:30:00.000Z');
  assert.equal(time.fromWall('2026-11-01','01:30','America/New_York','later'),'2026-11-01T06:30:00.000Z');
});
test('overnight lessons split at local midnight without losing the next day',()=>{
  assert.deepEqual(time.segments({startsAt:'2026-11-08T15:30:00Z',endsAt:'2026-11-08T17:00:00Z'},'Asia/Shanghai').map(s=>[s.date,s.start,s.end]),[['2026-11-08','23:30','24:00'],['2026-11-09','00:00','01:00']]);
});
test('offset labels follow the lesson date rather than the current DST season',()=>{
  assert.equal(time.offsetLabel('2026-11-08T07:20:00Z','America/New_York'),'UTC-5');
  assert.equal(time.offsetLabel('2027-07-10T14:00:00Z','America/New_York'),'UTC-4');
  assert.equal(time.offsetLabel('2027-07-10T14:00:00Z','Europe/London'),'UTC+1');
});
