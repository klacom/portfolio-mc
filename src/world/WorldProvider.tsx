"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { BLOCKS, DEFAULT_HOTBAR, isBlockId, LAYER_NAME, type BlockId, type Layer } from "./blocks";
import { playSound, preloadSounds, type Placement, type SoundKind } from "./sound";
import { cellKey, readStorage, writeStorage, WorldState, type ActionResult, type CellRef, type ProjectBuild } from "./state";

const PREFS_KEY = "tile-world-prefs";
/** While developing, build mode saves into the project so the build ships with the next deploy. */
export const AUTHORING = process.env.NODE_ENV === "development";
export type ProjectSave = "idle" | "saving" | "saved" | "error";

type Message = { id: number; text: string; tone: "info" | "alert" };
export type TouchTool = "place" | "break";

type WorldContextValue = {
  world: WorldState;
  buildMode: boolean;
  setBuildMode: (on: boolean) => void;
  layer: Layer;
  setLayer: (layer: Layer) => void;
  hotbar: BlockId[];
  slot: number;
  setSlot: (slot: number) => void;
  assignSlot: (block: BlockId) => void;
  block: BlockId;
  touchTool: TouchTool;
  setTouchTool: (tool: TouchTool) => void;
  paintDrag: boolean;
  setPaintDrag: (on: boolean) => void;
  sound: boolean;
  setSound: (on: boolean) => void;
  motion: boolean;
  setMotion: (on: boolean) => void;
  night: boolean;
  setNight: (on: boolean) => void;
  canUndo: boolean;
  storageAvailable: boolean;
  projectSave: ProjectSave;
  /** Clears visitor edits; while authoring, also clears the build saved in the project. */
  resetWorld: () => void;
  message: Message | null;
  say: (text: string, tone?: Message["tone"]) => void;
  cue: (kind: SoundKind, at?: Placement) => void;
};

const WorldContext = createContext<WorldContextValue | null>(null);

export function useWorld() {
  const ctx = useContext(WorldContext);
  if (!ctx) throw new Error("useWorld must be used inside <WorldProvider>");
  return ctx;
}

type Prefs = { hotbar?: BlockId[]; slot?: number; layer?: Layer; sound?: boolean; motion?: boolean; night?: boolean };

function readPrefs(): Prefs {
  try {
    const raw = JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? "{}") as Record<string, unknown>;
    const hotbar = Array.isArray(raw.hotbar) && raw.hotbar.length === 9 && raw.hotbar.every(isBlockId) ? (raw.hotbar as BlockId[]) : undefined;
    return {
      hotbar,
      slot: typeof raw.slot === "number" && raw.slot >= 0 && raw.slot < 9 ? raw.slot : undefined,
      layer: raw.layer === "b" || raw.layer === "m" || raw.layer === "f" ? raw.layer : undefined,
      sound: typeof raw.sound === "boolean" ? raw.sound : undefined,
      motion: typeof raw.motion === "boolean" ? raw.motion : undefined,
      night: typeof raw.night === "boolean" ? raw.night : undefined,
    };
  } catch {
    return {};
  }
}

function savePrefs(patch: Prefs) {
  try {
    const current = JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? "{}") as Record<string, unknown>;
    window.localStorage.setItem(PREFS_KEY, JSON.stringify({ ...current, ...patch }));
  } catch {
    // Preferences are a convenience; ignore storage failures.
  }
}

export function describeResult(result: ActionResult): string {
  switch (result.kind) {
    case "placed":
      return `Placed ${BLOCKS[result.block].name.toLowerCase()} in the ${LAYER_NAME[result.layer].toLowerCase()} layer.`;
    case "broke":
      return `Broke ${BLOCKS[result.block].name.toLowerCase()} from the ${LAYER_NAME[result.layer].toLowerCase()} layer.`;
    case "taken":
      return `The ${LAYER_NAME[result.layer].toLowerCase()} layer is taken here. Break it first or switch layers.`;
    case "empty":
      return "Nothing to break here.";
    case "limit":
      return "You've reached the edit limit. Reset the world to keep building.";
    case "out-of-bounds":
      return "That spot is outside the world.";
  }
}

