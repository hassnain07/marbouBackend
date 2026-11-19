/**
 * EmailPort — interface for the email sending abstraction.
 * Implementations: SmtpEmailAdapter (nodemailer → Mailhog/SMTP), ConsoleEmailAdapter (dev/test).
 * Sent through the BullMQ 'email' queue with retries.
 */
export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export const EMAIL_PORT = 'EMAIL_PORT';

export interface EmailPort {
  send(payload: EmailPayload): Promise<void>;
}
