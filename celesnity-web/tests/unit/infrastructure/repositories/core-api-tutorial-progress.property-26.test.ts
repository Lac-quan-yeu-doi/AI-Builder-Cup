import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type {
  ContextSelection,
  ProgressRecord,
  TutorialStatus,
} from '@/src/entities/models/tutorial-progress';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { CoreApiTutorialProgressRepository } from '@/src/infrastructure/repositories/core-api-tutorial-progress.repository';
import { progressRecordArbitrary } from '@/tests/unit/entities/tutorial-arbitraries';

interface SaveProgressRequestDto {
  readonly status: TutorialStatus;
  readonly currentStepId: string;
  readonly completedStepIds: readonly string[];
  readonly contextSelections: readonly ContextSelection[];
  readonly updatedAt: string;
}

const progressRecordEntityArbitrary: fc.Arbitrary<ProgressRecord> = progressRecordArbitrary.map(
  ({ contextSelections, ...record }) => ({
    ...record,
    contextSelections: contextSelections.map(({ requirementId, resourceType, resourceId }) => ({
      requirementId,
      resourceType,
      resourceId,
    })),
  }),
);

class PersistedProgressTransport implements GeneratedApiTransport {
  private persistedRecord: ProgressRecord | null = null;

  public constructor(
    private readonly memberId: string,
    private readonly organizationId: string,
  ) {}

  public async request<TResponse>(path: string, init?: RequestInit): Promise<TResponse> {
    if (path === '/tutorial-progress' && init?.method === 'GET') {
      const records = this.persistedRecord === null ? [] : [this.persistedRecord];
      return records as TResponse;
    }

    const progressPathPrefix = '/tutorial-progress/';
    if (path.startsWith(progressPathPrefix) && init?.method === 'PUT') {
      const request = JSON.parse(String(init.body)) as SaveProgressRequestDto;
      this.persistedRecord = {
        tutorialId: decodeURIComponent(path.slice(progressPathPrefix.length)),
        memberId: this.memberId,
        organizationId: this.organizationId,
        status: request.status,
        currentStepId: request.currentStepId,
        completedStepIds: [...request.completedStepIds],
        contextSelections: request.contextSelections.map((selection) => ({ ...selection })),
        updatedAt: request.updatedAt,
      };
      return this.persistedRecord as TResponse;
    }

    throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${path}`);
  }

  public stream(): Promise<Response> {
    throw new Error('stream() is not used by this repository');
  }
}

describe('CoreApiTutorialProgressRepository Property 26', () => {
  // Feature: guided-user-tutorials, Property 26: Persisted progress round-trips on restore
  // **Validates: Requirements 9.10**
  it('restores an equivalent Progress Record after saving it for the member', async () => {
    await fc.assert(
      fc.asyncProperty(progressRecordEntityArbitrary, async (record) => {
        const transport = new PersistedProgressTransport(record.memberId, record.organizationId);
        const repository = new CoreApiTutorialProgressRepository(transport);

        await repository.save(record);
        const restoredRecords = await repository.listForMember();

        expect(restoredRecords).toEqual([record]);
      }),
      { numRuns: 100 },
    );
  });
});
