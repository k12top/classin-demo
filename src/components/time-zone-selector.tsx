"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowRight, Check, ChevronDown, Clock3, Globe2, Laptop, Search, X } from "lucide-react";
import { useTimeZone } from "@/lib/use-time-zone";
import { parseZonedInput, validTimeZone } from "@/lib/time-zone";
import { searchTimeZones, timeZoneCity, timeZoneOffset } from "@/lib/time-zone-catalog";
import { useTranslation } from "@/lib/i18n/context";
import "./time-zone-selector.css";

export function TimeZoneSelector() {
  const { timeZone, preference, setPreference } = useTimeZone();
  return <span className="time-zone-display"><ZonePicker value={timeZone} onChange={setPreference} mode="display" automatic={preference === "auto"} /></span>;
}

export function SchedulingTimeZone({ value, onChange, localValue }: { value: string; onChange: (zone: string) => void; localValue?: string }) {
  return <ZonePicker value={value} onChange={onChange} localValue={localValue} mode="schedule" />;
}

export function ScheduleTimePreview({ value, timeZone }: { value: string; timeZone: string }) {
  const { timeZone: displayZone } = useTimeZone();
  const { t, locale } = useTranslation();
  if (!value) return null;
  let date: Date;
  try { date = parseZonedInput(value, timeZone); }
  catch { return <p className="time-zone-error" role="status">{t("timeZones.invalid")}</p>; }
  if (timeZone === displayZone) return null;
  return <p className="time-zone-conversion"><ArrowRight aria-hidden="true" /><span>
    {t("timeZones.reference", { city: timeZoneCity(displayZone, locale) })} <strong>{new Intl.DateTimeFormat(locale, { timeZone: displayZone, month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date)}</strong>
  </span></p>;
}

function ZonePicker({ value, onChange, localValue, mode, automatic = false }: {
  value: string; onChange: (zone: string) => void; localValue?: string; mode: "schedule" | "display"; automatic?: boolean;
}) {
  const { t, locale } = useTranslation();
  const { timeZone: displayZone, detectedTimeZone } = useTimeZone();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [all, setAll] = useState(false);
  const [position, setPosition] = useState({ left: 8, top: 72 });
  const trigger = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const resultsElement = useRef<HTMLDivElement>(null);
  // Start in UTC for hydration; the live device zone is resolved by useTimeZone afterwards.
  const [today, setToday] = useState<Date | null>(null);
  useEffect(() => { queueMicrotask(() => setToday(new Date())); }, []);
  const reference = useMemo(() => {
    if (localValue) {
      try { return parseZonedInput(localValue, value); } catch { /* Keep the picker available for invalid times. */ }
      const candidate = new Date(localValue.slice(0, 10) + "T12:00:00Z");
      if (Number.isFinite(+candidate)) return candidate;
    }
    return today || new Date(0);
  }, [localValue, value, today]);
  const rows = useMemo(() => searchTimeZones(search, locale, all, [value, displayZone]), [search, locale, all, value, displayZone]);
  const label = t(mode === "schedule" ? "timeZones.schedule" : "timeZones.display");
  const help = t(mode === "schedule" ? "timeZones.scheduleKeepClock" : "timeZones.displayKeepInstant");
  const city = timeZoneCity(value, locale);
  const updatePosition = () => {
    const rect = trigger.current?.getBoundingClientRect();
    if (rect) setPosition({ left: Math.max(8, Math.min(window.innerWidth - 360, rect.right - 344)), top: Math.max(8, Math.min(rect.bottom + 7, window.innerHeight - 430)) });
  };
  useEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (rect) setPosition({ left: Math.max(8, Math.min(window.innerWidth - 360, rect.right - 344)), top: Math.max(8, Math.min(rect.bottom + 7, window.innerHeight - 430)) });
    };
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [open]);
  const choose = (zone: string) => { onChange(zone); setOpen(false); };
  return <Dialog.Root open={open} onOpenChange={next => {
    if (next) { updatePosition(); setSearch(""); setAll(false); }
    setOpen(next);
  }}>
    <Dialog.Trigger asChild><button ref={trigger} type="button" className="time-zone-trigger" aria-label={`${label} · ${city}`} title={`${label} · ${city} · ${help}`}>
      {mode === "display" ? <Clock3 aria-hidden="true" /> : <Globe2 aria-hidden="true" />}<span>{city} · {validTimeZone(value) ? timeZoneOffset(value, reference) : "—"}</span><ChevronDown aria-hidden="true" />
    </button></Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className="time-zone-overlay" /><Dialog.Content className="time-zone-picker" style={position} onOpenAutoFocus={event => { event.preventDefault(); searchInput.current?.focus(); }}>
      <div className="time-zone-handle" /><header><Dialog.Title>{label}</Dialog.Title><Dialog.Close asChild><button type="button" aria-label={t("timeZones.close")}><X aria-hidden="true" /></button></Dialog.Close></header>
      <label className="time-zone-search"><Search aria-hidden="true" /><input ref={searchInput} value={search} onChange={event => { setSearch(event.target.value); resultsElement.current?.scrollTo(0, 0); }} placeholder={t("timeZones.search")} aria-label={t("timeZones.search")} onKeyDown={event => { if (event.key === "ArrowDown") { event.preventDefault(); resultsElement.current?.querySelector("button")?.focus(); } }} />{search && <button type="button" onClick={() => { setSearch(""); searchInput.current?.focus(); }} aria-label={t("timeZones.clear")}><X aria-hidden="true" /></button>}</label>
      {!search && !all && <button type="button" className="time-zone-auto" onClick={() => choose(mode === "display" ? "auto" : displayZone)}><Laptop aria-hidden="true" /><span><strong>{t(mode === "display" ? "timeZones.followDevice" : "timeZones.useMine")}</strong><small>{timeZoneCity(mode === "display" ? detectedTimeZone : displayZone, locale)}</small></span>{mode === "display" && automatic && <Check className="time-zone-selected" aria-hidden="true" />}</button>}
      <div className="time-zone-results-title"><span aria-live="polite">{search ? t("timeZones.results", { count: rows.length }) : t(all ? "timeZones.all" : "timeZones.common")}</span><button type="button" onClick={() => { setAll(current => !current); resultsElement.current?.scrollTo(0, 0); }}>{t(all ? "timeZones.byCity" : "timeZones.byZone")}</button></div>
      <div ref={resultsElement} className="time-zone-results">{rows.map(row => <button type="button" key={row.zone} aria-pressed={value === row.zone && !(mode === "display" && automatic)} title={row.zone} onClick={() => choose(row.zone)}><span><strong>{row.city}</strong><small>{row.country || row.zone}</small></span><span>{timeZoneOffset(row.zone, reference)}</span><Check aria-hidden="true" className={value === row.zone && !(mode === "display" && automatic) ? "time-zone-selected" : "time-zone-unselected"} /></button>)}{!rows.length && <p>{t("timeZones.noResults")}</p>}</div>
      <Dialog.Description>{help}</Dialog.Description>
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}
