# adt-kit

Token-frugal Claude Code plugin: context-engineering hooks, caveman default
mode, enforced MCP routing, and a `verify` boolean-oracle MCP server.

## Install

```
/plugin marketplace add <github-repo-url>
/plugin install adt-kit
```

> **Note:** If you have the standalone `caveman` plugin installed, uninstall it
> before installing adt-kit — adt-kit ships its own self-contained caveman
> directive and the two would inject it twice per turn.

## Configure

- `adt-kit.config.json` — caveman level (`lite|full|ultra`) and on/off.
- `.verify.json` (in your project root) — what `verify` runs. See skills/verification.
