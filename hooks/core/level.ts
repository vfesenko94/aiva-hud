import type { Color } from 'claude-code'

import type { HudConfig } from './config'

export const levelColor = (percent: number, thresholds: HudConfig['thresholds']): Color =>
  percent >= thresholds.percent.error ? 'error' : percent >= thresholds.percent.warning ? 'warning' : 'success'
