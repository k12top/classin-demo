import test from 'node:test';
import assert from 'node:assert/strict';
import {coursePreviewMembers} from '../src/lib/course-member-preview';
import {workspaceStudentSelection} from '../src/lib/workspace-model';
test('course previews merge direct and group memberships without duplicating identity aliases',()=>{
 const result=coursePreviewMembers({students:[{studentId:'org/a',studentName:'Alice'},{studentId:'b',studentName:''}],groupLinks:[{group:{members:[{userId:'a',userName:'Group Alice'},{userId:'org/b',userName:'Bob',userAvatar:'/bob.png'},{userId:'c',userName:'Charlie'},{userId:'',userName:'Invalid'}]}}]});
 assert.deepEqual(result,[{id:'org/a',name:'Alice',avatar:undefined},{id:'b',name:'Bob',avatar:'/bob.png'},{id:'c',name:'Charlie',avatar:undefined}]);
 assert.deepEqual(coursePreviewMembers({students:[]}),[]);
});
test('course member links resolve the same authorized directory student across full and short IDs',()=>{
 const directory=[{id:'a'},{id:'org/b'}];
 assert.equal(workspaceStudentSelection(directory,'org/a',''),directory[0]);
 assert.equal(workspaceStudentSelection(directory,'b',''),directory[1]);
 assert.equal(workspaceStudentSelection(directory,'missing',''),undefined,'missing links do not silently open another student');
 assert.equal(workspaceStudentSelection(directory,'missing','query'),directory[0],'an active directory search keeps the existing fallback');
});
