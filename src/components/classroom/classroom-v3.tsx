"use client";
import { CaptionStartSettings } from "./caption-start-settings";
import { initialCaptionStartView, newCaptionStartPreferences, type CaptionStartPreferences } from "@/lib/classroom/caption-start-preferences";

import { isClassroomOvertime } from "@/lib/classroom/overtime-leave";
import { imageMessageContent } from "@/lib/classroom/chat-image-message";
import { useWhiteboardShortcuts } from "@/lib/classroom/whiteboard/use-shortcuts";
import { BoardToolsMenu } from "./board-tools-menu";
import { MinimalHeader } from "./minimal-header";
import { ClassroomIconButton } from "./icon-button";
import { ClassroomQuickSettings } from "./quick-settings";
import { ConversationPanelTabs } from "./conversation-panel-tabs";
import { StudentScreenShares } from "./student-screen-shares";
import { mainScreenShareCandidates } from "@/lib/classroom/screen-share-selection";
import { ScreenShareMenu } from "./screen-share-menu";
import { ConversationResizer } from "./conversation-resizer";
import type { ClassroomScreenShareOptions } from "@/lib/classroom/types";
import { ClassroomHeaderMenu, type ClassroomHeaderMenuAction } from "./classroom-header-menu";
import { ClassTimingControls } from "./class-timing-controls";
import { ClassroomChatPanel as TestChatPanel } from "./classroom-chat-panel";

import { isClassroomTeachingRole } from "@/lib/classroom/policy";
import { createDeviceAckTracker, type DeviceReport } from "@/lib/classroom/signaling/device-ack";
import type { ClassroomDeviceAck, ClassroomSignalingEvent } from "@/lib/classroom/signaling/types";

import { CoursewarePanel, type CoursewareInsertion } from "@/components/classroom/courseware-panel";

import { ClassroomMemberAvatar } from "@/components/classroom/member-avatar";
import { ClassroomDeviceEntry } from "./device-entry";
import { classroomDeviceId, classroomDeviceLabel, type ClassroomDeviceEntryMode } from "@/lib/classroom/device-admission";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuPortal } from "@/components/ui/dropdown-menu";
import { useChatUnread } from "@/lib/classroom/use-chat-unread";
import { CaptionsPanel } from "@/components/classroom/captions-panel";
import { MicrophoneLevel } from "@/components/classroom/microphone-level";
import { LiveCaptionOverlay } from "@/components/classroom/live-caption-overlay";
import { useLiveCaptions } from "@/lib/classroom/use-live-captions";
import { HandRaiseButton, HandRaiseQueue, HandRaiseVideoBadge } from "@/components/classroom/hand-raise-controls";
import { applyClassroomHandRaiseUpdate, raisedClassroomHands } from "@/lib/classroom/hand-raise";
import { createCaptionSyncState, type CaptionSyncResponse } from "@/lib/classroom/caption-sync";
import { useCaptionSubscription } from "@/lib/classroom/use-caption-subscription";
import { supportedCaptionTranslationCodes } from "@/lib/classroom/translation-capabilities";
import { TeacherAssistant } from "@/components/classroom/teacher-assistant";
import { StageSettings } from "@/components/classroom/stage-settings";
import { classroomStudentStageLimit } from "@/lib/classroom/stage-settings";
import { assistantConversationKey, classroomAssistantTeacher } from "@/lib/classroom/assistant";
import { ClassStartSettings, ClassStartReminder } from "@/components/classroom/class-start-controls";
import { useScheduledClassStart } from "@/components/classroom/use-scheduled-class-start";
import { classStartReadiness, classStartLateness, type ClassStartMode } from "@/lib/classroom/class-start";
import { ClassroomClosingNotice } from "@/components/classroom/closing-notice";
import { classroomClosingNotice } from "@/lib/classroom/closing-notice";

import { useClassroomHostEvents } from "@/lib/classroom/use-host-events";
import { recorderCameraParticipants, recorderVideosHaveFrames } from "@/lib/classroom/recorder-surface";
import { classroomBoardPresentation } from "@/lib/classroom/board-presentation";
import { isEndedClassroomResponse } from "@/lib/classroom/session-lifecycle";
import { applyMicrophonePermission } from "@/lib/classroom/media-permissions";
import { applyClassroomMemberPermissionUpdate } from "@/lib/classroom/member-permissions";
import { applyClassroomCompositionPreview } from "@/lib/classroom/composition-preview";
import { requestClassroomPublishingCredential } from "@/lib/classroom/publishing-credential";
import { applyClassroomScreenShareRequest, verifiedScreenShareInvitation } from "@/lib/classroom/screen-share-request";
import { canRetryClassroomRecovery, ClassroomRecoveryError, retryClassroomRecovery } from "@/lib/classroom/credential-recovery";
import { reportClassroomDiagnostic, type ClassroomConnectionDiagnostic } from "@/lib/classroom/connection-diagnostics";
import { createCaptionPersistenceQueue } from "@/lib/classroom/caption-persistence";
import { createCaptionOutbox } from "@/lib/classroom/caption-outbox";
import { deliverClassroomCaption } from "@/lib/classroom/caption-delivery";
import { useClassroomSyncOwner, ClassroomSyncProvider } from "@/lib/classroom/use-classroom-sync";
import { requestClassroomHeartbeat } from "@/lib/classroom/heartbeat-request";
import { withClassroomRequestSignal } from "@/lib/classroom/request-signal";
import { classroomMemberVisible, classroomPresenceSummary, classroomPresenceClockOffset } from "@/lib/classroom/presence";
import { requestClassroomSession, ClassroomSessionRequestError } from "@/lib/classroom/session-request";
import { reconcileClassroomRtcPresence } from "@/lib/classroom/rtc-presence";

import {
  CSSProperties,
  ChangeEvent,
  KeyboardEvent,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { StudentActivityOverlay } from "./student-activity-overlay";
import { ACTIVITY_OPEN_EVENT } from "@/lib/classroom/activities";
import { ActivityNotice, ActivityWorkspace, ActivityStagePresentation } from "@/components/classroom/activity-workspace";
import { DesktopRecordingControl } from "@/components/classroom/desktop-recording-control";
import { requestClassroomAction } from "@/lib/classroom/action-request";
import { requestClassroomMessage } from "@/lib/classroom/message-request";
import { optimisticClassroomRuntime } from "@/lib/classroom/optimistic-runtime";
import { classroomCapabilities } from "@/lib/classroom/policy";
import { languageOptions, type SupportedLocale } from "@/lib/i18n/locales";
import { participantOwnerId } from "@/lib/classroom/participant-identity";
import { AuxiliaryCameraSettings, AuxiliaryCameraFeeds, type AuxiliaryCameraFeed } from "@/components/classroom/auxiliary-camera";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ClassroomAwardNotice } from "./classroom-award-notice";
import {
  Sparkles,
  ClipboardList,
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Camera,
  Check,
  ChevronRight,
  ChevronDown,
  Circle,
  CircleStop,
  Clock3,
  Dices,
  DoorOpen,
  Expand,
  Eye,
  EyeOff,
  FileText,
  Hand,
  Headphones,
  Image as ImageIcon,
  LayoutGrid,
  Globe,
  Loader2,
  Lock,
  LockOpen,
  LogOut,
  MessageCircle,
  MessagesSquare,
  Mic,
  MicOff,
  MousePointer2,
  Move,
  MonitorUp,
  MoreHorizontal,
  PanelRightClose,
  PenTool,
  Pencil,
  Pause,
  Play,
  Presentation,
  Radio,
  RefreshCw,
  ScreenShareOff,
  Send,
  Save,
  Settings2,
  ShieldCheck,
  Shapes,
  Shuffle,
  Sun,
  Moon,
  TimerReset,
  Trash2,
  Trophy,
  Type,
  Upload,
  Undo2,
  Redo2,
  Eraser,
  UserRound,
  Users,
  UserPlus,
  Video,
  VideoOff,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import {
  FastboardSurface,
  preloadFastboard,
  type ClassroomWhiteboardController,
  type ClassroomWhiteboardTool,
} from "@/components/classroom/fastboard-surface";
import type { FastboardApp } from "@netless/fastboard";
import { ScreenShareAnnotations } from "@/components/classroom/screen-share-annotations";
import { ClassroomLoading, type ClassroomEntryPhase } from "@/components/classroom/classroom-loading";
import { canonicalClassroomEntryPath } from "@/lib/classroom/entry-path";
import {
  buildAccessDeniedUrl,
  type CourseAccessDeniedCode,
} from "@/lib/access-denied-codes";
import { redirectToSsoLogin } from "@/lib/auth-login";
import { tryOAuthRefresh } from "@/lib/auth-refresh-client";
import { selectClassroomCameraParticipants } from "@/lib/classroom/camera-selection";
import { classroomParticipantOwnerId } from "@/lib/classroom/local-participant";
import { useAuth } from "@/lib/auth-context";
import { useTranslation } from "@/lib/i18n/context";
import { getClientTheme, setClientTheme, type Theme } from "@/lib/theme";
import { createClassroomMediaProvider } from "@/lib/classroom/client/provider-factory";
import { createClassroomSignalingProvider } from "@/lib/classroom/signaling/provider-factory";
import type {
  ClassroomInvalidation,
  ClassroomSignalingProvider,
} from "@/lib/classroom/signaling/types";
import type {
  ClassroomAction,
  ClassroomBoardItem,
  ClassroomBoardRect,
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
  ClassroomVideoBackgroundEffect,
  ClassroomQuestionSnapshot,
} from "@/lib/classroom/types";
import {
  circleBoardGeometry,
  defaultBoardRect,
  normalizeBoardRect,
  placeClassroomBoardItem,
  translateBoardRectByPixels,
  updateClassroomBoardItem,
} from "@/lib/classroom/composition";
import {
  selectActiveScreenShare,
  shouldHideLocalScreenSharePreview,
} from "@/lib/classroom/media-routing";
import { ScreenShareReleaseQueue } from "@/lib/classroom/screen-share-release";
import { canShareClassroomScreen, studentScreenShareReady, ownsScreenShare, memberScreenShareStatus } from "@/lib/classroom/screen-share-state";
import { shouldApplyClassroomRevision } from "@/lib/classroom/runtime-revision";
import {
  shouldAutoStartRecordingAfterWhiteboard,
  shouldNotifyRecorderReady,
  isRecorderReadyAcknowledged,
} from "@/lib/classroom/recording-start";
import {
  CAPTION_LANGUAGE_STORAGE_KEY,
  effectiveCaptionLanguage as resolveEffectiveCaptionLanguage,
  initialCaptionLanguage,
  type CaptionDisplayMode,
} from "@/lib/classroom/caption-preferences";
import {
  mergeCaptionSnapshots,
} from "@/lib/classroom/caption-display";

type LoadingState = "loading" | "ready" | "error" | "device-choice" | "device-replaced";
const CLASSROOM_BACKGROUND_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);
type DrawerPanel =
  | "screens"
  | "members"
  | "rooms"
  | "questions"
  | "chat"
  | "captions"
  | "courseware"
  | "engagement"
  | "activities"
  | "tools";
type ClassroomLayoutMode = "focus" | "split" | "grid";
type CaptionBackgroundMode = "transparent" | "text" | "solid";

const TEACHER_PIP_HIDDEN_STORAGE_KEY = "classroom_teacher_pip_hidden";
const OPTIMISTIC_MESSAGE_PREFIX = "optimistic:";
const subscribeToTheme = (onStoreChange: () => void) => {
  window.addEventListener("app-theme-change", onStoreChange);
  return () => window.removeEventListener("app-theme-change", onStoreChange);
};
const getServerTheme = (): Theme => "light";

const EMPTY_MEDIA: ClassroomMediaSnapshot = {
  connectionState: "idle",
  participants: [],
  network: {
    uplinkQuality: 0,
    downlinkQuality: 0,
    latencyMs: null,
    packetLossPercent: null,
  },
  local: {
    microphoneOn: false,
    cameraOn: false,
    screenSharing: false,
  },
  focusedParticipantId: null,
};

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

function readScreenShareSupport(): boolean {
  return !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) &&
    typeof navigator.mediaDevices?.getDisplayMedia === "function";
}

function readMobileControls() { return window.matchMedia("(max-width: 1024px)").matches; }
function subscribeToViewport(callback: () => void) { window.addEventListener("resize", callback); return () => window.removeEventListener("resize", callback); }

function subscribeToBrowserCapabilities(): () => void {
  return () => undefined;
}

function mergeCaptions(
  current: ClassroomCaptionSnapshot[],
  incoming: ClassroomCaptionSnapshot,
) {
  return mergeCaptionSnapshots(current, [incoming]);
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
  member,
}: {
  participant: ClassroomParticipant;
  provider: ClassroomMediaProvider;
  displayName: string;
  className?: string;
  showCaption?: boolean;
  member?: ClassroomMemberSnapshot;
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
    <div className={`classroom-v3-media ${className}`} data-media-video={participant.hasVideo && !participant.videoSubscriptionPaused} data-participant-id={participant.id}>
      <div key={participant.id} ref={targetRef} className="classroom-v3-media-video" />
      {(!participant.hasVideo || participant.videoSubscriptionPaused) && (
        <div className="classroom-v3-media-fallback">
          {member && participant.kind === "camera"
            ? <div className="classroom-v3-media-avatar"><ClassroomMemberAvatar avatar={member.avatar} name={displayName} /></div>
            : <span>{initialOf(displayName)}</span>}
          <small>
            {participant.videoSubscriptionPaused
              ? t("classroom.v3.videoPausedForSharedContent")
              : participant.kind === "screen"
              ? t("classroom.v3.waitingForSharedContent")
              : t("classroom.v3.cameraOffWithName", { name: displayName })}
          </small>
        </div>
      )}
      <HandRaiseVideoBadge member={member} />
      {showCaption && (
        <div className="classroom-v3-media-caption">
          <span>{displayName}</span>
          <span>
            {participant.kind === "screen"
              ? t("classroom.v3.screenSharing")
              : participant.kind === "auxiliary-camera"
                ? t("classroom.v3.auxiliaryCamera")
              : participant.hasAudio
                ? t("classroom.v3.speaking")
                : t("classroom.v3.muted")}
          </span>
        </div>
      )}
    </div>
  );
}

function BoardCompositionItem({
  item,
  participant,
  displayName,
  member,
  coursewareName,
  provider,
  stageRef,
  stageSize,
  canManage,
  canEditGeometry,
  isRecorder,
  selected,
  onSelect,
  onUpdate,
  onPreview,
  onRemove,
  onBringToFront,
  onHideLocally,
}: {
  item: ClassroomBoardItem;
  participant: ClassroomParticipant | null;
  displayName: string;
  member?: ClassroomMemberSnapshot;
  coursewareName?: string;
  provider: ClassroomMediaProvider;
  stageRef: React.RefObject<HTMLDivElement | null>;
  stageSize: { width: number; height: number };
  canManage: boolean;
  canEditGeometry: boolean;
  isRecorder: boolean;
  selected: boolean;
  onSelect: () => void;
  onUpdate: (update: {
    rect?: ClassroomBoardRect;
    locked?: boolean;
    visible?: boolean;
    shape?: "rounded" | "circle";
  }) => void;
  onPreview: (rect: ClassroomBoardRect) => void;
  onRemove: () => void;
  onBringToFront: () => void;
  onHideLocally: () => void;
}) {
  const { t } = useTranslation();
  const [resizingRect, setResizingRect] = useState<ClassroomBoardRect | null>(
    null,
  );
  const [draggingRect, setDraggingRect] = useState<ClassroomBoardRect | null>(
    null,
  );
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startRect: ClassroomBoardRect;
    viewport: { width: number; height: number };
  } | null>(null);
  const lastDragPreviewAtRef = useRef(0);
  const draggedFromHandleRef = useRef(false);
  const visualRect = resizingRect ?? draggingRect ?? item.rect;

  const dragRectAt = useCallback(
    (clientX: number, clientY: number) => {
      const drag = dragStateRef.current;
      if (!drag) return null;
      return translateBoardRectByPixels(
        drag.startRect,
        { x: clientX - drag.startX, y: clientY - drag.startY },
        drag.viewport,
        item.kind,
      );
    },
    [item.kind],
  );

  const startDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      onSelect();
      const target = event.target as HTMLElement;
      if (
        !canEditGeometry ||
        item.locked ||
        (target.closest("button") && !target.closest("[data-board-drag-handle]")) ||
        (event.pointerType === "mouse" && event.button !== 0)
      ) {
        return;
      }
      const stage = stageRef.current?.getBoundingClientRect();
      if (!stage) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragStateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startRect: item.rect,
        viewport: { width: stage.width, height: stage.height },
      };
      lastDragPreviewAtRef.current = 0;
      draggedFromHandleRef.current = false;
      setDraggingRect(item.rect);
    },
    [canEditGeometry, item.locked, item.rect, onSelect, stageRef],
  );

  const moveDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const drag = dragStateRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const next = dragRectAt(event.clientX, event.clientY);
      if (!next) return;
      if (Math.abs(event.clientX - drag.startX) + Math.abs(event.clientY - drag.startY) > 4) draggedFromHandleRef.current = true;
      setDraggingRect(next);
      const now = performance.now();
      if (now - lastDragPreviewAtRef.current >= 100) {
        lastDragPreviewAtRef.current = now;
        onPreview(next);
      }
    },
    [dragRectAt, onPreview],
  );

  const endDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const drag = dragStateRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const next = dragRectAt(event.clientX, event.clientY);
      dragStateRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      if (next) {
        onPreview(next);
        onUpdate({ rect: next });
      }
      setDraggingRect(null);
    },
    [dragRectAt, onPreview, onUpdate],
  );

  const cancelDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (dragStateRef.current?.pointerId !== event.pointerId) return;
      dragStateRef.current = null;
      setDraggingRect(null);
    },
    [],
  );

  const startResize = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!canEditGeometry || item.locked) return;
      event.preventDefault();
      event.stopPropagation();
      const stage = stageRef.current?.getBoundingClientRect();
      if (!stage) return;
      const startX = event.clientX;
      const startY = event.clientY;
      const startRect = visualRect;
      const pointerId = event.pointerId;
      event.currentTarget.setPointerCapture(pointerId);
      const resizedRect = (clientX: number, clientY: number) => {
        const deltaX = clientX - startX;
        const deltaY = clientY - startY;
        if (item.shape === "circle") {
          const initialSize = Math.min(
            startRect.width * stage.width,
            startRect.height * stage.height,
          );
          const size = Math.max(72, initialSize + Math.max(deltaX, deltaY));
          return normalizeBoardRect(
            {
              ...startRect,
              width: size / stage.width,
              height: size / stage.height,
            },
            item.kind,
          );
        }
        return normalizeBoardRect(
          {
            ...startRect,
            width: startRect.width + deltaX / stage.width,
            height: startRect.height + deltaY / stage.height,
          },
          item.kind,
        );
      };
      const move = (moveEvent: PointerEvent) => {
        const next = resizedRect(moveEvent.clientX, moveEvent.clientY);
        setResizingRect(next);
        onPreview(next);
      };
      const end = (endEvent: PointerEvent) => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", end);
        const next = resizedRect(endEvent.clientX, endEvent.clientY);
        setResizingRect(null);
        onUpdate({ rect: next });
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", end, { once: true });
    },
    [
      canEditGeometry,
      item.kind,
      item.locked,
      item.shape,
      onPreview,
      onUpdate,
      stageRef,
      visualRect,
    ],
  );

  const keyboardMove = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (!canEditGeometry || item.locked) return;
      const delta = event.shiftKey ? 0.03 : 0.01;
      const direction = {
        ArrowLeft: [-delta, 0],
        ArrowRight: [delta, 0],
        ArrowUp: [0, -delta],
        ArrowDown: [0, delta],
      }[event.key];
      if (!direction) return;
      event.preventDefault();
      const next = normalizeBoardRect(
        {
          ...item.rect,
          x: item.rect.x + direction[0],
          y: item.rect.y + direction[1],
        },
        item.kind,
      );
      onUpdate({ rect: next });
    },
    [canEditGeometry, item.kind, item.locked, item.rect, onUpdate],
  );

  const toggleCameraShape = useCallback(() => {
    if (item.kind !== "camera") return;
    const nextShape = item.shape === "circle" ? "rounded" : "circle";
    if (nextShape === "rounded") {
      onUpdate({ shape: nextShape });
      return;
    }
    const stage = stageRef.current?.getBoundingClientRect();
    if (!stage) {
      onUpdate({ shape: nextShape });
      return;
    }
    const size = Math.min(
      item.rect.width * stage.width,
      item.rect.height * stage.height,
    );
    onUpdate({
      shape: nextShape,
      rect: normalizeBoardRect(
        {
          ...item.rect,
          width: size / stage.width,
          height: size / stage.height,
        },
        item.kind,
      ),
    });
  }, [item, onUpdate, stageRef]);

  // Recorder and teacher stages can have different aspect ratios. Measure the
  // actual stage so the saved normalized rect becomes a square in both views.
  const circle = stageSize.width > 0 && stageSize.height > 0
    ? circleBoardGeometry(visualRect, stageSize)
    : null;
  const circleSize = circle
    ? `${circle.size}px`
    : `min(${visualRect.width * 100}cqw, ${visualRect.height * 100}cqh)`;
  const style = {
    left: item.shape === "circle" && isRecorder && circle
      ? `${circle.x}px`
      : `${visualRect.x * 100}%`,
    top: item.shape === "circle" && isRecorder && circle
      ? `${circle.y}px`
      : `${visualRect.y * 100}%`,
    width: item.shape === "circle" ? circleSize : `${visualRect.width * 100}%`,
    height: item.shape === "circle" ? circleSize : `${visualRect.height * 100}%`,
    aspectRatio: item.shape === "circle" ? "1 / 1" : undefined,
    zIndex: item.zIndex + 5,
  } satisfies CSSProperties;

  return (
    <motion.article
      className={`classroom-v3-board-item${canEditGeometry ? " is-editable" : ""}${selected ? " is-selected" : ""}${item.locked ? " is-locked" : ""}${item.shape === "circle" ? " is-circle" : ""}${draggingRect ? " is-dragging" : ""}`}
      style={style}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={cancelDrag}
      onKeyDown={keyboardMove}
      tabIndex={canEditGeometry ? 0 : -1}
      aria-label={displayName}
    >
      {item.kind === "courseware" ? (
        <div className="classroom-v3-board-courseware">
          <BookOpen />
          <strong>{coursewareName || displayName}</strong>
          <small>{t("classroom.v3.courseware")}</small>
        </div>
      ) : participant ? (
        <MediaSurface
          participant={participant}
          provider={provider}
          displayName={displayName}
          className="classroom-v3-board-item-media"
          showCaption={!isRecorder}
        />
      ) : (
        <div className="classroom-v3-board-item-empty">
          {item.kind === "screen" ? <MonitorUp /> : <VideoOff />}
          <strong>{displayName}</strong>
          <small>{t("classroom.v3.waitingForSharedContent")}</small>
        </div>
      )}
      {!isRecorder && (item.kind === "camera" || item.kind === "auxiliary-camera") && <HandRaiseVideoBadge member={member} />}
      {!isRecorder && canEditGeometry && <div className="classroom-v3-board-item-tools" role="toolbar">
        {item.kind === "camera" && canEditGeometry && (
          <button
            type="button"
            className={item.shape === "circle" ? "is-active" : ""}
            onClick={(event) => {
              event.stopPropagation();
              toggleCameraShape();
            }}
            title={
              item.shape === "circle"
                ? t("classroom.v3.cameraRoundedWindow")
                : t("classroom.v3.cameraCircleWindow")
            }
            aria-label={
              item.shape === "circle"
                ? t("classroom.v3.cameraRoundedWindow")
                : t("classroom.v3.cameraCircleWindow")
            }
            aria-pressed={item.shape === "circle"}
          >
            <Circle />
          </button>
        )}
        {canManage ? (
          <>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onUpdate({ locked: !item.locked });
              }}
              title={item.locked ? t("classroom.v3.unlockStage") : t("classroom.v3.lockStage")}
              aria-label={
                item.locked
                  ? t("classroom.v3.unlockStage")
                  : t("classroom.v3.lockStage")
              }
            >
              {item.locked ? <Lock /> : <LockOpen />}
            </button>
            <button
              type="button"
              data-board-drag-handle={!item.locked ? "true" : undefined}
              onClick={(event) => {
                event.stopPropagation();
                if (draggedFromHandleRef.current) {
                  draggedFromHandleRef.current = false;
                  return;
                }
                onBringToFront();
              }}
              title={t(item.locked ? "classroom.v3.focusAction" : "classroom.v3.boardMove")}
              aria-label={t(item.locked ? "classroom.v3.focusAction" : "classroom.v3.boardMove")}
            >
              <Move />
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onRemove();
              }}
              title={t("classroom.v3.removeStage")}
              aria-label={t("classroom.v3.removeStage")}
              className="is-danger"
            >
              <X />
            </button>
          </>
        ) : (
          <button
            type="button"
            className="is-danger"
            onClick={(event) => {
              event.stopPropagation();
              onHideLocally();
            }}
            title={t("classroom.v3.close")}
            aria-label={t("classroom.v3.close")}
          >
            <X />
          </button>
        )}
      </div>}
      {canEditGeometry && !item.locked && (
        <button
          type="button"
          className="classroom-v3-board-item-resize"
          onPointerDown={startResize}
          aria-label={t("classroom.v3.resize")}
        />
      )}
    </motion.article>
  );
}

function BoardCompositionLayer({
  items,
  videoGallery = false,
  members,
  courseware,
  participants,
  provider,
  canManage,
  isRecorder,
  currentUserId,
  onAction,
  onPreview,
  hiddenItemIds,
  onHideLocally,
}: {
  items: ClassroomBoardItem[];
  videoGallery?: boolean;
  revision: number;
  members: ClassroomMemberSnapshot[];
  courseware: ClassroomCoursewareSnapshot[];
  participants: ClassroomParticipant[];
  provider: ClassroomMediaProvider;
  canManage: boolean;
  isRecorder: boolean;
  currentUserId: string;
  onAction: (action: ClassroomAction) => Promise<boolean>;
  onPreview: (itemId: string, rect: ClassroomBoardRect) => void;
  hiddenItemIds: Set<string>;
  onHideLocally: (itemId: string) => void;
}) {
  const { t } = useTranslation();
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const isMountedRef = useRef(true);
  const updateTokenRef = useRef<Record<string, number>>({});
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [optimisticItemUpdates, setOptimisticItemUpdates] = useState<
    Record<
      string,
      {
        update: {
          rect?: ClassroomBoardRect;
          locked?: boolean;
          visible?: boolean;
          shape?: "rounded" | "circle";
        };
        token: number;
      }
    >
  >({});
  const [optimisticRemovedItemIds, setOptimisticRemovedItemIds] = useState<
    Set<string>
  >(() => new Set());
  const visibleItems = items.filter(
    (item) =>
      item.visible &&
      !hiddenItemIds.has(item.id) &&
      !optimisticRemovedItemIds.has(item.id),
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setStageSize((current) =>
        current.width === width && current.height === height
          ? current
          : { width, height },
      );
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={stageRef}
      className={`classroom-v3-board-composition${videoGallery ? " is-video-gallery" : ""}`}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) setSelectedItemId(null);
      }}
    >
      {visibleItems.map((item) => {
        const pending = optimisticItemUpdates[item.id];
        const visualItem = {
          ...item,
          ...pending?.update,
        };
        const member = members.find((candidate) => candidate.userId === item.sourceId);
        const matchedParticipant = selectClassroomCameraParticipants(participants, members, currentUserId).find(
          (participant) =>
            classroomParticipantOwnerId(participant, members, currentUserId) === item.sourceId &&
            participant.kind === item.kind && (item.rtcUid === undefined || participant.id === String(item.rtcUid)),
        ) ?? null;
        const file = courseware.find((candidate) => candidate.id === item.sourceId);
        const displayName = item.kind === "courseware"
          ? file?.name || item.sourceId
          : item.kind === "auxiliary-camera"
            ? t("classroom.v3.auxiliaryCameraWithName", { name: member?.displayName || item.sourceId })
            : member?.displayName || item.sourceId;
        return (
          <BoardCompositionItem
            key={item.id}
            item={visualItem}
            participant={matchedParticipant}
            displayName={displayName}
            member={member}
            coursewareName={file?.name}
            provider={provider}
            stageRef={stageRef}
            stageSize={stageSize}
            canManage={canManage}
            isRecorder={isRecorder}
            canEditGeometry={!isRecorder && canManage}
            selected={selectedItemId === item.id}
            onSelect={() => {
              if (!isRecorder && canManage) setSelectedItemId(item.id);
            }}
            onUpdate={(update) => {
              const token = (updateTokenRef.current[item.id] ?? 0) + 1;
              updateTokenRef.current[item.id] = token;
              setOptimisticItemUpdates((current) => ({
                ...current,
                [item.id]: {
                  update: { ...current[item.id]?.update, ...update },
                  token,
                },
              }));
              void onAction({
                type: "updateBoardItem",
                itemId: item.id,
                ...update,
              }).then(() => {
                if (!isMountedRef.current) return;
                setOptimisticItemUpdates((current) => {
                  const pending = current[item.id];
                  if (!pending || pending.token !== token) return current;
                  // onAction applies the authoritative runtime before it settles.
                  // Release the prediction so later edits by other managers win.
                  const next = { ...current };
                  delete next[item.id];
                  return next;
                });
              });
            }}
            onPreview={(rect) => onPreview(item.id, rect)}
            onRemove={() => {
              setOptimisticRemovedItemIds((current) => {
                const next = new Set(current);
                next.add(item.id);
                return next;
              });
              void onAction({
                type: "removeBoardItem",
                itemId: item.id,
              }).then(() => {
                if (!isMountedRef.current) return;
                setOptimisticRemovedItemIds((current) => {
                  const next = new Set(current);
                  next.delete(item.id);
                  return next;
                });
              });
            }}
            onBringToFront={() =>
              onAction({ type: "bringBoardItemToFront", itemId: item.id })
            }
            onHideLocally={() => onHideLocally(item.id)}
          />
        );
      })}
    </div>
  );
}

