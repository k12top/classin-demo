"use client";
import {useEffect,useRef,useState} from "react";
import {workspaceRequest} from "@/lib/workspace-client";
import {replayReviewCopy} from "@/lib/replay-review-copy";
import styles from "./replay-student-preview.module.css";

type Student={userId:string;displayName:string};
export function ReplayStudentPreview({sessionId,locale,selected,onChange,onOpenChange}:{sessionId:string;locale:string;selected:string;onChange:(studentId:string)=>void;onOpenChange:(open:boolean)=>void}){
 const copy=replayReviewCopy(locale);
 const [open,setOpen]=useState(false),[students,setStudents]=useState<Student[]|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(false);
 const controller=useRef<AbortController|null>(null);
 useEffect(()=>()=>controller.current?.abort(),[]);
 const load=async()=>{controller.current?.abort();const current=new AbortController();controller.current=current;setBusy(true);setError(false);try{const data=await workspaceRequest<{students:Student[]}>(`/api/sessions/${encodeURIComponent(sessionId)}/replay-preview`,{signal:current.signal});if(!current.signal.aborted)setStudents(data.students);}catch(failure){if(!current.signal.aborted){const status=(failure as {status?:number})?.status;if(status===401||status===403||status===404){setStudents(null);onChange("");}setError(true);}}finally{if(!current.signal.aborted)setBusy(false);}};
 if(!open)return <button type="button" className={styles.trigger} onClick={()=>{onOpenChange(true);setOpen(true);void load();}}>{copy.preview}</button>;
 return <div className={styles.controls}>
  <label>{copy.studentView}<select value={selected} disabled={busy||!students?.length} onChange={event=>onChange(event.target.value)}><option value="">{copy.chooseStudent}</option>{students?.map(student=><option key={student.userId} value={student.userId}>{student.displayName}</option>)}</select></label>
  <button type="button" onClick={()=>{onChange("");onOpenChange(false);setOpen(false);controller.current?.abort();}}>{copy.backToTeacher}</button>
  {busy&&<p role="status">{copy.loadingStudents}</p>}
  {error&&<p role="alert">{copy.studentsFailed} <button type="button" onClick={()=>void load()}>{copy.retry}</button></p>}
  {!busy&&!error&&students&&!students.length&&<p>{copy.noStudents}</p>}
  {selected&&<p>{copy.previewHint}</p>}
 </div>;
}
