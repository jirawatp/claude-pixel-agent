// Office tilemap — floor, walls, and furniture.
// The map is a grid (in tiles). Each cell holds a stack of layers:
//   - terrain (floor / wall)
//   - furniture (desk, chair, plant, computer, whiteboard, sofa, rug)
//
// Furniture sprites are drawn procedurally so they can be themed easily.

import { PALETTE } from "../../assets/palette/palette.js";

export const TILE_PX = 16;

// 24 cols x 16 rows by default → 384 x 256 native pixels.
export const DEFAULT_COLS = 24;
export const DEFAULT_ROWS = 16;

export function emptyMap(cols = DEFAULT_COLS, rows = DEFAULT_ROWS) {
  return {
    cols,
    rows,
    terrain: new Array(cols * rows).fill("floor"),
    furniture: [] // array of { id, type, x, y, rot }
  };
}

export function defaultMap() {
  const m = emptyMap();
  const setT = (x, y, t) => { m.terrain[y * m.cols + x] = t; };
  const F = (id, type, x, y) => m.furniture.push({ id, type, x, y });

  // ── Outer + room walls ──
  for (let x = 0; x < m.cols; x++) { setT(x, 0, "wall"); setT(x, 1, "wall"); }
  for (let y = 0; y < m.rows; y++) { setT(0, y, "wall"); setT(m.cols - 1, y, "wall"); }
  for (let x = 1; x < m.cols - 1; x++) setT(x, 2, "wall");
  // Vertical dividers between top rooms (cols 8, 15)
  for (let y = 2; y <= 6; y++) { setT(8, y, "wall"); setT(15, y, "wall"); }
  // Bottom of top rooms (row 7) with doorways at cols 4, 12, 19
  for (let x = 1; x < m.cols - 1; x++) setT(x, 7, "wall");
  setT(4,  7, "floor");
  setT(12, 7, "floor");
  setT(19, 7, "floor");

  // ── Top room rugs ──
  for (let y = 3; y <= 6; y++) for (let x = 1; x <= 7;  x++) setT(x, y, "rug_library");
  for (let y = 3; y <= 6; y++) for (let x = 9; x <= 14; x++) setT(x, y, "rug_meeting");
  for (let y = 3; y <= 6; y++) for (let x = 16; x <= 22; x++) setT(x, y, "rug_coffee");

  // ── Bottom wing floor accents (a single tinted row under the label) ──
  for (let x = 1;  x <= 5;  x++) setT(x, 8,  "rug_meeting");   // Strategy
  for (let x = 6;  x <= 14; x++) setT(x, 8,  "rug");           // Engineering (default warm rug)
  for (let x = 15; x <= 19; x++) setT(x, 8,  "rug_coffee");    // Design
  for (let x = 20; x <= 22; x++) setT(x, 8,  "rug_library");   // Ops

  // ── Library ──
  F("lib-shelf-1", "bookshelf", 1, 3);
  F("lib-shelf-2", "bookshelf", 2, 3);
  F("lib-shelf-3", "bookshelf", 6, 3);
  F("lib-shelf-4", "bookshelf", 7, 3);
  F("lib-lamp",    "lamp",      4, 3);
  F("lib-plant",   "plant",     7, 6);

  // ── Meeting Room ──
  F("mtg-table",   "meeting_table", 11, 5);
  F("mtg-table-2", "meeting_table", 12, 5);
  F("mtg-chair-1", "chair",         10, 4);
  F("mtg-chair-2", "chair",         13, 4);
  F("mtg-chair-3", "chair",         10, 6);
  F("mtg-chair-4", "chair",         13, 6);
  F("mtg-board",   "whiteboard",    11, 3);

  // ── Coffee Room ──
  F("cof-machine", "coffee_machine", 16, 3);
  F("cof-cooler",  "water_cooler",   22, 3);
  F("cof-sofa-1",  "sofa",           18, 5);
  F("cof-sofa-2",  "sofa",           20, 5);
  F("cof-table",   "coffee",         19, 5);
  F("cof-plant",   "plant",          16, 6);
  F("cof-lamp",    "lamp",           21, 6);

  // ── Strategy Bay (cols 1-5) — PM / SM / SA / EA / BA ──
  F("st-board",     "whiteboard", 3, 9);   // kanban board
  for (const [i, x] of [2, 4].entries()) {
    F(`st-desk-t${i}`, "desk",     x, 10);
    F(`st-comp-t${i}`, "computer", x, 10);
    F(`st-chair-t${i}`,"chair",    x, 11);
  }
  for (const [i, x] of [2, 4].entries()) {
    F(`st-desk-b${i}`, "desk",     x, 13);
    F(`st-comp-b${i}`, "computer", x, 13);
    F(`st-chair-b${i}`,"chair",    x, 14);
  }
  F("st-plant",   "plant", 1, 14);

  // ── Engineering (cols 6-14) — Arch / BE / FE / DBA / QA ──
  for (const [i, x] of [7, 9, 11, 13].entries()) {
    F(`eng-desk-t${i}`, "desk",     x, 10);
    F(`eng-comp-t${i}`, "computer", x, 10);
    F(`eng-chair-t${i}`,"chair",    x, 11);
  }
  for (const [i, x] of [7, 9, 11, 13].entries()) {
    F(`eng-desk-b${i}`, "desk",     x, 13);
    F(`eng-comp-b${i}`, "computer", x, 13);
    F(`eng-chair-b${i}`,"chair",    x, 14);
  }

  // ── Design Studio (cols 15-19) — UX / UI ──
  // Double monitors for designers
  for (const [i, x] of [16, 18].entries()) {
    F(`ds-desk-t${i}`, "desk",     x, 10);
    F(`ds-comp-t${i}`, "computer", x, 10);
    F(`ds-comp2-t${i}`,"computer", x - 1, 10);
    F(`ds-chair-t${i}`,"chair",    x, 11);
  }
  for (const [i, x] of [16, 18].entries()) {
    F(`ds-desk-b${i}`, "desk",     x, 13);
    F(`ds-comp-b${i}`, "computer", x, 13);
    F(`ds-chair-b${i}`,"chair",    x, 14);
  }
  F("ds-lamp", "lamp", 19, 9);

  // ── Ops Bay (cols 20-22) — DevOps / Security / Performance ──
  F("ops-rack-1", "server_rack", 22, 9);
  F("ops-desk-1", "desk",        21, 10);
  F("ops-comp-1", "computer",    21, 10);
  F("ops-chair-1","chair",       21, 11);
  F("ops-rack-2", "server_rack", 22, 12);
  F("ops-desk-2", "desk",        21, 13);
  F("ops-comp-2", "computer",    21, 13);
  F("ops-chair-2","chair",       21, 14);
  F("ops-plant",  "plant",       20, 14);
  return m;
}

