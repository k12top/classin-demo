"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Calendar as CalendarIcon, Users, Settings, LogOut, ChevronLeft, ChevronRight, PlayCircle, Plus, Search, Trash2, Link as LinkIcon, Edit, UserPlus, Info, Clock } from "lucide-react";

const ROOM_TYPES = [
  { value: 0, label: "一对一课堂", desc: "1v1 私教模式", icon: "👤" },
  { value: 4, label: "小班课", desc: "适合 2~16 人", icon: "👥" },
  { value: 2, label: "大班课", desc: "适合大规模直播教学", icon: "🏫" },
];

interface Course {
  id: string;
  name: string;
  description: string;
  roomType: number;
  teacherId: string;
  teacherName: string;
  status: string;
  startTime: string | null;
  endTime: string | null;
  studentRemarks: string;
  createdAt: string;
  updatedAt: string;
  students?: { studentId: string; studentName: string }[];
  activeJoinLinks?: { id: string; label: string; joinUrl: string; useCount: number }[];
}

interface GroupNode {
  id: string;
  name: string;
  members: { userId: string; userName?: string }[];
  children?: GroupNode[];
}

const ROOM_TYPE_LABELS: Record<number, string> = {
  0: "一对一",
  4: "小班",
  2: "大班",
};

type SidebarPage = "schedule" | "students" | "settings";

