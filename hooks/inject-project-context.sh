#!/bin/bash
# SessionStart:startup — Inject project context, tránh Claude tự grep/ls để hiểu project

branch=$(git branch --show-current 2>/dev/null)
recent=$(git log --oneline -5 2>/dev/null)
modified=$(git diff --name-only HEAD 2>/dev/null | head -10)
staged=$(git diff --cached --name-only 2>/dev/null | head -5)

echo "## Project Context (auto-injected at session start)
- Branch: ${branch:-unknown}
- Recent commits:
$(echo "$recent" | sed 's/^/  /')
- Modified (unstaged): $(echo "$modified" | tr '\n' ' ')
- Staged: $(echo "$staged" | tr '\n' ' ')
- Key files: CLAUDE.md (project instructions)"

# --- adt-kit caveman default mode (self-contained) ---
# Coexistence guard: skip injection if another plugin already injected this session.
CAVEMAN_FLAG="${TMPDIR:-/tmp}/adt-kit-caveman-${CLAUDE_SESSION_ID:-default}"
if [ ! -f "$CAVEMAN_FLAG" ]; then
  CONFIG="${CLAUDE_PLUGIN_ROOT}/adt-kit.config.json"
  CM_ENABLED="$(node -e "try{console.log(require('${CONFIG}').caveman.enabled)}catch(e){console.log('true')}" 2>/dev/null)"
  CM_LEVEL="$(node -e "try{console.log(require('${CONFIG}').caveman.level)}catch(e){console.log('full')}" 2>/dev/null)"
  if [ "$CM_ENABLED" = "true" ]; then
    touch "$CAVEMAN_FLAG"
    printf 'CAVEMAN MODE ACTIVE (%s). Drop articles/filler/pleasantries/hedging. Fragments OK. Pattern: [thing] [action] [reason]. [next step]. EXCEPTIONS write normal prose: security warnings, irreversible-action confirmations, multi-step sequences where order risks misread, and all code/commit/PR text. User can say "stop caveman" / "normal mode" to disable this session.\n' "$CM_LEVEL"
  fi
fi
