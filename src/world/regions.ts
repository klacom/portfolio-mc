import { opaque, solid, type BlockId } from "./blocks";
import { EMPTY_CELL, type Cell } from "./cell";

/**
 * The published (authored) world: five regions, one per page section, each its own biome.
 *
 * Coordinates are integer cells. Column 0 is the section's horizontal centre; row 0 is the top of
 * the section's ground band, and negative rows rise above it. Underground biomes also hang a ceiling
 * from the section's top row, which depends on layout and is passed in as `top`.
 *
 * Bump WORLD_VERSION only for an incompatible redesign: it clears visitors' saved edits.
 */
export const WORLD_VERSION = 2;
export const GROUND_ROWS = 4;
export const MIN_ROW = -60;
export const MAX_ABS_COL = 48;
export const DEFAULT_TOP = -16;

/** The home page's sections, top to bottom. Neighbouring sections blend into each other. */
export const PAGE_REGIONS = ["intro", "projects", "skills", "about", "contact"] as const;
/** Each case study page is a world of its own. Unknown project pages share the generic one. */
export const CASE_REGIONS = ["ecopin", "plooy", "tanggolin", "casestudy"] as const;
export const REGION_IDS = [...PAGE_REGIONS, ...CASE_REGIONS] as const;
export type RegionId = (typeof REGION_IDS)[number];
export type Biome = "overworld" | "cave" | "crystal" | "inferno" | "void" | "city" | "space" | "grove";
/** Biomes under an open sky: sunlight, day and night. */
export const OUTDOOR: ReadonlySet<Biome> = new Set<Biome>(["overworld", "city"]);

export function caseRegion(slug: string): RegionId {
  return (CASE_REGIONS as readonly string[]).includes(slug) && slug !== "casestudy" ? (slug as RegionId) : "casestudy";
}

export function isRegionId(value: unknown): value is RegionId {
  return typeof value === "string" && (REGION_IDS as readonly string[]).includes(value);
}

export function inWorldBounds(x: number, y: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && x >= -MAX_ABS_COL && x < MAX_ABS_COL && y >= MIN_ROW && y < GROUND_ROWS;
}

/** Deterministic hash → [0, 1). */
export function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

type Part = { b?: BlockId | null; m?: BlockId | null; f?: BlockId | null };

type RegionDef = {
  id: RegionId;
  biome: Biome;
  seed: number;
  surface: (x: number) => number;
  ground: (x: number, y: number, depth: number) => Cell;
  fill: (x: number, y: number) => Cell;
  walls?: (x: number, y: number) => Part | null;
  ceiling?: (x: number, depthFromTop: number) => Part | null;
  authored: Map<string, Part>;
  /** Rock at the top of this region, mixed into the bottom rows of the region above. */
  roofRock: (x: number, y: number) => Part;
  /** Rock at the bottom of this region, mixed into the top rows of the region below. */
  floorRock: (x: number, y: number) => Part;
};

const k = (x: number, y: number) => `${x}:${y}`;
const hill = (x: number, centre: number, width: number, height: number) => height * Math.max(0, 1 - ((x - centre) / width) ** 2);
const cell = (b: BlockId | null, m: BlockId | null, f: BlockId | null = null): Cell => ({ b, m, f });
function pick<T>(h: number, weighted: [T, number][]): T {
  let acc = 0;
  for (const [v, w] of weighted) {
    acc += w;
    if (h < acc) return v;
  }
  return weighted[weighted.length - 1]![0];
}

class Scene {
  authored = new Map<string, Part>();
  constructor(readonly surface: (x: number) => number) {}

  set(x: number, y: number, part: Part) {
    this.authored.set(k(x, y), { ...this.authored.get(k(x, y)), ...part });
  }
  rect(x0: number, x1: number, y0: number, y1: number, part: Part) {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) this.set(x, y, part);
  }
  tree(x: number, height: number, wood: BlockId, leaf: BlockId, layer: "m" | "f" = "m") {
    const s = this.surface(x);
    const top = s - height;
    for (let y = s - 1; y >= top; y--) this.set(x, y, { [layer]: wood });
    for (let dx = -1; dx <= 1; dx++) this.set(x + dx, top - 2, { [layer]: leaf });
    for (let dx = -2; dx <= 2; dx++) this.set(x + dx, top - 1, { [layer]: leaf });
    for (let dx = -2; dx <= 2; dx++) if (dx) this.set(x + dx, top, { [layer]: leaf });
    if (layer === "m") {
      this.set(x - 1, top + 1, { b: leaf });
      this.set(x + 1, top + 1, { b: leaf });
      this.set(x - 3, top - 1, { b: leaf });
      this.set(x + 3, top - 1, { b: leaf });
    }
  }
}

