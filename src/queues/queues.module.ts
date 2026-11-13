import { Global, Module } from '@nestjs/common';
import { QueuesService } from './queues.service';
import { JobRunService } from './job-run.service';

@Global()
@Module({
  providers: [QueuesService, JobRunService],
  exports: [QueuesService, JobRunService],
})
export class QueuesModule {}
