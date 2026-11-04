/* Local validation surface only. Real RTC provider and SDK, synthetic capture.
 * The console hooks below are bundled exclusively by the local test server. */
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import AgoraRTC from "agora-rtc-sdk-ng";
import { AgoraRtcMediaProvider } from "@/lib/classroom/providers/agora/client";
import { installAgoraSdpCompatibility } from "@/lib/classroom/rtc-sdp-compat";
import { I18nProvider } from "@/lib/i18n/context";
import { MinimalHeader } from "@/components/classroom/minimal-header";
import { ClassroomNetworkStatus } from "@/components/classroom/network-status";

AgoraRTC.setLogLevel(4);
installAgoraSdpCompatibility();
const role = new URLSearchParams(location.search).get("role") || "student";
const provider = new AgoraRtcMediaProvider();
let forcedQuality = null, rawQuality = null, rtcScenario = null;
const clients = [], history = [], captures = [];
const createClient = AgoraRTC.createClient.bind(AgoraRTC);
AgoraRTC.createClient = (...args) => {
  const client = createClient(...args); clients.push(client);
  const on = client.on.bind(client);
  client.on = (event, listener) => on(event, event === "network-quality" ? quality => {
    rawQuality = quality;
    listener(forcedQuality || quality);
  } : listener);
  return client;
};

function canvasSource(screen = false) {
  const canvas = document.createElement("canvas"); canvas.width=1280; canvas.height=720;
  const context = canvas.getContext("2d");
  const timer=setInterval(()=>{
    const t=performance.now()/1000;
    context.fillStyle=screen?"#172554":"#164e63"; context.fillRect(0,0,1280,720);
    context.fillStyle=screen?"#93c5fd":"#67e8f9";
    for(let i=0;i<30;i++)context.fillRect((i*47+t*50)%1280,(i*63)%680,20,20);
    context.fillStyle="white";context.font="48px sans-serif";
    context.fillText(screen?"共享屏幕 · 合成课件":"教师摄像头 · 合成画面",80,160);
    context.font="36px sans-serif";context.fillText(new Date().toLocaleTimeString(),80,240);
  },66);
  const native=canvas.captureStream(15).getVideoTracks()[0];
  captures.push({dispose:()=>{clearInterval(timer);native.stop();}});
  return native;
}
AgoraRTC.createCameraVideoTrack = async options => {
  const track=AgoraRTC.createCustomVideoTrack({mediaStreamTrack:canvasSource(),optimizationMode:"balanced"});
  await track.setEncoderConfiguration(options.encoderConfig);
  return track;
};
AgoraRTC.createScreenVideoTrack = async options => {
  const track=AgoraRTC.createCustomVideoTrack({mediaStreamTrack:canvasSource(true),optimizationMode:"detail"});
  await track.setEncoderConfiguration(options.encoderConfig);
  return track;
};
AgoraRTC.createMicrophoneAudioTrack = async () => {
  const context=new AudioContext();await context.resume();
  const tone=context.createOscillator(),gain=context.createGain(),destination=context.createMediaStreamDestination();
  tone.frequency.value=440;gain.gain.value=.015;tone.connect(gain).connect(destination);tone.start();
  captures.push({dispose:()=>{tone.stop();context.close();}});
  return AgoraRTC.createCustomAudioTrack({mediaStreamTrack:destination.stream.getAudioTracks()[0],encoderConfig:"speech_standard"});
};

