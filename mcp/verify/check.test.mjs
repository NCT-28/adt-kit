import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
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

// Helper: project with a real git repo (needed for git write-tree and git rev-parse).
function gitProject(config) {
  const dir = mkdtempSync(join(tmpdir(), "verify-git-"));
  execSync("git init", { cwd: dir });
  execSync("git config user.email test@test.com", { cwd: dir });
  execSync("git config user.name Test", { cwd: dir });
  writeFileSync(join(dir, ".verify.json"), JSON.stringify(config));
  writeFileSync(join(dir, "src.txt"), "v1");
  execSync("git add .", { cwd: dir });
  execSync("git commit -m init", { cwd: dir });
  return dir;
}

test("hash-skip returns cached true when nothing changed", async () => {
  const dir = gitProject({ command: "exit 0", cacheByHash: ["src.txt"] });
  const first = await runCheck(dir);
  assert.equal(first.pass, true);

  // Replace command with one that would fail — cache must intercept.
  writeFileSync(join(dir, ".verify.json"), JSON.stringify({ command: "exit 1", cacheByHash: ["src.txt"] }));
  const second = await runCheck(dir);
  assert.equal(second.pass, true);
  assert.equal(second.cached, true);
});

test("hash-skip re-runs when a watched file is staged", async () => {
  const dir = gitProject({ command: "exit 0", cacheByHash: ["src.txt"] });
  await runCheck(dir); // prime cache

  // Change and stage the file.
  writeFileSync(join(dir, "src.txt"), "v2");
  execSync("git add src.txt", { cwd: dir });

  writeFileSync(join(dir, ".verify.json"), JSON.stringify({ command: "exit 1", cacheByHash: ["src.txt"] }));
  const v = await runCheck(dir);
  assert.equal(v.pass, false); // cache miss → actually ran exit 1
});

test("hash-skip re-runs when command string changes", async () => {
  const dir = gitProject({ command: "exit 0", cacheByHash: [] });
  await runCheck(dir); // prime cache with command="exit 0"

  // Different command, same everything else.
  writeFileSync(join(dir, ".verify.json"), JSON.stringify({ command: "exit 1", cacheByHash: [] }));
  const v = await runCheck(dir);
  assert.equal(v.pass, false); // command in key changed → cache miss
});

test("hash-skip re-runs when a lockfile is added", async () => {
  const dir = gitProject({ command: "exit 0", cacheByHash: [] });
  await runCheck(dir); // prime cache

  // Add a lockfile after initial PASS.
  writeFileSync(join(dir, "package-lock.json"), "{}");
  execSync("git add package-lock.json", { cwd: dir });

  writeFileSync(join(dir, ".verify.json"), JSON.stringify({ command: "exit 1", cacheByHash: [] }));
  const v = await runCheck(dir);
  assert.equal(v.pass, false); // lockfile fingerprint changed → cache miss
});

test("lastPassCommit stored on PASS", async () => {
  const dir = gitProject({ command: "exit 0", cacheByHash: [] });
  await runCheck(dir);
  const cache = JSON.parse(readFileSync(join(dir, ".verify.cache.json"), "utf8"));
  assert.match(cache.lastPassCommit, /^[0-9a-f]{40}$/);
});

test("<base> in affectedCommand replaced with lastPassCommit", async () => {
  // First PASS with command to seed lastPassCommit.
  const dir = gitProject({
    command: "exit 0",
    affectedCommand: "exit 0",
    cacheByHash: [],
    defaultMode: "affected",
  });
  await runCheck(dir); // seeds lastPassCommit

  // Now switch: affectedCommand uses <base> substitution to run a git command that succeeds,
  // command would fail. Verify affected path is taken and passes.
  writeFileSync(join(dir, ".verify.json"), JSON.stringify({
    command: "exit 1",
    affectedCommand: "git log --oneline <base>..HEAD && true",
    cacheByHash: [],
    defaultMode: "affected",
  }));
  // Bust cache by staging a change.
  writeFileSync(join(dir, "src.txt"), "v2");
  execSync("git add src.txt", { cwd: dir });

  const v = await runCheck(dir, "affected");
  assert.equal(v.pass, true); // affectedCommand ran with real commit hash, not literal "<base>"
});

test("no prior PASS falls back to command when affectedCommand has <base>", async () => {
  // No cache file → no lastPassCommit → affectedCommand unusable → use command.
  const dir = gitProject({
    command: "exit 0",
    affectedCommand: "git log --oneline <base>..HEAD && true",
    cacheByHash: [],
    defaultMode: "affected",
  });
  const v = await runCheck(dir, "affected");
  assert.equal(v.pass, true); // fell back to command (exit 0), not affectedCommand with unresolved <base>
});
