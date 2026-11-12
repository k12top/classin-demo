"use client";
import {useEffect,useRef,useState} from "react";
import {withDeviceCaptureTimeout} from "@/lib/classroom/device-capture-timeout";
import styles from "./workspace.module.css";

export function WorkspaceDeviceCheck({locale}:{locale:string}){
 const zh=locale.startsWith("zh"),video=useRef<HTMLVideoElement>(null),stream=useRef<MediaStream|null>(null),sequence=useRef(0),audio=useRef<AudioContext|null>(null),frame=useRef<number|null>(null),mounted=useRef(true);
 const [active,setActive]=useState<"audio"|"video"|null>(null),[busy,setBusy]=useState(false),[level,setLevel]=useState(0),[error,setError]=useState("");
 const stop=()=>{sequence.current++;void window.classroomDesktop?.cancelDeviceCheck?.().catch(()=>{});stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;if(frame.current!==null)cancelAnimationFrame(frame.current);frame.current=null;if(audio.current)void audio.current.close();audio.current=null;if(video.current)video.current.srcObject=null;};
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;stop();};},[]);
 async function start(kind:"audio"|"video"){
  stop();const serial=sequence.current;setActive(null);setLevel(0);setError("");setBusy(true);
  try{
   if(!navigator.mediaDevices?.getUserMedia)throw new Error("unsupported");
   if(window.classroomDesktop?.isDesktop){if(!window.classroomDesktop.prepareDeviceCheck)throw new Error("unsupported");await window.classroomDesktop.prepareDeviceCheck(kind);}
   if(sequence.current!==serial){void window.classroomDesktop?.cancelDeviceCheck?.().catch(()=>{});return;}
   const next=await withDeviceCaptureTimeout(navigator.mediaDevices.getUserMedia({audio:kind==="audio",video:kind==="video"}),late=>late.getTracks().forEach(track=>track.stop()));
   if(sequence.current!==serial){next.getTracks().forEach(track=>track.stop());return;}
   stream.current=next;setActive(kind);
   next.getTracks().forEach(track=>{track.onended=()=>{if(sequence.current!==serial)return;stop();setBusy(false);setActive(null);setLevel(0);setError(zh?"设备已断开，请检查连接后重新检测。":"The device disconnected. Check its connection and try again.");};});
   if(kind==="video"&&video.current){video.current.srcObject=next;await video.current.play();}
   if(kind==="audio"){
    const context=new AudioContext();audio.current=context;const analyser=context.createAnalyser();analyser.fftSize=256;context.createMediaStreamSource(next).connect(analyser);const data=new Uint8Array(analyser.fftSize);let last=0;
    const measure=(time:number)=>{if(sequence.current!==serial)return;if(time-last>=100){last=time;analyser.getByteTimeDomainData(data);let sum=0;for(const sample of data)sum+=(sample-128)**2;setLevel(Math.min(100,Math.round(Math.sqrt(sum/data.length)*4)));}frame.current=requestAnimationFrame(measure);};frame.current=requestAnimationFrame(measure);
   }
  }catch(failure){if(sequence.current===serial){stop();setActive(null);setBusy(false);setError(failure instanceof Error&&failure.message==="DEVICE_CAPTURE_TIMEOUT"?(zh?"设备响应超时，请检查浏览器权限提示和设备连接后重试。":"The device did not respond. Check the browser's permission prompt and device connection, then try again."):(zh?"无法启动检测，请检查设备连接及系统或浏览器权限。":"Could not start the check. Check the device connection and system or browser permissions."));}}
  finally{if(mounted.current&&sequence.current===serial)setBusy(false);}
 }
 function stopCheck(){stop();setBusy(false);setActive(null);setLevel(0);}
 function testSpeaker(){try{const context=new AudioContext(),oscillator=context.createOscillator(),gain=context.createGain();oscillator.frequency.value=440;gain.gain.setValueAtTime(0.08,context.currentTime);gain.gain.exponentialRampToValueAtTime(0.001,context.currentTime+0.35);oscillator.connect(gain).connect(context.destination);oscillator.onended=()=>{void context.close();};oscillator.start();oscillator.stop(context.currentTime+0.35);}catch{setError(zh?"无法播放测试音，请检查扬声器。":"Unable to play the test tone. Check your speakers.");}}
 return <div className={styles.deviceCheck}><p>{zh?"上课前检查摄像头、麦克风和扬声器。检测仅在本机进行。":"Check your camera, microphone and speakers before class. Checks run locally."}</p><div className={styles.deviceVideo}><video ref={video} autoPlay muted playsInline aria-label={zh?"摄像头预览":"Camera preview"}/>{active!=="video"&&<span>{zh?"摄像头未开启":"Camera is off"}</span>}</div><div className={styles.deviceButtons}><button type="button" className={styles.button} disabled={busy} onClick={()=>void start("video")}>{zh?"检测摄像头":"Check camera"}</button><button type="button" className={styles.button} disabled={busy} onClick={()=>void start("audio")}>{zh?"检测麦克风":"Check microphone"}</button><button type="button" className={styles.button} onClick={testSpeaker}>{zh?"播放测试音":"Test speaker"}</button>{active&&<button type="button" className={styles.button} onClick={stopCheck}>{zh?"停止检测":"Stop check"}</button>}</div>{active==="audio"&&<label className={styles.deviceLevel}>{zh?"麦克风输入":"Microphone input"}<progress value={level} max={100}/></label>}{error&&<p className={styles.formError} role="alert">{error}</p>}</div>;
}
