"use client";
import { ClassroomIconButton } from "./icon-button";
/* eslint-disable @next/next/no-img-element -- Private no-store chat images and local blob previews must bypass the shared image optimizer. */
import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { Globe, MessageCircle, MoreHorizontal, X, Loader2, Send, ArrowLeft, Languages, ImagePlus, Sparkles } from "lucide-react";
import { useTranslation } from "@/lib/i18n/context";
import { useChatTranslations } from "@/lib/classroom/use-chat-translations";
import { captionLanguageSelectOptions } from "@/lib/classroom/languages";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import type { ClassroomMemberSnapshot, ClassroomMessageSnapshot, ClassroomSpaceSnapshot } from "@/lib/classroom/types";
import { ChatMessageActions } from "./chat-message-actions";
import { useChatImage } from "./use-chat-image";
import { parseImageMessage } from "@/lib/classroom/chat-image-message";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ChatPopover } from "./chat-popover";
import { ActivityChatCard } from "./activity-chat-card";
import { ActivityQuickCreator } from "./activity-quick-creator";
import { ACTIVITY_CREATE_EVENT } from "@/lib/classroom/activities";
import { interactionCopy } from "@/lib/classroom/interaction-copy";
import { ActivityWorkspace } from "./activity-workspace";
import { useChatActivities } from "@/lib/classroom/use-chat-activities";
import interactionStyles from "./activity-interaction.module.css";
import { CLASSROOM_CHAT_MAX_CHARACTERS, chatCharacterCount, limitChatContent } from "@/lib/classroom/chat-content";
const OPTIMISTIC_MESSAGE_PREFIX = "optimistic:";

