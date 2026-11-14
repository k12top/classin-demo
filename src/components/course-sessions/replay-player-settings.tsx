"use client";

import {useEffect,useRef,useState,type ReactNode,type RefObject} from "react";
import * as Menu from "@radix-ui/react-dropdown-menu";
import * as Dialog from "@radix-ui/react-dialog";
import {Check,ChevronLeft,ChevronRight,Settings,X} from "lucide-react";
import {useTranslation} from "@/lib/i18n/context";
import {replayReviewCopy} from "@/lib/replay-review-copy";
import type {PlaybackQuality,PlaybackQualityInfo} from "@/lib/playback-media";
import {usePlaybackSpeed} from "./playback-speed-control";
import styles from "./replay-player-settings.module.css";

export function ReplayPlayerSettings({videoRef,speed,onSpeedChange,quality,onQualityChange,qualityInfo,onOpenChange,captionSettings}:{videoRef:RefObject<HTMLVideoElement|null>;speed:number;onSpeedChange:(value:number)=>void;quality:PlaybackQuality;onQualityChange:(value:PlaybackQuality)=>void;qualityInfo:PlaybackQualityInfo;onOpenChange:(open:boolean)=>void;captionSettings:ReactNode}){
 const {locale,t}=useTranslation(),copy=replayReviewCopy(locale);
 const {label,format,options}=usePlaybackSpeed({videoRef,value:speed,onChange:onSpeedChange});
 const [open,setOpen]=useState(false),[view,setView]=useState<"main"|"speed"|"quality">("main"),[captionsOpen,setCaptionsOpen]=useState(false);
 const [container,setContainer]=useState<HTMLElement|null>(null);const trigger=useRef<HTMLButtonElement>(null),content=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(open&&view!=="main")content.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();},[open,view]);
 useEffect(()=>{onOpenChange(open||captionsOpen);},[open,captionsOpen,onOpenChange]);
 const changeOpen=(next:boolean)=>{setContainer(trigger.current?.closest<HTMLElement>('[data-replay-stage]')||null);setOpen(next);if(next)setView("main");};
 const qualityLabel=qualityInfo.canSelect?(quality==="auto"?copy.auto:copy.high):qualityInfo.height?`${qualityInfo.height}p`:copy.sourceQuality;
 return <>
  <Menu.Root open={open} onOpenChange={changeOpen} modal={false}>
   <Menu.Trigger asChild><button ref={trigger} type="button" data-playback-settings aria-label={copy.settings} title={copy.settings}><Settings size={19}/></button></Menu.Trigger>
   <Menu.Portal container={container}>
    <Menu.Content ref={content} onCloseAutoFocus={event=>{if(captionsOpen)event.preventDefault();}} className={styles.menu} side="top" align="end" sideOffset={12} collisionBoundary={container} collisionPadding={8} aria-label={view==="speed"?label:view==="quality"?copy.playbackQuality:copy.settings}>
     {view==="main"?<>
      <Menu.Item className={styles.item} onSelect={event=>{event.preventDefault();setView("speed");}}><span>{label}</span><span className={styles.value}>{format.format(speed)}×</span><ChevronRight size={14}/></Menu.Item>
      <Menu.Item className={styles.item} disabled={!qualityInfo.canSelect} onSelect={event=>{event.preventDefault();setView("quality");}}><span>{copy.quality}</span><span className={styles.value}>{qualityLabel}</span>{qualityInfo.canSelect&&<ChevronRight size={14}/>}</Menu.Item>
      <Menu.Separator className={styles.separator}/>
      <Menu.Item className={styles.item} onSelect={()=>setCaptionsOpen(true)}>{t("classroom.v3.captionSettings")}</Menu.Item>
     </>:<>
      <Menu.Item className={`${styles.item} ${styles.back}`} onSelect={event=>{event.preventDefault();setView("main");}}><ChevronLeft size={14}/>{view==="speed"?label:copy.playbackQuality}</Menu.Item>
      <Menu.Separator className={styles.separator}/>
      <Menu.RadioGroup value={view==="speed"?String(speed):quality} onValueChange={value=>{if(view==="speed")onSpeedChange(Number(value));else onQualityChange(value as PlaybackQuality);setOpen(false);}}>
       {(view==="speed"?options.map(value=>({value:String(value),label:`${format.format(value)}×`})):[{value:"auto",label:copy.auto},{value:"high",label:copy.high}]).map(option=><Menu.RadioItem className={styles.item} key={option.value} value={option.value}><span className={styles.check}><Menu.ItemIndicator><Check size={15}/></Menu.ItemIndicator></span>{option.label}</Menu.RadioItem>)}
      </Menu.RadioGroup>
     </>}
    </Menu.Content>
   </Menu.Portal>
  </Menu.Root>
  <Dialog.Root open={captionsOpen} onOpenChange={setCaptionsOpen}>
   <Dialog.Portal container={container}>
    <Dialog.Overlay className={styles.overlay}/>
    <Dialog.Content className={styles.captionDialog} aria-describedby={undefined} onCloseAutoFocus={event=>{event.preventDefault();trigger.current?.focus();}}>
     <header><Dialog.Title>{t("classroom.v3.captionSettings")}</Dialog.Title><Dialog.Close aria-label={copy.close}><X size={16}/></Dialog.Close></header>
     {captionSettings}
    </Dialog.Content>
   </Dialog.Portal>
  </Dialog.Root>
 </>;
}
