import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import { getServerBranding } from "@/lib/branding-server";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendPasswordResetEmail(input: {
  toEmail: string;
  toName: string;
  resetUrl: string;
  expiresAtIso: string;
}) {
  const branding = await getServerBranding();
  const mailbox = await prisma.mailbox.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
  });

  if (!mailbox) {
    console.warn("[password-reset] No active mailbox configured. Reset email cannot be sent.");
    return { sent: false as const, reason: "mailbox_not_configured" as const };
  }

  const transport = nodemailer.createTransport({
    host: mailbox.smtpHost,
    port: mailbox.smtpPort,
    secure: mailbox.smtpPort === 465,
    auth: { user: mailbox.username, pass: mailbox.password },
    tls: { rejectUnauthorized: false },
  });

  const expiresText = new Date(input.expiresAtIso).toLocaleString();
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#1f2937;">
      <p>Hello ${escapeHtml(input.toName || "User")},</p>
      <p>We received a request to reset your ${escapeHtml(branding.appName)} password.</p>
      <p>
        <a href="${input.resetUrl}" style="display:inline-block;background:#FE0000;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;">
          Reset Password
        </a>
      </p>
      <p>If the button does not work, use this link:</p>
      <p><a href="${input.resetUrl}" style="color:#c30000;">${escapeHtml(input.resetUrl)}</a></p>
      <p>This link will expire on <strong>${escapeHtml(expiresText)}</strong>.</p>
      <p>If you did not request this, you can safely ignore this email.</p>
    </div>
  `;

  const text = [
    `Hello ${input.toName || "User"},`,
    "",
    `We received a request to reset your ${branding.appName} password.`,
    `Reset link: ${input.resetUrl}`,
    `This link expires at: ${expiresText}`,
    "",
    "If you did not request this, you can safely ignore this email.",
  ].join("\n");

  await transport.sendMail({
    from: `${mailbox.name} <${mailbox.email}>`,
    to: input.toEmail,
    subject: `${branding.appName} Password Reset`,
    html,
    text,
  });

  return { sent: true as const };
}
