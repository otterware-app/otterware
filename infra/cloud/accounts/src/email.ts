/** Account email (confirmation and password links), sent through Resend as Otter Drive does. */
import type { Env } from "./env.ts";

const RESEND_EMAILS_URL = "https://api.resend.com/emails";

type EmailEnv = Pick<Env, "EMAIL_FROM" | "RESEND_API_KEY">;

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]!,
  );
}

async function send(env: EmailEnv, to: string, subject: string, lines: string[], link: string) {
  if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured.");
  if (!env.EMAIL_FROM) throw new Error("EMAIL_FROM is not configured.");
  const [lead, action, ...after] = lines as [string, string, ...string[]];
  const paragraph = (text: string) =>
    `<p style="margin:0 0 16px;color:#5d5d5d;font-size:14px;line-height:1.6">${escapeHtml(text)}</p>`;
  const response = await fetch(RESEND_EMAILS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [to],
      subject,
      text: [lead, `${action}:\n\n${link}`, ...after].join("\n\n"),
      html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:420px;margin:0 auto;padding:32px 24px;color:#0d0d0d"><p style="margin:0 0 24px;font-weight:500">Otterware</p>${paragraph(lead)}<p style="margin:24px 0"><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#0d0d0d;color:#fff;font-size:14px;font-weight:500;text-decoration:none">${escapeHtml(action)}</a></p>${after.map(paragraph).join("")}</div>`,
    }),
  });
  if (!response.ok) throw new Error(`Resend rejected the email with status ${response.status}.`);
}

export const sendVerificationEmail = (env: EmailEnv, to: string, link: string) =>
  send(
    env,
    to,
    "Confirm your email for Otterware",
    [
      "Welcome to Otterware. Confirm your email address to finish creating your account.",
      "Confirm email",
      "The link works for one hour. If you didn't create an Otter account, you can ignore this email.",
    ],
    link,
  );

export const sendPasswordEmail = (env: EmailEnv, to: string, link: string) =>
  send(
    env,
    to,
    "Choose a password for Otterware",
    [
      `Someone asked to set a password for the Otter account ${to}. If it was you, choose one here.`,
      "Choose password",
      "The link works for one hour. If it wasn't you, ignore this email; your account hasn't changed.",
    ],
    link,
  );
