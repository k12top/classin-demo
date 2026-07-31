"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Check,
  ChevronRight,
  CircleStop,
  Clock3,
  Download,
  DoorOpen,
  Expand,
  Eye,
  EyeOff,
  FileText,
  Hand,
  Headphones,
  LayoutGrid,
  Languages,
  Lock,
  LockOpen,
  LogOut,
  MessageCircle,
  MessagesSquare,
  Mic,
  MicOff,
  MonitorUp,
  PanelRightClose,
  PanelRightOpen,
  PenTool,
  Presentation,
  Radio,
  ScreenShareOff,
  Send,
  Settings2,
  ShieldCheck,
  Shuffle,
  TimerReset,
  UserRound,
  Users,
  Video,
  VideoOff,
  Wifi,
  X,
} from "lucide-react";
import { FastboardSurface } from "@/components/classroom/fastboard-surface";
import { ClassroomLoading } from "@/components/classroom/classroom-loading";
import {
  buildAccessDeniedUrl,
  type CourseAccessDeniedCode,
} from "@/lib/access-denied-codes";
import { redirectToSsoLogin } from "@/lib/auth-login";
import { tryOAuthRefresh } from "@/lib/auth-refresh-client";
import { useAuth } from "@/lib/auth-context";
import { useTranslation } from "@/lib/i18n/context";
import { createClassroomMediaProvider } from "@/lib/classroom/client/provider-factory";
import { createClassroomSignalingProvider } from "@/lib/classroom/signaling/provider-factory";
import type {
  ClassroomInvalidation,
  ClassroomSignalingProvider,
} from "@/lib/classroom/signaling/types";
import type {
  ClassroomAction,
  ClassroomCaptionSnapshot,
  ClassroomCoursewareSnapshot,
  ClassroomJoinCredential,
  ClassroomMediaProvider,
  ClassroomMediaSnapshot,
  ClassroomMemberSnapshot,
  ClassroomMessageSnapshot,
  ClassroomParticipant,
  ClassroomRuntimeSnapshot,
  ClassroomSessionResponse,
  ClassroomSpaceSnapshot,
  ClassroomQuestionSnapshot,
} from "@/lib/classroom/types";
import {
  classroomLanguageLabel,
  classroomLanguages,
} from "@/lib/classroom/languages";
import {
  CAPTION_LANGUAGE_STORAGE_KEY,
  effectiveCaptionLanguage as resolveEffectiveCaptionLanguage,
  initialCaptionLanguage,
} from "@/lib/classroom/caption-preferences";

type LoadingState = "loading" | "ready" | "error";
type DrawerPanel =
  | "members"
  | "rooms"
  | "questions"
  | "chat"
  | "captions"
  | "courseware"
  | "tools";
type ClassroomLayoutMode = "focus" | "split" | "grid";
type CaptionDisplayMode = "off" | "original" | "bilingual" | "translated";

const EMPTY_MEDIA: ClassroomMediaSnapshot = {
  connectionState: "idle",
  participants: [],
  local: {
    microphoneOn: false,
    cameraOn: false,
    screenSharing: false,
    videoQuality: "hd",
  },
  focusedParticipantId: null,
};

function participantOwnerId(participantId: string): string {
  return participantId.endsWith("::screen")
    ? participantId.slice(0, -"::screen".length)
    : participantId;
}

function initialOf(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

type Translate = ReturnType<typeof useTranslation>["t"];

function roleLabel(
  role: ClassroomMemberSnapshot["role"],
  t: Translate,
): string {
  if (role === "teacher") return t("classroom.v3.roleLead");
  if (role === "assistant") return t("classroom.v3.roleAssistant");
  return t("classroom.v3.roleStudent");
}

function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return [hours, minutes, rest]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function captionTranslation(
  caption: Pick<ClassroomCaptionSnapshot, "translations">,
  language: string,
) {
  const exact = caption.translations[language]?.trim();
  if (exact) return exact;
  const prefix = language.split("-")[0].toLowerCase();
  return (
    Object.entries(caption.translations).find(
      ([code, text]) => code.split("-")[0].toLowerCase() === prefix && text.trim(),
    )?.[1] || ""
  );
}

function mergeCaptions(
  current: ClassroomCaptionSnapshot[],
  incoming: ClassroomCaptionSnapshot,
) {
  const next = new Map(current.map((caption) => [caption.id, caption]));
  next.set(incoming.id, incoming);
  return Array.from(next.values())
    .sort(
      (left, right) =>
        new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime(),
    )
    .slice(-120);
}

function useNow(interval = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), interval);
    return () => window.clearInterval(timer);
  }, [interval]);
  return now;
}

function MediaSurface({
  participant,
  provider,
  displayName,
  className = "",
  showCaption = true,
}: {
  participant: ClassroomParticipant;
  provider: ClassroomMediaProvider;
  displayName: string;
  className?: string;
  showCaption?: boolean;
}) {
  const { t } = useTranslation();
  const targetRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const target = targetRef.current;
    if (!target || !participant.hasVideo) return;
    provider.attachVideo(participant.id, target);
    return () => provider.detachVideo(participant.id, target);
  }, [participant.hasVideo, participant.id, provider]);

  return (
    <div className={`classroom-v3-media ${className}`}>
      <div ref={targetRef} className="classroom-v3-media-video" />
      {!participant.hasVideo && (
        <div className="classroom-v3-media-fallback">
          <span>{initialOf(displayName)}</span>
          <small>
            {participant.kind === "screen"
              ? t("classroom.v3.waitingForSharedContent")
              : t("classroom.v3.cameraOffWithName", { name: displayName })}
          </small>
        </div>
      )}
      {showCaption && (
        <div className="classroom-v3-media-caption">
          <span>{displayName}</span>
          <span>
            {participant.kind === "screen"
              ? t("classroom.v3.screenSharing")
              : participant.hasAudio
                ? t("classroom.v3.speaking")
                : t("classroom.v3.muted")}
          </span>
        </div>
      )}
    </div>
  );
}

function StatusPill({
  media,
  recording,
}: {
  media: ClassroomMediaSnapshot;
  recording: string | null;
}) {
  const { t } = useTranslation();
  const connected = media.connectionState === "connected";
  const recordingActive = ["starting", "recording", "stopping"].includes(
    recording || "",
  );
  return (
    <div className="classroom-v3-statuses">
      <span className={connected ? "is-online" : "is-warning"}>
        <Wifi />
        {connected
          ? t("classroom.v3.connected")
          : t("classroom.v3.reconnecting")}
      </span>
      {recordingActive && (
        <span className="is-recording">
          <i />
          REC
        </span>
      )}
    </div>
  );
}

function LiveRailSeat({
  member,
  participant,
  provider,
  media,
  currentUserId,
  canManage,
  busy,
  onSpotlight,
  onToggleLocalMicrophone,
  onToggleLocalCamera,
  onManageMedia,
  onRemoveStage,
}: {
  member: ClassroomMemberSnapshot;
  participant: ClassroomParticipant | null;
  provider: ClassroomMediaProvider;
  media: ClassroomMediaSnapshot;
  currentUserId: string;
  canManage: boolean;
  busy: boolean;
  onSpotlight: (userId: string) => void;
  onToggleLocalMicrophone: () => void;
  onToggleLocalCamera: () => void;
  onManageMedia: (
    member: ClassroomMemberSnapshot,
    media: "microphone" | "camera",
  ) => void;
  onRemoveStage: (userId: string) => void;
}) {
  const { t } = useTranslation();
  const isSelf = member.userId === currentUserId;
  const microphoneOn = isSelf
    ? media.local.microphoneOn
    : Boolean(participant?.hasAudio);
  const cameraOn = isSelf
    ? media.local.cameraOn
    : Boolean(participant?.hasVideo);
  const canControlSelf = isSelf && Boolean(participant?.isLocal);
  const canControlStudent =
    canManage && member.role === "student" && !isSelf;
  const showControls = canControlSelf || canControlStudent;
  const microphoneControlOn = canControlSelf
    ? microphoneOn
    : member.microphoneAllowed;
  const cameraControlOn = canControlSelf ? cameraOn : member.cameraAllowed;
  const preview = (
    <>
      {participant ? (
        <MediaSurface
          participant={participant}
          provider={provider}
          displayName={member.displayName}
          className="classroom-v3-rail-media"
          showCaption={false}
        />
      ) : (
        <div className="classroom-v3-rail-fallback">
          {member.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={member.avatar} alt="" />
          ) : (
            <span>{initialOf(member.displayName)}</span>
          )}
        </div>
      )}
      <span className="classroom-v3-seat-role">
        {roleLabel(member.role, t)}
      </span>
      <span
        className="classroom-v3-seat-media-state"
        aria-label={t("classroom.v3.mediaState")}
      >
        <i className={microphoneOn ? "is-on" : "is-off"}>
          {microphoneOn ? <Mic /> : <MicOff />}
        </i>
        <i className={cameraOn ? "is-on" : "is-off"}>
          {cameraOn ? <Video /> : <VideoOff />}
        </i>
      </span>
      {!cameraOn && (
        <span className="classroom-v3-camera-off-label">
          {t("classroom.v3.cameraOff")}
        </span>
      )}
    </>
  );

  return (
    <motion.article
      layout
      className={`classroom-v3-seat${member.role !== "student" ? " is-teacher" : ""}${cameraOn ? " has-video" : ""}`}
    >
      {canManage ? (
        <button
          type="button"
          className="classroom-v3-seat-preview"
          onClick={() => onSpotlight(member.userId)}
          data-action-label={t("classroom.v3.focusAction")}
          title={t("classroom.v3.spotlightMember", {
            name: member.displayName,
          })}
        >
          {preview}
        </button>
      ) : (
        <div className="classroom-v3-seat-preview">{preview}</div>
      )}
      <footer>
        <span className="classroom-v3-seat-copy">
          <strong>
            {member.displayName}
            {isSelf && <em>{t("classroom.v3.me")}</em>}
          </strong>
          <small>
            {member.handRaisedAt
              ? t("classroom.v3.handRaised")
              : microphoneOn
                ? t("classroom.v3.speaking")
                : member.online
                  ? t("classroom.v3.online")
                  : t("classroom.v3.offline")}
          </small>
        </span>
        {showControls && (
          <span className="classroom-v3-seat-controls">
            <button
              type="button"
              disabled={busy}
              className={microphoneControlOn ? "is-on" : ""}
              onClick={() =>
                canControlSelf
                  ? onToggleLocalMicrophone()
                  : onManageMedia(member, "microphone")
              }
              title={
                canControlSelf
                  ? microphoneOn
                    ? t("classroom.v3.closeMyMicrophone")
                    : t("classroom.v3.openMyMicrophone")
                  : member.microphoneAllowed
                    ? t("classroom.v3.blockStudentMicrophone")
                    : t("classroom.v3.allowStudentMicrophone")
              }
            >
              {microphoneControlOn ? <Mic /> : <MicOff />}
            </button>
            <button
              type="button"
              disabled={busy}
              className={cameraControlOn ? "is-on" : ""}
              onClick={() =>
                canControlSelf
                  ? onToggleLocalCamera()
                  : onManageMedia(member, "camera")
              }
              title={
                canControlSelf
                  ? cameraOn
                    ? t("classroom.v3.closeMyCamera")
                    : t("classroom.v3.openMyCamera")
                  : member.cameraAllowed
                    ? t("classroom.v3.blockStudentCamera")
                    : t("classroom.v3.allowStudentCamera")
              }
            >
              {cameraControlOn ? <Video /> : <VideoOff />}
            </button>
            {canControlStudent && member.onStage && (
              <button
                type="button"
                disabled={busy}
                className="is-remove"
                onClick={() => onRemoveStage(member.userId)}
                title={t("classroom.v3.removeStage")}
              >
                <X />
              </button>
            )}
          </span>
        )}
      </footer>
    </motion.article>
  );
}

