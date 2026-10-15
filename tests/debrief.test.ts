import { expect, mock, test } from 'claude-code/testing'

test('/debrief totals the session: ops, failures, blocks, files, context', async ($, on) => {
  const clock = mock.clock(on)
  await clock.set(3_900_000)
  on('session.usage', () => ({
    value: { startedAt: 0, rateLimits: [], context: { tokens: 84200, window: 200000, percent: 42.1 }, cost: { usd: 3.214 } },
  }))
  on('tool.call', { tool: 'Bash' }, (_$, e) =>
    e.command === 'false'
      ? { result: { stdout: '', stderr: 'x', interrupted: false }, text: 'x', isError: true }
      : { result: { stdout: '', stderr: '', interrupted: false }, text: 'ok' })
  on('tool.call', { tool: 'Edit' }, () => ({ result: 'edited', text: 'ok' }) as never)
  on('tool.call', { tool: 'Read' }, () => ({ deny: 'no' }))

  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await $.tool.call({ tool: 'Bash', command: 'false' })
  await $.tool.call({ tool: 'Edit', file_path: '/r/src/a.py', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Edit', file_path: '/r/src/a.py', old_string: 'b', new_string: 'c' })
  await $.tool.call({ tool: 'Read', file_path: '/r/.env' })

  const { text } = await $.command.run({ command: 'debrief' } as never)
  expect(text).toContain('MISSION DEBRIEF')
  expect(text).toMatch(/uptime \.+ 1h 5m/)
  expect(text).toMatch(/ops run \.+ 5 {2}\(1 failed, 1 blocked\)/)
  expect(text).toMatch(/top tools \.+ Bash 2 · Edit 2 · Read 1/)
  expect(text).toMatch(/files hit \.+ 1/)
  expect(text).toMatch(/context \.+ 84\.2k \/ 200\.0k \(42%\)/)
  expect(text).not.toMatch(/cost|\$/)
  expect(text).toContain('>> files: a.py')
  expect(text).toContain('1 FAILED, 1 BLOCKED')
})
