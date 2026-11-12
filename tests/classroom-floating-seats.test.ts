import assert from "node:assert/strict";
import test from "node:test";
import { visibleFloatingSeatBounds } from "../src/lib/classroom/floating-seats";

test("floating view crops to visible seats rather than empty rail space", () => {
  assert.deepEqual(visibleFloatingSeatBounds({left:0,top:50,right:1400,bottom:160},[{left:600,top:60,right:748,bottom:144},{left:756,top:60,right:904,bottom:144}],{width:1400,height:900}),{x:600,y:60,width:304,height:84});
});

test("floating view clips seats to scroll and viewport boundaries", () => {
  const rail={left:100,top:50,right:500,bottom:150},viewport={width:450,height:100};
  assert.deepEqual(visibleFloatingSeatBounds(rail,[{left:40,top:55,right:180,bottom:140},{left:430,top:55,right:560,bottom:140},{left:600,top:55,right:700,bottom:140}],viewport),{x:100,y:55,width:350,height:45});
  assert.equal(visibleFloatingSeatBounds(rail,[],viewport),null);
  assert.equal(visibleFloatingSeatBounds(rail,[{left:490,top:55,right:560,bottom:140}],viewport),null);
});
