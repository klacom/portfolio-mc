import { BLOCK_IDS, BLOCKS, type BlockId } from "./blocks";
import type { DecorKind } from "./regions";

/**
 * Every texture is painted in code from small colour ramps (original art, no game files).
 * Tiles are 16×16 texels. The renderer draws at texel resolution and the browser scales up.
 */
export const TEX = 16;

export type RGB = [number, number, number];
type RGBA = [number, number, number, number];
type Texel = RGB | RGBA | null;

export const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const R = (list: string[]) => list.map(hex);

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- painting kit
type Painter = (t: Paint) => void;
type Paint = {
  r: () => number;
  noise: (period: number, x: number, y: number) => number;
  vor: (n: number) => { at: (x: number, y: number) => number; value: (id: number) => number };
  set: (x: number, y: number, c: Texel) => void;
  get: (x: number, y: number) => Texel;
};

function makeNoise(r: () => number) {
  const lattices: Record<number, number[]> = {};
  const s = (t: number) => t * t * (3 - 2 * t);
  return (period: number, x: number, y: number) => {
    const L = (lattices[period] ??= Array.from({ length: period * period }, () => r()));
    const size = 16 / period;
    const fx = x / size, fy = y / size, i = Math.floor(fx), j = Math.floor(fy);
    const u = s(fx - i), v = s(fy - j);
    const n = (a: number, b: number) => L[(((b % period) + period) % period) * period + (((a % period) + period) % period)]!;
    return (n(i, j) * (1 - u) + n(i + 1, j) * u) * (1 - v) + (n(i, j + 1) * (1 - u) + n(i + 1, j + 1) * u) * v;
  };
}

function makeVoronoi(r: () => number, count: number) {
  const pts = Array.from({ length: count }, () => [r() * 16, r() * 16, r()] as const);
  const grid = new Int16Array(256);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      let best = 1e9;
      let id = 0;
      pts.forEach((p, k) => {
        let dx = Math.abs(x + 0.5 - p[0]);
        dx = Math.min(dx, 16 - dx);
        let dy = Math.abs(y + 0.5 - p[1]);
        dy = Math.min(dy, 16 - dy);
        const d = dx * dx + dy * dy * 1.15;
        if (d < best) {
          best = d;
          id = k;
        }
      });
      grid[y * 16 + x] = id;
    }
  }
  return { at: (x: number, y: number) => grid[(((y % 16) + 16) % 16) * 16 + (((x % 16) + 16) % 16)]!, value: (id: number) => pts[id]![2] };
}

function paint(seed: number, painter: Painter): Texel[] {
  const px: Texel[] = new Array(256).fill(null);
  const r = mulberry32(seed);
  painter({
    r,
    noise: makeNoise(r),
    vor: (n) => makeVoronoi(r, n),
    set(x, y, c) {
      if (y < 0 || y > 15) return;
      px[y * 16 + (((x % 16) + 16) % 16)] = c;
    },
    get: (x, y) => px[(((y % 16) + 16) % 16) * 16 + (((x % 16) + 16) % 16)] ?? null,
  });
  return px;
}

// ---------------------------------------------------------------- colour ramps (shadow → highlight)
const RAMP = {
  dirt: R(["#4a2c1b", "#65402a", "#82573a", "#9c6e48", "#b5855a"]),
  grass: R(["#2a6b26", "#3b8a2e", "#53a83a", "#71c149", "#98d95f"]),
  stone: R(["#4b4d57", "#62646e", "#7a7c86", "#93959e", "#adafb6"]),
  cobble: R(["#33343b", "#55575e", "#707279", "#8c8e95", "#a9abb1"]),
  moss: R(["#2f5a22", "#447a2c", "#5c9536", "#78ad44", "#94c455"]),
  gravel: R(["#3f3c39", "#615c56", "#7d7770", "#99928a", "#b6aea4"]),
  gravelWarm: R(["#4a3c31", "#6b5747", "#87705c", "#a28a73", "#bca58b"]),
  sand: R(["#bb9c61", "#cfb479", "#ddc58e", "#e9d5a5", "#f4e5bf"]),
  sandstone: R(["#a98a52", "#c4a568", "#d6bb7f", "#e4cc96", "#f0dcae"]),
  clay: R(["#7a3c26", "#97502f", "#b0623b", "#c4774c", "#d68d61"]),
  brick: R(["#5a2820", "#7c3a2b", "#9a4a36", "#b45e46", "#c97659"]),
  mortar: R(["#7f786e", "#958e83", "#aaa396", "#bdb6a9", "#cfc9bd"]),
  snow: R(["#a9b8cd", "#c6d2e2", "#dce5f0", "#edf2f8", "#ffffff"]),
  ice: R(["#4f86cc", "#6c9fdd", "#8cb8ea", "#acd0f4", "#d2e8fd"]),
  water: R(["#1d4a9e", "#2860bd", "#3677d4", "#5291e4", "#8ab6f1"]),
  leaves: R(["#1f4f1c", "#2c6a25", "#3e8a30", "#58a63c", "#78c04f"]),
  autumn: R(["#6a2412", "#963a17", "#c2571e", "#de7a29", "#f0a43e"]),
  blossom: R(["#93396a", "#bd5487", "#da78a3", "#ee9ec0", "#f9c6da"]),
  plum: R(["#35185a", "#4e2580", "#6a35a6", "#8a54c8", "#b386e6"]),
  pave: R(["#9aa0ac", "#b9bec8", "#cfd3db", "#dfe2e8", "#eef0f4"]),
  asteroid: R(["#1b1f30", "#2a3047", "#3b4461", "#53607f", "#7682a3"]),
  amber: R(["#8a4806", "#c06e0e", "#ee9e1e", "#ffc64a", "#ffeba2"]),
  bark: R(["#2f1f12", "#4a3119", "#634324", "#7e5831", "#987042"]),
  birchBark: R(["#24211e", "#a9a294", "#c7c0b1", "#dcd6c9", "#f1ede4"]),
  oak: R(["#5a3b1c", "#7b532a", "#9b6c38", "#b78446", "#cf9c5a"]),
  darkOak: R(["#2a1a0e", "#3c2615", "#51351d", "#674527", "#7d5733"]),
  birch: R(["#8f7e52", "#b09d6a", "#c8b682", "#d9c998", "#e9dcb2"]),
  andesite: R(["#4f5154", "#686a6d", "#838588", "#9c9ea1", "#b6b8bb"]),
  deepslate: R(["#1f2128", "#2b2e36", "#383b45", "#464a55", "#585c68"]),
  tuff: R(["#4b4d45", "#5f6258", "#73766b", "#888b7f", "#a0a395"]),
  calcite: R(["#b7b9be", "#cbcdd1", "#dcdee1", "#eaebed", "#f8f9fa"]),
  dripstone: R(["#5a4637", "#765e4c", "#917862", "#aa907a", "#c3a993"]),
  amethyst: R(["#3b2160", "#5a3290", "#7a4cc0", "#9c72e0", "#c8a8f8"]),
  ember: R(["#3a0d0b", "#581512", "#79201a", "#9a2f24", "#bb4632"]),
  basalt: R(["#1c1c22", "#2a2a31", "#393942", "#494953", "#5c5c67"]),
  char: R(["#121015", "#1c1920", "#28242c", "#34303a", "#433e4a"]),
  ash: R(["#57514c", "#6b645e", "#7f7872", "#938c85", "#a79f98"]),
  infernal: R(["#250a0c", "#3a1114", "#521a1d", "#6c2628", "#883838"]),
  lava: R(["#b9380b", "#dd560f", "#f77b18", "#fca42a", "#fde24a"]),
  fungus: R(["#7e3612", "#b9601a", "#e48f28", "#f5bd46", "#ffe79c"]),
  pale: R(["#a39a6c", "#bfb584", "#d5cc9c", "#e4dcb1", "#f1ebca"]),
  obsidian: R(["#0c0714", "#150b21", "#201232", "#2d1b46", "#4a2f6e"]),
  violet: R(["#563869", "#704785", "#895ca1", "#a376bc", "#c398d6"]),
};

