"use client";

import { useEffect, useRef, useState } from "react";
import { BLOCK_IDS, BLOCKS, GROUPS, LAYER_NAME, LAYERS } from "./blocks";
import { BlockIcon } from "./BlockIcon";
import { AUTHORING, useWorld } from "./WorldProvider";
import styles from "./world.module.css";

const MouseIcon = ({ side }: { side: "left" | "right" }) => (
  <svg viewBox="0 0 6 8" aria-hidden="true" className={styles.mouse}>
    <rect x="0" y="0" width="6" height="8" fill="#e6e3f0" />
    <rect x={side === "left" ? 0 : 3} y="0" width="3" height="3" fill="#43a530" />
    <rect x={side === "left" ? 3 : 2.5} y="0" width="0.5" height="3" fill="#1a1622" />
    <rect x="0" y="3" width="6" height="0.5" fill="#1a1622" />
  </svg>
);

export function BuildToolbar() {
  const w = useWorld();
  const dialog = useRef<HTMLDialogElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [invOpen, setInvOpen] = useState(false);

  // E and Escape open and close the block picker from anywhere.
  useEffect(() => {
    const onInv = (e: Event) => {
      const want = (e as CustomEvent<boolean | undefined>).detail;
      setInvOpen((open) => (typeof want === "boolean" ? want : !open));
    };
    window.addEventListener("world:inventory", onInv);
    return () => window.removeEventListener("world:inventory", onInv);
  }, []);

  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [moreOpen]);

  const exit = () => {
    setMoreOpen(false);
    setInvOpen(false);
    w.setBuildMode(false);
    w.say("Build mode off.");
    document.getElementById("build-toggle")?.focus();
  };

  return (
    <>
      <p className="visually-hidden" role="status" aria-live="polite" data-world-status>
        {w.message?.text}
      </p>

      {w.buildMode && (
        <div className={styles.toolbar} data-world-protect data-build-toolbar role="region" aria-label="Build tools">
          {invOpen && (
            <div className={styles.inventory} data-inventory-open role="dialog" aria-label="All blocks">
              <div className={styles.invHead}>
                <p>
                  Pick a block for slot {w.slot + 1}. It&apos;s placed in the {LAYER_NAME[w.layer].toLowerCase()} layer.
                </p>
                <button type="button" className={`pixel-button ${styles.action}`} onClick={() => setInvOpen(false)}>
                  Done
                </button>
              </div>
              {GROUPS.map((group) => (
                <section key={group} aria-label={group}>
                  <h3>{group}</h3>
                  <div className={styles.invGrid}>
                    {BLOCK_IDS.filter((id) => BLOCKS[id].group === group).map((id) => (
                      <button
                        key={id}
                        type="button"
                        className={styles.invItem}
                        aria-pressed={w.hotbar[w.slot] === id}
                        title={BLOCKS[id].name}
                        aria-label={BLOCKS[id].name}
                        onClick={() => {
                          w.assignSlot(id);
                          w.cue("ui");
                          w.say(`${BLOCKS[id].name} is in slot ${w.slot + 1}.`);
                        }}
                      >
                        <BlockIcon block={id} className={styles.icon} />
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}

          <p className={styles.status} data-tone={w.message?.tone} aria-hidden="true">
            {w.message?.text ?? "Build anywhere: behind the text, around it, or right over it."}
            {!w.storageAvailable && <span className={styles.warn}> Storage is off, so edits last only for this visit.</span>}
            {AUTHORING && (
              <span className={styles.projectSave} data-state={w.projectSave} title="src/content/world-build.json">
                {w.projectSave === "saving" ? "Saving to project…" : w.projectSave === "error" ? "Couldn't save to project" : w.projectSave === "saved" ? "Saved to project" : "Saves to project"}
              </span>
            )}
          </p>

          <div className={styles.slab}>
            <div className={styles.segment} role="group" aria-label="Layer">
              {LAYERS.map((l) => (
                <button key={l} type="button" aria-pressed={w.layer === l} onClick={() => w.setLayer(l)}>
                  <u>{LAYER_NAME[l][0]}</u>
                  <span className={styles.wide}>{LAYER_NAME[l].slice(1)}</span>
                </button>
              ))}
            </div>

            <div className={styles.slots} role="group" aria-label="Hotbar">
              {w.hotbar.map((id, i) => (
                <button
                  key={i}
                  type="button"
                  className={styles.slot}
                  aria-pressed={i === w.slot}
                  aria-label={`${BLOCKS[id].name}, slot ${i + 1}`}
                  title={`${BLOCKS[id].name} (${i + 1})`}
                  onClick={() => {
                    w.setSlot(i);
                    w.cue("ui");
                  }}
                >
                  <BlockIcon block={id} className={styles.icon} />
                </button>
              ))}
            </div>

            <div className={`${styles.segment} ${styles.touchOnly}`} role="group" aria-label="Tap to">
              {(["place", "break"] as const).map((t) => (
                <button key={t} type="button" aria-pressed={w.touchTool === t} onClick={() => w.setTouchTool(t)}>
                  {t === "place" ? "Place" : "Break"}
                </button>
              ))}
            </div>
            <div className={`${styles.segment} ${styles.touchOnly}`} role="group" aria-label="Dragging a finger">
              {([false, true] as const).map((paint) => (
                <button key={String(paint)} type="button" aria-pressed={w.paintDrag === paint} onClick={() => w.setPaintDrag(paint)}>
                  {paint ? "Paint" : "Scroll"}
                </button>
              ))}
            </div>

            <div className={styles.actions}>
              <button type="button" className={`pixel-button ${styles.action}`} aria-expanded={invOpen} onClick={() => setInvOpen((v) => !v)}>
                <span className={styles.wide}>All blocks</span>
                <span className={styles.narrow}>Blocks</span>
              </button>
              <button
                type="button"
                className={`pixel-button ${styles.action}`}
                disabled={!w.canUndo}
                onClick={() => {
                  w.world.undo();
                  w.cue("ui");
                  w.say("Undid the last change.");
                }}
              >
                Undo
              </button>
              <div ref={moreRef} className={styles.more} onKeyDown={(e) => e.key === "Escape" && moreOpen && (e.preventDefault(), setMoreOpen(false))}>
                <button type="button" className={`pixel-button ${styles.action}`} aria-expanded={moreOpen} aria-controls="build-options" onClick={() => setMoreOpen((v) => !v)}>
                  More
                </button>
                <div id="build-options" className={styles.menu} hidden={!moreOpen}>
                  <button type="button" className={styles.menuItem} aria-pressed={w.sound} onClick={() => w.setSound(!w.sound)}>
                    Sound <span aria-hidden="true">{w.sound ? "On" : "Off"}</span>
                  </button>
                  <button
                    type="button"
                    className={styles.menuItem}
                    onClick={() => {
                      setMoreOpen(false);
                      dialog.current?.showModal();
                    }}
                  >
                    Reset world…
                  </button>
                </div>
              </div>
              <button type="button" className={`pixel-button ${styles.action} ${styles.exit}`} aria-label="Exit build mode" onClick={exit}>
                Exit
              </button>
            </div>
          </div>

          <p className={styles.hints}>
            <span className={styles.mouseOnly}>
              <MouseIcon side="left" />
              Left click: break
            </span>
            <span className={styles.mouseOnly}>
              <MouseIcon side="right" />
              Right click: place
            </span>
            <span className={styles.mouseOnly}>Hold and drag to paint</span>
            <span className={styles.mouseOnly}>
              <kbd>B</kbd>
              <kbd>M</kbd>
              <kbd>F</kbd> layer
            </span>
            <span className={styles.mouseOnly}>
              <kbd>1</kbd>–<kbd>9</kbd> block
            </span>
            <span className={styles.mouseOnly}>
              <kbd>E</kbd> all blocks
            </span>
            <span className={styles.touchOnlyText}>Tap to {w.touchTool}, hold to break. Switch to Paint to drag across cells.</span>
          </p>
        </div>
      )}

      <dialog ref={dialog} className={styles.dialog} aria-labelledby="reset-title">
        <form method="dialog">
          <h2 id="reset-title">Reset the world?</h2>
          <p>
            This removes every block you placed or broke and brings back the original terrain.
            {AUTHORING && " It also clears the build saved in src/content/world-build.json."}
          </p>
          <div className={styles.dialogActions}>
            <button value="cancel" className={`pixel-button ${styles.action}`} autoFocus>
              Keep my edits
            </button>
            <button
              value="reset"
              className={`pixel-button ${styles.action} ${styles.danger}`}
              onClick={() => {
                w.resetWorld();
                w.cue("break");
                w.say("The world is back to its original terrain.");
              }}
            >
              Reset world
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
