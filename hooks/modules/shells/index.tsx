import type { On } from 'claude-code'

import type { Block, Ui } from '../../core'
import { parseShells } from './parse'

export { shellsConfig } from './config'

export type Shells = { count: number; isSelected: boolean }

export const createShells = (): Shells => ({ count: 0, isSelected: false })

export const shellsBlock = (shells: Shells, { Text }: Ui): Block | null =>
  shells.count > 0
    ? {
        id: 'shells',
        isPressable: false,
        label: (
          <Text color="suggestion" inverse={shells.isSelected}>
            {shells.count} {shells.count === 1 ? 'shell' : 'shells'}
          </Text>
        ),
      }
    : null

export const releaseShells = (shells: Shells) => {
  shells.count = 0
  shells.isSelected = false
}

export const registerShells = (on: On, shells: Shells, isOn: () => boolean) => {
  on('ui.render', { component: 'PromptHint' }, ($, e, next) => {
    if (!isOn()) return next(e)
    const parsed = parseShells(e.props.hint)
    if (parsed.shells !== shells.count || parsed.isShellSelected !== shells.isSelected) {
      shells.count = parsed.shells
      shells.isSelected = parsed.isShellSelected
      $.ui.invalidate('ui.render')
    }

    return next({ ...e, props: { ...e.props, hint: parsed.hint } })
  })
}
