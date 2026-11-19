import { Injectable, Logger } from '@nestjs/common';
import type { EmailPayload, EmailPort } from './email.port';

/**
 * Console email adapter — logs emails to stdout (dev/test/mock mode).
 * Used when INTEGRATIONS_MODE=mock or SMTP_HOST is unset.
 */
@Injectable()
export class ConsoleEmailAdapter implements EmailPort {
  private readonly logger = new Logger('EmailPort[console]');

  async send(payload: EmailPayload): Promise<void> {
    this.logger.log(`EMAIL TO: ${payload.to} | SUBJECT: ${payload.subject}`);
    this.logger.debug(payload.text);
  }
}
