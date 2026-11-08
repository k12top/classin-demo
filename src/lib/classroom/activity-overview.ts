import { activityQuestionJudgment, type ActivityDefinition, type ActivityResponse, type ActivitySummary } from "./activities";

export type ActivityQuality = { answered: number; correct: number; incorrect: number; partial: number; pending: number; withheld: number; earnedPoints: number; gradedPoints: number };
export type ActivityQuestionQuality = { id: string; prompt: string; quality: ActivityQuality; accuracy: number | null; responseCount: number };
export type ActivityOverviewItem = ActivitySummary & { quality: ActivityQuality; accuracy: number | null; resultsVisible: boolean; questions: ActivityQuestionQuality[] };
export type ActivityStudentQuality = { userId: string; displayName: string; avatar: string; online: boolean; submissions: number; participation: number; quality: ActivityQuality; accuracy: number | null };
export type ActivityOverview = {
  canManage: boolean; live: boolean; activityCount: number; questionCount: number; studentCount: number;
  participants: number; submissions: number; participation: number; quality: ActivityQuality; accuracy: number | null;
  activities: ActivityOverviewItem[]; students?: ActivityStudentQuality[];
};
export type ActivityReportSource = { activity: ActivitySummary; definition: ActivityDefinition; responses: ActivityResponse[]; resultsVisible: boolean };
export const emptyActivityQuality = (): ActivityQuality => ({ answered: 0, correct: 0, incorrect: 0, partial: 0, pending: 0, withheld: 0, earnedPoints: 0, gradedPoints: 0 });
export function activityAccuracy(q: ActivityQuality) { const graded = q.correct + q.incorrect + q.partial; return graded ? q.correct / graded * 100 : null; }
function addQuality(total: ActivityQuality, value: ActivityQuality) { for (const key of Object.keys(total) as (keyof ActivityQuality)[]) total[key] += value[key]; }
function answerQuality(source: ActivityReportSource, response: ActivityResponse): ActivityQuality {
  const quality = emptyActivityQuality();
  if (source.activity.kind === "poll" || source.activity.status === "cancelled") return quality;
  for (const question of source.definition.questions) {
    if (response.answers[question.id] === undefined) continue;
    quality.answered++;
    if (!source.resultsVisible) { quality.withheld++; continue; }
    const judgment = activityQuestionJudgment(question, response);
    if (judgment === "unanswered") continue;
    quality[judgment]++;
    const score = response.grading?.[question.id];
    if (typeof score === "number" && Number.isFinite(score)) { quality.earnedPoints += score; quality.gradedPoints += question.points; }
  }
  return quality;
}

/** Inputs are already authorized and, for students, contain only their own
 * submissions and released grades. No raw answers or keys enter this DTO. */
export function summarizeActivities(sources: ActivityReportSource[], roster: Array<{ userId: string; displayName: string; avatar: string; online: boolean }>, canManage: boolean, live: boolean): ActivityOverview {
  const effective = sources.filter(source => source.activity.status !== "cancelled" && source.activity.startedAt);
  const students = new Map<string, ActivityStudentQuality>(roster.map(person => [person.userId, { ...person, submissions: 0, participation: 0, quality: emptyActivityQuality(), accuracy: null }]));
  const quality = emptyActivityQuality(), participants = new Set<string>(); let submissions = 0;
  const activities = sources.map(source => {
    const itemQuality = emptyActivityQuality(), counted = source.activity.status !== "cancelled" && Boolean(source.activity.startedAt);
    for (const response of source.responses) {
      const result = answerQuality(source, response); addQuality(itemQuality, result);
      if (!counted) continue;
      submissions++; participants.add(response.userId);
      let student = students.get(response.userId);
      if (!student) { student = { userId: response.userId, displayName: response.displayName, avatar: "", online: false, submissions: 0, participation: 0, quality: emptyActivityQuality(), accuracy: null }; students.set(response.userId, student); }
      student.submissions++; addQuality(student.quality, result); addQuality(quality, result);
    }
    const questions = source.definition.questions.map(question => {
      const quality = emptyActivityQuality(), one = { ...source, definition: { questions: [question] } };
      for (const response of source.responses) addQuality(quality, answerQuality(one, response));
      return { id: question.id, prompt: question.prompt, quality, accuracy: activityAccuracy(quality), responseCount: source.responses.filter(response => response.answers[question.id] !== undefined).length };
    });
    return { ...source.activity, quality: itemQuality, accuracy: activityAccuracy(itemQuality), resultsVisible: source.resultsVisible, questions };
  });
  const studentCount = canManage ? students.size : 1;
  for (const student of students.values()) { student.accuracy = activityAccuracy(student.quality); student.participation = effective.length ? student.submissions / effective.length * 100 : 0; }
  return { canManage, live, activityCount: effective.length, questionCount: effective.reduce((total, source) => total + source.activity.questionCount, 0),
    studentCount, participants: participants.size, submissions, participation: effective.length && studentCount ? submissions / (effective.length * studentCount) * 100 : 0,
    quality, accuracy: activityAccuracy(quality), activities, ...(canManage ? { students: [...students.values()] } : {}) };
}
