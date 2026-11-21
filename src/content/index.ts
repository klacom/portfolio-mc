import { cache } from "react";
import { fallbackContent } from "./fallback";
import { fetchSanityContent, sanityConfig } from "./sanity";
import type { Project, SiteContent } from "./types";

/**
 * Content comes from Sanity when it is configured, otherwise from the local sample content.
 * A failing Sanity request fails the build on purpose, so Vercel keeps serving the last good deployment.
 */
export const getContent = cache(async (): Promise<SiteContent> => {
  const config = sanityConfig();
  if (!config) return fallbackContent;
  return fetchSanityContent(config);
});

export async function getProject(slug: string): Promise<Project | undefined> {
  const { projects } = await getContent();
  return projects.find((p) => p.slug === slug);
}

export type { Project, SiteContent } from "./types";
