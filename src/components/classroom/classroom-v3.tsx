"use client";

import {
  CSSProperties,
  FormEvent,
  KeyboardEvent,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Camera,
  Check,
  ChevronRight,
  Circle,
  CircleStop,
  Clock3,
  Download,
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
  Languages,
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
  ClassroomCompositionPreview,
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
  ClassroomQuestionSnapshot,
} from "@/lib/classroom/types";
import {
  defaultBoardRect,
  normalizeBoardRect,
  placeClassroomBoardItem,
  translateBoardRectByPixels,
  updateClassroomBoardItem,
} from "@/lib/classroom/composition";
import { selectActiveScreenShare } from "@/lib/classroom/media-routing";
import { shouldStopUnauthorizedScreenShare } from "@/lib/classroom/screen-share-state";
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
  | "engagement"
  | "tools";
type ClassroomLayoutMode = "focus" | "split" | "grid";
type CaptionDisplayMode = "off" | "original" | "bilingual" | "translated";

const TEACHER_PIP_HIDDEN_STORAGE_KEY = "classroom_teacher_pip_hidden";

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
  const existing = next.get(incoming.id);
  next.set(
    incoming.id,
    existing
      ? {
          ...existing,
          ...incoming,
          text: incoming.text || existing.text,
          sourceLanguage:
            incoming.sourceLanguage || existing.sourceLanguage,
          detectedLanguage:
            incoming.detectedLanguage || existing.detectedLanguage,
          translations: {
            ...existing.translations,
            ...incoming.translations,
          },
          isFinal: incoming.isFinal || existing.isFinal,
        }
      : incoming,
  );
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

