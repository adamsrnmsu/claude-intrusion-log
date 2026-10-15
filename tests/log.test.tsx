import { expect, mock, test } from 'claude-code/testing'

test('tool calls land in the pane with verb, status and target', async ($, on) => {
  mock.clock(on)
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '', interrupted: false }, text: 'ok' }))
  on('tool.call', { tool: 'Read' }, () => ({ result: 'nope', text: 'nope', isError: true }))
  await $.tool.call({ tool: 'Bash', command: 'git status' })
  await $.tool.call({ tool: 'Read', file_path: '/etc/shadow' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'intrusion-log', surface, component: 'Pane', requestId: 'intrusion-log', props: {} as never })
    expect(await ui.find({ type: 'Text', text: /EXEC.*Bash.*✓.*git status/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /READ.*Read.*✗.*\/etc\/shadow/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /2 ops :: 1 breach fail/ })).toBeDefined()
    await ui.unmount()
  }
})
