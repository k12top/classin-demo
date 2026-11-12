'use strict';

/** Keep the captured pixels needed for the floating window's physical size. */
function seatFrameWidth(sourceWidth,viewWidth,scaleFactor){
 if(!Number.isFinite(sourceWidth)||sourceWidth<=0||!Number.isFinite(viewWidth)||viewWidth<=0)return 0;
 const scale=Number.isFinite(scaleFactor)?Math.max(1,Math.min(2,scaleFactor)):1;
 return Math.min(Math.floor(sourceWidth),Math.max(1,Math.ceil(viewWidth*scale)));
}
module.exports={seatFrameWidth};
