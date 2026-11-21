import manifest from "./sound-manifest.json";

/**
 * The site's sound effects. They're designed offline by tools/sounds/make_sounds.py (layered synthesis, mastered
 * with pedalboard) and served from /sounds. Nothing is downloaded until the visitor turns sound on.
 */
export const SOUND_KINDS = [
  "place", "break", "deny", "ui",
  "baa", "oink", "grunt", "squeal", "squeak", "blub", "chime", "murmur", "warp", "hey", "yawn", "sizzle", "splash", "thud",
] as const;
export type SoundKind = (typeof SOUND_KINDS)[number];

/** How loud a sound is (0 to 1) and where it sits between the left (-1) and right (1) speakers. */
export type Placement = { volume: number; pan: number };

/**
 * Volume and pan for a sound coming from (dx, dy) away from the middle of the screen, measured against half
 * the screen's width and height. Full volume near the middle, fading toward the edges, and silent (null)
 * once the source is about half a screen beyond the edge.
 */
export function soundPlacement(dx: number, dy: number, halfW: number, halfH: number): Placement | null {
  const far = Math.hypot(dx / Math.max(1, halfW), dy / Math.max(1, halfH));
  const volume = far <= 0.5 ? 1 : 1 - (far - 0.5) / 1.5;
  if (volume < 0.05) return null;
  return { volume: Math.min(1, volume), pan: Math.max(-1, Math.min(1, dx / Math.max(1, halfW))) * 0.7 };
}

/** Each sound's files (names without extension) and the gain that evens out how loud they feel. */
export type SoundEntry = { files: string[]; gain: number };
export const SOUNDS = manifest as Record<SoundKind, SoundEntry>;

/** How far each play may drift in pitch, as a playback-rate ratio, so repeats never sound identical. */
const DRIFT: Record<SoundKind, number> = {
  place: 0.05, break: 0.05, deny: 0.015, ui: 0.01,
  baa: 0.07, oink: 0.07, grunt: 0.08, squeal: 0.06, squeak: 0.08, blub: 0.08, chime: 0.02, murmur: 0.06, warp: 0.05,
  hey: 0.04, yawn: 0.03,
  sizzle: 0.06, splash: 0.06, thud: 0.06,
};

/** At most this many copies of one sound at once, so painting a row of blocks doesn't pile up into a roar. */
const MAX_VOICES = 4;

let ctx: AudioContext | null = null;
let bus: AudioNode | null = null;
let ext: ".ogg" | ".wav" | null = null;
const buffers = new Map<string, AudioBuffer>();
const loading = new Map<string, Promise<AudioBuffer | null>>();
const playing = new Map<SoundKind, number>();
const lastFile = new Map<SoundKind, number>();

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      ctx = new AudioContext();
      // A gentle limiter on the way out, so several sounds at once never clip.
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -6;
      limiter.knee.value = 6;
      limiter.ratio.value = 8;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.15;
      limiter.connect(ctx.destination);
      bus = limiter;
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Opus where the browser can play it (about a tenth of the size), WAV everywhere else. */
function extension() {
  if (!ext) {
    let opus = "";
    try {
      opus = new Audio().canPlayType('audio/ogg; codecs="opus"');
    } catch {
      opus = "";
    }
    ext = opus ? ".ogg" : ".wav";
  }
  return ext;
}

function load(ac: AudioContext, name: string): Promise<AudioBuffer | null> {
  let pending = loading.get(name);
  if (!pending) {
    pending = fetch(`/sounds/${name}${extension()}`)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.arrayBuffer();
      })
      .then((data) => ac.decodeAudioData(data))
      .then((buffer) => {
        buffers.set(name, buffer);
        return buffer;
      })
      .catch(() => {
        loading.delete(name);
        // A browser that said it plays Opus but can't decode it gets the WAVs from now on.
        if (ext === ".ogg") {
          ext = ".wav";
          return load(ac, name);
        }
        return null; // try again next time
      });
    loading.set(name, pending);
  }
  return pending;
}

/** Downloads and decodes every sound. Called when sound is turned on, so the first sounds play on time. */
export function preloadSounds(): Promise<void> {
  const ac = audio();
  if (!ac) return Promise.resolve();
  return Promise.all(Object.values(SOUNDS).flatMap((s) => s.files.map((f) => load(ac, f)))).then(() => undefined);
}

/** Plays a sound. With a placement, it's quieter and panned toward where its source is on (or off) the screen. */
export function playSound(kind: SoundKind, at?: Placement) {
  const ac = audio();
  const entry = SOUNDS[kind];
  if (!ac || !bus || !entry?.files.length) return;
  // Variations take turns at random, never the same one twice in a row.
  const n = entry.files.length;
  let i = Math.floor(Math.random() * n);
  if (n > 1 && i === lastFile.get(kind)) i = (i + 1) % n;
  lastFile.set(kind, i);
  const buffer = buffers.get(entry.files[i]!);
  if (!buffer) {
    void preloadSounds(); // still downloading: this one is skipped, the next will play
    return;
  }
  const voices = playing.get(kind) ?? 0;
  if (voices >= MAX_VOICES) return;

  const src = ac.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = 1 + (Math.random() * 2 - 1) * DRIFT[kind];
  const gain = ac.createGain();
  gain.gain.value = entry.gain * Math.max(0, Math.min(1, at?.volume ?? 1));
  src.connect(gain);
  let pan: StereoPannerNode | null = null;
  if (at && at.pan !== 0 && typeof ac.createStereoPanner === "function") {
    pan = ac.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, at.pan));
    gain.connect(pan).connect(bus);
  } else gain.connect(bus);

  playing.set(kind, voices + 1);
  src.onended = () => {
    playing.set(kind, Math.max(0, (playing.get(kind) ?? 1) - 1));
    src.disconnect();
    gain.disconnect();
    pan?.disconnect();
  };
  src.start();
}
