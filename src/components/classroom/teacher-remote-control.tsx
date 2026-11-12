"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { prepareRemoteControlSender } from "@/lib/classroom/remote-control-handshake";
import { createRemoteControlTransport } from "@/lib/classroom/remote-control-transport";
import { parseRemoteInput, remotePointFromVideo } from "@/lib/classroom/remote-control-input";
import { useRemoteControl } from "@/lib/classroom/use-remote-control";
import type { ClassroomRemoteControlHint, ClassroomRemoteControlInput } from "@/lib/classroom/signaling/types";

type Props = {
  sessionId: string; clientId: string; teacherId: string; studentId: string; claimId: string;
  shareAccess?: string; locale: string;
  publishHint: (hint: ClassroomRemoteControlHint) => Promise<void>;
  publishInput: (id: string, event: ClassroomRemoteControlInput) => Promise<void>;
};
type Transport = ReturnType<typeof createRemoteControlTransport>;
const messages = {
  "zh-CN": { request: "请求控制", waiting: "等待学生同意", preparing: "正在连接", videoWaiting: "等待学生共享画面加载", ready: "开始控制", active: "正在控制学生屏幕", stop: "结束控制", failed: "控制连接已断开，请重新请求", ended: "请求被拒绝或已结束，可重新请求", focusLost: "控制画面失去焦点，已结束控制；请重新请求学生授权。", hint: "点击画面操作，失去焦点时自动结束" },
  "zh-TW": { request: "請求控制", waiting: "等待學生同意", preparing: "正在連線", videoWaiting: "等待學生共享畫面載入", ready: "開始控制", active: "正在控制學生螢幕", stop: "結束控制", failed: "控制連線已中斷，請重新請求", ended: "請求遭拒或已結束，可重新請求", focusLost: "控制畫面失去焦點，已結束控制；請重新請求學生授權。", hint: "點擊畫面操作，失去焦點時自動結束" },
  en: { request: "Request control", waiting: "Waiting for student", preparing: "Connecting", videoWaiting: "Waiting for the shared screen", ready: "Start control", active: "Controlling student screen", stop: "Stop control", failed: "Control disconnected. Request again.", ended: "Request declined or ended. You can request again.", focusLost: "Control stopped because the screen lost focus. Request the student’s permission again.", hint: "Click the screen to interact. Control stops when focus is lost." },
  vi: { request: "Yêu cầu điều khiển", waiting: "Đang chờ học sinh", preparing: "Đang kết nối", videoWaiting: "Đang chờ màn hình được chia sẻ", ready: "Bắt đầu điều khiển", active: "Đang điều khiển màn hình", stop: "Dừng điều khiển", failed: "Đã mất kết nối. Hãy yêu cầu lại.", ended: "Yêu cầu bị từ chối hoặc đã kết thúc. Bạn có thể yêu cầu lại.", focusLost: "Đã dừng điều khiển vì màn hình mất tiêu điểm. Hãy xin học sinh cho phép lại.", hint: "Nhấp vào màn hình để thao tác. Điều khiển dừng khi mất tiêu điểm." },
} as const;

