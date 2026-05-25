export type CourseAccessDeniedCode =
  | "not_enrolled"
  | "course_finished"
  | "course_cancelled"
  | "not_found"
  | "default";

export type AccessDeniedContent = {
  title: string;
  description: string;
  hint: string;
  icon: "lock" | "clock" | "x-circle" | "search";
  tone: "blue" | "gray" | "red" | "amber";
};

export function accessDeniedContentForCode(
  code: CourseAccessDeniedCode,
  reason?: string
): AccessDeniedContent {
  switch (code) {
    case "not_enrolled":
      return {
        title: "暂无访问权限",
        description: reason || "您未被分配到此课程",
        hint: "请联系授课老师将您加入课程，或使用老师提供的分享链接。",
        icon: "lock",
        tone: "blue",
      };
    case "course_finished":
      return {
        title: "课程已结束",
        description: reason || "本节课已结束，无法进入课堂",
        hint: "如需复习或回放，请稍后在「已结束」列表中查看。",
        icon: "clock",
        tone: "gray",
      };
    case "course_cancelled":
      return {
        title: "课程已取消",
        description: reason || "本节课已取消",
        hint: "如有疑问，请联系授课老师确认安排。",
        icon: "x-circle",
        tone: "red",
      };
    case "not_found":
      return {
        title: "课程不存在",
        description: reason || "链接无效或课程已删除",
        hint: "请确认链接是否正确，或返回首页重新选择课程。",
        icon: "search",
        tone: "amber",
      };
    default:
      return {
        title: "无法进入课堂",
        description: reason || "暂时无法访问此课程",
        hint: "如果您认为这是一个错误，请联系课程老师。",
        icon: "lock",
        tone: "blue",
      };
  }
}

export function buildAccessDeniedUrl(params: {
  code?: CourseAccessDeniedCode;
  reason?: string;
  course?: string;
  courseId?: string;
}): string {
  const qs = new URLSearchParams();
  if (params.code) qs.set("code", params.code);
  if (params.reason) qs.set("reason", params.reason);
  if (params.course) qs.set("course", params.course);
  if (params.courseId) qs.set("courseId", params.courseId);
  const query = qs.toString();
  return query ? `/access-denied?${query}` : "/access-denied";
}
