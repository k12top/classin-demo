"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, KeyboardEvent, ClipboardEvent, useState } from "react";
import { ArrowLeft, Key, Loader2 } from "lucide-react";
import {useTranslation} from "@/lib/i18n/context";
import styles from "@/components/workspace/passcode-gate.module.css";
import accessStyles from "@/components/access-denied.module.css";

type JoinLinkPasscodeGateProps = {
  token: string;
  purpose: "course" | "live";
  title: string;
  description: string;
  linkLabel: string;
  buttonLabel: string;
  backLabel: string;
  errorFallback: string;
  courseName?: string;
  teacherName?: string;
  parentOrigin?: string;
  embed?: boolean;
  lang?: string;
};

export default function JoinLinkPasscodeGate({
  token,
  purpose,
  title,
  description,
  linkLabel,
  buttonLabel,
  backLabel,
  errorFallback,
  courseName,
  teacherName,
  embed,
  lang,
  parentOrigin,
}: JoinLinkPasscodeGateProps) {
  const router = useRouter();
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const {locale}=useTranslation();
  const activeLocale=lang||locale;

  const handleDigitChange = (index: number, value: string) => {
    const cleanValue = value.replace(/\D/g, "");
    const nextDigits = [...digits];
    nextDigits[index] = cleanValue ? cleanValue.slice(-1) : "";
    setDigits(nextDigits);
    setError("");

    if (cleanValue && index < 5) {
      document.getElementById(`join-link-digit-${index + 1}`)?.focus();
    }
  };

  const handleKeyDown = (
    index: number,
    event: KeyboardEvent<HTMLInputElement>
  ) => {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      const nextDigits = [...digits];
      nextDigits[index - 1] = "";
      setDigits(nextDigits);
      document.getElementById(`join-link-digit-${index - 1}`)?.focus();
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const pasted = event.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);
    if (!pasted) return;

    const nextDigits = Array(6).fill("");
    for (let index = 0; index < pasted.length; index += 1) {
      nextDigits[index] = pasted[index] || "";
    }
    setDigits(nextDigits);
    setError("");
    document
      .getElementById(`join-link-digit-${Math.min(pasted.length, 5)}`)
      ?.focus();
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if(submitting)return;
    const passcode = digits.join("");
    if (passcode.length !== 6) {
      setError(errorFallback);
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(
        `/api/join-links/${encodeURIComponent(token)}/verify-passcode`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ purpose, passcode, embed, lang, parentOrigin }),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(typeof data.error === "string" ? data.error : errorFallback);
        return;
      }
      if(typeof data.redirectTo!=="string")throw new Error("Invalid redirect");
      const target=new URL(data.redirectTo,window.location.origin);
      if(target.origin!==window.location.origin)throw new Error("Invalid redirect");
      router.replace(target.pathname+target.search+target.hash);
    } catch {
      setError(errorFallback);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={accessStyles.page} data-workspace-shell>
      <header className={accessStyles.header} data-workspace-header data-access-header><div data-workspace-header-actions><Link href="/" className={accessStyles.back}><ArrowLeft size={16} aria-hidden="true"/><span>{backLabel}</span></Link></div><span className={accessStyles.brand}>{linkLabel}</span></header>
    <main className={`${styles.page} ${styles.linkMain}`}>
      <section className={styles.panel} aria-labelledby="join-link-title">
        <span className={styles.icon}><Key size={20} aria-hidden="true"/></span>
        <h1 id="join-link-title">{title}</h1>
        <p className={styles.description}>{description}</p>
        {courseName&&<div className={styles.course}><strong>{courseName}</strong>{teacherName&&<span>{teacherName}</span>}</div>}
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.digits}>
            {digits.map((digit,index)=><input key={index} id={`join-link-digit-${index}`} type="text" inputMode="numeric" pattern="[0-9]*" maxLength={1} value={digit}
              aria-label={`${activeLocale==="zh-TW"?"密碼第":activeLocale.startsWith("zh")?"密码第":activeLocale.startsWith("vi")?"Chữ số mật mã":"Passcode digit"} ${index+1}${activeLocale.startsWith("zh")?"位":""}`}
              aria-invalid={Boolean(error)} disabled={submitting} onChange={event=>handleDigitChange(index,event.target.value)} onKeyDown={event=>handleKeyDown(index,event)} onPaste={handlePaste} autoFocus={index===0}/>)}
          </div>
          {error&&<p role="alert" className={styles.error}>{error}</p>}
          <button type="submit" disabled={submitting||digits.some(digit=>!digit)} className={styles.submit}>{submitting&&<Loader2 size={14} className="animate-spin" aria-hidden="true"/>}{buttonLabel}</button>
        </form>
        <Link href="/" className={styles.back}><ArrowLeft size={14} aria-hidden="true"/>{backLabel}</Link>
      </section>
    </main></div>
  );
}
