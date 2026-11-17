import { atom, read, update } from 'claude-code'
import type { EngineInterface, ModelUsage, Next, PromptOrigin, PromptSubmitCommand, PromptSubmitInput, SessionCompactInput, SessionEndInput, ToolCallInput, TurnCompleteInput, TurnStartInput, TurnStepInput } from 'claude-code'

import type { Compact, Step, StepTool, TurnHead } from '../../../../types'
import { createWriter, cut, oneLine } from '../../../core'
import type { Live, Writer } from '../../../core'
import { contextConfig } from '../config'
import { estimateTokens, isMessagesCategory } from '../tokens'
import { addTool, answerStep, contextOf, detailOf, ensureStep, finishTool, headTotals, measure, rewoundBy, sourceOf } from './model'
import type { MeasuredTurn, TurnDetail } from './model'
import { compactKey, isHistoryKey, parseSteps, parseSummary, readStored, storedAt, turnKey } from './storage'
import type { Stored } from './storage'
import { argsOf, briefOf, contentOf, hashOf, imageTokensOf, isRewrite, outcomeOf, subjectOf, useOf, wroteOf } from './tools'

const turns = atom({ plugin: 'aiva-hud', key: 'turns' } as const, [])
const compacts = atom({ plugin: 'aiva-hud', key: 'compacts' } as const, [])

export type { Allocation, MeasuredTurn, Round, TurnDetail } from './model'
export type { ToolView } from './tools'
export { actionOf } from './tools'

const inSession = <T extends { at: number }>(records: readonly T[], startedAt: number) => records.filter(record => record.at >= startedAt)

type HistoryChange = 'turn' | 'compact' | 'clear'

export type LiveTurn = { id: string; prompt: string | null; source?: string; isAwaited: boolean }

type CompactGroup = { mark: Compact; turns: MeasuredTurn[] }

export type HistorySnapshot = { compacts: CompactGroup[]; turns: MeasuredTurn[]; live: LiveTurn | null; used: ReadonlySet<string> | null }

type Opening = { prompt: string | null; promptTokens: number; source?: string; messages?: number }

type Seen = { at: number; turnId: string; hash: string }

type Runtime = {
  live: { id: string; steps: Step[]; uses: Set<string> } | null
  opening: Opening
  submitted: { origin: PromptOrigin; command?: PromptSubmitCommand } | null
  repeats: Map<string, Seen>
  repeatRevision: number
  sizes: Map<string, number>
}

export type History = {
  readonly write: Writer<object>
  readonly listeners: ((change: HistoryChange) => void)[]
  readonly live: Readonly<Live>
  runtime: Runtime
  changes: number
}

const freshRuntime = (): Runtime => ({ live: null, opening: { prompt: null, promptTokens: 0 }, submitted: null, repeats: new Map(), repeatRevision: 0, sizes: new Map() })

export const createHistory = (live: Readonly<Live>): History => ({ write: createWriter<object>(), listeners: [], live, runtime: freshRuntime(), changes: 0 })

export const onHistoryChange = (history: History, listener: (change: HistoryChange) => void) => {
  history.listeners.push(listener)
}

export const scopeGuard = (history: History) => {
  const run = history.runtime

  return () => run === history.runtime
}

export const noteSubmit = (history: History, e: PromptSubmitInput) => {
  if (e.turnId === undefined) history.runtime.submitted = { origin: e.origin, ...(e.command ? { command: e.command } : {}) }
}

const touch = (history: History) => {
  history.changes += 1
}

const notify = (history: History, change: HistoryChange) => {
  touch(history)
  history.listeners.forEach(listener => listener(change))
}

export async function historyVersion($: EngineInterface, history: History) {
  const changes = history.changes
  const [heads, marks] = await Promise.all([$.state.get({ plugin: 'aiva-hud', key: 'turns' }), $.state.get({ plugin: 'aiva-hud', key: 'compacts' })])

  return `${changes} ${heads.version} ${marks.version}`
}

export const releaseHistory = (history: History) => {
  history.runtime = freshRuntime()
  notify(history, 'clear')
}

const estimate = (text: string) => estimateTokens(text)

const remember = (repeats: Runtime['repeats'], key: string, seen: Seen, limit: number) => {
  repeats.delete(key)
  repeats.set(key, seen)
  for (const oldest of repeats.keys()) {
    if (repeats.size <= limit) break
    repeats.delete(oldest)
  }
}

