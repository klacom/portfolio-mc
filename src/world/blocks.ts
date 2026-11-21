/** Every cell has three layers: back (furthest), middle (behind the page text) and front (in front of it). */
export type Layer = "b" | "m" | "f";
export const LAYERS: readonly Layer[] = ["b", "m", "f"];
export const LAYER_NAME: Record<Layer, string> = { b: "Back", m: "Middle", f: "Front" };

export type BlockGroup = "Nature" | "Building" | "Colours" | "Caves" | "Inferno" | "Void" | "Light";
export const GROUPS: readonly BlockGroup[] = ["Nature", "Building", "Colours", "Caves", "Inferno", "Void", "Light"];

type Opts = {
  /** Lets light and the layers behind show through (leaves, glass, water). */
  see?: boolean;
  /** Non-solid items (torches, crystals) are drawn as sprites and never block light or movement. */
  item?: boolean;
  /** Light level 1–15. */
  light?: number;
};

const LIST = [
  ["grass", "Grass", "Nature"],
  ["dirt", "Dirt", "Nature"],
  ["stone", "Stone", "Nature"],
  ["cobble", "Cobblestone", "Nature"],
  ["mossy", "Mossy cobblestone", "Nature"],
  ["gravel", "Gravel", "Nature"],
  ["sand", "Sand", "Nature"],
  ["sandstone", "Sandstone", "Nature"],
  ["clay", "Terracotta", "Nature"],
  ["snow", "Snow", "Nature"],
  ["ice", "Ice", "Nature", { see: true }],
  ["water", "Water", "Nature", { see: true }],
  ["moss", "Moss", "Nature"],
  ["leaves", "Leaves", "Nature", { see: true }],
  ["autumn", "Autumn leaves", "Nature", { see: true }],
  ["blossom", "Blossom", "Nature", { see: true }],
  ["plumleaves", "Plum leaves", "Nature", { see: true }],
  ["log", "Oak log", "Nature"],
  ["birchlog", "Birch log", "Nature"],
  ["oak", "Oak planks", "Building"],
  ["darkoak", "Dark planks", "Building"],
  ["birch", "Birch planks", "Building"],
  ["bricks", "Bricks", "Building"],
  ["stonebricks", "Stone bricks", "Building"],
  ["pavement", "Pavement", "Building"],
  ["mossybricks", "Mossy bricks", "Building"],
  ["bookshelf", "Bookshelf", "Building"],
  ["bed", "Bed", "Building", { item: true }],
  ["pin", "Map pin", "Building", { item: true }],
  ["bin", "Recycling bin", "Building", { item: true }],
  ["glass", "Glass", "Building", { see: true }],
  ["white", "White", "Colours"],
  ["lightgray", "Light grey", "Colours"],
  ["gray", "Grey", "Colours"],
  ["black", "Black", "Colours"],
  ["red", "Red", "Colours"],
  ["orange", "Orange", "Colours"],
  ["yellow", "Yellow", "Colours"],
  ["lime", "Lime", "Colours"],
  ["green", "Green", "Colours"],
  ["teal", "Teal", "Colours"],
  ["lightblue", "Light blue", "Colours"],
  ["blue", "Blue", "Colours"],
  ["purple", "Purple", "Colours"],
  ["magenta", "Magenta", "Colours"],
  ["pink", "Pink", "Colours"],
  ["brown", "Brown", "Colours"],
  ["andesite", "Andesite", "Caves"],
  ["deepslate", "Deep slate", "Caves"],
  ["tuff", "Tuff", "Caves"],
  ["calcite", "Calcite", "Caves"],
  ["dripstone", "Dripstone", "Caves"],
  ["stalactite", "Stalactite", "Caves", { item: true }],
  ["stalagmite", "Stalagmite", "Caves", { item: true }],
  ["coalore", "Coal ore", "Caves"],
  ["ironore", "Iron ore", "Caves"],
  ["copperore", "Copper ore", "Caves"],
  ["goldore", "Gold ore", "Caves"],
  ["gemore", "Gem ore", "Caves"],
  ["amethyst", "Amethyst", "Caves"],
  ["glowmoss", "Glow moss", "Caves", { light: 7 }],
  ["crystal", "Crystal cluster", "Caves", { item: true, light: 9 }],
  ["emberrock", "Ember rock", "Inferno"],
  ["basalt", "Basalt", "Inferno"],
  ["charstone", "Char stone", "Inferno"],
  ["ash", "Ash", "Inferno"],
  ["infernalbricks", "Infernal bricks", "Inferno"],
  ["magma", "Magma", "Inferno", { light: 10 }],
  ["lava", "Lava", "Inferno", { light: 15 }],
  ["glowfungus", "Glow fungus", "Inferno", { light: 13 }],
  ["fire", "Fire", "Inferno", { item: true, light: 12 }],
  ["palestone", "Pale stone", "Void"],
  ["palebricks", "Pale bricks", "Void"],
  ["obsidian", "Obsidian", "Void"],
  ["asteroid", "Asteroid rock", "Void"],
  ["violetbricks", "Violet bricks", "Void"],
  ["voidcrystal", "Void crystal", "Void", { light: 14 }],
  ["voidbloom", "Void bloom", "Void", { item: true, light: 5 }],
  ["amber", "Amber", "Light", { light: 10 }],
  ["lamp", "Lamp", "Light", { light: 15 }],
  ["lantern", "Lantern", "Light", { item: true, light: 13 }],
  ["torch", "Torch", "Light", { item: true, light: 12 }],
] as const satisfies readonly (readonly [string, string, BlockGroup, Opts?])[];

export type BlockId = (typeof LIST)[number][0];

export type BlockDef = {
  id: BlockId;
  name: string;
  group: BlockGroup;
  index: number;
  /** Blocks movement (mobs walk on these). */
  solid: boolean;
  /** Light and the layers behind pass through. */
  see: boolean;
  item: boolean;
  light: number;
};

export const BLOCK_IDS: readonly BlockId[] = LIST.map((entry) => entry[0]);

export const BLOCKS = Object.fromEntries(
  LIST.map((entry, index) => {
    const opts: Opts = (entry as readonly unknown[])[3] ?? {};
    const def: BlockDef = {
      id: entry[0],
      name: entry[1],
      group: entry[2],
      index,
      solid: !opts.item,
      see: !!opts.see || !!opts.item,
      item: !!opts.item,
      light: opts.light ?? 0,
    };
    return [entry[0], def];
  }),
) as Record<BlockId, BlockDef>;

export function isBlockId(value: unknown): value is BlockId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(BLOCKS, value);
}

/** Opaque blocks stop light and hide the layers behind them. */
export function opaque(id: BlockId | null | undefined): boolean {
  return !!id && BLOCKS[id].solid && !BLOCKS[id].see;
}

/** Solid blocks are what mobs stand on and bump into. */
export function solid(id: BlockId | null | undefined): boolean {
  return !!id && BLOCKS[id].solid;
}

export const DEFAULT_HOTBAR: readonly BlockId[] = ["grass", "cobble", "oak", "stonebricks", "glass", "white", "blue", "lamp", "torch"];
