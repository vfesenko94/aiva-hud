import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

const SETTINGS = {
  plugin: 'aiva-hud',
  component: 'Pane',
  requestId: 'settings',
  surface: 'terminal',
  props: {
    title: 'Settings',
    isFocused: true,
    bodyColumns: 80,
    placement: 'inline',
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const CATEGORY = 'settings-section-hud'

const PRESSED = 'settings-module'

const engine = (on: On, calls: string[]) => {
  on('ui.panes', () => (calls.push('ui.panes'), { value: [{ id: 'settings', title: 'Settings', isShown: true, isFocused: false, isPlaced: true, plugin: 'aiva-hud' }] }))
  on('ui.open', (_, e) => (calls.push(`ui.open focus=${e.focus === true}`), { value: { isPlaced: true } }))
  on('ui.focus', (_, e) => (calls.push(`ui.focus ${e.element ?? ''}`), {}))
  on('ui.close', () => (calls.push('ui.close'), { value: undefined }))
  on('store.set', () => (calls.push('store.set'), { value: undefined }))
}

for (const isFocused of [false, true]) {
  test(`a press in ${isFocused ? 'a focused pane leaves focus alone' : 'an inactive pane asks for the keyboard before any other engine call'}`, async ($, on) => {
    const calls: string[] = []
    engine(on, calls)
    const ui = await $.ui.mount(SETTINGS)
    await ui.press({ key: CATEGORY })
    await ui.redraw({ ...SETTINGS.props, isFocused })
    calls.length = 0
    await ui.press({ key: PRESSED })
    if (isFocused) expect(calls.filter(call => call.startsWith('ui.open'))).toEqual([])
    else expect(calls[0]).toBe('ui.open focus=true')
    await ui.unmount()
  })
}
