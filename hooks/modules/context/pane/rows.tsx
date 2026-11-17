import type { Color, ContextCategory, RenderElement } from 'claude-code'

import { count, cut, disclosure, disclosureMark, timeOfDay, wrapText } from '../../../core'
import type { Line, Span, Stop, Ui } from '../../../core'
import { contextConfig } from '../config'
import type { ToolKind } from '../config'
import { accentColor, softColor } from '../theme'
import type { Theme } from '../theme'
import { formatTokens, signedTokens, sumOf } from '../tokens'
import type { ToolView, TurnDetail } from '../history'
import { titleOf } from './tree'
import type { CallNode, CategoryNode, FindingNode, ItemNode, MessagesBody, Navigation, NavNode, PaneActions, Piece, RoundNode, StepNode, SummaryNode, TreeNode, TurnNode } from './tree'

type RowsContext = {
  ui: Ui
  theme: Theme
  width: number
  window: number
  categories: readonly ContextCategory[]
  actions: PaneActions
}

export const rowsOf = ({ ui: { Box, Button, Text }, theme, width, window, categories, actions }: RowsContext) => {
  const { layout, patterns } = contextConfig
  const { mark: MARK, number: NUMBER, gap: GAP, indent: INDENT } = layout.columns
  const ROW = width - layout.rowInset
  const { toggle } = actions
  const kit: Ui = { Box, Button, Text }
  const lines: Line[] = []
  const spans = new Map<string, Span>()
  const parents = new Map<string, string | null>()
  const branch: string[] = []
  const readingRows = new Map<string, number>()
  const ignore = () => undefined
  let inset = 0

  const put = (element: RenderElement, stops: readonly Stop[] = []) => {
    const owner = branch.at(-1)
    for (const stop of stops) parents.set(stop.key, (stop.key === owner ? branch.at(-2) : owner) ?? null)
    lines.push({
      stops,
      element:
        inset > 0 ? (
          <Box flexDirection="column" paddingLeft={inset}>
            {element}
          </Box>
        ) : (
          element
        ),
    })
  }

  const within = (key: string, draw: () => void) => {
    const at = lines.length
    branch.push(key)
    draw()
    branch.pop()
    spans.set(key, { at, size: lines.length - at })
  }

  const navigation = (base: Navigation): Navigation => {
    const order = lines.flatMap(line => (line.stops ?? []).map(stop => stop.key))
    const nodes = new Map<string, NavNode>()
    for (const key of order) {
      if (key.startsWith('bar-')) continue
      nodes.set(key, { parent: parents.get(key) ?? null, isOpen: base.nodes.get(key)?.isOpen ?? null, firstChild: null })
    }
    for (const [key, node] of nodes) {
      const parent = node.parent ? nodes.get(node.parent) : undefined
      if (parent && parent.firstChild === null) parent.firstChild = key
    }
    return { order, nodes }
  }

  const heat = (tokens: number): Color | undefined => {
    const share = Math.max(0, tokens) / window

    return share >= contextConfig.heavy.error ? 'error' : share >= contextConfig.heavy.warning ? 'warning' : undefined
  }

  const toolColor = (kind: ToolKind): Color => {
    if (kind === 'read' || kind === 'write' || kind === 'shell') return accentColor(kind, theme)
    const { name, color } = patterns.toolCategories[kind]
    const category = categories.find(one => name.test(one.name))

    return softColor(category ? category.color : color, theme)
  }

  const thinkingPiece = (text: string): Piece => ({ text, color: accentColor('thinking', theme), isItalic: true })
  const nowPiece: Piece = { text: '● now', color: 'claude' }
  const inner = (lead: string) => lead + ' '.repeat(INDENT)
  const lengthOf = (pieces: Piece[]) => sumOf(pieces.map(piece => piece.text.length))

  const fit = (pieces: Piece[], room: number) => {
    let left = Math.max(0, room)

    return pieces.map(piece => {
      const text = piece.text.length > left ? cut(piece.text, left) : piece.text
      left -= text.length

      return { ...piece, text }
    })
  }

  const draw = (pieces: Piece[], isMuted: boolean) =>
    pieces.map(piece => (
      <Text color={isMuted ? undefined : piece.color} dimColor={isMuted || piece.isDim} bold={piece.isBold} italic={piece.isItalic}>
        {piece.text}
      </Text>
    ))

  const markOf = (isOpen: boolean) => `${disclosureMark(isOpen)} `
  const markColumn = (lead: string) => NUMBER + GAP + lead.length
  const roomOf = (lead: string, mark: string, marks: Piece[]) => ROW - markColumn(lead) - mark.length - lengthOf(marks)

  const lineOf = (lead: string, mark: string, label: Piece[], marks: Piece[], amount?: Piece) => {
    const number = (amount?.text ?? '').padStart(NUMBER)

    return [
      ...(lead ? [{ text: ' '.repeat(lead.length + GAP - 1) }, { ...amount, text: `${number} ` }] : [{ ...amount, text: number }, { text: ' '.repeat(GAP) }]),
      { text: mark, isDim: true },
      ...fit(label, roomOf(lead, mark, marks)),
      ...marks,
    ]
  }

  const amountPiece = (tokens: number): Piece => ({ text: formatTokens(tokens), color: heat(tokens) })
  const missOf = (tokens: number): Piece[] => (tokens > 0 ? [{ text: `  cache miss ${formatTokens(tokens)}`, color: 'warning' }] : [])

  const textRow = (pieces: Piece[], isMuted: boolean) => {
    const owner = branch.at(-1)
    if (owner && pieces.some(piece => piece.text.trim() !== '')) {
      const n = readingRows.get(owner) ?? 0
      readingRows.set(owner, n + 1)
      const key = `read-${owner}-${n}`
      within(key, () => pressRow(key, ignore, pieces, isMuted))
      return
    }
    put(<Text wrap="truncate-end">{draw(pieces, isMuted)}</Text>)
  }

  const pressRow = (key: string, onPress: () => void, pieces: Piece[], isMuted: boolean, scope?: string) => {
    const at = lines.length
    put(
      <Button key={key} plain {...(scope ? { hover: { scope, bold: true } } : {})} onPress={onPress}>
        {draw(pieces, isMuted)}
      </Button>,
      [{ key, onPress }],
    )
    spans.set(key, { at, size: 1 })
  }

  const leafRow = (lead: string, label: Piece[], amount: Piece, isMuted: boolean) => textRow(lineOf(lead, '', label, [], amount), isMuted)

  const note = (lead: string, content: string | Piece[], isMuted = false) => {
    const left = ' '.repeat(markColumn(lead) + MARK)
    if (typeof content !== 'string') {
      textRow(fit([{ text: left, isDim: true }, ...content], ROW), isMuted)
      return
    }
    for (const line of wrapText(content, width - inset - left.length)) textRow([{ text: `${left}${line || ' '}`, isDim: true }], false)
  }

  const toolPieces = (tool: ToolView) => {
    const error = tool.isError ? (tool.outcome ?? 'error') : ''
    const marks: Piece[] = [
      ...(error ? [{ text: `  ${cut(error, layout.errorRoom)}`, color: 'error' as const }] : []),
      ...(tool.repeatOf !== undefined ? [{ text: `  ↻ repeat of ${timeOfDay(tool.repeatOf)}`, color: 'warning' as const }] : []),
    ]
    const color: Color = tool.isError ? 'error' : toolColor(tool.kind)
    const label: Piece[] = [{ text: tool.verb, color }, ...(tool.subject ? [{ text: ` ${tool.subject}` }] : [])]

    return { label, marks }
  }

  const requestLabel = (views: ToolView[]): Piece[] => {
    const counts = new Map<string, { kind: ToolKind; n: number }>()
    for (const tool of views) counts.set(tool.verb, { kind: tool.kind, n: (counts.get(tool.verb)?.n ?? 0) + 1 })

    return [...counts].flatMap(([verb, { kind, n }], i) => [...(i > 0 ? [{ text: ' · ', isDim: true }] : []), { text: n > 1 ? `${verb} ×${n}` : verb, color: toolColor(kind) }])
  }

  const callRow = (node: CallNode, lead: string, isMuted: boolean) => {
    const pieces = toolPieces(node.tool)
    const only = node.isOpen === null ? node.parts[0] : undefined
    const tail: Piece[] = only ? [{ text: `  ${cut(only.detail ? `${only.name} ${only.detail}` : only.name, layout.errorRoom)}`, isDim: true }] : []
    const line = lineOf(lead, node.isOpen === null ? '' : markOf(node.isOpen), pieces.label, [...tail, ...pieces.marks, ...missOf(node.missed)], amountPiece(node.tokens))
    if (node.isOpen === null) {
      within(node.key, () => pressRow(node.key, ignore, line, isMuted, node.key))
      return
    }
    const below = inner(lead)
    within(node.key, () => {
      pressRow(node.key, () => toggle(node.key), line, isMuted, node.key)
      if (!node.isOpen) return
      if (node.thinking > 0) leafRow(below, [thinkingPiece('thinking')], amountPiece(node.thinking), isMuted)
      for (const part of node.parts) leafRow(below, [{ text: part.name, isDim: true }, ...(part.detail ? [{ text: ` ${part.detail}` }] : [])], amountPiece(part.tokens), isMuted)
    })
  }

  const stepRow = (node: StepNode, lead: string, isMuted: boolean) => {
    const errors = node.tools.filter(tool => tool.isError).length
    const marks: Piece[] = [
      ...(errors > 0 ? [{ text: errors === 1 ? '  error' : `  ${errors} errors`, color: 'error' as const }] : []),
      ...(node.tools.some(tool => tool.repeatOf !== undefined) ? [{ text: '  ↻ repeat', color: 'warning' as const }] : []),
      ...missOf(node.missed),
    ]
    const below = inner(lead)
    within(node.key, () => {
      pressRow(node.key, () => toggle(node.key), lineOf(lead, markOf(node.isOpen), requestLabel(node.tools), marks, amountPiece(node.added)), isMuted, node.key)
      if (!node.isOpen) return
      if (node.thinking > 0) leafRow(below, [thinkingPiece('thinking')], amountPiece(node.thinking), isMuted)
      for (const call of node.calls) callRow(call, below, isMuted)
    })
  }

  const roundRow = (round: RoundNode, lead: string, isMuted: boolean) => {
    if (round.kind === 'call') callRow(round, lead, isMuted)
    else if (round.kind === 'step') stepRow(round, lead, isMuted)
    else textRow(lineOf(lead, '', [{ text: 'tools not recorded', isDim: true }], missOf(round.missed), amountPiece(round.added)), isMuted)
  }

  const kindsOf = (node: TurnNode, detail: TurnDetail): Piece[] => {
    const { turn } = node
    const kinds = [
      { name: turn.prompt ? 'prompt' : turn.source && turn.source !== 'continuation' ? 'message' : 'reminders', tokens: detail.incoming, color: contextConfig.partColors.prompt },
      { name: 'thinking', tokens: detail.thinking, color: accentColor('thinking', theme), isThinking: true },
      { name: detail.soleTool?.verb ?? 'tools', tokens: detail.toolTokens, color: detail.soleTool ? toolColor(detail.soleTool.kind) : contextConfig.partColors.tools, isTools: true },
      { name: 'answer', tokens: detail.answer, color: contextConfig.partColors.answer },
    ].filter(kind => kind.tokens !== 0)

    return kinds.flatMap((kind, i): Piece[] => [
      ...(i > 0 ? [{ text: ' · ', isDim: true }] : []),
      { text: kind.name, color: kind.color, isItalic: kind.isThinking },
      { text: ` ${formatTokens(kind.tokens)}` },
      ...(kind.isTools && detail.repeated > 0 ? [{ text: ` ↻ repeat ${formatTokens(detail.repeated)}`, color: 'warning' as const }] : []),
    ])
  }

  const turnRow = (node: TurnNode, lead: string) => {
    const { turn, isMuted, body } = node
    const heaviest = turn.heaviestTool
    const mostly: Piece[] = heaviest && heat(turn.total) && heaviest.tokens * 2 >= turn.total ? [{ text: `  mostly ${heaviest.verb}`, isDim: true }] : []
    const when: Piece = node.isLive ? nowPiece : { text: timeOfDay(turn.at), isDim: true }
    const amount: Piece = { text: signedTokens(turn.total), color: heat(turn.total), isBold: true }
    const byKind = body?.kind === 'rounds' ? kindsOf(node, body.detail) : []
    within(node.key, () => {
      pressRow(node.key, () => toggle(node.key), lineOf(lead, markOf(node.isOpen), [when, { text: '  ' }, ...titleOf(turn)], [...mostly, ...missOf(turn.missed ?? 0)], amount), isMuted, `part-turn-${turn.id}`)
      if (!body) return
      if (body.kind === 'note') note(lead, body.text)
      else {
        if (byKind.length > 0) note(lead, byKind, isMuted)
        for (const round of body.rounds) roundRow(round, inner(lead), isMuted)
      }
      textRow([{ text: ' ' }], false)
    })
  }

  const summaryRow = (node: SummaryNode, lead: string) => {
    const label: Piece = { text: 'summary', color: accentColor('compact', theme) }
    const amount: Piece = { text: formatTokens(node.mark.summaryTokens), isDim: true }
    within(node.key, () => {
      pressRow(node.key, () => toggle(node.key), lineOf(lead, markOf(node.isOpen), [label], [], amount), false)
      if (node.isOpen) note(lead, node.text ?? 'loading…')
    })
  }

  const ruleRow = (key: string, scope: string, lead: string, isOpen: boolean, title: string, color: Color) => {
    const room = ROW - markColumn(lead) - MARK
    const onPress = () => toggle(key)
    put(disclosure(kit, { key, isOpen, indent: markColumn(lead), label: title, labelWidth: room - 1, fill: '─', color, hover: { scope, bold: true }, onPress }), [{ key, onPress }])
  }

  const nodeRow = (node: TreeNode, lead: string) => {
    if (node.kind === 'turn') turnRow(node, lead)
    else if (node.kind === 'summary') summaryRow(node, lead)
    else if (node.kind === 'compact') {
      const { mark: one } = node
      const squeeze = one.tokensBefore !== null && one.tokensAfter !== null ? ` · ${formatTokens(one.tokensBefore)} → ${formatTokens(one.tokensAfter)}` : ''
      const title = `compact ${node.n} · ${timeOfDay(one.at)} · ${count(node.turnCount, 'turn', 'turns')}${squeeze} `
      within(node.key, () => {
        ruleRow(node.key, `part-compact-${one.at}`, lead, node.isOpen, title, accentColor('compact', theme))
        if (node.isOpen) for (const child of node.children) nodeRow(child, inner(lead))
      })
    } else {
      const title = `↶ rewind · ${timeOfDay(node.at)} · ${count(node.turnCount, 'turn', 'turns')} · −${formatTokens(node.freed)} `
      within(node.key, () => {
        ruleRow(node.key, node.key, lead, node.isOpen, title, accentColor('rewind', theme))
        if (node.isOpen) for (const turn of node.turns) turnRow(turn, inner(lead))
      })
    }
  }

  const system = (nodes: CategoryNode[]) => {
    const { childIndent, previewIndent } = layout
    const labelsOf = (items: readonly ItemNode[], depth: number): number[] => items.flatMap(one => [one.item.label.length + 2 + depth * childIndent, ...labelsOf(one.children, depth + 1)])
    const labels = [...nodes.map(node => node.category.name.length), ...nodes.flatMap(node => labelsOf(node.items, 0))]
    const nameWidth = Math.min(layout.nameWidth.max, Math.max(layout.nameWidth.min, ...labels) + 1)
    const quote = (line: string) => {
      put(
        <Box paddingLeft={previewIndent}>
          <Text dimColor wrap="truncate-end">
            {line || ' '}
          </Text>
        </Box>,
      )
    }

    const preview = (text: string) => {
      const source = text.split('\n')
      const shown = source.slice(0, layout.previewLines)
      for (const line of shown.flatMap(one => wrapText(one, width - inset - previewIndent))) quote(line)
      if (source.length > shown.length) quote(`… ${count(source.length - shown.length, 'more line', 'more lines')}`)
    }

    const itemRow = (depth: number) => ({ key, item, isOpen, children }: ItemNode) => {
      const tokens = item.value ?? formatTokens(item.tokens)
      const detail = item.detail ? [<Text>{` ${item.detail}`}</Text>] : []
      const extra = depth * childIndent
      const leafWidth = nameWidth - 2 - extra
      within(key, () => {
        if (isOpen === null) {
          put(
            <Button key={key} plain dimColor onPress={ignore}>
              <Text>{`${' '.repeat(5 + extra)}${cut(item.label, leafWidth).padEnd(leafWidth)}`}</Text>
              <Text>{tokens.padStart(layout.tokenWidth)}</Text>
              {detail}
            </Button>,
            [{ key, onPress: ignore }],
          )
          return
        }
        const onPress = () => toggle(key)
        put(disclosure(kit, { key, isOpen, dim: true, indent: 2 + extra, label: item.label, labelWidth: nameWidth - 3 - extra, value: tokens, valueWidth: layout.tokenWidth, tail: detail, onPress }), [{ key, onPress }])
        if (!isOpen) return
        if (item.text !== undefined) preview(item.text)
        children.forEach(itemRow(depth + 1))
      })
    }

    const categoryRow = ({ key, category, detail, items, color, isOpen }: CategoryNode) => {
      if (!key) {
        put(
          <Text wrap="truncate-end" hover={{ scope: `part-${category.name}`, color }}>
            {`    ${cut(category.name, nameWidth).padEnd(nameWidth)}`}
            {formatTokens(category.tokens).padStart(layout.tokenWidth)}
            {detail && <Text dimColor>{` ${detail}`}</Text>}
          </Text>,
        )
        return
      }
      const onPress = () => toggle(key)
      within(key, () => {
        put(
          disclosure(kit, {
            key,
            isOpen,
            label: category.name,
            labelWidth: nameWidth,
            value: formatTokens(category.tokens),
            valueWidth: layout.tokenWidth,
            tail: detail ? [<Text dimColor>{` ${detail}`}</Text>] : [],
            hover: { scope: `part-${category.name}`, color },
            onPress,
          }),
          [{ key, onPress }],
        )
        if (isOpen) items.forEach(itemRow(0))
      })
    }

    inset = layout.systemInset
    nodes.forEach(categoryRow)
    inset = 0
  }

  const messages = (body: MessagesBody) => {
    if (body.isEmpty) textRow([{ text: 'No turns yet.', isDim: true }], false)
    for (const node of body.nodes) nodeRow(node, '')
    if (body.awaited) textRow(lineOf('', ' '.repeat(MARK), [nowPiece, { text: '  ' }, ...titleOf(body.awaited)], [], { text: '…', isDim: true }), false)
  }

  const findings = (nodes: FindingNode[]) => {
    const { kinds, noteGroups } = contextConfig.findings
    const below = inner('')
    for (const node of nodes) {
      const { label, note } = kinds[node.kind]
      const summary = node.groups.slice(0, noteGroups).map(group => (group.count > 1 ? `${group.label} ${group.count}×` : group.label)).join(', ')
      const head: Piece[] = [
        node.kind === 'thinking' ? thinkingPiece(label) : { text: label },
        { text: `  ${node.isOpen === false && summary ? summary : note}`, isDim: true },
      ]
      if (node.isOpen === null) {
        const reveal = node.reveal
        pressRow(node.key, reveal ? () => actions.reveal(reveal) : ignore, lineOf('', ' '.repeat(MARK), head, [], amountPiece(node.tokens)), false, node.key)
        continue
      }
      within(node.key, () => {
        pressRow(node.key, () => toggle(node.key), lineOf('', markOf(node.isOpen === true), head, [], amountPiece(node.tokens)), false, node.key)
        if (!node.isOpen) return
        for (const group of node.groups) {
          pressRow(
            group.key,
            () => actions.reveal(group.reveal),
            lineOf(below, '', [{ text: group.verb, color: toolColor(group.kind) }, { text: ` ${group.label}` }], group.count > 1 ? [{ text: `  ${group.count}×`, isDim: true }] : [], amountPiece(group.tokens)),
            false,
            group.key,
          )
        }
        if (node.more > 0) textRow(lineOf(below, '', [{ text: `${node.more} more`, isDim: true }], []), false)
      })
    }
  }

  return { lines, spans, navigation, put, within, system, messages, findings }
}