function StatusPill({
  media,
  recording,
  presenceHealthy,
  inMenu = false,
}: {
  media: ClassroomMediaSnapshot;
  recording: string | null;
  presenceHealthy: boolean;
  inMenu?: boolean;
}) {
  const { t } = useTranslation();
  const rtcConnected = media.connectionState === "connected";
  const connected = rtcConnected && presenceHealthy;
  const connectionLabel = !rtcConnected ? t("classroom.v3.reconnecting") : !presenceHealthy ? t("presenceReliability.checking") : t("classroom.v3.connected");
  const recordingActive = ["starting", "recording"].includes(
    recording || "",
  );
  const details = (
        <span className="classroom-network-details">
          <strong>{t("classroom.v3.connectionDetail")}</strong>
          <small>
            <i className={rtcConnected ? "is-good" : ""} />
            {rtcConnected ? t("classroom.v3.rtcConnected") : t("classroom.v3.rtcRecovering")}
          </small>
          {!presenceHealthy && <small>{t("presenceReliability.unavailable")}</small>}
          <small>
            <Clock3 />
            {t("classroom.v3.networkLatency", {
              value: media.network.latencyMs ?? "--",
            })}
          </small>
          <small>
            <Wifi />
            {t("classroom.v3.packetLoss", {
              value: media.network.packetLossPercent ?? "--",
            })}
          </small>
          <small>
            {media.local.microphoneOn ? <Mic /> : <MicOff />}
            {media.local.microphoneOn ? t("classroom.v3.microphoneOn") : t("classroom.v3.microphoneOff")}
          </small>
          <small>
            {media.local.cameraOn ? <Video /> : <VideoOff />}
            {media.local.cameraOn ? t("classroom.v3.cameraOn") : t("classroom.v3.cameraOff")}
          </small>
        </span>
  );
  if (inMenu) return <DropdownMenuSub>
    <DropdownMenuSubTrigger className="classroom-connection-subtrigger"><Wifi /><span>{connectionLabel}</span></DropdownMenuSubTrigger>
    <DropdownMenuPortal><DropdownMenuSubContent sideOffset={4} collisionPadding={8} className="classroom-header-menu classroom-header-submenu classroom-network-menu">{details}</DropdownMenuSubContent></DropdownMenuPortal>
  </DropdownMenuSub>;
  return (
    <div className="classroom-v3-statuses">
      <span
        className={connected ? "is-online" : "is-warning"}
        tabIndex={0}
        title={connectionLabel}
      >
        <Wifi />
        {connectionLabel}
        <span className="classroom-v3-network-popover">{details}</span>
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
  canReward,
  busy,
  onSpotlight,
  onToggleLocalMicrophone,
  onToggleLocalCamera,
  onManageMedia,
  onRemoveStage,
  onReward,
  onMoveSeat,
  onPlaceOnBoard,
  previewPlacesOnBoard,
  canReorder,
  onAcknowledgeHand,
  canPlaceOnBoard = true,
}: {
  member: ClassroomMemberSnapshot;
  participant: ClassroomParticipant | null;
  provider: ClassroomMediaProvider;
  media: ClassroomMediaSnapshot;
  currentUserId: string;
  canManage: boolean;
  canReward: boolean;
  busy: boolean;
  onSpotlight: (userId: string) => void;
  onToggleLocalMicrophone: () => void;
  onToggleLocalCamera: () => void;
  onManageMedia: (
    member: ClassroomMemberSnapshot,
    media: "microphone" | "camera",
  ) => void;
  onRemoveStage: (userId: string) => void;
  onReward: (userId: string) => void;
  onMoveSeat: (userId: string, slots: number) => void;
  onPlaceOnBoard: (userId: string) => void;
  previewPlacesOnBoard: boolean;
  canReorder: boolean;
  onAcknowledgeHand: () => void;
  canPlaceOnBoard?: boolean;
}) {
  const { t } = useTranslation();
  const sharing = media.participants.some(item => item.kind === "screen" && item.hasVideo && classroomParticipantOwnerId(item, [member], currentUserId) === member.userId);
  const [touchControlsVisible, setTouchControlsVisible] = useState(false);
  const [seatMenuOpen, setSeatMenuOpen] = useState(false);
  const skipTouchPreviewActionRef = useRef(false);
  const isSelf = member.userId === currentUserId;
  const microphoneOn = participant?.isLocal
    ? media.local.microphoneOn
    : Boolean(participant?.hasAudio);
  const cameraOn = participant?.isLocal
    ? media.local.cameraOn
    : Boolean(participant?.hasVideo);
  const canControlSelf = isSelf && Boolean(participant?.isLocal);
  const canControlStudent =
    canManage && member.role === "student" && !isSelf;
  const showControls = canControlSelf || canControlStudent || (canReward && member.role === "student");
  const microphoneControlOn = canControlSelf
    ? microphoneOn
    : member.microphoneAllowed;
  const cameraControlOn = canControlSelf ? cameraOn : member.cameraAllowed;
  const preview = (
    <>
      {participant && !sharing ? (
        <MediaSurface
          participant={participant}
          provider={provider}
          displayName={member.displayName}
          className="classroom-v3-rail-media"
          showCaption={false}
          member={member}
        />
      ) : (
        <div className="classroom-v3-rail-fallback">
          <ClassroomMemberAvatar avatar={member.avatar} name={member.displayName} />
        </div>
      )}
      {sharing && <span className="classroom-seat-sharing"><MonitorUp />{t("classroomSharing.sharing")}</span>}
      {!sharing && participant?.videoSubscriptionPaused && <span className="classroom-seat-video-paused" title={t("classroomSharing.paused")} aria-label={t("classroomSharing.paused")}><VideoOff /></span>}
      <span className="classroom-v3-seat-name" title={member.displayName}>
        {member.displayName}
      </span>
      {participant && <MicrophoneLevel provider={provider} participantId={participant.id} enabled={microphoneOn} />}
      {(!participant || sharing) && <HandRaiseVideoBadge member={member} />}
      {!microphoneOn && (
        <span
          className="classroom-v3-seat-media-state"
          aria-label={t("classroom.v3.mediaState")}
        >
          <i className={microphoneOn ? "is-on" : "is-off"}>
            {microphoneOn ? <Mic /> : <MicOff />}
          </i>
        </span>
      )}
      {member.rewardCount > 0 && (
        <span className="classroom-v3-seat-reward" data-reward-user-id={member.userId} aria-label={t("classroom.v3.rewardCount", { count: member.rewardCount })} title={t("classroom.v3.rewardCount", { count: member.rewardCount })}>
          <Trophy aria-hidden="true" />
          {member.rewardCount}
        </span>
      )}
      {(!cameraOn || member.connectionStatus === "reconnecting") && (
        <span className="classroom-v3-camera-off-label">
          {t(member.connectionStatus === "reconnecting" ? "classroom.v3.reconnecting" : "classroom.v3.cameraOff")}
        </span>
      )}
    </>
  );

  return (
    <motion.article
      // Seat identity and video must stay still during network/presence updates.
      // Explicit dragging below remains available for teacher reordering.
      layout={false}
      drag={canReorder ? "x" : false}
      dragElastic={0.08}
      dragMomentum={false}
      onDragEnd={(_, info) => {
        const slots = Math.round(info.offset.x / 150);
        if (slots) onMoveSeat(member.userId, slots);
      }}
      className={`classroom-v3-seat${sharing ? " is-sharing" : ""}${member.role !== "student" ? " is-teacher" : ""}${cameraOn ? " has-video" : ""}${touchControlsVisible || seatMenuOpen ? " is-touch-active" : ""}${canReorder ? " is-reorderable" : ""}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setTouchControlsVisible(false);
        }
      }}
    >
      {canManage && (!previewPlacesOnBoard || canPlaceOnBoard) ? (
        <button
          type="button"
          className="classroom-v3-seat-preview"
          onPointerUp={(event) => {
            if (event.pointerType === "touch" && !touchControlsVisible) {
              skipTouchPreviewActionRef.current = true;
              setTouchControlsVisible(true);
            }
          }}
          onClick={() => {
            if (skipTouchPreviewActionRef.current) {
              skipTouchPreviewActionRef.current = false;
              return;
            }
            onSpotlight(member.userId);
          }}
          data-action-label={t(
            previewPlacesOnBoard
              ? "classroom.v3.placeOnBoard"
              : "classroom.v3.focusAction",
          )}
          title={
            previewPlacesOnBoard
              ? t("classroom.v3.placeOnBoard")
              : t("classroom.v3.spotlightMember", {
                  name: member.displayName,
                })
          }
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
            {member.connectionStatus === "reconnecting"
              ? t("classroom.v3.reconnecting")
              : member.handRaisedAt
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
            {(canControlSelf || canControlStudent) && <ClassroomIconButton type="button" disabled={busy}
              title={t(canControlSelf ? microphoneOn ? "classroom.v3.closeMyMicrophone" : "classroom.v3.openMyMicrophone" : member.microphoneAllowed ? "classroom.v3.blockStudentMicrophone" : "classroom.v3.allowStudentMicrophone")}
              onClick={() => canControlSelf ? onToggleLocalMicrophone() : onManageMedia(member, "microphone")}>
              {microphoneControlOn ? <Mic /> : <MicOff />}
            </ClassroomIconButton>}
            {canManage && canPlaceOnBoard && <ClassroomIconButton type="button" disabled={busy} title={t("classroom.v3.placeOnBoard")} onClick={() => onPlaceOnBoard(member.userId)}><Move /></ClassroomIconButton>}
            {canControlSelf && <ClassroomIconButton type="button" disabled={busy} title={t(cameraOn ? "classroom.v3.closeMyCamera" : "classroom.v3.openMyCamera")} onClick={onToggleLocalCamera}>{cameraControlOn ? <Video /> : <VideoOff />}</ClassroomIconButton>}
            {(canControlStudent || (canReward && member.role === "student")) && <DropdownMenu modal={false} open={seatMenuOpen} onOpenChange={setSeatMenuOpen}>
              <DropdownMenuTrigger asChild><ClassroomIconButton type="button" disabled={busy} title={t("classroom.v3.more")}><MoreHorizontal /></ClassroomIconButton></DropdownMenuTrigger>
              <DropdownMenuContent className="classroom-header-menu classroom-seat-menu" sideOffset={6} collisionPadding={8}>
                {canManage && member.handRaisedAt && <DropdownMenuItem disabled={busy} onSelect={onAcknowledgeHand}><Check />{t("classroomWorkspace.acknowledgeHand")}</DropdownMenuItem>}
                {canControlStudent && <DropdownMenuItem disabled={busy} onSelect={() => onManageMedia(member, "camera")}>{cameraControlOn ? <Video /> : <VideoOff />}{t(member.cameraAllowed ? "classroom.v3.blockStudentCamera" : "classroom.v3.allowStudentCamera")}</DropdownMenuItem>}
                {canReward && member.role === "student" && <DropdownMenuItem disabled={busy} onSelect={() => onReward(member.userId)}><Trophy />{t("classroom.v3.giveReward")}</DropdownMenuItem>}
                {canControlStudent && member.onStage && <DropdownMenuItem disabled={busy} className="is-danger" onSelect={() => onRemoveStage(member.userId)}><X />{t("classroom.v3.removeStage")}</DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu>}
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
  canReward,
  busy,
  onSpotlight,
  onToggleLocalMicrophone,
  onToggleLocalCamera,
  onManageMedia,
  onRemoveStage,
  onReward,
  maxStudentSeats,
  collapsed,
  onToggleCollapsed,
  seatOrder,
  boardSourceIds,
  onReorder,
  onPlaceOnBoard,
  previewPlacesOnBoard,
  onAction, onViewMembers,
  canPlaceOnBoard = true,
  showHandQueue = true,
}: {
  showHandQueue?: boolean;
  members: ClassroomMemberSnapshot[];
  media: ClassroomMediaSnapshot;
  provider: ClassroomMediaProvider;
  currentUserId: string;
  canManage: boolean;
  canReward: boolean;
  busy: boolean;
  onSpotlight: (userId: string) => void;
  onToggleLocalMicrophone: () => void;
  onToggleLocalCamera: () => void;
  onManageMedia: (
    member: ClassroomMemberSnapshot,
    media: "microphone" | "camera",
  ) => void;
  onRemoveStage: (userId: string) => void;
  onReward: (userId: string) => void;
  maxStudentSeats: number | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  seatOrder: string[];
  boardSourceIds: Set<string>;
  onReorder: (seatOrder: string[]) => void;
  onPlaceOnBoard: (userId: string) => void;
  previewPlacesOnBoard: boolean;
  onAction: (action: ClassroomAction) => Promise<boolean>;
  onViewMembers: () => void;
  canPlaceOnBoard?: boolean;
}) {
  const { t } = useTranslation();
  const teachers = members.filter(
    (member) =>
      member.role !== "student" &&
      (classroomMemberVisible(member) || member.userId === currentUserId),
  );
  const students = members
    .filter((member) => member.role === "student" && member.onStage && (classroomMemberVisible(member) || member.userId === currentUserId));
  // The lead seat is the classroom's orientation point.  Keep teachers in
  // the rail even when their camera has also been placed on the board; a
  // student object can leave the rail, but the teacher should never make the
  // entire podium look empty.
  const unsortedSeatedMembers = [...teachers, ...students].filter(
    (member) => member.role !== "student" || !boardSourceIds.has(member.userId),
  );
  const seatIndex = new Map(seatOrder.map((userId, index) => [userId, index]));
  const seatedMembers = [...unsortedSeatedMembers].sort((left, right) => {
    const leftIndex = seatIndex.get(left.userId);
    const rightIndex = seatIndex.get(right.userId);
    if (leftIndex === undefined && rightIndex === undefined) return 0;
    if (leftIndex === undefined) return 1;
    if (rightIndex === undefined) return -1;
    return leftIndex - rightIndex;
  });
  const queue = raisedClassroomHands(members);
  const cameraParticipants = new Map(
    selectClassroomCameraParticipants(media.participants, members, currentUserId)
      .filter((participant) => participant.kind === "camera")
      .map((participant) => [classroomParticipantOwnerId(participant, members, currentUserId), participant]),
  );
  const moveSeat = (userId: string, slots: number) => {
    const currentOrder = seatedMembers.map((member) => member.userId);
    const from = currentOrder.indexOf(userId);
    if (from < 0) return;
    const to = Math.max(0, Math.min(currentOrder.length - 1, from + slots));
    if (from === to) return;
    const next = [...currentOrder];
    next.splice(from, 1);
    next.splice(to, 0, userId);
    onReorder(next);
  };
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
        <span className="classroom-v3-rail-toggle-summary" aria-hidden="true">
          <span className="classroom-rail-mini-avatars">{seatedMembers.slice(0,3).map(member => <ClassroomMemberAvatar key={member.userId} avatar={member.avatar} name={member.displayName} />)}</span>
          <strong>{seatedMembers.length}</strong>
        </span>
        <ChevronRight />
      </button>
      <div className="classroom-v3-rail-title">
        <i />
        <span>{t("classroom.v3.stageSeats")}</span>
        <strong>
          {seatedMembers.length} / {teachers.length + Math.max(maxStudentSeats ?? members.filter(member => member.role === "student" && classroomMemberVisible(member)).length, students.length)}
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
            onAcknowledgeHand={() => void onAction({ type: "acknowledgeHand", targetUserId: member.userId, handRaisedAt: member.handRaisedAt! })}
            canReward={canReward}
            busy={busy}
            onSpotlight={onSpotlight}
            onToggleLocalMicrophone={onToggleLocalMicrophone}
            onToggleLocalCamera={onToggleLocalCamera}
            onManageMedia={onManageMedia}
            onRemoveStage={onRemoveStage}
            onReward={onReward}
            onMoveSeat={moveSeat}
            onPlaceOnBoard={onPlaceOnBoard}
            previewPlacesOnBoard={previewPlacesOnBoard}
            canPlaceOnBoard={canPlaceOnBoard}
            canReorder={canManage && seatedMembers.length > 1}
          />
        ))}
      </div>
      {showHandQueue && canManage && queue.length > 0 && <div className="classroom-v3-hand-queue has-hands"><HandRaiseQueue members={members} busy={busy} onAction={onAction} onViewMembers={onViewMembers} /></div>}
    </section>
  );
}

function DrawerNavigation({
  active,
  onChange,
  counts,
  visiblePanels,
  whiteboardActive,
  screenAnnotationActive = false,
  canDraw,
  canShareScreen,
  screenSharing,
  screenShareBusy,
  onOpenWhiteboard,
  onToggleScreenShare,
  whiteboardController,
  whiteboardTool,
  onWhiteboardToolChange,
  railLevel,
  onInteract,
  canManageStage,
  onClassroomAction,
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
  whiteboardActive: boolean;
  screenAnnotationActive?: boolean;
  canDraw: boolean;
  canShareScreen: boolean;
  screenSharing: boolean;
  screenShareBusy: boolean;
  onOpenWhiteboard: () => void;
  onToggleScreenShare: () => void;
  whiteboardController: ClassroomWhiteboardController | null;
  whiteboardTool: ClassroomWhiteboardTool;
  onWhiteboardToolChange: (tool: ClassroomWhiteboardTool) => void;
  railLevel: "expanded" | "compact" | "collapsed";
  onInteract: () => void;
  canManageStage: boolean;
  onClassroomAction: (action: ClassroomAction) => void;
}) {
  const { t } = useTranslation();
  const prefersReducedMotion = useReducedMotion();
  const [toolSettingsOpen, setToolSettingsOpen] = useState(false);
  const [toolPopoverTop, setToolPopoverTop] = useState<number | null>(null);
  const [strokeColor, setStrokeColor] = useState("49-198-155");
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [eraserSize, setEraserSize] = useState<1 | 2 | 3 | 4>(2);
  const [textSize, setTextSize] = useState(24);
  const [classroomMenuOpen, setClassroomMenuOpen] = useState(false);
  const [clearBoardConfirming, setClearBoardConfirming] = useState(false);
  const clearBoardCancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!whiteboardController) return;
    whiteboardController.setStrokeColor(strokeColor.split("-").map(Number) as [number, number, number]);
    whiteboardController.setStrokeWidth(strokeWidth);
    whiteboardController.setEraserSize(eraserSize);
    whiteboardController.setTextSize(textSize);
  }, [whiteboardController, strokeColor, strokeWidth, eraserSize, textSize]);
  useEffect(() => {
    if (!toolSettingsOpen && !classroomMenuOpen) return;
    const dismiss = (event: PointerEvent) => {
      if ((event.target as Element).closest(".classroom-v3-tool-rail, .classroom-v3-tool-popover, .classroom-v3-management-menu")) return;
      setToolSettingsOpen(false);
      setClassroomMenuOpen(false);
    };
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") { setToolSettingsOpen(false); setClassroomMenuOpen(false); } };
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss, true); document.removeEventListener("keydown", escape); };
  }, [toolSettingsOpen, classroomMenuOpen]);
  useEffect(() => {
    if (!clearBoardConfirming) return;
    const frame = window.requestAnimationFrame(() => {
      clearBoardCancelRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [clearBoardConfirming]);
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
    { id: "captions", label: t("classroom.v3.captions"), icon: Headphones },
    { id: "courseware", label: t("classroom.v3.courseware"), icon: BookOpen },
    { id: "engagement", label: t("classroom.v3.engagement"), icon: Zap },
    { id: "activities", label: t("activities.title"), icon: FileText },
    { id: "tools", label: t("classroom.v3.tools"), icon: LayoutGrid, count: counts.hands },
  ];
  const boardTools: Array<{
    id: ClassroomWhiteboardTool;
    label: string;
    icon: typeof PenTool;
    settings?: boolean;
  }> = [
    { id: "selector", label: t("classroom.v3.boardSelect"), icon: MousePointer2 },
    { id: "clicker", label: t("classroom.v3.boardMove"), icon: Move },
    { id: "pencil", label: t("classroom.v3.boardPencil"), icon: Pencil, settings: true },
    { id: "text", label: t("classroom.v3.boardText"), icon: Type, settings: true },
    { id: "rectangle", label: t("classroom.v3.boardShape"), icon: Shapes, settings: true },
    {
      id: "eraser",
      label: t("classroom.v3.boardEraser"),
      icon: Eraser,
      settings: true,
    },
    { id: "laserPointer", label: t("classroom.v3.boardLaser"), icon: Radio },
  ];
  const selectedBoardTool =
    boardTools.find((tool) => tool.id === (screenAnnotationActive && whiteboardTool === "clicker" ? "selector" : whiteboardTool)) ||
    (whiteboardTool === "ellipse"
      ? boardTools.find((tool) => tool.id === "rectangle")
      : undefined) ||
    boardTools[0];
  const selectTool = (
    tool: typeof boardTools[number],
    target: HTMLButtonElement,
  ) => {
    onInteract();
    onWhiteboardToolChange(tool.id);
    whiteboardController?.setTool(tool.id);
    if (tool.id === "eraser") {
      whiteboardController?.setEraserSize(eraserSize);
    }
    setToolSettingsOpen(Boolean(tool.settings));
    if (tool.settings) {
      const side = target.closest(".classroom-v3-side")?.getBoundingClientRect();
      const button = target.getBoundingClientRect();
      setToolPopoverTop(
        side ? button.top - side.top + button.height / 2 : null,
      );
    }
  };

  if (railLevel === "collapsed") {
    return (
      <nav
        className="classroom-v3-tool-rail is-collapsed"
        aria-label={t("classroom.v3.classroomTools")}
      >
        <button type="button" onClick={onInteract} title={t("classroom.v3.expandTools")}>
          <MoreHorizontal />
        </button>
      </nav>
    );
  }

  return (
    <>
    <nav
      className={`classroom-v3-tool-rail is-${railLevel}`}
      aria-label={t("classroom.v3.classroomTools")}
      onPointerEnter={onInteract}
    >
      {canDraw && <div className="classroom-v3-board-tools">
        {(railLevel === "compact" ? [selectedBoardTool] : boardTools.filter((tool) => !screenAnnotationActive || tool.id !== "clicker")).map((tool) => {
          const Icon = tool.icon;
          return (
            <button
              key={tool.id}
              type="button"
              className={
                whiteboardTool === tool.id ||
                (tool.id === "rectangle" && whiteboardTool === "ellipse")
                  ? "is-active"
                  : ""
              }
              disabled={!whiteboardController}
              onClick={(event) => selectTool(tool, event.currentTarget)}
              title={tool.label}
              aria-pressed={whiteboardTool === tool.id}
            >
              <Icon />
              <span>{tool.label}</span>
            </button>
          );
        })}
        {railLevel === "expanded" && (
          <>
            <button
              type="button"
              disabled={!whiteboardController}
              onClick={() => {
                onInteract();
                whiteboardController?.undo();
              }}
              title={t("classroom.v3.undo")}
            >
              <Undo2 />
              <span>{t("classroom.v3.undo")}</span>
            </button>
            <button
              type="button"
              disabled={!whiteboardController}
              onClick={() => {
                onInteract();
                whiteboardController?.redo();
              }}
              title={t("classroom.v3.redo")}
            >
              <Redo2 />
              <span>{t("classroom.v3.redo")}</span>
            </button>
            <button
              type="button"
              disabled={!whiteboardController}
              onClick={() => {
                onInteract();
                setToolSettingsOpen(false);
                setClearBoardConfirming(true);
              }}
              title={t(screenAnnotationActive ? "classroom.v3.clearScreenAnnotations" : "classroom.v3.clearBoard")}
            >
              <Trash2 />
              <span>{t(screenAnnotationActive ? "classroom.v3.clearScreenAnnotations" : "classroom.v3.clearBoard")}</span>
            </button>
          </>
        )}
      </div>
      }
      <div className="classroom-v3-rail-primary">
        <button
          type="button"
          className={whiteboardActive ? "is-active" : ""}
          onClick={onOpenWhiteboard}
          title={t("classroom.v3.whiteboard")}
          aria-pressed={whiteboardActive}
        >
          <PenTool />
          <span>{t("classroom.v3.whiteboard")}</span>
        </button>
        {canShareScreen && (
          <button
            type="button"
            className={screenSharing ? "is-stop-sharing" : ""}
            disabled={screenShareBusy}
            onClick={onToggleScreenShare}
            title={t(screenSharing ? "classroom.v3.stopSharing" : "classroom.v3.screenShare")}
            aria-pressed={screenSharing}
          >
            {screenSharing ? <ScreenShareOff /> : <MonitorUp />}
            <span>{t(screenSharing ? "classroom.v3.stopSharing" : "classroom.v3.screenShare")}</span>
          </button>
        )}
      </div>
      {railLevel === "expanded" && items.filter((item) => visiblePanels.includes(item.id) && ["members", "chat", "captions"].includes(item.id)).map((item) => {
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
      {railLevel === "expanded" && (
        <DropdownMenu modal={false} open={classroomMenuOpen} onOpenChange={(open) => { setClassroomMenuOpen(open); if (open) { onInteract(); setToolSettingsOpen(false); } }}>
        <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={classroomMenuOpen ? "is-active" : ""}
          title={t("classroom.v3.classroomManagement")}
        >
          <MoreHorizontal />
          <span>{t("classroom.v3.classroomManagement")}</span>
        </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="left" align="end" sideOffset={10} collisionPadding={12} className="classroom-v3-management-menu w-56">
          {items.filter((item) => visiblePanels.includes(item.id) && !["members", "chat", "captions"].includes(item.id)).map((item) => { const Icon = item.icon; return <DropdownMenuItem key={item.id} onSelect={() => onChange(item.id)}><Icon />{item.label}</DropdownMenuItem>; })}
          {canManageStage && <>
            <DropdownMenuItem onSelect={() => onClassroomAction({ type: "authorizeAllOnStage" })}><PenTool />{t("classroom.v3.authorizeAllOnStage")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onClassroomAction({ type: "deauthorizeAll" })}><Lock />{t("classroom.v3.deauthorizeAll")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onClassroomAction({ type: "removeAllStudentsFromStage" })}><Users />{t("classroom.v3.removeAllFromStage")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onClassroomAction({ type: "resetComposition" })}><RefreshCw />{t("classroom.v3.resetLayout")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onClassroomAction({ type: "arrangeVideoGallery" })}><LayoutGrid />{t("classroom.v3.videoGallery")}</DropdownMenuItem>
          </>}
        </DropdownMenuContent>
        </DropdownMenu>
      )}
      {railLevel === "compact" && (
        <button type="button" onClick={onInteract} title={t("classroom.v3.expandTools")}>
          <MoreHorizontal />
        </button>
      )}
    </nav>
    <AnimatePresence>
      {clearBoardConfirming && (
        <motion.div
          className="classroom-v3-modal-backdrop is-board-confirm"
          initial={prefersReducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={prefersReducedMotion ? undefined : { opacity: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.16 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setClearBoardConfirming(false);
            }
          }}
        >
          <motion.section
            className="classroom-v3-confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="clear-board-dialog-title"
            aria-describedby="clear-board-dialog-description"
            initial={
              prefersReducedMotion
                ? false
                : { opacity: 0, y: 10, scale: 0.985 }
            }
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={
              prefersReducedMotion
                ? undefined
                : { opacity: 0, y: 8, scale: 0.985 }
            }
            transition={{
              duration: prefersReducedMotion ? 0 : 0.18,
              ease: [0.22, 1, 0.36, 1],
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setClearBoardConfirming(false);
              }
            }}
          >
            <div className="classroom-v3-confirm-icon" aria-hidden="true">
              <Trash2 />
            </div>
            <div className="classroom-v3-confirm-copy">
              <h2 id="clear-board-dialog-title">
                {t(screenAnnotationActive ? "classroom.v3.clearScreenAnnotationsTitle" : "classroom.v3.clearBoardTitle")}
              </h2>
              <p id="clear-board-dialog-description">
                {t(screenAnnotationActive ? "classroom.v3.confirmClearScreenAnnotations" : "classroom.v3.confirmClearBoard")}
              </p>
              {!screenAnnotationActive && <small>{t("classroom.v3.clearBoardIrreversible")}</small>}
            </div>
            <footer>
              <button
                ref={clearBoardCancelRef}
                type="button"
                className="is-secondary"
                onClick={() => setClearBoardConfirming(false)}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="is-danger"
                onClick={() => {
                  whiteboardController?.clear();
                  setClearBoardConfirming(false);
                }}
              >
                <Trash2 />
                {t(screenAnnotationActive ? "classroom.v3.clearScreenAnnotations" : "classroom.v3.clearBoardConfirm")}
              </button>
            </footer>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
    {toolSettingsOpen && railLevel === "expanded" && (
      <div
        className="classroom-v3-tool-popover is-brush"
        role="dialog"
        style={toolPopoverTop === null ? undefined : { top: toolPopoverTop }}
      >
        <div className="classroom-v3-tool-popover-header">
          <strong>{selectedBoardTool.label}</strong>
          <small>
            {selectedBoardTool.id === "eraser"
              ? t("classroom.v3.eraserSettings")
              : t("classroom.v3.whiteboardToolSettings")}
          </small>
        </div>
        {selectedBoardTool.id === "rectangle" && (
          <div className="classroom-v3-tool-shapes" role="group">
            {([
              ["rectangle", t("classroom.v3.boardRectangle"), Shapes],
              ["ellipse", t("classroom.v3.boardEllipse"), Circle],
            ] as const).map(([tool, label, Icon]) => (
              <button
                type="button"
                key={tool}
                className={whiteboardTool === tool ? "is-active" : ""}
                onClick={() => {
                  onWhiteboardToolChange(tool);
                  whiteboardController?.setTool(tool);
                  onInteract();
                }}
              >
                <Icon />
                <span>{label}</span>
              </button>
            ))}
          </div>
        )}
        {selectedBoardTool.id === "eraser" ? (
          <div
            className="classroom-v3-tool-eraser-sizes"
            role="radiogroup"
            aria-label={t("classroom.v3.eraserSettings")}
          >
            {([
              [1, 10, t("classroom.v3.eraserSizeSmall")],
              [2, 14, t("classroom.v3.eraserSizeMedium")],
              [3, 19, t("classroom.v3.eraserSizeLarge")],
              [4, 24, t("classroom.v3.eraserSizeExtraLarge")],
            ] as const).map(([size, diameter, label]) => (
              <button
                type="button"
                role="radio"
                key={size}
                className={eraserSize === size ? "is-active" : ""}
                aria-checked={eraserSize === size}
                aria-label={t("classroom.v3.eraserSize", { size: label })}
                title={t("classroom.v3.eraserSize", { size: label })}
                onClick={() => {
                  whiteboardController?.setEraserSize(size);
                  setEraserSize(size);
                  onInteract();
                }}
              >
                <i
                  aria-hidden="true"
                  style={{ "--eraser-size": `${diameter}px` } as CSSProperties}
                />
                <span>{label}</span>
              </button>
            ))}
          </div>
        ) : (
          <>
            <div className="classroom-v3-tool-colors">
              {([
                [30, 36, 46],
                [49, 198, 155],
                [75, 112, 245],
                [238, 78, 94],
                [246, 178, 62],
              ] as const).map((color) => (
                <button
                  type="button"
                  key={color.join("-")}
                  className={strokeColor === color.join("-") ? "is-active" : ""}
                  style={{ backgroundColor: `rgb(${color.join(" ")})` }}
                  onClick={() => {
                    whiteboardController?.setStrokeColor([...color]);
                    setStrokeColor(color.join("-"));
                    onInteract();
                  }}
                  aria-label={t("classroom.v3.chooseColor")}
                />
              ))}
            </div>
            <div className="classroom-v3-tool-widths">
              {[2, 4, 8].map((width) => (
                <button
                  type="button"
                  key={width}
                  className={strokeWidth === width ? "is-active" : ""}
                  onClick={() => {
                    whiteboardController?.setStrokeWidth(width);
                    setStrokeWidth(width);
                    onInteract();
                  }}
                  title={t("classroom.v3.strokeWidth", { width })}
                >
                  <i style={{ height: width }} />
                </button>
              ))}
            </div>
          </>
        )}
        {selectedBoardTool.id === "text" && (
          <div className="classroom-v3-tool-text-sizes" role="group">
            {[16, 24, 36].map((size) => (
              <button
                type="button"
                key={size}
                className={textSize === size ? "is-active" : ""}
                onClick={() => {
                  whiteboardController?.setTextSize(size);
                  setTextSize(size);
                  onInteract();
                }}
              >
                {size}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          className="classroom-v3-tool-popover-close"
          aria-label={t("classroom.v3.close")}
          onClick={() => {
            setToolSettingsOpen(false);
            setToolPopoverTop(null);
          }}
        >
          <X />
        </button>
      </div>
    )}
    </>
  );
}

function MemberPanel({
  members,
  presenceHealthy,
  screenLease,
  screenParticipants,
  canManage,
  canRequestScreenShare,
  busy,
  onAction,
}: {
  members: ClassroomMemberSnapshot[];
  presenceHealthy: boolean;
  screenLease?: import("@/lib/classroom/types").ClassroomScreenShareLease;
  screenParticipants: import("@/lib/classroom/types").ClassroomParticipant[];
  canManage: boolean;
  canRequestScreenShare: boolean;
  busy: string | null;
  onAction: (action: ClassroomAction) => void;
}) {
  const { t } = useTranslation();
  const summary = classroomPresenceSummary(members);
  const shareStatus = (member: ClassroomMemberSnapshot) => memberScreenShareStatus(member, screenLease, screenParticipants);
  const shareLabel = (member: ClassroomMemberSnapshot) => ({
    idle: "", requested: "screenShareRequested", ready: "screenShareAuthorizedIdle",
    starting: "screenShareStarting", sharing: "screenSharing", declined: "screenShareDeclined",
  })[shareStatus(member)];
  const shareActionLabel = (member: ClassroomMemberSnapshot) => ({
    idle: "requestScreenShare", declined: "requestScreenShare", requested: "cancelScreenShareRequest",
    ready: "revokeScreenSharePermission", starting: "stopStudentScreenShare", sharing: "stopStudentScreenShare",
  })[shareStatus(member)];
  const sorted = members.filter(classroomMemberVisible).sort((a, b) => {
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
          <h2>{t("classroom.v3.memberTitle")}</h2>
        </div>
        <span>
          {presenceHealthy ? t("classroom.v3.onlineCount", { count: summary.online }) : t("classroomRoster.syncing")}
        </span>
      </div>
      <p className="classroom-roster-summary" role="status">
        {presenceHealthy ? <>
          <span>{t("classroomRoster.students", { count: summary.students })}</span>
          <span>{t("classroomRoster.teachers", { count: summary.teachers })}</span>
          <span>{t("classroomRoster.assistants", { count: summary.assistants })}</span>
          {summary.reconnecting > 0 && <span>{t("classroomRoster.reconnecting", { count: summary.reconnecting })}</span>}
        </> : t("classroomRoster.syncingHint")}
      </p>
      {canManage && <div className="classroom-v3-bulk-actions">
        <button type="button" disabled={Boolean(busy)} aria-busy={busy === "muteAllMicrophones"} onClick={() => onAction({ type: "muteAllMicrophones" })}>{busy === "muteAllMicrophones" ? <Loader2 className="animate-spin" /> : <MicOff />}{t("classroom.v3.muteAllMicrophones")}</button>
        <button type="button" disabled={Boolean(busy)} aria-busy={busy === "unmuteAllMicrophones"} onClick={() => onAction({ type: "unmuteAllMicrophones" })}>{busy === "unmuteAllMicrophones" ? <Loader2 className="animate-spin" /> : <Mic />}{t("classroom.v3.unmuteAllMicrophones")}</button>
      </div>}
      <div className="classroom-v3-member-list">
        {sorted.map((member) => (
          <article
            key={member.userId}
            draggable={canManage && member.role === "student" && !member.onStage}
            onDragStart={(event) => {
              if (!canManage || member.role !== "student" || member.onStage) return;
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData(
                "application/x-classroom-member",
                member.userId,
              );
              event.dataTransfer.setData("text/plain", member.displayName);
            }}
          >
            <span className="classroom-v3-member-avatar">
              <ClassroomMemberAvatar avatar={member.avatar} name={member.displayName} />
              <i className={member.connectionStatus === "reconnecting" ? "is-reconnecting" : member.online ? "is-online" : ""} />
            </span>
            <span className="classroom-v3-member-copy">
              <strong>{member.displayName}</strong>
              <small>
                {roleLabel(member.role, t)}
                {member.connectionStatus === "reconnecting" ? ` · ${t("classroom.v3.reconnecting")}` : ""}
                {member.handRaisedAt
                  ? ` · ${t("classroom.v3.handRaised")}`
                  : ""}
                {member.role === "student" ? ` · ${t(member.onStage ? "classroom.v3.onStage" : member.stageState === "invited" ? "classroom.v3.stageInvitationPending" : "classroom.v3.offStage")}` : ""}
                {shareLabel(member) ? ` · ${t(`classroom.v3.${shareLabel(member)}`)}` : ""}
              </small>
            </span>
            {member.role === "student" && canManage && (
              <span className="classroom-v3-member-actions">
                {!member.onStage && (
                  <button
                    type="button"
                    className={member.stageState === "invited" ? "is-pending" : ""}
                    disabled={Boolean(busy)}
                    onClick={() => onAction({ type: member.stageState === "invited" ? "removeStage" : "inviteStage", targetUserId: member.userId })}
                    title={t(member.stageState === "invited"
                      ? "classroom.v3.cancelStageInvitation"
                      : "classroom.v3.inviteStage")}
                  >
                    {member.stageState === "invited" ? <X /> : <UserPlus />}
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
                  onClick={() =>
                    onAction({
                      type: "setWhiteboardWritable",
                      targetUserId: member.userId,
                      writable: !member.whiteboardWritable,
                    })
                  }
                  title={
                    t("classroom.v3.whiteboardPermission")
                  }
                >
                  <PenTool />
                </button>
                {canRequestScreenShare && <button
                  type="button"
                  className={
                    shareStatus(member) === "sharing"
                      ? "is-on"
                      : ["requested", "starting"].includes(shareStatus(member))
                        ? "is-pending"
                        : ""
                  }
                  onClick={() =>
                    onAction(
                      ["idle", "declined"].includes(shareStatus(member))
                        ? {
                            type: "requestScreenShare",
                            targetUserId: member.userId,
                          }
                        : {
                            type: "stopScreenShare",
                            targetUserId: member.userId,
                          },
                    )
                  }
                  disabled={Boolean(busy)}
                  aria-pressed={shareStatus(member) === "sharing"}
                  aria-label={t(`classroom.v3.${shareActionLabel(member)}`)}
                  title={t(`classroom.v3.${shareActionLabel(member)}`)}
                >
                  {["sharing", "starting"].includes(shareStatus(member)) ? (
                    <ScreenShareOff />
                  ) : shareStatus(member) === "ready" ? (
                    <ShieldCheck />
                  ) : shareStatus(member) === "requested" ? (
                    <X />
                  ) : (
                    <MonitorUp />
                  )}
                </button>}
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
                <button type="button" title={t("classroom.v3.giveTrophy")} onClick={() => onAction({ type: "giveReward", targetUserIds: [member.userId] })}><Trophy /></button>
              </span>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

export { TestChatPanel };

function BreakoutPanel({
  spaces,
  members,
  role,
  activeSpaceId,
  roomMedia,
  roomProvider,
  busy,
  error,
  onCreate,
  onAutoAssign,
  onSpaceAction,
  onAssign,
  onConnect,
  onDisconnect,
}: {
  spaces: ClassroomSpaceSnapshot[];
  members: ClassroomMemberSnapshot[];
  role: ClassroomMemberSnapshot["role"];
  activeSpaceId: string | null;
  roomMedia: ClassroomMediaSnapshot;
  roomProvider: ClassroomMediaProvider | null;
  busy: boolean;
  error?: string;
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
  onDisconnect: () => void;
}) {
  const { t } = useTranslation();
  const [count, setCount] = useState(4);
  const [capacity, setCapacity] = useState(12);
  const assignedIds = new Set(
    spaces.flatMap((space) => space.members.map((member) => member.userId)),
  );
  const unassigned = members.filter(
    (member) =>
      !isClassroomTeachingRole(member.role) &&
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

      {isClassroomTeachingRole(role) && spaces.length === 0 ? (
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
          <button
            type="button"
            disabled={busy}
            aria-busy={busy}
            onClick={() => onCreate(count, capacity)}
          >
            {busy ? <Loader2 className="animate-spin" /> : <DoorOpen />}
            {busy
              ? t("classroom.v3.creatingBreakouts")
              : t("classroom.v3.createBreakouts")}
          </button>
          {error ? (
            <p className="classroom-v3-breakout-feedback" role="alert">
              <AlertCircle />
              {error}
            </p>
          ) : null}
        </section>
      ) : null}

      {isClassroomTeachingRole(role) && spaces.length > 0 ? (
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

      {spaces.length === 0 && !isClassroomTeachingRole(role) ? (
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
              {isClassroomTeachingRole(role) && (
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
                    <ClassroomMemberAvatar avatar={member.avatar} name={member.displayName} />
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
                      {isClassroomTeachingRole(role) ? (
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

            {isClassroomTeachingRole(role) && unassigned.length > 0 ? (
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
            {isClassroomTeachingRole(role) ? (
              <button type="button" disabled={busy} onClick={onDisconnect}>
                {t("classroom.v3.returnToMainRoom")}
              </button>
            ) : null}
          </header>
          <div>
            {selectClassroomCameraParticipants(roomMedia.participants, activeSpace.members).map((participant) => {
              const ownerId = participantOwnerId(participant.id, activeSpace.members);
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
      {!isClassroomTeachingRole(role) ? (
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


function EngagementPanel({
  engagement,
  members,
  currentUserId,
  canGiveReward,
  canRun,
  canParticipate,
  busy,
  onAction,
}: {
  engagement: ClassroomSessionResponse["engagement"];
  members: ClassroomMemberSnapshot[];
  currentUserId: string;
  canGiveReward: boolean;
  canRun: boolean;
  canParticipate: boolean;
  busy: boolean;
  onAction: (action: ClassroomAction) => void;
}) {
  const { t } = useTranslation();
  const buzz = engagement.activeBuzz;
  const selector = engagement.selector;
  const onStageStudentIds = members
    .filter((member) => member.role === "student" && member.onStage && member.online)
    .map((member) => member.userId);
  const rewardedStudents = members
    .filter((member) => member.role === "student" && member.rewardCount > 0)
    .sort((left, right) => right.rewardCount - left.rewardCount)
    .slice(0, 5);

  return (
    <div className="classroom-v3-panel-body is-engagement">
      <div className="classroom-v3-panel-heading">
        <div>
          <small>{t("classroom.v3.engagementEyebrow")}</small>
          <h2>{t("classroom.v3.engagement")}</h2>
        </div>
      </div>

      <section className={`classroom-v3-engagement-card is-buzz ${buzz?.status === "active" ? "is-live" : ""}`}>
        <header><Zap /><span><strong>{t("classroom.v3.buzz")}</strong><small>{t("classroom.v3.buzzHint")}</small></span></header>
        {buzz?.winnerUserId ? (
          <div className="classroom-v3-engagement-result">
            <span><Trophy /></span>
            <div><small>{t("classroom.v3.buzzWinner")}</small><strong>{buzz.winnerName}</strong></div>
          </div>
        ) : buzz?.status === "active" ? (
          <p className="classroom-v3-engagement-live"><i />{t("classroom.v3.buzzOpen")}</p>
        ) : null}
        {canRun ? (
          <div className="classroom-v3-engagement-actions">
            <button type="button" disabled={busy} className="is-primary" onClick={() => onAction({ type: "startBuzz" })}>
              <Zap />{buzz?.status === "active" ? t("classroom.v3.restartBuzz") : t("classroom.v3.startBuzz")}
            </button>
            {buzz?.status === "active" && (
              <button type="button" disabled={busy} onClick={() => onAction({ type: "closeBuzz" })}>{t("classroom.v3.closeBuzz")}</button>
            )}
          </div>
        ) : canParticipate ? (
          <button
            type="button"
            className="classroom-v3-buzz-button"
            disabled={busy || buzz?.status !== "active" || Boolean(buzz.winnerUserId)}
            onClick={() => onAction({ type: "submitBuzz" })}
          >
            <Zap />
            {buzz?.winnerUserId === currentUserId ? t("classroom.v3.buzzWon") : t("classroom.v3.buzzNow")}
          </button>
        ) : null}
      </section>

      {canRun && (
        <section className="classroom-v3-engagement-card is-selector">
          <header><Dices /><span><strong>{t("classroom.v3.randomSelector")}</strong><small>{t("classroom.v3.randomSelectorHint")}</small></span></header>
          {selector?.selectedUserName && (
            <div className="classroom-v3-selector-result"><small>{t("classroom.v3.selectedStudent")}</small><strong>{selector.selectedUserName}</strong></div>
          )}
          <div className="classroom-v3-engagement-actions">
            <button type="button" disabled={busy} className="is-primary" onClick={() => onAction({ type: "startRandomSelector" })}>
              <Dices />{t("classroom.v3.selectStudent")}
            </button>
            {selector && <button type="button" disabled={busy} onClick={() => onAction({ type: "resetRandomSelector" })}>{t("classroom.v3.resetCycle")}</button>}
          </div>
        </section>
      )}

      {canGiveReward && (
        <section className="classroom-v3-engagement-card is-reward">
          <header><Trophy /><span><strong>{t("classroom.v3.reward")}</strong><small>{t("classroom.v3.rewardHint")}</small></span></header>
          <button
            type="button"
            className="classroom-v3-reward-stage"
            disabled={busy || onStageStudentIds.length === 0}
            onClick={() => onAction({ type: "giveReward", targetUserIds: onStageStudentIds })}
          >
            <Trophy />{t("classroom.v3.rewardOnStage", { count: onStageStudentIds.length })}
          </button>
          {rewardedStudents.length > 0 && (
            <div className="classroom-v3-reward-list">
              {rewardedStudents.map((member) => <span key={member.userId}><strong>{member.displayName}</strong><small><Trophy />{member.rewardCount}</small></span>)}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function ToolsPanel({
  runtime,
  canManage,
  busy,
  onAction,
  onFullscreen,
  onSettings,
  whiteboardController,
}: {
  runtime: ClassroomRuntimeSnapshot;
  canManage: boolean;
  busy: boolean;
  onAction: (action: ClassroomAction) => void;
  onFullscreen: () => void;
  onSettings: () => void;
  whiteboardController: ClassroomWhiteboardController | null;
}) {
  const { t } = useTranslation();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const boardInputRef = useRef<HTMLInputElement>(null);
  const [whiteboardToolBusy, setWhiteboardToolBusy] = useState(false);
  const [whiteboardToolError, setWhiteboardToolError] = useState("");
  const runWhiteboardTool = async (action: () => Promise<void>) => {
    if (!whiteboardController || whiteboardToolBusy) return;
    setWhiteboardToolBusy(true);
    setWhiteboardToolError("");
    try {
      await action();
    } catch (error) {
      setWhiteboardToolError(
        error instanceof Error
          ? error.message
          : t("classroom.v3.whiteboardToolFailed"),
      );
    } finally {
      setWhiteboardToolBusy(false);
    }
  };
  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const timestamp = () =>
    new Date().toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/, "");
  return (
    <div className="classroom-v3-panel-body">
      <div className="classroom-v3-panel-heading">
        <div>
          <small>{t("classroom.v3.teachingToolsEyebrow")}</small>
          <h2>{t("classroom.v3.classroomTools")}</h2>
        </div>
      </div>
      <div className="classroom-v3-tool-grid">
        {canManage && [5, 10, 20].map((minutes) => (
          <button
            key={minutes}
            type="button"
            disabled={!canManage || busy}
            aria-busy={busy}
            onClick={() =>
              onAction({ type: "startTimer", durationSec: minutes * 60 })
            }
          >
            {busy ? <Loader2 className="animate-spin" /> : <Clock3 />}
            <strong>{t("classroom.v3.minutes", { count: minutes })}</strong>
            <small>{t("classroom.v3.classTimer")}</small>
          </button>
        ))}
        {canManage && <button
          type="button"
          disabled={!runtime.timerStartedAt || busy}
          onClick={() => onAction({ type: "resetTimer" })}
        >
          <TimerReset />
          <strong>{t("classroom.v3.resetTimer")}</strong>
          <small>{t("classroom.v3.resetTimerHint")}</small>
        </button>}
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
        <button
          type="button"
          disabled={!whiteboardController || whiteboardToolBusy}
          onClick={() =>
            void runWhiteboardTool(async () => {
              const image = await whiteboardController!.capture();
              downloadBlob(image, `whiteboard-${timestamp()}.png`);
            })
          }
        >
          <Camera />
          <strong>{t("classroom.v3.boardScreenshot")}</strong>
          <small>{t("classroom.v3.boardScreenshotHint")}</small>
        </button>
        <button
          type="button"
          disabled={!whiteboardController || whiteboardToolBusy}
          onClick={() => imageInputRef.current?.click()}
        >
          <ImageIcon />
          <strong>{t("classroom.v3.insertBoardImage")}</strong>
          <small>{t("classroom.v3.insertBoardImageHint")}</small>
        </button>
        <button
          type="button"
          disabled={!whiteboardController || whiteboardToolBusy}
          onClick={() =>
            void runWhiteboardTool(async () => {
              const file = await whiteboardController!.exportBoard();
              downloadBlob(file, `whiteboard-${timestamp()}.whiteboard`);
            })
          }
        >
          <Save />
          <strong>{t("classroom.v3.saveBoardFile")}</strong>
          <small>{t("classroom.v3.saveBoardFileHint")}</small>
        </button>
        <button
          type="button"
          disabled={!whiteboardController || whiteboardToolBusy}
          onClick={() => boardInputRef.current?.click()}
        >
          <Upload />
          <strong>{t("classroom.v3.restoreBoardFile")}</strong>
          <small>{t("classroom.v3.restoreBoardFileHint")}</small>
        </button>
      </div>
      <input
        ref={imageInputRef}
        hidden
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (!file) return;
          void runWhiteboardTool(async () => {
            if (file.size > 4 * 1024 * 1024) {
              throw new Error(t("classroom.v3.boardImageTooLarge"));
            }
            const dataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onerror = () => reject(reader.error || new Error("IMAGE_READ_FAILED"));
              reader.onload = () => resolve(String(reader.result || ""));
              reader.readAsDataURL(file);
            });
            await whiteboardController!.insertImage(dataUrl);
          });
        }}
      />
      <input
        ref={boardInputRef}
        hidden
        type="file"
        accept=".whiteboard,application/octet-stream"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (!file) return;
          void runWhiteboardTool(() => whiteboardController!.importBoard(file));
        }}
      />
      {whiteboardToolError ? (
        <p className="classroom-v3-tool-error" role="alert">
          <AlertCircle />
          {whiteboardToolError}
        </p>
      ) : null}
    </div>
  );
}

function StageTimerOverlay({
  durationSec,
  remainingSec,
  paused,
  canManage,
  busy,
  onDismiss,
  onTogglePaused,
  onReset,
}: {
  durationSec: number;
  remainingSec: number;
  paused: boolean;
  canManage: boolean;
  busy: boolean;
  onDismiss?: () => void;
  onTogglePaused: () => void;
  onReset: () => void;
}) {
  const { t } = useTranslation();
  const remaining = Math.max(0, remainingSec);
  const progress = Math.min(
    100,
    Math.max(0, (remaining / Math.max(1, durationSec)) * 100),
  );
  const urgent = remaining <= 30;

  return (
    <motion.section
      className={`classroom-v3-timer-overlay ${urgent ? "is-urgent" : ""} ${onDismiss ? "" : "is-fixed"}`}
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ duration: 0.2 }}
      aria-live="polite"
    >
      {onDismiss ? (
        <button
          type="button"
          className="classroom-v3-timer-dismiss"
          onClick={onDismiss}
          title={t("classroom.v3.hideTimer")}
          aria-label={t("classroom.v3.hideTimer")}
        >
          <X />
        </button>
      ) : null}
      <div className="classroom-v3-timer-copy">
        <Clock3 />
        <span>
          <small>{t("classroom.v3.classTimer")}</small>
          <strong>{formatClock(remaining)}</strong>
        </span>
      </div>
      <div
        className="classroom-v3-timer-progress"
        role="progressbar"
        aria-label={t("classroom.v3.classTimer")}
        aria-valuemin={0}
        aria-valuemax={durationSec}
        aria-valuenow={Math.ceil(remaining)}
      >
        <i style={{ transform: `scaleX(${progress / 100})` }} />
      </div>
      {canManage ? (
        <div className="classroom-v3-timer-actions">
          <button
            type="button"
            disabled={busy || remaining <= 0}
            onClick={onTogglePaused}
            title={paused ? t("classroom.v3.resumeTimer") : t("classroom.v3.pauseTimer")}
          >
            {busy ? (
              <Loader2 className="animate-spin" />
            ) : paused ? (
              <Play />
            ) : (
              <Pause />
            )}
            <span>{paused ? t("classroom.v3.resumeTimer") : t("classroom.v3.pauseTimer")}</span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onReset}
            title={t("classroom.v3.resetTimer")}
          >
            <TimerReset />
            <span>{t("classroom.v3.resetTimer")}</span>
          </button>
        </div>
      ) : null}
    </motion.section>
  );
}

function DeviceSettings({
  open,
  theme,
  onThemeChange,
  provider,
  media,
  runtime,
  canManageRecording,
  canManageStage,
  stageStudentLimit,
  stageDefaultStudentLimit,
  stageSettingsBusy,
  onStageSettingsChange,
  canUseAuxiliaryCamera,
  onClassStartModeChange,
  onCaptionStartPreferencesChange,
  startSettingsBusy,
  focusClassStart = false,
  onRecordingStartModeChange,
  onOpenCaptions,
  onClose,
}: {
  open: boolean;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  provider: ClassroomMediaProvider | null;
  media: ClassroomMediaSnapshot;
  runtime: ClassroomRuntimeSnapshot | null;
  canManageRecording: boolean;
  canManageStage: boolean;
  stageStudentLimit: number | null;
  stageDefaultStudentLimit: number | null;
  stageSettingsBusy: boolean;
  onStageSettingsChange: (studentLimit: number | null, inviteBypassLimit: boolean) => void;
  canUseAuxiliaryCamera: boolean;
  onClassStartModeChange: (mode: ClassStartMode) => void;
  onCaptionStartPreferencesChange: (value: CaptionStartPreferences) => void;
  startSettingsBusy: boolean;
  focusClassStart?: boolean;
  onRecordingStartModeChange: (mode: "classStart" | "scheduled" | "scheduledEarly" | "disabled") => void;
  onOpenCaptions?: () => void;
  onClose: () => void;
}) {
  const { t, locale, setLocale } = useTranslation();
  const [devices, setDevices] = useState<{
    microphones: MediaDeviceInfo[];
    cameras: MediaDeviceInfo[];
  }>({ microphones: [], cameras: [] });
  const [deviceSelection, setDeviceSelection] = useState<{
    provider: ClassroomMediaProvider | null;
    microphoneId: string;
    cameraId: string;
  }>({ provider: null, microphoneId: "", cameraId: "" });
  const selectedDevices =
    deviceSelection.provider === provider
      ? deviceSelection
      : { provider, microphoneId: "", cameraId: "" };
  const primaryDeviceId = media.local.cameraDeviceId || selectedDevices.cameraId;
  const [error, setError] = useState("");
  const [backgroundMode, setBackgroundMode] = useState<
    ClassroomVideoBackgroundEffect["type"]
  >("none");
  const [backgroundBusy, setBackgroundBusy] = useState(false);
  const [customBackgroundName, setCustomBackgroundName] = useState("");
  const backgroundSupported = provider?.supportsVirtualBackground() ?? false;
  useEffect(() => {
    if (!open || !provider) return;
    let cancelled = false;
    const refresh = () => void provider.listDevices().then((devices) => {
      if (!cancelled) setDevices(devices);
    }).catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : t("classroom.v3.deviceReadFailed")); });
    refresh();
    navigator.mediaDevices?.addEventListener("devicechange", refresh);
    return () => { cancelled = true; navigator.mediaDevices?.removeEventListener("devicechange", refresh); };
  }, [open, provider, t]);

  const selectDevice = async (kind: "microphone" | "camera", deviceId: string) => {
    if (!provider || !deviceId) return;
    setError("");
    try {
      if (kind === "microphone") {
        await provider.setMicrophoneDevice(deviceId);
      } else {
        await provider.setCameraDevice(deviceId);
      }
      setDeviceSelection((current) => ({
        provider,
        microphoneId:
          kind === "microphone"
            ? deviceId
            : current.provider === provider
              ? current.microphoneId
              : "",
        cameraId:
          kind === "camera"
            ? deviceId
            : current.provider === provider
              ? current.cameraId
              : "",
      }));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("classroom.v3.mediaActionFailed"),
      );
    }
  };

  const applyBackground = async (effect: ClassroomVideoBackgroundEffect) => {
    if (!provider || backgroundBusy) return false;
    setError("");
    setBackgroundBusy(true);
    try {
      await provider.setVirtualBackground(effect);
      setBackgroundMode(effect.type);
      if (effect.type !== "image") setCustomBackgroundName("");
      return true;
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("classroom.v3.backgroundApplyFailed"),
      );
      return false;
    } finally {
      setBackgroundBusy(false);
    }
  };

  const uploadBackground = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file || backgroundBusy || !provider) return;
    if (!CLASSROOM_BACKGROUND_IMAGE_TYPES.has(file.type)) {
      setError(t("classroom.v3.backgroundImageInvalid"));
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError(t("classroom.v3.backgroundImageTooLarge"));
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();
    try {
      image.src = objectUrl;
      await image.decode();
      const applied = await applyBackground({ type: "image", source: image });
      if (applied) setCustomBackgroundName(file.name);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("classroom.v3.backgroundApplyFailed"),
      );
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };
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
            className="classroom-v3-device-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={t("classroom.v3.deviceSettings")}
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
          >
            <header>
              <div>
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
            <div className="classroom-v3-appearance">
              <strong>{t("portal.appearance")}</strong>
              <div role="group" aria-label={t("portal.appearance")}>
                <button
                  type="button"
                  className={theme === "light" ? "is-selected" : ""}
                  aria-pressed={theme === "light"}
                  onClick={() => onThemeChange("light")}
                >
                  <Sun />
                  {t("classroom.v3.lightMode")}
                </button>
                <button
                  type="button"
                  className={theme === "dark" ? "is-selected" : ""}
                  aria-pressed={theme === "dark"}
                  onClick={() => onThemeChange("dark")}
                >
                  <Moon />
                  {t("classroom.v3.darkMode")}
                </button>
              </div>
            </div>
            <div className="classroom-v3-device-body">
              <div className="classroom-v3-device-column">
                <div className="classroom-v3-device-fields">
                  <label>
                    <span>{t("classroom.v3.microphone")}</span>
                    <select
                      value={
                        devices.microphones.some(
                          (device) => device.deviceId === selectedDevices.microphoneId,
                        )
                          ? selectedDevices.microphoneId
                          : ""
                      }
                      onChange={(event) =>
                        void selectDevice("microphone", event.target.value)
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
                      value={
                        devices.cameras.some(
                          (device) => device.deviceId === primaryDeviceId,
                        )
                          ? primaryDeviceId
                          : ""
                      }
                      onChange={(event) =>
                        void selectDevice("camera", event.target.value)
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
                </div>
                <details className="classroom-device-extra" open={media.local.auxiliaryCameraOn || undefined}>
                  <summary><Video /><span>{t("classroom.v3.auxiliaryCamera")}</span><ChevronDown /></summary>
                  <AuxiliaryCameraSettings provider={provider} media={media} cameras={devices.cameras}
                    primaryDeviceId={primaryDeviceId} allowed={canUseAuxiliaryCamera} onError={setError} />
                </details>
                <fieldset className="classroom-v3-background-options">
                  <legend>{t("classroom.v3.videoBackground")}</legend>
                  <button
                    type="button"
                    className={backgroundMode === "none" ? "is-selected" : ""}
                    aria-pressed={backgroundMode === "none"}
                    disabled={backgroundBusy}
                    onClick={() => void applyBackground({ type: "none" })}
                  >
                    <EyeOff />
                    <span>{t("classroom.v3.backgroundNone")}</span>
                    {backgroundMode === "none" && <Check />}
                  </button>
                  <button
                    type="button"
                    className={backgroundMode === "blur" ? "is-selected" : ""}
                    aria-pressed={backgroundMode === "blur"}
                    disabled={!backgroundSupported || backgroundBusy}
                    onClick={() =>
                      void applyBackground({ type: "blur", blurDegree: 2 })
                    }
                  >
                    <ShieldCheck />
                    <span>{t("classroom.v3.backgroundBlur")}</span>
                    {backgroundMode === "blur" && <Check />}
                  </button>
                  <button
                    type="button"
                    className={backgroundMode === "color" ? "is-selected" : ""}
                    aria-pressed={backgroundMode === "color"}
                    disabled={!backgroundSupported || backgroundBusy}
                    onClick={() =>
                      void applyBackground({ type: "color", color: "#293a4c" })
                    }
                  >
                    <span className="classroom-v3-background-color" />
                    <span>{t("classroom.v3.backgroundColor")}</span>
                    {backgroundMode === "color" && <Check />}
                  </button>
                  <label
                    className={`${backgroundMode === "image" ? "is-selected" : ""}${
                      !backgroundSupported || backgroundBusy ? " is-disabled" : ""
                    }`}
                  >
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={!backgroundSupported || backgroundBusy}
                      onChange={(event) => void uploadBackground(event)}
                    />
                    <ImageIcon />
                    <span>{t("classroom.v3.customBackground")}</span>
                    {backgroundMode === "image" && <Check />}
                  </label>
                </fieldset>
                <p className="classroom-v3-background-hint" role="status">
                  {backgroundBusy
                    ? t("classroom.v3.backgroundApplying")
                    : !backgroundSupported
                      ? t("classroom.v3.virtualBackgroundUnsupported")
                      : customBackgroundName
                        ? t("classroom.v3.customBackgroundSelected", {
                            name: customBackgroundName,
                          })
                        : t("classroom.v3.virtualBackgroundPrivacyHint")}
                </p>
              </div>
              <div className="classroom-v3-device-column">
                {canManageRecording && runtime && <>
                  <ClassStartSettings runtime={runtime} reveal={focusClassStart} busy={startSettingsBusy} onChange={onClassStartModeChange} />
                  <CaptionStartSettings value={runtime.captionStartPreferences ?? newCaptionStartPreferences()} disabled={startSettingsBusy || runtime.status !== "waiting"} onChange={onCaptionStartPreferencesChange} />
                  <fieldset className="classroom-v3-caption-settings classroom-v3-start-policy is-recording">
                    <legend>{t("classroom.v3.recordingPolicyTitle")}</legend>
                    <label>
                      <span>{t("classroom.v3.recordingPolicyLabel")}</span>
                      <select aria-label={t("classroom.v3.recordingPolicyTitle")} disabled={startSettingsBusy}
                        value={runtime.recordingStartMode === "disabled" ? "disabled" : "classStart"}
                        onChange={event => onRecordingStartModeChange(event.target.value as "classStart" | "disabled")}>
                        <option value="classStart">{t("classroom.v3.recordingPolicyEnabled")}</option>
                        <option value="disabled">{t("classroom.v3.noRecording")}</option>
                      </select>
                    </label>
                    <p>{t("classroom.v3.recordingPolicyHint")}</p>
                  </fieldset>
                </>}
                <fieldset className="classroom-v3-caption-settings"><legend>{t("classroom.v3.interfaceLanguage")}</legend><select aria-label={t("classroom.v3.interfaceLanguage")} value={locale} onChange={(event) => setLocale(event.target.value as SupportedLocale)}>{languageOptions.map((language) => <option key={language.value} value={language.value}>{language.label}</option>)}</select></fieldset>
                <button type="button" className="classroom-v3-caption-settings-link" onClick={() => { onClose(); onOpenCaptions?.(); }}><Headphones />{t("classroomUpdates.openCaptionSettings")}</button>

                {canManageStage && runtime && <StageSettings
                  key={stageStudentLimit}
                  studentLimit={stageStudentLimit} inviteBypassLimit={runtime.stageInviteBypassLimit !== false}
                  defaultStudentLimit={stageDefaultStudentLimit}
                  studentCount={runtime.members.filter(member => member.role === "student" && classroomMemberVisible(member)).length}
                  busy={stageSettingsBusy} onChange={onStageSettingsChange}
                />}

              </div>
            </div>
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

export function ClassroomV3({
  recorderMode = false,
  classinLayout = true,
}: {
  recorderMode?: boolean;
  classinLayout?: boolean;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { t, locale, setLocale } = useTranslation();
  // UI translations change immediately, while locale changes must not tear
  // down the active RTC connection or request fresh classroom credentials.
  const sessionTranslationRef = useRef(t);
  useEffect(() => { sessionTranslationRef.current = t; }, [t]);
  const translateSession = useCallback(
    (...args: Parameters<typeof t>) => sessionTranslationRef.current(...args),
    [],
  );
  const theme = useSyncExternalStore(
    subscribeToTheme,
    getClientTheme,
    getServerTheme,
  );
  const requestedSessionId = searchParams.get("sessionId") || "";
  const legacyCourseId = searchParams.get("courseId") || "";
  const legacyEntrySearch = requestedSessionId ? "" : searchParams.toString();
  // `courseId` remains the local classroom-scope identifier to keep the
  // media/signaling code compact. For V3 links it is the authoritative
  // session id; legacy links resolve their course id to a default session.
  const courseId = requestedSessionId || legacyCourseId;
  const shareAccess = searchParams.get("shareAccess") || "";
  const recorderToken = searchParams.get("recorderToken") || "";
  const recordingId = searchParams.get("recordingId") || "";
  const isRecorder =
    recorderMode ||
    searchParams.get("is_recorder") === "1" ||
    Boolean(recorderToken);
  const emitHostEvent = useClassroomHostEvents(searchParams.get("parentOrigin"), isRecorder);
  const [loadingState, setLoadingState] = useState<LoadingState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [launchRetry, setLaunchRetry] = useState(0);
  const [launchAttempt, setLaunchAttempt] = useState(0);
  const [entryPhase, setEntryPhase] = useState<ClassroomEntryPhase>("identity");
  const [sessionData, setSessionData] =
    useState<ClassroomSessionResponse | null>(null);
  const sessionRef = useRef<ClassroomSessionResponse | null>(null);
  const captionSyncRef = useRef(createCaptionSyncState());
  const classEnded = sessionData?.runtime.status === "ended";
  const sync = useClassroomSyncOwner(courseId || "", loadingState === "ready" && !classEnded);
  const liveRequestsRef = useRef<AbortController | null>(null);
  const captionQueueRef = useRef<ReturnType<typeof createCaptionPersistenceQueue> | null>(null);
  const [clientId, setClientId] = useState(() => crypto.randomUUID());
  const [deviceId] = useState(classroomDeviceId);
  const deviceEntryModeRef = useRef<ClassroomDeviceEntryMode | undefined>(undefined);
  const connectionReplacedRef = useRef(false);
  const [otherDevices, setOtherDevices] = useState<string[]>([]);
  const mediaBusyRef = useRef(new Set<string>());
  const mediaPendingRef = useRef(new Map<string, number>());
  const [mediaBusy, setMediaBusy] = useState<string[]>([]);
  const [mediaIntent, setMediaIntent] = useState<{ camera?: boolean; microphone?: boolean }>({});
  const mobileControls = useSyncExternalStore(subscribeToViewport, readMobileControls, () => false);
  const [dockMoreOpen, setDockMoreOpen] = useState(false);
  const [stageExpanded, setStageExpanded] = useState(false);
  const [assistantVisible, setAssistantVisible] = useState(true);
  const pendingRuntimeActionRef = useRef(false);
  const signalingReadyRef = useRef(false);
  const [signalingAttempt, setSignalingAttempt] = useState(0);
  const signalingTeardownRef = useRef<Promise<void>>(Promise.resolve());
  const handRaiseRevisionsRef = useRef(new Map<string, number>());
  const messagesFailuresRef = useRef(0);
  const stateFailuresRef = useRef(0);
  const messagesAbortRef = useRef<AbortController | null>(null);
  const messagesQueuedRef = useRef(false);
  const refreshRequestIdRef = useRef(0);
  const refreshAbortRef = useRef<AbortController | null>(null);
  const refreshCourseIdRef = useRef("");
  const refreshQueuedRef = useRef(false);
  const [media, setMedia] = useState<ClassroomMediaSnapshot>(EMPTY_MEDIA);
  const [mediaProvider, setMediaProvider] =
    useState<ClassroomMediaProvider | null>(null);
  const [presenceHealthy, setPresenceHealthy] = useState(true);
  const [presenceClockOffset, setPresenceClockOffset] = useState(0);
  const presenceClockOffsetRef = useRef(0);
  const providerRef = useRef<ClassroomMediaProvider | null>(null);
  const [roomMedia, setRoomMedia] = useState<ClassroomMediaSnapshot>(EMPTY_MEDIA);
  const [roomProvider, setRoomProvider] =
    useState<ClassroomMediaProvider | null>(null);
  const [roomScreenShareUserId, setRoomScreenShareUserId] = useState<
    string | null
  >(null);
  const roomProviderRef = useRef<ClassroomMediaProvider | null>(null);
  const roomUnsubscribeRef = useRef<(() => void) | null>(null);
  const roomTokenUnsubscribeRef = useRef<(() => void) | null>(null);
  const roomRecoveryRef = useRef<(() => Promise<void>) | null>(null);
  const roomRecoveryTaskRef = useRef<Promise<void> | null>(null);
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null);
  const [spaceBusy, setSpaceBusy] = useState(false);
  const signalingRef = useRef<ClassroomSignalingProvider | null>(null);
  const [selectedPanel, setActivePanel] = useState<DrawerPanel | null>(
    isRecorder ? "chat" : null,
  );
  const activePanel = selectedPanel === "members" && sessionData && !sessionData.capabilities.canManageMembers ? null : selectedPanel;
  const conversationOpen = activePanel === "chat" || activePanel === "captions";
  const unreadMessages = useChatUnread(sessionData?.messages, courseId, sessionData?.credential.userId || "", activePanel === "chat");
  useEffect(() => {
    if (!dockMoreOpen && !activePanel) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Element;
      if (!target.closest(".classroom-v3-dock-wrap")) setDockMoreOpen(false);
      if (activePanel !== "chat" && activePanel !== "captions" && !target.closest(".classroom-v3-drawer, .classroom-v3-side, .classroom-v3-dock-wrap") && target.closest(".classroom-v3-stage")) setActivePanel(null);
    };
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") { setDockMoreOpen(false); setActivePanel(null); } };
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss, true); document.removeEventListener("keydown", escape); };
  }, [dockMoreOpen, activePanel]);
  useEffect(() => {
    const viewport = window.visualViewport;
    const updateViewport = () => {
      if (!viewport || viewport.scale !== 1) return;
      document.querySelector<HTMLElement>("[data-responsive-workspace]")?.style.setProperty("--classroom-keyboard-inset", `${Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)}px`);
    };
    updateViewport();
    viewport?.addEventListener("resize", updateViewport);
    viewport?.addEventListener("scroll", updateViewport);
    return () => { viewport?.removeEventListener("resize", updateViewport); viewport?.removeEventListener("scroll", updateViewport); };
  }, [loadingState]);
  const [timerOverlayVisible, setTimerOverlayVisible] = useState(true);
  const [pendingMessages, setPendingMessages] = useState<
    ClassroomMessageSnapshot[]
  >([]);
  const [liveRailCollapsed, setLiveRailCollapsed] = useState(() => {
    // The standard classroom always opens with the podium visible.  A prior
    // saved compact preference should not turn the top of a fresh ClassIn
    // layout into an unexplained empty band.
    if (isRecorder || classinLayout || typeof window === "undefined") return false;
    return window.localStorage.getItem("classroom_live_rail_collapsed") === "1";
  });
  const [layoutMode, setLayoutMode] =
    useState<ClassroomLayoutMode>("focus");
  const [whiteboardController, setWhiteboardController] =
    useState<ClassroomWhiteboardController | null>(null);
  const [whiteboardApp, setWhiteboardApp] = useState<FastboardApp | null>(null);
  const [screenAnnotationController, setScreenAnnotationController] =
    useState<ClassroomWhiteboardController | null>(null);
  const [whiteboardReady, setWhiteboardReady] = useState(false);
  const [whiteboardTool, setWhiteboardTool] =
    useState<ClassroomWhiteboardTool>("selector");
  const [toolRailLevel, setToolRailLevel] =
    useState<"expanded" | "compact" | "collapsed">("expanded");
  const [toolRailActivity, setToolRailActivity] = useState(0);
  const [activityCreateRequest, setActivityCreateRequest] = useState(0);
  const [hiddenBoardItemIds, setHiddenBoardItemIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const screenShareSupported = useSyncExternalStore(
    subscribeToBrowserCapabilities,
    readScreenShareSupport,
    () => false,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [focusClassStart, setFocusClassStart] = useState(false);
  const [captionDisplayMode, setCaptionDisplayMode] = useState<CaptionDisplayMode>(
    () => {
      if (typeof window === "undefined") return "original";
      const saved = window.localStorage.getItem("classroom_caption_mode");
      return saved === "off" || saved === "translated" || saved === "bilingual"
        ? saved
        : "original";
    },
  );
  const [captionOverlayVisible, setCaptionOverlayVisible] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("classroom_caption_overlay_visible") !== "0";
  });
  const [captionBackgroundMode, setCaptionBackgroundMode] = useState<CaptionBackgroundMode>(() => {
    const saved = typeof window === "undefined" ? null : window.localStorage.getItem("classroom_caption_background_mode");
    return saved === "transparent" || saved === "solid" ? saved : "text";
  });
  const [captionBackgroundColor, setCaptionBackgroundColor] = useState(() => {
    const saved = typeof window === "undefined" ? null : window.localStorage.getItem("classroom_caption_background_color");
    return saved && /^#[0-9a-fA-F]{6}$/.test(saved) ? saved : "#202124";
  });
  const stageElementRef = useRef<HTMLElement | null>(null);
  const automaticRecordingRequestedRef = useRef("");
  const [teacherPiPHidden, setTeacherPiPHidden] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(TEACHER_PIP_HIDDEN_STORAGE_KEY) === "1";
  });
  const [captionLanguage, setCaptionLanguage] = useState(() => {
    return initialCaptionLanguage(
      typeof window === "undefined"
        ? null
        : window.localStorage.getItem(CAPTION_LANGUAGE_STORAGE_KEY),
      locale,
    );
  });
  const captionDefaultsSession = useRef("");
  useEffect(() => {
    const id = sessionData?.course.sessionId, preferences = sessionData?.runtime.captionStartPreferences;
    if (!id || !preferences) return;
    const key = `${id}:${sessionData.credential.userId}:${sessionData.runtime.status}:${JSON.stringify(preferences)}`;
    if (captionDefaultsSession.current === key) return;
    captionDefaultsSession.current = key;
    let personal: unknown = null;
    try { personal = JSON.parse(localStorage.getItem(`classroom_caption_choice:${sessionData.credential.userId}:${id}`) || "null"); } catch { /* Use course defaults when storage is unavailable. */ }
    const view = initialCaptionStartView(preferences, personal);
    setCaptionDisplayMode(view.displayMode);
    setCaptionOverlayVisible(view.overlayVisible);
    setCaptionLanguage(view.preferredLanguage);
  }, [sessionData?.course.sessionId, sessionData?.runtime.captionStartPreferences, sessionData?.runtime.status, sessionData?.credential.userId]);
  const [recordingStatus, setRecordingStatus] = useState<string | null>(null);
  const [recordingFallback, setRecordingFallback] = useState<string | null>(null);
  const [recordingStopConfirming, setRecordingStopConfirming] = useState(false);
  const [endClassConfirming, setEndClassConfirming] = useState(false);
  const [overtimeLeaveConfirming, setOvertimeLeaveConfirming] = useState(false);
  const overtimeLeaveBusyRef = useRef(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const publishEnabledRef = useRef(false);
  const teacherCameraAutostartedRef = useRef(false);
  const credentialRenewalRef = useRef<Promise<void> | null>(null);
  const credentialRecoveryFailureRef = useRef<unknown>(null);
  const recorderReadyNotifiedRef = useRef(false);
  const recorderReleasedRef = useRef(false);
  const endingClassRef = useRef(false);
  const compositionPreviewAtRef = useRef(0);
  const endClassDialogRef = useRef<HTMLElement>(null);
  const recordingStopCancelRef = useRef<HTMLButtonElement>(null);
  const [studentPublishReady, setStudentPublishReady] = useState(false);
  const [publishingPreparing, setPublishingPreparing] = useState(false);
  const [publishingError, setPublishingError] = useState<{key:string;message:string}|null>(null);
  const publishingTaskRef = useRef(false);
  const publishingAbortRef = useRef<AbortController|null>(null);
  const now = useNow();
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (!isRecorder) return;
    document.documentElement.dataset.classroomRecorder = "true";
    const removeInjectedToolbar = () => {
      document.querySelectorAll(
        "vercel-live-feedback, vercel-toolbar, iframe[src^='https://vercel.live/']",
      ).forEach((element) => element.remove());
    };
    const observer = new MutationObserver(removeInjectedToolbar);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    removeInjectedToolbar();
    return () => {
      observer.disconnect();
      delete document.documentElement.dataset.classroomRecorder;
    };
  }, [isRecorder]);

  useEffect(() => {
    if (!endClassConfirming && !overtimeLeaveConfirming) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = endClassDialogRef.current;
    dialog?.querySelector<HTMLButtonElement>("button")?.focus();
    const trap = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Tab" || !dialog) return;
      const buttons = Array.from(dialog.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
      if (!buttons.length) { event.preventDefault(); return; }
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    dialog?.addEventListener("keydown", trap);
    return () => { dialog?.removeEventListener("keydown", trap); previous?.focus(); };
  }, [endClassConfirming, overtimeLeaveConfirming]);

  useEffect(() => {
    if (!recordingStopConfirming) return;
    const frame = window.requestAnimationFrame(() => {
      recordingStopCancelRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [recordingStopConfirming]);

  const recorderCanRelease = Boolean(isRecorder && !classEnded && sessionData && shouldNotifyRecorderReady({
    pageReady: loadingState === "ready",
    mediaConnected: media.connectionState === "connected",
    whiteboardEnabled: sessionData.whiteboard.enabled,
    whiteboardReady,
    whiteboardRequired:
      ((classinLayout && sessionData.mode !== "publicLive") || sessionData.runtime.stageMode === "whiteboard") &&
      !media.participants.some((participant) => participant.kind === "screen" && participant.hasVideo),
  }));
  useEffect(() => {
    if (!recorderCanRelease || recorderReleasedRef.current || !recordingId || !recorderToken) return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const notify = async () => {
      if (cancelled) return;
      const surface = stageElementRef.current?.closest<HTMLElement>(".classroom-v3-shell");
      if (!surface || !recorderVideosHaveFrames(surface)) {
        retryTimer = setTimeout(() => void notify(), 500);
        return;
      }
      const recorderNavigator = window.navigator as Navigator & {
        notifyReady?: () => void;
      };
      if (!recorderReadyNotifiedRef.current) {
        recorderReadyNotifiedRef.current = true;
        recorderNavigator.notifyReady?.();
      }
      try {
        const response = await fetch("/api/classroom/recorder/ready", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: courseId, recordingId, recorderToken }),
        });
        if (cancelled) return;
        const acknowledgment = response.ok ? await response.json() as { state?: unknown } : null;
        if (cancelled) return;
        if (isRecorderReadyAcknowledged(response.status, acknowledgment?.state)) {
          recorderReleasedRef.current = true;
          return;
        }
        if (response.status === 401 || response.status === 409) return;
      } catch (error) {
        console.warn("[classroom:recorder] ready notification failed", error);
      }
      if (!cancelled) retryTimer = setTimeout(() => void notify(), 1_500);
    };
    // Let remote subscriptions mount and decode before releasing on-hold capture.
    retryTimer = setTimeout(() => void notify(), 1_000);
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [
    courseId,
    recorderCanRelease,
    recordingId,
    recorderToken,
  ]);

  const handleWhiteboardControllerChange = useCallback(
    (controller: ClassroomWhiteboardController | null) => {
      setWhiteboardController(controller);
    },
    [],
  );
  const handleWhiteboardReadyChange = useCallback((ready: boolean) => {
    setWhiteboardReady(ready);
  }, []);

  const wakeToolRail = useCallback(() => {
    setToolRailLevel("expanded");
    setToolRailActivity((value) => value + 1);
  }, []);

  useEffect(() => {
    // A tool may be chosen while the whiteboard is completing its initial
    // render. Apply the current choice once its controller becomes available
    // so the toolbar state and the actual drawing appliance never diverge.
    whiteboardController?.setTool(whiteboardTool);
    screenAnnotationController?.setTool(whiteboardTool);
  }, [whiteboardController, screenAnnotationController, whiteboardTool]);

  useEffect(() => {
    // In the standard classroom the toolbar is a persistent teaching control
    // on the board, not an auto-hiding navigation rail.  Other layouts retain
    // the progressive compact mode.
    if (isRecorder || classinLayout) return;
    const compactTimer = window.setTimeout(
      () => setToolRailLevel("compact"),
      60_000,
    );
    const collapseTimer = window.setTimeout(
      () => setToolRailLevel("collapsed"),
      120_000,
    );
    return () => {
      window.clearTimeout(compactTimer);
      window.clearTimeout(collapseTimer);
    };
  }, [classinLayout, isRecorder, toolRailActivity]);

  useEffect(() => {
    sessionRef.current = sessionData;
  }, [sessionData]);

  useEffect(() => {
    window.localStorage.setItem("classroom_caption_mode", captionDisplayMode);
  }, [captionDisplayMode]);

  useEffect(() => {
    window.localStorage.setItem(
      "classroom_caption_overlay_visible",
      captionOverlayVisible ? "1" : "0",
    );
  }, [captionOverlayVisible]);

  useEffect(() => {
    window.localStorage.setItem("classroom_caption_background_mode", captionBackgroundMode);
    window.localStorage.setItem("classroom_caption_background_color", captionBackgroundColor);
  }, [captionBackgroundMode, captionBackgroundColor]);

  useEffect(() => {
    if (!sessionData || !sessionData.recording.enabled || !shouldAutoStartRecordingAfterWhiteboard({
      isRecorder,
      pageReady: loadingState === "ready",
      mediaConnected: media.connectionState === "connected",
      whiteboardEnabled: sessionData.whiteboard.enabled,
      whiteboardReady,
      isTeacher: isClassroomTeachingRole(sessionData.credential.role),
      mode: sessionData.runtime.recordingStartMode,
      status: sessionData.runtime.status,
    })) return;
    const requestKey = `${courseId}:${sessionData.runtime.recordingStartMode}`;
    if (automaticRecordingRequestedRef.current === requestKey) return;
    automaticRecordingRequestedRef.current = requestKey;
    void fetch(`/api/courses/${encodeURIComponent(courseId)}/recording`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "auto-start-whiteboard-ready" }),
    }).then(async (response) => {
      if (!response.ok) throw new Error("Automatic recording failed");
      const result = await response.json() as { recording?: { status?: string } | null };
      if (result.recording?.status) setRecordingStatus(result.recording.status);
    }).catch((error) => {
      console.warn("[classroom:v3] whiteboard-ready recording failed", error);
      automaticRecordingRequestedRef.current = "";
    });
  }, [courseId, isRecorder, loadingState, media.connectionState, sessionData, whiteboardReady]);

  useEffect(() => {
    window.localStorage.setItem(
      TEACHER_PIP_HIDDEN_STORAGE_KEY,
      teacherPiPHidden ? "1" : "0",
    );
  }, [teacherPiPHidden]);

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
    (update: Partial<ClassroomSessionResponse>, confirmed = true) => {
      const current = sessionRef.current;
      if (!current || (current.runtime.status === "ended" && update.runtime && update.runtime.status !== "ended") || !shouldApplyClassroomRevision(current.runtime.revision, update.runtime?.revision)) return;
      if (update.runtime?.presenceUncertain && update.runtime.status !== "ended" && current.runtime) {
        const priorMembers = new Map(current.runtime.members.map(member => [member.userId, member]));
        update = { ...update, runtime: { ...update.runtime, members: update.runtime.members.map(member => {
          const prior = priorMembers.get(member.userId);
          return prior ? { ...member, online: prior.online, connectionStatus: prior.connectionStatus, lastSeenAt: prior.lastSeenAt, reconnectUntil: prior.reconnectUntil } : member;
        }) } };
      }
      if (update.runtime?.presenceObservedAt && update.runtime.presenceObservedAt !== current.runtime.presenceObservedAt) {
        presenceClockOffsetRef.current = classroomPresenceClockOffset(update.runtime.presenceObservedAt);
        setPresenceClockOffset(presenceClockOffsetRef.current);
      }
      const next = { ...current, ...update,
        ...(update.runtime?.scheduledEndAt && { course: { ...current.course, ...update.course, endTime: update.runtime.scheduledEndAt, startTime: update.runtime.scheduledStartAt || current.course.startTime } }),
        ...(update.captions && { captions: mergeCaptionSnapshots(current.captions, update.captions) }),
        ...(update.courseware && { courseware: update.courseware.map(item => {
          const previous = current.courseware.find(candidate => candidate.id === item.id);
          return previous?.updatedAt && item.updatedAt && previous.updatedAt > item.updatedAt ? previous : item;
        }) }),
      };
      if (next.credential.role === "assistant") {
        next.capabilities = classroomCapabilities("assistant", next.modePolicy, next.runtime.assistantPermissions?.[next.credential.userId] !== false);
      }
      sessionRef.current = next;
      if (next.runtime.status === "ended") liveRequestsRef.current?.abort();
      setSessionData(next);
      if (confirmed) emitHostEvent(next, "state_sync");
    },
    [emitHostEvent],
  );

  // The initial server snapshot may already be live or ended. Optimistic
  // start actions must wait for the successful server response below.
  useEffect(() => {
    if (loadingState === "ready" && !pendingRuntimeActionRef.current) emitHostEvent(sessionData, "state_sync");
  }, [emitHostEvent, loadingState, sessionData]);

  const stopEndedSession = useCallback((status: number, body: unknown) => {
    if (status === 409 && body && typeof body === "object" && "code" in body && body.code === "classroom_connection_replaced") {
      if (connectionReplacedRef.current) return true;
      connectionReplacedRef.current = true;
      liveRequestsRef.current?.abort();
      messagesAbortRef.current?.abort();
      refreshAbortRef.current?.abort();
      void providerRef.current?.disconnect().catch(() => undefined);
      void roomProviderRef.current?.disconnect().catch(() => undefined);
      void signalingRef.current?.disconnect().catch(() => undefined);
      setLoadingState("device-replaced");
      return true;
    }
    const current = sessionRef.current;
    if (!current || !isEndedClassroomResponse(status, body)) return false;
    updateSession({ runtime: { ...current.runtime, status: "ended" } });
    liveRequestsRef.current?.abort();
    return true;
  }, [updateSession]);

  useEffect(() => {
    if (isRecorder || !sessionData || loadingState !== "ready") return;
    const own = sessionData.runtime.members.find(member => member.userId === sessionData.credential.userId);
    if (own?.replacedRtcUids?.includes(sessionData.credential.rtcUid)) {
      stopEndedSession(409, { code: "classroom_connection_replaced" });
    }
  }, [isRecorder, loadingState, sessionData, stopEndedSession]);

  const disconnectRoom = useCallback(async () => {
    roomRecoveryTaskRef.current = null;
    roomTokenUnsubscribeRef.current?.();
    roomTokenUnsubscribeRef.current = null;
    roomUnsubscribeRef.current?.();
    roomUnsubscribeRef.current = null;
    const current = roomProviderRef.current;
    roomProviderRef.current = null;
    setRoomProvider(null);
    setRoomScreenShareUserId(null);
    setRoomMedia(EMPTY_MEDIA);
    setActiveSpaceId(null);
    await current?.disconnect().catch(() => undefined);
  }, []);

  const renewRoomCredentials = useCallback(async () => {
    const provider = roomProviderRef.current;
    const controller = liveRequestsRef.current;
    if (!activeSpaceId || !provider || !controller || controller.signal.aborted) return;
    if (roomRecoveryTaskRef.current) return roomRecoveryTaskRef.current;
    const task = retryClassroomRecovery(async () => {
      if (roomProviderRef.current !== provider) throw new DOMException("Room replaced", "AbortError");
      const payload = await withClassroomRequestSignal(10_000, controller.signal, async signal => {
        const response = await fetch(`/api/sessions/${encodeURIComponent(courseId)}/classroom/spaces/credential`, {
          method: "POST", signal, headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ spaceId: activeSpaceId, clientId, ...(shareAccess && { shareAccess }) }),
        });
        const value = await response.json();
        if (stopEndedSession(response.status, value)) throw new DOMException("Classroom ended", "AbortError");
        if (!response.ok || !value.credential) throw new ClassroomRecoveryError(response.status || 502);
        return value;
      });
      controller.signal.throwIfAborted();
      if (roomProviderRef.current !== provider) throw new DOMException("Room replaced", "AbortError");
      await provider.renewCredential(payload.credential);
      await provider.recoverMedia();
      if (roomProviderRef.current === provider && !controller.signal.aborted) setRoomScreenShareUserId(payload.credential.screenShare?.rtcUid.toString() || null);
    }, { signal: controller.signal, maxAttempts: 4 });
    roomRecoveryTaskRef.current = task;
    try { await task; }
    finally { if (roomRecoveryTaskRef.current === task) roomRecoveryTaskRef.current = null; }
  }, [activeSpaceId, clientId, courseId, shareAccess, stopEndedSession]);
  useEffect(() => { roomRecoveryRef.current = renewRoomCredentials; return () => { roomRecoveryRef.current = null; }; }, [renewRoomCredentials]);

  const connectRoom = useCallback(
    async (spaceId: string) => {
      if (!courseId || !user || spaceBusy || isRecorder || sessionRef.current?.runtime.status === "ended") return;
      setSpaceBusy(true);
      setActionError("");
      try {
        await disconnectRoom();
        const response = await fetch(
          `/api/sessions/${encodeURIComponent(courseId)}/classroom/spaces/credential`,
          {
            method: "POST",
            signal: liveRequestsRef.current?.signal,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              spaceId,
              clientId,
              ...(shareAccess && { shareAccess }),
            }),
          },
        );
        const payload = (await response.json()) as {
          credential?: ClassroomJoinCredential;
          error?: string;
        };
        if (!response.ok || !payload.credential) {
          if (stopEndedSession(response.status, payload)) return;
          throw new Error(payload.error || t("classroom.v3.roomConnectFailed"));
        }
        if (liveRequestsRef.current?.signal.aborted) return;
        setRoomScreenShareUserId(
          payload.credential.screenShare
            ? String(payload.credential.screenShare.rtcUid)
            : null,
        );
        const provider = await createClassroomMediaProvider(
          payload.credential.provider,
        );
        if (liveRequestsRef.current?.signal.aborted) return;
        roomProviderRef.current = provider;
        roomUnsubscribeRef.current = provider.subscribe(setRoomMedia);
        roomTokenUnsubscribeRef.current = provider.subscribeTokenExpiry(() => { void roomRecoveryRef.current?.().catch(() => undefined); });
        await provider.connect(
          payload.credential,
          user.displayName || user.name || user.userId,
        );
        if (liveRequestsRef.current?.signal.aborted) { await disconnectRoom(); return; }
        setRoomProvider(provider);
        setActiveSpaceId(spaceId);
      } catch (error) {
        await disconnectRoom();
        if (liveRequestsRef.current?.signal.aborted) return;
        setActionError(
          error instanceof Error
            ? error.message
            : t("classroom.v3.roomConnectFailed"),
        );
      } finally {
        setSpaceBusy(false);
      }
    },
    [clientId, courseId, disconnectRoom, isRecorder, shareAccess, spaceBusy, stopEndedSession, t, user],
  );

  const reportConnectionDiagnostic = useCallback((event: ClassroomConnectionDiagnostic) => {
    reportClassroomDiagnostic({ ...event, sessionId: sessionRef.current?.course.sessionId || courseId, clientId,
      ...(isRecorder ? { recorderToken } : {}),
    });
  }, [clientId, courseId, isRecorder, recorderToken]);

  const fetchInitialSession = useCallback(async () => {
    if (isRecorder && !recorderToken) throw new Error(translateSession("classroom.v3.missingRecorderCredential"));
    const controller = liveRequestsRef.current;
    if (!controller) throw new DOMException("Launch cancelled", "AbortError");
    const startedAt = performance.now();
    let attempts = 0;
    try {
      const payload = await requestClassroomSession<ClassroomSessionResponse>({
        signal: controller.signal,
        request: (signal) => fetch("/api/classroom/session", {
          signal, method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId,
            deviceId, deviceLabel: classroomDeviceLabel(navigator.userAgent),
            ...(deviceEntryModeRef.current && { deviceEntryMode: deviceEntryModeRef.current }),
            ...(requestedSessionId ? { sessionId: requestedSessionId } : { courseId: legacyCourseId }),
            ...(shareAccess && { shareAccess }), ...(isRecorder && { recorderToken }),
          }),
        }),
        refreshAuth: isRecorder ? undefined : tryOAuthRefresh,
        onResponse: (status, value) => {
          const response = value as { error?: string; code?: string; courseId?: string; sessionId?: string };
          if (stopEndedSession(status, response)) throw new DOMException("Classroom ended", "AbortError");
          if (!isRecorder && status === 403 && response.code) router.replace(buildAccessDeniedUrl({
            code: response.code as CourseAccessDeniedCode, reason: response.error || translateSession("classroom.v3.accessDenied"),
            courseId: response.courseId || courseId,
          }));
        },
        onRetry: (error, attempt, delayMs) => {
          attempts = attempt;
          setLaunchRetry(attempt);
          reportConnectionDiagnostic({ event: "session-retry", occurredAt: new Date().toISOString(), attempt, delayMs,
            ...(error instanceof ClassroomRecoveryError ? { status: error.status } : {}),
          });
        },
      });
      if (attempts) reportConnectionDiagnostic({ event: "session-recovered", occurredAt: new Date().toISOString(), attempt: attempts + 1, durationMs: performance.now() - startedAt });
      return payload;
    } catch (error) {
      if (controller.signal.aborted || error instanceof DOMException && error.name === "AbortError") throw error;
      if (error instanceof ClassroomSessionRequestError && error.payload.code === "classroom_device_conflict") throw error;
      reportConnectionDiagnostic({ event: "session-failed", occurredAt: new Date().toISOString(), attempt: attempts + 1,
        durationMs: performance.now() - startedAt, ...(error instanceof ClassroomRecoveryError ? { status: error.status } : {}),
      });
      throw new Error(error instanceof ClassroomSessionRequestError && error.payload.code !== "database_unavailable"
        ? error.payload.error || translateSession("classroom.v3.sessionCreateFailed")
        : translateSession("classroom.v3.databaseUnavailable"));
    }
  }, [clientId, deviceId, courseId, isRecorder, legacyCourseId, recorderToken, requestedSessionId, router, shareAccess, stopEndedSession, translateSession, reportConnectionDiagnostic]);

  const renewClassroomCredentials = useCallback(async () => {
    if (sessionRef.current?.runtime.status === "ended") return;
    if (credentialRenewalRef.current) return credentialRenewalRef.current;
    if (credentialRecoveryFailureRef.current) throw credentialRecoveryFailureRef.current;
    const controller = liveRequestsRef.current;
    const provider = providerRef.current;
    if (!controller || controller.signal.aborted || !provider) return;
    const renewal = (async () => {
      let hadFailure = false;
      await retryClassroomRecovery(() => withClassroomRequestSignal(10_000, controller.signal, async (signal) => {
        const request = () => fetch("/api/classroom/session/renew-credential", {
          signal, method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: sessionRef.current?.course.sessionId || courseId, clientId,
            ...(shareAccess ? { shareAccess } : {}), ...(isRecorder ? { recorderToken } : {}),
          }),
        });
        let response = await request();
        if (!isRecorder && response.status === 401 && await tryOAuthRefresh()) response = await request();
        const payload = await response.json();
        if (stopEndedSession(response.status, payload)) throw new DOMException("Classroom ended", "AbortError");
        if (!response.ok || !payload.credential) {
          throw new ClassroomRecoveryError(response.ok ? 502 : response.status, Number(response.headers.get("Retry-After") || 0) * 1_000);
        }
        controller.signal.throwIfAborted();
        if (providerRef.current !== provider) throw new DOMException("Classroom replaced", "AbortError");
        await provider.renewCredential(payload.credential);
        await provider.recoverMedia();
        controller.signal.throwIfAborted();
        if (providerRef.current !== provider) throw new DOMException("Classroom replaced", "AbortError");
        updateSession({ credential: payload.credential, signaling: payload.signaling });
      }), {
        signal: controller.signal,
        onFailure: (error, attempt, delayMs) => {
          hadFailure = true;
          reportConnectionDiagnostic({ event: "credential-retry", occurredAt: new Date().toISOString(), attempt, delayMs,
            ...(error instanceof ClassroomRecoveryError ? { status: error.status } : {}),
          });
        },
      });
      if (hadFailure) reportConnectionDiagnostic({ event: "credential-recovered", occurredAt: new Date().toISOString() });
    })();
    credentialRenewalRef.current = renewal;
    try {
      await renewal;
    } catch (error) {
      if (!controller.signal.aborted && !(error instanceof DOMException && error.name === "AbortError")) {
        if (!canRetryClassroomRecovery(error)) credentialRecoveryFailureRef.current = error;
        reportConnectionDiagnostic({ event: "credential-failed", occurredAt: new Date().toISOString(),
          ...(error instanceof ClassroomRecoveryError ? { status: error.status } : {}),
        });
      }
      throw error;
    } finally {
      if (credentialRenewalRef.current === renewal) {
        credentialRenewalRef.current = null;
      }
    }
  }, [clientId, courseId, isRecorder, recorderToken, reportConnectionDiagnostic, shareAccess, stopEndedSession, updateSession]);

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
    let unsubscribeTokenExpiry: (() => void) | null = null;
    let captionQueue: ReturnType<typeof createCaptionPersistenceQueue> | undefined;
    let lastConnectionSequence = 0;

    async function launch() {
      try {
        liveRequestsRef.current?.abort();
        liveRequestsRef.current = new AbortController();
        credentialRecoveryFailureRef.current = null;
        setLoadingState("loading");
        setEntryPhase("session");
        setLaunchRetry(0);
        setErrorMessage("");
        const payload = await fetchInitialSession();
        if (cancelled) return;
        teacherCameraAutostartedRef.current = payload.connection?.entryMode === "together";
        const canonicalPath = canonicalClassroomEntryPath(legacyEntrySearch, payload.course.sessionId);
        if (canonicalPath) {
          router.replace(canonicalPath);
          return;
        }
        setEntryPhase("media");
        setLayoutMode(payload.mode === "oneToOne" ? "split" : "focus");
        captionSyncRef.current.reset();
        sessionRef.current = payload;
        presenceClockOffsetRef.current = classroomPresenceClockOffset(payload.runtime.presenceObservedAt);
        setPresenceClockOffset(presenceClockOffsetRef.current);
        setSessionData(payload);
        const startsWithPublishingPermission =
          payload.credential.role === "student" &&
          payload.credential.publishAllowed === true;
        publishEnabledRef.current = startsWithPublishingPermission;
        setStudentPublishReady(startsWithPublishingPermission);
        setRecordingStatus(payload.recording.status);
        setRecordingFallback(payload.recording.fallbackFrom);
        // The initial classroom response intentionally defers the whiteboard
        // credential so Netless room/token latency never blocks the shell.
        // Download the SDK in parallel with media setup; by the time the
        // credential arrives, the heaviest client asset is already cached.
        void preloadFastboard();
        provider = await createClassroomMediaProvider(
          payload.credential.provider,
        );
        if (cancelled) {
          void provider.disconnect();
          return;
        }
        providerRef.current = provider;
        setMediaProvider(provider);
        unsubscribeTokenExpiry = provider.subscribeTokenExpiry(() => {
          void renewClassroomCredentials().catch((error) => {
            console.warn("[classroom:v3] media credential renewal failed", error);
          });
        });
        unsubscribe = provider.subscribe((snapshot) => {
          if (cancelled) return;
          setMedia(snapshot);
          const event = snapshot.connectionEvent;
          if (event && event.sequence !== lastConnectionSequence) {
            lastConnectionSequence = event.sequence;
            reportConnectionDiagnostic({ event: "connection-state", ...event });
          }
        });
        let captionStore;
        try {
          captionStore = createCaptionOutbox(window.localStorage,
            isRecorder ? `recorder:${payload.course.sessionId}` : user!.userId, courseId, clientId);
        } catch (error) {
          console.warn("[classroom:v3] caption local storage unavailable", error);
          if (!isRecorder) setActionError(translateSession("classroom.v3.captionStorageUnavailable"));
        }
        captionQueue = createCaptionPersistenceQueue(async (caption) => {
          // Caption delivery has its own timeout. Ending class aborts live
          // polling/media requests, but must never cancel an archive write.
          const result = await deliverClassroomCaption(courseId, caption, {
            shareAccess, ...(isRecorder && recorderToken ? { recorderToken } : {}),
          });
          if (cancelled) return;
          if (!isRecorder) {
            const current = sessionRef.current;
            if (current) updateSession({ captions: mergeCaptions(current.captions, result.caption) });
          }
          if (typeof result.revision === "number") {
            void signalingRef.current?.publish({ courseId, revision: result.revision, topic: "captions" }).catch(() => undefined);
          }
        }, (error) => {
          console.warn("[classroom:v3] caption delivery retained for retry", error);
          if (!cancelled && !isRecorder && error instanceof DOMException &&
              ["QuotaExceededError", "SecurityError"].includes(error.name)) {
            setActionError(translateSession("classroom.v3.captionStorageUnavailable"));
          }
        }, 300, { store: captionStore });
        captionQueueRef.current = captionQueue;
        unsubscribeCaptions = provider.subscribeCaptions((caption) => {
          if (cancelled) return;
          const runtime = sessionRef.current?.runtime ?? payload.runtime;
          // Provider finals/translations can arrive while endClass is in flight.
          const speakerId = participantOwnerId(caption.speakerId, runtime.members);
          const localCaption: ClassroomCaptionSnapshot = {
            ...caption,
            speakerId,
            provider: runtime.interpretation.provider,
            speakerName:
              runtime.members.find((member) => member.userId === speakerId)
                ?.displayName ||
              caption.speakerName ||
              translateSession("classroom.v3.speaker"),
            createdAt: new Date().toISOString(),
          };
          if (!isRecorder) {
            const current = sessionRef.current;
            if (current) updateSession({ captions: mergeCaptions(current.captions, localCaption) }, false);
          }
          if (!isRecorder && payload.credential.role === "student") return;
          captionQueue?.enqueue(localCaption);
        });
        const displayName = isRecorder
          ? translateSession("classroom.v3.recordingClassroom")
          : user!.displayName || user!.name || user!.userId;
        if (!cancelled) setLoadingState("ready");
        try {
          await provider.connect(payload.credential, displayName);
        } catch (mediaError) {
          if (!cancelled) {
            console.warn("[classroom:v3] media connection failed", mediaError);
            setActionError(
              mediaError instanceof Error
                ? mediaError.message
                : translateSession("classroom.v3.mediaActionFailed"),
            );
          }
        }
      } catch (error) {
        if (cancelled || connectionReplacedRef.current) return;
        if (error instanceof ClassroomSessionRequestError && error.payload.code === "classroom_device_conflict") {
          setOtherDevices(error.payload.devices || []);
          setLoadingState("device-choice");
          return;
        }
        console.error("[classroom:v3] launch failed", error);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : translateSession("classroom.v3.classroomLaunchFailed"),
        );
        setLoadingState("error");
      }
    }
    void launch();
    const flushCaptions = () => { void captionQueue?.flush(); };
    window.addEventListener("online", flushCaptions);
    window.addEventListener("pagehide", flushCaptions);
    document.addEventListener("visibilitychange", flushCaptions);
    return () => {
      window.removeEventListener("online", flushCaptions);
      window.removeEventListener("pagehide", flushCaptions);
      document.removeEventListener("visibilitychange", flushCaptions);
      // Start best-effort delivery; the durable outbox remains until acked and
      // AuthProvider continues recovery after navigation or the next login.
      flushCaptions();
      cancelled = true;
      unsubscribe?.();
      liveRequestsRef.current?.abort();
      credentialRenewalRef.current = null;
      credentialRecoveryFailureRef.current = null;
      unsubscribeCaptions?.();
      captionQueue?.dispose();
      if (captionQueueRef.current === captionQueue) captionQueueRef.current = null;
      unsubscribeTokenExpiry?.();
      signalingRef.current?.disconnect().catch(() => undefined);
      signalingRef.current = null;
      if (providerRef.current === provider) providerRef.current = null;
      void provider?.disconnect();
    };
  }, [
    authLoading,
    clientId,
    courseId,
    fetchInitialSession,
    isRecorder,
    launchAttempt,
    legacyEntrySearch,
    recorderToken,
    renewClassroomCredentials,
    reportConnectionDiagnostic,
    router,
    shareAccess,
    stopEndedSession,
    translateSession,
    updateSession,
    user,
  ]);

  useEffect(() => {
    if (classEnded || loadingState !== "ready" || !sessionData?.credential.expiresInSeconds) {
      return;
    }
    const renewBeforeSeconds = 5 * 60;
    const delay = Math.max(
      30_000,
      (sessionData.credential.expiresInSeconds - renewBeforeSeconds) * 1_000,
    );
    const timer = window.setTimeout(() => {
      void renewClassroomCredentials().catch((error) => {
        console.warn("[classroom:v3] scheduled credential renewal failed", error);
      });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [
    classEnded,
    loadingState,
    renewClassroomCredentials,
    sessionData?.credential.expiresInSeconds,
    sessionData?.credential.token,
  ]);

  useEffect(() => {
    return () => {
      roomTokenUnsubscribeRef.current?.();
      roomUnsubscribeRef.current?.();
      void roomProviderRef.current?.disconnect();
      roomProviderRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!stageExpanded) return;
    const onEscape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") setStageExpanded(false); };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [stageExpanded]);

  const refreshMessages = useCallback(async function refreshMessageSnapshot(): Promise<void> {
    if (!courseId || isRecorder || sessionRef.current?.runtime.status === "ended") return;
    if (messagesAbortRef.current) { messagesQueuedRef.current = true; return; }
    messagesQueuedRef.current = false;
    const controller = new AbortController();
    messagesAbortRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 4_000);
    try {
      const query = shareAccess ? `?shareAccess=${encodeURIComponent(shareAccess)}` : "";
      const response = await fetch(`/api/sessions/${encodeURIComponent(courseId)}/classroom/messages${query}`, { cache: "no-store", signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!response.ok) { messagesFailuresRef.current += 1; stopEndedSession(response.status, await response.json()); return; }
      if (response.ok && !controller.signal.aborted) {
        const payload = await response.json();
        if (!controller.signal.aborted) { messagesFailuresRef.current = 0; updateSession({ messages: payload.messages }); }
      }
    } catch { messagesFailuresRef.current += 1; }
    finally {
      window.clearTimeout(timeout);
      if (messagesAbortRef.current === controller) {
        messagesAbortRef.current = null;
        if (messagesQueuedRef.current) {
          messagesQueuedRef.current = false;
          queueMicrotask(() => { if (liveRequestsRef.current && !liveRequestsRef.current.signal.aborted) void refreshMessageSnapshot(); });
        }
      }
    }
  }, [courseId, isRecorder, shareAccess, stopEndedSession, updateSession]);
  useEffect(() => {
    if (classEnded || loadingState !== "ready" || isRecorder) return;
    const remove=sync.scheduler.register({topics:["messages","transport"],run:()=>refreshMessages(),interval:ready=>messagesFailuresRef.current?Math.min(60_000,5_000*2**Math.min(messagesFailuresRef.current,4)):ready?60_000:5_000});
    return()=>{remove();messagesAbortRef.current?.abort();messagesAbortRef.current=null;};
  }, [classEnded,loadingState,isRecorder,refreshMessages,sync]);

  const refreshState = useCallback(async function refreshSnapshot(): Promise<void> {
    if (!courseId || !sessionRef.current || sessionRef.current.runtime.status === "ended") return;
    if (refreshAbortRef.current) {
      if (refreshCourseIdRef.current === courseId) {
        refreshQueuedRef.current = true;
        return;
      }
      // A different lesson replaced the current one; its snapshot is stale.
      refreshAbortRef.current.abort();
    }
    const requestId = refreshRequestIdRef.current + 1;
    refreshRequestIdRef.current = requestId;
    const controller = new AbortController();
    refreshAbortRef.current = controller;
    refreshCourseIdRef.current = courseId;
    refreshQueuedRef.current = false;
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 30_000);
    try {
      if (isRecorder) {
        const response = await fetch("/api/classroom/recorder/state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: courseId, recordingId, recorderToken }),
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Recorder state refresh failed (${response.status})`);
        const payload = await response.json() as Pick<ClassroomSessionResponse, "runtime" | "engagement" | "courseware" | "recording">;
        if (controller.signal.aborted || requestId !== refreshRequestIdRef.current) return;
        // Content changes must not replace RTC or whiteboard join credentials.
        stateFailuresRef.current = 0;
        updateSession(payload);
        setRecordingStatus(payload.recording.status);
        setRecordingFallback(payload.recording.fallbackFrom);
        return;
      }
      const query = new URLSearchParams();
      if (shareAccess) query.set("shareAccess", shareAccess);
      const captionContext = `${courseId}:${shareAccess || ""}`;
      captionSyncRef.current.query(captionContext, query);
      const stateResponse = await fetch(`/api/sessions/${encodeURIComponent(courseId)}/classroom/state?${query}`, {
        cache: "no-store", signal: controller.signal,
      });
      if (controller.signal.aborted || requestId !== refreshRequestIdRef.current) return;
      if (!stateResponse.ok) { stateFailuresRef.current += 1; stopEndedSession(stateResponse.status, await stateResponse.json()); return; }
      if (stateResponse.ok) {
        const payload = (await stateResponse.json()) as {
          runtime: ClassroomRuntimeSnapshot;
          engagement: ClassroomSessionResponse["engagement"];
          courseware: ClassroomCoursewareSnapshot[];
          captions: ClassroomCaptionSnapshot[];
          captionSync?: CaptionSyncResponse["captionSync"];
          spaces: ClassroomSpaceSnapshot[];
          questions: ClassroomQuestionSnapshot[];
          recording: ClassroomSessionResponse["recording"];
        };
        if (controller.signal.aborted || requestId !== refreshRequestIdRef.current) return;
        captionSyncRef.current.accept(captionContext, payload, captions => updateSession({ captions }));
        const refreshedRuntime = payload.runtime;
        const refreshedDetails = { engagement: payload.engagement, courseware: payload.courseware,
          spaces: payload.spaces, questions: payload.questions, recording: payload.recording };
        updateSession(pendingRuntimeActionRef.current && refreshedRuntime.status !== "ended" ? refreshedDetails : { ...refreshedDetails, runtime: refreshedRuntime });
        setRecordingStatus(payload.recording.status);
        setRecordingFallback(payload.recording.fallbackFrom);
      }
      stateFailuresRef.current = 0;

    } catch (error) {
      if (timedOut || !controller.signal.aborted) stateFailuresRef.current += 1;
      if (controller.signal.aborted) {
        if (timedOut) console.warn("[classroom:v3] state refresh timed out");
        return;
      }
      console.warn("[classroom:v3] state refresh failed", error);
    } finally {
      window.clearTimeout(timeoutId);
      if (refreshAbortRef.current === controller) {
        refreshAbortRef.current = null;
        refreshCourseIdRef.current = "";
        if (refreshQueuedRef.current) {
          refreshQueuedRef.current = false;
          // An invalidation received during this read must fetch the next snapshot.
          queueMicrotask(() => {
            if (requestId === refreshRequestIdRef.current) void refreshSnapshot();
          });
        }
      }
    }
  }, [
    courseId,
    isRecorder,
    recordingId,
    recorderToken,
    shareAccess,
    stopEndedSession,
    updateSession,
  ]);

  useEffect(() => {
    return () => {
      refreshRequestIdRef.current += 1;
      refreshAbortRef.current?.abort();
      refreshAbortRef.current = null;
      refreshCourseIdRef.current = "";
      refreshQueuedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if(classEnded||loadingState!=="ready")return;
    let lastRecovery=0;
    return sync.scheduler.register({topics:["resume"],initialDelay:null,interval:()=>null,run:async signal=>{
      if(Date.now()-lastRecovery<2_000)return;lastRecovery=Date.now();
      messagesAbortRef.current?.abort();messagesAbortRef.current=null;messagesFailuresRef.current=0;
      refreshRequestIdRef.current++;refreshAbortRef.current?.abort();refreshAbortRef.current=null;stateFailuresRef.current=0;
      await renewClassroomCredentials().catch(()=>undefined);
      if(signal.aborted)return;
      setSignalingAttempt(attempt=>attempt+1);
      await roomRecoveryRef.current?.().catch(()=>undefined);
    }});
  },[classEnded,loadingState,renewClassroomCredentials,sync]);

  useEffect(() => {
    if (sessionData?.runtime.status !== "live" || !mediaProvider || isRecorder) return;
    // Starting a lesson should replay remote audio and repair missing
    // subscriptions without minting credentials or rebuilding the RTC client.
    void mediaProvider.recoverMedia().catch(() => undefined);
  }, [isRecorder, mediaProvider, sessionData?.runtime.status]);

  useEffect(() => {
    if (classEnded || loadingState !== "ready" || media.connectionState !== "disconnected" ||
      (media.connectionEvent?.reason && !["NETWORK_ERROR", "TOKEN_EXPIRE"].includes(media.connectionEvent.reason))) return;
    const timer = window.setTimeout(() => {
      if (navigator.onLine) void renewClassroomCredentials().catch(() => undefined);
    }, 1_000);
    return () => window.clearTimeout(timer);
  }, [classEnded, loadingState, media.connectionState, media.connectionEvent?.sequence, media.connectionEvent?.reason, renewClassroomCredentials]);

  useEffect(() => {
    if (
      loadingState !== "ready" ||
      !sessionData ||
      sessionData.mode !== "largeClass" ||
      isClassroomTeachingRole(sessionData.credential.role) ||
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
    if (
      loadingState !== "ready" ||
      !sessionData ||
      !isClassroomTeachingRole(sessionData.credential.role) ||
      !activeSpaceId ||
      isRecorder
    ) {
      return;
    }
    const activeRoom = sessionData.spaces.find(
      (space) => space.id === activeSpaceId,
    );
    if (activeRoom?.status === "open") return;
    const timer = window.setTimeout(() => void disconnectRoom(), 0);
    return () => window.clearTimeout(timer);
  }, [activeSpaceId, disconnectRoom, isRecorder, loadingState, sessionData]);

  useEffect(() => {
    if(classEnded||loadingState!=="ready")return;
    return sync.scheduler.register({topics:["recording","engagement","transport"],initialDelay:2500,
      background:isRecorder||media.local.screenSharing||roomMedia.local.screenSharing,
      run:()=>refreshState(),interval:ready=>stateFailuresRef.current?Math.min(60_000,5_000*2**Math.min(stateFailuresRef.current,4)):isRecorder||["starting","stopping","processing"].includes(recordingStatus||"")?5_000:ready?60_000:5_000});
  },[classEnded,loadingState,isRecorder,media.local.screenSharing,roomMedia.local.screenSharing,recordingStatus,refreshState,sync]);

  const deviceTrackerRef = useRef(createDeviceAckTracker());
  const deviceRepliesRef = useRef(new Map<string, Promise<ClassroomDeviceAck>>());
  const [deviceReport, setDeviceReport] = useState<DeviceReport | null>(null);
  useEffect(() => {
    deviceTrackerRef.current.clear(); deviceRepliesRef.current.clear();
    const timer = setTimeout(() => setDeviceReport(null), 0);
    return () => clearTimeout(timer);
  }, [classEnded, courseId]);
  const sectionReadsRef = useRef(new Map<string, { controller: AbortController; queued: boolean }>());
  const refreshSection = useCallback(async function readSection(scope: "captions" | "courseware" | "runtime"): Promise<void> {
    if (isRecorder || !sessionRef.current || sessionRef.current.runtime.status === "ended") return;
    const existing = sectionReadsRef.current.get(scope);
    if (existing) { existing.queued = true; return; }
    const entry = { controller: new AbortController(), queued: false };
    sectionReadsRef.current.set(scope, entry);
    const timeout = setTimeout(() => entry.controller.abort(), 15_000);
    try {
      const query = new URLSearchParams({ scope });
      if (shareAccess) query.set("shareAccess", shareAccess);
      const captionContext = `${courseId}:${shareAccess || ""}`;
      if (scope === "captions") captionSyncRef.current.query(captionContext, query);
      const response = await fetch(`/api/sessions/${encodeURIComponent(courseId)}/classroom/state?${query}`, { cache: "no-store", signal: entry.controller.signal });
      if (!response.ok) { await refreshState(); return; }
      const payload = await response.json() as Pick<ClassroomSessionResponse, "captions" | "courseware" | "runtime"> & CaptionSyncResponse;
      if (entry.controller.signal.aborted) return;
      // Only the authorized runtime section advances its control revision.
      // Captions/courseware remain independent; RTM supplies no content authority.
      if(scope === "runtime" && payload.runtime && !pendingRuntimeActionRef.current) updateSession({runtime:payload.runtime});
      if (scope === "captions") captionSyncRef.current.accept(captionContext, payload, captions => updateSession({ captions }));
      if (scope === "courseware" && Array.isArray(payload.courseware)) {
        const current = new Map(sessionRef.current?.courseware.map(item => [item.id, item]));
        updateSession({ courseware: payload.courseware.map(item => {
          const previous = current.get(item.id);
          return previous?.updatedAt && item.updatedAt && previous.updatedAt > item.updatedAt ? previous : item;
        }) });
      }
    } catch { /* The regular snapshot poll remains the recovery path. */ }
    finally {
      clearTimeout(timeout);
      if (sectionReadsRef.current.get(scope) === entry) sectionReadsRef.current.delete(scope);
      if (entry.queued && !entry.controller.signal.aborted) void readSection(scope);
    }
  }, [courseId, isRecorder, refreshState, shareAccess, updateSession]);
  useEffect(() => {
    const reads = sectionReadsRef.current;
    return () => { for (const entry of reads.values()) entry.controller.abort(); reads.clear(); };
  }, [classEnded, courseId, isRecorder, shareAccess]);
  const hasPendingConversion = sessionData?.courseware.some(item => item.whiteboardEnabled && ["Pending", "Converting"].includes(item.taskStatus));
  useEffect(()=>{
    if(classEnded||isRecorder||loadingState!=="ready")return;
    const runtime=sync.scheduler.register({topics:["runtime","members"],initialDelay:null,interval:()=>null,run:()=>refreshSection("runtime")});
    const captions=sync.scheduler.register({topics:["captions"],initialDelay:null,interval:()=>null,run:()=>refreshSection("captions")});
    const courseware=sync.scheduler.register({topics:["courseware"],initialDelay:hasPendingConversion?50:null,interval:()=>hasPendingConversion?5000:null,run:()=>refreshSection("courseware")});
    return()=>{runtime();captions();courseware();};
  },[classEnded,isRecorder,loadingState,hasPendingConversion,refreshSection,sync]);

  useEffect(() => {
    const signaling = sessionData?.signaling;
    if (!signaling || isRecorder || classEnded || loadingState !== "ready") return;
    let cancelled = false;
    const provider = createClassroomSignalingProvider();
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const retrySignaling = () => {
      if (cancelled || retryTimer) return;
      retryTimer = setTimeout(() => {
        void renewClassroomCredentials().catch(() => undefined).finally(() => {
          if (!cancelled) setSignalingAttempt(attempt => attempt + 1);
        });
      }, Math.min(30_000, 5_000 * (signalingAttempt + 1)));
    };
    signalingRef.current = provider;
    const onEvent = (
      event: ClassroomSignalingEvent,
      publisherId?: string,
    ) => {
      if (cancelled || sessionRef.current?.runtime.status === "ended" || event.courseId !== courseId) return;
      if (event.topic === "device-ack") {
        const current = sessionRef.current;
        if (current) { const report = deviceTrackerRef.current.accept(current.runtime, event, publisherId); if (report) setDeviceReport(report); }
        return;
      }
      if (event.topic === "hand-raise") {
        const current = sessionRef.current;
        if (!current) return;
        const key = `${courseId}:${event.actorId}`;
        const updated = applyClassroomHandRaiseUpdate(current.runtime, event, publisherId, false, handRaiseRevisionsRef.current.get(key));
        if (updated) {
          handRaiseRevisionsRef.current.set(key, event.revision);
          updateSession({ runtime: updated }, false);
          sync.scheduler.invalidate("runtime");
        }
        return;
      }
      if (event.topic === "screen-share-request") {
        const current = sessionRef.current;
        if (!current) return;
        const updated = applyClassroomScreenShareRequest(current.runtime, event, publisherId, false, Date.now() + presenceClockOffsetRef.current);
        if (updated) updateSession({ runtime: updated });
        if (verifiedScreenShareInvitation(current.runtime,event,publisherId,Date.now()+presenceClockOffsetRef.current)) sync.scheduler.invalidate("runtime");
        return;
      }
      if (event.topic === "member-permissions") {
        const current = sessionRef.current;
        if (!current) return;
        const self = current.runtime.members.find(member => member.userId === current.credential.userId);
        const authorized = applyClassroomMemberPermissionUpdate({ ...current.runtime, revision: event.revision - 1 }, event, publisherId);
        const targetsSelf = self && (event.scope === "students" ? self.role === "student" : event.targetUserId === self.userId);
        if (authorized && targetsSelf && publisherId && event.commandId && /^[A-Za-z0-9_-]{16,128}$/.test(event.commandId)) {
          const key = `${publisherId}:${event.commandId}`;
          let acknowledgement = deviceRepliesRef.current.get(key);
          if (!acknowledgement) {
            acknowledgement = Promise.resolve().then(async (): Promise<ClassroomDeviceAck> => {
              const provider = providerRef.current;
              let microphoneFailed = false;
              let cameraFailed = false;
              const latest = sessionRef.current?.runtime.members.find(member => member.userId === self.userId);
              if (provider && latest?.microphoneAllowed === event.microphoneAllowed && latest.onStage && latest.stageState === "accepted") {
                try { await applyMicrophonePermission(provider, event.microphoneAllowed); }
                catch { microphoneFailed = true; }
                if (event.cameraAllowed === false && provider.getSnapshot().local.cameraOn) {
                  try { await provider.toggleCamera(); } catch { cameraFailed = true; }
                }
              }
              const actual = provider?.getActualDeviceState?.() || { microphone: "unknown" as const, camera: "unknown" as const };
              return { courseId, topic: "device-ack", actorId: self.userId, commandId: event.commandId!, revision: event.revision, ...actual, ...(microphoneFailed && { microphone: "failed" as const }), ...(cameraFailed && { camera: "failed" as const }) };
            });
            deviceRepliesRef.current.set(key, acknowledgement);
            if (deviceRepliesRef.current.size > 64) deviceRepliesRef.current.delete(deviceRepliesRef.current.keys().next().value!);
          }
          void acknowledgement.then(ack => { if (!cancelled) return provider.publishToUser?.(publisherId, ack); }).catch(() => undefined);
        }
        const updated = applyClassroomMemberPermissionUpdate(current.runtime, event, publisherId);
        if (updated) {
          const missedUpdates = event.revision > current.runtime.revision + 1;
          updateSession({ runtime: updated });
          if (missedUpdates) sync.scheduler.invalidate("runtime");
        }
        return;
      }
      if (event.topic === "composition-preview") {
        const current = sessionRef.current;
        // Agora RTM echoes messages to the sender. Applying our own preview
        // back into React changes the item's base left/top during a Motion
        // drag, which is the source of the visible snap-back.
        if (!current) return;
        const selfId = isRecorder ? current.credential.userId : user?.userId || "";
        setSessionData((snapshot) => {
          if (!snapshot) return snapshot;
          const runtime = applyClassroomCompositionPreview(snapshot.runtime, event, publisherId, selfId);
          return runtime ? { ...snapshot, runtime } : snapshot;
        });
        return;
      }
      if (event.topic === "activities") { sync.scheduler.invalidate("activities"); if(event.revision>(sessionRef.current?.runtime.revision??0))sync.scheduler.invalidate("runtime"); return; }
      if (event.topic === "messages" || event.topic === "captions" || event.topic === "courseware") { sync.scheduler.invalidate(event.topic); return; }
      if (event.topic === "recording" || event.revision > (sessionRef.current?.runtime.revision ?? 0)) {
        sync.scheduler.invalidate(event.topic);
      }
    };
    signalingReadyRef.current = false;
    sync.scheduler.setRealtime(false);
    retrySignaling();
    void signalingTeardownRef.current.catch(() => undefined).then(() => {
      if (cancelled) return;
      return provider.connect(signaling, onEvent, (ready) => {
      if (cancelled) return;
      const wasReady = signalingReadyRef.current;
      const recovered = ready && !wasReady;
      signalingReadyRef.current = ready;
      sync.scheduler.setRealtime(ready);
      if (ready) { clearTimeout(retryTimer); retryTimer = undefined; }
      else retrySignaling();
      if (recovered) {
        sync.scheduler.invalidate("caption-preference");
        const current = sessionRef.current;
        if (current) void provider.publish({ courseId, topic: "runtime", revision: current.runtime.revision }).catch(() => undefined);
      }
      // The scheduler's transport invalidation already restores data reads.
      });
    }).catch((error) => {
      if (!cancelled) {
        console.warn("[classroom:v3] RTM unavailable; polling remains active", error);
        retrySignaling();
      }
    });
    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      if (signalingRef.current === provider) { signalingRef.current = null; signalingReadyRef.current = false; }
      signalingTeardownRef.current = provider.disconnect();
    };
  }, [
    classEnded,
    courseId,
    isRecorder,
    refreshState,
    refreshMessages,
    refreshSection,
    sessionData?.signaling,
    loadingState,
    signalingAttempt,
    sync,
    renewClassroomCredentials,
    user?.userId,
    updateSession,
  ]);

  useEffect(() => {
    if (isRecorder || classEnded || loadingState !== "ready" || !courseId) return;
    const controller = new AbortController();
    let inFlight = false;
    let failures = 0;
    let lastSuccessAt = Date.now();
    const heartbeat = async () => {
      if (inFlight || controller.signal.aborted || sessionRef.current?.runtime.status === "ended") return;
      inFlight = true;
      const startedAt = performance.now();
      try {
        const refreshed = await requestClassroomHeartbeat({
          signal: controller.signal,
          request: signal => fetch(`/api/sessions/${encodeURIComponent(courseId)}/classroom/actions`, {
            method: "POST", headers: { "Content-Type": "application/json" }, signal,
            body: JSON.stringify({ clientId, action: { type: "heartbeat" }, presenceOnly: true, ...(shareAccess && { shareAccess }) }),
          }),
          onResponse: (status, payload) => stopEndedSession(status, payload),
        });
        if (!refreshed || controller.signal.aborted) return;
        if(failures)sync.scheduler.invalidate("caption-preference");
        if (failures) reportConnectionDiagnostic({ event: "heartbeat-recovered", occurredAt: new Date().toISOString(), failures,
          durationMs: performance.now() - startedAt, lastSuccessAgeMs: Date.now() - lastSuccessAt });
        failures = 0;
        lastSuccessAt = Date.now();
        setPresenceHealthy(true);
      } catch (error) {
        if (!controller.signal.aborted) {
          failures += 1;
          // Log the first failure and sparse repeats to avoid a diagnostic storm.
          if (failures === 1 || failures % 4 === 0) reportConnectionDiagnostic({ event: "heartbeat-failed", occurredAt: new Date().toISOString(), failures,
            durationMs: performance.now() - startedAt, lastSuccessAgeMs: Date.now() - lastSuccessAt,
            ...(error instanceof ClassroomRecoveryError ? { status: error.status } : {}),
          });
          setPresenceHealthy(false);
        }
      } finally {
        inFlight = false;
      }
    };
    const remove=sync.scheduler.register({topics:["presence"],background:true,initialDelay:5000+Math.random()*1000,
      run:heartbeat,interval:()=>Math.min(30_000,15_000*2**Math.min(failures,1))+Math.random()*1000});
    return()=>{controller.abort();remove();};
  }, [classEnded,clientId,courseId,isRecorder,loadingState,shareAccess,stopEndedSession,reportConnectionDiagnostic,sync]);

  const currentUserId = isRecorder
    ? sessionData?.credential.userId || ""
    : user?.userId || "";
  const publishCompositionPreview = useCallback(
    (itemId: string, rect: ClassroomBoardRect) => {
      const now = performance.now();
      if (
        !courseId ||
        !currentUserId ||
        isRecorder ||
        !sessionRef.current?.capabilities.canManageStage ||
        sessionRef.current.runtime.status === "ended" ||
        now - compositionPreviewAtRef.current < 80
      ) {
        return;
      }
      compositionPreviewAtRef.current = now;
      void signalingRef.current?.publish({
        courseId,
        topic: "composition-preview",
        actorId: currentUserId,
        itemId,
        rect: normalizeBoardRect(rect),
        sentAt: Date.now(),
      });
    },
    [courseId, currentUserId, isRecorder],
  );
  const currentMember = sessionData?.runtime.members.find(
    (member) => member.userId === currentUserId,
  );
  useEffect(() => {
    if (!classEnded) return;
    void captionQueueRef.current?.flush();
    liveRequestsRef.current?.abort();
    refreshRequestIdRef.current += 1;
    refreshAbortRef.current?.abort();
    messagesAbortRef.current?.abort();
    publishEnabledRef.current = false;
    void providerRef.current?.disconnect().catch(() => undefined);
    const settleEndedState = window.setTimeout(() => {
      setActionError("");
      void disconnectRoom();
      setActivePanel(null);
      setRecordingStopConfirming(false);
      setEndClassConfirming(false);
      setStudentPublishReady(false);
      setMedia(EMPTY_MEDIA);
    }, 0);
    return () => window.clearTimeout(settleEndedState);
  }, [classEnded, disconnectRoom]);

  // Reuse an existing camera grant for the teacher. A first-time permission
  // prompt should follow an explicit click on the camera control instead of
  // being triggered by joining the classroom.
  useEffect(() => {
    if (
      isRecorder ||
      classEnded ||
      !mediaProvider ||
      !isClassroomTeachingRole(sessionData?.credential.role) ||
      media.connectionState !== "connected" ||
      media.local.cameraOn ||
      teacherCameraAutostartedRef.current
    ) {
      return;
    }
    let cancelled = false;
    void (async () => {
      let permission: PermissionStatus | undefined;
      try {
        permission = await navigator.permissions?.query({
          name: "camera" as PermissionName,
        });
      } catch {
        if (!cancelled) teacherCameraAutostartedRef.current = true;
        return;
      }
      if (cancelled) return;
      teacherCameraAutostartedRef.current = true;
      if (permission?.state !== "granted") return;
      try {
        await mediaProvider.toggleCamera();
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "";
        setActionError(
          /PERMISSION_DENIED|NotAllowedError|Permission denied/i.test(message)
            ? t("classroom.v3.cameraPermissionDenied")
            : message || t("classroom.v3.mediaActionFailed"),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    classEnded,
    isRecorder,
    media.connectionState,
    media.local.cameraOn,
    mediaProvider,
    sessionData?.credential.role,
    t,
  ]);

  const auxiliaryAuthorizationRefreshRef = useRef(false);
  useEffect(() => {
    if (!isRecorder && mediaProvider && currentMember?.cameraAllowed === false && (media.local.auxiliaryCameraOn || media.local.auxiliaryCameraStarting)) {
      void mediaProvider.stopAuxiliaryCamera();
    }
    if (isRecorder || classEnded || !mediaProvider || !sessionData?.credential.publishAllowed || currentMember?.cameraAllowed === false || sessionData.credential.auxiliaryCamera) {
      auxiliaryAuthorizationRefreshRef.current = false;
      return;
    }
    if (auxiliaryAuthorizationRefreshRef.current) return;
    auxiliaryAuthorizationRefreshRef.current = true;
    // A renewal performed while camera permission was revoked omits this
    // token. Restore authorization in the background before the next click.
    void renewClassroomCredentials().catch((error) => {
      if (sessionRef.current?.runtime.status === "ended") return;
      setActionError(error instanceof Error ? error.message : t("classroom.v3.mediaActionFailed"));
    });
  }, [classEnded, currentMember?.cameraAllowed, isRecorder, media.local.auxiliaryCameraOn, media.local.auxiliaryCameraStarting, mediaProvider, renewClassroomCredentials, sessionData?.credential.auxiliaryCamera, sessionData?.credential.publishAllowed, t]);

  const publishingKey = `${courseId}:${currentMember?.onStage}:${currentMember?.stageState}:${currentMember?.screenShareState}:${currentMember?.screenShareRequestedAt||""}`;
  const publishingBlocked = publishingError?.key === publishingKey;
  useEffect(()=>()=>{publishingAbortRef.current?.abort();},[publishingKey]);
  useEffect(() => {
    if (
      isRecorder ||
      classEnded ||
      !sessionData ||
      !mediaProvider ||
      sessionData.credential.role !== "student"
    ) {
      return;
    }
    const shouldPublish =
      currentMember?.onStage && currentMember.stageState === "accepted";
    const needsScreen = currentMember?.screenShareState === "accepted" && !sessionData.credential.screenShare;
    if (shouldPublish && (!publishEnabledRef.current || needsScreen) && !publishingTaskRef.current && !publishingBlocked && liveRequestsRef.current) {
      publishEnabledRef.current = true;
      publishingTaskRef.current = true;
      setPublishingPreparing(true);
      const requestedKey = publishingKey;
      const preparationController = new AbortController();
      publishingAbortRef.current = preparationController;
      const preparationSignal = AbortSignal.any([liveRequestsRef.current.signal,preparationController.signal]);
      void requestClassroomPublishingCredential({sessionId:courseId,clientId,shareAccess,screen:needsScreen,
        signal:preparationSignal,onResponse:stopEndedSession,refreshAuth:tryOAuthRefresh})
        .then(async (credential) => {
          const member = sessionRef.current?.runtime.members.find((candidate) => candidate.userId === currentUserId);
          if (preparationSignal.aborted || providerRef.current !== mediaProvider || !publishEnabledRef.current || sessionRef.current?.runtime.status === "ended" || !member?.onStage || member.stageState !== "accepted") return;
          if(needsScreen && member.screenShareState!=="accepted"){publishEnabledRef.current=Boolean(sessionRef.current?.credential.publishAllowed);return;}
          await mediaProvider.setPublishingCredential(credential);
          if (preparationSignal.aborted || providerRef.current !== mediaProvider) return;
          if (!publishEnabledRef.current) {
            await mediaProvider.setPublishingCredential(null);
            return;
          }
          updateSession({ credential });
          setStudentPublishReady(true);
        })
        .catch((error) => {
          if (preparationSignal.aborted || providerRef.current !== mediaProvider || sessionRef.current?.runtime.status === "ended") return;
          const retained=Boolean(sessionRef.current?.credential.publishAllowed);
          publishEnabledRef.current = retained;
          setStudentPublishReady(retained);
          const message=error instanceof ClassroomRecoveryError?t("classroom.v3.stageCredentialFailed"):error instanceof Error?error.message:t("classroom.v3.stageCredentialFailed");
          setPublishingError({key:requestedKey,message});setActionError(message);
        }).finally(()=>{publishingTaskRef.current=false;setPublishingPreparing(false);});
    }
    if (!shouldPublish && publishEnabledRef.current) {
      publishEnabledRef.current = false;
      setStudentPublishReady(false);
      void mediaProvider.setPublishingCredential(null);
    }
    if (
      currentMember &&
      currentMember.onStage && currentMember.stageState === "accepted"
    ) {
      void applyMicrophonePermission(mediaProvider, currentMember.microphoneAllowed).catch(() => undefined);
    }
    if (
      currentMember &&
      !currentMember.cameraAllowed &&
      media.local.cameraOn
    ) {
      void mediaProvider.toggleCamera();
    }

  }, [
    classEnded,
    clientId,
    courseId,
    currentMember,
    currentUserId,
    isRecorder,
    media.local.cameraOn,
    media.local.auxiliaryCameraOn,
    media.local.auxiliaryCameraStarting,
    media.local.microphoneOn,
    media.local.screenSharing,
    mediaProvider,
    sessionData,
    shareAccess,
    stopEndedSession,
    studentPublishReady,
    publishingBlocked,
    publishingKey,
    publishingPreparing,
    t,
    updateSession,
  ]);


  const whiteboardCredentialRole = sessionData?.credential.role;
  const whiteboardCredentialError = sessionData?.whiteboard.error;
  const whiteboardCredentialWritable = sessionData?.whiteboard.writable;
  const memberWhiteboardWritable = currentMember?.whiteboardWritable;
  useEffect(() => {
    const whiteboardPending = whiteboardCredentialError === "whiteboard_pending" || Boolean(whiteboardCredentialError);
    const studentPermissionChanged =
      !isRecorder && whiteboardCredentialRole === "student" &&
      memberWhiteboardWritable !== undefined &&
      memberWhiteboardWritable !== whiteboardCredentialWritable;
    if (
      classEnded || loadingState !== "ready" ||
      !courseId ||
      (!whiteboardPending && !studentPermissionChanged)
    ) {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
    void withClassroomRequestSignal(15_000, liveRequestsRef.current?.signal, signal => fetch("/api/classroom/session/whiteboard-credential", {
      signal,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        sessionId: courseId,
        ...(shareAccess && { shareAccess }),
        ...(isRecorder && { recordingId, recorderToken }),
      }),
    }))
      .then(async (response) => {
        const payload = (await response.json()) as {
          whiteboard?: ClassroomSessionResponse["whiteboard"];
          error?: string;
        };
        if (cancelled || stopEndedSession(response.status, payload)) return;
        if (!response.ok || !payload.whiteboard || !payload.whiteboard.enabled) {
          throw new Error(
            payload.error || payload.whiteboard?.error || t("classroom.v3.whiteboardPermissionFailed"),
          );
        }
        if (!cancelled) updateSession({ whiteboard: payload.whiteboard });
      })
      .catch((error) => {
        if (!cancelled) {
          const message =
            error instanceof Error
              ? error.message
              : t("classroom.v3.whiteboardPermissionFailed");
          updateSession({
            whiteboard: {
              enabled: false,
              provider: "netless",
              writable: false,
              error: message,
            },
          });
          // Keep credential errors on the board while retrying in the background.
          window.setTimeout(() => { if (!cancelled) updateSession({ whiteboard: { enabled: false, provider: "netless", writable: false, error: "whiteboard_pending" } }); }, 3_000);
        }
      });
    }, whiteboardCredentialError && whiteboardCredentialError !== "whiteboard_pending" ? 3_000 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    classEnded,
    clientId,
    courseId,
    isRecorder,
    loadingState,
    memberWhiteboardWritable,
    recordingId,
    recorderToken,
    shareAccess,
    stopEndedSession,
    t,
    updateSession,
    whiteboardCredentialError,
    whiteboardCredentialRole,
    whiteboardCredentialWritable,
  ]);

  const publishInvalidation = useCallback(
    (revision: number, topic: ClassroomInvalidation["topic"]) => {
      if (!courseId) return;
      void signalingRef.current?.publish({ courseId, revision, topic }).catch((error) => console.warn("[classroom:v3] signaling publish failed", error));
    },
    [courseId],
  );

  const performAction = useCallback(
    async (action: ClassroomAction) => {
      if (!courseId || !sessionRef.current || isRecorder ||
        sessionRef.current.runtime.status === "ended" ||
        (pendingRuntimeActionRef.current && action.type !== "updateBoardItem")) {
        return false;
      }
      pendingRuntimeActionRef.current = true;
      const originalRuntime = sessionRef.current.runtime;
      const optimisticComposition =
        action.type === "placeBoardItem"
          ? placeClassroomBoardItem(
              sessionRef.current.runtime.composition,
              action.item,
            )
          : action.type === "updateBoardItem"
            ? updateClassroomBoardItem(
                sessionRef.current.runtime.composition,
                action.itemId,
                {
                  ...(action.rect && { rect: action.rect }),
                  ...(typeof action.locked === "boolean" && {
                    locked: action.locked,
                  }),
                  ...(typeof action.visible === "boolean" && {
                    visible: action.visible,
                  }),
                  ...(action.shape && { shape: action.shape }),
                },
              )
            : null;
      // Placing or moving a teaching object must feel entirely local. Persist
      // in the background, then replace the optimistic view with the server's
      // final revision once it arrives.
      if (optimisticComposition) {
        updateSession({
          runtime: {
            ...sessionRef.current.runtime,
            composition: optimisticComposition,
          },
        });
      }
      const optimisticRuntime = optimisticClassroomRuntime(sessionRef.current.runtime, action, sessionRef.current.credential.userId);
      if (optimisticRuntime) updateSession({ runtime: optimisticRuntime }, false);
      let confirmedRuntime: ClassroomRuntimeSnapshot | undefined;
      setActionBusy(action.type);
      setActionError("");
      try {
        const { response, payload } = await requestClassroomAction(
          `/api/sessions/${encodeURIComponent(courseId)}/classroom/actions`,
          { clientId, action, expectedRevision: originalRuntime.revision, ...(shareAccess && { shareAccess }) },
          fetch,
          undefined,
          liveRequestsRef.current?.signal,
        );
        confirmedRuntime = payload.runtime;
        if (stopEndedSession(response.status, payload)) return false;
        if (!response.ok) {
          if (payload.runtime || payload.engagement) {
            updateSession({
              ...(payload.runtime && { runtime: payload.runtime }),
              ...(payload.engagement && { engagement: payload.engagement }),
            });
          }
          throw new Error(
            payload.code === "database_unavailable" ? t("classroom.v3.databaseRetryFailed") : payload.error || t("classroom.v3.classroomActionFailed"),
          );
        }
        if (payload.runtime) {
          updateSession({
            runtime: payload.runtime,
            ...(payload.engagement && { engagement: payload.engagement }),
          });
          publishInvalidation(
            payload.runtime.revision,
            action.type === "giveReward" ||
              action.type === "startBuzz" ||
              action.type === "submitBuzz" ||
              action.type === "closeBuzz" ||
              action.type === "startRandomSelector" ||
              action.type === "resetRandomSelector"
              ? "engagement"
              : "runtime",
          );
        }
        if (payload.handRaise && sessionRef.current) {
          const current = sessionRef.current.runtime;
          const updated = applyClassroomHandRaiseUpdate(current, payload.handRaise, undefined, true);
          confirmedRuntime = updated || current;
          if (updated) updateSession({ runtime: updated });
          void signalingRef.current?.publish(payload.handRaise).catch(error => console.warn("[classroom:v3] hand signaling failed", error));
          publishInvalidation(payload.handRaise.revision, "members");
          if (payload.handRaise.revision > current.revision + 1) void refreshState();
        }
        if (payload.screenShareRequest && sessionRef.current) {
          const current = sessionRef.current.runtime;
          const updated = applyClassroomScreenShareRequest(current, payload.screenShareRequest, undefined, true, Date.now() + presenceClockOffsetRef.current);
          confirmedRuntime = updated || current;
          if (updated) updateSession({ runtime: updated });
          void signalingRef.current?.publish(payload.screenShareRequest).catch(() => undefined);
          publishInvalidation(payload.screenShareRequest.revision, "runtime");
          sync.scheduler.invalidate("runtime");
        }
        if (payload.memberPermissions && sessionRef.current) {
          const current = sessionRef.current.runtime;
          const updated = applyClassroomMemberPermissionUpdate(current, payload.memberPermissions, undefined, true);
          confirmedRuntime = updated || current;
          if (updated) updateSession({ runtime: updated });
          setDeviceReport(deviceTrackerRef.current.begin(payload.memberPermissions));
          void signalingRef.current?.publish(payload.memberPermissions).catch(() => undefined);
          publishInvalidation(payload.memberPermissions.revision, "runtime");
          if (payload.memberPermissions.revision > current.revision + 1) void refreshState();
        }
        if (action.type === "startClass" || action.type === "startScheduledClass") {
          window.setTimeout(() => void refreshState(), 1_800);
        }
        return true;
      } catch (error) {
        if (liveRequestsRef.current?.signal.aborted) return false;
        if (!confirmedRuntime && (optimisticComposition || optimisticRuntime)) updateSession({ runtime: originalRuntime }, false);
        pendingRuntimeActionRef.current = false;
        void refreshState();
        setActionError(
          error instanceof Error
            ? error.message
            : t("classroom.v3.classroomActionFailed"),
        );
        return false;
      } finally {
        pendingRuntimeActionRef.current = false;
        setActionBusy(null);
      }
    },
    [
      clientId,
      courseId,
      isRecorder,
      publishInvalidation,
      refreshState,
      sync.scheduler,
      shareAccess,
      stopEndedSession,
      t,
      updateSession,
    ],
  );

  const startScheduledClass = useCallback(() => performAction({ type: "startScheduledClass" }), [performAction]);
  useScheduledClassStart({
    enabled: Boolean(sessionData && sessionData.runtime.status === "waiting" && sessionData.runtime.classStartMode === "scheduled" &&
      classStartReadiness({
        isTeacher: isClassroomTeachingRole(sessionData.credential.role), isRecorder, pageReady: loadingState === "ready",
        mediaConnected: media.connectionState === "connected",
        whiteboardRequired: sessionData.whiteboard.enabled || (classinLayout && sessionData.mode !== "publicLive") || sessionData.runtime.stageMode === "whiteboard",
        whiteboardReady,
      })),
    startTime: sessionData?.course.startTime ?? null, endTime: sessionData?.course.endTime ?? null,
    clockOffset: presenceClockOffset, onStart: startScheduledClass,
  });

  const runMediaAction = useCallback(
    async (
      name: string,
      action: (provider: ClassroomMediaProvider) => Promise<unknown>,
    ) => {
      const session = sessionRef.current;
      if (!session || session.runtime.status === "ended") return;
      const useRoomProvider =
        session?.mode === "largeClass" &&
        !isClassroomTeachingRole(session.credential.role) &&
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
      if (!provider || (name !== "microphone" && mediaBusyRef.current.has(name)) || mediaBusyRef.current.has("recover") || (name === "recover" && mediaBusyRef.current.size > 0) || isRecorder) return;
      const before = provider.getSnapshot().local;
      const member = useRoomProvider
        ? session.spaces.find((space) => space.id === activeSpaceId)?.members.find((candidate) => candidate.userId === session.credential.userId)
        : session.runtime.members.find((candidate) => candidate.userId === session.credential.userId);
      if (name === "microphone" && !before.microphoneOn && member?.microphoneAllowed === false) {
        return;
      }
      mediaPendingRef.current.set(name, (mediaPendingRef.current.get(name) || 0) + 1);
      mediaBusyRef.current.add(name);
      setMediaBusy([...mediaBusyRef.current]);
      if (name === "camera") {
        setMediaIntent((current) => ({ ...current, [name]: name === "camera" ? !before.cameraOn : !before.microphoneOn }));
      }
      setActionError("");
      try {
        await action(provider);
      } catch (error) {
        if (sessionRef.current?.runtime.status === "ended") return;
        const message = error instanceof Error ? error.message : "";
        setActionError(
          name === "screen" && /PERMISSION_DENIED|NotAllowedError|Permission denied/i.test(message)
            ? t("classroom.v3.screenSharePermissionDenied")
            : name === "screen" && /NOT_SUPPORTED|not support screen sharing/i.test(message)
              ? t("classroom.v3.screenShareBrowserUnsupported")
              : name === "camera" && /PERMISSION_DENIED|NotAllowedError|Permission denied/i.test(message)
                ? t("classroom.v3.cameraPermissionDenied")
                : name === "microphone" && /PERMISSION_DENIED|NotAllowedError|Permission denied/i.test(message)
                  ? t("classroom.v3.microphonePermissionDenied")
                : message || t("classroom.v3.mediaActionFailed"),
        );
      } finally {
        const pending = (mediaPendingRef.current.get(name) || 1) - 1;
        if (pending > 0) mediaPendingRef.current.set(name, pending);
        else {
          mediaPendingRef.current.delete(name);
          mediaBusyRef.current.delete(name);
          setMediaBusy([...mediaBusyRef.current]);
          setMediaIntent((current) => { const next = { ...current }; delete next[name as "camera" | "microphone"]; return next; });
        }
      }
    },
    [activeSpaceId, isRecorder, t],
  );

  const sendMessage = useCallback(
    async (
      content: string,
      context: {
        clientMessageId: string;
        imageId?: string;
        scope: "classroom" | "room" | "staff";
        spaceId?: string | null;
      },
    ) => {
      const current = sessionRef.current;
      if (!current || current.runtime.status === "ended") return false;
      const currentMember = current.runtime.members.find(
        (member) => member.userId === currentUserId,
      );
      const optimisticId = `${OPTIMISTIC_MESSAGE_PREFIX}${context.clientMessageId}`;
      const optimisticMessage: ClassroomMessageSnapshot = {
        id: optimisticId,
        senderId: currentUserId,
        senderName: currentMember?.displayName || currentUserId,
        senderRole: current.credential.role,
        scope: context.scope,
        spaceId: context.scope === "room" ? context.spaceId || null : null,
        recipientId: null,
        kind: context.imageId ? "image" : "text",
        content: context.imageId ? imageMessageContent(context.imageId, content) : content,
        deletedAt: null,
        createdAt: new Date().toISOString(),
      };
      setPendingMessages((messages) => [...messages, optimisticMessage]);
      setActionError("");
      const signal = liveRequestsRef.current?.signal;
      try {
        const { response, payload } = await requestClassroomMessage(
          `/api/sessions/${encodeURIComponent(courseId)}/classroom/messages`,
          {
            clientMessageId: context.clientMessageId,
            ...(context.imageId && { imageId: context.imageId }),
            content,
            scope: context.scope,
            spaceId: context.spaceId,
            ...(shareAccess && { shareAccess }),
          },
          fetch, undefined, signal,
        );
        if (stopEndedSession(response.status, payload) || sessionRef.current?.runtime.status === "ended") return false;
        if (!response.ok || !payload.message) {
          setActionError(response.status >= 500 || !payload.error ? t("classroom.v3.messageSendFailed") : payload.error);
          return false;
        }
        const confirmedMessage = payload.message;
        setSessionData((snapshot) => {
          if (!snapshot) return snapshot;
          const alreadyReceived = snapshot.messages.some(
            (message) => message.id === confirmedMessage.id,
          );
          return alreadyReceived
            ? snapshot
            : {
                ...snapshot,
                messages: [...snapshot.messages, confirmedMessage],
              };
        });
        publishInvalidation(payload.revision ?? current.runtime.revision, "messages");
        return true;
      } catch {
        if (signal?.aborted || sessionRef.current?.runtime.status === "ended") return false;
        setActionError(t("classroom.v3.messageSendFailed"));
        return false;
      } finally {
        setPendingMessages((messages) =>
          messages.filter((message) => message.id !== optimisticId),
        );
      }
    },
    [courseId, currentUserId, publishInvalidation, shareAccess, stopEndedSession, t],
  );

  const deleteMessage = useCallback(async (messageId: string, senderId?: string) => {
    try {
      const response = await fetch(`/api/sessions/${encodeURIComponent(courseId)}/classroom/messages`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(senderId ? {senderId} : {messageId}), ...(shareAccess && {shareAccess}) }), signal: AbortSignal.timeout(20000) });
      const payload = await response.json() as {error?:string;revision?:number};
      if (!response.ok) throw new Error(payload.error || t("classroom.v3.messageWithdrawFailed"));
      await refreshState(); if (payload.revision) publishInvalidation(payload.revision, "messages"); return true;
    } catch (error) { setActionError(error instanceof Error ? error.message : t("classroom.v3.messageWithdrawFailed")); return false; }
  }, [courseId,publishInvalidation,refreshState,shareAccess,t]);

  const coursewareUpdatesRef = useRef(new Set<string>());
  const [coursewareInsertion, setCoursewareInsertion] = useState<Record<string, CoursewareInsertion>>({});
  const [coursewareAttempt, setCoursewareAttempt] = useState({ id: "", attempt: 0 });
  const handleCoursewareInsertion = useCallback((id: string, status: CoursewareInsertion["status"], error?: string) => {
    setCoursewareInsertion(old => ({ ...old, [id]: { status, error } }));
  }, []);
  const updateCourseware = useCallback(async (coursewareId: string, update: Partial<Pick<ClassroomCoursewareSnapshot, "studentCanView" | "studentCanDownload" | "whiteboardEnabled">>) => {
    if (coursewareUpdatesRef.current.has(coursewareId)) throw new Error(t("classroom.v3.coursewareSaving"));
    coursewareUpdatesRef.current.add(coursewareId);
    const busyKey = `courseware-${coursewareId}`;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    setActionBusy(busyKey);
    setActionError("");
    try {
      const response = await fetch(`/api/courses/${encodeURIComponent(sessionRef.current?.course.id || legacyCourseId)}/courseware/${encodeURIComponent(coursewareId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(update), signal: controller.signal });
      const payload = await response.json().catch(() => ({})) as { error?: string; courseware?: ClassroomCoursewareSnapshot };
      if (payload.courseware && sessionRef.current) updateSession({ courseware: sessionRef.current.courseware.map(item => item.id === coursewareId ? { ...item, ...payload.courseware } : item) });
      if (!response.ok) throw new Error(payload.error || t("classroom.v3.coursewareUpdateFailed"));
      if (!payload.courseware) throw new Error(t("classroom.v3.coursewareSaveUnconfirmed"));
      if (update.whiteboardEnabled !== undefined) setCoursewareInsertion(old => { const next = { ...old }; delete next[coursewareId]; return next; });
      // Saving already succeeded: a later refresh failure must not fake a rollback.
      void refreshState().catch(() => undefined);
      publishInvalidation((sessionRef.current?.runtime.revision || 0) + 1, "courseware");
    } catch (error) {
      const failure = error instanceof Error && error.name !== "AbortError" && !(error instanceof TypeError) ? error : new Error(t("classroom.v3.coursewareSaveUnconfirmed"));
      void refreshState().catch(() => undefined);
      setActionError(failure.message);
      throw failure;
    } finally {
      window.clearTimeout(timeout);
      coursewareUpdatesRef.current.delete(coursewareId);
      setActionBusy(current => current === busyKey ? null : current);
    }
  }, [legacyCourseId, publishInvalidation, refreshState, t, updateSession]);

  const mutateSpaces = useCallback(
    async (
      method: "POST" | "PATCH" | "DELETE",
      body: Record<string, unknown>,
    ) => {
      if (!courseId || spaceBusy) return;
      setSpaceBusy(true);
      setActionError("");
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 15_000);
      try {
        const response = await fetch(
          `/api/sessions/${encodeURIComponent(courseId)}/classroom/spaces`,
          {
            method,
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
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
          code?: string;
        };
        if (!response.ok) {
          throw new Error(
            payload.code === "database_unavailable"
              ? t("classroom.v3.databaseUnavailable")
              : payload.error || t("classroom.v3.roomUpdateFailed"),
          );
        }
        if (payload.spaces) updateSession({ spaces: payload.spaces });
        await refreshState();
        if (payload.revision) publishInvalidation(payload.revision, "runtime");
      } catch (error) {
        setActionError(
          error instanceof DOMException && error.name === "AbortError"
            ? t("classroom.v3.roomUpdateTimedOut")
            : error instanceof Error
            ? error.message
            : t("classroom.v3.roomUpdateFailed"),
        );
      } finally {
        window.clearTimeout(timeout);
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

  const controlRecording = useCallback(async (action: "start" | "stop") => {
    if (!courseId || actionBusy || isRecorder) return;
    if (
      ["stopping", "processing"].includes(recordingStatus || "") ||
      (action === "start" && ["starting", "recording"].includes(recordingStatus || ""))
    ) {
      return;
    }
    setActionBusy("recording");
    setActionError("");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    try {
      const recordingRequest = () => fetch(
        `/api/sessions/${encodeURIComponent(courseId)}/recording`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ action }),
        },
      );
      let response = await recordingRequest();
      if (response.status === 401 && await tryOAuthRefresh()) response = await recordingRequest();
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        recording?: {
          status?: string;
          mode?: "web" | "mix";
          fallbackFrom?: string | null;
        } | null;
      };
      if (!response.ok) {
        throw new Error(payload.code === "database_unavailable"
          ? t("classroom.v3.databaseUnavailable")
          : response.status === 401 ? t("classroom.v3.loginExpired") : response.status === 403 ? t("classroom.v3.recordingForbidden") : payload.error || t("classroom.v3.recordingActionFailed"));
      }
      setRecordingStatus(payload.recording?.status ?? null);
      setRecordingFallback(payload.recording?.fallbackFrom ?? null);
      setRecordingStopConfirming(false);
      publishInvalidation(
        sessionRef.current?.runtime.revision || 0,
        "recording",
      );
    } catch (error) {
      setActionError(
        error instanceof DOMException && error.name === "AbortError"
          ? t("classroom.v3.recordingRequestTimedOut")
          : error instanceof Error
          ? error.message
          : t("classroom.v3.recordingActionFailed"),
      );
    } finally {
      window.clearTimeout(timeout);
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

  const onRecordingControl = useCallback(() => {
    if (recordingStatus === "starting" || recordingStatus === "recording") {
      setActionError("");
      setRecordingStopConfirming(true);
      return;
    }
    void controlRecording("start");
  }, [controlRecording, recordingStatus]);

  const parentCourseId = sessionData?.course.id || null;
  const classroomRole = sessionData?.credential.role || null;
  const isStudentViewer = classroomRole === "student";
  const exitClassroom = useCallback(() => {
    if (isLeaving) return;
    setIsLeaving(true);
    void captionQueueRef.current?.flush();
    liveRequestsRef.current?.abort();
    const destination = parentCourseId
      ? `/courses/${encodeURIComponent(parentCourseId)}`
      : "/";
    const signaling = signalingRef.current;
    const mediaProvider = providerRef.current;
    signalingRef.current = null;
    providerRef.current = null;

    // Navigation is the visible result of ending or leaving a lesson. Provider
    // disconnects can wait on reconnecting sockets, so clean them up after the
    // route transition instead of trapping the user in the classroom.
    router.replace(destination);
    void signaling?.disconnect().catch((error: unknown) => {
      console.warn("[classroom:v3] signaling cleanup failed", error);
    });
    void mediaProvider?.disconnect().catch((error: unknown) => {
      console.warn("[classroom:v3] media cleanup failed", error);
    });
    window.setTimeout(() => {
      if (window.location.pathname === "/classroom") {
        window.location.replace(destination);
      }
    }, 1_200);
  }, [isLeaving, parentCourseId, router]);

  const endClass = useCallback(async () => {
    const current = sessionRef.current;
    if (
      !courseId ||
      !current ||
      !isClassroomTeachingRole(current.credential.role) ||
      current.runtime.status !== "live" ||
      actionBusy ||
      isRecorder
    ) {
      return;
    }
    endingClassRef.current = true;
    setActionBusy("endClass");
    setActionError("");
    try {
      // Begin archive delivery before the lifecycle changes. Never keep an
      // offline teacher trapped here: unacknowledged entries are already local.
      const queue = captionQueueRef.current;
      if (queue) {
        let timeout: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([queue.flush(), new Promise<void>(resolve => { timeout = setTimeout(resolve, 1_000); })]);
        clearTimeout(timeout);
      }
      const response = await fetch(
        `/api/courses/${encodeURIComponent(current.course.id)}/sessions/${encodeURIComponent(courseId)}/lifecycle`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "end" }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        session?: { status?: string };
        runtime?: ClassroomRuntimeSnapshot;
      };
      if (!response.ok || !payload.session?.status) {
        throw new Error(
          payload.error || t("classroom.v3.classroomActionFailed"),
        );
      }
      const endedSession = {
        ...current,
        runtime: payload.runtime || { ...current.runtime, status: "ended" as const },
        course: { ...current.course, status: payload.session.status },
      };
      sessionRef.current = endedSession;
      liveRequestsRef.current?.abort();
      setSessionData(endedSession);
      emitHostEvent(endedSession, "teacher_end");
      if (
        ["starting", "recording", "stopping"].includes(recordingStatus || "")
      ) {
        setRecordingStatus("stopping");
      }
      if (payload.runtime) {
        publishInvalidation(payload.runtime.revision, "runtime");
      }
      setEndClassConfirming(false);
      exitClassroom();
    } catch (error) {
      endingClassRef.current = false;
      setActionError(
        error instanceof Error
          ? error.message
          : t("classroom.v3.classroomActionFailed"),
      );
    } finally {
      setActionBusy(null);
    }
  }, [
    actionBusy,
    courseId,
    exitClassroom,
    emitHostEvent,
    isRecorder,
    publishInvalidation,
    recordingStatus,
    t,
  ]);

  const leaveTemporarily = useCallback(() => {
    if (isLeaving || overtimeLeaveBusyRef.current) return;
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
    if (!isRecorder && courseId) {
      void fetch("/api/classroom/session/leave", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: courseId, clientId, shareAccess, voluntary: true, ...(sessionRef.current?.runtime.startedAt ? { leaveIntent: "temporary", cycleStartedAt: sessionRef.current.runtime.startedAt } : {}) }), keepalive: true }).catch(() => undefined);
    }
    emitHostEvent(sessionRef.current, "user_leave", true);
    exitClassroom();
  }, [clientId, shareAccess, classroomRole, courseId, emitHostEvent, exitClassroom, isLeaving, isRecorder]);

  const leaveClassroom = useCallback(() => {
    const current = sessionRef.current;
    if (isLeaving || overtimeLeaveBusyRef.current) return;
    if (!isRecorder && current && isClassroomTeachingRole(current.credential.role) && current.runtime.status === "live" && current.course.endTime &&
        isClassroomOvertime(new Date(current.course.endTime), current.runtime.graceEndsAt ? new Date(current.runtime.graceEndsAt) : null,
          new Date(Date.now() + presenceClockOffsetRef.current))) {
      setActionError("");
      setOvertimeLeaveConfirming(true);
      return;
    }
    leaveTemporarily();
  }, [isLeaving, isRecorder, leaveTemporarily]);

  const finishOvertimeAndLeave = useCallback(async () => {
    const current = sessionRef.current;
    if (!current?.runtime.startedAt || !isClassroomTeachingRole(current.credential.role) || isRecorder || isLeaving || overtimeLeaveBusyRef.current) return;
    overtimeLeaveBusyRef.current = true;
    setActionBusy("overtimeLeave");
    setActionError("");
    try {
      // Await a durable server acknowledgment before navigating or disconnecting media.
      const response = await fetch("/api/classroom/session/leave", {
        method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true,
        body: JSON.stringify({ sessionId: current.course.sessionId, clientId, shareAccess, voluntary: true,
          leaveIntent: "finishIfLastTeacher", cycleStartedAt: current.runtime.startedAt }),
      });
      const payload = await response.json().catch(() => ({})) as { ok?: boolean; classEnded?: boolean };
      if (!response.ok || !payload.ok) throw new Error(t("classroom.v3.overtimeLeaveFailed"));
      if (payload.classEnded) endingClassRef.current = true;
      emitHostEvent(current, payload.classEnded ? "teacher_end" : "user_leave", true);
      setOvertimeLeaveConfirming(false);
      exitClassroom();
    } catch {
      setActionError(t("classroom.v3.overtimeLeaveFailed"));
    } finally {
      overtimeLeaveBusyRef.current = false;
      setActionBusy(null);
    }
  }, [clientId, emitHostEvent, exitClassroom, isLeaving, isRecorder, shareAccess, t]);

  const toggleFullscreen = useCallback(() => {
    setActivePanel(null);
    setStageExpanded((value) => !value);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void stageElementRef.current?.requestFullscreen?.().catch(() => undefined);
  }, []);
  useEffect(() => {
    const onFullscreen = () => { if (!document.fullscreenElement) setStageExpanded(false); };
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => document.removeEventListener("fullscreenchange", onFullscreen);
  }, []);
  useEffect(() => {
    if (isRecorder || loadingState !== "ready") return;
    const onPageHide = (event: PageTransitionEvent) => {
      if (event.persisted) return;
      emitHostEvent(sessionRef.current, "pagehide", true);
      navigator.sendBeacon("/api/classroom/session/leave", new Blob([JSON.stringify({ sessionId: courseId, clientId, shareAccess })], { type: "application/json" }));
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [clientId, courseId, emitHostEvent, isRecorder, loadingState, shareAccess]);

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
    !isClassroomTeachingRole(sessionData.credential.role) &&
    !acceptedStudentOnStage &&
    Boolean(roomProvider);
  const requiresRoomMedia =
    sessionData?.mode === "largeClass" &&
    !isClassroomTeachingRole(sessionData.credential.role) &&
    !acceptedStudentOnStage;
  const actualControlMedia = controlsRoomMedia ? roomMedia : media;
  const controlMedia = { ...actualControlMedia, local: { ...actualControlMedia.local,
    cameraOn: mediaIntent.camera ?? actualControlMedia.local.cameraOn,
    microphoneOn: actualControlMedia.local.microphoneOn } };

  const classroomMembers = reconcileClassroomRtcPresence(sessionData?.runtime.members ?? [], media, now - presenceClockOffset, roomMedia, sessionData?.runtime.presenceUncertain || !presenceHealthy);
  const decorateParticipant = (participant: ClassroomParticipant) => {
    const member = classroomMembers.find(
      (candidate) =>
        candidate.userId === classroomParticipantOwnerId(participant, classroomMembers, currentUserId),
    );
    return {
      participant,
      member,
      displayName:
        participant.kind === "screen"
          ? t("classroom.v3.teacherScreen", {
              name: member?.displayName || t("classroom.v3.teacher"),
            })
          : participant.kind === "auxiliary-camera"
            ? t("classroom.v3.auxiliaryCameraWithName", { name: member?.displayName || participant.displayName })
            : member?.displayName || participant.displayName,
    };
  };
  const selectedParticipants = selectClassroomCameraParticipants(media.participants, classroomMembers, currentUserId);
  const decoratedParticipants = selectedParticipants.map(decorateParticipant);
  const activeScreenShare = selectActiveScreenShare({
    main: media,
    room: roomMedia,
    preferRoom: controlsRoomMedia,
    mainScreenUserId: sessionData?.credential.screenShare
      ? String(sessionData.credential.screenShare.rtcUid)
      : null,
    roomScreenUserId: roomScreenShareUserId,
    mainAuthorizedScreenUid: sessionData?.runtime.composition.screenShares
      ? sessionData.runtime.composition.screenShares.main?.rtcUid.toString() ?? null : undefined,
    roomAuthorizedScreenUid: sessionData?.runtime.composition.screenShares && activeSpaceId
      ? sessionData.runtime.composition.screenShares[activeSpaceId]?.rtcUid.toString() ?? null : undefined,
  });
  // Non-teacher large-class members publish through the room RTC provider.
  // Prefer that provider's screen track so a successful local share actually
  // replaces the whiteboard; fall back to the main channel for teacher shares.
  const screenParticipant = activeScreenShare
    ? decorateParticipant(activeScreenShare.participant)
    : undefined;
  const screenParticipantProvider = activeScreenShare?.source === "room"
    ? roomProvider
    : mediaProvider;
  const hideLocalScreenSharePreview = shouldHideLocalScreenSharePreview(
    activeScreenShare,
    isRecorder,
  );
  const spotlightParticipant = decoratedParticipants.find(
    ({ participant }) =>
      classroomParticipantOwnerId(participant, classroomMembers, currentUserId) ===
      sessionData?.runtime.spotlightUserId,
  );
  const leadTeacher = classroomMembers.find(
    (member) => member.role === "teacher",
  );
  const teacherParticipant = decoratedParticipants.find(({ participant }) => {
    const member = classroomMembers.find(
      (candidate) =>
        candidate.userId === classroomParticipantOwnerId(participant, classroomMembers, currentUserId),
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
      const ownerId = classroomParticipantOwnerId(participant, classroomMembers, currentUserId);
      return classroomMembers.some(
        (member) => member.userId === ownerId && member.onStage && (member.online || participant.isLocal),
      );
    })
    .slice(0, 6);
  const activeCourseware =
    sessionData?.courseware.find(
      (item) => item.id === sessionData.runtime.activeCoursewareId,
    ) ||
    sessionData?.courseware.find((item) => item.whiteboardEnabled) ||
    null;
  const compositionBoardItems = (
    sessionData?.runtime.composition.boardItems ?? []
  ).filter((item) => item.kind !== "screen");
  // Keep Fastboard mounted while a screen share is on stage. Destroying it on
  // every share transition reconnects the room, flashes the loading state and
  // can make recently synchronized strokes appear to disappear.
  const whiteboardStageEnabled = Boolean(
    screenParticipant ||
      (classinLayout && sessionData?.mode !== "publicLive") ||
      sessionData?.runtime.stageMode === "whiteboard",
  );
  const showWhiteboard = Boolean(!screenParticipant && whiteboardStageEnabled);
  const { boardItems: presentedBoardItems, cameraSourceIds: boardSourceIds } = classroomBoardPresentation(
    compositionBoardItems, showWhiteboard, hiddenBoardItemIds,
  );
  const videoGalleryActive = showWhiteboard && sessionData?.runtime.composition.videoLayout === "grid" && boardSourceIds.size > 0;
  const drawingSurfaceAvailable = (showWhiteboard && !videoGalleryActive) || Boolean(screenParticipant && !hideLocalScreenSharePreview);
  const drawingController = screenParticipant ? screenAnnotationController : whiteboardController;
  const recorderCameras = isRecorder ? recorderCameraParticipants(
    media.participants,
    classroomMembers,
    compositionBoardItems.filter((item) => !hiddenBoardItemIds.has(item.id)),
    !showWhiteboard,
  ) : [];
  const useMediaGallery = Boolean(
    !screenParticipant &&
      !showWhiteboard &&
      layoutMode !== "focus" &&
      galleryParticipants.length > 1,
  );
  const auxiliaryFeeds: AuxiliaryCameraFeed[] = [
    ...(mediaProvider ? media.participants.filter((participant) => participant.kind === "auxiliary-camera" && participant.hasVideo).map((participant) => {
      const ownerId = participantOwnerId(participant.id, classroomMembers);
      return { participant, provider: mediaProvider, displayName: decorateParticipant(participant).displayName, ownerId,
        canPlace: Boolean(sessionData?.capabilities.canManageStage && showWhiteboard && !isRecorder) };
    }).filter((feed) => !showWhiteboard || !compositionBoardItems.some((item) => item.visible && !hiddenBoardItemIds.has(item.id) && item.kind === "auxiliary-camera" && item.sourceId === feed.ownerId && (item.rtcUid === undefined || String(item.rtcUid) === feed.participant.id))) : []),
    ...(roomProvider ? roomMedia.participants.filter((participant) => participant.kind === "auxiliary-camera" && participant.hasVideo).map((participant) => {
      const ownerId = participantOwnerId(participant.id, classroomMembers);
      const name = currentSpace?.members.find((member) => member.userId === ownerId)?.displayName || participant.displayName;
      return { participant, provider: roomProvider, displayName: t("classroom.v3.auxiliaryCameraWithName", { name }), ownerId, canPlace: false };
    }) : []),
  ];
  const stageActor = screenParticipant?.member || stageParticipant?.member;
  const stageSourceTitle = hideLocalScreenSharePreview
    ? t("classroom.v3.localScreenSharing")
    : screenParticipant
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
  const teacherIsOnMainStage = Boolean(
    !useMediaGallery &&
      !screenParticipant &&
      !showWhiteboard &&
      teacherParticipant &&
      stageParticipant?.participant.id === teacherParticipant.participant.id,
  );
  const teacherIsVisibleInGallery = Boolean(
    useMediaGallery &&
      teacherParticipant &&
      galleryParticipants.some(
        (item) => item.participant.id === teacherParticipant.participant.id,
      ),
  );
  const canShowTeacherPictureInPicture = Boolean(
    !classinLayout &&
    !classEnded &&
      leadTeacher &&
      isStudentViewer &&
      !teacherIsOnMainStage &&
      !teacherIsVisibleInGallery,
  );
  const showTeacherPictureInPicture =
    canShowTeacherPictureInPicture && !teacherPiPHidden;
  const elapsedSeconds = sessionData?.runtime.startedAt
    ? Math.max(0, (now + presenceClockOffset - new Date(sessionData.runtime.startedAt).getTime()) / 1000)
    : 0;
  const hasClassStarted = Boolean(sessionData?.runtime.startedAt);
  const timerRemaining =
    sessionData?.runtime.timerStartedAt &&
    sessionData.runtime.timerDurationSec
      ? sessionData.runtime.timerPausedAt
        ? sessionData.runtime.timerDurationSec
        : sessionData.runtime.timerDurationSec -
        (now - new Date(sessionData.runtime.timerStartedAt).getTime()) / 1000
      : null;
  const canUseWhiteboard = Boolean(!isRecorder && (sessionData?.capabilities.canManageWhiteboard || currentMember?.whiteboardWritable));
  useWhiteboardShortcuts(drawingController, whiteboardTool, setWhiteboardTool, Boolean(!classEnded && drawingSurfaceAvailable && canUseWhiteboard && sessionData?.whiteboard.writable), !screenParticipant);
  const canUseMedia = requiresRoomMedia
    ? controlsRoomMedia && Boolean(currentSpaceMember)
    : sessionData?.credential.role !== "student" || Boolean(currentMember?.onStage && currentMember.stageState === "accepted");
  const microphoneAllowed = controlsRoomMedia
    ? currentSpaceMember?.microphoneAllowed !== false
    : currentMember?.microphoneAllowed !== false;
  const canUseAuxiliaryCamera = Boolean(canUseMedia && !isRecorder && !classEnded && (controlsRoomMedia || sessionData?.credential.auxiliaryCamera) && (controlsRoomMedia ? currentSpaceMember?.cameraAllowed !== false : currentMember?.cameraAllowed !== false));
  const mainScreenPermission = Boolean(sessionData && canShareClassroomScreen({
    role: sessionData.credential.role, member: currentMember,
    studentSharingSupported: sessionData.modePolicy.studentCanShareWhenOnStage,
    assistantManagementAllowed: true,
  }));
  const screenScope = controlsRoomMedia ? activeSpaceId || "main" : "main";
  const screenLeases = sessionData?.runtime.composition.screenShares;
  const screenLease = screenLeases?.[screenScope];
  const screenPermission = requiresRoomMedia
    ? controlsRoomMedia && Boolean(currentSpaceMember?.screenShareAllowed)
    : mainScreenPermission;
  const mayClaimScreen = screenScope === "main" || !screenLease || ownsScreenShare(screenLease, currentUserId, clientId) ||
    (!controlsRoomMedia && isClassroomTeachingRole(sessionData?.credential.role));
  const isScreenShareAllowed = !isRecorder && !classEnded && (controlMedia.local.screenSharing ||
    (screenPermission && mayClaimScreen && (controlsRoomMedia || Boolean(sessionData?.credential.screenShare)) && canUseMedia));
  const selectedMainScreenUid = screenLeases?.main ? String(screenLeases.main.rtcUid) : null;
  const selectedScreenClaim = screenLeases?.main?.claimId;
  const selectedScreenHasVideo = Boolean(screenParticipant);
  useEffect(() => {
    if (!selectedScreenClaim || selectedScreenHasVideo || !sessionData?.capabilities.canManageMembers || isRecorder) return;
    const timer = window.setTimeout(() => {
      if (sessionRef.current?.runtime.composition.screenShares?.main?.claimId !== selectedScreenClaim) return;
      void performAction({ type: "selectScreenShare", claimId: null });
      setActionError(t("classroomMultiShare.timeout"));
    }, 15000);
    return () => window.clearTimeout(timer);
  }, [isRecorder, performAction, selectedScreenClaim, selectedScreenHasVideo, sessionData?.capabilities.canManageMembers, t]);

  useEffect(() => {
    void mediaProvider?.setScreenShareSelection?.(selectedMainScreenUid).catch(error => setActionError(error instanceof Error ? error.message : t("classroomMultiShare.failed")));
  }, [mediaProvider, selectedMainScreenUid, t]);
  const selectedRoomScreenUid = activeSpaceId && screenLeases?.[activeSpaceId] ? String(screenLeases[activeSpaceId].rtcUid) : null;
  useEffect(() => { void roomProvider?.setScreenShareSelection?.(selectedRoomScreenUid).catch(() => undefined); }, [roomProvider, selectedRoomScreenUid]);
  const studentShareReady = studentScreenShareReady({publishing:studentPublishReady,screenCredential:Boolean(sessionData?.credential.screenShare),permitted:screenPermission,mayClaim:mayClaimScreen});
  const screenCredentialRefreshRef = useRef(false);
  useEffect(() => {
    if (sessionData?.credential.role === "student" || !mainScreenPermission || sessionData?.credential.screenShare || !canUseMedia || controlsRoomMedia || isRecorder || classEnded) {
      screenCredentialRefreshRef.current = false;
      return;
    }
    if (screenCredentialRefreshRef.current) return;
    screenCredentialRefreshRef.current = true;
    void renewClassroomCredentials().catch((error) => {
      screenCredentialRefreshRef.current = false;
      setActionError(error instanceof Error ? error.message : t("classroom.v3.mediaActionFailed"));
    });
  }, [canUseMedia, classEnded, controlsRoomMedia, isRecorder, mainScreenPermission, renewClassroomCredentials, sessionData?.credential.screenShare, sessionData?.credential.role, t]);
  useEffect(() => {
    if (isRecorder || !controlMedia.local.screenSharing) return;
    if (!screenPermission || (screenLeases && !(screenScope === "main" ? mainScreenShareCandidates(screenLeases).some(lease => ownsScreenShare(lease, currentUserId, clientId)) : ownsScreenShare(screenLease, currentUserId, clientId)))) {
      void (controlsRoomMedia ? roomProvider : mediaProvider)?.stopScreenShare();
    }
  }, [clientId, controlMedia.local.screenSharing, controlsRoomMedia, currentUserId, isRecorder, mediaProvider, roomProvider, screenLease, screenLeases, screenPermission, screenScope]);
  const requestScreenShareAction = useCallback(async (action: Extract<ClassroomAction, { type: "startScreenShare" | "releaseScreenShare" }>) => {
    const { response, payload } = await requestClassroomAction(
      `/api/sessions/${encodeURIComponent(courseId)}/classroom/actions`,
      { clientId, action, ...(shareAccess && { shareAccess }) }, fetch, undefined, liveRequestsRef.current?.signal,
    );
    if (!response.ok || !payload.runtime) throw new Error(payload.error || t("classroom.v3.classroomActionFailed"));
    updateSession({ runtime: payload.runtime });
    publishInvalidation(payload.runtime.revision, "runtime");
  }, [clientId, courseId, publishInvalidation, shareAccess, t, updateSession]);
  const localScreenClaimRef = useRef<{ claimId: string; spaceId?: string; provider: ClassroomMediaProvider; started: boolean } | null>(null);
  const screenReleaseQueue = useRef(new ScreenShareReleaseQueue());
  const flushScreenReleases = useCallback(() => screenReleaseQueue.current.flush(requestScreenShareAction), [requestScreenShareAction]);
  useEffect(()=>sync.scheduler.register({topics:["screen-release"],background:true,interval:()=>5000,run:()=>flushScreenReleases()}),[flushScreenReleases,sync]);

  const releaseLocalScreenShare = useCallback(async () => {
    const claim = localScreenClaimRef.current;
    if (!claim) return;
    screenReleaseQueue.current.add({ type: "releaseScreenShare", claimId: claim.claimId, ...(claim.spaceId && { spaceId: claim.spaceId }) });
    localScreenClaimRef.current = null;
    await flushScreenReleases();
  }, [flushScreenReleases]);
  useEffect(() => {
    const claim = localScreenClaimRef.current;
    if (claim?.started && !claim.provider.getSnapshot().local.screenSharing) {
      void releaseLocalScreenShare().catch(error => setActionError(error instanceof Error ? error.message : t("classroom.v3.classroomActionFailed")));
    }
  }, [media.local.screenSharing, releaseLocalScreenShare, roomMedia.local.screenSharing, t]);
  const openWhiteboard = () => {
    setActivePanel(null);
    if (!sessionData?.capabilities.canManageStage) return;
    void (async () => {
      if (controlMedia.local.screenSharing) {
        await (controlsRoomMedia ? roomProvider : mediaProvider)?.stopScreenShare();
      }
      await performAction({
        type: "setStage",
        mode: "whiteboard",
        locked: false,
        coursewareId: sessionData.runtime.activeCoursewareId,
      });
    })().catch((error: unknown) => {
      setActionError(error instanceof Error ? error.message : t("classroom.v3.classroomActionFailed"));
    });
  };
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const studentSharesOpen = activePanel === "screens";
  const [studentInviteOpen, setStudentInviteOpen] = useState(false);
  const preparedStudentIds = new Set(mainScreenShareCandidates(screenLeases).map(lease => lease.userId));
  const studentShareCount = classroomMembers.filter(member => member.role === "student" && (preparedStudentIds.has(member.userId) || member.screenShareState === "requested" || (member.screenShareState === "accepted" && Boolean(member.screenShareRequestedAt)))).length;
  const hasStudentShares = studentShareCount > 0;
  const previousStudentShares = useRef(false);
  useEffect(() => {
    if (previousStudentShares.current && !hasStudentShares) { setActivePanel(current => current === "screens" ? null : current); setStudentInviteOpen(false); }
    previousStudentShares.current = hasStudentShares;
  }, [hasStudentShares]);
  const setStudentSharesOpen = useCallback((value: boolean | ((current: boolean) => boolean)) => {
    setStudentInviteOpen(false);
    setActivePanel(current => (typeof value === "function" ? value(current === "screens") : value) ? "screens" : null);
  }, []);
  const closeShareMenu = useCallback(() => setShareMenuOpen(false), []);
  const screenShareBusy = Boolean(actionBusy) || mediaBusy.includes("screen") || mediaBusy.includes("recover");
  const stopLocalSharing = useCallback(() => {
    setShareMenuOpen(false);
    void runMediaAction("screen", async provider => { await provider.stopScreenShare(); await releaseLocalScreenShare(); });
  }, [releaseLocalScreenShare, runMediaAction]);
  const toggleScreenShare = useCallback((options?: ClassroomScreenShareOptions) => {
    if (!options) { setShareMenuOpen(true); return; }
    setShareMenuOpen(false);
    void runMediaAction("screen", async (provider) => {
      if (provider.getSnapshot().local.screenSharing) {
        await provider.setScreenShareOptions?.(options);
        return;
      }
      if (!screenPermission || !mayClaimScreen) throw new Error(t("classroom.v3.screenShareNotAuthorized"));
      const claim = { claimId: crypto.randomUUID(), provider, started: false,
        ...(provider === roomProviderRef.current && activeSpaceId ? { spaceId: activeSpaceId } : {}) };
      localScreenClaimRef.current = claim;
      let authorizationAttempted = false;
      try {
        await provider.startScreenShare(async () => {
          await flushScreenReleases();
          authorizationAttempted = true;
          await requestScreenShareAction({ type: "startScreenShare", claimId: claim.claimId, ...(claim.spaceId && { spaceId: claim.spaceId }) });
          const latestShares = sessionRef.current?.runtime.composition.screenShares;
          const lease = claim.spaceId ? latestShares?.[claim.spaceId] : mainScreenShareCandidates(latestShares).find(item => item.claimId === claim.claimId);
          if (!ownsScreenShare(lease, currentUserId, clientId) || lease?.claimId !== claim.claimId) {
            throw new DOMException("Screen share replaced", "AbortError");
          }
        }, options);
        claim.started = true;
        if (!provider.getSnapshot().local.screenSharing) await releaseLocalScreenShare();
      } catch (error) {
        if (localScreenClaimRef.current === claim) localScreenClaimRef.current = null;
        if (authorizationAttempted) {
          screenReleaseQueue.current.add({ type: "releaseScreenShare", claimId: claim.claimId, ...(claim.spaceId && { spaceId: claim.spaceId }) });
          await flushScreenReleases().catch(() => undefined);
        }
        throw error;
      }
    });
  }, [activeSpaceId, clientId, currentUserId, flushScreenReleases, mayClaimScreen, releaseLocalScreenShare, requestScreenShareAction, runMediaAction, screenPermission, t]);
  const roomPermissionKey = currentSpaceMember
    ? `${currentSpaceMember.cameraAllowed}:${currentSpaceMember.screenShareAllowed}` : "";
  useEffect(() => {
    if (!controlsRoomMedia || !roomProvider || !currentSpaceMember) return;
    void applyMicrophonePermission(roomProvider, currentSpaceMember.microphoneAllowed).catch(() => undefined);
    if (!currentSpaceMember.cameraAllowed && roomMedia.local.cameraOn) void roomProvider.toggleCamera();
    if (!currentSpaceMember.cameraAllowed && (roomMedia.local.auxiliaryCameraOn || roomMedia.local.auxiliaryCameraStarting)) void roomProvider.stopAuxiliaryCamera();
  }, [controlsRoomMedia, currentSpaceMember, roomMedia.local.cameraOn, roomMedia.local.auxiliaryCameraOn, roomMedia.local.auxiliaryCameraStarting, roomMedia.local.microphoneOn, roomProvider]);
  const roomPermissionRef = useRef("");
  useEffect(() => {
    const previous = roomPermissionRef.current;
    roomPermissionRef.current = roomPermissionKey;
    if (!controlsRoomMedia || !roomProvider || !activeSpaceId || !previous || previous === roomPermissionKey || classEnded) return;
    const controller = new AbortController();
    // Permission changes do not require leaving the RTC channel. Renew only
    // the affected publisher tokens, preserving microphones and subscriptions.
    void (async () => {
      const response = await fetch(`/api/sessions/${encodeURIComponent(courseId)}/classroom/spaces/credential`, {
        method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId: activeSpaceId, clientId, ...(shareAccess && { shareAccess }) }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.credential) throw new Error(payload.error || t("classroom.v3.roomConnectFailed"));
      if (roomProviderRef.current !== roomProvider || controller.signal.aborted) return;
      await roomProvider.renewCredential(payload.credential);
      if (!controller.signal.aborted && roomProviderRef.current === roomProvider) setRoomScreenShareUserId(payload.credential.screenShare?.rtcUid.toString() || null);
    })().catch(error => {
      if (!controller.signal.aborted) setActionError(error instanceof Error ? error.message : t("classroom.v3.roomConnectFailed"));
    });
    return () => controller.abort();
  }, [activeSpaceId, classEnded, clientId, controlsRoomMedia, courseId, roomPermissionKey, roomProvider, shareAccess, t]);
  const chatDisabled =
    !sessionData?.runtime.chatEnabled ||
    Boolean(currentMember?.chatMuted) ||
    isRecorder;
  const promotedQuestion = sessionData?.questions.find(
    (question) => question.status === "promoted",
  ) || null;
  const availableCaptionLanguages = supportedCaptionTranslationCodes(sessionData?.runtime.interpretation.provider ?? "shengwang");
  const effectiveCaptionLanguage = resolveEffectiveCaptionLanguage(
    captionLanguage,
    availableCaptionLanguages,
    sessionData?.runtime.interpretation.sourceLanguage || "zh-CN",
  );
  const captionSubscription = useCaptionSubscription({
    active: !isRecorder && !classEnded && loadingState === "ready",
    sessionId: courseId, clientId, shareAccess,
    language: effectiveCaptionLanguage, mode: captionDisplayMode,
    sourceLanguage: sessionData?.runtime.interpretation.sourceLanguage || "zh-CN",
    provider: sessionData?.runtime.interpretation.provider || "shengwang",
  });
  const liveCaptions = useLiveCaptions(
    isRecorder ? undefined : sessionData?.captions,
    effectiveCaptionLanguage,
    captionDisplayMode,
    now + presenceClockOffset,
  );
  const visibleDrawerPanels: DrawerPanel[] = [
    ...(sessionData?.modePolicy.showMemberRoster && sessionData.capabilities.canManageMembers
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
    ...(sessionData?.capabilities.canRunEngagement ||
    sessionData?.capabilities.canParticipateInEngagement
      ? (["engagement", "activities"] as DrawerPanel[])
      : []),
    "tools",
  ];

  const backFromEntry = () => {
    liveRequestsRef.current?.abort();
    const parentCourseId = sessionData?.course.id || legacyCourseId;
    router.replace(parentCourseId ? `/courses/${encodeURIComponent(parentCourseId)}` : "/?view=courses");
  };
  if (loadingState === "device-choice" || loadingState === "device-replaced") {
    return <ClassroomDeviceEntry replaced={loadingState === "device-replaced"} devices={otherDevices}
      onBack={backFromEntry}
      onChoose={(mode) => { deviceEntryModeRef.current = mode; setLaunchAttempt(attempt => attempt + 1); }}
      onRejoin={() => { connectionReplacedRef.current = false; deviceEntryModeRef.current = undefined; setClientId(crypto.randomUUID()); }} />;
  }
  if (loadingState === "loading" && courseId) {
    return <ClassroomLoading key={launchAttempt} recorder={isRecorder}
      phase={!isRecorder && authLoading ? "identity" : entryPhase}
      courseName={sessionData?.course.name}
      message={launchRetry ? t("classroom.v3.enteringRetry", { attempt: launchRetry + 1, max: 4 }) : undefined}
      onRetry={authLoading ? undefined : () => setLaunchAttempt(attempt => attempt + 1)}
      onBack={backFromEntry} />;
  }
  if (
    loadingState === "error" ||
    !sessionData ||
    !mediaProvider ||
    !courseId
  ) {
    return <ClassroomLoading key={launchAttempt} recorder={isRecorder} phase={entryPhase}
      courseName={sessionData?.course.name} errorMessage={errorMessage || t("classroom.v3.missingCourse")}
      onRetry={courseId ? () => setLaunchAttempt(attempt => attempt + 1) : undefined}
      onBack={backFromEntry} />;
  }

  const openActivityTools = () => { setActivePanel("chat"); if (sessionData.credential.role === "student") window.dispatchEvent(new CustomEvent(ACTIVITY_OPEN_EVENT, { detail: { sessionId: courseId } })); else setActivityCreateRequest(value => value + 1); };
  const minimalFunctionActions: ClassroomHeaderMenuAction[] = [
    ...(!classEnded && sessionData.capabilities.canManageMembers && sessionData.modePolicy.studentCanShareWhenOnStage ? [{ id: "student-screens", label: t("classroomMultiShare.title"), icon: <MonitorUp />, onSelect: () => { setStudentSharesOpen(true); } }] : []),
          ...(sessionData.capabilities.canManageMembers ? [{ id: "members", label: t("classroomRoster.openMembers"), icon: <Users />, onSelect: () => setActivePanel("members") }] : []),
          { id: "settings", compactOnly: true, label: t("classroom.v3.deviceSettings"), icon: <Settings2 />, onSelect: () => setSettingsOpen(true) },
          ...(!classEnded ? [
            { id: "assistant", label: t(assistantVisible ? "classroomWorkspace.hideAssistant" : "classroomWorkspace.showAssistant"), icon: <Sparkles />, checked: assistantVisible, onSelect: () => setAssistantVisible(value => !value) },
          ] : []),
          { id: "layout", label: t("classroomMinimal.layout"), icon: <LayoutGrid />, children: [
            ...(whiteboardStageEnabled ? sessionData.capabilities.canManageStage && !classEnded ? [
              { id: "board", label: t("classroom.v3.boardLayout"), icon: <Presentation />, checked: !compositionBoardItems.some(item => item.kind === "camera" && item.visible), disabled: Boolean(actionBusy) || !showWhiteboard, onSelect: () => { void performAction({ type: "arrangeVideoGallery", layout: "rail" }); } },
              { id: "board-grid", label: t("classroom.v3.stageGridLayout"), icon: <LayoutGrid />, checked: sessionData.runtime.composition.videoLayout === "grid" && compositionBoardItems.some(item => item.kind === "camera" && item.visible), disabled: Boolean(actionBusy) || !showWhiteboard, onSelect: () => { void performAction({ type: "arrangeVideoGallery", layout: "grid" }); } },
            ] : [] : [
              { id: "focus", label: t("classroom.v3.focusLayout"), icon: <Presentation />, checked: layoutMode === "focus", onSelect: () => setLayoutMode("focus") },
              { id: "grid", label: t("classroom.v3.gridLayout"), icon: <LayoutGrid />, checked: layoutMode === "grid", onSelect: () => setLayoutMode("grid") },
            ]),
            { id: "seats", label: t("classroom.v3.members"), icon: <Users />, checked: !liveRailCollapsed, onSelect: () => setLiveRailCollapsed(value => !value) },
          ] },
          ...(classEnded ? [{ id: "playback", label: t("studentDashboard.viewPlayback"), icon: <Play/>, onSelect: () => window.open(`/courses/${encodeURIComponent(sessionData.course.id)}/playback?sessionId=${encodeURIComponent(sessionData.course.sessionId)}`, "_blank", "noopener,noreferrer") }] : []),
    { id: "recover", label: t("classroom.v3.resetMedia"), icon: mediaBusy.includes("recover") ? <Loader2 className="animate-spin" /> : <RefreshCw />, disabled: classEnded || mediaBusy.includes("recover"), onSelect: () => { void runMediaAction("recover", async provider => { await renewClassroomCredentials(); await provider.recoverMedia(true); }); } },
        ];

  const minimalOperationActions: ClassroomHeaderMenuAction[] = [
    ...(!classEnded ? [
            { id: "courseware", label: t("classroom.v3.courseware"), icon: <BookOpen />, onSelect: () => setActivePanel("courseware") },
            { id: "interaction", label: t("classroomMinimal.interaction"), icon: <Zap />, children: [
              { id: "activities", label: t("activities.title"), icon: <ClipboardList />, onSelect: openActivityTools },
              { id: "questions", label: t("classroom.v3.questions"), icon: <MessageCircle />, onSelect: () => setActivePanel("questions") },
              { id: "engagement", label: t("classroomMinimal.interaction"), icon: <Zap />, onSelect: () => setActivePanel("engagement") },
            ] },
    ] : []),
    ...(isScreenShareAllowed && (screenShareSupported || controlMedia.local.screenSharing) ? [{ id: "share", compactOnly: true, label: t(controlMedia.local.screenSharing ? "classroom.v3.stopSharing" : "classroom.v3.screenShare"), icon: controlMedia.local.screenSharing ? <ScreenShareOff /> : <MonitorUp />, disabled: screenShareBusy, onSelect: () => { if (controlMedia.local.screenSharing) stopLocalSharing(); else toggleScreenShare(); } }] : []),
    ...(controlMedia.local.screenSharing ? [
      { id: "share-settings", label: t("classroomSharing.title"), icon: <Settings2 />, disabled: screenShareBusy, onSelect: () => toggleScreenShare() },
      { id: "fullscreen", compactOnly: true, label: t("classroom.v3.fullscreen"), icon: <Expand />, onSelect: toggleFullscreen },
    ] : []),
    { id: "captions", compactOnly: true, label: t("classroom.v3.captions"), icon: <Headphones />, onSelect: () => setActivePanel(current => current === "captions" ? null : "captions") },

    { id: "leave", label: t("classroom.v3.leave"), icon: <LogOut />, onSelect: leaveClassroom, disabled: isLeaving, danger: true },
  ];

  const liveRail = (!isRecorder && (sessionData.modePolicy.showLiveRail ||
        (classinLayout && sessionData.mode !== "publicLive")) && (
        <LiveRail
          showHandQueue={!classinLayout}
          onAction={performAction} onViewMembers={() => setActivePanel("members")}
          members={classroomMembers}
          media={media}
          provider={mediaProvider}
          currentUserId={currentUserId}
          canManage={sessionData.capabilities.canManageStage && !isRecorder}
          canReward={sessionData.capabilities.canGiveReward && !isRecorder}
          busy={Boolean(actionBusy)}
          maxStudentSeats={classroomStudentStageLimit(sessionData.modePolicy, sessionData.runtime)}
          onSpotlight={(userId) =>
            void performAction(
              classinLayout
                ? {
                    type: "placeBoardItem",
                    item: {
                      id: `camera:${userId}`,
                      kind: "camera",
                      sourceId: userId,
                      rect: defaultBoardRect("camera"),
                      locked: false,
                      visible: true,
                    },
                  }
                : { type: "setSpotlight", targetUserId: userId },
            )
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
          onReward={(userId) =>
            void performAction({ type: "giveReward", targetUserIds: [userId] })
          }
          collapsed={liveRailCollapsed}
          onToggleCollapsed={() => setLiveRailCollapsed((value) => !value)}
          seatOrder={sessionData.runtime.composition.seatOrder}
          boardSourceIds={boardSourceIds}
          onReorder={(seatOrder) =>
            void performAction({ type: "reorderSeats", seatOrder })
          }
          onPlaceOnBoard={(userId) =>
            void performAction({
              type: "placeBoardItem",
              item: {
                id: `camera:${userId}`,
                kind: "camera",
                sourceId: userId,
                rect: defaultBoardRect("camera"),
                locked: false,
                visible: true,
              },
            })
          }
          previewPlacesOnBoard={classinLayout}
          canPlaceOnBoard={showWhiteboard}
        />
      ));

  return (
    <ClassroomSyncProvider value={sync}><main
      className={`classroom-v3-shell is-mode-${sessionData.mode} ${classinLayout ? "is-classin-layout" : ""} ${isRecorder ? "is-recorder" : ""} ${stageExpanded ? "is-stage-expanded" : ""} ${(sessionData.modePolicy.showLiveRail || (classinLayout && sessionData.mode !== "publicLive")) && liveRailCollapsed ? "is-rail-collapsed" : ""}`}
      data-responsive-workspace={classinLayout || undefined}
      data-runtime-status={sessionData.runtime.status}
      data-classroom-mode={sessionData.mode}
      data-composite-source={isRecorder ? "whiteboard-stage" : undefined}
      data-recorder-cameras={isRecorder && recorderCameras.length > 0}
    >
      {classinLayout && !isRecorder ? <MinimalHeader
        screenShareControl={hasStudentShares && !classEnded && sessionData.capabilities.canManageMembers && sessionData.modePolicy.studentCanShareWhenOnStage ? <button type="button" className="classroom-minimal-icon classroom-student-share-trigger" aria-label={t("classroomMultiShare.title")} title={t("classroomMultiShare.title")} aria-expanded={studentSharesOpen} onClick={() => { setStudentSharesOpen(value => !value); }}><MonitorUp /><span>{studentShareCount}</span></button> : undefined}
        course={sessionData.course} runtime={sessionData.runtime} now={now + presenceClockOffset}
        roleName={roleLabel(sessionData.credential.role, t)} memberCount={classroomPresenceSummary(classroomMembers).online} membersOpen={activePanel === "members"}
        connectionState={media.connectionState} presenceHealthy={presenceHealthy && !sessionData.runtime.presenceUncertain}
        recording={["starting", "recording"].includes(recordingStatus || "")} recordingStatus={recordingStatus} canRecord={sessionData.capabilities.canControlRecording && !classEnded} onRecording={onRecordingControl} onFullscreen={toggleFullscreen} expanded={stageExpanded} busy={Boolean(actionBusy)}
        canStart={isClassroomTeachingRole(sessionData.credential.role) && sessionData.runtime.status === "waiting"}
        canEnd={sessionData.capabilities.canEndClass && sessionData.runtime.status === "live"}
        canExtend={sessionData.capabilities.canEndClass}
        onBack={leaveClassroom} onStart={() => void performAction({ type: "startClass" })}
        onEnd={() => setEndClassConfirming(true)} onRestarted={() => void refreshState()}
        onExtended={timing => { updateSession({ course: { ...sessionData.course, endTime: timing.endTime }, runtime: { ...sessionData.runtime, scheduledEndAt: timing.endTime, scheduledStartAt: timing.startTime, revision: timing.revision } }); publishInvalidation(timing.revision, "runtime"); void refreshState(); }}
        status={<StatusPill inMenu media={media} recording={recordingStatus} presenceHealthy={presenceHealthy && !sessionData.runtime.presenceUncertain} />}
        onMembers={sessionData.capabilities.canManageMembers ? () => setActivePanel(current => current === "members" ? null : "members") : undefined}
        settings={<ClassroomQuickSettings provider={controlsRoomMedia && roomProvider ? roomProvider : mediaProvider} dark={theme !== "light"}
          onTheme={() => setClientTheme(theme === "light" ? "dark" : "light")} onCaptions={() => setActivePanel("captions")} onAdvanced={() => setSettingsOpen(true)} />}
        actions={minimalFunctionActions}
          handQueue={sessionData.capabilities.canManageMembers ? <HandRaiseQueue placement="header" members={classroomMembers} busy={Boolean(actionBusy)} onAction={performAction} onViewMembers={() => setActivePanel("members")} /> : undefined}
        notices={<>{!settingsOpen && <ClassStartReminder role={sessionData.credential.role} status={sessionData.runtime.status} mode={sessionData.runtime.classStartMode} startTime={sessionData.course.startTime} endTime={sessionData.course.endTime} now={now + presenceClockOffset} busy={Boolean(actionBusy)} onStart={() => void performAction({ type: "startClass" })} onSettings={() => { setFocusClassStart(true); setSettingsOpen(true); }} />}</>}
      /> : (<>
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
            <h1 title={sessionData.course.name}>{sessionData.course.name}</h1>
          </div>
        </div>
        <div className="classroom-v3-session-metrics">
          <span>
            <small>
              {hasClassStarted
                ? t("classroom.v3.classDuration")
                : t("classroom.v3.readyRoom")}
            </small>
            <strong>{hasClassStarted ? formatClock(elapsedSeconds) : "—"}</strong>
          </span>
          {timerRemaining !== null && (
            <span className={timerRemaining <= 30 ? "is-urgent" : ""}>
              <small>{t("classroom.v3.timer")}</small>
              <strong>{formatClock(timerRemaining)}</strong>
            </span>
          )}
          {!isRecorder && !classEnded && <div className="classroom-caption-access">
            <button type="button" aria-pressed={captionOverlayVisible && captionDisplayMode !== "off"} onClick={() => { setCaptionOverlayVisible(!captionOverlayVisible || captionDisplayMode === "off"); if (captionDisplayMode === "off") setCaptionDisplayMode("bilingual"); }}>
              {t("captionAppearance.toggle")} · {captionOverlayVisible && captionDisplayMode !== "off" ? t("captionAppearance.on") : t("captionAppearance.off")}
            </button>
            <button type="button" onClick={() => { setSettingsOpen(false); setActivePanel("captions"); window.setTimeout(() => document.querySelector(".classroom-caption-appearance")?.scrollIntoView({ block: "center" }), 150); }}>{t("captionAppearance.settings")}</button>
          </div>}
          {!classEnded && <StatusPill media={media} recording={recordingStatus} presenceHealthy={presenceHealthy && !sessionData.runtime.presenceUncertain} />}

        </div>
        {!isRecorder && !settingsOpen && <ClassStartReminder role={sessionData.credential.role} status={sessionData.runtime.status}
          mode={sessionData.runtime.classStartMode} startTime={sessionData.course.startTime} endTime={sessionData.course.endTime}
          now={now + presenceClockOffset} busy={Boolean(actionBusy)} onStart={() => void performAction({ type: "startClass" })}
          onSettings={() => { setFocusClassStart(true); setSettingsOpen(true); }} />}
        {!isRecorder && <ClassroomClosingNotice sessionId={courseId} notice={classroomClosingNotice({
          scheduledEndTime: sessionData.course.endTime,
          graceEndsAt: sessionData.runtime.graceEndsAt,
          status: sessionData.runtime.status,
          now,
        })} />}
        {!isRecorder && (
          <div className="classroom-v3-top-actions">
            {!classEnded && <nav className="classroom-header-conversation" aria-label={t("classroomWorkspace.conversation")}>
              <button type="button" title={t("classroom.v3.chat")} aria-label={t("classroom.v3.chat")} aria-pressed={activePanel === "chat"} onClick={() => setActivePanel(activePanel === "chat" ? null : "chat")}><MessageCircle /><span>{t("classroom.v3.chat")}</span>{unreadMessages > 0 && <i>{unreadMessages > 99 ? "99+" : unreadMessages}</i>}</button>
              <button type="button" title={t("classroom.v3.captions")} aria-label={t("classroom.v3.captions")} aria-pressed={activePanel === "captions"} onClick={() => setActivePanel(activePanel === "captions" ? null : "captions")}><Headphones /><span>{t("classroom.v3.captions")}</span></button>
            </nav>}
            {sessionData.capabilities.canEndClass && !classEnded && <ClassTimingControls courseId={sessionData.course.id} sessionId={courseId} ended={classEnded}
              onExtended={timing => { updateSession({ course: { ...sessionData.course, endTime: timing.endTime }, runtime: { ...sessionData.runtime, scheduledEndAt: timing.endTime, scheduledStartAt: timing.startTime, revision: timing.revision } }); publishInvalidation(timing.revision, "runtime"); void refreshState(); }} />}

            <span
              className={`classroom-v3-role-context is-${sessionData.credential.role}`}
              title={
                isClassroomTeachingRole(sessionData.credential.role)
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
            {classinLayout && !classEnded && sessionData.modePolicy.showHandRaise && <div className="classroom-v3-hand-raise-header">
              {sessionData.credential.role === "student" && <HandRaiseButton raised={Boolean(currentMember?.handRaisedAt)}
                busy={actionBusy === "raiseHand" || actionBusy === "lowerHand"} onToggle={() => void performAction({ type: currentMember?.handRaisedAt ? "lowerHand" : "raiseHand" })} />}
              {sessionData.capabilities.canManageStage && <HandRaiseQueue members={classroomMembers}
                busy={Boolean(actionBusy)} onAction={performAction} onViewMembers={() => setActivePanel("members")} />}
            </div>}
            {canUseMedia && (
              <>
                {microphoneAllowed && <button
                  type="button"
                  className={`is-header-secondary ${!controlMedia.local.microphoneOn ? "is-device-off" : ""}`}
                  disabled={!microphoneAllowed || (!controlsRoomMedia && sessionData.credential.role === "student" && !studentPublishReady) || mediaBusy.includes("recover")}
                  aria-busy={mediaBusy.includes("microphone")}
                  aria-pressed={actualControlMedia.local.microphoneOn}
                  data-media-status={actualControlMedia.local.microphoneStatus || (actualControlMedia.local.microphoneOn ? "on" : "off")}
                  onClick={() =>
                    void runMediaAction("microphone", (provider) =>
                      provider.toggleMicrophone(),
                    )
                  }
                  title={t("classroom.v3.microphone")}
                >
                  {controlMedia.local.microphoneStatus === "starting" ? <Loader2 className="animate-spin" /> : controlMedia.local.microphoneOn ? <Mic /> : <MicOff />}
                </button>}
                {(controlsRoomMedia ? currentSpaceMember?.cameraAllowed !== false : currentMember?.cameraAllowed !== false) && <button
                  type="button"
                  className={`is-header-secondary ${!controlMedia.local.cameraOn ? "is-device-off" : ""}`}
                  disabled={(!controlsRoomMedia && sessionData.credential.role === "student" && !studentPublishReady) || mediaBusy.includes("camera") || mediaBusy.includes("recover")}
                  aria-busy={mediaBusy.includes("camera")}
                  onClick={() =>
                    void runMediaAction("camera", (provider) =>
                      provider.toggleCamera(),
                    )
                  }
                  title={t("classroom.v3.camera")}
                  aria-pressed={controlMedia.local.cameraOn}
                >
                  {controlMedia.local.cameraOn ? <Video /> : <VideoOff />}
                </button>}
              </>
            )}
            <button
              type="button"
              className="classroom-v3-header-leave"
              disabled={isLeaving}
              aria-busy={isLeaving}
              title={t("classroom.v3.leave")}
              onClick={leaveClassroom}
            >
              <LogOut aria-hidden="true" />
              <span>
                {t(isLeaving ? "classroom.v3.leaving" : "classroom.v3.leave")}
              </span>
            </button>
            {sessionData.capabilities.canStartClass &&
              sessionData.runtime.status === "waiting" && (
                <button
                  type="button"
                  className="is-start"
                  data-class-start-due={classStartLateness(sessionData.course.startTime, now + presenceClockOffset) !== null || undefined}
                  title={t("classroom.v3.startClass")}
                  aria-label={t("classroom.v3.startClass")}
                  disabled={
                    Boolean(actionBusy) ||
                    (controlsRoomMedia && !currentSpaceMember?.microphoneAllowed)
                  }
                  onClick={() => void performAction({ type: "startClass" })}
                >
                  <Radio />
                  <span>{t("classroom.v3.startClass")}</span>
                </button>
              )}
            {sessionData.capabilities.canEndClass &&
              sessionData.runtime.status === "live" && (
                <>
                  <button
                    type="button"
                    className="is-end"
                    title={t("classroom.v3.endClass")}
                    aria-label={t("classroom.v3.endClass")}
                    disabled={Boolean(actionBusy)}
                    onClick={() => {
                      setEndClassConfirming(true);
                    }}
                  >
                    {actionBusy === "endClass" ? <Loader2 /> : <CircleStop />}
                    <span>{t("classroom.v3.endClass")}</span>
                  </button>
                </>
              )}
            {sessionData.capabilities.canControlRecording &&
              sessionData.runtime.status === "live" && (
                <button
                  type="button"
                  className={`is-header-secondary is-header-recording ${["starting", "recording"].includes(recordingStatus || "") ? "is-recording" : ""}`}
                  disabled={
                    Boolean(actionBusy) ||
                    ((!sessionData.recording.enabled || sessionData.runtime.recordingStartMode === "disabled") &&
                      !["starting", "recording"].includes(recordingStatus || "")) ||
                    ["stopping", "processing"].includes(recordingStatus || "")
                  }
                  onClick={onRecordingControl}
                  title={
                    ["starting", "recording"].includes(recordingStatus || "")
                      ? t("classroom.v3.stopRecording")
                      : recordingStatus === "processing" ? t("classroom.v3.recordingProcessing")
                      : sessionData.runtime.recordingStartMode === "disabled"
                        ? t("classroom.v3.noRecording")
                        : sessionData.recording.enabled
                        ? t("classroom.v3.startRecording")
                        : t("classroom.v3.recordingNotConfigured")
                  }
                  aria-pressed={["starting", "recording"].includes(recordingStatus || "")}
                >
                  {["starting", "recording"].includes(recordingStatus || "") ? <CircleStop /> : <Radio />}
                </button>
              )}
            {classEnded && recordingStatus && !isRecorder && (
              <button
                type="button"
                onClick={() => window.open(
                  `/courses/${encodeURIComponent(sessionData.course.id)}/playback?sessionId=${encodeURIComponent(sessionData.course.sessionId)}`,
                  "_blank", "noopener,noreferrer",
                )}
                title={t("studentDashboard.viewPlayback")}
                aria-label={t("studentDashboard.viewPlayback")}
              >
                <Play />
              </button>
            )}
            <button
              type="button"
              className="is-theme-toggle is-header-secondary"
              onClick={() => setClientTheme(theme === "light" ? "dark" : "light")}
              title={t(theme === "light" ? "common.switchToDarkMode" : "common.switchToLightMode")}
              aria-label={t(theme === "light" ? "common.switchToDarkMode" : "common.switchToLightMode")}
            >
              {theme === "light" ? <Moon /> : <Sun />}
            </button>
            <label className="classroom-v3-interface-language" title={t("classroom.v3.interfaceLanguage")}>
              <Globe aria-hidden="true" />
              <select
                aria-label={t("classroom.v3.interfaceLanguage")}
                value={locale}
                onChange={(event) => setLocale(event.target.value as SupportedLocale)}
              >
                {languageOptions.map((language) => (
                  <option key={language.value} value={language.value}>{language.label}</option>
                ))}
              </select>
            </label>
            <ClassroomHeaderMenu actions={[
              ...(!classEnded ? [
                { id: "chat", label: t("classroom.v3.chat"), icon: <MessageCircle />, onSelect: () => setActivePanel("chat") },
                { id: "captions", label: t("classroom.v3.captions"), icon: <Headphones />, onSelect: () => setActivePanel("captions") },
                { id: "overlay", label: `${t("captionAppearance.toggle")} · ${t(captionOverlayVisible && captionDisplayMode !== "off" ? "captionAppearance.on" : "captionAppearance.off")}`, icon: <Type />, onSelect: () => { setCaptionOverlayVisible(!captionOverlayVisible || captionDisplayMode === "off"); if (captionDisplayMode === "off") setCaptionDisplayMode("bilingual"); } },
                { id: "recover", label: t("classroom.v3.resetMedia"), icon: <RefreshCw />, disabled: mediaBusy.includes("recover"), onSelect: () => void runMediaAction("recover", async provider => { await renewClassroomCredentials(); await provider.recoverMedia(true); setSignalingAttempt(attempt => attempt + 1); void refreshMessages(); }) },
              ] : []),
              ...(sessionData.capabilities.canControlRecording && sessionData.runtime.status === "live" ? [{ id: "recording", compactOnly: true,
                label: t(["starting", "recording"].includes(recordingStatus || "") ? "classroom.v3.stopRecording" : "classroom.v3.startRecording"), icon: <Radio />,
                disabled: Boolean(actionBusy) || ["stopping", "processing"].includes(recordingStatus || "") || ((!sessionData.recording.enabled || sessionData.runtime.recordingStartMode === "disabled") && !["starting", "recording"].includes(recordingStatus || "")), onSelect: onRecordingControl }] : []),
              { id: "theme", label: t(theme === "light" ? "common.switchToDarkMode" : "common.switchToLightMode"), icon: theme === "light" ? <Moon /> : <Sun />, onSelect: () => setClientTheme(theme === "light" ? "dark" : "light") },
              { id: "settings", label: t("classroom.v3.deviceSettings"), icon: <Settings2 />, onSelect: () => setSettingsOpen(true), compactOnly: true },
              { id: "leave", label: t("classroom.v3.leave"), icon: <LogOut />, onSelect: leaveClassroom, disabled: isLeaving, compactOnly: true },
            ]} />
            <button
              type="button"
              className="is-header-settings"
              aria-label={t("classroom.v3.deviceSettings")}
              onClick={() => setSettingsOpen(true)}
              title={t("classroom.v3.deviceSettings")}
            >
              <Settings2 />
            </button>
          </div>
        )}
      </header>
      </>)}

      {!classinLayout && liveRail}

      {isRecorder && mediaProvider && recorderCameras.length > 0 && (
        <section className="classroom-v3-recorder-cameras" aria-label={t("classroom.v3.stageSeats")}>
          {recorderCameras.map((participant) => (
            <div className="classroom-v3-recorder-camera" key={participant.id}>
              <MediaSurface participant={participant} provider={mediaProvider} displayName={decorateParticipant(participant).displayName} />
            </div>
          ))}
        </section>
      )}

      <section className="classroom-v3-workspace" data-panel-open={Boolean(activePanel && !studentSharesOpen)} data-conversation-open={conversationOpen}>
        {classinLayout && liveRail}
        {!isRecorder && sessionData.credential.role === "student" && !classEnded && sessionData.mode !== "publicLive" && <StudentActivityOverlay sessionId={courseId} shareAccess={shareAccess} currentUserId={currentUserId} onChanged={revision => publishInvalidation(revision, "activities")} />}
        {!isRecorder && <ConversationResizer open={conversationOpen} />}
        {!isRecorder && <ScreenShareMenu screenSupported={screenShareSupported} onInviteStudents={sessionData.capabilities.canManageMembers && sessionData.modePolicy.studentCanShareWhenOnStage && !classEnded ? () => { setShareMenuOpen(false); setStudentInviteOpen(true); setActivePanel("screens"); } : undefined} open={shareMenuOpen} sharing={controlMedia.local.screenSharing} supported={Boolean((controlsRoomMedia ? roomProvider : mediaProvider)?.supportsSharePortrait?.())} options={{ ...controlMedia.local.screenShareOptions, mode: controlMedia.local.screenShareMode ?? "portrait", corner: controlMedia.local.screenShareCorner ?? "br" }} busy={Boolean(actionBusy)} onClose={closeShareMenu} onStop={stopLocalSharing} onOptionsChange={options => { const provider = controlsRoomMedia ? roomProvider : mediaProvider; void provider?.setScreenShareOptions?.(options).catch(error => setActionError(error instanceof Error ? error.message : t("classroom.v3.mediaActionFailed"))); }} onSelect={options => toggleScreenShare(options)} />}
        <motion.section
          layout
          className="classroom-v3-stage"
          data-board-tools-visible={!isRecorder && !classEnded && drawingSurfaceAvailable && canUseWhiteboard && sessionData.whiteboard.writable}
          ref={stageElementRef}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
        >
          {!isRecorder && !classEnded && sessionData.capabilities.canManageMembers && sessionData.modePolicy.studentCanShareWhenOnStage && (hasStudentShares || studentSharesOpen) && <div className="classroom-stage-share-controls">
            <div className="classroom-stage-share-actions">
              <button type="button" className={studentSharesOpen ? "is-active" : ""} aria-expanded={studentSharesOpen} onClick={() => setStudentSharesOpen(value => !value)}><Users /><span>{t("classroomMultiShare.title")} · {studentShareCount}</span></button>
              <button type="button" aria-expanded={activePanel === "members"} onClick={() => setActivePanel(current => current === "members" ? null : "members")}><Settings2 /><span>{t("classroomMultiShare.stageManagement")}</span></button>
            </div>
            {studentSharesOpen && <div className="classroom-stage-share-popover"><StudentScreenShares inviteInitially={studentInviteOpen} members={classroomMembers} shares={screenLeases || {}} busy={Boolean(actionBusy)} onAction={performAction} onClose={() => setStudentSharesOpen(false)} /></div>}
          </div>}
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
              {!isRecorder && !classEnded && sessionData.capabilities.canManageMembers && sessionData.modePolicy.studentCanShareWhenOnStage && hasStudentShares && <button type="button" aria-expanded={studentSharesOpen} onClick={() => { setStudentSharesOpen(value => !value); }}><MonitorUp /><span>{t("classroomMultiShare.title")} · {studentShareCount}</span></button>}
              {!isRecorder && !classEnded && sessionData.mode !== "publicLive" && <ActivityNotice sessionId={courseId} shareAccess={shareAccess} onOpen={openActivityTools} />}
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
          {isRecorder && !classEnded && sessionData.mode !== "publicLive" && <ActivityStagePresentation sessionId={courseId} shareAccess={shareAccess} recorderToken={isRecorder ? recorderToken : undefined} recordingId={isRecorder ? recordingId : undefined} />}
          {stageExpanded && <button className="classroom-v3-fullscreen-exit" type="button" onClick={toggleFullscreen} title={t("classroom.v3.fullscreen")}><X /></button>}
          <div className="classroom-v3-stage-content">
            <AnimatePresence mode="wait">
              {classEnded ? (
                <motion.div
                  key="ended"
                  className="classroom-v3-stage-empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <span><CircleStop /></span>
                  <h2>{t("classroom.v3.classEnded")}</h2>
                  <p>{t("classroom.v3.playbackHint")}</p>
                  {!isRecorder && sessionData.capabilities.canStartClass && <ClassTimingControls courseId={sessionData.course.id} sessionId={courseId} ended />}

                </motion.div>
              ) : !screenParticipant &&
              useMediaGallery ? (
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
                          showCaption={!isRecorder}
                          member={isRecorder ? undefined : item.member}
                        />
                      </div>
                    ))}
                </motion.div>
              ) : whiteboardStageEnabled ? (
                <motion.div
                  key="whiteboard"
                  className="classroom-v3-stage-layer is-shared-board"
                  initial={{ opacity: 0, scale: 0.985 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.99 }}
                  transition={{ duration: 0.22 }}
                >
                  <FastboardSurface
                    credential={sessionData.whiteboard}
                    identity={clientId}
                    displayName={currentMember?.displayName || user?.displayName || currentUserId}
                    courseware={activeCourseware}
                    insertionAttempt={coursewareAttempt.id === activeCourseware?.id ? coursewareAttempt.attempt : 0}
                    onCoursewareInsertion={handleCoursewareInsertion}
                    recorderMode={isRecorder}
                    onControllerChange={handleWhiteboardControllerChange}
                    onAppChange={setWhiteboardApp}
                    onReadyChange={handleWhiteboardReadyChange}
                    onRetry={() =>
                      updateSession({
                        whiteboard: {
                          enabled: false,
                          provider: "netless",
                          writable: false,
                          error: "whiteboard_pending",
                        },
                      })
                    }
                  />
                  <BoardCompositionLayer
                    videoGallery={videoGalleryActive}
                    items={presentedBoardItems}
                    revision={sessionData.runtime.revision}
                    members={classroomMembers}
                    courseware={sessionData.courseware}
                    participants={media.participants}
                    provider={mediaProvider}
                    canManage={
                      sessionData.capabilities.canManageStage && !isRecorder
                    }
                    isRecorder={isRecorder}
                    currentUserId={currentUserId}
                    onAction={(action) => performAction(action)}
                    onPreview={publishCompositionPreview}
                    hiddenItemIds={hiddenBoardItemIds}
                    onHideLocally={(itemId) =>
                      setHiddenBoardItemIds((current) => {
                        const next = new Set(current);
                        next.add(itemId);
                        return next;
                      })
                    }
                  />
                </motion.div>
              ) : !screenParticipant && stageParticipant ? (
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
                    provider={
                      screenParticipant
                        ? screenParticipantProvider || mediaProvider
                        : mediaProvider
                    }
                    displayName={stageParticipant.displayName}
                    showCaption={!isRecorder}
                    member={isRecorder ? undefined : stageParticipant.member}
                  />
                </motion.div>
              ) : !screenParticipant ? (
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
              ) : null}
            </AnimatePresence>
            {!classEnded && selectedScreenClaim && !screenParticipant && <div className="classroom-v3-stage-layer" role="status"><div className="classroom-v3-stage-empty"><Loader2 className="animate-spin" /><p>{t("classroomMultiShare.connecting")}</p></div></div>}
            <AnimatePresence initial={false}>
              {!classEnded && screenParticipant ? (
                <motion.div
                  key={`screen-${screenParticipant.participant.id}`}
                  className="classroom-v3-stage-layer is-screen-share"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                >
                  {hideLocalScreenSharePreview ? (
                    <div
                      className="classroom-v3-local-share-status"
                      role="status"
                      aria-live="polite"
                    >
                      <span><MonitorUp /></span>
                      <strong>{t("classroom.v3.localScreenSharing")}</strong>
                    </div>
                  ) : (
                    <MediaSurface
                      participant={screenParticipant.participant}
                      provider={screenParticipantProvider || mediaProvider}
                      displayName={screenParticipant.displayName}
                      showCaption={!isRecorder}
                    />
                  )}
                  {!hideLocalScreenSharePreview && (
                    <ScreenShareAnnotations
                      app={whiteboardApp}
                      screenId={`${activeScreenShare?.source}-${screenParticipant.participant.id}`}
                      writable={sessionData.whiteboard.writable && canUseWhiteboard}
                      onControllerChange={setScreenAnnotationController}
                    />
                  )}
                </motion.div>
              ) : null}
            </AnimatePresence>
            {!classEnded && <AuxiliaryCameraFeeds feeds={auxiliaryFeeds} recorder={isRecorder} onPlace={(feed) => {
              void performAction({ type: "placeBoardItem", item: { id: `auxiliary-camera:${feed.ownerId}`, kind: "auxiliary-camera", sourceId: feed.ownerId, rtcUid: Number(feed.participant.id),
                rect: defaultBoardRect("auxiliary-camera"), locked: false, visible: true } });
            }} />}
            {showTeacherPictureInPicture ? (
              <motion.div
                className="classroom-v3-teacher-pip"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.18 }}
              >
                {teacherParticipant ? (
                  <MediaSurface
                    participant={teacherParticipant.participant}
                    provider={mediaProvider}
                    displayName={teacherParticipant.displayName}
                    showCaption={!isRecorder}
                  />
                ) : (
                  <div className="classroom-v3-teacher-pip-unavailable">
                    <span>{initialOf(leadTeacher?.displayName || t("classroom.v3.teacher"))}</span>
                    <div>
                      <strong>{leadTeacher?.displayName || t("classroom.v3.teacher")}</strong>
                      <small>{t("classroom.v3.cameraOff")}</small>
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  className="classroom-v3-teacher-pip-hide"
                  onClick={() => setTeacherPiPHidden(true)}
                  title={t("classroom.v3.hideTeacherCamera")}
                  aria-label={t("classroom.v3.hideTeacherCamera")}
                >
                  <EyeOff />
                </button>
              </motion.div>
            ) : null}
            {canShowTeacherPictureInPicture && teacherPiPHidden ? (
              <button
                type="button"
                className="classroom-v3-teacher-pip-restore"
                onClick={() => setTeacherPiPHidden(false)}
                title={t("classroom.v3.showTeacherCamera")}
                aria-label={t("classroom.v3.showTeacherCamera")}
              >
                <Eye />
              </button>
            ) : null}
            {!isRecorder &&
              !classEnded &&
              captionOverlayVisible &&
              captionDisplayMode !== "off" &&
              sessionData.runtime.interpretation.enabled &&
              liveCaptions.length > 0 ? (
                <LiveCaptionOverlay captions={liveCaptions} language={effectiveCaptionLanguage} mode={captionDisplayMode}
                  background={captionBackgroundMode} color={captionBackgroundColor} />
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
            {!classEnded &&
            !isRecorder &&
            sessionData.engagement.activeBuzz &&
            (sessionData.engagement.activeBuzz.status === "active" ||
              sessionData.engagement.activeBuzz.winnerUserId) ? (
              <motion.section
                className={`classroom-v3-stage-engagement is-buzz ${sessionData.engagement.activeBuzz.status === "active" ? "is-live" : "is-result"}`}
                initial={{ opacity: 0, y: -10, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                aria-live="polite"
              >
                <span><Zap /></span>
                <div>
                  <small>
                    {sessionData.engagement.activeBuzz.winnerUserId
                      ? t("classroom.v3.buzzWinner")
                      : t("classroom.v3.buzzOpen")}
                  </small>
                  <strong>
                    {sessionData.engagement.activeBuzz.winnerName ||
                      t("classroom.v3.buzzNow")}
                  </strong>
                </div>
                {sessionData.capabilities.canParticipateInEngagement &&
                sessionData.engagement.activeBuzz.status === "active" &&
                !sessionData.engagement.activeBuzz.winnerUserId ? (
                  <button
                    type="button"
                    disabled={Boolean(actionBusy)}
                    onClick={() => void performAction({ type: "submitBuzz" })}
                  >
                    {t("classroom.v3.buzzNow")}
                  </button>
                ) : (
                  <button type="button" onClick={() => setActivePanel("engagement")}>
                    {t("classroom.v3.viewInteraction")}
                  </button>
                )}
              </motion.section>
            ) : !isRecorder && sessionData.engagement.selector?.selectedUserName ? (
              <motion.button
                type="button"
                className="classroom-v3-stage-engagement is-selector"
                initial={{ opacity: 0, y: -10, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                onClick={() => setActivePanel("engagement")}
              >
                <span><Dices /></span>
                <div>
                  <small>{t("classroom.v3.selectedStudent")}</small>
                  <strong>{sessionData.engagement.selector.selectedUserName}</strong>
                </div>
              </motion.button>
            ) : null}
            <AnimatePresence>
              {!classEnded &&
              timerRemaining !== null &&
              (isRecorder || timerOverlayVisible) &&
              sessionData.runtime.timerDurationSec ? (
                <StageTimerOverlay
                  durationSec={sessionData.runtime.timerDurationSec}
                  remainingSec={timerRemaining}
                  paused={Boolean(sessionData.runtime.timerPausedAt)}
                  canManage={sessionData.capabilities.canManageStage && !isRecorder}
                  busy={Boolean(actionBusy)}
                  onDismiss={isRecorder ? undefined : () => setTimerOverlayVisible(false)}
                  onTogglePaused={() =>
                    void performAction({
                      type: sessionData.runtime.timerPausedAt
                        ? "resumeTimer"
                        : "pauseTimer",
                    })
                  }
                  onReset={() => void performAction({ type: "resetTimer" })}
                />
              ) : null}
            </AnimatePresence>
            {!isRecorder &&
            !classEnded &&
            !timerOverlayVisible &&
            timerRemaining !== null ? (
              <button
                type="button"
                className="classroom-v3-timer-restore"
                onClick={() => setTimerOverlayVisible(true)}
                title={t("classroom.v3.showTimer")}
                aria-label={t("classroom.v3.showTimer")}
              >
                <Clock3 />
                <span>{formatClock(timerRemaining)}</span>
              </button>
            ) : null}
          </div>
          {!isRecorder && !classEnded && <TeacherAssistant
            key={assistantConversationKey(sessionData.course.sessionId, currentUserId)}
            sessionId={sessionData.course.sessionId}
            teacher={classroomAssistantTeacher(sessionData.course, classroomMembers)}
            shareAccess={shareAccess}
            minimal={classinLayout} visible={assistantVisible} onClose={() => setAssistantVisible(false)}
          />}
          {recordingFallback === "web" && (
            <div className="classroom-v3-stage-warning">
              <AlertCircle />
              {t("classroom.v3.webRecordingFallback")}
            </div>
          )}
        </motion.section>

        <section
          className={`classroom-v3-side ${activePanel ? "is-open" : ""}`}
          data-board-writable={drawingSurfaceAvailable && canUseWhiteboard && sessionData.whiteboard.writable}
          data-panel-open={Boolean(activePanel)}
          onPointerEnter={wakeToolRail}
          onFocusCapture={wakeToolRail}
        >
          {!isRecorder && !classEnded && (
            <DrawerNavigation
              active={activePanel}
              onChange={setActivePanel}
              visiblePanels={visibleDrawerPanels}
              whiteboardActive={showWhiteboard}
              screenAnnotationActive={Boolean(screenParticipant)}
              canDraw={drawingSurfaceAvailable && canUseWhiteboard && sessionData.whiteboard.writable}
              canShareScreen={isScreenShareAllowed && (screenShareSupported || controlMedia.local.screenSharing)}
              screenSharing={controlMedia.local.screenSharing}
              screenShareBusy={screenShareBusy}
              onOpenWhiteboard={openWhiteboard}
              onToggleScreenShare={() =>
                controlMedia.local.screenSharing ? stopLocalSharing() : screenShareSupported
                  ? toggleScreenShare()
                  : setActionError(t("classroom.v3.screenShareBrowserUnsupported"))
              }
              whiteboardController={drawingController}
              whiteboardTool={whiteboardTool}
              onWhiteboardToolChange={setWhiteboardTool}
              railLevel={mobileControls && canUseWhiteboard ? "expanded" : toolRailLevel}
              onInteract={wakeToolRail}
              canManageStage={
                sessionData.capabilities.canManageStage && !isRecorder
              }
              onClassroomAction={(action) => void performAction(action)}
              counts={{
                members: classroomMembers.filter((member) => member.online).length,
                rooms: sessionData.spaces.filter((space) => space.status === "open").length,
                questions: sessionData.questions.filter((question) => question.status === "open").length,
                chat: unreadMessages,
                hands: classroomMembers.filter((member) => member.handRaisedAt).length,
              }}
            />
          )}
        </section>
        <AnimatePresence initial={false}>
            {activePanel && !studentSharesOpen && (
              <motion.aside
                key={conversationOpen ? "conversation" : activePanel}
                className="classroom-v3-drawer"
                aria-label={conversationOpen ? t("classroomWorkspace.conversation") : undefined}
                data-conversation={conversationOpen}
                data-panel={activePanel}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 18 }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              >
                {conversationOpen && !isRecorder && <ConversationPanelTabs active={activePanel as "chat" | "captions"} unread={unreadMessages} onChange={setActivePanel} onClose={() => setActivePanel(null)} />}
                {!isRecorder && !conversationOpen && !studentSharesOpen && (
                  <button
                    type="button"
                    className="classroom-v3-drawer-close"
                    onClick={() => { setStudentSharesOpen(false); }}
                    title={t("classroom.v3.collapsePanel")}
                  >
                    <PanelRightClose />
                  </button>
                )}
                {activePanel === "members" && sessionData.capabilities.canManageMembers && (
                  <MemberPanel
                    members={classroomMembers}
                    presenceHealthy={presenceHealthy && !sessionData.runtime.presenceUncertain}
                    screenLease={sessionData.runtime.composition.screenShares?.main}
                    screenParticipants={media.participants}
                    canManage={sessionData.capabilities.canManageMembers}
                    canRequestScreenShare={sessionData.modePolicy.studentCanShareWhenOnStage}
                    busy={actionBusy}
                    onAction={(action) => void performAction(action)}
                  />
                )}
                {activePanel === "rooms" && (
                  <BreakoutPanel
                    spaces={sessionData.spaces}
                    members={classroomMembers}
                    role={sessionData.credential.role}
                    activeSpaceId={activeSpaceId}
                    roomMedia={roomMedia}
                    roomProvider={roomProvider}
                    busy={spaceBusy}
                    error={actionError}
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
                    onDisconnect={() => void disconnectRoom()}
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
                {conversationOpen && <section id="conversation-chat" role="tabpanel" aria-labelledby="conversation-tab-chat" hidden={activePanel !== "chat"} className="classroom-conversation-content">
                  <TestChatPanel visible={activePanel === "chat"}
                    sessionId={courseId} translationLanguage={effectiveCaptionLanguage} shareAccess={shareAccess}
                    students={sessionData.runtime.members.filter(member => member.role === "student")}
                    messages={[...sessionData.messages, ...pendingMessages]}
                    currentUserId={currentUserId}
                    role={sessionData.credential.role}
                    spaces={sessionData.spaces}
                    activeSpaceId={activeSpaceId}
                    canManage={sessionData.capabilities.canManageChat}
                    disabled={chatDisabled}
                    onSend={sendMessage}
                    onDelete={deleteMessage}
                    onDeleteMember={senderId=>deleteMessage("",senderId)}
                    onMuteMember={(targetUserId, muted)=>{void performAction({type:"setMemberMuted",targetUserId,muted})}}
                    busy={Boolean(actionBusy)}
                    createActivityRequest={activityCreateRequest} onActivityChanged={revision => publishInvalidation(revision, "activities")}
                    onMuteAll={(muted) => void performAction({ type: "muteAll", muted })}
                  />
                </section>}
                {conversationOpen && <section id="conversation-captions" role="tabpanel" aria-labelledby="conversation-tab-captions" hidden={activePanel !== "captions"} className="classroom-conversation-content">
                  <CaptionsPanel
                    preferenceBusy={captionSubscription.busy}
                    preferenceError={captionSubscription.error}
                    onRetryPreference={() => {
                      const intent = captionSubscription.lastIntent.current || { language: effectiveCaptionLanguage, mode: captionDisplayMode };
                      void captionSubscription.save(intent.language, intent.mode).then(saved => { if (saved) { setCaptionLanguage(intent.language); setCaptionDisplayMode(intent.mode); } });
                    }}
                    busy={actionBusy === "setInterpretation"}
                    runtime={sessionData.runtime}
                    captions={sessionData.captions}
                    availability={sessionData.interpretationAvailability}
                    canManage={
                      sessionData.capabilities.canManageInterpretation && !isRecorder
                    }
                    displayMode={captionDisplayMode}
                    overlayVisible={captionOverlayVisible}
                    preferredLanguage={effectiveCaptionLanguage}
                    backgroundMode={captionBackgroundMode} backgroundColor={captionBackgroundColor}
                    onBackgroundModeChange={setCaptionBackgroundMode} onBackgroundColorChange={setCaptionBackgroundColor}
                    onRecoverTranslation={isClassroomTeachingRole(sessionData.credential.role) && !classEnded ? async captionId => {
                      const response = await fetch(`/api/sessions/${encodeURIComponent(courseId)}/classroom/captions`, {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "recoverTranslation", captionId, ...(shareAccess && { shareAccess }) }),
                      });
                      if (!response.ok) return false;
                      const result = await response.json() as { caption?: ClassroomCaptionSnapshot; revision?: number };
                      if (!result.caption) return false;
                      updateSession({ captions: [result.caption] });
                      if (result.revision !== undefined) publishInvalidation(result.revision, "captions");
                      return result.caption.translationStatus === "completed";
                    } : undefined}
                    onApplySettings={async settings => {
                      setCaptionOverlayVisible(settings.overlayVisible);
                      if (settings.interpretation && !await performAction(settings.interpretation)) return false;
                      if (!await captionSubscription.save(settings.preferredLanguage, settings.displayMode, true, settings.interpretation?.sourceLanguage)) return false;
                      setCaptionLanguage(settings.preferredLanguage);
                      setCaptionDisplayMode(settings.displayMode);
                      try { localStorage.setItem(`classroom_caption_choice:${sessionData.credential.userId}:${sessionData.course.sessionId}`, JSON.stringify(settings)); } catch { /* Current tab retains its choice. */ }
                      return true;
                    }}
                  />
                </section>}
                {activePanel === "courseware" && (
                  <CoursewarePanel
                    shareAccess={shareAccess}
                    uploadScope={!shareAccess && isClassroomTeachingRole(sessionData.credential.role) ? { courseId: sessionData.course.id, sessionId: sessionData.course.sessionId } : undefined}
                    onUploaded={async () => {
                      publishInvalidation(sessionRef.current?.runtime.revision || 0, "courseware");
                      await refreshSection("courseware");
                    }}
                    items={sessionData.courseware}
                    canManage={sessionData.capabilities.canManageWhiteboard}
                    busy={actionBusy}
                    insertion={coursewareInsertion}
                    boardAvailable={sessionData.whiteboard.enabled}
                    onUpdate={updateCourseware}
                    onOpen={async (courseware) => {
                      const ok = await performAction({ type: "setStage", mode: "whiteboard", locked: false, coursewareId: courseware.id });
                      if (!ok) throw new Error(t("classroom.v3.addToWhiteboardFailed"));
                      setCoursewareAttempt(old => ({ id: courseware.id, attempt: old.attempt + 1 }));
                    }}
                  />
                )}
                {activePanel === "activities" && !isRecorder && <ActivityWorkspace sessionId={courseId} shareAccess={shareAccess} onChanged={(revision) => publishInvalidation(revision, "activities")} />}
                {activePanel === "engagement" && (
                  <EngagementPanel
                    engagement={sessionData.engagement}
                    members={classroomMembers}
                    currentUserId={currentUserId}
                    canGiveReward={sessionData.capabilities.canGiveReward}
                    canRun={sessionData.capabilities.canRunEngagement}
                    canParticipate={sessionData.capabilities.canParticipateInEngagement}
                    busy={Boolean(actionBusy)}
                    onAction={(action) => void performAction(action)}
                  />
                )}
                {activePanel === "tools" && (
                  <ToolsPanel
                    runtime={sessionData.runtime}
                    canManage={sessionData.capabilities.canManageStage}
                    busy={Boolean(actionBusy)}
                    onAction={(action) => {
                      void performAction(action).then((succeeded) => {
                        if (succeeded && action.type === "startTimer") {
                          setTimerOverlayVisible(true);
                        }
                      });
                    }}
                    onFullscreen={toggleFullscreen}
                    onSettings={() => setSettingsOpen(true)}
                    whiteboardController={whiteboardController}
                  />
                )}
              </motion.aside>
            )}
        </AnimatePresence>
      </section>

      <AnimatePresence>
        {overtimeLeaveConfirming && !isRecorder && <div className="classroom-v3-modal-backdrop"
          onKeyDown={event => { if (event.key === "Escape" && !overtimeLeaveBusyRef.current) setOvertimeLeaveConfirming(false); }}>
          <section ref={endClassDialogRef} className="classroom-v3-confirm-dialog" role="alertdialog" aria-modal="true"
            aria-labelledby="overtime-leave-title" aria-describedby="overtime-leave-description">
            <div className="classroom-v3-confirm-icon"><LogOut /></div>
            <div className="classroom-v3-confirm-copy">
              <h2 id="overtime-leave-title">{t("classroom.v3.overtimeLeaveTitle")}</h2>
              <p id="overtime-leave-description">{t("classroom.v3.overtimeLeaveDescription")}</p>
            </div>
            {actionError && <p role="alert" className="classroom-v3-confirm-error">{actionError}</p>}
            <footer>
              <button type="button" disabled={actionBusy === "overtimeLeave"} onClick={() => setOvertimeLeaveConfirming(false)}>{t("common.cancel")}</button>
              <button type="button" disabled={actionBusy === "overtimeLeave"} onClick={leaveTemporarily}><LogOut />{t("classroom.v3.leaveTemporarily")}</button>
              <button type="button" className="is-danger" disabled={actionBusy === "overtimeLeave"} onClick={() => void finishOvertimeAndLeave()}>
                {actionBusy === "overtimeLeave" ? <Loader2 className="animate-spin" /> : <CircleStop />}{t("classroom.v3.overtimeLeaveFinish")}
              </button>
            </footer>
          </section>
        </div>}
        {endClassConfirming && !isRecorder && <div className="classroom-v3-modal-backdrop" onKeyDown={(event) => { if (event.key === "Escape" && actionBusy !== "endClass") setEndClassConfirming(false); }}><section ref={endClassDialogRef} className="classroom-v3-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="end-class-title" aria-describedby="end-class-description"><div className="classroom-v3-confirm-icon"><CircleStop /></div><div className="classroom-v3-confirm-copy"><h2 id="end-class-title">{t("classroom.v3.endClass")}</h2><p id="end-class-description">{t("classroom.v3.endClassDescription")}</p></div>{actionError && <p role="alert" className="classroom-v3-confirm-error">{actionError}</p>}<footer><button type="button" disabled={actionBusy === "endClass"} onClick={() => setEndClassConfirming(false)}>{t("common.cancel")}</button><button type="button" disabled={actionBusy === "endClass"} onClick={leaveTemporarily}><LogOut />{t("classroom.v3.leaveTemporarily")}</button><button type="button" className="is-danger" disabled={actionBusy === "endClass"} onClick={() => void endClass()}>{actionBusy === "endClass" ? <Loader2 className="animate-spin" /> : <CircleStop />}{t("classroom.v3.endClass")}</button></footer></section></div>}
        {recordingStopConfirming && !isRecorder && (
          <motion.div
            className="classroom-v3-modal-backdrop is-board-confirm"
            initial={prefersReducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.16 }}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setRecordingStopConfirming(false);
              }
            }}
          >
            <motion.section
              className="classroom-v3-confirm-dialog"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="recording-stop-dialog-title"
              aria-describedby="recording-stop-dialog-description"
              initial={
                prefersReducedMotion
                  ? false
                  : { opacity: 0, y: 10, scale: 0.985 }
              }
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={
                prefersReducedMotion
                  ? undefined
                  : { opacity: 0, y: 8, scale: 0.985 }
              }
              transition={{
                duration: prefersReducedMotion ? 0 : 0.18,
                ease: [0.22, 1, 0.36, 1],
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setRecordingStopConfirming(false);
                }
              }}
            >
              <div className="classroom-v3-confirm-icon" aria-hidden="true">
                <CircleStop />
              </div>
              <div className="classroom-v3-confirm-copy">
                <h2 id="recording-stop-dialog-title">
                  {t("classroom.v3.stopRecording")}
                </h2>
                <p id="recording-stop-dialog-description">
                  {t("common.pleaseConfirm")}
                </p>
              </div>
              {actionError && (
                <p className="classroom-v3-confirm-error" role="alert">
                  <AlertCircle aria-hidden="true" />
                  {actionError}
                </p>
              )}
              <footer>
                <button
                  ref={recordingStopCancelRef}
                  type="button"
                  className="is-secondary"
                  onClick={() => setRecordingStopConfirming(false)}
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  className="is-danger"
                  disabled={actionBusy === "recording"}
                  onClick={() => void controlRecording("stop")}
                >
                  {actionBusy === "recording" ? <Loader2 /> : <CircleStop />}
                  {t("classroom.v3.stopRecording")}
                </button>
              </footer>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>

      {deviceReport && !isRecorder && <div role="status" className="classroom-v3-device-ack-status">
        <span>{t(now - deviceReport.at > 30_000 && !deviceReport.received ? "classroom.v3.deviceReportsUnavailable" : "classroom.v3.deviceReports", { received: deviceReport.received, failed: deviceReport.failed, unknown: deviceReport.unknown })}</span>
        <button type="button" aria-label={t("common.close")} onClick={() => { deviceTrackerRef.current.clear(); setDeviceReport(null); }}><X aria-hidden="true" /></button>
      </div>}
      {actionError && !isRecorder && (
        <motion.div
          className="classroom-v3-action-error"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <AlertCircle />
          <span>{actionError}</span>
          {publishingBlocked&&!publishingPreparing&&<ClassroomIconButton type="button" title={t("classroomRoster.retrySharePreparation")} onClick={()=>{setPublishingError(null);setActionError("");}}><RefreshCw/></ClassroomIconButton>}
          <button type="button" onClick={() => setActionError("")}>
            <X />
          </button>
        </motion.div>
      )}

      {!isRecorder && !classEnded && (
        <footer className="classroom-v3-dock-wrap">
          {dockMoreOpen && !classinLayout && <div className="classroom-v3-dock-overflow" role="menu">
            {canUseAuxiliaryCamera && <button type="button" role="menuitem" onClick={() => { setSettingsOpen(true); setDockMoreOpen(false); }}><Video />{t("classroom.v3.auxiliaryCamera")}</button>}
            {sessionData.capabilities.canControlRecording && <DesktopRecordingControl menuItem sessionId={courseId} title={sessionData.course.name} onError={setActionError} />}
            {isScreenShareAllowed && (screenShareSupported || controlMedia.local.screenSharing) && <button type="button" role="menuitem" onClick={() => { void toggleScreenShare(); setDockMoreOpen(false); }}><MonitorUp />{controlMedia.local.screenSharing ? t("classroomSharing.title") : t("classroom.v3.screenShare")}</button>}
            {canUseWhiteboard && <button type="button" role="menuitem" onClick={() => { openWhiteboard(); setDockMoreOpen(false); }}><PenTool />{t("classroom.v3.whiteboard")}</button>}
            {sessionData.capabilities.canManageMembers && <button type="button" role="menuitem" onClick={() => { setActivePanel("members"); setDockMoreOpen(false); }}><Users />{t("classroom.v3.members")}</button>}
            <button type="button" role="menuitem" onClick={() => { setActivePanel("courseware"); setDockMoreOpen(false); }}><BookOpen />{t("classroom.v3.courseware")}</button>
            <button type="button" role="menuitem" onClick={() => { setActivePanel("captions"); setDockMoreOpen(false); }}><Headphones aria-hidden="true" />{t("classroom.v3.captions")}</button>
            {(sessionData.capabilities.canRunEngagement || sessionData.capabilities.canParticipateInEngagement) && <button type="button" role="menuitem" onClick={() => { setActivePanel("engagement"); setDockMoreOpen(false); }}><Trophy />{t("classroom.v3.engagement")}</button>}
            <button type="button" role="menuitem" onClick={() => { setActivePanel("tools"); setDockMoreOpen(false); }}><LayoutGrid />{t("classroom.v3.classroomTools")}</button>
            <button type="button" role="menuitem" onClick={() => { setSettingsOpen(true); setDockMoreOpen(false); }}><Globe aria-hidden="true" />{t("classroom.v3.interfaceLanguage")}</button>
            <button type="button" role="menuitem" aria-busy={mediaBusy.includes("recover")} onClick={() => void runMediaAction("recover", async (provider) => { await renewClassroomCredentials(); await provider.recoverMedia(true); })}>{mediaBusy.includes("recover") ? <Loader2 className="animate-spin" /> : <RefreshCw />}{t("classroom.v3.resetMedia")}</button>
            <button type="button" role="menuitem" onClick={leaveClassroom}><LogOut />{t("classroom.v3.leave")}</button>
          </div>}
          <div className="classroom-v3-dock" data-more-open={dockMoreOpen}>
            {canUseMedia && (
              <>
                {microphoneAllowed && <button
                  type="button"
                  disabled={!microphoneAllowed || (!controlsRoomMedia && sessionData.credential.role === "student" && !studentPublishReady) || mediaBusy.includes("microphone") || mediaBusy.includes("recover")}
                  aria-busy={mediaBusy.includes("microphone")}
                  aria-pressed={actualControlMedia.local.microphoneOn}
                  data-media-status={actualControlMedia.local.microphoneStatus || (actualControlMedia.local.microphoneOn ? "on" : "off")}
                  className={!controlMedia.local.microphoneOn ? "is-off" : ""}
                  onClick={() =>
                    void runMediaAction("microphone", (provider) =>
                      provider.toggleMicrophone(),
                    )
                  }
                  data-dock-action="microphone" title={t("classroom.v3.microphone")}
                >
                  {mediaBusy.includes("microphone") ? <Loader2 className="animate-spin" /> : controlMedia.local.microphoneOn ? <Mic /> : <MicOff />}
                  <span>{t("classroom.v3.microphone")}</span>
                </button>}
                {(controlsRoomMedia ? currentSpaceMember?.cameraAllowed !== false : currentMember?.cameraAllowed !== false) && <button
                  type="button"
                  disabled={(!controlsRoomMedia && sessionData.credential.role === "student" && !studentPublishReady) || mediaBusy.includes("camera") || mediaBusy.includes("recover")}
                  aria-busy={mediaBusy.includes("camera")}
                  className={!controlMedia.local.cameraOn ? "is-off" : ""}
                  onClick={() =>
                    void runMediaAction("camera", (provider) =>
                      provider.toggleCamera(),
                    )
                  }
                  data-dock-action="camera" aria-pressed={actualControlMedia.local.cameraOn} aria-label={t(controlMedia.local.cameraOn ? "classroom.v3.closeMyCamera" : "classroom.v3.openMyCamera")} title={t(controlMedia.local.cameraOn ? "classroom.v3.closeMyCamera" : "classroom.v3.openMyCamera")}
                >
                  {controlMedia.local.cameraOn ? <Video /> : <VideoOff />}
                  <span>{t("classroom.v3.camera")}</span>
                </button>}
              </>
            )}
            {sessionData.credential.role === "student" &&
              sessionData.modePolicy.showHandRaise && (
              <HandRaiseButton raised={Boolean(currentMember?.handRaisedAt)} busy={actionBusy === "raiseHand" || actionBusy === "lowerHand"}
                onToggle={() => void performAction({ type: currentMember?.handRaisedAt ? "lowerHand" : "raiseHand" })} />
            )}
            {sessionData.capabilities.canManageStage && sessionData.modePolicy.showHandRaise && <HandRaiseQueue
              members={classroomMembers} busy={Boolean(actionBusy)} onAction={performAction}
              onViewMembers={() => setActivePanel("members")} />}
            {((isScreenShareAllowed && (screenShareSupported || controlMedia.local.screenSharing)) || (sessionData.capabilities.canManageMembers && sessionData.modePolicy.studentCanShareWhenOnStage)) && (
              <button type="button" disabled={screenShareBusy} aria-busy={screenShareBusy}
                data-dock-action={controlMedia.local.screenSharing ? "stop-share" : "share"}
                className={controlMedia.local.screenSharing ? "is-stop-sharing" : "is-dock-secondary"}
                onClick={() => controlMedia.local.screenSharing ? stopLocalSharing()
                  : screenShareSupported || sessionData.capabilities.canManageMembers ? toggleScreenShare()
                  : setActionError(t("classroom.v3.screenShareBrowserUnsupported"))}
                aria-label={t(controlMedia.local.screenSharing ? "classroom.v3.stopSharing" : "classroom.v3.screenShare")}
                title={controlMedia.local.screenSharing ? undefined : t("classroom.v3.screenShare")}>
                {screenShareBusy ? <Loader2 className="animate-spin" /> : controlMedia.local.screenSharing ? <ScreenShareOff /> : <MonitorUp />}
                <span>{t(controlMedia.local.screenSharing ? "classroom.v3.stopSharing" : "classroom.v3.screenShare")}</span>
              </button>
            )}
            {classinLayout && canUseWhiteboard ? <BoardToolsMenu screenAnnotation={Boolean(screenParticipant)} controller={screenParticipant ? screenAnnotationController : whiteboardController} tool={whiteboardTool} onTool={setWhiteboardTool} onOpen={() => { if (!screenParticipant && !whiteboardReady) openWhiteboard(); }} /> : (canUseWhiteboard && <button
              type="button"
              data-dock-action="whiteboard" title={t("classroomMinimal.tools")} className={`is-dock-secondary ${sessionData.runtime.stageMode === "whiteboard" ? "is-active" : ""}`}
              onClick={openWhiteboard}
            >
              <PenTool />
              <span>{t("classroom.v3.whiteboard")}</span>
            </button>)}
            <button className="is-dock-secondary" type="button" onClick={() => setActivePanel("courseware")}>
              <BookOpen />
              <span>{t("classroom.v3.courseware")}</span>
            </button>
            <button type="button" data-dock-action="chat" aria-pressed={activePanel === "chat"} title={t("classroom.v3.chat")} aria-label={t("classroom.v3.chat") + (unreadMessages ? ` (${unreadMessages})` : "")} className={activePanel === "chat" ? "is-active" : ""} onClick={() => setActivePanel(current => current === "chat" ? null : "chat")}><MessageCircle />{unreadMessages > 0 && <i className="classroom-dock-unread" aria-hidden="true">{unreadMessages > 99 ? "99+" : unreadMessages}</i>}<span>{t("classroom.v3.chat")}{unreadMessages > 0 ? ` (${unreadMessages})` : ""}</span></button>
            <button
              type="button"
              className={`is-dock-secondary ${activePanel === "captions" ? "is-active" : ""}`}
              aria-pressed={activePanel === "captions"}
              onClick={() => setActivePanel(current => current === "captions" ? null : "captions")}
              data-dock-action="captions" title={t("classroom.v3.captions")}
            >
              <Headphones aria-hidden="true" />
              <span>{t("classroom.v3.captions")}</span>
            </button>
            {(sessionData.capabilities.canRunEngagement ||
              sessionData.capabilities.canParticipateInEngagement) && (
              <button
                type="button"
                className={`is-dock-secondary ${activePanel === "engagement" ? "is-active" : ""}`}
                onClick={() => setActivePanel("engagement")}
              >
                <Zap />
                <span>{t("classroom.v3.engagement")}</span>
              </button>
            )}
            <button className="is-dock-secondary" type="button" onClick={() => setActivePanel("tools")}>
              <LayoutGrid />
              <span>{t("classroom.v3.classroomTools")}</span>
            </button>
            {sessionData.capabilities.canControlRecording &&
              sessionData.runtime.status === "live" && (
                <button
                  type="button"
                  className={
                    ["starting", "recording"].includes(recordingStatus || "")
                      ? "is-recording"
                      : ""
                  }
                  disabled={
                    Boolean(actionBusy) ||
                    ((!sessionData.recording.enabled || sessionData.runtime.recordingStartMode === "disabled") &&
                      !["starting", "recording"].includes(recordingStatus || "")) ||
                    ["stopping", "processing"].includes(recordingStatus || "")
                  }
                  onClick={onRecordingControl}
                  title={
                    ["starting", "recording"].includes(recordingStatus || "")
                      ? t("classroom.v3.stopRecording")
                      : recordingStatus === "processing" ? t("classroom.v3.recordingProcessing")
                      : sessionData.runtime.recordingStartMode === "disabled"
                        ? t("classroom.v3.noRecording")
                        : sessionData.recording.enabled
                        ? t("classroom.v3.startRecording")
                        : t("classroom.v3.recordingNotConfigured")
                  }
                  aria-pressed={["starting", "recording"].includes(recordingStatus || "")}
                >
                  {["starting", "recording"].includes(recordingStatus || "") ? <CircleStop /> : <Radio />}
                  <span>
                    {recordingStatus === "starting"
                      ? t("classroom.v3.stopRecording")
                      : recordingStatus === "stopping"
                        ? t("classroom.v3.recordingStopping")
                      : recordingStatus === "processing" ? t("classroom.v3.recordingProcessing")
                      : recordingStatus === "recording"
                            ? t("classroom.v3.stopRecording")
                            : t("classroom.v3.startRecording")}
                  </span>
                </button>
              )}
            {canUseAuxiliaryCamera && <button type="button" className="is-dock-secondary" aria-pressed={Boolean(controlMedia.local.auxiliaryCameraOn)}
              onClick={() => { if (controlMedia.local.auxiliaryCameraOn || controlMedia.local.auxiliaryCameraStarting) void runMediaAction("auxiliary-camera", (provider) => provider.stopAuxiliaryCamera()); else setSettingsOpen(true); }}
              title={t("classroom.v3.auxiliaryCamera")}><Video /><span>{t("classroom.v3.auxiliaryCamera")}</span></button>}
            {sessionData.capabilities.canControlRecording && <DesktopRecordingControl sessionId={courseId} title={sessionData.course.name} onError={setActionError} />}
            {classEnded && recordingStatus && !isRecorder && (
              <button
                type="button"
                onClick={() => window.open(
                  `/courses/${encodeURIComponent(sessionData.course.id)}/playback?sessionId=${encodeURIComponent(sessionData.course.sessionId)}`,
                  "_blank", "noopener,noreferrer",
                )}
              >
                <Play />
                <span>{t("studentDashboard.viewPlayback")}</span>
              </button>
            )}
            <button type="button" data-dock-action="fullscreen" onClick={toggleFullscreen} title={t("classroom.v3.fullscreen")}><Expand /><span>{t("classroom.v3.fullscreen")}</span></button>
            <button type="button" title={t("classroom.v3.resetMedia")} className="is-dock-secondary" onClick={() => void runMediaAction("recover", async (provider) => { await renewClassroomCredentials(); await provider.recoverMedia(true); })}><RefreshCw /><span>{t("classroom.v3.resetMedia")}</span></button>
            {classinLayout ? <ClassroomHeaderMenu actions={minimalOperationActions} variant="operations" /> : (<button type="button" title={t("classroom.v3.more")} aria-label={t("classroom.v3.more")} className={`is-dock-more ${dockMoreOpen ? "is-active" : ""}`} aria-expanded={dockMoreOpen} onClick={() => setDockMoreOpen((value) => !value)}><MoreHorizontal /><span>{t("classroom.v3.more")}</span></button>)}
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
              initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
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

      <ClassroomAwardNotice key={sessionData.course.sessionId} sessionId={sessionData.course.sessionId}
        members={sessionData.runtime.members} viewerId={currentUserId} disabled={isRecorder || classEnded} />
      <AnimatePresence>
        {!isRecorder &&
          currentMember?.screenShareState === "requested" && (
            <motion.div
              className="classroom-v3-invite is-screen-share" role="status"
              initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
            >
              <span><MonitorUp /></span>
              <div>
                <strong>{t("classroomWorkspace.shareInvitation")}</strong>
                <p>{t(screenShareSupported ? "classroom.v3.screenShareRequestHint" : "classroom.v3.screenShareBrowserUnsupported")}</p>
              </div>
              <button
                type="button"
                onClick={() => void performAction({ type: "declineScreenShare" })}
              >
                {t("classroom.v3.decline")}
              </button>
              <button
                type="button"
                className="is-accept"
                onClick={() => {
                  if (!screenShareSupported) { void performAction({ type: "declineScreenShare" }); return; }
                  void performAction({ type: "acceptScreenShare" });
                }}
              >
                {t(screenShareSupported ? "classroom.v3.accept" : "classroom.v3.close")}
              </button>
            </motion.div>
          )}
      </AnimatePresence>

      <AnimatePresence>
        {!isRecorder &&
          screenShareSupported &&
          currentMember?.screenShareState === "accepted" &&
          !controlMedia.local.screenSharing && (
            <motion.div
              className="classroom-v3-invite is-screen-share-ready" role="status"
              initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
            >
              <span><MonitorUp /></span>
              <div>
                <strong>{t("classroomWorkspace.shareReady")}</strong>
                <p>{publishingBlocked?publishingError?.message:t(!mayClaimScreen?"classroomRoster.shareOccupied":"classroomWorkspace.chooseShareSource")}</p>
              </div>
              <button
                type="button"
                onClick={() => void performAction({ type: "declineScreenShare" })}
              >
                {t("classroom.v3.later")}
              </button>
              <button
                type="button"
                className="is-accept"
                disabled={publishingPreparing || (!publishingBlocked && !studentShareReady)}
                aria-busy={publishingPreparing}
                onClick={() => {if(publishingBlocked){setPublishingError(null);setActionError("");}else toggleScreenShare();}}
              >
                {publishingBlocked?t("classroomRoster.retrySharePreparation"):t(studentShareReady?"classroom.v3.startScreenShareNow":"classroom.v3.preparing")}
              </button>
            </motion.div>
          )}
      </AnimatePresence>

      <DeviceSettings
        open={settingsOpen}
        theme={theme}
        onThemeChange={setClientTheme}
        provider={controlsRoomMedia ? roomProvider : mediaProvider}
        media={controlMedia}
        runtime={sessionData?.runtime || null}
        canManageRecording={isClassroomTeachingRole(sessionData?.credential.role) && !isRecorder}
        canManageStage={Boolean(sessionData?.capabilities.canManageStage && !isRecorder)}
        stageStudentLimit={sessionData?.runtime.stageStudentLimit ?? null}
        stageDefaultStudentLimit={sessionData?.modePolicy.maxStageStudents ?? null}
        stageSettingsBusy={Boolean(actionBusy)}
        onStageSettingsChange={(studentLimit, inviteBypassLimit) => void performAction({ type: "setStageSettings", studentLimit, inviteBypassLimit })}
        canUseAuxiliaryCamera={canUseAuxiliaryCamera}
        focusClassStart={focusClassStart}
        startSettingsBusy={Boolean(actionBusy)}
        onCaptionStartPreferencesChange={preferences => { void performAction({ type: "setCaptionStartPreferences", preferences }); }}
        onClassStartModeChange={(mode) => void performAction({ type: "setClassStartMode", mode })}
        onRecordingStartModeChange={(mode) => void performAction({ type: "setRecordingStartMode", mode })}
        onOpenCaptions={() => setActivePanel("captions")}
        onClose={() => setSettingsOpen(false)}
      />
    </main></ClassroomSyncProvider>
  );
}
