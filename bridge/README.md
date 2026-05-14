# Bridge

Local Node.js server that receives [Claude Code hook](https://docs.claude.com/en/docs/claude-code/hooks)
callbacks and rebroadcasts them over WebSocket to the Chrome extension.

## Run

```bash
cd bridge
npm install
npm start
```

Default port: `9876`. Override with `PIXEL_AGENT_PORT=...` or `PIXEL_AGENT_HOST=...`.

Open `http://127.0.0.1:9876/` to verify it's running.

## Endpoints

| Method | Path     | Purpose                                      |
| ------ | -------- | -------------------------------------------- |
| POST   | `/hook`  | Receives a raw Claude Code hook JSON payload |
| POST   | `/event` | Receives a pre-normalized event (for testing)|
| GET    | `/health`| JSON health check                            |
| WS     | `/ws`    | Stream normalized events to clients          |

## Test it without Claude Code

```bash
curl -X POST http://127.0.0.1:9876/event \
  -H 'Content-Type: application/json' \
  -d '{"type":"pre_tool_use","sessionId":"test","tool_name":"Bash","tool_input":{"command":"ls -la"}}'
```

The extension dashboard should show the event immediately.
