import type { ModelUsage, PromptOrigin } from 'claude-code'

import type { FindingCall, Findings, Step, StepTool, TurnHead } from '../../../../types'
import { cut, oneLine } from '../../../core'
import { contextConfig } from '../config'
import type { ToolAction } from '../config'
import { sumOf } from '../tokens'
import { actionOf, ownTools, toolView } from './tools'
import type { ToolView } from './tools'

export type MeasuredTurn = TurnHead & {
  before: number
  total: number
  heaviestTool?: { verb: string; tokens: number }
}

type HeadTotals = Pick<TurnHead, 'end' | 'pending' | 'listed' | 'missed' | 'byTool' | 'used' | 'findings'>

export type Allocation = { thinking: number; args: number[]; results: number[] }

export type Round = {
  index: number
  tools: ToolView[]
  added: number
  missed: number
  isLast: boolean
  allocation?: Allocation
}

export type TurnDetail = {
  incoming: number
  thinking: number
  answer: number
  toolTokens: number
  repeated: number
  soleTool?: ToolAction
  rounds: Round[]
}

export const contextOf = (usage: ModelUsage) => usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens

const missedTokens = (step: Pick<Step, 'cached' | 'written'>, minimum: number) => {
  const written = step.written ?? 0

  return written >= minimum && (step.cached ?? 0) < written ? written : 0
}

export const sourceOf = (origin: PromptOrigin | undefined, text: string): string | undefined => {
  if (!origin) return text ? undefined : 'continuation'
  switch (origin.kind) {
    case 'composer':
    case 'bridge':
    case 'sdk':
      return text ? undefined : 'continuation'
    case 'task-notification':
      return 'background task'
    case 'scheduled-trigger':
      return 'scheduled'
    case 'peer':
    case 'peer-send-message':
      return 'another session'
    case 'channel':
      return origin.server
    case 'unclassified':
      return 'system message'
    default:
      return origin.kind.replace(/-/g, ' ')
  }
}

export const ensureStep = (steps: Step[], turnId: string, index: number, at: number): Step[] =>
  steps.some(step => step.index === index) ? steps : [...steps, { turnId, index, at, context: 0, output: 0, tools: [], isFromStart: true }]

export const answerStep = (steps: Step[], index: number, answer: Pick<Step, 'at' | 'context' | 'output' | 'answerTokens' | 'cached' | 'written'>) =>
  steps.map(step => (step.index === index ? { ...step, ...answer } : step))

export const addTool = (steps: Step[], tool: StepTool): Step[] => {
  const latest = steps.at(-1)

  return latest ? [...steps.slice(0, -1), { ...latest, tools: [...latest.tools, tool] }] : steps
}

export const finishTool = (steps: Step[], id: string, result: Pick<StepTool, 'resultTokens' | 'isError' | 'outcome' | 'repeatOf' | 'image' | 'rewrite'>) =>
  steps.map(step =>
    step.tools.some(tool => tool.id === id) ? { ...step, tools: step.tools.map(tool => (tool.id === id ? { ...tool, ...result } : tool)) } : step,
  )

const thinkingOf = (answered: Step[]) => {
  const owned = ownTools(answered)

  return sumOf(answered.map((step, i) => {
    const calls = sumOf((owned[i] ?? []).map(tool => tool.callTokens ?? 0))
    if ((owned[i] ?? []).length > 0) return step.output - Math.min(calls, step.output)
    if (i < answered.length - 1 || step.answerTokens === undefined) return 0

    return step.output - Math.min(step.answerTokens, step.output)
  }))
}

const findingsOf = (answered: Step[], tools: StepTool[]): Findings => {
  const { findings } = contextConfig
  const done = tools.filter(tool => tool.resultTokens !== null)
  const callOf = (tool: StepTool, tokens: number): FindingCall => ({
    name: tool.name,
    label: contextConfig.tools.shells.includes(tool.name) ? cut(oneLine(tool.brief), contextConfig.layout.outcomeRoom) : toolView(tool).subject || tool.brief,
    tokens,
  })
  const pick = (test: (tool: StepTool) => boolean, tokensOf: (tool: StepTool) => number) =>
    done.filter(test).map(tool => callOf(tool, tokensOf(tool))).sort((a, b) => b.tokens - a.tokens).slice(0, findings.callsPerTurn)
  const resultOf = (tool: StepTool) => tool.resultTokens ?? 0
  const isRepeat = (tool: StepTool) => tool.repeatOf !== undefined

  return {
    thinking: thinkingOf(answered),
    repeats: pick(isRepeat, resultOf),
    rewrites: pick(tool => tool.rewrite === true, tool => tool.callTokens ?? 0),
    images: pick(tool => !isRepeat(tool) && (tool.image ?? 0) > 0, resultOf),
    large: pick(tool => !isRepeat(tool) && !tool.image && resultOf(tool) >= findings.largeTokens, resultOf),
  }
}

