import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  FtpsConnectorService,
  type FtpsConnectorConfiguration,
} from '@application/ftps-connector/ftps-connector.service';
import { FTPS_STATUS_READER } from '@application/ftps-connector/tokens';
import type { IFtpsStatusReader } from '@application/ftps-connector/interfaces/i-ftps-status-reader';
import type { IClock } from '@application/shared/interfaces/i-clock';
import { CLOCK } from '@application/shared/tokens';
import { SftpGoFtpsStatusReader } from '@infrastructure/ftps/sftpgo-ftps-status.reader';
import { SystemClock } from '@infrastructure/system/system-clock';
import { FtpsConnectorController } from '@presentation/ftps-connector/ftps-connector.controller';

@Module({
  controllers: [FtpsConnectorController],
  providers: [
    SftpGoFtpsStatusReader,
    SystemClock,
    { provide: FTPS_STATUS_READER, useExisting: SftpGoFtpsStatusReader },
    { provide: CLOCK, useExisting: SystemClock },
    {
      provide: FtpsConnectorService,
      inject: [FTPS_STATUS_READER, ConfigService, CLOCK],
      useFactory: (
        statusReader: IFtpsStatusReader,
        config: ConfigService,
        clock: IClock,
      ): FtpsConnectorService =>
        new FtpsConnectorService(
          statusReader,
          {
            host: config.getOrThrow<string>('FTPS_PUBLIC_HOST'),
            port: config.getOrThrow<number>('FTPS_PUBLIC_PORT'),
            remotePath: config.getOrThrow<string>('FTPS_REMOTE_PATH'),
            username: config.getOrThrow<string>('FTPS_DEMO_USERNAME'),
            password: config.getOrThrow<string>('FTPS_DEMO_PASSWORD'),
          } satisfies FtpsConnectorConfiguration,
          clock,
        ),
    },
  ],
})
export class FtpsConnectorModule {}
