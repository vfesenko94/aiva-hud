import type { Color } from 'claude-code'

import { keyHints } from '../../core'
import type { CacheDisplay, CacheFormat, ContextFormat, Display, HintKey, LimitFormat, ModelFormat } from '../../core'

type FormatSpec = { label: string; hint?: string }

type DisplaySpec<F extends string> = { hasHover: boolean; formats: Record<F, FormatSpec> }

const limitFormats = (label: string, used: number, countdown: string): Record<LimitFormat, FormatSpec> => ({
  labeled: { label: `${label} ${used}%` },
  percent: { label: `${used}%` },
  labeledFraction: { label: `${label} ${used}/100` },
  fraction: { label: `${used}/100` },
  countdown: { label: countdown, hint: 'time until the window resets' },
})

const activity = { model: true, effort: true, context: true, fiveHour: true, sevenDay: false, shells: false, agents: false, settings: true, cache: true }

type ModuleSpec = { key: keyof typeof activity; label: string; color: Color; sample?: string; description?: string; note?: string; prefix?: string; isLocked?: boolean }

const modules: readonly ModuleSpec[] = [
  { key: 'model', label: 'Model', color: '#D97757' },
  { key: 'context', label: 'Context', description: 'tokens used of the context window', color: 'success' },
  { key: 'fiveHour', label: 'Limits 5h', description: 'plan usage, resets every 5 hours', color: 'success', prefix: '5h' },
  { key: 'sevenDay', label: 'Limits 7d', description: 'plan usage, resets every 7 days', color: 'success', prefix: '7d' },
  { key: 'shells', label: 'Background shells', color: 'suggestion', sample: '2 shells', isLocked: true },
  { key: 'agents', label: 'Agents', color: 'suggestion', sample: '1 agent', isLocked: true },
  { key: 'settings', label: 'Settings icon', color: 'inactive', sample: '⚙', note: 'open with /aiva-hud' },
]

