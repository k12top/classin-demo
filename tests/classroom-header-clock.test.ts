import assert from "node:assert/strict";
import { before, test } from "node:test";
import { createRequire } from "node:module";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "esbuild";
import type { MinimalHeader } from "@/components/classroom/minimal-header";

let Header: typeof MinimalHeader;
before(async () => {
  const stubs: Record<string, string> = {
    "@/lib/i18n/context": "export const useTranslation=()=>({t:key=>key});",
    "./class-timing-controls": "export const ClassTimingControls=()=>null;",
    "./classroom-header-menu": "export const ClassroomHeaderMenu=()=>null;",
  };
  const bundle = await build({
    stdin: { contents: `export {MinimalHeader} from '@/components/classroom/minimal-header';`, resolveDir: process.cwd() },
    bundle: true, write: false, platform: "node", format: "cjs", packages: "external", tsconfig: "tsconfig.json",
    plugins: [{ name: "header-clock-boundaries", setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: "fixture" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: stubs[args.path], loader: "js" }));
    } }],
  });
  const moduleObject = { exports: {} };
  new Function("require", "module", "exports", bundle.outputFiles[0].text)(createRequire(`${process.cwd()}/package.json`), moduleObject, moduleObject.exports);
  Header = (moduleObject.exports as { MinimalHeader: typeof MinimalHeader }).MinimalHeader;
});

test("header clock uses runtime status even when the API course object contains its schedule status", () => {
  const now = Date.now(), noop = () => {};
  const props: ComponentProps<typeof MinimalHeader> = {
    course: { id: "course", sessionId: "lesson", name: "Lesson", startTime: new Date(now + 600_000).toISOString(), endTime: new Date(now + 4_200_000).toISOString() },
    runtime: { status: "waiting", startedAt: null, graceEndsAt: null }, now,
    roleName: "teacher", memberCount: 1, recording: false, connectionState: "connected", presenceHealthy: true,
    canStart: true, canEnd: false, canExtend: true, busy: false, status: null, settings: null, actions: [],
    onBack: noop, onStart: noop, onEnd: noop, onExtended: noop, onRestarted: noop, onFullscreen: noop,
  };
  for (const [schedule, runtime, phase] of [
    ["scheduled", "waiting", "waiting"],
    ["live", "waiting", "waiting"],
    ["scheduled", "live", "live"],
    ["live", "ended", "ended"],
  ] as const) {
    const html = renderToStaticMarkup(createElement(Header, {
      ...props, course: { ...props.course, ...{ status: schedule } }, runtime: { ...props.runtime, status: runtime },
    }));
    assert.ok(html.includes(`data-phase="${phase}"`), `${schedule}/${runtime} must render ${phase}`);
  }
});
