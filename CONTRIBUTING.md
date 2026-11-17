# Contributing

Use a Claude Code build that supports TypeScript mods, native UI panes, and session APIs. Release checks have run on Windows with Claude Code 2.1.325; support on other platforms still needs interactive verification.

## Prepare a checkout

Clone the repository and start Claude Code from its root:

```sh
claude --plugin-dir .
```

When Claude Code loads a mod from a folder you own, it writes its SDK declarations and TypeScript configuration to `.claude-plugin/types/`. These generated files are ignored by Git and must not be edited or committed. Load the checkout once before running TypeScript checks. `claude plugin validate .` alone does not generate these files.

Use TypeScript 5.4 or newer. The project has no package build step: Claude Code loads `hooks/register.tsx` directly.

## Checks

```sh
claude plugin validate .
npx -y tsc -p . --noEmit
claude plugin test .
```

Source files in `hooks/`, `types/`, and `.claude-plugin/plugin.json` must contain no Cyrillic text. Hook source must contain no comments. With ripgrep, both commands below should print nothing (exit code 1 means no matches):

```sh
rg -n '[\x{0400}-\x{04FF}]' hooks types .claude-plugin/plugin.json
rg -n '^\s*(//|/\*|\*)|\{/\*' hooks
```

`CLAUDE.md` and `RULES.md` are maintainer documents. The validator warns that a root `CLAUDE.md` does not ship runtime context; this plugin does not depend on it doing so. A missing listing icon is a separate catalog warning, not a marketplace installation failure.

Before publishing, work through [the release checklist](docs/release-checklist.md). Automated checks do not replace interactive installation and UI checks.
