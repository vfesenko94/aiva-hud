import type { Color, RenderElement } from 'claude-code'

import type { Ui } from '../../index'

export type Segment = { key: string; cells: number; color: Color; dim?: boolean; glyph?: keyof typeof meterGlyphs; scope?: string; isPointed?: boolean; onPress?: () => void }

const lit: Color = 'text'

const meterGlyphs = { fill: '█', track: '░' }

export const meter = ({ Button, Text }: Ui, segments: readonly Segment[]): RenderElement[] =>
  segments.map(({ key, cells, color, dim = false, glyph = 'fill', scope, isPointed, onPress }) => {
    const hover = scope === undefined ? {} : { hover: { scope, color: lit } }
    const face = Text({ color: isPointed ? lit : color, dimColor: dim && !isPointed, ...hover, children: meterGlyphs[glyph].repeat(Math.max(0, cells)) })
    return onPress ? Button({ key, plain: true, ...hover, onPress, children: face }) : face
  })