export const FURNITURE_TYPES = [
  "desk", "chair", "computer", "plant", "whiteboard", "sofa", "coffee", "lamp", "bookshelf",
  "meeting_table", "coffee_machine", "server_rack", "water_cooler"
];

export const TERRAIN_TYPES = ["floor", "wall", "rug", "rug_library", "rug_meeting", "rug_coffee"];

// ---- Terrain rendering ----

function fillRect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function drawFloor(ctx, x, y, scale) {
  const s = scale;
  fillRect(ctx, x, y, TILE_PX * s, TILE_PX * s, PALETTE.floorLight);
  // checker accent
  ctx.fillStyle = PALETTE.floorDark;
  for (let py = 0; py < TILE_PX; py += 4) {
    for (let px = 0; px < TILE_PX; px += 4) {
      if (((px + py) / 4) % 2 === 0) {
        ctx.fillRect(x + px * s, y + py * s, s, s);
      }
    }
  }
}

function drawWall(ctx, x, y, scale) {
  const s = scale;
  fillRect(ctx, x, y, TILE_PX * s, TILE_PX * s, PALETTE.wallDark);
  // horizontal stripe halfway down
  fillRect(ctx, x, y + 8 * s, TILE_PX * s, 1 * s, PALETTE.wallLight);
  // brick pattern
  for (let py = 0; py < TILE_PX; py += 4) {
    const offset = (py / 4) % 2 === 0 ? 0 : 8;
    for (let px = offset; px < TILE_PX; px += 8) {
      ctx.fillStyle = PALETTE.outline;
      ctx.fillRect(x + px * s, y + py * s, 1 * s, 4 * s);
    }
  }
}

