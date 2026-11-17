import type { EngineInterface, On, UiPane } from 'claude-code'

import { closePaneState, createMoveGuard, focusElement, hiddenPane, hidePaneState, isInViewport, notePaneState, registerPaneClose, registerPanePress, scrollIntent, showPaneState, shownFrame, viewportFirst } from '../../../core'
import type { FrameSpec, PaneState, Panes, Span } from '../../../core'
import { contextConfig } from '../config'
import { onHistoryChange } from '../history'
import type { History } from '../history'
import { evictDetails, freshDetails, freshSource, invalidateSource, noteInstructions, releaseDetails, touchDetail } from './source'
export { forgetSources, noteTool } from './source'
import type { Details, Source } from './source'
import type { Memo } from './view'
import { backKey, descendantsOf, emptyNavigation, skipBars } from './tree'
import type { Navigation, Reveal, Section } from './tree'
import { arrowMove, isWalkable, verticalMove, visibleRow } from './keyboard'
import type { Move } from './keyboard'
import { renderPane } from './view'

type Anchor = { key: string }

type Window = { total: number; rows: number; spans: ReadonlyMap<string, Span> }

type Runtime = {
  revision: number
  section: Section | null
  open: Set<string>
  focused: string | null
  first: number
  anchor: Anchor | null
  window: Window
  navigation: Navigation
  source: Source
  details: Details
  memo: Memo | null
}

export type Pane = {
  readonly panes: Panes
  readonly spec: FrameSpec
  readonly history: History
  readonly tools: Set<string>
  readonly deferred: Set<string>
  readonly instructions: Map<string, string>
  runtime: Runtime
  visibility: PaneState
  notes: number
}

const emptyWindow = (): Window => ({ total: 0, rows: 1, spans: new Map() })

const freshRuntime = (): Runtime => ({
  revision: 0,
  section: null,
  open: new Set(),
  focused: null,
  first: 0,
  anchor: null,
  window: emptyWindow(),
  navigation: emptyNavigation(),
  source: freshSource(),
  details: freshDetails(),
  memo: null,
})

const paneSpec: FrameSpec = { id: contextConfig.layout.paneId, title: contextConfig.layout.paneTitle, rows: contextConfig.layout.paneRows, minRows: contextConfig.layout.paneMinRows }

const isSection = (key: string): key is Section => key === 'system' || key === 'messages' || key === 'findings'

const isOpen = (run: Runtime, key: string) => (isSection(key) ? run.section === key : run.open.has(key))

const releasePane = (run: Runtime) => {
  releaseDetails(run.details)
  invalidateSource(run.source)
  run.navigation = emptyNavigation()
  run.focused = null
  run.first = 0
  run.anchor = null
  run.window = emptyWindow()
  run.memo = null
  run.revision += 1
}

const touchBranch = (run: Runtime, key: string) => {
  for (let parent: string | null = key; parent; parent = run.navigation.nodes.get(parent)?.parent ?? null) touchDetail(run.details, parent)
}

const openKey = (run: Runtime, key: string) => {
  if (!isSection(key)) {
    run.open.add(key)
    return
  }
  run.section = key
}

export const createPane = ({ history, panes }: { history: History; panes: Panes }): Pane => {
  const pane: Pane = { history, panes, spec: paneSpec, tools: new Set(), deferred: new Set(), instructions: new Map(), runtime: freshRuntime(), visibility: hiddenPane(), notes: 0 }
  onHistoryChange(history, change => {
    if (change === 'clear') {
      releasePane(pane.runtime)
      pane.runtime = freshRuntime()
    } else invalidateSource(pane.runtime.source)
  })

  return pane
}

function expandNode($: EngineInterface, pane: Pane, key: string) {
  const run = pane.runtime
  touchBranch(run, key)
  if (isSection(key) && run.section !== key) releaseDetails(run.details)
  openKey(run, key)
  run.focused = key
  run.anchor = { key }
  run.revision += 1
  $.ui.invalidate('ui.render')
}

const collapseKey = (run: Runtime, key: string) => {
  touchBranch(run, key)
  if (!isSection(key)) run.open.delete(key)
  else if (run.section === key) run.section = null
  evictDetails(run.details, [key, ...descendantsOf(run.navigation, key)])
  run.focused = key
  run.anchor = { key }
  run.revision += 1
}

function collapseNode($: EngineInterface, pane: Pane, key: string) {
  collapseKey(pane.runtime, key)
  $.ui.invalidate('ui.render')
}

function focusNode($: EngineInterface, pane: Pane, key: string) {
  return focusElement($, pane.spec.id, key)
}

async function focusRow($: EngineInterface, pane: Pane, key: string) {
  const run = pane.runtime
  run.focused = key
  run.anchor = { key }
  run.revision += 1
  $.ui.invalidate('ui.render')
  await focusNode($, pane, key)
}

