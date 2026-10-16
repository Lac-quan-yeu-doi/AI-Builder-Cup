# Data Workflow user acceptance test — 2026-09-23

## Environment and boundaries

- Web: `http://localhost:3000`, local-development owner persona. Core: local `:3001` API and worker. Spark: one live worker, one core, 1 GiB.
- Test artifact: [QA 2026-09-23 - manual and graph](http://localhost:3000/data-workflows/11acbdfd-018b-43f0-b52b-bb27c4a26c78). Its published version 3 is a **paused** Monday/Wednesday 07:00 calendar schedule in `Asia/Ho_Chi_Minh`; the saved draft was restored to the same schedule after testing.
- The published graph uses `order_transfer` v5, then a parallel split to `brand_transfer` v2 and `order_item_transfer` v2, then a join. Its manual run read the connected datasource through those pipelines and wrote their configured platform catalog targets. Testing did not edit customer datasource rows or settings.
- Browser checks below are observations of the running local app. Automated tests exercise additional contracts but do not prove an unrun end-to-end path.

## Manual user journeys

| Case | Scenario | Result |
| --- | --- | --- |
| U01 | Sign in as local-development organization owner | Pass |
| U02 | Open workflow list and create a new workflow | Pass |
| U03 | Save a trigger-only manual draft, reload, and find the persisted workflow | Pass |
| U04 | Publish a trigger-only graph and use Run now | **Finding F1:** version 1 published and its no-op run succeeded |
| U05 | Add a pipeline without an incoming edge, then Save | Pass: save rejected as invalid graph |
| U06 | Choose a published pipeline by name; check version pinning | Pass: `order_transfer` selected and version 5 populated |
| U07 | Connect trigger to pipeline using connection tools | Pass |
| U08 | Select and delete an edge | Pass: the chosen edge disappeared |
| U09 | Create a parallel split with two pipeline branches and a join | Pass: connected graph saved and published as version 2 |
| U10 | Reload and verify all graph nodes, edges, and pipeline versions | Pass |
| U11 | Add a conditional split, switch first-match/all-match mode, add a condition branch | Pass for editor interaction; conditional runtime was not executed |
| U12 | Delete the conditional node with an incoming edge | Pass: node and incident edge disappeared |
| U13 | Change Calendar days to Monday/Wednesday, time 07:00, timezone `Asia/Ho_Chi_Minh` | Pass; saved and retained after reload |
| U14 | Enter invalid timezone `Mars/Olympus` and Save | Pass: rejected with an IANA timezone error |
| U15 | Preview the saved calendar | Pass: first five dates were Sep 28, Sep 30, Oct 5, Oct 7, Oct 12 at 07:00 |
| U16 | Publish Calendar version 3, then pause automatic scheduling | Pass: schedule summary showed Calendar paused and next occurrence Sep 28 |
| U17 | Use Run now while automatic schedule is paused | Pass: manual run queued, executed, and succeeded |
| U18 | Inspect workflow run history and linked pipeline executions | Pass: all three pipeline attempts and the workflow ended `SUCCEEDED`; Spark exit code 0 was visible for the upstream execution |
| U19 | Enter a five-second Interval and Save | Pass: rejected because minimum is 10 seconds |
| U20 | Save a ten-second Interval draft and reload | Pass: draft persisted while published Calendar version 3 stayed paused; draft was restored to Calendar after the check |
| U21 | Select verified datasource and add/remove watched tables from metadata | Pass: `public.orders` and `public.order_items` could be selected and removed individually |
| U22 | Validate polling for `public.orders` with `created_at` and `id` cursor fields | Pass: UI reported source ready |
| U23 | Inspect CDC fixed-window and Insert/Update/Delete controls | Pass: 10-second window and three event types were shown |
| U24 | Clear all CDC event types and Save | Pass: rejected with “Choose at least one CDC change type” |
| U25 | Validate CDC source configuration without publishing or changing the source | Initially failed during the workflow check. The datasource CDC profile was subsequently verified `Ready` at 10:56:18 AM on Sep 23; the workflow preflight was not repeated after that recovery. See F4. |
| U26 | Switch to the local-development viewer, read the workflow list and an existing workflow, then attempt to Save a new manual workflow | Pass for backend authorization: viewer could read; Save was rejected with `Permission workspace:write is required.` No viewer workflow was created. Owner session was restored. |

## Findings

**F1 — Trigger-only workflows can publish and succeed without a pipeline (medium).** Create a new workflow, Save, Publish, and Run now without adding a pipeline. Version 1 and a successful no-op run were created. The graph validator checks for one trigger and connectivity but has no minimum pipeline count. If a Data Workflow is meant to orchestrate pipeline jobs, publication should reject this graph with an actionable message. Relevant Core code: `src/domain/data-workflow/services/validate-workflow-graph.ts` and `src/application/data-workflow/publish-workflow.use-case.ts`.

**F2 — Workflow list mixes draft trigger with published schedule state (medium).** After publishing and pausing a Calendar schedule, save an Interval draft without publishing. The list shows `Interval` and `Paused` together, while the detail activity panel correctly says `Calendar · paused`. The list's trigger comes from the draft; lifecycle comes from the published schedule. Either show published trigger/state together or label the draft separately. Relevant Web code: `app/(workspace)/data-workflows/_components/data-workflow-screen.tsx`.

**F3 — Workflow list never shows the observed last run (medium).** After the manual run succeeded, the list's `LAST RUN` cell remained `—` even after Refresh. The detail page showed the successful run. Web renders optional `lastRunStatus`, while Core's `DataWorkflowResponseDto` does not include it. Relevant Web code: `data-workflow-screen.tsx`; Core code: `src/presentation/data-workflow/data-workflow.response.ts`.

**F4 — CDC validation showed a transient mismatch; current profile is Ready (follow-up).** During the workflow check, validation for KasaDev `public.orders` returned “PostgreSQL source preflight failed.” A later live inspection showed the dedicated CDC profile as `Ready`, with `Last tested` at 10:56:18 AM on Sep 23. Therefore the earlier failure is not evidence that the connection is currently unavailable. The profile badge records the latest persisted CDC credential preflight, while workflow validation performs another live source/connector preflight for the selected trigger. The workflow preflight should be repeated after the successful profile validation before concluding that CDC triggering is blocked.

**F5 — Windows Web test script is not portable (low).** `npm test -- data-workflow` failed before running Vitest because Windows did not recognize the Unix-style `NODE_OPTIONS=...` assignment in `package.json`. Running Vitest after setting `$env:NODE_OPTIONS` in PowerShell passed.

**F6 — Workflow list description omits Watch Source (low).** It says workflows use manual, calendar, or interval schedules, even though Watch Source is available in the editor.

**F7 — Viewer sees controls they cannot use (low).** The viewer can open the editor and sees New workflow, Save, Publish, and graph editing controls. A Save attempt is correctly denied by the backend with `Permission workspace:write is required`, but the UI should make the workflow read-only or hide write actions for this persona. Publish and Run now authorization were not exercised in this viewer session.

## Automated checks

- Core: `npm test -- --runInBand --testPathPatterns=data-workflow` — **39 passed suites, 192 passed tests**, 3 skipped suites/tests.
- Web on PowerShell: `$env:NODE_OPTIONS='--no-experimental-webstorage'; .\node_modules\.bin\vitest.cmd run data-workflow` — **8 passed files, 33 passed tests**.
- No code was changed during this test pass. The QA workflow remains available for review, with automatic scheduling paused.

## Not established by this pass

- Automatic Calendar/Interval firing and missed-occurrence coalescing were not observed. The QA Calendar schedule was paused before its next due date; a ten-second Interval was saved only as a draft to avoid repeated runs.
- Polling change detection and CDC Insert/Update/Delete delivery were not exercised with source writes. Customer datasource rows and configuration were left untouched.
- Conditional-branch evaluation, retries, cancellation, failure recovery, concurrent claims, and multi-workflow routing from one changed table were not exercised end to end. Their focused Core tests ran, but those are distinct from a live user journey.
- Viewer read access and Save denial were checked through the running UI. Publish and Run now authorization were not exercised as viewer.
