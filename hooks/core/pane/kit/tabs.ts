import type { RenderElement } from 'claude-code'

import { cut } from '../../format'
import type { Ui } from '../../index'
import { pressable } from './pressable'

type Tab = { key: string; label: string; onPress?: () => void }

type Tabs = { key: string; tabs: readonly Tab[]; active: string; width: number; selected?: string }

const divider = ' │ '

const laidOut = ({ tabs: all, width }: Pick<Tabs, 'tabs' | 'width'>) => {
  const placed: { tab: Tab; lead: string; label: string }[] = []
  let used = 0
  for (const tab of all) {
    const lead = placed.length > 0 ? divider : ''
    const label = cut(tab.label, width - used - lead.length)
    if (!label) break
    used += lead.length + label.length
    placed.push({ tab, lead, label })
  }
  return placed
}

export const tabsShown = (props: Pick<Tabs, 'tabs' | 'width'>) => laidOut(props).map(({ tab }) => tab.key)

export const tabs = (ui: Ui, { key, tabs: all, active, width, selected }: Tabs): RenderElement => {
  const { Box, Text } = ui
  const children = laidOut({ tabs: all, width }).flatMap(({ tab, lead, label }) => {
    const isActive = tab.key === active
    const face = isActive ? Text({ bold: true, children: label }) : label
    return [
      ...(lead ? [Text({ dimColor: true, children: lead })] : []),
      tab.onPress
        ? pressable(ui, { key: tab.key, selected: selected === tab.key, width: label.length, dim: !isActive, onPress: tab.onPress }, face)
        : Text({ dimColor: !isActive, children: face }),
    ]
  })
  return Box({ key, flexDirection: 'row', children })
}