export default function TeacherDashboard({ courses, user, fetchCourses }: { courses: Course[], user: any, fetchCourses: () => void }) {
  const router = useRouter();
  const { logout } = useAuth();
  const [activePage, setActivePage] = useState<SidebarPage>("schedule");
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [enteringCourseId, setEnteringCourseId] = useState<string | null>(null);

  // Create course dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createRoomType, setCreateRoomType] = useState(0);
  const [createStartTime, setCreateStartTime] = useState("");
  const [createEndTime, setCreateEndTime] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");

  // Student management state
  const [myGroups, setMyGroups] = useState<GroupNode[]>([]);
  const [newGroupName, setNewGroupName] = useState("");
  const [groupBusy, setGroupBusy] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; name: string; displayName: string; email: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [memberTargetGroupId, setMemberTargetGroupId] = useState("");

  const fetchMyGroups = useCallback(async () => {
    const res = await fetch("/api/groups", { credentials: "same-origin" });
    if (res.ok) {
      const data = await res.json();
      setMyGroups(data.groups ?? []);
    }
  }, []);

  useEffect(() => {
    if (activePage === "students") {
      fetchMyGroups();
    }
  }, [activePage, fetchMyGroups]);

  const handleStatusChange = async (courseId: string, status: string) => {
    if (!confirm(`确定将课程标记为 ${status === 'finished' ? '已结束' : '已取消'} 吗？`)) return;
    try {
      const res = await fetch(`/api/courses/${courseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        fetchCourses();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const isSameDay = (d1: Date, d2: Date) => {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
  };

  const selectedCourses = useMemo(() => {
    return courses
      .filter((c) => {
        if (!c.startTime) return false;
        return isSameDay(new Date(c.startTime), selectedDate);
      })
      .sort(
        (a, b) =>
          new Date(a.startTime!).getTime() - new Date(b.startTime!).getTime()
      );
  }, [courses, selectedDate]);

  const coursesMissingStartTime = useMemo(
    () => courses.filter((c) => !c.startTime),
    [courses]
  );

  const shiftCalendarMonth = (delta: number) => {
    setSelectedDate((prev) => {
      const y = prev.getFullYear();
      const m = prev.getMonth() + delta;
      const day = prev.getDate();
      const lastDayOfTargetMonth = new Date(y, m + 1, 0).getDate();
      return new Date(y, m, Math.min(day, lastDayOfTargetMonth));
    });
  };

  const handleEnterClassroomFromList = async (course: Course) => {
    if (course.status === "finished" || course.status === "cancelled") return;
    setEnteringCourseId(course.id);
    try {
      const res = await fetch(`/api/courses/${course.id}/verify-access`, {
        credentials: "same-origin",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.allowed) {
        alert(data.reason || "无法进入课堂");
        return;
      }
      const roomUuid = course.id.replace(/-/g, "").slice(0, 16);
      router.push(
        `/classroom?${new URLSearchParams({
          roomUuid,
          roomType: String(course.roomType),
          roomName: course.name,
          courseId: course.id,
        }).toString()}`
      );
    } catch {
      alert("进入课堂失败，请稍后重试");
    } finally {
      setEnteringCourseId(null);
    }
  };

  const copyShareUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      alert("链接已复制");
    } catch {
      alert("复制失败，请手动选择链接复制");
    }
  };

  const handleCreateCourse = async () => {
    if (!createName.trim()) { setCreateError("请输入课程名称"); return; }
    if (!createStartTime) { setCreateError("请选择开始时间"); return; }
    if (!createEndTime) { setCreateError("请选择结束时间"); return; }
    if (new Date(createEndTime) <= new Date(createStartTime)) { setCreateError("结束时间必须晚于开始时间"); return; }
    setCreateLoading(true);
    setCreateError("");
    try {
      const res = await fetch("/api/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName,
          description: createDesc,
          roomType: createRoomType,
          startTime: new Date(createStartTime).toISOString(),
          endTime: new Date(createEndTime).toISOString(),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "创建失败");
      }
      const { course } = await res.json();
      setCreateOpen(false);
      setCreateName(""); setCreateDesc(""); setCreateRoomType(0); setCreateStartTime(""); setCreateEndTime("");
      fetchCourses();
      router.push(`/courses/${course.id}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "创建失败");
    } finally {
      setCreateLoading(false);
    }
  };

  const generateCalendarDays = () => {
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const days = [];
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }
    return days;
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchError("");
    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery)}`, { credentials: "same-origin" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSearchResults(data.users ?? []);
        if (!data.users?.length) setSearchError("未找到匹配用户");
      } else {
        setSearchResults([]);
        setSearchError(data.hint || data.error || "搜索失败");
      }
    } catch {
      setSearchResults([]);
      setSearchError("搜索失败，请检查网络");
    } finally {
      setSearching(false);
    }
  };

  const handleCreateGroup = async () => {
    const name = newGroupName.trim();
    if (!name) return;
    setGroupBusy(true);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", name }),
      });
      if (res.ok) {
        setNewGroupName("");
        await fetchMyGroups();
      }
    } finally {
      setGroupBusy(false);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm("确定删除该学生组？")) return;
    setGroupBusy(true);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", groupId }),
      });
      if (res.ok) await fetchMyGroups();
    } finally {
      setGroupBusy(false);
    }
  };

  const handleAddUserToGroup = async (u: { id: string; name: string; displayName: string }) => {
    if (!memberTargetGroupId) {
      alert("请先选择要加入的学生组");
      return;
    }
    setGroupBusy(true);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addMembers",
          groupId: memberTargetGroupId,
          members: [{ userId: u.id, userName: u.displayName || u.name }],
        }),
      });
      if (res.ok) await fetchMyGroups();
    } finally {
      setGroupBusy(false);
    }
  };

  const handleRemoveMember = async (groupId: string, userId: string) => {
    if (!confirm("确定移除该成员？")) return;
    setGroupBusy(true);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "removeMembers", groupId, userIds: [userId] }),
      });
      if (res.ok) await fetchMyGroups();
    } finally {
      setGroupBusy(false);
    }
  };

  function countMembers(g: GroupNode): number {
    let n = g.members?.length ?? 0;
    for (const c of g.children ?? []) n += countMembers(c);
    return n;
  }

  function flattenGroups(roots: GroupNode[], prefix = ""): { id: string; label: string }[] {
    const rows: { id: string; label: string }[] = [];
    for (const g of roots) {
      const label = prefix ? `${prefix} / ${g.name}` : g.name;
      rows.push({ id: g.id, label });
      if (g.children?.length) rows.push(...flattenGroups(g.children, label));
    }
    return rows;
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-64 border-r border-white/10 bg-black/20 backdrop-blur-xl flex flex-col hidden md:flex">
        <div className="p-6">
          <div className="flex items-center gap-4 mb-8">
            <Avatar className="h-12 w-12 border border-purple-500/30 shadow-glow-purple">
              <AvatarImage src={user.avatar} />
              <AvatarFallback className="bg-purple-500/20 text-purple-400">{user.displayName?.[0] || 'T'}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <span className="font-semibold text-foreground truncate w-32">{user.displayName || user.name}</span>
              <Badge variant="secondary" className="w-fit text-[10px] mt-1 bg-purple-500/20 text-purple-300 hover:bg-purple-500/30">Teacher</Badge>
            </div>
          </div>
          <nav className="space-y-2">
            <Button 
              variant={activePage === 'schedule' ? 'secondary' : 'ghost'} 
              className={`w-full justify-start ${activePage === 'schedule' ? 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30' : ''}`}
              onClick={() => setActivePage('schedule')}
            >
              <CalendarIcon className="mr-2 h-4 w-4" /> 我的课表
            </Button>
            <Button 
              variant={activePage === 'students' ? 'secondary' : 'ghost'} 
              className={`w-full justify-start ${activePage === 'students' ? 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30' : ''}`}
              onClick={() => setActivePage('students')}
            >
              <Users className="mr-2 h-4 w-4" /> 学生管理
            </Button>
            <Button 
              variant={activePage === 'settings' ? 'secondary' : 'ghost'} 
              className={`w-full justify-start ${activePage === 'settings' ? 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30' : ''}`}
              onClick={() => setActivePage('settings')}
            >
              <Settings className="mr-2 h-4 w-4" /> 个人设置
            </Button>
          </nav>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-6 md:p-10 relative">
        {/* ──── Schedule Page ──── */}
        {activePage === "schedule" && (
          <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h2 className="text-3xl font-bold">我的课表</h2>
                <p className="text-muted-foreground mt-1">管理您的每日课程和教室。</p>
              </div>
              <Button onClick={() => { setCreateError(""); setCreateOpen(true); }} className="bg-purple-600 hover:bg-purple-700 text-white shadow-glow-purple">
                <Plus className="mr-2 h-4 w-4" /> 创建课程
              </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Calendar Sidebar */}
              <div className="lg:col-span-4 xl:col-span-3">
                <Card className="glass-panel border-white/10 bg-black/40">
                  <div className="p-4 flex items-center justify-between border-b border-white/10">
                    <Button variant="ghost" size="icon" onClick={() => shiftCalendarMonth(-1)}><ChevronLeft className="h-4 w-4" /></Button>
                    <span className="font-semibold">{selectedDate.getFullYear()}年 {selectedDate.getMonth() + 1}月</span>
                    <Button variant="ghost" size="icon" onClick={() => shiftCalendarMonth(1)}><ChevronRight className="h-4 w-4" /></Button>
                  </div>
                  <div className="p-4">
                    <div className="grid grid-cols-7 gap-1 text-center mb-2">
                      {['日', '一', '二', '三', '四', '五', '六'].map(d => (
                        <div key={d} className="text-xs font-medium text-muted-foreground py-1">{d}</div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                      {generateCalendarDays().map((date, idx) => {
                        if (!date) return <div key={idx} className="h-8" />;
                        const isSelected = isSameDay(date, selectedDate);
                        const isToday = isSameDay(date, new Date());
                        const hasCourse = courses.some(c => c.startTime && isSameDay(new Date(c.startTime), date));
                        
                        return (
                          <button
                            key={idx}
                            onClick={() => setSelectedDate(new Date(date.getFullYear(), date.getMonth(), date.getDate()))}
                            className={`
                              relative h-8 rounded-full flex items-center justify-center text-sm transition-all
                              ${isSelected ? 'bg-purple-600 text-white font-bold shadow-md' : 'hover:bg-white/10 text-foreground'}
                              ${isToday && !isSelected ? 'text-purple-400 font-bold' : ''}
                            `}
                          >
                            {date.getDate()}
                            {hasCourse && !isSelected && (
                              <span className="absolute bottom-1 w-1 h-1 rounded-full bg-purple-500"></span>
                            )}
                            {hasCourse && isSelected && (
                              <span className="absolute bottom-1 w-1 h-1 rounded-full bg-white"></span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </Card>
              </div>

              {/* Daily Schedule List */}
              <div className="lg:col-span-8 xl:col-span-9 space-y-6">
                <div>
                  <h3 className="text-xl font-semibold flex items-center gap-2">
                    {selectedDate.getMonth() + 1}月{selectedDate.getDate()}日 安排
                  </h3>
                </div>
                
                {selectedCourses.length === 0 ? (
                  <Card className="glass-panel border-white/10 bg-white/5 border-dashed p-12 text-center flex flex-col items-center">
                    <CalendarIcon className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
                    <p className="text-muted-foreground font-medium">该日没有排课。</p>
                    {(coursesMissingStartTime?.length ?? 0) > 0 && (
                      <p className="text-sm text-muted-foreground mt-2">
                        另有 {coursesMissingStartTime.length} 节课未填写上课时间，请到「课程详情」中补齐。
                      </p>
                    )}
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {selectedCourses.map((course) => (
                      <Card key={course.id} className="glass-panel border-white/10 bg-white/5 overflow-hidden hover:border-purple-500/30 transition-all">
                        <div className="p-6">
                          <div className="flex flex-col md:flex-row justify-between md:items-start gap-4">
                            <div className="flex-1 space-y-3">
                              <div className="flex items-center gap-3">
                                <h3 className="text-xl font-bold text-foreground">{course.name}</h3>
                                <Badge variant="outline" className={
                                  course.status === "active" ? "border-green-500/50 text-green-400 bg-green-500/10" : 
                                  course.status === "finished" ? "border-gray-500/50 text-gray-400 bg-gray-500/10" : 
                                  "border-red-500/50 text-red-400 bg-red-500/10"
                                }>
                                  {course.status === "active" ? "待上课" : course.status === "finished" ? "已结束" : "已取消"}
                                </Badge>
                                <Badge variant="secondary" className="bg-white/10 text-white/80">{ROOM_TYPE_LABELS[course.roomType] || "课堂"}</Badge>
                              </div>
                              
                              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                <div className="flex items-center gap-1.5 bg-black/40 px-3 py-1 rounded-md border border-white/5">
                                  <Clock className="h-4 w-4 text-purple-400" />
                                  <span className="font-medium text-foreground">
                                    {course.startTime ? new Date(course.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "未定"}
                                    {" - "}
                                    {course.endTime ? new Date(course.endTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "未定"}
                                  </span>
                                </div>
                              </div>

                              <div className="mt-4 p-4 bg-black/20 rounded-lg border border-white/5 space-y-2">
                                <div className="flex items-center gap-2 text-sm font-medium text-purple-300">
                                  <LinkIcon className="h-4 w-4" /> 快速邀请
                                </div>
                                {course.activeJoinLinks && course.activeJoinLinks.length > 0 ? (
                                  <div className="flex flex-wrap gap-2">
                                    {course.activeJoinLinks.map((link) => (
                                      <Button
                                        key={link.id}
                                        variant="outline"
                                        size="sm"
                                        className="h-7 text-xs border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300"
                                        onClick={() => void copyShareUrl(link.joinUrl)}
                                      >
                                        {link.label.trim() ? link.label.slice(0, 18) : "未命名"}
                                        {link.useCount ? ` · ${link.useCount}次` : ""}
                                      </Button>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-xs text-muted-foreground">暂无有效链接，可在详情页新建。</p>
                                )}
                              </div>

                              {course.studentRemarks && (
                                <div className="text-sm bg-blue-500/10 border border-blue-500/20 p-3 rounded-md text-blue-200 mt-2">
                                  <strong className="text-blue-300 mr-1">学生要求:</strong> {course.studentRemarks}
                                </div>
                              )}
                            </div>

                            <div className="flex flex-col gap-2 min-w-[140px]">
                              <Button
                                variant="outline"
                                className="w-full justify-start border-white/10 hover:bg-white/10"
                                onClick={() => router.push(`/courses/${course.id}`)}
                              >
                                <Edit className="mr-2 h-4 w-4" /> 课程详情
                              </Button>
                              <Button
                                className="w-full justify-start bg-purple-600 hover:bg-purple-700 text-white shadow-glow-purple"
                                disabled={course.status !== "active" || !!enteringCourseId}
                                onClick={() => void handleEnterClassroomFromList(course)}
                              >
                                {enteringCourseId === course.id ? (
                                  <>进入中…</>
                                ) : (
                                  <><PlayCircle className="mr-2 h-4 w-4" /> 进入课堂</>
                                )}
                              </Button>
                              
                              {course.status === "active" && (
                                <div className="grid grid-cols-2 gap-2 mt-2">
                                  <Button variant="outline" size="sm" className="text-xs border-white/10" onClick={() => handleStatusChange(course.id, "finished")}>结束</Button>
                                  <Button variant="outline" size="sm" className="text-xs text-red-400 border-red-500/30 hover:bg-red-500/10" onClick={() => handleStatusChange(course.id, "cancelled")}>取消</Button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}

                {coursesMissingStartTime.length > 0 && (
                  <Card className="glass-panel border-orange-500/30 bg-orange-500/5 mt-8">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-orange-400 text-lg flex items-center gap-2"><Info className="h-5 w-5" /> 未设定时间的课程</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {coursesMissingStartTime.map((c) => (
                          <li key={c.id} className="flex justify-between items-center text-sm p-2 rounded hover:bg-white/5 transition-colors">
                            <span className="font-medium">{c.name}</span>
                            <Button variant="link" size="sm" className="text-orange-300" onClick={() => router.push(`/courses/${c.id}`)}>去补齐时间</Button>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ──── Student Management Page ──── */}
        {activePage === "students" && (
          <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div>
              <h2 className="text-3xl font-bold">学生管理</h2>
              <p className="text-muted-foreground mt-1">搜索学生并分配到您的学生组中。</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Left: Search & Add */}
              <Card className="glass-panel border-white/10 bg-white/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Search className="h-5 w-5 text-purple-400" /> 搜索用户</CardTitle>
                  <CardDescription>按用户名或邮箱搜索平台上的学生</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex gap-2">
                      <Input
                        placeholder="输入用户名、显示名或邮箱…"
                        value={searchQuery}
                        className="bg-black/40 border-white/20 hover:border-white/30 focus-visible:ring-purple-500/50"
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                      />
                    <Button className="bg-purple-600 hover:bg-purple-700 text-white shrink-0" onClick={handleSearch} disabled={searching || !searchQuery.trim()}>
                      {searching ? "搜索中…" : "搜索"}
                    </Button>
                  </div>

                  {searchResults.length > 0 && (
                    <div className="space-y-3">
                      <label className="text-sm font-medium text-muted-foreground">加入目标学生组：</label>
                      <Select value={memberTargetGroupId} onValueChange={setMemberTargetGroupId}>
                        <SelectTrigger className="w-full bg-black/40 border-white/20 hover:border-white/30 focus-visible:ring-purple-500/50">
                          <SelectValue placeholder="选择目标学生组…" />
                        </SelectTrigger>
                        <SelectContent className="bg-background/95 backdrop-blur-md border-white/10">
                          {flattenGroups(myGroups).map((opt) => (
                            <SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {searchError && <p className="text-sm text-red-400 bg-red-500/10 p-3 rounded-md border border-red-500/20">{searchError}</p>}

                  {searchResults.length > 0 && (
                    <div className="space-y-2 mt-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                      {searchResults.map((u) => (
                        <div key={u.id} className="flex justify-between items-center p-3 rounded-lg bg-black/40 border border-white/5 hover:border-purple-500/30 transition-colors">
                          <div className="flex flex-col">
                            <span className="font-semibold">{u.displayName || u.name}</span>
                            <span className="text-xs text-muted-foreground">{u.email}</span>
                          </div>
                          <Button
                            variant="secondary"
                            size="sm"
                            className="bg-purple-500/20 text-purple-300 hover:bg-purple-500/40"
                            disabled={groupBusy || !memberTargetGroupId}
                            onClick={() => handleAddUserToGroup(u)}
                          >
                            <UserPlus className="h-4 w-4 mr-1" /> 加入组
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Right: Groups */}
              <Card className="glass-panel border-white/10 bg-white/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-purple-400" /> 学生组管理</CardTitle>
                  <CardDescription>创建群组以便于在课程中批量分配学生</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex gap-2">
                    <Input
                      placeholder="新建学生组名称…"
                      value={newGroupName}
                      className="bg-black/40 border-white/20 hover:border-white/30 focus-visible:ring-purple-500/50"
                      onChange={(e) => setNewGroupName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleCreateGroup()}
                    />
                    <Button variant="secondary" className="shrink-0" disabled={groupBusy || !newGroupName.trim()} onClick={handleCreateGroup}>
                      创建
                    </Button>
                  </div>

                  {myGroups.length === 0 ? (
                    <div className="p-8 text-center border border-dashed border-white/10 rounded-lg text-muted-foreground">
                      暂无学生组，请先在上方创建。
                    </div>
                  ) : (
                    <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                      {myGroups.map((g) => (
                        <div key={g.id} className="rounded-lg bg-black/40 border border-white/10 overflow-hidden">
                          <div className="flex justify-between items-center p-3 bg-white/5 border-b border-white/5">
                            <div className="flex items-center gap-2">
                              <strong className="text-sm font-medium">{g.name}</strong>
                              <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-white/10">{countMembers(g)} 人</Badge>
                            </div>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-300 hover:bg-red-500/20" disabled={groupBusy} onClick={() => handleDeleteGroup(g.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="p-2">
                            {(g.members?.length ?? 0) > 0 ? (
                              <div className="space-y-1">
                                {g.members.map((m) => (
                                  <div key={m.userId} className="flex justify-between items-center p-2 rounded-md hover:bg-white/5 group">
                                    <span className="text-sm text-foreground/80">{m.userName || m.userId}</span>
                                    <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 hover:bg-red-500/20 transition-all" onClick={() => handleRemoveMember(g.id, m.userId)}>
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground text-center py-4">暂无成员</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* ──── Settings Page ──── */}
        {activePage === "settings" && (
          <SettingsPanel user={user} onLogout={logout} />
        )}

        {/* ──── Create Course Dialog ──── */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="sm:max-w-[560px] bg-background/95 backdrop-blur-xl border-white/10">
            <DialogHeader>
              <DialogTitle className="text-xl">创建新课程</DialogTitle>
              <DialogDescription>填写课程信息，创建后可在详情页管理学生和分享链接。</DialogDescription>
            </DialogHeader>

            {createError && (
              <div className="text-sm text-red-400 bg-red-500/10 p-3 rounded-md border border-red-500/20">{createError}</div>
            )}

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">课程名称 <span className="text-red-400">*</span></label>
                <Input
                  className="bg-black/40 border-white/20 hover:border-white/40 focus-visible:ring-purple-500/50"
                  placeholder="例如：高一数学·函数与导数"
                  value={createName}
                  onChange={(e) => { setCreateName(e.target.value); setCreateError(""); }}
                  maxLength={50}
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">课程描述 <span className="text-muted-foreground text-xs">(可选)</span></label>
                <Textarea
                  className="bg-black/40 border-white/20 hover:border-white/40 focus-visible:ring-purple-500/50 resize-none"
                  placeholder="简要描述本节课内容..."
                  value={createDesc}
                  onChange={(e) => setCreateDesc(e.target.value)}
                  maxLength={200}
                  rows={3}
                />
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2 text-purple-200">
                    <Clock className="h-4 w-4 text-purple-400" /> 开始时间 <span className="text-red-400">*</span>
                  </label>
                  <Input
                    className="bg-purple-500/10 border-purple-500/30 hover:bg-purple-500/20 hover:border-purple-500/50 focus-visible:ring-purple-500/60 cursor-pointer [color-scheme:dark] h-12 px-4 text-base font-medium transition-all text-purple-50 shadow-inner"
                    type="datetime-local"
                    value={createStartTime}
                    onChange={(e) => { setCreateStartTime(e.target.value); setCreateError(""); }}
                    onClick={(e) => {
                      try { (e.target as HTMLInputElement).showPicker?.(); } catch {}
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2 text-purple-200">
                    <Clock className="h-4 w-4 text-purple-400" /> 结束时间 <span className="text-red-400">*</span>
                  </label>
                  <Input
                    className="bg-purple-500/10 border-purple-500/30 hover:bg-purple-500/20 hover:border-purple-500/50 focus-visible:ring-purple-500/60 cursor-pointer [color-scheme:dark] h-12 px-4 text-base font-medium transition-all text-purple-50 shadow-inner"
                    type="datetime-local"
                    value={createEndTime}
                    onChange={(e) => { setCreateEndTime(e.target.value); setCreateError(""); }}
                    onClick={(e) => {
                      try { (e.target as HTMLInputElement).showPicker?.(); } catch {}
                    }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">课堂类型</label>
                <div className="grid grid-cols-3 gap-3">
                  {ROOM_TYPES.map((rt) => (
                    <button
                      key={rt.value}
                      type="button"
                      onClick={() => setCreateRoomType(rt.value)}
                      className={`flex flex-col items-center gap-1.5 p-4 rounded-lg border-2 transition-all text-center ${
                        createRoomType === rt.value
                          ? "border-purple-500 bg-purple-500/10 shadow-glow-purple"
                          : "border-white/10 bg-black/20 hover:border-white/20"
                      }`}
                    >
                      <span className="text-2xl">{rt.icon}</span>
                      <span className="text-sm font-semibold">{rt.label}</span>
                      <span className="text-[10px] text-muted-foreground">{rt.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setCreateOpen(false)}>取消</Button>
              <Button
                className="bg-purple-600 hover:bg-purple-700 text-white"
                onClick={handleCreateCourse}
                disabled={createLoading || !createName.trim()}
              >
                {createLoading ? "创建中…" : "🚀 创建课程"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}

function SettingsPanel({ user, onLogout }: { user: any; onLogout: () => void }) {
  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-8">
        <h2 className="text-3xl font-bold">个人设置</h2>
        <p className="text-muted-foreground mt-2">管理您的账号信息和偏好设置。</p>
      </div>

      <Card className="glass-panel border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle>基本信息</CardTitle>
          <CardDescription>您在平台上的基本档案信息。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1">
              <label className="text-sm text-muted-foreground">用户名</label>
              <div className="font-medium">{user.name || "—"}</div>
            </div>
            <div className="space-y-1">
              <label className="text-sm text-muted-foreground">显示名称</label>
              <div className="font-medium">{user.displayName || "—"}</div>
            </div>
            <div className="space-y-1">
              <label className="text-sm text-muted-foreground">邮箱</label>
              <div className="font-medium">{user.email || "—"}</div>
            </div>
            <div className="space-y-1">
              <label className="text-sm text-muted-foreground">角色</label>
              <div><Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/20">👨‍🏫 教师</Badge></div>
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-sm text-muted-foreground">用户 ID</label>
              <div className="font-mono text-sm bg-black/40 p-2 rounded-md border border-white/5 break-all">{user.userId}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-panel border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle>头像</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-6">
          <Avatar className="h-20 w-20 border border-purple-500/20 shadow-glow-purple">
            <AvatarImage src={user.avatar} />
            <AvatarFallback className="text-2xl bg-purple-500/20 text-purple-400">{user.displayName?.[0] || user.name?.[0] || "T"}</AvatarFallback>
          </Avatar>
          <div className="text-sm text-muted-foreground">
            头像信息由认证系统 (SSO) 提供。<br/>
            如需更改，请在 SSO 平台更新或联系管理员。
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive/20 bg-destructive/5 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-destructive">账户安全</CardTitle>
          <CardDescription>退出当前账号后需要重新登录。</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={onLogout}>
            <LogOut className="mr-2 h-4 w-4" /> 退出登录
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