function forget($: EngineInterface, history: History, keys: Iterable<string>) {
  return Promise.all([...new Set(keys)].map(key => history.write(key, {}, () => $.store.delete(key))))
}

async function keep($: EngineInterface, history: History, run: Runtime, key: string, value: Stored) {
  run.sizes.delete(key)
  run.sizes.set(key, JSON.stringify(value).length)
  let total = [...run.sizes.values()].reduce((sum, size) => sum + size, 0)
  const evicted: string[] = []
  for (const [oldest, size] of run.sizes) {
    if (total <= contextConfig.storage.budget || oldest === key) break
    run.sizes.delete(oldest)
    total -= size
    evicted.push(oldest)
  }
  await Promise.all([
    history.write(key, value, async (stored, snapshot) => (run === history.runtime ? $.store.set(stored, snapshot) : undefined)),
    forget($, history, evicted),
  ])
}

async function readSteps($: EngineInterface, turnId: string) {
  return parseSteps(await readStored($, turnKey(turnId)))
}

async function save($: EngineInterface, history: History, run: Runtime) {
  const live = run.live
  if (!live || run !== history.runtime) return
  const at = live.steps.reduce((latest, step) => Math.max(latest, step.at), 0)
  await keep($, history, run, turnKey(live.id), { at, steps: live.steps })
}

function writeTotals($: EngineInterface, history: History, run: Runtime, turnId: string) {
  return update($, turns, list => {
    const live = run.live
    if (run !== history.runtime || live?.id !== turnId) return list

    return list.map(head => (head.id === turnId ? { ...head, ...headTotals(live.steps, head.promptTokens, contextConfig.missMinimumTokens, live.uses) } : head))
  })
}

async function liveFor($: EngineInterface, history: History, run: Runtime, turnId: string, index: number) {
  const at = await $.clock.now()
  if (run !== history.runtime) return null
  if (run.live?.id !== turnId) {
    const steps = index === 0 ? [] : ((await readSteps($, turnId)) ?? [])
    if (run !== history.runtime) return null
    run.live = { id: turnId, steps, uses: new Set() }
  }
  const live = run.live
  live.steps = ensureStep(live.steps, turnId, index, at)
  touch(history)

  return live
}

async function prune($: EngineInterface, history: History, before: number, isCurrent = () => true, extra: Iterable<string> = []) {
  const isKept = (record: { at: number }) => record.at >= before
  const heads = await read($, turns)
  const marks = await read($, compacts)
  if (!heads.every(isKept)) await update($, turns, list => isCurrent() ? list.filter(isKept) : list)
  if (!marks.every(isKept)) await update($, compacts, list => isCurrent() ? list.filter(isKept) : list)
  if (!isCurrent()) return
  await forget($, history, [
    ...heads.filter(head => !isKept(head)).map(head => turnKey(head.id)),
    ...marks.filter(mark => !isKept(mark)).map(mark => compactKey(mark.at)),
    ...extra,
  ])
}

async function sweep($: EngineInterface, history: History) {
  const run = history.runtime
  const [keys, heads, marks, now] = await Promise.all([$.store.keys().catch(() => []), read($, turns), read($, compacts), $.clock.now()])
  const kept = new Set([...heads.map(head => turnKey(head.id)), ...marks.map(mark => compactKey(mark.at)), ...run.sizes.keys()])
  const candidates = keys.filter(key => isHistoryKey(key) && !kept.has(key))
  const values = await Promise.all(candidates.map(key => readStored($, key)))
  const stale = candidates.filter((_, i) => (storedAt(values[i]) ?? 0) < now - contextConfig.storage.staleMs)
  if (run === history.runtime) await forget($, history, stale)
}

async function markRewound($: EngineInterface, history: History, run: Runtime, messageCount: number) {
  const lastMark = (await read($, compacts)).at(-1)
  const since = Math.max((await $.session.usage()).startedAt, lastMark?.at ?? 0)
  const dropped = rewoundBy(await read($, turns), since, messageCount)
  const first = dropped[0]
  if (!first || run !== history.runtime) return

  const at = await $.clock.now()
  const ids = new Set(dropped.map(head => head.id))
  for (const [key, repeat] of run.repeats) if (ids.has(repeat.turnId)) run.repeats.delete(key)
  await update($, turns, list => run === history.runtime ? list.map(head => (ids.has(head.id) ? { ...head, rewoundAt: at } : head)) : list)
}

