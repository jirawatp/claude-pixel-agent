# Claude Code hook → Pixel Agent bridge (Windows PowerShell).
#
# Reads the hook payload from stdin (JSON) and POSTs it to the local bridge.
# Fire-and-forget so Claude Code is never blocked.

$Url = if ($env:PIXEL_AGENT_BRIDGE_URL) { $env:PIXEL_AGENT_BRIDGE_URL } else { "http://127.0.0.1:9876/hook" }

$payload = [Console]::In.ReadToEnd()

Start-Job -ScriptBlock {
  param($Url, $payload)
  try {
    Invoke-WebRequest -Uri $Url -Method POST -Body $payload -ContentType "application/json" -TimeoutSec 1 | Out-Null
  } catch { }
} -ArgumentList $Url, $payload | Out-Null

exit 0
