import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCheck } from "./check.mjs";

function project(config) {
  const dir = mkdtempSync(join(tmpdir(), "verify-"));
  writeFileSync(join(dir, ".verify.json"), JSON.stringify(config));
  return dir;
}

test("PASS returns bare true with no evidence", async () => {
  const dir = project({ command: "exit 0", cacheByHash: [] });
  const v = await runCheck(dir);
  assert.equal(v.pass, true);
  assert.equal(v.evidence, undefined);
});

test("FAIL returns false with truncated evidence", async () => {
  const dir = project({ command: "echo boom && exit 1", cacheByHash: [] });
  const v = await runCheck(dir);
  assert.equal(v.pass, false);
  assert.match(v.evidence, /boom/);
});

test("missing .verify.json yields a not-configured error, never a false PASS", async () => {
  const dir = mkdtempSync(join(tmpdir(), "verify-"));
  const v = await runCheck(dir);
  assert.equal(v.pass, false);
  assert.match(v.error, /not configured/i);
});

test("fastCommand failure short-circuits before command runs", async () => {
  const dir = project({
    fastCommand: "exit 3",
    command: "echo SHOULD_NOT_RUN && exit 0",
    cacheByHash: [],
  });
  const v = await runCheck(dir);
  assert.equal(v.pass, false);
  assert.doesNotMatch(v.evidence ?? "", /SHOULD_NOT_RUN/);
});

test("passPattern must match even on exit 0", async () => {
  const dir = project({ command: "echo nope", passPattern: "ALL GREEN", cacheByHash: [] });
  const v = await runCheck(dir);
  assert.equal(v.pass, false);
});

test("mode:full uses command even when affectedCommand present", async () => {
  // affectedCommand fails, command passes — mode:full must use command
  const dir = project({
    command: "exit 0",
    affectedCommand: "exit 1",
    cacheByHash: [],
    defaultMode: "affected",
  });
  const v = await runCheck(dir, "full");
  assert.equal(v.pass, true);
});

test("mode:affected with no prior PASS falls back to command", async () => {
  // No cache means no lastPassCommit → <base> can't be substituted → fall back to command
  const dir = project({
    command: "exit 0",
    affectedCommand: "exit 1",
    cacheByHash: [],
    defaultMode: "affected",
  });
  const v = await runCheck(dir, "affected");
  // Falls back to command (exit 0) because no lastPassCommit stored yet
  assert.equal(v.pass, true);
});

test("minTestCount: PASS with 0 tests detected yields false", async () => {
  const dir = project({
    command: "echo '0 passing'",
    cacheByHash: [],
    minTestCount: 1,
  });
  const v = await runCheck(dir);
  assert.equal(v.pass, false);
  assert.match(v.evidence, /minTestCount/);
});

test("minTestCount: PASS with sufficient tests succeeds", async () => {
  const dir = project({
    command: "echo '5 passing'",
    cacheByHash: [],
    minTestCount: 1,
  });
  const v = await runCheck(dir);
  assert.equal(v.pass, true);
});
