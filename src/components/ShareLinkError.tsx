import Link from "next/link";
import {AlertCircle,ArrowLeft,BookOpen,CalendarX} from "lucide-react";
import styles from "./access-denied.module.css";

type Props={title:string;message:string;hint:string;backLabel:string;linkLabel:string;courseName?:string;detailHref?:string;detailLabel?:string;tone?:"warning"|"neutral"};
/** Server-rendered link state shares the compact classroom access layout. */
export function ShareLinkError({title,message,hint,backLabel,linkLabel,courseName,detailHref,detailLabel,tone="warning"}:Props){
 const Icon=tone==="warning"?CalendarX:AlertCircle;
 return <div className={styles.page} data-workspace-shell><header className={styles.header} data-workspace-header data-access-header><div data-workspace-header-actions><Link href="/" className={styles.back}><ArrowLeft size={16} aria-hidden="true"/><span>{backLabel}</span></Link></div><span className={styles.brand}>{linkLabel}</span></header><main className={styles.main}><section className={styles.panel} aria-labelledby="share-error-title"><span className={`${styles.icon} ${tone==="warning"?styles.warningIcon:""}`}><Icon aria-hidden="true"/></span><p className={styles.course}>{title}</p><h1 id="share-error-title">{message}</h1>{courseName&&<p className={styles.description}>{courseName}</p>}<div className={styles.hint}>{hint}</div><div className={styles.actions}><Link href="/" className={styles.primary}><ArrowLeft size={14} aria-hidden="true"/>{backLabel}</Link>{detailHref&&detailLabel&&<Link href={detailHref} className={styles.secondary}><BookOpen size={14} aria-hidden="true"/>{detailLabel}</Link>}</div></section></main></div>;
}
