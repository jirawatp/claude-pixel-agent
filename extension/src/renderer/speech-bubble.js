// Pixel-art speech & thought bubbles.
//
// A bubble is anchored above a character. It auto-sizes to text up to a max
// width, wrapping on word boundaries. The "thought" variant is rounded with
// small floating circles below it (toward the character).

import { PALETTE } from "../../assets/palette/palette.js";

const FONT = "10px ui-monospace, Menlo, monospace";
const LINE_HEIGHT = 12;
const PAD_X = 6;
const PAD_Y = 4;
const MAX_W = 180;
const BORDER = 2;

function wrapText(ctx, text, maxWidth) {
  ctx.font = FONT;
  const words = String(text).split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    const test = current ? current + " " + word : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  // hard cap
  if (lines.length > 4) {
    lines.length = 4;
    lines[3] = lines[3].replace(/\s*$/, "") + "…";
  }
  return lines;
}

/**
 * Draw a speech or thought bubble above (x, y) pointing down at the character.
 * @param ctx canvas 2d context
 * @param x   x of character top-center in css px
 * @param y   y of character top in css px
 * @param text bubble text
 * @param kind "speech" | "thought"
 */
export function drawBubble(ctx, x, y, text, kind = "speech") {
  if (!text) return;
  ctx.save();
  ctx.font = FONT;
  ctx.textBaseline = "top";

  const lines = wrapText(ctx, text, MAX_W - PAD_X * 2);
  let textW = 0;
  for (const l of lines) textW = Math.max(textW, ctx.measureText(l).width);
  const boxW = Math.ceil(textW + PAD_X * 2);
  const boxH = Math.ceil(lines.length * LINE_HEIGHT + PAD_Y * 2);

  const boxX = Math.round(x - boxW / 2);
  const boxY = Math.round(y - boxH - 14);

  // Drop shadow
  ctx.fillStyle = PALETTE.shadow;
  ctx.fillRect(boxX + 2, boxY + 2, boxW, boxH);

  // Outer border
  ctx.fillStyle = PALETTE.bubbleBorder;
  ctx.fillRect(boxX - BORDER, boxY - BORDER, boxW + BORDER * 2, boxH + BORDER * 2);

  // Inner fill
  ctx.fillStyle = kind === "thought" ? PALETTE.thoughtBg : PALETTE.bubbleBg;
  ctx.fillRect(boxX, boxY, boxW, boxH);

  // Tail
  if (kind === "speech") {
    // Triangle pointing down
    ctx.fillStyle = PALETTE.bubbleBorder;
    ctx.beginPath();
    ctx.moveTo(boxX + boxW / 2 - 6, boxY + boxH);
    ctx.lineTo(boxX + boxW / 2 + 4, boxY + boxH);
    ctx.lineTo(boxX + boxW / 2 - 2, boxY + boxH + 8);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = PALETTE.bubbleBg;
    ctx.beginPath();
    ctx.moveTo(boxX + boxW / 2 - 4, boxY + boxH);
    ctx.lineTo(boxX + boxW / 2 + 2, boxY + boxH);
    ctx.lineTo(boxX + boxW / 2 - 1, boxY + boxH + 5);
    ctx.closePath();
    ctx.fill();
  } else {
    // Thought puffs: two small circles between bubble and character
    const cx = boxX + boxW / 2 - 4;
    ctx.fillStyle = PALETTE.bubbleBorder;
    ctx.beginPath(); ctx.arc(cx, boxY + boxH + 4, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx - 6, boxY + boxH + 9, 2.5, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = PALETTE.thoughtBg;
    ctx.beginPath(); ctx.arc(cx, boxY + boxH + 4, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx - 6, boxY + boxH + 9, 1.5, 0, Math.PI * 2); ctx.fill();
  }

  // Text
  ctx.fillStyle = PALETTE.bubbleText;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], boxX + PAD_X, boxY + PAD_Y + i * LINE_HEIGHT);
  }

  ctx.restore();
}

/**
 * Label drawn beneath a character: name on top, role badge underneath.
 *   ┌────────────────────────┐
 *   │ ● Atlas+Fae Story 2.3  │
 *   │ [ARCH] Software Arch.  │
 *   └────────────────────────┘
 *
 * @param role  null OR { label, full, color } (from state/roles.js)
 */
export function drawNameTag(ctx, x, y, name, role, statusColor) {
  ctx.save();
  ctx.font = "9px ui-monospace, Menlo, monospace";
  ctx.textBaseline = "top";

  const nameW = Math.ceil(ctx.measureText(name).width);
  const roleLabel = role?.label ?? "";
  const roleFull  = role?.full  ?? "";
  const roleText  = roleFull ? `${roleLabel} · ${roleFull}` : roleLabel;
  const roleW     = roleText ? Math.ceil(ctx.measureText(roleText).width) + 10 : 0;

  const w = Math.max(nameW + 12, roleW + 8);
  const hName = 12;
  const hRole = roleText ? 11 : 0;
  const h = hName + hRole;
  const bx = Math.round(x - w / 2);

  // Outer border + background
  ctx.fillStyle = PALETTE.bubbleBorder;
  ctx.fillRect(bx - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = PALETTE.bubbleBg;
  ctx.fillRect(bx, y, w, hName);

  // Status dot + name
  ctx.fillStyle = statusColor;
  ctx.fillRect(bx + 2, y + 4, 4, 4);
  ctx.fillStyle = PALETTE.bubbleText;
  ctx.fillText(name, bx + 8, y + 1);

  // Role row
  if (roleText) {
    const roleY = y + hName;
    ctx.fillStyle = role.color;
    ctx.fillRect(bx, roleY, w, hRole);
    ctx.fillStyle = "#0f1020";
    ctx.font = "bold 8px ui-monospace, Menlo, monospace";
    ctx.fillText(roleLabel, bx + 3, roleY + 2);
    if (roleFull) {
      ctx.font = "8px ui-monospace, Menlo, monospace";
      const labelW = ctx.measureText(roleLabel).width;
      ctx.fillText("· " + roleFull, bx + 3 + labelW + 4, roleY + 2);
    }
  }
  ctx.restore();
}