/** Control is scoped to one visible student share and one explicit grant. */
export function TeacherRemoteControl(props: Props) {
  const {sessionId, clientId, teacherId, studentId, claimId, shareAccess, locale, publishHint, publishInput} = props;
  const text = messages[locale as keyof typeof messages] || messages.en;
  const remote = useRemoteControl({sessionId,clientId,userId:teacherId,shareAccess,active:true,publishHint});
  const grant = remote.grants.find(item => item.studentId === studentId && item.teacherId === teacherId && item.shareClaimId === claimId && (item.effectiveState === "requested" || item.effectiveState === "granted"));
  const terminal = remote.grants.find(item => item.studentId === studentId && item.teacherId === teacherId && item.shareClaimId === claimId && ["rejected", "revoked", "inactive"].includes(item.effectiveState));
  const grantedId = grant?.effectiveState === "granted" ? grant.id : "";
  const grantRef = useRef(grant);
  const callbacks = useRef({publishHint,publishInput});
  useEffect(() => { grantRef.current = grant; callbacks.current = {publishHint,publishInput}; }, [grant,publishHint,publishInput]);
  const transport = useRef<Transport | null>(null);
  const surface = useRef<HTMLDivElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const [videoReady, setVideoReady] = useState(false);
  const requestId = useRef(crypto.randomUUID());
  const seenTerminal = useRef("");
  useEffect(() => { if (terminal && seenTerminal.current !== terminal.id) { seenTerminal.current = terminal.id; requestId.current = crypto.randomUUID(); } }, [terminal]);
  const stopping = useRef(new Set<string>());
  const [prepared, setPrepared] = useState("");
  const [controlling, setControlling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [stoppedId, setStoppedId] = useState("");
  const [focusLost, setFocusLost] = useState(false);
  const heldKeys = useRef(new Set<string>());
  const heldButtons = useRef(new Set<string>());

  const stopGrant = useCallback((id: string) => {
    if (!id || stopping.current.has(id)) return;
    stopping.current.add(id);
    setStoppedId(id);
    requestId.current = crypto.randomUUID();
    transport.current?.close(); transport.current = null;
    heldKeys.current.clear(); heldButtons.current.clear();
    setControlling(false); setPrepared("");
    // A closing window must not prevent the authoritative revoke from being sent.
    const revoke = async () => {
      for (let attempt=0; attempt<2; attempt++) {
        try {
          const response=await fetch(`/api/courses/${encodeURIComponent(sessionId)}/classroom/remote-control`, {
            method:"POST", credentials:"same-origin", keepalive:true, headers:{"content-type":"application/json"},
            body:JSON.stringify({action:"stop",grantId:id,clientId,...(shareAccess && {shareAccess})}), signal:AbortSignal.timeout(5000),
          });
          if (response.ok) return;
        } catch { /* Retry an uncertain response with the same grant. */ }
      }
      setError(true);
    };
    void revoke().finally(() => {
      void callbacks.current.publishHint({courseId:sessionId,topic:"remote-control-hint",revision:0,actorId:teacherId,targetUserId:studentId}).catch(() => undefined);
    });
  }, [sessionId,clientId,shareAccess,studentId,teacherId]);

  useEffect(() => () => { if (grantRef.current) stopGrant(grantRef.current.id); }, [stopGrant]);

  useEffect(() => {
    if (!grantedId) return;
    const controller = new AbortController();
    // A registered key cannot be recovered after a page reload: end that grant.
    if (grantRef.current?.keyReady) { setError(true); stopGrant(grantedId); return; }
    void prepareRemoteControlSender({sessionId,clientId,grantId:grantedId,studentId,shareClaimId:claimId,shareAccess,signal:controller.signal}).then(({signer,targetSignalingId}) => {
      if (controller.signal.aborted) { signer.close(); return; }
      transport.current = createRemoteControlTransport({courseId:sessionId,targetUserId:studentId,targetSignalingId,signer,
        publish:(id,event)=>callbacks.current.publishInput(id,event),
        onFailure:()=>{setError(true);stopGrant(grantedId);},
      });
      setPrepared(grantedId);
      void callbacks.current.publishHint({courseId:sessionId,topic:"remote-control-hint",revision:0,actorId:teacherId,targetUserId:studentId}).catch(()=>undefined);
    }).catch(()=>{if(!controller.signal.aborted){setError(true);stopGrant(grantedId);}});
    return () => { controller.abort(); stopGrant(grantedId); };
  }, [grantedId,sessionId,clientId,studentId,claimId,shareAccess,teacherId,stopGrant]);

  useEffect(() => {
    if (!controlling || !grantedId || !grant?.receiverReady || prepared !== grantedId) return;
    const active = transport.current;
    if (!active || !active.enqueue({type:"heartbeat"})) { stopGrant(grantedId); return; }
    surface.current?.focus();
    const heartbeat = window.setInterval(()=>{if(!active.enqueue({type:"heartbeat"}))stopGrant(grantedId);},500);
    const blur = () => { setFocusLost(true); stopGrant(grantedId); };
    const visibility = () => { if(document.hidden) blur(); };
    const element = surface.current;
    const wheel = (event:WheelEvent) => {
      const video=element?.parentElement?.querySelector("video");
      const p=video && remotePointFromVideo(event.clientX,event.clientY,video.getBoundingClientRect(),{width:video.videoWidth,height:video.videoHeight});
      if (!p || (!event.deltaX && !event.deltaY)) return;
      event.preventDefault();
      const scale=event.deltaMode===1?16:event.deltaMode===2?500:1;
      if (!active.enqueue({type:"wheel",...p,deltaX:Math.max(-1200,Math.min(1200,event.deltaX*scale)),deltaY:Math.max(-1200,Math.min(1200,event.deltaY*scale))})) stopGrant(grantedId);
    };
    element?.addEventListener("wheel",wheel,{passive:false});
    window.addEventListener("blur",blur); document.addEventListener("visibilitychange",visibility);
    return () => { clearInterval(heartbeat); element?.removeEventListener("wheel",wheel); window.removeEventListener("blur",blur); document.removeEventListener("visibilitychange",visibility); };
  }, [controlling,grantedId,grant?.receiverReady,prepared,stopGrant]);
  // The SDK can report a participant before its video element has metadata.
  // Until dimensions exist, coordinate mapping cannot produce an input point.
  useEffect(() => {
    if (!grantedId) return;
    const check = () => {
      const video = toolbar.current?.parentElement?.querySelector(".classroom-v3-media-video video") as HTMLVideoElement | null;
      setVideoReady(Boolean(video && video.videoWidth > 0 && video.videoHeight > 0));
    };
    check();
    const timer = window.setInterval(check, 500);
    return () => window.clearInterval(timer);
  }, [grantedId]);
  useEffect(() => { if (controlling && (!grant?.receiverReady || !grantedId)) stopGrant(grantedId || grantRef.current?.id || ""); }, [controlling,grant?.receiverReady,grantedId,stopGrant]);

  const point = (x:number,y:number) => {
    const video = surface.current?.parentElement?.querySelector("video");
    return video ? remotePointFromVideo(x,y,video.getBoundingClientRect(),{width:video.videoWidth,height:video.videoHeight}) : null;
  };
  const send = (event:unknown) => { if (!transport.current?.enqueue(event)) {setError(true);stopGrant(grantedId);} };
  const pointer = (event:React.PointerEvent<HTMLDivElement>, down:boolean) => {
    const button = (["left","middle","right"] as const)[event.button]; const p=point(event.clientX,event.clientY);
    if (!button || !p) { if(!down && heldButtons.current.size)stopGrant(grantedId); return; }
    event.preventDefault();
    if (down) { event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); heldButtons.current.add(button); }
    else { if(!heldButtons.current.has(button))return; heldButtons.current.delete(button); }
    send({type:"button",...p,button,down});
  };
  const request = async () => {
    setBusy(true); setError(false); setFocusLost(false);
    try { await remote.command({action:"request",studentId,claimId,commandId:requestId.current}); }
    catch (failure) { console.warn("[classroom:remote-control] request failed", failure instanceof Error && "status" in failure ? failure.status : "network"); setError(true); } finally { setBusy(false); }
  };
  const isStopped = Boolean(grant && stoppedId === grant.id);
  const canStart = Boolean(grantedId && grant?.receiverReady && prepared === grantedId && videoReady && !remote.error && !isStopped);
  return <>
    {controlling && <div ref={surface} className="classroom-remote-control-surface" role="application" tabIndex={0} aria-label={text.hint}
      onBlur={()=>{setFocusLost(true);stopGrant(grantedId);}} onContextMenu={event=>event.preventDefault()}
      onPointerDown={event=>pointer(event,true)} onPointerUp={event=>pointer(event,false)}
      onPointerCancel={()=>stopGrant(grantedId)} onLostPointerCapture={()=>{if(heldButtons.current.size)stopGrant(grantedId);}}
      onPointerMove={event=>{const p=point(event.clientX,event.clientY);if(p)send({type:"move",...p});}}
      onKeyDown={event=>{if(event.code==="Escape"){event.preventDefault();stopGrant(grantedId);return;}const input={type:"key",code:event.code,down:true};if(!event.repeat && !heldKeys.current.has(event.code) && parseRemoteInput(input)){event.preventDefault();heldKeys.current.add(event.code);send(input);}}}
      onKeyUp={event=>{if(heldKeys.current.delete(event.code)){event.preventDefault();send({type:"key",code:event.code,down:false});}}}
    />}
    <div ref={toolbar} className="classroom-remote-control-toolbar" role="status">
      {controlling ? <><span>{text.active}</span><button onClick={()=>stopGrant(grantedId)}>{text.stop}</button></> :
        grant && !isStopped ? <><span>{canStart ? text.hint : grant.effectiveState === "requested" ? text.waiting : grant.receiverReady && prepared === grantedId && !videoReady ? text.videoWaiting : text.preparing}</span><button disabled={!canStart} onClick={()=>setControlling(true)}>{canStart ? text.ready : grant.effectiveState === "requested" ? text.waiting : text.preparing}</button><button onClick={()=>stopGrant(grant.id)}>{text.stop}</button></> :
        <><button disabled={busy || !remote.loaded} onClick={()=>void request()}>{text.request}</button>{error ? <span>{text.failed}</span> : focusLost ? <span>{text.focusLost}</span> : terminal && terminal.id !== stoppedId && <span>{text.ended}</span>}</>}
    </div>
  </>;
}
