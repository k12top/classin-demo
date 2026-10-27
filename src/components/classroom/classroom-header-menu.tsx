"use client";
import { ClassroomIconButton } from "./icon-button";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ArrowLeft, Check, ChevronRight, Globe, MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuPortal,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useTranslation } from "@/lib/i18n/context";
import { languageOptions, type SupportedLocale } from "@/lib/i18n/locales";

export type ClassroomHeaderMenuAction = {
  id: string; label: string; icon: ReactNode; onSelect?: () => void; children?: ClassroomHeaderMenuAction[]; danger?: boolean;
  disabled?: boolean; compactOnly?: boolean; checked?: boolean;
};

const compactMenuQuery = "(max-width: 760px)";
function subscribeCompactMenu(onChange: () => void) {
  const query = window.matchMedia(compactMenuQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const readCompactMenu = () => window.matchMedia(compactMenuQuery).matches;
const serverCompactMenu = () => false;

export function ClassroomHeaderMenu({ actions, variant = "legacy" }: { actions: ClassroomHeaderMenuAction[]; variant?: "legacy" | "functions" | "operations" }) {
  const { t, locale, setLocale } = useTranslation();
  const compact = useSyncExternalStore(subscribeCompactMenu, readCompactMenu, serverCompactMenu);
  const [page, setPage] = useState<ClassroomHeaderMenuAction | null>(null);
  const content = useRef<HTMLDivElement>(null);
  const activePage = compact ? page : null;
  useEffect(() => {
    if (activePage) content.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus();
  }, [activePage]);
  const label = t(variant === "operations" ? "classroomWorkspace.moreOperations" : variant === "functions" ? "classroomWorkspace.functions" : "classroomWorkspace.more");
  const languageItems = <DropdownMenuRadioGroup value={locale} onValueChange={value => setLocale(value as SupportedLocale)}>
    {languageOptions.map(language => <DropdownMenuRadioItem key={language.value} value={language.value}>{language.label}</DropdownMenuRadioItem>)}
  </DropdownMenuRadioGroup>;
  return <DropdownMenu modal={false} onOpenChange={open => { if (!open) setPage(null); }}>
    <DropdownMenuTrigger asChild>
      <ClassroomIconButton type="button" className="classroom-header-more" title={label} aria-label={label}>
        <MoreHorizontal aria-hidden="true" />
      </ClassroomIconButton>
    </DropdownMenuTrigger>
    <DropdownMenuContent ref={content} aria-label={activePage?.label} align="end" side={variant === "operations" ? "top" : "bottom"} sideOffset={8} collisionPadding={8} className={`classroom-header-menu ${activePage ? "classroom-header-submenu" : ""} ${variant === "operations" ? "classroom-dock-menu" : ""}`}>
      {activePage ? <>
        <DropdownMenuItem onSelect={event => { event.preventDefault(); setPage(null); }}><ArrowLeft aria-hidden="true" /><span>{t("common.back")} · {activePage.label}</span></DropdownMenuItem>
        <DropdownMenuSeparator />
        {activePage.id === "interface-language" ? languageItems : activePage.children?.map(child => <DropdownMenuItem key={child.id} disabled={child.disabled} role={child.checked === undefined ? undefined : "menuitemcheckbox"} aria-checked={child.checked} onSelect={child.onSelect} className={child.danger ? "is-danger" : undefined}>{child.icon}<span>{child.label}</span>{child.checked && <Check className="classroom-menu-check" aria-hidden="true" />}</DropdownMenuItem>)}
      </> : <>
      {actions.map(action => action.children ? compact ? <DropdownMenuItem key={action.id} disabled={action.disabled} onSelect={event => { event.preventDefault(); setPage(action); }}>{action.icon}<span>{action.label}</span><ChevronRight className="ml-auto" aria-hidden="true" /></DropdownMenuItem> : <DropdownMenuSub key={action.id}>
        <DropdownMenuSubTrigger disabled={action.disabled}>{action.icon}<span>{action.label}</span></DropdownMenuSubTrigger>
        <DropdownMenuPortal><DropdownMenuSubContent className="classroom-header-menu classroom-header-submenu" collisionPadding={8}>{action.children.map(child => <DropdownMenuItem key={child.id} disabled={child.disabled} role={child.checked === undefined ? undefined : "menuitemcheckbox"} aria-checked={child.checked} onSelect={child.onSelect} className={child.danger ? "is-danger" : undefined}>{child.icon}<span>{child.label}</span>{child.checked && <Check className="classroom-menu-check" aria-hidden="true" />}</DropdownMenuItem>)}</DropdownMenuSubContent></DropdownMenuPortal>
      </DropdownMenuSub> : <DropdownMenuItem key={action.id} className={action.danger ? "is-danger" : action.compactOnly ? "classroom-header-menu-compact" : undefined}
        disabled={action.disabled} onSelect={action.onSelect}>
        {action.icon}<span>{action.label}</span>{action.checked && <Check className="classroom-menu-check" aria-hidden="true" />}
      </DropdownMenuItem>)}
      {variant !== "operations" && (compact ? <DropdownMenuItem onSelect={event => { event.preventDefault(); setPage({ id: "interface-language", label: t("classroom.v3.interfaceLanguage"), icon: null }); }}><Globe aria-hidden="true" /><span>{t("classroom.v3.interfaceLanguage")}</span><ChevronRight className="ml-auto" aria-hidden="true" /></DropdownMenuItem> : <DropdownMenuSub>
        <DropdownMenuSubTrigger><Globe aria-hidden="true" /><span>{t("classroom.v3.interfaceLanguage")}</span></DropdownMenuSubTrigger>
        <DropdownMenuPortal><DropdownMenuSubContent className="classroom-header-menu classroom-header-submenu" collisionPadding={8}>
          {languageItems}
        </DropdownMenuSubContent></DropdownMenuPortal>
      </DropdownMenuSub>)}
      </>}
    </DropdownMenuContent>
  </DropdownMenu>;
}
