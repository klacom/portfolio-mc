import { describe, expect, it } from "vitest";
import { BLOCK_IDS, BLOCKS } from "./blocks";
import { breakInCell, EMPTY_CELL, isValidCell, placeInCell } from "./cell";
import { computeLight, lightAt } from "./lighting";
import { GROUND_ROWS, MAX_ABS_COL, MIN_ROW, publishedCell, REGION_IDS, WORLD_VERSION } from "./regions";
import { checkContact } from "@/content/contact";
import { MAX_UNDO, SCHEMA_VERSION, WorldState, type CellRef } from "./state";

const sky: CellRef = { region: "intro", x: 0, y: -10 };
const ground: CellRef = { region: "intro", x: 0, y: 1 };

function reload(world: WorldState): WorldState {
  const fresh = new WorldState();
  expect(fresh.loadStored(JSON.parse(JSON.stringify(world.toStored())) as unknown).status).toBe("loaded");
  return fresh;
}

describe("three-layer cells", () => {
  it("places into the chosen layer and refuses a taken layer", () => {
    const placed = placeInCell(EMPTY_CELL, "f", "stone");
    expect(placed).toEqual({ ok: true, cell: { b: null, m: null, f: "stone" } });
    if (!placed.ok) return;
    expect(placeInCell(placed.cell, "f", "dirt")).toEqual({ ok: false, reason: "taken" });
    expect(placeInCell(placed.cell, "b", "dirt")).toEqual({ ok: true, cell: { b: "dirt", m: null, f: "stone" } });
  });

  it("breaks the closest block first: front, then middle, then back", () => {
    let cell = { b: "dirt", m: "stone", f: "glass" } as const;
    const order: string[] = [];
    let current: typeof EMPTY_CELL = cell;
    for (;;) {
      const out = breakInCell(current);
      if (!out.ok) break;
      order.push(`${out.layer}:${out.removed}`);
      current = out.cell;
    }
    expect(order).toEqual(["f:glass", "m:stone", "b:dirt"]);
    expect(current).toEqual(EMPTY_CELL);
    cell = { b: "dirt", m: "stone", f: "glass" };
    expect(isValidCell(cell)).toBe(true);
    expect(isValidCell({ b: "nope", m: null, f: null })).toBe(false);
  });
});

describe("world state", () => {
  it("places, reports taken layers, and breaks", () => {
    const w = new WorldState();
    expect(w.get(sky)).toEqual(EMPTY_CELL);
    expect(w.place(sky, "m", "oak")).toMatchObject({ kind: "placed", layer: "m" });
    expect(w.place(sky, "m", "stone")).toEqual({ kind: "taken", ref: sky, layer: "m" });
    expect(w.place(sky, "f", "glass")).toMatchObject({ kind: "placed", layer: "f" });
    expect(w.break(sky)).toMatchObject({ kind: "broke", layer: "f", block: "glass" });
    expect(w.break(sky)).toMatchObject({ kind: "broke", layer: "m", block: "oak" });
    expect(w.break(sky)).toEqual({ kind: "empty", ref: sky });
  });

  it("refuses cells outside the world", () => {
    const w = new WorldState();
    expect(w.place({ region: "intro", x: 0, y: MIN_ROW - 1 }, "m", "dirt").kind).toBe("out-of-bounds");
    expect(w.place({ region: "intro", x: MAX_ABS_COL, y: 0 }, "m", "dirt").kind).toBe("out-of-bounds");
    expect(w.break({ region: "intro", x: 0.5, y: 0 }).kind).toBe("out-of-bounds");
  });

  it("undo restores each previous state; reset restores the published world", () => {
    const w = new WorldState();
    const before = w.get(ground);
    w.break(ground);
    w.break(ground);
    w.place(ground, "f", "sand");
    w.undo();
    w.undo();
    w.undo();
    expect(w.get(ground)).toEqual(before);
    expect(w.undo()).toBeNull();
    w.break(ground);
    w.reset();
    expect(w.get(ground)).toEqual(publishedCell("intro", 0, 1));
    expect(w.canUndo).toBe(false);
  });

  it("keeps a bounded undo history", () => {
    const w = new WorldState();
    for (let i = 0; i < MAX_UNDO + 20; i++) w.place({ region: "contact", x: (i % 40) - 20, y: -30 - Math.floor(i / 40) }, "m", "ash");
    let count = 0;
    while (w.undo()) count++;
    expect(count).toBe(MAX_UNDO);
  });

  it("notifies subscribers with the edited cell", () => {
    const w = new WorldState();
    const seen: (CellRef | null)[] = [];
    const off = w.subscribe((ref) => seen.push(ref));
    w.place(sky, "b", "dirt");
    w.reset();
    off();
    expect(seen).toEqual([sky, null]);
  });
});