// ---------------------------------------------------------------- overworld (hero)
function overworld(): RegionDef {
  const surface = (x: number) => -Math.round(Math.max(hill(x, -19, 9, 5), hill(x, -31, 6, 3), hill(x, 17, 8, 6), hill(x, 29, 7, 4)));
  const s = new Scene(surface);
  const seed = 11;

  // Distant hills in the back layer, rising above the near ones.
  const backHill = (x: number) => Math.round(Math.max(hill(x, -22, 13, 9), hill(x, 22, 12, 10), hill(x, 40, 8, 7)));
  for (let x = -40; x <= 44; x++) {
    const top = -backHill(x);
    for (let y = top; y < surface(x); y++) s.set(x, y, { b: y === top ? "grass" : "dirt" });
  }
  // A far-off watchtower with a lit window on the left hill.
  s.rect(-25, -23, -14, -10, { b: "stonebricks" });
  s.set(-25, -15, { b: "stonebricks" });
  s.set(-23, -15, { b: "stonebricks" });
  s.set(-24, -12, { b: "lamp" });

  // A pond in the valley.
  s.rect(-5, -2, 0, 0, { m: "water", b: "dirt" });
  s.rect(-4, -3, 1, 1, { m: "water", b: "dirt" });
  s.set(-6, 0, { m: "sand" });
  s.set(-1, 0, { m: "sand" });
  s.set(-5, 1, { m: "sand" });
  s.set(-2, 1, { m: "sand" });
  s.rect(-4, -3, 2, 2, { m: "sand" });

  // A cottage on the right hill: a timber frame in the middle layer, its rooms in the back layer.
  s.rect(14, 20, -7, -7, { m: "oak", b: "oak" });
  s.set(14, -6, { m: "cobble", b: "dirt" });
  s.set(20, -6, { m: "cobble", b: "dirt" });
  for (let y = -10; y <= -8; y++) {
    s.set(20, y, { m: "log", b: "log" });
    for (let x = 15; x <= 19; x++) s.set(x, y, { b: "oak", m: null });
  }
  s.set(14, -10, { m: "log", b: "log" });
  s.set(14, -9, { m: null, b: "darkoak" });
  s.set(14, -8, { m: null, b: "darkoak" });
  s.set(17, -9, { b: "glass" });
  s.set(18, -9, { b: "glass" });
  s.set(19, -8, { m: "bookshelf" });
  s.set(19, -9, { m: "bookshelf" });
  s.set(16, -10, { m: "lantern" });
  s.set(15, -8, { m: "bed" });
  s.rect(13, 21, -11, -11, { m: "darkoak" });
  s.rect(14, 20, -12, -12, { m: "darkoak", b: "darkoak" });
  s.rect(15, 19, -13, -13, { m: "darkoak", b: "darkoak" });
  s.rect(16, 18, -14, -14, { m: "darkoak" });
  s.set(17, -15, { m: "darkoak" });
  s.set(19, -14, { m: "bricks" });
  s.set(19, -15, { m: "bricks" });
  s.set(13, -10, { m: "lantern" });
  s.set(21, -10, { f: "leaves" });
  s.set(21, -9, { f: "leaves" });

  s.tree(-14, 5, "log", "leaves");
  s.tree(-23, 5, "birchlog", "leaves");
  s.tree(-10, 4, "log", "blossom");
  s.tree(25, 5, "birchlog", "autumn");
  s.tree(31, 5, "log", "leaves");
  s.tree(-33, 4, "log", "autumn");
  // Front-layer bushes, so the valley has depth in front of the page text too.
  s.set(-7, -1, { f: "leaves" });
  s.set(-6, -1, { f: "leaves" });
  s.set(-6, -2, { f: "blossom" });
  s.set(7, -1, { f: "autumn" });
  s.set(8, -1, { f: "leaves" });
  s.set(9, -1, { m: "torch" });

  const deepStone = (x: number, y: number): BlockId => {
    const h = hash2(x, y, seed);
    return h < 0.05 ? "coalore" : h < 0.075 ? "ironore" : "stone";
  };
  return {
    id: "intro",
    biome: "overworld",
    seed,
    surface,
    ground: (x, y, d) => {
      if (d === 0) return cell("dirt", "grass");
      if (d <= 2) return cell("dirt", "dirt");
      return cell("stone", deepStone(x, y));
    },
    fill: () => EMPTY_CELL,
    authored: s.authored,
    roofRock: (x, y) => ({ b: "dirt", m: hash2(x, y, seed + 3) < 0.5 ? "dirt" : "grass" }),
    floorRock: (x, y) => ({ b: "stone", m: hash2(x, y, seed + 4) < 0.25 ? "dirt" : deepStone(x, y) }),
  };
}

