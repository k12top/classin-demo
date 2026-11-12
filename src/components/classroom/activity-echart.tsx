"use client";
import { useEffect, useRef } from "react";
import { init, use as registerCharts, type EChartsType, type ECElementEvent } from "echarts/core";
import { BarChart } from "echarts/charts";
import { AriaComponent, GridComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import { activityChartOption, qualityKeys, type ActivityChartModel, type ActivityChartPalette } from "@/lib/classroom/activity-chart-model";
import styles from "./activity-overview.module.css";

registerCharts([BarChart, GridComponent, TooltipComponent, AriaComponent, SVGRenderer]);
export type ActivityEChartProps = { model: ActivityChartModel; locale: string; onSelect?: (index: number) => void };
export default function ActivityEChart({ model, locale, onSelect }: ActivityEChartProps) {
  const container = useRef<HTMLDivElement>(null), instance = useRef<EChartsType | null>(null);
  useEffect(() => {
    if (!container.current) return;
    const chart = init(container.current, null, { renderer: "svg" }); instance.current = chart;
    return () => { instance.current = null; chart.dispose(); };
  }, []);
  useEffect(() => {
    const host = container.current, chart = instance.current;
    if (!host || !chart) return;
    const update = () => {
      if (chart.isDisposed()) return;
      const style = getComputedStyle(host), palette = Object.fromEntries(qualityKeys.map(key => [key, style.getPropertyValue(`--chart-${key}`).trim()])) as ActivityChartPalette;
      palette.ink = style.color; palette.line = style.borderTopColor; palette.background = style.backgroundColor; palette.accent = style.getPropertyValue("--chart-accent").trim();
      chart.resize(); chart.setOption(activityChartOption(model, palette, locale, host.clientWidth), { notMerge: true });
    };
    update();
    const resize = new ResizeObserver(update); resize.observe(host);
    const theme = new MutationObserver(update); theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
    const shell = host.closest(".classroom-v3-shell"); if (shell) theme.observe(shell, { attributes: true, attributeFilter: ["class", "style"] });
    const select = (event: ECElementEvent) => { if (event.componentType === "series" && typeof event.dataIndex === "number") onSelect?.(event.dataIndex); };
    if (onSelect) chart.on("click", select);
    return () => { resize.disconnect(); theme.disconnect(); if (!chart.isDisposed()) chart.off("click", select); };
  }, [model, locale, onSelect]);
  return <div ref={container} className={styles.echart} data-overview-echart={model.kind} />;
}
