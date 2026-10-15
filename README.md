# intrusion-log

A hacker-style live pane for Claude Code that streams every tool call as fake
terminal output, plus a `/debrief` report card for the session.

```
>> node gibson-01 :: 42 ops :: 1 breach fail
────────────────────────────────────────────
[0x3F2A] EXEC Bash ✓ 120ms :: git status
[0x9C01] READ Read ✓ 4ms :: src/app.py
[0x51BE] PTCH Edit ✗ 9ms :: src/app.py
```

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install intrusion-log --marketplace adamsrnmsu/claude-intrusion-log
```

Answer `y` to add the marketplace, then pick a scope.

From a shell:

```
claude plugin install intrusion-log --marketplace adamsrnmsu/claude-intrusion-log
```

## Use

- `/intrusion-log` opens the pane. It also opens by itself when the terminal is
  at least 144 columns wide. Green ✓ is a success, red ✗ a failure, ⊘ a blocked call.
- `/debrief` prints a report card: uptime, tool calls run, failures and blocks,
  top tools, files edited and context fill.

## Limitations

- Needs a Claude Code build with mods (plugin hooks modules), which are early access.
- The pane keeps the last 200 calls; `/debrief` counts the whole session, from when the mod loaded.
- The hex addresses are decoration, derived from each call's id.
