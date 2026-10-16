# Implementation Plan: Guided User Tutorials

## Overview

This plan implements Guided User Tutorials inside the existing celesnity-web
Clean Architecture, building strictly bottom-up so the dependency direction
enforced by `eslint-plugin-boundaries` is never violated:
`entities → ports → use cases → controllers/presenters → DI → infrastructure → app`.

Each task writes, modifies, or tests code and references the specific
requirements clauses and design correctness properties it implements. Pure
domain functions and use cases are covered by `fast-check` property tests (one
test per design Property, minimum 100 iterations, tagged
`// Feature: guided-user-tutorials, Property N: ...`). UI geometry, contrast,
focus, reduced motion, and one-shot side-effect ordering are covered by example,
integration, jsdom, snapshot, and Playwright visual tests as described in the
design's Testing Strategy.

Quality gate before claiming any task done: `npm test`, `npm run typecheck`,
`npm run lint`, `npm run format:check`, `npm run build`, and `npm run test:visual`
for anything that can move pixels.

## Tasks

- [x] 1. Project setup for the tutorials feature
  - [x] 1.1 Add fast-check dev dependency and shared arbitraries scaffold
    - Add `fast-check` as a dev dependency (`npm i -D fast-check`) with a pinned version
    - Create `tests/unit/entities/tutorial-arbitraries.ts` exporting generators for tutorial definitions, steps, progress records, eligibility inputs, catalog view states, mixed-authorization/typed resources, and payloads seeded with Sensitive Values
    - Confirm `fc.assert(prop, { numRuns: 100 })` integrates with Vitest via a trivial smoke property
    - _Requirements: 1.1_

  - [x] 1.2 Add feature-specific application error types
    - Extend `src/entities/errors/application-errors.ts` with `TutorialPublicationError` (carries `PublicationViolation[]`) and `TutorialAccessError` (carries no inaccessible identifiers/names/metadata)
    - _Requirements: 1.11, 12.9, 12.10_

- [x] 2. Implement tutorial definition entity and publication rules
  - [x] 2.1 Create tutorial-definition entity and `validatePublication`
    - Add `src/entities/models/tutorial-definition.ts` with `TutorialId`, `TutorialMetadata`, `ContextRequirement`, `PrerequisiteDescriptor`, `TutorialStep`, `TutorialDefinition`, `PublicationViolation`, `PublicationResult`, and `validatePublication`
    - Enforce identifier presence and stability, single metadata, non-empty ordered steps, at most one Required Action and one Target Control per step, explicit (possibly empty) feature/prerequisite/context sets, and metadata step-count consistency
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.13_

  - [x] 2.2 Write property test for identifier uniqueness
    - **Property 1: Identifier uniqueness across the catalog**
    - **Validates: Requirements 1.1**

  - [x] 2.3 Write property test for identifier preservation across revisions
    - **Property 2: Identifier is preserved across revisions**
    - **Validates: Requirements 1.2**

  - [x] 2.4 Write property test for successful publication of a fully valid definition
    - **Property 3: A definition satisfying every publication rule publishes**
    - **Validates: Requirements 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10**

  - [x] 2.5 Write property test for violation reporting and catalog immutability
    - **Property 4: Every publication violation is reported and the catalog is unchanged**
    - **Validates: Requirements 1.11, 1.12**

  - [x] 2.6 Write example tests for edge publication cases
    - Empty feature/prerequisite/context sets publish successfully; multiple published tutorials supported; single-metadata rejection
    - _Requirements: 1.5, 1.6, 1.7, 1.13, 1.3_

