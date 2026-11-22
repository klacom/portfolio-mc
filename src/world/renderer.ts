import { BLOCKS, opaque, solid, type BlockId, type Layer } from "./blocks";
import { EMPTY_CELL, type Cell } from "./cell";
import { cheer, DEFS, drawBubble, frameOf, grab, moving, poke, release, setVisitor, SHADE_EYES, spawnFor, stepMob, type Effect, type Env, type Mob, type Spot as Place } from "./creatures";
import { computeLight, lightAt, type LightMap } from "./lighting";
import { decorFor, GLOWING_DECOR, GROUND_ROWS, hash2, inWorldBounds, MAX_ABS_COL, MIN_ROW, OUTDOOR, PAGE_REGIONS, REGION_BIOME, REGION_IDS, type Biome, type DecorKind, type RegionId } from "./regions";
import { SkyClock, skyLuminance, skyState, type SkyState } from "./sky";
import { soundPlacement, type Placement, type SoundKind } from "./sound";
import type { ActionResult, CellRef, WorldState } from "./state";
import { ATTACHED, getAnim, getAtlas, LAVA_FRAMES, mix, PULSING, SWAY_FRAMES, SWAYING, TEX, toBack, WATER_FRAMES, type Anim, type Atlas, type Facing, type RGB } from "./textures";

/**
 * Draws the world at pixel-art resolution (one canvas pixel per texel) and lets the browser scale
 * the canvas up, so a phone or a laptop without a GPU only fills a few hundred thousand pixels per
 * frame. Terrain is cached in 16×16-cell chunks with lighting baked in; a chunk is redrawn only when
 * something in or near it changes. Animated things (lava, water, flames, swaying plants, glints) are
 * listed per chunk when it bakes and drawn on top each frame. Ambient life runs at up to 30 frames
 * per second and pauses when the tab is hidden.
 */

export type EngineOptions = { buildMode: boolean; layer: Layer; block: BlockId; motion: boolean };
export type CellStatus = "ok" | "outside";
export type HoverLabel = { text: string; x: number; y: number; alert: boolean } | null;

const CH = 16; // cells per chunk side
const CHT = CH * TEX; // texels per chunk side
const GW = MAX_ABS_COL * 2;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const SUN_ARC = { cx: 7, rx: 6.5 };
/** The moon rises on the left, away from the centred hero text. */
const MOON_ARC = { cx: -12, rx: 6.5 };
/** Light levels for live-drawn plants. */
const PLANT_LEVELS = 8;

type Look = { dark: RGB; warm: RGB; ambient: number; haze: RGB; hazeA: number; bg: [string, string] };
const LOOK: Record<Biome, Look> = {
  overworld: { dark: [16, 12, 42], warm: [255, 172, 84], ambient: 0, haze: [212, 238, 249], hazeA: 0.14, bg: ["#3f97e0", "#2a1d14"] },
  cave: { dark: [5, 6, 12], warm: [255, 168, 80], ambient: 0.18, haze: [22, 26, 40], hazeA: 0.22, bg: ["#0c0e16", "#05060a"] },
  crystal: { dark: [10, 6, 22], warm: [196, 150, 255], ambient: 0.22, haze: [44, 26, 76], hazeA: 0.22, bg: ["#170d28", "#0a0614"] },
  inferno: { dark: [34, 4, 2], warm: [255, 124, 44], ambient: 0.3, haze: [110, 24, 12], hazeA: 0.26, bg: ["#4a0f0a", "#1a0503"] },
  void: { dark: [8, 3, 18], warm: [204, 140, 255], ambient: 0.38, haze: [34, 18, 56], hazeA: 0.28, bg: ["#0e0718", "#030206"] },
  city: { dark: [16, 12, 42], warm: [255, 172, 84], ambient: 0, haze: [212, 238, 249], hazeA: 0.14, bg: ["#3f97e0", "#2a1d14"] },
  space: { dark: [6, 6, 22], warm: [214, 236, 140], ambient: 0.44, haze: [30, 26, 70], hazeA: 0.26, bg: ["#0b0c26", "#05040f"] },
  grove: { dark: [26, 10, 52], warm: [255, 196, 90], ambient: 0.42, haze: [86, 52, 150], hazeA: 0.24, bg: ["#5b3cb0", "#2a1666"] },
};

/** The region above or below on the home page, if any. Case study pages stand alone. */
function neighbour(id: RegionId, dir: -1 | 1): RegionId | undefined {
  const i = (PAGE_REGIONS as readonly RegionId[]).indexOf(id);
  return i < 0 ? undefined : PAGE_REGIONS[i + dir];
}
/** Underground, the overworld's rock is lit like a dark cave. */
const OVERWORLD_ROCK: RGB = [12, 11, 38];

const GLOW: Partial<Record<BlockId, RGB>> = {
  lamp: [255, 190, 100], lantern: [255, 190, 100], torch: [255, 180, 90], fire: [255, 140, 50], lava: [255, 120, 30], magma: [255, 110, 30],
  glowfungus: [255, 170, 70], glowmoss: [180, 255, 120], crystal: [170, 140, 255], voidcrystal: [190, 150, 255], voidbloom: [240, 120, 220],
  amber: [255, 190, 80],
};
const DECOR_GLOW: RGB = [190, 160, 255];
const FLAMES = new Set<BlockId>(["torch", "lantern", "fire"]);
/** Shiny blocks catch the light now and then, in their own colour. */
const SHINE: Partial<Record<BlockId, RGB>> = {
  ironore: [255, 236, 214], copperore: [255, 196, 150], goldore: [255, 240, 150], gemore: [170, 255, 245], amethyst: [234, 206, 255],
  crystal: [226, 246, 255], voidcrystal: [244, 220, 255], obsidian: [196, 150, 255], ice: [222, 242, 255], glass: [255, 255, 255],
  amber: [255, 240, 190],
};
const LEAFY = new Set<BlockId>(["leaves", "autumn", "blossom", "plumleaves"]);

type Glow = { x: number; y: number; c: RGB; r: number; a: number; kind: "flame" | "lava" | "steady" };
/** An animated block, listed when its chunk bakes. */
type Live = { x: number; y: number; id: BlockId; layer: Layer; top: boolean; sky: number; blk: number };
type Plant = { x: number; y: number; kind: DecorKind; sky: number; blk: number };
type Spot = { x: number; y: number; id: BlockId; front: boolean };
type Chunk = {
  back: HTMLCanvasElement;
  front: HTMLCanvasElement;
  hasFront: boolean;
  dirty: boolean;
  baked: boolean;
  glows: Glow[];
  live: Live[];
  plants: Plant[];
  shiny: Spot[];
  leafy: Spot[];
  lavaTops: Spot[];
};
type Geom = { topTex: number; bottomTex: number; groundTex: number; cx: number };
type Region = {
  id: RegionId;
  biome: Biome;
  g: Geom | null;
  top: number;
  editTop: number;
  cy0: number;
  ch: number;
  cells: (Cell | undefined)[];
  light: LightMap | null;
  chunks: Map<number, Chunk>;
  ambient: Ambient[];
  bg: { key: string; canvas: HTMLCanvasElement } | null;
  spawned: boolean;
};
type Particle = { region: RegionId; x: number; y: number; vx: number; vy: number; size: number; c: RGB; layer: Layer; born: number; life: number; rest: boolean };
type Ambient = { x: number; y: number; vx: number; vy: number; age: number; life: number; c: RGB; size: number; phase: number; tall?: boolean };
/** Short-lived effects: glints on shiny blocks, falling leaves, lava bubbles, wind trails, shooting stars. */
type Spark = { kind: "glint" | "leaf" | "pop" | "wind" | "meteor" | "puff"; region: RegionId; x: number; y: number; vx: number; vy: number; age: number; life: number; c: RGB; front: boolean; phase: number; size: number };

const chunkKey = (cx: number, cy: number) => (cx + 64) * 256 + (cy + 64);
const curve = (l: number) => (l <= 0 ? 0 : Math.pow(l / 15, 0.9));
const rgb = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const canvas = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  return c;
};

export class WorldEngine {
  private readonly bctx: CanvasRenderingContext2D;
  private readonly fctx: CanvasRenderingContext2D;
  private readonly atlas: Atlas;
  private readonly anim: Anim;
  private readonly regions = new Map<RegionId, Region>();
  private readonly sky = new SkyClock();
  private skyNow: SkyState = skyState(this.sky.phi);
  private dpr = 1;
  private T = 3;
  private bw = 1;
  private bh = 1;
  private scrollTex = 0;
  private raf = 0;
  private destroyed = false;
  private wantFrame = false;
  private lastFrame = 0;
  private lastStep = 0;
  private frameCost = 8;
  private low = false;
  private particles: Particle[] = [];
  private sparks: Spark[] = [];
  private hover: CellRef | null = null;
  private cursor: CellRef | null = null;
  private focused = false;
  private flashUntil = 0;
  private flashTimer = 0;
  private glowCache = new Map<string, HTMLCanvasElement>();
  private plantSheets = new Map<Biome, { canvas: HTMLCanvasElement; rows: Map<DecorKind, number> }>();
  private leafSprite: HTMLCanvasElement | null = null;
  private scratch = canvas(CHT + 32, CHT + 32);
  private lightScratch = canvas(CHT / 2, CHT / 2);
  private zone = "";
  private skyTheme = "";
  private readonly unsubscribe: () => void;
  private mobs: Mob[] = [];
  private held: { id: number; dx: number; dy: number; samples: { x: number; y: number; t: number }[] } | null = null;
  private spotCache = new Map<string, Place[]>();
  private mobScratch = canvas(48, 48);
  private lastSound = 0;
  private lastAmbient = 0;
  /** Shout-outs still owed to a visitor because no creature was on screen when they sent their message. */
  private owedCheers = 0;
  private readonly env: Env;
  onLabel: (label: HoverLabel) => void = () => {};
  onSound: (kind: SoundKind, at?: Placement) => void = () => {};

  constructor(
    private readonly backCanvas: HTMLCanvasElement,
    private readonly frontCanvas: HTMLCanvasElement,
    private readonly world: WorldState,
    public opts: EngineOptions,
    night: boolean,
  ) {
    this.bctx = backCanvas.getContext("2d")!;
    this.fctx = frontCanvas.getContext("2d")!;
    this.atlas = getAtlas();
    this.anim = getAnim();
    this.sky.set(night);
    this.skyNow = skyState(this.sky.phi);
    for (const id of REGION_IDS) {
      this.regions.set(id, { id, biome: REGION_BIOME[id], g: null, top: 0, editTop: 0, cy0: 0, ch: 0, cells: [], light: null, chunks: new Map(), ambient: [], bg: null, spawned: false });
    }
    this.unsubscribe = world.subscribe((ref) => this.onEdit(ref));
    this.env = this.makeEnv();
    this.resize();
  }