// ---------------------------------------------------------------- painters
/** Lava flows by sliding two tileable noise layers in opposite directions, one texel per frame. */
function lavaPainter(frame: number): Painter {
  return (t) => {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const n = t.noise(4, x - frame, y) * 0.7 + t.noise(8, x, y + frame) * 0.3;
        t.set(x, y, RAMP.lava[n < 0.3 ? 0 : n < 0.5 ? 1 : n < 0.7 ? 2 : n < 0.86 ? 3 : 4]!);
      }
    }
  };
}

function body(t: Paint, ramp: RGB[], y0 = 0, period = 4) {
  for (let y = y0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const n = t.noise(period, x, y);
      const v = t.r();
      let i = n < 0.34 ? 1 : n < 0.72 ? 2 : 3;
      if (v < 0.05) i = 0;
      else if (v < 0.1) i = Math.min(4, i + 1);
      t.set(x, y, ramp[i]!);
    }
  }
}

function pebbles(t: Paint, ramp: RGB[], count: number, y0 = 0) {
  for (let k = 0; k < count; k++) {
    const w = t.r() < 0.45 ? 3 : 2;
    const px = Math.floor(t.r() * 16);
    const py = y0 + Math.floor(t.r() * Math.max(1, 14 - y0));
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < w; dx++) t.set(px + dx, py + dy, ramp[3]!);
    t.set(px, py, ramp[4]!);
    for (let dx = 0; dx < w; dx++) if (py + 2 >= y0) t.set(px + dx, py + 2, ramp[1]!);
    for (let dy = 0; dy < 2; dy++) t.set(px + w, py + dy, ramp[1]!);
  }
}

/** Stones or crystal facets separated by 1-texel seams, each lit from the top left. */
function stones(t: Paint, count: number, pickRamp: (v: number) => RGB[], seam: RGB) {
  const V = t.vor(count);
  const isSeam = (x: number, y: number) => V.at(x + 1, y) !== V.at(x, y) || V.at(x, y + 1) !== V.at(x, y);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      if (isSeam(x, y)) {
        t.set(x, y, seam);
        continue;
      }
      const id = V.at(x, y);
      const ramp = pickRamp(V.value(id));
      let i = 1 + Math.floor(V.value(id) * 2.99);
      if (isSeam(x - 1, y) || isSeam(x, y - 1)) i += 1;
      else if (isSeam(x + 1, y) || isSeam(x, y + 1)) i -= 1;
      if (t.r() < 0.07) i += t.r() < 0.5 ? -1 : 1;
      t.set(x, y, ramp[clamp(i, 0, 4)]!);
    }
  }
}

function mossOver(t: Paint, amount: number) {
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const n = t.noise(4, x + 3, y + 7) - y * 0.012;
      if (n > 1 - amount) {
        const edge = t.noise(4, x + 3, y + 8) - (y + 1) * 0.012 <= 1 - amount;
        t.set(x, y, RAMP.moss[edge ? 1 : n > 1 - amount * 0.5 ? 3 : 2]!);
        if (t.r() < 0.12) t.set(x, y, RAMP.moss[4]!);
      }
    }
  }
}

const leafPainter = (ramp: RGB[]): Painter => (t) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) t.set(x, y, ramp[1]!);
  for (let gy = 0; gy < 4; gy++) {
    for (let gx = 0; gx < 4; gx++) {
      const cx = gx * 4 + Math.floor(t.r() * 2);
      const cy = gy * 4 + Math.floor(t.r() * 2);
      t.set(cx, cy, ramp[4]!);
      t.set(cx + 1, cy, ramp[3]!);
      t.set(cx + 2, cy, ramp[3]!);
      t.set(cx, cy + 1, ramp[3]!);
      t.set(cx + 1, cy + 1, ramp[2]!);
      t.set(cx + 2, cy + 1, ramp[2]!);
      t.set(cx + 1, cy + 2, ramp[0]!);
    }
  }
  for (let i = 0; i < 12; i++) t.set(Math.floor(t.r() * 16), Math.floor(t.r() * 16), t.r() < 0.55 ? null : ramp[0]!);
};

const plankPainter = (ramp: RGB[]): Painter => (t) => {
  const joints = [4, 12, 8, 1];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const row = y % 4;
      const p = Math.floor(y / 4);
      const j = joints[p]!;
      let i = row === 3 ? 0 : row === 0 ? 3 : 2;
      if ((row === 1 || row === 2) && t.noise(8, x, y + p * 3) > 0.62) i = 1;
      if (row === 0 && t.r() < 0.18) i = 4;
      if (x === j && row !== 3) i = 0;
      if (x === (j + 1) % 16 && row !== 3) i = row === 0 ? 4 : 3;
      if (row === 1 && (x === (j + 2) % 16 || x === (j + 15) % 16) && p % 2 === 0) i = 0;
      t.set(x, y, ramp[i]!);
    }
  }
};

/** Bricks laid in rows; `bw`×`bh` per brick, offset every other row. */
const brickPainter = (ramp: RGB[], mortar: RGB, bw: number, bh: number): Painter => (t) => {
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const row = Math.floor(y / bh);
      const ry = y % bh;
      const off = row % 2 ? bw / 2 : 0;
      const bx = (x + off) % bw;
      if (ry === bh - 1 || bx === bw - 1) {
        t.set(x, y, mortar);
        continue;
      }
      let i = 2;
      if (ry === 0 || bx === 0) i = 3;
      else if (ry === bh - 2 || bx === bw - 2) i = 1;
      else {
        const n = t.noise(4, x, y);
        i = n < 0.3 ? 1 : n < 0.8 ? 2 : 3;
      }
      t.set(x, y, ramp[i]!);
    }
  }
};

