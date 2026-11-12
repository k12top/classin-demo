'use strict';

/** Resolve a selected screen only through Electron's explicit display_id. */
function bindSharedDisplay(source,displays){
 if(!source||typeof source.id!=='string'||!source.id.startsWith('screen:')||typeof source.display_id!=='string'||!/^\d+$/.test(source.display_id))return null;
 const matches=displays.filter(display=>Number.isSafeInteger(display.id)&&display.id>=0&&String(display.id)===source.display_id);
 if(matches.length!==1)return null;
 const display=matches[0],b=display.bounds;
 if(!b||!['x','y','width','height'].every(key=>Number.isFinite(b[key]))||b.width<=0||b.height<=0||!Number.isFinite(display.scaleFactor)||display.scaleFactor<=0)return null;
 return {id:display.id,bounds:{x:b.x,y:b.y,width:b.width,height:b.height},scaleFactor:display.scaleFactor,rotation:display.rotation};
}
/** A changed or disconnected display requires a new selection. */
function sharedDisplayStillMatches(binding,displays){
 if(!binding)return false;
 const current=bindSharedDisplay({id:'screen:bound',display_id:String(binding.id)},displays);
 return Boolean(current&&current.scaleFactor===binding.scaleFactor&&current.rotation===binding.rotation&&['x','y','width','height'].every(key=>current.bounds[key]===binding.bounds[key]));
}
module.exports={bindSharedDisplay,sharedDisplayStillMatches};
