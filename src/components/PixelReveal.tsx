"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import type { Media } from "@/content/types";
import { useWorld } from "@/world/WorldProvider";
import styles from "./PixelReveal.module.css";

const STEPS = [12, 24, 48, 96];
const SIZES = "(max-width: 700px) calc(100vw - 48px), (max-width: 1100px) 45vw, 360px";

/**
 * A project screenshot that loads in like a block world: coarse pixels first, sharpening in a few
 * steps as the card scrolls into view. Without JavaScript, or with animation paused, it's just the image.
 * A dark-theme screenshot, when there is one, replaces it at night.
 */
export function PixelReveal({ image, imageDark }: { image: Media; imageDark: Media | null }) {
  const { motion } = useWorld();
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const source = useRef<HTMLImageElement | null>(null);
  const [state, setState] = useState<"idle" | "pixel" | "clear">("idle");

  const paint = (width: number) => {
    const c = canvas.current;
    const img = source.current;
    const ctx = c?.getContext("2d");
    if (!c || !img || !ctx) return;
    c.width = width;
    c.height = Math.max(1, Math.round((width * image.height) / image.width));
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, 0, 0, c.width, c.height);
  };

  const onLoad = (e: SyntheticEvent<HTMLImageElement>) => {
    source.current = e.currentTarget;
    if (!motion || state !== "idle") return;
    paint(STEPS[0]!);
    setState("pixel");
  };

  useEffect(() => {
    if (state !== "pixel") return;
    const el = frame.current;
    if (!el) return;
    let timer = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        let i = 1;
        const next = () => {
          if (i < STEPS.length) {
            paint(STEPS[i++]!);
            timer = window.setTimeout(next, 110);
          } else setState("clear");
        };
        timer = window.setTimeout(next, 160);
      },
      { threshold: 0.35 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
    // paint reads refs only; re-running on its identity would restart the sequence.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <div ref={frame} className={styles.frame} data-state={state} data-has-dark={imageDark ? "" : undefined}>
      <Image className={`${styles.image} ${styles.day}`} src={image.src} alt={image.alt} width={image.width} height={image.height} sizes={SIZES} onLoad={onLoad} />
      {imageDark && <Image className={`${styles.image} ${styles.night}`} src={imageDark.src} alt={imageDark.alt} width={imageDark.width} height={imageDark.height} sizes={SIZES} />}
      <canvas ref={canvas} className={styles.pixels} aria-hidden="true" />
    </div>
  );
}