- [x] 3. Implement catalog filtering entity
  - [x] 3.1 Create tutorial-catalog entity
    - Add `src/entities/models/tutorial-catalog.ts` with `normalizeSearchTerm` (trim), `filterCatalog` (case-insensitive match on title/summary/category conjoined with status filters), and clear-to-full-catalog behavior
    - _Requirements: 2.7, 2.8, 2.9, 2.10_

  - [x] 3.2 Write property test for search trimming and case-insensitive matching
    - **Property 5: Search trims and matches case-insensitively across title, summary, and category**
    - **Validates: Requirements 2.7**

  - [x] 3.3 Write property test for search/filter conjunction
    - **Property 6: Filters combine with search as conjunction**
    - **Validates: Requirements 2.8**

  - [x] 3.4 Write property test for clearing search and filters
    - **Property 7: Clearing search and filters restores the full catalog from the start**
    - **Validates: Requirements 2.10**

- [x] 4. Implement progress arithmetic entity
  - [x] 4.1 Create tutorial-progress entity
    - Add `src/entities/models/tutorial-progress.ts` with `TutorialStatus`, `ProgressRecord`, `progressPercentage`, `markStepComplete` (idempotent distinct addition), and `resumePoint` (first incomplete step)
    - Enforce rounding to nearest whole number with halves up and clamping to [0, 100]
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 10.16_

  - [x] 4.2 Write property test for progress percentage formula, rounding, and bounds
    - **Property 24: Progress Percentage formula, rounding, and bounds**
    - **Validates: Requirements 9.2, 9.3, 9.4**

  - [x] 4.3 Write property test for idempotent step completion
    - **Property 23: Step completion is an idempotent addition**
    - **Validates: Requirements 8.7, 8.9, 9.5, 9.6**

  - [x] 4.4 Write property test for progress record isolation
    - **Property 25: Progress Records are isolated by member, organization, and tutorial**
    - **Validates: Requirements 9.1**

  - [x] 4.5 Write property test for the resume point
    - **Property 28: The Resume Point is the first incomplete step**
    - **Validates: Requirements 10.16**

- [x] 5. Implement eligibility entity
  - [x] 5.1 Create tutorial-eligibility entity
    - Add `src/entities/models/tutorial-eligibility.ts` with `EligibilityInput`, `EligibilityResult`, and `evaluateEligibility` composing feature access, prerequisite satisfaction, and context validity, returning complete blocker lists
    - _Requirements: 3.5, 3.8, 3.12, 3.13, 10.8, 10.9, 10.10, 10.12_

  - [x] 5.2 Write property test for start availability and complete blocker lists
    - **Property 13: Start is available exactly when there are no blocking conditions**
    - **Validates: Requirements 3.5, 3.8, 3.12, 3.13, 10.8, 10.9, 10.10, 10.12**

- [x] 6. Implement run/status transition entity
  - [x] 6.1 Create tutorial-run entity
    - Add `src/entities/models/tutorial-run.ts` with `canAdvanceNext`, `isFirstStep`, `isFinalStep`, and `applyCompletion` (idempotent completion)
    - _Requirements: 5.1, 5.2, 8.2, 8.3, 8.4, 8.5, 8.6, 8.8, 8.11, 8.13, 8.14, 8.17, 8.18, 11.1, 11.6_

  - [x] 6.2 Write property test for Previous availability and non-advancing navigation
    - **Property 21: Previous availability and non-advancing navigation**
    - **Validates: Requirements 8.2, 8.3, 8.6, 8.11**

  - [x] 6.3 Write property test for forward availability gating
    - **Property 22: Forward availability reflects required action, target, and destination readiness**
    - **Validates: Requirements 7.7, 8.4, 8.5, 8.8, 8.13, 8.14**

  - [x] 6.4 Write property test for Finish behavior on the final step
    - **Property 29: Finish applies completion without advancing past the final step**
    - **Validates: Requirements 8.17, 8.18**

  - [x] 6.5 Write property test for idempotent completion outcome
    - **Property 30: Completion is a single idempotent outcome**
    - **Validates: Requirements 11.1, 11.6**

