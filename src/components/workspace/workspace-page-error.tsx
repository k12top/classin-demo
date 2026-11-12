"use client";
import { AlertCircle, ArrowLeft, RotateCw } from "lucide-react";
import styles from "./workspace-page-error.module.css";

/** Compact error state used inside the shared desktop and web workspace shell. */
export function WorkspacePageError({title,description,backLabel,retryLabel,onBack,onRetry}:{title:string;description?:string;backLabel:string;retryLabel?:string;onBack:()=>void;onRetry?:()=>void}){
 return <div className={styles.page}><section className={styles.panel} role="alert"><span className={styles.icon}><AlertCircle size={20} aria-hidden="true"/></span><h1>{title}</h1>{description&&<p>{description}</p>}<div className={styles.actions}>{onRetry&&<button type="button" className={styles.primary} onClick={onRetry}><RotateCw size={14} aria-hidden="true"/>{retryLabel}</button>}<button type="button" className={styles.secondary} onClick={onBack}><ArrowLeft size={14} aria-hidden="true"/>{backLabel}</button></div></section></div>;
}
