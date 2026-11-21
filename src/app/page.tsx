import { AboutSection, ContactSection, IntroSection, ProjectsSection, SkillsSection } from "@/components/Sections";
import { SiteHeader } from "@/components/SiteHeader";
import { getContent } from "@/content";
import { getProjectBuild } from "@/content/build";
import { BuildToolbar } from "@/world/BuildToolbar";
import { WorldCanvas } from "@/world/WorldCanvas";
import { WorldProvider } from "@/world/WorldProvider";

export default async function Home() {
  const [{ profile, projects, skillGroups, explorations }, build] = await Promise.all([getContent(), getProjectBuild()]);

  return (
    <WorldProvider build={build}>
      <a href="#main" className="pixel-button skip-link">
        Skip to content
      </a>
      {/* Back canvas, then the page text, then the front canvas: front-layer blocks can cover the text. */}
      <WorldCanvas />
      <SiteHeader name={profile.name} />
      <main id="main" style={{ position: "relative", zIndex: 1, pointerEvents: "none" }}>
        <IntroSection profile={profile} />
        <ProjectsSection projects={projects} />
        <SkillsSection groups={skillGroups} />
        <AboutSection profile={profile} explorations={explorations} />
        <ContactSection profile={profile} />
      </main>
      <BuildToolbar />
    </WorldProvider>
  );
}