export function ClassroomChatPanel({
  messages,
  visible = true,
  sessionId = "",
  translationLanguage = "en-US",
  shareAccess,
  currentUserId,
  role,
  spaces,
  activeSpaceId,
  canManage,
  students,
  disabled,
  onSend,
  onDelete,
  onMuteAll,
  onActivityChanged = () => undefined,
  createActivityRequest = 0,
  onDeleteMember,
  onMuteMember,
  busy,
}: {
  messages: ClassroomMessageSnapshot[];
  visible?: boolean;
  sessionId?: string;
  translationLanguage?: string;
  shareAccess?: string | null;
  currentUserId: string;
  role: ClassroomMemberSnapshot["role"];
  spaces: ClassroomSpaceSnapshot[];
  activeSpaceId: string | null;
  canManage: boolean;
  students: ClassroomMemberSnapshot[];
  disabled: boolean;
  onSend: (
    content: string,
    context: {
      clientMessageId: string;
      imageId?: string;
      scope: "classroom" | "room" | "staff";
      spaceId?: string | null;
    },
  ) => Promise<boolean>;
  onDelete: (messageId: string) => Promise<boolean> | void;
  onDeleteMember?: (senderId:string) => Promise<boolean> | void;
  onMuteMember?: (senderId:string,muted:boolean) => void;
  onMuteAll: (muted: boolean) => void;
  onActivityChanged?: (revision: number) => void;
  createActivityRequest?: number;
  busy: boolean;
}) {
  const { t, locale } = useTranslation();
  const images = useChatImage(sessionId, shareAccess);
  const fileInput = useRef<HTMLInputElement>(null);
  const [imageViewer, setImageViewer] = useState<string|null>(null);
  const viewedMessage = messages.find(message => message.id === imageViewer && !message.deletedAt);
  const imageUrl = (id:string) => `/api/sessions/${encodeURIComponent(sessionId)}/classroom/messages/${encodeURIComponent(id)}/image${shareAccess ? "?shareAccess=" + encodeURIComponent(shareAccess) : ""}`;
  const allMuted = students.length > 0 && students.every((member) => member.chatMuted);
  const allUnmuted = students.every((member) => !member.chatMuted);
  const [activityEditorOpen, setActivityEditorOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const interaction = interactionCopy(locale);
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const followLatestRef = useRef(true);
  const sendingRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const composingRef = useRef(false);
  const countId = useId(), limitId = useId();
  const characterCount = chatCharacterCount(value);
  useLayoutEffect(() => {
    const field = inputRef.current;
    if (!field) return;
    const resize = () => {
      const style = getComputedStyle(field);
      field.style.height = "auto";
      field.style.height = `${Math.max(parseFloat(style.minHeight) || 76, Math.min(parseFloat(style.maxHeight) || 144, field.scrollHeight))}px`;
    };
    resize();
    let width = field.getBoundingClientRect().width;
    const observer = new ResizeObserver(entries => {
      const next = entries[0]?.contentRect.width;
      if (next && next !== width) { width = next; resize(); }
    });
    observer.observe(field);
    return () => observer.disconnect();
  }, [value, visible, quickOpen, activityEditorOpen]);
  const failedAttemptRef = useRef<{
    clientMessageId: string; content: string; scope: string; spaceId: string | null; imageId?:string;
  } | null>(null);
  const [scope, setScope] = useState<"classroom" | "room" | "staff">(
    activeSpaceId ? "room" : "classroom",
  );
  useEffect(() => { const open = (event: Event) => { if (canManage && (event as CustomEvent).detail?.sessionId === sessionId) { setScope("classroom"); setQuickOpen(true); } }; window.addEventListener(ACTIVITY_CREATE_EVENT, open); return () => window.removeEventListener(ACTIVITY_CREATE_EVENT, open); }, [canManage, sessionId]);
  useEffect(() => { if (!canManage || !createActivityRequest) return; const timer = setTimeout(() => { setScope("classroom"); setQuickOpen(true); }, 0); return () => clearTimeout(timer); }, [canManage, createActivityRequest]);
  const roomId = activeSpaceId || spaces.find((space) => space.isAssigned)?.id || null;
  const visibleMessages = messages.filter((message) => {
    if (scope === "room") return message.scope === "room" && message.spaceId === roomId;
    return message.scope === scope;
  });
  const activityFeed = useChatActivities(sessionId, shareAccess, visible && scope === "classroom");
  const [translateEnabled, setTranslateEnabled] = useState(false);
  const [languageOverride, setLanguageOverride] = useState("");
  const language = languageOverride || translationLanguage;
  const chatTranslation = useChatTranslations(sessionId, visibleMessages, language, translateEnabled && visible, shareAccess);
  const latestId = [visibleMessages.at(-1)?.id, activityFeed.activities.at(0)?.id].filter(Boolean).join(":");
  const lastSeenIdRef = useRef(latestId);
  useEffect(() => {
    if (!visible) return;
    const list = listRef.current;
    if (!list) return;
    if (followLatestRef.current) list.scrollTop = list.scrollHeight;
    else if (lastSeenIdRef.current !== latestId) setHasNewMessages(true);
    lastSeenIdRef.current = latestId;
  }, [latestId, visible, chatTranslation.translations]);
  const showLatest = () => {
    followLatestRef.current = true;
    setHasNewMessages(false);
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    const content = value.trim();
    if ((!content && !images.attachment) || disabled || sendingRef.current || composingRef.current || characterCount > CLASSROOM_CHAT_MAX_CHARACTERS) return;
    sendingRef.current = true; setSending(true); setSendFailed(false); images.setError("");
    let sent = false;
    try {
      const imageId = await images.upload();
      const spaceId = scope === "room" ? roomId : null, previous = failedAttemptRef.current;
      const attempt = previous?.content === content && previous.scope === scope && previous.spaceId === spaceId && previous.imageId === imageId ? previous : { clientMessageId: crypto.randomUUID(), content, scope, spaceId, imageId };
      failedAttemptRef.current = attempt; followLatestRef.current = true; setValue("");
      sent = await onSend(content, { clientMessageId: attempt.clientMessageId, scope, spaceId, ...(imageId && {imageId}) });
      if (sent) { failedAttemptRef.current = null; images.clear(); }
    } catch { sent = false; if (images.attachment) images.setError(t("classroomChat.imageFailed")); }
    finally { if (!sent) { setValue(content); setSendFailed(true); } sendingRef.current=false;setSending(false);inputRef.current?.focus(); }
  }

  if (activityEditorOpen) return <div className="classroom-chat-activity-editor"><button type="button" className="classroom-chat-back" onClick={() => setActivityEditorOpen(false)}><ArrowLeft />{t("classroom.v3.chat")}</button><ActivityWorkspace sessionId={sessionId} shareAccess={shareAccess} onChanged={revision => { onActivityChanged(revision); void activityFeed.reload().catch(() => undefined); }} /></div>;

  return (
    <div className={`classroom-v3-panel-body is-chat ${quickOpen ? interactionStyles.creating : ""}`}>
      <div className="classroom-chat-inline-tools">
        {(roomId || role !== "student") && <ChatPopover label={t("classroomChat.scope")} icon={<Globe />}><fieldset className="classroom-chat-scope-picker"><legend>{t("classroomChat.scope")}</legend>{(["classroom", ...(roomId ? ["room"] : []), ...(role !== "student" ? ["staff"] : [])] as Array<"classroom" | "room" | "staff">).map(channel => <label key={channel}><input type="radio" name="chat-scope" value={channel} checked={scope === channel} disabled={sending} onChange={() => { followLatestRef.current = true; setScope(channel); }} />{t(channel === "classroom" ? "classroom.v3.mainChannel" : channel === "room" ? "classroom.v3.roomChannel" : "classroom.v3.staffChannel")}</label>)}</fieldset></ChatPopover>}
        <ChatPopover label={`${t("classroomWorkspace.translationSettings")} · ${t(translateEnabled ? "captionAppearance.on" : "captionAppearance.off")}`} icon={<Languages>{!translateEnabled && <><path d="m3 3 18 18" stroke="var(--classroom-panel, #fff)" strokeWidth={5} /><path d="m3 3 18 18" /></>}</Languages>}><label className="classroom-chat-check"><input type="checkbox" checked={translateEnabled} onChange={event => setTranslateEnabled(event.target.checked)} />{t("classroomUpdates.translateChat")}</label><label className="classroom-chat-language">{t("classroomUpdates.chatTranslationLanguage")}<select aria-label={t("classroomUpdates.chatTranslationLanguage")} value={language} disabled={!translateEnabled} onChange={event => setLanguageOverride(event.target.value)}>{captionLanguageSelectOptions("shengwang", locale).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></ChatPopover>
        {canManage && <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild><ClassroomIconButton type="button" className="classroom-chat-management" aria-label={t("classroomWorkspace.messageOptions")}><MoreHorizontal /></ClassroomIconButton></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="classroom-header-menu">
            <DropdownMenuItem disabled={busy || allMuted || !students.length} onSelect={() => onMuteAll(true)}><MessageCircle />{t("classroom.v3.muteAll")}</DropdownMenuItem>
            <DropdownMenuItem disabled={busy || allUnmuted} onSelect={() => onMuteAll(false)}><MessageCircle />{t("classroom.v3.unmuteAllChat")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>}
      </div>
      {scope !== "classroom" && <span className="classroom-chat-scope-badge">{t(scope === "staff" ? "classroom.v3.staffChannel" : "classroom.v3.roomChannel")}</span>}
      {translateEnabled && chatTranslation.unavailable && <p role="status">{t("classroomUpdates.translationUnavailable")}</p>}
      <div
        ref={listRef}
        className="classroom-v3-message-list"
        role="log"
        aria-label={t("classroom.v3.chat")}
        onScroll={() => {
          const list = listRef.current;
          if (!list) return;
          followLatestRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < 48;
          if (followLatestRef.current) setHasNewMessages(false);
        }}
        aria-live="polite"
        aria-relevant="additions"
      >
        {visibleMessages.length === 0 && (scope !== "classroom" || activityFeed.activities.length === 0) && (
          <div className="classroom-v3-panel-empty">
            <MessageCircle />
            <strong>{t("classroom.v3.discussionEmpty")}</strong>
            <p>{t("classroom.v3.discussionHint")}</p>
          </div>
        )}
        {activityFeed.hasMore && scope === "classroom" && <button type="button" disabled={activityFeed.loading} onClick={activityFeed.loadMore}>{t("classroomChat.moreActivities")}</button>}
        {activityFeed.error && scope === "classroom" && <button type="button" onClick={() => { void activityFeed.reload().catch(() => undefined); }}>{t("classroomChat.activityRetry")}</button>}
        {[...visibleMessages.map(message => ({ type: "message" as const, createdAt: message.createdAt, message })), ...(scope === "classroom" ? activityFeed.activities.map(activity => ({ type: "activity" as const, createdAt: activity.startedAt || activity.createdAt, activity })) : [])].sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt)).map(entry => {
          if (entry.type === "activity") return <ActivityChatCard visible={visible && scope === "classroom"} key={"activity:"+entry.activity.id} activity={entry.activity} sessionId={sessionId} shareAccess={shareAccess} student={role === "student"} onChanged={onActivityChanged} onManage={() => setActivityEditorOpen(true)} />;
          const message = entry.message;
          const pending = message.id.startsWith(OPTIMISTIC_MESSAGE_PREFIX);
          return (
            <article
              key={message.id}
              aria-busy={pending}
              className={`${message.senderId === currentUserId ? "is-mine" : ""}${
                pending ? " is-pending" : ""
              }`}
            >
              <div className="classroom-chat-message-meta">
                <span className="classroom-chat-avatar" aria-hidden="true">{Array.from(message.senderName.trim())[0] || "?"}</span>
                <strong title={message.senderName}>{message.senderName}</strong>
                <small>
                  {new Date(message.createdAt).toLocaleTimeString(locale, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </small>
                {!pending && !message.deletedAt && <ChatMessageActions message={message} canManage={canManage} muted={students.find(student=>student.userId===message.senderId)?.chatMuted} onDelete={onDelete} onDeleteMember={onDeleteMember} onMuteMember={onMuteMember} />}

              </div>
              {message.kind === "image" && !message.deletedAt ? <><button type="button" className="classroom-chat-image" onClick={()=>setImageViewer(message.id)} aria-label={t("classroomChat.imageAlt")}><img src={pending && images.attachment ? images.attachment.preview : imageUrl(message.id)} alt={parseImageMessage(message.content)?.caption || t("classroomChat.imageAlt")} loading="lazy" /></button>{parseImageMessage(message.content)?.caption && <p>{parseImageMessage(message.content)?.caption}</p>}</> : <p className={message.deletedAt ? "is-deleted" : ""}>{message.deletedAt ? t("classroom.v3.messageWithdrawn") : message.content}</p>}
              {translateEnabled && message.kind === "text" && !pending && !message.deletedAt && <div className="classroom-v3-message-translation" lang={language}>
                {chatTranslation.translations[message.id]?.status === "completed" ? <><small>{t("classroomUpdates.translated")}</small><p>{chatTranslation.translations[message.id].text}</p></>
                  : chatTranslation.translations[message.id]?.status === "failed" || chatTranslation.translations[message.id]?.status === "pending" ? <button type="button" onClick={chatTranslation.retry}>{t("classroomUpdates.translationFailed")}</button>
                  : <small>{t("classroomUpdates.translationPending")}</small>}
              </div>}
            </article>
          );
        })}
      </div>
      <ActivityQuickCreator sessionId={sessionId} shareAccess={shareAccess} open={quickOpen && canManage} hasActive={activityFeed.activities.some(activity => activity.status === "active")} onClose={() => setQuickOpen(false)} onPublished={onActivityChanged} onAdvanced={() => { setQuickOpen(false); setActivityEditorOpen(true); }} />
      {hasNewMessages && <button type="button" className="classroom-chat-latest" onClick={showLatest}>{t("classroomWorkspace.latest")}</button>}
      {images.error && <p className="classroom-chat-send-error" role="alert">{images.error}</p>}
      {sendFailed && <p className="classroom-chat-send-error" role="alert">{t("classroomWorkspace.sendFailed")}</p>}
      <form className="classroom-v3-chat-form" onSubmit={submit} aria-busy={sending}>
        <div className="classroom-chat-compose-tools"><input hidden type="file" ref={fileInput} accept="image/png,image/jpeg,image/webp" onChange={event=>{const file=event.target.files?.[0];if(file)images.choose(file);event.currentTarget.value=""}} /><ClassroomIconButton type="button" disabled={disabled||sending} aria-label={t("classroomChat.image")} title={t("classroomChat.image")} onClick={()=>fileInput.current?.click()}><ImagePlus/></ClassroomIconButton>{canManage && <ClassroomIconButton type="button" title={interaction.ai} aria-label={interaction.ai} onClick={() => { setScope("classroom"); setQuickOpen(!quickOpen); }}><Sparkles /></ClassroomIconButton>}</div>
        {images.attachment && <div className="classroom-chat-compose-attachment"><img src={images.attachment.preview} alt={t("classroomChat.imageAlt")} /><ClassroomIconButton type="button" disabled={sending} title={t("classroomChat.removeImage")} aria-label={t("classroomChat.removeImage")} onClick={images.clear}><X/></ClassroomIconButton></div>}
        <textarea
          ref={inputRef}
          rows={2}
          onKeyDown={event => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && !composingRef.current && event.nativeEvent.keyCode !== 229 && !window.matchMedia("(max-width:760px), (pointer:coarse)").matches) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          value={value}
          onPaste={event=>{const file=event.clipboardData.files[0];if(file){event.preventDefault();if(!sending&&!disabled)images.choose(file)}}}
          onCompositionStart={() => { composingRef.current = true; }}
          onCompositionEnd={event => { composingRef.current = false; setValue(limitChatContent(event.currentTarget.value)); }}
          onChange={event => setValue(composingRef.current ? event.target.value : limitChatContent(event.target.value))}
          placeholder={
            disabled
              ? t("classroom.v3.messageDisabled")
              : t("classroom.v3.messagePlaceholder")
          }
          disabled={disabled}
          readOnly={sending}
          aria-describedby={[characterCount > 0 ? countId : null, characterCount >= CLASSROOM_CHAT_MAX_CHARACTERS ? limitId : null].filter(Boolean).join(" ") || undefined}
          aria-label={t("classroom.v3.classroomMessage")}
        />
        <div className="classroom-chat-compose-footer">
          <div className="classroom-chat-compose-meta">
            {characterCount > 0 && <span id={countId} className={characterCount >= CLASSROOM_CHAT_MAX_CHARACTERS ? "is-full" : undefined} aria-label={t("classroomWorkspace.characterCount")}>{characterCount} / {CLASSROOM_CHAT_MAX_CHARACTERS}</span>}
            {characterCount >= CLASSROOM_CHAT_MAX_CHARACTERS && <small id={limitId} role="status">{t("classroomWorkspace.characterLimit", { max: CLASSROOM_CHAT_MAX_CHARACTERS })}</small>}
            {sending && <small role="status">{t("classroomWorkspace.sending")}</small>}
          </div>
          <ClassroomIconButton type="submit" className="classroom-chat-send-button" disabled={disabled || sending || characterCount > CLASSROOM_CHAT_MAX_CHARACTERS || (!value.trim() && !images.attachment)} aria-label={t(sending ? "classroom.v3.messageSending" : "classroom.v3.sendMessage")} title={t("classroom.v3.sendMessage")}>
            {sending ? <Loader2 className="animate-spin" /> : <Send />}
          </ClassroomIconButton>
        </div>
      </form>
      <Dialog open={Boolean(viewedMessage)} onOpenChange={open=>{if(!open)setImageViewer(null)}}><DialogContent className="classroom-chat-image-viewer"><DialogTitle className="sr-only">{t("classroomChat.imageAlt")}</DialogTitle>{viewedMessage&&<img src={imageUrl(viewedMessage.id)} alt={parseImageMessage(viewedMessage.content)?.caption||t("classroomChat.imageAlt")} />}</DialogContent></Dialog>
    </div>
  );
}
