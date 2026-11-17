import type { Color, ContextCategory, UiFocusInput } from 'claude-code'

import type { Compact, Findings } from '../../../../types'
import { timeOfDay } from '../../../core'
import { contextConfig } from '../config'
import { accentColor, earlierColor, softColor, turnScale } from '../theme'
import type { Theme } from '../theme'
import { formatTokens, isMessagesCategory, signedTokens, sumOf } from '../tokens'
import { actionOf } from '../history'
import type { HistorySnapshot, LiveTurn, MeasuredTurn, ToolView, TurnDetail } from '../history'
import type { ToolKind } from '../config'

export type Section = 'system' | 'messages' | 'findings'

export type Item = { id: string; label: string; detail?: string; tokens: number; value?: string; text?: string; uses?: string[]; items?: Item[] }

export type Breakdown = { categories: readonly ContextCategory[]; servers: ReadonlySet<string>; mcp: Item[]; memory: Item[]; skills: Item[]; skillsListed: { included: number; total: number } | null; agents: Item[] }

export type Detail = TurnDetail | string

export type Wanted = { key: string; turnId: string } | { key: string; compactAt: number }

export type Piece = { text: string; color?: Color; isDim?: boolean; isBold?: boolean; isItalic?: boolean }

export type Reveal = { section: Section; key: string; opens: boolean }

export type Part = { key: string; scope: string; row?: string; label: string; tokens: number; color: Color; reveal: Reveal }

export type PaneActions = { toggle: (key: string) => void; reveal: (target: Reveal) => void }

export type ItemNode = { key: string; item: Item; isOpen: boolean | null; children: ItemNode[] }

export type FindingKind = keyof Findings

const callKinds = ['repeats', 'rewrites', 'large', 'images'] as const satisfies readonly FindingKind[]

export type FindingGroup = { key: string; verb: string; kind: ToolKind; label: string; count: number; tokens: number; reveal: Reveal }

export type FindingNode = { key: string; kind: FindingKind; tokens: number; groups: FindingGroup[]; more: number; isOpen: boolean | null; reveal?: Reveal }

export type CategoryNode = { kind: 'category'; key: string | null; category: ContextCategory; detail?: string; items: ItemNode[]; color: Color; isOpen: boolean }

type CallPart = { name: string; detail?: string; tokens: number }

export type CallNode = { kind: 'call'; key: string; tool: ToolView; tokens: number; missed: number; thinking: number; parts: CallPart[]; isOpen: boolean | null }

export type StepNode = { kind: 'step'; key: string; tools: ToolView[]; added: number; missed: number; thinking: number; isOpen: boolean; calls: CallNode[] }

export type RoundNode = { kind: 'untracked'; added: number; missed: number } | CallNode | StepNode

type TurnBody = { kind: 'note'; text: string } | { kind: 'rounds'; detail: TurnDetail; rounds: RoundNode[] }

export type TurnNode = { kind: 'turn'; key: string; turn: MeasuredTurn; isLive: boolean; isMuted: boolean; isOpen: boolean; body: TurnBody | null }

export type SummaryNode = { kind: 'summary'; key: string; mark: Compact; isOpen: boolean; text: string | null }

type CompactNode = { kind: 'compact'; key: string; mark: Compact; n: number; turnCount: number; isOpen: boolean; children: TreeNode[] }

type RewindNode = { kind: 'rewind'; key: string; at: number; turnCount: number; freed: number; isOpen: boolean; turns: TurnNode[] }

export type TreeNode = TurnNode | SummaryNode | CompactNode | RewindNode

export type MessagesBody = { isEmpty: boolean; nodes: TreeNode[]; awaited: LiveTurn | null }

export type NavNode = { parent: string | null; isOpen: boolean | null; firstChild: string | null }

export type Navigation = { order: readonly string[]; nodes: ReadonlyMap<string, NavNode> }

type Tree = {
  system: { tokens: number | undefined; parts: Part[]; cells: number[]; categories: CategoryNode[]; isOpen: boolean }
  messages: { tokens: number | undefined; parts: Part[]; cells: number[]; body: MessagesBody | null }
  findings: { nodes: FindingNode[]; isOpen: boolean }
  navigation: Navigation
  wanted: Wanted[]
}

type TreeInput = {
  theme: Theme
  width: number
  breakdown: Breakdown | null
  tools: readonly string[]
  deferredTools: readonly string[]
  instructions: Item[]
  snapshot: HistorySnapshot
  section: Section | null
  open: ReadonlySet<string>
  detail: (key: string) => Detail | undefined
}

type Branch = { key: string; isOpen: boolean | null; children: Branch[] }