export async function beginHistoryStep($: EngineInterface, history: History, { turnId, index, messageCount }: TurnStepInput) {
  const run = history.runtime
  await liveFor($, history, run, turnId, index)
  if (index > 0 || run !== history.runtime) return

  run.opening.messages = messageCount
  await markRewound($, history, run, messageCount)
}

export async function recordHistoryStep($: EngineInterface, history: History, { turnId, index }: TurnStepInput, usage: ModelUsage, answer: string) {
  const run = history.runtime
  const { live, opening } = run
  if (live?.id !== turnId) return
  const at = await $.clock.now()
  if (run !== history.runtime || run.live !== live) return

  const context = contextOf(usage)
  live.steps = answerStep(ensureStep(live.steps, turnId, index, at), index, {
    at,
    context,
    output: usage.output_tokens,
    answerTokens: estimate(answer),
    cached: usage.cache_read_input_tokens,
    written: usage.cache_creation_input_tokens,
  })
  touch(history)
  await save($, history, run)
  if (index > 0) {
    await writeTotals($, history, run, turnId)
    return
  }

  const categories = (await $.session.usage({ breakdown: 'summary' })).context.breakdown?.categories
  if (run !== history.runtime) return

  const outside = Math.min(
    context - opening.promptTokens,
    categories
      ? categories.filter(category => category.kind === 'used' && !isMessagesCategory(category)).reduce((sum, category) => sum + category.tokens, 0)
      : Infinity,
  )
  await update($, turns, list => {
    if (run !== history.runtime) return list
    const head: TurnHead = {
      id: turnId,
      at,
      prompt: opening.prompt,
      ...(opening.source ? { source: opening.source } : {}),
      promptTokens: opening.promptTokens,
      context,
      outside,
      ...headTotals(live.steps, opening.promptTokens, contextConfig.missMinimumTokens, live.uses),
      ...(opening.messages !== undefined ? { messages: opening.messages } : {}),
    }

    return [...list, head]
  })
}

async function measured($: EngineInterface) {
  const startedAt = (await $.session.usage()).startedAt
  const heads = inSession(await read($, turns), startedAt).filter(head => head.end !== undefined)
  const marks = inSession(await read($, compacts), startedAt)
  const groups = marks.map((mark, i) => {
    const from = marks[i - 1]

    return { mark, turns: measure(heads.filter(head => head.at < mark.at && head.at >= (from?.at ?? 0)), from?.summaryTokens ?? 0) }
  })
  const lastMark = marks.at(-1)
  const current = measure(heads.filter(head => head.at >= (lastMark?.at ?? 0)), lastMark?.summaryTokens ?? 0)

  return { groups, current, heads }
}

export async function pruneHistory($: EngineInterface, history: History) {
  await prune($, history, (await $.session.usage()).startedAt)
  await sweep($, history)
}

export async function historySnapshot($: EngineInterface, history: History): Promise<HistorySnapshot> {
  const run = history.runtime
  const { groups, current, heads } = await measured($)
  if (run !== history.runtime) return { compacts: [], turns: [], live: null, used: null }
  const { live, opening } = run
  const isTracked = heads.length > 0 && heads.every(head => head.used !== undefined)

  return {
    compacts: groups,
    turns: current,
    used: isTracked ? new Set([...heads.flatMap(head => head.used ?? []), ...(live?.uses ?? [])]) : null,
    live:
      history.live.isWorking && live
        ? {
            id: live.id,
            prompt: opening.prompt,
            ...(opening.source ? { source: opening.source } : {}),
            isAwaited: !heads.some(head => head.id === live.id),
          }
        : null,
  }
}

export async function turnDetail($: EngineInterface, history: History, turnId: string): Promise<TurnDetail | null> {
  const run = history.runtime
  const { groups, current } = await measured($)
  const turn = [...groups.flatMap(group => group.turns), ...current].find(one => one.id === turnId)
  if (!turn) return null
  const steps = run.live?.id === turnId ? run.live.steps : await readSteps($, turnId)

  return steps && run === history.runtime ? detailOf(turn, steps) : null
}

export async function compactSummary($: EngineInterface, history: History, compactAt: number) {
  const run = history.runtime
  const text = parseSummary(await readStored($, compactKey(compactAt)))

  return run === history.runtime ? text : null
}

export async function endHistorySession($: EngineInterface, history: History, e: SessionEndInput) {
  const ended = history.runtime
  const run = freshRuntime()
  history.runtime = run
  notify(history, 'clear')
  if (e.reason !== 'resume') await prune($, history, (await $.clock.now()) + 1, () => run === history.runtime, ended.sizes.keys())
}

