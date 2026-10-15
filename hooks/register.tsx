import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Op, Stats } from '../types'

const PANE = 'intrusion-log'
const TITLE = '>_ INTRUSION LOG'
const ops = atom({ plugin: 'intrusion-log', key: 'ops' } as const, [])
// Whole-session totals for /debrief; `ops` only keeps the last 200 for the pane
const EMPTY_STATS: Stats = { total: 0, fails: 0, denied: 0, byTool: {}, files: [] }
const stats = atom({ plugin: 'intrusion-log', key: 'stats' } as const, EMPTY_STATS)
const WRITERS = new Set(['Edit', 'Write', 'NotebookEdit'])

const fmtTok = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))
const fmtAge = (ms: number) => {
  const m = Math.floor(ms / 60000)
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`
}

export const debrief = (s: Stats, ageMs: number, ctx: { tokens?: number; window: number; percent?: number }) => {
  const top = Object.entries(s.byTool).sort((a, b) => b[1] - a[1]).slice(0, 4)
  const row = (k: string, v: string) => `  ${k.padEnd(14, '.')} ${v}`
  const files = s.files.length > 0 ? s.files.map(f => f.split('/').pop()).slice(0, 8).join(', ') + (s.files.length > 8 ? ', ...' : '') : 'none'
  const verdict = s.fails + s.denied === 0 ? 'CLEAN RUN. NO TRACES.' : `${s.fails} FAILED, ${s.denied} BLOCKED. CHECK THE LOGS.`
  return [
    '╔═══════════ MISSION DEBRIEF ═══════════╗',
    row('uptime ', fmtAge(ageMs)),
    row('ops run ', `${s.total}  (${s.fails} failed, ${s.denied} blocked)`),
    row('top tools ', top.length > 0 ? top.map(([t, n]) => `${t} ${n}`).join(' · ') : 'none'),
    row('files hit ', String(s.files.length)),
    row('context ', `${fmtTok(ctx.tokens ?? 0)} / ${fmtTok(ctx.window)}${ctx.percent === undefined ? '' : ` (${Math.round(ctx.percent)}%)`}`),
    '╚═══════════════════════════════════════╝',
    `  >> files: ${files}`,
    `  >> status: ${verdict}`,
  ].join('\n')
}

const VERB: Record<string, string> = {
  Bash: 'EXEC', Read: 'READ', Write: 'DROP', Edit: 'PTCH', Grep: 'SCAN',
  Glob: 'ENUM', WebFetch: 'PULL', WebSearch: 'RECN', Agent: 'SPWN', Skill: 'LOAD',
}

// Stable fake memory address per call, so redraws don't reshuffle it
const addrOf = (id: string) => {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return '0x' + (h & 0xffff).toString(16).toUpperCase().padStart(4, '0')
}

const targetOf = (e: Record<string, unknown>) =>
  String(e.command ?? e.file_path ?? e.pattern ?? e.url ?? e.query ?? e.description ?? e.skill ?? '')
    .replace(/\s+/g, ' ')

const MARK = {
  run: { glyph: '▶', color: '#ffd000' },
  ok: { glyph: '✓', color: '#00ff41' },
  err: { glyph: '✗', color: '#ff2a2a' },
  deny: { glyph: '⊘', color: '#ff2a2a' },
} as const

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'intrusion-log',
      description: 'Open the hacker-style live tool-call pane',
    })
    await $.command.register({ name: 'debrief', description: 'Mission debrief: this session in one report card' })
    void $.ui.open({ id: PANE, title: TITLE })

    return next(e)
  })

  on('command.run', { command: 'intrusion-log' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })

    return { text: 'Intrusion log online.' }
  })

  on('command.run', { command: 'debrief' }, async $ => {
    const usage = await $.session.usage()
    const s = { ...EMPTY_STATS, ...(await read($, stats)) }
    return { text: debrief(s, (await $.clock.now()) - usage.startedAt, usage.context) }
  })

  on('tool.call', async ($, e, next) => {
    const startedAt = await $.clock.now()
    const op: Op = {
      id: e.tool_use_id,
      addr: addrOf(e.tool_use_id),
      tool: e.tool,
      target: targetOf(e as unknown as Record<string, unknown>),
      state: 'run',
      startedAt,
    }
    await update($, ops, list => [...list, op].slice(-200))
    const ran = await next(e)
    const ms = (await $.clock.now()) - startedAt
    const state: Op['state'] =
      ran.deny !== undefined ? 'deny' : ran.isError === true ? 'err' : 'ok'
    await update($, ops, list => list.map(one => (one.id === op.id ? { ...one, state, ms } : one)))
    const input = e as unknown as Record<string, unknown>
    const file = WRITERS.has(e.tool) && state === 'ok' ? String(input.file_path ?? input.notebook_path ?? '') : ''
    await update($, stats, prev => {
      const s = { ...EMPTY_STATS, ...prev }
      return {
        total: s.total + 1,
        fails: s.fails + (state === 'err' ? 1 : 0),
        denied: s.denied + (state === 'deny' ? 1 : 0),
        byTool: { ...s.byTool, [e.tool]: (s.byTool[e.tool] ?? 0) + 1 },
        files: file && !s.files.includes(file) ? [...s.files, file] : s.files,
      }
    })

    return ran
  }).catch(($, e, next) => next(e)) // a logging failure must never block the tool

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const list = await read($, ops)
    const room = Math.max(1, (e.viewport?.rows ?? 24) - 5)
    const fails = list.filter(op => op.state === 'err' || op.state === 'deny').length

    return (
      <Box flexDirection="column">
        <Text color="#00ff41" bold wrap="truncate">
          {`>> node gibson-01 :: ${list.length} ops :: `}
          <Text color={fails > 0 ? '#ff2a2a' : '#00ff41'}>{`${fails} breach fail`}</Text>
        </Text>
        <Text color="#00ff41" dimColor wrap="truncate">{'─'.repeat(60)}</Text>
        {list.length === 0 && <Text color="#00ff41" dimColor>awaiting uplink...</Text>}
        {list.slice(-room).map(op => (
          <Text wrap="truncate">
            <Text color="#00ff41" dimColor>{`[${op.addr}] `}</Text>
            <Text color="#00ffff" bold>{(VERB[op.tool] ?? op.tool.slice(0, 4).toUpperCase()).padEnd(4)}</Text>
            <Text color="#00ff41">{` ${op.tool} `}</Text>
            <Text color={MARK[op.state].color}>{`${MARK[op.state].glyph} `}</Text>
            <Text color="#00ff41" dimColor>{op.ms === undefined ? '' : `${op.ms}ms `}</Text>
            <Text color="#00ff41" dimColor>{`:: ${op.target}`}</Text>
          </Text>
        ))}
      </Box>
    )
  })
}
