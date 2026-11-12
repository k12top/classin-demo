const test=require('node:test'),assert=require('node:assert/strict'),{seatFrameWidth}=require('../src/share-seat-quality.cjs');
test('seat capture retains pixels for high-density screens without upscaling',()=>{
 assert.equal(seatFrameWidth(1920,960,2),1920);
 assert.equal(seatFrameWidth(960,960,2),960);
 assert.equal(seatFrameWidth(1500,500,3),1000);
 assert.equal(seatFrameWidth(800,400,1),400);
 assert.equal(seatFrameWidth(0,400,2),0);
});