// ---------------------------------------------------------------- shared underground helpers
type Rock = (x: number, y: number) => BlockId;
const wallStart = (y: number, seed: number) => 13 + Math.floor(hash2(0, y, seed + 1) * 2.6);

function underground(opts: {
  id: RegionId;
  biome: Biome;
  seed: number;
  surface: (x: number) => number;
  back: Rock;
  rock: Rock;
  deep: Rock;
  top: (x: number, y: number) => BlockId;
  wallExtra?: (x: number, y: number, edge: boolean) => BlockId | null;
  hanging: (x: number, h: number) => BlockId | null;
  frontHanging?: BlockId;
  scene: (s: Scene) => void;
  backFill?: (x: number, y: number) => BlockId | null;
}): RegionDef {
  const s = new Scene(opts.surface);
  opts.scene(s);
  const { seed } = opts;
  return {
    id: opts.id,
    biome: opts.biome,
    seed,
    surface: opts.surface,
    ground: (x, y, d) => cell(opts.back(x, y), d === 0 ? opts.top(x, y) : d <= 1 ? opts.rock(x, y) : opts.deep(x, y)),
    fill: (x, y) => cell(opts.backFill ? opts.backFill(x, y) : opts.back(x, y), null),
    walls: (x, y) => {
      const w = wallStart(y, seed);
      if (Math.abs(x) < w) return null;
      const extra = opts.wallExtra?.(x, y, Math.abs(x) === w);
      return { b: opts.back(x, y), m: extra ?? opts.rock(x, y) };
    },
    ceiling: (x, d) => {
      const h = hash2(x, 0, seed + 2);
      if (d < 2) return { b: opts.back(x, d), m: opts.rock(x, d - 40) };
      if (d === 2) {
        if (h < 0.22) return { m: opts.rock(x, d - 40) };
        if (h < 0.42) return { m: opts.hanging(x, h) };
        if (opts.frontHanging && Math.abs(x) >= 9 && h > 0.88) return { f: opts.frontHanging };
      }
      if (d === 3 && h < 0.22 && hash2(x, 1, seed + 3) < 0.6) return { m: opts.hanging(x, h) };
      return null;
    },
    authored: s.authored,
    roofRock: (x, y) => ({ b: opts.back(x, y), m: opts.rock(x, y - 40) }),
    floorRock: (x, y) => ({ b: opts.back(x, y), m: opts.deep(x, y) }),
  };
}

