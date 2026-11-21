import { isBlockId, type BlockId, type Layer } from "./blocks";

/** A grid cell holds up to one block in each of three layers. The layers are independent. */
export type Cell = {
  b: BlockId | null;
  m: BlockId | null;
  f: BlockId | null;
};

export const EMPTY_CELL: Cell = Object.freeze({ b: null, m: null, f: null });

export type PlaceOutcome = { ok: true; cell: Cell } | { ok: false; reason: "taken" };

export type BreakOutcome = { ok: true; cell: Cell; layer: Layer; removed: BlockId } | { ok: false; reason: "empty" };

/** Right click: fill the chosen layer, unless something is already there. */
export function placeInCell(cell: Cell, layer: Layer, block: BlockId): PlaceOutcome {
  if (cell[layer] !== null) return { ok: false, reason: "taken" };
  return { ok: true, cell: { ...cell, [layer]: block } };
}

/** The layer a visitor sees first: front, then middle, then back. */
export function frontmost(cell: Cell): Layer | null {
  return cell.f ? "f" : cell.m ? "m" : cell.b ? "b" : null;
}

/** Left click: remove the closest block. */
export function breakInCell(cell: Cell): BreakOutcome {
  const layer = frontmost(cell);
  if (!layer) return { ok: false, reason: "empty" };
  const removed = cell[layer] as BlockId;
  return { ok: true, layer, removed, cell: { ...cell, [layer]: null } };
}

export function isValidCell(value: unknown): value is Cell {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (["b", "m", "f"] as const).every((k) => v[k] === null || isBlockId(v[k]));
}

export function isEmpty(cell: Cell): boolean {
  return !cell.b && !cell.m && !cell.f;
}
