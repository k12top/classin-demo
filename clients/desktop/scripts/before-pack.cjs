'use strict';
module.exports=async context=>{if(context.electronPlatformName==='darwin')require('./build-remote-helper.cjs').build();else if(context.electronPlatformName==='win32')require('./build-windows-remote-helper.cjs').build({arch:context.arch});};
