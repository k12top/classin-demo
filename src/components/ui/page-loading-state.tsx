import {
  BookOpen,
  CalendarDays,
  Layers3,
  PanelRight,
  Radio,
  ShieldCheck,
  Video,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { ClassroomWebglLoader } from "@/components/ui/classroom-webgl-loader";
import classroomStyles from "@/components/ui/classroom-loading-state.module.css";

type PageLoadingVariant = "dashboard" | "course" | "classroom";

interface PageLoadingStateProps {
  message?: string;
  variant?: PageLoadingVariant;
  className?: string;
  embedded?: boolean;
  classroomCopy?: ClassroomLoadingCopy;
}

export interface ClassroomLoadingCopy {
  brand: string;
  liveLabel: string;
  secureConnection: string;
  teachingStage: string;
  signalCheck: string;
  launchSequence: string;
  description: string;
  identityCheck: string;
  classroomResources: string;
  mediaChannel: string;
  collaboration: string;
}

const defaultClassroomCopy: ClassroomLoadingCopy = {
  brand: "Online classroom",
  liveLabel: "CLASSROOM · LIVE",
  secureConnection: "Secure connection",
  teachingStage: "Teaching stage",
  signalCheck: "Signal check",
  launchSequence: "Launch sequence",
  description:
    "Preparing audio, video, whiteboard, and courseware. Keep this page open while the connection is established.",
  identityCheck: "Identity check",
  classroomResources: "Classroom resources",
  mediaChannel: "Audio and video",
  collaboration: "Class collaboration",
};

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
    <div className="grid min-h-screen w-full md:grid-cols-[76px_1fr] xl:grid-cols-[232px_1fr]">
      <aside className="hidden border-r border-border/70 bg-card/75 p-3 backdrop-blur-xl md:flex md:flex-col">
        <div className="flex items-center gap-3 px-1 py-2 xl:px-2">
          <Skeleton className="h-10 w-10 rounded-[13px]" />
          <div className="hidden min-w-0 flex-1 space-y-2 xl:block">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-2.5 w-20" />
          </div>
        </div>
        <div className="mt-8 grid gap-2">
          {[0, 1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-11 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="mt-auto h-14 w-full rounded-2xl" />
      </aside>

      <div className="min-w-0">
        <header className="flex min-h-[68px] items-center justify-between border-b border-border/70 bg-background/70 px-5 backdrop-blur-xl sm:px-8">
          <div className="space-y-2">
            <Skeleton className="h-2.5 w-24" />
            <Skeleton className="h-5 w-36" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="hidden h-9 w-28 rounded-xl sm:block" />
            <Skeleton className="h-9 w-9 rounded-full" />
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-[1460px] flex-col gap-6 p-5 sm:p-8 lg:p-10">
          <section className="min-h-[294px] rounded-[26px] border border-white/5 bg-[#15171c] p-7 shadow-[0_28px_80px_rgba(12,13,17,0.16)] sm:p-10">
            {message ? <StatusLine message={message} icon={BookOpen} /> : null}
            <Skeleton className="mt-12 h-11 w-full max-w-lg bg-white/10" />
            <Skeleton className="mt-4 h-4 w-full max-w-sm bg-white/10" />
            <div className="mt-16 flex gap-3">
              <Skeleton className="h-11 w-32 rounded-xl bg-white/10" />
              <Skeleton className="h-11 w-28 rounded-xl bg-white/10" />
            </div>
          </section>

          <section className="rounded-2xl border border-border/70 bg-card/70 p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-4 w-48" />
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
            {dashboardCards.slice(0, 3).map((card) => (
              <div
                key={card}
                className="rounded-2xl border border-border/70 bg-card/80 p-5 shadow-sm"
              >
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="mt-3 h-4 w-1/2" />
                <Skeleton className="mt-8 h-10 w-full rounded-xl" />
              </div>
            ))}
          </section>
        </main>
      </div>
    </div>
  );
}

function CourseLoading({ message, embedded = false }: { message: string; embedded?: boolean }) {
  return (
    <div className={embedded ? "w-full" : "min-h-screen bg-background"}>
      {!embedded ? <div className="border-b border-border/60 bg-card/70 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-5 sm:px-6">
          <Skeleton className="h-9 w-28 rounded-xl" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-24 rounded-xl" />
            <Skeleton className="h-8 w-28 rounded-full" />
            <Skeleton className="hidden h-4 w-24 sm:block" />
          </div>
        </div>
      </div> : null}

      <main className="mx-auto w-full max-w-6xl space-y-5 px-5 py-8 sm:px-6">
        {message && !embedded ? <StatusLine message={message} icon={CalendarDays} /> : null}
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

function ClassroomLoading({
  message,
  copy,
}: {
  message: string;
  copy: ClassroomLoadingCopy;
}) {
  const connectionSteps = [
    { label: copy.identityCheck, icon: ShieldCheck },
    { label: copy.classroomResources, icon: Layers3 },
    { label: copy.mediaChannel, icon: Radio },
  ];

  return (
    <div className={classroomStyles.shell}>
      <span className={classroomStyles.ambient} aria-hidden="true" />

      <header className={classroomStyles.header}>
        <div className={classroomStyles.brand}>
          <span className={classroomStyles.brandMark}>
            <Video aria-hidden="true" />
          </span>
          <span className={classroomStyles.brandText}>
            <strong>{copy.brand}</strong>
            <span>{copy.liveLabel}</span>
          </span>
        </div>
        <span className={classroomStyles.headerStatus}>{copy.secureConnection}</span>
      </header>

      <div className={classroomStyles.rail} aria-hidden="true">
        {[0, 1, 2, 3, 4, 5].map((seat) => (
          <div className={classroomStyles.railItem} key={seat}>
            <span className={classroomStyles.railAvatar} />
            <span className={classroomStyles.railText}>
              <span />
              <small />
            </span>
          </div>
        ))}
      </div>

      <div className={classroomStyles.workspace}>
        <section className={classroomStyles.stage}>
          <ClassroomWebglLoader className={classroomStyles.webgl} />
          <div className={classroomStyles.stageHeader} aria-hidden="true">
            <span className={classroomStyles.stageLabel}>
              <Video />
              {copy.teachingStage}
            </span>
            <span className={classroomStyles.stageSignal}>
              <span />
              {copy.signalCheck}
            </span>
          </div>

          <div className={classroomStyles.launch}>
            <div className={classroomStyles.orb} aria-hidden="true">
              <span className={classroomStyles.orbRing} />
              <Video />
            </div>
            <span className={classroomStyles.launchKicker}>{copy.launchSequence}</span>
            {message ? <h1>{message}</h1> : null}
            <p>{copy.description}</p>

            <div className={classroomStyles.sequence}>
              <span className={classroomStyles.sequenceProgress} aria-hidden="true" />
              {connectionSteps.map(({ label, icon: Icon }) => (
                <div className={classroomStyles.sequenceItem} key={label}>
                  <span className={classroomStyles.sequenceIcon}>
                    <Icon aria-hidden="true" />
                  </span>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside className={classroomStyles.drawer} aria-hidden="true">
          <div className={classroomStyles.drawerHeader}>
            <div className={classroomStyles.drawerTitle}>
              <span>{copy.collaboration}</span>
              <PanelRight />
            </div>
            <div className={classroomStyles.drawerTabs}>
              <span className={classroomStyles.drawerTab} />
              <span className={classroomStyles.drawerTab} />
              <span className={classroomStyles.drawerTab} />
            </div>
          </div>
          <div className={classroomStyles.drawerBody}>
            {[0, 1, 2, 3, 4, 5].map((row) => (
              <div className={classroomStyles.drawerRow} key={row}>
                <span className={classroomStyles.drawerAvatar} />
                <span className={classroomStyles.drawerLines}>
                  <span />
                  <span />
                </span>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <div className={classroomStyles.dock} aria-hidden="true">
        {[0, 1, 2, 3, 4, 5].map((tool) => (
          <span className={classroomStyles.dockItem} key={tool} />
        ))}
      </div>
    </div>
  );
}

export function PageLoadingState({
  message = "",
  variant = "dashboard",
  className,
  embedded = false,
  classroomCopy = defaultClassroomCopy,
}: PageLoadingStateProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden bg-background",
        embedded ? "min-h-[640px]" : "min-h-screen",
        className,
      )}
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <LoadingTopBar />
      {variant === "course" ? (
        <CourseLoading message={message} embedded={embedded} />
      ) : variant === "classroom" ? (
        <ClassroomLoading message={message} copy={classroomCopy} />
      ) : (
        <DashboardLoading message={message} />
      )}
      <span className="sr-only">{message}</span>
    </div>
  );
}
