import test from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server';
import {loadModule} from './helpers/load-module';
function fixture(){
 let userId:string|null='owner',failure=false,calls=0;const queries:unknown[]=[];
 const rows=Array.from({length:21},(_,i)=>({id:`f${i}`,name:`Lesson ${i}.pdf`,size:i}));
 const api=loadModule<{GET:(req:NextRequest)=>Promise<Response>}>('src/app/api/workspace/drive/search/route.ts',{
  '@/lib/session':{getSessionFromRequest:async()=>userId?{userId}:null},
  '@/lib/db':{prisma:{workspaceDriveItem:{findMany:async(query:unknown)=>{calls++;queries.push(query);if(failure)throw Error('Database failed');return rows;}}}},
 });
 return {get calls(){return calls;},queries,setUser:(value:string|null)=>{userId=value;},fail:()=>{failure=true;},get:(query:string)=>api.GET(new NextRequest(`http://localhost/api/workspace/drive/search?${query}`))};
}
test('file search authenticates before querying and validates empty or oversized terms',async()=>{
 const f=fixture();f.setUser(null);assert.equal((await f.get('q=lesson')).status,401);assert.equal(f.calls,0);
 f.setUser('owner');for(const q of ['', 'q=%20%20', `q=${'x'.repeat(101)}`])assert.equal((await f.get(q)).status,400);assert.equal(f.calls,0);
});
test('file search ignores supplied identities, limits metadata and reports additional matches',async()=>{
 const f=fixture(),response=await f.get('q=%20Lesson%20&userId=other');
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
 assert.deepEqual(f.queries,[{where:{userId:'owner',kind:'file',status:'ready',name:{contains:'Lesson',mode:'insensitive'}},select:{id:true,name:true,size:true},orderBy:[{updatedAt:'desc'},{id:'desc'}],take:21}]);
 const result=await response.json();assert.equal(result.files.length,20);assert.equal(result.hasMore,true);assert.deepEqual(Object.keys(result.files[0]).sort(),['id','name','size']);
});
test('file search failures return retryable errors without database details',async()=>{
 const f=fixture();f.fail();const response=await f.get('q=lesson');assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'File search unavailable'});
});
