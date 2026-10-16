import { Module } from '@nestjs/common';

import { StreamingModule } from '@modules/streaming.module';
import { StreamingReconcilerWorker } from '@infrastructure/worker/streaming/streaming-reconciler.worker';

@Module({
  imports: [StreamingModule],
  providers: [StreamingReconcilerWorker],
})
export class StreamingWorkerModule {}