// ---------------------------------------------------------------- cave (projects)
function cave(): RegionDef {
  const seed = 23;
  const surface = (x: number) => -Math.round(Math.max(hill(x, -15, 4, 2), hill(x, 14, 5, 2)));
  const ore = (x: number, y: number): BlockId | null => {
    const h = hash2(x, y, seed + 9);
    return h < 0.05 ? "coalore" : h < 0.08 ? "ironore" : h < 0.1 ? "copperore" : h < 0.11 ? "goldore" : h < 0.115 ? "gemore" : null;
  };
  const rock: Rock = (x, y) => ore(x, y) ?? pick(hash2(x >> 1, y >> 1, seed), [["stone", 0.55], ["andesite", 0.27], ["tuff", 0.1], ["deepslate", 0.08]]);
  return underground({
    id: "projects",
    biome: "cave",
    seed,
    surface,
    back: (x, y) => {
      const h = hash2(Math.floor(x / 3), Math.floor(y / 3), seed);
      return hash2(x, y, seed + 4) < 0.04 ? "coalore" : h < 0.5 ? "stone" : h < 0.78 ? "andesite" : "deepslate";
    },
    rock,
    deep: (x, y) => ore(x, y) ?? (hash2(x, y, seed + 5) < 0.75 ? "deepslate" : "tuff"),
    top: (x, y) => pick(hash2(x, y, seed + 6), [["stone", 0.5], ["andesite", 0.25], ["gravel", 0.12], ["tuff", 0.13]]),
    wallExtra: (x, y, edge) => (edge && hash2(x, y, seed + 7) < 0.22 ? "glowmoss" : null),
    hanging: () => "stalactite",
    frontHanging: "stalactite",
    scene: (s) => {
      // Two timber mine supports with lanterns, like an old mine shaft.
      for (const [a, b] of [[-10, -6], [6, 10]] as const) {
        for (let y = -3; y <= -1; y++) {
          s.set(a, y, { m: "log" });
          s.set(b, y, { m: "log" });
        }
        s.rect(a - 1, b + 1, -4, -4, { m: "oak" });
        s.set((a + b) / 2, -3, { m: "lantern" });
      }
      // A lava pocket by the left wall and a few stalagmites.
      s.rect(-12, -11, 0, 0, { m: "lava", b: "deepslate" });
      s.set(-12, 1, { m: "lava", b: "deepslate" });
      s.set(-4, -1, { m: "stalagmite" });
      s.set(3, -1, { m: "torch" });
      s.set(-2, -1, { m: "torch" });
      // Front-layer rocks in the bottom right corner.
      s.set(12, -1, { f: "andesite" });
      s.set(12, -2, { f: "andesite" });
      s.set(11, -1, { f: "stone" });
      s.set(-13, -1, { f: "stalagmite" });
    },
  });
}

// ---------------------------------------------------------------- crystal cavern (skills)
function crystal(): RegionDef {
  const seed = 37;
  const surface = (x: number) => -Math.round(Math.max(hill(x, -13, 3, 2), hill(x, 13, 3, 2)));
  const rock: Rock = (x, y) => pick(hash2(x >> 1, y >> 1, seed), [["calcite", 0.42], ["tuff", 0.4], ["amethyst", 0.1], ["deepslate", 0.08]]);
  return underground({
    id: "skills",
    biome: "crystal",
    seed,
    surface,
    back: (x, y) => pick(hash2(Math.floor(x / 3), Math.floor(y / 2), seed), [["tuff", 0.45], ["calcite", 0.35], ["amethyst", 0.2]]),
    rock,
    deep: (x, y) => (hash2(x, y, seed + 5) < 0.7 ? "deepslate" : "tuff"),
    top: (x, y) => (hash2(x, y, seed + 6) < 0.8 ? "moss" : "calcite"),
    wallExtra: (x, y, edge) => (edge && hash2(x, y, seed + 7) < 0.25 ? "glowmoss" : null),
    hanging: (x) => (hash2(x, 5, seed) < 0.5 ? "crystal" : "stalactite"),
    frontHanging: "crystal",
    scene: (s) => {
      // Two geodes: calcite shells with amethyst inside, lit by crystal clusters.
      for (const cx of [-10, 10]) {
        for (let dx = -2; dx <= 2; dx++) for (let y = -4; y <= -1; y++) {
          const shell = Math.abs(dx) === 2 || y === -4;
          s.set(cx + dx, y, shell ? { m: "calcite", b: "calcite" } : { m: null, b: "amethyst" });
        }
        s.set(cx, -1, { m: "crystal" });
        s.set(cx - 1, -3, { m: "crystal" });
      }
      s.set(-1, -1, { m: "crystal" });
      s.set(5, -1, { m: "glowmoss" });
      s.set(-12, -5, { f: "crystal" });
    },
  });
}

