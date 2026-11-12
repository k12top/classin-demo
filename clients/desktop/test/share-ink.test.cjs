const test=require('node:test'),assert=require('node:assert/strict');
const {normalizeShareInk}=require('../src/share-ink.cjs');
const binding={bounds:{x:-1920,y:0,width:1920,height:1080}};
test('stroke coordinates are bounded and aspect is derived from the captured display',()=>{
 assert.deepEqual(normalizeShareInk({points:[{x:0,y:1},{x:0.5,y:0.25}],color:'#ffffff',aspect:1},binding),{points:[{x:0,y:1},{x:0.5,y:0.25}],color:'#ed3b3b',width:0.004,aspect:1080/1920});
 for(const points of [[],[{x:-0.01,y:0}],[{x:0,y:NaN}],Array.from({length:2049},()=>({x:0,y:0}))])assert.equal(normalizeShareInk({points},binding),null);
 assert.equal(normalizeShareInk({points:[{x:0,y:0}]},null),null);
});
