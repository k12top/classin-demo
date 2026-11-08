import type { ActivityQuestion, ActivityRosterMember } from "./activities";

export function activityAnswerGroups(question: ActivityQuestion, roster: ActivityRosterMember[]) {
  if (question.options.length) return question.options.map((option, index) => ({ key: option.id, letter: String.fromCharCode(65 + index), label: option.text,
    members: roster.filter(member => { const value = member.response?.answers[question.id]; return Array.isArray(value) && value.includes(option.id); }) }));
  if (question.type !== "shortText") return [];
  const groups = new Map<string, ActivityRosterMember[]>();
  for (const member of roster) {
    const answer = member.response?.answers[question.id];
    if (typeof answer !== "string") continue;
    const key = answer.normalize("NFKC").trim();
    const members = groups.get(key) || []; members.push(member); groups.set(key, members);
  }
  return [...groups].map(([label, members]) => ({ key: label, label, letter: "", members })).sort((a, b) => b.members.length - a.members.length);
}
