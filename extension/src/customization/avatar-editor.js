// Avatar editor — renders swatches and a live preview canvas.

import { PALETTE } from "../../assets/palette/palette.js";
import { drawCharacter, defaultCustomization, HAIR_STYLES, ACCESSORIES } from "../renderer/sprite-factory.js";

export class AvatarEditor {
  constructor(root, { onChange } = {}) {
    this.root = root;
    this.onChange = onChange ?? (() => {});
    this.previewCanvas = root.querySelector("#avatar-preview");
    this.previewCtx = this.previewCanvas.getContext("2d");
    this.previewCtx.imageSmoothingEnabled = false;
    this.previewScale = 6; // bigger preview
    this.current = defaultCustomization(0);
    this.name = "Agent";
    this.targetSelect = root.querySelector("#avatar-target");
    this.nameInput = root.querySelector("#avatar-name");

    this.mount();
    this.startAnim();
  }

  mount() {
    // Skin swatches
    this.renderSwatchRow("#swatch-skin", PALETTE.skin, "skinIdx");
    this.renderSwatchRow("#swatch-hair-color", PALETTE.hair, "hairColorIdx");
    this.renderSwatchRow("#swatch-outfit", PALETTE.outfit, "outfitIdx");
    this.renderSwatchRow("#swatch-accessory-color", PALETTE.outfit, "accessoryColorIdx");

    this.renderPillRow("#swatch-hair-style", Object.keys(HAIR_STYLES), "hairStyle");
    this.renderPillRow("#swatch-accessory", Object.keys(ACCESSORIES), "accessory");

    this.nameInput.addEventListener("input", () => {
      this.name = this.nameInput.value;
      this.emit();
    });

    this.root.querySelector("#avatar-randomize").addEventListener("click", () => {
      this.setCustomization(defaultCustomization(Math.floor(Math.random() * 1000)));
    });
  }

  renderSwatchRow(selector, colors, key) {
    const row = this.root.querySelector(selector);
    row.innerHTML = "";
    colors.forEach((color, idx) => {
      const sw = document.createElement("button");
      sw.className = "swatch";
      sw.style.background = color;
      sw.title = color;
      sw.addEventListener("click", () => {
        this.current = { ...this.current, [key]: idx };
        this.refreshSelections();
        this.emit();
      });
      row.appendChild(sw);
    });
  }

  renderPillRow(selector, items, key) {
    const row = this.root.querySelector(selector);
    row.innerHTML = "";
    items.forEach((item) => {
      const btn = document.createElement("button");
      btn.className = "pill";
      btn.textContent = item;
      btn.dataset.value = item;
      btn.addEventListener("click", () => {
        this.current = { ...this.current, [key]: item };
        this.refreshSelections();
        this.emit();
      });
      row.appendChild(btn);
    });
  }

  refreshSelections() {
    const map = {
      "#swatch-skin": ["skinIdx", "index"],
      "#swatch-hair-color": ["hairColorIdx", "index"],
      "#swatch-outfit": ["outfitIdx", "index"],
      "#swatch-accessory-color": ["accessoryColorIdx", "index"],
      "#swatch-hair-style": ["hairStyle", "value"],
      "#swatch-accessory": ["accessory", "value"]
    };
    for (const [sel, [key, mode]] of Object.entries(map)) {
      const row = this.root.querySelector(sel);
      [...row.children].forEach((child, i) => {
        if (mode === "index") {
          child.classList.toggle("is-selected", this.current[key] === i);
        } else {
          child.classList.toggle("is-selected", child.dataset.value === this.current[key]);
        }
      });
    }
  }

  setCustomization(c, name) {
    this.current = { ...c };
    if (typeof name === "string") {
      this.name = name;
      this.nameInput.value = name;
    }
    this.refreshSelections();
    this.emit();
  }

  emit() { this.onChange({ customization: this.current, name: this.name }); }

  drawPreview() {
    const ctx = this.previewCtx;
    ctx.clearRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);
    ctx.fillStyle = "#101226";
    ctx.fillRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);
    drawCharacter(ctx, 0, 0, this.previewScale, this.current, "idle", 1);
  }

  startAnim() {
    let last = performance.now();
    const tick = (t) => {
      const dt = t - last;
      last = t;
      // Cycle between idle / walk for a fun preview every ~1s
      const phase = Math.floor((t / 600) % 3);
      const ctx = this.previewCtx;
      ctx.clearRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);
      ctx.fillStyle = "#101226";
      ctx.fillRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);
      const frame = phase === 0 ? "idle" : phase === 1 ? "walk1" : "walk2";
      drawCharacter(ctx, 0, 0, this.previewScale, this.current, frame, 1);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}