const colourPainter = (base: string): Painter => {
  const c = hex(base);
  return (t) => {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        let f = 1 + (t.noise(4, x, y) - 0.5) * 0.07 + (t.r() - 0.5) * 0.025;
        if (y === 0 || x === 0) f += 0.1;
        else if (y === 15 || x === 15) f -= 0.14;
        else if (y === 1 || x === 1) f += 0.04;
        t.set(x, y, c.map((v) => clamp(v * f, 0, 255)) as RGB);
      }
    }
  };
};

const orePainter = (base: Painter, ore: string[]): Painter => (t) => {
  base(t);
  const O = R(ore);
  for (let k = 0; k < 4; k++) {
    const x = 1 + Math.floor(t.r() * 13);
    const y = 1 + Math.floor(t.r() * 13);
    const w = t.r() < 0.5 ? 2 : 3;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < w; dx++) t.set(x + dx, y + dy, O[1]!);
    t.set(x, y, O[2]!);
    for (let dx = 0; dx < w; dx++) t.set(x + dx, y + 2, O[0]!);
    t.set(x + w, y + 1, O[0]!);
  }
};

const rockPainter = (ramp: RGB[], specks = 0.1, period = 4): Painter => (t) => {
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const n = t.noise(period, x, y) * 0.7 + t.noise(8, x, y) * 0.3 + (t.r() - 0.5) * 0.1;
      let i = n < 0.3 ? 1 : n < 0.68 ? 2 : n < 0.88 ? 3 : 4;
      const v = t.r();
      if (v < specks / 2) i = 0;
      else if (v < specks) i = Math.min(4, i + 2);
      t.set(x, y, ramp[i]!);
    }
  }
};

