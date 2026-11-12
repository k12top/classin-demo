"use client";
import { useEffect, useId, useState, type ComponentType } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "@/lib/i18n/context";
import type { ActivityOverview } from "@/lib/classroom/activity-overview";
import { activityOverviewCopy } from "@/lib/classroom/activity-overview-copy";
import { overviewQuestionRows, qualityKeys, qualityTotal, questionChartState, QUESTION_CHART_ROW_HEIGHT, type QuestionChartRow } from "@/lib/classroom/activity-chart-model";
import { MarkdownContent, MarkdownInlineContent } from "@/components/markdown-content";
import type { ActivityEChartProps } from "./activity-echart";
import styles from "./activity-overview.module.css";

function ChartFrame(props: ActivityEChartProps & { height: number }) {
  const [Renderer, setRenderer] = useState<ComponentType<ActivityEChartProps> | null>(null), [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
  const { locale } = useTranslation(), c = activityOverviewCopy(locale);
  useEffect(() => {
    let active = true;
    import("./activity-echart").then(module => { if (active) { setRenderer(() => module.default); setFailed(false); } }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [attempt]);
  return <div className={styles.chartFrame} style={{ height: props.height }}>
    {props.model.kind === "questions" && <div className={styles.chartLabels} style={{ gridTemplateRows: `repeat(${props.model.rows.length}, minmax(0, 1fr))` }}>
      {props.model.rows.map(row => <QuestionChartLabel row={row} key={`${row.activityId}:${row.questionId}`} />)}
    </div>}
    {Renderer ? <Renderer model={props.model} locale={props.locale} onSelect={props.onSelect} /> : <p className={styles.hint} role="status">{failed ? <>{c.chartFailed} <button type="button" onClick={() => setAttempt(value => value + 1)}>{c.retry}</button></> : c.chartLoading}</p>}
  </div>;
}
function QuestionChartLabel({ row }: { row: QuestionChartRow }) {
  const tooltipId = useId();
  return <div className={styles.chartLabel}>
    <button type="button" className={styles.chartLabelTrigger} data-chart-question-label aria-label={`Q${row.number}: ${row.prompt}`} aria-describedby={tooltipId}>
      <MarkdownInlineContent content={`Q${row.number}  ${row.prompt}`} />
    </button>
    <div id={tooltipId} role="tooltip" className={styles.chartLabelPopover} data-chart-question-popover><MarkdownContent content={`Q${row.number}  ${row.prompt}`} /></div>
  </div>;
}
const PAGE_SIZE = 6;
export function ActivityOverviewCharts({ data, onSelect }: { data: ActivityOverview; onSelect: (row: QuestionChartRow) => void }) {
  const { locale } = useTranslation(), c = activityOverviewCopy(locale);
  const [sort, setSort] = useState("recent"), [page, setPage] = useState(0);
  const allRows = overviewQuestionRows(data), rows = sort === "accuracy" ? [...allRows].sort((a, b) => (a.accuracy ?? Infinity) - (b.accuracy ?? Infinity) || b.number - a.number) : allRows;
  const lastPage = Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1), currentPage = Math.min(page, lastPage), visible = rows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const total = qualityTotal(data.quality), graded = data.quality.correct + data.quality.incorrect + data.quality.partial;
  const format = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }), percent = (value: number) => `${format.format(value)}%`;
  if (!total && !rows.length) return null;
  return <div className={styles.visuals} data-overview-charts>
    <section className={styles.qualityChart} aria-label={c.qualityChart}>
      <header className={styles.chartHeading}><h4>{c.qualityChart}</h4><span>{c.graded} {graded} {c.answerUnits}</span></header>
      {total ? <>
        <ChartFrame model={{ kind: "quality", quality: data.quality, copy: c }} locale={locale} height={46} />
        <dl className={styles.chartLegend}>{qualityKeys.filter(key => data.quality[key] || key === "correct" || key === "incorrect").map(key => <div key={key} data-tone={key}><dt><i aria-hidden="true" />{c[key]}</dt><dd>{format.format(data.quality[key])}<small>{percent(data.quality[key] / total * 100)}</small></dd></div>)}</dl>
      </> : <p className={styles.hint}>{c.noGraded}</p>}
      <p className={styles.chartNote}>{c.qualityHint}</p>
    </section>
    {rows.length > 0 && <section className={styles.questionChart} aria-label={c.questionChart}>
      <header className={styles.chartHeading}><h4>{c.questionChart}</h4><select aria-label={c.chartOrder} value={sort} onChange={event => { setSort(event.target.value); setPage(0); }}><option value="recent">{c.recentFirst}</option><option value="accuracy">{c.accuracyFirst}</option></select></header>
      <p className={styles.chartNote}>{c.questionHint}</p>
      <ChartFrame model={{ kind: "questions", rows: visible, copy: c }} locale={locale} height={visible.length * QUESTION_CHART_ROW_HEIGHT + 36} onSelect={index => { if (visible[index]) onSelect(visible[index]); }} />
      {lastPage > 0 && <nav className={styles.chartPages} aria-label={c.chartPages}><button type="button" aria-label={c.previousQuestions} disabled={!currentPage} onClick={() => setPage(currentPage - 1)}><ChevronLeft /></button><span>{currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, rows.length)} / {rows.length}</span><button type="button" aria-label={c.nextQuestions} disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}><ChevronRight /></button></nav>}
      <details className={styles.chartData}><summary>{c.chartData}</summary><table><thead><tr><th scope="col">{c.questions}</th><th scope="col">{c.accuracy}</th><th scope="col">{c.correct} / {c.graded}</th></tr></thead><tbody>{visible.map(row => <tr key={`${row.activityId}:${row.questionId}`}><th scope="row"><button type="button" onClick={() => onSelect(row)}>Q{row.number} · <MarkdownInlineContent content={row.prompt} /></button></th><td>{row.accuracy === null ? questionChartState(row, c) : percent(row.accuracy)}</td><td>{row.quality.correct} / {row.quality.correct + row.quality.incorrect + row.quality.partial}</td></tr>)}</tbody></table></details>
    </section>}
  </div>;
}