function drawRugBase(ctx, x, y, scale, baseColor, accentColor) {
  const s = scale;
  fillRect(ctx, x, y, TILE_PX * s, TILE_PX * s, baseColor);
  for (let py = 2; py < TILE_PX; py += 4) {
    for (let px = 2; px < TILE_PX; px += 4) {
      ctx.fillStyle = accentColor;
      ctx.fillRect(x + px * s, y + py * s, s, s);
    }
  }
}

function drawTerrain(ctx, kind, x, y, scale) {
  switch (kind) {
    case "wall":         return drawWall(ctx, x, y, scale);
    case "rug":          return drawRugBase(ctx, x, y, scale, "#a85060", "#c46878");
    case "rug_library":  return drawRugBase(ctx, x, y, scale, "#6e4a2a", "#a87b4f"); // brown/wood
    case "rug_meeting":  return drawRugBase(ctx, x, y, scale, "#3a4a6a", "#5b6f96"); // cool blue
    case "rug_coffee":   return drawRugBase(ctx, x, y, scale, "#a06030", "#d09060"); // warm coffee
    default:             return drawFloor(ctx, x, y, scale);
  }
}

// ---- Furniture rendering (each fits in 1 tile = 16x16 native px) ----

function drawDesk(ctx, x, y, s) {
  fillRect(ctx, x, y + 4 * s, 16 * s, 6 * s, PALETTE.woodLight);
  fillRect(ctx, x, y + 4 * s, 16 * s, 1 * s, PALETTE.woodDark);
  fillRect(ctx, x + 1 * s, y + 10 * s, 2 * s, 4 * s, PALETTE.woodDark);
  fillRect(ctx, x + 13 * s, y + 10 * s, 2 * s, 4 * s, PALETTE.woodDark);
}

function drawChair(ctx, x, y, s) {
  fillRect(ctx, x + 4 * s, y + 4 * s, 8 * s, 7 * s, PALETTE.woodDark);
  fillRect(ctx, x + 4 * s, y + 4 * s, 8 * s, 1 * s, PALETTE.outline);
  fillRect(ctx, x + 4 * s, y + 11 * s, 2 * s, 3 * s, PALETTE.outline);
  fillRect(ctx, x + 10 * s, y + 11 * s, 2 * s, 3 * s, PALETTE.outline);
}

function drawComputer(ctx, x, y, s) {
  // monitor
  fillRect(ctx, x + 3 * s, y + 2 * s, 10 * s, 7 * s, PALETTE.outline);
  fillRect(ctx, x + 4 * s, y + 3 * s, 8 * s, 5 * s, PALETTE.screen);
  // active screen glow
  fillRect(ctx, x + 5 * s, y + 4 * s, 6 * s, 3 * s, PALETTE.screenOn);
  // stand
  fillRect(ctx, x + 7 * s, y + 9 * s, 2 * s, 2 * s, PALETTE.metal);
  fillRect(ctx, x + 5 * s, y + 11 * s, 6 * s, 1 * s, PALETTE.metal);
}

function drawPlant(ctx, x, y, s) {
  // pot
  fillRect(ctx, x + 4 * s, y + 10 * s, 8 * s, 5 * s, PALETTE.pot);
  fillRect(ctx, x + 4 * s, y + 10 * s, 8 * s, 1 * s, PALETTE.outline);
  // leaves
  fillRect(ctx, x + 3 * s, y + 4 * s, 10 * s, 6 * s, PALETTE.plant);
  fillRect(ctx, x + 5 * s, y + 2 * s, 6 * s, 2 * s, PALETTE.plant);
  fillRect(ctx, x + 6 * s, y + 4 * s, 1 * s, 4 * s, PALETTE.plantDark);
  fillRect(ctx, x + 9 * s, y + 3 * s, 1 * s, 5 * s, PALETTE.plantDark);
}

