import nodemailer from "nodemailer";
import { getAuthEnv } from "./auth-env";

export function safeEmailHtml(value: string) {
  const escapes: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return value.replace(/[&<>"']/g, (c) => escapes[c] ?? c);
}

export async function sendAuthEmail(to: string, subject: string, link: string) {
  const cfg = getAuthEnv();
  const transport = nodemailer.createTransport({
    host: cfg.SMTP_HOST,
    port: cfg.SMTP_PORT,
    secure: cfg.SMTP_SECURE === "true",
    requireTLS: process.env.NODE_ENV === "production" && cfg.SMTP_SECURE !== "true",
    tls: { minVersion: "TLSv1.2" },
    ...(cfg.SMTP_USER && cfg.SMTP_PASSWORD ? { auth: { user: cfg.SMTP_USER, pass: cfg.SMTP_PASSWORD } } : {}),
  });
  const url = new URL(link);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error("Refusing to email an insecure authentication link");
  }
  const target = safeEmailHtml(link);
  await transport.sendMail({
    from: cfg.SMTP_FROM,
    to,
    subject,
    text: `Open this BuildTrack link: ${link}
If you didn't request this, ignore this email.`,
    html: `<p>Open your BuildTrack link:</p><p><a href="${target}">Continue securely</a></p><p>If you did not request this, ignore this email.</p>`,
  });
}