export function WorldProvider({ build, children }: { build: ProjectBuild; children: ReactNode }) {
  const [world] = useState(() => {
    const w = new WorldState();
    w.setBase(build);
    return w;
  });
  const [projectSave, setProjectSave] = useState<ProjectSave>("idle");
  const dirty = useRef(new Map<string, CellRef>());
  const projectTimer = useRef<number | undefined>(undefined);
  const [buildMode, setBuildMode] = useState(false);
  const [layer, setLayerState] = useState<Layer>("m");
  const [hotbar, setHotbar] = useState<BlockId[]>([...DEFAULT_HOTBAR]);
  const [slot, setSlotState] = useState(0);
  const [touchTool, setTouchTool] = useState<TouchTool>("place");
  const [paintDrag, setPaintDrag] = useState(false);
  const [sound, setSoundState] = useState(false);
  const [motion, setMotionState] = useState(true);
  const [night, setNightState] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [message, setMessage] = useState<Message | null>(null);
  const counter = useRef(0);
  const saveTimer = useRef<number | undefined>(undefined);

  const canUndo = useSyncExternalStore(
    useCallback((cb) => world.subscribe(cb), [world]),
    () => world.canUndo,
    () => false,
  );

  const say = useCallback((text: string, tone: Message["tone"] = "info") => {
    counter.current += 1;
    setMessage({ id: counter.current, text, tone });
  }, []);

  // Restore saved edits and preferences once, after hydration. Browser storage is an external
  // system the server render can't see, so syncing it into state here is intentional.
  useEffect(() => {
    const stored = readStorage();
    if (!stored.ok) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from localStorage after hydration
      setStorageAvailable(false);
    } else {
      const result = world.loadStored(stored.raw);
      if (result.status === "version-reset") {
        writeStorage(world);
        say("The world was redesigned, so your earlier edits were cleared.");
      } else if (result.status === "invalid") writeStorage(world);
    }
    const prefs = readPrefs();
    if (prefs.hotbar) setHotbar(prefs.hotbar);
    if (prefs.slot !== undefined) setSlotState(prefs.slot);
    if (prefs.layer) setLayerState(prefs.layer);
    if (prefs.sound !== undefined) setSoundState(prefs.sound);
    if (prefs.night !== undefined) setNightState(prefs.night);
    // The world's small ambient animations (water, flames, stars) play by default; the header's
    // pause button stops them and is remembered.
    if (prefs.motion !== undefined) setMotionState(prefs.motion);
  }, [world, say]);

  useEffect(() => {
    return world.subscribe(() => {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        if (!writeStorage(world)) setStorageAvailable(false);
      }, 200);
    });
  }, [world]);

  // Authoring: every edit is merged into src/content/world-build.json shortly after it happens.
  const sendToProject = useCallback(
    async (body: { cells?: unknown[]; reset?: boolean }) => {
      setProjectSave("saving");
      try {
        const res = await fetch("/api/world-build", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...body, tops: world.topRows }),
        });
        if (!res.ok) throw new Error(String(res.status));
        setProjectSave("saved");
        return true;
      } catch {
        setProjectSave("error");
        return false;
      }
    },
    [world],
  );

  useEffect(() => {
    if (!AUTHORING) return;
    const flush = () => {
      if (!dirty.current.size) return;
      const refs = [...dirty.current.values()];
      dirty.current.clear();
      void sendToProject({ cells: world.tuples(refs) }).then((ok) => {
        if (!ok) for (const ref of refs) dirty.current.set(cellKey(ref), ref);
      });
    };
    // Edits restored from this browser's storage are sent once, so an earlier build isn't lost.
    const initial = world.toStored().cells;
    if (initial.length) {
      projectTimer.current = window.setTimeout(() => void sendToProject({ cells: world.tuples(initial.map(([region, x, y]) => ({ region, x, y }) as CellRef)) }), 1500);
    }
    const unsubscribe = world.subscribe((ref) => {
      if (!ref) return;
      dirty.current.set(cellKey(ref), ref);
      window.clearTimeout(projectTimer.current);
      projectTimer.current = window.setTimeout(flush, 600);
    });
    return () => {
      unsubscribe();
      window.clearTimeout(projectTimer.current);
    };
  }, [world, sendToProject]);

  const resetWorld = useCallback(() => {
    window.clearTimeout(projectTimer.current);
    dirty.current.clear();
    world.reset(AUTHORING);
    if (AUTHORING) void sendToProject({ reset: true });
  }, [world, sendToProject]);

  const setLayer = useCallback((l: Layer) => {
    setLayerState(l);
    savePrefs({ layer: l });
  }, []);
  const setSlot = useCallback((s: number) => {
    setSlotState(s);
    savePrefs({ slot: s });
  }, []);
  const assignSlot = useCallback(
    (block: BlockId) => {
      setHotbar((bar) => {
        const next = [...bar];
        next[slot] = block;
        savePrefs({ hotbar: next });
        return next;
      });
    },
    [slot],
  );
  const setSound = useCallback((on: boolean) => {
    setSoundState(on);
    savePrefs({ sound: on });
    // The sounds download only now; the toggle's own click plays once they're ready.
    if (on) void preloadSounds().then(() => playSound("ui"));
  }, []);

  // With sound remembered as on, download the sounds at the visitor's first click or key press (browsers only
  // allow audio after one), so they're ready before the first block or creature needs them.
  useEffect(() => {
    if (!sound) return;
    const ready = () => void preloadSounds();
    window.addEventListener("pointerdown", ready, { once: true });
    window.addEventListener("keydown", ready, { once: true });
    return () => {
      window.removeEventListener("pointerdown", ready);
      window.removeEventListener("keydown", ready);
    };
  }, [sound]);
  const setMotion = useCallback((on: boolean) => {
    setMotionState(on);
    savePrefs({ motion: on });
  }, []);
  const setNight = useCallback((on: boolean) => {
    setNightState(on);
    savePrefs({ night: on });
  }, []);
  const cue = useCallback(
    (kind: SoundKind, at?: Placement) => {
      if (sound) playSound(kind, at);
    },
    [sound],
  );

  useEffect(() => {
    document.documentElement.classList.toggle("is-building", buildMode);
  }, [buildMode]);

  const block = hotbar[slot] ?? "grass";

  const value = useMemo<WorldContextValue>(
    () => ({
      world, buildMode, setBuildMode, layer, setLayer, hotbar, slot, setSlot, assignSlot, block, touchTool, setTouchTool, paintDrag, setPaintDrag,
      sound, setSound, motion, setMotion, night, setNight, canUndo, storageAvailable, projectSave, resetWorld, message, say, cue,
    }),
    [world, buildMode, layer, setLayer, hotbar, slot, setSlot, assignSlot, block, touchTool, paintDrag, sound, setSound, motion, setMotion, night, setNight, canUndo, storageAvailable, projectSave, resetWorld, message, say, cue],
  );

  return <WorldContext.Provider value={value}>{children}</WorldContext.Provider>;
}
