/** Rules for the contact form, shared by the form and the server route that sends it. */
export const CONTACT_LIMITS = { name: 80, email: 254, subject: 120, messageMin: 10, message: 5000 } as const;

export type ContactInput = { name: string; email: string; subject: string; message: string };
export type ContactField = keyof ContactInput;
export type ContactCheck = { ok: true; value: ContactInput } | { ok: false; errors: Partial<Record<ContactField, string>> };

const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;

/** Trims and checks a message. Line breaks are removed from single-line fields. */
export function checkContact(raw: Partial<Record<string, unknown>>): ContactCheck {
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  const line = (v: unknown) => text(v).replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
  const value: ContactInput = {
    name: line(raw.name),
    email: line(raw.email),
    subject: line(raw.subject),
    message: text(raw.message).replace(/\r\n/g, "\n").trim(),
  };
  const errors: Partial<Record<ContactField, string>> = {};
  if (!value.name) errors.name = "Add your name.";
  else if (value.name.length > CONTACT_LIMITS.name) errors.name = `Keep your name under ${CONTACT_LIMITS.name} characters.`;
  if (!value.email) errors.email = "Add your email so I can reply.";
  else if (value.email.length > CONTACT_LIMITS.email || !EMAIL.test(value.email)) errors.email = "That email address doesn't look right.";
  if (value.subject.length > CONTACT_LIMITS.subject) errors.subject = `Keep the subject under ${CONTACT_LIMITS.subject} characters.`;
  if (value.message.length < CONTACT_LIMITS.messageMin) errors.message = "Write a little more so I know how to help.";
  else if (value.message.length > CONTACT_LIMITS.message) errors.message = `Keep the message under ${CONTACT_LIMITS.message} characters.`;
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}