function BoardCompositionItem({
  item,
  participant,
  displayName,
  coursewareName,
  provider,
  stageRef,
  canManage,
  canEditGeometry,
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
  coursewareName?: string;
  provider: ClassroomMediaProvider;
  stageRef: React.RefObject<HTMLDivElement | null>;
  canManage: boolean;
  canEditGeometry: boolean;
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
        target.closest("button") ||
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

  const style = {
    left: `${visualRect.x * 100}%`,
    top: `${visualRect.y * 100}%`,
    width: `${visualRect.width * 100}%`,
    height: `${visualRect.height * 100}%`,
    zIndex: item.zIndex + 5,
  } satisfies CSSProperties;

  return (
    <motion.article
      className={`classroom-v3-board-item${selected ? " is-selected" : ""}${item.locked ? " is-locked" : ""}${item.shape === "circle" ? " is-circle" : ""}${draggingRect ? " is-dragging" : ""}`}
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
        />
      ) : (
        <div className="classroom-v3-board-item-empty">
          {item.kind === "screen" ? <MonitorUp /> : <VideoOff />}
          <strong>{displayName}</strong>
          <small>{t("classroom.v3.waitingForSharedContent")}</small>
        </div>
      )}
      <div className="classroom-v3-board-item-tools" role="toolbar">
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
              onClick={(event) => {
                event.stopPropagation();
                onBringToFront();
              }}
              title={t("classroom.v3.focusAction")}
              aria-label={t("classroom.v3.focusAction")}
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
      </div>
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
  members,
  courseware,
  participants,
  provider,
  canManage,
  currentUserId,
  onAction,
  onPreview,
  hiddenItemIds,
  onHideLocally,
}: {
  items: ClassroomBoardItem[];
  members: ClassroomMemberSnapshot[];
  courseware: ClassroomCoursewareSnapshot[];
  participants: ClassroomParticipant[];
  provider: ClassroomMediaProvider;
  canManage: boolean;
  currentUserId: string;
  onAction: (action: ClassroomAction) => Promise<boolean>;
  onPreview: (itemId: string, rect: ClassroomBoardRect) => void;
  hiddenItemIds: Set<string>;
  onHideLocally: (itemId: string) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useRef(true);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [localCameraOverrides, setLocalCameraOverrides] = useState<
    Record<
      string,
      { rect?: ClassroomBoardRect; shape?: "rounded" | "circle" }
    >
  >({});
  const [optimisticItemUpdates, setOptimisticItemUpdates] = useState<
    Record<
      string,
      {
        rect?: ClassroomBoardRect;
        locked?: boolean;
        visible?: boolean;
        shape?: "rounded" | "circle";
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

  return (
    <div
      ref={stageRef}
      className="classroom-v3-board-composition"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) setSelectedItemId(null);
      }}
    >
      {visibleItems.map((item) => {
        const isLocalCamera =
          item.kind === "camera" && item.sourceId === currentUserId;
        const localOverride = isLocalCamera
          ? localCameraOverrides[item.sourceId]
          : undefined;
        const optimisticUpdate = optimisticItemUpdates[item.id];
        const visualItem = {
          ...item,
          ...localOverride,
          ...optimisticUpdate,
        };
        const member = members.find((candidate) => candidate.userId === item.sourceId);
        const matchedParticipant = participants.find(
          (participant) =>
            participantOwnerId(participant.id) === item.sourceId &&
            participant.kind === (item.kind === "screen" ? "screen" : "camera"),
        ) ?? null;
        const file = courseware.find((candidate) => candidate.id === item.sourceId);
        const displayName = item.kind === "courseware"
          ? file?.name || item.sourceId
          : member?.displayName || item.sourceId;
        return (
          <BoardCompositionItem
            key={item.id}
            item={visualItem}
            participant={matchedParticipant}
            displayName={displayName}
            coursewareName={file?.name}
            provider={provider}
            stageRef={stageRef}
            canManage={canManage}
            canEditGeometry={canManage || isLocalCamera}
            selected={selectedItemId === item.id}
            onSelect={() => setSelectedItemId(item.id)}
            onUpdate={(update) => {
              setOptimisticItemUpdates((current) => ({
                ...current,
                [item.id]: {
                  ...current[item.id],
                  ...update,
                },
              }));
              if (isLocalCamera && (update.rect || update.shape)) {
                setLocalCameraOverrides((current) => ({
                  ...current,
                  [item.sourceId]: {
                    ...current[item.sourceId],
                    ...(update.rect && { rect: update.rect }),
                    ...(update.shape && { shape: update.shape }),
                  },
                }));
              }
              void onAction({
                type: "updateBoardItem",
                itemId: item.id,
                ...update,
              }).finally(() => {
                if (!isMountedRef.current) return;
                setOptimisticItemUpdates((current) => {
                  const pending = current[item.id];
                  if (!pending) return current;
                  const nextPending = { ...pending };
                  if (update.rect) delete nextPending.rect;
                  if (update.locked !== undefined) delete nextPending.locked;
                  if (update.visible !== undefined) delete nextPending.visible;
                  if (update.shape) delete nextPending.shape;
                  const next = { ...current };
                  if (Object.keys(nextPending).length) {
                    next[item.id] = nextPending;
                  } else {
                    delete next[item.id];
                  }
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
              }).then((removed) => {
                if (removed || !isMountedRef.current) return;
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
}: {
  media: ClassroomMediaSnapshot;
  recording: string | null;
}) {
  const { t } = useTranslation();
  const connected = media.connectionState === "connected";
  const recordingActive = ["starting", "recording"].includes(
    recording || "",
  );
  return (
    <div className="classroom-v3-statuses">
      <span
        className={connected ? "is-online" : "is-warning"}
        tabIndex={0}
        title={connected ? t("classroom.v3.connected") : t("classroom.v3.reconnecting")}
      >
        <Wifi />
        {connected
          ? t("classroom.v3.connected")
          : t("classroom.v3.reconnecting")}
        <span className="classroom-v3-network-popover">
          <strong>{t("classroom.v3.connectionDetail")}</strong>
          <small>
            <i className={connected ? "is-good" : ""} />
            {connected ? t("classroom.v3.rtcConnected") : t("classroom.v3.rtcRecovering")}
          </small>
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
}) {
  const { t } = useTranslation();
  const [touchControlsVisible, setTouchControlsVisible] = useState(false);
  const skipTouchPreviewActionRef = useRef(false);
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
  const showControls = canControlSelf || canControlStudent || (canReward && member.role === "student");
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
            <img src={member.avatar} alt="" draggable={false} />
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
      {member.rewardCount > 0 && (
        <span className="classroom-v3-seat-reward" title={t("classroom.v3.rewardCount", { count: member.rewardCount })}>
          <Trophy />
          {member.rewardCount}
        </span>
      )}
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
      drag={canReorder ? "x" : false}
      dragElastic={0.08}
      dragMomentum={false}
      onDragEnd={(_, info) => {
        const slots = Math.round(info.offset.x / 150);
        if (slots) onMoveSeat(member.userId, slots);
      }}
      className={`classroom-v3-seat${member.role !== "student" ? " is-teacher" : ""}${cameraOn ? " has-video" : ""}${touchControlsVisible ? " is-touch-active" : ""}${canReorder ? " is-reorderable" : ""}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setTouchControlsVisible(false);
        }
      }}
    >
      {canManage ? (
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
            {canManage && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onPlaceOnBoard(member.userId)}
                title={t("classroom.v3.placeOnBoard")}
              >
                <Move />
              </button>
            )}
            {canReward && member.role === "student" && (
              <button
                type="button"
                disabled={busy}
                className="is-reward"
                onClick={() => onReward(member.userId)}
                title={t("classroom.v3.giveReward")}
              >
                <Trophy />
              </button>
            )}
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
}: {
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
  maxStudentSeats: number;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  seatOrder: string[];
  boardSourceIds: Set<string>;
  onReorder: (seatOrder: string[]) => void;
  onPlaceOnBoard: (userId: string) => void;
  previewPlacesOnBoard: boolean;
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
  const queue = members.filter(
    (member) => member.handRaisedAt && !member.onStage,
  );
  const cameraParticipants = new Map(
    media.participants
      .filter((participant) => participant.kind === "camera")
      .map((participant) => [participantOwnerId(participant.id), participant]),
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
            canReorder={canManage && seatedMembers.length > 1}
          />
        ))}
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
  whiteboardActive,
  canShareScreen,
  screenSharing,
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
  canShareScreen: boolean;
  screenSharing: boolean;
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
  const [textSize, setTextSize] = useState(24);
  const [classroomMenuOpen, setClassroomMenuOpen] = useState(false);
  const [clearBoardConfirming, setClearBoardConfirming] = useState(false);
  const clearBoardCancelRef = useRef<HTMLButtonElement>(null);
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
    { id: "captions", label: t("classroom.v3.captions"), icon: Languages },
    { id: "courseware", label: t("classroom.v3.courseware"), icon: BookOpen },
    { id: "engagement", label: t("classroom.v3.engagement"), icon: Zap },
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
    { id: "eraser", label: t("classroom.v3.boardEraser"), icon: Eraser },
    { id: "laserPointer", label: t("classroom.v3.boardLaser"), icon: Radio },
  ];
  const selectedBoardTool =
    boardTools.find((tool) => tool.id === whiteboardTool) ||
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
      <div className="classroom-v3-board-tools">
        {(railLevel === "compact" ? [selectedBoardTool] : boardTools).map((tool) => {
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
              title={t("classroom.v3.clearBoard")}
            >
              <Trash2 />
              <span>{t("classroom.v3.clearBoard")}</span>
            </button>
          </>
        )}
      </div>
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
            className={screenSharing ? "is-active" : ""}
            onClick={onToggleScreenShare}
            title={screenSharing ? t("classroom.v3.stopSharing") : t("classroom.v3.screenShare")}
            aria-pressed={screenSharing}
          >
            {screenSharing ? <ScreenShareOff /> : <MonitorUp />}
            <span>{screenSharing ? t("classroom.v3.stopSharing") : t("classroom.v3.screenShare")}</span>
          </button>
        )}
      </div>
      {railLevel === "expanded" && items.filter((item) => visiblePanels.includes(item.id)).map((item) => {
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
      {canManageStage && railLevel === "expanded" && (
        <button
          type="button"
          className={classroomMenuOpen ? "is-active" : ""}
          onClick={() => {
            onInteract();
            setClassroomMenuOpen((value) => !value);
          }}
          title={t("classroom.v3.classroomManagement")}
        >
          <MoreHorizontal />
          <span>{t("classroom.v3.classroomManagement")}</span>
        </button>
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
                {t("classroom.v3.clearBoardTitle")}
              </h2>
              <p id="clear-board-dialog-description">
                {t("classroom.v3.confirmClearBoard")}
              </p>
              <small>{t("classroom.v3.clearBoardIrreversible")}</small>
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
                {t("classroom.v3.clearBoardConfirm")}
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
          <small>{t("classroom.v3.whiteboardToolSettings")}</small>
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
          onClick={() => {
            setToolSettingsOpen(false);
            setToolPopoverTop(null);
          }}
        >
          <X />
        </button>
      </div>
    )}
    {classroomMenuOpen && (
      <div className="classroom-v3-tool-popover is-classroom-menu" role="menu">
        <button type="button" onClick={() => onClassroomAction({ type: "muteAllMicrophones" })}>
          <MicOff />{t("classroom.v3.muteAllMicrophones")}
        </button>
        <button type="button" onClick={() => onClassroomAction({ type: "authorizeAllOnStage" })}>
          <PenTool />{t("classroom.v3.authorizeAllOnStage")}
        </button>
        <button type="button" onClick={() => onClassroomAction({ type: "deauthorizeAll" })}>
          <Lock />{t("classroom.v3.deauthorizeAll")}
        </button>
        <button type="button" onClick={() => onClassroomAction({ type: "removeAllStudentsFromStage" })}>
          <Users />{t("classroom.v3.removeAllFromStage")}
        </button>
        <button type="button" onClick={() => onClassroomAction({ type: "resetComposition" })}>
          <RefreshCw />{t("classroom.v3.resetLayout")}
        </button>
        <button type="button" onClick={() => onClassroomAction({ type: "arrangeVideoGallery" })}>
          <LayoutGrid />{t("classroom.v3.videoGallery")}
        </button>
      </div>
    )}
    </>
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
                {member.screenShareState === "requested"
                  ? ` · ${t("classroom.v3.screenShareRequested")}`
                  : member.screenShareState === "accepted"
                    ? ` · ${t("classroom.v3.screenShareAccepted")}`
                    : member.screenShareState === "declined"
                      ? ` · ${t("classroom.v3.screenShareDeclined")}`
                      : ""}
              </small>
            </span>
            {member.role === "student" && canManage && (
              <span className="classroom-v3-member-actions">
                <button
                  type="button"
                  className={
                    member.screenShareState === "accepted"
                      ? "is-on"
                      : member.screenShareState === "requested"
                        ? "is-pending"
                        : ""
                  }
                  onClick={() =>
                    onAction(
                      member.screenShareState === "idle" ||
                        member.screenShareState === "declined"
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
                  title={
                    member.screenShareState === "idle" ||
                    member.screenShareState === "declined"
                      ? t("classroom.v3.requestScreenShare")
                      : t("classroom.v3.stopStudentScreenShare")
                  }
                >
                  {member.screenShareState === "accepted" ? (
                    <ScreenShareOff />
                  ) : (
                    <MonitorUp />
                  )}
                </button>
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
          </article>
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
  error,
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
  availability,
  canManage,
  displayMode,
  overlayVisible,
  preferredLanguage,
  onDisplayModeChange,
  onOverlayVisibleChange,
  onPreferredLanguageChange,
  onAction,
}: {
  runtime: ClassroomRuntimeSnapshot;
  captions: ClassroomCaptionSnapshot[];
  availability: { shengwang: boolean; wordly: boolean };
  canManage: boolean;
  displayMode: CaptionDisplayMode;
  overlayVisible: boolean;
  preferredLanguage: string;
  onDisplayModeChange: (mode: CaptionDisplayMode) => void;
  onOverlayVisibleChange: (visible: boolean) => void;
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
  const effectiveProvider =
    provider === "wordly" && !availability.wordly ? "shengwang" : provider;
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

  const visibleCaptions = captions.slice(-80);
  return (
    <div className="classroom-v3-panel-body is-captions">
      <div className="classroom-v3-panel-heading">
        <div>
          <small>{t("classroom.v3.interpretationEyebrow")}</small>
          <h2>{t("classroom.v3.captionsTitle")}</h2>
        </div>
        <span data-status={runtime.interpretation.status}>
          {interpretationStateLabel}
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

      <div className="classroom-v3-caption-stage-hint">
        <MonitorUp />
        <span>
          <strong>{t("classroom.v3.captionOverlay")}</strong>
          <small>
            {displayMode === "off"
              ? t("classroom.v3.captionsOff")
              : t("classroom.v3.captionOverlayHint")}
          </small>
        </span>
      </div>

      <div className="classroom-v3-caption-overlay-control">
        <span>
          <strong>{t("classroom.v3.captionOverlay")}</strong>
          <small>{t("classroom.v3.captionOverlayHint")}</small>
        </span>
        <button
          type="button"
          className={overlayVisible ? "is-on" : ""}
          aria-pressed={overlayVisible}
          onClick={() => onOverlayVisibleChange(!overlayVisible)}
        >
          <i />
          {overlayVisible
            ? t("classroom.v3.enabled")
            : t("classroom.v3.disabled")}
        </button>
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
              className={effectiveProvider === "shengwang" ? "is-selected" : ""}
              disabled={!availability.shengwang}
              onClick={() => setProvider("shengwang")}
            >
              <strong>{t("classroom.v3.shengwang")}</strong>
              <small>{t("classroom.v3.shengwangIntegrated")}</small>
            </button>
            {availability.wordly ? (
              <button
                type="button"
                className={effectiveProvider === "wordly" ? "is-selected" : ""}
                onClick={() => setProvider("wordly")}
              >
                <strong>Wordly</strong>
                <small>{t("classroom.v3.wordlyIntegrated")}</small>
              </button>
            ) : null}
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
                limit: effectiveProvider === "shengwang" ? 10 : 20,
              })}
            </span>
            <div>
              {classroomLanguages
                .filter((language) => language.code !== sourceLanguage)
                .map((language) => {
                  const selected = targetLanguages.includes(language.code);
                  const limit = effectiveProvider === "shengwang" ? 10 : 20;
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
                provider: effectiveProvider,
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
    .filter((member) => member.role === "student" && member.onStage)
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
        {[5, 10, 20].map((minutes) => (
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
        <button
          type="button"
          disabled={!canManage || !runtime.timerStartedAt || busy}
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
  onTogglePaused,
  onReset,
}: {
  durationSec: number;
  remainingSec: number;
  paused: boolean;
  canManage: boolean;
  busy: boolean;
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
      className={`classroom-v3-timer-overlay ${urgent ? "is-urgent" : ""}`}
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ duration: 0.2 }}
      aria-live="polite"
    >
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
  const [launchAttempt, setLaunchAttempt] = useState(0);
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
  const [roomScreenShareUserId, setRoomScreenShareUserId] = useState<
    string | null
  >(null);
  const roomProviderRef = useRef<ClassroomMediaProvider | null>(null);
  const roomUnsubscribeRef = useRef<(() => void) | null>(null);
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null);
  const [spaceBusy, setSpaceBusy] = useState(false);
  const signalingRef = useRef<ClassroomSignalingProvider | null>(null);
  const [activePanel, setActivePanel] = useState<DrawerPanel | null>(
    isRecorder ? "chat" : null,
  );
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
  const [whiteboardTool, setWhiteboardTool] =
    useState<ClassroomWhiteboardTool>("selector");
  const [toolRailLevel, setToolRailLevel] =
    useState<"expanded" | "compact" | "collapsed">("expanded");
  const [toolRailActivity, setToolRailActivity] = useState(0);
  const [hiddenBoardItemIds, setHiddenBoardItemIds] = useState<Set<string>>(
    () => new Set(),
  );
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
  const [captionOverlayVisible, setCaptionOverlayVisible] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("classroom_caption_overlay_visible") !== "0";
  });
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
  const [recordingStatus, setRecordingStatus] = useState<string | null>(null);
  const [recordingMode, setRecordingMode] = useState<"web" | "mix" | null>(null);
  const [recordingFallback, setRecordingFallback] = useState<string | null>(null);
  const [endClassConfirming, setEndClassConfirming] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const publishEnabledRef = useRef(false);
  const teacherCameraAutostartedRef = useRef(false);
  const captionIngestAtRef = useRef(new Map<string, number>());
  const compositionPreviewAtRef = useRef(0);
  const [studentPublishReady, setStudentPublishReady] = useState(false);
  const now = useNow();

  const handleWhiteboardControllerChange = useCallback(
    (controller: ClassroomWhiteboardController | null) => {
      setWhiteboardController(controller);
    },
    [],
  );

  const wakeToolRail = useCallback(() => {
    setToolRailLevel("expanded");
    setToolRailActivity((value) => value + 1);
  }, []);

  useEffect(() => {
    // A tool may be chosen while the whiteboard is completing its initial
    // render. Apply the current choice once its controller becomes available
    // so the toolbar state and the actual drawing appliance never diverge.
    whiteboardController?.setTool(whiteboardTool);
  }, [whiteboardController, whiteboardTool]);

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
    setRoomScreenShareUserId(null);
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
        setRoomScreenShareUserId(
          payload.credential.screenShare?.userId ?? null,
        );
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
      const serverCode = "code" in payload ? payload.code : undefined;
      throw new Error(
        serverCode === "database_unavailable"
          ? t("classroom.v3.databaseUnavailable")
          : serverDetail || t("classroom.v3.sessionCreateFailed"),
      );
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
        setLoadingState("loading");
        setErrorMessage("");
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
        // The initial classroom response intentionally defers the whiteboard
        // credential so Netless room/token latency never blocks the shell.
        // Download the SDK in parallel with media setup; by the time the
        // credential arrives, the heaviest client asset is already cached.
        void preloadFastboard();
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
        if (!cancelled) setLoadingState("ready");
        try {
          await provider.connect(payload.credential, displayName);
        } catch (mediaError) {
          if (!cancelled) {
            console.warn("[classroom:v3] media connection failed", mediaError);
            setActionError(
              mediaError instanceof Error
                ? mediaError.message
                : t("classroom.v3.mediaActionFailed"),
            );
          }
        }
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
    launchAttempt,
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
          engagement: payload.engagement,
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
          engagement: ClassroomSessionResponse["engagement"];
          courseware: ClassroomCoursewareSnapshot[];
          captions: ClassroomCaptionSnapshot[];
          spaces: ClassroomSpaceSnapshot[];
          questions: ClassroomQuestionSnapshot[];
          recording: ClassroomSessionResponse["recording"];
        };
        updateSession(payload);
        setRecordingStatus(payload.recording.status);
        setRecordingMode(payload.recording.mode);
        setRecordingFallback(payload.recording.fallbackFrom);
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
    const initialRefresh = window.setTimeout(() => void refreshState(), 2_500);
    const interval = ["starting", "stopping", "processing"].includes(
      recordingStatus || "",
    )
      ? 2_000
      : 5_000;
    const timer = window.setInterval(() => void refreshState(), interval);
    return () => {
      window.clearTimeout(initialRefresh);
      window.clearInterval(timer);
    };
  }, [loadingState, recordingStatus, refreshState]);

  useEffect(() => {
    const signaling = sessionData?.signaling;
    if (!signaling || isRecorder) return;
    let cancelled = false;
    const provider = createClassroomSignalingProvider();
    signalingRef.current = provider;
    const onEvent = (
      event: ClassroomInvalidation | ClassroomCompositionPreview,
    ) => {
      if (cancelled || event.courseId !== courseId) return;
      if (event.topic === "composition-preview") {
        const current = sessionRef.current;
        const actor = current?.runtime.members.find(
          (member) => member.userId === event.actorId,
        );
        // Agora RTM echoes messages to the sender. Applying our own preview
        // back into React changes the item's base left/top during a Motion
        // drag, which is the source of the visible snap-back.
        if (
          !current ||
          !actor ||
          actor.role === "student" ||
          event.actorId === (isRecorder ? current.credential.userId : user?.userId)
        ) {
          return;
        }
        setSessionData((snapshot) =>
          snapshot
            ? {
                ...snapshot,
                runtime: {
                  ...snapshot.runtime,
                  composition: updateClassroomBoardItem(
                    snapshot.runtime.composition,
                    event.itemId,
                    { rect: event.rect },
                  ),
                },
              }
            : snapshot,
        );
        return;
      }
      if (event.revision > (sessionRef.current?.runtime.revision ?? 0)) {
        void refreshState();
      }
    };
    void provider.connect(signaling, onEvent).catch((error) => {
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
    user?.userId,
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
    const initialHeartbeat = window.setTimeout(heartbeat, 5_000);
    const timer = window.setInterval(heartbeat, 15_000);
    return () => {
      window.clearTimeout(initialHeartbeat);
      window.clearInterval(timer);
    };
  }, [courseId, isRecorder, loadingState, shareAccess]);

  const currentUserId = isRecorder
    ? sessionData?.credential.userId || ""
    : user?.userId || "";
  const publishCompositionPreview = useCallback(
    (itemId: string, rect: ClassroomBoardRect) => {
      const now = performance.now();
      if (
        !courseId ||
        !currentUserId ||
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
    [courseId, currentUserId],
  );
  const currentMember = sessionData?.runtime.members.find(
    (member) => member.userId === currentUserId,
  );
  const classEnded = sessionData?.runtime.status === "ended";

  useEffect(() => {
    if (!classEnded) return;
    publishEnabledRef.current = false;
    void providerRef.current?.disconnect().catch(() => undefined);
    const settleEndedState = window.setTimeout(() => {
      void disconnectRoom();
      setActivePanel(null);
      setEndClassConfirming(false);
      setStudentPublishReady(false);
      setMedia(EMPTY_MEDIA);
    }, 0);
    return () => window.clearTimeout(settleEndedState);
  }, [classEnded, disconnectRoom]);

  // The teacher camera is the default classroom presence. Starting it here
  // keeps the teaching stage useful on first entry, while the ref ensures a
  // teacher who deliberately turns it off is never switched back on.
  useEffect(() => {
    if (
      isRecorder ||
      classEnded ||
      !sessionData ||
      !mediaProvider ||
      sessionData.credential.role !== "teacher" ||
      media.connectionState !== "connected" ||
      media.local.cameraOn ||
      teacherCameraAutostartedRef.current
    ) {
      return;
    }
    teacherCameraAutostartedRef.current = true;
    void mediaProvider.toggleCamera().catch((error: unknown) => {
      setActionError(
        error instanceof Error
          ? error.message
          : t("classroom.v3.mediaActionFailed"),
      );
    });
  }, [
    classEnded,
    isRecorder,
    media.connectionState,
    media.local.cameraOn,
    mediaProvider,
    sessionData,
    t,
  ]);

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
    if (
      currentMember &&
      shouldStopUnauthorizedScreenShare({
        role: sessionData.credential.role,
        state: currentMember.screenShareState,
        sharing: media.local.screenSharing,
        allowedWithoutApproval:
          sessionData.capabilities.canShareScreen ||
          (currentMember.onStage &&
            currentMember.stageState === "accepted" &&
            studentPublishReady),
      })
    ) {
      void mediaProvider.stopScreenShare();
    }
  }, [
    courseId,
    currentMember,
    isRecorder,
    media.local.cameraOn,
    media.local.microphoneOn,
    media.local.screenSharing,
    mediaProvider,
    sessionData,
    shareAccess,
    studentPublishReady,
    t,
  ]);

  useEffect(() => {
    const whiteboardPending =
      sessionData?.whiteboard.error === "whiteboard_pending";
    const studentPermissionChanged =
      sessionData?.credential.role === "student" &&
      Boolean(currentMember) &&
      currentMember!.whiteboardWritable !== sessionData.whiteboard.writable;
    if (
      isRecorder ||
      loadingState !== "ready" ||
      !courseId ||
      !sessionData ||
      (!whiteboardPending && !studentPermissionChanged)
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
          setActionError(
            message,
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
    loadingState,
    sessionData,
    sessionData?.credential.role,
    sessionData?.whiteboard.error,
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
      if (!courseId || !sessionRef.current || actionBusy || isRecorder) {
        return false;
      }
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
              ...(action.type !== "submitBuzz" && {
                expectedRevision: sessionRef.current.runtime.revision,
              }),
              ...(shareAccess && { shareAccess }),
            }),
          },
        );
        const payload = (await response.json()) as {
          error?: string;
          runtime?: ClassroomRuntimeSnapshot;
          engagement?: ClassroomSessionResponse["engagement"];
        };
        if (!response.ok) {
          if (payload.runtime || payload.engagement) {
            updateSession({
              ...(payload.runtime && { runtime: payload.runtime }),
              ...(payload.engagement && { engagement: payload.engagement }),
            });
          }
          throw new Error(
            payload.error || t("classroom.v3.classroomActionFailed"),
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
        if (action.type === "startClass") {
          setRecordingStatus("starting");
          window.setTimeout(() => void refreshState(), 1_800);
        }
        return true;
      } catch (error) {
        if (optimisticComposition) void refreshState();
        setActionError(
          error instanceof Error
            ? error.message
            : t("classroom.v3.classroomActionFailed"),
        );
        return false;
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
      const payload = (await response.json().catch(() => ({}))) as {
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

  const toggleRecording = useCallback(async () => {
    if (!courseId || actionBusy || isRecorder) return;
    if (["starting", "stopping", "processing"].includes(recordingStatus || "")) {
      return;
    }
    const active = recordingStatus === "recording";
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

  const endClass = useCallback(async () => {
    const current = sessionRef.current;
    if (
      !courseId ||
      !current ||
      current.credential.role !== "teacher" ||
      current.runtime.status !== "live" ||
      actionBusy ||
      isRecorder
    ) {
      return;
    }
    setActionBusy("endClass");
    setActionError("");
    try {
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
      if (!response.ok || !payload.runtime) {
        throw new Error(
          payload.error || t("classroom.v3.classroomActionFailed"),
        );
      }
      setSessionData((value) =>
        value
          ? {
              ...value,
              runtime: payload.runtime!,
              course: {
                ...value.course,
                status: payload.session?.status || value.course.status,
              },
            }
          : value,
      );
      if (
        ["starting", "recording", "stopping"].includes(recordingStatus || "")
      ) {
        setRecordingStatus("stopping");
      }
      publishInvalidation(payload.runtime.revision, "runtime");
      setEndClassConfirming(false);
    } catch (error) {
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
    isRecorder,
    publishInvalidation,
    recordingStatus,
    t,
  ]);

  const parentCourseId = sessionData?.course.id || null;
  const classroomRole = sessionData?.credential.role || null;
  const isStudentViewer = classroomRole === "student";
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

  const decorateParticipant = (participant: ClassroomParticipant) => {
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
  };
  const decoratedParticipants = media.participants.map(decorateParticipant);
  const activeScreenShare = selectActiveScreenShare({
    main: media,
    room: roomMedia,
    preferRoom: controlsRoomMedia,
    mainScreenUserId: sessionData?.credential.screenShare?.userId,
    roomScreenUserId: roomScreenShareUserId,
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
  const spotlightParticipant = decoratedParticipants.find(
    ({ participant }) =>
      participantOwnerId(participant.id) ===
      sessionData?.runtime.spotlightUserId,
  );
  const leadTeacher = sessionData?.runtime.members.find(
    (member) => member.role === "teacher",
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
  const compositionBoardItems = (
    sessionData?.runtime.composition.boardItems ?? []
  ).filter((item) => item.kind !== "screen");
  const boardSourceIds = new Set(
    compositionBoardItems
      .filter((item) => item.kind === "camera")
      .map((item) => item.sourceId),
  );
  // Keep Fastboard mounted while a screen share is on stage. Destroying it on
  // every share transition reconnects the room, flashes the loading state and
  // can make recently synchronized strokes appear to disappear.
  const whiteboardStageEnabled = Boolean(
    (classinLayout && sessionData?.mode !== "publicLive") ||
      sessionData?.runtime.stageMode === "whiteboard",
  );
  const showWhiteboard = Boolean(!screenParticipant && whiteboardStageEnabled);
  const useMediaGallery = Boolean(
    !screenParticipant &&
      !showWhiteboard &&
      layoutMode !== "focus" &&
      galleryParticipants.length > 1,
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
    ? (now - new Date(sessionData.runtime.startedAt).getTime()) / 1000
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
  const studentScreenShareWasActiveRef = useRef(false);
  const toggleScreenShare = useCallback(() => {
    const stopping = controlMedia.local.screenSharing;
    void runMediaAction("screen", async (provider) => {
      if (stopping) {
        studentScreenShareWasActiveRef.current = false;
        await provider.stopScreenShare();
        if (
          sessionRef.current?.credential.role === "student" &&
          currentMember?.screenShareState === "accepted"
        ) {
          await performAction({ type: "declineScreenShare" });
        }
        return;
      }
      try {
        await provider.startScreenShare();
      } catch (error) {
        if (
          sessionRef.current?.credential.role === "student" &&
          currentMember?.screenShareState === "accepted"
        ) {
          await performAction({ type: "declineScreenShare" });
        }
        throw error;
      }
    });
  }, [
    controlMedia.local.screenSharing,
    currentMember?.screenShareState,
    performAction,
    runMediaAction,
  ]);
  useEffect(() => {
    const acceptedStudentShare =
      sessionData?.credential.role === "student" &&
      currentMember?.screenShareState === "accepted";
    if (!acceptedStudentShare) {
      studentScreenShareWasActiveRef.current = false;
      return;
    }
    if (controlMedia.local.screenSharing) {
      studentScreenShareWasActiveRef.current = true;
      return;
    }
    if (studentScreenShareWasActiveRef.current) {
      studentScreenShareWasActiveRef.current = false;
      void performAction({ type: "declineScreenShare" });
    }
  }, [
    controlMedia.local.screenSharing,
    currentMember?.screenShareState,
    performAction,
    sessionData?.credential.role,
  ]);
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
    ...(sessionData?.capabilities.canRunEngagement ||
    sessionData?.capabilities.canParticipateInEngagement
      ? (["engagement"] as DrawerPanel[])
      : []),
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
        <section className="classroom-v3-error-card" role="alert">
          <AlertCircle />
          <small>{t("classroom.v3.unavailableEyebrow")}</small>
          <h1>{t("classroom.v3.cannotEnter")}</h1>
          <p>{errorMessage || t("classroom.v3.missingCourse")}</p>
          <div className="classroom-v3-error-actions">
            <button
              type="button"
              className="is-primary"
              onClick={() => setLaunchAttempt((attempt) => attempt + 1)}
            >
              <RefreshCw />
              {t("classroom.v3.retry")}
            </button>
            <button type="button" onClick={() => router.back()}>
              <ArrowLeft />
              {t("classroom.v3.backToCourse")}
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main
      className={`classroom-v3-shell is-mode-${sessionData.mode} ${classinLayout ? "is-classin-layout" : ""} ${isRecorder ? "is-recorder" : ""} ${sessionData.modePolicy.showLiveRail && liveRailCollapsed ? "is-rail-collapsed" : ""}`}
      data-runtime-status={sessionData.runtime.status}
      data-classroom-mode={sessionData.mode}
      data-composite-source={isRecorder ? "whiteboard-stage" : undefined}
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
            {canUseMedia && (
              <>
                <button
                  type="button"
                  className={!controlMedia.local.microphoneOn ? "is-device-off" : ""}
                  disabled={Boolean(actionBusy)}
                  onClick={() =>
                    void runMediaAction("microphone", (provider) =>
                      provider.toggleMicrophone(),
                    )
                  }
                  title={t("classroom.v3.microphone")}
                  aria-pressed={controlMedia.local.microphoneOn}
                >
                  {controlMedia.local.microphoneOn ? <Mic /> : <MicOff />}
                </button>
                <button
                  type="button"
                  className={!controlMedia.local.cameraOn ? "is-device-off" : ""}
                  disabled={Boolean(actionBusy)}
                  onClick={() =>
                    void runMediaAction("camera", (provider) =>
                      provider.toggleCamera(),
                    )
                  }
                  title={t("classroom.v3.camera")}
                  aria-pressed={controlMedia.local.cameraOn}
                >
                  {controlMedia.local.cameraOn ? <Video /> : <VideoOff />}
                </button>
              </>
            )}
            {sessionData.capabilities.canStartClass &&
              sessionData.runtime.status === "waiting" && (
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
                <>
                  {endClassConfirming && (
                    <button
                      type="button"
                      disabled={Boolean(actionBusy)}
                      onClick={() => setEndClassConfirming(false)}
                    >
                      {t("common.cancel")}
                    </button>
                  )}
                  <button
                    type="button"
                    className="is-end"
                    disabled={Boolean(actionBusy)}
                    onClick={() => {
                      if (endClassConfirming) {
                        void endClass();
                      } else {
                        setEndClassConfirming(true);
                      }
                    }}
                  >
                    {actionBusy === "endClass" ? <Loader2 /> : <CircleStop />}
                    {endClassConfirming
                      ? `${t("common.pleaseConfirm")} · ${t("classroom.v3.endClass")}`
                      : t("classroom.v3.endClass")}
                  </button>
                </>
              )}
            {sessionData.capabilities.canControlRecording && (
              <button
                type="button"
                className={
                  ["starting", "recording"].includes(recordingStatus || "")
                    ? "is-recording"
                    : ""
                }
                disabled={
                  Boolean(actionBusy) ||
                  !sessionData.recording.enabled ||
                  ["starting", "stopping", "processing"].includes(recordingStatus || "")
                }
                onClick={() => void toggleRecording()}
                title={
                  sessionData.recording.enabled
                    ? recordingStatus === "recording"
                      ? t("classroom.v3.stopRecording")
                      : t("classroom.v3.startRecording")
                    : t("classroom.v3.recordingNotConfigured")
                }
                aria-pressed={recordingStatus === "recording"}
              >
                {recordingStatus === "recording" ? <CircleStop /> : <Radio />}
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

      {(sessionData.modePolicy.showLiveRail ||
        (classinLayout && sessionData.mode !== "publicLive")) && (
        <LiveRail
          members={sessionData.runtime.members}
          media={media}
          provider={mediaProvider}
          currentUserId={currentUserId}
          canManage={sessionData.capabilities.canManageStage && !isRecorder}
          canReward={sessionData.capabilities.canGiveReward && !isRecorder}
          busy={Boolean(actionBusy)}
          maxStudentSeats={sessionData.modePolicy.maxStageStudents}
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
              {classEnded ? (
                <motion.div
                  key="ended"
                  className="classroom-v3-stage-empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <span><CircleStop /></span>
                  <small>{t("classroom.v3.classEndedLabel")}</small>
                  <h2>{t("classroom.v3.classEnded")}</h2>
                  <p>{t("classroom.v3.playbackHint")}</p>
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
                    courseware={activeCourseware}
                    onControllerChange={handleWhiteboardControllerChange}
                  />
                  <BoardCompositionLayer
                    items={compositionBoardItems}
                    members={sessionData.runtime.members}
                    courseware={sessionData.courseware}
                    participants={media.participants}
                    provider={mediaProvider}
                    canManage={
                      sessionData.capabilities.canManageStage && !isRecorder
                    }
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
                  <MediaSurface
                    participant={screenParticipant.participant}
                    provider={screenParticipantProvider || mediaProvider}
                    displayName={screenParticipant.displayName}
                  />
                </motion.div>
              ) : null}
            </AnimatePresence>
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
            {!classEnded &&
              captionOverlayVisible &&
              captionDisplayMode !== "off" &&
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
              sessionData.runtime.timerDurationSec ? (
                <StageTimerOverlay
                  durationSec={sessionData.runtime.timerDurationSec}
                  remainingSec={timerRemaining}
                  paused={Boolean(sessionData.runtime.timerPausedAt)}
                  canManage={sessionData.capabilities.canManageStage && !isRecorder}
                  busy={Boolean(actionBusy)}
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
          onPointerEnter={wakeToolRail}
          onFocusCapture={wakeToolRail}
        >
          {!isRecorder && !classEnded && (
            <DrawerNavigation
              active={activePanel}
              onChange={setActivePanel}
              visiblePanels={visibleDrawerPanels}
              whiteboardActive={showWhiteboard}
              canShareScreen={canShareScreen}
              screenSharing={controlMedia.local.screenSharing}
              onOpenWhiteboard={() =>
                void performAction({
                  type: "setStage",
                  mode: "whiteboard",
                  locked: false,
                  coursewareId: sessionData.runtime.activeCoursewareId,
                })
              }
              onToggleScreenShare={toggleScreenShare}
              whiteboardController={whiteboardController}
              whiteboardTool={whiteboardTool}
              onWhiteboardToolChange={setWhiteboardTool}
              railLevel={toolRailLevel}
              onInteract={wakeToolRail}
              canManageStage={
                sessionData.capabilities.canManageStage && !isRecorder
              }
              onClassroomAction={(action) => void performAction(action)}
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
                    availability={sessionData.interpretationAvailability}
                    canManage={
                      sessionData.capabilities.canManageInterpretation && !isRecorder
                    }
                    displayMode={captionDisplayMode}
                    overlayVisible={captionOverlayVisible}
                    preferredLanguage={effectiveCaptionLanguage}
                    onDisplayModeChange={setCaptionDisplayMode}
                    onOverlayVisibleChange={setCaptionOverlayVisible}
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
                {activePanel === "engagement" && (
                  <EngagementPanel
                    engagement={sessionData.engagement}
                    members={sessionData.runtime.members}
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
                    onAction={(action) => void performAction(action)}
                    onFullscreen={toggleFullscreen}
                    onSettings={() => setSettingsOpen(true)}
                    whiteboardController={whiteboardController}
                  />
                )}
              </motion.aside>
            )}
          </AnimatePresence>
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

      {!isRecorder && !classEnded && (
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
                  toggleScreenShare()
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
            {(sessionData.capabilities.canRunEngagement ||
              sessionData.capabilities.canParticipateInEngagement) && (
              <button
                type="button"
                className={activePanel === "engagement" ? "is-active" : ""}
                onClick={() => setActivePanel("engagement")}
              >
                <Zap />
                <span>{t("classroom.v3.engagement")}</span>
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
                  ["starting", "recording"].includes(
                    recordingStatus || "",
                  )
                    ? "is-recording"
                    : ""
                }
                disabled={
                  Boolean(actionBusy) ||
                  !sessionData.recording.enabled ||
                  ["starting", "stopping", "processing"].includes(
                    recordingStatus || "",
                  )
                }
                onClick={() => void toggleRecording()}
                title={
                  sessionData.recording.enabled
                    ? t("classroom.v3.recordingMode", {
                        mode: recordingMode || t("classroom.v3.preparing"),
                      })
                    : t("classroom.v3.recordingNotConfigured")
                }
              >
                {recordingStatus === "recording" ? (
                  <CircleStop />
                ) : (
                  <Radio />
                )}
                <span>
                  {recordingStatus === "starting"
                    ? t("classroom.v3.recordingStarting")
                    : recordingStatus === "stopping"
                      ? t("classroom.v3.recordingStopping")
                      : recordingStatus === "processing"
                        ? t("classroom.v3.recordingProcessing")
                        : recordingStatus === "recording"
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

      <AnimatePresence>
        {!isRecorder &&
          currentMember?.screenShareState === "requested" && (
            <motion.div
              className="classroom-v3-invite is-screen-share"
              initial={{ opacity: 0, y: 28, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
            >
              <span><MonitorUp /></span>
              <div>
                <small>{t("classroom.v3.screenShareRequestEyebrow")}</small>
                <strong>{t("classroom.v3.screenShareRequestTitle")}</strong>
                <p>{t("classroom.v3.screenShareRequestHint")}</p>
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
                onClick={() => void performAction({ type: "acceptScreenShare" })}
              >
                {t("classroom.v3.accept")}
              </button>
            </motion.div>
          )}
      </AnimatePresence>

      <AnimatePresence>
        {!isRecorder &&
          currentMember?.screenShareState === "accepted" &&
          !controlMedia.local.screenSharing && (
            <motion.div
              className="classroom-v3-invite is-screen-share-ready"
              initial={{ opacity: 0, y: 28, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
            >
              <span><MonitorUp /></span>
              <div>
                <small>{t("classroom.v3.screenShareRequestEyebrow")}</small>
                <strong>{t("classroom.v3.screenShareReadyTitle")}</strong>
                <p>{t("classroom.v3.screenShareReadyHint")}</p>
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
                disabled={!studentPublishReady}
                onClick={toggleScreenShare}
              >
                {studentPublishReady
                  ? t("classroom.v3.startScreenShareNow")
                  : t("classroom.v3.preparing")}
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
