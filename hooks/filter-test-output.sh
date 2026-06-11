#!/bin/bash
# PostToolUse:Bash — Filter test output, chỉ giữ failures (chỉ chạy cho test commands)

input=$(cat)
stdout=$(echo "$input" | jq -r '.tool_response.stdout // ""')
command=$(echo "$input" | jq -r '.tool_input.command // ""')

# Chỉ filter khi là test command — các lệnh khác bỏ qua
if ! echo "$command" | grep -qE 'test|jest|vitest|pytest|go test|cargo test|rspec'; then
  exit 0
fi

line_count=$(echo "$stdout" | wc -l)

# Chỉ filter khi output đủ dài
if [ "$line_count" -lt 30 ]; then
  exit 0
fi

filtered=$(echo "$stdout" | grep -E '(FAIL|ERROR|✗|×|FAILED|Error:|assert|Traceback|failed [0-9])' | head -50)

if [ -z "$filtered" ]; then
  filtered="All tests passed."
fi

echo "{
  \"hookSpecificOutput\": {
    \"hookEventName\": \"PostToolUse\",
    \"updatedToolOutput\": {
      \"stdout\": $(echo "$filtered" | jq -Rs .),
      \"stderr\": \"\",
      \"interrupted\": false,
      \"isImage\": false
    }
  }
}"
