type DesktopInputCapability={platform?:string;canReceiveRemoteControl?:boolean;setRemoteControlRequest?:unknown;startRemoteControl?:unknown};
export function desktopRemoteInputAvailable(desktop:DesktopInputCapability|undefined){
 return Boolean(desktop&&(desktop.platform==='darwin'?desktop.canReceiveRemoteControl!==false:desktop.platform==='win32'&&desktop.canReceiveRemoteControl===true)&&typeof desktop.setRemoteControlRequest==='function'&&typeof desktop.startRemoteControl==='function');
}
