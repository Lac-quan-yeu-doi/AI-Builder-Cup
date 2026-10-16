# Implementation Plan: Catalog and Detail Presenters Timeout Bugfix

## Root-Cause Status Before Implementation

The primary cause of the one-hour task 13.2 timeout is **unresolved**. The
available evidence proves that the focused catalog/detail presenter tests can
terminate successfully and that strict type checking currently reports task-owned
TS2532 and TS2345 diagnostics in
`tests/unit/interface-adapters/presenters/tutorial-catalog.presenter.test.ts`.
Those diagnostics are a genuine bounded verification defect, but they do not by
themselves explain why the parent execution remained active for one hour or why
no terminal result was published.

Historical command timing, retry counts, process lifecycle, heartbeat, file-write,
and parent-finalization evidence is incomplete. Therefore this plan permits no
speculative execution-control, validation-policy, or concurrency fix. Each such
change is guarded by the evidence thresholds in the design's Root-Cause Decision
Model. If no threshold is met, the correct outcome is
`UNRESOLVED_EVIDENCE_GAP`, improved evidence capture, and no cause-specific
remediation.

## Command Budgets and Execution Rules

- Run commands from the `celesnity-web` workspace using Node 22 or newer.
- Use one-shot, non-interactive commands only. Never invoke `npm run dev`,
  `npm run test:watch`, a watcher, or an interactive process.
- Apply these per-operation budgets through the task execution harness: evidence
  capture/inventory 30 seconds; focused presenter tests 60 seconds; strict
  typecheck 300 seconds; classification/finalization 30 seconds; child
  termination grace 5 seconds; complete isolated task 13.2 attempt 10 minutes.
- Emit an operation start record before every command, heartbeat at least every 15
  seconds while active, and exactly one operation end record containing exit
  state and bounded output reference.
- Do not retry automatically. A second attempt requires an explicit decision and
  a materially changed hypothesis or evidence set.
- Run each command separately; do not chain checks. This preserves attribution of
  timing, output, and exit status.
- Do not run the full repository suite during exploration or the isolated task
  13.2 attempt. Run the designated quality gate once at the final checkpoint.

## Tasks

- [ ] 1. Write the bug condition exploration property before any fix
  - **Property 1: Bug Condition** - Bounded Attributable Task 13.2 Outcome
  - **CRITICAL**: Write and run this property-based test against the unfixed task execution boundary before changing presenter tests or execution behavior.
  - **EXPECTED PRE-FIX OUTCOME**: The property FAILS with a minimized counterexample demonstrating that an execution satisfying `isBugCondition` can reach the 3,600,000 ms outer deadline, be aborted, and lack a reliable terminal result or identified last active operation. This failure confirms the bug; do not weaken the property or fix code in this task.
  - Locate the actual task-execution classifier/runner boundary first. Add the test in that owning package or its dedicated diagnostic harness; do not place orchestration behavior in presenters, React, use cases, infrastructure, or DI.
  - Generate `TaskExecution` traces scoped to `specId = "guided-user-tutorials"`, `taskId = "13.2"`, `elapsedMilliseconds >= 3_600_000`, and `parentOutcome = ABORTED_TIMEOUT`, with at least one of: unavailable result, unreliable/missing terminal status, or unknown last active operation.
  - Vary child completion order, missing process/end records, non-zero exits, watch/interactive flags, duplicate command signatures, retries, shared-path write overlaps, and evidence completeness. Use fake processes and virtual time; never wait one real hour or start a real watcher.
  - Assert the design's `expectedBehavior(result)`: completion before the new outer deadline; terminal status in `SUCCEEDED | FAILED | ABORTED_BOUNDED`; identified last operation; complete mutually exclusive side-effect manifest; bounded processes; every candidate cause tested or assigned an explicit evidence gap; and either an evidence-backed primary cause or `UNRESOLVED_EVIDENCE_GAP` with no selected remediation.
  - Run only this property with a 60-second command budget and at least 100 generated cases. Record the minimized counterexample and distinguish a missing terminal result from any bounded task-owned compiler failure.
  - Mark this task complete only when the test is written, has failed on F as expected, and its counterexample is recorded in the diagnostic evidence bundle.
  - _Bug_Condition: `isBugCondition(input)` from design, where task 13.2 reaches the one-hour abort and has unavailable result, unreliable terminal status, or unknown last operation_
  - _Expected_Behavior: `expectedBehavior(result)` from design_
  - _Requirements: 1.1, 1.4, 1.5, 1.6, 1.7, 1.8, 2.1, 2.4, 2.5, 2.6, 2.7, 2.8_

