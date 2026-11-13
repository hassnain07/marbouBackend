import { Global, Logger, Module, OnModuleInit } from '@nestjs/common';
import { QueuesService } from './queues.service';
import { JobRunService } from './job-run.service';
import { QueueName } from './queue-names';

/**
 * QueuesModule registers BullMQ queues and processors. The echo processor is
 * registered here (not in QueuesService) so it has access to JobRunService for
 * writing JobRun records (item 11 of the Phase 0 review).
 */
@Global()
@Module({
  providers: [QueuesService, JobRunService],
  exports: [QueuesService, JobRunService],
})
export class QueuesModule implements OnModuleInit {
  private readonly logger = new Logger(QueuesModule.name);

  constructor(
    private readonly queues: QueuesService,
    private readonly jobRun: JobRunService,
  ) {}

  onModuleInit(): void {
    this.queues.registerProcessor(QueueName.ECHO, async (job) => {
      await this.jobRun.run(QueueName.ECHO, async (mark) => {
        this.logger.log(`echo job ${job.id}: ${JSON.stringify(job.data)}`);
        mark({ processed: 1 });
      });
    });
  }
}
