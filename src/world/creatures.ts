import { BLOCKS, type BlockId } from "./blocks";
import type { Cell } from "./cell";
import { GROUND_ROWS, type RegionId } from "./regions";
import type { SoundKind } from "./sound";
import { TEX, type RGB } from "./textures";

/**
 * Creatures that live in the world: they wander, jump, swim, panic, chat in speech bubbles, can be
 * picked up and thrown into another section, and find their way home after a while. All original
 * designs drawn in code. Nothing can hurt them: lava sends them running and the void sends them home.
 *
 * Positions are in texels, local to the section the creature is in (column 0 is the section's centre,
 * row 0 the top of its ground band). (x, y) is the middle of the creature's feet.
 */

export type Kind = "sheep" | "pig" | "bat" | "slime" | "fairy" | "hog" | "shade" | "me";
type State = "idle" | "walk" | "air" | "held" | "thrown" | "dizzy" | "hop" | "hang" | "fly" | "talk" | "teleport" | "sleep";

type Def = {
  /** Sprite size in texels. */
  w: number;
  h: number;
  /** Collision box. */
  bw: number;
  bh: number;
  speed: number;
  fly: boolean;
  home: RegionId;
  /** What it says now and then, when held, and in a section that isn't home. */
  idle: string[];
  held: string[];
  lost: string[];
  /** Rarer lines: little secrets about the owner. */
  secret: string[];
  voice?: SoundKind;
};

/** The level for sounds creatures make on their own (chatting, hopping, blinking away), not because of a click. */
const AMBIENT = 0.5;

const LOST = ["WHERE AM I?!", "WHAT THE HECK?", "HUH?!", "?!", "THIS ISN'T HOME..."];

export const DEFS: Record<Kind, Def> = {
  sheep: { w: 16, h: 13, bw: 12, bh: 12, speed: 13, fly: false, home: "intro", idle: ["BAA!", "BAAA?", "♪"], held: ["BAAA!", "!", "PUT ME DOWN!"], lost: LOST, secret: ["PSST... HIRE KLARENZ.", "HE DREW ME IN CODE!"], voice: "baa" },
  pig: { w: 16, h: 12, bw: 12, bh: 11, speed: 15, fly: false, home: "intro", idle: ["OINK!", "OINK OINK", "SNRK", "♥"], held: ["SQUEEE!", "!", "OINK?!"], lost: LOST, secret: ["HE'D BE A GREAT HIRE. OINK.", "I'M IN A PORTFOLIO! ♥"], voice: "oink" },
  bat: { w: 13, h: 10, bw: 9, bh: 7, speed: 46, fly: true, home: "projects", idle: ["SQUEAK!", "...", "EEP"], held: ["EEEP!", "!"], lost: ["TOO BRIGHT!", "WHERE'S MY CAVE?", "?!"], secret: ["HE CODES AT NIGHT TOO.", "SHH... HE'S HIREABLE."], voice: "squeak" },
  slime: { w: 14, h: 12, bw: 11, bh: 9, speed: 34, fly: false, home: "projects", idle: ["BLUB!", "BOING", "♥", "BLOOP"], held: ["SQUISH!", "!"], lost: ["BLUB?!", "?", "WHERE AM I?"], secret: ["I EAT BUGS. HE FIXES THEM.", "HIRE HIM! BLUB!"], voice: "blub" },
  fairy: { w: 9, h: 9, bw: 5, bh: 5, speed: 24, fly: true, home: "skills", idle: ["HEHE!", "♪", "✦"], held: ["HEY!", "!"], lost: ["SO DARK HERE...", "?", "WHICH WAY HOME?"], secret: ["HE LOVES OLDIES! ♪", "HIRE HIM, PRETTY PLEASE ✦"], voice: "chime" },
  hog: { w: 14, h: 24, bw: 8, bh: 23, speed: 15, fly: false, home: "about", idle: ["SNORT.", "HOT TODAY.", "HEH HEH."], held: ["SQUEEEAL!", "HEY!", "PUT ME DOWN!"], lost: ["WHERE'S THE LAVA?", "TOO COLD!", "?!"], secret: ["WOULD YOU KINDLY HIRE HIM?", "HE LOVES BIOSHOCK. SO DO I."], voice: "squeal" },
  shade: { w: 12, h: 40, bw: 6, bh: 38, speed: 7, fly: false, home: "contact", idle: ["...", "SHH.", "WHO GOES THERE?"], held: ["...!", "UNHAND ME."], lost: ["...WHERE?", "TOO LOUD HERE.", "?"], secret: ["I'VE SEEN HIS CODE. IT'S CLEAN.", "HIRE HIM AND I'LL STOP STARING."], voice: "murmur" },
  me: { w: 12, h: 20, bw: 8, bh: 19, speed: 22, fly: false, home: "intro", idle: ["HI, I'M KLARENZ!", "WELCOME TO MY WORLD!", "PRESS BUILD TO PLAY!", "SEE MY PROJECTS BELOW!", "♪"], held: ["WHOA! PUT ME DOWN!", "HEY!"], lost: ["WHERE AM I?!", "THIS ISN'T MY HOUSE!"], secret: ["PLEASE HIRE ME!", "MY FAVORITE GAME IS MINECRAFT!", "I ALSO LOVE BIOSHOCK!", "I LOVE OLDIES MUSIC! ♪"], voice: "hey" },
};

const HOG_CHAT = ["SNORT!", "OINK?", "HOT TODAY.", "SQUEE!", "HEH HEH.", "NICE BRIDGE.", "LAVA BATH LATER?", "HMM...", "OINK OINK!", "YOU SMELL NICE."];
const FAIRY_COLOURS: [RGB, RGB][] = [
  [[255, 120, 210], [255, 200, 240]],
  [[110, 230, 255], [200, 248, 255]],
  [[255, 206, 80], [255, 240, 180]],
  [[150, 255, 110], [220, 255, 200]],
  [[190, 150, 255], [230, 214, 255]],
];

/** The cottage in the hero: where the mini me lives, sleeps and bounces around. */
const HOUSE = { x0: 15 * TEX + 5, x1: 19 * TEX - 5, floor: -7 * TEX, bed: 15 * TEX + 8, top: -10 * TEX };

export type Bubble = { text: string; age: number; life: number };

export type Mob = {
  id: number;
  kind: Kind;
  home: RegionId;
  region: RegionId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  dir: 1 | -1;
  state: State;
  /** Seconds in the current state. */
  t: number;
  /** Seconds until the next decision. */
  timer: number;
  /** Animation clock. */
  anim: number;
  onGround: boolean;
  water: number;
  burning: number;
  dizzy: number;
  confused: number;
  away: number;
  awayLimit: number;
  fade: number;
  spin: number;
  colour: number;
  target: { x: number; y: number } | null;
  talk: { with: number; turns: number; speaker: boolean } | null;
  bubble: Bubble | null;
  chatter: number;
  /** Teleport destination while fading out. */
  dest: { region: RegionId; x: number; y: number } | null;
  wasRegion: RegionId;
};

export type Spot = { x: number; y: number };
export type Effect = "poof" | "splash" | "smoke" | "sparkle" | "warp" | "bubbles";

/** What creatures need from the world around them. */
export type Env = {
  cell(region: RegionId, cx: number, cy: number): Cell;
  /** Visible columns and rows of a section, in cells. */
  bounds(region: RegionId): { left: number; right: number; top: number; bottom: number } | null;
  /** Moves a creature into the section above or below when it crosses an edge. False when it left the page. */
  cross(m: Mob): boolean;
  /** Places a creature could stand (feet positions) or hang from, in a section's visible area. */
  spots(region: RegionId, kind: "floor" | "ceiling" | "air", clearance: number): Spot[];
  night: boolean;
  /** `level` below 1 marks a sound the creature makes on its own: the site plays those quieter and rarer. */
  sound(kind: SoundKind, m: Mob, level?: number): void;
  effect(kind: Effect, m: Mob, colour?: RGB): void;
};

// ---------------------------------------------------------------- spawning

