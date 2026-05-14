// Procedural pixel-art character sprites.
//
// Each sprite is a 16x24 grid drawn from a small string-template language.
// Glyphs in the template:
//   .  transparent
//   #  outline (dark)
//   S  skin (palette.skin[customization.skinIdx])
//   H  hair (palette.hair[customization.hairIdx])
//   O  outfit (palette.outfit[customization.outfitIdx])
//   P  pants (dark outline color)
//   F  shoes (dark outline color)
//   E  eye (outline)
//   M  mouth (outline, lighter)
//   A  accessory (palette.outfit[customization.accessoryIdx]) — hat/glasses
//
// We layer: body → outfit → hair → face → accessory.

import { PALETTE } from "../../assets/palette/palette.js";

export const SPRITE_W = 16;
export const SPRITE_H = 24;

// Base body (skin + outfit + pants + shoes) — frame 0 (idle stand)
const BODY_IDLE = [
  "................",
  "................",
  "................",
  "....######......",
  "...#SSSSSS#.....",
  "...#SSSSSS#.....",
  "...#SSSSSS#.....",
  "...#SSSSSS#.....",
  "....#SSSS#......",
  ".....#SS#.......",
  "....#OOOO#......",
  "...#OOOOOO#.....",
  "..#OOOOOOOO#....",
  "..#OOOOOOOO#....",
  "..#OOOOOOOO#....",
  "...#OOOOOO#.....",
  "...#OOOOOO#.....",
  "....#PPPP#......",
  "....#PPPP#......",
  "....#PPPP#......",
  "....#PPPP#......",
  "....#P##P#......",
  "....#F##F#......",
  "....####........"
];

// Walk frame 1 — left leg forward
const BODY_WALK_1 = [
  "................",
  "................",
  "................",
  "....######......",
  "...#SSSSSS#.....",
  "...#SSSSSS#.....",
  "...#SSSSSS#.....",
  "...#SSSSSS#.....",
  "....#SSSS#......",
  ".....#SS#.......",
  "....#OOOO#......",
  "...#OOOOOO#.....",
  "..#OOOOOOOO#....",
  "..#OOOOOOOO#....",
  "..#OOOOOOOO#....",
  "...#OOOOOO#.....",
  "...#OOOOOO#.....",
  "...#PPP#PP#.....",
  "...#PPP#PP#.....",
  "..#PPP##PP#.....",
  "..#PP#.#PP#.....",
  "..#PP#.#PP#.....",
  "..#FF#.#FF#.....",
  "..####.####....."
];

// Walk frame 2 — right leg forward (mirror of walk 1 vertically same, legs flipped)
const BODY_WALK_2 = [
  "................",
  "................",
  "................",
  "....######......",
  "...#SSSSSS#.....",
  "...#SSSSSS#.....",
  "...#SSSSSS#.....",
  "...#SSSSSS#.....",
  "....#SSSS#......",
  ".....#SS#.......",
  "....#OOOO#......",
  "...#OOOOOO#.....",
  "..#OOOOOOOO#....",
  "..#OOOOOOOO#....",
  "..#OOOOOOOO#....",
  "...#OOOOOO#.....",
  "...#OOOOOO#.....",
  "....#PP#PPP#....",
  "....#PP#PPP#....",
  "....#PP##PPP#...",
  "....#PP#.#PP#...",
  "....#PP#.#PP#...",
  "....#FF#.#FF#...",
  "....####.####..."
];

// Face: eyes + mouth (idle)
const FACE_IDLE = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "....#.E..E.#....",
  "................",
  ".....#MM#.......",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................"
];

const FACE_THINK = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "....#.-..-.#....",
  "................",
  ".....##MM.......",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................"
];

const FACE_HAPPY = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "....#.^..^.#....",
  "................",
  ".....#MMMM......",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................"
];

// Hair styles
const HAIR_SHORT = [
  "................",
  "................",
  "....######......",
  "...#HHHHHH#.....",
  "...#HHHHHH#.....",
  "...#H####H#.....",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................"
];

const HAIR_LONG = [
  "................",
  "....######......",
  "...#HHHHHH#.....",
  "..#HHHHHHHH#....",
  "..#HHHHHHHH#....",
  "..#HHH##HHH#....",
  "..#H#....#H#....",
  "..#H......H#....",
  "..#H......H#....",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................"
];

const HAIR_BUZZ = [
  "................",
  "................",
  "................",
  "....######......",
  "...#H####H#.....",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................"
];

