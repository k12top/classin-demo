"use client";
import {FileText,ArrowUpRight} from 'lucide-react';
import type {WorkspaceSearchFile} from './use-workspace-file-search';
import {workspaceSearchCopy} from './workspace-search-copy';
import styles from './workspace.module.css';
export function WorkspaceFileSearchResults({files,loading,error,hasMore,retry,locale,onSelect}:{files:WorkspaceSearchFile[];loading:boolean;error:boolean;hasMore:boolean;retry:()=>void;locale:string;onSelect:(file:WorkspaceSearchFile)=>void}){
 const copy=workspaceSearchCopy(locale);
 return <section className={styles.fileSearchResults} aria-label={copy.files}>
 {loading&&<p role="status">{copy.searchingFiles}</p>}
 {error&&<p role="alert">{copy.fileError} <button type="button" onClick={retry}>{copy.retry}</button></p>}
 {files.length>0&&<><h3>{copy.files}</h3>{files.map(file=><button type="button" data-search-result key={file.id} onClick={()=>onSelect(file)}><FileText size={16} aria-hidden="true"/><span>{file.name}</span><ArrowUpRight size={14} aria-hidden="true"/></button>)}</>}
 {hasMore&&<p>{copy.moreFiles}</p>}
 </section>;
}
