import nodemailer, { Transporter } from "nodemailer";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.secure,
    auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
  });
  return transporter;
}

export async function sendInvoiceEmail(input: {
  invoiceId: string;
  toEmail: string;
  subject: string;
  html: string;
  attachments?: Array<{ filename: string; content: Uint8Array; contentType: string }>;
}) {
  const log = async (status: "sent" | "failed", error?: string) => {
    await prisma.invoiceLog.create({
      data: {
        invoiceId: input.invoiceId,
        toEmail: input.toEmail,
        subject: input.subject,
        status,
        error,
      },
    });
  };

  try {
    const t = getTransporter();
    await t.sendMail({
      from: env.smtp.from,
      to: input.toEmail,
      subject: input.subject,
      html: input.html,
      attachments: input.attachments as never[],
    });
    await log("sent");
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await log("failed", message);
    return { ok: false, error: message };
  }
}
