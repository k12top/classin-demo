"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import * as Select from "@radix-ui/react-select";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { useTranslation } from "@/lib/i18n/context";

type CaptionSelectProps = {
  label: string;
  value: string;
  options: { value: string; label: string; searchText?: string }[];
  disabled?: boolean;
  searchable?: boolean;
  onChange: (value: string) => void;
};

function normalizeSearch(text: string) {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase().trim();
}

/** An editable combobox in a non-modal, fullscreen-safe popup. */
function SearchableCaptionSelect({ label, value, options, disabled, onChange }: CaptionSelectProps) {
  const { t } = useTranslation();
  const labelId = useId();
  const listId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [container, setContainer] = useState<HTMLElement | undefined>();
  const [position, setPosition] = useState<CSSProperties>({});
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean);
  const filtered = options.filter(option => {
    const text = normalizeSearch(`${option.label} ${option.searchText || ""} ${option.value}`);
    return words.every(word => text.includes(word));
  });
  const activeIndex = Math.min(active, filtered.length - 1);
  const reposition = () => {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(Math.max(320, rect.width), window.innerWidth - 24);
    const below = window.innerHeight - rect.bottom - 18;
    const above = rect.top - 18;
    const onTop = below < 240 && above > below;
    setPosition({
      position: "fixed", width,
      left: Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)),
      top: onTop ? undefined : rect.bottom + 6,
      bottom: onTop ? window.innerHeight - rect.top + 6 : undefined,
      maxHeight: Math.min(400, Math.max(100, onTop ? above : below)),
    });
  };
  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", reposition);
    const onScroll = (event: Event) => {
      if (!list.current?.contains(event.target as Node)) reposition();
    };
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);
  const changeOpen = (next: boolean) => {
    if (next) {
      if (disabled) return;
      setContainer(trigger.current?.closest<HTMLElement>(".classroom-v3-shell") ?? undefined);
      setQuery(""); setActive(0); reposition();
    }
    setOpen(next);
  };
  const select = (next: string) => { onChange(next); setOpen(false); };
  return <div className="classroom-v3-caption-select-field">
    <span id={labelId}>{label}</span>
    <Dialog.Root modal={false} open={open} onOpenChange={changeOpen}>
      <Dialog.Trigger asChild><button ref={trigger} type="button" disabled={disabled}
        className="classroom-v3-caption-select-trigger" aria-labelledby={labelId}>
        <span>{options.find(option => option.value === value)?.label || value}</span><ChevronDown aria-hidden="true" />
      </button></Dialog.Trigger>
      <Dialog.Portal container={container}>
        <Dialog.Content className="classroom-v3-caption-select-content classroom-v3-caption-language-content" style={position}
          aria-describedby={undefined} onOpenAutoFocus={event => { event.preventDefault(); search.current?.focus(); }}
          onEscapeKeyDown={event => event.stopPropagation()}>
          <Dialog.Title className="classroom-v3-caption-language-title">{label}</Dialog.Title>
          <div className="classroom-v3-caption-language-search">
            <Search aria-hidden="true" />
            <input ref={search} role="combobox" aria-label={t("classroom.v3.captionLanguageSearch")} placeholder={t("classroom.v3.captionLanguageSearch")}
              aria-expanded={open} aria-controls={listId} aria-autocomplete="list" autoComplete="off" spellCheck={false}
              aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined} value={query}
              onChange={event => { setQuery(event.target.value); setActive(0); if (list.current) list.current.scrollTop = 0; }}
              onKeyDown={event => {
                if (event.nativeEvent.isComposing) return;
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  const next = filtered.length ? (activeIndex + (event.key === "ArrowDown" ? 1 : -1) + filtered.length) % filtered.length : 0;
                  setActive(next);
                  document.getElementById(`${listId}-${next}`)?.scrollIntoView({ block: "nearest" });
                } else if (event.key === "Enter") {
                  event.preventDefault(); if (filtered[activeIndex]) select(filtered[activeIndex].value);
                }
              }} />
            {query && <button type="button" aria-label={t("classroom.v3.captionLanguageClearSearch")} onClick={() => {
              setQuery(""); setActive(0); search.current?.focus();
            }}><X aria-hidden="true" /></button>}
          </div>
          <div className="classroom-v3-caption-language-meta"><span>{t("classroom.v3.captionLanguageAlphabetical")}</span>
            <span role="status" aria-live="polite">{t("classroom.v3.captionLanguageCount", { count: filtered.length })}</span></div>
          <div ref={list} id={listId} role="listbox" aria-label={label} className="classroom-v3-caption-select-viewport">
            {filtered.map((option, index) => <button type="button" role="option" tabIndex={-1} id={`${listId}-${index}`} key={option.value}
              aria-selected={option.value === value} data-highlighted={index === activeIndex ? "" : undefined}
              className="classroom-v3-caption-select-option" onMouseDown={event => event.preventDefault()}
              onMouseEnter={() => setActive(index)} onClick={() => select(option.value)}>
              {option.value === value && <span><Check aria-hidden="true" /></span>}<span dir="auto">{option.label}</span>
            </button>)}
          </div>
          {!filtered.length && <div className="classroom-v3-caption-language-empty">{t("classroom.v3.captionLanguageNoResults")}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </div>;
}

/** Portal outside the drawer's scrolling and animated clipping containers. */
export function CaptionSelect(props: CaptionSelectProps) {
  return props.searchable ? <SearchableCaptionSelect {...props} /> : <StandardCaptionSelect {...props} />;
}

function StandardCaptionSelect({ label, value, options, disabled, onChange }: CaptionSelectProps) {
  const labelId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [container, setContainer] = useState<HTMLElement | undefined>();
  return <div className="classroom-v3-caption-select-field">
    <span id={labelId}>{label}</span>
    <Select.Root value={value} disabled={disabled} onValueChange={onChange} onOpenChange={open => {
      if (open) setContainer(trigger.current?.closest<HTMLElement>(".classroom-v3-shell") ?? undefined);
    }}>
      <Select.Trigger ref={trigger} className="classroom-v3-caption-select-trigger" aria-labelledby={labelId}>
        <Select.Value />
        <Select.Icon asChild><ChevronDown aria-hidden="true" /></Select.Icon>
      </Select.Trigger>
      <Select.Portal container={container}>
        <Select.Content className="classroom-v3-caption-select-content" position="popper" align="end" sideOffset={6} collisionPadding={12}
          onKeyDown={event => { if (event.key === "Escape") event.stopPropagation(); }}>
          <Select.ScrollUpButton className="classroom-v3-caption-select-scroll"><ChevronUp aria-hidden="true" /></Select.ScrollUpButton>
          <Select.Viewport className="classroom-v3-caption-select-viewport">
            {options.map(option => <Select.Item key={option.value} value={option.value} className="classroom-v3-caption-select-option">
              <Select.ItemIndicator><Check aria-hidden="true" /></Select.ItemIndicator>
              <Select.ItemText>{option.label}</Select.ItemText>
            </Select.Item>)}
          </Select.Viewport>
          <Select.ScrollDownButton className="classroom-v3-caption-select-scroll"><ChevronDown aria-hidden="true" /></Select.ScrollDownButton>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  </div>;
}
