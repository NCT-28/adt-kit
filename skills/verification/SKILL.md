---
name: verification
description: Use before claiming any bug fix or logic change is done — runs the project's check via the verify MCP tool and reports its boolean verdict with evidence on failure.
---

# Verification via Sandbox

**NEVER say "code looks correct" without executing it. Seeing is not verifying.**

After any bug fix or logic change, verify by running the code — not by reading it.

## How to verify

Call the `verify` MCP tool. It reads `.verify.json` from the project root and
runs the configured check inside its own process.

- **PASS → `true`.** Done. No log to read.
- **FAIL → `false` + minimal failing-test evidence.** Fix using that evidence,
  then call `verify` again.
- **"not configured" error** → no `.verify.json`. Ask the user for the check
  command; never claim PASS without it.

For pre-merge / branch finishing, call `verify` with `mode: "full"` to force
the full suite regardless of `defaultMode`.

`.verify.json` schema (project root):

```json
{
  "command": "npm test",
  "affectedCommand": "npm test -- --changedSince=<base>",
  "fastCommand": "npm run typecheck && npm run lint",
  "passPattern": "optional regex",
  "cacheByHash": ["src/**", "test/**"],
  "minTestCount": 1,
  "fullOnMerge": true,
  "defaultMode": "affected"
}
```

`<base>` in `affectedCommand` is a literal placeholder — the `verify` server
replaces it with the git commit hash of the last PASS. On first run (no prior
PASS), `affectedCommand` is skipped and `command` (full suite) runs instead.
`minTestCount: 1` guards against a misconfigured runner that exits 0 with no
tests, which would otherwise be a false PASS.

## Required steps

1. Identify the appropriate test/run command for the language and project
2. Use the `verify` MCP tool to execute it in a sandbox
3. Parse the output: determine PASS or FAIL with evidence from the output
4. Only claim the fix is complete if the result is PASS

**If no test exists:** write a minimal test that reproduces the bug first, then run it.

## Patterns to avoid

- "The fix looks correct" → WRONG
- "Compiled successfully" alone → WRONG (compile ≠ logic correct)
- Running the test and reporting its output → CORRECT