const SPAWNS: Partial<Record<RegionId, { kind: Kind; x: number; y?: number }[]>> = {
  intro: [{ kind: "sheep", x: -12 }, { kind: "sheep", x: 6 }, { kind: "pig", x: -9 }, { kind: "pig", x: 11 }, { kind: "me", x: 16, y: -8 }],
  projects: [{ kind: "bat", x: -7 }, { kind: "bat", x: 1 }, { kind: "bat", x: 8 }, { kind: "slime", x: -8 }, { kind: "slime", x: 1 }, { kind: "slime", x: 7 }],
  skills: [0, 1, 2, 3, 4].map((i) => ({ kind: "fairy" as const, x: -8 + i * 4 })),
  about: [{ kind: "hog", x: -7, y: -3 }, { kind: "hog", x: -4, y: -3 }, { kind: "hog", x: 3, y: -3 }, { kind: "hog", x: 6, y: -3 }],
  contact: [{ kind: "shade", x: -3 }, { kind: "shade", x: 4 }],
};

let nextId = 1;
const pick = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)]!;

/** A creature at a spot, before it has taken a step. */
export function makeMob(kind: Kind, region: RegionId, x: number, y: number): Mob {
  return blank(kind, region, x, y);
}

function blank(kind: Kind, region: RegionId, x: number, y: number): Mob {
  return {
    id: nextId++, kind, home: DEFS[kind].home, region, x, y, vx: 0, vy: 0, dir: Math.random() < 0.5 ? 1 : -1, state: DEFS[kind].fly ? "fly" : "idle",
    t: 0, timer: 1 + Math.random() * 3, anim: Math.random() * 10, onGround: false, water: 0, burning: 0, dizzy: 0, confused: 0, away: 0,
    awayLimit: 100 + Math.random() * 40, fade: 1, spin: 0, colour: 0, target: null, talk: null, bubble: null, chatter: 4 + Math.random() * 10, dest: null, wasRegion: region,
  };
}

/** Creatures for one section, placed on the ground (or ceiling) near their spawn columns. */
export function spawnFor(region: RegionId, env: Env): Mob[] {
  const list = SPAWNS[region];
  const b = env.bounds(region);
  if (!list || !b) return [];
  // Spawn on the ground, not on top of trees.
  const leafy = new Set<BlockId | null>(["leaves", "autumn", "blossom", "plumleaves"]);
  const floors = env.spots(region, "floor", 2).filter((f) => !leafy.has(env.cell(region, Math.floor(f.x / TEX), Math.round(f.y / TEX)).m));
  const ceilings = env.spots(region, "ceiling", 2);
  const out: Mob[] = [];
  list.forEach((s, i) => {
    const want = Math.max(b.left + 1, Math.min(b.right - 1, s.x)) * TEX + TEX / 2;
    let x = want;
    let y = (s.y ?? 0) * TEX + TEX;
    if (s.kind === "me") {
      x = HOUSE.bed + TEX * 1.5;
      y = HOUSE.floor;
    } else if (s.kind === "bat" && ceilings.length) {
      const c = ceilings.reduce((best, c) => (Math.abs(c.x - want) < Math.abs(best.x - want) ? c : best));
      x = c.x;
      y = c.y + DEFS.bat.bh + 1;
    } else if (s.kind === "fairy") {
      y = (b.top + 4 + (i % 3) * 2) * TEX;
    } else if (s.y === undefined && floors.length) {
      const near = floors.filter((f) => Math.abs(f.x - want) < TEX * 4);
      const f = near.length ? pick(near) : floors.reduce((best, c) => (Math.abs(c.x - want) < Math.abs(best.x - want) ? c : best));
      x = f.x;
      y = f.y;
    }
    const m = blank(s.kind, region, x, y);
    if (s.kind === "bat") m.state = ceilings.length ? "hang" : "fly";
    if (s.kind === "fairy") m.colour = i % FAIRY_COLOURS.length;
    out.push(m);
  });
  return out;
}

// ---------------------------------------------------------------- terrain checks

const blocks = (id: BlockId | null) => !!id && BLOCKS[id].solid && id !== "water" && id !== "lava";
const liquid = (id: BlockId | null) => (id === "water" || id === "lava" ? id : null);

function hits(env: Env, m: Mob, x: number, y: number): boolean {
  const d = DEFS[m.kind];
  const x0 = Math.floor((x - d.bw / 2) / TEX);
  const x1 = Math.floor((x + d.bw / 2 - 0.01) / TEX);
  const y0 = Math.floor((y - d.bh) / TEX);
  const y1 = Math.floor((y - 0.01) / TEX);
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) if (blocks(env.cell(m.region, cx, cy).m)) return true;
  return false;
}

/** How deep in water or lava, as a share of the body, and which liquid. */
function soak(env: Env, m: Mob): { kind: "water" | "lava" | null; depth: number } {
  const d = DEFS[m.kind];
  const cx = Math.floor(m.x / TEX);
  let kind: "water" | "lava" | null = null;
  let wet = 0;
  const samples = 4;
  for (let i = 0; i < samples; i++) {
    const y = m.y - 1 - (i / (samples - 1)) * (d.bh - 2);
    const l = liquid(env.cell(m.region, cx, Math.floor(y / TEX)).m);
    if (l) {
      kind = kind === "lava" ? "lava" : l;
      wet++;
    }
  }
  return { kind, depth: wet / samples };
}

/** Moves with collisions, a few texels at a time so nothing tunnels through a floor. */
function move(env: Env, m: Mob, dt: number): { wall: boolean; landed: boolean; ceiling: boolean; impact: number } {
  const out = { wall: false, landed: false, ceiling: false, impact: 0 };
  const d = DEFS[m.kind];
  if (hits(env, m, m.x, m.y)) {
    // Something was built on top of it: climb out.
    for (let k = 1; k <= 48; k++) {
      if (!hits(env, m, m.x, m.y - k * 2)) {
        m.y -= k * 2;
        break;
      }
    }
  }
  const steps = Math.max(1, Math.ceil((Math.max(Math.abs(m.vx), Math.abs(m.vy)) * dt) / 5));
  const sx = (m.vx * dt) / steps;
  const sy = (m.vy * dt) / steps;
  m.onGround = false;
  for (let i = 0; i < steps; i++) {
    const nx = m.x + sx;
    if (hits(env, m, nx, m.y)) out.wall = true;
    else m.x = nx;
    const ny = m.y + sy;
    if (hits(env, m, m.x, ny)) {
      if (sy > 0) {
        m.y = Math.floor(ny / TEX) * TEX - 0.01;
        if (hits(env, m, m.x, m.y)) m.y = ny - sy;
        out.landed = true;
        out.impact = Math.max(out.impact, m.vy);
        m.onGround = true;
      } else {
        out.ceiling = true;
      }
    } else m.y = ny;
  }
  // Standing still on the ground counts as grounded too.
  if (!m.onGround && m.vy >= 0 && hits(env, m, m.x, m.y + 1)) m.onGround = true;
  // The screen's edges are walls, so creatures stay where visitors can see them.
  const b = env.bounds(m.region);
  if (b) {
    const lo = b.left * TEX + d.bw / 2 + 1;
    const hi = (b.right + 1) * TEX - d.bw / 2 - 1;
    if (m.x < lo || m.x > hi) {
      m.x = Math.max(lo, Math.min(hi, m.x));
      out.wall = true;
    }
  }
  return out;
}

// ---------------------------------------------------------------- behaviour

/** Longer lines stay up longer, so there's time to read them. */
function say(m: Mob, text: string, life = 2.4) {
  m.bubble = { text, age: 0, life: Math.max(life, 1.2 + text.length * 0.07) };
}

// A visitor's first name, only if they typed it into the contact form. Kept in memory: a reload forgets it.
let visitor: string | null = null;

