import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SOUND_KINDS, SOUNDS } from "./sound";

const DIR = join(process.cwd(), "public", "sounds");

/** Reads a WAV file's format chunk: sample rate, bit depth and channel count. */
function wavFormat(file: string) {
  const b = readFileSync(file);
  expect(b.toString("ascii", 0, 4)).toBe("RIFF");
  expect(b.toString("ascii", 8, 12)).toBe("WAVE");
  let at = 12;
  while (at < b.length - 8) {
    const id = b.toString("ascii", at, at + 4);
    const size = b.readUInt32LE(at + 4);
    if (id === "fmt ") return { channels: b.readUInt16LE(at + 10), rate: b.readUInt32LE(at + 12), bits: b.readUInt16LE(at + 22) };
    at += 8 + size + (size % 2);
  }
  throw new Error(`no fmt chunk in ${file}`);
}

describe("sound files", () => {
  it("cover every sound the site plays, and nothing else", () => {
    expect(Object.keys(SOUNDS).sort()).toEqual([...SOUND_KINDS].sort());
  });

  it("each have a WAV master and an Opus copy", () => {
    for (const kind of SOUND_KINDS) {
      expect(SOUNDS[kind].files.length).toBeGreaterThan(0);
      for (const name of SOUNDS[kind].files) {
        expect(existsSync(join(DIR, `${name}.wav`)), `${name}.wav`).toBe(true);
        expect(existsSync(join(DIR, `${name}.ogg`)), `${name}.ogg`).toBe(true);
      }
    }
  });

  it("are 44.1 kHz, 16-bit stereo WAVs", () => {
    for (const kind of SOUND_KINDS) {
      for (const name of SOUNDS[kind].files) expect(wavFormat(join(DIR, `${name}.wav`))).toEqual({ channels: 2, rate: 44100, bits: 16 });
    }
  });

  it("have mix gains that only turn sounds down", () => {
    for (const kind of SOUND_KINDS) {
      expect(SOUNDS[kind].gain).toBeGreaterThan(0);
      expect(SOUNDS[kind].gain).toBeLessThanOrEqual(1);
    }
  });
});
