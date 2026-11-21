import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { getContent, getProject } from "@/content";
import { getProjectBuild } from "@/content/build";
import { BuildToolbar } from "@/world/BuildToolbar";
import { caseRegion } from "@/world/regions";
import { WorldCanvas } from "@/world/WorldCanvas";
import { WorldProvider } from "@/world/WorldProvider";
import styles from "./case-study.module.css";

type Params = { params: Promise<{ slug: string }> };

// Only slugs that exist at build time are served; anything else is a 404.
export const dynamicParams = false;

export async function generateStaticParams() {
  const { projects } = await getContent();
  return projects.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const project = await getProject((await params).slug);
  if (!project) return {};
  return { title: project.title, description: project.summary };
}

/** Each case study stands in a world built from its project's colours, and visitors can build there too. */
export default async function CaseStudy({ params }: Params) {
  const project = await getProject((await params).slug);
  if (!project) notFound();
  const [{ profile }, build] = await Promise.all([getContent(), getProjectBuild()]);
  const region = caseRegion(project.slug);
  const [primary, ...more] = project.links;

  return (
    <WorldProvider build={build}>
      <a href="#main" className="pixel-button skip-link">
        Skip to content
      </a>
      <WorldCanvas />
      <SiteHeader
        name={profile.name}
        home="/"
        links={[
          { href: "/#projects", label: "All projects" },
          { href: "/#contact", label: "Contact" },
        ]}
      />
      <main id="main" className={styles.main}>
        <section data-world-region={region} data-theme={region} className={styles.section} aria-labelledby="case-title">
          <div className={styles.stage}>
            <Link href="/#projects" className={`pixel-button ${styles.back}`}>
              Back to projects
            </Link>

            <article className={styles.article}>
              <header className={styles.intro}>
                <p className={styles.kicker}>
                  {project.context && <span>{project.context}</span>}
                  {project.year && <span>{project.year}</span>}
                </p>
                <h1 id="case-title" className={styles.title}>
                  {project.title}
                </h1>
                <p className={styles.summary}>{project.summary}</p>
                {primary && (
                  <p className={styles.cta}>
                    <a href={primary.href} className="pixel-button" data-variant="primary" target="_blank" rel="noopener noreferrer">
                      {primary.label}
                      <span className="visually-hidden"> (opens in a new tab)</span>
                    </a>
                  </p>
                )}
              </header>

              <dl className={styles.facts}>
                <div>
                  <dt>Role</dt>
                  <dd>{project.role}</dd>
                </div>
                {project.year && (
                  <div>
                    <dt>Year</dt>
                    <dd>{project.year}</dd>
                  </div>
                )}
                <div>
                  <dt>Built with</dt>
                  <dd className={styles.tags}>
                    {project.tech.map((t) => (
                      <span key={t}>{t}</span>
                    ))}
                  </dd>
                </div>
              </dl>

              {project.image && (
                <div className={styles.figures} data-pair={project.imageDark ? "" : undefined}>
                  {[project.image, project.imageDark].map(
                    (img, i) =>
                      img && (
                        <figure key={img.src} className={styles.figure}>
                          <Image src={img.src} alt={img.alt} width={img.width} height={img.height} sizes="(max-width: 940px) 100vw, 860px" priority={i === 0} />
                          {project.imageDark && <figcaption>{i === 0 ? "Light theme" : "Dark theme"}</figcaption>}
                        </figure>
                      ),
                  )}
                </div>
              )}

              {project.contribution.length > 0 && (
                <section className={styles.block} aria-labelledby="contribution">
                  <h2 id="contribution">What I did</h2>
                  <ul>
                    {project.contribution.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              )}

              {project.decisions.length > 0 && (
                <section className={styles.block} aria-labelledby="decisions">
                  <h2 id="decisions">Key decisions</h2>
                  {project.decisions.map((d) => (
                    <div key={d.title} className={styles.decision}>
                      <h3>{d.title}</h3>
                      <p>{d.body}</p>
                    </div>
                  ))}
                </section>
              )}

              {project.results.length > 0 && (
                <section className={styles.block} aria-labelledby="results">
                  <h2 id="results">Results</h2>
                  <ul>
                    {project.results.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              )}

              {more.length > 0 && (
                <section className={styles.block} aria-labelledby="links">
                  <h2 id="links">Code and links</h2>
                  <ul className={styles.links}>
                    {more.map((link) => (
                      <li key={link.href}>
                        <a href={link.href} target="_blank" rel="noopener noreferrer">
                          {link.label}
                          <span className="visually-hidden"> (opens in a new tab)</span>
                        </a>
                        <span className={styles.url}>{link.href.replace(/^https?:\/\//, "")}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <p className={styles.buildHint}>
                Press <span className={styles.key}>Build</span> in the top bar to add to this world. Your blocks stay in your browser.
              </p>
            </article>
          </div>
          <div className={styles.ground} data-world-ground aria-hidden="true" />
        </section>
      </main>
      <BuildToolbar />
    </WorldProvider>
  );
}
