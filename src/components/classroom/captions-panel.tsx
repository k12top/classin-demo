"use client";
import { ClassroomIconButton } from "./icon-button";
import { useEffect, useId, useRef, useState } from "react";
import { AlertCircle, Captions, Check, ChevronDown, ChevronUp, Headphones, Loader2, Settings2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n/context";
import { CaptionSelect } from "@/components/classroom/caption-select";
import { CaptionAppearanceControls } from "./caption-appearance-controls";
import { captionLanguageSelectOptions, classroomLanguageLabel } from "@/lib/classroom/languages";
import { supportedCaptionTranslationCodes } from "@/lib/classroom/translation-capabilities";
import { captionTranslation } from "@/lib/classroom/caption-display";
import type { CaptionDisplayMode } from "@/lib/classroom/caption-preferences";
import type { ClassroomAction, ClassroomRuntimeSnapshot, ClassroomCaptionSnapshot } from "@/lib/classroom/types";

export type CaptionSettings = {
  displayMode: CaptionDisplayMode;
  preferredLanguage: string;
  overlayVisible: boolean;
  interpretation?: Extract<ClassroomAction, { type: "setInterpretation" }>;
};

function CaptionQuickToggle({ label, hint, pressed, disabled, onClick, children }: {
  label: string; hint: string; pressed: boolean; disabled: boolean; onClick: () => void; children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const tooltipId = useId();
  const [showHint, setShowHint] = useState(false);
  return <div className="classroom-v3-caption-quick-toggle" onMouseEnter={() => setShowHint(true)} onMouseLeave={() => setShowHint(false)}>
    <ClassroomIconButton type="button" aria-label={label} aria-pressed={pressed} aria-describedby={showHint ? tooltipId : undefined}
      disabled={disabled} onClick={onClick} onFocus={() => setShowHint(true)} onBlur={() => setShowHint(false)}
      onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); setShowHint(false); } }}>
      {children}<span className="classroom-v3-caption-toggle-state" aria-hidden="true">{pressed && <Check />}</span>
    </ClassroomIconButton>
    {showHint && <div id={tooltipId} role="tooltip"><strong>{label}<small>{t(pressed ? "classroom.v3.enabled" : "classroom.v3.disabled")}</small></strong><p>{hint}</p></div>}
  </div>;
}

