import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

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

// Extract test count from common runner output patterns.
// Returns the count if positively detected, or null if undetectable.
function detectTestCount(output) {
  const m = output.match(/(\d+)\s+(?:passing|passed|tests?\s+passed)/i);
  return m ? parseInt(m[1], 10) : null;
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

  // Resolve effective mode (caller > defaultMode > "affected").
  const effectiveMode = mode ?? cfg.defaultMode ?? "affected";

  // Command selection. Without cache (Task 7), no lastPassCommit → can't substitute <base>
  // → fall back to cfg.command for affected mode too.
  const cmd = effectiveMode === "full" || !cfg.affectedCommand
    ? cfg.command
    : cfg.command; // Task 7 upgrades this to proper <base> substitution

  // Fast gate: cheap check first, fail-fast.
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

  // minTestCount guard: only penalize when we positively detect a count below threshold.
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
    return { pass: true };
  }
  return { pass: false, evidence: truncate(res.out) };
}
