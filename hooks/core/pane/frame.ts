import type { RenderElement, RenderInput } from 'claude-code'

import { cut } from '../format'
import type { Ui } from '../index'
import { paneConfig } from './config'
import { noteFocus } from './open'
import type { PaneSpec, Panes } from './open'
import { paneUi } from './ui'

type PaneProps = Pick<RenderInput<'Pane'>['props'], 'isFocused' | 'bodyColumns' | 'scroll'>

export type FrameSpec = PaneSpec & { minRows: number }

export type PaneZones = { header?: RenderElement; body: RenderElement; footer?: RenderElement | null; hint?: string }

const compactOf = (bodyRows: number, minRows: number) => ({
  header: bodyRows >= minRows - 1,
  footer: bodyRows >= minRows,
})

const bodyRowsOf = (minRows: number, props: PaneProps) => {
  const zones = compactOf(props.scroll.bodyRows, minRows)
  return Math.max(1, props.scroll.bodyRows - (zones.header ? 1 : 0) - (zones.footer ? 1 : 0))
}

const paneStatus = ({ Box, Text }: Ui, props: PaneProps, state: Panes): RenderElement | null => {
  if (props.isFocused) return null
  const { status } = paneConfig
  const columns = Math.max(1, props.bodyColumns)
  const focusHint = ` ${state.keys.chords.focus ?? ''} `
  const full = status.inactiveLabel.length + 1 + focusHint.length
  const label = full <= columns * status.labelShare ? status.inactiveLabel : ''
  return Box({
    key: 'pane-focus-status',
    position: 'absolute',
    top: props.scroll.offset,
    right: 0,
    flexShrink: 0,
    children: Text({
      color: 'warning',
      bold: true,
      children: [label ? `${label} ` : '', Text({ inverse: true, children: focusHint.slice(0, columns) })],
    }),
  })
}

const helpOf = ({ Text }: Ui, props: PaneProps, hint: string | undefined) =>
  props.isFocused && hint ? Text({ dimColor: true, children: cut(hint, Math.max(1, props.bodyColumns)) }) : null

const paneFrame = (state: Panes, rawUi: Ui, ui: Ui, props: PaneProps, spec: FrameSpec, { header, body, footer, hint }: PaneZones): RenderElement => {
  const { Box, Text } = ui
  const zones = compactOf(props.scroll.bodyRows, spec.minRows)
  const status = paneStatus(rawUi, props, state)
  const rows = Math.max(1, props.scroll.bodyRows)
  const columns = Math.max(1, props.bodyColumns)
  const top = header ?? Text({ bold: true, children: cut(spec.title, columns) })
  const bottom = footer ?? helpOf(ui, props, hint)
  return Box({
    flexDirection: 'column',
    width: columns,
    height: rows + 1,
    children: [
      Box({
        key: 'pane-frame',
        flexDirection: 'column',
        height: rows,
        flexShrink: 0,
        overflow: 'hidden',
        children: [
          ...(zones.header ? [Box({ key: 'pane-header', height: 1, flexShrink: 0, overflow: 'hidden', children: top })] : []),
          Box({ key: 'pane-body', flexDirection: 'column', flexGrow: 1, flexShrink: 1, overflow: 'hidden', children: body }),
          ...(zones.footer ? [Box({ key: 'pane-footer', height: 1, flexShrink: 0, overflow: 'hidden', children: bottom ?? [] })] : []),
        ],
      }),
      Box({ height: 1, flexShrink: 0 }),
      ...(status ? [status] : []),
    ],
  })
}

export const framedPane = (state: Panes, spec: FrameSpec, rawUi: Ui, props: PaneProps) => {
  noteFocus(state, spec.id, props.isFocused)
  const ui = paneUi(rawUi, props.isFocused)
  return {
    ui,
    rows: bodyRowsOf(spec.minRows, props),
    frame: (zones: PaneZones) => paneFrame(state, rawUi, ui, props, spec, zones),
  }
}

export type FramedPane = ReturnType<typeof framedPane>
