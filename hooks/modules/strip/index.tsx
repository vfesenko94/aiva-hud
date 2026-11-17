import type { EngineInterface, Next, On, PromptChangeInput, PromptEditInput, PromptEditResult, PromptSubmitInput, RenderElement } from 'claude-code'

import type { Block, HintKey, Ui } from '../../core'
import { stripConfig } from './config'
import { cleanHint } from './hints'
import { fillerFor, idleNav, isFiller, keepSelection, moveSelection, navAction } from './nav'
import type { Nav } from './nav'

export { stripConfig } from './config'

export type StripActions = {
  submitsOnEnter: (id: string) => boolean
  press: (id: string) => void
  pressInBox: (id: string) => void
  open: (id: string) => void
}

type Strip = { nav: Nav }

export const createStrip = (): Strip => ({ nav: idleNav() })

const fillerMarks = [
  { start: 0, end: 1, dimColor: true },
  { start: 2, end: 2, virtualText: stripConfig.navHint, dimColor: true },
]

const boxFiller = (nav: Nav, actions: StripActions) => fillerFor(actions.submitsOnEnter(nav.selected))

function stopNav($: EngineInterface, nav: Nav) {
  nav.isActive = false
  $.ui.invalidate('ui.render')
}

async function toggleNav($: EngineInterface, strip: Strip, actions: StripActions) {
  const { nav } = strip
  const box = await $.prompt.read()
  if (nav.isActive) {
    stopNav($, nav)
    if (isFiller(box.text)) await $.prompt.fill({ text: '', mode: 'replace' })
    return
  }
  if (box.text !== '') return

  nav.isActive = true
  nav.selected = nav.items[0] ?? ''
  $.ui.invalidate('ui.render')
  await $.prompt.fill({ text: boxFiller(nav, actions), mode: 'replace', cursor: 1, decorations: fillerMarks })
}

export function submitNav($: EngineInterface, strip: Strip, e: PromptSubmitInput, actions: StripActions) {
  const { nav } = strip
  if (!nav.isActive || !isFiller(e.text)) return false

  actions.open(nav.selected)
  nav.pending = nav.selected
  stopNav($, nav)
  return true
}

export async function editNav($: EngineInterface, strip: Strip, e: PromptEditInput, next: Next<'prompt.edit'>, actions: StripActions): Promise<PromptEditResult> {
  const { nav } = strip
  if (!nav.isActive) return next(e)

  const action = navAction(e)
  if (action === 'previous' || action === 'next') {
    nav.selected = moveSelection(nav.items, nav.selected, action === 'next' ? 1 : -1)
    $.ui.invalidate('ui.render')
  }
  if (action === 'previous' || action === 'next' || (action === 'press' && !nav.pressable.includes(nav.selected))) {
    return { text: boxFiller(nav, actions), cursor: 1, decorations: fillerMarks }
  }
  if (action === 'press') actions.pressInBox(nav.selected)
  stopNav($, nav)
  const wasFiller = isFiller(e.text)
  if (action === 'pass') return next(wasFiller ? { ...e, text: '', cursor: 0, start: 0, end: 0 } : e)

  return wasFiller ? { text: '', cursor: 0 } : { text: e.text, cursor: e.cursor }
}

export async function changeNav($: EngineInterface, strip: Strip, e: PromptChangeInput, actions: StripActions) {
  const { nav } = strip
  if (nav.pending && e.origin.kind === 'engine' && isFiller(e.text)) {
    const id = nav.pending
    nav.pending = null
    await $.prompt.fill({ text: '', mode: 'replace' })
    actions.open(id)
  } else if (nav.isActive && e.origin.kind !== 'plugin' && e.origin.kind !== 'clear' && !isFiller(e.text)) stopNav($, nav)
}

export function renderStrip($: EngineInterface, strip: Strip, { Box, Button, Text }: Ui, blocks: readonly Block[], modes: RenderElement | null, actions: StripActions) {
  const { nav } = strip
  const sep = <Text dimColor> · </Text>

  keepSelection(nav, blocks.map(block => block.id), blocks.filter(block => block.isPressable).map(block => block.id))
  const isSelected = (id: string) => nav.isActive && nav.selected === id

  return (
    <Box flexWrap="wrap">
      {blocks.map((block, at) => {
        const isHot = isSelected(block.id)
        const face = (
          <Text inverse={isHot} hover={{ scope: block.id, inverse: true }}>
            {block.label}
          </Text>
        )

        return (
          <Box key={`slot-${block.id}`} flexShrink={0}>
            {at > 0 && (block.gap ?? sep)}
            <Box key={block.id}>
              {block.isPressable ? (
                <Button key={`press-${block.id}`} plain action={block.action} onPress={() => actions.press(block.id)}>
                  {face}
                </Button>
              ) : (
                face
              )}
              {block.overlay && (
                <Box position="absolute" top={0} left={0} {...(isHot ? { display: 'flex' } : { display: 'none', hover: { display: 'flex' } })}>
                  {block.isPressable ? (
                    <Button key={`press-over-${block.id}`} plain onPress={() => actions.press(block.id)}>
                      {block.overlay}
                    </Button>
                  ) : (
                    block.overlay
                  )}
                </Box>
              )}
            </Box>
          </Box>
        )
      })}
      {modes && (
        <Box flexShrink={0}>
          {sep}
          {modes}
        </Box>
      )}
      <Button key="nav" plain action={stripConfig.navAction} onPress={() => void toggleNav($, strip, actions)}>
        <Text>{'​'}</Text>
      </Button>
    </Box>
  )
}

export const registerStrip = (on: On, isHintShown: (key: HintKey) => boolean) => {
  on('ui.render', { component: 'PromptHint' }, (_, e, next) => next({ ...e, props: { ...e.props, hint: cleanHint(e.props.hint, isHintShown) } }))
}
