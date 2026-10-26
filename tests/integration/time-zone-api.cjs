/* eslint-disable @typescript-eslint/no-require-imports -- Real local HTTP/DB acceptance. */
// Start Next locally with this disposable DB and its isolated SESSION_SECRET first.
const assert = require('node:assert/strict');
const {Pool} = require('pg');
require('dotenv').config({path:'.env.local',quiet:true});
const url = new URL(process.env.DATABASE_URL || '');
assert.ok(['localhost','127.0.0.1'].includes(url.hostname) && url.pathname === '/classroom_timezone_acceptance', 'Disposable acceptance DB required');
const base = process.env.TIME_ZONE_API_BASE || 'http://127.0.0.1:3004';
const tokens = {};
assert.ok(['http://127.0.0.1:3004','http://localhost:3004'].includes(base), 'Loopback acceptance server required');
assert.ok(process.env.SESSION_SECRET, 'Isolated session secret required');
const pool = new Pool({connectionString:process.env.DATABASE_URL});
const ids = [];
async function request(path, method='GET', body, status=200, role='teacher') {
 const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',cookie:'classroom_session='+tokens[role]},...(body?{body:JSON.stringify(body)}:{})});
 const data=await response.json();assert.equal(response.status,status,JSON.stringify(data));return data;
}
(async()=>{
 const {SignJWT}=await import('jose');
 for (const role of ['teacher','student']) tokens[role]=await new SignJWT({userId:'timezone-'+role,name:'timezone-'+role,displayName:'Timezone acceptance '+role,avatar:'',role,email:'',expiresAt:new Date(Date.now()+3600000).toISOString()}).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(process.env.SESSION_SECRET));
 const created=await request('/api/courses','POST',{name:'时区真实HTTP验收 '+Date.now(),courseKind:'standalone',roomType:4,timezone:'America/New_York',startTime:'2026-11-03T00:30:00.000Z',endTime:'2026-11-03T01:30:00.000Z'},201);
 const id=created.course.id;ids.push(id);
 const lessons=await request(`/api/courses/${id}/sessions`);
 assert.equal(lessons.sessions.length,1);const lesson=lessons.sessions[0];
 assert.equal(lesson.timezone,'America/New_York');assert.equal(lesson.startTime,'2026-11-03T00:30:00.000Z');
 const stored=await pool.query('SELECT "timezone", "startTime"::text AS "utcWall" FROM "CourseSession" WHERE "id"=$1',[lesson.id]);
 assert.equal(stored.rows[0].timezone,'America/New_York');assert.equal(stored.rows[0].utcWall,'2026-11-03 00:30:00');
 const group=await request('/api/courses','POST',{name:'时区周期HTTP验收 '+Date.now(),courseKind:'series',roomType:4},201);ids.push(group.course.id);
 const repeated=await request(`/api/courses/${group.course.id}/sessions`,'POST',{schedule:{type:'recurring',timezone:'America/New_York',firstDate:'2027-03-01',localStartTime:'19:30',durationMinutes:60,weekdays:[1],count:3}},201);
 assert.equal(repeated.sessions.length,3);
 const rows=await request(`/api/courses/${group.course.id}/sessions`);
 const starts=rows.sessions.map(row=>row.startTime);
 assert.deepEqual(starts,['2027-03-02T00:30:00.000Z','2027-03-09T00:30:00.000Z','2027-03-15T23:30:00.000Z']);
 assert.ok(rows.sessions.every(row=>row.timezone==='America/New_York'));
 const first=rows.sessions[0];
 await request(`/api/courses/${group.course.id}/sessions/${first.id}`,'PATCH',{startTime:'2027-03-02T01:30:00.000Z',endTime:'2027-03-02T02:30:00.000Z',timezone:'America/New_York',scope:'future'});
 const shifted=await request(`/api/courses/${group.course.id}/sessions`);
 assert.deepEqual(shifted.sessions.map(row=>row.startTime),['2027-03-02T01:30:00.000Z','2027-03-09T01:30:00.000Z','2027-03-16T00:30:00.000Z']);
 await request(`/api/courses/${id}/sessions/${lesson.id}`,'PATCH',{timezone:'Invalid/Zone'},400);
 await request(`/api/courses/${id}/sessions/${lesson.id}`,'PATCH',{startTime:'2026-11-02T19:30'},400);
 await request(`/api/courses/${id}/sessions`,'POST',{schedule:{type:'single',timezone:'Invalid/Zone',startTime:'2026-11-04T01:30:00Z',endTime:'2026-11-04T02:30:00Z'}},400);
 await request('/api/courses','POST',{name:'Student cannot create',courseKind:'series'},403,'student');
 console.log(JSON.stringify({passed:true,evidence:'real Next HTTP routes + isolated PostgreSQL; synthetic test identity',checks:['standalone UTC and IANA persistence','GET refresh round-trip','recurrence crosses DST at same local clock','future edits preserve each occurrence local clock','invalid zones and naive timestamps refused','student creation forbidden']}));
})().finally(async()=>{for(const id of ids)await pool.query('DELETE FROM "Course" WHERE "id"=$1',[id]);await pool.end()}).catch(error=>{console.error(error);process.exitCode=1});
