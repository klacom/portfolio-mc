"use client";

import { useCallback, useEffect, useRef, type FocusEvent, type KeyboardEvent, type PointerEvent } from "react";
import { BLOCKS, LAYER_NAME, type Layer } from "./blocks";
import type { Cell } from "./cell";
import { GROUND_ROWS, type RegionId } from "./regions";
import { WorldEngine } from "./renderer";
import type { CellRef } from "./state";
import { describeResult, useWorld } from "./WorldProvider";
import styles from "./world.module.css";

const REGION_LABEL: Record<RegionId, string> = {
  intro: "Overworld", projects: "Cave", skills: "Crystal cavern", about: "Inferno", contact: "The void",
  ecopin: "City park", plooy: "Asteroids", tanggolin: "Purple grove", casestudy: "City park",
};

function describeCell(cell: Cell): string {
  const parts = (["f", "m", "b"] as Layer[]).filter((l) => cell[l]).map((l) => `${BLOCKS[cell[l]!].name.toLowerCase()} in the ${LAYER_NAME[l].toLowerCase()}`);
  return parts.length ? parts.join(", ") : "empty";
}

const describeRow = (y: number) => (y === 0 ? "ground level" : y < 0 ? `${-y} above ground` : `${y} below ground`);

type Drag = { pointer: number; action: "place" | "break"; last: string };
type Press = { pointer: number; x: number; y: number; ref: CellRef; done: boolean; timer: number };
/** A press on a creature: a quick click pokes it; holding or dragging picks it up. */
type MobPress = { pointer: number; id: number; x: number; y: number; grabbed: boolean; timer: number };