const PAINT: Partial<Record<BlockId, Painter>> = {
  grass: (t) => {
    body(t, RAMP.dirt, 2);
    pebbles(t, RAMP.dirt, 5, 4);
    for (let x = 0; x < 16; x++) {
      let edge = 3 + Math.floor(t.noise(4, x, 0) * 2.99);
      if (t.r() < 0.16) edge += 2;
      for (let y = 0; y < edge; y++) t.set(x, y, RAMP.grass[y === 0 ? (t.r() < 0.55 ? 4 : 3) : y === 1 ? (t.r() < 0.3 ? 4 : 3) : y === edge - 1 ? 1 : 2]!);
      t.set(x, edge, RAMP.dirt[0]!);
    }
  },
  dirt: (t) => {
    body(t, RAMP.dirt);
    pebbles(t, RAMP.dirt, 6);
  },
  stone: (t) => {
    rockPainter(RAMP.stone, 0)(t);
    for (let c = 0; c < 3; c++) {
      let x = Math.floor(t.r() * 16);
      let y = 2 + Math.floor(t.r() * 12);
      for (let s = 0, len = 3 + Math.floor(t.r() * 3); s < len; s++) {
        t.set(x, y, RAMP.stone[0]!);
        t.set(x, y + 1, RAMP.stone[4]!);
        x += 1;
        if (t.r() < 0.35) y += t.r() < 0.5 ? -1 : 1;
      }
    }
  },
  cobble: (t) => stones(t, 9, () => RAMP.cobble, RAMP.cobble[0]!),
  mossy: (t) => {
    stones(t, 9, () => RAMP.cobble, RAMP.cobble[0]!);
    mossOver(t, 0.42);
  },
  gravel: (t) => stones(t, 22, (v) => (v > 0.62 ? RAMP.gravelWarm : RAMP.gravel), RAMP.gravel[0]!),
  sand: (t) => {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const n = t.noise(8, x, y);
        const v = t.r();
        t.set(x, y, RAMP.sand[v < 0.06 ? 1 : v < 0.1 ? 4 : n < 0.45 ? 2 : 3]!);
      }
    }
    for (let k = 0; k < 4; k++) {
      const y = 2 + k * 4 + Math.floor(t.r() * 2);
      const x0 = Math.floor(t.r() * 16);
      for (let s = 0; s < 5; s++) {
        t.set(x0 + s, y, RAMP.sand[3]!);
        if (s > 0 && s < 4) t.set(x0 + s, y + 1, RAMP.sand[1]!);
      }
    }
  },
  sandstone: (t) => {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        let i = 2;
        if (y <= 1) i = y === 0 ? 4 : 3;
        else if (y === 2 || y === 8 || y === 13 || y === 15) i = 1;
        else if (y === 7 || y === 12) i = 3;
        if (i === 2 && t.r() < 0.1) i = t.r() < 0.5 ? 1 : 3;
        t.set(x, y, RAMP.sandstone[i]!);
      }
    }
  },
  clay: rockPainter(RAMP.clay, 0.06),
  snow: (t) => {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const n = t.noise(4, x, y);
        t.set(x, y, RAMP.snow[t.r() < 0.05 ? 4 : n < 0.3 ? 1 : n < 0.62 ? 2 : 3]!);
      }
    }
  },
  ice: (t) => {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const n = t.noise(4, x, y);
        let i = n < 0.35 ? 1 : n < 0.7 ? 2 : 3;
        if ((x + y) % 11 === 0 && x > 2 && x < 13) i = 4;
        const c = RAMP.ice[i]!;
        t.set(x, y, [c[0], c[1], c[2], 205]);
      }
    }
  },
  water: (t) => {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const n = t.noise(4, x, y);
        let i = n < 0.4 ? 1 : n < 0.75 ? 2 : 3;
        if (y === 0) i = 4;
        const c = RAMP.water[i]!;
        t.set(x, y, [c[0], c[1], c[2], y === 0 ? 230 : 185]);
      }
    }
  },
  moss: (t) => {
    body(t, RAMP.moss, 0, 4);
    for (let i = 0; i < 18; i++) t.set(Math.floor(t.r() * 16), Math.floor(t.r() * 16), RAMP.moss[4]!);
  },
  leaves: leafPainter(RAMP.leaves),
  plumleaves: leafPainter(RAMP.plum),
  pavement: (t) => {
    // Square paving slabs with a pale bevel and grey grout.
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const tx = x % 8;
        const ty = y % 8;
        let i = t.noise(4, x, y) < 0.5 ? 2 : 3;
        if (tx === 7 || ty === 7) i = 0;
        else if (tx === 0 || ty === 0) i = 4;
        else if (tx === 6 || ty === 6) i = 1;
        t.set(x, y, RAMP.pave[i]!);
      }
    }
  },
  asteroid: (t) => {
    rockPainter(RAMP.asteroid, 0.05)(t);
    // A few shallow craters, lit from the top left.
    for (let k = 0; k < 3; k++) {
      const cx = 2 + Math.floor(t.r() * 12);
      const cy = 2 + Math.floor(t.r() * 12);
      t.set(cx, cy, RAMP.asteroid[0]!);
      t.set(cx + 1, cy, RAMP.asteroid[1]!);
      t.set(cx, cy + 1, RAMP.asteroid[1]!);
      t.set(cx + 1, cy + 1, RAMP.asteroid[3]!);
      t.set(cx - 1, cy - 1, RAMP.asteroid[1]!);
    }
  },
  amber: (t) => {
    const V = t.vor(6);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const id = V.at(x, y);
        const seam = V.at(x + 1, y) !== id || V.at(x, y + 1) !== id;
        const v = V.value(id);
        t.set(x, y, RAMP.amber[seam ? 1 : v < 0.35 ? 2 : v < 0.75 ? 3 : 4]!);
      }
    }
  },
  autumn: leafPainter(RAMP.autumn),
  blossom: leafPainter(RAMP.blossom),
  log: (t) => {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const c = x % 4;
        const broken = t.noise(8, x, y) > 0.72;
        let i = 2;
        if (c === 0 && !broken) i = t.r() < 0.5 ? 0 : 1;
        else if (c === 2 && !broken) i = t.r() < 0.2 ? 4 : 3;
        else if (t.r() < 0.08) i = 1;
        t.set(x, y, RAMP.bark[i]!);
      }
    }
  },
  birchlog: (t) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) t.set(x, y, RAMP.birchBark[t.noise(4, x, y) < 0.3 ? 2 : t.noise(4, x, y) < 0.75 ? 3 : 4]!);
    for (let k = 0; k < 6; k++) {
      const y = Math.floor(t.r() * 16);
      const x0 = Math.floor(t.r() * 16);
      const len = 2 + Math.floor(t.r() * 3);
      for (let s = 0; s < len; s++) t.set(x0 + s, y, RAMP.birchBark[0]!);
      t.set(x0 + len, y, RAMP.birchBark[1]!);
    }
  },
  oak: plankPainter(RAMP.oak),
  darkoak: plankPainter(RAMP.darkOak),
  birch: plankPainter(RAMP.birch),
  bricks: (t) => {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const row = Math.floor(y / 4);
        const ry = y % 4;
        const off = row % 2 ? 4 : 0;
        const bx = (x + off) % 8;
        if (ry === 3 || bx === 7) {
          t.set(x, y, RAMP.mortar[ry === 3 && bx !== 7 ? 2 : 1]!);
          continue;
        }
        let i = 2;
        if (ry === 0) i += 1;
        else if (ry === 2) i -= 1;
        if (bx === 0) i += 1;
        if (t.r() < 0.06) i -= 1;
        t.set(x, y, RAMP.brick[clamp(i, 0, 4)]!);
      }
    }
  },
  stonebricks: brickPainter(RAMP.stone, RAMP.stone[0]!, 16, 8),
  mossybricks: (t) => {
    brickPainter(RAMP.stone, RAMP.stone[0]!, 16, 8)(t);
    mossOver(t, 0.38);
  },
  bookshelf: (t) => {
    const books = ["#8a2f2c", "#2f4f86", "#3f6e36", "#7a5426", "#5c3a78", "#b08d3c", "#2e6a72"].map(hex);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        let c: RGB;
        if (y <= 1 || y === 8 || y >= 14) c = RAMP.oak[y === 0 || y === 8 || y === 14 ? 3 : 2]!;
        else if (y === 2 || y === 9) c = RAMP.oak[0]!;
        else if (x === 0 || x === 15) c = RAMP.oak[x === 0 ? 3 : 1]!;
        else c = hex("#24170d");
        t.set(x, y, c);
      }
    }
    for (const [top, bottom] of [[3, 7], [10, 13]] as const) {
      let x = 1;
      while (x < 15) {
        const w = t.r() < 0.6 ? 2 : 1;
        const h = bottom - top + 1 - Math.floor(t.r() * 2);
        const base = books[Math.floor(t.r() * books.length)]!;
        for (let dx = 0; dx < w && x + dx < 15; dx++) {
          for (let y = bottom - h + 1; y <= bottom; y++) {
            const f = dx === 0 ? 1.25 : dx === w - 1 && w > 1 ? 0.8 : 1;
            t.set(x + dx, y, y === bottom - 1 ? mix(base, [240, 220, 160], 0.35) : (base.map((v) => clamp(v * f, 0, 255)) as RGB));
          }
        }
        x += w + (t.r() < 0.2 ? 1 : 0);
      }
    }
  },
  glass: (t) => {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const edge = x === 0 || y === 0 || x === 15 || y === 15;
        if (edge) t.set(x, y, x === 15 || y === 15 ? [120, 168, 190, 255] : [208, 238, 248, 255]);
        else if ((x - y === 5 && x < 10) || (x - y === 3 && x > 8 && x < 12)) t.set(x, y, [255, 255, 255, 190]);
        else t.set(x, y, [190, 228, 245, 38]);
      }
    }
  },
  andesite: (t) => {
    rockPainter(RAMP.andesite, 0.05)(t);
    for (let i = 0; i < 10; i++) {
      const x = Math.floor(t.r() * 15);
      const y = Math.floor(t.r() * 15);
      const light = t.r() < 0.5;
      t.set(x, y, RAMP.andesite[light ? 4 : 0]!);
      t.set(x + 1, y, RAMP.andesite[light ? 3 : 1]!);
      t.set(x, y + 1, RAMP.andesite[light ? 3 : 1]!);
    }
  },
  deepslate: (t) => {
    for (let y = 0; y < 16; y++) {
      const band = t.r();
      for (let x = 0; x < 16; x++) {
        const n = t.noise(8, x, y) * 0.5 + band * 0.5;
        let i = n < 0.35 ? 1 : n < 0.66 ? 2 : 3;
        const v = t.r();
        if (v < 0.05) i = 4;
        else if (v < 0.12) i = 0;
        t.set(x, y, RAMP.deepslate[i]!);
      }
    }
    for (let x = 0; x < 16; x++) {
      t.set(x, 7, RAMP.deepslate[0]!);
      t.set(x, 15, RAMP.deepslate[0]!);
    }
  },
  tuff: (t) => {
    rockPainter(RAMP.tuff, 0.04)(t);
    for (let i = 0; i < 14; i++) {
      const x = Math.floor(t.r() * 16);
      const y = Math.floor(t.r() * 16);
      t.set(x, y, RAMP.tuff[0]!);
      t.set(x, y - 1, RAMP.tuff[3]!);
    }
  },
  calcite: rockPainter(RAMP.calcite, 0.03, 4),
  dripstone: (t) => {
    for (let x = 0; x < 16; x++) {
      const tone = 1 + Math.floor(t.r() * 3);
      for (let y = 0; y < 16; y++) {
        let i = tone;
        if ((y + x * 3) % 7 === 0) i = Math.min(4, tone + 1);
        if (t.r() < 0.08) i = Math.max(0, tone - 1);
        t.set(x, y, RAMP.dripstone[i]!);
      }
    }
  },
  coalore: orePainter((t) => rockPainter(RAMP.stone, 0)(t), ["#121216", "#26262c", "#4a4a52"]),
  ironore: orePainter((t) => rockPainter(RAMP.stone, 0)(t), ["#6d4f37", "#c49a73", "#ecd0b2"]),
  copperore: orePainter((t) => rockPainter(RAMP.stone, 0)(t), ["#6b3520", "#c26a3f", "#62b39a"]),
  goldore: orePainter((t) => rockPainter(RAMP.stone, 0)(t), ["#7a5a0e", "#e2b52c", "#fff3a6"]),
  gemore: orePainter((t) => rockPainter(RAMP.deepslate, 0)(t), ["#16507f", "#3fb6e0", "#d0f8ff"]),
  amethyst: (t) => stones(t, 7, () => RAMP.amethyst, RAMP.amethyst[0]!),
  glowmoss: (t) => {
    body(t, RAMP.moss, 0, 4);
    for (let i = 0; i < 14; i++) {
      const x = Math.floor(t.r() * 16);
      const y = Math.floor(t.r() * 16);
      t.set(x, y, hex("#e6ff9a"));
      t.set(x + 1, y, hex("#a8e86a"));
    }
  },
  emberrock: (t) => {
    rockPainter(RAMP.ember, 0.12)(t);
    for (let i = 0; i < 5; i++) t.set(Math.floor(t.r() * 16), Math.floor(t.r() * 16), hex("#ff6a3a"));
  },
  basalt: (t) => {
    for (let x = 0; x < 16; x++) {
      const col = Math.floor(x / 4);
      const base = 1 + ((col * 7 + 3) % 3);
      for (let y = 0; y < 16; y++) {
        let i = base;
        if (x % 4 === 3) i = 0;
        else if (x % 4 === 0) i = Math.min(4, base + 1);
        if (t.r() < 0.07) i = Math.max(0, i - 1);
        t.set(x, y, RAMP.basalt[i]!);
      }
    }
  },
  charstone: (t) => {
    rockPainter(RAMP.char, 0.05)(t);
    for (let i = 0; i < 4; i++) t.set(Math.floor(t.r() * 16), Math.floor(t.r() * 16), hex("#8a5a2a"));
  },
  ash: rockPainter(RAMP.ash, 0.05, 8),
  infernalbricks: brickPainter(RAMP.infernal, RAMP.infernal[0]!, 8, 4),
  magma: (t) => {
    const V = t.vor(8);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const crack = V.at(x + 1, y) !== V.at(x, y) || V.at(x, y + 1) !== V.at(x, y);
        if (crack) t.set(x, y, hex(t.r() < 0.4 ? "#ffd65a" : "#ff8a1e"));
        else t.set(x, y, RAMP.ember[t.noise(4, x, y) < 0.5 ? 0 : 1]!);
      }
    }
  },
  lava: lavaPainter(0),
  glowfungus: (t) => {
    body(t, RAMP.fungus, 0, 4);
    for (let i = 0; i < 10; i++) t.set(Math.floor(t.r() * 16), Math.floor(t.r() * 16), RAMP.fungus[4]!);
  },
  palestone: (t) => {
    rockPainter(RAMP.pale, 0.03, 4)(t);
    for (let i = 0; i < 7; i++) {
      const x = Math.floor(t.r() * 14);
      const y = Math.floor(t.r() * 14);
      t.set(x, y, RAMP.pale[1]!);
      t.set(x + 1, y, RAMP.pale[0]!);
      t.set(x, y + 1, RAMP.pale[0]!);
      t.set(x + 1, y + 1, RAMP.pale[3]!);
    }
  },
  palebricks: brickPainter(RAMP.pale, RAMP.pale[0]!, 8, 8),
  obsidian: (t) => {
    rockPainter(RAMP.obsidian, 0.02)(t);
    for (let k = 0; k < 3; k++) {
      let x = Math.floor(t.r() * 16);
      let y = Math.floor(t.r() * 16);
      for (let s = 0; s < 4; s++) {
        t.set(x, y, RAMP.obsidian[4]!);
        x++;
        y--;
      }
    }
  },
  violetbricks: (t) => {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const ex = x % 8;
        const ey = y % 8;
        let i = 2;
        if (ex === 7 || ey === 7) i = 0;
        else if (ex === 0 || ey === 0) i = 4;
        else if (ex === 6 || ey === 6) i = 1;
        else if (t.noise(4, x, y) > 0.7) i = 3;
        t.set(x, y, RAMP.violet[i]!);
      }
    }
  },
  voidcrystal: (t) => {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const d = Math.abs(x - 7.5) + Math.abs(y - 7.5);
        if (x === 0 || y === 0 || x === 15 || y === 15) t.set(x, y, RAMP.obsidian[3]!);
        else if (d < 3) t.set(x, y, hex("#f4fbff"));
        else if (d < 5) t.set(x, y, hex("#b9f0ff"));
        else if (d < 7) t.set(x, y, hex("#c48af0"));
        else t.set(x, y, RAMP.obsidian[t.noise(4, x, y) < 0.5 ? 1 : 2]!);
      }
    }
  },
  lamp: (t) => {
    const iron = ["#2e2a27", "#4b4540", "#655e57"].map(hex);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const frame = x < 2 || y < 2 || x > 13 || y > 13 || x === 7 || x === 8 || y === 7 || y === 8;
        if (frame) {
          t.set(x, y, iron[x === 0 || y === 0 ? 2 : x === 15 || y === 15 ? 0 : 1]!);
          continue;
        }
        const cx = x < 7 ? 4.5 : 10.5;
        const cy = y < 7 ? 4.5 : 10.5;
        const d = Math.hypot(x - cx, y - cy);
        t.set(x, y, hex(d < 1.2 ? "#fff6d0" : d < 2.2 ? "#ffe08a" : "#f2b043"));
      }
    }
  },
};

