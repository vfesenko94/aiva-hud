# AIVA HUD guide

[Overview](../README.md) · [Install](#install) · [Controls](#controls) · [Settings](#settings) · [Context](#context-history) · [Limits](#limits-and-estimates) · [Cache](#cache-timer) · [Help](#troubleshooting)

## Compatibility

Requires Claude Code with **TypeScript mods, native UI panes, and session APIs**, plus Git and access to GitHub. Support for command hooks or a JSON `statusLine` alone is insufficient.

Recorded local checks passed on **2.1.319**. Release preparation also passed TypeScript, manifest validation, and both pane-focus tests with **2.1.325 on Windows**. These automated checks do not establish a minimum supported build or verify interactive behavior across platforms.

## Install

At the Claude Code prompt:

```text
/plugin install aiva-hud --marketplace vfesenko94/aiva-hud
```

Confirm adding the marketplace with `y`, then press Enter for the default user scope. No separate API key or initial display setup is needed.

From a shell:

```sh
claude plugin install aiva-hud --marketplace vfesenko94/aiva-hud
```

Model, effort, context, and 5-hour usage are enabled by default. Some readings appear only after a reply, when Claude Code supplies data.

## Install from source

```sh
git clone https://github.com/vfesenko94/aiva-hud.git
cd aiva-hud
claude --plugin-dir .
```

This loads the checkout for one session. From another project, pass the checkout's absolute path to `--plugin-dir`.

## Update and removal

For a marketplace install, open **`/plugin` → Installed → AIVA HUD** to update, disable, or uninstall. Restart Claude Code after updating. Enable custom-marketplace auto-updates under **Marketplaces** if needed.

For a source checkout, run `git pull --ff-only` and start a new session. To stop loading it, launch without `--plugin-dir`. Preferences use the plugin store; recorded history has a limited lifetime as described in [Data and accuracy](#data-and-accuracy).

## Controls

### Open a panel

| Click | Result |
| --- | --- |
| Model | Open the native `/model` selector. |
| Effort | Open the native `/effort` selector. |
| Context counter | Explore context and recorded history. |
| `5h` or `7d` | View available limits and reset times. |
| ⚙ | Open Settings; `/aiva-hud` also works. |

One panel opens at a time, above the prompt or beside the conversation. Click a muted panel or use its displayed focus shortcut to activate it.

### Use the keyboard

Choose shortcuts in **Settings → Keys**, select **Save keys**, then restart Claude Code. A fresh install has no custom HUD shortcuts. The panel-focus fallback is `Ctrl+X`, then `Tab`.

| Location | Keys |
| --- | --- |
| HUD navigation | `←` / `→` select; `Enter` opens; `Esc` exits. Start with an empty prompt. |
| Context | `↑` / `↓` move; `→` expands; `←` collapses or returns to the parent; `PageUp` / `PageDown` move a page. |
| Settings | `↑` / `↓` move; `←` / `→` change an option; `Space` / `Enter` activate. |
| Any panel | `Esc` goes back or closes. |

### Change model and effort

Click the model name to open Claude Code's native `/model` selector. Click the effort reading to open `/effort`. Follow the native selector's controls; the HUD does not add a separate Apply step.

Changes affect the current session. Switching models drops the prompt cache. Effort may be absent until Claude Code exposes a configured or observed value.

## Settings

Open **⚙** or **`/aiva-hud`**. Display changes apply immediately, save automatically, and appear in a live preview.

### HUD

Choose a **Module**, then adjust **Enabled**, **Format**, and **On hover** where available. Choose **None** to disable the alternate hover reading.

| Component | Formats | Default |
| --- | --- | --- |
| Model | Full or short name; optional effort. | On, full name with effort. |
| Context | Used/window, used tokens, or percent. | On, used/window. |
| Limits 5h | Labeled usage, percent, fraction, or reset countdown. | On; countdown on hover. |
| Limits 7d | Same as 5h. | Off. |
| Settings icon | Show or hide ⚙. | On. |

Limit percentages and fractions show **quota used**. Disabling Context stops recording; previously recorded details remain subject to the history retention policy. **Reset to defaults** restores display and hint preferences after confirmation.

### Timer display

Show or hide the idle cache timer. Formats include `4:32`, `4m 32s`, `4m`, and `cache 4:32`. **Until** shows or hides the estimated expiry clock time.

### Hints

Hide individual Claude Code hints for a cleaner prompt. The preview shows the selected hint and strikes it through when hidden.

| Hide | Example |
| --- | --- |
| Mode-switch reminder | `(shift+tab to cycle)` |
| Shortcut help | `? for shortcuts` |
| Copy guidance | `ctrl+c to copy` |
| Task guidance | `↓ to manage` or `/tasks to see subagents` |

Mode-switch, shortcut, copy, manage, and agent-pointer hints are hidden by default. Keep any hints you find useful.

[Before-and-after example](../README.md#clean-prompt)

### Keys

Choose shortcuts and select **Save keys**, then restart Claude Code. Conflicts or invalid keybindings JSON prevent saving. Existing bindings are backed up beside the file as `keybindings.json.aiva-hud.bak`; unrelated bindings are preserved.

## Context history

Click the context counter to inspect instructions, tool definitions, MCP content, memory, skills, and recorded messages. Items within system categories are ordered by token count. Click a bar segment to jump to its category or turn.

Expand turns into model steps and tool calls to inspect context growth, summaries, and errors. Recorded compactions and rewound turns remain available, with summaries when captured.

The **findings** section highlights thinking, repeated reads with unchanged content, whole-file rewrites, large tool outputs, and images. Select a finding to inspect its recorded turn. These figures help identify context usage rather than measure billing.

Recording continues locally while Context is enabled, even with its panel closed. Missing activity cannot be reconstructed. The explorer does not remove individual context items or prevent compaction. Some token breakdowns are estimates, not monetary costs or exact quota allocations.

## Limits and estimates

Click **5h** or **7d** to see all available windows, quota used, and reset countdowns and times.

- **5 hours:** projects usage at reset from the average account-wide pace so far. Available after the first 30 minutes. Bright bar segments show used quota; faded segments show projected additional usage.
- **7 days:** shows remaining quota and an approximate daily allowance until reset.

Projections are planning estimates; a different task or model can change the pace. Limits depend on the plan data Claude Code provides and may be unavailable for some providers or builds.

Windows on the same machine share the latest reading when they use the same account and Claude configuration directory. Readings refresh after replies and can lag during long turns. After reset, expired readings wait for new data.

## Cache timer

The idle timer estimates prompt-cache expiry and shows **cache cold** after expiry. It is hidden while Claude is working; a countdown does not guarantee a cache hit.

Set the plugin's **Prompt cache TTL** (`cacheTtl`) through `/config`:

| Value | Behavior |
| --- | --- |
| `auto` | Use Claude Code's setting, then observed cache behavior. Fallback: one hour with plan-limit data, five minutes without it. |
| `5m` | Five-minute timer. |
| `1h` | One-hour timer. |

### Experimental keep-warm

For a one-hour TTL, manually enable **keep warm** beside the timer. It makes extra model requests before estimated expiry, consumes quota, and keeps its replies out of the conversation.

The next main-session message disarms it. Model changes, expiry, or safety stops can also end it. Cache retention and net savings are not guaranteed.

## Data and accuracy

The ordinary HUD uses Claude Code's data without a separate API key or extra model requests. Keep-warm is the optional exception.

| Data | Storage |
| --- | --- |
| Preferences | Plugin store. |
| Context history | Turn details and compact summaries in the plugin store; the current history index is held in the host process. |
| Shared limits | `aiva-hud-limits.json` in the same directory. |
| Keyboard shortcuts | `keybindings.json`, with a backup on save. |

The configuration directory is `CLAUDE_CONFIG_DIR`, otherwise `~/.claude`. History can contain prompt excerpts and tool summaries. Turning Context off stops recording; this is not a permanent transcript archive.

Stored details have a budget of about 1 MiB of serialized JSON per runtime; older details can be evicted. Session lifecycle cleanup removes details when their records are pruned, and session start sweeps unreferenced details older than seven days. Closing or resuming a session does not guarantee that its history remains available. Legacy `aiva-hud/<session id>/` files are no longer read or automatically removed.

Top-level context and limits come from Claude Code. Detailed token counts, cache expiry, and projections include estimates. They are not billing records.

## Troubleshooting

| Problem | Check |
| --- | --- |
| No HUD or `/aiva-hud` | Plugin loading and [build compatibility](#compatibility). |
| Missing effort or limits | Enable the reading and send a message; Claude Code must supply the data. |
| Missing history details | Context must have been enabled when the activity happened. |
| Panel ignores arrows | Click it or use its focus shortcut. Check Pane bindings below. |
| New shortcuts do not work | Restart after **Save keys**; check conflicts and terminal bindings. |

Expected Pane actions: `pane:scrollUp` / `pane:scrollDown`, `pane:top` / `pane:bottom`, and `abovePrompt:press`.

[Report an issue](https://github.com/vfesenko94/aiva-hud/issues) with your Claude Code version, OS, terminal, and reproduction steps. Remove private information from screenshots and logs.
