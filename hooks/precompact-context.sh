#!/bin/bash
# PreCompact — Inject danh sách files modified vào context trước khi summarize

modified=$(git diff --name-only 2>/dev/null | head -20)
staged=$(git diff --cached --name-only 2>/dev/null | head -10)
branch=$(git branch --show-current 2>/dev/null)

echo "{
  \"hookSpecificOutput\": {
    \"hookEventName\": \"PreCompact\",
    \"additionalContext\": \"PRESERVE IN SUMMARY — Branch: ${branch}. Unstaged changes: $(echo "$modified" | tr '\n' ' '). Staged: $(echo "$staged" | tr '\n' ' ').\"
  }
}"