- [x] 7. Implement onboarding entity
  - [x] 7.1 Create onboarding entity
    - Add `src/entities/models/onboarding.ts` with `OnboardingDecision`, auto-visibility rule (auto-present iff no persisted decision), and accessible-recommendation selection
    - _Requirements: 4.1, 4.3, 4.10_

  - [x] 7.2 Write property test for onboarding auto-visibility
    - **Property 14: Onboarding auto-visibility follows the persisted decision**
    - **Validates: Requirements 4.1, 4.10**

  - [x] 7.3 Write property test for accessible onboarding recommendation
    - **Property 15: An onboarding recommendation is accessible when one exists**
    - **Validates: Requirements 4.3**

- [x] 8. Checkpoint - entities
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Define application ports
  - [x] 9.1 Create tutorial repository port
    - Add `src/application/repositories/tutorial.repository.interface.ts` with `listAccessibleCatalog`, `getDefinition`, and `publish`
    - _Requirements: 1.10, 1.11, 2.4, 12.1, 12.3_

  - [x] 9.2 Create tutorial-progress repository port
    - Add `src/application/repositories/tutorial-progress.repository.interface.ts` with `listForMember`, `save`, `getOnboardingDecision`, `saveOnboardingDecision`, and idempotent `saveCompletion`
    - _Requirements: 9.1, 9.10, 4.6, 4.8, 11.1, 11.6_

  - [x] 9.3 Create workspace-context and feature-access service ports
    - Add `src/application/services/workspace-context.service.interface.ts` (`listAuthorizedResources`, `isResourceStillValid`) and `src/application/services/tutorial-feature-access.service.interface.ts` (`accessibleFeatures`)
    - _Requirements: 3.7, 12.2, 10.8, 12.8_

- [x] 10. Implement catalog and detail use cases
  - [x] 10.1 Implement list-tutorial-catalog use case
    - Add `src/application/use-cases/tutorials/list-tutorial-catalog.use-case.ts` fetching accessible catalog + progress, applying `filterCatalog`, attaching status and percentage
    - _Requirements: 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 12.1, 12.3_

  - [x] 10.2 Write property test for catalog accessibility and no inaccessible details
    - **Property 33: The catalog exposes only accessible tutorials and never inaccessible details**
    - **Validates: Requirements 12.1, 12.3, 12.10**

  - [x] 10.3 Implement open-tutorial-detail use case
    - Add `src/application/use-cases/tutorials/open-tutorial-detail.use-case.ts` loading definition, evaluating prerequisites with remediation, building authorized context selectors, and computing start-enabled via `evaluateEligibility`; clears only invalid context selections and flags their requirements
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13, 10.11, 12.2_

  - [x] 10.4 Write property test for prerequisite evaluation and remediation
    - **Property 10: Every prerequisite is evaluated with a remediation when unsatisfied**
    - **Validates: Requirements 3.2, 3.3, 3.4**

  - [x] 10.5 Write property test for context selectors limited to authorized resources
    - **Property 11: One selector per required context selection, limited to authorized matching resources**
    - **Validates: Requirements 3.6, 3.7, 12.2**

  - [x] 10.6 Write property test for clearing only invalid context selections
    - **Property 12: Only invalid context selections are cleared and their requirements are flagged**
    - **Validates: Requirements 3.10, 3.11, 10.11**

