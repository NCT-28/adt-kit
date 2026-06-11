import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";

const HEAD_LINES = 100;
const TAIL_LINES = 50;

function truncate(text) {
  const lines = text.split("\n");
  if (lines.length <= HEAD_LINES + TAIL_LINES) return text.trimEnd();
  return [
    ...lines.slice(0, HEAD_LINES),
    `… [${lines.length - HEAD_LINES - TAIL_LINES} lines elided] …`,
    ...lines.slice(-TAIL_LINES),
  ].join("\n");
}

function run(cmd, cwd) {
  try {
    const out = execSync(cmd, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

function detectTestCount(output) {
  const m = output.match(/(\d+)\s+(?:passing|passed|tests?\s+passed)/i);
  return m ? parseInt(m[1], 10) : null;
}

const LOCKFILES = [
  "package-lock.json", "pnpm-lock.yaml", "yarn.lock",
  "poetry.lock", "Cargo.lock", "go.sum", "Gemfile.lock", "requirements.txt",
];

function lockfileFingerprint(projectDir) {
  for (const f of LOCKFILES) {
    const p = join(projectDir, f);
    if (existsSync(p)) {
      try {
        const st = statSync(p);
        return `${f}:${st.mtimeMs}:${st.size}`;
      } catch {
        return `${f}:error`;
      }
    }
  }
  return "no-lockfile";
}

function gitIndexHash(projectDir) {
  try {
    return execSync("git write-tree", { cwd: projectDir, encoding: "utf8" }).trim();
  } catch {
    return "no-git";
  }
}

function gitHeadCommit(projectDir) {
  try {
    return execSync("git rev-parse HEAD", { cwd: projectDir, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function computeCacheKey(projectDir, cmd, globs) {
  const h = createHash("sha256");
  h.update(`cmd:${cmd};`);
  h.update(`lockfile:${lockfileFingerprint(projectDir)};`);
  h.update(`git:${gitIndexHash(projectDir)};`);
  for (const g of (globs || [])) {
    const p = join(projectDir, g);
    try {
      const st = statSync(p);
      h.update(`${g}:${st.mtimeMs}:${st.size};`);
    } catch {
      h.update(`${g}:absent;`);
    }
  }
  return h.digest("hex");
}

export async function runCheck(projectDir, mode) {
  const cfgPath = join(projectDir, ".verify.json");
  if (!existsSync(cfgPath)) {
    return { pass: false, error: "verify not configured: no .verify.json in project root" };
  }
  let cfg;
  try {
    cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
  } catch {
    return { pass: false, error: "verify not configured: .verify.json is not valid JSON" };
  }
  if (!cfg.command) {
    return { pass: false, error: "verify not configured: .verify.json missing \"command\"" };
  }

  // Resolve effective mode.
  const effectiveMode = mode ?? cfg.defaultMode ?? "affected";

  // Load cache.
  const cachePath = join(projectDir, ".verify.cache.json");
  let cachedData = null;
  if (existsSync(cachePath)) {
    try { cachedData = JSON.parse(readFileSync(cachePath, "utf8")); } catch { /* corrupt */ }
  }

  // Resolve command with <base> substitution.
  let cmd;
  if (effectiveMode === "full" || !cfg.affectedCommand) {
    cmd = cfg.command;
  } else {
    const lastPassCommit = cachedData?.lastPassCommit;
    if (!lastPassCommit) {
      // No prior PASS → can't use affectedCommand safely → fall back to full command.
      cmd = cfg.command;
    } else if (cfg.affectedCommand.includes("<base>")) {
      cmd = cfg.affectedCommand.replace("<base>", lastPassCommit);
    } else {
      cmd = cfg.affectedCommand;
    }
  }

  // Hash-skip cache: skip re-run if nothing changed since last PASS.
  const cacheKey = computeCacheKey(projectDir, cmd, cfg.cacheByHash);
  if (cachedData?.pass === true && cachedData?.key === cacheKey) {
    return { pass: true, cached: true };
  }

  // Fast gate.
  if (cfg.fastCommand) {
    const fast = run(cfg.fastCommand, projectDir);
    if (fast.code !== 0) {
      return { pass: false, evidence: truncate(fast.out) };
    }
  }

  // Run suite.
  const res = run(cmd, projectDir);
  const passByExit = res.code === 0;
  const passByPattern = cfg.passPattern ? new RegExp(cfg.passPattern).test(res.out) : true;

  // minTestCount guard.
  const minCount = cfg.minTestCount ?? 0;
  if (passByExit && passByPattern && minCount > 0) {
    const detected = detectTestCount(res.out);
    if (detected !== null && detected < minCount) {
      return {
        pass: false,
        evidence: `verify: ${detected} test(s) ran but minTestCount=${minCount}; check runner config\n${truncate(res.out)}`,
      };
    }
  }

  if (passByExit && passByPattern) {
    const lastPassCommit = gitHeadCommit(projectDir);
    try {
      writeFileSync(cachePath, JSON.stringify({ pass: true, key: cacheKey, lastPassCommit }));
    } catch { /* non-fatal */ }
    return { pass: true };
  }
  return { pass: false, evidence: truncate(res.out) };
}
