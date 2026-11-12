"use client";

import {useEffect,useRef,useState} from "react";
import type {PDFDocumentProxy,RenderTask,TextLayer} from "pdfjs-dist";
import {useTranslation} from "@/lib/i18n/context";
import {courseWorkspaceText as text} from "./course-workspace-copy";
import styles from "./workspace-pdf-preview.module.css";

export function WorkspacePdfPreview({src,name}:{src:string;name:string}){
 const [attempt,setAttempt]=useState(0);
 return <PdfViewer key={`${src}:${attempt}`} src={src} name={name} onRetry={()=>setAttempt(value=>value+1)}/>;
}
function PdfViewer({src,name,onRetry}:{src:string;name:string;onRetry:()=>void}){
 const {locale}=useTranslation();
 const [document,setDocument]=useState<PDFDocumentProxy|null>(null),[page,setPage]=useState(1),[error,setError]=useState(false),[pageBusy,setPageBusy]=useState(true),[width,setWidth]=useState(0);
 const canvas=useRef<HTMLCanvasElement>(null),container=useRef<HTMLDivElement>(null),paper=useRef<HTMLDivElement>(null),textLayer=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const element=container.current;if(!element)return;
  let lastWidth=0;
  const measure=()=>{const next=Math.max(0,element.clientWidth-32);if(next!==lastWidth){lastWidth=next;if(next>0){setPageBusy(true);setWidth(next);}}};
  measure();
  if(typeof ResizeObserver==="undefined"){window.addEventListener("resize",measure);return()=>window.removeEventListener("resize",measure);}
  const observer=new ResizeObserver(measure);observer.observe(element);return()=>observer.disconnect();
 },[]);
 useEffect(()=>{
  let active=true,task:import("pdfjs-dist").PDFDocumentLoadingTask|undefined;
  void (async()=>{try{
   const pdf=await import("pdfjs-dist/legacy/build/pdf.mjs");if(!active)return;
   pdf.GlobalWorkerOptions.workerSrc=new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs",import.meta.url).toString();
   task=pdf.getDocument({url:src,enableXfa:false});
   const result=await task.promise;if(active)setDocument(result);
  }catch{if(active)setError(true);}})();
  return()=>{active=false;if(task)void task.destroy();};
 },[src]);
 useEffect(()=>{
  if(!document||!width)return;
  let active=true,rendering:RenderTask|undefined,textRendering:TextLayer|undefined;
  void (async()=>{try{
   const [pdfPage,pdf]=await Promise.all([document.getPage(page),import("pdfjs-dist/legacy/build/pdf.mjs")]);if(!active||!canvas.current||!container.current||!paper.current||!textLayer.current)return;
   const base=pdfPage.getViewport({scale:1});
   const viewport=pdfPage.getViewport({scale:Math.min(1.5,width/base.width)}),ratio=Math.min(window.devicePixelRatio||1,2),target=canvas.current;
   target.width=Math.floor(viewport.width*ratio);target.height=Math.floor(viewport.height*ratio);
   target.style.width=`${Math.floor(viewport.width)}px`;target.style.height=`${Math.floor(viewport.height)}px`;
   paper.current.style.width=target.style.width;paper.current.style.height=target.style.height;
   textLayer.current.replaceChildren();textLayer.current.style.setProperty("--total-scale-factor",String(viewport.scale));
   textRendering=new pdf.TextLayer({textContentSource:pdfPage.streamTextContent(),container:textLayer.current,viewport});
   rendering=pdfPage.render({canvas:target,viewport,transform:ratio===1?undefined:[ratio,0,0,ratio,0,0],annotationMode:0});
   await Promise.all([rendering.promise,textRendering.render()]);if(active)setPageBusy(false);
  }catch{if(active){setError(true);setPageBusy(false);}}})();
  return()=>{active=false;rendering?.cancel();textRendering?.cancel();};
 },[document,page,width]);
 return <div className={styles.viewer} data-pdf-viewer><div className={styles.pages} ref={container}>
  {error?<div className={styles.error} role="alert"><p>{text(locale,"PDF 无法预览，请检查网络后重试，或下载查看。","Unable to preview this PDF. Check your connection and retry, or download it.")}</p><button type="button" onClick={onRetry}>{text(locale,"重试","Retry")}</button></div>:<><div className={styles.paper} ref={paper}><canvas key={`canvas:${page}:${width}`} ref={canvas} aria-hidden="true"/><div key={`text:${page}:${width}`} className={styles.textLayer} ref={textLayer} role="document" aria-label={`${name} ${text(locale,"第 {page} 页","Page {page}").replace("{page}",String(page))}`}/></div>{!document&&<p role="status">{text(locale,"正在加载 PDF…","Loading PDF…")}</p>}</>}
 </div><div className={styles.toolbar}><button type="button" disabled={!document||pageBusy||page<=1} onClick={()=>{setPageBusy(true);setPage(value=>value-1);}}>{text(locale,"上一页","Previous page")}</button><span>{page} / {document?.numPages||"—"}</span><button type="button" disabled={!document||pageBusy||page>=document.numPages} onClick={()=>{setPageBusy(true);setPage(value=>value+1);}}>{text(locale,"下一页","Next page")}</button></div></div>;
}
