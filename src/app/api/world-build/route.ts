import { mergeIntoProjectBuild } from "@/content/build";
import { isRegionId } from "@/world/regions";

/**
 * Development only: build mode saves the author's edits into src/content/world-build.json.
 * The deployed site never writes files; there this route is a 404.
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") return new Response("Not found", { status: 404 });

  // Only this site may write, not some other page open in the same browser.
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) return new Response("Forbidden", { status: 403 });

  const body = (await request.json().catch(() => null)) as { cells?: unknown; tops?: unknown; reset?: unknown } | null;
  if (!body || (body.cells !== undefined && !Array.isArray(body.cells))) return Response.json({ error: "Expected { cells: [...] }" }, { status: 400 });
  const tops: Record<string, number> = {};
  if (body.tops && typeof body.tops === "object") {
    for (const [region, top] of Object.entries(body.tops)) if (isRegionId(region) && Number.isInteger(top)) tops[region] = top as number;
  }
  try {
    const saved = await mergeIntoProjectBuild((body.cells as unknown[]) ?? [], tops, body.reset === true);
    return Response.json({ ok: true, cells: saved });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not save the build." }, { status: 500 });
  }
}