- [x] 11. Implement run lifecycle use cases
  - [x] 11.1 Implement start-tutorial-run use case
    - Add `src/application/use-cases/tutorials/start-tutorial-run.use-case.ts` enforcing a single active run, creating a run at step 1 with status In Progress, and requesting a pause/cancel choice on conflict (pausing before creating the second run; cancelling on pause failure)
    - _Requirements: 5.1, 5.2, 5.5, 5.6, 5.7, 5.8, 5.9_

  - [x] 11.2 Write property test for starting an eligible tutorial
    - **Property 16: Starting an eligible tutorial creates exactly one run at the first step, In Progress**
    - **Validates: Requirements 5.1, 5.2**

  - [x] 11.3 Write property test for single active run
    - **Property 17: At most one active run exists**
    - **Validates: Requirements 5.5**

  - [x] 11.4 Write property test for cancelling a conflicting start
    - **Property 18: Cancelling a conflicting start preserves the active run**
    - **Validates: Requirements 5.7**

  - [x] 11.5 Write example tests for start ordering and error paths
    - Pause persists before the second run is created (Req 5.8); pause failure cancels the new start (Req 5.9)
    - _Requirements: 5.8, 5.9_

  - [x] 11.6 Implement advance-tutorial-step use case
    - Add `src/application/use-cases/tutorials/advance-tutorial-step.use-case.ts` handling Next/Previous/complete-action; persists completion before advancing; gates forward on destination readiness signaled by the caller; preserves run identity and completed steps across transitions
    - _Requirements: 6.8, 6.9, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10, 8.11, 8.12, 8.13, 8.14, 8.15, 9.5, 9.6, 9.7_

  - [x] 11.7 Write property test for destination transitions preserving state
    - **Property 20: Destination transitions preserve run identity and completed steps**
    - **Validates: Requirements 6.8, 6.9, 8.15**

  - [x] 11.8 Write example tests for advance ordering and action-failure paths
    - Next persists completion before the step changes (Req 8.12); a failed Required Action retains the current step and identifies the failure (Req 8.9, 8.10)
    - _Requirements: 8.12, 8.9, 8.10_

  - [x] 11.9 Implement pause-tutorial-run use case
    - Add `src/application/use-cases/tutorials/pause-tutorial-run.use-case.ts` persisting Paused + Resume_Point before confirming; retains In Progress on failure; supports sign-out pause ordering and access-loss pause (persist progress before Paused)
    - _Requirements: 9.8, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 12.8_

  - [x] 11.10 Write example tests for pause ordering and failure
    - Pause persists before confirming (Req 9.8, 10.2); sign-out persists a pause first (Req 10.5); access-loss persists progress before Paused (Req 12.8); pause failure retains In Progress (Req 10.6, 10.7)
    - _Requirements: 9.8, 10.2, 10.5, 10.6, 10.7, 12.8_

  - [x] 11.11 Implement resume-tutorial-run use case
    - Add `src/application/use-cases/tutorials/resume-tutorial-run.use-case.ts` re-evaluating features, prerequisites, and saved context; requesting replacement for invalid context; setting In Progress only when validations and destination readiness succeed; retaining Paused with blockers otherwise; reporting resume unavailable for inaccessible tutorials
    - _Requirements: 10.8, 10.9, 10.10, 10.11, 10.12, 10.13, 10.14, 10.15, 10.16, 12.10, 12.11_

  - [x] 11.12 Write property test for resume unavailability on inaccessible tutorials
    - **Property 35: Resume is unavailable while a saved tutorial is inaccessible**
    - **Validates: Requirements 12.10, 12.11**

  - [x] 11.13 Implement complete-tutorial-run and repeat-tutorial use cases
    - Add `src/application/use-cases/tutorials/complete-tutorial-run.use-case.ts` persisting Completed + one idempotent Completion_Record, and `src/application/use-cases/tutorials/repeat-tutorial.use-case.ts` creating a fresh run after confirmation while preserving prior Completion_Records
    - _Requirements: 11.1, 11.6, 11.7, 11.8, 11.9, 11.10, 11.11, 11.12, 11.13_

  - [x] 11.14 Write property test for repetition reset and record preservation
    - **Property 32: Repetition resets the run and preserves prior completion records**
    - **Validates: Requirements 11.12, 11.13**

  - [x] 11.15 Write example tests for completion persistence failure
    - A failed completion retains pre-completion status and final step and identifies the failure (Req 11.7, 11.8)
    - _Requirements: 11.7, 11.8_

  - [x] 11.16 Implement resolve-onboarding and record-onboarding-decision use cases
    - Add `src/application/use-cases/tutorials/resolve-onboarding.use-case.ts` recommending an accessible starter tutorial, and `src/application/use-cases/tutorials/record-onboarding-decision.use-case.ts` persisting accept/dismiss and retaining the invitation on failure
    - _Requirements: 4.1, 4.3, 4.4, 4.5, 4.6, 4.8, 4.10, 4.11, 4.12, 4.13_

  - [x] 11.17 Write example tests for onboarding persistence failure
    - A failed decision persist retains the invitation and explains the failure (Req 4.12, 4.13)
    - _Requirements: 4.12, 4.13_

