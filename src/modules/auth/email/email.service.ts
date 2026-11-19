import { Inject, Injectable, Logger } from '@nestjs/common';
import { QueuesService } from '../../../queues/queues.service';
import { QueueName } from '../../../queues/queue-names';
import type { EmailPort, EmailPayload } from './email.port';
import { EMAIL_PORT } from './email.port';
import { otpTemplate, passwordResetNoticeTemplate, emailChangedNoticeTemplate } from './email.templates';

/**
 * EmailService — enqueues email jobs on the BullMQ 'email' queue.
 * The queue processor (InlineEmailProcessor) pulls from the queue and calls EmailPort.send().
 * Retries on failure; a failure log entry is created by the processor.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    @Inject(EMAIL_PORT) private readonly port: EmailPort,
    private readonly queues: QueuesService,
  ) {}

  async sendOtp(to: string, code: string, lang: 'ar' | 'en' = 'ar'): Promise<void> {
    const tpl = otpTemplate(code, lang);
    await this.enqueue({ to, ...tpl });
  }

  async sendPasswordResetNotice(to: string, lang: 'ar' | 'en' = 'ar'): Promise<void> {
    const tpl = passwordResetNoticeTemplate(lang);
    await this.enqueue({ to, ...tpl });
  }

  async sendEmailChangedNotice(to: string, newEmail: string, lang: 'ar' | 'en' = 'ar'): Promise<void> {
    const tpl = emailChangedNoticeTemplate(newEmail, lang);
    await this.enqueue({ to, ...tpl });
  }

  /** Direct send (used by queue processor). */
  async sendDirect(payload: EmailPayload): Promise<void> {
    await this.port.send(payload);
  }

  private async enqueue(payload: EmailPayload): Promise<void> {
    try {
      await this.queues.addJob(QueueName.EMAIL, payload);
    } catch (err) {
      // Degrade gracefully: log and try direct send if queue is unavailable
      this.logger.warn(`Email queue unavailable, sending directly: ${(err as Error).message}`);
      await this.port.send(payload).catch((e) =>
        this.logger.error(`Direct email send failed: ${(e as Error).message}`),
      );
    }
  }
}
