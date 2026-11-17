import type { ContextMcpTool, EngineInterface, SessionContextBreakdown, ToolDescribeInput, ToolDescribeResult } from 'claude-code'

import { count, isPaneShown } from '../../../core'
import { contextConfig } from '../config'
import { themeOf } from '../theme'
import type { Theme } from '../theme'
import { estimateTokens, sumOf } from '../tokens'
import { compactSummary, turnDetail } from '../history'
import type { Pane } from './index'
import type { Breakdown, Detail, Item, Wanted } from './tree'

export type Source = {
  breakdown: Breakdown | null
  isFullRefused: boolean
  theme: Theme
  countedFrom: number | null
  revision: number
  settled: number
  isCounting: boolean
}

export type Details = { entries: Map<string, Detail>; reachable: Set<string>; loading: Map<string, Wanted>; version: number }

export const freshSource = (): Source => ({
  breakdown: null,
  isFullRefused: false,
  theme: 'dark',
  countedFrom: null,
  revision: 1,
  settled: 0,
  isCounting: false,
})

export const freshDetails = (): Details => ({ entries: new Map(), reachable: new Set(), loading: new Map(), version: 0 })

export async function isPaneCurrent($: EngineInterface, pane: Pane, run: Pane['runtime'], revision: number) {
  return (await isPaneShown($, pane.spec.id)) && pane.runtime === run && run.revision === revision
}

export const isStale = (source: Source) => source.settled < source.revision

export const invalidateSource = (source: Source) => {
  source.revision += 1
}

export const noteSession =(source: Source, startedAt: number) => {
  if (source.countedFrom === startedAt) return
  source.breakdown = null
  if (!isStale(source)) invalidateSource(source)
}

const shortPath = (path: string) => path.replace(/\\/g, '/').split('/').slice(-2).join('/')

const serversOf = (tools: readonly ContextMcpTool[]): Item[] => {
  const servers = new Map<string, ContextMcpTool[]>()
  for (const tool of tools) servers.set(tool.serverName, [...(servers.get(tool.serverName) ?? []), tool])

  return [...servers].map(([server, own]) => {
    const loaded = own.filter(tool => tool.isLoaded)
    const deferred = own.length - loaded.length
    const prefix = `mcp__${server.replace(/[^\w-]/g, '_')}__`
    const items = loaded.map(tool => ({ id: tool.name, label: tool.name.startsWith(prefix) ? tool.name.slice(prefix.length) : tool.name.replace(/^mcp__/, ''), tokens: tool.tokens }))
    const detail = [...(loaded.length > 0 ? [count(loaded.length, 'tool', 'tools')] : []), ...(deferred > 0 ? [`${deferred} ${contextConfig.systemItems.deferred}`] : [])].join(' · ')

    return { id: server, label: server, detail, tokens: sumOf(items.map(item => item.tokens)), uses: own.map(tool => tool.name), ...(items.length > 0 ? { items } : { value: '' }) }
  })
}

const breakdownOf = (breakdown: SessionContextBreakdown): Breakdown => ({
  categories: breakdown.categories,
  servers: new Set(breakdown.mcpTools.map(tool => tool.serverName)),
  mcp: serversOf(breakdown.mcpTools),
  memory: breakdown.memoryFiles.map(file => ({ id: file.path, label: shortPath(file.path), detail: file.type.toLowerCase(), tokens: file.tokens })),
  skills: (breakdown.skills?.skillFrontmatter ?? []).map(skill => ({ id: skill.name, label: skill.name, tokens: skill.tokens, uses: [`skill:${skill.name}`] })),
  skillsListed: breakdown.skills && breakdown.skills.includedSkills < breakdown.skills.totalSkills ? { included: breakdown.skills.includedSkills, total: breakdown.skills.totalSkills } : null,
  agents: breakdown.agents.map(agent => ({ id: agent.agentType, label: agent.agentType, detail: agent.source, tokens: agent.tokens, uses: [`agent:${agent.agentType}`] })),
})

export const noteInstructions = (instructions: Map<string, string>, text: string) => {
  for (const block of text.split(contextConfig.patterns.serverHeading).slice(1)) {
    const [name = '', ...lines] = block.split('\n')
    instructions.set(name.trim(), lines.join('\n').trim())
  }
}