function evidence() {
  const snapshot=provider.getSnapshot();
  const client=clients[0];
  return {
    at:new Date().toISOString(),role,rtcScenario,connection:snapshot.connectionState,network:snapshot.network,rawQuality,forcedQuality,
    local:{microphoneOn:snapshot.local.microphoneOn,cameraOn:snapshot.local.cameraOn,screenSharing:snapshot.local.screenSharing},
    selectedVideos:Array.from(provider.remoteVideoStreamTypes || []).map(([uid,type])=>({uid,type})),
    participants:snapshot.participants.map(({id,kind,hasAudio,hasVideo,videoSubscriptionPaused})=>({id,kind,hasAudio,hasVideo,videoSubscriptionPaused})),
    remoteVideo:client?.getRemoteVideoStats() || {},remoteAudio:client?.getRemoteAudioStats() || {},
    localVideo:client?.getLocalVideoStats() || {},localAudio:client?.getLocalAudioStats() || {},
    screenVideo:clients[1]?.getLocalVideoStats() || {},
  };
}
async function saveEvidence() {
  const response=await fetch(`/evidence?role=${role}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({current:evidence(),history})});
  return response.ok;
}
window.classroomNetworkTest={
  setQuality(up,down){forcedQuality={uplinkNetworkQuality:up,downlinkNetworkQuality:down};},
  clearQuality(){forcedQuality=null;},
  evidence,saveEvidence,
};

function VideoTile({participant}) {
  const ref=useRef(null);
  useEffect(()=>{const element=ref.current;provider.attachVideo(participant.id,element);return()=>provider.detachVideo(participant.id,element);},[participant.id]);
  return <div style={{minWidth:0}}><div ref={ref} style={{width:"100%",aspectRatio:"16 / 9",background:"#172334",borderRadius:8,overflow:"hidden"}}/>
    <p>{participant.kind === "screen" ? "共享屏幕" : "摄像头"} · {participant.videoSubscriptionPaused ? "暂停接收视频" : "视频接收中"}</p></div>;
}
function Fixture() {
  const [media,setMedia]=useState(provider.getSnapshot()),[status,setStatus]=useState("尚未加入"),[stats,setStats]=useState(null),[notice,setNotice]=useState("");
  useEffect(()=>provider.subscribe(setMedia),[]);
  useEffect(()=>{const timer=setInterval(()=>{const value=evidence();history.push(value);if(history.length>600)history.shift();setStats(value);},1000);return()=>clearInterval(timer);},[]);
  async function join() {
    setStatus("正在连接");
    try {
      const response=await fetch(`/credential?role=${role}`);const credential=await response.json();
      rtcScenario=credential.scenario;
      await provider.connect(credential,role);
      if(role==="teacher"){await provider.toggleMicrophone();await provider.toggleCamera();}
      setStatus("已加入真实声网测试频道");
    }catch(error){setStatus(`连接失败：${error.code || error.name}`);}
  }
  const noop=()=>{};
  const videoRows=Object.entries(stats?.remoteVideo || {});
  const audioRows=Object.entries(stats?.remoteAudio || {});
  return <main className="classroom-v3-shell is-classin-layout" data-responsive-workspace="true" style={{display:"block",overflow:"auto",height:"100vh"}}>
    <MinimalHeader course={{id:"network-test",sessionId:role,name:`真实 RTC 验证 · ${role}`,startTime:null,endTime:null}}
      runtime={{status:"live",startedAt:null,graceEndsAt:null}} now={stats ? Date.parse(stats.at) : 0} roleName={role} memberCount={media.participants.length} recording={false}
      canStart={false} canEnd={false} canExtend={false} busy={false} connectionState={media.connectionState} presenceHealthy status={null} settings={null} actions={[]}
      onFullscreen={noop} onBack={noop} onStart={noop} onEnd={noop} onExtended={noop} onRestarted={noop}
      network={<ClassroomNetworkStatus media={media} sessionId={`real-network-${role}`}/>}/>
    <section style={{maxWidth:1200,margin:"0 auto",padding:24}}>
      <h1 style={{fontSize:22,fontWeight:600}}>教师 / 学生独立订阅验证</h1>
      <p>真实 Agora SDK 与课堂媒体代码；画面、音频为合成内容。当前角色：<strong>{role}</strong></p>
      <p role="status">{status}</p>
      <div style={{display:"flex",flexWrap:"wrap",gap:12,margin:"16px 0"}}>
        <button onClick={join} disabled={media.connectionState!=="idle"}>加入测试频道</button>
        {role === "teacher" && <><button onClick={()=>provider.startScreenShare()}>开始合成共享</button><button onClick={()=>provider.stopScreenShare()}>停止合成共享</button></>}
        <button onClick={()=>{forcedQuality=null;setNotice("使用 SDK 实测质量，可用 DevTools 仿真网络");}}>使用真实网络质量</button>
        <button onClick={()=>{window.classroomNetworkTest.setQuality(1,4);setNotice("注入不稳定下行，真实媒体订阅按课堂策略切换");}}>策略测试：弱下行</button>
        <button onClick={()=>{window.classroomNetworkTest.setQuality(1,5);setNotice("注入严重弱下行");}}>策略测试：极弱下行</button>
        <button onClick={()=>{window.classroomNetworkTest.setQuality(5,1);setNotice("注入严重弱上行");}}>策略测试：极弱上行</button>
        <button onClick={()=>{window.classroomNetworkTest.setQuality(1,1);setNotice("注入稳定网络，等待连续 20 秒恢复");}}>策略测试：稳定恢复</button>
        <button onClick={async()=>{await provider.disconnect();captures.forEach(c=>c.dispose());setStatus("已离开测试频道");}}>离开测试频道</button>
        <button onClick={async()=>setNotice(await saveEvidence()?"证据已保存":"保存失败")}>保存验证证据</button>
      </div>
      <p>{notice}</p>
      <p>原始网络评分：<strong>{rawQuality ? `${rawQuality.uplinkNetworkQuality} / ${rawQuality.downlinkNetworkQuality}` : "等待采样"}</strong> · 应用策略：<strong>{media.network.publishMode || "normal"} / {media.network.receiveMode || "normal"}</strong></p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:16,margin:"20px 0"}}>{media.participants.filter(p=>p.hasVideo).map(p=><VideoTile key={p.id} participant={p}/>)}</div>
      <table style={{width:"100%",textAlign:"left",margin:"20px 0"}}><thead><tr><th>接收 UID</th><th>实际分辨率</th><th>接收码率</th><th>帧率</th></tr></thead>
        <tbody>{videoRows.map(([uid,v])=><tr key={uid}><td>{uid}</td><td>{v.receiveResolutionWidth} × {v.receiveResolutionHeight}</td><td>{v.receiveBitrate} bps</td><td>{v.receiveFrameRate}</td></tr>)}</tbody></table>
      <p>音频接收：{audioRows.map(([uid,a])=>`${uid}：${a.receiveBitrate} bps；累计卡顿 ${a.totalFreezeTime}s；接收时长 ${a.totalDuration}s`).join(" / ") || "等待音频"}</p>
      <details open><summary>脱敏 RTC 统计（不含令牌）</summary><pre id="evidence" style={{fontSize:12,whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{JSON.stringify(stats,null,2)}</pre></details>
    </section>
    <style>{`section>div>button{padding:10px 14px;border:1px solid #94a3b8;border-radius:8px;background:white;color:#172334}section>div>button:disabled{opacity:.5}th,td{padding:8px;border-bottom:1px solid #cbd5e1}`}</style>
  </main>;
}
document.cookie="NEXT_LOCALE=zh-CN;path=/";localStorage.setItem("locale","zh-CN");
createRoot(document.getElementById("root")).render(<I18nProvider initialLocale="zh-CN"><Fixture/></I18nProvider>);
