import {
  Layers3,
  PanelRight,
  Radio,
  ShieldCheck,
  Video,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { ClassroomWebglLoader } from "@/components/ui/classroom-webgl-loader";
import classroomStyles from "@/components/ui/classroom-loading-state.module.css";
import workspaceStyles from "@/components/ui/workspace-loading-state.module.css";

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

function LoadingTopBar() {
  return <div className="app-loading-progress" aria-hidden="true" />;
}

function WorkspaceLoading({ message, embedded = false }: { message: string; embedded?: boolean }) {
  return (
    <div className={cn(workspaceStyles.page, embedded && workspaceStyles.embedded)} {...(!embedded ? { "data-workspace-shell": "" } : {})}>
      {!embedded && (
        <header className={workspaceStyles.header} data-workspace-header aria-hidden="true">
          <span className={workspaceStyles.headerPill} />
        </header>
      )}
      <div className={workspaceStyles.frame} aria-hidden="true">
        <aside className={workspaceStyles.sidebar}>
          <span className={workspaceStyles.brand} />
          {[0, 1, 2, 3, 4, 5].map((item) => <span className={workspaceStyles.nav} key={item} />)}
        </aside>
        <div className={workspaceStyles.content}>
          <span className={workspaceStyles.heading} />
          <span className={workspaceStyles.subheading} />
          <div className={workspaceStyles.rows}>
            {[0, 1, 2].map((item) => (
              <div className={workspaceStyles.row} key={item}>
                <span className={workspaceStyles.thumbnail} />
                <span className={workspaceStyles.lines}><i /><i /></span>
              </div>
            ))}
          </div>
        </div>
      </div>
      {message && <p className={workspaceStyles.status}>{message}</p>}
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
        <WorkspaceLoading message={message} embedded={embedded} />
      ) : variant === "classroom" ? (
        <ClassroomLoading message={message} copy={classroomCopy} />
      ) : (
        <WorkspaceLoading message={message} embedded={embedded} />
      )}
      <span className="sr-only">{message}</span>
    </div>
  );
}
