const canvas=document.querySelector('canvas'),context=canvas.getContext('2d');
let points=null;
function resize(){const scale=window.devicePixelRatio||1;canvas.width=Math.round(innerWidth*scale);canvas.height=Math.round(innerHeight*scale);context.setTransform(scale,0,0,scale,0,0);context.strokeStyle='#ed3b3b';context.fillStyle='#ed3b3b';context.lineWidth=innerWidth*0.004;context.lineCap='round';context.lineJoin='round';}
function point(event){return{x:Math.max(0,Math.min(1,event.clientX/innerWidth)),y:Math.max(0,Math.min(1,event.clientY/innerHeight))};}
resize();window.addEventListener('resize',resize);
canvas.addEventListener('pointerdown',event=>{if(event.button!==0||points)return;points=[point(event)];canvas.setPointerCapture(event.pointerId);context.beginPath();context.arc(event.clientX,event.clientY,context.lineWidth/2,0,Math.PI*2);context.fill();context.beginPath();context.moveTo(event.clientX,event.clientY);});
canvas.addEventListener('pointermove',event=>{if(!points||points.length>=2048)return;const next=point(event),last=points[points.length-1];if(next.x===last.x&&next.y===last.y)return;points.push(next);context.lineTo(event.clientX,event.clientY);context.stroke();});
function finish(event){if(!points)return;const stroke=points;points=null;if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);void window.shareInk.stroke({points:stroke}).catch(()=>{});}
canvas.addEventListener('pointerup',finish);canvas.addEventListener('pointercancel',()=>{points=null;});
window.addEventListener('keydown',event=>{if(event.key==='Escape')void window.shareInk.close();});
