const test=require('node:test'),assert=require('node:assert/strict');
const {bindSharedDisplay,sharedDisplayStillMatches}=require('../src/share-display.cjs');
const displays=[{id:41,bounds:{x:-1920,y:0,width:1920,height:1080},scaleFactor:1,rotation:0},{id:73,bounds:{x:0,y:0,width:1440,height:900},scaleFactor:2,rotation:0}];
test('binding uses explicit display ID and keeps negative desktop coordinates',()=>{
 const binding=bindSharedDisplay({id:'screen:2:0',display_id:'41'},displays);
 assert.deepEqual(binding,{id:41,bounds:{x:-1920,y:0,width:1920,height:1080},scaleFactor:1,rotation:0});
 assert.equal(sharedDisplayStillMatches(binding,displays),true);
});
test('ambiguous, window, missing and invalid displays cannot be bound',()=>{
 assert.equal(bindSharedDisplay({id:'window:41:0',display_id:'41'},displays),null);
 assert.equal(bindSharedDisplay({id:'screen:41:0',display_id:''},displays),null);
 assert.equal(bindSharedDisplay({id:'screen:41:0',display_id:'41'},[displays[0],displays[0]]),null);
 assert.equal(bindSharedDisplay({id:'screen:41:0',display_id:'41'},[{...displays[0],scaleFactor:0}]),null);
 assert.equal(bindSharedDisplay({id:'screen:41:0',display_id:'-10'},[{...displays[0],id:-10}]),null);
});
test('disconnect, scaling, rotation and geometry changes invalidate the binding',()=>{
 const binding=bindSharedDisplay({id:'screen:1:0',display_id:'73'},displays);
 for(const current of [[displays[0]],[displays[0],{...displays[1],scaleFactor:1}],[displays[0],{...displays[1],rotation:90}],[displays[0],{...displays[1],bounds:{...displays[1].bounds,x:10}}]])assert.equal(sharedDisplayStillMatches(binding,current),false);
});
