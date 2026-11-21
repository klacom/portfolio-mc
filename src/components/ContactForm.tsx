"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { checkContact, CONTACT_LIMITS, type ContactField } from "@/content/contact";
import styles from "./ContactForm.module.css";

type Status = { kind: "idle" | "sending" | "sent" | "error"; text: string };

/**
 * Visitors write to me without leaving the page. Without JavaScript the form still posts to the
 * same route and gets a plain confirmation page back.
 */
export function ContactForm({ email }: { email: string }) {
  const [status, setStatus] = useState<Status>({ kind: "idle", text: "" });
  const [errors, setErrors] = useState<Partial<Record<ContactField, string>>>({});
  const opened = useRef(0);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    opened.current = Date.now();
  }, []);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const el = e.currentTarget;
    const data = Object.fromEntries(new FormData(el).entries());
    const check = checkContact(data);
    if (!check.ok) {
      setErrors(check.errors);
      setStatus({ kind: "error", text: "Some fields need another look." });
      const first = Object.keys(check.errors)[0];
      el.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    setErrors({});
    setStatus({ kind: "sending", text: "Sending…" });
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...check.value, company: data.company ?? "", elapsed: Date.now() - opened.current }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; fields?: Partial<Record<ContactField, string>> };
      if (res.ok && body.ok) {
        form.current?.reset();
        setStatus({ kind: "sent", text: "Thanks! Your message is on its way. I'll reply by email." });
        // The world's creatures say thanks by name. Nothing is stored; the page forgets it on reload.
        window.dispatchEvent(new CustomEvent("world:visitor", { detail: { name: check.value.name } }));
        return;
      }
      if (body.fields) setErrors(body.fields);
      setStatus({ kind: "error", text: body.message ?? "Your message couldn't be sent. Please try again." });
    } catch {
      setStatus({ kind: "error", text: "You seem to be offline. Please try again in a moment." });
    }
  };

  const field = (name: ContactField) => ({
    id: `contact-${name}`,
    name,
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `contact-${name}-error` : undefined,
  });
  const error = (name: ContactField) =>
    errors[name] && (
      <span id={`contact-${name}-error`} className={styles.error}>
        {errors[name]}
      </span>
    );

  return (
    <form ref={form} className={styles.form} action="/api/contact" method="post" onSubmit={onSubmit} noValidate aria-label="Send me a message">
      <div className={styles.row}>
        <label className={styles.field}>
          <span className={styles.label}>Your name</span>
          <input {...field("name")} type="text" autoComplete="name" required maxLength={CONTACT_LIMITS.name} />
          {error("name")}
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Your email</span>
          <input {...field("email")} type="email" autoComplete="email" inputMode="email" required maxLength={CONTACT_LIMITS.email} />
          {error("email")}
        </label>
      </div>
      <label className={styles.field}>
        <span className={styles.label}>
          Subject <span className={styles.optional}>(optional)</span>
        </span>
        <input {...field("subject")} type="text" maxLength={CONTACT_LIMITS.subject} />
        {error("subject")}
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Message</span>
        <textarea {...field("message")} rows={5} required minLength={CONTACT_LIMITS.messageMin} maxLength={CONTACT_LIMITS.message} />
        {error("message")}
      </label>
      {/* Left empty by people; bots fill it in. */}
      <div className={styles.trap} aria-hidden="true">
        <label>
          Company
          <input type="text" name="company" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <div className={styles.footer}>
        <button type="submit" className="pixel-button" data-variant="primary" disabled={status.kind === "sending"}>
          {status.kind === "sending" ? "Sending…" : "Send message"}
        </button>
        <p className={styles.status} role="status" data-kind={status.kind}>
          {status.text}
          {status.kind === "error" && (
            <>
              {" "}
              <a href={`mailto:${email}`}>Email me instead</a>.
            </>
          )}
        </p>
      </div>
    </form>
  );
}
