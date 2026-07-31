import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

test("cross-platform classroom contract remains a valid versioned JSON schema", async () => {
  const content = await readFile(
    path.join(root, "contracts", "classroom-v1.schema.json"),
    "utf8",
  );
  const schema = JSON.parse(content) as Record<string, unknown>;

  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.$id, "https://live.xiangyuwenshu.cn/contracts/classroom-v1.schema.json");
  assert.ok(schema.$defs);
});

test("cross-platform design tokens expose the teaching-stage primitives", async () => {
  const content = await readFile(
    path.join(root, "design-tokens", "classroom.tokens.json"),
    "utf8",
  );
  const tokens = JSON.parse(content) as {
    color: Record<string, { $value: string }>;
    motion: Record<string, { $value: unknown }>;
  };

  assert.equal(tokens.color.iris.$value, "#7B6FF2");
  assert.equal(tokens.color.signal.$value, "#32D49A");
  assert.ok(tokens.motion.standard.$value);
});
