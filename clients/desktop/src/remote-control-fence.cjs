'use strict';
// Internal main-process primitive. Callers must verify current server consent,
// the exact connection, and local capture binding before opening or renewing.
const MAX_LEASE_MS=3000,MAX_EVENTS_PER_SECOND=240;
const keys=/^(Key[A-Z]|Digit[0-9]|F(?:[1-9]|1[0-2])|Arrow(?:Up|Down|Left|Right)|(?:Shift|Control|Alt|Meta)(?:Left|Right)|Enter|Escape|Tab|Backspace|Delete|Space|Home|End|PageUp|PageDown|Insert|CapsLock|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Backquote|Comma|Period|Slash|Numpad[0-9]|NumpadAdd|NumpadSubtract|NumpadMultiply|NumpadDivide|NumpadDecimal|NumpadEnter)$/;
const fields=(item,names)=>Object.keys(item).length===names.length&&names.every(name=>Object.prototype.hasOwnProperty.call(item,name));
const point=item=>Number.isFinite(item.x)&&Number.isFinite(item.y)&&item.x>=0&&item.x<=1&&item.y>=0&&item.y<=1;
function validEvent(item){
 if(!item||typeof item!=='object'||Array.isArray(item))return false;
 if(item.type==='heartbeat')return fields(item,['type']);
 if(item.type==='move')return fields(item,['type','x','y'])&&point(item);
 if(item.type==='button')return fields(item,['type','x','y','button','down'])&&point(item)&&['left','right','middle'].includes(item.button)&&typeof item.down==='boolean';
 if(item.type==='wheel')return fields(item,['type','x','y','deltaX','deltaY'])&&point(item)&&Number.isFinite(item.deltaX)&&Number.isFinite(item.deltaY)&&Math.abs(item.deltaX)<=1200&&Math.abs(item.deltaY)<=1200&&(item.deltaX!==0||item.deltaY!==0);
 if(item.type==='key')return fields(item,['type','code','down'])&&typeof item.code==='string'&&keys.test(item.code)&&typeof item.down==='boolean';
 return false;
}
function createRemoteControlFence({grantId,shareClaimId,adapter,clock={now:()=>Number(process.hrtime.bigint()/1000000n),set:(fn,ms)=>setTimeout(fn,ms),clear:timer=>clearTimeout(timer)},onClose=()=>{}}){
 if(typeof grantId!=='string'||!grantId||typeof shareClaimId!=='string'||!shareClaimId||!adapter||typeof adapter.apply!=='function'||typeof adapter.releaseKey!=='function'||typeof adapter.releaseButton!=='function')throw Error('Invalid control fence');
 let open=true,deadline=0,timer,sequence=0,windowStart=clock.now(),count=0;const heldKeys=new Set(),heldButtons=new Set();
 function close(reason){if(!open)return;open=false;if(timer!==undefined)clock.clear(timer);for(const code of heldKeys){try{adapter.releaseKey(code);}catch{/* Continue releasing remaining inputs. */}}for(const button of heldButtons){try{adapter.releaseButton(button);}catch{/* Continue releasing remaining inputs. */}}heldKeys.clear();heldButtons.clear();onClose(reason);}
 function renew(binding,leaseMs){if(!open||!binding||binding.grantId!==grantId||binding.shareClaimId!==shareClaimId||!Number.isFinite(leaseMs)||leaseMs<=0||leaseMs>MAX_LEASE_MS){close('invalid-lease');return false;}const now=clock.now();if(deadline&&now>=deadline){close('expired');return false;}deadline=now+leaseMs;if(timer!==undefined)clock.clear(timer);const expire=()=>{const remaining=deadline-clock.now();if(remaining<=0)close('expired');else timer=clock.set(expire,Math.ceil(remaining));};timer=clock.set(expire,Math.ceil(leaseMs));return true;}
 function receive(packet){
  if(!open)return false;const now=clock.now();if(!deadline||now>=deadline){close('expired');return false;}
  if(!packet||typeof packet!=='object'||Array.isArray(packet)||!fields(packet,['grantId','sequence','event'])||packet.grantId!==grantId||!Number.isSafeInteger(packet.sequence)||packet.sequence!==sequence+1||!validEvent(packet.event)){close('invalid-input');return false;}
  if(now-windowStart>=1000){windowStart=now;count=0;}if(++count>MAX_EVENTS_PER_SECOND){close('rate-limit');return false;}
  const event=packet.event;
  if(event.type==='heartbeat'){sequence=packet.sequence;return true;}
  if(event.type==='key'&&event.down&&heldKeys.has(event.code))return close('duplicate-down'),false;
  if(event.type==='key'&&!event.down&&!heldKeys.has(event.code))return close('unexpected-up'),false;
  if(event.type==='button'&&event.down&&heldButtons.has(event.button))return close('duplicate-down'),false;
  if(event.type==='button'&&!event.down&&!heldButtons.has(event.button))return close('unexpected-up'),false;
  if(event.type==='key'&&event.down)heldKeys.add(event.code);if(event.type==='button'&&event.down)heldButtons.add(event.button);
  try{adapter.apply(event);}catch{close('adapter-error');return false;}
  if(event.type==='key'&&!event.down)heldKeys.delete(event.code);if(event.type==='button'&&!event.down)heldButtons.delete(event.button);
  sequence=packet.sequence;return true;
 }
 return {renew,receive,close,isOpen:()=>open};
}
module.exports={createRemoteControlFence,MAX_LEASE_MS};
