import { BookOpen, CalendarDays, Clock, Video } from "lucide-react";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

type PageLoadingVariant = "dashboard" | "course" | "classroom";

interface PageLoadingStateProps {
  message?: string;
  variant?: PageLoadingVariant;
  className?: string;
}

const dashboardCards = [0, 1, 2, 3, 4, 5];
const compactRows = [0, 1, 2];

function LoadingTopBar() {
  return <div className="app-loading-progress" aria-hidden="true" />;
}

function StatusLine({ message, icon: Icon }: { message: string; icon: typeof BookOpen }) {
  return (
    <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-border/70 bg-card/80 px-3 py-1.5 text-sm font-medium text-muted-foreground shadow-sm">
      <Icon className="h-4 w-4 shrink-0 text-primary" />
      <span className="truncate">{message}</span>
    </div>
  );
}

function DashboardLoading({ message }: { message: string }) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-7 px-5 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 space-y-3">
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-4 w-64 max-w-[70vw]" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-28 rounded-xl" />
          <Skeleton className="h-10 w-10 rounded-full" />
        </div>
      </header>

      <section className="rounded-2xl border border-border/70 bg-card/70 p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <StatusLine message={message} icon={BookOpen} />
          <Skeleton className="h-9 w-32 rounded-xl" />
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {compactRows.map((row) => (
            <div key={row} className="rounded-xl border border-border/60 bg-background/70 p-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-3 h-7 w-16" />
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {dashboardCards.map((card) => (
          <div
            key={card}
            className="rounded-2xl border border-border/70 bg-card/80 p-5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1 space-y-3">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
              <Skeleton className="h-9 w-9 rounded-xl" />
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-4 w-3/5" />
            </div>
            <Skeleton className="mt-6 h-10 w-full rounded-xl" />
          </div>
        ))}
      </section>
    </div>
  );
}

function CourseLoading({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border/60 bg-card/70 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-5 sm:px-6">
          <Skeleton className="h-9 w-28 rounded-xl" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-24 rounded-xl" />
            <Skeleton className="h-8 w-28 rounded-full" />
            <Skeleton className="hidden h-4 w-24 sm:block" />
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-6xl space-y-5 px-5 py-8 sm:px-6">
        <StatusLine message={message} icon={CalendarDays} />
        <section className="rounded-2xl border border-border/70 bg-card/80 p-5 shadow-sm sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="min-w-0 flex-1 space-y-4">
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-9 w-full max-w-lg" />
              <Skeleton className="h-4 w-full max-w-xl" />
            </div>
            <Skeleton className="h-11 w-36 rounded-xl" />
          </div>
          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            {compactRows.map((row) => (
              <div key={row} className="rounded-xl border border-border/60 bg-background/70 p-4">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="mt-3 h-5 w-32" />
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
          <div className="rounded-2xl border border-border/70 bg-card/80 p-5 shadow-sm sm:p-6">
            <Skeleton className="h-6 w-36" />
            <div className="mt-5 space-y-3">
              {[0, 1, 2, 3].map((row) => (
                <Skeleton key={row} className="h-12 w-full rounded-xl" />
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-border/70 bg-card/80 p-5 shadow-sm sm:p-6">
            <Skeleton className="h-6 w-28" />
            <div className="mt-5 space-y-3">
              {compactRows.map((row) => (
                <Skeleton key={row} className="h-10 w-full rounded-xl" />
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function ClassroomLoading({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <div className="w-full max-w-lg rounded-2xl border border-border/70 bg-card/85 p-5 shadow-sm backdrop-blur sm:p-6">
        <div className="flex items-start gap-4">
          <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <span className="app-loading-sheen absolute inset-0 rounded-xl" aria-hidden="true" />
            <Video className="relative h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">{message}</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              正在准备音视频、白板和课件资源，请保持当前页面打开。
            </p>
          </div>
        </div>
        <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="app-loading-track h-full w-1/2 rounded-full bg-primary" />
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          {["身份校验", "课堂资源", "音视频通道"].map((label) => (
            <div key={label} className="rounded-xl border border-border/60 bg-background/70 px-3 py-2">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Clock className="h-3.5 w-3.5 text-primary" />
                <span>{label}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PageLoadingState({
  message = "Loading...",
  variant = "dashboard",
  className,
}: PageLoadingStateProps) {
  return (
    <div
      className={cn("relative min-h-screen overflow-hidden bg-background", className)}
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <LoadingTopBar />
      {variant === "course" ? (
        <CourseLoading message={message} />
      ) : variant === "classroom" ? (
        <ClassroomLoading message={message} />
      ) : (
        <DashboardLoading message={message} />
      )}
      <span className="sr-only">{message}</span>
    </div>
  );
}