function LiveRail({
  members,
  media,
  provider,
  currentUserId,
  canManage,
  busy,
  onSpotlight,
  onToggleLocalMicrophone,
  onToggleLocalCamera,
  onManageMedia,
  onRemoveStage,
  maxStudentSeats,
  collapsed,
  onToggleCollapsed,
}: {
  members: ClassroomMemberSnapshot[];
  media: ClassroomMediaSnapshot;
  provider: ClassroomMediaProvider;
  currentUserId: string;
  canManage: boolean;
  busy: boolean;
  onSpotlight: (userId: string) => void;
  onToggleLocalMicrophone: () => void;
  onToggleLocalCamera: () => void;
  onManageMedia: (
    member: ClassroomMemberSnapshot,
    media: "microphone" | "camera",
  ) => void;
  onRemoveStage: (userId: string) => void;
  maxStudentSeats: number;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const { t } = useTranslation();
  const teachers = members.filter(
    (member) =>
      member.role !== "student" &&
      (member.online || member.userId === currentUserId),
  );
  const students = members
    .filter((member) => member.role === "student" && member.onStage)
    .slice(0, maxStudentSeats);
  const seatedMembers = [...teachers, ...students];
  const queue = members.filter(
    (member) => member.handRaisedAt && !member.onStage,
  );
  const emptySeats = Math.max(0, maxStudentSeats - students.length);
  const cameraParticipants = new Map(
    media.participants
      .filter((participant) => participant.kind === "camera")
      .map((participant) => [participantOwnerId(participant.id), participant]),
  );
  return (
    <section
      className="classroom-v3-live-rail"
      aria-label={t("classroom.v3.stageSeats")}
      data-collapsed={collapsed}
    >
      <button
        type="button"
        className="classroom-v3-rail-toggle"
        onClick={onToggleCollapsed}
        aria-expanded={!collapsed}
        aria-label={t(
          collapsed
            ? "classroom.v3.expandStageSeats"
            : "classroom.v3.collapseStageSeats",
        )}
        title={t(
          collapsed
            ? "classroom.v3.expandStageSeats"
            : "classroom.v3.collapseStageSeats",
        )}
      >
        <ChevronRight />
      </button>
      <div className="classroom-v3-rail-title">
        <i />
        <span>{t("classroom.v3.stageSeats")}</span>
        <strong>
          {seatedMembers.length} / {teachers.length + maxStudentSeats}
        </strong>
      </div>
      <div className="classroom-v3-seats">
        {seatedMembers.map((member) => (
          <LiveRailSeat
            key={member.userId}
            member={member}
            participant={cameraParticipants.get(member.userId) ?? null}
            provider={provider}
            media={media}
            currentUserId={currentUserId}
            canManage={canManage}
            busy={busy}
            onSpotlight={onSpotlight}
            onToggleLocalMicrophone={onToggleLocalMicrophone}
            onToggleLocalCamera={onToggleLocalCamera}
            onManageMedia={onManageMedia}
            onRemoveStage={onRemoveStage}
          />
        ))}
        {emptySeats > 0 && (
          <motion.div layout className="classroom-v3-seat-empty-summary">
            <span><Users /></span>
            <div>
              <strong>
                {t("classroom.v3.emptySeat")} × {emptySeats}
              </strong>
              <small>{t("classroom.v3.emptySeatHint")}</small>
            </div>
          </motion.div>
        )}
      </div>
      <div className={queue.length ? "classroom-v3-hand-queue has-hands" : "classroom-v3-hand-queue"}>
        <Hand />
        <span>
          {queue.length
            ? t("classroom.v3.handsWaiting", { count: queue.length })
            : t("classroom.v3.noHands")}
        </span>
      </div>
    </section>
  );
}

function DrawerNavigation({
  active,
  onChange,
  counts,
  visiblePanels,
}: {
  active: DrawerPanel | null;
  onChange: (panel: DrawerPanel | null) => void;
  counts: {
    members: number;
    rooms: number;
    questions: number;
    chat: number;
    hands: number;
  };
  visiblePanels: DrawerPanel[];
}) {
  const { t } = useTranslation();
  const items: Array<{
    id: DrawerPanel;
    label: string;
    icon: typeof Users;
    count?: number;
  }> = [
    { id: "members", label: t("classroom.v3.members"), icon: Users, count: counts.members },
    { id: "rooms", label: t("classroom.v3.breakoutRooms"), icon: DoorOpen, count: counts.rooms },
    { id: "questions", label: t("classroom.v3.questions"), icon: MessagesSquare, count: counts.questions },
    { id: "chat", label: t("classroom.v3.chat"), icon: MessageCircle, count: counts.chat },
    { id: "captions", label: t("classroom.v3.captions"), icon: Languages },
    { id: "courseware", label: t("classroom.v3.courseware"), icon: BookOpen },
    { id: "tools", label: t("classroom.v3.tools"), icon: LayoutGrid, count: counts.hands },
  ];
  return (
    <nav
      className="classroom-v3-tool-rail"
      aria-label={t("classroom.v3.classroomTools")}
    >
      {items.filter((item) => visiblePanels.includes(item.id)).map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            className={active === item.id ? "is-active" : ""}
            onClick={() => onChange(active === item.id ? null : item.id)}
            aria-pressed={active === item.id}
            title={item.label}
          >
            <Icon />
            <span>{item.label}</span>
            {Boolean(item.count) && <i>{item.count}</i>}
          </button>
        );
      })}
    </nav>
  );
}

function MemberPanel({
  members,
  canManage,
  onAction,
}: {
  members: ClassroomMemberSnapshot[];
  canManage: boolean;
  onAction: (action: ClassroomAction) => void;
}) {
  const { t } = useTranslation();
  const sorted = [...members].sort((a, b) => {
    if (a.role !== b.role) {
      const order = { teacher: 0, assistant: 1, student: 2 };
      return order[a.role] - order[b.role];
    }
    if (Boolean(a.handRaisedAt) !== Boolean(b.handRaisedAt)) {
      return a.handRaisedAt ? -1 : 1;
    }
    return a.displayName.localeCompare(b.displayName);
  });
  return (
    <div className="classroom-v3-panel-body">
      <div className="classroom-v3-panel-heading">
        <div>
          <small>{t("classroom.v3.rosterEyebrow")}</small>
          <h2>{t("classroom.v3.memberTitle")}</h2>
        </div>
        <span>
          {t("classroom.v3.onlineCount", {
            count: members.filter((member) => member.online).length,
          })}
        </span>
      </div>
      {canManage && (
        <button
          type="button"
          className="classroom-v3-wide-action"
          onClick={() => onAction({ type: "muteAll", muted: true })}
        >
          <MessageCircle />
          {t("classroom.v3.muteAll")}
        </button>
      )}
      <div className="classroom-v3-member-list">
        {sorted.map((member) => (
          <motion.article layout key={member.userId}>
            <span className="classroom-v3-member-avatar">
              {member.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={member.avatar} alt="" />
              ) : (
                initialOf(member.displayName)
              )}
              <i className={member.online ? "is-online" : ""} />
            </span>
            <span className="classroom-v3-member-copy">
              <strong>{member.displayName}</strong>
              <small>
                {roleLabel(member.role, t)}
                {member.handRaisedAt
                  ? ` · ${t("classroom.v3.handRaised")}`
                  : ""}
              </small>
            </span>
            {member.role === "student" && canManage && (
              <span className="classroom-v3-member-actions">
                {member.handRaisedAt && !member.onStage && (
                  <button
                    type="button"
                    onClick={() =>
                      onAction({
                        type: "inviteStage",
                        targetUserId: member.userId,
                      })
                    }
                    title={t("classroom.v3.inviteStage")}
                  >
                    <ChevronRight />
                  </button>
                )}
                {member.onStage && (
                  <button
                    type="button"
                    onClick={() =>
                      onAction({
                        type: "removeStage",
                        targetUserId: member.userId,
                      })
                    }
                    title={t("classroom.v3.removeStage")}
                  >
                    <X />
                  </button>
                )}
                <button
                  type="button"
                  className={member.microphoneAllowed ? "is-on" : ""}
                  onClick={() =>
                    onAction({
                      type: "setMediaAllowed",
                      targetUserId: member.userId,
                      microphoneAllowed: !member.microphoneAllowed,
                      cameraAllowed: member.cameraAllowed,
                    })
                  }
                  title={
                    member.microphoneAllowed
                      ? t("classroom.v3.blockSpeaking")
                      : t("classroom.v3.allowSpeaking")
                  }
                >
                  {member.microphoneAllowed ? <Mic /> : <MicOff />}
                </button>
                <button
                  type="button"
                  className={member.whiteboardWritable ? "is-on" : ""}
                  disabled={!member.onStage}
                  onClick={() =>
                    onAction({
                      type: "setWhiteboardWritable",
                      targetUserId: member.userId,
                      writable: !member.whiteboardWritable,
                    })
                  }
                  title={
                    member.onStage
                      ? t("classroom.v3.whiteboardPermission")
                      : t("classroom.v3.whiteboardPermissionHint")
                  }
                >
                  <PenTool />
                </button>
                <button
                  type="button"
                  className={member.chatMuted ? "is-danger" : ""}
                  onClick={() =>
                    onAction({
                      type: "setMemberMuted",
                      targetUserId: member.userId,
                      muted: !member.chatMuted,
                    })
                  }
                  title={
                    member.chatMuted
                      ? t("classroom.v3.unmuteChat")
                      : t("classroom.v3.muteChat")
                  }
                >
                  {member.chatMuted ? <MessageCircle /> : <ShieldCheck />}
                </button>
              </span>
            )}
          </motion.article>
        ))}
      </div>
    </div>
  );
}