- [ ] 2. Write preservation properties before any fix
  - **Property 2: Preservation** - Valid Outputs and Non-Buggy Execution Behavior
  - **IMPORTANT**: Follow the observation-first methodology against unfixed behavior where `isBugCondition(input)` is false.
  - Observe and record finite task successes, finite task-owned failures, declared dependency/concurrency behavior, focused presenter outputs, validation failure visibility, and hashes/completion states for valid task 13.1 and 13.4 artifacts.
  - Generate non-bug-condition execution traces and assert differential equality of declared ordering, concurrency policy, terminal outcomes, validation semantics, and presenter-visible behavior between the recorded F baseline and the candidate F′ behavior.
  - Generate artifact manifests for task 13.1, task 13.4, and unrelated tutorial work; for every artifact not proven corrupt, assert its content hash and completion state remain unchanged.
  - Reuse existing focused presenter assertions to preserve fresh immutable ViewModels, deep-copied nested collections, complete status/progress and selected-name mappings, correct start availability, inaccessible-detail omission, and Sensitive Value omission.
  - Assert strict TypeScript/test failures remain visible and non-zero; do not suppress diagnostics, weaken assertions, relax compiler options, or treat a failed check as success.
  - Run only these preservation properties with a 60-second command budget and at least 100 generated cases. They MUST PASS on the unfixed baseline and remain unchanged for post-fix verification.
  - Mark this task complete only when observations are documented and the preservation properties pass against F.
  - _Non_Bug_Condition: `NOT isBugCondition(input)` from design_
  - _Preservation: Preserve non-buggy task behavior, valid presenter contracts, task 13.1/13.4 outputs and states, strict failure visibility, checkpoint quality gates, and unrelated uncommitted work_
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [ ] 3. Diagnose and remediate task 13.2 using the evidence decision gate

  - [ ] 3.1 Inventory current task 13.2 side effects and freeze preservation baselines
    - Capture the current Git status and pre-change hashes without cleaning, reverting, staging, or adopting unrelated work.
    - Build the `Side_Effect_Manifest` and assign every relevant path exactly one state: `valid`, `invalid`, `unrelated`, or `requires-isolated-verification`, with task owner, evidence, and preservation decision.
    - Treat the two presenter files and their directly owned focused tests as task 13.2 candidates requiring isolated verification.
    - Record task 13.1 schemas/tests and task 13.4 walkthrough/completion presenters/tests as preserved by default. Keep their content and completion state unchanged unless path-level evidence proves corruption.
    - Record catalog Property 9 as task 13.3 verification, not as a task 13.2 implementation side effect. Classify all other tutorial work by its declared owner and do not modify it.
    - Complete inventory within 30 seconds and store bounded output in the execution evidence bundle.
    - _Preservation: Side_Effect_Manifest ownership and default preservation rules from design_
    - _Requirements: 1.2, 1.3, 2.2, 2.3, 3.2, 3.6_

  - [ ] 3.2 Capture and reconstruct all available execution evidence
    - Preserve the original execution ID, task ID, dispatch/start/deadline/end timestamps, parent status, task status, available result, and last recorded operation.
    - Correlate command signatures and modes, working directories, retries, start/end times, exit states, bounded outputs, process IDs, heartbeats, last-progress times, file-write intervals, owners, hashes, and termination events.
    - Compare task 13.2 timing with overlapping tasks 13.1 and 13.4; record shared-path/dependency intervals rather than inferring a race from temporal overlap alone.
    - For each unavailable field, add an explicit `Evidence_Gap`; do not synthesize timestamps, process state, retries, or causal ordering.
    - Reconcile only factual metadata at this stage. Do not mark task 13.2 complete and do not select a root cause.
    - Complete capture/reconstruction within 30 seconds and retain a bounded evidence reference for every available operation.
    - _Bug_Condition: Missing reliable terminal result or causal operation after the one-hour abort_
    - _Expected_Behavior: Correlated evidence or explicit evidence gaps, never a guessed cause_
    - _Requirements: 1.1, 1.4, 1.5, 2.1, 2.4, 2.5, 2.8_

  - [ ] 3.3 Reproduce focused presenter tests and strict typecheck independently
    - Against the frozen snapshot, run exactly one focused presenter command with a 60-second budget: `npm test -- tests/unit/interface-adapters/presenters/tutorial-catalog.presenter.test.ts tests/unit/interface-adapters/presenters/tutorial-detail.presenter.test.ts`.
    - Record command start/end, exit code, duration, and bounded output. Do not include Property 9 or any full-suite test in this task; record neighboring checks separately if historical evidence references them.
    - Run exactly one strict typecheck command with a 300-second budget: `npm run typecheck -- --pretty false`.
    - Record TS2532 and TS2345, including their current file/line ownership, independently from the focused runtime test result. If diagnostics differ, preserve the actual bounded output and update the manifest rather than forcing the expected errors.
    - Classify a reproducible task 13.2-owned diagnostic that exits normally as `Task_Owned_Failure`; do not classify it as the primary timeout cause unless evidence also proves retries, blocked result propagation, or failed parent terminalization after the compiler exited.
    - _Bug_Condition: A bounded compiler failure is not itself the one-hour missing-result condition_
    - _Preservation: Focused presenter behavior and strict failure visibility remain intact_
    - _Requirements: 1.8, 2.5, 2.8, 3.3, 3.4_

  - [ ] 3.4 Apply the explicit root-cause decision gate
    - Evaluate all four candidates using the exact proof/exclusion thresholds in the design: execution-control stall, repeated/unbounded validation, concurrency race, and genuine task-owned failure.
    - Select `EXECUTION_CONTROL_STALL` only if process/operation evidence shows no progress past budget or a terminal/disappeared child while the task failed to finalize within its grace period.
    - Select `REPEATED_UNBOUNDED_VALIDATION` only if command records prove watch/interactive mode, uncapped retries, duplicate validation signatures, repeated full-suite launches, or scope growth consumed the deadline.
    - Select `CONCURRENCY_RACE` only if a failure coincides with a relevant shared write/dependency transition and the same check passes against the stable isolated snapshot.
    - Record `TASK_OWNED_FAILURE` for independently reproducible task 13.2 diagnostics that terminate normally; treat it as the timeout cause only if evidence establishes the causal link to the missing terminal result.
    - If no single primary threshold is met, or competing thresholds cannot be causally ordered, set the primary result to `UNRESOLVED_EVIDENCE_GAP`, select no timeout remediation, and continue only with the independently proven TS diagnostic fix and evidence improvements.
    - Produce a reviewable decision record listing evidence for, evidence against, gaps, primary cause, associated findings, and the only authorized remediation branch. Do not start tasks 3.6, 3.7, or 3.8 without the matching authorization.
    - _Expected_Behavior: A primary cause is selected only when `evidenceMeetsProofThreshold`; otherwise no cause-specific remediation is selected_
    - _Requirements: 2.3, 2.5, 2.8, 3.1, 3.2_

  - [ ] 3.5 Fix the proven task-owned TS2532 and TS2345 diagnostics without weakening strictness
    - Modify only the task 13.2-owned catalog presenter test constructs proven by task 3.3 to cause TS2532 and TS2345; preserve the test assertions and production presenter contract.
    - Use explicit narrowing, safe fixture construction, or equivalent strict typing supported by the observed diagnostics. Do not add `any`, non-null assertions, `@ts-ignore`, `@ts-expect-error`, unsafe casts, disabled checks, relaxed compiler options, or reduced assertions.
    - Re-run the catalog/detail focused presenter command once within 60 seconds and strict typecheck once within 300 seconds; both must terminate, and typecheck must contain no task 13.2-owned diagnostic.
    - Keep any unrelated typecheck failures visible, attributable, and outside this fix rather than broadening scope.
    - Do not claim this associated defect caused the one-hour timeout unless task 3.4 established that causal link.
    - _Bug_Condition: `isBugCondition(input)` remains distinct from a normally terminating task-owned type failure_
    - _Expected_Behavior: A task-owned verification failure terminates promptly and the strict test code type-checks without weakening guarantees_
    - _Preservation: Existing presenter assertions, strict compiler settings, production behavior, and unrelated diagnostics_
    - _Requirements: 2.8, 3.3, 3.4, 3.6_

  - [ ] 3.6 Conditionally repair terminal result propagation
    - **DECISION GATE**: Execute this task only if task 3.4 selects `EXECUTION_CONTROL_STALL` with the required process/operation and parent-state evidence.
    - Add or correct the owning runner's `finally`-equivalent lifecycle path so child success, non-zero exit, timeout, cancellation, or disappearance produces exactly one reliable parent terminal transition within the 5-second grace period.
    - Preserve execution ID, timing, last active operation, bounded output, and abort reason in the terminal result; ensure stale `running` metadata cannot survive finalization.
    - Add focused unit/property coverage using fake processes and virtual time for every terminal path. Do not change presenter code to compensate for orchestration behavior.
    - If the execution-control owner is outside this repository, record the owning system and required patch location; do not create a misleading local workaround.
    - _Bug_Condition: `isBugCondition(input)` with a terminal/disappeared child and missing parent finalization_
    - _Expected_Behavior: `expectedBehavior(result)` and exactly one attributable terminal result before the bounded deadline_
    - _Preservation: Normally completing/failing tasks retain ordering, concurrency policy, and terminal semantics_
    - _Requirements: 2.1, 2.4, 2.5, 2.6, 3.1_

  - [ ] 3.7 Conditionally prevent watch mode or repeated/unbounded validation
    - **DECISION GATE**: Execute this task only if task 3.4 selects `REPEATED_UNBOUNDED_VALIDATION` from command records.
    - Reject watcher, interactive, and development-server modes in task 13.2; enforce the command allowlist, one invocation per focused check, per-command budgets, zero automatic retries, duplicate-signature detection, and task 13.2 write-scope limits.
    - Preserve repository-wide quality checks at designated checkpoints; do not remove, skip, or weaken them. Prevent only the proven narrow-task repetition or mode violation.
    - Add fake-process/virtual-time tests for the exact proven mode or repetition and for allowed finite one-shot commands.
    - _Bug_Condition: `isBugCondition(input)` caused by proven non-terminating or repeated validation_
    - _Expected_Behavior: Every process is bounded and the responsible command is identified before termination_
    - _Preservation: Full quality gates remain required once at checkpoints_
    - _Requirements: 2.6, 2.7, 3.1, 3.4, 3.5_

  - [ ] 3.8 Conditionally serialize a proven shared-path concurrency race
    - **DECISION GATE**: Execute this task only if task 3.4 selects `CONCURRENCY_RACE` with timestamped shared-path/dependency overlap and a passing stable isolated rerun.
    - Add the minimum dependency barrier or path-ownership serialization for only the proven conflicting path or dependency. Do not globally disable concurrency.
    - Revalidate and reuse valid task 13.1 schemas and task 13.4 presenter outputs; do not rewrite, revert, or invalidate them without manifest evidence.
    - Add a controlled overlap test that fails under the proven ordering and passes with the minimum barrier, plus a no-shared-path case that remains concurrent.
    - _Bug_Condition: `isBugCondition(input)` with a proven shared-path/dependency race_
    - _Expected_Behavior: Stable attributable task 13.2 execution without transient shared-state failure_
    - _Preservation: Unrelated concurrency and valid task 13.1/13.4 artifacts and completion states_
    - _Requirements: 2.2, 2.3, 2.8, 3.1, 3.2_

  - [ ] 3.9 Handle an unresolved evidence gap without speculative remediation
    - Execute this task when task 3.4 returns `UNRESOLVED_EVIDENCE_GAP`.
    - Make no execution-control, retry-policy, command-policy, or concurrency behavior change. Retain the evidence bundle, explicit gaps, manifest, and independently proven TS diagnostic result.
    - If the absence of operation start/end records, heartbeats, bounded output, or parent-finalization metadata is itself established, add only the minimum evidence capture at the actual runner boundary and test that capture with fake processes.
    - Require an explicit decision and materially changed evidence before one additional diagnostic attempt; never loop until a preferred hypothesis appears.
    - _Expected_Behavior: `primaryCause = UNRESOLVED_EVIDENCE_GAP` implies `selectedRemediation = NONE`_
    - _Preservation: No behavior outside evidence capture changes_
    - _Requirements: 2.5, 2.8, 3.1, 3.6_

  - [ ] 3.10 Run one isolated bounded task 13.2 verification and reconcile stale status
    - Freeze neighboring writes and execute only inventory/evidence capture, the focused catalog/detail presenter test command, strict typecheck, classification, and finalization under the declared budgets. Do not run a watcher, retry, or full repository suite.
    - Complete the entire attempt within 10 minutes: inventory/evidence 30 seconds, focused tests 60 seconds, strict typecheck 300 seconds, classification/finalization 30 seconds, and child termination grace 5 seconds.
    - Require a complete task 13.2 manifest, reliable terminal result, identified last operation, focused presenter tests passing, and no task 13.2-owned strict type diagnostic.
    - Reconcile the stale `running` state only from this reliable terminal result: mark task 13.2 complete on terminal success; otherwise record terminal failure/`ABORTED_BOUNDED` and leave it incomplete. Preserve task 13.1 and 13.4 completion states.
    - If the attempt exposes a new cause, return to task 3.4 once with the new evidence; do not automatically rerun.
    - _Bug_Condition: Original one-hour abort with unavailable result or stale running status_
    - _Expected_Behavior: Bounded attributable terminal result and accurate task state_
    - _Preservation: Task 13.1/13.4 outputs and states; no repeated full-suite validation_
    - _Requirements: 2.1, 2.2, 2.4, 2.5, 2.6, 2.7, 2.8, 3.2, 3.5_

  - [ ] 3.11 Verify the original bug condition property now passes
    - **Property 1: Expected Behavior** - Bounded Attributable Task 13.2 Outcome
    - **IMPORTANT**: Re-run the SAME property from task 1; do not replace it with a new or weaker test.
    - Run it once with fake time, fake processes, at least 100 cases, and a 60-second command budget.
    - **EXPECTED POST-FIX OUTCOME**: PASS. Every generated execution satisfying `isBugCondition` produces the design's bounded, attributable `expectedBehavior`, including explicit unresolved evidence gaps where proof is unavailable.
    - Record the seed and bounded output for any failure and return to the matching implementation task; do not retry blindly.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

  - [ ] 3.12 Verify preservation properties still pass
    - **Property 2: Preservation** - Valid Outputs and Non-Buggy Execution Behavior
    - **IMPORTANT**: Re-run the SAME properties and recorded F baselines from task 2; do not write replacement tests.
    - Run once with at least 100 generated cases and a 60-second command budget.
    - **EXPECTED POST-FIX OUTCOME**: PASS. Non-buggy executions retain observable behavior; valid task 13.1/13.4 and unrelated artifacts retain hashes and completion states; presenter contracts and strict failure visibility remain unchanged.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [ ] 4. Checkpoint - run the designated quality gate once
  - Confirm tasks 1 and 2 have their pre-fix outcomes documented, task 3.4 has a reviewable evidence decision, all executed conditional branches were authorized by that decision, and task 3.10 produced a reliable terminal result.
  - Run each quality command separately and once, recording start/end, exit code, duration, and bounded output: `npm test` (10-minute budget), `npm run typecheck` (5-minute budget), `npm run lint` (5-minute budget), `npm run format:check` (2-minute budget), and `npm run build` (10-minute budget).
  - Do not suppress or reclassify failures. Attribute unrelated failures without broadening this bugfix, and keep task 13.2 incomplete until its owned checks pass.
  - No pixel-moving code is authorized by this plan, so no task-local visual baseline is required. If an authorized implementation unexpectedly changes rendered UI or layout, also run `npm run test:visual` with a 10-minute budget before completion.
  - Publish the final root-cause statement with supporting evidence, excluded hypotheses, remaining gaps, executed remediation branch, manifest disposition, isolated verification result, and task-status reconciliation.
  - Ensure all checks pass and ask the user if questions arise.
  - _Requirements: 2.8, 3.2, 3.3, 3.4, 3.5, 3.6_

## Completion Rules

- The known TS2532/TS2345 diagnostics may be fixed because they are independently
  reproduced task-owned defects; they must not be reported as the timeout cause
  without additional causal evidence.
- Only one of tasks 3.6, 3.7, or 3.8 may alter timeout behavior unless the decision
  record proves multiple causally ordered contributors. Unmet branches remain
  unchecked and explicitly not applicable.
- An unresolved primary cause is an acceptable diagnostic conclusion, but not a
  successful task 13.2 completion. Completion requires the bounded isolated
  attempt, passing focused presenter tests, no task 13.2-owned type diagnostics,
  a complete manifest, and a reliable terminal success.
- Application source, presenter behavior, strictness, task 13.1/13.4 outputs, and
  unrelated tutorial work must not change unless a task above explicitly
  authorizes the minimum evidence-backed modification.
