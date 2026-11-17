export type Ttl = '5m' | '1h'

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max' | number

export type LastResponse = {
  at: number
  effort?: Effort | null
  usage: {
    model: string
    input_tokens: number
    output_tokens: number
    cache_read_input_tokens: number
    cache_creation_input_tokens: number
  }
}

export type StepTool = {
  id: string
  name: string
  brief: string
  about?: string
  subject?: string
  wrote?: string
  uses?: string
  callTokens?: number
  resultTokens: number | null
  isError: boolean
  outcome?: string
  repeatOf?: number
  image?: number
  rewrite?: true
}

export type Step = {
  turnId: string
  index: number
  at: number
  context: number
  output: number
  answerTokens?: number
  cached?: number
  written?: number
  tools: StepTool[]
  isFromStart?: boolean
}

export type FindingCall = { name: string; label: string; tokens: number }

export type Findings = { thinking: number; repeats: FindingCall[]; rewrites: FindingCall[]; large: FindingCall[]; images: FindingCall[] }

export type TurnHead = {
  id: string
  at: number
  prompt: string | null
  source?: string
  promptTokens: number
  context: number
  end: number
  pending: number
  outside: number
  listed: number
  missed?: number
  byTool?: Record<string, number>
  used?: string[]
  findings?: Findings
  messages?: number
  rewoundAt?: number
}

export type Compact = {
  at: number
  tokensBefore: number | null
  tokensAfter: number | null
  summaryTokens: number
}

declare module 'claude-code' {
  interface PluginState {
    'aiva-hud': {
      last: LastResponse | null
      learnedTtl: Ttl | null
      effort: Effort | null
      turns: TurnHead[]
      compacts: Compact[]
    }
  }
}
