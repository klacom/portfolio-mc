import { afterEach, describe, expect, it, vi } from "vitest";
import type { BlockId } from "./blocks";
import { EMPTY_CELL, type Cell } from "./cell";
import { makeMob, poke, stepMob, visitorName, type Env, type Mob } from "./creatures";
import type { RegionId } from "./regions";
import { soundPlacement } from "./sound";

/** A flat test world: stone from row 0 down, plus whatever `extra` adds. */
function world(extra: (cx: number, cy: number) => BlockId | null = () => null, onCross: (m: Mob) => boolean = () => true): Env {
  return {
    cell: (_r: RegionId, cx: number, cy: number): Cell => {
      const id = extra(cx, cy) ?? (cy >= 0 ? "stone" : null);
      return id ? { ...EMPTY_CELL, m: id } : EMPTY_CELL;
    },
    bounds: () => ({ left: -20, right: 19, top: -30, bottom: 3 }),
    cross: onCross,
    spots: () => [{ x: 8, y: 0 }],
    night: false,
    sound: () => {},
    effect: () => {},
  };
}

function run(m: Mob, env: Env, seconds: number) {
  for (let t = 0; t < seconds; t += 1 / 30) stepMob(m, [m], env, 1 / 30);
}

describe("creatures", () => {
  it("fall and land on the ground", () => {
    const sheep = makeMob("sheep", "intro", 8, -80);
    run(sheep, world(), 2);
    expect(sheep.onGround).toBe(true);
    expect(sheep.y).toBeCloseTo(0, 0);
  });

  it("float in water instead of sinking", () => {
    const pool = (cx: number, cy: number): BlockId | null => (cy >= -3 && cy < 0 ? "water" : null);
    const pig = makeMob("pig", "intro", 8, -60);
    run(pig, world(pool), 4);
    // The pig bobs near the surface (row -3 starts at y = -48), well above the pool's floor.
    expect(pig.y).toBeLessThan(-30);
  });

  it("leap out of lava and smoulder, unharmed", () => {
    const lava = (cx: number, cy: number): BlockId | null => (cy === -1 ? "lava" : null);
    // Feet just inside the lava row (row -1 spans y = -16 to 0).
    const pig = makeMob("pig", "intro", 8, -2);
    stepMob(pig, [pig], world(lava), 1 / 30);
    expect(pig.burning).toBeGreaterThan(0);
    expect(pig.vy).toBeLessThan(0);
  });

  it("go home when they fall out of the world", () => {
    const sheep = makeMob("sheep", "intro", 8, -20);
    sheep.region = "contact";
    stepMob(sheep, [sheep], world(() => null, () => false), 1 / 30);
    expect(sheep.state).toBe("teleport");
    expect(sheep.dest?.region).toBe("intro");
  });

  it("head home after a while away", () => {
    const slime = makeMob("slime", "projects", 8, 0);
    slime.region = "intro";
    slime.awayLimit = 1;
    run(slime, world(), 1.5);
    expect(slime.dest?.region ?? slime.region).toBe("projects");
  });
});

describe("creature sounds", () => {
  it("are full volume near the middle of the screen", () => {
    expect(soundPlacement(10, -20, 240, 150)).toEqual({ volume: 1, pan: expect.closeTo(0.03, 2) });
  });

  it("fade toward the edges and pan to that side", () => {
    const edge = soundPlacement(240, 0, 240, 150)!;
    expect(edge.volume).toBeGreaterThan(0.5);
    expect(edge.volume).toBeLessThan(1);
    expect(edge.pan).toBeCloseTo(0.7);
    expect(soundPlacement(-240, 0, 240, 150)!.pan).toBeCloseTo(-0.7);
  });

  it("are silent well off screen", () => {
    expect(soundPlacement(0, 150 * 2.1, 240, 150)).toBeNull();
    expect(soundPlacement(0, -150 * 3, 240, 150)).toBeNull();
  });
});

describe("visitor shout-outs", () => {
  it("use the first name in capitals, in letters the bubble font can draw", () => {
    expect(visitorName("  Klarenz Cobie ")).toBe("KLARENZ");
    expect(visitorName("José")).toBe("JOSE");
    expect(visitorName("Ñino")).toBe("NINO");
    expect(visitorName("Mary-Jane O'Neil")).toBe("MARY-JANE");
    expect(visitorName("Bartholomewsky")).toBe("BARTHOLOMEWS");
  });

  it("skip names with nothing usable left", () => {
    expect(visitorName("")).toBeNull();
    expect(visitorName("😀")).toBeNull();
    expect(visitorName("李")).toBeNull();
  });
});

describe("creature sound levels", () => {
  afterEach(() => vi.restoreAllMocks());

  function listening() {
    const heard: { kind: string; level: number }[] = [];
    const env = { ...world(), sound: (kind: string, _m: Mob, level = 1) => heard.push({ kind, level }) } as Env;
    return { env, heard };
  }

  it("a creature chatting on its own asks for a quiet sound", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const { env, heard } = listening();
    const fairy = makeMob("fairy", "skills", 8, -60);
    fairy.chatter = 0;
    stepMob(fairy, [fairy], env, 1 / 30);
    expect(heard).toEqual([{ kind: "chime", level: expect.any(Number) }]);
    expect(heard[0]!.level).toBeLessThan(1);
  });

  it("a poked creature answers at full level, and a shade answers with a hum, not a warp", () => {
    const { env, heard } = listening();
    poke(makeMob("shade", "contact", 8, 0), env);
    expect(heard).toEqual([{ kind: "murmur", level: 1 }]);
  });
});
