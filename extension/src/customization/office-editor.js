// Office layout editor — click on the canvas to place furniture/terrain.

import { FURNITURE_TYPES, TILE_PX, defaultMap } from "../renderer/tilemap.js";

const TERRAIN_KINDS = ["floor", "wall", "rug"];

export class LayoutEditor {
  constructor({ root, canvas, renderer, getMap, setMap, onSelect } = {}) {
    this.root = root;
    this.canvas = canvas;
    this.renderer = renderer;
    this.getMap = getMap;
    this.setMap = setMap;
    this.onSelect = onSelect ?? (() => {});
    this.tool = null; // { kind: 'furniture'|'terrain', value: string }
    this.active = false;

    this.toolRow = root.querySelector("#tool-row");
    this.terrainRow = root.querySelector("#terrain-row");

    this.renderTools();
    this.attachCanvasListeners();
    root.querySelector("#layout-reset").addEventListener("click", () => {
      this.setMap(defaultMap());
    });
    root.querySelector("#layout-clear").addEventListener("click", () => {
      const map = this.getMap();
      const cleared = {
        cols: map.cols,
        rows: map.rows,
        terrain: new Array(map.cols * map.rows).fill("floor"),
        furniture: []
      };
      this.setMap(cleared);
    });
  }

  setActive(active) {
    this.active = !!active;
  }

  renderTools() {
    this.toolRow.innerHTML = "";
    for (const type of FURNITURE_TYPES) {
      const btn = this.makeToolButton({ kind: "furniture", value: type, label: type });
      this.toolRow.appendChild(btn);
    }
    const removeBtn = this.makeToolButton({ kind: "remove", value: "remove", label: "remove" });
    this.toolRow.appendChild(removeBtn);

    this.terrainRow.innerHTML = "";
    for (const t of TERRAIN_KINDS) {
      const btn = this.makeToolButton({ kind: "terrain", value: t, label: t });
      this.terrainRow.appendChild(btn);
    }
  }

  makeToolButton({ kind, value, label }) {
    const wrap = document.createElement("button");
    wrap.className = "tool";
    wrap.dataset.kind = kind;
    wrap.dataset.value = value;
    const c = document.createElement("canvas");
    c.width = 24; c.height = 24;
    const ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    this.drawToolPreview(ctx, kind, value);
    wrap.appendChild(c);
    const span = document.createElement("span");
    span.textContent = label;
    wrap.appendChild(span);
    wrap.addEventListener("click", () => this.selectTool({ kind, value, el: wrap }));
    return wrap;
  }

  drawToolPreview(ctx, kind, value) {
    // Use the tilemap drawers via a tiny scratch buffer rendered then scaled down.
    const native = document.createElement("canvas");
    native.width = TILE_PX; native.height = TILE_PX;
    const nctx = native.getContext("2d");
    nctx.imageSmoothingEnabled = false;
    // Lazy-load drawing functions
    import("../renderer/tilemap.js").then(({ drawTilemap }) => {
      const map = {
        cols: 1, rows: 1,
        terrain: [kind === "terrain" ? value : "floor"],
        furniture: kind === "furniture" ? [{ id: "x", type: value, x: 0, y: 0 }] : []
      };
      drawTilemap(nctx, map, 1);
      ctx.drawImage(native, 0, 0, 24, 24);
    });
    if (kind === "remove") {
      ctx.fillStyle = "#d44c4c";
      ctx.fillRect(4, 11, 16, 2);
    }
  }

  selectTool({ kind, value, el }) {
    [...this.toolRow.children, ...this.terrainRow.children].forEach((c) => c.classList.remove("is-selected"));
    el.classList.add("is-selected");
    this.tool = { kind, value };
    this.onSelect(this.tool);
  }

  attachCanvasListeners() {
    this.canvas.addEventListener("click", (e) => {
      if (!this.active || !this.tool) return;
      const { tx, ty } = this.coords(e);
      this.apply(tx, ty);
    });
    this.canvas.addEventListener("contextmenu", (e) => {
      if (!this.active) return;
      e.preventDefault();
      const { tx, ty } = this.coords(e);
      const map = this.getMap();
      const before = map.furniture.length;
      const next = {
        ...map,
        furniture: map.furniture.filter((f) => !(f.x === tx && f.y === ty))
      };
      if (next.furniture.length !== before) this.setMap(next);
    });
  }

  coords(e) {
    const rect = this.canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width * this.canvas.width;
    const py = (e.clientY - rect.top) / rect.height * this.canvas.height;
    const scale = this.renderer.scale;
    return {
      tx: Math.floor(px / (TILE_PX * scale)),
      ty: Math.floor(py / (TILE_PX * scale))
    };
  }

  apply(tx, ty) {
    const map = this.getMap();
    if (tx < 0 || ty < 0 || tx >= map.cols || ty >= map.rows) return;
    if (this.tool.kind === "terrain") {
      const terrain = map.terrain.slice();
      terrain[ty * map.cols + tx] = this.tool.value;
      this.setMap({ ...map, terrain });
    } else if (this.tool.kind === "furniture") {
      const furniture = map.furniture.filter((f) => !(f.x === tx && f.y === ty));
      furniture.push({ id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, type: this.tool.value, x: tx, y: ty });
      this.setMap({ ...map, furniture });
    } else if (this.tool.kind === "remove") {
      const furniture = map.furniture.filter((f) => !(f.x === tx && f.y === ty));
      this.setMap({ ...map, furniture });
    }
  }
}