  destroy() {
    this.destroyed = true;
    this.unsubscribe();
    window.clearTimeout(this.flashTimer);
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  setOptions(next: Partial<EngineOptions>) {
    this.opts = { ...this.opts, ...next };
    if (!this.opts.motion) this.sparks = [];
    if (!this.opts.buildMode) {
      this.hover = null;
      this.cursor = null;
      this.onLabel(null);
    }
    this.request();
  }

  setNight(night: boolean) {
    this.sky.toggle(night);
    this.request();
  }

  // ---------------------------------------------------------------- layout

  /** Integer texel scale keeps 16×16 art crisp at every device pixel ratio. */
  resize() {
    this.dpr = window.devicePixelRatio || 1;
    this.T = Math.max(1, Math.round(3 * this.dpr));
    const vw = Math.round(document.documentElement.clientWidth * this.dpr);
    const vh = Math.round(window.innerHeight * this.dpr);
    this.bw = Math.ceil(vw / this.T);
    this.bh = Math.ceil(vh / this.T) + 1;
    for (const c of [this.backCanvas, this.frontCanvas]) {
      c.width = this.bw;
      c.height = this.bh;
      c.style.width = `${(this.bw * this.T) / this.dpr}px`;
      c.style.height = `${(this.bh * this.T) / this.dpr}px`;
    }
    document.documentElement.style.setProperty("--cell", `${(TEX * this.T) / this.dpr}px`);
    for (const r of this.regions.values()) r.bg = null;
    this.measure();
  }

  /** Reads section positions from the page. Called on load, resize and layout changes, never per frame. */
  measure() {
    const sy = window.scrollY;
    const toTex = (cssY: number) => Math.round(((cssY + sy) * this.dpr) / this.T);
    document.querySelectorAll<HTMLElement>("[data-world-region]").forEach((el) => {
      const r = this.regions.get(el.dataset.worldRegion as RegionId);
      const ground = el.querySelector<HTMLElement>("[data-world-ground]");
      if (!r || !ground) return;
      const box = el.getBoundingClientRect();
      const g = ground.getBoundingClientRect();
      r.g = { topTex: toTex(box.top), bottomTex: toTex(box.bottom), groundTex: toTex(g.top), cx: Math.round(((box.left + box.width / 2) * this.dpr) / this.T) };
      const top = Math.max(MIN_ROW, Math.floor((r.g.topTex - r.g.groundTex) / TEX));
      r.editTop = Math.max(MIN_ROW, Math.ceil((r.g.topTex - r.g.groundTex) / TEX));
      if (top !== r.top || !r.cells.length) {
        r.top = top;
        this.world.setTop(r.id, top);
        r.cy0 = top - 1;
        r.ch = GROUND_ROWS - r.cy0;
        r.cells = new Array(GW * r.ch);
        r.light = null;
        r.bg = null;
        for (const c of r.chunks.values()) c.dirty = true;
      }
    });
    this.spotCache.clear();
    this.request();
  }

  // ---------------------------------------------------------------- world access

  private cell(r: Region, x: number, y: number): Cell {
    const iy = y - r.cy0;
    if (x < -MAX_ABS_COL || x >= MAX_ABS_COL || iy < 0 || iy >= r.ch) return this.world.getAt(r.id, x, y);
    const i = iy * GW + x + MAX_ABS_COL;
    return (r.cells[i] ??= this.world.getAt(r.id, x, y));
  }

  private lightOf(r: Region): LightMap {
    r.light ??= computeLight((x, y) => this.cell(r, x, y), r.biome, r.top);
    return r.light;
  }

  private onEdit(ref: CellRef | null) {
    this.spotCache.clear();
    if (!ref) {
      for (const r of this.regions.values()) {
        r.cells = new Array(GW * r.ch);
        r.light = null;
        for (const c of r.chunks.values()) c.dirty = true;
      }
      this.request();
      return;
    }
    const r = this.regions.get(ref.region)!;
    const iy = ref.y - r.cy0;
    if (iy >= 0 && iy < r.ch) r.cells[iy * GW + ref.x + MAX_ABS_COL] = this.world.get(ref);
    // Relight, and redraw only the chunks whose light actually changed.
    const before = r.light;
    r.light = null;
    const after = this.lightOf(r);
    this.dirtyAround(r, ref.x, ref.y);
    if (before && before.w === after.w && before.h === after.h) {
      for (let i = 0; i < after.sky.length; i++) {
        if (before.sky[i] !== after.sky[i] || before.block[i] !== after.block[i]) {
          this.dirtyAround(r, (i % after.w) + after.x0, Math.floor(i / after.w) + after.y0);
        }
      }
    } else for (const c of r.chunks.values()) c.dirty = true;
    this.request();
  }

  private dirtyAround(r: Region, x: number, y: number) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const c = r.chunks.get(chunkKey(Math.floor((x + dx) / CH), Math.floor((y + dy) / CH)));
        if (c) c.dirty = true;
      }
    }
  }

  // ---------------------------------------------------------------- picking and geometry

  /** Viewport CSS pixels → cell. Uses the same transform as drawing. */
  refAt(clientX: number, clientY: number): CellRef | null {
    const tx = (clientX * this.dpr) / this.T;
    const ty = (clientY * this.dpr + this.remainder()) / this.T;
    for (const r of this.regions.values()) {
      if (!r.g) continue;
      const top = r.g.topTex - this.scrollTex;
      const bottom = r.g.bottomTex - this.scrollTex;
      if (ty < top || ty >= bottom) continue;
      return { region: r.id, x: Math.floor((tx - r.g.cx) / TEX), y: Math.floor((ty - (r.g.groundTex - this.scrollTex)) / TEX) };
    }
    return null;
  }

  status(ref: CellRef): CellStatus {
    const r = this.regions.get(ref.region);
    if (!r?.g || !inWorldBounds(ref.x, ref.y) || ref.y < r.editTop) return "outside";
    return "ok";
  }

  /** Cell bounds in viewport CSS pixels. */
  cellRect(ref: CellRef) {
    const r = this.regions.get(ref.region);
    if (!r?.g) return null;
    const left = ((r.g.cx + ref.x * TEX) * this.T) / this.dpr;
    const top = ((r.g.groundTex - this.scrollTex + ref.y * TEX) * this.T - this.remainder()) / this.dpr;
    const size = (TEX * this.T) / this.dpr;
    return { left, top, right: left + size, bottom: top + size };
  }

  /** Editable rows and on-screen columns of a region, for keyboard movement. */
  bounds(region: RegionId) {
    const r = this.regions.get(region);
    if (!r?.g) return null;
    return { top: r.editTop, bottom: GROUND_ROWS - 1, left: Math.ceil(-r.g.cx / TEX), right: Math.floor((this.bw - r.g.cx) / TEX) - 1 };
  }

  regionOrder(): RegionId[] {
    return [...this.regions.values()].filter((r) => r.g).sort((a, b) => a.g!.topTex - b.g!.topTex).map((r) => r.id);
  }

  /** The region in the middle of the viewport. */
  centreRegion(): RegionId | null {
    const mid = this.scrollTex + this.bh / 2;
    for (const r of this.regions.values()) if (r.g && mid >= r.g.topTex && mid < r.g.bottomTex) return r.id;
    return null;
  }

  setHover(ref: CellRef | null) {
    if (ref && this.hover && ref.region === this.hover.region && ref.x === this.hover.x && ref.y === this.hover.y) return;
    this.hover = ref;
    this.request();
  }

  setCursor(ref: CellRef | null) {
    this.cursor = ref;
    this.request();
  }

  getCursor() {
    return this.cursor;
  }

  setFocused(focused: boolean) {
    this.focused = focused;
    this.request();
  }

  // ---------------------------------------------------------------- feedback

  /** Particles after an action: chips of the block's own pixels, or a puff of dust. */
  feedback(result: ActionResult) {
    if (result.kind === "taken" || result.kind === "limit") {
      // One redraw now shows the red outline and one when it ends clears it; nothing needs drawing between.
      this.flashUntil = performance.now() + 400;
      window.clearTimeout(this.flashTimer);
      this.flashTimer = window.setTimeout(() => this.request(), 410);
      this.request();
      return;
    }
    if (result.kind !== "placed" && result.kind !== "broke") return;
    const colours = this.atlas.colours[result.block];
    if (!colours?.length) return;
    const now = performance.now();
    const n = result.kind === "broke" ? (this.low ? 10 : 16) : this.low ? 5 : 9;
    const { x, y } = result.ref;
    for (let i = 0; i < n; i++) {
      let c = colours[Math.floor(Math.random() * colours.length)]!;
      if (result.layer === "b") c = toBack(c);
      if (result.kind === "placed") c = mix(c, [235, 230, 220], 0.25);
      const side = Math.random() < 0.5 ? -1 : 1;
      this.particles.push(
        result.kind === "broke"
          ? { region: result.ref.region, x: (x + 0.2 + Math.random() * 0.6) * TEX, y: (y + 0.2 + Math.random() * 0.6) * TEX, vx: (Math.random() - 0.5) * 85, vy: -(30 + Math.random() * 90), size: Math.random() < 0.7 ? 2 : 3, c, layer: result.layer, born: now, life: 750 + Math.random() * 550, rest: false }
          : { region: result.ref.region, x: (x + (side < 0 ? 0.05 : 0.95)) * TEX, y: (y + 0.85 + Math.random() * 0.15) * TEX, vx: side * (20 + Math.random() * 50), vy: -(10 + Math.random() * 35), size: Math.random() < 0.5 ? 2 : 1, c, layer: result.layer, born: now, life: 420 + Math.random() * 260, rest: false },
      );
    }
    this.request();
  }

  // ---------------------------------------------------------------- frame loop

  private remainder() {
    const scrollDev = Math.round(window.scrollY * this.dpr);
    return scrollDev - Math.floor(scrollDev / this.T) * this.T;
  }

  /** Asks for a redraw on the next screen refresh. */
  request() {
    this.wantFrame = true;
    this.schedule();
  }

  /**
   * The one place a frame is scheduled, so there is only ever one loop. (Creature effects ask for frames while
   * a frame is being drawn; when the loop also scheduled its own next frame, each of those started a second
   * loop that never stopped, and every forced redraw then ran once per loop.)
   */
  private schedule() {
    if (!this.raf && !this.destroyed) this.raf = requestAnimationFrame(this.loop);
  }

  private animating() {
    return this.opts.motion || this.particles.length > 0 || this.sparks.length > 0 || this.sky.moving || this.mobs.some(moving);
  }

  private loop = (now: number) => {
    this.raf = 0;
    if (document.hidden) return;
    const animate = this.animating();
    // Ambient life runs at up to 30 fps (20 on slow devices); input and scrolling draw immediately.
    const minGap = this.low ? 50 : 33;
    if (this.wantFrame || (animate && now - this.lastFrame >= minGap)) {
      this.wantFrame = false;
      const t0 = performance.now();
      this.draw(now);
      const cost = performance.now() - t0;
      this.frameCost = this.frameCost * 0.95 + cost * 0.05;
      if (!this.low && this.frameCost > 14) this.low = true;
      this.lastFrame = now;
    }
    if (animate || this.wantFrame) this.schedule();
  };

  resume() {
    this.request();
  }

  private draw(now: number) {
    const dt = Math.min(0.05, this.lastStep ? (now - this.lastStep) / 1000 : 0.016);
    this.lastStep = now;
    if (this.sky.step(dt * 1000)) {
      this.skyNow = skyState(this.sky.phi);
      for (const r of this.regions.values()) {
        if (!OUTDOOR.has(r.biome) || !r.g) continue;
        for (const c of r.chunks.values()) c.dirty = true;
        r.bg = null;
      }
    }
    const scrollDev = Math.round(window.scrollY * this.dpr);
    this.scrollTex = Math.floor(scrollDev / this.T);
    const rem = scrollDev - this.scrollTex * this.T;
    const shift = `translate3d(0,${-rem / this.dpr}px,0)`;
    this.backCanvas.style.transform = shift;
    this.frontCanvas.style.transform = shift;

    const b = this.bctx;
    const f = this.fctx;
    b.imageSmoothingEnabled = false;
    f.imageSmoothingEnabled = false;
    b.fillStyle = "#05040a";
    b.fillRect(0, 0, this.bw, this.bh);
    f.clearRect(0, 0, this.bw, this.bh);

    // Animation time stands still when animation is paused, so every frame is the same picture.
    const t = this.opts.motion ? now : 0;
    const step = this.opts.motion ? dt : 0;
    this.stepParticles(dt);
    this.stepSparks(dt);
    this.stepMobs(dt);
    let budget = this.lastFrame === 0 ? 999 : this.low ? 2 : 4;
    for (const r of this.regions.values()) {
      if (!r.g) continue;
      const top = r.g.topTex - this.scrollTex;
      const bottom = r.g.bottomTex - this.scrollTex;
      if (bottom <= 0 || top >= this.bh) continue;
      budget = this.drawRegion(r, top, bottom, budget, step, t);
    }
    if (budget <= 0) this.wantFrame = true;
    this.schedulePrefetch();
    this.drawHeldAndBubbles();
    this.drawOverlay(now);
    this.updateTheme();
  }

  private updateTheme() {
    const probe = this.scrollTex + Math.round((40 * this.dpr) / this.T);
    let zone = "overworld";
    for (const r of this.regions.values()) if (r.g && probe >= r.g.topTex && probe < r.g.bottomTex) zone = r.biome;
    const sky = skyLuminance(this.skyNow) < 0.52 ? "night" : "day";
    const root = document.documentElement;
    if (zone !== this.zone) root.dataset.zone = this.zone = zone;
    if (sky !== this.skyTheme) root.dataset.sky = this.skyTheme = sky;
  }

  // ---------------------------------------------------------------- regions

  private chunk(r: Region, cx: number, cy: number): Chunk {
    const key = chunkKey(cx, cy);
    let chunk = r.chunks.get(key);
    if (!chunk) {
      chunk = { back: canvas(CHT, CHT), front: canvas(CHT, CHT), hasFront: false, dirty: true, baked: false, glows: [], live: [], plants: [], shiny: [], leafy: [], lavaTops: [] };
      r.chunks.set(key, chunk);
    }
    return chunk;
  }

  /** Chunk coordinates covering a band of screen rows. */
  private chunkRange(r: Region, screenTop: number, screenBottom: number) {
    const ox = r.g!.cx;
    const oy = r.g!.groundTex - this.scrollTex;
    const xMin = Math.max(-MAX_ABS_COL, Math.floor(-ox / TEX));
    const xMax = Math.min(MAX_ABS_COL - 1, Math.floor((this.bw - ox) / TEX));
    const yMin = Math.max(r.top, Math.floor((screenTop - oy) / TEX));
    const yMax = Math.min(GROUND_ROWS - 1, Math.floor((screenBottom - 1 - oy) / TEX));
    if (yMin > yMax) return null;
    return { cx0: Math.floor(xMin / CH), cx1: Math.floor(xMax / CH), cy0: Math.floor(yMin / CH), cy1: Math.floor(yMax / CH) };
  }

  private idle = 0;

  /** Bakes chunks within a screen above and below the view during idle time, so scrolling never stalls. */
  private schedulePrefetch() {
    if (this.idle) return;
    const run = (deadline: { timeRemaining(): number }) => {
      this.idle = 0;
      for (const r of this.regions.values()) {
        if (!r.g) continue;
        const top = Math.max(r.g.topTex - this.scrollTex, -this.bh);
        const bottom = Math.min(r.g.bottomTex - this.scrollTex, this.bh * 2);
        if (bottom <= top) continue;
        const range = this.chunkRange(r, top, bottom);
        if (!range) continue;
        for (let cy = range.cy0; cy <= range.cy1; cy++) {
          for (let cx = range.cx0; cx <= range.cx1; cx++) {
            const chunk = this.chunk(r, cx, cy);
            if (chunk.baked && !chunk.dirty) continue;
            this.bake(r, chunk, cx, cy);
            if (deadline.timeRemaining() < 3) {
              this.schedulePrefetch();
              return;
            }
          }
        }
      }
    };
    const w = window as Window & { requestIdleCallback?: (cb: (d: { timeRemaining(): number }) => void, o?: { timeout: number }) => number };
    this.idle = w.requestIdleCallback ? w.requestIdleCallback(run, { timeout: 500 }) : window.setTimeout(() => run({ timeRemaining: () => 6 }), 120);
  }

  private drawRegion(r: Region, top: number, bottom: number, budget: number, dt: number, t: number): number {
    const b = this.bctx;
    const f = this.fctx;
    const ox = r.g!.cx;
    const oy = r.g!.groundTex - this.scrollTex;
    b.save();
    b.beginPath();
    b.rect(0, top, this.bw, bottom - top);
    b.clip();
    this.drawBackdrop(r, top, bottom, ox, oy, t);
    this.drawSparks(b, r, ox, oy, false, true);

    const placements: [Chunk, number, number][] = [];
    const range = this.chunkRange(r, Math.max(0, top), Math.min(this.bh, bottom));
    if (range) {
      for (let cy = range.cy0; cy <= range.cy1; cy++) {
        for (let cx = range.cx0; cx <= range.cx1; cx++) {
          const chunk = this.chunk(r, cx, cy);
          if (chunk.dirty && (budget > 0 || !chunk.baked)) {
            this.bake(r, chunk, cx, cy);
            budget--;
          }
          placements.push([chunk, ox + cx * CHT, oy + cy * CHT]);
        }
      }
    }
    for (const [chunk, x, y] of placements) b.drawImage(chunk.back, x, y);

    this.drawLive(b, r, placements, ox, oy, t, false);
    this.drawPlants(r, placements, ox, oy, t);
    this.drawMobs(r, ox, oy, t);
    this.drawParticles(b, r, ox, oy, "bm");
    if (dt > 0) this.spawnSparks(r, placements, top, bottom, ox, oy, dt);
    this.drawSparks(b, r, ox, oy, false);
    this.drawAmbient(r, ox, oy, top, bottom, dt, t);
    this.drawGlows(r, placements, ox, oy, t);
    b.restore();

    f.save();
    f.beginPath();
    f.rect(0, top, this.bw, bottom - top);
    f.clip();
    for (const [chunk, x, y] of placements) if (chunk.hasFront) f.drawImage(chunk.front, x, y);
    this.drawLive(f, r, placements, ox, oy, t, true);
    this.drawParticles(f, r, ox, oy, "f");
    this.drawSparks(f, r, ox, oy, true);
    this.drawFairies(r, ox, oy, t);
    f.restore();
    return budget;
  }

  private look(r: Region) {
    const base = LOOK[r.biome];
    if (!OUTDOOR.has(r.biome)) return { ...base, daylight: 0, night: 1, tint: null as RGB | null, tintA: 0 };
    const s = this.skyNow;
    const night = 1 - s.day;
    return { ...base, haze: s.low, dark: mix([16, 12, 42], [6, 10, 34], night), daylight: s.daylight, night, tint: s.tint, tintA: s.tintAlpha };
  }

  /** How lit a cell is, 0–1, from its stored sky and block light. */
  private litFrom(r: Region, sky: number, blk: number) {
    if (OUTDOOR.has(r.biome)) return Math.min(1, curve(sky) * this.skyNow.daylight + curve(blk));
    return Math.min(1, LOOK[r.biome].ambient + curve(blk) * 0.95);
  }

  // ---------------------------------------------------------------- baking a chunk

  /** Which way an attached item grows: away from the floor, ceiling or wall it touches. */
  private facing(r: Region, x: number, y: number, layer: Layer): Facing {
    const holds = (c: Cell) => solid(c.m) || (layer !== "m" && solid(c[layer]));
    if (holds(this.cell(r, x, y + 1))) return "up";
    if (holds(this.cell(r, x, y - 1))) return "down";
    if (holds(this.cell(r, x - 1, y))) return "right";
    if (holds(this.cell(r, x + 1, y))) return "left";
    return "up";
  }

  private bake(r: Region, chunk: Chunk, cx: number, cy: number) {
    chunk.dirty = false;
    chunk.baked = true;
    chunk.glows = [];
    chunk.live = [];
    chunk.plants = [];
    chunk.shiny = [];
    chunk.leafy = [];
    chunk.lavaTops = [];
    const atlas = this.atlas;
    const look = this.look(r);
    const light = this.lightOf(r);
    const x0 = cx * CH;
    const y0 = cy * CH;
    const rowMin = Math.max(y0, r.top);
    const rowMax = Math.min(y0 + CH - 1, GROUND_ROWS - 1);
    const ctx = chunk.back.getContext("2d")!;
    const fx = chunk.front.getContext("2d")!;
    ctx.clearRect(0, 0, CHT, CHT);
    fx.clearRect(0, 0, CHT, CHT);
    ctx.imageSmoothingEnabled = false;
    fx.imageSmoothingEnabled = false;
    chunk.hasFront = false;
    if (rowMin > rowMax) return;
    const get = (x: number, y: number) => this.cell(r, x, y);
    const live = (x: number, y: number, id: BlockId, layer: Layer) =>
      chunk.live.push({ x, y, id, layer, top: get(x, y - 1)[layer] !== id, sky: lightAt(light, "sky", x, y), blk: lightAt(light, "block", x, y) });
    /** Draws a block into the bake, or lists it to be drawn live. Returns false when it is drawn live only. */
    const tile = (c: CanvasRenderingContext2D, layer: Layer, id: BlockId, x: number, y: number) => {
      if (FLAMES.has(id)) {
        live(x, y, id, layer);
        return false;
      }
      const sheet = layer === "b" ? atlas.back : atlas.mid;
      const dx = (x - x0) * TEX;
      const dy = (y - y0) * TEX;
      if (ATTACHED.has(id)) c.drawImage(this.anim.attached[id]![this.facing(r, x, y, layer)][layer === "b" ? "back" : "mid"], dx, dy);
      else c.drawImage(sheet, BLOCKS[id].index * TEX, 0, TEX, TEX, dx, dy, TEX, TEX);
      if (id === "lava" || id === "water" || PULSING.includes(id)) live(x, y, id, layer);
      if (id === "lava" && layer !== "b" && !get(x, y - 1)[layer] && !opaque(get(x, y - 1).m)) chunk.lavaTops.push({ x, y, id, front: layer === "f" });
      return true;
    };

    // 1. Back layer, hazed so it reads as distant.
    for (let y = rowMin; y <= rowMax; y++) {
      for (let x = x0; x < x0 + CH; x++) {
        const c = get(x, y);
        if (!c.b || opaque(c.m)) continue;
        if (FLAMES.has(c.b) && c.m) continue; // a live flame would draw over whatever is in front of it
        tile(ctx, "b", c.b, x, y);
      }
    }
    ctx.save();
    ctx.globalCompositeOperation = "source-atop";
    ctx.fillStyle = rgb(look.haze, look.hazeA);
    ctx.fillRect(0, 0, CHT, CHT);
    // 2. Middle blocks cast a short shadow onto the back layer.
    this.shadowPass(ctx, get, x0, y0, rowMin, rowMax, (c) => opaque(c.m), 2, 3, 0.42);
    ctx.restore();

    // 3. Middle layer, with a rim light on exposed tops and a dark lip underneath.
    for (let y = rowMin; y <= rowMax; y++) {
      for (let x = x0; x < x0 + CH; x++) {
        const here = get(x, y);
        const id = here.m;
        if (!id) continue;
        tile(ctx, "m", id, x, y);
        if (SHINE[id] && !opaque(here.f)) chunk.shiny.push({ x, y, id, front: false });
        if (LEAFY.has(id) && !get(x, y + 1).m && !opaque(here.f)) chunk.leafy.push({ x, y, id, front: false });
        if (!opaque(id)) continue;
        const px = (x - x0) * TEX;
        const py = (y - y0) * TEX;
        if (!opaque(get(x, y - 1).m)) {
          ctx.fillStyle = "rgba(255,250,220,0.3)";
          ctx.fillRect(px, py, TEX, 1);
        }
        if (!opaque(get(x, y + 1).m)) {
          ctx.fillStyle = "rgba(10,6,24,0.45)";
          ctx.fillRect(px, py + TEX - 1, TEX, 1);
        }
        ctx.fillStyle = "rgba(10,6,24,0.28)";
        if (!opaque(get(x - 1, y).m)) ctx.fillRect(px, py, 1, TEX);
        if (!opaque(get(x + 1, y).m)) ctx.fillRect(px + TEX - 1, py, 1, TEX);
      }
    }

    // 4. Decorations, which come and go with the blocks around them. Swaying plants are drawn live.
    for (let y = rowMin; y <= rowMax; y++) {
      for (let x = x0; x < x0 + CH; x++) {
        const here = get(x, y);
        if (here.m || here.f) continue;
        const kind = decorFor(r.id, x, y, here, get(x, y + 1), get(x, y - 1));
        if (!kind) continue;
        if (SWAYING[kind]) chunk.plants.push({ x, y, kind, sky: lightAt(light, "sky", x, y), blk: lightAt(light, "block", x, y) });
        else ctx.drawImage(atlas.decor[kind], (x - x0) * TEX, (y - y0) * TEX);
        if (GLOWING_DECOR.has(kind)) chunk.glows.push({ x, y, c: DECOR_GLOW, r: 14, a: 0.35, kind: "steady" });
      }
    }

    // 5. Front blocks cast a longer shadow onto everything behind them.
    ctx.save();
    ctx.globalCompositeOperation = "source-atop";
    this.shadowPass(ctx, get, x0, y0, rowMin, rowMax, (c) => !!c.f && BLOCKS[c.f].solid && c.f !== "glass" && c.f !== "water" && c.f !== "ice", 4, 5, 0.34);
    ctx.restore();

    // 6. Front layer, on its own canvas above the page text, with a crisp outline.
    for (let y = rowMin; y <= rowMax; y++) {
      for (let x = x0; x < x0 + CH; x++) {
        const id = get(x, y).f;
        if (!id) continue;
        if (!tile(fx, "f", id, x, y)) continue;
        chunk.hasFront = true;
        if (SHINE[id]) chunk.shiny.push({ x, y, id, front: true });
        if (LEAFY.has(id) && !get(x, y + 1).f) chunk.leafy.push({ x, y, id, front: true });
        if (!BLOCKS[id].solid || id === "glass" || id === "ice" || id === "water") continue;
        const px = (x - x0) * TEX;
        const py = (y - y0) * TEX;
        fx.fillStyle = "rgba(255,250,220,0.32)";
        if (!get(x, y - 1).f) fx.fillRect(px, py, TEX, 1);
        fx.fillStyle = "rgba(12,8,26,0.55)";
        if (!get(x, y + 1).f) fx.fillRect(px, py + TEX - 1, TEX, 1);
        if (!get(x - 1, y).f) fx.fillRect(px, py, 1, TEX);
        if (!get(x + 1, y).f) fx.fillRect(px + TEX - 1, py, 1, TEX);
      }
    }

    // 7. Light every layer with the same light map.
    this.lightPass(r, look, ctx, chunk.hasFront ? fx : null, x0, y0);

    // Glows for light sources in this chunk.
    for (const e of light.emitters) {
      if (e.x < x0 || e.x >= x0 + CH || e.y < y0 || e.y >= y0 + CH) continue;
      const c = GLOW[e.id];
      if (!c) continue;
      const far = e.layer === "b";
      const lava = e.id === "lava" || e.id === "magma";
      chunk.glows.push({ x: e.x, y: e.y, c, r: far ? 26 : lava ? 30 : 40, a: far ? 0.5 : 1, kind: FLAMES.has(e.id) ? "flame" : lava ? "lava" : "steady" });
    }
  }

  private shadowPass(ctx: CanvasRenderingContext2D, get: (x: number, y: number) => Cell, x0: number, y0: number, rowMin: number, rowMax: number, casts: (c: Cell) => boolean, dx: number, dy: number, alpha: number) {
    const s = this.scratch.getContext("2d")!;
    s.clearRect(0, 0, this.scratch.width, this.scratch.height);
    s.fillStyle = "#000";
    let any = false;
    for (let y = rowMin - 1; y <= rowMax; y++) {
      for (let x = x0 - 1; x < x0 + CH; x++) {
        if (!casts(get(x, y))) continue;
        s.fillRect((x - x0) * TEX + dx, (y - y0) * TEX + dy, TEX, TEX);
        any = true;
      }
    }
    if (!any) return;
    ctx.globalAlpha = alpha;
    ctx.drawImage(this.scratch, 0, 0);
    ctx.globalAlpha = 1;
  }

  /** Darkness colour and ambient light of the regions above and below, for blending across seams. */
  private neighbourLook(r: Region, dir: -1 | 1): { dark: RGB; ambient: number } | null {
    const id = neighbour(r.id, dir);
    if (!id) return null;
    const biome = REGION_BIOME[id];
    return biome === "overworld" ? { dark: OVERWORLD_ROCK, ambient: 0 } : { dark: LOOK[biome].dark, ambient: LOOK[biome].ambient };
  }

  /** Light drawn in flat steps two texels wide, with ordered dithering only along the seams. */
  private lightPass(r: Region, look: ReturnType<WorldEngine["look"]>, back: CanvasRenderingContext2D, front: CanvasRenderingContext2D | null, x0: number, y0: number) {
    const light = this.lightOf(r);
    const n = CH + 2;
    const sky = new Float32Array(n * n);
    const blk = new Float32Array(n * n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        sky[j * n + i] = lightAt(light, "sky", x0 - 1 + i, y0 - 1 + j);
        blk[j * n + i] = lightAt(light, "block", x0 - 1 + i, y0 - 1 + j);
      }
    }
    const S = CHT / 2;
    const ls = this.lightScratch.getContext("2d")!;
    const dark = ls.createImageData(S, S);
    const warm = ls.createImageData(S, S);
    const D = dark.data;
    const Wm = warm.data;
    const LEVELS = 7;
    const overworld = OUTDOOR.has(r.biome);
    const warmStrength = overworld ? 0.18 + 0.32 * look.night : 0.3;
    const above = this.neighbourLook(r, -1);
    const below = this.neighbourLook(r, 1);
    const ownAmbient = overworld ? 0 : look.ambient;
    for (let sy = 0; sy < S; sy++) {
      const fy = (sy * 2 + 1) / TEX - 0.5 + 1;
      const cy = Math.floor(fy);
      const v = fy - cy;
      // Near a seam, darkness takes on half of the neighbouring region's colour and ambient light,
      // so the two meet at the same value.
      const row = y0 + (sy * 2 + 1) / TEX;
      let shade: RGB = look.dark;
      let ambient = ownAmbient;
      const tb = below ? clamp01((row - (GROUND_ROWS - 2.5)) / 2.5) * 0.5 : 0;
      const tt = above ? clamp01(1 - (row - r.top) / 3) * 0.5 : 0;
      if (tb > 0) {
        shade = mix(shade, below!.dark, tb);
        ambient += (below!.ambient - ambient) * tb;
      }
      if (tt > 0) {
        shade = mix(shade, above!.dark, tt);
        ambient += (above!.ambient - ambient) * tt;
      }
      for (let sx = 0; sx < S; sx++) {
        const fxc = (sx * 2 + 1) / TEX - 0.5 + 1;
        const cxi = Math.floor(fxc);
        const u = fxc - cxi;
        const i00 = cy * n + cxi;
        const bil = (a: Float32Array) => (a[i00]! * (1 - u) + a[i00 + 1]! * u) * (1 - v) + (a[i00 + n]! * (1 - u) + a[i00 + n + 1]! * u) * v;
        const bl = curve(bil(blk));
        const lit = Math.min(1, overworld ? curve(bil(sky)) * look.daylight + bl + ambient : ambient + bl * 0.95);
        const th = 0.3 + BAYER[(sy % 4) * 4 + (sx % 4)]! * 0.4;
        const darkness = Math.floor((1 - lit) * 0.88 * LEVELS + th) / LEVELS;
        const p = (sy * S + sx) * 4;
        if (darkness > 0) {
          D[p] = shade[0];
          D[p + 1] = shade[1];
          D[p + 2] = shade[2];
          D[p + 3] = darkness * 255;
        }
        const glow = Math.floor(bl * warmStrength * LEVELS + th) / LEVELS;
        if (glow > 0) {
          Wm[p] = look.warm[0];
          Wm[p + 1] = look.warm[1];
          Wm[p + 2] = look.warm[2];
          Wm[p + 3] = glow * 255;
        }
      }
    }
    for (const ctx of front ? [back, front] : [back]) {
      ctx.save();
      ctx.globalCompositeOperation = "source-atop";
      ctx.imageSmoothingEnabled = false;
      if (look.tint && look.tintA > 0.01) {
        ctx.fillStyle = rgb(look.tint, look.tintA);
        ctx.fillRect(0, 0, CHT, CHT);
      }
      ls.putImageData(dark, 0, 0);
      ctx.drawImage(this.lightScratch, 0, 0, S, S, 0, 0, CHT, CHT);
      ls.putImageData(warm, 0, 0);
      ctx.drawImage(this.lightScratch, 0, 0, S, S, 0, 0, CHT, CHT);
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------- animated blocks and plants

  /** Lava flows, water ripples, flames flicker and glowing blocks breathe. */
  private drawLive(ctx: CanvasRenderingContext2D, r: Region, placements: [Chunk, number, number][], ox: number, oy: number, t: number, front: boolean) {
    const anim = this.anim;
    const lavaFrame = Math.floor(t / 190) % LAVA_FRAMES;
    const waterFrame = Math.floor(t / 170) % WATER_FRAMES;
    const tick = Math.floor(t / 120);
    let pulses = false;
    for (const [chunk] of placements) {
      for (const l of chunk.live) {
        if ((l.layer === "f") !== front) continue;
        const px = ox + l.x * TEX;
        const py = oy + l.y * TEX;
        const back = l.layer === "b";
        if (l.id === "lava") {
          ctx.drawImage(back ? anim.lava.back : anim.lava.mid, lavaFrame * TEX, 0, TEX, TEX, px, py, TEX, TEX);
        } else if (l.id === "water") {
          if (back) continue;
          ctx.globalAlpha = 0.25 + 0.75 * this.litFrom(r, l.sky, l.blk);
          ctx.drawImage(l.top ? anim.water.top : anim.water.body, waterFrame * TEX, 0, TEX, TEX, px, py, TEX, TEX);
          ctx.globalAlpha = 1;
        } else if (FLAMES.has(l.id)) {
          const sheet = anim.flames[l.id]!;
          // Lanterns breathe slowly; flames pick a new frame at irregular moments.
          const k = l.id === "lantern" ? Math.floor(t / 420 + l.x * 0.37) : tick + Math.floor(hash2(l.x, l.y, tick) * 2);
          const frame = Math.floor(hash2(l.x * 7 + k, l.y, 5) * sheet.frames);
          ctx.drawImage(back ? sheet.back : sheet.mid, frame * TEX, 0, TEX, TEX, px, py, TEX, TEX);
        } else pulses = true;
      }
    }
    if (!pulses) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const [chunk] of placements) {
      for (const l of chunk.live) {
        if ((l.layer === "f") !== front || l.layer === "b") continue;
        const mask = anim.pulse[l.id];
        if (!mask) continue;
        ctx.globalAlpha = 0.12 + 0.2 * (0.5 + 0.5 * Math.sin(t / 650 + l.x * 1.3 + l.y * 0.7));
        ctx.drawImage(mask, ox + l.x * TEX, oy + l.y * TEX);
      }
    }
    ctx.restore();
  }

  /** A sheet of each swaying plant in three lean frames and PLANT_LEVELS shades of this region's darkness. */
  private plantSprite(biome: Biome, kind: DecorKind, frame: number, level: number): [HTMLCanvasElement, number, number] {
    let sheet = this.plantSheets.get(biome);
    if (!sheet) {
      sheet = { canvas: canvas(TEX * SWAY_FRAMES * PLANT_LEVELS, TEX * Object.keys(SWAYING).length), rows: new Map() };
      this.plantSheets.set(biome, sheet);
    }
    let row = sheet.rows.get(kind);
    if (row === undefined) {
      row = sheet.rows.size;
      sheet.rows.set(kind, row);
      const ctx = sheet.canvas.getContext("2d")!;
      const dark = OUTDOOR.has(biome) ? OVERWORLD_ROCK : LOOK[biome].dark;
      for (let f = 0; f < SWAY_FRAMES; f++) {
        for (let lv = 0; lv < PLANT_LEVELS; lv++) {
          const x = (f * PLANT_LEVELS + lv) * TEX;
          ctx.drawImage(this.anim.sway[kind]!, f * TEX, 0, TEX, TEX, x, row * TEX, TEX, TEX);
          if (lv === 0) continue;
          ctx.save();
          ctx.globalCompositeOperation = "source-atop";
          ctx.fillStyle = rgb(dark, (lv / (PLANT_LEVELS - 1)) * 0.88);
          ctx.fillRect(x, row * TEX, TEX, TEX);
          ctx.restore();
        }
      }
    }
    return [sheet.canvas, (frame * PLANT_LEVELS + level) * TEX, row * TEX];
  }

  /** Grass, flowers and vines lean with a slow wave of wind that rolls across the screen. */
  private drawPlants(r: Region, placements: [Chunk, number, number][], ox: number, oy: number, t: number) {
    const b = this.bctx;
    const outside = OUTDOOR.has(r.biome);
    const gust = 0.55 + 0.45 * Math.sin(t / 2600);
    for (const [chunk] of placements) {
      for (const p of chunk.plants) {
        const wave = Math.sin(t / (outside ? 520 : 1100) - p.x * 0.45 + p.y * 0.2) * (outside ? gust : 0.6);
        const frame = t === 0 ? 1 : wave > 0.5 ? 2 : wave < -0.5 ? 0 : 1;
        let lit = this.litFrom(r, p.sky, p.blk);
        if (GLOWING_DECOR.has(p.kind)) lit = Math.max(lit, 0.75);
        const level = Math.round((1 - lit) * (PLANT_LEVELS - 1));
        const [sheet, sx, sy] = this.plantSprite(r.biome, p.kind, frame, level);
        b.drawImage(sheet, sx, sy, TEX, TEX, ox + p.x * TEX, oy + p.y * TEX, TEX, TEX);
      }
    }
  }

  // ---------------------------------------------------------------- backdrops

  private drawBackdrop(r: Region, top: number, bottom: number, ox: number, oy: number, t: number) {
    const b = this.bctx;
    if (OUTDOOR.has(r.biome)) {
      this.drawSky(r, top, ox, oy, t);
      return;
    }
    const look = LOOK[r.biome];
    const g = b.createLinearGradient(0, top, 0, bottom);
    g.addColorStop(0, look.bg[0]);
    g.addColorStop(1, look.bg[1]);
    b.fillStyle = g;
    b.fillRect(0, top, this.bw, bottom - top);
    // The colour of the section above bleeds a little way down, so the seam has no hard line.
    const prev = neighbour(r.id, -1);
    if (prev) {
      const seam = b.createLinearGradient(0, top, 0, top + TEX * 4);
      const c = LOOK[REGION_BIOME[prev]].bg[1];
      seam.addColorStop(0, c);
      seam.addColorStop(1, `${c}00`);
      b.fillStyle = seam;
      b.fillRect(0, top, this.bw, TEX * 4);
    }
    if (r.biome === "inferno") {
      const glow = b.createLinearGradient(0, oy - 80, 0, oy + 16);
      glow.addColorStop(0, "rgba(255,90,20,0)");
      glow.addColorStop(1, "rgba(255,110,30,0.35)");
      b.fillStyle = glow;
      b.fillRect(0, oy - 80, this.bw, 96);
    }
    if (r.biome === "void") this.drawNebula(top, bottom, t, [[150, 80, 220]]);
    if (r.biome === "space") this.drawNebula(top, bottom, t, [[110, 170, 60], [140, 70, 200], [90, 150, 90]]);
    if (r.biome === "grove") this.drawLeaves(top, bottom, t);
    if (r.biome === "void" || r.biome === "crystal" || r.biome === "space") {
      // A fixed field of stars or specks, cached per size, with a few twinkling on top.
      const h = bottom - top;
      const key = `${this.bw}x${h}`;
      if (!r.bg || r.bg.key !== key) {
        const c = canvas(this.bw, h);
        const s = c.getContext("2d")!;
        const count = Math.round((this.bw * h) / (r.biome === "void" ? 260 : 700));
        for (let i = 0; i < count; i++) {
          const bright = hash2(i, 7, 3) > 0.85;
          s.fillStyle = r.biome === "crystal" ? "rgba(190,160,255,0.35)" : bright ? "#f3e8ff" : "rgba(200,170,255,0.55)";
          s.fillRect(Math.floor(hash2(i, 1, 3) * this.bw), Math.floor(hash2(i, 2, 3) * h), 1, 1);
        }
        r.bg = { key, canvas: c };
      }
      b.drawImage(r.bg.canvas, 0, top);
      if (r.biome === "void" || r.biome === "space") this.drawTwinkles(top, bottom, t, [243, 232, 255], 46);
    }
  }

  /** Bright stars that swell into little crosses and fade again. */
  private drawTwinkles(top: number, bottom: number, t: number, c: RGB, count: number, alpha = 1) {
    const b = this.bctx;
    const h = bottom - top;
    for (let i = 0; i < count; i++) {
      const x = Math.floor(hash2(i, 11, 9) * this.bw);
      const y = top + Math.floor(hash2(i, 12, 9) * h);
      const tw = t === 0 ? 0.6 : 0.5 + 0.5 * Math.sin(t / (500 + hash2(i, 13, 9) * 900) + i * 2.1);
      b.fillStyle = rgb(c, alpha * (0.35 + 0.65 * tw));
      b.fillRect(x, y, 1, 1);
      if (tw > 0.86 && hash2(i, 14, 9) > 0.55) {
        b.fillStyle = rgb(c, alpha * (tw - 0.86) * 4);
        b.fillRect(x - 1, y, 3, 1);
        b.fillRect(x, y - 1, 1, 3);
      }
    }
  }

  private nebulaSprite(c: RGB) {
    const key = `nebula|${c.join(",")}`;
    let sprite = this.glowCache.get(key);
    if (!sprite) {
      sprite = canvas(120, 60);
      const ctx = sprite.getContext("2d")!;
      ctx.scale(2, 1);
      const g = ctx.createRadialGradient(30, 30, 0, 30, 30, 30);
      g.addColorStop(0, rgb(c, 0.5));
      g.addColorStop(0.5, rgb(mix(c, [0, 0, 0], 0.3), 0.2));
      g.addColorStop(1, rgb(mix(c, [0, 0, 0], 0.6), 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 60, 60);
      this.glowCache.set(key, sprite);
    }
    return sprite;
  }

  /** Soft clouds of colour that drift through the void and through space. */
  private drawNebula(top: number, bottom: number, t: number, colours: RGB[]) {
    const b = this.bctx;
    const h = bottom - top;
    const span = this.bw + 240;
    b.save();
    b.globalCompositeOperation = "lighter";
    const count = Math.max(3, Math.round(h / 140));
    for (let i = 0; i < count; i++) {
      const sprite = this.nebulaSprite(colours[i % colours.length]!);
      const x = ((hash2(i, 1, 21) * span + t * (0.004 + (i % 3) * 0.002)) % span) - 120;
      const y = top + h * (count > 3 ? 0.05 + hash2(i, 2, 21) * 0.9 : 0.2 + hash2(i, 2, 21) * 0.55) + Math.sin(t / 5000 + i) * 6;
      b.globalAlpha = 0.5 + 0.2 * Math.sin(t / 3000 + i * 2);
      b.drawImage(sprite, Math.round(x), Math.round(y - 30), 120 + (i % 3) * 30, 60 + (i % 3) * 10);
    }
    b.restore();
  }

  /** Big soft leaves drifting slowly behind the grove, like the pattern behind Tanggolin's logo. */
  private drawLeaves(top: number, bottom: number, t: number) {
    if (!this.leafSprite) {
      const c = canvas(28, 16);
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "rgba(150,110,230,0.22)";
      for (let y = 0; y < 16; y++) {
        const half = Math.round(Math.sin((y / 15) * Math.PI) * 13);
        ctx.fillRect(14 - half, y, half * 2, 1);
      }
      ctx.fillStyle = "rgba(60,30,120,0.35)";
      ctx.fillRect(3, 8, 22, 1);
      this.leafSprite = c;
    }
    const b = this.bctx;
    const h = bottom - top;
    const count = Math.round((this.bw * h) / 2600);
    for (let i = 0; i < count; i++) {
      const x = Math.round(hash2(i, 1, 41) * (this.bw + 40) - 20 + Math.sin(t / 3000 + i) * 2);
      const y = Math.round(top + hash2(i, 2, 41) * h);
      b.save();
      b.translate(x, y);
      b.rotate(Math.round(hash2(i, 3, 41) * 7) * (Math.PI / 4));
      b.drawImage(this.leafSprite, -14, -8);
      b.restore();
    }
  }

  /** Sky bands with dithered seams, a warm glow where the sun sets, sun, moon, stars and clouds. */
  private drawSky(r: Region, top: number, ox: number, oy: number, t: number) {
    const b = this.bctx;
    const s = this.skyNow;
    const h = oy - top + TEX;
    const key = `${this.sky.phi}|${this.bw}|${h}`;
    if (!r.bg || r.bg.key !== key) r.bg = { key, canvas: this.paintSky(s, h, ox) };
    b.drawImage(r.bg.canvas, 0, 0, r.bg.canvas.width, r.bg.canvas.height, 0, top, r.bg.canvas.width * 2, r.bg.canvas.height * 2);

    const starA = Math.max(0, Math.min(1, (-0.04 - s.e) / 0.3));
    if (starA > 0) {
      for (let i = 0; i < 160; i++) {
        const x = Math.floor(hash2(i, 1, 3) * this.bw);
        const y = top + Math.floor(hash2(i, 2, 3) * (oy - top) * 0.85);
        const tw = t ? 0.55 + 0.45 * Math.sin(t / 600 + i * 1.7) : 1;
        b.fillStyle = `rgba(255,250,232,${starA * tw * (hash2(i, 3, 3) > 0.85 ? 1 : 0.6)})`;
        b.fillRect(x, y, 1, 1);
      }
      this.drawTwinkles(top, top + (oy - top) * 0.7, t, [255, 250, 232], 18, starA);
    }
    const unit = 3;
    const cx = ox + SUN_ARC.cx * TEX;
    const rx = SUN_ARC.rx * TEX;
    const ry = (oy - top) * 0.82;
    const place = (deg: number, centre = cx) => ({ x: Math.round((centre + rx * Math.cos((deg * Math.PI) / 180)) / unit) * unit, y: Math.round((oy - ry * Math.sin((deg * Math.PI) / 180)) / unit) * unit });
    if (s.e > -0.15) {
      const p = place(this.sky.phi);
      const warm = s.dusk;
      b.fillStyle = rgb(mix([255, 246, 200], [255, 160, 100], warm), 0.2);
      b.fillRect(p.x - 15, p.y - 15, 30, 30);
      b.fillStyle = rgb(mix([255, 236, 150], [255, 130, 70], warm), 0.4);
      b.fillRect(p.x - 12, p.y - 12, 24, 24);
      b.fillStyle = rgb(mix([255, 250, 214], [255, 200, 140], warm));
      b.fillRect(p.x - 9, p.y - 9, 18, 18);
    }
    if (s.e < 0.15) {
      const p = place(this.sky.phi + 180, ox + MOON_ARC.cx * TEX);
      b.fillStyle = "rgba(200,210,255,0.14)";
      b.fillRect(p.x - 12, p.y - 12, 24, 24);
      b.fillStyle = "#e8ecfb";
      b.fillRect(p.x - 9, p.y - 9, 18, 18);
      b.fillStyle = "#bcc4e2";
      b.fillRect(p.x - 6, p.y - 3, 6, 6);
      b.fillRect(p.x + 3, p.y + 3, 3, 3);
    }
    const night = 1 - s.day;
    const lit = mix(mix([255, 255, 255], [70, 80, 130], night), [255, 190, 160], s.dusk * 0.55);
    const under = mix(mix([214, 228, 244], [40, 46, 86], night), [210, 140, 140], s.dusk * 0.5);
    const span = this.bw + 160;
    const drift = t ? (t / 900) % span : 0;
    for (let n = 0; n < 5; n++) {
      const w = (10 + Math.floor(hash2(n, 4, 4) * 10)) * unit;
      const x = Math.round(((hash2(n, 5, 4) * span + drift * (0.6 + n * 0.1)) % span) - 80);
      const y = Math.round(top + (oy - top) * (0.1 + hash2(n, 6, 4) * 0.3));
      b.fillStyle = rgb(under, 0.95);
      b.fillRect(x, y + unit, w, unit * 1.5);
      b.fillStyle = rgb(lit, 0.95);
      b.fillRect(x + unit, y, w - unit * 2, unit * 1.5);
      b.fillRect(x + unit * 3, y - unit, w - unit * 7, unit);
    }
  }

  private paintSky(s: SkyState, h: number, ox: number) {
    const w = Math.ceil(this.bw / 2);
    const hh = Math.ceil(h / 2);
    const c = canvas(w, hh);
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(w, hh);
    const d = img.data;
    const BANDS = 9;
    const bands: RGB[] = [];
    for (let i = 0; i <= BANDS; i++) {
      const v = i / BANDS;
      bands.push(v < 0.55 ? mix(s.top, s.mid, v / 0.55) : mix(s.mid, s.low, (v - 0.55) / 0.45));
    }
    const sunX = (ox + (SUN_ARC.cx + SUN_ARC.rx * s.sx) * TEX) / this.bw;
    for (let y = 0; y < hh; y++) {
      const f = Math.min(1, y / (hh - 1));
      const fb = f * BANDS;
      const bi = Math.floor(fb);
      const frac = Math.max(0, Math.min(1, (fb - bi - 0.62) * 2.6));
      for (let x = 0; x < w; x++) {
        const th = BAYER[(y % 4) * 4 + (x % 4)]!;
        let col = bands[Math.min(BANDS, bi + (frac > th ? 1 : 0))]!;
        if (s.dusk > 0) {
          const dx = (x / w - sunX) / 0.34;
          const g = s.dusk * Math.exp(-dx * dx) * Math.max(0, Math.min(1, (f - 0.25) / 0.75));
          const q = Math.floor(g * 5 + th) / 5;
          if (q > 0) col = mix(col, [255, 150, 82], q * 0.7);
        }
        const p = (y * w + x) * 4;
        d[p] = col[0];
        d[p + 1] = col[1];
        d[p + 2] = col[2];
        d[p + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // Distant hills, tinted toward the horizon so they read as far away.
    const night = 1 - s.day;
    const layers: [number, number, number, RGB][] = [
      [8, 0.035, 3, mix(mix(s.low, [120, 150, 170], 0.45), [20, 26, 56], night * 0.5)],
      [5, 0.06, 9, mix(mix(s.low, [80, 128, 104], 0.62), [14, 22, 40], night * 0.6)],
    ];
    for (const [amp, freq, seed, col] of layers) {
      ctx.fillStyle = rgb(col);
      for (let i = 0; i < w / 2 + 2; i++) {
        const gx = i + Math.floor(ox / 4);
        const v = Math.sin(gx * freq + seed) * 0.5 + Math.sin(gx * freq * 2.3 + seed * 2) * 0.3 + Math.sin(gx * freq * 0.4) * 0.2;
        const hgt = Math.max(1, Math.round((v * 0.5 + 0.55) * amp));
        ctx.fillRect(i * 2, hh - hgt * 2, 2, hgt * 2);
      }
    }
    return c;
  }

  // ---------------------------------------------------------------- particles and sparks

  private stepParticles(dt: number) {
    const now = performance.now();
    this.particles = this.particles.filter((p) => now - p.born < p.life);
    for (const p of this.particles) {
      if (p.rest) continue;
      const r = this.regions.get(p.region)!;
      p.vy += 450 * dt;
      p.x += p.vx * dt;
      const ny = p.y + p.vy * dt;
      const cx = Math.floor(p.x / TEX);
      const below = Math.floor((ny + p.size) / TEX);
      const c = this.cell(r, cx, below);
      if (p.vy > 0 && (opaque(c.m) || opaque(c.f)) && !opaque(this.cell(r, cx, Math.floor(p.y / TEX)).m)) {
        p.y = below * TEX - p.size;
        if (p.vy > 40) {
          p.vy *= -0.3;
          p.vx *= 0.6;
        } else {
          p.vy = 0;
          p.vx = 0;
          p.rest = true;
        }
      } else p.y = ny;
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D, r: Region, ox: number, oy: number, layers: string) {
    const now = performance.now();
    for (const p of this.particles) {
      if (p.region !== r.id || !layers.includes(p.layer)) continue;
      const age = (now - p.born) / p.life;
      const a = age < 0.7 ? 1 : 1 - (age - 0.7) / 0.3;
      const x = Math.round(ox + p.x);
      const y = Math.round(oy + p.y);
      ctx.fillStyle = `rgba(12,8,24,${a * 0.6})`;
      ctx.fillRect(x + 1, y + 1, p.size, p.size);
      ctx.fillStyle = rgb(p.c, a);
      ctx.fillRect(x, y, p.size, p.size);
    }
  }

  private stepSparks(dt: number) {
    if (dt <= 0) return;
    let n = 0;
    for (const s of this.sparks) {
      s.age += dt;
      if (s.age >= s.life) continue;
      if (s.kind === "leaf") s.x += (s.vx + Math.sin(s.age * 2.4 + s.phase) * 9) * dt;
      else if (s.kind === "puff") {
        s.vx *= 1 - 2.5 * dt;
        s.vy *= 1 - 2.5 * dt;
        s.x += s.vx * dt;
      }
      else s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.kind === "pop") s.vy += 30 * dt;
      this.sparks[n++] = s;
    }
    this.sparks.length = n;
  }

  private count(kind: Spark["kind"], region: RegionId) {
    let n = 0;
    for (const s of this.sparks) if (s.kind === kind && s.region === region) n++;
    return n;
  }

  /** Starts new glints, leaves, lava bubbles, wind trails and shooting stars in the visible part of a region. */
  private spawnSparks(r: Region, placements: [Chunk, number, number][], top: number, bottom: number, ox: number, oy: number, dt: number) {
    const pick = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)]!;
    const visible = (s: Spot) => {
      const y = oy + s.y * TEX;
      const x = ox + s.x * TEX;
      return y > Math.max(top, 0) - TEX && y < Math.min(bottom, this.bh) && x > -TEX && x < this.bw;
    };
    const shiny: Spot[] = [];
    const leafy: Spot[] = [];
    const lava: Spot[] = [];
    for (const [chunk] of placements) {
      for (const s of chunk.shiny) if (visible(s)) shiny.push(s);
      for (const s of chunk.leafy) if (visible(s)) leafy.push(s);
      for (const s of chunk.lavaTops) if (visible(s)) lava.push(s);
    }
    const rate = 30 * dt; // spawn chances are tuned per 30 fps frame
    if (shiny.length && this.count("glint", r.id) < (this.low ? 4 : 10) && Math.random() < Math.min(0.4, shiny.length * 0.007) * rate) {
      const s = pick(shiny);
      this.sparks.push({ kind: "glint", region: r.id, x: s.x * TEX + 2 + Math.floor(Math.random() * 12), y: s.y * TEX + 2 + Math.floor(Math.random() * 12), vx: 0, vy: 0, age: 0, life: 0.55 + Math.random() * 0.25, c: SHINE[s.id]!, front: s.front, phase: 0, size: 1 });
    }
    if (leafy.length && this.count("leaf", r.id) < (this.low ? 4 : 9) && Math.random() < Math.min(0.12, leafy.length * 0.0015) * rate) {
      const s = pick(leafy);
      const colours = this.atlas.colours[s.id];
      this.sparks.push({ kind: "leaf", region: r.id, x: s.x * TEX + Math.random() * TEX, y: (s.y + 1) * TEX - 2, vx: 3 + Math.random() * 5, vy: 7 + Math.random() * 6, age: 0, life: 3.5 + Math.random() * 2.5, c: colours?.length ? pick(colours) : [90, 160, 60], front: s.front, phase: Math.random() * 6.28, size: Math.random() < 0.4 ? 2 : 1 });
    }
    if (lava.length && this.count("pop", r.id) < (this.low ? 3 : 8) && Math.random() < Math.min(0.25, lava.length * 0.006) * rate) {
      const s = pick(lava);
      this.sparks.push({ kind: "pop", region: r.id, x: s.x * TEX + 2 + Math.random() * 12, y: s.y * TEX + 1, vx: (Math.random() - 0.5) * 6, vy: -(14 + Math.random() * 14), age: 0, life: 0.7 + Math.random() * 0.4, c: Math.random() < 0.5 ? [255, 214, 90] : [255, 150, 40], front: s.front, phase: 0, size: Math.random() < 0.3 ? 2 : 1 });
    }
    if (OUTDOOR.has(r.biome)) {
      // Wind trails in the sky above the hills, mostly by day.
      const skyBottom = Math.min(oy - TEX * 7, bottom);
      if (skyBottom - Math.max(top, 0) > 40 && this.count("wind", r.id) < (this.low ? 1 : 2) && Math.random() < 0.012 * rate) {
        const y = Math.max(top, 0) + 10 + Math.random() * (skyBottom - Math.max(top, 0) - 20);
        this.sparks.push({ kind: "wind", region: r.id, x: -ox + Math.random() * this.bw * 0.6, y: y - oy, vx: 70 + Math.random() * 30, vy: 0, age: 0, life: 1.8 + Math.random() * 0.6, c: [255, 255, 255], front: false, phase: Math.random() * 6.28, size: 4 + Math.random() * 4 });
      }
    }
    const starry = r.biome === "void" || r.biome === "space" || (OUTDOOR.has(r.biome) && this.skyNow.e < -0.2);
    if (starry && this.count("meteor", r.id) < 1 && Math.random() < 0.004 * rate) {
      const y = Math.max(top, 0) + Math.random() * Math.max(10, (Math.min(bottom, this.bh) - Math.max(top, 0)) * 0.5);
      this.sparks.push({ kind: "meteor", region: r.id, x: -ox + this.bw * (0.3 + Math.random() * 0.7), y: y - oy, vx: -(110 + Math.random() * 60), vy: 45 + Math.random() * 25, age: 0, life: 0.7 + Math.random() * 0.3, c: r.biome === "void" ? [230, 200, 255] : [255, 250, 230], front: false, phase: 0, size: 1 });
    }
  }

  /** `sky` draws wind and shooting stars (behind the terrain); otherwise glints, leaves and bubbles. */
  private drawSparks(ctx: CanvasRenderingContext2D, r: Region, ox: number, oy: number, front: boolean, sky = false) {
    const mine = (s: Spark) => s.region === r.id && s.front === front && (s.kind === "wind" || s.kind === "meteor") === sky;
    for (const s of this.sparks) {
      if ((s.kind !== "leaf" && s.kind !== "puff") || !mine(s)) continue;
      ctx.fillStyle = rgb(s.c, Math.min(1, s.age / 0.15, (s.life - s.age) / 0.6) * (s.kind === "puff" ? 0.85 : 1));
      ctx.fillRect(Math.round(ox + s.x), Math.round(oy + s.y), s.size, s.kind === "puff" ? s.size : 1);
    }
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const s of this.sparks) {
      if (s.kind === "leaf" || s.kind === "puff" || !mine(s)) continue;
      const a = s.age / s.life;
      const fade = Math.min(1, s.age / 0.15, (s.life - s.age) / 0.25);
      const x = Math.round(ox + s.x);
      const y = Math.round(oy + s.y);
      if (s.kind === "glint") {
        // A dot that swells into a cross and shrinks again.
        const arm = a < 0.25 || a > 0.8 ? 0 : a < 0.45 || a > 0.65 ? 1 : 2;
        ctx.fillStyle = rgb(s.c, 0.95);
        ctx.fillRect(x, y, 1, 1);
        if (arm) {
          ctx.fillStyle = rgb(s.c, 0.6);
          ctx.fillRect(x - arm, y, arm * 2 + 1, 1);
          ctx.fillRect(x, y - arm, 1, arm * 2 + 1);
        }
      } else if (s.kind === "pop") {
        ctx.fillStyle = rgb(s.c, fade);
        ctx.fillRect(x, y, s.size, s.size);
      } else if (s.kind === "meteor") {
        for (let i = 0; i < 12; i++) {
          ctx.fillStyle = rgb(s.c, fade * (1 - i / 12) * 0.9);
          ctx.fillRect(Math.round(x - (s.vx / 140) * i * 1.6), Math.round(y - (s.vy / 140) * i * 1.6), 1, 1);
        }
      } else this.drawWind(ctx, s, ox, oy);
    }
    ctx.restore();
  }

  /** A thin trail that ripples across the sky and curls into a loop before it fades. */
  private drawWind(ctx: CanvasRenderingContext2D, s: Spark, ox: number, oy: number) {
    const length = s.vx * s.life;
    const amp = s.size;
    const day = clamp01(0.35 + 0.65 * this.skyNow.day);
    const env = Math.min(1, s.age / 0.3, (s.life - s.age) / 0.4);
    const head = (s.age / s.life) * 1.3;
    const tail = head - 0.38;
    const loopAt = 0.74;
    const path = (u: number) => {
      const bx = s.x + Math.min(u, loopAt) * length;
      const by = s.y + Math.sin(Math.min(u, loopAt) * 7.5 + s.phase) * amp;
      if (u <= loopAt) return [bx, by] as const;
      const th = ((u - loopAt) / (1 - loopAt)) * Math.PI * 2;
      const R = 5;
      return [bx + R * Math.sin(th) + (u - loopAt) * length * 0.35, by - R * (1 - Math.cos(th))] as const;
    };
    const N = 30;
    for (let i = 0; i <= N; i++) {
      const u = tail + ((head - tail) * i) / N;
      if (u < 0 || u > 1) continue;
      const [px, py] = path(u);
      ctx.fillStyle = `rgba(255,255,255,${(i / N) * 0.7 * env * day})`;
      ctx.fillRect(Math.round(ox + px), Math.round(oy + py), 1, 1);
    }
  }

  /** Fireflies at night, drips in caves, sparkles among crystals, embers in the inferno, motes in the void. */
  private drawAmbient(r: Region, ox: number, oy: number, top: number, bottom: number, dt: number, t: number) {
    const b = this.bctx;
    const outside = OUTDOOR.has(r.biome);
    const night = outside ? Math.max(0, Math.min(1, (-0.05 - this.skyNow.e) / 0.25)) : 1;
    const want = outside ? (night > 0 ? (this.low ? 10 : 22) : 0) : r.biome === "cave" ? (this.low ? 4 : 8) : this.low ? 12 : 30;
    const minX = -ox;
    const maxX = this.bw - ox;
    const minY = Math.max(top, 0) - oy;
    const maxY = Math.min(bottom, this.bh) - oy;
    while (r.ambient.length < want) r.ambient.push(this.spawnAmbient(r.biome, minX, maxX, minY, maxY, true));
    if (r.ambient.length > want + 12) r.ambient.length = want;
    b.save();
    b.globalCompositeOperation = "lighter";
    for (let i = 0; i < r.ambient.length; i++) {
      let p = r.ambient[i]!;
      if (dt > 0) {
        p.age += dt;
        p.x += p.vx * dt + (outside || r.biome === "grove" ? Math.sin(t / 900 + p.phase) * 6 * dt : 0);
        p.y += p.vy * dt;
      }
      if (p.age > p.life || p.y < minY - 8 || p.y > maxY + 8 || p.x < minX - 8 || p.x > maxX + 8) {
        p = r.ambient[i] = this.spawnAmbient(r.biome, minX, maxX, minY, maxY, false);
      }
      const blinking = outside || r.biome === "grove";
      const fade = Math.min(1, p.age / 0.4, (p.life - p.age) / 0.4) * (blinking ? night * (0.4 + 0.6 * Math.max(0, Math.sin(t / 400 + p.phase))) : 1);
      if (fade <= 0) continue;
      const x = Math.round(ox + p.x);
      const y = Math.round(oy + p.y);
      if (p.tall) {
        // A falling drip: a short streak, no halo.
        b.fillStyle = rgb(p.c, 0.55 * fade);
        b.fillRect(x, y - 2, 1, 3);
        continue;
      }
      b.fillStyle = rgb(p.c, 0.22 * fade);
      b.fillRect(x - 1, y - 1, p.size + 2, p.size + 2);
      b.fillStyle = rgb(p.c, 0.9 * fade);
      b.fillRect(x, y, p.size, p.size);
    }
    b.restore();
  }

  private spawnAmbient(biome: Biome, minX: number, maxX: number, minY: number, maxY: number, anywhere: boolean): Ambient {
    const x = minX + Math.random() * (maxX - minX);
    const y = minY + Math.random() * (maxY - minY);
    const phase = Math.random() * 6.28;
    switch (biome) {
      case "overworld":
      case "city":
        return { x, y: Math.min(y, -8), vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 6, age: 0, life: 4 + Math.random() * 4, c: [220, 255, 140], size: 1, phase };
      case "grove":
        return { x, y: Math.min(y, -8), vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 6, age: 0, life: 4 + Math.random() * 4, c: [255, 210, 110], size: 1, phase };
      case "space":
        return { x, y, vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4, age: 0, life: 4 + Math.random() * 4, c: Math.random() < 0.5 ? [200, 240, 150] : [210, 180, 255], size: 1, phase };
      case "cave":
        return { x, y: anywhere ? y : minY + 4, vx: 0, vy: 70 + Math.random() * 40, age: 0, life: 6, c: [110, 150, 210], size: 1, phase, tall: true };
      case "crystal":
        return { x, y, vx: (Math.random() - 0.5) * 4, vy: -4 - Math.random() * 6, age: 0, life: 3 + Math.random() * 3, c: Math.random() < 0.5 ? [200, 160, 255] : [140, 230, 255], size: 1, phase };
      case "inferno":
        return { x, y: anywhere ? y : maxY - 4, vx: (Math.random() - 0.5) * 10, vy: -18 - Math.random() * 26, age: 0, life: 3 + Math.random() * 3, c: Math.random() < 0.6 ? [255, 140, 40] : [255, 210, 90], size: Math.random() < 0.3 ? 2 : 1, phase };
      case "void":
        return { x, y, vx: (Math.random() - 0.5) * 3, vy: -6 - Math.random() * 8, age: 0, life: 4 + Math.random() * 4, c: [200, 140, 255], size: 1, phase };
    }
  }

  private glowSprite(c: RGB, radius: number) {
    const key = `${c.join(",")}|${radius}`;
    let s = this.glowCache.get(key);
    if (!s) {
      s = canvas(radius * 2, radius * 2);
      const ctx = s.getContext("2d")!;
      const g = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
      g.addColorStop(0, rgb(c, 1));
      g.addColorStop(0.4, rgb(c, 0.35));
      g.addColorStop(1, rgb(c, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, radius * 2, radius * 2);
      this.glowCache.set(key, s);
    }
    return s;
  }

  /** Halos around light sources. Flames flicker, lava breathes slowly, the rest hold steady. */
  private drawGlows(r: Region, placements: [Chunk, number, number][], ox: number, oy: number, t: number) {
    const night = OUTDOOR.has(r.biome) ? 1 - this.skyNow.day : 1;
    const strength = OUTDOOR.has(r.biome) ? 0.2 + 0.28 * night : 0.4;
    const b = this.bctx;
    b.save();
    b.globalCompositeOperation = "lighter";
    for (const [chunk] of placements) {
      for (const g of chunk.glows) {
        if (this.low && g.r < 20) continue;
        let flick = 1;
        if (t && g.kind === "flame") flick = 1 + Math.sin(t / 63 + g.x * 3.1) * 0.09 + Math.sin(t / 27 + g.y * 7.3) * 0.06;
        else if (t && g.kind === "lava") flick = 1 + Math.sin(t / 900 + g.x * 0.8) * 0.1;
        b.globalAlpha = Math.min(1, strength * g.a * flick);
        b.drawImage(this.glowSprite(g.c, g.r), Math.round(ox + g.x * TEX + 8 - g.r), Math.round(oy + g.y * TEX + 8 - g.r));
      }
    }
    // Fairies light their surroundings in their own colour.
    for (const m of this.mobs) {
      if (m.region !== r.id || m.kind !== "fairy" || m.state === "held") continue;
      const f = frameOf(m);
      if (!f.glow) continue;
      const cx = ox + m.x;
      const cy = oy + m.y - DEFS.fairy.bh / 2;
      const pulse = t ? 0.85 + 0.15 * Math.sin(t / 300 + m.id) : 1;
      b.globalAlpha = 0.32 * pulse * m.fade;
      b.drawImage(this.glowSprite(f.glow, 46), Math.round(cx - 46), Math.round(cy - 46));
    }
    b.restore();
  }

  /** Fairies float above every layer, front blocks included, with a soft light that reaches the front layer too. */
  private drawFairies(r: Region, ox: number, oy: number, t: number) {
    const f = this.fctx;
    for (const m of this.mobs) {
      if (m.region !== r.id || m.kind !== "fairy" || m.state === "held") continue;
      const glow = frameOf(m).glow;
      if (glow) {
        const cx = ox + m.x;
        const cy = oy + m.y - DEFS.fairy.bh / 2;
        const pulse = t ? 0.85 + 0.15 * Math.sin(t / 300 + m.id) : 1;
        f.save();
        f.globalCompositeOperation = "lighter";
        f.globalAlpha = 0.16 * pulse * m.fade;
        f.drawImage(this.glowSprite(glow, 26), Math.round(cx - 26), Math.round(cy - 26));
        f.globalAlpha = 0.7 * pulse * m.fade;
        f.drawImage(this.glowSprite(glow, 12), Math.round(cx - 12), Math.round(cy - 12));
        f.restore();
      }
      this.drawMob(f, m, null, t);
    }
  }

  // ---------------------------------------------------------------- creatures

  /** Finds the section holding a page row (in texels), or null above or below the page. */
  private regionAtPage(pageY: number): Region | null {
    for (const r of this.regions.values()) if (r.g && pageY >= r.g.topTex && pageY < r.g.bottomTex) return r;
    return null;
  }

  private blocksAt(r: Region, cx: number, cy: number) {
    const id = this.env.cell(r.id, cx, cy).m;
    return !!id && BLOCKS[id].solid && id !== "water" && id !== "lava";
  }

  private makeEnv(): Env {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- the getter below needs the engine, not the object literal
    const engine = this;
    return {
      cell: (region, cx, cy) => {
        const r = this.regions.get(region)!;
        if (!r.g || (cy >= r.top && cy < GROUND_ROWS)) return this.cell(r, cx, cy);
        // Rows past a section's edge belong to the section above or below it.
        const pageY = r.g.groundTex + cy * TEX + TEX / 2;
        const other = this.regionAtPage(pageY);
        if (!other?.g || other === r) return pageY < r.g.topTex ? this.cell(r, cx, cy) : EMPTY_CELL;
        return this.cell(other, cx, Math.floor((pageY - other.g.groundTex) / TEX));
      },
      bounds: (region) => {
        const b = this.bounds(region);
        const r = this.regions.get(region);
        return b && r ? { ...b, top: r.top } : null;
      },
      cross: (m) => {
        const r = this.regions.get(m.region)!;
        if (!r.g) return true;
        const mid = r.g.groundTex + m.y - DEFS[m.kind].bh / 2;
        if (mid >= r.g.topTex && mid < r.g.bottomTex) return true;
        const other = this.regionAtPage(mid);
        if (!other?.g) {
          if (mid < r.g.topTex) {
            m.y = r.g.topTex - r.g.groundTex + DEFS[m.kind].bh;
            m.vy = Math.max(0, m.vy);
            return true;
          }
          return false;
        }
        m.y += r.g.groundTex - other.g.groundTex;
        m.region = other.id;
        return true;
      },
      spots: (region, kind, clearance) => this.spots(region, kind, clearance),
      get night() {
        return engine.isNight;
      },
      sound: (kind, m, level) => this.mobSound(kind, m, level),
      effect: (kind, m, colour) => this.mobEffect(kind, m, colour),
    };
  }

  private get isNight() {
    return this.skyTheme === "night";
  }

  /** Floors to stand on, ceilings to hang from, or open air, within the visible part of a section. */
  private spots(region: RegionId, kind: "floor" | "ceiling" | "air", clearance: number): Place[] {
    const key = `${region}|${kind}|${clearance}`;
    const hit = this.spotCache.get(key);
    if (hit) return hit;
    const r = this.regions.get(region)!;
    const b = this.bounds(region);
    const out: Place[] = [];
    if (r.g && b) {
      const air = (cx: number, cy: number) => {
        const c = this.cell(r, cx, cy);
        return !this.blocksAt(r, cx, cy) && c.m !== "water" && c.m !== "lava";
      };
      // Skip the first rows, where sections meet in loose rubble.
      for (let cy = r.top + (kind === "ceiling" ? 1 : 4); cy < GROUND_ROWS; cy++) {
        for (let cx = b.left; cx <= b.right; cx++) {
          if (!air(cx, cy)) continue;
          if (kind === "air") out.push({ x: cx * TEX + TEX / 2, y: cy * TEX + TEX / 2 });
          else if (kind === "ceiling") {
            if (this.blocksAt(r, cx, cy - 1) && cy - 1 >= r.top + 1 && air(cx, cy + 1)) out.push({ x: cx * TEX + TEX / 2, y: cy * TEX });
          } else if (cy + 1 < GROUND_ROWS && this.blocksAt(r, cx, cy + 1)) {
            let room = true;
            for (let k = 1; k < clearance; k++) if (!air(cx, cy - k)) room = false;
            if (room) out.push({ x: cx * TEX + TEX / 2, y: (cy + 1) * TEX });
          }
        }
      }
    }
    this.spotCache.set(key, out);
    return out;
  }

  /**
   * Creature sounds come from where the creature is: full volume near the middle of the screen, fading toward
   * the edges and beyond, silent once it's more than about half a screen out of view. Panned left or right too.
   * Sounds a creature makes on its own (level below 1) are quieter, and at most one plays every 1.5 seconds,
   * so a cave full of fairies or a void of shades stays calm.
   */
  private mobSound(kind: SoundKind, m: Mob, level = 1) {
    const r = this.regions.get(m.region);
    if (!r?.g) return;
    const placement = soundPlacement(r.g.cx + m.x - this.bw / 2, r.g.groundTex - this.scrollTex + m.y - DEFS[m.kind].bh / 2 - this.bh / 2, this.bw / 2, this.bh / 2);
    const now = performance.now();
    if (!placement || now - this.lastSound < 160) return;
    if (level < 1) {
      if (now - this.lastAmbient < 1500) return;
      this.lastAmbient = now;
    }
    this.lastSound = now;
    this.onSound(kind, { volume: placement.volume * level, pan: placement.pan });
  }

  private mobEffect(kind: Effect, m: Mob, colour?: RGB) {
    const d = DEFS[m.kind];
    const cx = m.x;
    const cy = m.y - d.bh / 2;
    const add = (n: number, make: (i: number) => Partial<Spark>) => {
      for (let i = 0; i < n; i++) this.sparks.push({ kind: "puff", region: m.region, x: cx, y: cy, vx: 0, vy: 0, age: 0, life: 0.6, c: [230, 230, 230], front: false, phase: 0, size: 2, ...make(i) });
    };
    const ring = (i: number, n: number, speed: number) => ({ vx: Math.cos((i / n) * 6.28) * speed * (0.6 + Math.random() * 0.6), vy: Math.sin((i / n) * 6.28) * speed * (0.6 + Math.random() * 0.6) });
    switch (kind) {
      case "poof":
        add(10, (i) => ({ ...ring(i, 10, 40), c: colour ?? (Math.random() < 0.5 ? [240, 240, 236] : [200, 200, 206]), x: cx + (Math.random() - 0.5) * d.bw, y: cy + (Math.random() - 0.5) * d.bh, life: 0.5 + Math.random() * 0.3 }));
        break;
      case "warp":
        add(16, (i) => ({ ...ring(i, 16, 30), vy: -20 - Math.random() * 30, c: Math.random() < 0.5 ? [170, 90, 255] : [230, 190, 255], x: cx + (Math.random() - 0.5) * 10, y: m.y - Math.random() * d.bh, size: 1, life: 0.7 + Math.random() * 0.4 }));
        break;
      case "smoke":
        add(12, () => ({ vx: (Math.random() - 0.5) * 20, vy: -25 - Math.random() * 30, c: Math.random() < 0.6 ? [90, 84, 90] : [255, 150, 50], x: cx + (Math.random() - 0.5) * d.bw, y: m.y - Math.random() * 4, life: 0.8 + Math.random() * 0.5 }));
        break;
      case "sparkle":
        this.sparks.push({ kind: "pop", region: m.region, x: cx + (Math.random() - 0.5) * 4, y: cy + (Math.random() - 0.5) * 4, vx: (Math.random() - 0.5) * 6, vy: 4 + Math.random() * 6, age: 0, life: 0.6, c: colour ?? [255, 255, 255], front: m.kind === "fairy", phase: 0, size: 1 });
        break;
      case "bubbles":
        this.sparks.push({ kind: "pop", region: m.region, x: cx + (Math.random() - 0.5) * d.bw, y: cy, vx: 0, vy: -18, age: 0, life: 0.7, c: [190, 225, 255], front: false, phase: 0, size: 1 });
        break;
      case "splash": {
        const now = performance.now();
        for (let i = 0; i < 14; i++) {
          this.particles.push({ region: m.region, x: cx + (Math.random() - 0.5) * d.bw, y: m.y - 2, vx: (Math.random() - 0.5) * 90, vy: -(70 + Math.random() * 90), size: Math.random() < 0.5 ? 1 : 2, c: Math.random() < 0.5 ? [120, 180, 255] : [210, 235, 255], layer: "m", born: now, life: 500 + Math.random() * 300, rest: false });
        }
        break;
      }
    }
    this.request();
  }

  private stepMobs(dt: number) {
    // Creatures arrive once their section has been measured.
    for (const r of this.regions.values()) {
      if (r.spawned || !r.g || !r.cells.length) continue;
      r.spawned = true;
      this.mobs.push(...spawnFor(r.id, this.env));
    }
    const env = this.env;
    for (const m of this.mobs) {
      // With animation paused, creatures hold still unless they're in the air or in someone's hand.
      if (!this.opts.motion && !moving(m)) continue;
      // Far off screen, only the clock that sends wanderers home keeps running.
      const r = this.regions.get(m.region);
      const y = r?.g ? r.g.groundTex - this.scrollTex + m.y : 0;
      if (r?.g && (y < -this.bh || y > this.bh * 2) && !moving(m)) {
        if (m.region !== m.home) m.away += dt;
        if (m.away <= m.awayLimit) continue;
      }
      stepMob(m, this.mobs, env, dt);
    }
    if (this.owedCheers > 0) this.payCheers();
  }

  private mobScreen(m: Mob) {
    const r = this.regions.get(m.region);
    if (!r?.g) return null;
    const f = frameOf(m);
    const ox = r.g.cx;
    const oy = r.g.groundTex - this.scrollTex;
    const w = f.lying ? f.img.height : f.img.width;
    const h = f.lying ? f.img.width : f.img.height;
    const cx = ox + m.x;
    // Lying down, the mini me rests on the mattress rather than the floor.
    const bottom = f.centred ? oy + m.y - DEFS[m.kind].bh / 2 + h / 2 : oy + m.y - (f.lying ? 4 : 0);
    return { f, x: cx - w / 2, y: bottom - h, w, h, cx, bottom };
  }

  /** Draws one creature, shaded by the light where it stands. */
  private drawMob(ctx: CanvasRenderingContext2D, m: Mob, dark: { c: RGB; a: number } | null, t: number) {
    const s = this.mobScreen(m);
    if (!s) return;
    const { f } = s;
    const sc = this.mobScratch;
    const g = sc.getContext("2d")!;
    g.clearRect(0, 0, sc.width, sc.height);
    g.save();
    if (f.flip) {
      g.translate(f.img.width, 0);
      g.scale(-1, 1);
    }
    g.drawImage(f.img, 0, 0);
    g.restore();
    if (dark && dark.a > 0.02 && m.kind !== "fairy") {
      g.save();
      g.globalCompositeOperation = "source-atop";
      g.fillStyle = rgb(dark.c, dark.a);
      g.fillRect(0, 0, f.img.width, f.img.height);
      g.restore();
    }
    if (m.burning > 0 && Math.floor(t / 90) % 2 === 0) {
      g.save();
      g.globalCompositeOperation = "source-atop";
      g.fillStyle = "rgba(255,90,30,0.35)";
      g.fillRect(0, 0, f.img.width, f.img.height);
      g.restore();
    }
    // A shade's eyes stay bright in the dark.
    if (m.kind === "shade") {
      g.fillStyle = "#e2b8ff";
      for (const [ex, ey] of SHADE_EYES) g.fillRect(f.flip ? f.img.width - 1 - ex : ex, ey, 1, 1);
    }
    ctx.save();
    ctx.globalAlpha = m.fade;
    const quarter = ((Math.round(f.spin / (Math.PI / 2)) % 4) + 4) % 4;
    if (f.lying || quarter) {
      ctx.translate(Math.round(s.cx), Math.round(s.bottom - s.h / 2));
      ctx.rotate(f.lying ? -Math.PI / 2 : quarter * (Math.PI / 2));
      ctx.drawImage(sc, 0, 0, f.img.width, f.img.height, -Math.round(f.img.width / 2), -Math.round(f.img.height / 2), f.img.width, f.img.height);
    } else ctx.drawImage(sc, 0, 0, f.img.width, f.img.height, Math.round(s.x), Math.round(s.y), f.img.width, f.img.height);
    ctx.restore();
    // A blanket over the mini me while it sleeps.
    if (f.lying) {
      const x = Math.round(s.cx) - 1;
      const y = Math.round(s.bottom);
      ctx.fillStyle = dark && dark.a > 0.02 ? rgb(mix([200, 53, 46], dark.c, dark.a)) : "#c8352e";
      ctx.fillRect(x, y - 8, 11, 6);
      ctx.fillStyle = dark && dark.a > 0.02 ? rgb(mix([138, 31, 28], dark.c, dark.a)) : "#8a1f1c";
      ctx.fillRect(x, y - 3, 11, 1);
      ctx.fillRect(x, y - 8, 1, 6);
    }
    // Flames while it smoulders, and stars while it's dizzy.
    if (m.burning > 0) {
      for (let i = 0; i < 4; i++) {
        const fx = s.x + ((i * 5 + Math.floor(t / 70)) % Math.max(1, s.w));
        const fy = s.y + s.h * 0.4 - ((t / 6 + i * 7) % 8);
        ctx.fillStyle = i % 2 ? "#ffd65a" : "#ff8a2b";
        ctx.fillRect(Math.round(fx), Math.round(fy), 1, 2);
      }
    }
    if (m.state === "dizzy") {
      for (let i = 0; i < 3; i++) {
        const a = t / 180 + (i * Math.PI * 2) / 3;
        ctx.fillStyle = "#ffe066";
        ctx.fillRect(Math.round(s.cx + Math.cos(a) * 6), Math.round(s.y - 2 + Math.sin(a) * 2), 1, 1);
      }
    }
  }

  private drawMobs(r: Region, ox: number, oy: number, t: number) {
    const b = this.bctx;
    const look = this.look(r);
    const light = this.lightOf(r);
    for (const m of this.mobs) {
      if (m.region !== r.id || m.state === "held" || m.kind === "fairy") continue;
      const d = DEFS[m.kind];
      const cx = Math.floor(m.x / TEX);
      const cy = Math.floor((m.y - d.bh / 2) / TEX);
      const lit = this.litFrom(r, lightAt(light, "sky", cx, cy), lightAt(light, "block", cx, cy));
      // A soft contact shadow under anything standing on the ground.
      if (m.onGround && !d.fly && m.state !== "sleep") {
        b.fillStyle = "rgba(10,6,24,0.28)";
        b.fillRect(Math.round(ox + m.x - d.bw / 2 + 1), Math.round(oy + m.y), d.bw - 2, 1);
      }
      // Shades are hard to see in the dark void, so they're shaded less and carry a faint violet aura.
      if (m.kind === "shade") {
        b.save();
        b.globalCompositeOperation = "lighter";
        b.globalAlpha = 0.22 * m.fade;
        b.drawImage(this.glowSprite([150, 80, 230], 22), Math.round(ox + m.x - 22), Math.round(oy + m.y - d.bh / 2 - 22));
        b.restore();
      }
      this.drawMob(b, m, { c: OUTDOOR.has(r.biome) ? OVERWORLD_ROCK : look.dark, a: (1 - lit) * (m.kind === "shade" ? 0.45 : 0.8) }, t);
    }
  }

  /** The carried creature is drawn above everything, and so are speech bubbles. */
  private drawHeldAndBubbles() {
    const f = this.fctx;
    const heldMob = this.held ? this.mobs.find((m) => m.id === this.held!.id) : null;
    if (heldMob) this.drawMob(f, heldMob, null, performance.now());
    for (const m of this.mobs) {
      if (!m.bubble) continue;
      const s = this.mobScreen(m);
      if (!s || s.bottom < -10 || s.y > this.bh + 10) continue;
      drawBubble(f, m.bubble, s.cx, s.y - 1, this.bw);
    }
  }

  private toTexel(clientX: number, clientY: number) {
    return { tx: (clientX * this.dpr) / this.T, ty: (clientY * this.dpr + this.remainder()) / this.T };
  }

  /** The creature under the pointer, if any. Small ones get a little extra room. */
  mobAt(clientX: number, clientY: number): number | null {
    const { tx, ty } = this.toTexel(clientX, clientY);
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i]!;
      if (m.state === "teleport") continue;
      const s = this.mobScreen(m);
      if (!s) continue;
      const pad = s.w < 12 ? 5 : 3;
      if (tx >= s.x - pad && tx <= s.x + s.w + pad && ty >= s.y - pad && ty <= s.bottom + pad) return m.id;
    }
    return null;
  }

  grabMob(id: number, clientX: number, clientY: number) {
    const m = this.mobs.find((o) => o.id === id);
    const r = m && this.regions.get(m.region);
    if (!m || !r?.g) return;
    const { tx, ty } = this.toTexel(clientX, clientY);
    this.held = { id, dx: m.x - (tx - r.g.cx), dy: m.y - (ty + this.scrollTex - r.g.groundTex), samples: [] };
    grab(m, this.env);
    this.dragMob(clientX, clientY);
  }

  /** Follows the pointer, moving the creature into whichever section is under it. */
  dragMob(clientX: number, clientY: number) {
    const h = this.held;
    const m = h && this.mobs.find((o) => o.id === h.id);
    if (!h || !m) return;
    const { tx, ty } = this.toTexel(clientX, clientY);
    const pageY = ty + this.scrollTex;
    const r = this.regionAtPage(pageY + h.dy - DEFS[m.kind].bh / 2) ?? this.regionAtPage(pageY) ?? this.regions.get(m.region)!;
    if (!r.g) return;
    m.region = r.id;
    m.x = tx - r.g.cx + h.dx;
    m.y = pageY - r.g.groundTex + h.dy;
    const now = performance.now();
    h.samples.push({ x: tx, y: pageY, t: now });
    while (h.samples.length > 2 && now - h.samples[0]!.t > 110) h.samples.shift();
    this.request();
  }

  /** Lets go: the creature keeps the pointer's speed, so a flick throws it. */
  releaseMob() {
    const h = this.held;
    this.held = null;
    const m = h && this.mobs.find((o) => o.id === h.id);
    if (!h || !m) return;
    const a = h.samples[0];
    const z = h.samples[h.samples.length - 1];
    const span = a && z ? (z.t - a.t) / 1000 : 0;
    const fresh = z ? performance.now() - z.t < 80 : false;
    release(m, span > 0.01 && fresh ? (z!.x - a!.x) / span : 0, span > 0.01 && fresh ? (z!.y - a!.y) / span : 0);
    this.request();
  }

  pokeMob(id: number) {
    const m = this.mobs.find((o) => o.id === id);
    if (m) poke(m, this.env);
    this.request();
  }

  /**
   * After a visitor sends a message, the creatures they can see shout them out by the first name they typed.
   * The name stays in memory only, for this visit.
   */
  greet(name: string) {
    if (!setVisitor(name)) return;
    this.owedCheers = 2;
    this.payCheers();
    this.request();
  }

  /** The creatures nearest the middle of the screen shout out the visitor; if none is in view, the first to appear does. */
  private payCheers() {
    const seen: { m: Mob; d: number }[] = [];
    for (const m of this.mobs) {
      const s = this.mobScreen(m);
      if (!s || m.state === "held" || m.state === "teleport" || s.bottom < 0 || s.y > this.bh) continue;
      seen.push({ m, d: Math.abs(s.cx - this.bw / 2) + Math.abs(s.y - this.bh / 2) });
    }
    seen.sort((a, b) => a.d - b.d);
    for (const { m } of seen.slice(0, this.owedCheers)) {
      cheer(m, this.env);
      this.owedCheers--;
    }
  }

  get holding() {
    return this.held !== null;
  }

  /** For tests: where each creature is on screen, in CSS pixels. */
  debugMobs() {
    return this.mobs.map((m) => {
      const s = this.mobScreen(m);
      const cssX = s ? ((s.x + s.w / 2) * this.T) / this.dpr : -1;
      const cssY = s ? (((s.y + s.h / 2) * this.T - this.remainder()) / this.dpr) : -1;
      return { id: m.id, kind: m.kind, region: m.region, home: m.home, state: m.state, x: cssX, y: cssY, bubble: m.bubble?.text ?? null };
    });
  }

  // ---------------------------------------------------------------- build overlay

  private drawOverlay(now: number) {
    if (!this.opts.buildMode) return;
    const target = this.focused && this.cursor ? this.cursor : this.hover;
    if (!target) {
      this.onLabel(null);
      return;
    }
    const r = this.regions.get(target.region);
    if (!r?.g) return;
    const f = this.fctx;
    const px = r.g.cx + target.x * TEX;
    const py = r.g.groundTex - this.scrollTex + target.y * TEX;
    const status = this.status(target);
    const c = this.cell(r, target.x, target.y);
    const layer = this.opts.layer;
    const taken = !!c[layer];
    if (status === "ok" && !taken) {
      f.globalAlpha = 0.55;
      f.drawImage(layer === "b" ? this.atlas.back : this.atlas.mid, BLOCKS[this.opts.block].index * TEX, 0, TEX, TEX, px, py, TEX, TEX);
      f.globalAlpha = 1;
    }
    f.fillStyle = "#1a1622";
    f.fillRect(px - 1, py - 1, TEX + 2, 1);
    f.fillRect(px - 1, py + TEX, TEX + 2, 1);
    f.fillRect(px - 1, py, 1, TEX);
    f.fillRect(px + TEX, py, 1, TEX);
    const alert = now < this.flashUntil || status !== "ok";
    f.fillStyle = alert ? "#ff6b5e" : layer === "f" ? "#ffd84a" : layer === "b" ? "#9fb4ff" : "#ffffff";
    f.fillRect(px, py, TEX, 1);
    f.fillRect(px, py + TEX - 1, TEX, 1);
    f.fillRect(px, py, 1, TEX);
    f.fillRect(px + TEX - 1, py, 1, TEX);
    const name = layer === "b" ? "Back" : layer === "m" ? "Middle" : "Front";
    const text = status === "outside" ? "Out of reach" : taken ? `${name} taken` : name;
    const rect = this.cellRect(target)!;
    this.onLabel({ text, x: (rect.left + rect.right) / 2, y: rect.top, alert: alert || taken });
  }
}
