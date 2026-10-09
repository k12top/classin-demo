import type { CourseSessionSummaryReport } from "../../src/lib/course-session-summary-document";

export const summaryCaptions = [
  ["teacher", "李老师", "今天复习一元二次方程。判别式等于 b 的平方减 4ac。"],
  ["wang", "小王", "2x²+3x+2=0 为什么没有实数解？"],
  ["teacher", "李老师", "这个题的判别式是 9 减 16，等于负 7，所以没有实数解。复数解不在本课讨论范围。"],
  ["li", "小李", "那 x²+3x+2=0 可以分解成 (x+1)(x+2)，解是负 1 和负 2。"],
  ["teacher", "李老师", "对，求根公式是 (-b±√Δ)/(2a)。Δ 大于零有两个不同实数解，等于零有重根，小于零没有实数解。"],
  ["wang", "小王", "求根公式怎么通过配方法推导？"],
  ["teacher", "李老师", "这个推导今天还没讲完，下次课继续通过配方法推导，检查大家是否理解。"],
  ["teacher", "李老师", "全体同学课后完成练习册第十二页第一到第三题，下周二下午五点前提交。"],
  ["li", "小李", "我明天整理因式分解的解题过程，发给大家。"],
].map(([speakerId, speakerName, text], index) => ({
  id: `caption-${index + 1}`, speakerId, speakerName, text,
  occurredAt: new Date(Date.UTC(2026, 9, 10, 1, index)),
  updatedAt: new Date(Date.UTC(2026, 9, 10, 1, index, 2)),
}));
export const emptyReport: CourseSessionSummaryReport = { participantSummaries: [], discussionThreads: [], actionItems: [], conclusions: [], followUps: [] };
export const exampleAIReport = {
  executiveSummary: "本课复习判别式与求根公式，比较无实数解和可因式分解的例题。配方法推导尚未完成，留待下次课；学生需完成练习册第十二页第一至第三题。",
  themes: ["判别式 Δ=b²−4ac 决定实数解的个数", "求根公式与因式分解的应用"],
  questions: ["负判别式为什么没有实数解？", "如何用配方法推导求根公式？"],
  participantSummaries: [
    { speakerId: "teacher", speakerName: "李老师", summary: "解释判别式、比较解法并布置作业。", keyPoints: ["Δ<0 时没有实数解"], commitments: ["下次课继续配方法推导"], evidence: { captionIds: ["caption-3", "caption-5", "caption-7", "caption-8"] } },
    { speakerId: "li", speakerName: "小李", summary: "通过因式分解求出两个根，承诺分享解题过程。", keyPoints: ["两个根为 −1 和 −2"], commitments: ["明天整理并分享解题过程"], evidence: { captionIds: ["caption-4", "caption-9"] } },
  ],
  discussionThreads: [{ topic: "判别式与解法", summary: "小王提问无实数解的原因，教师用 Δ=−7 解释，小李展示因式分解的另一例题。", participants: ["李老师", "小王", "小李"], evidence: { captionIds: ["caption-2", "caption-3", "caption-4", "caption-5"] } }],
  actionItems: [{ title: "完成练习册第十二页第一至第三题并提交", owner: "全体同学", due: "下周二下午五点前", status: "pending", description: "", evidence: { captionIds: ["caption-8"] } }],
  conclusions: [{ title: "Δ<0 时没有实数解", detail: "2x²+3x+2=0 的判别式为 −7。", evidence: { captionIds: ["caption-3"] } }],
  followUps: [{ topic: "配方法推导求根公式", reason: "本课尚未完成推导，下次课继续并检查理解。", owner: "李老师", nextCheckAt: "下次课", evidence: { captionIds: ["caption-6", "caption-7"] } }],
};