// ---------------------------------------------------------------- inferno (about)
function inferno(): RegionDef {
  const seed = 53;
  const surface = () => 0;
  const rock: Rock = (x, y) => (hash2(x, y, seed + 8) < 0.06 ? "magma" : pick(hash2(x >> 1, y >> 1, seed), [["emberrock", 0.7], ["charstone", 0.2], ["basalt", 0.1]]));
  const sea = (x: number) => Math.abs(x) <= 12;
  const def = underground({
    id: "about",
    biome: "inferno",
    seed,
    surface,
    back: () => "charstone",
    backFill: (x, y) => {
      if (hash2(Math.floor(x / 5), 0, seed + 3) < 0.35 && Math.abs(x) % 5 === 2) return "basalt";
      const h = hash2(Math.floor(x / 3), Math.floor(y / 3), seed);
      return h < 0.45 ? "emberrock" : h < 0.6 ? "charstone" : null;
    },
    rock,
    deep: (x, y) => (hash2(x, y, seed + 5) < 0.1 ? "magma" : "charstone"),
    top: (x, y) => rock(x, y),
    wallExtra: (x, y, edge) => (edge && hash2(x, y, seed + 7) < 0.15 ? "glowfungus" : null),
    hanging: (x) => (hash2(x, 3, seed) < 0.45 ? "glowfungus" : "basalt"),
    scene: (s) => {
      // A brick bridge over the lava, with fires on it.
      s.rect(-12, 12, -2, -2, { m: "infernalbricks" });
      for (const x of [-10, -3, 3, 10]) s.set(x, -1, { m: "infernalbricks", b: "infernalbricks" });
      s.set(-7, -3, { m: "fire" });
      s.set(6, -3, { m: "fire" });
      // A ruined wall in the back layer at each side.
      s.rect(-12, -11, -9, -3, { b: "infernalbricks" });
      s.rect(11, 12, -10, -3, { b: "infernalbricks" });
      s.set(-12, -6, { b: null });
      s.set(12, -7, { b: "glowfungus" });
      // Basalt columns in the front layer.
      s.rect(-12, -12, -6, -3, { f: "basalt" });
      s.rect(12, 12, -7, -3, { f: "basalt" });
    },
  });
  const ground = def.ground;
  def.ground = (x, y, d) => (sea(x) && d <= 1 ? cell("charstone", "lava") : ground(x, y, d));
  // Chunks that drift down into the void are the red ember rock, so they read against the dark.
  def.floorRock = (x, y) => ({ b: "charstone", m: rock(x, y) });
  return def;
}

// ---------------------------------------------------------------- the void (contact)
function voidRealm(): RegionDef {
  const seed = 71;
  const surface = (x: number) => (Math.abs(x) <= 9 ? 0 : 99);
  const s = new Scene(surface);
  // Obsidian pillars crowned with crystals, like beacons.
  s.rect(-7, -7, -5, -1, { m: "obsidian" });
  s.set(-7, -6, { m: "voidcrystal" });
  s.rect(7, 7, -6, -1, { m: "obsidian" });
  s.set(7, -7, { m: "voidcrystal" });
  s.set(-4, -1, { m: "voidbloom" });
  s.set(4, -1, { m: "voidbloom" });
  // Floating islands: far ones in the back layer, near ones in the middle and front.
  for (const [x0, x1, y] of [[-19, -14, -6], [13, 18, -10], [20, 24, -4]] as const) {
    s.rect(x0, x1, y, y, { b: "palestone" });
    s.rect(x0 + 1, x1 - 1, y + 1, y + 1, { b: "palestone" });
  }
  s.rect(-14, -12, -2, -2, { m: "palestone", b: "palestone" });
  s.set(-13, -1, { m: "palestone", b: "palestone" });
  s.set(-13, -3, { m: "voidbloom" });
  s.rect(11, 13, -3, -3, { m: "palestone", b: "palestone" });
  s.set(12, -4, { m: "voidbloom" });
  s.set(-11, -8, { f: "palestone" });
  s.set(14, -6, { f: "obsidian" });
  s.rect(-1, 1, -3, -3, { b: "violetbricks" });
  return {
    id: "contact",
    biome: "void",
    seed,
    surface,
    ground: (x, y, d) => {
      const ax = Math.abs(x);
      const maxDepth = ax <= 3 ? 3 : ax <= 6 ? 2 : 1;
      if (d > maxDepth) return EMPTY_CELL;
      return cell("palestone", hash2(x, y, seed) < 0.06 ? "obsidian" : "palestone");
    },
    fill: () => EMPTY_CELL,
    authored: s.authored,
    roofRock: (x, y) => ({ m: hash2(x, y, seed + 2) < 0.88 ? "obsidian" : "palestone" }),
    floorRock: (x, y) => ({ m: hash2(x, y, seed + 3) < 0.6 ? "palestone" : "obsidian" }),
  };
}

// ---------------------------------------------------------------- case study worlds

