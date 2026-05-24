import { Badge } from "@/components/ui/badge";
import { statusBadgeClassName, statusLabel } from "@/lib/course-status";
import { cn } from "@/lib/utils";

type CourseStatusBadgeProps = {
  status: string;
  className?: string;
};

export function CourseStatusBadge({ status, className }: CourseStatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(statusBadgeClassName(status), className)}
    >
      {statusLabel(status)}
    </Badge>
  );
}