- [x] 12. Checkpoint - use cases
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Implement presenters and Zod boundary schemas
  - [x] 13.1 Create tutorial boundary schemas
    - Add `src/interface-adapters/controllers/tutorials/tutorial.schemas.ts` with Zod schemas for every controller input
    - _Requirements: 3.6, 5.1, 8.1, 10.8_

  - [x] 13.2 Create catalog and detail presenters
    - Add `src/interface-adapters/presenters/tutorial-catalog.presenter.ts` (CatalogViewModel, TutorialCardViewModel with status + percentage + no-results flag) and `src/interface-adapters/presenters/tutorial-detail.presenter.ts` (DetailViewModel with prerequisite states, context selectors, selected names, startEnabled); return fresh immutable ViewModels, deep-copy nested arrays, omit inaccessible details and Sensitive Values
    - _Requirements: 2.4, 2.5, 2.6, 3.1, 3.9, 12.3, 12.7_

  - [x] 13.3 Write property test for catalog card completeness
    - **Property 9: Catalog card completeness**
    - **Validates: Requirements 2.4, 2.5, 2.6, 3.1**

  - [x] 13.4 Create walkthrough and completion presenters
    - Add `src/interface-adapters/presenters/walkthrough.presenter.ts` (StepViewModel: title, position, content with emphasized-text/action-callout markers, target accessible name, previousEnabled, forwardLabel, forwardEnabled) and `src/interface-adapters/presenters/completion.presenter.ts` (CompletionSummaryViewModel with title, outcomes, timestamp, next recommendation); localize content and name a Fallback Locale before falling back
    - _Requirements: 6.2, 6.3, 6.4, 6.7, 11.3, 11.5, 13.17_

  - [x] 13.5 Write property test for walkthrough step ViewModel completeness
    - **Property 19: Walkthrough step ViewModel completeness**
    - **Validates: Requirements 6.2, 6.3, 6.4, 6.7**

  - [x] 13.6 Write property test for restored status display
    - **Property 27: Restored status display matches persisted status**
    - **Validates: Requirements 9.11, 9.12**

  - [x] 13.7 Write property test for completion summary completeness and recommendation
    - **Property 31: Completion summary completeness and next recommendation**
    - **Validates: Requirements 11.3, 11.5**

  - [x] 13.8 Write property test for Sensitive Value omission
    - **Property 34: Sensitive Values never appear in records, surfaces, or descriptions**
    - **Validates: Requirements 12.7**

  - [x] 13.9 Write property test for fallback-locale identification
    - **Property 36: Missing localized content names a Fallback Locale before falling back**
    - **Validates: Requirements 13.17**

- [x] 14. Implement controllers
  - [x] 14.1 Create catalog, detail, and onboarding controllers
    - Add controllers for list-catalog, open-detail, resolve-onboarding, and record-onboarding-decision in `src/interface-adapters/controllers/tutorials/`; each validates input with the Zod schemas, makes exactly one use-case call, and returns a presenter ViewModel
    - _Requirements: 2.2, 3.1, 4.1, 4.6, 4.8_

  - [x] 14.2 Create run-lifecycle controllers
    - Add controllers for start, advance, pause, resume, complete, and repeat in `src/interface-adapters/controllers/tutorials/`; each validates input, makes exactly one use-case call, and returns a presenter ViewModel
    - _Requirements: 5.1, 8.1, 10.1, 10.8, 11.1, 11.9_

  - [x] 14.3 Write controller unit tests
    - Assert boundary Zod validation, exactly one use-case call, and ViewModel shape for each controller
    - _Requirements: 2.2, 3.1, 5.1, 8.1, 10.8, 11.1_

