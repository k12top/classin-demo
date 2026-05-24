"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { PlayCircle, Clock, User, BookOpen, MessageSquare, AlertCircle } from "lucide-react";
import { CourseStatusBadge } from "@/components/CourseStatusBadge";
import { canEnterClassroom } from "@/lib/course-status";

const ROOM_TYPE_LABELS: Record<number, string> = {
  0: "一对一课堂",
  4: "小班课",
  2: "大班课",
};

export default function StudentCourseDetail({ 
  course, 
  user,
  onEnterClassroom,
  enterLoading,
  fetchCourse
}: { 
  course: any; 
  user: any; 
  onEnterClassroom: () => void;
  enterLoading: boolean;
  fetchCourse: () => void;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"info" | "requirements">("info");
  const [remarksValue, setRemarksValue] = useState(course.studentRemarks || "");
  const [savingRemarks, setSavingRemarks] = useState(false);

  const formatTime = (isoString: string | null) => {
    if (!isoString) return "未定";
    const date = new Date(isoString);
    return date.toLocaleString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long', hour: '2-digit', minute: '2-digit' });
  };

  const handleSaveRemarks = async () => {
    setSavingRemarks(true);
    try {
      const res = await fetch(`/api/courses/${course.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentRemarks: remarksValue })
      });
      if (res.ok) {
        fetchCourse();
        alert("已更新要求！");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingRemarks(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12 pt-4">
      {/* Header Card */}
      <Card className="glass-panel border-white/10 bg-gradient-to-br from-blue-900/40 to-black/40 overflow-hidden relative">
        <div className="absolute top-[-50%] right-[-10%] w-[300px] h-[300px] bg-blue-500/20 rounded-full blur-[100px] pointer-events-none" />
        <CardContent className="p-8 relative z-10">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
            <div className="space-y-4">
              <Badge variant="outline" className="border-blue-400/30 text-blue-300 bg-blue-500/10">
                {ROOM_TYPE_LABELS[course.roomType] || "课堂"}
              </Badge>
              <h1 className="text-3xl md:text-4xl font-bold text-white">{course.name}</h1>
              
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mt-4">
                <div className="flex items-center gap-1.5 bg-black/30 px-3 py-1.5 rounded-md border border-white/5">
                  <User className="h-4 w-4 text-blue-400" />
                  <span className="font-medium text-foreground">授课教师：{course.teacherName}</span>
                </div>
                <div className="flex items-center gap-1.5 bg-black/30 px-3 py-1.5 rounded-md border border-white/5">
                  <Clock className="h-4 w-4 text-blue-400" />
                  <span className="font-medium text-foreground">{formatTime(course.startTime)}</span>
                </div>
                <CourseStatusBadge status={course.status} />
              </div>
            </div>
            
            <div className="w-full md:w-auto shrink-0">
              <Button
                size="lg"
                className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white shadow-glow-blue"
                onClick={onEnterClassroom}
                disabled={enterLoading || !canEnterClassroom(course.status)}
              >
                {enterLoading ? (
                  <span className="flex items-center gap-2"><span className="animate-spin rounded-full h-4 w-4 border-2 border-white/20 border-t-white" /> 进入中…</span>
                ) : (
                  <span className="flex items-center gap-2"><PlayCircle className="h-5 w-5" /> 进入课堂</span>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Tabs Area */}
      <Tabs defaultValue="info" className="w-full" onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="bg-black/20 border border-white/5 backdrop-blur-md mb-6 inline-flex w-full md:w-auto">
          <TabsTrigger value="info" className="flex-1 md:flex-none data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-300">
            <BookOpen className="mr-2 h-4 w-4" /> 课程信息
          </TabsTrigger>
          <TabsTrigger value="requirements" className="flex-1 md:flex-none data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-300">
            <MessageSquare className="mr-2 h-4 w-4" /> 我的要求
          </TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="mt-0">
          <Card className="glass-panel border-white/10 bg-white/5">
            <CardHeader>
              <CardTitle>课程描述</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground leading-relaxed">
                {course.description || "老师暂未提供详细描述。"}
              </p>
              
              <div className="mt-8 pt-6 border-t border-white/5">
                 <h4 className="font-semibold mb-4 flex items-center gap-2"><BookOpen className="h-4 w-4 text-blue-400"/> 课件材料</h4>
                 <div className="p-8 border border-dashed border-white/10 rounded-lg text-center bg-black/20">
                   <AlertCircle className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                   <p className="text-sm text-muted-foreground">暂无课件上传功能</p>
                 </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="requirements" className="mt-0">
          <Card className="glass-panel border-white/10 bg-white/5">
            <CardHeader>
              <CardTitle>想给老师提什么要求？</CardTitle>
              <CardDescription>
                您可以写下希望老师在课堂上注意的事项，例如：多纠正发音、少做游戏等。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea 
                className="min-h-[150px] bg-black/40 border-white/10 resize-none text-base p-4"
                value={remarksValue}
                onChange={e => setRemarksValue(e.target.value)}
                placeholder="在此填写..."
              />
              <div className="mt-6 flex justify-end">
                <Button 
                  className="bg-blue-600 hover:bg-blue-700" 
                  onClick={handleSaveRemarks}
                  disabled={savingRemarks}
                >
                  {savingRemarks ? "保存中..." : "保存要求"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
