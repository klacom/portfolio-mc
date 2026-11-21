"use client";

import { useWorld } from "./WorldProvider";
import styles from "./world.module.css";

export function BuildToggle() {
  const { buildMode, setBuildMode, say, cue } = useWorld();
  return (
    <button
      id="build-toggle"
      type="button"
      className={`pixel-button ${styles.toggle}`}
      aria-pressed={buildMode}
      onClick={() => {
        const next = !buildMode;
        setBuildMode(next);
        cue("ui");
        const touch = window.matchMedia("(pointer: coarse)").matches;
        say(next ? (touch ? "Build mode on. Tap to place, hold to break." : "Build mode on. Left click breaks, right click places.") : "Build mode off.");
      }}
    >
      {buildMode ? "Building" : "Build"}
    </button>
  );
}

/** Day and night: the sky turns in steps, like a fast-forwarded day. */
export function SkyToggle() {
  const { night, setNight, cue, say } = useWorld();
  return (
    <button
      type="button"
      className={`pixel-button ${styles.toggle}`}
      title={night ? "Switch to day" : "Switch to night"}
      onClick={() => {
        setNight(!night);
        cue("ui");
        say(night ? "Sunrise." : "Sunset.");
      }}
    >
      {!night ? (
        <svg viewBox="0 0 10 10" aria-hidden="true" className={styles.skyIcon}>
          <g fill="#4a5aa8">
            <rect x="3" y="1" width="3" height="1" />
            <rect x="2" y="2" width="2" height="1" />
            <rect x="1" y="3" width="2" height="4" />
            <rect x="2" y="7" width="2" height="1" />
            <rect x="3" y="8" width="3" height="1" />
          </g>
        </svg>
      ) : (
        <svg viewBox="0 0 10 10" aria-hidden="true" className={styles.skyIcon}>
          <rect x="3" y="3" width="4" height="4" fill="#f2b632" />
          <rect x="4" y="0" width="2" height="2" fill="#f2b632" />
          <rect x="4" y="8" width="2" height="2" fill="#f2b632" />
          <rect x="0" y="4" width="2" height="2" fill="#f2b632" />
          <rect x="8" y="4" width="2" height="2" fill="#f2b632" />
          <rect x="4" y="4" width="2" height="2" fill="#fff1b0" />
        </svg>
      )}
      <span>{night ? "Day" : "Night"}</span>
    </button>
  );
}

/** Pauses the world's ambient animation (water, flames, stars, plants). Remembered per browser. */
export function MotionToggle() {
  const { motion, setMotion, cue, say } = useWorld();
  return (
    <button
      type="button"
      className={`pixel-button ${styles.toggle} ${styles.iconOnly}`}
      aria-label={motion ? "Pause animations" : "Play animations"}
      title={motion ? "Pause animations" : "Play animations"}
      onClick={() => {
        setMotion(!motion);
        cue("ui");
        say(motion ? "Animations paused." : "Animations playing.");
      }}
    >
      <svg viewBox="0 0 10 10" aria-hidden="true" className={styles.skyIcon}>
        {motion ? (
          <g fill="#1a1622">
            <rect x="2" y="2" width="2" height="6" />
            <rect x="6" y="2" width="2" height="6" />
          </g>
        ) : (
          <g fill="#3f8f2c">
            <rect x="2" y="1" width="2" height="8" />
            <rect x="4" y="2" width="2" height="6" />
            <rect x="6" y="3" width="1" height="4" />
            <rect x="7" y="4" width="1" height="2" />
          </g>
        )}
      </svg>
    </button>
  );
}
