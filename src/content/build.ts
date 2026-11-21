import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { publishedCell, MIN_ROW, type RegionId } from "@/world/regions";
import { cellKey, MAX_PROJECT_CELLS, parseTuple, SCHEMA_VERSION, type ProjectBuild, type StoredTuple } from "@/world/state";

/**
 * The author's build lives in the repository, so pushing it publishes it.
 * In development, build mode saves here through /api/world-build; the site reads it at build time.
 */
export const BUILD_FILE = path.join(process.cwd(), "src", "content", "world-build.json");

const EMPTY: ProjectBuild = { schema: SCHEMA_VERSION, cells: [] };

export async function getProjectBuild(): Promise<ProjectBuild> {
  let text: string;
  try {
    text = await readFile(BUILD_FILE, "utf8");
  } catch {
    return EMPTY;
  }
  // A broken file should fail the build loudly rather than quietly publish an empty world.
  const data = JSON.parse(text) as Partial<ProjectBuild>;
  if (!Array.isArray(data.cells)) throw new Error(`${BUILD_FILE} has no "cells" array.`);
  return { schema: SCHEMA_VERSION, cells: data.cells as StoredTuple[] };
}

/** One tuple per line, sorted, so a build change reads as a small diff. */
function format(cells: StoredTuple[]): string {
  const lines = cells.map((c) => `    ${JSON.stringify(c)}`);
  return `{\n  "schema": ${SCHEMA_VERSION},\n  "cells": [\n${lines.join(",\n")}${lines.length ? "\n" : ""}  ]\n}\n`;
}

const ORDER: RegionId[] = ["intro", "projects", "skills", "about", "contact"];

/**
 * Merges edited cells into the saved build. Cells that match the generated world are dropped,
 * checked against both this layout's top row and a far-away one, so a ceiling edit is never lost.
 */
export async function mergeIntoProjectBuild(edits: unknown[], tops: Partial<Record<RegionId, number>>, reset: boolean): Promise<number> {
  const current = reset ? EMPTY : await getProjectBuild();
  const cells = new Map<string, StoredTuple>();
  for (const entry of current.cells) {
    const parsed = parseTuple(entry);
    if (parsed) cells.set(cellKey(parsed.ref), entry);
  }
  for (const entry of edits) {
    const parsed = parseTuple(entry);
    if (!parsed) continue;
    const { ref, cell } = parsed;
    const top = typeof tops[ref.region] === "number" ? tops[ref.region]! : MIN_ROW;
    const same = (t: number) => {
      const p = publishedCell(ref.region, ref.x, ref.y, t);
      return p.b === cell.b && p.m === cell.m && p.f === cell.f;
    };
    if (same(top) && same(MIN_ROW)) cells.delete(cellKey(ref));
    else cells.set(cellKey(ref), [ref.region, ref.x, ref.y, cell.b, cell.m, cell.f]);
  }
  if (cells.size > MAX_PROJECT_CELLS) throw new Error("The build is too large to save.");
  const sorted = [...cells.values()].sort((a, b) => ORDER.indexOf(a[0] as RegionId) - ORDER.indexOf(b[0] as RegionId) || a[2] - b[2] || a[1] - b[1]);
  await writeFile(BUILD_FILE, format(sorted), "utf8");
  return sorted.length;
}
