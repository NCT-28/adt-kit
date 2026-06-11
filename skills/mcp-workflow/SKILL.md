---
name: mcp-workflow
description: Use when researching, navigating code, or gathering from multiple sources — routes to context7 (external libs) / serena (internal code) / context-mode (large output) before answering.
---

# MCP & Context Optimization Workflow

## context-mode Tool Hierarchy (use in this order)

1. `ctx_batch_execute(commands, queries)` — primary research tool; runs shell commands in parallel, auto-indexes output, and returns matching snippets in one round trip. Use for gathering info across multiple sources.
2. `ctx_search(queries)` — search anything already indexed (prior commands, session memory). Batch multiple questions in one array call.
3. `ctx_execute(language, code)` — process/aggregate data already in the sandbox (filter, count, parse). Only what you `console.log()` enters the conversation; raw bytes stay in sandbox.
4. `ctx_fetch_and_index(url)` — fetch external URLs; results indexed for `ctx_search`, raw page bytes never enter context.

## When NOT to use context-mode — use plain Bash when:
- Observing short, fixed output (e.g. `git status`, `whoami`, `pwd`)
- Mutating state (`git commit`, `mkdir`, `rm`, `mv`, file writes)
- Using Read/Edit/Write tools (they need exact bytes in conversation to match against)

## Priority Tooling
- External library, framework, or SDK → start with `context7`
- Internal codebase logic → start with `serena`
- Use `graphify` to scope down before `serena` deep-reads — graph queries return a small subgraph, not whole files
- If `graphify-out/` does not exist yet, skip graphify steps and use `serena` directly

## Token Efficiency
- Before reading multiple files manually with `ls` or `cat`, use `serena`'s search and indexing tools to identify and fetch only the relevant code snippets
- Avoid asking the model to infer or guess external APIs — use `context7` to retrieve authoritative documentation instead
- Use `graphify query` before broad file reads — it returns a scoped subgraph (usually much smaller than raw grep output)

## Workflow

1. Use `context7` to fetch the latest official documentation when the task involves external frameworks, libraries, or SDK APIs.
2. Use `graphify query "<question>"` to locate relevant nodes and edges before touching the codebase.
   - Use `graphify path "<A>" "<B>"` to trace relationships between two symbols.
   - Use `graphify explain "<concept>"` for focused concept deep-dives.
   - If `graphify-out/wiki/index.md` exists, use it for broad navigation instead of raw source browsing.
   - Fall back to `graphify-out/GRAPH_REPORT.md` only for broad architecture review or when the above commands don't surface enough context.
3. Use `serena` to get a high-level overview of the project structure if it is not already in context.
4. Use `serena` to locate specific logic or variable definitions across the codebase instead of performing broad file reads.
5. Only request full file context if `serena`'s summaries and `graphify` results are insufficient — specifically: more than 3 ambiguous candidates returned, or the function exceeds ~100 LOC and full logic is needed.
6. When gathering info from multiple sources in parallel (grep, find, git log, etc.), use `ctx_batch_execute` instead of sequential Bash calls — output is auto-indexed and stays out of context.
7. After indexing, use `ctx_search` to query results rather than re-reading raw output.
8. To filter, count, or transform gathered data, use `ctx_execute` — only what you `console.log()` enters the conversation.

## Tool Failure Fallback
- If a tool fails or returns no results: fall back to the next tool in the priority chain (graphify → serena → direct file read)
- If all tools fail, notify the user before proceeding with direct file reads

## Context Maintenance
- Use `serena` to update or refresh internal project context when moving between different modules
- Re-query `context7` when framework versions, APIs, or external dependencies may have changed
- Run `graphify update .` at the end of a working session (not after every file edit) to keep the graph current (AST-only, no API cost)
