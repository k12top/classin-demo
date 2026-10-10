"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, MessageCircle, Minimize2, Send, Square, RotateCcw, Trash2 } from "lucide-react";
import { ClassroomMemberAvatar } from "@/components/classroom/member-avatar";
import { useTranslation } from "@/lib/i18n/context";
import { ASSISTANT_HISTORY_LIMIT, ASSISTANT_QUESTION_LIMIT, type ClassroomAssistantMessage } from "@/lib/classroom/assistant";
import styles from "./teacher-assistant.module.css";

export function TeacherAssistant({ sessionId, teacher, shareAccess }: {
  sessionId: string; teacher: { name: string; avatar: string }; shareAccess: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [messages, setMessages] = useState<ClassroomAssistantMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const activeRequest = useRef<AbortController | null>(null);
  const panelOpen = useRef(false);
  const widget = useRef<HTMLElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const conversation = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const label = (key: string) => t(`classroom.assistant.${key}`);

  useEffect(() => () => { panelOpen.current = false; activeRequest.current?.abort(); activeRequest.current = null; }, []);
  useEffect(() => { conversation.current?.scrollTo({ top: conversation.current.scrollHeight }); }, [messages, question, busy, error, open]);
  useEffect(() => {
    if (!open || !conversation.current) return;
    const element = conversation.current;
    const observer = new ResizeObserver(() => element.scrollTo({ top: element.scrollHeight }));
    observer.observe(element);
    return () => observer.disconnect();
  }, [open]);

  const focusComposer = () => requestAnimationFrame(() => {
    if (panelOpen.current && (document.activeElement === document.body || widget.current?.contains(document.activeElement))) input.current?.focus();
  });
  const expand = () => { panelOpen.current = true; setMinimized(false); setOpen(true); focusComposer(); };
  const collapse = () => { panelOpen.current = false; setOpen(false); requestAnimationFrame(() => launcher.current?.focus()); };
  const stop = () => {
    activeRequest.current?.abort(); activeRequest.current = null;
    setBusy(false); setError("stopped");
    focusComposer();
  };
  const send = async (content: string) => {
    if (activeRequest.current || !content.trim()) return;
    const controller = new AbortController(); activeRequest.current = controller;
    setQuestion(content.trim()); setDraft(""); setError(""); setBusy(true);
    const timeout = setTimeout(() => controller.abort(), 55_000);
    try {
      const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/classroom/assistant`, {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ question: content.trim(), shareAccess,
          history: messages.slice(-ASSISTANT_HISTORY_LIMIT).map((message) => ({ ...message, content: message.content.slice(0, message.role === "user" ? ASSISTANT_QUESTION_LIMIT : 4_000) })),
        }),
      });
      const result = await response.json();
      if (activeRequest.current !== controller) return;
      if (!response.ok) {
        const codes = ["unavailable", "timeout", "rate_limited", "unauthorized", "course_finished", "course_cancelled", "not_enrolled", "forbidden"];
        setError(codes.includes(result.code) ? result.code : "failed"); return;
      }
      if (result.sessionId !== sessionId || typeof result.answer !== "string" || !result.answer.trim()) throw new Error("Invalid answer");
      setMessages((previous) => [...previous, { role: "user" as const, content: content.trim() }, { role: "assistant" as const, content: result.answer }].slice(-ASSISTANT_HISTORY_LIMIT));
      setQuestion("");
    } catch {
      if (activeRequest.current === controller) setError(controller.signal.aborted ? "timeout" : "failed");
    } finally {
      clearTimeout(timeout);
      if (activeRequest.current === controller) { activeRequest.current = null; setBusy(false); focusComposer(); }
    }
  };
  const preview = messages.at(-1)?.content || label("prompt");

  return (
    <section ref={widget} className={`${styles.widget} ${minimized ? styles.minimized : ""}`} aria-label={label("title")}>
      {open && (
        <section id={panelId} className={styles.panel} aria-labelledby={`${panelId}-heading`}
          onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); collapse(); } }}>
          <header className={styles.panelHeader}>
            <div><h2 id={`${panelId}-heading`}>{label("title")} · {teacher.name}</h2><span>{label("private")}</span></div>
            <button type="button" onClick={() => { setMessages([]); setQuestion(""); setError(""); }} disabled={busy || (!messages.length && !question)} title={label("clear")} aria-label={label("clear")}><Trash2 /></button>
            <button type="button" onClick={collapse} title={label("collapse")} aria-label={label("collapse")}><ChevronDown /></button>
          </header>
          <div ref={conversation} className={styles.conversation} role="log" aria-live="polite" aria-relevant="additions text">
            {!messages.length && !question && <div className={styles.empty}>
              <p>{label("welcome")}</p>
              <p className={styles.hint}>{label("context")}</p>
              {["suggestExplain", "suggestExample"].map((key) => <button type="button" key={key} onClick={() => void send(label(key))}>{label(key)}</button>)}
            </div>}
            {messages.map((message, index) => <div key={index} className={`${styles.message} ${message.role === "user" ? styles.user : styles.answer}`}>
              <span>{message.role === "user" ? label("you") : `${teacher.name} · AI`}</span><p>{message.content}</p>
            </div>)}
            {question && <div className={`${styles.message} ${styles.user}`}><span>{label("you")}</span><p>{question}</p></div>}
            {busy && <p className={styles.status}><Loader2 className={styles.spinner} aria-hidden="true" />{label("thinking")}</p>}
            {error && <div className={styles.error} role="alert"><p>{label(`errors.${error}`)}</p>
              <button type="button" onClick={() => void send(question)}><RotateCcw />{label("retry")}</button>
              <button type="button" onClick={() => { setDraft(question); setQuestion(""); setError(""); input.current?.focus(); }}>{label("edit")}</button>
            </div>}
          </div>
          <form className={styles.composer} onSubmit={(event) => { event.preventDefault(); void send(draft); }}>
            <label className="sr-only" htmlFor={`${panelId}-input`}>{label("input")}</label>
            <textarea ref={input} id={`${panelId}-input`} value={draft} rows={2} maxLength={ASSISTANT_QUESTION_LIMIT}
              placeholder={label("placeholder")} disabled={busy} onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); void send(draft); } }} />
            {busy ? <button type="button" onClick={stop} aria-label={label("stop")} title={label("stop")}><Square /></button>
              : <button type="submit" disabled={!draft.trim()} aria-label={label("send")} title={label("send")}><Send /></button>}
          </form>
          <p className={styles.disclaimer}>{label("disclaimer")}</p>
        </section>
      )}
      <div className={styles.dock}>
        <button ref={launcher} type="button" className={styles.identity} onClick={open ? collapse : expand} aria-expanded={open} aria-controls={panelId} aria-label={`${teacher.name} · ${label("title")}`}>
          <ClassroomMemberAvatar avatar={teacher.avatar} name={teacher.name} />
          {!minimized && <div><span className={styles.name}>{teacher.name}<span className={styles.badge}>AI</span></span><span className={styles.preview}>{preview}</span></div>}
        </button>
        {!minimized && <>
          <button type="button" onClick={open ? collapse : expand} aria-expanded={open} aria-controls={panelId} aria-label={open ? label("collapse") : label("expand")} title={open ? label("collapse") : label("expand")}>{open ? <ChevronDown /> : <ChevronUp />}</button>
          <button type="button" onClick={() => { panelOpen.current = false; setOpen(false); setMinimized(true); requestAnimationFrame(() => launcher.current?.focus()); }} aria-label={label("minimize")} title={label("minimize")}><Minimize2 /></button>
        </>}
        {minimized && <MessageCircle className={styles.miniBadge} aria-hidden="true" />}
      </div>
    </section>
  );
}
