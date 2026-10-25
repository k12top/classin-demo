"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Loader2, Plus, Search, Trash2, UserPlus, Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTranslation } from "@/lib/i18n/context";
import { avatarInitials } from "@/lib/user-avatar";
import { casdoorUserIdsMatch } from "@/lib/casdoor-user";
import { usePortalFeedback } from "./portal-feedback";
import type { TeacherDirectoryEntry } from "@/lib/teacher-directory-client";

type Member = { userId: string; userName?: string; userAvatar?: string; username?: string | null };
type Group = { id: string; name: string; members: Member[]; children?: Group[] };
function flatten(groups: Group[], prefix = ""): Group[] {
  return groups.flatMap(group => {
    const name = prefix ? `${prefix} / ${group.name}` : group.name;
    return [{ ...group, name }, ...flatten(group.children || [], name)];
  });
}
const PAGE_SIZE = 8;

export function StudentManager() {
  const { t, locale } = useTranslation();
  const { notify, confirmAction } = usePortalFeedback();
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [newName, setNewName] = useState("");
  const [groupQuery, setGroupQuery] = useState("");
  const [memberQuery, setMemberQuery] = useState("");
  const [page, setPage] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TeacherDirectoryEntry[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const mutationLock = useRef(false);
  const searchAbort = useRef<AbortController | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/groups", { signal, credentials: "same-origin" });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (!signal?.aborted) { setError(false); setGroups(flatten(data.groups || [])); }
    } catch {
      if (!signal?.aborted) setError(true);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) void load(controller.signal); });
    return () => { controller.abort(); searchAbort.current?.abort(); };
  }, [load]);

  const selected = groups.find(group => group.id === selectedId) || groups[0];
  const memberMatches = (selected?.members || []).filter(member =>
    [member.userName, member.username, member.userId].some(value => value?.toLocaleLowerCase().includes(memberQuery.trim().toLocaleLowerCase())));
  const pages = Math.max(1, Math.ceil(memberMatches.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const visibleMembers = memberMatches.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const mutate = async (body: Record<string, unknown>) => {
    if (mutationLock.current) return false;
    mutationLock.current = true;
    setBusy(true);
    try {
      const response = await fetch("/api/groups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error();
      const data = await response.json();
      await load();
      if (body.action === "create") { setSelectedId(data.group.id); setNewName(""); setMemberQuery(""); setPage(0); }
      return true;
    } catch { notify(t("common.failed"), "error"); return false; }
    finally { mutationLock.current = false; setBusy(false); }
  };
  const search = async () => {
    if (!query.trim()) return;
    searchAbort.current?.abort();
    const controller = new AbortController();
    searchAbort.current = controller;
    setSearching(true); setSearched(false); setResults([]);
    try {
      const response = await fetch(`/api/users/search?role=student&q=${encodeURIComponent(query.trim())}`, { signal: controller.signal });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (!controller.signal.aborted) { setResults(data.users || []); setSearched(true); }
    } catch { if (!controller.signal.aborted) notify(t("common.failed"), "error"); }
    finally { if (!controller.signal.aborted) setSearching(false); }
  };
  const deleteGroup = async () => {
    if (!selected || !await confirmAction({ description: t("teacherDashboard.deleteGroupConfirm"), tone: "danger" })) return;
    await mutate({ action: "delete", groupId: selected.id });
  };
  const remove = async (member: Member) => {
    if (!selected || !await confirmAction({ description: `${member.userName || member.userId} (${member.username || member.userId}) · ${t("teacherDashboard.removeMemberConfirm")}`, tone: "danger" })) return;
    await mutate({ action: "removeMembers", groupId: selected.id, userIds: [member.userId] });
  };

  return <section className="overflow-hidden rounded-2xl border border-border bg-card" aria-label={t("teacherDashboard.studentGroupManage")}>
    <div className="grid min-w-0 md:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="border-b border-border bg-muted/20 p-4 md:border-b-0 md:border-e">
        <h2 className="mb-4 flex items-center gap-2 font-semibold"><Users className="h-4 w-4" aria-hidden="true"/>{t("teacherDashboard.studentGroupManage")}</h2>
        <form className="mb-3 flex gap-2" onSubmit={event => { event.preventDefault(); if (newName.trim()) void mutate({ action: "create", name: newName.trim() }); }}>
          <Input value={newName} onChange={event => setNewName(event.target.value)} placeholder={t("teacherDashboard.newGroupPlaceholder")} aria-label={t("teacherDashboard.newGroupPlaceholder")} disabled={busy}/>
          <Button type="submit" variant="outline" size="icon" className="h-11 w-11 shrink-0" aria-label={t("teacherDashboard.btnCreate")} disabled={busy || !newName.trim()}><Plus className="h-4 w-4"/></Button>
        </form>
        {groups.length > 5 && <Input className="mb-3" value={groupQuery} onChange={event => setGroupQuery(event.target.value)} placeholder={t("portalUpdates.searchGroups")} aria-label={t("portalUpdates.searchGroups")}/>}
        <nav className="flex max-h-80 gap-2 overflow-auto md:block md:space-y-1" aria-label={t("teacherDashboard.studentGroupManage")}>
          {groups.filter(group => group.name.toLocaleLowerCase().includes(groupQuery.trim().toLocaleLowerCase())).map(group => <button type="button" key={group.id}
            aria-current={selected?.id === group.id ? "true" : undefined}
            onClick={() => { setSelectedId(group.id); setMemberQuery(""); setPage(0); }}
            className={`flex min-h-11 shrink-0 items-center justify-between gap-3 rounded-lg px-3 py-2 text-start text-sm md:w-full ${selected?.id === group.id ? "bg-primary/10 font-semibold text-primary" : "hover:bg-muted"}`}>
            <span className="max-w-44 truncate" title={group.name}>{group.name}</span><span className="tabular-nums text-muted-foreground">{group.members.length}</span>
          </button>)}
        </nav>
        {!loading && !error && !groups.length && <p className="py-4 text-sm text-muted-foreground">{t("teacherDashboard.groupEmpty")}</p>}
      </aside>
      <div className="min-w-0 p-4 sm:p-6">
        {loading ? <p className="flex min-h-64 items-center justify-center gap-2 text-sm" role="status"><Loader2 className="h-5 w-5 animate-spin"/>{t("common.loading")}</p>
          : error ? <div role="alert" className="space-y-3 py-8"><p>{t("common.failed")}</p><Button variant="outline" onClick={() => void load()}>{t("playback.retry")}</Button></div>
          : selected ? <>
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0"><h2 className="break-words text-lg font-semibold">{selected.name}</h2><p className="mt-1 text-sm text-muted-foreground">{t("common.roleStudent")}: {new Intl.NumberFormat(locale).format(selected.members.length)}</p></div>
            <div className="flex gap-2"><Button variant="outline" className="min-h-11" disabled={busy} onClick={() => setAddOpen(true)}><UserPlus className="me-2 h-4 w-4"/>{t("portalUpdates.addStudents")}</Button><Button variant="ghost" size="icon" className="h-11 w-11 text-destructive" disabled={busy} aria-label={t("portalUpdates.deleteGroup")} onClick={() => void deleteGroup()}><Trash2 className="h-4 w-4"/></Button></div>
          </header>
          <Input className="my-4" value={memberQuery} onChange={event => { setMemberQuery(event.target.value); setPage(0); }} placeholder={t("portalUpdates.searchMembers")} aria-label={t("portalUpdates.searchMembers")}/>
          <ul className="divide-y divide-border" aria-busy={busy}>
            {visibleMembers.map(member => <li key={member.userId} className="flex min-h-20 items-center gap-3 py-3">
              <Avatar className="h-10 w-10"><AvatarImage src={member.userAvatar} alt=""/><AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{avatarInitials(member.userName || member.username || member.userId)}</AvatarFallback></Avatar>
              <div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">{member.userName || member.username || member.userId}</p><p className="break-all text-xs text-muted-foreground">{t(member.username ? "portalUpdates.username" : "portalUpdates.userId")}: {member.username || member.userId}</p></div>
              <Button type="button" variant="ghost" className="min-h-11 shrink-0 text-xs text-destructive" disabled={busy} onClick={() => void remove(member)}>{t("portalUpdates.removeMember")}</Button>
            </li>)}
          </ul>
          {!visibleMembers.length && <p className="py-16 text-center text-sm text-muted-foreground">{t(memberQuery ? "teacherDashboard.searchUserNotFound" : "teacherDashboard.groupMemberEmpty")}</p>}
          {pages > 1 && <nav className="mt-4 flex items-center justify-between border-t border-border pt-4" aria-label={t("portalUpdates.pagination")}>
            <Button variant="outline" className="min-h-11" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft className="me-1 h-4 w-4"/>{t("portalUpdates.previous")}</Button>
            <p className="text-xs tabular-nums text-muted-foreground" aria-live="polite">{t("portalUpdates.page", { page: currentPage + 1, pages })}</p>
            <Button variant="outline" className="min-h-11" disabled={currentPage === pages - 1} onClick={() => setPage(currentPage + 1)}>{t("portalUpdates.next")}<ChevronRight className="ms-1 h-4 w-4"/></Button>
          </nav>}
        </> : <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center text-muted-foreground"><Users className="h-8 w-8"/><p>{t("portalUpdates.createGroupHint")}</p></div>}
      </div>
    </div>
    <Dialog open={addOpen} onOpenChange={open => { setAddOpen(open); if (!open) searchAbort.current?.abort(); }}>
      <DialogContent className="max-w-xl"><DialogHeader><DialogTitle>{t("portalUpdates.addStudents")}</DialogTitle><DialogDescription>{t("portalUpdates.addToGroup", { group: selected?.name || "" })}</DialogDescription></DialogHeader>
        <form className="flex gap-2" onSubmit={event => { event.preventDefault(); void search(); }}><Input aria-label={t("teacherDashboard.searchPlaceholder")} placeholder={t("teacherDashboard.searchPlaceholder")} value={query} onChange={event => { searchAbort.current?.abort(); setSearching(false); setQuery(event.target.value); setResults([]); setSearched(false); }}/><Button type="submit" disabled={searching || !query.trim()} className="min-h-11">{searching ? <Loader2 className="h-4 w-4 animate-spin"/> : <Search className="h-4 w-4"/>}<span className="ms-2">{t("teacherDashboard.btnSearch")}</span></Button></form>
        <div className="max-h-[50svh] overflow-auto" aria-live="polite" aria-busy={searching}>
          {results.map(student => {
            const enrolled = selected?.members.some(member => casdoorUserIdsMatch(member.userId, student.id) || Boolean(student.casdoorUuid && casdoorUserIdsMatch(member.userId, student.casdoorUuid)));
            return <div key={student.id} className="flex items-center gap-3 border-b border-border py-3 last:border-0">
              <Avatar><AvatarImage src={student.avatar} alt=""/><AvatarFallback className="text-xs">{avatarInitials(student.displayName || student.name)}</AvatarFallback></Avatar>
              <div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">{student.displayName || student.name}</p><p className="break-all text-xs text-muted-foreground">{t("portalUpdates.username")}: {student.name}</p>{student.email && <p className="break-all text-xs text-muted-foreground">{student.email}</p>}</div>
              <Button variant="outline" className="min-h-11 shrink-0 text-xs" disabled={busy || enrolled || !selected} onClick={() => selected && void mutate({ action: "addMembers", groupId: selected.id, members: [{ userId: student.id, userName: student.displayName || student.name, userAvatar: student.avatar || "" }] })}>{enrolled && <Check className="me-1 h-4 w-4"/>}{t(enrolled ? "portalUpdates.alreadyMember" : "teacherDashboard.btnAddToGroup")}</Button>
            </div>;
          })}
          {!results.length && <p className="py-12 text-center text-sm text-muted-foreground">{t(searching ? "common.loading" : searched ? "teacherDashboard.searchUserNotFound" : "teacherDashboard.searchDesc")}</p>}
        </div>
      </DialogContent>
    </Dialog>
  </section>;
}
