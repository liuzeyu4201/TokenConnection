export type MailMessage = {
  to: string;
  subject: string;
  text: string;
};

export type MailTransport = {
  send(message: MailMessage): Promise<void>;
};

let testTransport: MailTransport | null = null;

/** Tests inject a transport. Production uses nodemailer only when SMTP_URL is set. */
export function setMailTransportForTests(transport: MailTransport | null): void {
  testTransport = transport;
}

export function smtpConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.SMTP_URL?.trim());
}

/**
 * Send one plain-text message. Returns false when SMTP is not configured,
 * so callers can fall back to copying a link. Never throws for a missing URL.
 */
export async function sendMail(message: MailMessage): Promise<boolean> {
  if (!smtpConfigured()) return false;
  const transport = testTransport ?? (await nodemailerTransport());
  await transport.send(message);
  return true;
}

async function nodemailerTransport(): Promise<MailTransport> {
  const url = process.env.SMTP_URL?.trim() ?? "";
  const nodemailer = await import("nodemailer");
  const from = process.env.SMTP_FROM?.trim() || "朋友圈 <noreply@localhost>";
  const smtp = nodemailer.createTransport(url);
  return {
    async send(message) {
      await smtp.sendMail({ from, to: message.to, subject: message.subject, text: message.text });
    },
  };
}
