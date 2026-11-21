import { isBlockId, type BlockId, type Layer } from "./blocks";
import { breakInCell, isValidCell, placeInCell, type Cell } from "./cell";
import { DEFAULT_TOP, inWorldBounds, isRegionId, publishedCell, REGION_IDS, WORLD_VERSION, type RegionId } from "./regions";

export const SCHEMA_VERSION = 2;
export const STORAGE_KEY = "tile-world";
export const MAX_OVERRIDES = 20_000;
export const MAX_UNDO = 200;

export type CellRef = { region: RegionId; x: number; y: number };

export type ActionResult =
  | { kind: "placed"; ref: CellRef; layer: Layer; block: BlockId }
  | { kind: "broke"; ref: CellRef; layer: Layer; block: BlockId }
  | { kind: "taken"; ref: CellRef; layer: Layer }
  | { kind: "empty"; ref: CellRef }
  | { kind: "out-of-bounds"; ref: CellRef }
  | { kind: "limit"; ref: CellRef };

export type StoredTuple = [region: string, x: number, y: number, b: BlockId | null, m: BlockId | null, f: BlockId | null];
export type StoredWorld = { schema: number; world: number; cells: StoredTuple[] };

export type LoadResult =
  | { status: "loaded"; restored: number; skipped: number }
  | { status: "none" }
  | { status: "version-reset" }
  | { status: "invalid" };

export function cellKey(ref: CellRef): string {
  return `${ref.region}:${ref.x}:${ref.y}`;
}

type Listener = (ref: CellRef | null) => void;

/** The author's build, saved in the project (src/content/world-build.json) and shipped with the site. */
export type ProjectBuild = { schema: number; cells: StoredTuple[] };
export const MAX_PROJECT_CELLS = 60_000;

/**
 * Three layers, from the bottom up:
 * 1. the generated world (regions.ts),
 * 2. the author's build saved in the project, which ships with the site,
 * 3. this visitor's own edits, kept in their browser.
 * Each layer stores complete cell states, including empty ones, so mined terrain stays mined.
 */
export class WorldState {
  private base = new Map<string, { ref: CellRef; cell: Cell }>();
  private overrides = new Map<string, { ref: CellRef; cell: Cell }>();
  private undoStack: { ref: CellRef; prev: Cell | undefined }[] = [];
  private listeners = new Set<Listener>();
  /** First visible row of each region; underground ceilings hang from it. */
  private tops: Record<RegionId, number> = Object.fromEntries(REGION_IDS.map((id) => [id, DEFAULT_TOP])) as Record<RegionId, number>;

  get(ref: CellRef): Cell {
    return this.getAt(ref.region, ref.x, ref.y);
  }

  getAt(region: RegionId, x: number, y: number): Cell {
    const key = `${region}:${x}:${y}`;
    return this.overrides.get(key)?.cell ?? this.base.get(key)?.cell ?? publishedCell(region, x, y, this.tops[region]);
  }

  /** Loads the build saved in the project. Invalid entries are skipped. Returns how many cells loaded. */
  setBase(raw: unknown): number {
    this.base.clear();
    const cells = raw && typeof raw === "object" && Array.isArray((raw as ProjectBuild).cells) ? (raw as ProjectBuild).cells : [];
    for (const entry of cells.slice(0, MAX_PROJECT_CELLS)) {
      const parsed = parseTuple(entry);
      if (parsed) this.base.set(cellKey(parsed.ref), parsed);
    }
    this.emit(null);
    return this.base.size;
  }

  /** Current state of the given cells, as saved tuples. */
  tuples(refs: Iterable<CellRef>): StoredTuple[] {
    const out: StoredTuple[] = [];
    for (const ref of refs) {
      const c = this.get(ref);
      out.push([ref.region, ref.x, ref.y, c.b, c.m, c.f]);
    }
    return out;
  }

  /** Every region's current top row; the project file uses it to tell edits from generated cells. */
  get topRows(): Record<RegionId, number> {
    return { ...this.tops };
  }

  top(region: RegionId): number {
    return this.tops[region];
  }

  /** Returns true when the top row changed, so the caller can redraw that region. */
  setTop(region: RegionId, top: number): boolean {
    if (this.tops[region] === top) return false;
    this.tops[region] = top;
    return true;
  }