export const emptyNavigation = (): Navigation => ({ order: [], nodes: new Map() })

export const titleOf = (turn: { prompt: string | null; source?: string }): Piece[] =>
  turn.source
    ? [{ text: `↳ ${turn.source}`, isDim: true }, ...(turn.prompt ? [{ text: `  ${turn.prompt}` }] : [])]
    : [turn.prompt ? { text: turn.prompt } : { text: '↳ no prompt', isDim: true }]

const cellsOf = (sizes: number[], room: number, growth: number, least = 0) => {
  const total = sumOf(sizes)
  let unit = Math.max(1, least, total / room)
  const fit = () => sizes.map(size => Math.max(1, Math.ceil(size / unit)))
  let cells = fit()
  while (sumOf(cells) > room && cells.some(n => n > 1)) {
    unit *= growth
    cells = fit()
  }

  return cells
}

const isBarKey = (key: string) => key.startsWith('bar-')

export const skipBars = (order: readonly string[], previous: string | null, e: UiFocusInput): UiFocusInput => {
  if (e.origin.kind !== 'person' || e.element === undefined || !isBarKey(e.element)) return e
  const to = order.indexOf(e.element)
  if (to < 0) return e
  const n = order.length
  const from = previous === null ? -1 : order.indexOf(previous)
  const step = from < 0 || (to - from + n) % n <= (from - to + n) % n ? 1 : -1
  for (let at = (to + step + n) % n; at !== to; at = (at + step + n) % n) {
    const key = order[at]
    if (key !== undefined && !isBarKey(key)) return { ...e, element: key }
  }

  return e
}

export const descendantsOf = (navigation: Navigation, key: string) =>
  [...navigation.nodes.keys()].filter(one => {
    for (let parent = navigation.nodes.get(one)?.parent; parent; parent = navigation.nodes.get(parent)?.parent) if (parent === key) return true

    return false
  })

const branchesOfRound = (round: RoundNode): Branch[] => {
  if (round.kind === 'untracked' || (round.kind === 'call' && round.isOpen === null)) return []
  if (round.kind === 'call') return [{ key: round.key, isOpen: round.isOpen === true, children: [] }]

  return [{ key: round.key, isOpen: round.isOpen, children: round.calls.flatMap(branchesOfRound) }]
}

const branchOf = (node: TreeNode): Branch => {
  switch (node.kind) {
    case 'turn':
      return { key: node.key, isOpen: node.isOpen, children: node.body?.kind === 'rounds' ? node.body.rounds.flatMap(branchesOfRound) : [] }
    case 'summary':
      return { key: node.key, isOpen: node.isOpen, children: [] }
    case 'compact':
      return { key: node.key, isOpen: node.isOpen, children: node.children.map(branchOf) }
    case 'rewind':
      return { key: node.key, isOpen: node.isOpen, children: node.turns.map(branchOf) }
  }
}

const navigationOf = (sections: { key: Section; isOpen: boolean; parts: Part[]; children: Branch[] }[]): Navigation => {
  const order: string[] = []
  const nodes = new Map<string, NavNode>()
  const visit = (branch: Branch, parent: string | null, between: string[] = []) => {
    order.push(branch.key, ...between)
    nodes.set(branch.key, { parent, isOpen: branch.isOpen, firstChild: branch.children[0]?.key ?? null })
    branch.children.forEach(child => visit(child, branch.key))
  }
  for (const section of sections) {
    visit({ key: section.key, isOpen: section.isOpen, children: section.children }, null, section.parts.map(part => part.key))
  }

  return { order, nodes }
}

export const backKey = ({ order, nodes }: Navigation, focused: string | null): string | null => {
  if (focused === null) return null
  const node = nodes.get(focused)
  if (node) return node.isOpen ? focused : node.parent
  const owner = order.slice(0, Math.max(0, order.indexOf(focused))).reverse().find(key => nodes.has(key))

  return owner && nodes.get(owner)?.isOpen ? owner : null
}

