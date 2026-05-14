// "At work" indicator chooser. Returns the HTML for a small animated span
// to put next to the verb in an agent row. Shared by dashboard + sidepanel.

const TOOL_ANIM = {
  Read: "typing",  Grep: "typing", Glob: "typing",
  WebFetch: "typing", WebSearch: "typing",
  Task: "typing",
  Bash: "cursor", Edit: "cursor", MultiEdit: "cursor", Write: "cursor",
  NotebookEdit: "cursor"
};

/**
 * @param {object} a  character entity from canvas-renderer
 * @param {string} a.state          "idle" | "walking" | "thinking" | "speaking" | "stopped"
 * @param {string|null} a.currentTool
 * @param {number} a.endedAt
 * @returns {string} HTML for a `.work-ind` span
 */
export function workIndicator(a) {
  if (a.endedAt) return `<span class="work-ind done">●</span>`;
  if (a.state === "thinking") {
    return `<span class="work-ind running"><span class="thinking-spin"></span></span>`;
  }
  if (a.state === "walking") {
    return `<span class="work-ind running"><span class="walking"><i></i><i></i></span></span>`;
  }
  const tool = a.currentTool;
  if (!tool) {
    // Plain idle (no tool, not walking, not stopped)
    return `<span class="work-ind"><span class="idle-z">Z z</span></span>`;
  }
  const anim = TOOL_ANIM[tool] ?? "typing";
  switch (anim) {
    case "cursor":   return `<span class="work-ind running"><span class="cursor-blink">⌨</span></span>`;
    case "typing":
    default:         return `<span class="work-ind running"><span class="typing"><i></i><i></i><i></i></span></span>`;
  }
}

/** Classify a tool/event into the ticker chip color bucket. */
export function tickerKind(eventType, toolName) {
  if (eventType === "post_tool_use") return "post";
  if (eventType === "assistant_msg") return "say";
  if (eventType === "thinking")      return "think";
  if (eventType === "stop")          return "stop";
  if (toolName === "Task")           return "task";
  return "pre";
}

/** Short kind label that goes between the agent name and the target. */
export function kindLabel(t) {
  return ({
    pre:   "→",
    post:  "✓",
    say:   "‘ ’",
    think: "thinks",
    task:  "delegated",
    walk:  "walks",
    stop:  "stop"
  })[t] ?? "";
}
