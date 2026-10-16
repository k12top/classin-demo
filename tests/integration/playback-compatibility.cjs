// Run against a local Next dev server. APIs/storage are mocked; MP4 decoding is real.
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS integration runner. */
const assert = require("node:assert/strict");
const { mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { resolve, join } = require("node:path");
const { execFileSync } = require("node:child_process");
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || "playwright");

const base = process.env.PLAYBACK_TEST_BASE_URL || "http://127.0.0.1:3026";
assert.ok(["127.0.0.1", "localhost"].includes(new URL(base).hostname), "Use a local test server");
const output = resolve(process.env.PLAYBACK_ARTIFACT_DIR || "outputs/playback-compatibility-2026-10-16");
mkdirSync(output, { recursive: true });
const fixture = join(output, "fixture.mp4");
execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=24", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100", "-t", "5", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", fixture]);
const media = readFileSync(fixture);
const report = [];

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const mobile of [true, false]) {
      const name = mobile ? "mobile-wechat" : "desktop";
      const context = await browser.newContext({
        viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1050 },
        ...(mobile ? { userAgent: "Mozilla/5.0 (Phone; OpenHarmony 5.0) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36 MicroMessenger/8.0.9", isMobile: true, hasTouch: true } : {}),
      });
      await context.addCookies([{ name: "NEXT_LOCALE", value: "zh-CN", url: base }]);
      await context.addInitScript(() => {
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
          writeText: async (text) => {
            if (window.__denyClipboard) throw new Error("Clipboard unavailable");
            window.__copiedPlaybackLink = text;
          },
        } });
      });
      const page = await context.newPage();
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      let sourceStatus = 200;
      let resolutions = 0;
      const heartbeats = [];
      await page.route("**/api/**", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const pathname = url.pathname;
        let payload = {};
        let status = 200;
        if (pathname === "/api/auth/me") payload = { user: { userId: "student", name: "student", displayName: "测试学生", role: "student", avatar: "", email: "student@example.test" } };
        else if (pathname === "/api/courses/test-course") payload = { course: { id: "test-course", name: "回放兼容验证", teacherName: "测试老师", status: "finished" } };
        else if (pathname === "/api/courses/test-course/sessions") payload = { sessions: [{ id: "lesson", title: "兼容播放测试课", status: "finished", startTime: "2026-10-16T01:00:00Z", endTime: "2026-10-16T02:00:00Z", _count: { recordings: 2 } }] };
        else if (pathname === "/api/sessions/lesson/recordings") payload = { recordings: [0, 1].map((index) => ({ id: `attempt:${index}`, segment: index + 1, status: "completed", startedAt: "2026-10-16T01:00:00Z", stoppedAt: "2026-10-16T01:00:05Z", playbackFormat: "mp4", playbackUrl: `/api/sessions/lesson/recordings/attempt/play?asset=clip${index}.mp4` })) };
        else if (pathname === "/api/sessions/lesson/summary") payload = { summary: null, captions: [], canManage: false };
        else if (pathname === "/api/sessions/lesson/recordings/attempt/play") {
          assert.equal(url.searchParams.get("delivery"), "url");
          resolutions++;
          status = sourceStatus;
          payload = status === 200 ? { url: `${base}/test-media/${url.searchParams.get("asset")}`, format: "mp4" } : { error: "Mock storage unavailable" };
        } else if (pathname === "/api/courses/test-course/playback-progress") {
          const body = request.postDataJSON();
          heartbeats.push({ method: request.method(), body });
          payload = { tracked: true, sessionId: "watch-session", challenge: "test-challenge", totalDurationSec: 2 };
        }
        await route.fulfill({ status, json: payload });
      });
      await context.route("**/test-media/*.mp4", async (route) => {
        const match = /bytes=(\d+)-(\d*)/.exec(route.request().headers().range || "");
        const start = match ? Number(match[1]) : 0;
        const end = match?.[2] ? Math.min(Number(match[2]), media.length - 1) : media.length - 1;
        await route.fulfill({ status: match ? 206 : 200, body: media.subarray(start, end + 1), headers: {
          "content-type": "video/mp4", "accept-ranges": "bytes",
          ...(match ? { "content-range": `bytes ${start}-${end}/${media.length}` } : {}),
        } });
      });
      await page.goto(`${base}/courses/test-course/playback?sessionId=lesson&recordingId=attempt%3A1&lang=zh-CN`, { waitUntil: "networkidle" });
      const video = page.locator("video");
      await video.waitFor({ timeout: 90_000 });
      await page.waitForFunction(() => document.querySelector("video")?.readyState >= 2);
      assert.match(await video.getAttribute("src"), /test-media\/clip1\.mp4$/);
      const details = page.locator("details").filter({ has: page.getByText("播放帮助与兼容方式", { exact: true }) });
      assert.equal(await details.getAttribute("open") !== null, mobile);
      if (!mobile) await details.locator("summary").click();
      await page.getByRole("link", { name: "直接播放 MP4", exact: true }).waitFor();
      assert.match(await page.getByRole("link", { name: "直接播放 MP4", exact: true }).getAttribute("href"), /test-media\/clip1\.mp4$/);
      if (mobile) await page.getByText(/鸿蒙 NEXT 可尝试使用华为浏览器/).waitFor();
      await page.getByRole("button", { name: "复制回放链接", exact: true }).click();
      const copied = await page.evaluate(() => window.__copiedPlaybackLink);
      const link = new URL(copied);
      assert.equal(link.searchParams.get("sessionId"), "lesson");
      assert.equal(link.searchParams.get("recordingId"), "attempt:1");
      assert.equal(link.searchParams.has("signature"), false);

      await video.evaluate((element) => element.play());
      await page.waitForFunction(() => document.querySelector("video").currentTime > 0.2);
      assert.ok(heartbeats.some((entry) => entry.method === "POST"), "Actual playback starts watch-time tracking");
      const pausedTracking = page.waitForResponse((response) => response.url().includes("/playback-progress") && response.request().method() === "PATCH" && response.request().postDataJSON().state === "paused");
      await video.evaluate((element) => element.pause());
      await pausedTracking;

      sourceStatus = 503;
      await page.getByRole("button", { name: "重新加载视频", exact: true }).click();
      await page.getByRole("alert").filter({ hasText: "视频加载失败" }).waitFor();
      sourceStatus = 200;
      await page.getByRole("button", { name: "重新加载视频", exact: true }).click();
      await page.getByRole("alert").filter({ hasText: "视频加载失败" }).waitFor({ state: "hidden" });
      await page.waitForFunction(() => document.querySelector("video")?.readyState >= 2);
      assert.equal(await details.locator("..").getByRole("alert").count(), 0);
      assert.ok(await video.evaluate((element) => element.currentTime) >= 0.2, "Retry restores media position");

      await page.evaluate(() => { window.__denyClipboard = true; });
      await page.getByRole("button", { name: "复制回放链接", exact: true }).click();
      const manual = page.getByRole("textbox", { name: /当前环境无法自动复制/ });
      assert.equal(await manual.inputValue(), copied);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: join(output, `${name}.png`), fullPage: true });
      assert.deepEqual(pageErrors, []);
      report.push({ name, resolutions, realMp4Decoded: true, selectedClipCopied: true, retryRecovered: true, clipboardFallback: true, watchTimeStarted: true, pageErrors });
      await context.close();
    }
    writeFileSync(join(output, "result.json"), JSON.stringify({ environment: "local browser; APIs and storage mocked; not HarmonyOS hardware", checks: report }, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
