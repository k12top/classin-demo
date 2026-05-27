"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Settings, LogOut, Calendar, Clock, User, Pencil, PlayCircle } from "lucide-react";
import { CourseStatusBadge } from "@/components/CourseStatusBadge";
import { CourseStatus, isUpcomingStatus } from "@/lib/course-status";

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
  recordUrl?: string | null;
}

const ROOM_TYPE_LABELS: Record<number, string> = {
  0: "一对一",
  4: "小班",
  2: "大班",
};

type SidebarPage = "learning" | "settings";

export default function StudentDashboard({ courses, user, fetchCourses }: { courses: Course[], user: any, fetchCourses: () => void }) {
  const router = useRouter();
  const { logout } = useAuth();
  const [activePage, setActivePage] = useState<SidebarPage>("learning");
  const [activeTab, setActiveTab] = useState<"upcoming" | "finished" | "cancelled">("upcoming");
  const [editingRemarks, setEditingRemarks] = useState<string | null>(null);
  const [remarksValue, setRemarksValue] = useState("");

  const filteredCourses = useMemo(() => {
    switch (activeTab) {
      case "upcoming": return courses.filter((c) => isUpcomingStatus(c.status));
      case "finished": return courses.filter((c) => c.status === CourseStatus.FINISHED);
      case "cancelled": return courses.filter((c) => c.status === CourseStatus.CANCELLED);
      default: return [];
    }
  }, [courses, activeTab]);

  const handleStatusChange = async (courseId: string, status: string) => {
    if (!confirm(`确定要${status === 'cancelled' ? '请假（取消该课程）' : '变更状态'}吗？`)) return;
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

  const handleSaveRemarks = async (courseId: string) => {
    try {
      const res = await fetch(`/api/courses/${courseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentRemarks: remarksValue })
      });
      if (res.ok) {
        setEditingRemarks(null);
        fetchCourses();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const formatTime = (isoString: string | null) => {
    if (!isoString) return "时间未定";
    const date = new Date(isoString);
    return date.toLocaleString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-64 border-r border-white/10 bg-black/20 backdrop-blur-xl flex flex-col hidden md:flex">
        <div className="p-6">
          <div className="flex items-center gap-4 mb-8">
            <Avatar className="h-12 w-12 border border-primary/20 shadow-glow-blue">
              <AvatarImage src={user.avatar} />
              <AvatarFallback className="bg-primary/20 text-primary">{user.displayName?.[0] || 'S'}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <span className="font-semibold text-foreground truncate w-32">{user.displayName || user.name}</span>
              <Badge variant="secondary" className="w-fit text-[10px] mt-1 bg-blue-500/20 text-blue-300 hover:bg-blue-500/30">VIP Student</Badge>
            </div>
          </div>
          <nav className="space-y-2">
            <Button 
              variant={activePage === 'learning' ? 'secondary' : 'ghost'} 
              className={`w-full justify-start ${activePage === 'learning' ? 'bg-primary/20 text-primary hover:bg-primary/30' : ''}`}
              onClick={() => setActivePage('learning')}
            >
              <BookOpen className="mr-2 h-4 w-4" /> 学习中心
            </Button>
            <Button 
              variant={activePage === 'settings' ? 'secondary' : 'ghost'} 
              className={`w-full justify-start ${activePage === 'settings' ? 'bg-primary/20 text-primary hover:bg-primary/30' : ''}`}
              onClick={() => setActivePage('settings')}
            >
              <Settings className="mr-2 h-4 w-4" /> 个人设置
            </Button>
          </nav>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-6 md:p-10 relative">
        {activePage === "learning" && (
          <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Banner */}
            <div className="relative rounded-2xl overflow-hidden bg-gradient-primary p-8 text-white shadow-lg">
              <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20 mix-blend-overlay"></div>
              <div className="relative z-10">
                <h2 className="text-3xl font-bold mb-2">1对1中文精读+表达</h2>
                <p className="text-white/80">请联系顾问预约试听课，开启你的学习之旅。</p>
              </div>
            </div>

            <Tabs defaultValue="upcoming" className="w-full" onValueChange={(v) => setActiveTab(v as any)}>
              <TabsList className="bg-black/20 border border-white/5 backdrop-blur-md mb-6">
                <TabsTrigger value="upcoming" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">待上课</TabsTrigger>
                <TabsTrigger value="finished" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">已结束 (复习/回放)</TabsTrigger>
                <TabsTrigger value="cancelled" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">已取消</TabsTrigger>
              </TabsList>
              
              <TabsContent value={activeTab} className="space-y-6">
                {filteredCourses.length === 0 ? (
                  <Card className="glass-panel border-white/10 bg-white/5 text-center p-12">
                    <p className="text-muted-foreground">没有相关课程</p>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {filteredCourses.map(course => (
                      <Card key={course.id} className="glass-panel border-white/10 bg-white/5 overflow-hidden group hover:border-primary/30 transition-all duration-300">
                        <div className="flex flex-col md:flex-row">
                          <div className="md:w-1/4 bg-black/40 p-6 flex flex-col justify-center items-center text-center border-r border-white/5 group-hover:bg-primary/5 transition-colors">
                            <Calendar className="h-8 w-8 text-primary mb-2 opacity-80" />
                            <div className="font-medium text-sm text-primary/80">{formatTime(course.startTime)}</div>
                            <Badge variant="outline" className="mt-4 border-primary/20 bg-primary/10 text-primary">
                              {ROOM_TYPE_LABELS[course.roomType] || "课堂"}
                            </Badge>
                          </div>
                          <div className="flex-1 p-6 flex flex-col">
                            <div className="flex justify-between items-start mb-4">
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h3 className="text-xl font-bold text-foreground">{course.name}</h3>
                                  {activeTab === "upcoming" && (
                                    <CourseStatusBadge status={course.status} />
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-muted-foreground text-sm mt-1">
                                  <User className="h-4 w-4" /> 老师：{course.teacherName}
                                </div>
                              </div>
                              {activeTab === 'upcoming' && (
                                <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => handleStatusChange(course.id, "cancelled")}>
                                  我要请假
                                </Button>
                              )}
                            </div>
                            
                            <div className="mt-auto bg-black/20 rounded-lg p-4 border border-white/5">
                              <div className="flex items-center gap-2 text-sm mb-2">
                                <Pencil className="h-4 w-4 text-primary" /> <span className="font-medium">我的要求：</span>
                              </div>
                              {editingRemarks === course.id ? (
                                <div className="flex gap-2">
                                  <Input 
                                    className="h-8 bg-black/40 border-white/10 text-sm" 
                                    value={remarksValue} 
                                    onChange={(e) => setRemarksValue(e.target.value)} 
                                    placeholder="填写要求..."
                                  />
                                  <Button size="sm" onClick={() => handleSaveRemarks(course.id)}>保存</Button>
                                  <Button size="sm" variant="ghost" onClick={() => setEditingRemarks(null)}>取消</Button>
                                </div>
                              ) : (
                                <div className="flex justify-between items-center group/remark">
                                  <span className="text-sm text-muted-foreground">{course.studentRemarks || "暂无备注，点击右侧编辑添加您的学习要求"}</span>
                                  <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover/remark:opacity-100 transition-opacity" onClick={() => { setEditingRemarks(course.id); setRemarksValue(course.studentRemarks); }}>
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                </div>
                              )}
                            </div>

                            <div className="mt-6 flex justify-end">
                              <Button 
                                className={`transition-all group-hover:scale-105 ${
                                  course.status === "finished"
                                    ? "bg-blue-900/50 text-blue-200 hover:bg-blue-900/60 border border-blue-500/30"
                                    : "bg-primary hover:bg-primary/90 text-primary-foreground shadow-glow-blue"
                                }`}
                                onClick={() => router.push(`/courses/${course.id}`)}
                              >
                                <PlayCircle className="mr-2 h-4 w-4" />
                                {course.status === "finished"
                                  ? (course.recordUrl ? "查看回放" : "直播回放")
                                  : "进入教室"}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}

        {activePage === "settings" && (
          <SettingsPanel user={user} onLogout={logout} />
        )}
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
              <div><Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20">🧑‍🎓 学生</Badge></div>
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
          <Avatar className="h-20 w-20 border border-primary/20">
            <AvatarImage src={user.avatar} />
            <AvatarFallback className="text-2xl bg-primary/20 text-primary">{user.displayName?.[0] || user.name?.[0] || "U"}</AvatarFallback>
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