- [x] 15. Wire dependency injection
  - [x] 15.1 Declare DI tokens and return types
    - Add tutorial repository, service, use-case, and controller tokens with return types to `di/types.ts`
    - _Requirements: 2.2, 5.1_

  - [x] 15.2 Create and register the tutorials DI module
    - Add `di/modules/tutorials.module.ts` binding repositories → services → use cases → controllers, and load it in `di/container.ts`
    - _Requirements: 2.2, 5.1_

  - [x] 15.3 Write DI resolution and compile-time wiring tests
    - Assert resolution in `tests/unit/di/container.test.ts` and add compile-time misuse coverage in `typed-wiring.compile.ts` for every new token
    - _Requirements: 2.2, 5.1_

- [x] 16. Implement infrastructure repositories and services
  - [x] 16.1 Implement Core API tutorial repository
    - Add `src/infrastructure/repositories/core-api-tutorial.repository.ts` mapping DTOs to entities, requesting only accessible tutorials server-side, and translating errors to application error types at the boundary
    - _Requirements: 1.10, 1.11, 2.4, 12.1, 12.3_

  - [x] 16.2 Implement Core API tutorial-progress repository
    - Add `src/infrastructure/repositories/core-api-tutorial-progress.repository.ts` for progress list/save, onboarding decision get/save, and idempotent completion save with non-destructive failure and error translation
    - _Requirements: 9.1, 9.7, 9.8, 9.9, 9.10, 9.13, 9.14, 9.15, 9.16, 4.6, 4.8, 11.1, 11.6_

  - [x] 16.3 Write property test for persisted progress round-trip
    - **Property 26: Persisted progress round-trips on restore**
    - **Validates: Requirements 9.10**

  - [x] 16.4 Implement Core API workspace-context and feature-access services
    - Add `src/infrastructure/services/core-api-workspace-context.service.ts` and `src/infrastructure/services/core-api-tutorial-feature-access.service.ts` applying server-side authorization and error translation
    - _Requirements: 3.7, 12.2, 10.8, 12.8_

  - [x] 16.5 Write repository and service mapping/error tests
    - Assert method, path, encoding, body, DTO→Entity mapping, and error translation against a fake transport; confirm inaccessible items and Sensitive Values never enter an Entity
    - _Requirements: 12.3, 12.7, 1.11_

- [x] 17. Checkpoint - adapters, DI, and infrastructure
  - Ensure all tests pass, ask the user if questions arise.

- [x] 18. Implement client interaction store and shell mounting
  - [x] 18.1 Create the tutorial-session Zustand store
    - Add `app/_stores/tutorial-session.store.ts` holding openSurface, activeRunId, and catalogView (search, filters, scrollTop) with immutable actions and no business rules or controller calls
    - _Requirements: 2.11, 2.12_

  - [x] 18.2 Write property test for Catalog View State round-trip
    - **Property 8: Catalog View State round-trips through detail**
    - **Validates: Requirements 2.11, 2.12**

  - [x] 18.3 Mount TutorialEntry and TutorialOverlayHost in WorkspaceShell
    - Modify `app/_components/layout/workspace-shell.tsx` to render `TutorialEntry` (always available) and `TutorialOverlayHost`; add placeholder `app/_components/tutorials/tutorial-entry.tsx` and `app/_components/tutorials/tutorial-overlay-host.tsx` resolving controllers via `getInjection` into a frozen object
    - _Requirements: 2.1, 2.2_

  - [x] 18.4 Write jsdom tests for entry presence and non-destructive catalog open
    - Entry always present (Req 2.1); opening the catalog does not replace the destination or reset Visible Destination State (Req 2.2)
    - _Requirements: 2.1, 2.2_

