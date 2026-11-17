import type { ToolCallResult } from 'claude-code'

import type { Step, StepTool } from '../../../../types'
import { count, cut, oneLine } from '../../../core'
import { contextConfig } from '../config'
import type { ToolAction, ToolKind, ToolParts } from '../config'

type ToolArgs = Readonly<Record<string, unknown>>

export type ToolView = {
  id: string
  name: string
  verb: string
  kind: ToolKind
  subject: string
  wrote?: string
  input: string
  output: string
  isError: boolean
  outcome?: string
  repeatOf?: number
}

const fieldsOf = (value: unknown): ToolArgs | undefined => (typeof value === 'object' && value !== null ? (value as ToolArgs) : undefined)

const numberOf = (value: unknown) => (typeof value === 'number' ? value : undefined)

const textOf = (args: ToolArgs, key: string) => {
  const value = args[key]

  return typeof value === 'string' ? value : ''
}

const linesOf = (args: ToolArgs, key: string) => {
  const value = args[key]

  return typeof value === 'string' ? value.split('\n').length : 0
}

const fileName = (path: string) => path.replace(/\\/g, '/').split('/').pop() ?? ''

export const argsOf = (call: ToolArgs, callKeys: readonly string[]): ToolArgs =>
  Object.fromEntries(Object.entries(call).filter(([key]) => !callKeys.includes(key)))

export const briefOf = (args: ToolArgs, cwd: string, briefKeys: readonly string[]) => {
  const value = briefKeys.map(key => args[key]).find(one => typeof one === 'string')
  if (typeof value !== 'string') return ''

  const text = oneLine(value)
  const root = cwd.replace(/\\/g, '/').replace(/\/?$/, '/')
  const slashed = text.replace(/\\/g, '/')

  return slashed.toLowerCase().startsWith(root.toLowerCase()) ? slashed.slice(root.length) : text
}

