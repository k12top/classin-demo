import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  applyPlaybackSeek,
  recordingRetryDelay,
  requestPlaybackForRecording,
  scrollToPlayback,
} from "../src/lib/playback-navigation";
import * as playbackNavigation from "../src/lib/playback-navigation";

const playbackPageSource = readFileSync(new URL("../src/app/courses/[id]/playback/page.tsx", import.meta.url), "utf8");
const replayPosterSource = readFileSync(new URL("../public/classroom/replay-placeholder.svg", import.meta.url), "utf8");

test("recording retries back off and remain bounded",()=>{
 assert.deepEqual([1,2,3,4,5,20].map(recordingRetryDelay),[5000,10000,20000,40000,60000,60000]);
});

test("replay poster artwork shares the video center with the buffering indicator", () => {
  assert.match(replayPosterSource, /<g transform="translate\(0 70\)">/);
});

test("seeking another recording does not resume the old player",()=>{
 let plays=0;const video={play:async()=>{plays++;}};
 requestPlaybackForRecording(video,"first","second");assert.equal(plays,0);
 requestPlaybackForRecording(video,"first","first");assert.equal(plays,1);
 requestPlaybackForRecording(null,"first","first");assert.equal(plays,1);
});

test("replay uses custom controls and one buffering indicator", () => {
  assert.doesNotMatch(playbackPageSource, /controls=\{!buffering\}/);
  assert.equal(playbackPageSource.match(/<ReplayPlayerControls /g)?.length, 1);
  assert.equal(playbackPageSource.match(/portalUpdates\.replayPreparing/g)?.length, 1);
});

test("returning to the original speech scrolls the player into view", () => {
  let options: ScrollIntoViewOptions | undefined;
  const player = {
    scrollIntoView(next: ScrollIntoViewOptions) {
      options = next;
    },
  };

  scrollToPlayback(player);

  assert.deepEqual(options, { behavior: "smooth", block: "center" });
});

test("applying a caption seek updates the position and starts playback", async () => {
  let plays = 0;
  const video = {
    currentTime: 0,
    duration: 120,
    play: async () => {
      plays += 1;
    },
  };

  const position = await applyPlaybackSeek(video, 34);

  assert.equal(position, 34);
  assert.equal(video.currentTime, 34);
  assert.equal(plays, 1);
});

test("a review-source click can request playback during the user gesture", () => {
  const requestPlayback = Reflect.get(playbackNavigation, "requestPlayback");
  assert.equal(typeof requestPlayback, "function");

  let plays = 0;
  requestPlayback({
    play() {
      plays += 1;
      return Promise.resolve();
    },
  });

  assert.equal(plays, 1);
});

test("playback buffering state follows loading and playback events", () => {
  const bufferingState = Reflect.get(playbackNavigation, "playbackBufferingState");
  assert.equal(typeof bufferingState, "function");

  assert.equal(bufferingState(false, "loadstart", true), true);
  assert.equal(bufferingState(false, "waiting", false), true);
  assert.equal(bufferingState(false, "seeking", false), true);
  assert.equal(bufferingState(true, "loadeddata", false), true);
  assert.equal(bufferingState(true, "canplay", false), false);
  assert.equal(bufferingState(true, "playing", false), false);
  assert.equal(bufferingState(true, "pause", true), false);
  assert.equal(bufferingState(true, "ended", true), false);
  assert.equal(bufferingState(true, "error", true), false);
  assert.equal(bufferingState(false, "waiting", true), false);
});