/** The world's two canvases (behind and in front of the page text) and all build input. */
export function WorldCanvas() {
  const { world, buildMode, setBuildMode, layer, setLayer, block, hotbar, setSlot, touchTool, paintDrag, motion, night, say, cue } = useWorld();
  const backRef = useRef<HTMLCanvasElement>(null);
  const frontRef = useRef<HTMLCanvasElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<WorldEngine | null>(null);
  const drag = useRef<Drag | null>(null);
  const press = useRef<Press | null>(null);
  const lastMouse = useRef<{ x: number; y: number } | null>(null);
  const mobPress = useRef<MobPress | null>(null);
  const pointerAt = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const edgeScroll = useRef(0);
  const cueRef = useRef(cue);
  const initial = useRef({ opts: { buildMode, layer, block, motion }, night });

  useEffect(() => {
    cueRef.current = cue;
  }, [cue]);

  // The contact form announces a sent message with the name the visitor typed; nearby creatures shout them out.
  useEffect(() => {
    const onVisitor = (e: Event) => {
      const name = (e as CustomEvent<{ name?: unknown }>).detail?.name;
      if (typeof name === "string") engineRef.current?.greet(name);
    };
    window.addEventListener("world:visitor", onVisitor);
    return () => window.removeEventListener("world:visitor", onVisitor);
  }, []);

  useEffect(() => {
    const back = backRef.current;
    const front = frontRef.current;
    if (!back || !front) return;
    const engine = new WorldEngine(back, front, world, initial.current.opts, initial.current.night);
    engineRef.current = engine;
    engine.onSound = (kind, at) => cueRef.current(kind, at);
    // Read-only hook for the browser tests: where the creatures are.
    (back as HTMLCanvasElement & { __world?: unknown }).__world = { mobs: () => engine.debugMobs() };
    engine.onLabel = (label) => {
      const el = labelRef.current;
      if (!el) return;
      if (!label) {
        el.hidden = true;
        return;
      }
      el.hidden = false;
      if (el.textContent !== label.text) el.textContent = label.text;
      el.dataset.alert = String(label.alert);
      el.style.transform = `translate(${Math.round(label.x)}px, ${Math.round(label.y)}px) translate(-50%, calc(-100% - 6px))`;
    };
    document.documentElement.classList.add("world-ready");

    let measureQueued = 0;
    const queueMeasure = () => {
      if (measureQueued) return;
      measureQueued = requestAnimationFrame(() => {
        measureQueued = 0;
        engine.measure();
      });
    };
    const onScroll = () => {
      engine.request();
      const m = lastMouse.current;
      if (m && engine.opts.buildMode) engine.setHover(engine.refAt(m.x, m.y));
      // A carried creature stays under the pointer while the page scrolls beneath it.
      if (engine.holding) engine.dragMob(pointerAt.current.x, pointerAt.current.y);
    };
    // A finger that lands on a creature picks it up instead of scrolling the page.
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t || engine.opts.buildMode || e.touches.length > 1) return;
      if (engine.mobAt(t.clientX, t.clientY) !== null) e.preventDefault();
    };
    const onTouchMove = (e: TouchEvent) => {
      if (mobPress.current) e.preventDefault();
    };
    back.addEventListener("touchstart", onTouchStart, { passive: false });
    back.addEventListener("touchmove", onTouchMove, { passive: false });
    const onResize = () => engine.resize();
    const onVisible = () => !document.hidden && engine.resume();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisible);
    const observer = new ResizeObserver(queueMeasure);
    observer.observe(document.body);
    let dpr: MediaQueryList | null = null;
    const onDpr = () => {
      engine.resize();
      watchDpr();
    };
    const watchDpr = () => {
      dpr?.removeEventListener("change", onDpr);
      dpr = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      dpr.addEventListener("change", onDpr);
    };
    watchDpr();
    void document.fonts?.ready.then(queueMeasure);
    return () => {
      back.removeEventListener("touchstart", onTouchStart);
      back.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisible);
      dpr?.removeEventListener("change", onDpr);
      observer.disconnect();
      cancelAnimationFrame(measureQueued);
      engine.destroy();
      engineRef.current = null;
    };
  }, [world]);

  useEffect(() => {
    engineRef.current?.setOptions({ buildMode, layer, block, motion });
  }, [buildMode, layer, block, motion]);

  useEffect(() => {
    engineRef.current?.setNight(night);
  }, [night]);

  const act = useCallback(
    (ref: CellRef, action: "place" | "break", quiet = false) => {
      const engine = engineRef.current;
      if (!engine) return;
      const status = engine.status(ref);
      if (status !== "ok") {
        if (!quiet) {
          cue("deny");
          say("That spot is out of reach.", "alert");
        }
        return;
      }
      const result = action === "place" ? world.place(ref, layer, block) : world.break(ref);
      if (quiet && (result.kind === "taken" || result.kind === "empty")) return;
      engine.feedback(result);
      cue(result.kind === "placed" ? "place" : result.kind === "broke" ? "break" : "deny");
      say(describeResult(result), result.kind === "taken" || result.kind === "limit" ? "alert" : "info");
    },
    [world, layer, block, cue, say],
  );

  const exitBuildMode = useCallback(() => {
    setBuildMode(false);
    say("Build mode off.");
    document.getElementById("build-toggle")?.focus();
  }, [setBuildMode, say]);

  // Shortcuts that work anywhere while building.
  useEffect(() => {
    if (!buildMode) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.defaultPrevented || document.querySelector("dialog[open]")) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      const key = e.key.toLowerCase();
      if (key === "escape") {
        e.preventDefault();
        if (document.querySelector("[data-inventory-open]")) window.dispatchEvent(new CustomEvent("world:inventory", { detail: false }));
        else exitBuildMode();
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        if (key === "z" && !e.shiftKey) {
          e.preventDefault();
          say(world.undo() ? "Undid the last change." : "Nothing to undo.");
        }
        return;
      }
      if (e.altKey) return;
      if (key === "b" || key === "m" || key === "f") {
        setLayer(key);
        say(`Placing in the ${LAYER_NAME[key].toLowerCase()} layer.`);
      } else if (key === "e") {
        window.dispatchEvent(new CustomEvent("world:inventory"));
      } else if (/^[1-9]$/.test(key)) {
        const s = Number(key) - 1;
        setSlot(s);
        say(`${BLOCKS[hotbar[s]!].name} selected.`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [buildMode, exitBuildMode, setLayer, setSlot, hotbar, say, world]);

  // ---------------------------------------------------------------- pointer: mouse, pen and touch

  /** While a creature is carried near the top or bottom of the screen, the page scrolls to follow. */
  const runEdgeScroll = () => {
    const engine = engineRef.current;
    if (!engine?.holding) {
      edgeScroll.current = 0;
      return;
    }
    const y = pointerAt.current.y;
    const top = 96;
    const bottom = window.innerHeight - 72;
    const dy = y < top ? -((top - y) / top) * 18 : y > bottom ? ((y - bottom) / 72) * 18 : 0;
    if (dy) window.scrollBy({ top: dy, behavior: "instant" as ScrollBehavior });
    edgeScroll.current = requestAnimationFrame(runEdgeScroll);
  };

  const pickUp = (target: HTMLCanvasElement) => {
    const engine = engineRef.current;
    const mp = mobPress.current;
    if (!engine || !mp || mp.grabbed) return;
    mp.grabbed = true;
    engine.grabMob(mp.id, pointerAt.current.x, pointerAt.current.y);
    target.style.cursor = "grabbing";
    cancelAnimationFrame(edgeScroll.current);
    edgeScroll.current = requestAnimationFrame(runEdgeScroll);
  };

  const letGo = (target: HTMLCanvasElement, poke: boolean) => {
    const engine = engineRef.current;
    const mp = mobPress.current;
    mobPress.current = null;
    if (!engine || !mp) return;
    window.clearTimeout(mp.timer);
    cancelAnimationFrame(edgeScroll.current);
    target.style.cursor = "";
    if (mp.grabbed) engine.releaseMob();
    else if (poke) engine.pokeMob(mp.id);
  };

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    const engine = engineRef.current;
    if (!engine) return;
    if (!buildMode) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const id = engine.mobAt(e.clientX, e.clientY);
      if (id === null) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      pointerAt.current = { x: e.clientX, y: e.clientY };
      const target = e.currentTarget;
      mobPress.current = { pointer: e.pointerId, id, x: e.clientX, y: e.clientY, grabbed: false, timer: window.setTimeout(() => pickUp(target), 260) };
      return;
    }
    const ref = engine.refAt(e.clientX, e.clientY);
    if (!ref) return;
    if (e.pointerType === "touch") {
      engine.setHover(ref);
      if (paintDrag) {
        // Paint mode: the finger paints instead of scrolling.
        e.currentTarget.setPointerCapture(e.pointerId);
        act(ref, touchTool);
        drag.current = { pointer: e.pointerId, action: touchTool, last: `${ref.region}:${ref.x}:${ref.y}` };
        return;
      }
      const p: Press = { pointer: e.pointerId, x: e.clientX, y: e.clientY, ref, done: false, timer: 0 };
      // Holding a finger still breaks, whichever tool is chosen.
      p.timer = window.setTimeout(() => {
        p.done = true;
        act(ref, "break");
      }, 450);
      press.current = p;
      return;
    }
    // Mouse and pen: left button breaks, right button places.
    const action = e.button === 0 ? "break" : e.button === 2 ? "place" : null;
    if (!action) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    act(ref, action);
    drag.current = { pointer: e.pointerId, action, last: `${ref.region}:${ref.x}:${ref.y}` };
  };

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const engine = engineRef.current;
    if (!engine) return;
    const mp = mobPress.current;
    if (mp && mp.pointer === e.pointerId) {
      pointerAt.current = { x: e.clientX, y: e.clientY };
      if (!mp.grabbed && Math.hypot(e.clientX - mp.x, e.clientY - mp.y) > 5) pickUp(e.currentTarget);
      if (mp.grabbed) engine.dragMob(e.clientX, e.clientY);
      return;
    }
    if (!buildMode) {
      if (e.pointerType === "mouse") e.currentTarget.style.cursor = engine.mobAt(e.clientX, e.clientY) !== null ? "grab" : "";
      return;
    }
    if (e.pointerType !== "touch") lastMouse.current = { x: e.clientX, y: e.clientY };
    const ref = engine.refAt(e.clientX, e.clientY);
    if (e.pointerType !== "touch" || drag.current) engine.setHover(ref);
    const p = press.current;
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) {
      window.clearTimeout(p.timer);
      press.current = null;
      engine.setHover(null);
    }
    const d = drag.current;
    if (d && d.pointer === e.pointerId && ref) {
      const key = `${ref.region}:${ref.x}:${ref.y}`;
      if (key !== d.last) {
        d.last = key;
        act(ref, d.action, true);
      }
    }
  };

  const endPointer = (e: PointerEvent<HTMLCanvasElement>) => {
    if (mobPress.current?.pointer === e.pointerId) {
      letGo(e.currentTarget, e.type === "pointerup");
      return;
    }
    const engine = engineRef.current;
    const p = press.current;
    if (p && p.pointer === e.pointerId) {
      window.clearTimeout(p.timer);
      if (!p.done && e.type === "pointerup") act(p.ref, touchTool);
      press.current = null;
      window.setTimeout(() => engine?.setHover(null), 250);
    }
    if (drag.current?.pointer === e.pointerId) {
      drag.current = null;
      if (e.pointerType === "touch") window.setTimeout(() => engine?.setHover(null), 250);
    }
  };

  // ---------------------------------------------------------------- keyboard

  const ensureVisible = (engine: WorldEngine, ref: CellRef) => {
    const rect = engine.cellRect(ref);
    if (!rect) return;
    const toolbar = document.querySelector("[data-build-toolbar]")?.getBoundingClientRect().top ?? window.innerHeight;
    const pad = 80;
    if (rect.top < pad) window.scrollBy({ top: rect.top - pad });
    else if (rect.bottom > toolbar - 24) window.scrollBy({ top: rect.bottom - toolbar + 24 + rect.bottom - rect.top });
  };

  const announce = (engine: WorldEngine, ref: CellRef) => {
    say(`${REGION_LABEL[ref.region]}, column ${ref.x}, ${describeRow(ref.y)}: ${describeCell(world.get(ref))}.`);
  };

  const startCursor = (engine: WorldEngine): CellRef | null => {
    const region = engine.centreRegion() ?? engine.regionOrder()[0];
    if (!region) return null;
    const b = engine.bounds(region);
    if (!b) return null;
    return { region, x: Math.min(b.right, Math.max(b.left, 0)), y: Math.max(b.top, -1) };
  };

  const moveCursor = (engine: WorldEngine, dx: number, dy: number) => {
    const current = engine.getCursor() ?? startCursor(engine);
    if (!current) return;
    const order = engine.regionOrder();
    let { region, x, y } = current;
    x += dx;
    y += dy;
    let b = engine.bounds(region);
    if (!b) return;
    if (y < b.top) {
      const prev = order[order.indexOf(region) - 1];
      if (prev) {
        region = prev;
        b = engine.bounds(prev) ?? b;
        y = GROUND_ROWS - 1;
      } else y = b.top;
    } else if (y > b.bottom) {
      const next = order[order.indexOf(region) + 1];
      if (next) {
        region = next;
        b = engine.bounds(next) ?? b;
        y = b.top;
      } else y = b.bottom;
    }
    x = Math.min(b.right, Math.max(b.left, x));
    const ref = { region, x, y };
    engine.setCursor(ref);
    ensureVisible(engine, ref);
    announce(engine, ref);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLCanvasElement>) => {
    const engine = engineRef.current;
    if (!engine || !buildMode) return;
    const moves: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    const delta = moves[e.key];
    if (delta) {
      e.preventDefault();
      engine.setFocused(true);
      moveCursor(engine, delta[0], delta[1]);
      return;
    }
    const ref = engine.getCursor();
    if (!ref) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      act(ref, "place");
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      act(ref, "break");
    }
  };

  const onFocus = (e: FocusEvent<HTMLCanvasElement>) => {
    const engine = engineRef.current;
    // A mouse click also focuses the canvas; only keyboard focus starts the keyboard cursor.
    if (!engine || !e.currentTarget.matches(":focus-visible")) return;
    engine.setFocused(true);
    if (!engine.getCursor()) {
      const ref = startCursor(engine);
      if (ref) {
        engine.setCursor(ref);
        ensureVisible(engine, ref);
        announce(engine, ref);
      }
    }
  };

  return (
    <>
      <div className={styles.stageBack} aria-hidden={!buildMode}>
        <canvas
          ref={backRef}
          className={styles.canvas}
          data-building={buildMode || undefined}
          data-paint={(buildMode && paintDrag) || undefined}
          tabIndex={buildMode ? 0 : -1}
          role="application"
          aria-roledescription="tile world"
          aria-label="Tile world editor"
          aria-describedby="world-help"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onPointerLeave={(e) => {
            if (e.pointerType !== "touch" && !drag.current) {
              lastMouse.current = null;
              engineRef.current?.setHover(null);
            }
          }}
          onContextMenu={(e) => buildMode && e.preventDefault()}
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          onBlur={() => engineRef.current?.setFocused(false)}
        />
      </div>
      <div className={styles.stageFront} aria-hidden="true">
        <canvas ref={frontRef} className={styles.canvas} />
      </div>
      <div ref={labelRef} className={styles.label} hidden aria-hidden="true" />
      <p id="world-help" className="visually-hidden">
        Arrow keys move the selection. Enter places the selected block, Delete breaks the closest block. B, M and F choose the back, middle or front layer, number keys 1 to 9 choose a block, E opens all blocks, and Escape exits build mode.
      </p>
    </>
  );
}
