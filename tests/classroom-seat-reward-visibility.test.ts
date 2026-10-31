import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("seat reward badges stay visible without hovering video seats", async () => {
  const stylesheets = await Promise.all([
    readFile(new URL("../src/app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../src/app/classroom-classin.css", import.meta.url), "utf8"),
  ]);

  for (const css of stylesheets) {
    assert.doesNotMatch(
      css,
      /\.classroom-v3-seat\.has-video\s+\.classroom-v3-seat-reward\s*\{[^}]*opacity\s*:\s*0/s,
    );
  }
});
