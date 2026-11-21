"use client";

import { useEffect, useRef } from "react";
import { BLOCKS, type BlockId } from "./blocks";
import { getAtlas, TEX } from "./textures";

/** Renders a block's 16×16 texture; CSS scales it up with crisp, pixelated edges. */
export function BlockIcon({ block, className }: { block: BlockId; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, TEX, TEX);
    ctx.drawImage(getAtlas().mid, BLOCKS[block].index * TEX, 0, TEX, TEX, 0, 0, TEX, TEX);
  }, [block]);

  return <canvas ref={ref} width={TEX} height={TEX} className={className} aria-hidden="true" />;
}
