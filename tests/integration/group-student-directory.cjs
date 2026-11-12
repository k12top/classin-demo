/* eslint-disable @typescript-eslint/no-require-imports -- isolated directory boundary test */
const assert=require('node:assert/strict'),esbuild=require('esbuild'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const root=path.resolve(__dirname,'../..');let dir;
(async()=>{
 dir=await fs.mkdtemp(path.join(os.tmpdir(),'group-directory-'));const file=path.join(dir,'fixture.cjs');
 const stubs={
  '@/lib/casdoor-server':`export async function searchCasdoorUsers(q,options){if(!options.strict||options.limit!==Number.MAX_SAFE_INTEGER)throw Error('not strict');if(globalThis.failUsers)throw Error('unavailable');return globalThis.users;} export async function getCasdoorRoles(options){if(!options.strict||globalThis.failRoles)throw Error('unavailable');return globalThis.roles;} export function determineRole(roles,groups){return roles.some(r=>r.name==='teacher')||groups?.includes('teacher')?'teacher':'student';}`,
  '@/lib/db':'export const prisma={}; export const isTransientDatabaseError=()=>false; export const withDatabaseReadRetry=()=>{};',
 };
 await esbuild.build({stdin:{contents:'export {resolveDirectoryStudents} from "@/lib/user-directory"',resolveDir:root},outfile:file,bundle:true,platform:'node',format:'cjs',packages:'external',tsconfig:path.join(root,'tsconfig.json'),plugins:[{name:'fixture',setup(build){build.onResolve({filter:/.*/},({path:id})=>id in stubs?{path:id,namespace:'stub'}:undefined);build.onLoad({filter:/.*/,namespace:'stub'},({path:id})=>({contents:stubs[id],loader:'js'}));}}]});
 const {resolveDirectoryStudents}=require(file);
 globalThis.users=[{id:'uuid-a',name:'alice',owner:'org',displayName:'Alice',groups:[]},{id:'uuid-t',name:'teacher',owner:'org',groups:[]}];globalThis.roles=[{name:'teacher',users:['org/teacher']}];
 assert.equal((await resolveDirectoryStudents(['org/alice','uuid-a']))[0].id,'alice');
 assert.equal(await resolveDirectoryStudents(['alice','teacher']),null);assert.equal(await resolveDirectoryStudents(['missing']),null);
 globalThis.users.push({id:'other',name:'alice',owner:'org',groups:[]});assert.equal(await resolveDirectoryStudents(['alice']),null);globalThis.users.pop();
 globalThis.failRoles=true;await assert.rejects(resolveDirectoryStudents(['alice']));globalThis.failRoles=false;globalThis.failUsers=true;await assert.rejects(resolveDirectoryStudents(['alice']));
 console.log('Student resolution rejects teachers, unknown and ambiguous identities and directory outages');
})().finally(async()=>{if(dir)await fs.rm(dir,{recursive:true,force:true});}).catch(error=>{console.error(error);process.exitCode=1;});
