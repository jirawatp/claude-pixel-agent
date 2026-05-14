// Central pixel-art palette. Limited, cohesive colors keep the look retro.
// Inspired by Claw-Empire / classic 16-bit office sims.

export const PALETTE = {
  // Background
  floorLight: "#d8c2a0",
  floorDark:  "#b89a76",
  wallLight:  "#5b6f96",
  wallDark:   "#3a4a6a",
  shadow:     "rgba(0,0,0,0.25)",

  // Outlines
  outline:    "#1a1a2e",
  outlineSoft:"#2a2a44",

  // Skin tones (selectable)
  skin: ["#f6d2b3", "#e6b591", "#c98e6b", "#8a5a3b", "#5a3a26"],

  // Hair colors
  hair: ["#2b1a14", "#5b3a1f", "#a86b2c", "#d9b35a", "#e8e0d0", "#7a4cc7", "#3a8fd6", "#d44c4c"],

  // Outfit colors
  outfit: ["#3a8fd6", "#d44c4c", "#5cb85c", "#f0a830", "#9b59b6", "#34495e", "#16a085", "#e91e63"],

  // Accent colors for UI / speech bubbles
  bubbleBg:     "#ffffff",
  bubbleBorder: "#1a1a2e",
  bubbleText:   "#1a1a2e",
  thoughtBg:    "#eef2ff",

  // Status colors
  statusIdle:    "#888",
  statusWorking: "#5cb85c",
  statusThinking:"#f0a830",
  statusError:   "#d44c4c",

  // Furniture
  woodLight: "#a87b4f",
  woodDark:  "#6e4a2a",
  metal:     "#8a8fa3",
  screen:    "#1a3a5b",
  screenOn:  "#6acef0",
  plant:     "#3f8a3f",
  plantDark: "#266c26",
  pot:       "#a04b2a"
};

export const TILE_SIZE = 16; // base pixel size for tiles
export const SCALE = 3;      // render scale: each pixel drawn as 3x3 css px