export const subjectOf = (tool: string, args: ToolArgs, brief: string) => {
  const arg = (key: string) => oneLine(textOf(args, key))
  switch (tool) {
    case 'Read':
    case 'Write':
    case 'Edit':
    case 'MultiEdit':
      return fileName(arg('file_path'))
    case 'NotebookEdit':
      return fileName(arg('notebook_path'))
    case 'Grep':
      return `"${arg('pattern')}"`
    case 'WebFetch':
      return arg('url').replace(/^https?:\/\//, '').split('/')[0] ?? ''
    case 'ToolSearch':
      return arg('query').replace(/^select:/, '').split(',').join(', ')
    case 'Bash':
    case 'PowerShell':
    case 'Agent':
    case 'Task':
      return arg('description')
  }
  if (!tool.startsWith('mcp__')) return brief

  const first = Object.values(args).find(value => typeof value === 'string')

  return typeof first === 'string' ? oneLine(first) : ''
}

export const useOf = (tool: string, args: ToolArgs) => {
  if (tool.startsWith('mcp__')) return tool
  const name = tool === 'Skill' ? textOf(args, 'skill') : tool === 'Agent' || tool === 'Task' ? textOf(args, 'subagent_type') : ''

  return name ? `${tool === 'Skill' ? 'skill' : 'agent'}:${name}` : undefined
}

export const wroteOf = (tool: string, args: ToolArgs, room: number) => {
  switch (tool) {
    case 'Edit':
      return `−${linesOf(args, 'old_string')} +${linesOf(args, 'new_string')} lines`
    case 'MultiEdit':
      return Array.isArray(args.edits) ? count(args.edits.length, 'edit', 'edits') : undefined
    case 'Write':
      return count(linesOf(args, 'content'), 'line', 'lines')
    case 'NotebookEdit':
      return count(linesOf(args, 'new_source'), 'line', 'lines')
    case 'Agent':
    case 'Task':
    case 'WebFetch':
      return typeof args.prompt === 'string' ? cut(oneLine(args.prompt), room) || undefined : undefined
  }

  return undefined
}

const readOutcome = (result: ToolArgs) => {
  if (result.type === 'file_unchanged') return 'unchanged, not sent again'
  if (result.type !== 'text') return typeof result.type === 'string' ? result.type : undefined
  const file = fieldsOf(result.file)
  const start = numberOf(file?.startLine)
  const lines = numberOf(file?.numLines)
  const total = numberOf(file?.totalLines)
  if (start === undefined || lines === undefined || total === undefined) return undefined

  return lines >= total ? count(total, 'line', 'lines') : `lines ${start}–${start + lines - 1} of ${total}`
}

const grepOutcome = (result: ToolArgs) => {
  const numFiles = numberOf(result.numFiles)
  if (numFiles === undefined) return undefined
  const files = count(numFiles, 'file', 'files')

  return result.mode === 'content'
    ? `${count(numberOf(result.numLines) ?? 0, 'line', 'lines')} in ${files}`
    : result.mode === 'count'
      ? `${count(numberOf(result.numMatches) ?? 0, 'match', 'matches')} in ${files}`
      : files
}

const globOutcome = (result: ToolArgs) => {
  const numFiles = numberOf(result.numFiles)

  return numFiles === undefined ? undefined : `${count(numFiles, 'file', 'files')}${result.truncated ? '+' : ''}`
}

const shellOutcome = (result: ToolArgs, shellNote: string) => {
  if (result.interrupted) return 'interrupted'
  if (result.backgroundTaskId) return 'in background'
  if (result.isImage) return 'image'
  const persisted = numberOf(result.persistedOutputSize)
  if (persisted) return `${(persisted / 1024).toFixed(1)} KB, saved to file`
  if (typeof result.stdout !== 'string' || typeof result.stderr !== 'string') return undefined

  const output = [...result.stdout.split('\n'), ...result.stderr.split('\n').filter(line => !line.startsWith(shellNote))]
  const lines = output.filter(line => line.trim()).length
  const shown = lines === 0 ? 'no output' : count(lines, 'line', 'lines')

  return typeof result.returnCodeInterpretation === 'string' && result.returnCodeInterpretation
    ? `${shown} (${result.returnCodeInterpretation})`
    : shown
}

export const outcomeOf = (tool: string, ran: ToolCallResult): string | undefined => {
  if (ran.deny !== undefined) return 'denied'
  if (ran.isError) {
    const first = (ran.text ?? '').replace(contextConfig.patterns.toolError, '').split('\n').find(line => line.trim()) ?? ''

    return cut(oneLine(first) || 'error', contextConfig.layout.outcomeRoom)
  }
  const result = fieldsOf(ran.result)
  if (!result) return undefined
  switch (tool) {
    case 'Read':
      return readOutcome(result)
    case 'Grep':
      return grepOutcome(result)
    case 'Glob':
      return globOutcome(result)
    case 'Bash':
    case 'PowerShell':
      return shellOutcome(result, contextConfig.tools.shellNote)
  }

  return undefined
}

const resultOf = (ran: ToolCallResult) => (ran.isError || ran.deny !== undefined ? undefined : fieldsOf(ran.result))

export const imageTokensOf = (tool: string, ran: ToolCallResult) => {
  const result = resultOf(ran)
  if (tool !== 'Read' || result?.type !== 'image') return 0
  const size = fieldsOf(fieldsOf(result.file)?.dimensions)
  const width = numberOf(size?.displayWidth) ?? numberOf(size?.originalWidth) ?? 0
  const height = numberOf(size?.displayHeight) ?? numberOf(size?.originalHeight) ?? 0

  return Math.ceil((width * height) / contextConfig.findings.imagePixelsPerToken)
}

export const isRewrite = (tool: string, ran: ToolCallResult) => tool === 'Write' && resultOf(ran)?.type === 'update'

export const contentOf = (tool: string, ran: ToolCallResult) => {
  const result = resultOf(ran)
  if (tool === 'Read' && result?.type === 'file_unchanged') return undefined
  const base64 = result?.type === 'image' ? fieldsOf(result.file)?.base64 : undefined

  return typeof base64 === 'string' ? base64 : (ran.text ?? '')
}

export const hashOf = (text: string) => {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193)

  return `${(hash >>> 0).toString(36)}-${text.length}`
}

export const actionOf = (name: string): ToolAction => {
  const mcp = /^mcp__(.+?)__(.+)$/.exec(name)
  if (!mcp) return contextConfig.tools.actions[name] ?? { verb: name, kind: 'system' }

  const [, server = '', tool = ''] = mcp

  return { verb: `${server} ${tool.startsWith(`${server}_`) ? tool.slice(server.length + 1) : tool}`, kind: 'mcp' }
}

const partsOf = (name: string): ToolParts =>
  contextConfig.tools.parts[name] ?? { output: name.startsWith('mcp__') ? 'response' : 'output' }

export const ownTools = (steps: Step[]) =>
  steps.map((step, i) => {
    const previous = steps[i - 1]

    return [...(previous && !previous.isFromStart ? previous.tools : []), ...(step.isFromStart ? step.tools : [])]
  })

export const toolView = (tool: StepTool): ToolView => {
  const { verb, kind } = actionOf(tool.name)
  const { input = 'args', output } = partsOf(tool.name)
  const isShell = contextConfig.tools.shells.includes(tool.name)
  const isPath = tool.brief !== '' && !/\s/.test(tool.brief) && /[\\/.]/.test(tool.brief)

  return {
    id: tool.id,
    name: tool.name,
    verb,
    kind,
    subject: tool.subject ?? (isShell ? (tool.about ?? '') : isPath ? fileName(tool.brief) : tool.brief),
    wrote: tool.wrote ?? (isShell && tool.brief ? tool.brief : undefined),
    input,
    output,
    isError: tool.isError,
    outcome: tool.outcome,
    repeatOf: tool.repeatOf,
  }
}