function ellipse(s: Scene, cx: number, cy: number, rx: number, ry: number, part: (x: number, y: number, edgeTop: boolean) => Part) {
  for (let y = cy - ry; y <= cy + ry; y++) {
    for (let x = cx - rx; x <= cx + rx; x++) {
      const dx = (x - cx) / (rx + 0.5);
      const dy = (y - cy) / (ry + 0.5);
      if (dx * dx + dy * dy > 1) continue;
      const above = ((x - cx) / (rx + 0.5)) ** 2 + ((y - 1 - cy) / (ry + 0.5)) ** 2 > 1;
      s.set(x, y, part(x, y, above));
    }
  }
}

/** EcoPin: a tidy city park, white buildings with blue windows, map pins and recycling bins. */
function city(id: RegionId, seed: number): RegionDef {
  const surface = (x: number) => -Math.round(Math.max(hill(x, -27, 6, 2), hill(x, 27, 6, 2)));
  const s = new Scene(surface);
  const buildings: [number, number, number, BlockId][] = [
    [-31, -25, 22, "white"], [-23, -18, 14, "lightgray"], [-16, -10, 30, "white"],
    [10, 15, 18, "lightgray"], [17, 23, 34, "white"], [25, 31, 16, "lightgray"],
  ];
  for (const [x0, x1, h, wall] of buildings) {
    for (let x = x0; x <= x1; x++) {
      const base = surface(x);
      for (let y = base - h; y < base; y++) {
        const edge = x === x0 || x === x1;
        const roof = y === base - h;
        const window = !edge && !roof && (x - x0) % 2 === 1 && (base - y) % 3 !== 1 && y < base - 1;
        s.set(x, y, { b: roof ? "blue" : window ? (hash2(x, y, seed) < 0.25 ? "yellow" : "lightblue") : wall });
      }
    }
  }
  // A green map pin on two of the roofs, like the app's markers.
  s.set(-13, -31, { m: "pin" });
  s.set(20, -35, { m: "pin" });
  s.tree(-20, 5, "log", "leaves");
  s.tree(-12, 4, "birchlog", "leaves");
  s.tree(12, 5, "log", "leaves");
  s.tree(21, 4, "birchlog", "blossom");
  for (const x of [-24, -16, 9, 16, 26]) s.set(x, surface(x) - 1, { m: x % 2 ? "bin" : "pin" });
  s.set(-9, -1, { f: "leaves" });
  s.set(9, -1, { f: "leaves" });
  s.set(-26, surface(-26) - 1, { f: "leaves" });
  return {
    id, biome: "city", seed, surface,
    ground: (x, _y, d) => (d === 0 ? cell("dirt", Math.abs(x) <= 13 ? "pavement" : "grass") : d <= 2 ? cell("dirt", "dirt") : cell("stone", "stone")),
    fill: () => EMPTY_CELL,
    authored: s.authored,
    roofRock: () => ({ m: "stone" }),
    floorRock: () => ({ m: "stone" }),
  };
}

/** Plooy: mossy asteroids drifting in a green and purple nebula. */
function space(): RegionDef {
  const seed = 113;
  const surface = (x: number) => -Math.round(Math.max(hill(x, -22, 7, 3), hill(x, 21, 6, 4)));
  const s = new Scene(surface);
  const rocks: [number, number, number, number][] = [[-17, -9, 3, 1], [17, -15, 4, 2], [-13, -24, 2, 1], [19, -29, 3, 1], [-20, -36, 3, 2], [14, -42, 2, 1], [-15, -50, 3, 1], [20, -55, 2, 1]];
  rocks.forEach(([cx, cy, rx, ry], i) => {
    ellipse(s, cx, cy, rx, ry, (x, y, top) => ({ m: top ? "moss" : hash2(x, y, seed) < 0.12 ? "amethyst" : "asteroid", b: "asteroid" }));
    s.set(cx + (i % 2 ? 1 : -1), cy - ry - 1, { m: i % 3 === 0 ? "crystal" : "amber" });
  });
  // Far-off rocks in the back layer.
  for (const [cx, cy, rx] of [[-27, -18, 2], [26, -24, 2], [-9, -33, 1], [10, -12, 1], [-25, -46, 2]] as const) ellipse(s, cx, cy, rx, 1, () => ({ b: "asteroid" }));
  return {
    id: "plooy", biome: "space", seed, surface,
    ground: (x, y, d) => (d === 0 ? cell("asteroid", "moss") : cell("asteroid", hash2(x, y, seed + 1) < 0.08 ? "amethyst" : "asteroid")),
    fill: () => EMPTY_CELL,
    authored: s.authored,
    roofRock: () => ({ m: "asteroid" }),
    floorRock: () => ({ m: "asteroid" }),
  };
}