export const buildTree = ({ theme, width, breakdown, tools, deferredTools, instructions, snapshot, section, open, detail }: TreeInput): Tree => {
  const { layout, patterns } = contextConfig
  const wanted: Wanted[] = []
  const liveId = snapshot.live?.id

  const used = breakdown?.categories.filter(category => category.kind === 'used' && category.tokens > 0) ?? []
  const systemRows = used.filter(category => !isMessagesCategory(category))
  const messagesRow = used.find(category => isMessagesCategory(category))

  const byTokens = (items: readonly Item[]) => [...items].sort((a, b) => b.tokens - a.tokens)

  const detailOfCategory = ({ name }: ContextCategory): string | undefined => {
    const kept = breakdown?.skillsListed

    return kept && patterns.sections.skills.test(name) && !patterns.sections.mcp.test(name) ? `${kept.included} of ${kept.total} ${contextConfig.systemItems.listed}` : undefined
  }

  const named = (names: readonly string[]): Item[] => [...names].sort((a, b) => a.localeCompare(b)).map(name => ({ id: name, label: name, tokens: 0, value: '' }))

  const toolItems = (): Item[] => [
    ...named(tools),
    ...(deferredTools.length > 0 ? [{ id: 'deferred', label: `${deferredTools.length} ${contextConfig.systemItems.deferred}`, tokens: 0, value: '', items: named(deferredTools) }] : []),
  ]

  const itemsOf = ({ name }: ContextCategory): Item[] => {
    if (!breakdown) return []
    const { sections } = patterns
    if (sections.systemTools.test(name)) return toolItems()
    const items = sections.mcpInstructions.test(name)
      ? instructions
      : sections.mcp.test(name)
        ? breakdown.mcp
        : sections.memory.test(name)
          ? breakdown.memory
          : sections.skills.test(name)
            ? breakdown.skills
            : sections.agents.test(name)
              ? breakdown.agents
              : []

    return byTokens(items)
  }

  const called = snapshot.used
  const marked = (item: Item): Item =>
    called && item.uses && !item.uses.some(use => called.has(use))
      ? { ...item, detail: [...(item.detail ? [item.detail] : []), contextConfig.systemItems.unused].join(' · ') }
      : item

  const itemNode = (key: string, one: Item): ItemNode => {
    const item = marked(one)
    const canOpen = item.text !== undefined || (item.items?.length ?? 0) > 0
    const isOpen = canOpen && open.has(key)

    return { key, item, isOpen: canOpen ? isOpen : null, children: isOpen ? byTokens(item.items ?? []).map(child => itemNode(`${key}-${child.id}`, child)) : [] }
  }

  const categories = systemRows.map((category): CategoryNode => {
    const items = itemsOf(category).map(item => itemNode(`item-${category.name}-${item.id}`, item))
    const key = items.length > 0 ? `category-${category.name}` : null
    const categoryDetail = detailOfCategory(category)

    return { kind: 'category', key, category, ...(categoryDetail ? { detail: categoryDetail } : {}), items, color: softColor(category.color, theme), isOpen: key !== null && open.has(key) }
  })
  const systemParts = categories.map(
    (node): Part => ({
      key: `bar-${node.category.name}`,
      scope: `part-${node.category.name}`,
      ...(node.key ? { row: node.key } : {}),
      label: `${node.category.name} ${formatTokens(node.category.tokens)}`,
      tokens: node.category.tokens,
      color: node.color,
      reveal: node.key ? { section: 'system', key: node.key, opens: true } : { section: 'system', key: 'system', opens: false },
    }),
  )

  const marks = snapshot.compacts.map(group => group.mark)
  const current = snapshot.turns
  const everyTurn = [...snapshot.compacts.flatMap(group => group.turns), ...current]
  const lastMark = marks.at(-1)
  const kept = current.filter(turn => turn.rewoundAt === undefined)
  const positive = kept.filter(turn => turn.total > 0)
  const grown = positive.slice(-layout.barTurns)
  const summaryTokens = lastMark?.summaryTokens ?? 0
  const firstPositive = positive[0]
  const earlier = firstPositive && positive.length > grown.length ? (messagesRow?.tokens ?? 0) - summaryTokens - sumOf(grown.map(turn => turn.total)) : 0
  const colorOf = turnScale(
    grown.map(turn => turn.total),
    theme,
  )

  const messageParts: Part[] = [
    ...(firstPositive && earlier > 0
      ? [
          {
            key: 'bar-earlier',
            scope: 'part-earlier',
            label: `earlier messages ${formatTokens(earlier)}`,
            tokens: earlier,
            color: earlierColor(theme),
            reveal: { section: 'messages', key: `turn-${firstPositive.id}`, opens: false } as const,
          },
        ]
      : []),
    ...(lastMark
      ? [
          {
            key: 'bar-compact',
            scope: `part-compact-${lastMark.at}`,
            row: `compact-${lastMark.at}`,
            label: `compact ${marks.length} summary ${formatTokens(summaryTokens)}`,
            tokens: summaryTokens,
            color: accentColor('compact', theme),
            reveal: { section: 'messages', key: `compact-${lastMark.at}`, opens: true } as const,
          },
        ]
      : []),
    ...grown.map(turn => ({
      key: `bar-turn-${turn.id}`,
      scope: `part-turn-${turn.id}`,
      row: `turn-${turn.id}`,
      label: `${timeOfDay(turn.at)} ${signedTokens(turn.total)} ${titleOf(turn)
        .map(piece => piece.text)
        .join('')}`,
      tokens: turn.total,
      color: colorOf(turn.total),
      reveal: { section: 'messages', key: `turn-${turn.id}`, opens: true } as const,
    })),
  ]

  const callNode = (key: string, tool: ToolView, tokens: number, cost: { args: number; result: number; thinking: number }, missed: number): CallNode => {
    const error = tool.isError ? (tool.outcome ?? 'error') : ''
    const result = tool.outcome && (!tool.isError || error.length > layout.errorRoom) ? tool.outcome : undefined
    const parts = [
      { name: tool.input, detail: tool.wrote, tokens: cost.args },
      { name: tool.isError ? 'error' : tool.output, detail: result, tokens: cost.result },
    ].filter(part => part.detail || formatTokens(part.tokens) !== '0k')
    const canOpen = cost.thinking > 0 || parts.length > 1

    return { kind: 'call', key, tool, tokens, missed, thinking: cost.thinking, parts, isOpen: canOpen ? open.has(key) : null }
  }

  const roundsOf = (turn: MeasuredTurn, turnDetail: TurnDetail) =>
    turnDetail.rounds.flatMap(({ index, tools: own, added, missed, isLast, allocation }): RoundNode[] => {
      if (!allocation) return isLast ? [] : [{ kind: 'untracked', added, missed }]

      const key = `step-${turn.id}-${index}`
      const [single] = own
      if (single && own.length === 1) {
        return [callNode(key, single, added, { args: allocation.args[0] ?? 0, result: allocation.results[0] ?? 0, thinking: allocation.thinking }, missed)]
      }

      const isOpen = open.has(key)
      const calls = isOpen
        ? own.map((tool, k) => {
            const args = allocation.args[k] ?? 0
            const result = allocation.results[k] ?? 0

            return callNode(`tool-${tool.id}`, tool, args + result, { args, result, thinking: 0 }, 0)
          })
        : []

      return [{ kind: 'step', key, tools: own, added, missed, thinking: allocation.thinking, isOpen, calls }]
    })

  const turnNode = (turn: MeasuredTurn, isMuted: boolean): TurnNode => {
    const key = `turn-${turn.id}`
    const isLive = turn.id === liveId
    const isOpen = open.has(key)
    if (isOpen && !isLive) wanted.push({ key, turnId: turn.id })
    const value = isOpen ? detail(key) : undefined
    const body: TurnBody | null = !isOpen
      ? null
      : typeof value === 'object'
        ? { kind: 'rounds', detail: value, rounds: roundsOf(turn, value) }
        : { kind: 'note', text: value ?? 'loading…' }

    return { kind: 'turn', key, turn, isLive, isMuted, isOpen, body }
  }

  const summaryNode = (mark: Compact): SummaryNode => {
    const key = `summary-${mark.at}`
    const isOpen = open.has(key)
    if (isOpen) wanted.push({ key, compactAt: mark.at })
    const value = isOpen ? detail(key) : undefined

    return { kind: 'summary', key, mark, isOpen, text: typeof value === 'string' ? value : null }
  }

  const rewindNode = (at: number, dropped: MeasuredTurn[]): RewindNode => {
    const key = `rewind-${at}`
    const isOpen = open.has(key)

    return {
      kind: 'rewind',
      key,
      at,
      turnCount: dropped.length,
      freed: sumOf(dropped.map(turn => turn.total)),
      isOpen,
      turns: isOpen ? dropped.map(turn => turnNode(turn, true)) : [],
    }
  }

  const timeline = (group: MeasuredTurn[], isMuted: boolean): TreeNode[] => {
    const batches = new Map<number, MeasuredTurn[]>()
    for (const turn of group) if (turn.rewoundAt !== undefined) batches.set(turn.rewoundAt, [...(batches.get(turn.rewoundAt) ?? []), turn])
    const events = [
      ...[...batches].map(([at, dropped]) => ({ at, node: () => rewindNode(at, dropped) })),
      ...group.filter(turn => turn.rewoundAt === undefined).map(turn => ({ at: turn.at, node: () => turnNode(turn, isMuted) })),
    ]

    return events.sort((a, b) => a.at - b.at).map(event => event.node())
  }

  const compactNode = (mark: Compact, n: number, group: MeasuredTurn[]): CompactNode => {
    const key = `compact-${mark.at}`
    const isOpen = open.has(key)

    return { kind: 'compact', key, mark, n, turnCount: group.length, isOpen, children: isOpen ? [summaryNode(mark), ...timeline(group, true)] : [] }
  }

  const messagesBody = (): MessagesBody => {
    const live = snapshot.live
    const isAwaited = live?.isAwaited === true
    const nodes = [...snapshot.compacts.map((group, i) => compactNode(group.mark, i + 1, group.turns)), ...timeline(current, false)]

    return {
      isEmpty: everyTurn.length === 0 && !lastMark && !isAwaited,
      nodes,
      awaited: live && isAwaited ? live : null,
    }
  }

  const turnReveal = (turn: MeasuredTurn): Reveal => ({ section: 'messages', key: `turn-${turn.id}`, opens: true })

  const findingNodes = (): FindingNode[] => {
    const { findings } = contextConfig
    const nodes: FindingNode[] = []
    const heaviest = kept.reduce<MeasuredTurn | undefined>((best, turn) => ((turn.findings?.thinking ?? 0) > (best?.findings?.thinking ?? 0) ? turn : best), undefined)
    const thinking = sumOf(kept.map(turn => turn.findings?.thinking ?? 0))
    if (heaviest && thinking >= findings.minTokens) {
      nodes.push({ key: 'finding-thinking', kind: 'thinking', tokens: thinking, groups: [], more: 0, isOpen: null, reveal: turnReveal(heaviest) })
    }
    for (const kind of callKinds) {
      const groups = new Map<string, FindingGroup>()
      for (const turn of kept) {
        for (const call of turn.findings?.[kind] ?? []) {
          const id = `${call.name} ${call.label}`
          const group = groups.get(id) ?? { key: '', ...actionOf(call.name), label: call.label, count: 0, tokens: 0, reveal: turnReveal(turn) }
          groups.set(id, { ...group, count: group.count + 1, tokens: group.tokens + call.tokens, reveal: turnReveal(turn) })
        }
      }
      const sorted = [...groups.values()].sort((a, b) => b.tokens - a.tokens)
      const tokens = sumOf(sorted.map(group => group.tokens))
      if (tokens < findings.minTokens) continue
      const key = `finding-${kind}`
      const shown = sorted.slice(0, findings.groupRows).map((group, i) => ({ ...group, key: `${key}-${i}` }))
      nodes.push({ key, kind, tokens, groups: shown, more: sorted.length - shown.length, isOpen: open.has(key) })
    }

    return nodes.sort((a, b) => b.tokens - a.tokens)
  }

  const findingList = findingNodes()
  const isFindingsOpen = section === 'findings' && findingList.length > 0
  const findingBranch = (node: FindingNode): Branch => ({
    key: node.key,
    isOpen: node.isOpen,
    children: node.isOpen ? node.groups.map(group => ({ key: group.key, isOpen: null, children: [] })) : [],
  })

  const room = Math.max(layout.barRoomMin, width - layout.sectionRoom)
  const isSystemOpen = section === 'system'
  const body = section === 'messages' ? messagesBody() : null
  const itemBranch = (one: ItemNode): Branch => ({ key: one.key, isOpen: one.isOpen, children: one.children.map(itemBranch) })
  const itemBranches = (node: CategoryNode): Branch[] => (node.isOpen ? node.items.map(itemBranch) : [])
  const shownCategories: Branch[] = isSystemOpen
    ? [...categories.flatMap(node => (node.key ? [{ key: node.key, isOpen: node.isOpen, children: itemBranches(node) }] : []))]
    : []

  return {
    system: {
      tokens: breakdown ? sumOf(systemRows.map(category => category.tokens)) : undefined,
      parts: systemParts,
      cells: cellsOf(
        systemParts.map(part => part.tokens),
        Math.round(room / layout.systemBarShare),
        layout.cellGrowth,
      ),
      categories,
      isOpen: isSystemOpen,
    },
    messages: {
      tokens: messagesRow?.tokens,
      parts: messageParts,
      cells: cellsOf(
        messageParts.map(part => part.tokens),
        room,
        layout.cellGrowth,
        layout.messageCellTokens,
      ),
      body,
    },
    findings: { nodes: findingList, isOpen: isFindingsOpen },
    navigation: navigationOf([
      { key: 'system', isOpen: isSystemOpen, parts: systemParts, children: shownCategories },
      { key: 'messages', isOpen: body !== null, parts: messageParts, children: body ? body.nodes.map(branchOf) : [] },
      ...(findingList.length > 0 ? [{ key: 'findings' as const, isOpen: isFindingsOpen, parts: [], children: isFindingsOpen ? findingList.map(findingBranch) : [] }] : []),
    ]),
    wanted,
  }
}