function drawWhiteboard(ctx, x, y, s) {
  fillRect(ctx, x, y, 16 * s, 10 * s, "#f4f4f0");
  fillRect(ctx, x, y, 16 * s, 1 * s, PALETTE.outline);
  fillRect(ctx, x, y + 9 * s, 16 * s, 1 * s, PALETTE.outline);
  fillRect(ctx, x, y, 1 * s, 10 * s, PALETTE.outline);
  fillRect(ctx, x + 15 * s, y, 1 * s, 10 * s, PALETTE.outline);
  // squiggles
  ctx.fillStyle = "#3a8fd6";
  ctx.fillRect(x + 2 * s, y + 3 * s, 5 * s, 1 * s);
  ctx.fillRect(x + 2 * s, y + 5 * s, 8 * s, 1 * s);
  ctx.fillStyle = "#d44c4c";
  ctx.fillRect(x + 9 * s, y + 3 * s, 4 * s, 1 * s);
}

function drawSofa(ctx, x, y, s) {
  fillRect(ctx, x, y + 4 * s, 16 * s, 8 * s, "#6a4caf");
  fillRect(ctx, x, y + 2 * s, 16 * s, 4 * s, "#523788");
  fillRect(ctx, x, y + 2 * s, 2 * s, 12 * s, "#523788");
  fillRect(ctx, x + 14 * s, y + 2 * s, 2 * s, 12 * s, "#523788");
}

function drawCoffee(ctx, x, y, s) {
  fillRect(ctx, x + 3 * s, y + 7 * s, 10 * s, 5 * s, PALETTE.woodDark);
  fillRect(ctx, x + 3 * s, y + 7 * s, 10 * s, 1 * s, PALETTE.outline);
  // cups
  fillRect(ctx, x + 5 * s, y + 5 * s, 2 * s, 2 * s, "#fff");
  fillRect(ctx, x + 9 * s, y + 5 * s, 2 * s, 2 * s, "#fff");
}

function drawLamp(ctx, x, y, s) {
  fillRect(ctx, x + 6 * s, y + 11 * s, 4 * s, 4 * s, PALETTE.woodDark);
  fillRect(ctx, x + 7 * s, y + 4 * s, 2 * s, 7 * s, PALETTE.metal);
  fillRect(ctx, x + 4 * s, y + 1 * s, 8 * s, 4 * s, "#f0d070");
  fillRect(ctx, x + 4 * s, y + 1 * s, 8 * s, 1 * s, PALETTE.outline);
}

function drawBookshelf(ctx, x, y, s) {
  fillRect(ctx, x, y, 16 * s, 15 * s, PALETTE.woodDark);
  // books
  const colors = ["#d44c4c", "#3a8fd6", "#5cb85c", "#f0a830", "#9b59b6"];
  for (let row = 0; row < 3; row++) {
    let bx = 1;
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = colors[(i + row) % colors.length];
      ctx.fillRect(x + bx * s, y + (1 + row * 5) * s, 2 * s, 4 * s);
      bx += 3;
    }
  }
}

