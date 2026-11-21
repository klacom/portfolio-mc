import type { BlockId } from "@/world/blocks";

export type Link = { label: string; href: string };

export type Media = { src: string; alt: string; width: number; height: number };

export type Education = { school: string; detail: string; place: string; year: string };

export type Profile = {
  name: string;
  headline: string;
  intro: string;
  bio: string[];
  email: string;
  location: string;
  resumeUrl: string | null;
  links: Link[];
  availability: string;
  education: Education[];
  certificates: string[];
};

export type Decision = { title: string; body: string };

export type Project = {
  slug: string;
  title: string;
  /** What kind of project it was, e.g. "Capstone project" or "Game jam". */
  context: string;
  summary: string;
  role: string;
  year: string;
  tech: string[];
  image: Media | null;
  /** Optional dark-theme screenshot, shown instead of `image` at night. */
  imageDark: Media | null;
  contribution: string[];
  decisions: Decision[];
  results: string[];
  links: Link[];
};

export type SkillGroup = { title: string; icon: BlockId; items: string[] };

export type Exploration = { title: string; area: "Game development" | "Applied AI" | "Systems"; description: string; link: Link | null };

export type SiteContent = {
  profile: Profile;
  projects: Project[];
  skillGroups: SkillGroup[];
  explorations: Exploration[];
};
