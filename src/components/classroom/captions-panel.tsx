"use client";
import { useEffect, useId, useRef, useState } from "react";
import { AlertCircle, ChevronDown, ChevronUp, Headphones, Loader2, Settings2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n/context";
import { CaptionSelect } from "@/components/classroom/caption-select";
import { captionLanguageOptions, classroomLanguageLabel } from "@/lib/classroom/languages";
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
}) {
  const { t, locale } = useTranslation();
  const settingsId = useId();
  const helpId = useId();
  const settingsButton = useRef<HTMLButtonElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const [followLatest, setFollowLatest] = useState(() => {
    try { return window.localStorage.getItem("classroom_caption_follow_latest") !== "0"; }
    catch { return true; }
  });
  useEffect(() => {
    if (!followLatest) return;
    const history = historyRef.current;
    if (!history) return;
    const scrollToLatest = () => { history.scrollTop = history.scrollHeight; };
    scrollToLatest();
    const observer = new ResizeObserver(scrollToLatest);
    observer.observe(history);
    return () => observer.disconnect();
  }, [captions, displayMode, preferredLanguage, followLatest]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [draftMode, setDraftMode] = useState(displayMode);
  const [draftLanguage, setDraftLanguage] = useState(preferredLanguage);
  const [draftOverlay, setDraftOverlay] = useState(overlayVisible);
  const [applying, setApplying] = useState(false);
  const [applyFailed, setApplyFailed] = useState(false);
  const [enabled, setEnabled] = useState(runtime.interpretation.enabled);
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
  const sourceOptions = captionLanguageOptions(effectiveProvider).filter(language => supportedSources.has(language.code));
  const languageOptions = captionLanguageOptions(configuredProvider);
  const currentLanguageLabel = languageOptions.find(language => language.code === preferredLanguage)?.nativeLabel || classroomLanguageLabel(preferredLanguage);
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
    setDraftOverlay(overlayVisible);
    setEnabled(runtime.interpretation.enabled);
    setSourceLanguage(runtime.interpretation.sourceLanguage);
    setApplyFailed(false);
    setSettingsOpen(true);
  };
  const applySettings = async () => {
    if (saving) return;
    setApplying(true);
    setApplyFailed(false);
    try {
      const interpretationChanged = canManage && (
        enabled !== runtime.interpretation.enabled ||
        sourceLanguage !== runtime.interpretation.sourceLanguage ||
        effectiveProvider !== configuredProvider
      );
      const saved = await onApplySettings({
        displayMode: draftMode,
        preferredLanguage: draftLanguage,
        overlayVisible: draftOverlay,
        ...(interpretationChanged && { interpretation: {
          type: "setInterpretation" as const,
          enabled,
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
      setApplying(false);
    }
  };
  const visibleCaptions = captions.slice(-80);
  const preferenceFailure = preferenceError ? <div className="classroom-v3-caption-preference-error" role="alert">
    <p>{t(preferenceError === "caption_language_limit" ? "classroom.v3.captionLanguageLimit" : preferenceError === "caption_language_unsupported" ? "classroom.v3.captionLanguageUnsupported" : "classroom.v3.captionPreferenceFailed")}</p>
    <button type="button" disabled={saving} onClick={() => settingsOpen ? void applySettings() : onRetryPreference()}>{t("classroom.v3.captionPreferenceRetry")}</button>
  </div> : null;
  return (
    <div className="classroom-v3-panel-body is-captions" data-settings-open={settingsOpen} onKeyDown={event => {
      if (event.key === "Escape" && settingsOpen && !saving) { event.stopPropagation(); collapseSettings(); }
    }}>
      <div className="classroom-v3-panel-heading classroom-v3-caption-heading">
        <div className="classroom-v3-caption-title">
          <h2>{t("classroom.v3.captionsTitle")}</h2>
          <div className="classroom-v3-caption-help" onMouseEnter={() => setHelpOpen(true)} onMouseLeave={() => setHelpOpen(false)}>
            <button type="button" aria-label={t("classroom.v3.captionHelp")} aria-describedby={helpOpen ? helpId : undefined}
              onFocus={() => setHelpOpen(true)} onBlur={() => setHelpOpen(false)} onClick={() => setHelpOpen(true)}
              onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); setHelpOpen(false); } }}>
              <AlertCircle aria-hidden="true" />
            </button>
            {helpOpen && <div id={helpId} role="tooltip">
              <p>{t("classroom.v3.captionDemandHint")}</p>
              <p>{t("classroom.v3.captionOverlayHint")}</p>
            </div>}
          </div>
        </div>
        <div className="classroom-v3-caption-heading-actions">
          <span data-status={runtime.interpretation.status}>{interpretationStateLabel}</span>
          <button ref={settingsButton} type="button" aria-label={t("classroom.v3.captionSettings")}
            aria-expanded={settingsOpen} aria-controls={settingsId} aria-disabled={saving} onClick={toggleSettings}>
            <Settings2 aria-hidden="true" />
          </button>
        </div>
      </div>

      <button type="button" className="classroom-v3-caption-settings-summary" onClick={toggleSettings} disabled={saving}
        aria-expanded={settingsOpen} aria-controls={settingsId} aria-label={t(settingsOpen ? "classroom.v3.captionSettingsCollapse" : "classroom.v3.captionSettingsExpand")}>
        <span>{displayLabels[displayMode]}{(displayMode === "bilingual" || displayMode === "translated") && <small>{currentLanguageLabel}</small>}</span>
        {settingsOpen ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
      </button>

      <div id={settingsId} className="classroom-v3-caption-settings-disclosure" data-open={settingsOpen} aria-hidden={!settingsOpen} inert={!settingsOpen}>
        <div className="classroom-v3-caption-settings-clip">
          <section className="classroom-v3-caption-settings-card" aria-label={t("classroom.v3.captionSettings")}>
            <div className="classroom-v3-caption-view-settings">
              <CaptionSelect label={t("classroom.v3.displayMode")} value={draftMode} disabled={saving}
                options={Object.entries(displayLabels).map(([value, label]) => ({ value, label }))}
                onChange={value => setDraftMode(value as CaptionDisplayMode)} />
              <CaptionSelect label={t("classroom.v3.myCaptionLanguage")} value={draftLanguage}
                disabled={saving || !availability[configuredProvider]}
                options={languageOptions.map(language => ({ value: language.code, label: language.nativeLabel }))}
                onChange={value => {
                    setDraftLanguage(value);
                    if (draftMode === "off" || draftMode === "original") setDraftMode("bilingual");
                }} />
            </div>

            <div className="classroom-v3-caption-overlay-control">
              <span>
                <strong>{t("classroom.v3.captionOverlay")}</strong>
              </span>
              <button
                type="button"
                className={draftOverlay ? "is-on" : ""}
                disabled={saving}
                aria-pressed={draftOverlay}
                onClick={() => setDraftOverlay(!draftOverlay)}
              >
                <i />
                {draftOverlay
                  ? t("classroom.v3.enabled")
                  : t("classroom.v3.disabled")}
              </button>
            </div>

            {canManage ? (
              <section className="classroom-v3-interpretation-config">
                <header>
                  <div>
                    <strong>{t("classroom.v3.interpretation")}</strong>
                  </div>
                  <button
                    type="button"
                    className={enabled ? "is-on" : ""}
                    disabled={saving}
                    onClick={() => setEnabled(current => !current)}
                    aria-pressed={enabled}
                  >
                    <i />
                    {enabled
                      ? t("classroom.v3.enabled")
                      : t("classroom.v3.disabled")}
                  </button>
                </header>
                <CaptionSelect label={t("classroom.v3.sourceLanguage")} value={sourceLanguage} disabled={saving}
                  options={sourceOptions.map(language => ({ value: language.code, label: `${language.nativeLabel} · ${language.label}` }))}
                  onChange={setSourceLanguage} />
                {runtime.interpretation.error ? (
                  <p className="classroom-v3-interpretation-error">
                    <AlertCircle />
                    {runtime.interpretation.error}
                  </p>
                ) : null}
              </section>
            ) : null}

            {settingsOpen && preferenceFailure}
            {applyFailed && !preferenceError && <p className="classroom-v3-caption-preference-error" role="alert">{t("classroom.v3.interpretationSaveFailed")}</p>}
            <footer className="classroom-v3-caption-settings-footer">
              <button type="button" disabled={saving} onClick={collapseSettings}><ChevronUp aria-hidden="true" />{t("classroom.v3.captionSettingsCollapse")}</button>
              <button type="button" className="classroom-v3-interpretation-save" disabled={saving} aria-busy={saving} onClick={() => void applySettings()}>
                {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Settings2 aria-hidden="true" />}
                {t(saving ? "classroom.v3.applyingInterpretation" : "classroom.v3.captionSettingsApply")}
              </button>
            </footer>
          </section>
        </div>
      </div>

      <div className="classroom-v3-caption-feed">
      {!settingsOpen && preferenceFailure}

      <div className="classroom-v3-caption-follow">
        <span>{t("classroom.v3.captionFollowLatest")}</span>
        <button type="button" role="switch" aria-checked={followLatest}
          aria-label={t("classroom.v3.captionFollowLatest")} onClick={() => {
            const next = !followLatest;
            setFollowLatest(next);
            try { window.localStorage.setItem("classroom_caption_follow_latest", next ? "1" : "0"); } catch { /* Storage may be unavailable in embedded browsers. */ }
          }}><i aria-hidden="true" /></button>
      </div>

      <div ref={historyRef} className="classroom-v3-caption-history" data-follow-latest={followLatest}>
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
      </div>
    </div>
  );
}
