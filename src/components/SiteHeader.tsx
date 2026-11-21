"use client";

import { useEffect, useState } from "react";
import { BuildToggle, MotionToggle, SkyToggle } from "@/world/BuildToggle";
import styles from "./SiteHeader.module.css";

const LINKS = [
  { href: "#projects", label: "Projects" },
  { href: "#skills", label: "Skills" },
  { href: "#about", label: "About" },
  { href: "#contact", label: "Contact" },
];

/** The navigation floats on the world with no bar behind it; visitors can build one. */
export function SiteHeader({ name, home = "#intro", links = LINKS }: { name: string; home?: string; links?: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 4);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  return (
    <header className={`on-world ${styles.header}`} data-scrolled={scrolled ? "" : undefined}>
      <div className={styles.bar}>
        <a href={home} className={styles.brand}>
          <span className={styles.mark} aria-hidden="true" />
          <span>{name}</span>
        </a>
        <nav aria-label="Sections" className={styles.nav}>
          <button type="button" className={`pixel-button ${styles.menu}`} aria-expanded={open} aria-controls="site-nav" onClick={() => setOpen((v) => !v)}>
            Menu
          </button>
          <ul id="site-nav" className={`${styles.list} ${open ? styles.open : ""}`}>
            {links.map((link) => (
              <li key={link.href}>
                <a href={link.href} onClick={() => setOpen(false)}>
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <MotionToggle />
        <SkyToggle />
        <BuildToggle />
      </div>
    </header>
  );
}