const COLOURS: [BlockId, string][] = [
  ["white", "#e9ecef"], ["lightgray", "#a3a7ae"], ["gray", "#5d626b"], ["black", "#24262c"], ["red", "#c2352e"], ["orange", "#e8742a"],
  ["yellow", "#f2c230"], ["lime", "#7cc53a"], ["green", "#4a7a2a"], ["teal", "#2a9aa0"], ["lightblue", "#4fb0e6"], ["blue", "#3550a8"],
  ["purple", "#7a3bb0"], ["magenta", "#b33fb0"], ["pink", "#e88ab3"], ["brown", "#7a4e2e"],
];
for (const [id, c] of COLOURS) PAINT[id] = colourPainter(c);

// Items are drawn from small character maps.
const ITEM_PAL: Record<string, string> = {
  k: "#2a2633", m: "#544d68", y: "#f2a93b", Y: "#ffd45e", W: "#fff4c4", o: "#ff8a2b", r: "#e0441c", b: "#9a6634", B: "#5e3b1c",
  d: "#765e4c", D: "#aa907a", e: "#4b3a2d", c: "#7fd8ff", C: "#d9f6ff", p: "#9c72e0", P: "#c8a8f8", q: "#5a3290",
  g: "#8a7aa8", v: "#f08ad8", V: "#ffd0f2", s: "#5e4e78",
  R: "#c8352e", j: "#8a1f1c", w: "#f4f1ea", h: "#d3cfc4", G: "#3fae4a", l: "#8ee07a", n: "#1f6a2c",
};
const ITEMS: Partial<Record<BlockId, string[]>> = {
  lantern: ["", ".......kk", "........k", ".......kk", "......kkkk", ".....kmmmmk", ".....kyYYyk", ".....kYWWYk", ".....kYWWYk", ".....kyYYyk", ".....kmmmmk", "......kkkk"],
  torch: ["", "", "", "", "........y", ".......yYy", ".......YWY", ".......oWo", ".......bB", ".......bB", ".......bB", ".......bB", ".......bB", ".......bB", ".......bB", ".......bB"],
  stalactite: ["....eddddDe", ".....eddDe", ".....eddDe", "......edDe", "......edD", "......edD", ".......dD", ".......dD", ".......d", ".......d", ".......d", "", "", "", "", ""],
  stalagmite: ["", "", "", "", "", ".......d", ".......d", ".......d", ".......dD", ".......dD", "......edD", "......edD", "......edDe", ".....eddDe", ".....eddDe", "....eddddDe"],
  crystal: ["", "", "", "........C", ".......cC", ".......cC....C", "..C....cCq..cC", "..cC...cCq..cC", "..cCq..cCq.pcq", "..ccq.pcCqppq", "...cqppcCqpPq", "...cqpPcCqPq", "....qpPccqPq", "....qqpppqq", ".....qqqqq", ""],
  fire: ["", "", "", ".......y", "......yY", "....y.yWy..y", "...yYyYWYyyY", "...yYWWWWYyo", "..ryYWWWWYyor", "..roYYWWYYoor", "..rooYYYYooor", "...rroooooorr", "....rrrrrrrr", "", "", ""],
  bed: ["", "", "", "", "", "", "", "", "bB", "bB", "bBhww", "bBwwwRRRRRRRRRbB", "bBwhjRRRRRRRRjbB", "bBbbbbbbbbbbbbbB", "bB............bB", "BB............BB"],
  pin: ["", "", ".....nnnnn", "....nlGGGGn", "...nlGGGGGGn", "...nGGwwwGGn", "...nGGwwwGGn", "...nGGGGGGGn", "....nGGGGGn", ".....nGGGn", "......nGn", "......nGn", ".......n", "", "......kkk", ""],
  bin: ["", "", "", "", "....kkkkkkkk", "...knnnnnnnnk", "....kGGGGGGk", "....kGlGGlGk", "....kGGwwGGk", "....kGwGGwGk", "....kGGwwGGk", "....kGGGGGGk", "....kGlGGlGk", "....kGGGGGGk", "....knnnnnnk", ".....kk..kk"],
  voidbloom: ["", "", "......vV", ".....vVVv", ".....vVVv", "......vv", ".......g", ".......gs", "......sg", ".......g", ".......gs", "......sg", ".......g", ".......g", "......sgs", "....ssggss"],
};
/** Flame frames: the top rows of the base sprite swapped for a few variations, shown in a loop. */
const FLAMES: Partial<Record<BlockId, string[][]>> = {
  torch: [
    ["", "", "", "", ".......y", ".......YYy", ".......YWY", ".......oWo"],
    ["", "", "", "", "", "........y", ".......yWy", ".......oWo"],
    ["", "", "", "", ".........y", ".......yYY", ".......YWY", ".......oWo"],
  ],
  fire: [
    ["", "", "........y", "......yYy", "...y..yWY.y", "...yY.YWWyY", "..yYYWWWYYyo", "..yYWWWWWYyo", "..ryYWWWWYyor", "..roYYWWYYoor", "..rooYYYYooor", "...rroooooorr", "....rrrrrrrr"],
    ["", "", "", "", ".....y.y", "....yYyYy.y", "...yYWYWYyY", "...yYWWWWYyo", "..ryYWWWWYyor", "..roYYWWYYoor", "..rooYYYYooor", "...rroooooorr", "....rrrrrrrr"],
    ["", "", "", ".........y", "....y...yY", "...yYy.yWYy", "...yYWYWWYyY", "..oyYWWWWYyo", "..ryYWWWWYyor", "..roYYWWYYoor", "..rooYYYYooor", "...rroooooorr", "....rrrrrrrr"],
  ],
};
/** Lanterns breathe by swapping their glass colours. */
const LANTERN_SWAPS: Record<string, string>[] = [{ y: "Y", Y: "W" }, { Y: "y", W: "Y" }];

