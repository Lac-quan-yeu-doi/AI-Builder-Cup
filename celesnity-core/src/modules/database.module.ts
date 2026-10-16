import { Global, Module } from '@nestjs/common';

import { UNIT_OF_WORK } from '@application/shared/tokens';
import { PrismaOutboxWriter } from '@infrastructure/prisma/messaging/prisma-outbox.writer';
import { PrismaService } from '@infrastructure/prisma/prisma.service';
import { PrismaTransactionContext } from '@infrastructure/prisma/prisma-transaction.context';
import { PrismaUnitOfWork } from '@infrastructure/prisma/prisma-unit-of-work';
import { PostgresConnectionPoolFactory } from '@infrastructure/postgres/postgres-connection-pool.factory';
import { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import { AutomationChartPreviewStore } from '@application/chart/automation-chart-preview.store';
import { BackgroundIdentityBinding } from '@infrastructure/prisma/administration/background-identity.binding';

/**
 * Persistence wiring, global because every context needs the same client and the
 * same unit of work.
 *
 * {@link PrismaTransactionContext} must be a singleton for the ambient transaction
 * to work: the service that opens a transaction and the repositories that resolve
 * it have to share one `AsyncLocalStorage` instance. A `@Global` module in the root
 * injector gives exactly that.
 */
@Global()
@Module({
  providers: [
    AuthenticatedContextStore,
    AutomationChartPreviewStore,
    PrismaTransactionContext,
    PrismaService,
    BackgroundIdentityBinding,
    PostgresConnectionPoolFactory,
    PrismaOutboxWriter,
    PrismaUnitOfWork,
    { provide: UNIT_OF_WORK, useExisting: PrismaUnitOfWork },
  ],
  exports: [
    AuthenticatedContextStore,
    AutomationChartPreviewStore,
    PrismaService,
    PostgresConnectionPoolFactory,
    UNIT_OF_WORK,
  ],
})
export class DatabaseModule {}
