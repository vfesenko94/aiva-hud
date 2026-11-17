import type { Color } from 'claude-code'

export type Theme = 'light' | 'dark'

type Accent = 'compact' | 'rewind' | 'thinking' | 'read' | 'write' | 'shell'

type Tone = { chroma: number; hue: number }

const mutedColors = {
  slate: '#a7b0c0',
  stone: '#857f78',
  cyan: '#5fb4c8',
  green: '#74bf8a',
  lavender: '#a6aeea',
  clay: '#d6937a',
  sand: '#dcc183',
}

const softenedOnDark: Readonly<Record<string, string>> = {
  promptBorder: mutedColors.slate,
  inactive: mutedColors.stone,
  cyan_FOR_SUBAGENTS_ONLY: mutedColors.cyan,
  green_FOR_SUBAGENTS_ONLY: mutedColors.green,
  permission: mutedColors.lavender,
  claude: mutedColors.clay,
  warning: mutedColors.sand,
}

const turnGradient = { hue: 295, chroma: 0.16, lightness: { dark: { from: 0.9, to: 0.56 }, light: { from: 0.84, to: 0.42 } } }

const earlierTurn = { chroma: 0.04, lightness: { dark: 0.5, light: 0.72 } }

const accentLightness = { dark: 0.76, light: 0.55 }

const accentTones: Readonly<Record<Accent, Tone>> = {
  compact: { chroma: 0.09, hue: 195 },
  rewind: { chroma: 0.09, hue: 350 },
  thinking: { chroma: 0.12, hue: 320 },
  read: { chroma: 0.1, hue: 245 },
  write: { chroma: 0.1, hue: 150 },
  shell: { chroma: 0.1, hue: 30 },
}

export const themeOf = (value: unknown): Theme => (typeof value === 'string' && value.startsWith('light') ? 'light' : 'dark')

const oklch = (lightness: number, chroma: number, hue: number): string => {
  const angle = (hue * Math.PI) / 180
  const a = chroma * Math.cos(angle)
  const b = chroma * Math.sin(angle)
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  if (chroma > 0.001 && linear.some(x => x < 0 || x > 1)) return oklch(lightness, chroma * 0.9, hue)

  const gamma = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055)

  return `#${linear.map(x => Math.round(Math.min(1, Math.max(0, gamma(x))) * 255).toString(16).padStart(2, '0')).join('')}`
}

export const softColor = (color: string, theme: Theme): Color =>
  theme === 'light' ? color : (softenedOnDark[color] ?? color)

export const accentColor = (accent: Accent, theme: Theme) =>
  oklch(accentLightness[theme], accentTones[accent].chroma, accentTones[accent].hue)

export const earlierColor = (theme: Theme) =>
  oklch(earlierTurn.lightness[theme], earlierTurn.chroma, turnGradient.hue)

export const turnScale = (totals: number[], theme: Theme) => {
  const sizes = [...new Set(totals)].sort((a, b) => a - b)
  const { from, to } = turnGradient.lightness[theme]

  return (total: number) => {
    const place = sizes.length > 1 ? sizes.indexOf(total) / (sizes.length - 1) : 0.5

    return oklch(from + (to - from) * place, turnGradient.chroma, turnGradient.hue)
  }
}
