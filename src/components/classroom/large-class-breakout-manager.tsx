"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Camera,
  CameraOff,
  ChevronDown,
  DoorClosed,
  DoorOpen,
  Loader2,
  Mic,
  MicOff,
  MonitorUp,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTranslation } from "@/lib/i18n/context";
import type {
  ClassroomSpaceMemberSnapshot,
  ClassroomSpaceSnapshot,
} from "@/lib/classroom/types";
import styles from "./large-class-breakout-manager.module.css";

type TeacherSummary = {
  teacherId: string;
  teacherName: string;
  teacherAvatar?: string;
};

type StudentSummary = {
  studentId: string;
  studentName: string;
  studentAvatar?: string;
};

type GroupNode = {
  members?: Array<{
    userId: string;
    userName?: string;
    userAvatar?: string;
  }>;
  children?: GroupNode[];
};

type RosterMember = {
  userId: string;
  displayName: string;
  avatar: string;
  role: "assistant" | "student";
};

type LargeClassBreakoutManagerProps = {
  courseId: string;
  canManage: boolean;
  leadTeacherId: string;
  teachers: TeacherSummary[];
  students: StudentSummary[];
  groupLinks: Array<{ group: GroupNode }>;
  onManageRoster: (role: "assistant" | "student") => void;
};

type SpacesResponse = {
  enabled?: boolean;
  spaces?: ClassroomSpaceSnapshot[];
  error?: string;
};

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase() || "?";
}

function collectGroupMembers(nodes: GroupNode[], target: Map<string, RosterMember>) {
  for (const node of nodes) {
    for (const member of node.members ?? []) {
      if (!target.has(member.userId)) {
        target.set(member.userId, {
          userId: member.userId,
          displayName: member.userName || member.userId,
          avatar: member.userAvatar || "",
          role: "student",
        });
      }
    }
    collectGroupMembers(node.children ?? [], target);
  }
}

function MemberAvatar({ member }: { member: Pick<RosterMember, "displayName" | "avatar"> }) {
  return (
    <Avatar className={styles.avatar}>
      <AvatarImage src={member.avatar || ""} alt="" />
      <AvatarFallback>{initials(member.displayName)}</AvatarFallback>
    </Avatar>
  );
}

