import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { configuration } from '../../../config/configuration';
import type { EmailPayload, EmailPort } from './email.port';

/**
 * SMTP email adapter — sends via nodemailer (Mailhog in dev at localhost:1025).
 * Used when INTEGRATIONS_MODE=live and SMTP_HOST is set.
 *
 * To view emails locally: http://localhost:8025 (Mailhog web UI).
 * To run the email worker: the BullMQ 'email' queue processor in
 * src/modules/auth/email/email-queue.processor.ts handles retries.
 */
@Injectable()
export class SmtpEmailAdapter implements EmailPort {
  private readonly logger = new Logger('EmailPort[smtp]');
  private readonly transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: configuration.SMTP_HOST ?? 'localhost',
      port: configuration.SMTP_PORT ?? 1025,
      auth: configuration.SMTP_USER
        ? { user: configuration.SMTP_USER, pass: configuration.SMTP_PASS }
        : undefined,
      secure: false,
    });
  }

  async send(payload: EmailPayload): Promise<void> {
    await this.transporter.sendMail({
      from: configuration.SMTP_FROM ?? '"MARBOU" <no-reply@marbou.test>',
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    });
    this.logger.log(`Sent email to ${payload.to}: ${payload.subject}`);
  }
}
