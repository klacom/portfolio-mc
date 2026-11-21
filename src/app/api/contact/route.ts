import { getContent } from "@/content";
import { checkContact } from "@/content/contact";

/**
 * Sends a contact-form message to the site owner through Resend (https://resend.com).
 * Needs RESEND_API_KEY; CONTACT_TO_EMAIL defaults to the profile's email, and CONTACT_FROM_EMAIL to
 * Resend's shared test sender, which can only deliver to the address the Resend account signed up with.
 */

const WINDOW_MS = 10 * 60 * 1000;
const PER_WINDOW = 5;
/** Best effort only: each server instance keeps its own count. */
const recent = new Map<string, number[]>();

function limited(ip: string): boolean {
  const now = Date.now();
  const times = (recent.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (times.length >= PER_WINDOW) {
    recent.set(ip, times);
    return true;
  }
  times.push(now);
  recent.set(ip, times);
  if (recent.size > 5000) recent.clear();
  return false;
}

type Outcome = { status: number; body: { ok: true } | { error: string; message: string; fields?: Record<string, string> } };

async function handle(fields: Record<string, unknown>, ip: string): Promise<Outcome> {
  // Bots fill the hidden "company" field or submit within a moment of the page loading. They get a
  // success response so they don't retry, and nothing is sent.
  if (typeof fields.company === "string" && fields.company.trim()) return { status: 200, body: { ok: true } };
  if (typeof fields.elapsed === "number" && fields.elapsed < 2500) return { status: 200, body: { ok: true } };

  const check = checkContact(fields);
  if (!check.ok) return { status: 400, body: { error: "invalid", message: "Some fields need another look.", fields: check.errors } };
  if (limited(ip)) return { status: 429, body: { error: "rate-limited", message: "That's a lot of messages in a short time. Please try again in a few minutes, or email me directly." } };

  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return { status: 503, body: { error: "not-configured", message: "The message form isn't connected yet. Please email me directly instead." } };
  const to = process.env.CONTACT_TO_EMAIL?.trim() || (await getContent()).profile.email;
  const from = process.env.CONTACT_FROM_EMAIL?.trim() || "Portfolio <onboarding@resend.dev>";
  const { name, email, subject, message } = check.value;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: email,
      subject: `Portfolio message: ${subject || `from ${name}`}`,
      text: `${message}\n\n---\nFrom: ${name} <${email}>\nSent from the contact form on your portfolio. Reply to this email to answer them.`,
    }),
  }).catch(() => null);
  if (!res?.ok) {
    // Resend says why in its reply (a wrong key, an unverified sender, or a test sender writing to someone
    // other than the account owner). Log that for the site owner; the visitor gets a plain message.
    const reason = res ? ((await res.json().catch(() => ({}))) as { name?: string; message?: string }) : null;
    console.error(`Contact form: Resend did not send the message (${res ? `${res.status} ${reason?.name ?? ""}: ${reason?.message ?? ""}` : "no response"})`);
    return { status: 502, body: { error: "send-failed", message: "Your message couldn't be sent just now. Please try again, or email me directly." } };
  }
  return { status: 200, body: { ok: true } };
}

/** Plain page for browsers without JavaScript, which post the form directly. */
function page(outcome: Outcome) {
  const body = outcome.body;
  const ok = "ok" in body;
  const text = "ok" in body ? "Thanks! Your message was sent. I'll reply by email." : body.message;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${ok ? "Message sent" : "Message not sent"}</title></head><body style="font:18px/1.6 system-ui,sans-serif;max-width:560px;margin:15vh auto;padding:0 20px;color:#1a1622"><h1 style="font-size:1.6rem">${ok ? "Message sent" : "Message not sent"}</h1><p>${text}</p><p><a href="/#contact">Back to the site</a></p></body></html>`;
  return new Response(html, { status: outcome.status, headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const type = request.headers.get("content-type") ?? "";
  const isForm = type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data");
  let fields: Record<string, unknown> = {};
  if (isForm) {
    const data = await request.formData().catch(() => null);
    if (data) for (const [k, v] of data.entries()) if (typeof v === "string") fields[k] = v;
  } else {
    const body = (await request.json().catch(() => null)) as unknown;
    if (body && typeof body === "object") fields = body as Record<string, unknown>;
  }
  const outcome = await handle(fields, ip);
  return isForm ? page(outcome) : Response.json(outcome.body, { status: outcome.status });
}