export function CaptionsPanel({
  busy,
  preferenceBusy,
  preferenceError,
  onRetryPreference,
  runtime,
  captions,
  availability,
  canManage,
  displayMode,
  overlayVisible,
  preferredLanguage,
  onApplySettings,
  onRecoverTranslation,
  backgroundMode = "solid",
  backgroundColor = "#202124",
  onBackgroundModeChange,
  onBackgroundColorChange,
}: {
  runtime: ClassroomRuntimeSnapshot;
  captions: ClassroomCaptionSnapshot[];
  availability: { shengwang: boolean; wordly: boolean };
  canManage: boolean;
  displayMode: CaptionDisplayMode;
  overlayVisible: boolean;
  preferredLanguage: string;
  busy?: boolean;
  preferenceBusy?: boolean;
  preferenceError?: string | null;
  onRetryPreference: () => void;
  onApplySettings: (settings: CaptionSettings) => Promise<boolean>;
  onRecoverTranslation?: (captionId: string) => Promise<boolean>;
  backgroundMode?: "transparent" | "text" | "solid";
  backgroundColor?: string;
  onBackgroundModeChange?: (mode: "transparent" | "text" | "solid") => void;
  onBackgroundColorChange?: (color: string) => void;
}) {
  const { t, locale } = useTranslation();
  const recoveryLock = useRef(false);
  const [recovering, setRecovering] = useState<string | null>(null);
  const [recoveryFailed, setRecoveryFailed] = useState<string | null>(null);
  const recover = async (id: string) => {
    if (recoveryLock.current || !onRecoverTranslation) return;
    recoveryLock.current = true; setRecovering(id); setRecoveryFailed(null);
    try { if (!await onRecoverTranslation(id)) setRecoveryFailed(id); }
    catch { setRecoveryFailed(id); }
    finally { recoveryLock.current = false; setRecovering(null); }
  };
  const settingsId = useId();
  const helpId = useId();
  const settingsButton = useRef<HTMLButtonElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const followingHistory = useRef(true);
  const lastCaptionSeen = useRef("");
  const [hasUnseenCaptions,setHasUnseenCaptions] = useState(false);
  const [followLatest, setFollowLatest] = useState(() => {
    try { return window.localStorage.getItem("classroom_caption_follow_latest") !== "0"; }
    catch { return true; }
  });
  useEffect(() => {
    const last= captions.at(-1), key=last ? last.id+":"+last.text+":"+last.isFinal : "";
    if ((!followLatest || !followingHistory.current) && lastCaptionSeen.current && lastCaptionSeen.current !== key) setHasUnseenCaptions(true);
    lastCaptionSeen.current = key;
    if (!followLatest) return;
    const history = historyRef.current;
    if (!history) return;
    const scrollToLatest = () => { if (followingHistory.current) history.scrollTop = history.scrollHeight; };
    scrollToLatest();
    const observer = new ResizeObserver(scrollToLatest);
    observer.observe(history);
    return () => observer.disconnect();
  }, [captions, displayMode, preferredLanguage, followLatest]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [draftMode, setDraftMode] = useState(displayMode);
  const [draftLanguage, setDraftLanguage] = useState(preferredLanguage);
  const [applying, setApplying] = useState(false);
  const applyLock = useRef(false);
  const [applyFailed, setApplyFailed] = useState(false);
  const [sourceLanguage, setSourceLanguage] = useState(
    runtime.interpretation.sourceLanguage,
  );
  const targetLanguages = runtime.interpretation.targetLanguages;
  const configuredProvider = runtime.interpretation.provider;
  const effectiveProvider = availability[configuredProvider]
    ? configuredProvider
    : availability.wordly
      ? "wordly"
      : availability.shengwang
        ? "shengwang"
        : configuredProvider;
  const interpretationStateLabel = !runtime.interpretation.enabled
    ? t("classroom.v3.notEnabled")
    : runtime.status !== "live"
      ? t("classroom.v3.readyRoom")
      : runtime.interpretation.status === "running"
        ? t("classroom.v3.live")
        : runtime.interpretation.status === "failed"
          ? t("classroom.v3.abnormal")
          : t("classroom.v3.preparing");
  const captionsEmptyHint = !runtime.interpretation.enabled
    ? t("classroom.v3.captionsEnableHint")
    : runtime.status !== "live"
      ? t("classroom.v3.captionsStartAfterClass")
      : t("classroom.v3.captionsWaitingHint");

  const supportedSources = new Set(supportedCaptionTranslationCodes("shengwang"));
  const sourceOptions = captionLanguageSelectOptions(effectiveProvider, locale).filter(language => supportedSources.has(language.value));
  const languageOptions = captionLanguageSelectOptions(configuredProvider, locale);
  const currentLanguageLabel = classroomLanguageLabel(preferredLanguage, locale);
  const displayLabels: Record<CaptionDisplayMode, string> = {
    off: t("classroom.v3.captionsOff"),
    original: t("classroom.v3.originalOnly"),
    bilingual: t("classroom.v3.bilingual"),
    translated: t("classroom.v3.translatedOnly"),
  };
  const saving = applying || Boolean(busy || preferenceBusy);
  const collapseSettings = () => {
    setSettingsOpen(false);
    settingsButton.current?.focus();
  };
  const toggleSettings = () => {
    if (saving) return;
    if (settingsOpen) { collapseSettings(); return; }
    // Each opening starts from the applied values, discarding unsaved edits.
    setDraftMode(displayMode);
    setDraftLanguage(preferredLanguage);
    setSourceLanguage(runtime.interpretation.sourceLanguage);
    setApplyFailed(false);
    setSettingsOpen(true);
  };
  const applySettings = async () => {
    if (saving || applyLock.current) return;
    applyLock.current = true;
    setApplying(true);
    setApplyFailed(false);
    try {
      const interpretationChanged = canManage && (
        sourceLanguage !== runtime.interpretation.sourceLanguage ||
        effectiveProvider !== configuredProvider
      );
      const saved = await onApplySettings({
        displayMode: draftMode,
        preferredLanguage: draftLanguage,
        overlayVisible,
        ...(interpretationChanged && { interpretation: {
          type: "setInterpretation" as const,
          enabled: runtime.interpretation.enabled,
          provider: effectiveProvider,
          sourceLanguage,
          targetLanguages,
        } }),
      });
      if (saved) collapseSettings();
      else setApplyFailed(true);
    } catch {
      setApplyFailed(true);
    } finally {
      applyLock.current = false;
      setApplying(false);
    }
  };
  const quickToggle = async (kind: "overlay" | "interpretation") => {
    if (saving || applyLock.current) return;
    applyLock.current = true;
    setApplying(true);
    setApplyFailed(false);
    try {
      const saved = await onApplySettings({
        displayMode, preferredLanguage,
        overlayVisible: kind === "overlay" ? !overlayVisible : overlayVisible,
        ...(kind === "interpretation" && canManage && { interpretation: {
          type: "setInterpretation" as const,
          enabled: !runtime.interpretation.enabled,
          provider: effectiveProvider,
          sourceLanguage: runtime.interpretation.sourceLanguage,
          targetLanguages,
        } }),
      });
      if (!saved) setApplyFailed(true);
    } catch { setApplyFailed(true); }
    finally { applyLock.current = false; setApplying(false); }
  };
  const visibleCaptions = captions.slice(-80);
  const preferenceFailure = preferenceError ? <div className="classroom-v3-caption-preference-error" role="alert">
    <p>{t(preferenceError === "caption_language_limit" ? "classroom.v3.captionLanguageLimit" : preferenceError === "caption_language_unsupported" ? "classroom.v3.captionLanguageUnsupported" : "classroom.v3.captionPreferenceFailed")}</p>
    <ClassroomIconButton type="button" disabled={saving} onClick={() => settingsOpen ? void applySettings() : onRetryPreference()}>{t("classroom.v3.captionPreferenceRetry")}</ClassroomIconButton>
  </div> : null;
  return (
    <div className="classroom-v3-panel-body is-captions" data-settings-open={settingsOpen} onKeyDown={event => {
      if (event.key === "Escape" && settingsOpen && !saving) { event.stopPropagation(); collapseSettings(); }
    }}>
      <div className="classroom-v3-panel-heading classroom-v3-caption-heading">
        <div className="classroom-v3-caption-heading-actions">
          <span data-status={runtime.interpretation.status}>{interpretationStateLabel}</span>
          <ClassroomIconButton ref={settingsButton} type="button" aria-label={t("classroom.v3.captionSettings")}
            aria-expanded={settingsOpen} aria-controls={settingsId} aria-disabled={saving} onClick={toggleSettings}>
            <Settings2 aria-hidden="true" />
          </ClassroomIconButton>
        </div>
      </div>

      <ClassroomIconButton type="button" className="classroom-v3-caption-settings-summary" onClick={toggleSettings} disabled={saving}
        aria-expanded={settingsOpen} aria-controls={settingsId} aria-label={t(settingsOpen ? "classroom.v3.captionSettingsCollapse" : "classroom.v3.captionSettingsExpand")}>
        <span>{displayLabels[displayMode]}{(displayMode === "bilingual" || displayMode === "translated") && <small>{currentLanguageLabel}</small>}</span>
        {settingsOpen ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
      </ClassroomIconButton>

      <div id={settingsId} className="classroom-v3-caption-settings-disclosure" data-open={settingsOpen} aria-hidden={!settingsOpen} inert={!settingsOpen}>
        <div className="classroom-v3-caption-settings-clip">
          <section className="classroom-v3-caption-settings-card" aria-label={t("classroom.v3.captionSettings")}>
        <div className="classroom-v3-caption-title">
          <h2>{t("classroom.v3.captionsTitle")}</h2>
          <div className="classroom-v3-caption-help" onMouseEnter={() => setHelpOpen(true)} onMouseLeave={() => setHelpOpen(false)}>
            <ClassroomIconButton type="button" aria-label={t("classroom.v3.captionHelp")} aria-describedby={helpOpen ? helpId : undefined}
              onFocus={() => setHelpOpen(true)} onBlur={() => setHelpOpen(false)} onClick={() => setHelpOpen(true)}
              onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); setHelpOpen(false); } }}>
              <AlertCircle aria-hidden="true" />
            </ClassroomIconButton>
            {helpOpen && <div id={helpId} role="tooltip">
              <p>{t("classroom.v3.captionDemandHint")}</p>
              <p>{t("classroom.v3.captionOverlayHint")}</p>
            </div>}
          </div>
          <div className="classroom-v3-caption-toggles" role="group" aria-label={t("classroom.v3.captionQuickControls")}>
            <CaptionQuickToggle label={t("classroom.v3.captionOverlay")} hint={t("classroom.v3.captionOverlayHint")}
              pressed={overlayVisible} disabled={saving} onClick={() => void quickToggle("overlay")}><Captions aria-hidden="true" /></CaptionQuickToggle>
            {canManage && <CaptionQuickToggle label={t("classroom.v3.interpretation")} hint={t("classroom.v3.captionInterpretationHint")}
              pressed={runtime.interpretation.enabled} disabled={saving || (!runtime.interpretation.enabled && !availability[effectiveProvider])}
              onClick={() => void quickToggle("interpretation")}><Headphones aria-hidden="true" /></CaptionQuickToggle>}
          </div>
        </div>

            <div className="classroom-v3-caption-view-settings">
              <CaptionSelect label={t("classroom.v3.displayMode")} value={draftMode} disabled={saving}
                options={Object.entries(displayLabels).map(([value, label]) => ({ value, label }))}
                onChange={value => setDraftMode(value as CaptionDisplayMode)} />
              <CaptionSelect label={t("classroom.v3.myCaptionLanguage")} value={draftLanguage}
                disabled={saving || !availability[configuredProvider]}
                searchable options={languageOptions}
                onChange={value => {
                    setDraftLanguage(value);
                    if (draftMode === "off" || draftMode === "original") setDraftMode("bilingual");
                }} />
            </div>

            {canManage ? (
              <section className="classroom-v3-interpretation-config">
                <CaptionSelect label={t("classroom.v3.sourceLanguage")} value={sourceLanguage} disabled={saving}
                  searchable options={sourceOptions}
                  onChange={setSourceLanguage} />
                {runtime.interpretation.error ? (
                  <p className="classroom-v3-interpretation-error">
                    <AlertCircle />
                    {runtime.interpretation.error}
                  </p>
                ) : null}
              </section>
            ) : null}

            <fieldset className="classroom-v3-caption-settings classroom-v3-caption-local-settings">
              <legend>{t("classroomUpdates.captionAppearance")}</legend>
              {onBackgroundModeChange && <label><span>{t("classroom.v3.captionBackground")}</span>
                <select value={backgroundMode} onChange={event => onBackgroundModeChange(event.target.value as typeof backgroundMode)}>
                  <option value="text">{t("classroom.v3.captionBackgroundText")}</option>
                  <option value="transparent">{t("classroom.v3.captionBackgroundTransparent")}</option>
                  <option value="solid">{t("classroom.v3.captionBackgroundSolid")}</option>
                </select>
              </label>}
              {onBackgroundColorChange && backgroundMode !== "transparent" && <label><span>{t("classroom.v3.captionBackgroundColor")}</span><input type="color" value={backgroundColor} onChange={event => onBackgroundColorChange(event.target.value)} /></label>}
              <CaptionAppearanceControls embedded />
              <p>{t("classroomUpdates.localAppearanceHint")}</p>
            </fieldset>
            {settingsOpen && preferenceFailure}
            {applyFailed && !preferenceError && <p className="classroom-v3-caption-preference-error" role="alert">{t("classroom.v3.interpretationSaveFailed")}</p>}
            <footer className="classroom-v3-caption-settings-footer">
              <ClassroomIconButton type="button" disabled={saving} onClick={collapseSettings}><ChevronUp aria-hidden="true" />{t("classroom.v3.captionSettingsCollapse")}</ClassroomIconButton>
              <ClassroomIconButton type="button" className="classroom-v3-interpretation-save" disabled={saving} aria-busy={saving} onClick={() => void applySettings()}>
                {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Settings2 aria-hidden="true" />}
                {t(saving ? "classroom.v3.applyingInterpretation" : "classroom.v3.captionSettingsApply")}
              </ClassroomIconButton>
            </footer>
          </section>
        </div>
      </div>

      <div className="classroom-v3-caption-feed">
      {!settingsOpen && preferenceFailure}
      {!settingsOpen && applyFailed && !preferenceError && <p className="classroom-v3-caption-preference-error" role="alert">{t("classroom.v3.interpretationSaveFailed")}</p>}

      {settingsOpen && <div className="classroom-v3-caption-follow">
        <span>{t("classroom.v3.captionFollowLatest")}</span>
        <ClassroomIconButton type="button" role="switch" aria-checked={followLatest}
          aria-label={t("classroom.v3.captionFollowLatest")} onClick={() => {
            const next = !followLatest;
            setFollowLatest(next);
            try { window.localStorage.setItem("classroom_caption_follow_latest", next ? "1" : "0"); } catch { /* Storage may be unavailable in embedded browsers. */ }
          }}><i aria-hidden="true" /></ClassroomIconButton>
      </div>}

      <div ref={historyRef} onScroll={event=>{const view=event.currentTarget;followingHistory.current=view.scrollHeight-view.scrollTop-view.clientHeight<48;if(followingHistory.current)setHasUnseenCaptions(false)}} className="classroom-v3-caption-history" data-follow-latest={followLatest}>
        {!visibleCaptions.length ? (
          <div className="classroom-v3-panel-empty">
            <Headphones aria-hidden="true" />
            <strong>{t("classroom.v3.captionsWaiting")}</strong>
            <p>{captionsEmptyHint}</p>
          </div>
        ) : visibleCaptions.map((caption) => {
          const translated = captionTranslation(caption, preferredLanguage);
          return (
            <article key={caption.id} data-final={caption.isFinal}>
              <header>
                <strong>
                  {caption.speakerName || t("classroom.v3.speaker")}
                </strong>
                <small>
                  {new Date(caption.occurredAt).toLocaleTimeString(locale, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </small>
              </header>
              {displayMode !== "translated" ? <p>{caption.text}</p> : null}
              {displayMode !== "original" && !translated && caption.translationStatus && caption.translationStatus !== "completed" ? (
                <div role="status" data-translation-state={caption.translationStatus}>
                  <p>{t(`classroom.v3.captionTranslationState${caption.translationStatus[0].toUpperCase()}${caption.translationStatus.slice(1)}`)}</p>
                  {canManage && onRecoverTranslation && ["failed", "recoverable"].includes(caption.translationStatus) ?
                    <ClassroomIconButton type="button" disabled={recovering !== null} aria-busy={recovering === caption.id} onClick={() => void recover(caption.id)}>
                      {t(caption.translationStatus === "recoverable" ? "classroom.v3.captionTranslationRestore" : "classroom.v3.captionTranslationRetry")}
                    </ClassroomIconButton> : null}
                  {recoveryFailed === caption.id ? <p role="alert">{t("classroom.v3.captionTranslationRecoveryFailed")}</p> : null}
                </div>
              ) : null}
              {displayMode !== "original" && translated ? (
                <p className="is-translation">
                  <i>{classroomLanguageLabel(preferredLanguage)}</i>
                  {translated}
                </p>
              ) : null}
            </article>
          );
        })}
      </div>
      {hasUnseenCaptions && <ClassroomIconButton type="button" className="classroom-chat-latest" onClick={()=>{followingHistory.current=true;setFollowLatest(true);setHasUnseenCaptions(false);if(historyRef.current)historyRef.current.scrollTop=historyRef.current.scrollHeight}}>{t("classroomWorkspace.latest")}</ClassroomIconButton>}
      </div>
    </div>
  );
}