export const instructionItems = (instructions: ReadonlyMap<string, string>, servers: ReadonlySet<string>): Item[] => {
  const blocks: { name: string; text: string }[] = []
  for (const [name, text] of instructions) {
    const owner = blocks.at(-1)
    if (owner && servers.size > 0 && !servers.has(name.replace(/[^\w-]/g, '_'))) owner.text += `\n\n## ${name}\n${text}`
    else blocks.push({ name, text })
  }

  return blocks.map(({ name, text }) => ({ id: name, label: name, tokens: estimateTokens(text), text }))
}

export async function refreshSource($: EngineInterface, pane: Pane) {
  const run = pane.runtime
  const { source } = run
  if (source.isCounting) return
  const revision = source.revision
  const isFull = !source.isFullRefused
  source.isCounting = true
  try {
    const usage = await $.session.usage({ breakdown: isFull ? 'full' : 'summary' })
    if (!(await isPaneShown($, pane.spec.id)) || pane.runtime !== run) return
    const rows = source.revision === revision ? await $.config.list().catch(() => null) : null
    if (!(await isPaneShown($, pane.spec.id)) || pane.runtime !== run) return
    if (source.revision === revision) {
      source.breakdown = usage.context.breakdown ? breakdownOf(usage.context.breakdown) : null
      source.countedFrom = usage.startedAt
      if (pane.tools.size === 0) $.ui.invalidate('tool.describe')
      if (rows) source.theme = themeOf(rows.find(row => row.key === 'theme')?.value)
      source.settled = revision
    }
  } catch {
    if (!isFull) return
    source.isFullRefused = true
  } finally {
    source.isCounting = false
  }
  $.ui.invalidate('ui.render')
}

export const releaseDetails = (details: Details) => {
  details.version += 1
  details.entries.clear()
  details.reachable.clear()
  details.loading.clear()
}

export const evictDetails = (details: Details, keys: readonly string[]) => {
  details.version += 1
  for (const key of keys) {
    details.entries.delete(key)
    details.reachable.delete(key)
    details.loading.delete(key)
  }
}

export const retainDetails = (details: Details, wanted: readonly Wanted[]) => {
  details.reachable = new Set(wanted.map(want => want.key))
  const size = details.entries.size
  for (const key of details.entries.keys()) if (!details.reachable.has(key)) details.entries.delete(key)
  if (details.entries.size !== size) details.version += 1
  for (const key of details.loading.keys()) if (!details.reachable.has(key)) details.loading.delete(key)
}

export const touchDetail = (details: Details, key: string) => {
  const value = details.entries.get(key)
  if (value === undefined) return
  details.entries.delete(key)
  details.entries.set(key, value)
}

const storeDetail = (pane: Pane, key: string, value: Detail) => {
  const { details, open } = pane.runtime
  details.version += 1
  details.entries.set(key, value)
  for (const oldest of details.entries.keys()) {
    if (details.entries.size <= contextConfig.memory.detailEntries) break
    details.entries.delete(oldest)
    details.reachable.delete(oldest)
    if (open.delete(oldest)) pane.runtime.revision += 1
  }
}

function readDetail($: EngineInterface, pane: Pane, want: Wanted): Promise<Detail | null> {
  return 'turnId' in want ? turnDetail($, pane.history, want.turnId) : compactSummary($, pane.history, want.compactAt)
}

async function loadDetail($: EngineInterface, pane: Pane, want: Wanted) {
  const run = pane.runtime
  run.details.loading.set(want.key, want)
  const value = (await readDetail($, pane, want).catch(() => null)) ?? 'breakdown not recorded'
  const shown = await isPaneShown($, pane.spec.id)
  if (run !== pane.runtime || run.details.loading.get(want.key) !== want) return
  run.details.loading.delete(want.key)
  if (!shown || !run.details.reachable.has(want.key)) return
  storeDetail(pane, want.key, value)
  $.ui.invalidate('ui.render')
}

export function loadDetails($: EngineInterface, pane: Pane, wanted: readonly Wanted[]) {
  const { details } = pane.runtime
  for (const want of wanted) if (!details.entries.has(want.key) && !details.loading.has(want.key)) void loadDetail($, pane, want)
}

export const noteTool = (pane: Pane, e: ToolDescribeInput, described: ToolDescribeResult) => {
  pane.notes += 1
  pane.tools.delete(e.tool)
  pane.deferred.delete(e.tool)
  if (e.tool.startsWith('mcp__')) return
  if ((described.isDeferred ?? e.isDeferred) === true) pane.deferred.add(e.tool)
  else pane.tools.add(e.tool)
}

export const forgetSources = (pane: Pane) => {
  pane.notes += 1
  pane.tools.clear()
  pane.deferred.clear()
  pane.instructions.clear()
}
