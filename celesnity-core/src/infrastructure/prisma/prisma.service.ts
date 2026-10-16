import { Injectable, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';

import { type Prisma, PrismaClient } from '@generated/prisma/client';
import { PrismaTransactionContext } from '@infrastructure/prisma/prisma-transaction.context';
import {
  AuthenticatedContextStore,
  type AuthenticatedContext,
} from '@application/administration/authenticated-context';
import { isWorkspaceFeature } from '@application/administration/workspace-feature';

/**
 * How long a claimed transaction may wait for a connection, and how long it may
 * hold one. Both are short on purpose: every transaction in this application is
 * a handful of statements against indexed rows, so a transaction that runs long
 * is a symptom, not a workload to accommodate.
 */
const TRANSACTION_MAX_WAIT_MS = 5_000;
const TRANSACTION_TIMEOUT_MS = 15_000;

const AGENT_ROOM_DELEGATION_SELECT = {
  organizationId: true,
  agentName: true,
  mfaVerifiedUntil: true,
  organization: {
    select: { status: true, identityTenantId: true, mfaRequired: true },
  },
  boundBy: {
    select: {
      id: true,
      subject: true,
      identityTenantId: true,
      email: true,
      status: true,
      memberships: { select: { id: true, organizationId: true, role: true } },
    },
  },
} as const satisfies Prisma.AgentRoomBindingSelect;

type AgentRoomDelegationBinding = Prisma.AgentRoomBindingGetPayload<{
  select: typeof AGENT_ROOM_DELEGATION_SELECT;
}>;

/**
 * Owns the Prisma client and decides which client a caller gets.
 *
 * Two things changed here relative to the obvious `extends PrismaClient`:
 *
 *  - **It no longer extends the client.** Extending meant every injected
 *    repository received the whole `PrismaClient` surface: the connection
 *    registry's repository could call `$disconnect`, open its own nested
 *    transaction, or write to `execution`. Holding the client instead of being
 *    one lets the accessor hand back {@link Prisma.TransactionClient}, which is
 *    the model delegates without `$transaction`, `$connect` or `$disconnect`. A
 *    repository is now structurally unable to manage the connection or start a
 *    transaction behind the unit of work's back.
 *
 *  - **{@link PrismaService.client} is transaction-aware.** It returns the
 *    ambient transaction client when one is active and the base client
 *    otherwise. A repository therefore cannot read outside the transaction it is
 *    running in, which used to be possible — and silently was, for every
 *    `findById`.
 *
 * Only {@link PrismaService.transaction} reaches the real client, and only the
 * unit of work calls it.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnApplicationShutdown {
  private readonly prisma: PrismaClient;
  private readonly delegationBindings: PrismaClient['agentRoomBinding'];
  private readonly serviceIdentities: PrismaClient['organizationServiceIdentity'];
  private readonly agentRunScopes: PrismaClient['agentRunScope'];

  public constructor(
    config: ConfigService,
    private readonly transactions: PrismaTransactionContext,
    private readonly authenticatedContexts: AuthenticatedContextStore,
  ) {
    const connectionString = config.getOrThrow<string>('DATABASE_URL');
    const fallbackOrganizationId = config.getOrThrow<string>('DEFAULT_ORGANIZATION_ID');
    const baseClient = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    this.delegationBindings = baseClient.agentRoomBinding;
    this.serviceIdentities = baseClient.organizationServiceIdentity;
    this.agentRunScopes = baseClient.agentRunScope;
    this.prisma = baseClient.$extends({
      name: 'organization-boundary',
      query: {
        $allModels: {
          $allOperations: async ({ model, operation, args, query }) => {
            if (!isOrganizationScopedModel(model)) return query(args);
            const requestContext = this.authenticatedContexts.current();
            if (requestContext === undefined && !CREATE_OPERATIONS.has(operation))
              return query(args);
            const organizationId = requestContext?.organizationId ?? fallbackOrganizationId;
            return query(scopePrismaArguments(operation, args, organizationId));
          },
        },
      },
    }) as unknown as PrismaClient;
  }

  /**
   * The client every repository, reader and mapper must use.
   *
   * Inside {@link PrismaService.transaction} this is the transaction client, so
   * reads see the uncommitted writes of the same unit of work. Outside, it is
   * the base client and each statement is its own implicit transaction.
   */
  public get client(): Prisma.TransactionClient {
    return this.transactions.current() ?? this.prisma;
  }

  /** Narrow bootstrap read; caller supplies the persisted job's organization, never a default. */
  public async resolveBackgroundIdentity(organizationId: string): Promise<AuthenticatedContext> {
    return this.resolveServiceIdentity(organizationId, 'BACKGROUND');
  }

  /** Agent identity is a different row and has its own permission/feature ceiling. */
  public async resolveAgentIdentity(organizationId: string): Promise<AuthenticatedContext> {
    return this.resolveServiceIdentity(organizationId, 'AGENT');
  }

  private async resolveServiceIdentity(
    organizationId: string,
    purpose: 'BACKGROUND' | 'AGENT',
  ): Promise<AuthenticatedContext> {
    const binding = await this.serviceIdentities.findUnique({
      where: { organizationId_purpose: { organizationId, purpose } },
      include: { organization: true, identity: { include: { memberships: true } } },
    });
    const now = Date.now();
    const membership = binding?.identity.memberships.find(
      (item) =>
        item.organizationId === organizationId &&
        item.role === 'SERVICE_ACCOUNT' &&
        item.status === 'ACTIVE' &&
        (item.expiresAt === null || item.expiresAt.getTime() > now),
    );
    if (
      !binding ||
      !binding.enabled ||
      binding.purpose !== purpose ||
      binding.organizationId !== organizationId ||
      binding.organization.status !== 'ACTIVE' ||
      binding.identity.status !== 'ACTIVE' ||
      binding.identity.provider !== 'organization-service' ||
      !membership ||
      binding.identity.memberships.some((item) => item.organizationId !== organizationId) ||
      binding.permissions.some(
        (value) => value !== 'workspace:read' && value !== 'workspace:write',
      ) ||
      binding.features.some((value) => !isWorkspaceFeature(value))
    ) {
      throw new Error(`${purpose} service identity is missing, inactive, or invalid`);
    }
    return {
      identityId: binding.identityId,
      subject: binding.identity.subject,
      identityTenantId: binding.organization.identityTenantId ?? `service:${organizationId}`,
      organizationId,
      organizationStatus: 'ACTIVE',
      membershipId: membership.id,
      role: 'SERVICE_ACCOUNT',
      // Service authentication is not human MFA. Never pretend MFA was performed.
      mfaRequired: false,
      mfaVerified: false,
      authenticationTime: Math.floor(now / 1000),
      servicePermissions: binding.permissions.filter(
        (value): value is 'workspace:read' | 'workspace:write' =>
          value === 'workspace:read' || value === 'workspace:write',
      ),
      visibleFeatures: binding.features.filter(isWorkspaceFeature),
    };
  }

  /**
   * Bootstrap delegation before the human tenant is known. Only this read skips
   * the ambient machine tenant; ordinary binding reads and writes remain scoped.
   * The repository must validate the returned identity, tenant and membership
   * before installing the human context or executing any tool.
   */
  public findAgentRoomDelegationBinding(
    roomId: string,
    callerSubject: string,
  ): Promise<AgentRoomDelegationBinding | null> {
    return this.delegationBindings.findFirst({
      where: { roomId, boundBy: { subject: callerSubject } },
      select: {
        ...AGENT_ROOM_DELEGATION_SELECT,
        boundBy: {
          select: {
            ...AGENT_ROOM_DELEGATION_SELECT.boundBy.select,
            memberships: {
              where: {
                status: 'ACTIVE',
                OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
              },
              select: AGENT_ROOM_DELEGATION_SELECT.boundBy.select.memberships.select,
            },
          },
        },
      },
    });
  }

  /** Narrow unscoped bootstrap read, subsequently checked against resolved room/human identity. */
  public findAgentRunScope(runId: string): ReturnType<PrismaClient['agentRunScope']['findUnique']> {
    return this.agentRunScopes.findUnique({ where: { runId } });
  }

  /**
   * Runs `work` in one interactive transaction with the client bound as ambient.
   *
   * The isolation level is left at PostgreSQL's default, Read Committed, and that
   * is a decision rather than an omission: concurrency here is enforced by
   * guarded `updateMany` statements whose `where` clause repeats the state the
   * aggregate was loaded in. That guard is what makes a lost update impossible,
   * and it works at Read Committed because the guarded `UPDATE` re-reads the row
   * under a write lock. Raising the level would add serialization failures the
   * callers would then have to retry, for no extra safety.
   */
  public transaction<T>(work: (client: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((client) => this.transactions.run(client, () => work(client)), {
      maxWait: TRANSACTION_MAX_WAIT_MS,
      timeout: TRANSACTION_TIMEOUT_MS,
    });
  }

  /** True while a transaction is in effect for the current call stack. */
  public get inTransaction(): boolean {
    return this.transactions.current() !== undefined;
  }

  public get organizationId(): string | undefined {
    return this.authenticatedContexts.current()?.organizationId;
  }

  public async onModuleInit(): Promise<void> {
    await this.prisma.$connect();
  }

  public async onApplicationShutdown(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

const ORGANIZATION_SCOPED_MODELS = new Set([
  'OrganizationServiceIdentity',
  'Tenant',
  'MqttStreamAdapter',
  'StreamingProvisioningAttempt',
  'Device',
  'MeasurementPoint',
  'DeviceLifecycleTransition',
  'DeviceProvisioningAttempt',
  'DeviceAlert',
  'DeviceLog',
  'DeviceConfiguration',
  'DeviceConfigurationTemplate',
  'FirmwareRelease',
  'FirmwareDeployment',
  'FirmwareCampaign',
  'FirmwareCampaignTarget',
  'DatabaseService',
  'DatabaseServiceCdcConnectionProfile',
  'Pipeline',
  'PipelineVersion',
  'PipelineCompiledArtifact',
  'Script',
  'ScriptVersion',
  'Execution',
  'SqlExecution',
  'OutboxEvent',
  'MetadataCrawler',
  'DatabaseMetadataCrawler',
  'MetadataCrawlerRun',
  'MetadataCrawlerRunScope',
  'CatalogNamespace',
  'CatalogRelation',
  'CatalogColumn',
  'CatalogConstraint',
  'CatalogConstraintColumn',
  'CatalogNamespaceDescription',
  'MessageBlock',
  'AgentRoomBinding',
  'AgentRunScope',
  'AuditEvent',
  'PlantSite',
  'PlantModelVersion',
  'PlantDashboardAssociation',
  'DataWorkflow',
  'DataWorkflowVersion',
  'DataWorkflowSchedule',
  'DataWorkflowRun',
  'DataWorkflowNodeAttempt',
  'DataWorkflowEdgeState',
  'DataWorkflowRetryAcknowledgement',
  'DataWorkflowWatchSource',
  'DataWorkflowWatchSourceSubscription',
  'DataWorkflowWatchSourceCheckpoint',
  'DataWorkflowWatchSourceNotificationBatch',
  'DataWorkflowWatchSourceNotification',
  'DataWorkflowWatchSourceDeliveryAssignment',
  'TutorialProgress',
  'TutorialOnboardingDecision',
  'TutorialCompletion',
]);

export function isOrganizationScopedModel(model: string | undefined): boolean {
  return model !== undefined && ORGANIZATION_SCOPED_MODELS.has(model);
}

export function scopePrismaArguments<T>(operation: string, original: T, organizationId: string): T {
  const args = original as Record<string, unknown>;
  if (operation === 'create') {
    return { ...args, data: withOrganization(args.data, organizationId) } as T;
  }
  if (operation === 'createMany' || operation === 'createManyAndReturn') {
    const data = Array.isArray(args.data)
      ? args.data.map((entry) => withOrganization(entry, organizationId))
      : withOrganization(args.data, organizationId);
    return { ...args, data } as T;
  }
  if (operation === 'upsert') {
    return {
      ...args,
      where: withOrganization(args.where, organizationId),
      create: withOrganization(args.create, organizationId),
    } as T;
  }
  if (SCOPED_WHERE_OPERATIONS.has(operation)) {
    return { ...args, where: withOrganization(args.where, organizationId) } as T;
  }
  return original;
}

const SCOPED_WHERE_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
]);
const CREATE_OPERATIONS = new Set(['create', 'createMany', 'createManyAndReturn', 'upsert']);

function withOrganization(value: unknown, organizationId: string): Record<string, unknown> {
  const record =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  return { ...record, organizationId };
}
