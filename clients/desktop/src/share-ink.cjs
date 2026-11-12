'use strict';

/** Treat the overlay as untrusted: bound every stroke before forwarding it. */
function normalizeShareInk(value, binding) {
 if(!binding?.bounds||!value||!Array.isArray(value.points)||value.points.length<1||value.points.length>2048)return null;
 if(!value.points.every(point=>point&&Number.isFinite(point.x)&&Number.isFinite(point.y)&&point.x>=0&&point.x<=1&&point.y>=0&&point.y<=1))return null;
 const aspect=binding.bounds.height/binding.bounds.width;
 if(!Number.isFinite(aspect)||aspect<0.25||aspect>4)return null;
 return {points:value.points.map(({x,y})=>({x,y})),color:'#ed3b3b',width:0.004,aspect};
}
module.exports={normalizeShareInk};