const HAIR_PONYTAIL = [
  "................",
  "....######......",
  "...#HHHHHH#.....",
  "...#HHHHHHH#....",
  "...#HHH##HH#....",
  "...#H####HH#....",
  "..........HH#...",
  "..........HH#...",
  "...........H#...",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................"
];

const HAIR_NONE = Array(SPRITE_H).fill(".".repeat(SPRITE_W));

// Accessories
const ACC_NONE = Array(SPRITE_H).fill(".".repeat(SPRITE_W));

const ACC_GLASSES = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "....##.##.##....",
  "....#A#A#A#.....",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................"
];

const ACC_HEADSET = [
  "................",
  "................",
  "....######......",
  "...##AAAA##.....",
  "..#A######A#....",
  "..#A#....#A#....",
  "..#A#....#A#....",
  "..#AA....AA#....",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................"
];

const ACC_HAT = [
  "................",
  "..############..",
  "..#AAAAAAAAAA#..",
  "..############..",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................"
];

export const HAIR_STYLES = {
  short:    HAIR_SHORT,
  long:     HAIR_LONG,
  buzz:     HAIR_BUZZ,
  ponytail: HAIR_PONYTAIL,
  bald:     HAIR_NONE
};

export const FACE_EXPRESSIONS = {
  idle:    FACE_IDLE,
  think:   FACE_THINK,
  happy:   FACE_HAPPY
};

export const ACCESSORIES = {
  none:    ACC_NONE,
  glasses: ACC_GLASSES,
  headset: ACC_HEADSET,
  hat:     ACC_HAT
};

export const BODY_FRAMES = {
  idle:  BODY_IDLE,
  walk1: BODY_WALK_1,
  walk2: BODY_WALK_2
};

function resolveColor(glyph, custom) {
  switch (glyph) {
    case "#": return PALETTE.outline;
    case "S": return PALETTE.skin[custom.skinIdx % PALETTE.skin.length];
    case "H": return PALETTE.hair[custom.hairColorIdx % PALETTE.hair.length];
    case "O": return PALETTE.outfit[custom.outfitIdx % PALETTE.outfit.length];
    case "P": return PALETTE.outlineSoft;
    case "F": return PALETTE.outline;
    case "E": return PALETTE.outline;
    case "M": return PALETTE.outlineSoft;
    case "A": return PALETTE.outfit[custom.accessoryColorIdx % PALETTE.outfit.length];
    case "-": return PALETTE.outline; // closed eye
    case "^": return PALETTE.outline; // happy eye
    default:  return null;
  }
}

/**
 * Render a character onto a CanvasRenderingContext2D at the given pixel-grid origin.
 * @param ctx canvas 2d context
 * @param ox  x in css px
 * @param oy  y in css px
 * @param scale  pixel size (each sprite pixel = scale x scale css px)
 * @param custom { skinIdx, hairColorIdx, hairStyle, outfitIdx, accessory, accessoryColorIdx, face }
 * @param frame  body frame name (idle | walk1 | walk2)
 * @param facing 1 | -1 (right | left)
 */
export function drawCharacter(ctx, ox, oy, scale, custom, frame = "idle", facing = 1) {
  const layers = [
    BODY_FRAMES[frame] ?? BODY_IDLE,
    HAIR_STYLES[custom.hairStyle] ?? HAIR_SHORT,
    FACE_EXPRESSIONS[custom.face] ?? FACE_IDLE,
    ACCESSORIES[custom.accessory] ?? ACC_NONE
  ];

  ctx.save();
  if (facing === -1) {
    ctx.translate(ox + SPRITE_W * scale, oy);
    ctx.scale(-1, 1);
    ox = 0; oy = 0;
  }

  for (const layer of layers) {
    for (let y = 0; y < SPRITE_H; y++) {
      const row = layer[y] ?? "";
      for (let x = 0; x < SPRITE_W; x++) {
        const g = row[x] ?? ".";
        if (g === "." || g === "") continue;
        const color = resolveColor(g, custom);
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
      }
    }
  }
  ctx.restore();
}

export function defaultCustomization(seed = 0) {
  return {
    skinIdx: seed % PALETTE.skin.length,
    hairColorIdx: (seed * 3 + 1) % PALETTE.hair.length,
    hairStyle: ["short", "long", "buzz", "ponytail"][seed % 4],
    outfitIdx: (seed * 5 + 2) % PALETTE.outfit.length,
    accessory: ["none", "glasses", "headset", "hat"][seed % 4],
    accessoryColorIdx: (seed * 7) % PALETTE.outfit.length,
    face: "idle"
  };
}
