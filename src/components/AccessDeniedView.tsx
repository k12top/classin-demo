"use client";

import Link from "next/link";
import {
  accessDeniedContentForCode,
  type CourseAccessDeniedCode,
} from "@/lib/access-denied-codes";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Clock, Home, Lock, Search, XCircle } from "lucide-react";

const TONE_STYLES = {
  blue: {
    badge: "border-blue-500/30 bg-blue-500/10 text-blue-300",
    icon: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  },
  gray: {
    badge: "border-gray-500/30 bg-gray-500/10 text-gray-300",
    icon: "text-gray-400 bg-gray-500/10 border-gray-500/20",
  },
  red: {
    badge: "border-red-500/30 bg-red-500/10 text-red-300",
    icon: "text-red-400 bg-red-500/10 border-red-500/20",
  },
  amber: {
    badge: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    icon: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  },
} as const;

function IconForType({ type }: { type: ReturnType<typeof accessDeniedContentForCode>["icon"] }) {
  const cls = "h-8 w-8";
  switch (type) {
    case "clock":
      return <Clock className={cls} />;
    case "x-circle":
      return <XCircle className={cls} />;
    case "search":
      return <Search className={cls} />;
    default:
      return <Lock className={cls} />;
  }
}

export function AccessDeniedView({
  code,
  reason,
  courseName,
  courseId,
}: {
  code?: CourseAccessDeniedCode | null;
  reason?: string;
  courseName?: string;
  courseId?: string;
}) {
  const resolvedCode: CourseAccessDeniedCode =
    code === "not_enrolled" ||
    code === "course_finished" ||
    code === "course_cancelled" ||
    code === "not_found"
      ? code
      : "default";

  const content = accessDeniedContentForCode(resolvedCode, reason);
  const tone = TONE_STYLES[content.tone];

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-950/40 via-background to-purple-950/30 pointer-events-none" />
      <div className="absolute top-[-20%] right-[-10%] w-[420px] h-[420px] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[420px] h-[420px] bg-purple-500/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-lg space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 text-primary mb-2">
            <BookOpen className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">灵动课堂</h1>
          <p className="text-sm text-muted-foreground">在线互动教学平台</p>
        </div>

        <Card className="glass-panel border-white/10 bg-white/5 shadow-2xl">
          <CardHeader className="text-center space-y-4 pb-2">
            <div
              className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border ${tone.icon}`}
            >
              <IconForType type={content.icon} />
            </div>
            <div className="space-y-2">
              <Badge variant="outline" className={tone.badge}>
                访问受限
              </Badge>
              <CardTitle className="text-xl">{content.title}</CardTitle>
              {courseName ? (
                <p className="text-base font-medium text-foreground">{courseName}</p>
              ) : null}
              <CardDescription className="text-base text-muted-foreground">
                {content.description}
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent>
            <p className="text-sm text-muted-foreground text-center leading-relaxed bg-black/20 rounded-lg border border-white/5 p-4">
              {content.hint}
            </p>
          </CardContent>

          <CardFooter className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Button asChild className="w-full sm:w-auto">
              <Link href="/">
                <Home className="mr-2 h-4 w-4" />
                返回课程列表
              </Link>
            </Button>
            {courseId ? (
              <Button asChild variant="outline" className="w-full sm:w-auto border-white/10">
                <Link href={`/courses/${courseId}`}>查看课程详情</Link>
              </Button>
            ) : null}
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
