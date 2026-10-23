"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { avatarInitials } from "@/lib/user-avatar";
import { classroomAvatarSource } from "@/lib/classroom/avatar";

export function ClassroomMemberAvatar({ avatar, name }: { avatar: string; name: string }) {
  const initials = avatarInitials(name);
  return (
    <Avatar className="classroom-v3-avatar-picture">
      <AvatarImage src={classroomAvatarSource(avatar)} alt="" draggable={false} referrerPolicy="no-referrer" />
      <AvatarFallback className="classroom-v3-avatar-fallback" style={initials.length > 1 ? { fontSize: initials.length > 2 ? ".55em" : ".75em" } : undefined}>{initials}</AvatarFallback>
    </Avatar>
  );
}
