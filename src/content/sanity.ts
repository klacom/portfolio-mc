import type { SiteContent } from "./types";

/**
 * Reads published content from Sanity's HTTP API at build time. No SDK needed.
 * Drafts are never returned: the public API only serves published documents.
 */
const API_VERSION = "v2025-02-19";

export type SanityConfig = { projectId: string; dataset: string };

export function sanityConfig(): SanityConfig | null {
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID?.trim();
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET?.trim() || "production";
  if (!projectId) return null;
  if (!/^[a-z0-9-]+$/.test(projectId) || !/^[a-z0-9_-]+$/.test(dataset)) {
    throw new Error("NEXT_PUBLIC_SANITY_PROJECT_ID or NEXT_PUBLIC_SANITY_DATASET has an invalid format.");
  }
  return { projectId, dataset };
}

const media = `{ "src": asset->url, "alt": coalesce(alt, ""), "width": asset->metadata.dimensions.width, "height": asset->metadata.dimensions.height }`;

const QUERY = `{
  "profile": *[_type == "profile"][0]{
    name, headline, intro, "bio": coalesce(bio, []), email,
    "location": coalesce(location, ""),
    "resumeUrl": resume.asset->url,
    "links": coalesce(links[]{label, href}, []),
    "availability": coalesce(availability, ""),
    "education": coalesce(education[]{school, detail, "place": coalesce(place, ""), "year": coalesce(year, "")}, []),
    "certificates": coalesce(certificates, [])
  },
  "projects": *[_type == "project" && defined(slug.current)] | order(orderRank asc, year desc){
    "slug": slug.current, title, "context": coalesce(context, ""), summary, role, "year": coalesce(year, ""),
    "tech": coalesce(tech, []),
    "image": select(defined(image.asset) => image${media}, null),
    "imageDark": select(defined(imageDark.asset) => imageDark${media}, null),
    "contribution": coalesce(contribution, []),
    "decisions": coalesce(decisions[]{title, body}, []),
    "results": coalesce(results, []),
    "links": coalesce(links[]{label, href}, [])
  },
  "skillGroups": *[_type == "skillGroup"] | order(orderRank asc){ title, "icon": coalesce(icon, "stone"), "items": coalesce(items, []) },
  "explorations": *[_type == "exploration"] | order(orderRank asc){
    title, area, description, "link": select(defined(link.href) => link{label, href}, null)
  }
}`;

export async function fetchSanityContent(config: SanityConfig): Promise<SiteContent> {
  const url = new URL(`https://${config.projectId}.apicdn.sanity.io/${API_VERSION}/data/query/${config.dataset}`);
  url.searchParams.set("query", QUERY);
  url.searchParams.set("perspective", "published");
  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) throw new Error(`Sanity request failed with ${res.status}`);
  const body = (await res.json()) as { result?: SiteContent };
  if (!body.result?.profile) throw new Error("Sanity returned no profile document. Publish a Profile in the Studio first.");
  return body.result;
}
