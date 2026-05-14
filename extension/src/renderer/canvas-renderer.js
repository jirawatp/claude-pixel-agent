// Main canvas renderer — wires the tilemap, characters, and animation loop.

import { drawTilemap, viewportSize, TILE_PX } from "./tilemap.js";
import { updateCharacter, drawCharacterEntity, createCharacter, sayBubble, walkTo } from "./character.js";
import { PALETTE, SCALE } from "../../assets/palette/palette.js";
import { ZONES } from "./zones.js";

export class OfficeRenderer {
  constructor(canvas, { map, scale = SCALE } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.ctx.imageSmoothingEnabled = false;
    this.scale = scale;
    this.map = map;
    this.characters = new Map();
    this.running = false;
    this.lastT = 0;
    this.resize();
  }

  setMap(map) {
    this.map = map;
    this.resize();
  }

  setScale(scale) {
    this.scale = scale;
    this.resize();
  }

  resize() {
    const { w, h } = viewportSize(this.map, this.scale);
    this.canvas.width = w;
    this.canvas.height = h;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.imageSmoothingEnabled = false;
  }

  addCharacter(opts) {
    const c = createCharacter(opts);
    this.characters.set(c.id, c);
    return c;
  }

  removeCharacter(id) {
    this.characters.delete(id);
  }

  getCharacter(id) { return this.characters.get(id); }

  ensureCharacter(id, opts) {
    let c = this.characters.get(id);
    if (!c) c = this.addCharacter({ ...opts, id });
    return c;
  }

  say(id, text, opts) {
    const c = this.characters.get(id);
    if (c) sayBubble(c, text, opts);
  }

  walkTo(id, x, y) {
    const c = this.characters.get(id);
    if (c) walkTo(c, x, y);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastT = performance.now();
    const tick = (t) => {
      if (!this.running) return;
      const dt = Math.min(50, t - this.lastT);
      this.lastT = t;
      this.update(dt);
      this.draw();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  stop() { this.running = false; }

  update(dt) {
    for (const c of this.characters.values()) {
      updateCharacter(c, dt, this.map);
    }
  }

  draw() {
    const { ctx } = this;
    ctx.fillStyle = "#0a0a1a";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    drawTilemap(ctx, this.map, this.scale);

    if (this.showZoneLabels !== false) drawZoneLabels(ctx, this.scale);

    // Draw characters in y-order so closer ones overlap farther ones
    const list = [...this.characters.values()].sort((a, b) => a.y - b.y);
    for (const c of list) drawCharacterEntity(ctx, c, this.scale);
  }
}

function drawZoneLabels(ctx, scale) {
  ctx.save();
  const fontPx = 11 * Math.max(1, scale - 1);
  ctx.font = `bold ${fontPx}px ui-monospace, Menlo, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const zone of Object.values(ZONES)) {
    if (!zone.label) continue;
    const cx = zone.label.x * TILE_PX * scale + (TILE_PX * scale) / 2;
    const cy = zone.label.y * TILE_PX * scale + (TILE_PX * scale) / 2;
    const text = zone.label.text;
    const padX = 8 * Math.max(1, scale - 1) / 2;
    const w = ctx.measureText(text).width + padX * 2;
    const h = fontPx + 6;

    // Solid dark pill with accent border
    ctx.fillStyle = "rgba(15,16,32,0.95)";
    ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
    ctx.fillStyle = "#6acef0";
    ctx.fillRect(cx - w / 2, cy - h / 2, w, 2);
    ctx.fillRect(cx - w / 2, cy + h / 2 - 2, w, 2);

    // Label text
    ctx.fillStyle = "#6acef0";
    ctx.fillText(text, cx, cy + 1);
  }
  ctx.restore();
}
