import type { Color } from 'claude-code'

import type { Ttl } from '../../../types'
import { keyConfig, timeUnits } from '../../core'

export const cacheConfig = {
  ttlMs: { '5m': 5 * timeUnits.minute, '1h': timeUnits.hour } satisfies Record<Ttl, number>,
  learningGraceMs: 30_000,
  expiryWarningMs: timeUnits.minute,
  warm: {
    ttl: '1h' as Ttl,
    leadMs: timeUnits.minute,
    maxPings: 18,
    minReadShare: 0.8,
    action: keyConfig.keys.warm.action,
    gap: '   ',
    label: 'keep warm',
    chordGap: '  ',
    color: 'error' satisfies Color as Color,
    prompt: 'Prompt cache keep-alive ping, not a task. Do not use tools or continue any work. Reply with exactly: ok',
  },
}
