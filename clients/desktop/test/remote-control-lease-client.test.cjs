const test=require('node:test'),assert=require('node:assert/strict');
const {createReceiverLeaseReader}=require('../src/remote-control-lease-client.cjs');
test('receiver renewal uses only the fixed same-origin endpoint and authenticated session',async()=>{
 let requested;const session={fetch:async(url,options)=>(requested={url,options},{ok:true,json:async()=>({lease:{grantId:'g'}})})};
 const read=createReceiverLeaseReader({session,base:'https://class.example',clientId:'student-device'}),signal=new AbortController().signal;
 assert.deepEqual(await read({sessionId:'lesson/one',grantId:'g'},signal),{grantId:'g'});const url=new URL(requested.url);
 assert.equal(url.origin,'https://class.example');assert.equal(url.pathname,'/api/courses/lesson%2Fone/classroom/remote-control');assert.equal(url.searchParams.get('action'),'receiver-lease');assert.equal(url.searchParams.get('clientId'),'student-device');assert.equal(requested.options.credentials,'include');assert.equal(requested.options.redirect,'error');assert.equal(requested.options.cache,'no-store');assert.equal(requested.options.signal,signal);
});
test('receiver renewal rejects invalid identifiers, failed responses and aborted reads',async()=>{
 assert.throws(()=>createReceiverLeaseReader({session:{fetch(){}},base:'http://example.com',clientId:'student'}));
 const denied=createReceiverLeaseReader({session:{fetch:async()=>({ok:false})},base:'http://localhost:3000',clientId:'student'});await assert.rejects(denied({sessionId:'lesson',grantId:'g'},new AbortController().signal));
 await assert.rejects(denied({sessionId:'..',grantId:'g'},new AbortController().signal));
 const abort=new AbortController(),read=createReceiverLeaseReader({session:{fetch:async()=>({ok:true,json:async()=>{abort.abort();return{lease:{}};}})},base:'http://localhost:3000',clientId:'student'});await assert.rejects(read({sessionId:'lesson',grantId:'g'},abort.signal));
});