describe("persistence", () => {
  it("mined terrain stays mined and every layer survives a reload", () => {
    const w = new WorldState();
    while (w.break(ground).kind === "broke");
    const a: CellRef = { region: "contact", x: 20, y: -20 };
    w.place(a, "b", "obsidian");
    w.place(a, "f", "voidcrystal");
    const r = reload(w);
    expect(r.get(ground)).toEqual(EMPTY_CELL);
    expect(r.get(a)).toEqual({ b: "obsidian", m: null, f: "voidcrystal" });
  });

  it("falls back safely for invalid storage and skips bad entries", () => {
    const w = new WorldState();
    expect(w.loadStored(null).status).toBe("none");
    expect(w.loadStored("corrupt").status).toBe("invalid");
    expect(w.loadStored({ schema: SCHEMA_VERSION, world: WORLD_VERSION, cells: "nope" }).status).toBe("invalid");
    const result = w.loadStored({
      schema: SCHEMA_VERSION,
      world: WORLD_VERSION,
      cells: [
        ["intro", 1, -5, "stone", null, "glass"],
        ["intro", 2, -5, "diamond", null, null],
        ["nowhere", 3, -5, null, "dirt", null],
        ["intro", 1.5, -5, null, "dirt", null],
        ["intro", 0, 999, null, "dirt", null],
        ["intro", 0, -5, "dirt"],
      ],
    });
    expect(result).toEqual({ status: "loaded", restored: 1, skipped: 5 });
    expect(w.get({ region: "intro", x: 1, y: -5 })).toEqual({ b: "stone", m: null, f: "glass" });
  });

  it("clears edits saved by an older version of the world", () => {
    const w = new WorldState();
    expect(w.loadStored({ schema: 1, world: 1, cells: [["intro", 1, -5, "stone", null]] }).status).toBe("version-reset");
    expect(w.overrideCount).toBe(0);
  });
});

describe("published world", () => {
  it("every region has valid cells and solid ground in the middle", () => {
    for (const id of REGION_IDS) {
      for (let x = -MAX_ABS_COL; x < MAX_ABS_COL; x += 3) {
        for (let y = -20; y < GROUND_ROWS; y++) expect(isValidCell(publishedCell(id, x, y, -18))).toBe(true);
      }
      expect(publishedCell(id, 0, GROUND_ROWS - 1).m).not.toBeNull();
    }
  });

  it("sections meet in a band of mixed rock rather than a straight line", () => {
    const top = -18;
    const row = (region: (typeof REGION_IDS)[number], y: number) => Array.from({ length: MAX_ABS_COL * 2 }, (_, i) => publishedCell(region, i - MAX_ABS_COL, y, top).m);
    // The inferno's ceiling borrows deep slate and tuff from the crystal cavern above it,
    expect(row("about", top).filter((m) => m === "deepslate" || m === "tuff").length).toBeGreaterThan(10);
    // its floor turns to obsidian above the void,
    expect(row("about", GROUND_ROWS - 1).filter((m) => m === "obsidian").length).toBeGreaterThan(10);
    // and the void's first row holds floating chunks of the inferno's rock.
    expect(row("contact", top).filter((m) => m === "emberrock" || m === "charstone" || m === "basalt" || m === "magma").length).toBeGreaterThan(5);
  });

  it("underground ceilings follow the section's top row", () => {
    expect(publishedCell("projects", 0, -18, -18).m).not.toBeNull();
    expect(publishedCell("projects", 0, -30, -30).m).not.toBeNull();
    expect(publishedCell("projects", 0, -12, -30).m).toBeNull();
  });

  it("every block has a name and a valid light level", () => {
    for (const id of BLOCK_IDS) {
      expect(BLOCKS[id].name.length).toBeGreaterThan(0);
      expect(BLOCKS[id].light).toBeGreaterThanOrEqual(0);
      expect(BLOCKS[id].light).toBeLessThanOrEqual(15);
    }
  });
});