- [x] 19. Implement catalog, detail, and onboarding surfaces
  - [x] 19.1 Implement TutorialOverlayHost surface routing
    - Complete `app/_components/tutorials/tutorial-overlay-host.tsx` to choose catalog | detail | onboarding | walkthrough from the store; align right on Wide Viewport and fill Narrow Viewport with no horizontal scroll using Tailwind v4 mobile-first `min-[1024px]:` breakpoints and `ui/` primitives
    - _Requirements: 2.3, 13.1_

  - [x] 19.2 Implement TutorialCatalogPanel
    - Add `app/_components/tutorials/tutorial-catalog-panel.tsx` rendering cards, search, status filters, no-results + clear action, and preserving/restoring Catalog View State around detail
    - _Requirements: 2.4, 2.5, 2.6, 2.9, 2.10, 2.11, 2.12_

  - [x] 19.3 Implement TutorialDetailPanel
    - Add `app/_components/tutorials/tutorial-detail-panel.tsx` rendering metadata, prerequisite states with remediation, context selectors with selected names, and a start action gated by startEnabled
    - _Requirements: 3.1, 3.3, 3.4, 3.5, 3.6, 3.8, 3.9, 3.12_

  - [x] 19.4 Implement OnboardingInvitation
    - Add `app/_components/tutorials/onboarding-invitation.tsx` as a non-blocking prompt with recommendation, accept, dismiss, and no-starter states, keeping the Workspace operable
    - _Requirements: 4.1, 4.2, 4.4, 4.5, 4.7, 4.9, 4.11_

  - [x] 19.5 Write jsdom tests for catalog, detail, and onboarding behavior
    - No-results + clear (Req 2.9); onboarding transitions (Req 4.2, 4.4–4.9, 4.11)
    - _Requirements: 2.9, 4.2, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.11_

- [x] 20. Implement walkthrough, spotlight, and completion surfaces
  - [x] 20.1 Implement target-control and destination-ready hooks
    - Add `app/_components/tutorials/use-target-control.ts` (locate, scroll fully into view, observe) and `app/_components/tutorials/use-destination-ready.ts` (detect Destination_Ready)
    - _Requirements: 5.4, 7.5, 8.13_

  - [x] 20.2 Implement WalkthroughPanel
    - Add `app/_components/tutorials/walkthrough-panel.tsx` showing title, step position, content with emphasized text and action callouts, target accessible name, Previous/Next/Finish, Pause and close, and retry/pause on readiness/transition/target failures; right-aligned on Wide, in-viewport on Narrow
    - _Requirements: 5.4, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.10, 8.1, 8.16, 8.17, 8.18, 10.1, 10.3, 10.4_

  - [x] 20.3 Implement SpotlightOverlay
    - Add `app/_components/tutorials/spotlight-overlay.tsx` applying page dimming only outside the target and panel, keeping the target operable, scrolling it into view, realigning on scroll/resize via `ResizeObserver`, omitting dimming when there is no target, exposing a programmatic target description, and using immediate transitions under `prefers-reduced-motion`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.8, 7.9, 7.10, 7.11, 13.2, 13.12_

  - [x] 20.4 Implement CompletionSummary
    - Add `app/_components/tutorials/completion-summary.tsx` showing title, completed outcomes, timestamp, return-to-workspace action, next recommendation, and a repeat action with confirmation
    - _Requirements: 11.2, 11.3, 11.4, 11.5, 11.9, 11.10, 11.11_

  - [x] 20.5 Wire Required Actions to reuse existing Workspace controllers
    - Ensure a step's Required Action invokes the same existing Workspace controller with identical member inputs, authorization, validation, and confirmation as the unguided operation, with no privileged side channel
    - _Requirements: 12.4, 12.5, 12.6_

  - [x] 20.6 Write jsdom and geometry tests for walkthrough and spotlight
    - Start/resume lifecycle and destination-ready gating (Req 5.3, 5.4, 5.6, 10.13–10.15); focus management (Req 13.3–13.9); live-region announcements (Req 13.10, 13.11); reduced motion (Req 13.12); spotlight scroll-into-view/realignment/no-target dimming with mocked `getBoundingClientRect`/`ResizeObserver` (Req 7.1–7.6, 7.10, 7.11); Required-Action controller equivalence (Req 12.4–12.6)
    - _Requirements: 5.3, 5.4, 5.6, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.10, 7.11, 10.13, 10.14, 10.15, 12.4, 12.5, 12.6, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8, 13.9, 13.10, 13.11, 13.12_

