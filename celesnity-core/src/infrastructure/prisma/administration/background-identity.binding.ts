import { Injectable } from '@nestjs/common';
import { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import { PrismaService } from '@infrastructure/prisma/prisma.service';

/** Composition-time binding avoids a context-store/Prisma dependency cycle. */
@Injectable()
export class BackgroundIdentityBinding {
  public constructor(contexts: AuthenticatedContextStore, prisma: PrismaService) {
    contexts.configureBackgroundResolver((organizationId) =>
      prisma.resolveBackgroundIdentity(organizationId),
    );
    contexts.configureAgentResolver((organizationId) => prisma.resolveAgentIdentity(organizationId));
  }
}
