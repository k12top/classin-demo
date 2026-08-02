import assert from "node:assert/strict";
import {
  calculatePlaybackCreditSec,
  formatPlaybackDuration,
  normalizePlaybackRate,
} from "../src/lib/playback-progress";

assert.equal(
  calculatePlaybackCreditSec({
    elapsedMs: 15_200,
    previousPositionSec: 10,
    currentPositionSec: 25,
    playbackRate: 1,
    previousState: "playing",
    activeWindow: true,
  }),
  15
);

assert.equal(
  calculatePlaybackCreditSec({
    elapsedMs: 15_000,
    previousPositionSec: 10,
    currentPositionSec: 40,
    playbackRate: 2,
    previousState: "playing",
    activeWindow: true,
  }),
  15
);

assert.equal(
  calculatePlaybackCreditSec({
    elapsedMs: 15_000,
    previousPositionSec: 10,
    currentPositionSec: 1_000,
    playbackRate: 1,
    previousState: "playing",
    activeWindow: true,
  }),
  15
);

assert.equal(
  calculatePlaybackCreditSec({
    elapsedMs: 60_000,
    previousPositionSec: 10,
    currentPositionSec: 70,
    playbackRate: 1,
    previousState: "playing",
    activeWindow: true,
  }),
  0
);

assert.equal(
  calculatePlaybackCreditSec({
    elapsedMs: 15_000,
    previousPositionSec: 10,
    currentPositionSec: 25,
    playbackRate: 1,
    previousState: "playing",
    activeWindow: false,
  }),
  0
);

assert.equal(normalizePlaybackRate(2), 2);
assert.equal(normalizePlaybackRate(3), null);
assert.equal(formatPlaybackDuration(3_661), "01:01:01");
