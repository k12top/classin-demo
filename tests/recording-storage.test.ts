import assert from "node:assert/strict";
import test from "node:test";
import {
  expectedAgoraRecordingStorageRegion,
  validateAgoraRecordingStorageRegion,
} from "../src/lib/classroom/recording-storage";

test("maps Alibaba Cloud OSS Singapore to Shengwang storage region 10", () => {
  assert.equal(expectedAgoraRecordingStorageRegion("oss-ap-southeast-1"), 10);
  assert.equal(
    validateAgoraRecordingStorageRegion("oss-ap-southeast-1", 10),
    true,
  );
  assert.equal(
    validateAgoraRecordingStorageRegion("oss-ap-southeast-1", 1),
    false,
  );
});
