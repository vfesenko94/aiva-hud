import { timeUnits } from './config'

const pad = (n: number) => `${n}`.padStart(2, '0')

export const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export const clock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / timeUnits.second))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)

  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`
}

export const duration = (ms: number) => {
  const m = Math.max(0, Math.round(ms / timeUnits.minute))

  if (m >= 1440) return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`
}

export const timeOfDay = (ms: number) => {
  const d = new Date(ms)

  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim()

export const center = (text: string, room: number) => `${' '.repeat(Math.max(0, Math.floor((room - text.length) / 2)))}${text}`.padEnd(room)

export const cut = (text: string, room: number) => (room <= 1 ? '' : text.length > room ? `${text.slice(0, room - 1)}…` : text)

const wide = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{1F300}-\u{1FAFF}\u{20000}-\u{3FFFD}]/u

const cellsOf = (text: string) => [...text].reduce((cells, sign) => cells + (wide.test(sign) ? 2 : 1), 0)

const splitAt = (text: string, room: number) => {
  let cells = 0
  let at = 0
  for (const sign of text) {
    const size = wide.test(sign) ? 2 : 1
    if (at > 0 && cells + size > room) break
    cells += size
    at += sign.length
  }

  return [text.slice(0, at), text.slice(at)] as const
}

const wrapLine = (source: string, room: number) => {
  const lines: string[] = []
  let line = ''
  let used = 0
  const flush = () => {
    lines.push(line.trimEnd())
    line = ''
    used = 0
  }
  for (const token of source.split(/( +)/)) {
    const size = cellsOf(token)
    if (used + size <= room) {
      line += token
      used += size
      continue
    }
    if (used > 0) flush()
    if (token.trim() === '') continue
    let rest = token
    while (cellsOf(rest) > room) {
      const [head, tail] = splitAt(rest, room)
      lines.push(head)
      rest = tail
    }
    line = rest
    used = cellsOf(rest)
  }
  if (line.trim() !== '' || lines.length === 0) flush()

  return lines
}

export const wrapText = (text: string, room: number) =>
  text.replace(/\r/g, '').replace(/\t/g, '  ').split('\n').flatMap(source => wrapLine(source, Math.max(1, room)))

const hintSeparator = ' · '

export const hintParts = (hint: string) => hint.split(hintSeparator).map(part => part.trim())

export const joinHint = (parts: readonly string[]) => parts.filter(Boolean).join(hintSeparator)