async function scrollRows($: EngineInterface, pane: Pane, by: number, isPage: boolean) {
  const run = pane.runtime
  const first = viewportFirst(run.window.total, run.window.rows, run.first + by)
  run.anchor = null
  if (first === run.first && !isPage) return
  run.first = first
  run.revision += 1
  const at = run.focused ? run.window.spans.get(run.focused)?.at : undefined
  const key = pane.visibility.isFocused && at !== undefined
    ? visibleRow(run.navigation, { ...run.window, first }, at + (isPage ? by : 0)) : undefined
  if (key && key !== run.focused) {
    await focusRow($, pane, key)
    return
  }
  $.ui.invalidate('ui.render')
}

function toggleNode($: EngineInterface, pane: Pane, key: string) {
  if (isOpen(pane.runtime, key)) collapseNode($, pane, key)
  else expandNode($, pane, key)
}

async function revealNode($: EngineInterface, pane: Pane, target: Reveal) {
  const run = pane.runtime
  if (run.section !== target.section) releaseDetails(run.details)
  openKey(run, target.section)
  if (target.opens) openKey(run, target.key)
  touchBranch(run, target.key)
  run.focused = target.key
  run.anchor = { key: target.key }
  run.revision += 1
  $.ui.invalidate('ui.render')
  await focusNode($, pane, target.key)
}

async function applyMove($: EngineInterface, pane: Pane, move: Move) {
  if (move.kind === 'expand') expandNode($, pane, move.key)
  else if (move.kind === 'collapse') collapseNode($, pane, move.key)
  else await focusRow($, pane, move.key)
}

export function closePane($: EngineInterface, pane: Pane) {
  releasePane(pane.runtime)
  return closePaneState($, pane.spec, pane.visibility)
}

export function notePane(pane: Pane, panes: readonly UiPane[]) {
  notePaneState(pane.visibility, panes, pane.spec.id)
}

export async function showPane($: EngineInterface, pane: Pane) {
  await showPaneState($, pane.panes, pane.spec, pane.visibility)
}

export async function activatePane($: EngineInterface, pane: Pane) {
  const was = { ...pane.visibility }
  if (was.isShown && was.isFocused) return closePane($, pane)

  await showPane($, pane)
  if (was.isShown && pane.visibility.isShown && !pane.visibility.isFocused) await closePane($, pane)
}

export const registerPane = (on: On, pane: Pane, isOn: () => boolean) => {
  const { paneId } = contextConfig.layout
  const guard = createMoveGuard()

  registerPanePress(on, pane.panes, pane.spec, isOn)

  on('prompt.attachment', { type: contextConfig.patterns.instructionsAttachment }, async (_, e, next) => {
    if (!isOn()) return next(e)
    const run = pane.runtime
    const attached = await next(e)
    if (run === pane.runtime && !e.agentId && attached.text) {
      noteInstructions(pane.instructions, attached.text)
      pane.notes += 1
    }

    return attached
  })

  on('ui.focus', { requestId: paneId }, async ($, e, next) => {
    if (!isOn()) return next(e)
    const run = pane.runtime
    const revision = run.revision
    const input = skipBars(run.navigation.order, run.focused, e)
    const moved = await next(input)
    if (run === pane.runtime && run.revision === revision && !moved.deny) {
      const key = input.element ?? null
      const span = key === null ? undefined : run.window.spans.get(key)
      if (key !== null && span && e.origin.kind === 'person' && !isInViewport(run.window.rows, run.first, span)) run.anchor = { key }
      run.focused = key
      $.ui.invalidate('ui.render')
    }

    return moved
  })

  on('ui.scroll', { requestId: paneId }, async ($, e, next) => {
    if (!isOn() || e.origin.kind !== 'person') return next(e)
    const run = pane.runtime
    const direction = scrollIntent(e)
    if (direction === 'up' || direction === 'down') {
      const key = verticalMove(run.navigation, run.focused, direction, { ...run.window, first: run.first })
      if (key) await focusRow($, pane, key)
      return {}
    }
    if (!direction || !isWalkable(run.navigation, run.focused)) {
      const page = Math.sign(e.by) * Math.max(1, run.window.rows - 1)
      await scrollRows($, pane, direction ? e.by * Infinity : e.pointer ? e.by : page, !e.pointer)
      return {}
    }
    const move = arrowMove(run.navigation, run.focused, direction)
    if (move) await guard(() => applyMove($, pane, move))

    return {}
  })

  registerPaneClose(on, pane.panes, pane.spec, {
    isOn,
    back: () => {
      const key = backKey(pane.runtime.navigation, pane.runtime.focused)
      return key ? { run: () => collapseKey(pane.runtime, key), focus: key } : null
    },
    closed: () => {
      hidePaneState(pane.visibility)
      releasePane(pane.runtime)
    },
  })

  on('ui.render', { component: 'Pane', requestId: paneId }, async ($, e, next) => {
    if (!isOn()) return next(e)
    const framed = await shownFrame($, e, pane.panes, pane.spec, pane.visibility)
    if (!framed) {
      releasePane(pane.runtime)
      return $.ui.resolve(e).Box({})
    }

    return renderPane($, pane, e, framed, {
      toggle: key => toggleNode($, pane, key),
      reveal: target => void revealNode($, pane, target),
    })
  })
}
