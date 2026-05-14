// Event shapes coming from Claude Code hooks via the local bridge.
//
// All events share:
//   { type, sessionId, ts, cwd?, agent_name? }
//
// Recognized types:
//   - session_start  : a Claude session began (UserPromptSubmit hook)
//   - user_prompt    : the user asked something
//   - thinking       : assistant is thinking (synthetic — bridge may emit)
//   - pre_tool_use   : about to call a tool { tool_name, tool_input }
//   - post_tool_use  : tool finished { tool_name, success }
//   - assistant_msg  : a message from Claude { text }
//   - stop           : the agent stopped (Stop hook)
//   - session_end    : final cleanup

export const EVENT_TYPES = {
  // Session lifecycle
  SESSION_START:   "session_start",
  SESSION_END:     "session_end",
  USER_PROMPT:     "user_prompt",

  // Tool calls
  PRE_TOOL_USE:    "pre_tool_use",
  POST_TOOL_USE:   "post_tool_use",

  // Agent narration
  THINKING:        "thinking",
  ASSISTANT_MSG:   "assistant_msg",

  // Stop
  STOP:            "stop",

  // Subagent / Task lifecycle
  SUBAGENT_START:  "subagent_start",
  SUBAGENT_STOP:   "subagent_stop",
  TASK_CREATED:    "task_created",
  TASK_COMPLETED:  "task_completed",

  // Permissions
  PERMISSION_REQUEST: "permission_request",
  PERMISSION_DENIED:  "permission_denied",

  // Context compaction
  PRE_COMPACT:     "pre_compact",
  POST_COMPACT:    "post_compact"
};

// Map tool names to short human-readable activity verbs.
const TOOL_VERBS = {
  Read:        "Reading",
  Write:       "Writing",
  Edit:        "Editing",
  Bash:        "Running shell",
  Grep:        "Searching",
  Glob:        "Globbing",
  WebFetch:    "Browsing",
  WebSearch:   "Googling",
  TodoWrite:   "Planning",
  Task:        "Delegating",
  NotebookEdit:"Editing notebook"
};

export function verbForTool(toolName) {
  return TOOL_VERBS[toolName] ?? `Using ${toolName}`;
}

/**
 * Turn an event into a short bubble line for the character to "say".
 * Returns { text, kind: "speech"|"thought", activity }.
 */
export function eventToBubble(ev) {
  switch (ev.type) {
    case EVENT_TYPES.SESSION_START:
      return { text: "Hi! Booting up…", kind: "speech", activity: "Starting" };
    case EVENT_TYPES.USER_PROMPT: {
      const t = (ev.prompt ?? "").trim();
      return {
        text: t ? `User: "${truncate(t, 60)}"` : "New request from user",
        kind: "thought",
        activity: "Listening"
      };
    }
    case EVENT_TYPES.THINKING:
      return { text: truncate(ev.text ?? "Thinking…", 80), kind: "thought", activity: "Thinking" };
    case EVENT_TYPES.PRE_TOOL_USE: {
      const verb = verbForTool(ev.tool_name);
      const hint = describeToolInput(ev.tool_name, ev.tool_input);
      return { text: hint ? `${verb}: ${hint}` : `${verb}…`, kind: "speech", activity: verb };
    }
    case EVENT_TYPES.POST_TOOL_USE:
      return { text: `${verbForTool(ev.tool_name)} ✓`, kind: "speech", activity: "Done" };
    case EVENT_TYPES.ASSISTANT_MSG:
      return { text: truncate(ev.text ?? "", 120), kind: "speech", activity: "Replying" };
    case EVENT_TYPES.STOP:
      return ev.failure
        ? { text: `Stopped with error: ${truncate(ev.error ?? "", 60)}`, kind: "speech", activity: "Error" }
        : { text: "All done!", kind: "speech", activity: "Idle", face: "happy" };

    case EVENT_TYPES.SUBAGENT_START:
      return {
        text: `Hi! I'm ${truncate(ev.agent_name ?? ev.subagent_type ?? "a subagent", 40)}.`,
        kind: "speech", activity: "Booting"
      };
    case EVENT_TYPES.SUBAGENT_STOP:
      return ev.success
        ? { text: "Subagent done!", kind: "speech", activity: "Done", face: "happy" }
        : { text: `Subagent failed: ${truncate(ev.error ?? "", 40)}`, kind: "speech", activity: "Error" };

    case EVENT_TYPES.TASK_CREATED:
      return { text: `Delegating: ${truncate(ev.description ?? ev.subagent_type ?? "", 50)}`, kind: "speech", activity: "Delegating" };
    case EVENT_TYPES.TASK_COMPLETED:
      return { text: ev.success ? "Task done ✓" : "Task failed ✗", kind: "speech", activity: ev.success ? "Done" : "Error" };

    case EVENT_TYPES.PERMISSION_REQUEST:
      return { text: `May I run ${ev.tool_name ?? "this tool"}?`, kind: "thought", activity: "Waiting" };
    case EVENT_TYPES.PERMISSION_DENIED:
      return { text: `Permission denied: ${ev.tool_name ?? ""}`, kind: "speech", activity: "Blocked" };

    case EVENT_TYPES.PRE_COMPACT:
      return { text: "Compacting context…", kind: "thought", activity: "Compacting" };
    case EVENT_TYPES.POST_COMPACT:
      return { text: `Compacted ✓`, kind: "thought", activity: "Compacted" };

    case EVENT_TYPES.SESSION_END:
      return null;
    default:
      return null;
  }
}

function describeToolInput(tool, input) {
  if (!input) return "";
  switch (tool) {
    case "Read":
    case "Write":
    case "Edit":
      return shortPath(input.file_path);
    case "Bash":
      return truncate(input.command ?? "", 50);
    case "Grep":
      return `"${truncate(input.pattern ?? "", 30)}"`;
    case "Glob":
      return input.pattern ?? "";
    case "WebFetch":
      return truncate(input.url ?? "", 50);
    case "WebSearch":
      return truncate(input.query ?? "", 50);
    case "Task":
      return truncate(input.description ?? input.subagent_type ?? "", 40);
    default:
      return "";
  }
}

function shortPath(p) {
  if (!p) return "";
  const parts = String(p).split("/").filter(Boolean);
  if (parts.length <= 2) return p;
  return ".../" + parts.slice(-2).join("/");
}

function truncate(s, n) {
  s = String(s);
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