export const settingsConfig = {
  id: 'settings',
  title: 'Settings',
  rows: 10,
  minRows: 5,
  contentColumns: 72,
  storeKey: 'settings',
  commandArgs: ['', 'settings'] as readonly string[],
  commandUsage: 'Usage: /aiva-hud [settings]',
  description: 'Open the aiva-hud settings',
  argumentHint: '[settings]',
  block: '⚙ ',
  back: '‹ Back',
  separator: ' · ',
  pointer: { before: ' → ', after: ' ← ', color: 'claude' as Color },
  labelWidth: 10,
  hintGap: 3,
  sectionGap: 3,
  labels: { module: 'Module', toggle: 'Enabled', format: 'Format', hover: 'On hover', until: 'Until' },
  hintOptions: { hidden: 'Hidden', shown: 'Shown' },
  none: 'None',
  hoverHint: 'on hover: ',
  lockedNote: 'in development',
  more: { above: '↑', below: '↓', label: 'more' },
  sections: { hud: 'HUD', cache: 'Cache timer', hints: 'Hints', keys: 'Keys' },
  sectionDescriptions: {
    hud: 'what the status bar shows and how',
    cache: 'countdown until the prompt cache expires',
    hints: 'hide Claude Code hints for a cleaner prompt',
    keys: 'keyboard shortcuts for the HUD',
  },
  help: {
    list: `${keyHints.vertical} move · ${keyHints.activate} open · ${keyHints.close} close`,
    back: `${keyHints.vertical} move · ${keyHints.activate} back · ${keyHints.close} back`,
    module: `${keyHints.vertical} move · ${keyHints.horizontal} module · ${keyHints.close} back`,
    choice: `${keyHints.vertical} move · ${keyHints.horizontal} change · ${keyHints.close} back`,
    check: `${keyHints.vertical} move · ${keyHints.activate} toggle · ${keyHints.close} back`,
    save: `${keyHints.vertical} move · ${keyHints.activate} save · ${keyHints.close} back`,
    reset: `${keyHints.horizontal} move · ${keyHints.activate} choose · ${keyHints.close} cancel`,
    star: `${keyHints.grid} move · ${keyHints.activate} choose · ${keyHints.close} close`,
  },
  keys: {
    texts: {
      save: 'Save keys',
      file: 'in ',
      reading: 'Reading the key bindings…',
      saving: 'Saving…',
      saved: 'Saved. Restart Claude Code to use the new keys.',
      notSaved: 'Not saved: ',
      untouched: 'Nothing will be changed.',
      noChanges: 'pick a key above to change it',
      backup: 'the previous file is kept beside it as ',
      none: 'none',
      engineDefault: '(Claude Code default)',
      bound: 'bound',
      unbound: 'not bound',
      was: 'was ',
      taken: 'taken by ',
    },
  },
  reset: { label: 'Reset to defaults', question: 'Reset all settings to defaults?', cancel: 'Cancel', confirm: 'Reset', color: 'error' as Color },
  star: {
    repo: 'vfesenko94/aiva-hud',
    storeKey: 'star',
    glyph: '★',
    color: 'warning' as Color,
    thanksColor: 'success' as Color,
    texts: {
      ask: 'Like this mod? Star aiva-hud on GitHub',
      give: 'Star',
      hide: 'Hide',
      busy: 'Opening GitHub…',
      starred: 'Starred on GitHub. Thank you!',
      opened: 'Opened in your browser. Thank you!',
      copied: 'Link copied: ',
      manual: 'Star it at ',
    },
  },
  modules,
  displays: {
    model: { hasHover: false, formats: { full: { label: 'Opus 5.5' }, family: { label: 'Opus' } } },
    context: { hasHover: true, formats: { full: { label: '50k/1M' }, used: { label: '50k', hint: 'tokens used, no window size' }, percent: { label: '5%', hint: 'share of the window used' } } },
    fiveHour: { hasHover: true, formats: limitFormats('5h', 23, '2h 15m') },
    sevenDay: { hasHover: true, formats: limitFormats('7d', 41, '3d 4h') },
    cache: { hasHover: false, formats: { clock: { label: '4:32' }, units: { label: '4m 32s' }, minutes: { label: '4m' }, labeled: { label: 'cache 4:32' } } },
  } satisfies { model: DisplaySpec<ModelFormat>; context: DisplaySpec<ContextFormat>; fiveHour: DisplaySpec<LimitFormat>; sevenDay: DisplaySpec<LimitFormat>; cache: DisplaySpec<CacheFormat> },
  effort: { sample: 'high', color: 'permission' as Color, hint: 'model with effort' },
  cacheNote: 'shown above the idle prompt',
  cacheUntil: ' (until 14:05)',
  hints: {
    cycle: '(shift+tab to cycle)',
    prStatus: 'gh auth login for PR status',
    subagents: '/tasks to see subagents',
    interrupt: 'esc to interrupt',
    tasks: 'ctrl+t to show tasks',
    teamLead: 'esc to return to team lead',
    shortcuts: '? for shortcuts',
    agents: '← 2 agents',
    copy: 'ctrl+c to copy',
    voice: 'hold space to speak',
    manage: '↓ to manage',
    artifacts: 'enter to view artifacts',
  } satisfies Record<HintKey, string>,
  hintsPill: { text: '⏵⏵ auto mode on', color: 'warning' as Color },
  hintsHidden: ' hidden',
  defaults: {
    activity,
    display: {
      model: { format: 'full', hover: null },
      context: { format: 'full', hover: null },
      fiveHour: { format: 'labeled', hover: 'countdown' },
      sevenDay: { format: 'labeled', hover: 'countdown' },
      cache: { format: 'labeled', hover: null, until: true },
    } satisfies { model: Display<ModelFormat>; context: Display<ContextFormat>; fiveHour: Display<LimitFormat>; sevenDay: Display<LimitFormat>; cache: CacheDisplay },
    hints: { cycle: false, prStatus: true, subagents: true, interrupt: true, tasks: true, teamLead: true, shortcuts: false, agents: false, copy: false, voice: true, manage: false, artifacts: true } satisfies Record<HintKey, boolean>,
  },
}
