import Link from "next/link";
import type { ReactNode } from "react";
import type { Exploration, Profile, Project, SkillGroup } from "@/content/types";
import { BlockIcon } from "@/world/BlockIcon";
import type { BlockId } from "@/world/blocks";
import type { RegionId } from "@/world/regions";
import { ContactForm } from "./ContactForm";
import { PixelReveal } from "./PixelReveal";
import styles from "./Sections.module.css";

/**
 * A page section that is also a world region. Its grid is anchored at the ground band's top edge and
 * horizontal centre, so edits keep their place when the content above changes height.
 */
function WorldSection({ id, region, className, labelledBy, dark, children }: { id: string; region: RegionId; className?: string; labelledBy: string; dark?: boolean; children: ReactNode }) {
  return (
    <section id={id} data-world-region={region} className={`${styles.section} ${dark ? "dark-zone" : ""} ${className ?? ""}`} aria-labelledby={labelledBy}>
      <div className={styles.stage}>{children}</div>
      <div className={styles.ground} data-world-ground aria-hidden="true" />
    </section>
  );
}

function Heading({ id, icon, children, note }: { id: string; icon: BlockId; children: ReactNode; note?: ReactNode }) {
  return (
    <div className={`on-world ${styles.head}`}>
      <h2 id={id} className={styles.h2}>
        <BlockIcon block={icon} className={styles.headingIcon} />
        {children}
      </h2>
      {note && <p>{note}</p>}
    </div>
  );
}

/** The résumé downloads rather than opening, named after its owner. */
function ResumeLink({ href, name, className }: { href: string; name: string; className?: string }) {
  return (
    <a href={href} className={className} download={`${name.replace(/\s+/g, "-")}-Resume.pdf`} type="application/pdf">
      Download résumé
      <span className="visually-hidden"> (PDF)</span>
    </a>
  );
}

function ExternalLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  const external = /^https?:/.test(href);
  return (
    <a href={href} className={className} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      {children}
      {external && <span className="visually-hidden"> (opens in a new tab)</span>}
    </a>
  );
}

/** Content text with [Word] turned into a key chip. Everything else stays plain text, never HTML. */
function WithKeys({ text }: { text: string }) {
  return text.split(/(\[[^\]\n]{1,24}\])/g).map((part, i) =>
    /^\[.+\]$/.test(part) ? (
      <span key={i} className={styles.key}>
        {part.slice(1, -1)}
      </span>
    ) : (
      part
    ),
  );
}

export function IntroSection({ profile }: { profile: Profile }) {
  return (
    <WorldSection id="intro" region="intro" className={styles.intro} labelledBy="intro-title">
      <div className={`on-world ${styles.heroText}`}>
        <h1 id="intro-title" className={styles.h1}>
          {profile.name}
        </h1>
        <p className={styles.lead}>{profile.headline}</p>
        <p className={styles.introText}>
          <WithKeys text={profile.intro} />
        </p>
        <div className={styles.actions}>
          <a href="#projects" className="pixel-button" data-variant="primary">
            See my projects
          </a>
          {profile.resumeUrl ? (
            <ResumeLink href={profile.resumeUrl} name={profile.name} className="pixel-button" />
          ) : (
            <a href="#contact" className="pixel-button">
              Get in touch
            </a>
          )}
        </div>
      </div>
    </WorldSection>
  );
}