export function LargeClassBreakoutManager({
  courseId,
  canManage,
  leadTeacherId,
  teachers,
  students,
  groupLinks,
  onManageRoster,
}: LargeClassBreakoutManagerProps) {
  const { t } = useTranslation();
  const [spaces, setSpaces] = useState<ClassroomSpaceSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const [roomCount, setRoomCount] = useState(4);
  const [capacity, setCapacity] = useState(20);
  const [expandedRooms, setExpandedRooms] = useState<Set<string>>(new Set());
  const [resetArmed, setResetArmed] = useState(false);

  const roster = useMemo(() => {
    const result = new Map<string, RosterMember>();
    for (const teacher of teachers) {
      if (teacher.teacherId === leadTeacherId) continue;
      result.set(teacher.teacherId, {
        userId: teacher.teacherId,
        displayName: teacher.teacherName || teacher.teacherId,
        avatar: teacher.teacherAvatar || "",
        role: "assistant",
      });
    }
    for (const student of students) {
      result.set(student.studentId, {
        userId: student.studentId,
        displayName: student.studentName || student.studentId,
        avatar: student.studentAvatar || "",
        role: "student",
      });
    }
    collectGroupMembers(groupLinks.map((link) => link.group), result);
    return [...result.values()];
  }, [groupLinks, leadTeacherId, students, teachers]);

  const assistants = useMemo(
    () => roster.filter((member) => member.role === "assistant"),
    [roster],
  );
  const studentRoster = useMemo(
    () => roster.filter((member) => member.role === "student"),
    [roster],
  );

  const loadSpaces = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/courses/${courseId}/classroom/spaces`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = (await response.json().catch(() => null)) as SpacesResponse | null;
      if (!response.ok) {
        throw new Error(data?.error || t("courseDetail.breakouts.loadFailed"));
      }
      setSpaces(data?.spaces ?? []);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t("courseDetail.breakouts.loadFailed"),
      );
    } finally {
      setLoading(false);
    }
  }, [courseId, t]);

  useEffect(() => {
    queueMicrotask(() => void loadSpaces());
  }, [loadSpaces]);

  const mutate = useCallback(
    async (
      key: string,
      method: "POST" | "PATCH" | "DELETE",
      body?: Record<string, unknown>,
    ) => {
      setBusyKey(key);
      setError("");
      try {
        const response = await fetch(`/api/courses/${courseId}/classroom/spaces`, {
          method,
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body ?? {}),
        });
        const data = (await response.json().catch(() => null)) as SpacesResponse | null;
        if (!response.ok) {
          throw new Error(data?.error || t("courseDetail.breakouts.actionFailed"));
        }
        setSpaces(method === "DELETE" ? [] : data?.spaces ?? []);
        if (method === "DELETE") setResetArmed(false);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : t("courseDetail.breakouts.actionFailed"),
        );
      } finally {
        setBusyKey("");
      }
    },
    [courseId, t],
  );

  const assignMember = (spaceId: string, value: string) => {
    const [role, targetUserId] = value.split(":", 2);
    if (!targetUserId || (role !== "assistant" && role !== "student")) return;
    void mutate(`assign:${spaceId}:${targetUserId}`, "PATCH", {
      action: "assign",
      spaceId,
      targetUserId,
      role,
    });
  };

  const updatePermission = (
    spaceId: string,
    member: ClassroomSpaceMemberSnapshot,
    permission: "microphoneAllowed" | "cameraAllowed" | "screenShareAllowed",
  ) => {
    void mutate(`permission:${spaceId}:${member.userId}:${permission}`, "PATCH", {
      action: "permissions",
      spaceId,
      targetUserId: member.userId,
      [permission]: !member[permission],
    });
  };

  const assignedStudentCount = spaces.reduce(
    (total, space) =>
      total + space.members.filter((member) => member.role === "student").length,
    0,
  );
  const assignedAssistantCount = spaces.reduce(
    (total, space) =>
      total + space.members.filter((member) => member.role === "assistant").length,
    0,
  );
  const openRoomCount = spaces.filter((space) => space.status === "open").length;

  if (loading) {
    return (
      <div className={styles.loading}>
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>{t("common.loading")}</span>
      </div>
    );
  }

  return (
    <section className={styles.manager} aria-labelledby="breakout-manager-title">
      <header className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>{t("courseDetail.breakouts.eyebrow")}</span>
          <h2 id="breakout-manager-title">{t("courseDetail.breakouts.title")}</h2>
          <p>{t("courseDetail.breakouts.description")}</p>
        </div>
        <button
          type="button"
          className={styles.iconButton}
          onClick={() => void loadSpaces()}
          aria-label={t("courseDetail.breakouts.refresh")}
          title={t("courseDetail.breakouts.refresh")}
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </header>

      {error ? (
        <div className={styles.error} role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => void loadSpaces()}>
            {t("common.retry")}
          </button>
        </div>
      ) : null}

      {!canManage ? (
        <div className={styles.readOnlyNotice}>
          <ShieldCheck className="h-4 w-4" />
          <span>{t("courseDetail.breakouts.assistantHint")}</span>
        </div>
      ) : null}

      {canManage && spaces.length > 0 && (!assistants.length || !studentRoster.length) ? (
        <div className={styles.rosterPrompt}>
          <div className={styles.rosterPromptCopy}>
            <span className={styles.rosterPromptIcon}>
              <UserPlus className="h-4 w-4" />
            </span>
            <div>
              <strong>{t("courseDetail.breakouts.rosterNeeded")}</strong>
              <span>{t("courseDetail.breakouts.rosterNeededDescription")}</span>
            </div>
          </div>
          <div className={styles.rosterPromptActions}>
            {!assistants.length ? (
              <button type="button" onClick={() => onManageRoster("assistant")}>
                <ShieldCheck className="h-4 w-4" />
                {t("courseDetail.breakouts.addManagers")}
              </button>
            ) : null}
            {!studentRoster.length ? (
              <button type="button" onClick={() => onManageRoster("student")}>
                <Users className="h-4 w-4" />
                {t("courseDetail.breakouts.addStudents")}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {spaces.length === 0 ? (
        <div className={styles.emptySetup}>
          <div className={styles.emptyCopy}>
            <span className={styles.emptyIcon}><Users className="h-5 w-5" /></span>
            <div>
              <h3>{t("courseDetail.breakouts.emptyTitle")}</h3>
              <p>{t("courseDetail.breakouts.emptyDescription")}</p>
            </div>
          </div>
          {canManage ? (
            <div className={styles.setupControls}>
              <label>
                <span>{t("courseDetail.breakouts.roomCount")}</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={roomCount}
                  onChange={(event) => setRoomCount(Number(event.target.value))}
                />
              </label>
              <label>
                <span>{t("courseDetail.breakouts.capacity")}</span>
                <input
                  type="number"
                  min={2}
                  max={50}
                  value={capacity}
                  onChange={(event) => setCapacity(Number(event.target.value))}
                />
              </label>
              <button
                type="button"
                className={styles.primaryButton}
                disabled={Boolean(busyKey)}
                onClick={() =>
                  void mutate("create", "POST", { count: roomCount, capacity })
                }
              >
                {busyKey === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                {t("courseDetail.breakouts.create")}
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <div className={styles.summaryBar}>
            <div className={styles.metrics}>
              <span><strong>{spaces.length}</strong>{t("courseDetail.breakouts.rooms")}</span>
              <span><strong>{assignedStudentCount}</strong>{t("courseDetail.breakouts.students")}</span>
              <span><strong>{assignedAssistantCount}</strong>{t("courseDetail.breakouts.managers")}</span>
              <span className={openRoomCount ? styles.liveMetric : ""}>
                <strong>{openRoomCount}</strong>{t("courseDetail.breakouts.openRooms")}
              </span>
            </div>
            {canManage ? (
              <div className={styles.globalActions}>
                <button
                  type="button"
                  onClick={() => void mutate("auto", "PATCH", { action: "autoAssign" })}
                  disabled={Boolean(busyKey) || roster.length === 0}
                  title={roster.length === 0 ? t("courseDetail.breakouts.rosterNeededDescription") : undefined}
                >
                  <RefreshCw className="h-4 w-4" />
                  {t("courseDetail.breakouts.autoAssign")}
                </button>
                <button
                  type="button"
                  onClick={() => void mutate("open:all", "PATCH", { action: "open" })}
                  disabled={Boolean(busyKey)}
                >
                  <DoorOpen className="h-4 w-4" />
                  {t("courseDetail.breakouts.openAll")}
                </button>
                <button
                  type="button"
                  onClick={() => void mutate("close:all", "PATCH", { action: "close" })}
                  disabled={Boolean(busyKey)}
                >
                  <DoorClosed className="h-4 w-4" />
                  {t("courseDetail.breakouts.closeAll")}
                </button>
              </div>
            ) : null}
          </div>

          <div className={styles.roomList}>
            {spaces.map((space) => {
              const roomAssistants = space.members.filter((member) => member.role === "assistant");
              const roomStudents = space.members.filter((member) => member.role === "student");
              const expanded = expandedRooms.has(space.id);
              const visibleStudents = expanded ? roomStudents : roomStudents.slice(0, 8);
              return (
                <article className={styles.roomRow} key={space.id}>
                  <div className={styles.roomIdentity}>
                    <span className={`${styles.statusDot} ${styles[space.status]}`} />
                    <div>
                      <h3>{space.name}</h3>
                      <p>
                        {roomStudents.length}/{space.capacity ?? "∞"} · {t(`courseDetail.breakouts.status.${space.status}`)}
                      </p>
                    </div>
                    {canManage ? (
                      <button
                        type="button"
                        className={styles.roomToggle}
                        disabled={Boolean(busyKey)}
                        onClick={() =>
                          void mutate(`${space.status === "open" ? "close" : "open"}:${space.id}`, "PATCH", {
                            action: space.status === "open" ? "close" : "open",
                            spaceId: space.id,
                          })
                        }
                      >
                        {space.status === "open" ? t("courseDetail.breakouts.closeRoom") : t("courseDetail.breakouts.openRoom")}
                      </button>
                    ) : null}
                  </div>

                  <div className={styles.roomPeople}>
                    <div className={styles.peopleLine}>
                      <span className={styles.lineLabel}>{t("courseDetail.breakouts.manager")}</span>
                      <div className={styles.peopleContent}>
                        {roomAssistants.length ? roomAssistants.map((member) => (
                          <MemberChip
                            key={member.userId}
                            member={member}
                            spaceId={space.id}
                            canManage={canManage}
                            busy={busyKey.includes(member.userId)}
                            onPermission={updatePermission}
                            onRemove={() => void mutate(`remove:${space.id}:${member.userId}`, "PATCH", {
                              action: "removeMember",
                              spaceId: space.id,
                              targetUserId: member.userId,
                            })}
                          />
                        )) : <span className={styles.emptyPerson}>{t("courseDetail.breakouts.noManager")}</span>}
                        {canManage ? assistants.length ? (
                          <AssignmentSelect
                            label={t("courseDetail.breakouts.assignManager")}
                            role="assistant"
                            members={assistants}
                            onAssign={(value) => assignMember(space.id, value)}
                          />
                        ) : (
                          <AssignmentEmptyButton
                            label={t("courseDetail.breakouts.assignManager")}
                            onClick={() => onManageRoster("assistant")}
                          />
                        ) : null}
                      </div>
                    </div>

                    <div className={styles.peopleLine}>
                      <span className={styles.lineLabel}>{t("courseDetail.breakouts.studentsLabel")}</span>
                      <div className={styles.peopleContent}>
                        {visibleStudents.length ? visibleStudents.map((member) => (
                          <MemberChip
                            key={member.userId}
                            member={member}
                            spaceId={space.id}
                            canManage={canManage}
                            busy={busyKey.includes(member.userId)}
                            onPermission={updatePermission}
                            onRemove={() => void mutate(`remove:${space.id}:${member.userId}`, "PATCH", {
                              action: "removeMember",
                              spaceId: space.id,
                              targetUserId: member.userId,
                            })}
                          />
                        )) : <span className={styles.emptyPerson}>{t("courseDetail.breakouts.noStudents")}</span>}
                        {roomStudents.length > 8 ? (
                          <button
                            type="button"
                            className={styles.moreButton}
                            onClick={() => setExpandedRooms((current) => {
                              const next = new Set(current);
                              if (next.has(space.id)) next.delete(space.id);
                              else next.add(space.id);
                              return next;
                            })}
                          >
                            {expanded
                              ? t("courseDetail.breakouts.collapse")
                              : t("courseDetail.breakouts.more", { count: roomStudents.length - 8 })}
                            <ChevronDown className={expanded ? styles.chevronOpen : ""} />
                          </button>
                        ) : null}
                        {canManage ? studentRoster.length ? (
                          <AssignmentSelect
                            label={t("courseDetail.breakouts.assignStudent")}
                            role="student"
                            members={studentRoster}
                            onAssign={(value) => assignMember(space.id, value)}
                          />
                        ) : (
                          <AssignmentEmptyButton
                            label={t("courseDetail.breakouts.assignStudent")}
                            onClick={() => onManageRoster("student")}
                          />
                        ) : null}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {canManage ? (
            <footer className={styles.dangerZone}>
              <span>{t("courseDetail.breakouts.resetHint")}</span>
              <div>
                {resetArmed ? (
                  <button type="button" onClick={() => setResetArmed(false)}>
                    {t("common.cancel")}
                  </button>
                ) : null}
                <button
                  type="button"
                  className={resetArmed ? styles.dangerButton : ""}
                  disabled={Boolean(busyKey)}
                  onClick={() => {
                    if (!resetArmed) {
                      setResetArmed(true);
                      return;
                    }
                    void mutate("reset", "DELETE");
                  }}
                >
                  {busyKey === "reset" ? <Loader2 className="h-4 w-4 animate-spin" /> : resetArmed ? <Trash2 className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                  {resetArmed ? t("courseDetail.breakouts.confirmReset") : t("courseDetail.breakouts.reset")}
                </button>
              </div>
            </footer>
          ) : null}
        </>
      )}
    </section>
  );
}

function AssignmentSelect({
  label,
  role,
  members,
  onAssign,
}: {
  label: string;
  role: "assistant" | "student";
  members: RosterMember[];
  onAssign: (value: string) => void;
}) {
  return (
    <label className={styles.assignmentSelect} title={label}>
      <UserPlus className="h-3.5 w-3.5" />
      <span className="sr-only">{label}</span>
      <select value="" onChange={(event) => onAssign(event.target.value)}>
        <option value="" disabled>{label}</option>
        {members.map((member) => (
          <option key={member.userId} value={`${role}:${member.userId}`}>
            {member.displayName}
          </option>
        ))}
      </select>
    </label>
  );
}

function AssignmentEmptyButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className={styles.assignmentEmptyButton} onClick={onClick}>
      <UserPlus className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function MemberChip({
  member,
  spaceId,
  canManage,
  busy,
  onPermission,
  onRemove,
}: {
  member: ClassroomSpaceMemberSnapshot;
  spaceId: string;
  canManage: boolean;
  busy: boolean;
  onPermission: (
    spaceId: string,
    member: ClassroomSpaceMemberSnapshot,
    permission: "microphoneAllowed" | "cameraAllowed" | "screenShareAllowed",
  ) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={styles.memberChip} data-role={member.role}>
      <MemberAvatar member={member} />
      <span className={styles.memberName}>{member.displayName}</span>
      {member.role === "assistant" ? <ShieldCheck className={styles.roleIcon} /> : null}
      {canManage ? (
        <span className={styles.memberActions}>
          <button
            type="button"
            disabled={busy}
            className={member.microphoneAllowed ? styles.permissionOn : ""}
            onClick={() => onPermission(spaceId, member, "microphoneAllowed")}
            title={member.microphoneAllowed ? t("courseDetail.breakouts.revokeMicrophone") : t("courseDetail.breakouts.allowMicrophone")}
          >
            {member.microphoneAllowed ? <Mic /> : <MicOff />}
          </button>
          <button
            type="button"
            disabled={busy}
            className={member.cameraAllowed ? styles.permissionOn : ""}
            onClick={() => onPermission(spaceId, member, "cameraAllowed")}
            title={member.cameraAllowed ? t("courseDetail.breakouts.revokeCamera") : t("courseDetail.breakouts.allowCamera")}
          >
            {member.cameraAllowed ? <Camera /> : <CameraOff />}
          </button>
          <button
            type="button"
            disabled={busy}
            className={member.screenShareAllowed ? styles.permissionOn : ""}
            onClick={() => onPermission(spaceId, member, "screenShareAllowed")}
            title={member.screenShareAllowed ? t("courseDetail.breakouts.revokeScreen") : t("courseDetail.breakouts.allowScreen")}
          >
            <MonitorUp />
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onRemove}
            title={t("courseDetail.breakouts.remove")}
          >
            <Trash2 />
          </button>
        </span>
      ) : null}
    </div>
  );
}