function drawMeetingTable(ctx, x, y, s) {
  // Round wooden table top
  ctx.fillStyle = PALETTE.woodDark;
  ctx.beginPath();
  ctx.ellipse(x + 8 * s, y + 9 * s, 7 * s, 5 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.woodLight;
  ctx.beginPath();
  ctx.ellipse(x + 8 * s, y + 8 * s, 6 * s, 4 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  // Pen / notepad detail
  fillRect(ctx, x + 6 * s, y + 7 * s, 2 * s, 1 * s, "#fff");
  fillRect(ctx, x + 10 * s, y + 8 * s, 1 * s, 2 * s, "#3a8fd6");
}

function drawCoffeeMachine(ctx, x, y, s) {
  // Counter
  fillRect(ctx, x, y + 11 * s, 16 * s, 4 * s, PALETTE.woodDark);
  fillRect(ctx, x, y + 11 * s, 16 * s, 1 * s, "#a87b4f");
  // Machine body
  fillRect(ctx, x + 4 * s, y + 3 * s, 8 * s, 8 * s, "#2a2e55");
  fillRect(ctx, x + 4 * s, y + 3 * s, 8 * s, 1 * s, PALETTE.outline);
  // Drip area / cup
  fillRect(ctx, x + 6 * s, y + 9 * s, 4 * s, 2 * s, "#1a1a2e");
  fillRect(ctx, x + 7 * s, y + 8 * s, 2 * s, 2 * s, "#fff");
  // LED screen
  fillRect(ctx, x + 6 * s, y + 5 * s, 4 * s, 2 * s, PALETTE.screenOn);
  // Steam
  fillRect(ctx, x + 7 * s, y + 1 * s, 1 * s, 1 * s, "#fff8");
  fillRect(ctx, x + 8 * s, y + 0 * s, 1 * s, 1 * s, "#fff5");
}

function drawServerRack(ctx, x, y, s) {
  // Cabinet
  fillRect(ctx, x + 2 * s, y + 1 * s, 12 * s, 14 * s, "#1a1a2e");
  fillRect(ctx, x + 2 * s, y + 1 * s, 12 * s, 1 * s, PALETTE.outlineSoft);
  // Server units with blinking LEDs
  for (let row = 0; row < 4; row++) {
    const ry = y + (2 + row * 3) * s;
    fillRect(ctx, x + 3 * s, ry, 10 * s, 2 * s, "#0a0b18");
    // LEDs alternate green/yellow
    fillRect(ctx, x + 4 * s, ry + 1 * s, 1 * s, 1 * s, row % 2 ? "#f0a830" : "#5cb85c");
    fillRect(ctx, x + 6 * s, ry + 1 * s, 1 * s, 1 * s, "#5cb85c");
    fillRect(ctx, x + 8 * s, ry + 1 * s, 1 * s, 1 * s, row % 3 ? "#5cb85c" : "#d44c4c");
    fillRect(ctx, x + 11 * s, ry + 1 * s, 1 * s, 1 * s, "#6acef0");
  }
}

function drawWaterCooler(ctx, x, y, s) {
  // Jug (blue water)
  fillRect(ctx, x + 4 * s, y + 1 * s, 8 * s, 5 * s, "#88c2e8");
  fillRect(ctx, x + 4 * s, y + 1 * s, 8 * s, 1 * s, PALETTE.outline);
  fillRect(ctx, x + 6 * s, y + 0 * s, 4 * s, 1 * s, PALETTE.outlineSoft);
  // Body
  fillRect(ctx, x + 3 * s, y + 6 * s, 10 * s, 9 * s, "#e8e9f7");
  fillRect(ctx, x + 3 * s, y + 6 * s, 10 * s, 1 * s, PALETTE.outline);
  // Spigot
  fillRect(ctx, x + 7 * s, y + 9 * s, 2 * s, 2 * s, "#2a2e55");
  fillRect(ctx, x + 6 * s, y + 11 * s, 4 * s, 1 * s, "#2a2e55");
}

function drawFurniture(ctx, item, x, y, scale) {
  switch (item.type) {
    case "desk":           return drawDesk(ctx, x, y, scale);
    case "chair":          return drawChair(ctx, x, y, scale);
    case "computer":       return drawComputer(ctx, x, y, scale);
    case "plant":          return drawPlant(ctx, x, y, scale);
    case "whiteboard":     return drawWhiteboard(ctx, x, y, scale);
    case "sofa":           return drawSofa(ctx, x, y, scale);
    case "coffee":         return drawCoffee(ctx, x, y, scale);
    case "lamp":           return drawLamp(ctx, x, y, scale);
    case "bookshelf":      return drawBookshelf(ctx, x, y, scale);
    case "meeting_table":  return drawMeetingTable(ctx, x, y, scale);
    case "coffee_machine": return drawCoffeeMachine(ctx, x, y, scale);
    case "server_rack":    return drawServerRack(ctx, x, y, scale);
    case "water_cooler":   return drawWaterCooler(ctx, x, y, scale);
  }
}

export function drawTilemap(ctx, map, scale) {
  // Terrain
  for (let ty = 0; ty < map.rows; ty++) {
    for (let tx = 0; tx < map.cols; tx++) {
      const kind = map.terrain[ty * map.cols + tx];
      drawTerrain(ctx, kind, tx * TILE_PX * scale, ty * TILE_PX * scale, scale);
    }
  }
  // Furniture sorted by y so things lower draw on top (poor man's depth)
  const sorted = [...map.furniture].sort((a, b) => a.y - b.y);
  for (const item of sorted) {
    drawFurniture(ctx, item, item.x * TILE_PX * scale, item.y * TILE_PX * scale, scale);
  }
}

export function viewportSize(map, scale) {
  return {
    w: map.cols * TILE_PX * scale,
    h: map.rows * TILE_PX * scale
  };
}
