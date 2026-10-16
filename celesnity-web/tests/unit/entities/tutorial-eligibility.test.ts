import { describe, expect, it } from 'vitest';

import {
  evaluateEligibility,
  type EligibilityInput,
} from '@/src/entities/models/tutorial-eligibility';

describe('evaluateEligibility', () => {
  it('reports eligible when feature, prerequisite, and context requirements are satisfied', () => {
    const input: EligibilityInput = {
      requiredFeatures: ['HOME', 'QUERY'],
      accessibleFeatures: ['QUERY', 'HOME', 'ANALYTICS'],
      prerequisiteStates: [
        { id: 'connected-source', satisfied: true },
        { id: 'created-database', satisfied: true },
      ],
      contextRequirements: [{ id: 'database', resourceType: 'DATABASE', selectionCount: 2 }],
      contextSelections: [
        {
          requirementId: 'database',
          resourceType: 'DATABASE',
          resourceId: 'database-1',
          resourceName: 'Orders',
        },
        {
          requirementId: 'database',
          resourceType: 'DATABASE',
          resourceId: 'database-2',
          resourceName: 'Customers',
        },
      ],
    };

    expect(evaluateEligibility(input)).toEqual({
      eligible: true,
      blockingFeatureIds: [],
      unsatisfiedPrerequisiteIds: [],
      unfilledContextRequirementIds: [],
    });
  });

  it('returns every blocker across features, prerequisites, and context requirements', () => {
    const input: EligibilityInput = {
      requiredFeatures: ['HOME', 'QUERY', 'ANALYTICS'],
      accessibleFeatures: ['HOME'],
      prerequisiteStates: [
        { id: 'connected-source', satisfied: false },
        { id: 'created-database', satisfied: true },
        { id: 'loaded-data', satisfied: false },
      ],
      contextRequirements: [
        { id: 'database', resourceType: 'DATABASE', selectionCount: 2 },
        { id: 'pipeline', resourceType: 'PIPELINE', selectionCount: 1 },
        { id: 'connection', resourceType: 'CONNECTION', selectionCount: 1 },
      ],
      contextSelections: [
        { requirementId: 'database', resourceType: 'DATABASE', resourceId: 'database-1' },
        { requirementId: 'pipeline', resourceType: 'CONNECTION', resourceId: 'connection-1' },
        {
          requirementId: 'connection',
          resourceType: 'CONNECTION',
          resourceId: 'connection-1',
        },
      ],
    };

    expect(evaluateEligibility(input)).toEqual({
      eligible: false,
      blockingFeatureIds: ['QUERY', 'ANALYTICS'],
      unsatisfiedPrerequisiteIds: ['connected-source', 'loaded-data'],
      unfilledContextRequirementIds: ['database', 'pipeline'],
    });
  });

  it('counts only distinct, non-empty selections matching the requirement and resource type', () => {
    const input: EligibilityInput = {
      requiredFeatures: [],
      accessibleFeatures: [],
      prerequisiteStates: [],
      contextRequirements: [{ id: 'database', resourceType: 'DATABASE', selectionCount: 2 }],
      contextSelections: [
        { requirementId: 'database', resourceType: 'DATABASE', resourceId: 'database-1' },
        { requirementId: 'database', resourceType: 'DATABASE', resourceId: 'database-1' },
        { requirementId: 'database', resourceType: 'CONNECTION', resourceId: 'database-2' },
        { requirementId: 'other', resourceType: 'DATABASE', resourceId: 'database-3' },
        { requirementId: 'database', resourceType: 'DATABASE', resourceId: '  ' },
      ],
    };

    expect(evaluateEligibility(input)).toEqual({
      eligible: false,
      blockingFeatureIds: [],
      unsatisfiedPrerequisiteIds: [],
      unfilledContextRequirementIds: ['database'],
    });
  });

  it('supports tutorials with no blocking requirements', () => {
    expect(
      evaluateEligibility({
        requiredFeatures: [],
        accessibleFeatures: [],
        prerequisiteStates: [],
        contextRequirements: [],
        contextSelections: [],
      }),
    ).toEqual({
      eligible: true,
      blockingFeatureIds: [],
      unsatisfiedPrerequisiteIds: [],
      unfilledContextRequirementIds: [],
    });
  });
});
