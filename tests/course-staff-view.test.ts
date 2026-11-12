import test from 'node:test';
import assert from 'node:assert/strict';
import {staffResponseRows,summarizeLessonStaff,validStaffAssignmentReceipt} from '../src/lib/course-staff-view';
import type {CourseSessionItem} from '../src/components/course-sessions/course-session-manager';
const rows=[{id:'future',leadTeacherId:'lead',teachers:[{id:'lead',name:'Lead',role:'teacher'},{id:'org/helper',name:'Helper',role:'assistant'}],observers:[]},{id:'past',leadTeacherId:'lead',teachers:[{id:'lead',name:'Lead',role:'teacher'},{id:'helper',name:'Helper',role:'assistant'}],observers:[]}];
test('staff reads require complete matching rows and valid people before rendering',()=>{
 assert.equal(staffResponseRows({lessons:rows},['future','past']).length,2);
 for(const value of [{},{lessons:[]},{lessons:[rows[0],rows[0]]},{lessons:[{...rows[0],teachers:null}]},{lessons:[{...rows[0],observers:[{id:'x'}]}]},{lessons:[{...rows[0],id:'foreign'}]}])assert.throws(()=>staffResponseRows(value,['future','past']));
});
test('staff summaries merge directory aliases and retain read-only historical grants',()=>{
 const lessons=[{id:'future',title:'Future',status:'scheduled',updatedAt:'2026-11-01T00:00:00Z',endedAt:null},{id:'past',title:'Past',status:'finished',updatedAt:'2026-11-01T00:00:00Z',endedAt:'2026-11-02T00:00:00Z'}] as CourseSessionItem[];
 const people=summarizeLessonStaff(staffResponseRows({lessons:rows},['future','past']),lessons);
 assert.equal(people.length,2);assert.deepEqual(people[1].grants.map(g=>[g.role,g.editable]),[['assistant',true],['assistant',false]]);
});
test('assignment recovery is discarded only for the exact batch, recipient and role',()=>{
 const body=JSON.stringify({staffId:'teacher-uuid',role:'assistant',targets:[{id:'future'}]}),good={updated:true,changes:[{sessionId:'future',staffId:'org/helper',action:'assistant'}]};
 assert.equal(validStaffAssignmentReceipt(good,body,['helper']),true);
 assert.equal(validStaffAssignmentReceipt(good,body),false);
 for(const value of [null,{}, {updated:true,changes:[]},{...good,changes:[{...good.changes[0],sessionId:'other'}]},{...good,changes:[{...good.changes[0],action:'teacher'}]},{...good,changes:[{...good.changes[0],staffId:'foreign'}]}])assert.equal(validStaffAssignmentReceipt(value,body,['helper']),false);
});
