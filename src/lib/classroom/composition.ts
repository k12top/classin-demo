import type {
  ClassroomBoardItem,
  ClassroomBoardItemKind,
  ClassroomBoardRect,
  ClassroomCompositionSnapshot,
} from "@/lib/classroom/types";

export const CLASSROOM_COMPOSITION_VERSION = 1;
export const MAX_CLASSROOM_BOARD_ITEMS = 24;

const DEFAULT_RECTS: Record<ClassroomBoardItemKind, ClassroomBoardRect> = {
  camera: { x: 0.68, y: 0.05, width: 0.27, height: 0.23 },
  screen: { x: 0.08, y: 0.08, width: 0.78, height: 0.76 },
  courseware: { x: 0.08, y: 0.08, width: 0.78, height: 0.76 },
};

function finite(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function normalizeBoardRect(
  value: unknown,
  kind: ClassroomBoardItemKind = "camera",
): ClassroomBoardRect {
  const fallback = DEFAULT_RECTS[kind];
  const rect = value && typeof value === "object"
    ? value as Partial<ClassroomBoardRect>
    : {};
  const width = clamp(finite(rect.width, fallback.width), 0.14, 0.96);
  const height = clamp(finite(rect.height, fallback.height), 0.12, 0.94);
  return {
    x: clamp(finite(rect.x, fallback.x), 0, 1 - width),
    y: clamp(finite(rect.y, fallback.y), 0, 1 - height),
    width,
    height,
  };
}

export function defaultBoardRect(kind: ClassroomBoardItemKind) {
  return { ...DEFAULT_RECTS[kind] };
}

export function translateBoardRectByPixels(
  rect: ClassroomBoardRect,
  delta: { x: number; y: number },
  viewport: { width: number; height: number },
  kind: ClassroomBoardItemKind = "camera",
) {
  if (viewport.width <= 0 || viewport.height <= 0) {
    return normalizeBoardRect(rect, kind);
  }
  return normalizeBoardRect(
    {
      ...rect,
      x: rect.x + delta.x / viewport.width,
      y: rect.y + delta.y / viewport.height,
    },
    kind,
  );
}

function text(value: unknown, maximum = 160) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function uniqueIds(value: unknown, maximum = 64) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.map((item) => text(item)).filter(Boolean)),
  ).slice(0, maximum);
}

function boardItem(value: unknown, index: number): ClassroomBoardItem | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<ClassroomBoardItem>;
  const id = text(source.id);
  const sourceId = text(source.sourceId);
  const kind = source.kind === "camera" || source.kind === "screen" || source.kind === "courseware"
    ? source.kind
    : null;
  if (!id || !sourceId || !kind) return null;
  return {
    id,
    kind,
    sourceId,
    rect: normalizeBoardRect(source.rect, kind),
    zIndex: Math.max(1, Math.round(finite(source.zIndex, index + 1))),
    locked: source.locked === true,
    visible: source.visible !== false,
    shape:
      kind === "camera" && source.shape === "circle" ? "circle" : "rounded",
  };
}

export function emptyClassroomComposition(): ClassroomCompositionSnapshot {
  return {
    version: CLASSROOM_COMPOSITION_VERSION,
    seatOrder: [],
    boardItems: [],
    updatedBy: "",
    updatedAt: "",
  };
}

export function normalizeClassroomComposition(
  value: unknown,
): ClassroomCompositionSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return emptyClassroomComposition();
  }
  const source = value as Partial<ClassroomCompositionSnapshot>;
  const seen = new Set<string>();
  const boardItems = (Array.isArray(source.boardItems) ? source.boardItems : [])
    .map(boardItem)
    .filter((item): item is ClassroomBoardItem => {
      if (!item || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .slice(0, MAX_CLASSROOM_BOARD_ITEMS)
    .sort((left, right) => left.zIndex - right.zIndex)
    .map((item, index) => ({ ...item, zIndex: index + 1 }));
  return {
    version: CLASSROOM_COMPOSITION_VERSION,
    seatOrder: uniqueIds(source.seatOrder),
    boardItems,
    updatedBy: text(source.updatedBy),
    updatedAt: text(source.updatedAt, 64),
  };
}

export function touchComposition(
  composition: ClassroomCompositionSnapshot,
  userId: string,
  now = new Date(),
): ClassroomCompositionSnapshot {
  return {
    ...composition,
    version: CLASSROOM_COMPOSITION_VERSION,
    updatedBy: userId,
    updatedAt: now.toISOString(),
  };
}

export function orderClassroomSeats(
  requested: string[],
  availableUserIds: string[],
) {
  const available = new Set(uniqueIds(availableUserIds));
  const requestedAvailable = uniqueIds(requested).filter((id) => available.has(id));
  const requestedSet = new Set(requestedAvailable);
  return [
    ...requestedAvailable,
    ...availableUserIds.filter((id) => available.has(id) && !requestedSet.has(id)),
  ];
}

export function placeClassroomBoardItem(
  composition: ClassroomCompositionSnapshot,
  item: Omit<ClassroomBoardItem, "zIndex"> & { zIndex?: number },
) {
  const normalized = boardItem(
    {
      ...item,
      zIndex: item.zIndex ?? composition.boardItems.length + 1,
    },
    composition.boardItems.length,
  );
  if (!normalized) return composition;
  const withoutExistingSource = composition.boardItems.filter(
    (existing) =>
      existing.id !== normalized.id &&
      !(existing.kind === normalized.kind && existing.sourceId === normalized.sourceId),
  );
  return normalizeClassroomComposition({
    ...composition,
    boardItems: [...withoutExistingSource, normalized],
  });
}

export function updateClassroomBoardItem(
  composition: ClassroomCompositionSnapshot,
  itemId: string,
  update: {
    rect?: ClassroomBoardRect;
    locked?: boolean;
    visible?: boolean;
    shape?: "rounded" | "circle";
  },
) {
  return normalizeClassroomComposition({
    ...composition,
    boardItems: composition.boardItems.map((item) =>
      item.id === itemId
        ? {
            ...item,
            ...(update.rect && { rect: normalizeBoardRect(update.rect, item.kind) }),
            ...(typeof update.locked === "boolean" && { locked: update.locked }),
            ...(typeof update.visible === "boolean" && { visible: update.visible }),
            ...(item.kind === "camera" && update.shape && {
              shape: update.shape === "circle" ? "circle" : "rounded",
            }),
          }
        : item,
    ),
  });
}

export function bringClassroomBoardItemToFront(
  composition: ClassroomCompositionSnapshot,
  itemId: string,
) {
  const item = composition.boardItems.find((candidate) => candidate.id === itemId);
  if (!item) return composition;
  return normalizeClassroomComposition({
    ...composition,
    boardItems: [
      ...composition.boardItems.filter((candidate) => candidate.id !== itemId),
      {
        ...item,
        zIndex:
          Math.max(0, ...composition.boardItems.map((candidate) => candidate.zIndex)) + 1,
      },
    ],
  });
}