  get overrideCount(): number {
    return this.overrides.size;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /** Right click: put a block in the chosen layer. */
  place(ref: CellRef, layer: Layer, block: BlockId): ActionResult {
    if (!inWorldBounds(ref.x, ref.y)) return { kind: "out-of-bounds", ref };
    const outcome = placeInCell(this.get(ref), layer, block);
    if (!outcome.ok) return { kind: "taken", ref, layer };
    if (!this.commit(ref, outcome.cell)) return { kind: "limit", ref };
    return { kind: "placed", ref, layer, block };
  }

  /** Left click: remove the closest block. */
  break(ref: CellRef): ActionResult {
    if (!inWorldBounds(ref.x, ref.y)) return { kind: "out-of-bounds", ref };
    const outcome = breakInCell(this.get(ref));
    if (!outcome.ok) return { kind: "empty", ref };
    if (!this.commit(ref, outcome.cell)) return { kind: "limit", ref };
    return { kind: "broke", ref, layer: outcome.layer, block: outcome.removed };
  }

  undo(): CellRef | null {
    const entry = this.undoStack.pop();
    if (!entry) return null;
    const key = cellKey(entry.ref);
    if (entry.prev === undefined) this.overrides.delete(key);
    else this.overrides.set(key, { ref: entry.ref, cell: entry.prev });
    this.emit(entry.ref);
    return entry.ref;
  }

  /** Clears this browser's edits. `includeBase` also clears the saved build (used while authoring). */
  reset(includeBase = false): void {
    this.overrides.clear();
    if (includeBase) this.base.clear();
    this.undoStack = [];
    this.emit(null);
  }

  /** `ref` is the edited cell, or null when many cells changed at once. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  toStored(): StoredWorld {
    const cells: StoredTuple[] = [];
    for (const { ref, cell } of this.overrides.values()) cells.push([ref.region, ref.x, ref.y, cell.b, cell.m, cell.f]);
    return { schema: SCHEMA_VERSION, world: WORLD_VERSION, cells };
  }

  /** Validates everything before restoring; invalid entries are skipped, never trusted. */
  loadStored(raw: unknown): LoadResult {
    if (raw === null || raw === undefined) return { status: "none" };
    if (typeof raw !== "object") return { status: "invalid" };
    const data = raw as Partial<StoredWorld>;
    if (typeof data.schema !== "number" || typeof data.world !== "number" || !Array.isArray(data.cells)) return { status: "invalid" };
    if (data.schema !== SCHEMA_VERSION || data.world !== WORLD_VERSION) return { status: "version-reset" };
    const next = new Map<string, { ref: CellRef; cell: Cell }>();
    let skipped = Math.max(0, data.cells.length - MAX_OVERRIDES);
    for (const entry of data.cells.slice(0, MAX_OVERRIDES)) {
      const parsed = parseTuple(entry);
      if (!parsed) skipped++;
      else next.set(cellKey(parsed.ref), parsed);
    }
    this.overrides = next;
    this.undoStack = [];
    this.emit(null);
    return { status: "loaded", restored: next.size, skipped };
  }

  private commit(ref: CellRef, next: Cell): boolean {
    const key = cellKey(ref);
    if (!this.overrides.has(key) && this.overrides.size >= MAX_OVERRIDES) return false;
    this.undoStack.push({ ref, prev: this.overrides.get(key)?.cell });
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    this.overrides.set(key, { ref: { ...ref }, cell: next });
    this.emit(ref);
    return true;
  }

  private emit(ref: CellRef | null) {
    for (const listener of this.listeners) listener(ref);
  }
}

export function parseTuple(entry: unknown): { ref: CellRef; cell: Cell } | null {
  if (!Array.isArray(entry) || entry.length !== 6) return null;
  const [region, x, y, b, m, f] = entry as unknown[];
  if (!isRegionId(region) || typeof x !== "number" || typeof y !== "number" || !inWorldBounds(x, y)) return null;
  for (const v of [b, m, f]) if (v !== null && !isBlockId(v)) return null;
  const cell = { b, m, f } as Cell;
  if (!isValidCell(cell)) return null;
  return { ref: { region, x, y }, cell };
}

/** Any storage failure (private mode, quota, blocked storage) degrades to a temporary world. */
export function readStorage(): { ok: true; raw: unknown } | { ok: false } {
  try {
    const text = window.localStorage.getItem(STORAGE_KEY);
    if (text === null) return { ok: true, raw: null };
    try {
      return { ok: true, raw: JSON.parse(text) as unknown };
    } catch {
      return { ok: true, raw: "corrupt" };
    }
  } catch {
    return { ok: false };
  }
}

export function writeStorage(world: WorldState): boolean {
  try {
    if (world.overrideCount === 0) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(world.toStored()));
    return true;
  } catch {
    return false;
  }
}