/** Tanggolin: a purple grove under a canopy of plum leaves, lit by amber. */
function grove(): RegionDef {
  const seed = 127;
  const surface = (x: number) => -Math.round(Math.max(hill(x, -17, 5, 2), hill(x, 16, 6, 2), hill(x, -29, 4, 3)));
  const s = new Scene(surface);
  for (const [x, h] of [[-11, 12], [-19, 18], [-27, 9], [11, 15], [19, 10], [27, 20]] as const) {
    const base = surface(x);
    for (let y = base - h; y < base; y++) s.set(x, y, { m: "log" });
    ellipse(s, x, base - h - 1, 3, 2, (cx, cy) => ({ m: hash2(cx, cy, seed) < 0.1 ? "amber" : "plumleaves" }));
    s.set(x + (x < 0 ? 1 : -1), base - Math.floor(h / 2), { m: "lantern" });
  }
  // Big leaves in the back layer, like the pattern behind the logo.
  for (let i = 0; i < 14; i++) {
    const cx = Math.round((hash2(i, 1, seed) - 0.5) * 60);
    const cy = -Math.round(4 + hash2(i, 2, seed) * 50);
    ellipse(s, cx, cy, 2, 1, () => ({ b: "plumleaves" }));
  }
  return {
    id: "tanggolin", biome: "grove", seed, surface,
    ground: (x, y, d) => (d === 0 ? cell("dirt", hash2(x, y, seed) < 0.15 ? "moss" : "grass") : d <= 2 ? cell("dirt", "dirt") : cell("stone", "stone")),
    fill: () => EMPTY_CELL,
    ceiling: (x, d) => {
      const h = hash2(x, 0, seed + 2);
      if (d < 2) return { b: "plumleaves", m: "plumleaves" };
      if (d === 2 && h < 0.45) return { m: h < 0.08 ? "amber" : "plumleaves" };
      if (d === 3 && h < 0.15) return { m: "plumleaves" };
      return null;
    },
    authored: s.authored,
    roofRock: () => ({ m: "plumleaves" }),
    floorRock: () => ({ m: "dirt" }),
  };
}

let cache: Record<RegionId, RegionDef> | null = null;
export function regions(): Record<RegionId, RegionDef> {
  cache ??= {
    intro: overworld(), projects: cave(), skills: crystal(), about: inferno(), contact: voidRealm(),
    ecopin: city("ecopin", 101), plooy: space(), tanggolin: grove(), casestudy: city("casestudy", 131),
  };
  return cache;
}

export const REGION_BIOME: Record<RegionId, Biome> = {
  intro: "overworld", projects: "cave", skills: "crystal", about: "inferno", contact: "void",
  ecopin: "city", plooy: "space", tanggolin: "grove", casestudy: "city",
};

/** Chance that a seam row borrows the neighbouring region's rock, by distance from the seam. */
const SEAM_BELOW = [0.18, 0.42]; // this region's last two rows, mixing in the next region
const SEAM_ABOVE = [0.55, 0.3, 0.12]; // this region's first three rows, mixing in the previous one
const SEAM_DEBRIS = [0.5, 0.22, 0.07]; // open regions (the void) get floating chunks instead

