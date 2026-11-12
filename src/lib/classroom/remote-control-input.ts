/** Coordinates are normalized to the content of the shared video, not the
 * surrounding stage. The receiver must still validate its own capture bounds. */
export type RemotePoint={x:number;y:number};
export type RemoteInput=
 | {type:'heartbeat'}
 | {type:'move';x:number;y:number}
 | {type:'button';x:number;y:number;button:'left'|'right'|'middle';down:boolean}
 | {type:'wheel';x:number;y:number;deltaX:number;deltaY:number}
 | {type:'key';code:string;down:boolean};
type Box={left:number;top:number;width:number;height:number};
type Dimensions={width:number;height:number};
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const point=(x:unknown,y:unknown):x is number=>finite(x)&&finite(y)&&x>=0&&x<=1&&y>=0&&y<=1;
const exact=(value:Record<string,unknown>,keys:string[])=>Object.keys(value).length===keys.length&&keys.every(key=>Object.prototype.hasOwnProperty.call(value,key));
/** Convert a pointer in an object-fit: contain video into a normalized point.
 * Return null for letterboxing, invalid dimensions, or points outside content. */
export function remotePointFromVideo(clientX:number,clientY:number,box:Box,video:Dimensions):RemotePoint|null{
 if(![clientX,clientY,box.left,box.top,box.width,box.height,video.width,video.height].every(finite)||box.width<=0||box.height<=0||video.width<=0||video.height<=0)return null;
 const scale=Math.min(box.width/video.width,box.height/video.height),width=video.width*scale,height=video.height*scale;
 const x=(clientX-(box.left+(box.width-width)/2))/width,y=(clientY-(box.top+(box.height-height)/2))/height;
 return point(x,y)?{x,y}:null;
}
/** Strictly parse untrusted input before it reaches a platform adapter. */
export function parseRemoteInput(value:unknown):RemoteInput|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const input=value as Record<string,unknown>;
 if(input.type==='heartbeat'&&exact(input,['type']))return {type:'heartbeat'};
 if(input.type==='move'&&exact(input,['type','x','y'])&&point(input.x,input.y))return {type:'move',x:input.x,y:input.y as number};
 if(input.type==='button'&&exact(input,['type','x','y','button','down'])&&point(input.x,input.y)&&typeof input.button==='string'&&['left','right','middle'].includes(input.button)&&typeof input.down==='boolean')return {type:'button',x:input.x,y:input.y as number,button:input.button as 'left'|'right'|'middle',down:input.down};
 if(input.type==='wheel'&&exact(input,['type','x','y','deltaX','deltaY'])&&point(input.x,input.y)&&finite(input.deltaX)&&finite(input.deltaY)&&Math.abs(input.deltaX)<=1200&&Math.abs(input.deltaY)<=1200&&(input.deltaX!==0||input.deltaY!==0))return {type:'wheel',x:input.x,y:input.y as number,deltaX:input.deltaX,deltaY:input.deltaY};
 // KeyboardEvent.code is a physical key, never an OS command or text payload.
 if(input.type==='key'&&exact(input,['type','code','down'])&&typeof input.code==='string'&&/^(Key[A-Z]|Digit[0-9]|F(?:[1-9]|1[0-2])|Arrow(?:Up|Down|Left|Right)|(?:Shift|Control|Alt|Meta)(?:Left|Right)|Enter|Escape|Tab|Backspace|Delete|Space|Home|End|PageUp|PageDown|Insert|CapsLock|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Backquote|Comma|Period|Slash|Numpad[0-9]|NumpadAdd|NumpadSubtract|NumpadMultiply|NumpadDivide|NumpadDecimal|NumpadEnter)$/.test(input.code)&&typeof input.down==='boolean')return {type:'key',code:input.code,down:input.down};
 return null;
}
/** Map normalized points into the verified display bounds in desktop DIPs. */
export function remotePointToDisplay(input:RemotePoint,bounds:Box):RemotePoint|null{
 if(!point(input.x,input.y)||![bounds.left,bounds.top,bounds.width,bounds.height].every(finite)||bounds.width<1||bounds.height<1||![bounds.left,bounds.top,bounds.width,bounds.height].every(Number.isSafeInteger))return null;
 return {x:bounds.left+Math.min(bounds.width-1,Math.floor(input.x*bounds.width)),y:bounds.top+Math.min(bounds.height-1,Math.floor(input.y*bounds.height))};
}
