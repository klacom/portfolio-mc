import { hex, mix, type RGB } from "./textures";

/**
 * Time of day as the sun's angle around the sky: 70° is mid-morning, 0° is sunset on the right,
 * -110° is night (the moon, opposite the sun, is then high). Each toggle turns the sky 180°,
 * in fixed ticks so it changes frame by frame, like a fast-forwarded day.
 */
export const DAY_PHI = 70;
export const TICK_MS = 50;
export const STEP_DEG = 18; // 10 ticks × 50 ms = half a second per sunset or sunrise

export class SkyClock {
  phi = DAY_PHI;
  private target = DAY_PHI;
  private acc = 0;

  get night() {
    return Math.round((DAY_PHI - this.target) / 180) % 2 === 1;
  }

  get moving() {
    return this.phi !== this.target;
  }

  /** Jump straight to a time of day (used on load). */
  set(night: boolean) {
    this.phi = this.target = night ? DAY_PHI - 180 : DAY_PHI;
  }

  toggle(night: boolean) {
    if (night === this.night) return;
    this.target -= 180;
  }

  /** Advances by whole ticks. Returns true when the sky changed. */
  step(dtMs: number): boolean {
    if (this.phi <= this.target) {
      this.acc = 0;
      return false;
    }
    this.acc += dtMs;
    let changed = false;
    while (this.acc >= TICK_MS && this.phi > this.target) {
      this.phi = Math.max(this.target, this.phi - STEP_DEG);
      this.acc -= TICK_MS;
      changed = true;
    }
    return changed;
  }
}

const rad = (d: number) => (d * Math.PI) / 180;
const smooth = (a: number, b: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const DAY = { top: hex("#3f97e0"), mid: hex("#7cc0ef"), low: hex("#d4eef9") };
const DUSK = { top: hex("#4a5aa8"), mid: hex("#e08a72"), low: hex("#ffc27a") };
const NIGHT = { top: hex("#070b26"), mid: hex("#111a40"), low: hex("#22325c") };

export type SkyState = {
  /** Sun elevation, -1..1. */
  e: number;
  /** Sun direction, -1 (left) .. 1 (right). */
  sx: number;
  day: number;
  dusk: number;
  top: RGB;
  mid: RGB;
  low: RGB;
  /** Sky light strength used by the lighting. */
  daylight: number;
  /** Colour wash over the world at sunset and night. */
  tint: RGB;
  tintAlpha: number;
};

export function skyState(phi: number): SkyState {
  const e = Math.sin(rad(phi));
  const sx = Math.cos(rad(phi));
  const day = smooth(-0.16, 0.34, e);
  const dusk = Math.max(0, Math.min(1, 1 - Math.abs(e + 0.03) / 0.33));
  const pick = (k: "top" | "mid" | "low", w: number) => mix(mix(NIGHT[k], DAY[k], day), DUSK[k], dusk * w);
  const night = 1 - day;
  return {
    e,
    sx,
    day,
    dusk,
    top: pick("top", 0.45),
    mid: pick("mid", 0.75),
    low: pick("low", 0.9),
    daylight: 0.24 + 0.76 * smooth(-0.18, 0.3, e),
    tint: mix(mix([255, 255, 255], [255, 190, 140], dusk), [150, 168, 255], night),
    tintAlpha: 0.24 * Math.max(dusk, night * 0.8),
  };
}

export const skyLuminance = (s: SkyState) => (0.299 * s.mid[0] + 0.587 * s.mid[1] + 0.114 * s.mid[2]) / 255;
