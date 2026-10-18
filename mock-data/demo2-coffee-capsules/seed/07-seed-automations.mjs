/**
 * Demo Data 2, phase 7 — the recurring AI jobs (UC3 and UC4/UC5).
 *
 *   1. "Weekly production plan – Coffee Capsules": every Thursday 14:00
 *      (Asia/Ho_Chi_Minh). Step 1 runs the `demo2-weekly-scheduling` skill and
 *      saves the timetable as a document; step 2 turns step 1's output into a
 *      one-page approval note for the Site Manager. This replaces "3 days of planning".
 *   2. "Pre-shift risk bulletin – Coffee Capsules": Mon–Sat 05:30. Humidity risk and
 *      equipment health, as a short document before Shift 1.
 *
 * Both are created enabled; `--test-fire` fires each once so run history exists
 * (the runs call the agent, so the agent must be up and set by 06-agents.mjs).
 *
 *   node mock-data/demo2-coffee-capsules/seed/07-seed-automations.mjs [--test-fire]
 */
import { coreFetch, sleep, writeIds } from '../ids.mjs';
import { DEMO } from '../reference.mjs';

const testFire = process.argv.includes('--test-fire');

const WORKFLOWS = [
  {
    key: 'weeklyPlan',
    name: 'Weekly production plan – Coffee Capsules',
    scheduleCron: '0 14 * * 4',
    steps: [
      {
        agentId: 'chat-assistant',
        inputTemplate: {
          message:
            'Build next week’s production schedule for the two coffee-capsule lines CAP_L1 and CAP_L2 of the Demo Data 2 plant. ' +
            'Use the demo2-weekly-scheduling skill: take next week’s demand forecast, the 30-day OEE, the HIGH humidity-risk windows ' +
            'and the assets with health below 50 so maintenance windows are kept free. Save the schedule as a document. ' +
            'Finish with a summary: number of changeovers, purged powder (kg), wet cleans, compared with the average of the hand-made schedules, and the remaining risks.',
        },
      },
      {
        agentId: 'chat-assistant',
        inputTemplate: {
          message:
            'Based on the scheduling result below, write a one-page approval note for the Site Manager to sign off next week’s production schedule ' +
            '(title "Weekly production plan – approval note"): what changes compared with this week, the humidity and maintenance risks already accounted for, ' +
            'and the decisions the Site Manager needs to make. Save it as a document.\n\nScheduling result:\n$.step1.output',
        },
      },
    ],
  },
  {
    key: 'riskBulletin',
    name: 'Pre-shift risk bulletin – Coffee Capsules',
    scheduleCron: '30 5 * * 1-6',
    steps: [
      {
        agentId: 'chat-assistant',
        inputTemplate: {
          message:
            'Write the pre-shift risk bulletin for the Demo Data 2 coffee-capsule plant (short, at most half a page): ' +
            '(1) filling-room humidity risk for the next 48 hours by zone, any HIGH windows and what to do with the milk recipes; ' +
            '(2) assets with a health index below 75, the estimated days to the limit, and the maintenance proposal; ' +
            '(3) powder loss over the last 24 hours against the 7-day average. Save it as the document "Pre-shift risk bulletin".',
        },
      },
    ],
  },
];

const listed = await coreFetch('automation-workflows');
const existing = new Map((listed.items ?? listed).map?.((item) => [item.name, item]) ?? []);
const ids = {};

for (const spec of WORKFLOWS) {
  let workflow = existing.get(spec.name);
  if (workflow === undefined) {
    workflow = await coreFetch('automation-workflows', {
      method: 'POST',
      body: { name: spec.name, triggerType: 'SCHEDULE', scheduleCron: spec.scheduleCron, scheduleTimezone: DEMO.timezone },
    });
    for (const step of spec.steps) {
      await coreFetch(`automation-workflows/${workflow.id}/steps`, { method: 'POST', body: step });
    }
    await coreFetch(`automation-workflows/${workflow.id}`, { method: 'PATCH', body: { enabled: true } });
    console.log(`Created and enabled "${spec.name}" (${spec.scheduleCron} ${DEMO.timezone}), ${spec.steps.length} step(s)`);
  } else {
    console.log(`"${spec.name}" already exists (${workflow.status})`);
  }
  ids[spec.key] = workflow.id;

  if (testFire) {
    const { runId } = await coreFetch(`automation-workflows/${workflow.id}/test-fire`, { method: 'POST', body: { payload: {} } });
    console.log(`  test-fired run ${runId}; waiting…`);
    for (let attempt = 0; attempt < 180; attempt += 1) {
      await sleep(5_000);
      const run = await coreFetch(`automation-workflows/${workflow.id}/runs/${runId}`);
      if (!['queued', 'running'].includes(String(run.status).toLowerCase())) {
        console.log(`  run ${run.status}: ${run.steps.map((s) => `${s.status} ${String(s.output ?? '').replace(/\s+/gu, ' ').slice(0, 160)}`).join(' | ')}`);
        console.log(`  documents: ${(run.documents ?? []).map((d) => d.filename ?? d.name ?? d.id).join(', ') || '—'}`);
        break;
      }
    }
  }
}
writeIds({ automationWorkflows: ids });
