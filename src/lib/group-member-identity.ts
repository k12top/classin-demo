import { casdoorUserIdsMatch, type CasdoorIdentity } from "./casdoor-user";

type Member = { userId: string; userName?: string | null };
type Group = { members: Member[]; children?: Group[] };

/** Enrich only already-authorized group members; never return the whole directory. */
export function enrichGroupIdentities<T extends Group>(groups: T[], directory: CasdoorIdentity[]): T[] {
  const byId = new Map<string, string>();
  for (const user of directory) {
    if (!user.name) continue;
    for (const key of [user.id, user.name, user.owner ? `${user.owner}/${user.name}` : undefined]) {
      if (key) byId.set(key, user.name);
    }
  }
  const visit = (group: Group): Group => ({
    ...group,
    members: group.members.map(member => {
      const login = member.userId.split("/").pop() || member.userId;
      const username = byId.get(member.userId) || byId.get(login) ||
        (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(login) ? login : null);
      return { ...member, username };
    }),
    ...(group.children ? { children: group.children.map(visit) } : {}),
  });
  return groups.map(group => visit(group) as T);
}

export { casdoorUserIdsMatch };
