#!/usr/bin/env bash
# Claude Code hook → Pixel Agent bridge.
#
# Reads the hook payload from stdin (JSON) and POSTs it to the local bridge.
# Runs in the background and exits immediately so Claude Code is never blocked.
#
# Override the URL with PIXEL_AGENT_BRIDGE_URL if you changed the port/host.

URL="${PIXEL_AGENT_BRIDGE_URL:-http://127.0.0.1:9876/hook}"

PAYLOAD="$(cat)"

# Fire and forget. Short timeout so a missing bridge never wedges Claude Code.
(curl --max-time 1 -s -X POST \
       -H "Content-Type: application/json" \
       --data-binary "$PAYLOAD" \
       "$URL" >/dev/null 2>&1 &) </dev/null

exit 0
