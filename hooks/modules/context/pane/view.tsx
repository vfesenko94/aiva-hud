import type { EngineInterface, RenderElement, RenderInput } from 'claude-code'

import { cut, disclosure, isPaneShown, meter, viewport, viewportFirst, viewportReveal, viewportWidth } from '../../../core'
import type { FramedPane, Stop } from '../../../core'
import { contextConfig } from '../config'
import { formatTokens } from '../tokens'
import { historySnapshot, historyVersion, turnDetail } from '../history'
import type { Pane } from './index'
import { rowsOf } from './rows'
import { instructionItems, isPaneCurrent, isStale, loadDetails, noteSession, refreshSource, retainDetails } from './source'
import { buildTree } from './tree'
import type { PaneActions, Part, Section, Wanted } from './tree'

export type Memo = { key: readonly unknown[]; element: RenderElement; wanted: readonly Wanted[] }

const isSameKey = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && a.every((value, i) => Object.is(value, b[i]))

export async function renderPane($: EngineInterface, pane: Pane, e: RenderInput<'Pane'>, framed: FramedPane, actions: PaneActions, redraws = 0): Promise<RenderElement> {
  const { ui } = framed
  const { Box, Text } = ui
  const { history } = pane
  const { layout } = contextConfig
  const columns = e.props.bodyColumns
  const width = viewportWidth(columns)
  const run = pane.runtime
  const revision = run.revision
  const isFinal = redraws >= contextConfig.maxRedraws
  const isCurrent = () => (isFinal ? isPaneShown($, pane.spec.id) : isPaneCurrent($, pane, run, revision))
  const redraw = async () => (!isFinal && (await isPaneShown($, pane.spec.id)) ? renderPane($, pane, e, framed, actions, redraws + 1) : <Box />)
  const [usage, version] = await Promise.all([$.session.usage(), historyVersion($, history)])
  if (!(await isCurrent())) return redraw()
  const { source } = run
  noteSession(source, usage.startedAt)
  if (isStale(source)) void refreshSource($, pane)
  const key = [
    revision, run.section, run.focused, run.anchor, run.first, run.details.version,
    source.revision, source.settled, source.isCounting, source.isFullRefused, source.countedFrom, source.theme, source.breakdown,
    pane.notes, history.runtime, version, history.live.isWorking, history.live.turnId,
    usage.startedAt, usage.context.tokens, usage.context.window, JSON.stringify(e.props), pane.panes.keys.chords.focus,
  ]
  const memo = run.memo
  if (memo && isSameKey(memo.key, key)) {
    loadDetails($, pane, memo.wanted)
    return memo.element
  }
  const snapshot = await historySnapshot($, history)
  if (!(await isCurrent())) return redraw()
  const live = snapshot.live
  const liveKey = live ? `turn-${live.id}` : null
  const liveDetail = run.section === 'messages' && live && liveKey && run.open.has(liveKey) ? await turnDetail($, history, live.id) : null
  if (!(await isCurrent())) return redraw()

  const tree = buildTree({
    theme: source.theme,
    width,
    breakdown: source.breakdown,
    tools: [...pane.tools],
    deferredTools: [...pane.deferred],
    instructions: instructionItems(pane.instructions, source.breakdown?.servers ?? new Set()),
    snapshot,
    section: run.section,
    open: run.open,
    detail: key => (key === liveKey ? (liveDetail ?? undefined) : run.details.entries.get(key)),
  })
  retainDetails(run.details, tree.wanted)
  loadDetails($, pane, tree.wanted)

  const list = rowsOf({
    ui,
    theme: source.theme,
    width,
    window: usage.context.window || contextConfig.fallbackWindow,
    categories: source.breakdown?.categories ?? [],
    actions,
  })

  const parts = [...tree.system.parts, ...tree.messages.parts]
  const focused = e.props.isFocused ? run.focused : null
  const pointed = focused ? parts.find(part => part.key === focused || part.row === focused) : undefined
  const caption = `${contextConfig.layout.paneTitle} ${formatTokens(usage.context.tokens ?? 0)}`

  const sectionRow = (section: Section, tokens: number | undefined, sectionParts: Part[], cells: number[], body: () => void) => {
    const onPress = () => actions.toggle(section)
    const stops: Stop[] = [{ key: section, onPress }, ...sectionParts.map(part => ({ key: part.key, onPress: () => actions.reveal(part.reveal) }))]
    list.within(section, () => {
      list.put(
        <Box>
          {disclosure(ui, {
            key: section,
            isOpen: run.section === section,
            label: section,
            labelWidth: layout.sectionLabel,
            bold: true,
            value: tokens === undefined ? '…' : formatTokens(tokens),
            valueWidth: layout.sectionRoom - layout.sectionPadding,
            tail: [<Text> </Text>],
            onPress,
          })}
          {meter(ui, sectionParts.map((part, i) => ({
            key: part.key,
            cells: cells[i] ?? 1,
            color: part.color,
            scope: part.scope,
            isPointed: part === pointed,
            onPress: () => actions.reveal(part.reveal),
          })))}
        </Box>,
        stops,
      )
      body()
    })
  }

  sectionRow('system', tree.system.tokens, tree.system.parts, tree.system.cells, () => {
    if (tree.system.isOpen) list.system(tree.system.categories)
  })
  sectionRow('messages', tree.messages.tokens, tree.messages.parts, tree.messages.cells, () => {
    if (tree.messages.body) list.messages(tree.messages.body)
  })
  if (tree.findings.nodes.length > 0) {
    const onPress = () => actions.toggle('findings')
    list.within('findings', () => {
      list.put(
        disclosure(ui, {
          key: 'findings',
          isOpen: tree.findings.isOpen,
          label: contextConfig.findings.label,
          labelWidth: layout.sectionLabel,
          bold: true,
          tail: [<Text dimColor>{`  ${cut(contextConfig.findings.note, Math.max(0, width - layout.sectionLabel - 6))}`}</Text>],
          onPress,
        }),
        [{ key: 'findings', onPress }],
      )
      if (tree.findings.isOpen) list.findings(tree.findings.nodes)
    })
  }

  run.navigation = list.navigation(tree.navigation)
  const total = list.lines.length
  const anchor = run.anchor
  const span = anchor ? list.spans.get(anchor.key) : undefined
  run.first = viewportFirst(total, framed.rows, span ? viewportReveal(total, framed.rows, run.first, { at: span.at, size: 1 }) : run.first)
  run.window = { total, rows: framed.rows, spans: list.spans }

  const element = framed.frame({
    hint: contextConfig.hint,
    header: (
      <Box width={columns}>
        <Box flexShrink={0}>
          <Text>
            <Text bold>{caption}</Text>
            {!source.breakdown && <Text dimColor>{source.isCounting ? ' counting…' : ' no breakdown'}</Text>}
          </Text>
        </Box>
        {parts.map(part => (
          <Box flexShrink={0} {...(part === pointed ? {} : { display: 'none', hover: { scope: part.scope, display: 'flex' } })}>
            <Text color={part.color} wrap="truncate-end">{`   ${cut(part.label, columns - caption.length - 3)}`}</Text>
          </Box>
        ))}
      </Box>
    ),
    body: viewport(ui, { key: layout.rowsKey, lines: list.lines, rows: framed.rows, width: columns, first: run.first }),
  })
  run.memo = { key, element, wanted: tree.wanted }

  return element
}
