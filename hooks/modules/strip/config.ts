import { keyConfig, keyHints } from '../../core'
import type { HintKey } from '../../core'

export const stripConfig = {
  navAction: keyConfig.keys.strip.action,
  navHint: ` ${keyHints.horizontal} select · ↵ open · ${keyHints.close} exit`,
  hints: {
    cycle: /\s*\(\S+ to cycle\)/i,
    prStatus: /^.+ for PR status$/i,
    subagents: /^\/tasks to see subagents$/i,
    interrupt: /^\S+ to interrupt$/i,
    tasks: /^\S+ to (show|hide) tasks$/i,
    teamLead: /^\S+ to return to team lead$/i,
    shortcuts: /^\S+ for shortcuts$/i,
    agents: /^←\s*\d+\s+agents?$/i,
    copy: /^\S+ to copy\b.*$|^\S+ to native select$/i,
    voice: /^hold \S+ to speak$/i,
    manage: /^\S+ to (manage|view tasks)$|\s*\(\S+ to (manage|view tasks)\)/i,
    artifacts: /^\S+ to (view artifacts|open in browser)$/i,
  } satisfies Record<HintKey, RegExp>,
}