export function ProjectsSection({ projects }: { projects: Project[] }) {
  return (
    <WorldSection id="projects" region="projects" className={styles.cave} labelledBy="projects-title" dark>
      <Heading id="projects-title" icon="stone" note="Things I've built with my teams, from a city platform to a game jam entry. Each has a short case study.">
        Projects
      </Heading>
      <ul className={styles.projectGrid} role="list">
        {projects.map((project) => (
          <li key={project.slug} className={`${styles.panel} ${styles.project}`}>
            {project.image && <PixelReveal image={project.image} imageDark={project.imageDark} />}
            <div className={styles.projectBody}>
              {project.context && <p className={styles.kicker}>{project.context}</p>}
              <h3 className={styles.h3}>
                <Link href={`/projects/${project.slug}`} className={styles.projectLink}>
                  {project.title}
                </Link>
              </h3>
              <p className={styles.meta}>{[project.role, project.year].filter(Boolean).join(", ")}</p>
              <p>{project.summary}</p>
              <ul className={styles.tags} aria-label="Technologies">
                {project.tech.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
              <div className={styles.projectLinks}>
                <Link href={`/projects/${project.slug}`} className={styles.more} aria-label={`Read the ${project.title} case study`}>
                  Read the case study
                </Link>
                {project.links[0] && (
                  <ExternalLink href={project.links[0].href} className={styles.more}>
                    {project.links[0].label}
                  </ExternalLink>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </WorldSection>
  );
}

export function SkillsSection({ groups }: { groups: SkillGroup[] }) {
  return (
    <WorldSection id="skills" region="skills" className={styles.crystal} labelledBy="skills-title" dark>
      <Heading id="skills-title" icon="amethyst" note="The languages and tools I've used in school, jams, hackathons and my capstone.">
        Skills
      </Heading>
      <div className={`${styles.panel} ${styles.skillsPanel}`}>
        {groups.map((group) => (
          <div key={group.title} className={styles.skillGroup}>
            <h3 className={styles.h3}>
              <BlockIcon block={group.icon} className={styles.smallIcon} />
              {group.title}
            </h3>
            <ul className={styles.tags}>
              {group.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </WorldSection>
  );
}

export function AboutSection({ profile, explorations }: { profile: Profile; explorations: Exploration[] }) {
  return (
    <WorldSection id="about" region="about" className={styles.inferno} labelledBy="about-title" dark>
      <Heading id="about-title" icon="emberrock" note="Who I am, where I studied, and what I'm working on next.">
        About
      </Heading>
      <div className={styles.aboutGrid}>
        {profile.education.length > 0 && (
          <section className={`${styles.panel} ${styles.card}`} aria-labelledby="about-education">
            <h3 id="about-education" className={styles.h3}>
              <BlockIcon block="bookshelf" className={styles.smallIcon} />
              Education
            </h3>
            <ol className={styles.entries}>
              {profile.education.map((e) => (
                <li key={e.school}>
                  <span className={styles.chip}>{e.year}</span>
                  <b>{e.school}</b>
                  <span>{e.detail}</span>
                  {e.place && <span className={styles.meta}>{e.place}</span>}
                </li>
              ))}
            </ol>
          </section>
        )}
        {explorations.length > 0 && (
          <section className={`${styles.panel} ${styles.card}`} aria-labelledby="about-exploring">
            <h3 id="about-exploring" className={styles.h3}>
              <BlockIcon block="lantern" className={styles.smallIcon} />
              What I&apos;m exploring
            </h3>
            <ul className={styles.entries}>
              {explorations.map((item) => (
                <li key={item.title}>
                  <span className={styles.chip}>{item.area}</span>
                  <b>{item.link ? <ExternalLink href={item.link.href}>{item.title}</ExternalLink> : item.title}</b>
                  <span>{item.description}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {profile.certificates.length > 0 && (
          <section className={`${styles.panel} ${styles.card}`} aria-labelledby="about-recognition">
            <h3 id="about-recognition" className={styles.h3}>
              <BlockIcon block="goldore" className={styles.smallIcon} />
              Recognition
            </h3>
            <ul className={styles.entries}>
              {profile.certificates.map((c) => (
                <li key={c}>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </WorldSection>
  );
}

export function ContactSection({ profile }: { profile: Profile }) {
  const year = new Date().getFullYear();
  return (
    <WorldSection id="contact" region="contact" className={styles.void} labelledBy="contact-title" dark>
      <div className={`${styles.panel} ${styles.contactPanel}`}>
        <h2 id="contact-title" className={styles.h2}>
          <BlockIcon block="voidcrystal" className={styles.headingIcon} />
          Contact
        </h2>
        <p>
          {profile.availability} Send me a message here and it lands in my inbox{profile.location && `. I'm based in ${profile.location}`}.
        </p>
        <ContactForm email={profile.email} />
        <div className={styles.elsewhere}>
          <p className={styles.meta}>
            Or email me directly at{" "}
            <a href={`mailto:${profile.email}`} className={styles.emailLink}>
              {profile.email}
            </a>
          </p>
          <div className={styles.actions}>
            {profile.links.map((link) => (
              <ExternalLink key={link.href + link.label} href={link.href} className="pixel-button">
                {link.label}
              </ExternalLink>
            ))}
            {profile.resumeUrl && <ResumeLink href={profile.resumeUrl} name={profile.name} className="pixel-button" />}
          </div>
        </div>
        <p className={styles.footer}>
          © {year} {profile.name}. Built with Next.js and a hand-made tile engine.
        </p>
      </div>
    </WorldSection>
  );
}