function ChatPanel({
  messages,
  currentUserId,
  role,
  spaces,
  activeSpaceId,
  canManage,
  disabled,
  onSend,
  onDelete,
}: {
  messages: ClassroomMessageSnapshot[];
  currentUserId: string;
  role: ClassroomMemberSnapshot["role"];
  spaces: ClassroomSpaceSnapshot[];
  activeSpaceId: string | null;
  canManage: boolean;
  disabled: boolean;
  onSend: (
    content: string,
    context: {
      scope: "classroom" | "room" | "staff";
      spaceId?: string | null;
    },
  ) => Promise<void>;
  onDelete: (messageId: string) => void;
}) {
  const { t, locale } = useTranslation();
  const [value, setValue] = useState("");
  const [scope, setScope] = useState<"classroom" | "room" | "staff">(
    activeSpaceId ? "room" : "classroom",
  );
  const roomId = activeSpaceId || spaces.find((space) => space.isAssigned)?.id || null;
  const visibleMessages = messages.filter((message) => {
    if (scope === "room") return message.scope === "room" && message.spaceId === roomId;
    return message.scope === scope;
  });
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [visibleMessages.length]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const content = value.trim();
    if (!content || disabled) return;
    setValue("");
    await onSend(content, { scope, spaceId: scope === "room" ? roomId : null });
  }

  return (
    <div className="classroom-v3-panel-body is-chat">
      <div className="classroom-v3-panel-heading">
        <div>
          <small>{t("classroom.v3.chatEyebrow")}</small>
          <h2>{t("classroom.v3.discussionTitle")}</h2>
        </div>
        <span>{t("classroom.v3.messageCount", { count: visibleMessages.length })}</span>
      </div>
      <nav className="classroom-v3-chat-scopes">
        <button type="button" className={scope === "classroom" ? "is-active" : ""} onClick={() => setScope("classroom")}>
          {t("classroom.v3.mainChannel")}
        </button>
        {roomId ? (
          <button type="button" className={scope === "room" ? "is-active" : ""} onClick={() => setScope("room")}>
            {t("classroom.v3.roomChannel")}
          </button>
        ) : null}
        {role !== "student" ? (
          <button type="button" className={scope === "staff" ? "is-active" : ""} onClick={() => setScope("staff")}>
            {t("classroom.v3.staffChannel")}
          </button>
        ) : null}
      </nav>
      <div className="classroom-v3-message-list">
        {visibleMessages.length === 0 && (
          <div className="classroom-v3-panel-empty">
            <MessageCircle />
            <strong>{t("classroom.v3.discussionEmpty")}</strong>
            <p>{t("classroom.v3.discussionHint")}</p>
          </div>
        )}
        {visibleMessages.map((message) => (
          <article
            key={message.id}
            className={
              message.senderId === currentUserId ? "is-mine" : ""
            }
          >
            <div>
              <strong>{message.senderName}</strong>
              <small>
                {new Date(message.createdAt).toLocaleTimeString(locale, {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </small>
              {canManage && !message.deletedAt && (
                <button
                  type="button"
                  onClick={() => onDelete(message.id)}
                  title={t("classroom.v3.withdrawMessage")}
                >
                  <X />
                </button>
              )}
            </div>
            <p className={message.deletedAt ? "is-deleted" : ""}>
              {message.deletedAt
                ? t("classroom.v3.messageWithdrawn")
                : message.content}
            </p>
          </article>
        ))}
        <div ref={endRef} />
      </div>
      <form className="classroom-v3-chat-form" onSubmit={submit}>
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={
            disabled
              ? t("classroom.v3.messageDisabled")
              : t("classroom.v3.messagePlaceholder")
          }
          disabled={disabled}
          maxLength={1000}
          aria-label={t("classroom.v3.classroomMessage")}
        />
        <button type="submit" disabled={disabled || !value.trim()}>
          <Send />
        </button>
      </form>
    </div>
  );
}

function BreakoutPanel({
  spaces,
  members,
  role,
  activeSpaceId,
  roomMedia,
  roomProvider,
  busy,
  onCreate,
  onAutoAssign,
  onSpaceAction,
  onAssign,
  onConnect,
}: {
  spaces: ClassroomSpaceSnapshot[];
  members: ClassroomMemberSnapshot[];
  role: ClassroomMemberSnapshot["role"];
  activeSpaceId: string | null;
  roomMedia: ClassroomMediaSnapshot;
  roomProvider: ClassroomMediaProvider | null;
  busy: boolean;
  onCreate: (count: number, capacity: number | null) => void;
  onAutoAssign: () => void;
  onSpaceAction: (
    action: "open" | "close" | "permissions" | "removeMember",
    input?: {
      spaceId?: string;
      targetUserId?: string;
      microphoneAllowed?: boolean;
      cameraAllowed?: boolean;
      screenShareAllowed?: boolean;
    },
  ) => void;
  onAssign: (
    spaceId: string,
    targetUserId: string,
    role: "assistant" | "student",
  ) => void;
  onConnect: (spaceId: string) => void;
}) {
  const { t } = useTranslation();
  const [count, setCount] = useState(4);
  const [capacity, setCapacity] = useState(12);
  const assignedIds = new Set(
    spaces.flatMap((space) => space.members.map((member) => member.userId)),
  );
  const unassigned = members.filter(
    (member) =>
      member.role !== "teacher" &&
      !assignedIds.has(member.userId),
  );
  const activeSpace = spaces.find((space) => space.id === activeSpaceId) ?? null;

  return (
    <div className="classroom-v3-panel-body is-breakouts">
      <div className="classroom-v3-panel-heading">
        <div>
          <small>{t("classroom.v3.breakoutEyebrow")}</small>
          <h2>{t("classroom.v3.breakoutRooms")}</h2>
        </div>
        <span>{t("classroom.v3.roomCount", { count: spaces.length })}</span>
      </div>

      {role === "teacher" && spaces.length === 0 ? (
        <section className="classroom-v3-breakout-setup">
          <p>{t("classroom.v3.breakoutSetupHint")}</p>
          <div>
            <label>
              <span>{t("classroom.v3.roomCountLabel")}</span>
              <input
                type="number"
                min={1}
                max={20}
                value={count}
                onChange={(event) => setCount(Number(event.target.value))}
              />
            </label>
            <label>
              <span>{t("classroom.v3.roomCapacity")}</span>
              <input
                type="number"
                min={2}
                max={50}
                value={capacity}
                onChange={(event) => setCapacity(Number(event.target.value))}
              />
            </label>
          </div>
          <button type="button" disabled={busy} onClick={() => onCreate(count, capacity)}>
            <DoorOpen />
            {t("classroom.v3.createBreakouts")}
          </button>
        </section>
      ) : null}

      {role === "teacher" && spaces.length > 0 ? (
        <div className="classroom-v3-breakout-command">
          <button type="button" disabled={busy} onClick={onAutoAssign}>
            <Shuffle />
            {t("classroom.v3.autoAssign")}
          </button>
          <button type="button" disabled={busy} onClick={() => onSpaceAction("open")}>
            <DoorOpen />
            {t("classroom.v3.openAllRooms")}
          </button>
          <button type="button" disabled={busy} onClick={() => onSpaceAction("close")}>
            <CircleStop />
            {t("classroom.v3.closeAllRooms")}
          </button>
        </div>
      ) : null}

      {spaces.length === 0 && role !== "teacher" ? (
        <div className="classroom-v3-panel-empty">
          <DoorOpen />
          <strong>{t("classroom.v3.noAssignedRoom")}</strong>
          <p>{t("classroom.v3.waitForRoomAssignment")}</p>
        </div>
      ) : null}

      <div className="classroom-v3-breakout-list">
        {spaces.map((space) => (
          <article
            key={space.id}
            className={activeSpaceId === space.id ? "is-active" : ""}
            data-status={space.status}
          >
            <header>
              <span><i />{space.name}</span>
              <small>
                {space.memberCount}{space.capacity ? `/${space.capacity}` : ""}
              </small>
              <button
                type="button"
                disabled={space.status !== "open" || busy}
                onClick={() => onConnect(space.id)}
                title={t("classroom.v3.listenRoom")}
              >
                <Headphones />
              </button>
              {role === "teacher" && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    onSpaceAction(space.status === "open" ? "close" : "open", {
                      spaceId: space.id,
                    })
                  }
                >
                  {space.status === "open" ? <CircleStop /> : <DoorOpen />}
                </button>
              )}
            </header>

            <div className="classroom-v3-breakout-members">
              {space.members.map((member) => (
                <div key={member.userId}>
                  <span className="classroom-v3-breakout-avatar">
                    {member.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={member.avatar} alt="" />
                    ) : initialOf(member.displayName)}
                  </span>
                  <span>
                    <strong>{member.displayName}</strong>
                    <small>{roleLabel(member.role, t)}</small>
                  </span>
                  {role !== "student" && member.role === "student" ? (
                    <span className="classroom-v3-breakout-member-actions">
                      <button
                        type="button"
                        className={member.microphoneAllowed ? "is-on" : ""}
                        onClick={() =>
                          onSpaceAction("permissions", {
                            spaceId: space.id,
                            targetUserId: member.userId,
                            microphoneAllowed: !member.microphoneAllowed,
                          })
                        }
                        title={t("classroom.v3.microphone")}
                      >
                        {member.microphoneAllowed ? <Mic /> : <MicOff />}
                      </button>
                      <button
                        type="button"
                        className={member.cameraAllowed ? "is-on" : ""}
                        onClick={() =>
                          onSpaceAction("permissions", {
                            spaceId: space.id,
                            targetUserId: member.userId,
                            cameraAllowed: !member.cameraAllowed,
                          })
                        }
                        title={t("classroom.v3.camera")}
                      >
                        {member.cameraAllowed ? <Video /> : <VideoOff />}
                      </button>
                      <button
                        type="button"
                        className={member.screenShareAllowed ? "is-on" : ""}
                        onClick={() =>
                          onSpaceAction("permissions", {
                            spaceId: space.id,
                            targetUserId: member.userId,
                            screenShareAllowed: !member.screenShareAllowed,
                          })
                        }
                        title={t("classroom.v3.allowStudentShare")}
                      >
                        <MonitorUp />
                      </button>
                      {role === "teacher" ? (
                        <button
                          type="button"
                          onClick={() =>
                            onSpaceAction("removeMember", {
                              spaceId: space.id,
                              targetUserId: member.userId,
                            })
                          }
                          title={t("classroom.v3.removeFromRoom")}
                        >
                          <X />
                        </button>
                      ) : null}
                    </span>
                  ) : null}
                </div>
              ))}
              {space.members.length === 0 ? (
                <p>{t("classroom.v3.emptyBreakoutRoom")}</p>
              ) : null}
            </div>

            {role === "teacher" && unassigned.length > 0 ? (
              <select
                value=""
                onChange={(event) => {
                  const member = unassigned.find(
                    (candidate) => candidate.userId === event.target.value,
                  );
                  if (member) onAssign(space.id, member.userId, member.role === "assistant" ? "assistant" : "student");
                }}
                aria-label={t("classroom.v3.assignMember")}
              >
                <option value="">{t("classroom.v3.assignMember")}</option>
                {unassigned.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.displayName} · {roleLabel(member.role, t)}
                  </option>
                ))}
              </select>
            ) : null}
          </article>
        ))}
      </div>

      {activeSpace && roomProvider ? (
        <section className="classroom-v3-room-monitor">
          <header>
            <span><i />{activeSpace.name}</span>
            <small>{t("classroom.v3.roomAudioConnected")}</small>
          </header>
          <div>
            {roomMedia.participants.map((participant) => {
              const ownerId = participantOwnerId(participant.id);
              const member = activeSpace.members.find((item) => item.userId === ownerId);
              return (
                <MediaSurface
                  key={participant.id}
                  participant={participant}
                  provider={roomProvider}
                  displayName={member?.displayName || participant.displayName}
                  className="classroom-v3-room-media"
                  showCaption={false}
                />
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function QuestionsPanel({
  questions,
  role,
  spaceId,
  busy,
  onAsk,
  onAction,
}: {
  questions: ClassroomQuestionSnapshot[];
  role: ClassroomMemberSnapshot["role"];
  spaceId: string | null;
  busy: boolean;
  onAsk: (content: string, spaceId: string | null) => Promise<void>;
  onAction: (
    questionId: string,
    action: "promote" | "answer" | "dismiss" | "reopen",
    answer?: string,
  ) => void;
}) {
  const { t, locale } = useTranslation();
  const [value, setValue] = useState("");
  const [answering, setAnswering] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  return (
    <div className="classroom-v3-panel-body is-questions">
      <div className="classroom-v3-panel-heading">
        <div>
          <small>{t("classroom.v3.questionsEyebrow")}</small>
          <h2>{t("classroom.v3.questions")}</h2>
        </div>
        <span>{questions.filter((item) => item.status === "open").length}</span>
      </div>
      {role !== "teacher" ? (
        <form
          className="classroom-v3-question-form"
          onSubmit={(event) => {
            event.preventDefault();
            const content = value.trim();
            if (!content) return;
            setValue("");
            void onAsk(content, spaceId);
          }}
        >
          <textarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
            maxLength={500}
            placeholder={t("classroom.v3.questionPlaceholder")}
          />
          <button type="submit" disabled={busy || !value.trim()}>
            <Send />{t("classroom.v3.askQuestion")}
          </button>
        </form>
      ) : null}
      <div className="classroom-v3-question-list">
        {questions.length === 0 ? (
          <div className="classroom-v3-panel-empty">
            <MessagesSquare />
            <strong>{t("classroom.v3.noQuestions")}</strong>
            <p>{t("classroom.v3.noQuestionsHint")}</p>
          </div>
        ) : questions.map((question) => (
          <article key={question.id} data-status={question.status}>
            <header>
              <strong>{question.askerName}</strong>
              {question.spaceName ? <span>{question.spaceName}</span> : null}
              <small>{new Date(question.createdAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}</small>
            </header>
            <p>{question.content}</p>
            {question.answer ? <blockquote>{question.answer}</blockquote> : null}
            {role !== "student" ? (
              <footer>
                {question.status === "open" ? (
                  <button type="button" onClick={() => onAction(question.id, "promote")}>
                    {t("classroom.v3.promoteQuestion")}
                  </button>
                ) : null}
                {answering === question.id ? (
                  <span>
                    <input value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder={t("classroom.v3.answerPlaceholder")} />
                    <button type="button" disabled={!answer.trim()} onClick={() => { onAction(question.id, "answer", answer); setAnswering(null); setAnswer(""); }}>
                      <Check />
                    </button>
                  </span>
                ) : question.status !== "answered" ? (
                  <button type="button" onClick={() => setAnswering(question.id)}>
                    {t("classroom.v3.answerQuestion")}
                  </button>
                ) : null}
                {question.status !== "dismissed" ? (
                  <button type="button" onClick={() => onAction(question.id, "dismiss")}>
                    {t("classroom.v3.dismissQuestion")}
                  </button>
                ) : (
                  <button type="button" onClick={() => onAction(question.id, "reopen")}>
                    {t("classroom.v3.reopenQuestion")}
                  </button>
                )}
              </footer>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}

function CoursewarePanel({
  items,
  canManage,
  onOpen,
  onUpdate,
}: {
  items: ClassroomCoursewareSnapshot[];
  canManage: boolean;
  onOpen: (courseware: ClassroomCoursewareSnapshot) => void;
  onUpdate: (
    coursewareId: string,
    update: Partial<
      Pick<
        ClassroomCoursewareSnapshot,
        "studentCanView" | "studentCanDownload" | "whiteboardEnabled"
      >
    >,
  ) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="classroom-v3-panel-body">
      <div className="classroom-v3-panel-heading">
        <div>
          <small>{t("classroom.v3.courseFilesEyebrow")}</small>
          <h2>{t("classroom.v3.coursewareTitle")}</h2>
        </div>
        <span>{t("classroom.v3.coursewareCount", { count: items.length })}</span>
      </div>
      <div className="classroom-v3-courseware-list">
        {items.length === 0 && (
          <div className="classroom-v3-panel-empty">
            <BookOpen />
            <strong>{t("classroom.v3.coursewareEmpty")}</strong>
            <p>{t("classroom.v3.coursewareHint")}</p>
          </div>
        )}
        {items.map((item) => (
          <article key={item.id}>
            <span className="classroom-v3-file-icon">
              <FileText />
              <small>{item.ext.toUpperCase()}</small>
            </span>
            <div className="classroom-v3-file-copy">
              <strong>{item.name}</strong>
              <small>
                {(item.size / 1024 / 1024).toFixed(1)} MB
                {item.whiteboardEnabled ? ` · ${item.taskStatus}` : ""}
              </small>
              {item.conversionError && <em>{item.conversionError}</em>}
            </div>
            <div className="classroom-v3-file-actions">
              {item.whiteboardEnabled && (
                <button
                  type="button"
                  onClick={() => onOpen(item)}
                  disabled={item.taskStatus === "Failed"}
                  title={t("classroom.v3.openOnWhiteboard")}
                >
                  <Presentation />
                </button>
              )}
              {item.downloadUrl && (
                <a
                  href={item.downloadUrl}
                  title={t("classroom.v3.downloadCourseware")}
                >
                  <Download />
                </a>
              )}
            </div>
            {canManage && (
              <div className="classroom-v3-file-permissions">
                <label>
                  <input
                    type="checkbox"
                    checked={item.studentCanView}
                    onChange={(event) =>
                      onUpdate(item.id, {
                        studentCanView: event.target.checked,
                      })
                    }
                  />
                  <span>{item.studentCanView ? <Eye /> : <EyeOff />}</span>
                  {t("classroom.v3.studentCanView")}
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={item.studentCanDownload}
                    onChange={(event) =>
                      onUpdate(item.id, {
                        studentCanDownload: event.target.checked,
                      })
                    }
                  />
                  <span><Download /></span>
                  {t("classroom.v3.studentCanDownload")}
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={item.whiteboardEnabled}
                    onChange={(event) =>
                      onUpdate(item.id, {
                        whiteboardEnabled: event.target.checked,
                      })
                    }
                  />
                  <span><PenTool /></span>
                  {t("classroom.v3.addToWhiteboard")}
                </label>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

function CaptionsPanel({
  runtime,
  captions,
  canManage,
  displayMode,
  preferredLanguage,
  onDisplayModeChange,
  onPreferredLanguageChange,
  onAction,
}: {
  runtime: ClassroomRuntimeSnapshot;
  captions: ClassroomCaptionSnapshot[];
  canManage: boolean;
  displayMode: CaptionDisplayMode;
  preferredLanguage: string;
  onDisplayModeChange: (mode: CaptionDisplayMode) => void;
  onPreferredLanguageChange: (language: string) => void;
  onAction: (action: ClassroomAction) => void;
}) {
  const { t, locale } = useTranslation();
  const [enabled, setEnabled] = useState(runtime.interpretation.enabled);
  const [provider, setProvider] = useState<"shengwang" | "wordly">(
    runtime.interpretation.provider,
  );
  const [sourceLanguage, setSourceLanguage] = useState(
    runtime.interpretation.sourceLanguage,
  );
  const [targetLanguages, setTargetLanguages] = useState<string[]>(
    runtime.interpretation.targetLanguages,
  );

  const visibleCaptions = captions.slice(-80);
  return (
    <div className="classroom-v3-panel-body is-captions">
      <div className="classroom-v3-panel-heading">
        <div>
          <small>{t("classroom.v3.interpretationEyebrow")}</small>
          <h2>{t("classroom.v3.captionsTitle")}</h2>
        </div>
        <span data-status={runtime.interpretation.status}>
          {runtime.interpretation.enabled
            ? runtime.interpretation.status === "running"
              ? t("classroom.v3.live")
              : runtime.interpretation.status === "failed"
                ? t("classroom.v3.abnormal")
                : t("classroom.v3.preparing")
            : t("classroom.v3.notEnabled")}
        </span>
      </div>

      <div className="classroom-v3-caption-view-settings">
        <label>
          <span>{t("classroom.v3.displayMode")}</span>
          <select
            value={displayMode}
            onChange={(event) =>
              onDisplayModeChange(event.target.value as CaptionDisplayMode)
            }
          >
            <option value="off">{t("classroom.v3.captionsOff")}</option>
            <option value="original">{t("classroom.v3.originalOnly")}</option>
            <option value="bilingual">{t("classroom.v3.bilingual")}</option>
            <option value="translated">{t("classroom.v3.translatedOnly")}</option>
          </select>
        </label>
        <label>
          <span>{t("classroom.v3.myCaptionLanguage")}</span>
          <select
            value={preferredLanguage}
            onChange={(event) => onPreferredLanguageChange(event.target.value)}
          >
            {(runtime.interpretation.targetLanguages.length
              ? classroomLanguages.filter((language) =>
                  runtime.interpretation.targetLanguages.includes(language.code),
                )
              : classroomLanguages
            ).map((language) => (
              <option key={language.code} value={language.code}>
                {language.nativeLabel}
              </option>
            ))}
          </select>
        </label>
      </div>

      {canManage ? (
        <section className="classroom-v3-interpretation-config">
          <header>
            <div>
              <strong>{t("classroom.v3.interpretation")}</strong>
              <small>{t("classroom.v3.interpretationHint")}</small>
            </div>
            <button
              type="button"
              className={enabled ? "is-on" : ""}
              onClick={() => setEnabled((current) => !current)}
              aria-pressed={enabled}
            >
              <i />
              {enabled
                ? t("classroom.v3.enabled")
                : t("classroom.v3.disabled")}
            </button>
          </header>
          <div
            className="classroom-v3-provider-choice"
            role="radiogroup"
            aria-label={t("classroom.v3.translationService")}
          >
            <button
              type="button"
              className={provider === "shengwang" ? "is-selected" : ""}
              onClick={() => setProvider("shengwang")}
            >
              <strong>{t("classroom.v3.shengwang")}</strong>
              <small>{t("classroom.v3.shengwangIntegrated")}</small>
            </button>
            <button
              type="button"
              className={provider === "wordly" ? "is-selected" : ""}
              onClick={() => setProvider("wordly")}
            >
              <strong>Wordly</strong>
              <small>{t("classroom.v3.wordlyIntegrated")}</small>
            </button>
          </div>
          <label className="classroom-v3-interpretation-source">
            <span>{t("classroom.v3.sourceLanguage")}</span>
            <select
              value={sourceLanguage}
              onChange={(event) => {
                setSourceLanguage(event.target.value);
                setTargetLanguages((current) =>
                  current.filter((language) => language !== event.target.value),
                );
              }}
            >
              {classroomLanguages.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.nativeLabel} · {language.label}
                </option>
              ))}
            </select>
          </label>
          <div className="classroom-v3-language-targets">
            <span>
              {t("classroom.v3.targetLanguages", {
                count: targetLanguages.length,
                limit: provider === "shengwang" ? 10 : 20,
              })}
            </span>
            <div>
              {classroomLanguages
                .filter((language) => language.code !== sourceLanguage)
                .map((language) => {
                  const selected = targetLanguages.includes(language.code);
                  const limit = provider === "shengwang" ? 10 : 20;
                  return (
                    <button
                      key={language.code}
                      type="button"
                      className={selected ? "is-selected" : ""}
                      disabled={!selected && targetLanguages.length >= limit}
                      onClick={() =>
                        setTargetLanguages((current) =>
                          selected
                            ? current.filter((item) => item !== language.code)
                            : [...current, language.code],
                        )
                      }
                    >
                      {language.nativeLabel}
                    </button>
                  );
                })}
            </div>
          </div>
          <button
            type="button"
            className="classroom-v3-interpretation-save"
            onClick={() =>
              onAction({
                type: "setInterpretation",
                enabled,
                provider,
                sourceLanguage,
                targetLanguages,
              })
            }
          >
            <Languages />
            {t("classroom.v3.applyInterpretation")}
          </button>
          {runtime.interpretation.error ? (
            <p className="classroom-v3-interpretation-error">
              <AlertCircle />
              {runtime.interpretation.error}
            </p>
          ) : null}
        </section>
      ) : null}

      <div className="classroom-v3-caption-history">
        {!visibleCaptions.length ? (
          <div className="classroom-v3-panel-empty">
            <Languages />
            <strong>{t("classroom.v3.captionsWaiting")}</strong>
            <p>{t("classroom.v3.captionsWaitingHint")}</p>
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
  );
}

function ToolsPanel({
  runtime,
  canManage,
  onAction,
  onFullscreen,
  onSettings,
}: {
  runtime: ClassroomRuntimeSnapshot;
  canManage: boolean;
  onAction: (action: ClassroomAction) => void;
  onFullscreen: () => void;
  onSettings: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="classroom-v3-panel-body">
      <div className="classroom-v3-panel-heading">
        <div>
          <small>{t("classroom.v3.teachingToolsEyebrow")}</small>
          <h2>{t("classroom.v3.classroomTools")}</h2>
        </div>
      </div>
      <div className="classroom-v3-tool-grid">
        {[5, 10, 20].map((minutes) => (
          <button
            key={minutes}
            type="button"
            disabled={!canManage}
            onClick={() =>
              onAction({ type: "startTimer", durationSec: minutes * 60 })
            }
          >
            <Clock3 />
            <strong>{t("classroom.v3.minutes", { count: minutes })}</strong>
            <small>{t("classroom.v3.classTimer")}</small>
          </button>
        ))}
        <button
          type="button"
          disabled={!canManage || !runtime.timerStartedAt}
          onClick={() => onAction({ type: "resetTimer" })}
        >
          <TimerReset />
          <strong>{t("classroom.v3.resetTimer")}</strong>
          <small>{t("classroom.v3.resetTimerHint")}</small>
        </button>
        <button type="button" onClick={onFullscreen}>
          <Expand />
          <strong>{t("classroom.v3.fullscreen")}</strong>
          <small>{t("classroom.v3.fullscreenHint")}</small>
        </button>
        <button type="button" onClick={onSettings}>
          <Settings2 />
          <strong>{t("classroom.v3.deviceSettings")}</strong>
          <small>{t("classroom.v3.deviceSettingsHint")}</small>
        </button>
      </div>
    </div>
  );
}

function DeviceSettings({
  open,
  provider,
  media,
  onClose,
}: {
  open: boolean;
  provider: ClassroomMediaProvider | null;
  media: ClassroomMediaSnapshot;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [devices, setDevices] = useState<{
    microphones: MediaDeviceInfo[];
    cameras: MediaDeviceInfo[];
  }>({ microphones: [], cameras: [] });
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open || !provider) return;
    void provider
      .listDevices()
      .then(setDevices)
      .catch((reason) =>
        setError(
          reason instanceof Error
            ? reason.message
            : t("classroom.v3.deviceReadFailed"),
        ),
      );
  }, [open, provider, t]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="classroom-v3-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => event.target === event.currentTarget && onClose()}
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-label={t("classroom.v3.deviceSettings")}
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
          >
            <header>
              <div>
                <small>{t("classroom.v3.classroomSetupEyebrow")}</small>
                <h2>{t("classroom.v3.deviceSettings")}</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                title={t("classroom.v3.close")}
              >
                <X />
              </button>
            </header>
            <label>
              <span>{t("classroom.v3.microphone")}</span>
              <select
                defaultValue=""
                onChange={(event) =>
                  void provider?.setMicrophoneDevice(event.target.value)
                }
              >
                <option value="" disabled>
                  {t("classroom.v3.selectMicrophone")}
                </option>
                {devices.microphones.map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `${t("classroom.v3.microphone")} ${index + 1}`}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{t("classroom.v3.camera")}</span>
              <select
                defaultValue=""
                onChange={(event) =>
                  void provider?.setCameraDevice(event.target.value)
                }
              >
                <option value="" disabled>
                  {t("classroom.v3.selectCamera")}
                </option>
                {devices.cameras.map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `${t("classroom.v3.camera")} ${index + 1}`}
                  </option>
                ))}
              </select>
            </label>
            <fieldset>
              <legend>{t("classroom.v3.cameraQuality")}</legend>
              {[
                ["economy", t("classroom.v3.economy"), "640 × 360"],
                ["hd", t("classroom.v3.hd"), "1280 × 720"],
                ["fullHd", t("classroom.v3.fullHd"), "1920 × 1080"],
              ].map(([value, label, detail]) => (
                <button
                  key={value}
                  type="button"
                  className={media.local.videoQuality === value ? "is-selected" : ""}
                  onClick={() =>
                    void provider?.setVideoQuality(
                      value as "economy" | "hd" | "fullHd",
                    )
                  }
                >
                  <span>{label}</span>
                  <small>{detail}</small>
                  {media.local.videoQuality === value && <Check />}
                </button>
              ))}
            </fieldset>
            {error && <p className="classroom-v3-modal-error">{error}</p>}
            <footer>
              <p>{t("classroom.v3.screenQualityHint")}</p>
              <button type="button" onClick={onClose}>
                {t("classroom.v3.done")}
              </button>
            </footer>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function ClassroomV3({ recorderMode = false }: { recorderMode?: boolean }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { t, locale } = useTranslation();
  const requestedSessionId = searchParams.get("sessionId") || "";
  const legacyCourseId = searchParams.get("courseId") || "";
  // `courseId` remains the local classroom-scope identifier to keep the
  // media/signaling code compact. For V3 links it is the authoritative
  // session id; legacy links resolve their course id to a default session.
  const courseId = requestedSessionId || legacyCourseId;
  const shareAccess = searchParams.get("shareAccess") || "";
  const recorderToken = searchParams.get("recorderToken") || "";
  const isRecorder =
    recorderMode ||
    searchParams.get("is_recorder") === "1" ||
    Boolean(recorderToken);
  const [loadingState, setLoadingState] = useState<LoadingState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [sessionData, setSessionData] =
    useState<ClassroomSessionResponse | null>(null);
  const sessionRef = useRef<ClassroomSessionResponse | null>(null);
  const [media, setMedia] = useState<ClassroomMediaSnapshot>(EMPTY_MEDIA);
  const [mediaProvider, setMediaProvider] =
    useState<ClassroomMediaProvider | null>(null);
  const providerRef = useRef<ClassroomMediaProvider | null>(null);
  const [roomMedia, setRoomMedia] = useState<ClassroomMediaSnapshot>(EMPTY_MEDIA);
  const [roomProvider, setRoomProvider] =
    useState<ClassroomMediaProvider | null>(null);
  const roomProviderRef = useRef<ClassroomMediaProvider | null>(null);
  const roomUnsubscribeRef = useRef<(() => void) | null>(null);
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null);
  const [spaceBusy, setSpaceBusy] = useState(false);
  const signalingRef = useRef<ClassroomSignalingProvider | null>(null);
  const [activePanel, setActivePanel] = useState<DrawerPanel | null>(
    isRecorder ? "chat" : null,
  );
  const [liveRailCollapsed, setLiveRailCollapsed] = useState(() => {
    if (isRecorder || typeof window === "undefined") return false;
    return window.localStorage.getItem("classroom_live_rail_collapsed") === "1";
  });
  const [layoutMode, setLayoutMode] =
    useState<ClassroomLayoutMode>("focus");
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [captionDisplayMode, setCaptionDisplayMode] = useState<CaptionDisplayMode>(
    () => {
      if (typeof window === "undefined") return "bilingual";
      const saved = window.localStorage.getItem("classroom_caption_mode");
      return saved === "off" || saved === "original" || saved === "translated"
        ? saved
        : "bilingual";
    },
  );
  const [captionLanguage, setCaptionLanguage] = useState(() => {
    return initialCaptionLanguage(
      typeof window === "undefined"
        ? null
        : window.localStorage.getItem(CAPTION_LANGUAGE_STORAGE_KEY),
      locale,
    );
  });
  const [recordingStatus, setRecordingStatus] = useState<string | null>(null);
  const [recordingMode, setRecordingMode] = useState<"web" | "mix" | null>(null);
  const [recordingFallback, setRecordingFallback] = useState<string | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);
  const publishEnabledRef = useRef(false);
  const captionIngestAtRef = useRef(new Map<string, number>());
  const [studentPublishReady, setStudentPublishReady] = useState(false);
  const now = useNow();

  useEffect(() => {
    sessionRef.current = sessionData;
  }, [sessionData]);

  useEffect(() => {
    window.localStorage.setItem("classroom_caption_mode", captionDisplayMode);
  }, [captionDisplayMode]);

  useEffect(() => {
    window.localStorage.setItem(CAPTION_LANGUAGE_STORAGE_KEY, captionLanguage);
  }, [captionLanguage]);

  useEffect(() => {
    if (isRecorder) return;
    window.localStorage.setItem(
      "classroom_live_rail_collapsed",
      liveRailCollapsed ? "1" : "0",
    );
  }, [isRecorder, liveRailCollapsed]);

  const updateSession = useCallback(
    (update: Partial<ClassroomSessionResponse>) => {
      setSessionData((current) => (current ? { ...current, ...update } : current));
    },
    [],
  );

  const disconnectRoom = useCallback(async () => {
    roomUnsubscribeRef.current?.();
    roomUnsubscribeRef.current = null;
    const current = roomProviderRef.current;
    roomProviderRef.current = null;
    setRoomProvider(null);
    setRoomMedia(EMPTY_MEDIA);
    setActiveSpaceId(null);
    await current?.disconnect().catch(() => undefined);
  }, []);

  const connectRoom = useCallback(
    async (spaceId: string) => {
      if (!courseId || !user || spaceBusy || isRecorder) return;
      setSpaceBusy(true);
      setActionError("");
      try {
        await disconnectRoom();
        const response = await fetch(
          `/api/sessions/${encodeURIComponent(courseId)}/classroom/spaces/credential`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              spaceId,
              ...(shareAccess && { shareAccess }),
            }),
          },
        );
        const payload = (await response.json()) as {
          credential?: ClassroomJoinCredential;
          error?: string;
        };
        if (!response.ok || !payload.credential) {
          throw new Error(payload.error || t("classroom.v3.roomConnectFailed"));
        }
        const provider = await createClassroomMediaProvider(
          payload.credential.provider,
        );
        roomProviderRef.current = provider;
        roomUnsubscribeRef.current = provider.subscribe(setRoomMedia);
        await provider.connect(
          payload.credential,
          user.displayName || user.name || user.userId,
        );
        setRoomProvider(provider);
        setActiveSpaceId(spaceId);
      } catch (error) {
        await disconnectRoom();
        setActionError(
          error instanceof Error
            ? error.message
            : t("classroom.v3.roomConnectFailed"),
        );
      } finally {
        setSpaceBusy(false);
      }
    },
    [courseId, disconnectRoom, isRecorder, shareAccess, spaceBusy, t, user],
  );

  const fetchInitialSession = useCallback(async () => {
    if (isRecorder && !recorderToken) {
      throw new Error(t("classroom.v3.missingRecorderCredential"));
    }
    let response = await fetch("/api/classroom/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(requestedSessionId
          ? { sessionId: requestedSessionId }
          : { courseId: legacyCourseId }),
        ...(shareAccess && { shareAccess }),
        ...(isRecorder && { recorderToken }),
      }),
    });
    if (!isRecorder && response.status === 401 && (await tryOAuthRefresh())) {
      response = await fetch("/api/classroom/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(requestedSessionId
            ? { sessionId: requestedSessionId }
            : { courseId: legacyCourseId }),
          ...(shareAccess && { shareAccess }),
        }),
      });
    }
    const payload = (await response.json()) as
      | ClassroomSessionResponse
      | { error?: string; code?: string };
    if (!response.ok || !("credential" in payload)) {
      const serverDetail =
        "error" in payload && payload.error ? payload.error : undefined;
      if (!isRecorder && response.status === 403 && "code" in payload) {
        router.replace(
          buildAccessDeniedUrl({
            code:
              (payload.code as CourseAccessDeniedCode | undefined) || "default",
            reason: t("classroom.v3.accessDenied"),
            courseId,
          }),
        );
      }
      if (serverDetail) {
        console.warn("[ClassroomSession] Session creation failed", serverDetail);
      }
      throw new Error(t("classroom.v3.sessionCreateFailed"));
    }
    return payload;
  }, [courseId, isRecorder, legacyCourseId, recorderToken, requestedSessionId, router, shareAccess, t]);

  useEffect(() => {
    if ((!isRecorder && authLoading) || !courseId) return;
    if (!isRecorder && !user) {
      redirectToSsoLogin();
      return;
    }
    let cancelled = false;
    let provider: ClassroomMediaProvider | null = null;
    let unsubscribe: (() => void) | null = null;
    let unsubscribeCaptions: (() => void) | null = null;

    async function launch() {
      try {
        const payload = await fetchInitialSession();
        if (cancelled) return;
        setLayoutMode(payload.mode === "oneToOne" ? "split" : "focus");
        setSessionData(payload);
        const startsWithPublishingPermission =
          payload.credential.role === "student" &&
          payload.credential.publishAllowed === true;
        publishEnabledRef.current = startsWithPublishingPermission;
        setStudentPublishReady(startsWithPublishingPermission);
        setRecordingStatus(payload.recording.status);
        setRecordingMode(payload.recording.mode);
        setRecordingFallback(payload.recording.fallbackFrom);
        provider = await createClassroomMediaProvider(
          payload.credential.provider,
        );
        providerRef.current = provider;
        setMediaProvider(provider);
        unsubscribe = provider.subscribe((snapshot) => {
          if (!cancelled) setMedia(snapshot);
        });
        unsubscribeCaptions = provider.subscribeCaptions((caption) => {
          if (cancelled) return;
          const localCaption: ClassroomCaptionSnapshot = {
            ...caption,
            provider: payload.runtime.interpretation.provider,
            speakerName:
              payload.runtime.members.find((member) => member.userId === caption.speakerId)
                ?.displayName ||
              caption.speakerName ||
              t("classroom.v3.speaker"),
            createdAt: new Date().toISOString(),
          };
          setSessionData((current) =>
            current
              ? { ...current, captions: mergeCaptions(current.captions, localCaption) }
              : current,
          );
          if (isRecorder || payload.credential.role === "student") return;
          const lastIngested = captionIngestAtRef.current.get(caption.id) || 0;
          if (!caption.isFinal && Date.now() - lastIngested < 600) return;
          captionIngestAtRef.current.set(caption.id, Date.now());
          void fetch(
            `/api/sessions/${encodeURIComponent(courseId)}/classroom/captions`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                caption: localCaption,
                ...(shareAccess && { shareAccess }),
              }),
            },
          )
            .then(async (response) => {
              const result = (await response.json()) as {
                caption?: ClassroomCaptionSnapshot;
                revision?: number;
              };
              if (!response.ok || !result.caption) return;
              setSessionData((current) =>
                current
                  ? {
                      ...current,
                      captions: mergeCaptions(current.captions, result.caption!),
                      runtime:
                        typeof result.revision === "number"
                          ? { ...current.runtime, revision: result.revision }
                          : current.runtime,
                    }
                  : current,
              );
              if (typeof result.revision === "number") {
                void signalingRef.current?.publish({
                  courseId,
                  revision: result.revision,
                  topic: "captions",
                });
              }
            })
            .catch((error) => {
              console.warn("[classroom:v3] caption ingest failed", error);
            });
        });
        const displayName = isRecorder
          ? t("classroom.v3.recordingClassroom")
          : user!.displayName || user!.name || user!.userId;
        await provider.connect(payload.credential, displayName);
        if (!cancelled) setLoadingState("ready");
      } catch (error) {
        if (cancelled) return;
        console.error("[classroom:v3] launch failed", error);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : t("classroom.v3.classroomLaunchFailed"),
        );
        setLoadingState("error");
      }
    }
    void launch();
    return () => {
      cancelled = true;
      unsubscribe?.();
      unsubscribeCaptions?.();
      signalingRef.current?.disconnect().catch(() => undefined);
      signalingRef.current = null;
      if (providerRef.current === provider) providerRef.current = null;
      void provider?.disconnect();
    };
  }, [
    authLoading,
    courseId,
    fetchInitialSession,
    isRecorder,
    shareAccess,
    t,
    user,
  ]);

  useEffect(() => {
    return () => {
      roomUnsubscribeRef.current?.();
      void roomProviderRef.current?.disconnect();
      roomProviderRef.current = null;
    };
  }, []);

  const refreshState = useCallback(async () => {
    if (!courseId || !sessionRef.current) return;
    try {
      if (isRecorder) {
        const payload = await fetchInitialSession();
        updateSession({
          runtime: payload.runtime,
          courseware: payload.courseware,
          messages: payload.messages,
          captions: payload.captions,
          whiteboard: payload.whiteboard,
          recording: payload.recording,
        });
        setRecordingStatus(payload.recording.status);
        setRecordingMode(payload.recording.mode);
        setRecordingFallback(payload.recording.fallbackFrom);
        return;
      }
      const query = shareAccess
        ? `?shareAccess=${encodeURIComponent(shareAccess)}`
        : "";
      const [stateResponse, messagesResponse] = await Promise.all([
        fetch(`/api/sessions/${encodeURIComponent(courseId)}/classroom/state${query}`, {
          cache: "no-store",
        }),
        fetch(`/api/sessions/${encodeURIComponent(courseId)}/classroom/messages${query}`, {
          cache: "no-store",
        }),
      ]);
      if (stateResponse.ok) {
        const payload = (await stateResponse.json()) as {
          runtime: ClassroomRuntimeSnapshot;
          courseware: ClassroomCoursewareSnapshot[];
          captions: ClassroomCaptionSnapshot[];
          spaces: ClassroomSpaceSnapshot[];
          questions: ClassroomQuestionSnapshot[];
        };
        updateSession(payload);
      }
      if (messagesResponse.ok) {
        const payload = (await messagesResponse.json()) as {
          messages: ClassroomMessageSnapshot[];
        };
        updateSession({ messages: payload.messages });
      }
      if (sessionRef.current?.capabilities.canControlRecording) {
        const response = await fetch(
          `/api/sessions/${encodeURIComponent(courseId)}/recording`,
          { cache: "no-store" },
        );
        if (response.ok) {
          const payload = (await response.json()) as {
            recording?: {
              status?: string;
              mode?: "web" | "mix";
              fallbackFrom?: string | null;
            } | null;
          };
          setRecordingStatus(payload.recording?.status ?? null);
          setRecordingMode(payload.recording?.mode ?? null);
          setRecordingFallback(payload.recording?.fallbackFrom ?? null);
        }
      }
    } catch (error) {
      console.warn("[classroom:v3] state refresh failed", error);
    }
  }, [
    courseId,
    fetchInitialSession,
    isRecorder,
    shareAccess,
    updateSession,
  ]);

  useEffect(() => {
    if (
      loadingState !== "ready" ||
      !sessionData ||
      sessionData.mode !== "largeClass" ||
      sessionData.credential.role === "teacher" ||
      isRecorder
    ) {
      return;
    }
    const assignedOpen = sessionData.spaces.find(
      (space) => space.isAssigned && space.status === "open",
    );
    if (!assignedOpen) {
      if (!activeSpaceId) return;
      const timer = window.setTimeout(() => void disconnectRoom(), 0);
      return () => window.clearTimeout(timer);
    }
    if (assignedOpen.id !== activeSpaceId && !spaceBusy) {
      const timer = window.setTimeout(() => void connectRoom(assignedOpen.id), 0);
      return () => window.clearTimeout(timer);
    }
  }, [
    activeSpaceId,
    connectRoom,
    disconnectRoom,
    isRecorder,
    loadingState,
    sessionData,
    spaceBusy,
  ]);

  useEffect(() => {
    if (loadingState !== "ready") return;
    const timer = window.setInterval(() => void refreshState(), 5_000);
    return () => window.clearInterval(timer);
  }, [loadingState, refreshState]);

  useEffect(() => {
    const signaling = sessionData?.signaling;
    if (!signaling || isRecorder) return;
    let cancelled = false;
    const provider = createClassroomSignalingProvider();
    signalingRef.current = provider;
    const onInvalidation = (event: ClassroomInvalidation) => {
      if (
        !cancelled &&
        event.courseId === courseId &&
        event.revision > (sessionRef.current?.runtime.revision ?? 0)
      ) {
        void refreshState();
      }
    };
    void provider.connect(signaling, onInvalidation).catch((error) => {
      console.warn("[classroom:v3] RTM unavailable; polling remains active", error);
    });
    return () => {
      cancelled = true;
      if (signalingRef.current === provider) signalingRef.current = null;
      void provider.disconnect();
    };
  }, [
    courseId,
    isRecorder,
    refreshState,
    sessionData?.signaling,
  ]);

  useEffect(() => {
    if (isRecorder || loadingState !== "ready" || !courseId) return;
    const heartbeat = () => {
      void fetch(
        `/api/sessions/${encodeURIComponent(courseId)}/classroom/actions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: { type: "heartbeat" },
            ...(shareAccess && { shareAccess }),
          }),
          keepalive: true,
        },
      );
    };
    heartbeat();
    const timer = window.setInterval(heartbeat, 15_000);
    return () => window.clearInterval(timer);
  }, [courseId, isRecorder, loadingState, shareAccess]);

  const currentUserId = isRecorder
    ? sessionData?.credential.userId || ""
    : user?.userId || "";
  const currentMember = sessionData?.runtime.members.find(
    (member) => member.userId === currentUserId,
  );

  useEffect(() => {
    if (
      isRecorder ||
      !sessionData ||
      !mediaProvider ||
      sessionData.credential.role !== "student"
    ) {
      return;
    }
    const shouldPublish =
      currentMember?.onStage && currentMember.stageState === "accepted";
    if (shouldPublish && !publishEnabledRef.current) {
      publishEnabledRef.current = true;
      void fetch("/api/classroom/session/publish-credential", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: courseId,
          ...(shareAccess && { shareAccess }),
        }),
      })
        .then(async (response) => {
          const payload = (await response.json()) as {
            credential?: ClassroomJoinCredential;
            error?: string;
          };
          if (!response.ok || !payload.credential) {
            throw new Error(
              payload.error || t("classroom.v3.stageCredentialFailed"),
            );
          }
          await mediaProvider.setPublishingCredential(payload.credential);
          setStudentPublishReady(true);
        })
        .catch((error) => {
          publishEnabledRef.current = false;
          setStudentPublishReady(false);
          setActionError(
            error instanceof Error
              ? error.message
              : t("classroom.v3.stageCredentialFailed"),
          );
        });
    }
    if (!shouldPublish && publishEnabledRef.current) {
      publishEnabledRef.current = false;
      setStudentPublishReady(false);
      void mediaProvider.setPublishingCredential(null);
    }
    if (
      currentMember &&
      !currentMember.microphoneAllowed &&
      media.local.microphoneOn
    ) {
      void mediaProvider.toggleMicrophone();
    }
    if (
      currentMember &&
      !currentMember.cameraAllowed &&
      media.local.cameraOn
    ) {
      void mediaProvider.toggleCamera();
    }
  }, [
    courseId,
    currentMember,
    isRecorder,
    media.local.cameraOn,
    media.local.microphoneOn,
    mediaProvider,
    sessionData,
    shareAccess,
    t,
  ]);

  useEffect(() => {
    if (
      isRecorder ||
      !courseId ||
      !currentMember ||
      sessionData?.credential.role !== "student" ||
      currentMember.whiteboardWritable === sessionData.whiteboard.writable
    ) {
      return;
    }
    let cancelled = false;
    void fetch("/api/classroom/session/whiteboard-credential", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: courseId,
        ...(shareAccess && { shareAccess }),
      }),
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          whiteboard?: ClassroomSessionResponse["whiteboard"];
          error?: string;
        };
        if (!response.ok || !payload.whiteboard) {
          throw new Error(
            payload.error || t("classroom.v3.whiteboardPermissionFailed"),
          );
        }
        if (!cancelled) updateSession({ whiteboard: payload.whiteboard });
      })
      .catch((error) => {
        if (!cancelled) {
          setActionError(
            error instanceof Error
              ? error.message
              : t("classroom.v3.whiteboardPermissionFailed"),
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    courseId,
    currentMember,
    isRecorder,
    sessionData?.credential.role,
    sessionData?.whiteboard.writable,
    shareAccess,
    t,
    updateSession,
  ]);

  const publishInvalidation = useCallback(
    (revision: number, topic: ClassroomInvalidation["topic"]) => {
      if (!courseId) return;
      void signalingRef.current?.publish({ courseId, revision, topic });
    },
    [courseId],
  );

  const performAction = useCallback(
    async (action: ClassroomAction) => {
      if (!courseId || !sessionRef.current || actionBusy || isRecorder) return;
      setActionBusy(action.type);
      setActionError("");
      try {
        const response = await fetch(
          `/api/sessions/${encodeURIComponent(courseId)}/classroom/actions`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action,
              expectedRevision: sessionRef.current.runtime.revision,
              ...(shareAccess && { shareAccess }),
            }),
          },
        );
        const payload = (await response.json()) as {
          error?: string;
          runtime?: ClassroomRuntimeSnapshot;
        };
        if (!response.ok) {
          if (payload.runtime) updateSession({ runtime: payload.runtime });
          throw new Error(
            payload.error || t("classroom.v3.classroomActionFailed"),
          );
        }
        if (payload.runtime) {
          updateSession({ runtime: payload.runtime });
          publishInvalidation(payload.runtime.revision, "runtime");
        }
        if (action.type === "startClass") {
          setRecordingStatus("starting");
          window.setTimeout(() => void refreshState(), 1_800);
        }
        if (action.type === "endClass") {
          setRecordingStatus("stopping");
          window.setTimeout(() => void refreshState(), 1_800);
        }
      } catch (error) {
        setActionError(
          error instanceof Error
            ? error.message
            : t("classroom.v3.classroomActionFailed"),
        );
      } finally {
        setActionBusy(null);
      }
    },
    [
      actionBusy,
      courseId,
      isRecorder,
      publishInvalidation,
      refreshState,
      shareAccess,
      t,
      updateSession,
    ],
  );

  const runMediaAction = useCallback(
    async (
      name: string,
      action: (provider: ClassroomMediaProvider) => Promise<unknown>,
    ) => {
      const session = sessionRef.current;
      const useRoomProvider =
        session?.mode === "largeClass" &&
        session.credential.role !== "teacher" &&
        !(
          session.credential.role === "student" &&
          session.runtime.members.some(
            (member) =>
              member.userId === session.credential.userId &&
              member.onStage &&
              member.stageState === "accepted",
          )
        ) &&
        Boolean(roomProviderRef.current);
      const provider = useRoomProvider
        ? roomProviderRef.current
        : providerRef.current;
      if (!provider || actionBusy || isRecorder) return;
      setActionBusy(name);
      setActionError("");
      try {
        await action(provider);
      } catch (error) {
        setActionError(
          error instanceof Error
            ? error.message
            : t("classroom.v3.mediaActionFailed"),
        );
      } finally {
        setActionBusy(null);
      }
    },
    [actionBusy, isRecorder, t],
  );

  const sendMessage = useCallback(
    async (
      content: string,
      context: {
        scope: "classroom" | "room" | "staff";
        spaceId?: string | null;
      },
    ) => {
      const response = await fetch(
        `/api/sessions/${encodeURIComponent(courseId)}/classroom/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content,
            scope: context.scope,
            spaceId: context.spaceId,
            ...(shareAccess && { shareAccess }),
          }),
        },
      );
      const payload = (await response.json()) as {
        error?: string;
        message?: ClassroomMessageSnapshot;
        revision?: number;
      };
      if (!response.ok || !payload.message) {
        setActionError(payload.error || t("classroom.v3.messageSendFailed"));
        return;
      }
      updateSession({
        messages: [...(sessionRef.current?.messages || []), payload.message],
      });
      if (payload.revision) publishInvalidation(payload.revision, "messages");
    },
    [courseId, publishInvalidation, shareAccess, t, updateSession],
  );

  const deleteMessage = useCallback(
    async (messageId: string) => {
      const response = await fetch(
        `/api/sessions/${encodeURIComponent(courseId)}/classroom/messages`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messageId,
            ...(shareAccess && { shareAccess }),
          }),
        },
      );
      const payload = (await response.json()) as {
        error?: string;
        revision?: number;
      };
      if (!response.ok) {
        setActionError(
          payload.error || t("classroom.v3.messageWithdrawFailed"),
        );
        return;
      }
      await refreshState();
      if (payload.revision) publishInvalidation(payload.revision, "messages");
    },
    [courseId, publishInvalidation, refreshState, shareAccess, t],
  );

  const updateCourseware = useCallback(
    async (
      coursewareId: string,
      update: Partial<
        Pick<
          ClassroomCoursewareSnapshot,
          "studentCanView" | "studentCanDownload" | "whiteboardEnabled"
        >
      >,
    ) => {
      setActionBusy(`courseware-${coursewareId}`);
      const response = await fetch(
        `/api/courses/${encodeURIComponent(sessionRef.current?.course.id || legacyCourseId)}/courseware/${encodeURIComponent(coursewareId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(update),
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setActionError(
          payload.error || t("classroom.v3.coursewareUpdateFailed"),
        );
      }
      await refreshState();
      publishInvalidation(
        (sessionRef.current?.runtime.revision || 0) + 1,
        "courseware",
      );
      setActionBusy(null);
    },
    [legacyCourseId, publishInvalidation, refreshState, t],
  );

  const mutateSpaces = useCallback(
    async (
      method: "POST" | "PATCH" | "DELETE",
      body: Record<string, unknown>,
    ) => {
      if (!courseId || spaceBusy) return;
      setSpaceBusy(true);
      setActionError("");
      try {
        const response = await fetch(
          `/api/sessions/${encodeURIComponent(courseId)}/classroom/spaces`,
          {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...body,
              ...(shareAccess && { shareAccess }),
            }),
          },
        );
        const payload = (await response.json()) as {
          spaces?: ClassroomSpaceSnapshot[];
          revision?: number;
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error || t("classroom.v3.roomUpdateFailed"));
        }
        if (payload.spaces) updateSession({ spaces: payload.spaces });
        await refreshState();
        if (payload.revision) publishInvalidation(payload.revision, "runtime");
      } catch (error) {
        setActionError(
          error instanceof Error
            ? error.message
            : t("classroom.v3.roomUpdateFailed"),
        );
      } finally {
        setSpaceBusy(false);
      }
    },
    [
      courseId,
      publishInvalidation,
      refreshState,
      shareAccess,
      spaceBusy,
      t,
      updateSession,
    ],
  );

  const askQuestion = useCallback(
    async (content: string, spaceId: string | null) => {
      const response = await fetch(
        `/api/sessions/${encodeURIComponent(courseId)}/classroom/questions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content,
            spaceId,
            ...(shareAccess && { shareAccess }),
          }),
        },
      );
      const payload = (await response.json()) as {
        question?: ClassroomQuestionSnapshot;
        revision?: number;
        error?: string;
      };
      if (!response.ok || !payload.question) {
        setActionError(payload.error || t("classroom.v3.questionSendFailed"));
        return;
      }
      updateSession({
        questions: [payload.question, ...(sessionRef.current?.questions || [])],
      });
      if (payload.revision) publishInvalidation(payload.revision, "runtime");
    },
    [courseId, publishInvalidation, shareAccess, t, updateSession],
  );

  const updateQuestion = useCallback(
    async (
      questionId: string,
      action: "promote" | "answer" | "dismiss" | "reopen",
      answer?: string,
    ) => {
      const response = await fetch(
        `/api/sessions/${encodeURIComponent(courseId)}/classroom/questions`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questionId,
            action,
            answer,
            ...(shareAccess && { shareAccess }),
          }),
        },
      );
      const payload = (await response.json()) as {
        question?: ClassroomQuestionSnapshot;
        revision?: number;
        error?: string;
      };
      if (!response.ok || !payload.question) {
        setActionError(payload.error || t("classroom.v3.questionUpdateFailed"));
        return;
      }
      updateSession({
        questions: (sessionRef.current?.questions || []).map((question) =>
          question.id === payload.question!.id ? payload.question! : question,
        ),
      });
      if (payload.revision) publishInvalidation(payload.revision, "runtime");
    },
    [courseId, publishInvalidation, shareAccess, t, updateSession],
  );

  const toggleRecording = useCallback(async () => {
    if (!courseId || actionBusy || isRecorder) return;
    const active = ["starting", "recording", "stopping"].includes(
      recordingStatus || "",
    );
    setActionBusy("recording");
    try {
      const response = await fetch(
        `/api/sessions/${encodeURIComponent(courseId)}/recording`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: active ? "stop" : "start" }),
        },
      );
      const payload = (await response.json()) as {
        error?: string;
        recording?: {
          status?: string;
          mode?: "web" | "mix";
          fallbackFrom?: string | null;
        };
      };
      if (!response.ok) {
        throw new Error(
          payload.error || t("classroom.v3.recordingActionFailed"),
        );
      }
      setRecordingStatus(payload.recording?.status ?? null);
      setRecordingMode(payload.recording?.mode ?? null);
      setRecordingFallback(payload.recording?.fallbackFrom ?? null);
      publishInvalidation(
        sessionRef.current?.runtime.revision || 0,
        "recording",
      );
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : t("classroom.v3.recordingActionFailed"),
      );
    } finally {
      setActionBusy(null);
    }
  }, [
    actionBusy,
    courseId,
    isRecorder,
    publishInvalidation,
    recordingStatus,
    t,
  ]);

  const parentCourseId = sessionData?.course.id || null;
  const classroomRole = sessionData?.credential.role || null;
  const leaveClassroom = useCallback(() => {
    if (isLeaving) return;
    setIsLeaving(true);
    if (!isRecorder && courseId && classroomRole === "student") {
      void fetch(
        `/api/sessions/${encodeURIComponent(courseId)}/attendance`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event: "leave" }),
          keepalive: true,
        },
      );
    }
    const destination = parentCourseId
      ? `/courses/${encodeURIComponent(parentCourseId)}`
      : "/";
    const signaling = signalingRef.current;
    const mediaProvider = providerRef.current;
    signalingRef.current = null;
    providerRef.current = null;

    // Leaving the classroom is navigation, not a teardown progress screen.
    // RTC/RTM SDK disconnects can stall while reconnecting, so never await
    // them before changing routes.
    router.replace(destination);
    void signaling?.disconnect().catch((error: unknown) => {
      console.warn("[classroom:v3] signaling cleanup failed", error);
    });
    void mediaProvider?.disconnect().catch((error: unknown) => {
      console.warn("[classroom:v3] media cleanup failed", error);
    });

    // Development compilation or a stuck RSC request can delay a client-side
    // transition. Fall back to a full navigation so the user can always exit.
    window.setTimeout(() => {
      if (window.location.pathname === "/classroom") {
        window.location.replace(destination);
      }
    }, 1_200);
  }, [classroomRole, courseId, isLeaving, isRecorder, parentCourseId, router]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen();
    }
  }, []);

  const decoratedParticipants = media.participants.map((participant) => {
    const member = sessionData?.runtime.members.find(
      (candidate) =>
        candidate.userId === participantOwnerId(participant.id),
    );
    return {
      participant,
      member,
      displayName:
        participant.kind === "screen"
          ? t("classroom.v3.teacherScreen", {
              name: member?.displayName || t("classroom.v3.teacher"),
            })
          : member?.displayName || participant.displayName,
    };
  });
  const screenParticipant = decoratedParticipants.find(
    ({ participant }) =>
      participant.kind === "screen" && participant.hasVideo,
  );
  const spotlightParticipant = decoratedParticipants.find(
    ({ participant }) =>
      participantOwnerId(participant.id) ===
      sessionData?.runtime.spotlightUserId,
  );
  const teacherParticipant = decoratedParticipants.find(({ participant }) => {
    const member = sessionData?.runtime.members.find(
      (candidate) =>
        candidate.userId === participantOwnerId(participant.id),
    );
    return member?.role === "teacher" && participant.kind === "camera";
  });
  const stageParticipant =
    screenParticipant ||
    spotlightParticipant ||
    decoratedParticipants.find(
      ({ participant }) =>
        participant.id === media.focusedParticipantId,
    ) ||
    teacherParticipant ||
    decoratedParticipants.find(
      ({ participant }) => participant.kind === "camera",
    );
  const galleryParticipants = decoratedParticipants
    .filter(({ participant }) => {
      if (participant.kind !== "camera") return false;
      const ownerId = participantOwnerId(participant.id);
      return sessionData?.runtime.members.some(
        (member) => member.userId === ownerId && member.onStage,
      );
    })
    .slice(0, 6);
  const activeCourseware =
    sessionData?.courseware.find(
      (item) => item.id === sessionData.runtime.activeCoursewareId,
    ) ||
    sessionData?.courseware.find((item) => item.whiteboardEnabled) ||
    null;
  const showWhiteboard =
    !screenParticipant && sessionData?.runtime.stageMode === "whiteboard";
  const leadTeacher = sessionData?.runtime.members.find(
    (member) => member.role === "teacher",
  );
  const stageActor = screenParticipant?.member || stageParticipant?.member;
  const stageSourceTitle = screenParticipant
    ? screenParticipant.displayName
    : showWhiteboard
      ? activeCourseware?.name || t("classroom.v3.whiteboard")
      : stageParticipant?.displayName || t("classroom.v3.teachingStage");
  const stageSourceDetail = screenParticipant
    ? t("classroom.v3.stageSharedBy", {
        name: stageActor?.displayName || t("classroom.v3.teacher"),
      })
    : showWhiteboard
      ? t("classroom.v3.stageControlledBy", {
          name:
            leadTeacher?.displayName ||
            sessionData?.course.teacherName ||
            t("classroom.v3.teacher"),
        })
      : stageParticipant?.participant.hasVideo
        ? t("classroom.v3.stageCameraBy", {
            name: stageActor?.displayName || stageParticipant.displayName,
          })
        : stageParticipant
          ? t("classroom.v3.stageWaitingForContent", {
              name: stageActor?.displayName || stageParticipant.displayName,
            })
          : t("classroom.v3.stageWaiting");
  const StageSourceIcon = screenParticipant
    ? MonitorUp
    : showWhiteboard
      ? PenTool
      : stageParticipant?.participant.hasVideo
        ? Video
        : VideoOff;
  const elapsedSeconds = sessionData?.runtime.startedAt
    ? (now - new Date(sessionData.runtime.startedAt).getTime()) / 1000
    : 0;
  const timerRemaining =
    sessionData?.runtime.timerStartedAt &&
    sessionData.runtime.timerDurationSec
      ? sessionData.runtime.timerDurationSec -
        (now - new Date(sessionData.runtime.timerStartedAt).getTime()) / 1000
      : null;
  const acceptedStudentOnStage =
    sessionData?.credential.role === "student" &&
    Boolean(currentMember?.onStage) &&
    currentMember?.stageState === "accepted";
  const currentSpace = sessionData?.spaces.find(
    (space) => space.id === activeSpaceId,
  );
  const currentSpaceMember = currentSpace?.members.find(
    (member) => member.userId === currentUserId,
  );
  const controlsRoomMedia =
    sessionData?.mode === "largeClass" &&
    sessionData.credential.role !== "teacher" &&
    !acceptedStudentOnStage &&
    Boolean(roomProvider);
  const requiresRoomMedia =
    sessionData?.mode === "largeClass" &&
    sessionData.credential.role !== "teacher" &&
    !acceptedStudentOnStage;
  const controlMedia = controlsRoomMedia ? roomMedia : media;
  const canUseMedia = requiresRoomMedia
    ? controlsRoomMedia && Boolean(currentSpaceMember)
    : sessionData?.credential.role !== "student" || studentPublishReady;
  const canShareScreen = requiresRoomMedia
    ? controlsRoomMedia &&
      (sessionData?.credential.role === "assistant" ||
        Boolean(currentSpaceMember?.screenShareAllowed))
    : Boolean(
        sessionData?.capabilities.canShareScreen ||
          (acceptedStudentOnStage && studentPublishReady),
      );
  const roomPermissionKey = currentSpaceMember
    ? [
        currentSpaceMember.microphoneAllowed,
        currentSpaceMember.cameraAllowed,
        currentSpaceMember.screenShareAllowed,
      ].join(":")
    : "";
  const roomPermissionRef = useRef("");
  useEffect(() => {
    if (!controlsRoomMedia || !roomProvider || !currentSpaceMember) return;
    if (!currentSpaceMember.microphoneAllowed && roomMedia.local.microphoneOn) {
      void roomProvider.toggleMicrophone();
    }
    if (!currentSpaceMember.cameraAllowed && roomMedia.local.cameraOn) {
      void roomProvider.toggleCamera();
    }
    const previous = roomPermissionRef.current;
    roomPermissionRef.current = roomPermissionKey;
    if (
      previous &&
      previous !== roomPermissionKey &&
      activeSpaceId &&
      !spaceBusy
    ) {
      void connectRoom(activeSpaceId);
    }
  }, [
    activeSpaceId,
    connectRoom,
    controlsRoomMedia,
    currentSpaceMember,
    roomMedia.local.cameraOn,
    roomMedia.local.microphoneOn,
    roomPermissionKey,
    roomProvider,
    spaceBusy,
  ]);
  const chatDisabled =
    !sessionData?.runtime.chatEnabled ||
    Boolean(currentMember?.chatMuted) ||
    isRecorder;
  const latestCaption = sessionData?.captions.at(-1) || null;
  const promotedQuestion = sessionData?.questions.find(
    (question) => question.status === "promoted",
  ) || null;
  const availableCaptionLanguages =
    sessionData?.runtime.interpretation.targetLanguages ?? [];
  const effectiveCaptionLanguage = resolveEffectiveCaptionLanguage(
    captionLanguage,
    availableCaptionLanguages,
  );
  const latestTranslation = latestCaption
    ? captionTranslation(latestCaption, effectiveCaptionLanguage)
    : "";
  const visibleDrawerPanels: DrawerPanel[] = [
    ...(sessionData?.modePolicy.showMemberRoster
      ? (["members"] as DrawerPanel[])
      : []),
    ...(sessionData?.modePolicy.allowBreakouts
      ? (["rooms"] as DrawerPanel[])
      : []),
    ...(sessionData?.modePolicy.showPublicQuestions
      ? (["questions"] as DrawerPanel[])
      : []),
    "chat",
    "captions",
    "courseware",
    "tools",
  ];

  if (loadingState === "loading") {
    return <ClassroomLoading recorder={isRecorder} />;
  }
  if (
    loadingState === "error" ||
    !sessionData ||
    !mediaProvider ||
    !courseId
  ) {
    return (
      <main className="classroom-v3-shell is-error-page">
        <section className="classroom-v3-error-card">
          <AlertCircle />
          <small>{t("classroom.v3.unavailableEyebrow")}</small>
          <h1>{t("classroom.v3.cannotEnter")}</h1>
          <p>{errorMessage || t("classroom.v3.missingCourse")}</p>
          <button
            type="button"
            onClick={() => router.push(courseId ? `/courses/${courseId}` : "/")}
          >
            <ArrowLeft />
            {t("classroom.v3.backToCourse")}
          </button>
        </section>
      </main>
    );
  }

  return (
    <main
      className={`classroom-v3-shell is-mode-${sessionData.mode} ${isRecorder ? "is-recorder" : ""} ${sessionData.modePolicy.showLiveRail && liveRailCollapsed ? "is-rail-collapsed" : ""}`}
      data-runtime-status={sessionData.runtime.status}
      data-classroom-mode={sessionData.mode}
    >
      <header className="classroom-v3-topbar">
        <div className="classroom-v3-course-identity">
          {!isRecorder && (
            <button
              type="button"
              disabled={isLeaving}
              onClick={leaveClassroom}
              title={t("classroom.v3.backToCourse")}
            >
              <ArrowLeft />
            </button>
          )}
          <span className="classroom-v3-course-mark">
            <Presentation />
          </span>
          <div>
            <small>
              {sessionData.runtime.status === "live"
                ? t("classroom.v3.liveClass")
                : sessionData.runtime.status === "ended"
                  ? t("classroom.v3.classEndedLabel")
                  : t("classroom.v3.readyRoom")}
            </small>
            <h1>{sessionData.course.name}</h1>
          </div>
        </div>
        <div className="classroom-v3-session-metrics">
          <span>
            <small>{t("classroom.v3.classDuration")}</small>
            <strong>{formatClock(elapsedSeconds)}</strong>
          </span>
          {timerRemaining !== null && (
            <span className={timerRemaining <= 30 ? "is-urgent" : ""}>
              <small>{t("classroom.v3.timer")}</small>
              <strong>{formatClock(timerRemaining)}</strong>
            </span>
          )}
          <StatusPill media={media} recording={recordingStatus} />
        </div>
        {!isRecorder && (
          <div className="classroom-v3-top-actions">
            <span
              className={`classroom-v3-role-context is-${sessionData.credential.role}`}
              title={
                sessionData.credential.role === "teacher"
                  ? t("classroom.v3.leadRoleHint")
                  : sessionData.credential.role === "assistant"
                    ? t("classroom.v3.assistantRoleHint")
                    : t("classroom.v3.studentRoleHint")
              }
            >
              {sessionData.credential.role === "student" ? (
                <Hand />
              ) : (
                <ShieldCheck />
              )}
              <span>{roleLabel(sessionData.credential.role, t)}</span>
            </span>
            {sessionData.capabilities.canStartClass &&
              sessionData.runtime.status !== "live" && (
                <button
                  type="button"
                  className="is-start"
                  disabled={
                    Boolean(actionBusy) ||
                    (controlsRoomMedia && !currentSpaceMember?.microphoneAllowed)
                  }
                  onClick={() => void performAction({ type: "startClass" })}
                >
                  <Radio />
                  {t("classroom.v3.startClass")}
                </button>
              )}
            {sessionData.capabilities.canEndClass &&
              sessionData.runtime.status === "live" && (
                <button
                  type="button"
                  className="is-end"
                  disabled={
                    Boolean(actionBusy) ||
                    (controlsRoomMedia && !currentSpaceMember?.cameraAllowed)
                  }
                  onClick={() => void performAction({ type: "endClass" })}
                >
                  <CircleStop />
                  {t("classroom.v3.endClass")}
                </button>
              )}
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              title={t("classroom.v3.deviceSettings")}
            >
              <Settings2 />
            </button>
          </div>
        )}
      </header>

      {sessionData.modePolicy.showLiveRail && (
        <LiveRail
          members={sessionData.runtime.members}
          media={media}
          provider={mediaProvider}
          currentUserId={currentUserId}
          canManage={sessionData.capabilities.canManageStage && !isRecorder}
          busy={Boolean(actionBusy)}
          maxStudentSeats={sessionData.modePolicy.maxStageStudents}
          onSpotlight={(userId) =>
            void performAction({ type: "setSpotlight", targetUserId: userId })
          }
          onToggleLocalMicrophone={() =>
            void runMediaAction("microphone", (provider) =>
              provider.toggleMicrophone(),
            )
          }
          onToggleLocalCamera={() =>
            void runMediaAction("camera", (provider) => provider.toggleCamera())
          }
          onManageMedia={(member, kind) =>
            void performAction({
              type: "setMediaAllowed",
              targetUserId: member.userId,
              microphoneAllowed:
                kind === "microphone"
                  ? !member.microphoneAllowed
                  : member.microphoneAllowed,
              cameraAllowed:
                kind === "camera"
                  ? !member.cameraAllowed
                  : member.cameraAllowed,
            })
          }
          onRemoveStage={(userId) =>
            void performAction({ type: "removeStage", targetUserId: userId })
          }
          collapsed={liveRailCollapsed}
          onToggleCollapsed={() => setLiveRailCollapsed((value) => !value)}
        />
      )}

      <section className="classroom-v3-workspace">
        <motion.section
          layout
          className="classroom-v3-stage"
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
        >
          <header className="classroom-v3-stage-bar">
            <div>
              <span className="classroom-v3-stage-signal" />
              <div className="classroom-v3-stage-copy">
                <small>{t("classroom.v3.mainStageEyebrow")}</small>
                <strong>{stageSourceTitle}</strong>
              </div>
              <span className="classroom-v3-stage-source">
                <StageSourceIcon />
                {stageSourceDetail}
              </span>
            </div>
            <div>
              {!isRecorder &&
                !screenParticipant &&
                !showWhiteboard &&
                sessionData.mode !== "publicLive" &&
                galleryParticipants.length > 1 && (
                  <div
                    className="classroom-v3-layout-switch"
                    role="group"
                    aria-label={t("classroom.v3.classroomLayout")}
                  >
                    {(
                      [
                        ["focus", Presentation, t("classroom.v3.focusLayout")],
                        ["split", Users, t("classroom.v3.splitLayout")],
                        ["grid", LayoutGrid, t("classroom.v3.gridLayout")],
                      ] as const
                    ).map(([mode, Icon, label]) => (
                      <button
                        type="button"
                        key={mode}
                        className={layoutMode === mode ? "is-active" : ""}
                        onClick={() => setLayoutMode(mode)}
                        title={t("classroom.v3.useLayout", { layout: label })}
                        aria-pressed={layoutMode === mode}
                      >
                        <Icon />
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                )}
              {sessionData.capabilities.canManageStage && !isRecorder && (
                <button
                  type="button"
                  className={sessionData.runtime.stageLocked ? "is-locked" : ""}
                  onClick={() =>
                    void performAction({
                      type: "setStage",
                      mode: sessionData.runtime.stageMode,
                      locked: !sessionData.runtime.stageLocked,
                      coursewareId: sessionData.runtime.activeCoursewareId,
                    })
                  }
                  title={
                    sessionData.runtime.stageLocked
                      ? t("classroom.v3.unlockStage")
                      : t("classroom.v3.lockStage")
                  }
                >
                  {sessionData.runtime.stageLocked ? <Lock /> : <LockOpen />}
                </button>
              )}
              <button
                type="button"
                onClick={toggleFullscreen}
                title={t("classroom.v3.fullscreen")}
              >
                <Expand />
              </button>
            </div>
          </header>
          <div className="classroom-v3-stage-content">
            <AnimatePresence mode="wait">
              {!screenParticipant &&
              !showWhiteboard &&
              layoutMode !== "focus" &&
              galleryParticipants.length > 1 ? (
                <motion.div
                  key={`layout-${layoutMode}`}
                  className={`classroom-v3-stage-layer classroom-v3-media-layout is-${layoutMode}`}
                  initial={{ opacity: 0, scale: 0.99 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.99 }}
                  transition={{ duration: 0.22 }}
                >
                  {galleryParticipants
                    .slice(0, layoutMode === "split" ? 3 : 6)
                    .map((item, index) => (
                      <div
                        className="classroom-v3-media-tile"
                        data-primary={index === 0}
                        key={item.participant.id}
                      >
                        <MediaSurface
                          participant={item.participant}
                          provider={mediaProvider}
                          displayName={item.displayName}
                          className="classroom-v3-tile-media"
                        />
                      </div>
                    ))}
                </motion.div>
              ) : showWhiteboard ? (
                <motion.div
                  key="whiteboard"
                  className="classroom-v3-stage-layer"
                  initial={{ opacity: 0, scale: 0.985 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.99 }}
                  transition={{ duration: 0.22 }}
                >
                  <FastboardSurface
                    credential={sessionData.whiteboard}
                    courseware={activeCourseware}
                  />
                </motion.div>
              ) : stageParticipant ? (
                <motion.div
                  key={stageParticipant.participant.id}
                  className="classroom-v3-stage-layer"
                  initial={{ opacity: 0, scale: 0.985 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.99 }}
                  transition={{ duration: 0.22 }}
                >
                  <MediaSurface
                    participant={stageParticipant.participant}
                    provider={mediaProvider}
                    displayName={stageParticipant.displayName}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  className="classroom-v3-stage-empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <span><Presentation /></span>
                  <small>{t("classroom.v3.readyEyebrow")}</small>
                  <h2>
                    {sessionData.runtime.status === "ended"
                      ? t("classroom.v3.classEnded")
                      : sessionData.credential.role === "student"
                        ? t("classroom.v3.waitForTeacher")
                        : t("classroom.v3.startTeaching")}
                  </h2>
                  <p>
                    {sessionData.runtime.status === "ended"
                      ? t("classroom.v3.playbackHint")
                      : t("classroom.v3.stagePriorityHint")}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
            {captionDisplayMode !== "off" &&
              sessionData.runtime.interpretation.enabled &&
              latestCaption ? (
                <motion.div
                  key={latestCaption.id}
                  className="classroom-v3-caption-overlay"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <header>
                    <strong>
                      {latestCaption.speakerName || t("classroom.v3.speaker")}
                    </strong>
                    <span>
                      {classroomLanguageLabel(effectiveCaptionLanguage)}
                    </span>
                  </header>
                  {captionDisplayMode !== "translated" ? (
                    <p>{latestCaption.text}</p>
                  ) : null}
                  {captionDisplayMode !== "original" && latestTranslation ? (
                    <p className="is-translation">{latestTranslation}</p>
                  ) : null}
                </motion.div>
              ) : null}
            {promotedQuestion ? (
              <motion.button
                type="button"
                className="classroom-v3-stage-question"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => !isRecorder && setActivePanel("questions")}
              >
                <MessagesSquare />
                <span>
                  <small>
                    {promotedQuestion.spaceName || t("classroom.v3.mainChannel")}
                    {` · ${promotedQuestion.askerName}`}
                  </small>
                  <strong>{promotedQuestion.content}</strong>
                </span>
              </motion.button>
            ) : null}
          </div>
          {recordingFallback === "web" && (
            <div className="classroom-v3-stage-warning">
              <AlertCircle />
              {t("classroom.v3.webRecordingFallback")}
            </div>
          )}
        </motion.section>

        <section
          className={`classroom-v3-side ${activePanel ? "is-open" : ""}`}
        >
          {!isRecorder && (
            <DrawerNavigation
              active={activePanel}
              onChange={setActivePanel}
              visiblePanels={visibleDrawerPanels}
              counts={{
                members: sessionData.runtime.members.filter((member) => member.online).length,
                rooms: sessionData.spaces.filter((space) => space.status === "open").length,
                questions: sessionData.questions.filter((question) => question.status === "open").length,
                chat: sessionData.messages.length,
                hands: sessionData.runtime.members.filter((member) => member.handRaisedAt).length,
              }}
            />
          )}
          <AnimatePresence initial={false}>
            {activePanel && (
              <motion.aside
                key={activePanel}
                className="classroom-v3-drawer"
                data-panel={activePanel}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 18 }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              >
                {!isRecorder && (
                  <button
                    type="button"
                    className="classroom-v3-drawer-close"
                    onClick={() => setActivePanel(null)}
                    title={t("classroom.v3.collapsePanel")}
                  >
                    <PanelRightClose />
                  </button>
                )}
                {activePanel === "members" && (
                  <MemberPanel
                    members={sessionData.runtime.members}
                    canManage={sessionData.capabilities.canManageMembers}
                    onAction={(action) => void performAction(action)}
                  />
                )}
                {activePanel === "rooms" && (
                  <BreakoutPanel
                    spaces={sessionData.spaces}
                    members={sessionData.runtime.members}
                    role={sessionData.credential.role}
                    activeSpaceId={activeSpaceId}
                    roomMedia={roomMedia}
                    roomProvider={roomProvider}
                    busy={spaceBusy}
                    onCreate={(count, capacity) =>
                      void mutateSpaces("POST", { count, capacity })
                    }
                    onAutoAssign={() =>
                      void mutateSpaces("PATCH", { action: "autoAssign" })
                    }
                    onSpaceAction={(action, input) =>
                      void mutateSpaces("PATCH", { action, ...input })
                    }
                    onAssign={(spaceId, targetUserId, role) =>
                      void mutateSpaces("PATCH", {
                        action: "assign",
                        spaceId,
                        targetUserId,
                        role,
                      })
                    }
                    onConnect={(spaceId) => void connectRoom(spaceId)}
                  />
                )}
                {activePanel === "questions" && (
                  <QuestionsPanel
                    questions={sessionData.questions}
                    role={sessionData.credential.role}
                    spaceId={activeSpaceId || sessionData.spaces.find((space) => space.isAssigned)?.id || null}
                    busy={Boolean(actionBusy)}
                    onAsk={askQuestion}
                    onAction={(questionId, action, answer) =>
                      void updateQuestion(questionId, action, answer)
                    }
                  />
                )}
                {activePanel === "chat" && (
                  <ChatPanel
                    messages={sessionData.messages}
                    currentUserId={currentUserId}
                    role={sessionData.credential.role}
                    spaces={sessionData.spaces}
                    activeSpaceId={activeSpaceId}
                    canManage={sessionData.capabilities.canManageChat}
                    disabled={chatDisabled}
                    onSend={sendMessage}
                    onDelete={(messageId) => void deleteMessage(messageId)}
                  />
                )}
                {activePanel === "captions" && (
                  <CaptionsPanel
                    key={[
                      sessionData.runtime.interpretation.enabled,
                      sessionData.runtime.interpretation.provider,
                      sessionData.runtime.interpretation.sourceLanguage,
                      ...sessionData.runtime.interpretation.targetLanguages,
                    ].join(":")}
                    runtime={sessionData.runtime}
                    captions={sessionData.captions}
                    canManage={
                      sessionData.capabilities.canManageInterpretation && !isRecorder
                    }
                    displayMode={captionDisplayMode}
                    preferredLanguage={effectiveCaptionLanguage}
                    onDisplayModeChange={setCaptionDisplayMode}
                    onPreferredLanguageChange={setCaptionLanguage}
                    onAction={(action) => void performAction(action)}
                  />
                )}
                {activePanel === "courseware" && (
                  <CoursewarePanel
                    items={sessionData.courseware}
                    canManage={sessionData.capabilities.canManageWhiteboard}
                    onUpdate={(id, update) => void updateCourseware(id, update)}
                    onOpen={(courseware) =>
                      void performAction({
                        type: "setStage",
                        mode: "whiteboard",
                        locked: false,
                        coursewareId: courseware.id,
                      })
                    }
                  />
                )}
                {activePanel === "tools" && (
                  <ToolsPanel
                    runtime={sessionData.runtime}
                    canManage={sessionData.capabilities.canManageStage}
                    onAction={(action) => void performAction(action)}
                    onFullscreen={toggleFullscreen}
                    onSettings={() => setSettingsOpen(true)}
                  />
                )}
              </motion.aside>
            )}
          </AnimatePresence>
          {!activePanel && !isRecorder && (
            <button
              type="button"
              className="classroom-v3-drawer-open"
              onClick={() => setActivePanel(visibleDrawerPanels[0] || "chat")}
              title={t("classroom.v3.expandPanel")}
            >
              <PanelRightOpen />
            </button>
          )}
        </section>
      </section>

      {actionError && !isRecorder && (
        <motion.div
          className="classroom-v3-action-error"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <AlertCircle />
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError("")}>
            <X />
          </button>
        </motion.div>
      )}

      {!isRecorder && (
        <footer className="classroom-v3-dock-wrap">
          <div className="classroom-v3-dock">
            {canUseMedia && (
              <>
                <button
                  type="button"
                  disabled={Boolean(actionBusy)}
                  className={!controlMedia.local.microphoneOn ? "is-off" : ""}
                  onClick={() =>
                    void runMediaAction("microphone", (provider) =>
                      provider.toggleMicrophone(),
                    )
                  }
                  title={t("classroom.v3.microphone")}
                >
                  {controlMedia.local.microphoneOn ? <Mic /> : <MicOff />}
                  <span>{t("classroom.v3.microphone")}</span>
                </button>
                <button
                  type="button"
                  disabled={Boolean(actionBusy)}
                  className={!controlMedia.local.cameraOn ? "is-off" : ""}
                  onClick={() =>
                    void runMediaAction("camera", (provider) =>
                      provider.toggleCamera(),
                    )
                  }
                  title={t("classroom.v3.camera")}
                >
                  {controlMedia.local.cameraOn ? <Video /> : <VideoOff />}
                  <span>{t("classroom.v3.camera")}</span>
                </button>
              </>
            )}
            {canShareScreen && (
              <button
                type="button"
                disabled={Boolean(actionBusy)}
                className={controlMedia.local.screenSharing ? "is-active" : ""}
                onClick={() =>
                  void runMediaAction("screen", (provider) =>
                    controlMedia.local.screenSharing
                      ? provider.stopScreenShare()
                      : provider.startScreenShare(),
                  )
                }
                title={t("classroom.v3.screenShare")}
              >
                {controlMedia.local.screenSharing ? <ScreenShareOff /> : <MonitorUp />}
                <span>
                  {controlMedia.local.screenSharing
                    ? t("classroom.v3.stopSharing")
                    : t("classroom.v3.screenShare")}
                </span>
              </button>
            )}
            <button
              type="button"
              className={sessionData.runtime.stageMode === "whiteboard" ? "is-active" : ""}
              onClick={() => {
                setActivePanel("courseware");
                if (sessionData.capabilities.canManageStage) {
                  void performAction({
                    type: "setStage",
                    mode: "whiteboard",
                    locked: false,
                    coursewareId: sessionData.runtime.activeCoursewareId,
                  });
                }
              }}
            >
              <PenTool />
              <span>{t("classroom.v3.whiteboard")}</span>
            </button>
            <button type="button" onClick={() => setActivePanel("courseware")}>
              <BookOpen />
              <span>{t("classroom.v3.courseware")}</span>
            </button>
            <button
              type="button"
              className={sessionData.runtime.interpretation.enabled ? "is-active" : ""}
              onClick={() => setActivePanel("captions")}
              title={t("classroom.v3.interpretation")}
            >
              <Languages />
              <span>{t("classroom.v3.captions")}</span>
            </button>
            {sessionData.credential.role === "student" &&
              sessionData.modePolicy.showHandRaise && (
              <button
                type="button"
                disabled={Boolean(actionBusy) || Boolean(currentMember?.onStage)}
                className={
                  currentMember?.handRaisedAt || currentMember?.onStage
                    ? "is-active"
                    : ""
                }
                onClick={() =>
                  void performAction({
                    type: currentMember?.handRaisedAt
                      ? "lowerHand"
                      : "raiseHand",
                  })
                }
                title={
                  currentMember?.onStage
                    ? t("classroom.v3.studentOnStageHint")
                    : currentMember?.handRaisedAt
                      ? t("classroom.v3.cancelHand")
                      : t("classroom.v3.raiseHand")
                }
              >
                {currentMember?.onStage ? <UserRound /> : <Hand />}
                <span>
                  {currentMember?.onStage
                    ? t("classroom.v3.onStage")
                    : currentMember?.handRaisedAt
                      ? t("classroom.v3.cancelHand")
                      : t("classroom.v3.raiseHand")}
                </span>
              </button>
            )}
            <button type="button" onClick={() => setActivePanel("tools")}>
              <LayoutGrid />
              <span>{t("classroom.v3.classroomTools")}</span>
            </button>
            {sessionData.capabilities.canControlRecording && (
              <button
                type="button"
                className={
                  ["starting", "recording", "stopping"].includes(
                    recordingStatus || "",
                  )
                    ? "is-recording"
                    : ""
                }
                disabled={Boolean(actionBusy) || !sessionData.recording.enabled}
                onClick={() => void toggleRecording()}
                title={
                  sessionData.recording.enabled
                    ? t("classroom.v3.recordingMode", {
                        mode: recordingMode || t("classroom.v3.preparing"),
                      })
                    : t("classroom.v3.recordingNotConfigured")
                }
              >
                {["starting", "recording", "stopping"].includes(
                  recordingStatus || "",
                ) ? (
                  <CircleStop />
                ) : (
                  <Radio />
                )}
                <span>
                  {["starting", "recording", "stopping"].includes(
                    recordingStatus || "",
                  )
                    ? t("classroom.v3.stopRecording")
                    : t("classroom.v3.startRecording")}
                </span>
              </button>
            )}
            <span className="classroom-v3-dock-divider" />
            <button
              type="button"
              className="is-leave"
              disabled={isLeaving}
              onClick={leaveClassroom}
            >
              <LogOut />
              <span>
                {isLeaving
                  ? t("classroom.v3.leaving")
                  : t("classroom.v3.leave")}
              </span>
            </button>
          </div>
        </footer>
      )}

      <AnimatePresence>
        {!isRecorder &&
          currentMember?.stageState === "invited" &&
          !currentMember.onStage && (
            <motion.div
              className="classroom-v3-invite"
              initial={{ opacity: 0, y: 28, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
            >
              <span><UserRound /></span>
              <div>
                <small>{t("classroom.v3.stageInvitationEyebrow")}</small>
                <strong>{t("classroom.v3.stageInviteTitle")}</strong>
                <p>{t("classroom.v3.stageInviteHint")}</p>
              </div>
              <button
                type="button"
                onClick={() => void performAction({ type: "declineStage" })}
              >
                {t("classroom.v3.later")}
              </button>
              <button
                type="button"
                className="is-accept"
                onClick={() => void performAction({ type: "acceptStage" })}
              >
                {t("classroom.v3.acceptStage")}
              </button>
            </motion.div>
          )}
      </AnimatePresence>

      <DeviceSettings
        open={settingsOpen}
        provider={controlsRoomMedia ? roomProvider : mediaProvider}
        media={controlMedia}
        onClose={() => setSettingsOpen(false)}
      />
    </main>
  );
}
