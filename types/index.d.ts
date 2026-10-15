export type Op = {
  id: string
  addr: string
  tool: string
  target: string
  state: 'run' | 'ok' | 'err' | 'deny'
  startedAt: number
  ms?: number
}

export type Stats = {
  total: number
  fails: number
  denied: number
  byTool: Record<string, number>
  files: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'intrusion-log': { ops: Op[]; stats: Stats }
  }
}
