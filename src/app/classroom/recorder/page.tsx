import { Suspense } from "react";
import { ClassroomV3 } from "@/components/classroom/classroom-v3";
import { ClassroomLoading } from "@/components/classroom/classroom-loading";

export default function ClassroomRecorderPage() {
  return (
    <Suspense fallback={<ClassroomLoading recorder />}>
      <ClassroomV3 recorderMode />
    </Suspense>
  );
}
