# Bugfix Requirements Document

## Introduction

This bugfix addresses the one-hour abortion of `guided-user-tutorials` task `13.2 Create catalog and detail presenters`. The timeout is the observable symptom, not an established root cause. The objective is to identify the causal execution condition with reproducible evidence, reconcile any side effects left by the aborted and concurrent work, and ensure a bounded rerun produces a reliable terminal result without weakening the presenter contract or unrelated task behavior.

## Bug Analysis

### Current Behavior (Defect)

The failed execution does not provide enough reliable state or evidence to determine why a narrowly scoped presenter task remained active for one hour.

1.1 WHEN task 13.2 is executed and does not reach a terminal result within 3,600,000 milliseconds THEN the system aborts the execution without identifying the operation that prevented completion

1.2 WHEN task 13.2 is aborted after writing partial side effects THEN the system leaves the completion and validity of those side effects indeterminate because the task result is unavailable

1.3 WHEN task 13.2 runs concurrently with neighboring presenter and test tasks that read or write overlapping dependencies THEN the system permits transient missing-module, TypeScript, or file-state failures to be observed without distinguishing a concurrent race from a defect owned by task 13.2

1.4 WHEN the parent execution aborts task 13.2 THEN the available execution metadata can continue to report task 13.2 as running instead of recording an accurate terminal outcome

1.5 WHEN execution history or logs are incomplete, unavailable, or lack command-level timing and progress evidence THEN the system exposes only the timeout symptom and cannot substantiate an actual root cause

1.6 WHEN task 13.2 starts validation through a watch-mode, deadlocked, orphaned, interactive, repeatedly retried, or otherwise non-terminating process THEN the system can wait until the outer one-hour timeout without identifying or bounding that process

1.7 WHEN task 13.2 expands beyond its catalog-and-detail presenter scope or repeatedly runs full-suite validation during intermediate concurrent states THEN the system can consume unbounded work without identifying scope growth or validation repetition as the cause

1.8 WHEN partial presenter artifacts satisfy focused presenter tests but the concurrent workspace still contains TypeScript errors THEN the system cannot infer from the timeout alone whether presenter behavior failed, validation failed, concurrency interfered, or execution control stalled

### Expected Behavior (Correct)

The diagnosis must establish the causal condition before any implementation fix is selected, and a post-fix execution must terminate with attributable evidence.

2.1 WHEN task 13.2 approaches or reaches its execution deadline THEN the system SHALL identify the last active operation and produce a bounded terminal success or failure result that distinguishes the root cause from the timeout symptom

2.2 WHEN task 13.2 ends unsuccessfully after writing side effects THEN the system SHALL inventory every relevant created, modified, or incomplete artifact and classify it as valid, invalid, unrelated, or requiring isolated verification before retry

2.3 WHEN task 13.2 overlaps with neighboring tasks THEN the system SHALL compare execution timing, file ownership, dependency availability, and isolated rerun behavior to prove or exclude a concurrent file race rather than attributing transient failures speculatively

2.4 WHEN the parent execution aborts task 13.2 THEN the system SHALL record an accurate terminal status, preserve the execution identifier and timing, and make the failure result available for diagnosis

2.5 WHEN execution history or logs are available THEN the system SHALL correlate task dispatch, sub-execution progress, command start and end times, command output, process state, validation attempts, file writes, and termination events; when evidence is unavailable, the system SHALL state the evidence gap and leave the root cause unresolved rather than guessing

2.6 WHEN task 13.2 invokes a process THEN the system SHALL use a one-shot non-interactive command with a bounded duration, detect watch-mode, deadlocked, orphaned, or interactive processes, cap retries, and identify the responsible process before terminating it

2.7 WHEN task 13.2 is executed THEN the system SHALL keep work bounded to the two presenters and directly owned focused verification, record any necessary scope expansion explicitly, and avoid repeated full-suite validation while concurrent intermediate work is unstable

2.8 WHEN diagnosing the timeout THEN the system SHALL reproduce or exclude each plausible cause with isolated evidence, resolve independently attributable TypeScript or test failures separately, and confirm the identified fix by completing an isolated task 13.2 rerun with focused presenter tests and type checking before the outer timeout

### Unchanged Behavior (Regression Prevention)

The diagnosis and eventual execution-control fix must preserve valid tutorial work and normal validation guarantees.

3.1 WHEN a spec task does not meet the task 13.2 timeout bug condition THEN the system SHALL CONTINUE TO execute it according to its declared dependency order, concurrency policy, and terminal-result behavior

3.2 WHEN completed neighboring tasks 13.1 and 13.4 have valid outputs that are not proven to be corrupted by the failed execution THEN the system SHALL CONTINUE TO preserve their outputs and completed status

3.3 WHEN catalog and detail presenters are verified THEN the system SHALL CONTINUE TO require complete member-facing ViewModels, fresh immutable results, deep-copied nested collections, correct status and progress fields, selected context names, start availability, and omission of inaccessible details and Sensitive Values

3.4 WHEN presenter tests or TypeScript checks identify a genuine defect THEN the system SHALL CONTINUE TO report the defect without weakening assertions, suppressing strict type errors, or reclassifying a failing check as successful

3.5 WHEN the guided-user-tutorials implementation reaches its designated checkpoints THEN the system SHALL CONTINUE TO require the existing full quality gate, while avoiding unbounded or repeated full-suite runs inside the narrowly scoped task 13.2 execution

3.6 WHEN this requirements phase is completed THEN the system SHALL CONTINUE TO leave application code, presenter code, tests, and the existing guided-user-tutorials specification unchanged