/** The first name as the bubble font can draw it (letters, digits, ' and -), or null if nothing usable is left. */
export function visitorName(raw: string): string | null {
  const first = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().split(/\s+/)[0] ?? "";
  const clean = first.toUpperCase().replace(/[^A-Z0-9'-]/g, "").slice(0, 12);
  return clean.length >= 2 ? clean : null;
}

export function setVisitor(raw: string): string | null {
  visitor = visitorName(raw);
  return visitor;
}

const secretTurn = new Map<Kind, number>();

/** Mostly the usual lines; now and then a secret (in turn, so they don't repeat), or a shout-out to the visitor. */
function chat(m: Mob, usual: readonly string[], secretChance: number): string {
  if (visitor && Math.random() < 0.15) return pick([`SHOUT OUT KAY, ${visitor}!`, `HI, ${visitor}!`]);
  const secrets = DEFS[m.kind].secret;
  if (secrets.length && Math.random() < secretChance) {
    const turn = secretTurn.get(m.kind) ?? Math.floor(Math.random() * secrets.length);
    secretTurn.set(m.kind, turn + 1);
    return secrets[turn % secrets.length]!;
  }
  return pick(usual);
}

/** A shout-out with a hop, right after a visitor sends a message with their name. */
export function cheer(m: Mob, env: Env) {
  if (!visitor) return;
  say(m, `SHOUT OUT KAY, ${visitor}!`, 3.5);
  env.sound(DEFS[m.kind].voice ?? "ui", m);
  if (!DEFS[m.kind].fly && m.onGround && m.state !== "sleep") m.vy = -150;
}

function setState(m: Mob, s: State) {
  if (m.state !== s) {
    m.state = s;
    m.t = 0;
  }
}

/** Where a creature's feet go for a spot: floors are feet already, ceilings and air need its height. */
function standAt(m: Mob, s: Spot, kind: "floor" | "ceiling" | "air") {
  const d = DEFS[m.kind];
  return kind === "floor" ? s.y : kind === "ceiling" ? s.y + d.bh + 1 : s.y + d.bh / 2;
}

/** Starts a short vanish-and-reappear, used for teleports and for going home. */
function teleport(m: Mob, env: Env, region: RegionId, home: boolean) {
  const d = DEFS[m.kind];
  let kind: "floor" | "ceiling" | "air" = m.kind === "bat" ? "ceiling" : d.fly ? "air" : "floor";
  let spots = env.spots(region, kind, Math.ceil(d.bh / TEX));
  if (!spots.length && kind !== "air" && d.fly) {
    kind = "air";
    spots = env.spots(region, kind, 1);
  }
  if (!spots.length) {
    kind = "floor";
    spots = env.spots(region, kind, 1);
  }
  let x = 0;
  let y = -TEX * 3;
  if (m.kind === "me" && region === m.home) {
    x = HOUSE.bed + TEX * 2;
    y = HOUSE.floor;
  } else if (spots.length) {
    const s = pick(spots);
    x = s.x;
    y = standAt(m, s, kind);
  }
  m.dest = { region, x, y };
  setState(m, "teleport");
  env.effect(m.kind === "shade" ? "warp" : "poof", m);
  if (home) m.away = 0;
}

/** Called when a creature lands somewhere new: it looks around, puzzled, if it isn't home. */
function arrived(m: Mob, env: Env) {
  if (m.region === m.wasRegion) return;
  m.wasRegion = m.region;
  if (m.region !== m.home) {
    m.confused = 3.5;
    say(m, pick(DEFS[m.kind].lost), 3);
    env.sound(DEFS[m.kind].voice ?? "ui", m);
  }
}

const G = 620;
const TERMINAL = 430;

export function stepMob(m: Mob, all: Mob[], env: Env, dt: number) {
  const d = DEFS[m.kind];
  m.anim += dt;
  m.t += dt;
  if (m.bubble) {
    m.bubble.age += dt;
    if (m.bubble.age > m.bubble.life) m.bubble = null;
  }
  if (m.state === "held") return;

  if (m.state === "teleport") {
    if (m.dest) {
      m.fade = Math.max(0, m.fade - dt * 3);
      if (m.fade <= 0) {
        const homecoming = m.dest.region === m.home && m.region !== m.home;
        m.region = m.dest.region;
        m.x = m.dest.x;
        m.y = m.dest.y;
        m.vx = m.vy = 0;
        m.dest = null;
        m.burning = 0;
        m.wasRegion = m.region;
        env.effect(m.kind === "shade" ? "warp" : "poof", m);
        if (homecoming) say(m, m.kind === "me" ? "HOME SWEET HOME!" : pick(["HOME!", "PHEW.", "BACK HOME!"]));
      }
    } else {
      m.fade = Math.min(1, m.fade + dt * 3);
      if (m.fade >= 1) setState(m, d.fly ? (m.kind === "bat" && hits(env, m, m.x, m.y - 3) ? "hang" : "fly") : "idle");
    }
    return;
  }

  // Wandered off (or was carried off) for a while: go home.
  if (m.region !== m.home) {
    m.away += dt;
    if (m.away > m.awayLimit) {
      teleport(m, env, m.home, true);
      return;
    }
  } else m.away = 0;

  m.chatter -= dt;
  m.burning = Math.max(0, m.burning - dt);
  m.confused = Math.max(0, m.confused - dt);
  m.dizzy = Math.max(0, m.dizzy - dt);

  if (d.fly) flyer(m, env, dt);
  else walker(m, all, env, dt);

  if (!env.cross(m)) {
    // Fell out of the world: nothing is lost, it just goes home.
    m.region = m.home;
    m.wasRegion = m.home;
    teleport(m, env, m.home, true);
    m.fade = 0;
    say(m, "PHEW!");
    return;
  }
  if (m.region !== m.wasRegion && m.state !== "thrown" && m.state !== "air") arrived(m, env);

  if (m.chatter <= 0 && !m.bubble && m.state !== "sleep" && m.state !== "hang") {
    m.chatter = 9 + Math.random() * 16;
    const line = m.kind === "me" && env.night ? pick(["*YAWN*", "SO SLEEPY...", "ZZZ"]) : chat(m, d.idle, m.kind === "me" ? 0.3 : 0.12);
    say(m, line);
    if (Math.random() < 0.35) env.sound(d.voice ?? "ui", m, AMBIENT);
  }
}

function walker(m: Mob, all: Mob[], env: Env, dt: number) {
  const d = DEFS[m.kind];
  const wet = soak(env, m);
  const wasWater = m.water;
  m.water = wet.kind === "water" ? wet.depth : 0;
  if (wet.kind === "lava" && m.burning < 4.2) {
    // Lava: a yelp, a leap out, and a few seconds of running around smouldering.
    if (m.burning <= 0) say(m, pick(["HOT HOT HOT!", "OW OW OW!", "YEOWCH!"]));
    m.burning = 5;
    m.vy = -280;
    m.vx = (m.vx >= 0 ? 1 : -1) * 90;
    env.effect("smoke", m);
    env.sound("sizzle", m);
    if (m.kind === "shade") {
      teleport(m, env, m.region, false);
      return;
    }
  }
  if (m.water > 0 && wasWater === 0 && m.vy > 60) {
    env.effect("splash", m);
    env.sound("splash", m);
    if (m.kind === "shade") {
      teleport(m, env, m.region, false);
      return;
    }
  }

  // Forces: gravity, then buoyancy and drag in water, and heavy drag in lava.
  if (m.water > 0) {
    m.vy += G * 0.3 * dt;
    if (m.water > 0.4) m.vy -= 1500 * (m.water - 0.35) * dt;
    m.vx *= Math.max(0, 1 - 2.5 * dt);
    m.vy *= Math.max(0, 1 - 3 * dt);
    if (Math.random() < dt * 1.5) env.effect("bubbles", m);
  } else if (wet.kind === "lava") {
    m.vy += G * 0.4 * dt;
    m.vx *= Math.max(0, 1 - 3 * dt);
  } else m.vy = Math.min(TERMINAL, m.vy + G * dt);

  // Being thrown: tumble until it lands, maybe bouncing once or twice.
  if (m.state === "thrown") {
    m.spin += dt * (m.vx >= 0 ? 10 : -10);
    const hit = move(env, m, dt);
    if (hit.wall) m.vx *= -0.45;
    if (hit.landed) {
      if (hit.impact > 230) {
        m.vy = -hit.impact * 0.32;
        m.vx *= 0.6;
        env.effect("poof", m, [200, 190, 170]);
        env.sound("thud", m);
      } else {
        m.spin = 0;
        m.vx = 0;
        m.dizzy = hit.impact > 120 ? 1.6 : 0;
        if (m.dizzy) say(m, pick(["OOF!", "@_@", "OWIE..."]), 1.6);
        setState(m, m.dizzy ? "dizzy" : "idle");
        m.timer = 1;
        arrived(m, env);
      }
    } else if (m.water > 0.3) {
      m.spin = 0;
      setState(m, "air");
      arrived(m, env);
    }
    return;
  }

  // Decide what to do next.
  m.timer -= dt;
  const panic = m.burning > 0;
  const grounded = m.onGround || m.water > 0.3;
  if (m.kind === "me") meBrain(m, env, grounded);
  else if (m.kind === "hog") hogBrain(m, all, env, grounded);
  else if (m.kind === "shade") shadeBrain(m, env, grounded);

  if (m.state === "talk" || m.state === "sleep" || m.state === "teleport") {
    m.vx = 0;
    move(env, m, dt);
    return;
  }
  if (m.dizzy > 0) {
    setState(m, "dizzy");
    m.vx = 0;
    move(env, m, dt);
    return;
  }
  if (m.state === "dizzy") setState(m, "idle");

  if (grounded && m.timer <= 0) {
    if (m.confused > 0) {
      // Looks one way, then the other.
      m.dir = m.dir === 1 ? -1 : 1;
      m.timer = 0.6;
      setState(m, "idle");
    } else if (m.kind === "slime") {
      setState(m, "hop");
      m.timer = 0.9 + Math.random() * 1.6;
      if (Math.random() < 0.3) m.dir = m.dir === 1 ? -1 : 1;
    } else if (m.state === "walk") {
      setState(m, "idle");
      m.timer = 1.5 + Math.random() * 3.5;
    } else {
      setState(m, "walk");
      m.timer = 2 + Math.random() * 4;
      if (Math.random() < 0.5) m.dir = m.dir === 1 ? -1 : 1;
    }
  }

  const speed = d.speed * (panic ? 3 : m.kind === "me" && !env.night ? 1.25 : 1);
  let want = 0;
  if (panic) want = m.dir * speed;
  else if (m.state === "walk" && m.confused <= 0) want = m.dir * speed;
  else if (m.water > 0.3) want = m.dir * speed * 0.7; // paddle towards the shore
  if (m.kind === "slime") {
    if (m.state === "hop" && m.onGround && m.t > 0.18 && m.t < 0.3) {
      m.vy = -(140 + Math.random() * 50);
      m.vx = m.dir * d.speed;
      m.onGround = false;
      if (Math.random() < 0.3) env.sound("blub", m, AMBIENT);
    }
    if (m.onGround && m.vy >= 0) m.vx = 0;
    if (m.state === "hop" && m.onGround && m.t > 0.5) setState(m, "idle");
    want = m.vx;
  }

  // Look ahead: a one-block step gets a jump, anything taller turns it round; so do drops and liquids.
  if (want !== 0 && grounded && m.kind !== "slime") {
    const ax = m.x + m.dir * (d.bw / 2 + 3);
    const cx = Math.floor(ax / TEX);
    const feet = Math.floor((m.y - 1) / TEX);
    const wall = blocks(env.cell(m.region, cx, feet).m);
    if (wall) {
      const clear = (n: number) => !blocks(env.cell(m.region, cx, feet - n).m);
      const roomAbove = !blocks(env.cell(m.region, Math.floor(m.x / TEX), feet - Math.ceil(d.bh / TEX)).m);
      if (clear(1) && clear(Math.ceil(d.bh / TEX)) && roomAbove && m.onGround) {
        m.vy = -175;
        m.onGround = false;
      } else if (!panic || Math.random() < 0.5) {
        m.dir = m.dir === 1 ? -1 : 1;
        want = -want;
      }
    } else if (!panic && m.water === 0) {
      const below = env.cell(m.region, cx, feet + 1).m;
      const below2 = env.cell(m.region, cx, feet + 2).m;
      const drop = !blocks(below) && !blocks(below2);
      if (drop || liquid(below)) {
        m.dir = m.dir === 1 ? -1 : 1;
        want = 0;
        m.timer = Math.min(m.timer, 0.4);
      }
    }
  }
  if (m.kind === "me" && m.region === m.home && inHouse(m)) {
    const lo = HOUSE.x0;
    const hi = HOUSE.x1;
    if ((m.x <= lo && m.dir < 0) || (m.x >= hi && m.dir > 0)) {
      m.dir = m.dir === 1 ? -1 : 1;
      want = 0;
    }
  }
  if (m.kind !== "slime") m.vx += (want - m.vx) * Math.min(1, dt * (m.onGround ? 10 : 2));
  if (panic && m.onGround && Math.random() < dt * 1.2) m.vy = -150;

  const before = m.onGround;
  const hit = move(env, m, dt);
  if (m.kind === "me" && m.region === m.home && inHouse(m)) m.x = Math.max(HOUSE.x0 - 4, Math.min(HOUSE.x1 + 4, m.x));
  if (hit.wall && m.kind === "slime") m.dir = m.dir === 1 ? -1 : 1;
  if (hit.ceiling) m.vy = Math.max(0, m.vy);
  if (hit.landed && !before && m.vy >= 0 && hit.impact > 300) {
    env.effect("poof", m, [200, 190, 170]);
    if (hit.impact > 380) {
      m.dizzy = 1.2;
      say(m, "OOF!", 1.2);
    }
  }
  if (hit.landed) {
    m.vy = 0;
    if (m.state === "air") {
      setState(m, "idle");
      m.timer = 0.8;
    }
    arrived(m, env);
  }
}

function inHouse(m: Mob) {
  return m.x > HOUSE.x0 - TEX && m.x < HOUSE.x1 + TEX && m.y <= HOUSE.floor + 2 && m.y > HOUSE.top;
}

/** The mini me: bouncy by day, off to bed at night. */
function meBrain(m: Mob, env: Env, grounded: boolean) {
  const home = m.region === m.home && inHouse(m);
  if (env.night && home && m.burning <= 0 && m.confused <= 0) {
    if (m.state === "sleep") {
      // Little Zs while asleep.
      if (!m.bubble && m.t > 1 && Math.random() < 0.01) say(m, pick(["Z", "ZZ", "ZZZ"]), 1.8);
      return;
    }
    if (Math.abs(m.x - HOUSE.bed) > 3) {
      m.dir = m.x > HOUSE.bed ? -1 : 1;
      if (m.state !== "walk") setState(m, "walk");
      m.timer = 1;
    } else if (grounded) {
      m.x = HOUSE.bed;
      setState(m, "sleep");
      say(m, "ZZZ", 2.5);
      env.sound("yawn", m, AMBIENT);
    }
    return;
  }
  if (m.state === "sleep") {
    setState(m, "idle");
    m.timer = 1.2;
    say(m, env.night ? "HUH? WHERE'S MY BED?" : "GOOD MORNING!", 2.4);
  }
  // By day: little hops and waves.
  if (!env.night && grounded && m.onGround && m.state !== "walk" && Math.random() < 0.006) m.vy = -190;
}

/** Hoglings stop to chat when they meet. */
function hogBrain(m: Mob, all: Mob[], env: Env, grounded: boolean) {
  if (m.talk) {
    const other = all.find((o) => o.id === m.talk!.with);
    if (!other || other.state !== "talk" || other.region !== m.region || m.burning > 0) {
      m.talk = null;
      setState(m, "idle");
      return;
    }
    m.dir = other.x > m.x ? 1 : -1;
    if (m.talk.speaker && m.t > 0.2 && !m.bubble) {
      say(m, pick(HOG_CHAT), 1.6);
      if (Math.random() < 0.4) env.sound("grunt", m, AMBIENT);
      m.talk.turns--;
      m.talk.speaker = false;
      if (other.talk) other.talk.speaker = true;
      other.t = -1.4;
      if (m.talk.turns <= 0) {
        m.talk = null;
        if (other.talk) other.talk.turns = 0;
        setState(m, "walk");
        m.timer = 3;
        m.dir = m.dir === 1 ? -1 : 1;
      }
    }
    if (m.talk && !m.talk.speaker && !other.talk) {
      m.talk = null;
      setState(m, "idle");
    }
    return;
  }
  if (!grounded || m.confused > 0 || m.burning > 0 || m.chatter > 6) return;
  const friend = all.find((o) => o !== m && o.kind === "hog" && o.region === m.region && !o.talk && o.state !== "held" && o.onGround && Math.abs(o.x - m.x) < 56 && Math.abs(o.y - m.y) < 10);
  if (friend && Math.random() < 0.02) {
    const turns = 3 + Math.floor(Math.random() * 4);
    m.talk = { with: friend.id, turns, speaker: true };
    friend.talk = { with: m.id, turns, speaker: false };
    setState(m, "talk");
    setState(friend, "talk");
    m.chatter = friend.chatter = 20;
  }
}

/** Shades drift slowly and now and then blink to another spot in their section. */
function shadeBrain(m: Mob, env: Env, grounded: boolean) {
  if (!grounded || m.burning > 0) return;
  if (m.timer <= 0 && m.state === "idle" && Math.random() < 0.3) {
    teleport(m, env, m.region, false);
    env.sound("warp", m, AMBIENT);
  }
}

function flyer(m: Mob, env: Env, dt: number) {
  const d = DEFS[m.kind];
  const b = env.bounds(m.region);
  if (m.state === "thrown") {
    // Tossed fliers tumble, slow down, then catch themselves.
    m.spin += dt * 14;
    m.vy += G * 0.5 * dt;
    m.vx *= Math.max(0, 1 - 2 * dt);
    const hit = move(env, m, dt);
    if (hit.wall) m.vx *= -0.5;
    if (hit.landed) m.vy *= -0.4;
    if (m.t > 0.7) {
      m.spin = 0;
      setState(m, "fly");
      m.target = null;
      arrived(m, env);
    }
    return;
  }
  if (m.state === "hang") {
    m.vx = m.vy = 0;
    if (!hits(env, m, m.x, m.y - 3) || m.region !== m.home) {
      setState(m, "fly");
      return;
    }
    m.timer -= dt;
    if (m.timer <= 0) {
      setState(m, "fly");
      m.timer = 5 + Math.random() * 7;
      m.target = null;
    }
    return;
  }
  m.timer -= dt;
  if (!b) return;
  const top = (b.top + 1) * TEX + d.bh;
  const bottom = GROUND_ROWS * TEX - 2;
  // Bats head back to a ceiling to sleep; everything else keeps wandering.
  if (m.kind === "bat" && m.timer <= 0 && m.region === m.home && m.burning <= 0) {
    const ceilings = env.spots(m.region, "ceiling", 1);
    if (ceilings.length) {
      const c = ceilings.reduce((best, c) => (Math.hypot(c.x - m.x, c.y - m.y) < Math.hypot(best.x - m.x, best.y - m.y) ? c : best));
      const hangY = c.y + d.bh + 1;
      m.target = { x: c.x, y: hangY };
      if (Math.hypot(c.x - m.x, hangY - m.y) < 3) {
        m.x = c.x;
        m.y = hangY;
        setState(m, "hang");
        m.timer = 8 + Math.random() * 14;
        return;
      }
    } else m.timer = 4;
  }
  if (!m.target || Math.hypot(m.target.x - m.x, m.target.y - m.y) < 4 || (m.t > 6 && m.kind !== "bat")) {
    const air = env.spots(m.region, "air", 1);
    const near = air.filter((s) => Math.abs(s.x - m.x) < TEX * 7 && Math.abs(s.y - m.y) < TEX * 5);
    const s = near.length ? pick(near) : air.length ? pick(air) : { x: m.x, y: m.y };
    m.target = { x: s.x, y: Math.max(top, Math.min(bottom, s.y + d.bh / 2 + (m.kind === "fairy" ? (Math.random() - 0.5) * 8 : 0))) };
    m.t = 0;
  }
  const speed = d.speed * (m.burning > 0 || m.confused > 0 ? 1.8 : 1);
  const dx = m.target.x - m.x;
  const dy = m.target.y - m.y;
  const dist = Math.max(1, Math.hypot(dx, dy));
  const ax = (dx / dist) * speed;
  const ay = (dy / dist) * speed + Math.sin(m.anim * (m.kind === "bat" ? 9 : 3) + m.id) * (m.kind === "bat" ? 30 : 10);
  m.vx += (ax - m.vx) * Math.min(1, dt * 3);
  m.vy += (ay - m.vy) * Math.min(1, dt * 3);
  if (Math.abs(m.vx) > 2) m.dir = m.vx > 0 ? 1 : -1;
  const hit = move(env, m, dt);
  if (hit.wall || hit.landed || hit.ceiling) m.target = null;
  if (soak(env, m).kind === "lava") {
    m.vy = -120;
    m.burning = 2;
  }
  if (m.kind === "fairy" && Math.random() < dt * 4) env.effect("sparkle", m, FAIRY_COLOURS[m.colour]![0]);
}

// ---------------------------------------------------------------- pointer interaction

export function grab(m: Mob, env: Env) {
  m.talk = null;
  setState(m, "held");
  m.vx = m.vy = 0;
  m.spin = 0;
  m.burning = 0;
  say(m, pick(DEFS[m.kind].held), 1.8);
  env.sound(DEFS[m.kind].voice ?? "ui", m);
}

export function release(m: Mob, vx: number, vy: number) {
  const speed = Math.hypot(vx, vy);
  const max = 760;
  const k = speed > max ? max / speed : 1;
  m.vx = vx * k;
  m.vy = vy * k;
  m.onGround = false;
  setState(m, speed > 90 ? "thrown" : DEFS[m.kind].fly ? "fly" : "air");
  if (speed > 90 && DEFS[m.kind].fly) setState(m, "thrown");
  m.target = null;
  m.timer = 0.5;
}

/** A click or tap without dragging: a hop and a word. */
export function poke(m: Mob, env: Env) {
  if (m.kind === "me" && m.state === "sleep") {
    say(m, pick(["5 MORE MINUTES...", "ZZZ... HUH?", "LET ME SLEEP..."]), 2.6);
    env.sound("yawn", m);
    return;
  }
  if (m.kind === "me") say(m, env.night ? pick(["*YAWN* HI...", "IT'S LATE...", "HIRE ME TOMORROW?"]) : chat(m, ["HEHE, HI!", "THAT TICKLES!", "NEED SOMETHING?", "CHECK OUT MY PROJECTS!"], 0.45), 2.6);
  else say(m, chat(m, DEFS[m.kind].idle, 0.3), 2);
  env.sound(DEFS[m.kind].voice ?? "ui", m);
  if (m.state === "hang") {
    setState(m, "fly");
    m.timer = 6;
  } else if (!DEFS[m.kind].fly && m.onGround && m.state !== "sleep") m.vy = -150;
}

// ---------------------------------------------------------------- sprites

type Pen = { r: (x: number, y: number, w: number, h: number, c: string) => void; p: (x: number, y: number, c: string) => void };

function make(w: number, h: number, draw: (pen: Pen) => void): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  draw({
    r: (x, y, ww, hh, col) => {
      ctx.fillStyle = col;
      ctx.fillRect(x, y, ww, hh);
    },
    p: (x, y, col) => {
      ctx.fillStyle = col;
      ctx.fillRect(x, y, 1, 1);
    },
  });
  return c;
}

/** Eye styles shared by most creatures. */
type Look = "open" | "shut" | "wide";

function sheep(pose: string) {
  const W = "#efe9dc", w = "#d6cdb9", s = "#b5aa93", F = "#5b4a43", f = "#7d685e", L = "#4f4038", l = "#3a2e28", E = "#18121a", Wh = "#ffffff", N = "#d99c9c", M = "#3a1a1a";
  const step = pose.startsWith("walk") ? Number(pose[4]) : -1;
  const panic = pose.startsWith("held") || pose === "air" || pose === "fall";
  const hd = pose === "eat" ? 3 : 0;
  const look: Look = pose === "blink" || pose === "dizzy" ? "shut" : panic ? "wide" : "open";
  return make(16, 13, ({ r, p }) => {
    if (panic) {
      const k = pose === "held1" ? 1 : 0;
      r(1, 8 + k, 2, 2, l);
      r(10, 8 + k, 2, 2, l);
      r(2, 9, 2, 3 - k, L);
      r(11, 9, 2, 3 - k, L);
    } else {
      const back = step === 0 ? -1 : step === 2 ? 1 : 0;
      const front = -back;
      r(2 - back, 9, 2, 3, l);
      r(8 - front, 9, 2, 3, l);
      r(4 + back, 9, 2, 4, L);
      r(10 + front, 9, 2, 4, L);
    }
    r(1, 2, 12, 6, W);
    r(2, 1, 10, 1, W);
    r(0, 3, 1, 4, W);
    r(1, 8, 12, 1, s);
    r(1, 7, 12, 1, w);
    for (const [x, y] of [[3, 3], [6, 2], [9, 4], [4, 5], [8, 6], [11, 3], [2, 6]] as const) p(x, y, w);
    r(12, 3 + hd, 4, 5, F);
    r(12, 2 + hd, 3, 1, W);
    p(11, 3 + hd, W);
    p(11, 5 + hd, f);
    r(12, 6 + hd, 2, 1, f);
    if (look === "shut") r(13, 4 + hd, 2, 1, "#2a201c");
    else if (look === "wide") {
      r(13, 3 + hd, 2, 2, Wh);
      p(14, 4 + hd, E);
    } else {
      p(13, 4 + hd, Wh);
      p(14, 4 + hd, E);
    }
    p(15, 6 + hd, N);
    if (panic || pose === "talk") p(14, 7 + hd, M);
  });
}

function pig(pose: string) {
  const P = "#f2a8a3", pp = "#dd8c89", d = "#c0737a", S = "#f7c4bf", n = "#8c3d45", E = "#1a1218", hi = "#f9c8c3";
  const step = pose.startsWith("walk") ? Number(pose[4]) : -1;
  const panic = pose.startsWith("held") || pose === "air" || pose === "fall";
  const look: Look = pose === "blink" || pose === "dizzy" ? "shut" : panic ? "wide" : "open";
  return make(16, 12, ({ r, p }) => {
    if (panic) {
      const k = pose === "held1" ? 1 : 0;
      r(1, 7 + k, 2, 2, d);
      r(11, 7 + k, 2, 2, d);
      r(2, 8, 2, 3 - k, pp);
      r(12, 8, 2, 3 - k, pp);
    } else {
      const back = step === 0 ? -1 : step === 2 ? 1 : 0;
      r(3 - back, 8, 2, 3, d);
      r(9 + back, 8, 2, 3, d);
      r(4 + back, 8, 2, 4, pp);
      r(10 - back, 8, 2, 4, pp);
    }
    r(1, 3, 12, 5, P);
    r(2, 2, 10, 1, P);
    r(2, 2, 8, 1, hi);
    r(1, 7, 12, 1, pp);
    r(11, 1, 4, 6, P);
    r(11, 0, 2, 1, d);
    p(12, 1, d);
    r(14, 3, 2, 3, S);
    p(15, 4, n);
    p(0, 3, d);
    p(0, 2, d);
    p(1, 1, d);
    if (look === "shut") p(13, 2, d);
    else if (look === "wide") {
      r(12, 1, 2, 2, "#ffffff");
      p(13, 2, E);
    } else p(13, 2, E);
    if (panic) p(14, 6, n);
  });
}

function bat(pose: string) {
  const B = "#3b2b2e", b = "#5a4244", M = "#6d4f4f", m = "#4c3637", E = "#ffd166";
  if (pose.startsWith("hang")) {
    const awake = pose === "hang1";
    return make(13, 10, ({ r, p }) => {
      p(5, 0, b);
      p(7, 0, b);
      r(4, 1, 5, 6, B);
      r(3, 2, 1, 4, m);
      r(9, 2, 1, 4, m);
      r(4, 2, 5, 1, M);
      r(5, 7, 3, 2, B);
      p(5, 9, B);
      p(7, 9, B);
      if (awake) {
        p(5, 7, E);
        p(7, 7, E);
      }
    });
  }
  const wing = pose === "fly0" ? 0 : pose === "fly1" ? 1 : 2;
  return make(13, 10, ({ r, p }) => {
    if (wing === 0) {
      r(3, 3, 2, 2, M);
      r(1, 2, 2, 2, M);
      r(0, 1, 1, 2, m);
      r(8, 3, 2, 2, M);
      r(10, 2, 2, 2, M);
      r(12, 1, 1, 2, m);
    } else if (wing === 1) {
      r(1, 4, 4, 2, M);
      p(0, 5, m);
      r(8, 4, 4, 2, M);
      p(12, 5, m);
    } else {
      r(3, 5, 2, 2, M);
      r(1, 6, 2, 2, M);
      p(0, 8, m);
      r(8, 5, 2, 2, M);
      r(10, 6, 2, 2, M);
      p(12, 8, m);
    }
    r(5, 3, 3, 5, B);
    p(5, 2, B);
    p(7, 2, B);
    p(5, 4, E);
    p(7, 4, E);
    p(5, 8, b);
    p(7, 8, b);
  });
}

function slime(pose: string) {
  const O = "#2c7d2c", G = "rgba(98,210,76,0.9)", g = "rgba(64,170,54,0.95)", H = "#d4fbb4", E = "#10301a";
  const dims: Record<string, [number, number]> = { idle0: [12, 9], idle1: [12, 8], squash: [14, 7], stretch: [10, 12], air: [11, 10], held0: [10, 11], held1: [12, 9], blink: [12, 9], dizzy: [13, 8] };
  const [sw, sh] = dims[pose] ?? [12, 9];
  return make(14, 12, ({ r, p }) => {
    const x0 = 7 - sw / 2;
    const top = 12 - sh;
    for (let i = 0; i < sh; i++) {
      const inset = i === 0 ? 3 : i === 1 ? 1 : 0;
      const y = top + i;
      r(x0 + inset, y, sw - inset * 2, 1, i === 0 || i === sh - 1 ? O : G);
      p(x0 + inset, y, O);
      p(x0 + sw - inset - 1, y, O);
    }
    r(x0 + 3, top + Math.floor(sh / 2), sw - 6, Math.max(1, sh - Math.floor(sh / 2) - 2), g);
    p(x0 + 2, top + 1, H);
    p(x0 + 3, top + 1, H);
    p(x0 + 2, top + 2, H);
    const ey = top + Math.max(2, Math.floor(sh * 0.4));
    const ex = x0 + Math.floor(sw / 2);
    if (pose === "blink" || pose === "dizzy") {
      r(ex, ey, 2, 1, E);
      r(ex + 3, ey, 2, 1, E);
    } else if (pose.startsWith("held")) {
      r(ex, ey - 1, 1, 2, E);
      r(ex + 3, ey - 1, 1, 2, E);
      r(ex + 1, ey + 2, 2, 1, E);
    } else {
      p(ex + 1, ey, E);
      p(ex + 4, ey, E);
      p(ex + 2, ey + 2, E);
      p(ex + 3, ey + 2, E);
    }
  });
}

function fairy(pose: string, colour: number) {
  const [c, light] = FAIRY_COLOURS[colour]!;
  const C = `rgb(${c.join(",")})`;
  const Lc = `rgb(${light.join(",")})`;
  const W = "rgba(235,245,255,0.8)";
  return make(9, 9, ({ r, p }) => {
    if (pose === "fly0") {
      r(1, 1, 2, 3, W);
      r(6, 1, 2, 3, W);
    } else {
      r(0, 4, 3, 2, W);
      r(6, 4, 3, 2, W);
    }
    r(3, 3, 3, 3, C);
    p(4, 2, Lc);
    p(4, 6, Lc);
    p(2, 4, Lc);
    p(6, 4, Lc);
    p(4, 4, "#ffffff");
  });
}

function hog(pose: string) {
  const H = "#d3907e", h = "#b06f60", S = "#efb7a8", n = "#6a2f2a", ear = "#a85a55", hair = "#4a2a20", E = "#1a1012", tusk = "#f4ecd8";
  const T = "#4f7a5c", t = "#3b5c46", belt = "#5a3a20", buckle = "#d8b060", pants = "#4a3428", boots = "#2a1c16", mouth = "#5a1a1a";
  const step = pose.startsWith("walk") ? Number(pose[4]) : -1;
  const panic = pose.startsWith("held") || pose === "air" || pose === "fall";
  const talking = pose === "talk1";
  const look: Look = pose === "blink" || pose === "dizzy" ? "shut" : panic ? "wide" : "open";
  const bob = pose === "idle1" || step === 1 || step === 3 ? 1 : 0;
  return make(14, 24, ({ r, p }) => {
    // Legs and boots.
    const k = panic ? (pose === "held1" ? 1 : 0) : 0;
    const swing = step === 0 ? 1 : step === 2 ? -1 : 0;
    r(5 - swing, 18, 2, 4 - k, pants);
    r(7 + swing, 18, 2, 4 + k, pants);
    r(5 - swing, 22 - k, 2, 2, boots);
    r(7 + swing, 22, 3, 2, boots);
    // Far arm.
    if (panic) r(3, 4, 1, 7, h);
    else r(3 + swing, 10 + bob, 1, 5, h);
    // Body.
    r(4, 9 + bob, 6, 9 - bob, T);
    r(4, 17, 6, 1, t);
    r(5, 9 + bob, 4, 1, t);
    r(4, 14, 6, 1, belt);
    p(7, 14, buckle);
    // Head.
    const y0 = bob;
    r(3, 2 + y0, 8, 7, H);
    r(3, 8 + y0, 8, 1, h);
    r(4, 1 + y0, 5, 1, hair);
    p(5, y0, hair);
    p(6, y0, hair);
    p(3, 1 + y0, ear);
    p(2, y0, ear);
    p(9, 1 + y0, ear);
    p(10, y0, ear);
    r(10, 4 + y0, 3, 3, S);
    p(12, 5 + y0, n);
    p(10, 7 + y0, tusk);
    if (look === "shut") p(9, 3 + y0, h);
    else if (look === "wide") {
      r(8, 2 + y0, 2, 2, "#ffffff");
      p(9, 3 + y0, E);
    } else p(9, 3 + y0, E);
    p(8, 2 + y0, h);
    if (talking || panic) r(11, 7 + y0, 2, 1, mouth);
    // Near arm.
    if (panic) r(10, 2, 2, 8, H);
    else if (talking) {
      r(10, 9 + bob, 2, 2, H);
      r(11, 7 + bob, 2, 2, H);
    } else r(9 - swing, 10 + bob, 2, 5, H);
  });
}

function shade(pose: string) {
  const K = "#1b1327", k = "#120c1a", P = "#4f2c74", hp = "#6b3fa0", face = "#07040b";
  const step = pose.startsWith("walk") ? Number(pose[4]) : -1;
  const panic = pose.startsWith("held") || pose === "air" || pose === "fall";
  return make(12, 40, ({ r, p }) => {
    // Legs.
    const swing = step === 0 ? 1 : step === 2 ? -1 : 0;
    r(5, 32, 1, 6, k);
    r(7, 32, 1, 6, k);
    r(5 - swing, 37, 1, 3, k);
    r(7 + swing, 37, 1, 3, k);
    // Cloak, widening towards a ragged hem.
    for (let y = 10; y < 32; y++) {
      const hw = 2 + Math.floor(((y - 10) / 22) * 3);
      r(6 - hw, y, hw * 2, 1, K);
      p(6 - hw, y, P);
      p(6 + hw - 1, y, hp);
    }
    for (let x = 1; x < 11; x += 2) p(x, 32, K);
    // Hood with a dark face.
    r(3, 1, 6, 9, K);
    p(3, 0, K);
    p(4, 0, K);
    r(5, 3, 4, 5, face);
    p(3, 2, P);
    // Arms: long and thin.
    if (panic) {
      r(1, 1, 1, 12, k);
      r(10, 1, 1, 12, k);
    } else {
      r(2, 11, 1, 15, k);
      r(9, 11, 1, 16, k);
      r(9, 27, 2, 2, k);
    }
  });
}

/** Eyes of a shade, drawn unlit so they glow in the dark. */
export const SHADE_EYES: [number, number][] = [
  [6, 5],
  [8, 5],
];

function me(pose: string) {
  const hair = "#1b1719", skin = "#c98f6b", shade_ = "#a8714f", frame = "#2b2019", lens = "#dcefff", glint = "#ffffff", eye = "#5b3a28", lid = "#7a5038", mouth = "#8f4a3c";
  // A black shirt: the fabric a shade lighter than the hem, so it still reads as cloth.
  const Y = "#2d2a33", y = "#17151b", pants = "#3b3f58", shoes = "#25212e";
  const step = pose.startsWith("walk") ? Number(pose[4]) : -1;
  const up = pose.startsWith("held") || pose === "air" || pose === "fall" || pose === "jump";
  const shut = pose === "blink" || pose === "sleep" || pose === "dizzy";
  return make(12, 20, ({ r, p }) => {
    const swing = step === 0 ? 1 : step === 2 ? -1 : 0;
    // Legs and shoes.
    r(4 - swing, 15, 2, 4, pants);
    r(6 + swing, 15, 2, 4, pants);
    r(4 - swing, 19, 2, 1, shoes);
    r(6 + swing, 19, 3, 1, shoes);
    // Back arm.
    if (up) r(1, 6, 1, 5, shade_);
    else {
      r(2 + swing, 10, 1, 2, y);
      r(2 + swing, 12, 1, 2, shade_);
    }
    // Shirt, with the neck showing at the collar.
    r(3, 10, 6, 5, Y);
    r(3, 14, 6, 1, y);
    p(5, 10, shade_);
    p(6, 10, shade_);
    // Head: short black hair and big, clear glasses.
    r(2, 0, 8, 1, hair);
    r(1, 1, 10, 2, hair);
    r(2, 3, 8, 7, skin);
    p(1, 3, hair);
    p(1, 4, hair);
    p(10, 3, hair);
    p(1, 6, shade_);
    r(3, 9, 6, 1, shade_);
    // Two rounded frames with bright 2×2 lenses, so they read as glasses rather than a band across the eyes.
    for (const x of [2, 6]) {
      r(x + 1, 4, 2, 1, frame);
      r(x, 5, 1, 2, frame);
      r(x + 3, 5, 1, 2, frame);
      r(x + 1, 7, 2, 1, frame);
      r(x + 1, 5, 2, 2, lens);
      if (shut) r(x + 1, 6, 2, 1, lid);
      else {
        p(x + 1, 5, glint);
        p(x + 2, 6, eye);
      }
    }
    p(10, 7, shade_);
    if (pose === "yawn" || up) r(6, 8, 2, 2, mouth);
    else if (pose !== "sleep") r(6, 8, 3, 1, mouth);
    // Front arm: swinging, waving, or up in the air.
    if (up) r(10, 5, 1, 6, skin);
    else if (pose === "wave") {
      r(9, 10, 1, 1, Y);
      r(10, 6, 1, 4, skin);
      p(11, 5, skin);
    } else {
      r(9 - swing, 10, 1, 2, Y);
      r(9 - swing, 12, 1, 2, skin);
    }
  });
}

const cache = new Map<string, HTMLCanvasElement>();
function sprite(kind: Kind, pose: string, colour = 0): HTMLCanvasElement {
  const key = `${kind}|${pose}|${colour}`;
  let c = cache.get(key);
  if (!c) {
    c =
      kind === "sheep" ? sheep(pose)
      : kind === "pig" ? pig(pose)
      : kind === "bat" ? bat(pose)
      : kind === "slime" ? slime(pose)
      : kind === "fairy" ? fairy(pose, colour)
      : kind === "hog" ? hog(pose)
      : kind === "shade" ? shade(pose)
      : me(pose);
    cache.set(key, c);
  }
  return c;
}

export type Frame = { img: HTMLCanvasElement; flip: boolean; spin: number; alpha: number; lying: boolean; glow: RGB | null; centred: boolean };

/** The picture for a creature right now. */
export function frameOf(m: Mob): Frame {
  const a = m.anim;
  const walkPose = `walk${Math.floor(a * (m.kind === "shade" ? 3 : 8)) % 4}`;
  const blink = a % 4 < 0.15;
  const idle = blink ? "blink" : `idle${Math.floor(a * 1.5) % 2}`;
  let pose = idle;
  const held = m.state === "held";
  switch (m.state) {
    case "held":
      pose = `held${Math.floor(a * 8) % 2}`;
      break;
    case "walk":
      pose = m.onGround || m.water > 0 ? walkPose : "air";
      break;
    case "air":
    case "thrown":
      pose = m.vy < 0 && m.kind === "me" ? "jump" : "fall";
      break;
    case "dizzy":
      pose = "dizzy";
      break;
    case "talk":
      pose = m.bubble ? `talk${Math.floor(a * 6) % 2}` : idle;
      break;
    case "sleep":
      pose = "sleep";
      break;
    default:
      pose = idle;
  }
  if (m.burning > 0 && m.onGround) pose = walkPose;
  if (m.state === "idle" && !m.onGround && m.water === 0) pose = m.vy < 0 && m.kind === "me" ? "jump" : "fall";
  if (m.kind === "sheep" && m.state === "idle" && !blink && Math.floor(a / 3) % 3 === 2) pose = "eat";
  if (m.kind === "me" && m.state === "idle" && Math.floor(a / 2.5) % 4 === 3) pose = "wave";
  if (m.kind === "slime") {
    pose = held ? `held${Math.floor(a * 8) % 2}` : m.state === "hop" && m.onGround && m.t < 0.3 ? "squash" : !m.onGround ? (m.vy < 0 ? "stretch" : "air") : m.state === "dizzy" ? "dizzy" : idle;
  }
  if (m.kind === "bat") pose = m.state === "hang" ? (Math.floor(a / 3) % 4 === 3 ? "hang1" : "hang0") : `fly${Math.floor(a * 14) % 3}`;
  if (m.kind === "fairy") pose = `fly${Math.floor(a * 12) % 2}`;
  const img = sprite(m.kind, pose, m.colour);
  return {
    img,
    flip: m.kind === "bat" ? false : m.dir < 0,
    spin: m.state === "thrown" ? m.spin : 0,
    alpha: m.fade,
    lying: m.kind === "me" && m.state === "sleep",
    glow: m.kind === "fairy" ? FAIRY_COLOURS[m.colour]![0] : null,
    centred: DEFS[m.kind].fly,
  };
}

/** Whether anything needs frames even while ambient animation is paused. */
export function moving(m: Mob) {
  if (m.state === "held" || m.state === "thrown" || m.state === "teleport") return true;
  // Falling through the air (not bobbing in water or hopping out of lava): finish the fall.
  return !DEFS[m.kind].fly && !m.onGround && m.water === 0 && m.burning <= 0;
}

// ---------------------------------------------------------------- speech bubbles

/** A 3×5 pixel font (5×5 for the heart), drawn at texel scale like everything else. */
const FONT: Record<string, string[]> = {
  A: [".#.", "#.#", "###", "#.#", "#.#"], B: ["##.", "#.#", "##.", "#.#", "##."], C: [".##", "#..", "#..", "#..", ".##"],
  D: ["##.", "#.#", "#.#", "#.#", "##."], E: ["###", "#..", "##.", "#..", "###"], F: ["###", "#..", "##.", "#..", "#.."],
  G: [".##", "#..", "#.#", "#.#", ".##"], H: ["#.#", "#.#", "###", "#.#", "#.#"], I: ["###", ".#.", ".#.", ".#.", "###"],
  J: ["..#", "..#", "..#", "#.#", ".#."], K: ["#.#", "#.#", "##.", "#.#", "#.#"], L: ["#..", "#..", "#..", "#..", "###"],
  M: ["#.#", "###", "###", "#.#", "#.#"], N: ["##.", "#.#", "#.#", "#.#", "#.#"], O: [".#.", "#.#", "#.#", "#.#", ".#."],
  P: ["##.", "#.#", "##.", "#..", "#.."], Q: [".#.", "#.#", "#.#", "##.", ".##"], R: ["##.", "#.#", "##.", "#.#", "#.#"],
  S: [".##", "#..", ".#.", "..#", "##."], T: ["###", ".#.", ".#.", ".#.", ".#."], U: ["#.#", "#.#", "#.#", "#.#", "###"],
  V: ["#.#", "#.#", "#.#", "#.#", ".#."], W: ["#.#", "#.#", "###", "###", "#.#"], X: ["#.#", "#.#", ".#.", "#.#", "#.#"],
  Y: ["#.#", "#.#", ".#.", ".#.", ".#."], Z: ["###", "..#", ".#.", "#..", "###"],
  "0": ["###", "#.#", "#.#", "#.#", "###"], "1": [".#.", "##.", ".#.", ".#.", "###"], "2": ["##.", "..#", ".#.", "#..", "###"],
  "3": ["##.", "..#", ".#.", "..#", "##."], "4": ["#.#", "#.#", "###", "..#", "..#"], "5": ["###", "#..", "##.", "..#", "##."],
  "6": [".##", "#..", "###", "#.#", "###"], "7": ["###", "..#", ".#.", ".#.", ".#."], "8": ["###", "#.#", "###", "#.#", "###"],
  "9": ["###", "#.#", "###", "..#", "##."],
  "!": [".#.", ".#.", ".#.", "...", ".#."], "?": ["##.", "..#", ".#.", "...", ".#."], ".": ["...", "...", "...", "...", ".#."],
  ",": ["...", "...", "...", ".#.", "#.."], "'": [".#.", ".#.", "...", "...", "..."], "-": ["...", "...", "###", "...", "..."],
  ":": ["...", ".#.", "...", ".#.", "..."], "*": ["#.#", ".#.", "#.#", "...", "..."], "(": [".#.", "#..", "#..", "#..", ".#."],
  ")": [".#.", "..#", "..#", "..#", ".#."], "@": ["###", "#.#", "###", "#..", "###"], _: ["...", "...", "...", "...", "###"],
  "/": ["..#", "..#", ".#.", "#..", "#.."], "✦": [".#.", "###", ".#.", "...", "..."], "♪": [".##", ".#.", ".#.", "##.", "##."],
  "♥": [".#.#.", "#####", "#####", ".###.", "..#.."],
};
const GLYPHS: Record<string, string> = Object.fromEntries(Object.entries(FONT).map(([k, rows]) => [k, rows.join("")]));

function glyphWidth(ch: string) {
  return ch === " " ? 2 : ch === "♥" ? 5 : 3;
}

function wrap(text: string, max: number): string[] {
  const words = text.toUpperCase().split(" ");
  const lines: string[] = [];
  let line = "";
  const width = (s: string) => [...s].reduce((n, ch) => n + glyphWidth(ch) + 1, -1);
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && width(next) > max) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

const bubbles = new Map<string, HTMLCanvasElement>();

/** A bubble's picture is drawn once per line of text and reused every frame. */
function bubbleImage(text: string): HTMLCanvasElement {
  let c = bubbles.get(text);
  if (c) return c;
  const lines = wrap(text, 64);
  const widths = lines.map((l) => [...l].reduce((n, ch) => n + glyphWidth(ch) + 1, -1));
  const w = Math.max(...widths) + 6;
  const h = lines.length * 7 + 4;
  c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#1a1622";
  ctx.fillRect(1, 0, w - 2, h);
  ctx.fillRect(0, 1, w, h - 2);
  ctx.fillStyle = "#fffdf5";
  ctx.fillRect(1, 1, w - 2, h - 2);
  ctx.fillStyle = "#e7e1d2";
  ctx.fillRect(1, h - 2, w - 2, 1);
  ctx.fillStyle = "#1a1622";
  lines.forEach((line, i) => {
    let cx = 3 + Math.floor((w - 6 - widths[i]!) / 2);
    const cy = 2 + i * 7;
    for (const ch of line) {
      const g = GLYPHS[ch];
      const gw = glyphWidth(ch);
      if (g) {
        ctx.fillStyle = ch === "♥" ? "#d8344a" : "#1a1622";
        for (let k = 0; k < g.length; k++) if (g[k] === "#") ctx.fillRect(cx + (k % gw), cy + Math.floor(k / gw), 1, 1);
      }
      cx += gw + 1;
    }
  });
  if (bubbles.size > 80) bubbles.clear();
  bubbles.set(text, c);
  return c;
}

/** Draws a speech bubble whose tail points at (x, y). Clamped to the canvas width. */
export function drawBubble(ctx: CanvasRenderingContext2D, bubble: Bubble, x: number, y: number, canvasWidth: number) {
  const img = bubbleImage(bubble.text);
  const w = img.width;
  const h = img.height;
  // Pop in, float up a touch, and fade at the end.
  const grow = Math.min(1, bubble.age / 0.12);
  const fade = Math.min(1, (bubble.life - bubble.age) / 0.3);
  const left = Math.round(Math.max(1, Math.min(canvasWidth - w - 1, x - Math.min(w / 2, 6))));
  const top = Math.round(y - h - 4 - (1 - grow) * 3);
  ctx.save();
  ctx.globalAlpha = Math.max(0, fade);
  ctx.drawImage(img, left, top);
  // The tail.
  const tx = Math.round(Math.max(left + 2, Math.min(left + w - 4, x - 1)));
  ctx.fillStyle = "#1a1622";
  ctx.fillRect(tx, top + h, 3, 1);
  ctx.fillRect(tx, top + h + 1, 2, 1);
  ctx.fillRect(tx, top + h + 2, 1, 1);
  ctx.fillStyle = "#fffdf5";
  ctx.fillRect(tx + 1, top + h - 1, 1, 1);
  ctx.fillRect(tx + 1, top + h, 1, 1);
  ctx.restore();
}
