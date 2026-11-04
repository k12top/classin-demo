import assert from "node:assert/strict";
import test from "node:test";
import { createNetworkDirectionPolicy, networkSignalLevel, networkVideoEncoder } from "../src/lib/classroom/network-adaptation";

test("brief jitter does not degrade; sustained bad quality reduces video before pausing it", () => {
  const policy = createNetworkDirectionPolicy();
  assert.equal(policy.sample(5, 0), "normal");
  assert.equal(policy.sample(5, 2_000), "normal");
  assert.equal(policy.sample(1, 4_000), "normal");
  assert.equal(policy.sample(5, 6_000), "normal");
  assert.equal(policy.sample(5, 8_000), "normal");
  assert.equal(policy.sample(5, 10_000), "low");
  for (const at of [12_000, 14_000, 16_000]) assert.equal(policy.sample(5, at), "low");
  assert.equal(policy.sample(5, 18_000), "minimal");
});

test("recovery needs twenty continuous seconds of good samples, not unknown quality or elapsed background time", () => {
  const policy = createNetworkDirectionPolicy();
  for (let at = 0; at <= 12_000; at += 2_000) policy.sample(6, at);
  assert.equal(policy.sample(4, 14_000), "minimal");
  for (let at = 16_000; at <= 30_000; at += 2_000) assert.equal(policy.sample(1, at), "minimal");
  assert.equal(policy.sample(0, 32_000), "minimal");
  assert.equal(policy.sample(1, 34_000), "minimal");
  assert.equal(policy.sample(1, 60_000), "minimal", "a suspended tab is not a healthy connection");
  for (let at = 62_000; at < 80_000; at += 2_000) assert.equal(policy.sample(2, at), "minimal");
  assert.equal(policy.sample(2, 80_000), "normal");
});

test("separate uplink and downlink policies do not lower publication on download-only congestion", () => {
  const up = createNetworkDirectionPolicy(), down = createNetworkDirectionPolicy();
  for (let at = 0; at <= 12_000; at += 2_000) {
    assert.equal(up.sample(1, at), "normal");
    down.sample(5, at);
  }
  assert.equal(down.sample(5, 14_000), "minimal");
  assert.equal(networkVideoEncoder(up.sample(1, 14_000), false), null);
});

test("fallback constrains camera and screen bitrate, with unknown quality shown as unknown", () => {
  for (const screen of [false, true]) {
    const low = networkVideoEncoder("low", screen)!;
    const minimal = networkVideoEncoder("minimal", screen)!;
    assert.ok(minimal.bitrateMax < low.bitrateMax);
    assert.ok(minimal.width < low.width);
    assert.ok(minimal.frameRate < low.frameRate);
  }
  assert.equal(networkSignalLevel(0), null);
  assert.equal(networkSignalLevel(1), 4);
  assert.equal(networkSignalLevel(6), 0);
});
