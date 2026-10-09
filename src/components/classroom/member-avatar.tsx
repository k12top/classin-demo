"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { classroomAvatarSource } from "@/lib/classroom/avatar";

export function ClassroomMemberAvatar({ avatar, name }: { avatar: string; name: string }) {
  return (
    <Avatar className="classroom-v3-avatar-picture">
      <AvatarImage src={classroomAvatarSource(avatar)} alt="" draggable={false} referrerPolicy="no-referrer" />
      <AvatarFallback className="classroom-v3-avatar-fallback">{Array.from(name.trim())[0]?.toUpperCase() || "?"}</AvatarFallback>
    </Avatar>
  );
}
