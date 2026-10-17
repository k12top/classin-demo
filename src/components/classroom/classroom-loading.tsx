"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, BookOpen, Check, LoaderCircle, Mic, MonitorPlay, RefreshCw, UserRound } from "lucide-react";
import { SiteLogo } from "@/components/SiteLogo";
import { useTranslation } from "@/lib/i18n/context";
import styles from "./classroom-loading.module.css";

export type ClassroomEntryPhase = "identity" | "session" | "media";
const phases: ClassroomEntryPhase[] = ["identity", "session", "media"];

function subscribeVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}
function pageIsVisible() { return !document.hidden; }
function serverIsVisible() { return true; }

function EntryScene({ phase }: { phase: ClassroomEntryPhase }) {
  const SceneIcon = phase === "identity" ? UserRound : phase === "session" ? BookOpen : MonitorPlay;
  return (
    <div className={styles.scene} data-entry-scene aria-hidden="true">
      <svg className={styles.connections} viewBox="0 0 400 320" fill="none">
        <path className={styles.connectionTrack} d="M68 143C28 70 111 7 188 48" />
        <path className={styles.connectionTrack} d="M337 103C393 156 346 224 282 238" />
        <path className={styles.signal} pathLength="100" d="M68 143C28 70 111 7 188 48" />
        <path className={`${styles.signal} ${styles.signalSecond}`} pathLength="100" d="M337 103C393 156 346 224 282 238" />
      </svg>
      <div className={styles.screen}>
        <div className={styles.screenTop}><span /><span /><span /><i /></div>
        <div className={styles.screenBody}>
          <div className={styles.lesson}>
            <SceneIcon className={styles.lessonIcon} strokeWidth={1.5} />
            <div className={styles.lessonLines}><span /><span /></div>
          </div>
          <div className={styles.screenSeats}>
            <span><UserRound strokeWidth={1.6} /></span>
            <span><UserRound strokeWidth={1.6} /></span>
          </div>
        </div>
        <div className={styles.screenBottom}>
          <span /><span /><span className={styles.screenMic}><Mic /></span><span /><span />
        </div>
      </div>
      <div className={`${styles.participant} ${styles.participantLeft}`}>
        <div className={styles.participantAvatar}><UserRound strokeWidth={1.5} /></div>
        <div className={styles.participantCaption}><span /><Mic /></div>
      </div>
      <div className={`${styles.participant} ${styles.participantRight}`}>
        <div className={styles.participantAvatar}><UserRound strokeWidth={1.5} /></div>
        <div className={styles.participantCaption}><span /><Mic /></div>
      </div>
      <Image className={styles.book} src="/classroom/entry-book-v2.webp" width={680} height={302} alt="" loading="eager" unoptimized />
    </div>
  );
}

export function ClassroomLoading({
  recorder = false,
  message,
  phase = "identity",
  courseName,
  errorMessage,
  onRetry,
  onBack,
}: {
  recorder?: boolean;
  message?: string;
  phase?: ClassroomEntryPhase;
  courseName?: string;
  errorMessage?: string;
  onRetry?: () => void;
  onBack?: () => void;
}) {
  const { t } = useTranslation();
  const visible = useSyncExternalStore(subscribeVisibility, pageIsVisible, serverIsVisible);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (recorder || errorMessage) return;
    const timer = window.setTimeout(() => setSlow(true), 12_000);
    return () => window.clearTimeout(timer);
  }, [recorder, errorMessage]);
  const current = phases.indexOf(phase);
  const labels = {
    identity: t("classroom.v3.entryIdentity"),
    session: t("classroom.v3.entrySession"),
    media: t("classroom.v3.entryMedia"),
  };
  const descriptions = {
    identity: t("classroom.v3.entryIdentityDescription"),
    session: t("classroom.v3.entrySessionDescription"),
    media: t("classroom.v3.entryMediaDescription"),
  };

  return (
    <main className={styles.shell} data-entry-phase={phase} data-entry-slow={slow} data-entry-active={visible && !errorMessage} data-entry-error={Boolean(errorMessage)}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <SiteLogo decorative className={styles.logo} />
          <span>{t("classroom.v3.loadingBrand")}</span>
        </div>
        {!recorder && (onBack ? (
          <button className={styles.back} type="button" onClick={onBack}><ArrowLeft aria-hidden="true" />{t("classroom.v3.entryBack")}</button>
        ) : (
          <Link className={styles.back} href="/?view=courses"><ArrowLeft aria-hidden="true" />{t("classroom.v3.entryBack")}</Link>
        ))}
      </header>
      <div className={styles.mainArea}>
      <section className={styles.content} aria-labelledby="classroom-entry-title">
        <EntryScene phase={phase} />
        <div className={styles.details}>
        <h1 id="classroom-entry-title">{errorMessage ? t("classroom.v3.cannotEnter") : courseName || t(recorder ? "classroom.v3.preparingRecorder" : "classroom.v3.entering")}</h1>
        {courseName && errorMessage ? <p className={styles.course}>{courseName}</p> : null}
        {errorMessage ? <p className={styles.error} role="alert">{errorMessage}</p> : (
          <>
            <p className={styles.description} role="status">{message || descriptions[phase]}</p>
            <ol className={styles.steps} aria-label={t("classroom.v3.entryProgress")}>
              {phases.map((item, index) => (
                <li key={item} data-state={index < current ? "complete" : index === current ? "current" : "pending"} aria-current={index === current ? "step" : undefined}>
                  <span className={styles.stepMark} aria-hidden="true">
                    {index < current ? <Check /> : index === current ? <LoaderCircle className={styles.spinner} /> : <span />}
                  </span>
                  <span>{labels[item]}</span>
                </li>
              ))}
            </ol>
          </>
        )}
        {!recorder && (slow || errorMessage) ? (
          <div className={styles.recovery}>
            {!errorMessage ? <p>{t("classroom.v3.entrySlow")}</p> : null}
            <div className={styles.actions}>
              {onRetry ? <button type="button" className={styles.retry} onClick={onRetry}><RefreshCw aria-hidden="true" />{t("classroom.v3.entryRetry")}</button> : null}
              {onBack ? <button type="button" className={styles.return} onClick={onBack}>{t("classroom.v3.entryBack")}</button> : null}
            </div>
          </div>
        ) : <p className={styles.wait}>{t("classroom.v3.entryWait")}</p>}
        </div>
      </section>
      </div>
    </main>
  );
}
