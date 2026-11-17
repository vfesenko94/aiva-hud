import type { Color } from 'claude-code'

import { keyConfig, keyHints } from '../../core'

export type ToolKind = 'read' | 'write' | 'shell' | 'mcp' | 'skill' | 'agent' | 'system'

export type ToolAction = { verb: string; kind: ToolKind }

export type ToolParts = { input?: string; output: string }

const actions: Readonly<Record<string, ToolAction>> = {
  Read: { verb: 'read', kind: 'read' },
  Grep: { verb: 'search', kind: 'read' },
  Glob: { verb: 'find', kind: 'read' },
  WebFetch: { verb: 'fetch', kind: 'read' },
  WebSearch: { verb: 'web search', kind: 'read' },
  Write: { verb: 'write', kind: 'write' },
  Edit: { verb: 'edit', kind: 'write' },
  MultiEdit: { verb: 'edit', kind: 'write' },
  NotebookEdit: { verb: 'edit', kind: 'write' },
  Bash: { verb: 'bash', kind: 'shell' },
  PowerShell: { verb: 'powershell', kind: 'shell' },
  Skill: { verb: 'skill', kind: 'skill' },
  Agent: { verb: 'agent', kind: 'agent' },
  Task: { verb: 'agent', kind: 'agent' },
  ToolSearch: { verb: 'load tools', kind: 'system' },
}

const largeTokens = 2000

const parts: Readonly<Record<string, ToolParts>> = {
  Read: { output: 'file' },
  Grep: { output: 'found' },
  Glob: { output: 'found' },
  WebFetch: { input: 'prompt', output: 'summary' },
  WebSearch: { output: 'results' },
  Write: { input: 'content', output: 'reply' },
  Edit: { input: 'diff', output: 'reply' },
  MultiEdit: { input: 'diff', output: 'reply' },
  NotebookEdit: { input: 'cell', output: 'reply' },
  Bash: { input: 'command', output: 'output' },
  PowerShell: { input: 'command', output: 'output' },
  Skill: { output: 'instructions' },
  Agent: { input: 'prompt', output: 'report' },
  Task: { input: 'prompt', output: 'report' },
  ToolSearch: { output: 'schemas' },
}

export const contextConfig = {
  toggleAction: keyConfig.keys.context.action,
  layout: {
    paneId: 'context',
    paneTitle: 'Context',
    paneRows: 30,
    paneMinRows: 5,
    rowsKey: 'context-rows',
    previewIndent: 6,
    systemInset: 2,
    barTurns: 15,
    promptRoom: 300,
    sectionRoom: 20,
    sectionLabel: 8,
    outcomeRoom: 80,
    errorRoom: 40,
    barRoomMin: 10,
    systemBarShare: 3,
    messageCellTokens: 1000,
    rowInset: 3,
    sectionPadding: 13,
    tokenWidth: 7,
    cellGrowth: 1.02,
    nameWidth: { min: 12, max: 30 },
    previewLines: 12,
    columns: { mark: 4, number: 5, gap: 2, indent: 4 },
    childIndent: 2,
  },
  systemItems: {
    unused: 'unused',
    listed: 'listed',
    deferred: 'deferred',
  },
  findings: {
    label: 'findings',
    note: 'what filled the context and could be trimmed',
    minTokens: 1000,
    largeTokens,
    callsPerTurn: 12,
    groupRows: 8,
    noteGroups: 2,
    imagePixelsPerToken: 750,
    kinds: {
      thinking: { label: 'Thinking', note: 'lower /effort or /clear between tasks' },
      repeats: { label: 'Re-read', note: 'same content read again' },
      rewrites: { label: 'Rewritten', note: 'whole file written again' },
      large: { label: 'Large outputs', note: `tool results over ${largeTokens / 1000}k` },
      images: { label: 'Images', note: 'screenshots and pictures' },
    },
  },
  partColors: { prompt: 'permission', tools: 'suggestion', answer: 'success' } satisfies Record<string, Color>,
  hint: `${keyHints.vertical} read · ←→ tree · ${keyHints.close} back`,
  heavy: { warning: 0.02, error: 0.06 },
  fallbackWindow: 200_000,
  maxRedraws: 3,
  missMinimumTokens: 5000,
  charsPerToken: 4,
  memory: {
    repeatEntries: 256,
    detailEntries: 32,
  },
  tools: {
    actions,
    parts,
    briefKeys: ['file_path', 'notebook_path', 'path', 'command', 'pattern', 'query', 'url', 'skill', 'description', 'prompt'],
    callKeys: ['tool', 'tool_use_id', 'agentId', 'requestMeta', 'consent'],
    shells: ['Bash', 'PowerShell'],
    shellNote: 'Shell cwd was reset to ',
  },
  storage: {
    prefix: 'context:',
    budget: 1_048_576,
    staleMs: 7 * 24 * 60 * 60 * 1000,
  },
  patterns: {
    messagesCategory: /^messages$/i,
    toolError: /<\/?tool_use_error>/g,
    instructionsAttachment: 'mcp_instructions_delta',
    serverHeading: /^## /m,
    toolCategories: {
      mcp: { name: /mcp tools/i, color: 'cyan_FOR_SUBAGENTS_ONLY' },
      skill: { name: /skill/i, color: 'warning' },
      agent: { name: /agent/i, color: 'permission' },
      system: { name: /system tools/i, color: 'inactive' },
    } satisfies Record<Exclude<ToolKind, 'read' | 'write' | 'shell'>, { name: RegExp; color: Color }>,
    sections: {
      systemTools: /system tools/i,
      mcpInstructions: /mcp server instructions/i,
      mcp: /mcp/i,
      memory: /memory/i,
      skills: /skill/i,
      agents: /agent/i,
    },
  },
}