const itemPainter = (rows: string[]): Painter => (t) =>
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    const c = ITEM_PAL[ch];
    if (c) t.set(x, y, hex(c));
  }));

/** Back-layer blocks read as further away: darker, less saturated, cooler. */
export const toBack = (c: RGB): RGB => {
  const g = (c[0] + c[1] + c[2]) / 3;
  return mix(mix(c, [g, g, g], 0.3).map((v) => v * 0.56) as RGB, [40, 50, 86], 0.18);
};

export type Atlas = {
  mid: HTMLCanvasElement;
  back: HTMLCanvasElement;
  /** Opaque texel colours per block, used for break particles. */
  colours: Record<BlockId, RGB[]>;
  decor: Record<DecorKind, HTMLCanvasElement>;
};

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function buildAtlas(): Atlas {
  const mid = canvas(TEX * BLOCK_IDS.length, TEX);
  const back = canvas(TEX * BLOCK_IDS.length, TEX);
  const mctx = mid.getContext("2d")!;
  const bctx = back.getContext("2d")!;
  const colours = {} as Record<BlockId, RGB[]>;
  BLOCK_IDS.forEach((id, n) => {
    const painter = ITEMS[id] ? itemPainter(ITEMS[id]!) : PAINT[id];
    const px = painter ? paint(n * 7919 + 211, painter) : [];
    const mi = mctx.createImageData(16, 16);
    const bi = bctx.createImageData(16, 16);
    const list: RGB[] = [];
    px.forEach((c, p) => {
      if (!c) return;
      const a = c.length > 3 ? (c as RGBA)[3] : 255;
      const b = toBack(c as RGB);
      mi.data.set([c[0] | 0, c[1] | 0, c[2] | 0, a], p * 4);
      bi.data.set([b[0] | 0, b[1] | 0, b[2] | 0, a], p * 4);
      if (a > 120) list.push([c[0], c[1], c[2]]);
    });
    mctx.putImageData(mi, BLOCKS[id].index * TEX, 0);
    bctx.putImageData(bi, BLOCKS[id].index * TEX, 0);
    colours[id] = list;
  });
  return { mid, back, colours, decor: buildDecor() };
}

