import type { Color, ModelEffort } from 'claude-code'

import { keyHints } from '../../core'

export const effortColors = {
  levels: {
    low: 'inactive',
    medium: 'suggestion',
    high: 'permission',
    xhigh: 'planMode',
    max: 'claude',
  } as Readonly<Record<string, Color>>,
  fallback: 'suggestion' as Color,
}

export const modelColors = {
  families: {
    fable: '#9B59B6',
    opus: '#D97757',
    sonnet: '#6A9BCC',
    haiku: '#E05252',
  } as Readonly<Record<string, Color>>,
  fallback: 'claude' as Color,
}

export const pickerConfig = {
  id: 'model-picker',
  title: 'Model',
  rows: 10,
  minRows: 5,
  hints: {
    cycle: `${keyHints.vertical} move · ${keyHints.horizontal} change · ${keyHints.close} close`,
    apply: `${keyHints.vertical} move · enter apply · ${keyHints.close} close`,
    all: `${keyHints.vertical} move · enter open · ${keyHints.close} close`,
  },
  labels: { model: 'Model', effort: 'Effort' },
  apply: 'Apply',
  allModels: 'All models…',
  allModelsFailed: 'Model list could not be opened: ',
  effortsFailed: 'Effort list could not be opened: ',
  latestModels: 'Latest models',
  currentOf: 'current: ',
  arrow: ' → ',
  noChanges: 'No changes',
  working: 'Claude is working. Apply when the turn ends.',
  switchNote: 'Switching mid-session drops the prompt cache: the next turn re-reads the whole context.',
  failed: 'Not applied: ',
  unavailable: 'Models unavailable: ',
  close: 'Close',
  effortMissing: 'not available',
  modelKey: 'model',
  effortKey: 'effortLevel',
  effortReadMs: 2000,
  fallbackFamilies: ['fable', 'opus', 'sonnet', 'haiku'] as readonly string[],
  storeKey: 'models',
  modelIdsLine: /Model IDs[^\n]*/,
  modelId: /'(claude-[a-z0-9-]+)'/g,
  levels: ['low', 'medium', 'high', 'xhigh', 'max'] as readonly ModelEffort[],
  defaultEffort: 'high' as ModelEffort,
  applying: 'Applying…',
  modelCommand: 'model',
  effortCommand: 'effort',
  failure: /invalid|not available|not supported|unknown|failed|error|denied|cannot|unable|not allowed/i,
}
