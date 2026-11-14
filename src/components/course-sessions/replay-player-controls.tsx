"use client";

import {useEffect,useState,type ReactNode,type RefObject} from "react";
import {Maximize,Minimize,Pause,Play,Volume2,VolumeX} from "lucide-react";
import {useTranslation} from "@/lib/i18n/context";
import {replayReviewCopy} from "@/lib/replay-review-copy";
import styles from "./replay-player-controls.module.css";

const time=(value:number)=>{const n=Number.isFinite(value)?Math.max(0,Math.floor(value)):0;return `${Math.floor(n/60)}:${String(n%60).padStart(2,"0")}`;};

export function ReplayPlayerControls({videoRef,className,children}:{videoRef:RefObject<HTMLVideoElement|null>;className:string;children:ReactNode}){
 const {locale}=useTranslation(),copy=replayReviewCopy(locale);
 const [media,setMedia]=useState({paused:true,current:0,duration:0,volume:1,muted:false});
 const [fullscreen,setFullscreen]=useState(false),[failure,setFailure]=useState("");
 useEffect(()=>{
  const video=videoRef.current;if(!video)return;
  const sync=()=>setMedia({paused:video.paused,current:video.currentTime||0,duration:Number.isFinite(video.duration)?video.duration:0,volume:video.volume,muted:video.muted});
  const full=()=>setFullscreen(document.fullscreenElement===video.parentElement);
  const toggleFromVideo=()=>{setFailure("");if(video.paused)void video.play().catch(()=>setFailure(copy.playerFailed));else video.pause();};
  const events=["loadedmetadata","durationchange","timeupdate","play","pause","ended","volumechange","emptied"];
  events.forEach(name=>video.addEventListener(name,sync));video.addEventListener("click",toggleFromVideo);document.addEventListener("fullscreenchange",full);sync();
  return()=>{events.forEach(name=>video.removeEventListener(name,sync));video.removeEventListener("click",toggleFromVideo);document.removeEventListener("fullscreenchange",full);};
 },[videoRef,copy.playerFailed]);
 const toggle=async()=>{const video=videoRef.current;if(!video)return;setFailure("");if(!video.paused){video.pause();return;}try{await video.play();}catch{setFailure(copy.playerFailed);}};
 const expand=async()=>{const stage=videoRef.current?.parentElement;if(!stage)return;try{if(document.fullscreenElement===stage)await document.exitFullscreen();else await stage.requestFullscreen();setFailure("");}catch{setFailure(copy.fullscreenFailed);}};
 return <div className={`${className} ${styles.controls}`} role="group" aria-label={copy.playerControls}>
  <input className={styles.seek} type="range" aria-label={copy.seek} aria-valuetext={`${time(media.current)} / ${time(media.duration)}`} min={0} max={media.duration||1} step={0.1} value={Math.min(media.current,media.duration)} disabled={!media.duration} onChange={event=>{const video=videoRef.current;if(video)video.currentTime=Number(event.target.value);}}/>
  <div className={styles.row}>
   <div className={styles.transport}>
    <button type="button" aria-label={media.paused?copy.play:copy.pause} title={media.paused?copy.play:copy.pause} onClick={()=>void toggle()}>{media.paused?<Play size={19} fill="currentColor"/>:<Pause size={19} fill="currentColor"/>}</button>
    <button type="button" aria-label={media.muted?copy.unmute:copy.mute} title={media.muted?copy.unmute:copy.mute} onClick={()=>{const video=videoRef.current;if(video)video.muted=!video.muted;}}>{media.muted||media.volume===0?<VolumeX size={19}/>:<Volume2 size={19}/>}</button>
    <input className={styles.volume} type="range" aria-label={copy.volume} min={0} max={1} step={0.05} value={media.muted?0:media.volume} onChange={event=>{const video=videoRef.current;if(video){video.volume=Number(event.target.value);video.muted=false;}}}/>
    <span className={styles.time}>{time(media.current)} / {time(media.duration)}</span>
   </div>
   <div className={styles.tools}>{children}</div>
   <button type="button" aria-label={fullscreen?copy.exitFullscreen:copy.fullscreen} title={fullscreen?copy.exitFullscreen:copy.fullscreen} onClick={()=>void expand()}>{fullscreen?<Minimize size={19}/>:<Maximize size={19}/>}</button>
  </div>
  {failure&&<p role="status" className={styles.failure}>{failure}</p>}
 </div>;
}
