import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { before, test } from "node:test";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "esbuild";

type TimingControl = ComponentType<{
  courseId: string;
  sessionId: string;
  ended: boolean;
  compact?: boolean;
}>;

const stubs: Record<string, string> = {
  "@/lib/i18n/context": `
    export const useTranslation=()=>({t:(key,values)=>({
      "classroomUpdates.courseControls":"课程控制",
      "classroomUpdates.extend":"延长课程",
      "classroomUpdates.restart":"重新开课",
      "classroomUpdates.extendMinutes":"延长 "+values?.minutes+" 分钟",
      "classroomUpdates.restartHint":"保留原教室链接",
      "classroomUpdates.restartConfirm":"确认重新开课"
    }[key]||key)});
  `,
  "@/components/ui/dropdown-menu": `
    import React from "react";
    const wrap=(tag)=>(props)=>React.createElement(tag,props,props.children);
    export const DropdownMenu=wrap("div");
    export const DropdownMenuTrigger=({children})=>children;
    export const DropdownMenuContent=wrap("div");
    export const DropdownMenuItem=wrap("div");
    export const DropdownMenuSub=wrap("div");
    export const DropdownMenuSubTrigger=wrap("button");
    export const DropdownMenuSubContent=wrap("div");
    export const DropdownMenuPortal=wrap("div");
  `,
};

let Control: TimingControl;
before(async () => {
  const output = await build({
    stdin: {
      contents: `export {ClassTimingControls} from "@/components/classroom/class-timing-controls";`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    jsx: "automatic",
    packages: "external",
    tsconfig: "tsconfig.json",
    plugins: [{
      name: "timing-control-boundaries",
      setup(builder) {
        builder.onResolve({ filter: /.*/ }, args =>
          args.path in stubs ? { path: args.path, namespace: "fixture" } : undefined,
        );
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({
          contents: stubs[args.path],
          loader: "jsx",
          resolveDir: process.cwd(),
        }));
      },
    }],
  });
  const loaded = { exports: {} as { ClassTimingControls: TimingControl } };
  new Function("require", "module", "exports", output.outputFiles[0].text)(
    createRequire(import.meta.url),
    loaded,
    loaded.exports,
  );
  Control = loaded.exports.ClassTimingControls;
});

function render(compact: boolean) {
  return renderToStaticMarkup(createElement(Control, {
    courseId: "course",
    sessionId: "lesson",
    ended: false,
    compact,
  }));
}

test("compact course timing control keeps the action hint without vertical text", () => {
  const html = render(true);
  assert.match(html, /classroom-v3-class-controls--compact/);
  assert.match(html, /title="延长课程"/);
  assert.match(html, /aria-label="延长课程"/);
  assert.match(html, /<span aria-hidden="true">延长课程<\/span>/);
  for (const minutes of [15, 30, 60]) {
    assert.match(html, new RegExp(`延长 ${minutes} 分钟`));
  }
});

test("default course timing control retains its visible action label", () => {
  const html = render(false);
  assert.doesNotMatch(html, /classroom-v3-class-controls--compact/);
  assert.match(html, /<span>延长课程<\/span>/);
});

test("compact course timing control does not look hovered by default", async () => {
  const css = await readFile(
    new URL("../src/components/course-sessions/course-session-manager.module.css", import.meta.url),
    "utf8",
  );

  assert.match(
    css,
    /\.rowActions\s*>\s*:global\(\.classroom-v3-class-controls--compact\)[^{]*\{[^}]*background\s*:\s*transparent[^}]*\}/s,
  );
  assert.match(
    css,
    /@media\s*\(max-width:1024px\)[^{]*\{[^}]*\.rowActions\s*>\s*:global\(\.classroom-v3-class-controls--compact\)[^{]*\{[^}]*min-height\s*:\s*44px[^}]*\}/s,
  );
  assert.match(
    css,
    /@media\s*\(max-width:1024px\)[^{]*\{[^}]*\.rowActions\s*>\s*:global\(\.classroom-v3-class-controls--compact\)[^{]*\{[^}]*min-width\s*:\s*44px[^}]*\}/s,
  );
});

test("light theme row actions have visible hover feedback without changing the danger action", async () => {
  const css = await readFile(
    new URL("../src/components/course-sessions/course-session-manager.module.css", import.meta.url),
    "utf8",
  );

  assert.match(
    css,
    /\.rowActions\s*>\s*button:not\(\.enterButton\):not\(\.detailsButton\):is\(:hover,:focus-visible\)[^{]*\{[^}]*background\s*:\s*hsl\(var\(--muted\)\/\.65\)[^}]*\}/s,
  );
  assert.match(
    css,
    /\.rowActions\s*>\s*button\.endAction:hover[^{]*\{[^}]*background\s*:\s*rgb\(255 94 105\/\.07\)[^}]*\}/s,
  );
});
