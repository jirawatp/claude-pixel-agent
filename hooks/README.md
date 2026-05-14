# Hooks

Claude Code hooks fire on every tool call, prompt, and stop event. These scripts
forward each hook payload to the local Pixel Agent bridge.

## Install (macOS / Linux)

1. Make the script executable:
   ```bash
   chmod +x hooks/notify.sh
   ```
2. Open (or create) `~/.claude/settings.json` and merge in the `hooks` block
   from [example-settings.json](./example-settings.json).
3. Replace `/ABSOLUTE/PATH/TO/claude-pixel-agent` with where you cloned this
   repo.
4. Start the bridge:
   ```bash
   cd bridge && npm install && npm start
   ```
5. Open the extension dashboard and start any Claude Code session.

## Install (Windows)

Use `notify.ps1` instead. Example command:

```
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\path\to\claude-pixel-agent\hooks\notify.ps1"
```

## Per-project vs global

- `~/.claude/settings.json` — applies to every Claude Code session.
- `<project>/.claude/settings.json` — applies only to that project.
- `<project>/.claude/settings.local.json` — your personal overrides (gitignored).

## Verify hooks are firing

```bash
curl http://127.0.0.1:9876/health
```

Then run any Claude Code command. Watch the bridge logs — you should see a line
per hook (`→ pre_tool_use ...`).

## Troubleshooting

| Symptom                                | Fix                                                     |
| -------------------------------------- | ------------------------------------------------------- |
| Nothing happens in the office          | Confirm the bridge is running (`/health` returns ok)    |
| Bridge logs nothing                    | Check the absolute path in `settings.json` is correct   |
| Extension says "Disconnected"          | Check the WebSocket URL in the extension matches the bridge port |
| Hook script blocks Claude Code         | The script already forks `curl` with a 1s timeout; if you see hangs, edit `notify.sh` to log to a file and inspect stderr |
