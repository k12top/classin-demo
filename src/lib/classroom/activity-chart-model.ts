import type { ComposeOption } from "echarts/core";
import type { BarSeriesOption } from "echarts/charts";
import type { AriaComponentOption, GridComponentOption, TooltipComponentOption } from "echarts/components";
import type { ActivityOverview, ActivityQuality } from "./activity-overview";
import type { activityOverviewCopy } from "./activity-overview-copy";

type Copy = ReturnType<typeof activityOverviewCopy>;
export const qualityKeys = ["correct", "incorrect", "partial", "pending", "withheld"] as const;
export type QualityKey = typeof qualityKeys[number];
export type QuestionChartRow = {
  activityId: string; questionId: string; number: number; prompt: string;
  accuracy: number | null; quality: ActivityQuality; responseCount: number;
};
export type ActivityChartModel = { copy: Copy } & (
  | { kind: "quality"; quality: ActivityQuality }
  | { kind: "questions"; rows: QuestionChartRow[] }
);
export type ActivityChartPalette = Record<QualityKey | "ink" | "line" | "background" | "accent", string>;
export type ActivityChartOption = ComposeOption<BarSeriesOption | AriaComponentOption | GridComponentOption | TooltipComponentOption>;

/** Use only the authorized overview DTO; never infer a hidden grade from an answer. */
export function overviewQuestionRows(data: ActivityOverview): QuestionChartRow[] {
  let number = 0;
  return [...data.activities].reverse().filter(activity => activity.startedAt && activity.status !== "cancelled" && activity.kind !== "poll")
    .flatMap(activity => activity.questions.map(question => ({
      activityId: activity.id, questionId: question.id, number: ++number, prompt: question.prompt,
      accuracy: question.accuracy, quality: question.quality, responseCount: question.responseCount,
    }))).reverse();
}
export function qualityTotal(quality: ActivityQuality) { return qualityKeys.reduce((sum, key) => sum + quality[key], 0); }
export function questionChartState(row: QuestionChartRow, c: Copy) {
  return row.quality.withheld ? c.withheld : row.quality.pending ? c.pending : row.responseCount ? c.noGraded : c.noAnswer;
}
const chartText = (text: string) => text.replace(/[\r\n\t]+/g, " ").replace(/[{}|]/g, "").trim();
export function activityChartOption(model: ActivityChartModel, palette: ActivityChartPalette, locale: string, width: number): ActivityChartOption {
  const c = model.copy, format = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const percent = (value: number) => `${format.format(value)}%`;
  const base: ActivityChartOption = {
    animation: false, textStyle: { fontFamily: 'system-ui, -apple-system, "PingFang SC", sans-serif', color: palette.ink },
    aria: { enabled: true, label: { description: model.kind === "quality" ? c.qualityChart : c.questionChart } },
    tooltip: { trigger: "item", renderMode: "richText", confine: true, backgroundColor: palette.background, borderColor: palette.line, textStyle: { color: palette.ink, fontSize: 12 } },
  };
  if (model.kind === "quality") {
    const total = qualityTotal(model.quality);
    return { ...base, grid: { left: 0, right: 0, top: 8, bottom: 8 }, xAxis: { type: "value", max: Math.max(total, 1), show: false }, yAxis: { type: "category", data: [c.quality], show: false },
      series: qualityKeys.filter(key => model.quality[key] > 0).map(key => ({ type: "bar", name: c[key], stack: "quality", barWidth: 22, data: [model.quality[key]],
        itemStyle: { color: palette[key] }, emphasis: { itemStyle: { opacity: 0.8 } },
        tooltip: { formatter: () => `${c[key]}\n${format.format(model.quality[key])} ${c.answerUnits} · ${percent(model.quality[key] / total * 100)}` },
      })),
    };
  }
  const labelWidth = Math.min(200, Math.max(78, Math.floor(width * 0.32)));
  return { ...base,
    grid: { left: labelWidth + 12, right: 64, top: 8, bottom: 28 },
    xAxis: { type: "value", min: 0, max: 100, splitNumber: 2, axisLabel: { formatter: "{value}%", color: palette.ink, fontSize: 10 }, axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: palette.line, type: "dashed" } } },
    yAxis: { type: "category", inverse: true, data: model.rows.map(row => `Q${row.number}`), show: false },
    series: [{ type: "bar", name: c.accuracy, barWidth: 12, showBackground: true, backgroundStyle: { color: palette.line, opacity: 0.35, borderRadius: 3 },
      data: model.rows.map(row => ({ value: row.accuracy ?? 0, itemStyle: { color: row.accuracy !== null && row.accuracy < 60 ? palette.incorrect : palette.accent, borderRadius: 3 } })),
      label: { show: true, position: "right", distance: 8, color: palette.ink, fontSize: 11, formatter: params => {
        const row = model.rows[params.dataIndex]; return row.accuracy === null ? questionChartState(row, c) : percent(row.accuracy);
      } },
      tooltip: { formatter: params => {
        const p = Array.isArray(params) ? params[0] : params, row = model.rows[p.dataIndex], graded = row.quality.correct + row.quality.incorrect + row.quality.partial;
        const title = chartText(row.prompt).slice(0, 110).match(/.{1,28}/gu)?.join("\n") || "";
        return [`Q${row.number}  ${title}`, `${c.accuracy}  ${row.accuracy === null ? questionChartState(row, c) : percent(row.accuracy)}`, `${c.responseCount}  ${row.responseCount}`, `${c.correct} / ${c.graded}  ${row.quality.correct} / ${graded}`, ...(row.quality.pending ? [`${c.pending}  ${row.quality.pending}`] : []), ...(row.quality.withheld ? [`${c.withheld}  ${row.quality.withheld}`] : [])].join("\n");
      } },
    }],
  };
}
