"use client";
import { ClassroomIconButton } from "./icon-button";

import type { ReactNode } from "react";
import { Globe, MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
  DropdownMenuRadioGroup, DropdownMenuRadioItem } from "@/components/ui/dropdown-menu";
import { useTranslation } from "@/lib/i18n/context";
import { languageOptions, type SupportedLocale } from "@/lib/i18n/locales";

export type ClassroomHeaderMenuAction = {
  id: string; label: string; icon: ReactNode; onSelect?: () => void; children?: ClassroomHeaderMenuAction[]; danger?: boolean;
  disabled?: boolean; compactOnly?: boolean;
};

export function ClassroomHeaderMenu({ actions }: { actions: ClassroomHeaderMenuAction[] }) {
  const { t, locale, setLocale } = useTranslation();
  return <DropdownMenu modal={false}>
    <DropdownMenuTrigger asChild>
      <ClassroomIconButton type="button" className="classroom-header-more" title={t("classroomWorkspace.more")} aria-label={t("classroomWorkspace.more")}>
        <MoreHorizontal aria-hidden="true" />
      </ClassroomIconButton>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" sideOffset={8} collisionPadding={8} className="classroom-header-menu">
      {actions.map(action => action.children ? <DropdownMenuSub key={action.id}>
        <DropdownMenuSubTrigger disabled={action.disabled}>{action.icon}<span>{action.label}</span></DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="classroom-header-menu" collisionPadding={8}>{action.children.map(child => <DropdownMenuItem key={child.id} disabled={child.disabled} onSelect={child.onSelect} className={child.danger ? "is-danger" : undefined}>{child.icon}<span>{child.label}</span></DropdownMenuItem>)}</DropdownMenuSubContent>
      </DropdownMenuSub> : <DropdownMenuItem key={action.id} className={action.danger ? "is-danger" : action.compactOnly ? "classroom-header-menu-compact" : undefined}
        disabled={action.disabled} onSelect={action.onSelect}>
        {action.icon}<span>{action.label}</span>
      </DropdownMenuItem>)}
      <DropdownMenuSub>
        <DropdownMenuSubTrigger><Globe aria-hidden="true" /><span>{t("classroom.v3.interfaceLanguage")}</span></DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="classroom-header-menu" collisionPadding={8}>
          <DropdownMenuRadioGroup value={locale} onValueChange={value => setLocale(value as SupportedLocale)}>
            {languageOptions.map(language => <DropdownMenuRadioItem key={language.value} value={language.value}>{language.label}</DropdownMenuRadioItem>)}
          </DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </DropdownMenuContent>
  </DropdownMenu>;
}