export const headTotals =(steps: Step[], promptTokens: number, missMinimum: number, uses: ReadonlySet<string>): HeadTotals => {
  const answered = steps.filter(step => step.context > 0)
  const latest = answered.at(-1)
  const tools = steps.flatMap(step => step.tools)
  const unread = steps.filter(step => !latest || step.index >= latest.index).flatMap(step => step.tools)
  const byTool: Record<string, number> = {}
  for (const tool of tools) {
    if (tool.resultTokens !== null) byTool[tool.name] = (byTool[tool.name] ?? 0) + (tool.callTokens ?? 0) + tool.resultTokens
  }

  return {
    end: latest ? latest.context + latest.output : 0,
    pending: sumOf(unread.map(tool => tool.resultTokens ?? 0)),
    listed: promptTokens + sumOf(answered.map(step => step.output)) + sumOf(tools.map(tool => tool.resultTokens ?? 0)),
    missed: sumOf(answered.map(step => missedTokens(step, missMinimum))),
    byTool,
    findings: findingsOf(answered, tools),
    used: [...new Set([...uses, ...tools.flatMap(tool => (tool.uses ? [tool.uses] : []))])],
  }
}

export const rewoundBy = (heads: TurnHead[], since: number, messageCount: number) =>
  heads.filter(head => head.at >= since && head.rewoundAt === undefined && head.messages !== undefined && messageCount < head.messages + 2)

const heaviestOf = (head: TurnHead) => {
  const [name, tokens = 0] = Object.entries(head.byTool ?? {}).sort((a, b) => b[1] - a[1])[0] ?? []

  return name === undefined ? undefined : { verb: actionOf(name).verb, tokens }
}

export const measure = (group: TurnHead[], summaryTokens: number): MeasuredTurn[] =>
  group.map((head, k) => {
    const previous = group.slice(0, k).findLast(one => one.rewoundAt === undefined || one.rewoundAt > head.at)
    const before = previous ? previous.end : head.outside + summaryTokens
    const heaviestTool = heaviestOf(head)

    return { ...head, before, total: head.end + head.pending - before, ...(heaviestTool ? { heaviestTool } : {}) }
  })

export const split = (total: number, weights: number[]) => {
  const whole = sumOf(weights)
  let passed = 0
  let given = 0

  return weights.map(weight => {
    passed += whole > 0 ? weight : 1
    const upTo = Math.round((total * passed) / (whole > 0 ? whole : weights.length))
    const share = upTo - given
    given = upTo

    return share
  })
}

const allocate = (tools: StepTool[], output: number, added: number): Allocation => {
  const calls = tools.map(tool => tool.callTokens ?? 0)
  const written = Math.min(sumOf(calls), output)

  return {
    thinking: output - written,
    args: split(written, calls),
    results: split(added - output, tools.map(tool => tool.resultTokens ?? 0)),
  }
}

export const detailOf = (turn: MeasuredTurn, steps: Step[]): TurnDetail => {
  const done = steps.filter(step => step.context > 0)
  const owned = ownTools(done)
  const byTool = new Map<string, number>()
  let thinking = 0
  let answer = 0
  let unnamed = 0
  let repeated = 0

  const rounds = done.map((step, i): Round => {
    const next = done[i + 1]
    const tools = owned[i] ?? []
    const added = (next ? next.context : turn.end + turn.pending) - step.context
    const allocation = tools.length > 0 ? allocate(tools, step.output, added) : undefined

    if (!allocation) {
      if (next) unnamed += added
      else if (step.answerTokens === undefined) answer += added
      else {
        const text = Math.min(step.answerTokens, step.output)
        thinking += added - text
        answer += text
      }
    } else {
      thinking += allocation.thinking
      tools.forEach((tool, k) => {
        const tokens = (allocation.args[k] ?? 0) + (allocation.results[k] ?? 0)
        byTool.set(tool.name, (byTool.get(tool.name) ?? 0) + tokens)
        if (tool.repeatOf !== undefined) repeated += tokens
      })
    }

    return {
      index: step.index,
      tools: tools.map(tool => toolView(tool)),
      added,
      missed: missedTokens(step, contextConfig.missMinimumTokens),
      isLast: !next,
      ...(allocation ? { allocation } : {}),
    }
  })
  const [sole] = byTool.size === 1 && unnamed === 0 ? [...byTool.keys()] : []

  return {
    incoming: done[0] ? done[0].context - turn.before : 0,
    thinking: Math.max(0, thinking),
    answer,
    toolTokens: sumOf([...byTool.values()]) + unnamed,
    repeated,
    ...(sole === undefined ? {} : { soleTool: actionOf(sole) }),
    rounds,
  }
}
