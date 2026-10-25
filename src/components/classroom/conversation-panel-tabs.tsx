"use client";
import { ClassroomIconButton } from "./icon-button";

import { Headphones, MessageCircle, PanelRightClose } from "lucide-react";
import { useTranslation } from "@/lib/i18n/context";

export function ConversationPanelTabs({ active, unread, onChange, onClose }: {
  active: "chat" | "captions";
  unread: number;
  onChange: (panel: "chat" | "captions") => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return <div className="classroom-conversation-header">
    <div role="tablist" aria-label={t("classroomWorkspace.conversation")} onKeyDown={event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? "chat" : event.key === "End" ? "captions" : active === "chat" ? "captions" : "chat";
      onChange(next);
      event.currentTarget.querySelector<HTMLButtonElement>(`[data-conversation-tab="${next}"]`)?.focus();
    }}>
      {(["chat", "captions"] as const).map(panel => <ClassroomIconButton key={panel} id={`conversation-tab-${panel}`} type="button"
        title={t(panel === "captions" ? "classroomMinimal.interpretation" : "classroom.v3.chat")} aria-label={t(panel === "captions" ? "classroomMinimal.interpretation" : "classroom.v3.chat")} data-conversation-tab={panel} role="tab" aria-selected={active === panel} aria-controls={`conversation-${panel}`}
        tabIndex={active === panel ? 0 : -1} onClick={() => onChange(panel)}>
        {panel === "chat" ? <MessageCircle aria-hidden="true" /> : <Headphones aria-hidden="true" />}
        <span>{t(`classroom.v3.${panel}`)}</span>
        {panel === "chat" && unread > 0 && <i>{unread > 99 ? "99+" : unread}</i>}
      </ClassroomIconButton>)}
    </div>
    <ClassroomIconButton type="button" className="classroom-conversation-close" aria-label={t("classroom.v3.collapsePanel")} onClick={onClose}>
      <PanelRightClose aria-hidden="true" />
    </ClassroomIconButton>
  </div>;
}
