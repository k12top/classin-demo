"use client";
import {useEffect,useState} from "react";
import {useTranslation} from "@/lib/i18n/context";
import {WorkspacePdfPreview} from "./workspace-pdf-preview";
import {workspacePreviewKind} from "@/lib/workspace-preview-kind";
import {readWorkspaceTextPreview} from "@/lib/workspace-text-preview";
import {courseWorkspaceText as text} from "./course-workspace-copy";
import styles from "./workspace-file-preview.module.css";

/** Keep active document formats sandboxed while media uses native seek controls. */
export function WorkspaceFilePreview({name,src,className}:{name:string;src:string;className?:string}){
 const kind=workspacePreviewKind(name);
 if (kind==="pdf") return <WorkspacePdfPreview name={name} src={src}/>;
 if (kind==="text") return <TextPreview key={src} src={src}/>;
 if (kind==="video"||kind==="audio"||kind==="image") return <MediaPreview key={`${kind}:${src}`} name={name} src={src} kind={kind} className={className}/>;
 return <iframe className={className} title={name} sandbox="" src={src}/>;
}

function TextPreview({src}:{src:string}){
 const {locale}=useTranslation(),[attempt,setAttempt]=useState(0),[result,setResult]=useState<{text:string;truncated:boolean}|null>(null),[failed,setFailed]=useState(false);
 useEffect(()=>{const controller=new AbortController();let active=true;const timer=setTimeout(()=>controller.abort(),30_000);
  void (async()=>{try{const response=await fetch(src,{signal:controller.signal,cache:"no-store"}),preview=await readWorkspaceTextPreview(response);if(active)setResult(preview);
  }catch{if(active)setFailed(true);}finally{clearTimeout(timer);}})();return()=>{active=false;clearTimeout(timer);controller.abort();};
 },[src,attempt]);
 if(failed)return <div className={styles.error} role="alert"><p>{text(locale,"预览加载失败，请检查网络后重试。","Preview could not load. Check your connection and try again.")}</p><button type="button" onClick={()=>{setFailed(false);setResult(null);setAttempt(value=>value+1);}}>{text(locale,"重试","Retry")}</button></div>;
 if(!result)return <p role="status">{text(locale,"正在加载预览…","Loading preview…")}</p>;
 return <div className={styles.textPreview}>{result.truncated&&<p role="status">{text(locale,"仅显示前 256 KB，请下载查看完整文件。","Showing the first 256 KB. Download to view the complete file.")}</p>}<pre>{result.text}</pre></div>;
}

function MediaPreview({name,src,kind,className}:{name:string;src:string;kind:"video"|"audio"|"image";className?:string}){
 const {locale}=useTranslation();
 const [failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
 if(failed)return <div className={styles.error} role="alert"><p>{text(locale,"预览加载失败，请检查网络后重试。","Preview could not load. Check your connection and try again.")}</p><button type="button" onClick={()=>{setFailed(false);setAttempt(value=>value+1);}}>{text(locale,"重试","Retry")}</button></div>;
 if(kind==="video")return <video key={attempt} className={className} controls preload="metadata" src={src} aria-label={name} onError={()=>setFailed(true)}/>;
 if(kind==="audio")return <audio key={attempt} className={className} controls preload="metadata" src={src} aria-label={name} onError={()=>setFailed(true)}/>;
 // Unoptimized authenticated bytes are served by our own no-store endpoint.
 // eslint-disable-next-line @next/next/no-img-element
 return <img key={attempt} className={`${styles.image} ${className||""}`} src={src} alt={name} onError={()=>setFailed(true)}/>;
}
