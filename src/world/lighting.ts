import { BLOCKS, LAYERS, opaque, type BlockId, type Layer } from "./blocks";
import type { Cell } from "./cell";
import { GROUND_ROWS, MAX_ABS_COL, OUTDOOR, type Biome } from "./regions";

export type Emitter = { x: number; y: number; layer: Layer; id: BlockId; level: number };

export type LightMap = {
  x0: number;
  y0: number;
  w: number;
  h: number;
  /** Sunlight (overworld only), 0–15 per cell. */
  sky: Float32Array;
  /** Light from lamps, torches, lava and crystals, 0–15 per cell. */
  block: Float32Array;
  emitters: Emitter[];
  hasSky: boolean;
};

/** Middle and front blocks stop light; back walls don't. */
export const blocksLight = (c: Cell) => opaque(c.m) || opaque(c.f);
const dims = (c: Cell) => (!!c.m && BLOCKS[c.m].solid && BLOCKS[c.m].see) || (!!c.f && BLOCKS[c.f].solid && BLOCKS[c.f].see);

function flood(map: LightMap, levels: Float32Array, queue: number[], get: (x: number, y: number) => Cell, airCost: number, solidCost: number) {
  const { x0, y0, w, h } = map;
  let head = 0;
  while (head < queue.length) {
    const i = queue[head++]!;
    const x = (i % w) + x0;
    const y = Math.floor(i / w) + y0;
    const from = levels[i]!;
    const fromSolid = blocksLight(get(x, y));
    for (let n = 0; n < 4; n++) {
      const nx = x + (n === 0 ? 1 : n === 1 ? -1 : 0);
      const ny = y + (n === 2 ? 1 : n === 3 ? -1 : 0);
      if (nx < x0 || nx >= x0 + w || ny < y0 || ny >= y0 + h) continue;
      const nb = get(nx, ny);
      const isSolid = blocksLight(nb);
      // Light soaks a little way into solid rock, but never leaks back out of it.
      if (fromSolid && !isSolid) continue;
      const cost = isSolid ? solidCost : dims(nb) ? airCost + 1 : airCost;
      const j = (ny - y0) * w + (nx - x0);
      const next = from - cost;
      if (next > levels[j]!) {
        levels[j] = next;
        queue.push(j);
      }
    }
  }
}

/**
 * Per-cell light for one region. Cheap enough (a few thousand cells) to recompute after every edit.
 * Sunlight pours straight down open columns and then spreads; block light spreads from emitters.
 */
export function computeLight(get: (x: number, y: number) => Cell, biome: Biome, top: number): LightMap {
  const x0 = -MAX_ABS_COL;
  const y0 = top - 1;
  const w = MAX_ABS_COL * 2;
  const h = GROUND_ROWS - y0;
  const map: LightMap = { x0, y0, w, h, sky: new Float32Array(w * h), block: new Float32Array(w * h), emitters: [], hasSky: OUTDOOR.has(biome) };

  if (map.hasSky) {
    const queue: number[] = [];
    for (let x = x0; x < x0 + w; x++) {
      let level = 15;
      for (let y = y0; y < y0 + h; y++) {
        const c = get(x, y);
        if (blocksLight(c)) break;
        if (dims(c)) level -= 2;
        if (level <= 0) break;
        const i = (y - y0) * w + (x - x0);
        map.sky[i] = level;
        queue.push(i);
      }
    }
    flood(map, map.sky, queue, get, 2.2, 2.6);
  }

  const queue: number[] = [];
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const c = get(x, y);
      for (const layer of LAYERS) {
        const id = c[layer];
        if (!id || !BLOCKS[id].light) continue;
        // Back-layer lights are further away, so they reach less far.
        const level = layer === "b" ? BLOCKS[id].light - 5 : BLOCKS[id].light;
        map.emitters.push({ x, y, layer, id, level });
        const i = (y - y0) * w + (x - x0);
        if (level > map.block[i]!) {
          map.block[i] = level;
          queue.push(i);
        }
      }
    }
  }
  flood(map, map.block, queue, get, 1, 4);
  return map;
}

/** Light value at a cell; outside the map, open sky is fully lit and everything else is dark. */
export function lightAt(map: LightMap, which: "sky" | "block", x: number, y: number): number {
  if (x < map.x0 || x >= map.x0 + map.w || y >= map.y0 + map.h) return 0;
  if (y < map.y0) return which === "sky" && map.hasSky ? 15 : 0;
  return map[which][(y - map.y0) * map.w + (x - map.x0)]!;
}