/** The authored cell before any visitor edits. `top` is the region's first visible row. */
export function publishedCell(region: RegionId, x: number, y: number, top: number = DEFAULT_TOP): Cell {
  if (!inWorldBounds(x, y)) return EMPTY_CELL;
  const all = regions();
  const r = all[region];
  const s = r.surface(x);
  let c = y >= s ? r.ground(x, y, y - s) : r.fill(x, y);
  if (y < s && r.walls) {
    const w = r.walls(x, y);
    if (w) c = { ...c, ...w };
  }
  if (r.ceiling && y >= top && y < s) {
    const ce = r.ceiling(x, y - top);
    if (ce) c = { ...c, ...ce };
  }
  // Sections meet in a dithered band of mixed rock instead of a straight line.
  const order = (PAGE_REGIONS as readonly RegionId[]).indexOf(region);
  const next = order < 0 ? undefined : PAGE_REGIONS[order + 1];
  const prev = order < 0 ? undefined : PAGE_REGIONS[order - 1];
  const below = y - (GROUND_ROWS - SEAM_BELOW.length);
  if (next && below >= 0 && opaque(c.m) && hash2(x, y, r.seed + 61) < SEAM_BELOW[below]!) c = { ...c, ...all[next].roofRock(x, y) };
  const d = y - top;
  if (prev && d >= 0 && d < SEAM_ABOVE.length && y < s) {
    const h = hash2(x, d, r.seed + 67);
    if (r.ceiling && opaque(c.m) && h < SEAM_ABOVE[d]!) c = { ...c, ...all[prev].floorRock(x, y) };
    else if (!r.ceiling && !c.m && h < SEAM_DEBRIS[d]!) c = { ...c, m: all[prev].floorRock(x, y).m ?? null };
  }
  const a = r.authored.get(k(x, y));
  if (a) c = { ...c, ...a };
  return c;
}

export type DecorKind =
  | "tallgrass" | "red" | "yellow" | "blue" | "pink" | "vine" | "mushroom" | "rail" | "pebbles" | "roots" | "cobweb"
  | "bud" | "glowvine" | "mosstuft" | "weeping" | "emberfungus" | "sprout";

/** Glowing decorations get a small halo. */
export const GLOWING_DECOR: ReadonlySet<DecorKind> = new Set<DecorKind>(["bud", "glowvine", "sprout"]);

/**
 * Small plants and details drawn in empty cells. They depend on the live world, so they appear
 * and disappear as visitors build.
 */
export function decorFor(region: RegionId, x: number, y: number, here: Cell, below: Cell, above: Cell): DecorKind | null {
  if (here.m || here.f) return null;
  const r = regions()[region];
  const h = hash2(x, y, r.seed + 31);
  const onFloor = solid(below.m) && !(below.m && (below.m === "water" || below.m === "lava"));
  const underCeiling = solid(above.m);
  switch (r.biome) {
    case "overworld":
      if (below.m === "grass" && h < 0.5) {
        return pick<DecorKind>(h / 0.5, [["tallgrass", 0.5], ["red", 0.13], ["yellow", 0.13], ["blue", 0.12], ["pink", 0.12]]);
      }
      if ((above.m === "leaves" || above.m === "autumn" || above.m === "blossom") && h < 0.3) return "vine";
      return null;
    case "cave":
      if (onFloor && y === -1 && Math.abs(x) <= 11 && r.surface(x) === 0) return "rail";
      if (onFloor && h < 0.22) return h < 0.08 ? "mushroom" : "pebbles";
      if (underCeiling && h < 0.22) return Math.abs(x) >= 11 ? "cobweb" : "roots";
      return null;
    case "crystal":
      if (onFloor && h < 0.38) return h < 0.16 ? "bud" : "mosstuft";
      if (underCeiling && h < 0.32) return "glowvine";
      return null;
    case "inferno":
      if (onFloor && below.m !== "infernalbricks" && h < 0.2) return "emberfungus";
      if (underCeiling && h < 0.32) return "weeping";
      return null;
    case "void":
      if (onFloor && below.m === "palestone" && h < 0.3) return "sprout";
      return null;
    case "city":
      if (below.m === "grass" && h < 0.45) return pick<DecorKind>(h / 0.45, [["tallgrass", 0.55], ["yellow", 0.15], ["blue", 0.15], ["red", 0.15]]);
      if ((above.m === "leaves" || above.m === "blossom") && h < 0.25) return "vine";
      return null;
    case "space":
      if (onFloor && below.m === "moss" && h < 0.45) return h < 0.15 ? "sprout" : "mosstuft";
      if (underCeiling && h < 0.35) return h < 0.12 ? "glowvine" : "vine";
      return null;
    case "grove":
      if (onFloor && (below.m === "grass" || below.m === "moss") && h < 0.5) return pick<DecorKind>(h / 0.5, [["tallgrass", 0.5], ["pink", 0.2], ["mushroom", 0.15], ["blue", 0.15]]);
      if (above.m === "plumleaves" && h < 0.4) return h < 0.2 ? "glowvine" : "vine";
      return null;
  }
}
