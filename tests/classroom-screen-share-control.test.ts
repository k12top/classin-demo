import assert from "node:assert/strict";
import test from "node:test";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ScreenShareDockButton } from "../src/components/classroom/screen-share-dock-button";

test("an active local share becomes a visible one-click exit action", () => {
  let stopped = 0;
  const element = ScreenShareDockButton({
    sharing: true,
    disabled: false,
    shareLabel: "共享屏幕",
    exitLabel: "退出共享",
    activeTitle: "正在共享，点击退出",
    onShare: () => assert.fail("active sharing must not start another share"),
    onStop: () => { stopped += 1; },
  }) as ReactElement<{ onClick: () => void }>;
  const html = renderToStaticMarkup(createElement(() => element));

  assert.match(html, /data-dock-action="share"/);
  assert.match(html, /data-sharing="true"/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /aria-label="正在共享，点击退出"/);
  assert.match(html, />退出共享</);
  assert.match(html, /class="classroom-share-live-dot"/);

  element.props.onClick();
  assert.equal(stopped, 1);
});

test("an idle share control keeps the existing start action", () => {
  let started = 0;
  const element = ScreenShareDockButton({
    sharing: false,
    disabled: false,
    shareLabel: "共享屏幕",
    exitLabel: "退出共享",
    activeTitle: "正在共享，点击退出",
    onShare: () => { started += 1; },
    onStop: () => assert.fail("idle control must not stop sharing"),
  }) as ReactElement<{ onClick: () => void }>;
  const html = renderToStaticMarkup(createElement(() => element));

  assert.doesNotMatch(html, /data-sharing/);
  assert.match(html, /aria-pressed="false"/);
  assert.match(html, /aria-label="共享屏幕"/);
  assert.match(html, />共享屏幕</);
  assert.doesNotMatch(html, /classroom-share-live-dot/);

  element.props.onClick();
  assert.equal(started, 1);
});