describe("lighting", () => {
  it("sunlight fills open sky and fades underground; caves have none", () => {
    const w = new WorldState();
    const map = computeLight((x, y) => w.getAt("intro", x, y), "overworld", -18);
    expect(lightAt(map, "sky", 0, -10)).toBe(15);
    expect(lightAt(map, "sky", 0, 3)).toBeLessThan(lightAt(map, "sky", 0, 0));
    const cave = computeLight((x, y) => w.getAt("projects", x, y), "cave", -18);
    expect(lightAt(cave, "sky", 0, -10)).toBe(0);
  });

  it("a torch lights its neighbours, and a front wall blocks sunlight", () => {
    const w = new WorldState();
    w.place({ region: "intro", x: 0, y: -12 }, "m", "torch");
    let map = computeLight((x, y) => w.getAt("intro", x, y), "overworld", -18);
    expect(lightAt(map, "block", 0, -12)).toBe(12);
    expect(lightAt(map, "block", 2, -12)).toBe(10);
    for (let x = -3; x <= 3; x++) w.place({ region: "intro", x, y: -16 }, "f", "stone");
    map = computeLight((x, y) => w.getAt("intro", x, y), "overworld", -18);
    expect(lightAt(map, "sky", 0, -15)).toBeLessThan(15);
  });
});

describe("the build saved in the project", () => {
  it("sits between the generated world and this visitor's edits", () => {
    const w = new WorldState();
    const ref: CellRef = { region: "intro", x: 2, y: -6 };
    expect(w.setBase({ schema: SCHEMA_VERSION, cells: [["intro", 2, -6, null, "cobble", null], ["nowhere", 0, 0, null, "dirt", null]] })).toBe(1);
    expect(w.get(ref).m).toBe("cobble");
    w.place(ref, "f", "glass");
    expect(w.get(ref)).toEqual({ b: null, m: "cobble", f: "glass" });
    w.reset();
    expect(w.get(ref).m).toBe("cobble");
    w.reset(true);
    expect(w.get(ref).m).toBeNull();
  });

  it("lists the current state of edited cells for saving", () => {
    const w = new WorldState();
    w.place({ region: "contact", x: 1, y: -4 }, "m", "oak");
    expect(w.tuples([{ region: "contact", x: 1, y: -4 }])).toEqual([["contact", 1, -4, null, "oak", null]]);
  });
});

describe("contact form", () => {
  it("accepts a normal message and tidies single-line fields", () => {
    const r = checkContact({ name: "  Ana\nReyes ", email: "ana@example.com", subject: "Hi\r\nthere", message: "I'd like to talk about an internship." });
    expect(r).toEqual({ ok: true, value: { name: "Ana Reyes", email: "ana@example.com", subject: "Hi there", message: "I'd like to talk about an internship." } });
  });

  it("explains what's missing or wrong", () => {
    const r = checkContact({ name: "", email: "not-an-email", message: "hi" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(["email", "message", "name"]);
  });
});
