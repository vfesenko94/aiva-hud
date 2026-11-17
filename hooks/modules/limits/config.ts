import { keyHints, timeUnits } from '../../core'

const day = 24 * timeUnits.hour

export const limitsConfig = {
  file: 'aiva-hud-limits.json',
  readMs: 5000,
  windows: {
    fiveHour: { kind: 'five_hour', label: '5h', title: '5 hours', span: 5 * timeUnits.hour, note: 'forecast' as const },
    sevenDay: { kind: 'seven_day', label: '7d', title: '7 days', span: 7 * day, note: 'budget' as const },
  },
  missing: '—',
  shownMarks: ['[', ']'] as const,
  id: 'limits',
  title: 'Limits',
  rows: 11,
  minRows: 5,
  hint: `${keyHints.close} close`,
  gap: '  ',
  noteRows: 2,
  minBar: 4,
  minShare: 0.1,
  forecastStep: 5,
  day,
  weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  text: {
    empty: 'No limit reading yet. It comes with a reply on a Claude subscription.',
    updated: 'updated ',
    justNow: 'just now',
    ago: ' ago',
    resetsIn: 'resets in ',
    resetAt: 'reset at ',
    waiting: 'window reset, waiting for a reply',
    reached: 'limit reached',
    forecast: 'At this pace: ~',
    forecastUntil: '% by reset',
    forecastOver: 'At this pace: limit before reset',
    forecastFrom: 'forecast from ',
    left: '% left · ~',
    perDay: ' a day until reset',
  },
}
