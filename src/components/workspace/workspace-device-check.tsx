"use client";
import {useEffect,useRef,useState} from "react";
import {withDeviceCaptureTimeout} from "@/lib/classroom/device-capture-timeout";
import {deviceCheckError,workspaceDeviceCopy,type DeviceCheckError} from "./workspace-device-copy";
import styles from "./workspace.module.css";

export function WorkspaceDeviceCheck({locale}:{locale:string}){
 const copy=workspaceDeviceCopy(locale),video=useRef<HTMLVideoElement>(null),stream=useRef<MediaStream|null>(null),sequence=useRef(0),audio=useRef<AudioContext|null>(null),frame=useRef<number|null>(null),mounted=useRef(true);
 const [active,setActive]=useState<"audio"|"video"|null>(null),[busy,setBusy]=useState(false),[level,setLevel]=useState(0),[error,setError]=useState<DeviceCheckError|null>(null);
 const stop=()=>{sequence.current++;void window.classroomDesktop?.cancelDeviceCheck?.().catch(()=>{});stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;if(frame.current!==null)cancelAnimationFrame(frame.current);frame.current=null;if(audio.current)void audio.current.close();audio.current=null;if(video.current)video.current.srcObject=null;};
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;stop();};},[]);
 async function start(kind:"audio"|"video"){
  stop();const serial=sequence.current;setActive(null);setLevel(0);setError(null);setBusy(true);
  try{
   if(!navigator.mediaDevices?.getUserMedia)throw new Error("unsupported");
   if(window.classroomDesktop?.isDesktop){if(!window.classroomDesktop.prepareDeviceCheck)throw new Error("unsupported");await window.classroomDesktop.prepareDeviceCheck(kind);}
   if(sequence.current!==serial){void window.classroomDesktop?.cancelDeviceCheck?.().catch(()=>{});return;}
   const next=await withDeviceCaptureTimeout(navigator.mediaDevices.getUserMedia({audio:kind==="audio",video:kind==="video"}),late=>late.getTracks().forEach(track=>track.stop()));
   if(sequence.current!==serial){next.getTracks().forEach(track=>track.stop());return;}
   stream.current=next;setActive(kind);
   next.getTracks().forEach(track=>{track.onended=()=>{if(sequence.current!==serial)return;stop();setBusy(false);setActive(null);setLevel(0);setError("deviceDisconnected");};});
   if(kind==="video"&&video.current){video.current.srcObject=next;await video.current.play();}
   if(kind==="audio"){
    const context=new AudioContext();audio.current=context;const analyser=context.createAnalyser();analyser.fftSize=256;context.createMediaStreamSource(next).connect(analyser);const data=new Uint8Array(analyser.fftSize);let last=0;
    const measure=(time:number)=>{if(sequence.current!==serial)return;if(time-last>=100){last=time;analyser.getByteTimeDomainData(data);let sum=0;for(const sample of data)sum+=(sample-128)**2;setLevel(Math.min(100,Math.round(Math.sqrt(sum/data.length)*4)));}frame.current=requestAnimationFrame(measure);};frame.current=requestAnimationFrame(measure);
   }
  }catch(failure){if(sequence.current===serial){stop();setActive(null);setBusy(false);setError(deviceCheckError(failure));}}
  finally{if(mounted.current&&sequence.current===serial)setBusy(false);}
 }
 function stopCheck(){stop();setBusy(false);setActive(null);setLevel(0);}
 function testSpeaker(){try{const context=new AudioContext(),oscillator=context.createOscillator(),gain=context.createGain();oscillator.frequency.value=440;gain.gain.setValueAtTime(0.08,context.currentTime);gain.gain.exponentialRampToValueAtTime(0.001,context.currentTime+0.35);oscillator.connect(gain).connect(context.destination);oscillator.onended=()=>{void context.close();};oscillator.start();oscillator.stop(context.currentTime+0.35);}catch{setError("speakerFailed");}}
 return <div className={styles.deviceCheck} role="region" aria-label={copy.title} aria-busy={busy}><p>{copy.intro}</p><div className={styles.deviceVideo}><video ref={video} autoPlay muted playsInline aria-label={copy.cameraPreview}/>{active!=="video"&&<span>{copy.cameraOff}</span>}</div><div className={styles.deviceButtons}><button type="button" className={styles.button} disabled={busy} onClick={()=>void start("video")}>{copy.checkCamera}</button><button type="button" className={styles.button} disabled={busy} onClick={()=>void start("audio")}>{copy.checkMicrophone}</button><button type="button" className={styles.button} onClick={testSpeaker}>{copy.testSpeaker}</button>{active&&<button type="button" className={styles.button} onClick={stopCheck}>{copy.stopCheck}</button>}</div>{busy&&<p role="status">{copy.preparing}</p>}{active==="audio"&&<label className={styles.deviceLevel}>{copy.microphoneInput}<progress value={level} max={100}/></label>}{error&&<p className={styles.formError} role="alert">{copy[error]}</p>}</div>;
}