- [x] 21. Implement internationalization for tutorial UI
  - [x] 21.1 Add en/vi tutorial dictionary keys
    - Add all tutorial interface label and content keys to the English and Vietnamese dictionaries, including fallback-locale messaging; no hardcoded UI strings
    - _Requirements: 13.15, 13.16, 13.17_

  - [x] 21.2 Write i18n parity and fallback tests
    - Key parity enforced by `tests/unit/app/internationalization.test.ts`; a focused example covers the fallback-locale message
    - _Requirements: 13.15, 13.16, 13.17_

- [x] 22. Visual regression baselines
  - [x] 22.1 Add Playwright fixtures and baselines for tutorial surfaces
    - Add fixtures and baselines for the catalog panel, detail panel, walkthrough panel, spotlight overlay, onboarding invitation, and completion summary at Wide and Narrow viewports, fulfilling every Core API call from the mock; verify design-token contrast usage
    - _Requirements: 2.3, 6.1, 13.1, 13.2, 13.13, 13.14_

- [x] 23. Final checkpoint - full quality gate
  - Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, and `npm run test:visual`; ensure all pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test sub-tasks and can be skipped for a
  faster MVP; core implementation tasks are never optional.
- Property tests use `fast-check` (min 100 iterations) with one test per design
  Property, tagged `// Feature: guided-user-tutorials, Property N: ...`, sharing
  generators from `tests/unit/entities/tutorial-arbitraries.ts`.
- UI geometry, focus, reduced motion, contrast, and one-shot side-effect ordering
  are covered by example, jsdom, snapshot, and Playwright visual tests rather than
  property tests, per the design's Testing Strategy.
- Each task references specific requirements clauses (and, where applicable, the
  design Property it implements) for traceability.
- Every UI-affecting task must pass `npm run test:visual` in addition to the rest
  of the quality gate before it is considered done.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "3.1", "4.1", "5.1", "6.1", "7.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "2.5", "2.6", "3.2", "3.3", "3.4", "4.2", "4.3", "4.4", "4.5", "5.2", "6.2", "6.3", "6.4", "6.5", "7.2", "7.3", "9.1", "9.2", "9.3"] },
    { "id": 3, "tasks": ["10.1", "10.3", "11.1", "11.6", "11.9", "11.11", "11.13", "11.16"] },
    { "id": 4, "tasks": ["10.2", "10.4", "10.5", "10.6", "11.2", "11.3", "11.4", "11.5", "11.7", "11.8", "11.10", "11.12", "11.14", "11.15", "11.17"] },
    { "id": 5, "tasks": ["13.1", "13.2", "13.4"] },
    { "id": 6, "tasks": ["13.3", "13.5", "13.6", "13.7", "13.8", "13.9", "14.1", "14.2"] },
    { "id": 7, "tasks": ["14.3", "15.1"] },
    { "id": 8, "tasks": ["15.2"] },
    { "id": 9, "tasks": ["15.3", "16.1", "16.2", "16.4"] },
    { "id": 10, "tasks": ["16.3", "16.5", "18.1"] },
    { "id": 11, "tasks": ["18.2", "18.3", "20.1", "21.1"] },
    { "id": 12, "tasks": ["18.4", "19.1", "21.2"] },
    { "id": 13, "tasks": ["19.2", "19.3", "19.4", "20.2", "20.3", "20.4", "20.5"] },
    { "id": 14, "tasks": ["19.5", "20.6", "22.1"] }
  ]
}
```