function buildDecor(): Record<DecorKind, HTMLCanvasElement> {
  const r = mulberry32(77);
  const G = RAMP.grass.map((c) => `rgb(${c.join(",")})`);
  const sprite = (draw: (px: (x: number, y: number, c: string) => void) => void) => {
    const c = canvas(16, 16);
    const ctx = c.getContext("2d")!;
    draw((x, y, col) => {
      ctx.fillStyle = col;
      ctx.fillRect(x, y, 1, 1);
    });
    return c;
  };
  const flower = (petal: string, centre: string) =>
    sprite((px) => {
      for (let i = 0; i < 6; i++) px(7, 15 - i, i % 2 ? G[1]! : G[2]!);
      px(6, 13, G[3]!);
      px(8, 12, G[3]!);
      const P = hex(petal);
      const dark = `rgb(${P.map((v) => v * 0.72).join(",")})`;
      [[0, -1], [-1, 0], [1, 0], [0, 1]].forEach(([dx, dy]) => px(7 + dx!, 8 + dy!, petal));
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([dx, dy]) => px(7 + dx!, 8 + dy!, dark));
      px(7, 8, centre);
    });
  const hanging = (colours: string[], tip?: string) =>
    sprite((px) => {
      for (const vx of [3, 8, 12]) {
        const len = 5 + Math.floor(r() * 10);
        for (let y = 0; y < len; y++) {
          const x = vx + (y % 5 === 4 ? 1 : 0);
          px(x, y, colours[y % 2]!);
          if (y % 3 === 1) px(x - 1, y, colours[2]!);
          if (tip && y === len - 1) px(x, y + 1, tip);
        }
      }
    });
  return {
    tallgrass: sprite((px) => {
      for (let b = 0; b < 7; b++) {
        const x = 1 + Math.floor(r() * 14);
        const h = 3 + Math.floor(r() * 5);
        const lean = r() < 0.5 ? -1 : 1;
        for (let i = 0; i < h; i++) px(x + (i > h - 3 ? lean : 0), 15 - i, i === h - 1 ? G[4]! : i % 2 ? G[2]! : G[3]!);
      }
    }),
    red: flower("#e8524d", "#ffe08a"),
    yellow: flower("#f5c542", "#c9862e"),
    blue: flower("#6c8fe0", "#fff1b0"),
    pink: flower("#f08ac0", "#fff4e0"),
    vine: hanging(["#3e8a30", "#58a63c", "#78c04f"], "#f48fb1"),
    glowvine: hanging(["#3e8a30", "#58a63c", "#78c04f"], "#ffd24a"),
    weeping: hanging(["#8a1e24", "#b02a2e", "#d84a3a"]),
    roots: hanging(["#5a3f2a", "#6e4e34", "#856042"]),
    mushroom: sprite((px) => {
      for (let y = 12; y < 16; y++) {
        px(7, y, "#efe6d2");
        px(8, y, "#cfc3aa");
      }
      for (let x = 4; x <= 11; x++) px(x, 11, "#8e2f2a");
      for (let x = 5; x <= 10; x++) px(x, 10, "#c8473f");
      for (let x = 6; x <= 9; x++) px(x, 9, "#e0605a");
      px(6, 10, "#fff4e6");
      px(9, 9, "#fff4e6");
    }),
    emberfungus: sprite((px) => {
      for (let y = 11; y < 16; y++) px(8, y, "#7a1c1c");
      for (let x = 5; x <= 11; x++) px(x, 10, "#b8321e");
      for (let x = 6; x <= 10; x++) px(x, 9, "#e8582a");
      px(7, 8, "#ffb04a");
      px(9, 9, "#ffd27a");
    }),
    rail: sprite((px) => {
      for (let x = 0; x < 16; x++) {
        px(x, 13, "#8d8f96");
        px(x, 12, "#c4c6cc");
      }
      for (const x of [1, 6, 11]) for (let dx = 0; dx < 3; dx++) {
        px(x + dx, 14, "#6b4a2a");
        px(x + dx, 15, "#4a3119");
      }
    }),
    pebbles: sprite((px) => {
      for (const [x, w] of [[2, 3], [8, 2], [12, 3]] as const) {
        for (let dx = 0; dx < w; dx++) px(x + dx, 15, "#62646e");
        px(x, 14, "#93959e");
        if (w === 3) px(x + 1, 14, "#7a7c86");
      }
    }),
    cobweb: sprite((px) => {
      for (let i = 0; i < 16; i++) {
        px(i, i, "rgba(230,232,240,0.7)");
        px(i, 0, "rgba(230,232,240,0.5)");
        px(0, i, "rgba(230,232,240,0.5)");
        if (i % 5 === 3) for (let j = 0; j <= i; j++) px(j, i, "rgba(230,232,240,0.35)");
      }
    }),
    bud: sprite((px) => {
      px(7, 15, "#5a3290");
      px(8, 15, "#5a3290");
      px(7, 14, "#9c72e0");
      px(8, 14, "#c8a8f8");
      px(8, 13, "#e8dcff");
      px(4, 15, "#7a4cc0");
      px(4, 14, "#c8a8f8");
      px(11, 15, "#3fb6e0");
      px(11, 14, "#c8f6ff");
    }),
    mosstuft: sprite((px) => {
      for (let x = 2; x < 14; x++) if (r() < 0.6) px(x, 15, r() < 0.5 ? "#5c9536" : "#78ad44");
      for (let x = 3; x < 13; x += 2) if (r() < 0.5) px(x, 14, "#94c455");
    }),
    sprout: sprite((px) => {
      for (let y = 11; y < 16; y++) px(8, y, "#8a7aa8");
      px(7, 12, "#5e4e78");
      px(9, 13, "#5e4e78");
      px(8, 10, "#f08ad8");
      px(7, 10, "#c45aac");
      px(8, 9, "#ffd0f2");
    }),
  };
}

let shared: Atlas | null = null;
export function getAtlas(): Atlas {
  shared ??= buildAtlas();
  return shared;
}

// ---------------------------------------------------------------- animation sheets

export const LAVA_FRAMES = 16;
export const WATER_FRAMES = 8;
/** Plants sway between three frames: leaning left, upright, leaning right. */
export const SWAY_FRAMES = 3;
export type Facing = "up" | "down" | "left" | "right";
export const FACINGS: readonly Facing[] = ["up", "down", "left", "right"];
/** Items that grow out of whatever they are attached to: floor, ceiling or wall. */
export const ATTACHED: ReadonlySet<BlockId> = new Set<BlockId>(["crystal"]);
/** Plants that sway, and which end they are rooted at. */
export const SWAYING: Partial<Record<DecorKind, "ground" | "ceiling">> = {
  tallgrass: "ground", red: "ground", yellow: "ground", blue: "ground", pink: "ground", sprout: "ground",
  vine: "ceiling", glowvine: "ceiling", weeping: "ceiling", roots: "ceiling",
};
/** Blocks whose brightest texels pulse gently. (Crystals glint instead; they can face any way.) */
export const PULSING: readonly BlockId[] = ["magma", "glowmoss", "glowfungus", "voidcrystal", "lamp", "voidbloom", "amber"];

