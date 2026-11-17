# aiva-hud

Claude Code mod: a status strip (model, effort, context, limits, cache, shells, `⚙`) with Context, model picker and Settings panes.

This file is static. All rules and engine facts live in `RULES.md`; add new ones there, not here.

@RULES.md

## Locations

- Work copy: this repo. All edits here, commit each step.
- Live: `~/.claude/mods/aiva-hud`. Sync `.claude-plugin/plugin.json`, `hooks/`, `types/` only after checks pass AND the owner confirms.
- Backup: `~/.claude/mods-archive/`. Never touch.
- Engine API: `.claude-plugin/types/claude-code/index.d.ts` (gitignored; grep it, do not read whole).

## Structure

```
hooks/
  register.tsx   composition root: creates runtimes, owns every matcher-less hook, gated calls, strip block list
  actions.ts     strip press/submit dispatch by block id
  core/          config (shared constants), format, level, ui, writer, pane
  modules/       settings strip model context limits cache shells, each with its own config.ts
```

## Checks

```
npx -y tsc -p . --noEmit
claude plugin validate .
grep -rnP "[\x{0400}-\x{04FF}]" hooks types .claude-plugin/plugin.json   # must be empty
grep -rnE "^\s*(//|/\*|\*)|\{/\*" hooks                                  # must be empty
```