export async function startHistoryTurn($: EngineInterface, history: History, e: TurnStartInput) {
  if (e.agentId) return

  const run = history.runtime
  const typed = e.text.trim()
  const source = sourceOf(run.submitted?.origin, typed)
  const command = run.submitted?.command
  const title = source === 'background task' ? null : command ? `/${command.name}${command.args ? ` ${command.args}` : ''}` : typed || null
  run.submitted = null
  run.live = { id: e.turnId, steps: [], uses: new Set(command ? [`skill:${command.name}`] : []) }
  run.opening = {
    prompt: title && cut(oneLine(title), contextConfig.layout.promptRoom),
    promptTokens: estimate(typed),
    ...(source ? { source } : {}),
  }
  touch(history)
}

export async function trackHistoryTool($: EngineInterface, history: History, e: ToolCallInput, next: Next<'tool.call'>) {
  const run = history.runtime
  if (e.agentId) {
    const use = useOf(e.tool, argsOf(e, contextConfig.tools.callKeys))
    if (use && run.live) {
      run.live.uses.add(use)
      touch(history)
    }

    return next(e)
  }

  const repeatRevision = run.repeatRevision
  const turnId = run.live?.id
  const at = await $.clock.now()
  const args = argsOf(e, contextConfig.tools.callKeys)
  const brief = briefOf(args, await $.session.cwd(), contextConfig.tools.briefKeys)
  const tool: StepTool = {
    id: e.tool_use_id,
    name: e.tool,
    brief,
    subject: subjectOf(e.tool, args, brief),
    wrote: wroteOf(e.tool, args, contextConfig.layout.outcomeRoom),
    uses: useOf(e.tool, args),
    callTokens: estimate(JSON.stringify(args)),
    resultTokens: null,
    isError: false,
  }
  if (run === history.runtime && run.live && run.live.id === turnId) {
    run.live.steps = addTool(run.live.steps, tool)
    touch(history)
  }

  const ran = await next(e)
  if (run !== history.runtime) return ran
  const live = run.live
  if (turnId === undefined || live?.id !== turnId) return ran

  const isError = ran.isError === true || ran.deny !== undefined
  let repeatOf: number | undefined
  const content = contentOf(e.tool, ran)
  if (repeatRevision === run.repeatRevision && ran.isReadOnly && !isError && content !== undefined) {
    const key = `${e.tool} ${JSON.stringify(args)}`
    const hash = hashOf(content)
    const seen = run.repeats.get(key)
    repeatOf = seen?.hash === hash ? seen.at : undefined
    remember(run.repeats, key, { at, turnId, hash }, contextConfig.memory.repeatEntries)
  }
  const image = imageTokensOf(e.tool, ran)
  live.steps = finishTool(live.steps, tool.id, {
    resultTokens: estimate(ran.text ?? '') + image,
    isError,
    outcome: outcomeOf(e.tool, ran),
    repeatOf,
    ...(image > 0 ? { image } : {}),
    ...(isRewrite(e.tool, ran) ? { rewrite: true as const } : {}),
  })
  touch(history)

  return ran
}

export async function completeHistoryTurn($: EngineInterface, history: History, e: TurnCompleteInput) {
  if (e.agentId) return

  const run = history.runtime
  const live = run.live
  if (live && live.id !== e.turnId) return
  await save($, history, run)
  if (live) await writeTotals($, history, run, live.id)
  if (run === history.runtime && run.live === live) {
    run.live = null
    notify(history, 'turn')
  }
}

export async function compactHistory($: EngineInterface, history: History, e: SessionCompactInput, next: Next<'session.compact'>) {
  const run = history.runtime
  const compacted = await next(e)
  if (run !== history.runtime || e.agentId || e.trigger === 'precompute' || !compacted.messages) return compacted

  run.repeats.clear()
  run.repeatRevision++
  const at = await $.clock.now()
  const summary = compacted.messages[0]?.text ?? ''
  if (run !== history.runtime) return compacted
  await keep($, history, run, compactKey(at), { at, text: summary })
  const mark: Compact = {
    at,
    tokensBefore: compacted.tokensBefore ?? null,
    tokensAfter: compacted.tokensAfter ?? null,
    summaryTokens: estimate(summary),
  }
  await update($, compacts, list => run === history.runtime ? [...list, mark] : list)
  if (run === history.runtime) notify(history, 'compact')

  return compacted
}