export type Anim = {
  /** LAVA_FRAMES tiles side by side, for the middle/front and back layers. */
  lava: { mid: HTMLCanvasElement; back: HTMLCanvasElement };
  /** Moving ripples drawn over water: the surface row and the body. */
  water: { top: HTMLCanvasElement; body: HTMLCanvasElement };
  /** Flame frames side by side (torch, fire, lantern). */
  flames: Partial<Record<BlockId, { mid: HTMLCanvasElement; back: HTMLCanvasElement; frames: number }>>;
  /** Bright texels only, added on top with a pulsing alpha. */
  pulse: Partial<Record<BlockId, HTMLCanvasElement>>;
  /** Attached items in each facing, for the middle/front and back layers. */
  attached: Partial<Record<BlockId, Record<Facing, { mid: HTMLCanvasElement; back: HTMLCanvasElement }>>>;
  /** SWAY_FRAMES frames per swaying plant. */
  sway: Partial<Record<DecorKind, HTMLCanvasElement>>;
};

function tileCanvas(px: Texel[], back: boolean) {
  const c = canvas(16, 16);
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(16, 16);
  px.forEach((t, p) => {
    if (!t) return;
    const a = t.length > 3 ? (t as RGBA)[3] : 255;
    const v = back ? toBack(t as RGB) : (t as RGB);
    img.data.set([v[0] | 0, v[1] | 0, v[2] | 0, a | 0], p * 4);
  });
  ctx.putImageData(img, 0, 0);
  return c;
}

function strip(tiles: HTMLCanvasElement[]) {
  const c = canvas(16 * tiles.length, 16);
  const ctx = c.getContext("2d")!;
  tiles.forEach((t, i) => ctx.drawImage(t, i * 16, 0));
  return c;
}

function buildAnim(atlas: Atlas): Anim {
  const seedOf = (id: BlockId) => BLOCK_IDS.indexOf(id) * 7919 + 211;
  // Lava: the same seed for every frame keeps the noise identical, only shifted.
  const lavaPx = Array.from({ length: LAVA_FRAMES }, (_, k) => paint(seedOf("lava"), lavaPainter(k)));
  const lava = { mid: strip(lavaPx.map((px) => tileCanvas(px, false))), back: strip(lavaPx.map((px) => tileCanvas(px, true))) };

  // Water ripples: light dashes that drift sideways, brighter along the surface.
  const ripple = (top: boolean) =>
    strip(
      Array.from({ length: WATER_FRAMES }, (_, k) => {
        const px: Texel[] = new Array(256).fill(null);
        const shift = k * 2;
        for (let x = 0; x < 16; x++) {
          if (top) {
            if ((x + shift) % 8 < 3) px[16 + x] = [214, 236, 255, 170];
            if ((x - shift + 64) % 8 < 2) px[x] = [255, 255, 255, 120];
          }
          for (const [row, off, dir] of [[5, 0, 1], [9, 5, -1], [13, 10, 1]] as const) {
            if ((x + shift * dir + off + 64) % 16 < 3) px[row * 16 + x] = [170, 210, 255, 95];
          }
        }
        return tileCanvas(px, false);
      }),
    );
  const water = { top: ripple(true), body: ripple(false) };

  const flames: Anim["flames"] = {};
  for (const id of ["torch", "fire"] as const) {
    const base = ITEMS[id]!;
    const variants = FLAMES[id]!.map((top) => base.map((row, y) => (y < top.length ? top[y]! : row)));
    const px = [base, ...variants].map((rows) => paint(seedOf(id), itemPainter(rows)));
    flames[id] = { mid: strip(px.map((p) => tileCanvas(p, false))), back: strip(px.map((p) => tileCanvas(p, true))), frames: px.length };
  }
  {
    const base = ITEMS.lantern!;
    const variants = LANTERN_SWAPS.map((swap) => base.map((row) => [...row].map((ch) => swap[ch] ?? ch).join("")));
    const px = [base, ...variants].map((rows) => paint(seedOf("lantern"), itemPainter(rows)));
    flames.lantern = { mid: strip(px.map((p) => tileCanvas(p, false))), back: strip(px.map((p) => tileCanvas(p, true))), frames: px.length };
  }

  // Pulse masks: the brightest quarter of each glowing block's texels.
  const pulse: Anim["pulse"] = {};
  const mctx = atlas.mid.getContext("2d")!;
  for (const id of PULSING) {
    const data = mctx.getImageData(BLOCKS[id].index * 16, 0, 16, 16).data;
    const lum: number[] = [];
    for (let p = 0; p < 256; p++) if (data[p * 4 + 3]! > 100) lum.push(data[p * 4]! + data[p * 4 + 1]! + data[p * 4 + 2]!);
    lum.sort((a, b) => b - a);
    const cut = lum[Math.floor(lum.length * 0.25)] ?? 999;
    const px: Texel[] = new Array(256).fill(null);
    for (let p = 0; p < 256; p++) {
      const o = p * 4;
      if (data[o + 3]! > 100 && data[o]! + data[o + 1]! + data[o + 2]! >= cut) px[p] = [data[o]!, data[o + 1]!, data[o + 2]!];
    }
    pulse[id] = tileCanvas(px, false);
  }

  // Attached items, turned to face away from what they grow on.
  const attached: Anim["attached"] = {};
  for (const id of ATTACHED) {
    const turn = (sheet: HTMLCanvasElement, facing: Facing) => {
      const c = canvas(16, 16);
      const ctx = c.getContext("2d")!;
      ctx.translate(8, 8);
      if (facing === "down") ctx.scale(1, -1);
      else if (facing === "right") ctx.rotate(Math.PI / 2);
      else if (facing === "left") ctx.rotate(-Math.PI / 2);
      ctx.drawImage(sheet, BLOCKS[id].index * 16, 0, 16, 16, -8, -8, 16, 16);
      return c;
    };
    attached[id] = Object.fromEntries(FACINGS.map((f) => [f, { mid: turn(atlas.mid, f), back: turn(atlas.back, f) }])) as Record<Facing, { mid: HTMLCanvasElement; back: HTMLCanvasElement }>;
  }

  // Swaying plants: the free end leans one texel left or right (two at the tip); the rooted end stays put.
  const sway: Anim["sway"] = {};
  for (const [kind, root] of Object.entries(SWAYING) as [DecorKind, "ground" | "ceiling"][]) {
    const src = atlas.decor[kind];
    const c = canvas(16 * SWAY_FRAMES, 16);
    const ctx = c.getContext("2d")!;
    [-1, 0, 1].forEach((lean, i) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(i * 16, 0, 16, 16);
      ctx.clip();
      for (let y = 0; y < 16; y++) {
        const free = root === "ground" ? y < 10 : y > 6;
        const tip = root === "ground" ? y < 5 : y > 11;
        const dx = free ? lean * (tip ? 2 : 1) : 0;
        ctx.drawImage(src, 0, y, 16, 1, i * 16 + dx, y, 16, 1);
      }
      ctx.restore();
    });
    sway[kind] = c;
  }

  return { lava, water, flames, pulse, attached, sway };
}

let sharedAnim: Anim | null = null;
export function getAnim(): Anim {
  sharedAnim ??= buildAnim(getAtlas());
  return sharedAnim;
}
