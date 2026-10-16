import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { ProgressRecord } from '@/src/entities/models/tutorial-progress';
import { progressRecordArbitrary } from '@/tests/unit/entities/tutorial-arbitraries';
type ProgressRecordIdentity = Pick<ProgressRecord, 'memberId' | 'organizationId' | 'tutorialId'>;
function progressRecordKey(record: ProgressRecordIdentity): string {
  return JSON.stringify([record.memberId, record.organizationId, record.tutorialId]);
}
describe('ProgressRecord identity Property 25', () => {
  // Feature: guided-user-tutorials, Property 25: Progress Records are isolated by member, organization, and tutorial
  // **Validates: Requirements 9.1**
  it('does not collide when the member, organization, or tutorial differs', () => {
    fc.assert(
      fc.property(progressRecordArbitrary, (record) => {
        const records: readonly ProgressRecord[] = [
          record,
          { ...record, memberId: `${record.memberId}-other` },
          { ...record, organizationId: `${record.organizationId}-other` },
          { ...record, tutorialId: `${record.tutorialId}-other` },
        ];
        const recordsByIdentity = new Map(
          records.map((progressRecord) => [progressRecordKey(progressRecord), progressRecord]),
        );
        expect(recordsByIdentity).toHaveLength(records.length);
        for (const progressRecord of records) {
          expect(recordsByIdentity.get(progressRecordKey(progressRecord))).toBe(progressRecord);
        }
      }),
      { numRuns: 100 },
    );
  });
});
