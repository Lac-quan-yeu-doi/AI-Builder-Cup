import { z } from 'zod';

import type {
  PlantModelDraft,
  PlantNode,
  PlantNodeType,
  PlantPropertyDefinition,
  PlantRelationship,
  PlantRoutingRole,
} from '@/src/entities/models/plant-model';
import { validatePlantDraft } from '@/src/entities/models/plant-draft-validator';
import { clockDigitsFix } from '@/src/entities/models/video-timestamp';

/*
 * What Gemini is asked to return after watching a walkthrough. It is an
 * observation, not a plant model: Gemini reports what it saw and when, and
 * `toPlantModel` turns that into Minder's draft shape with ids, roles and
 * layout it can trust. Keeping the two apart means a bad answer is caught in
 * code rather than rendered.
 *
 * Gemini's structured output handles flat enums and strings better than
 * nullable unions, so "none" is an empty string rather than null.
 */

export const EQUIPMENT_KINDS = [
  'machine',
  'conveyor',
  'station',
  'storage',
  'inspection',
  'utility',
] as const;
export type EquipmentKind = (typeof EQUIPMENT_KINDS)[number];

export const VISIBLE_STATES = ['running', 'idle', 'stopped', 'unknown'] as const;
export type VisibleState = (typeof VISIBLE_STATES)[number];

const evidence = z.object({
  tSec: z
    .number()
    .min(0)
    .describe(
      'Seconds from the start where it is most centred and clear, not where it first appears.',
    ),
  note: z.string().describe('What in the frame shows it, in one short sentence.'),
  confidence: z.number().min(0).max(1),
});

const id = z
  .string()
  .describe('Short lowercase slug, unique across the whole answer, e.g. "washer-1".');

export const walkthroughObservationSchema = z.object({
  siteName: z.string().describe('Name shown on signage, or a short descriptive name.'),
  summary: z.string().describe('Two sentences: what the facility makes and how work flows.'),
  areas: z.array(
    z.object({
      id,
      name: z.string(),
      evidence: z.array(evidence),
    }),
  ),
  lines: z.array(
    z.object({
      id,
      name: z.string(),
      areaId: z.string().describe('Id of the containing area, or "" if unknown.'),
      evidence: z.array(evidence),
    }),
  ),
  equipment: z.array(
    z.object({
      id,
      name: z.string().describe('Label on the machine if readable, else a descriptive name.'),
      kind: z.enum(EQUIPMENT_KINDS),
      equipmentType: z.string().describe('What it is, e.g. "industrial washer", "folding table".'),
      lineId: z.string().describe('Id of the line it belongs to, or "".'),
      areaId: z.string().describe('Id of the area it sits in, or "".'),
      visibleState: z.enum(VISIBLE_STATES),
      evidence: z.array(evidence).min(1),
    }),
  ),
  flows: z.array(
    z.object({
      fromId: z.string().describe('Equipment id the material leaves.'),
      toId: z.string().describe('Equipment id the material reaches next.'),
      material: z.string().describe('What moves, e.g. "wet linen", "capsules".'),
      inferred: z
        .boolean()
        .describe('true when the flow is assumed from layout rather than seen moving.'),
      evidence: z.array(evidence),
    }),
  ),
  openQuestions: z
    .array(z.string())
    .describe('What the video does not show and a plant engineer should confirm.'),
});

export type WalkthroughObservation = z.infer<typeof walkthroughObservationSchema>;
export type Evidence = z.infer<typeof evidence>;

export interface FlowDetail {
  readonly material: string;
  readonly inferred: boolean;
  readonly evidence: readonly Evidence[];
}

export interface ExtractedTwin {
  readonly siteName: string;
  readonly summary: string;
  readonly draft: PlantModelDraft;
  /** Keyed by plant node id, earliest sighting first. */
  readonly evidence: Readonly<Record<string, readonly Evidence[]>>;
  /** Keyed by `routes-to` relationship id. */
  readonly flows: Readonly<Record<string, FlowDetail>>;
  readonly openQuestions: readonly string[];
  /** What was in Gemini's answer but could not be placed, in plain words. */
  readonly warnings: readonly string[];
}

export const PROPERTY = {
  equipmentType: 'prop-equipment-type',
  visibleState: 'prop-visible-state',
  firstSeenSec: 'prop-first-seen-sec',
} as const;

const COLUMN = 280;
const ROW = 200;

const equipmentProperties: readonly PlantPropertyDefinition[] = [
  {
    id: PROPERTY.equipmentType,
    key: 'equipment_type',
    name: 'Equipment type',
    type: 'text',
    required: false,
    order: 0,
    showOnCard: true,
  },
  {
    id: PROPERTY.visibleState,
    key: 'visible_state',
    name: 'State in video',
    type: 'single-select',
    required: false,
    order: 1,
    showOnCard: true,
    options: VISIBLE_STATES.map((state) => ({ id: state, label: capitalize(state) })),
  },
  {
    id: PROPERTY.firstSeenSec,
    key: 'first_seen_sec',
    name: 'First seen (s)',
    type: 'number',
    required: false,
    order: 2,
  },
];

const nodeTypes: readonly PlantNodeType[] = [
  { id: 'type-area', name: 'Area', properties: [] },
  { id: 'type-line', name: 'Line', properties: [] },
  ...EQUIPMENT_KINDS.map((kind) => ({
    id: equipmentTypeId(kind),
    name: capitalize(kind),
    properties: equipmentProperties,
  })),
];

export function equipmentTypeId(kind: EquipmentKind): string {
  return `type-${kind}`;
}

/**
 * Turns a walkthrough observation into a plant draft. Ids are re-slugged and
 * de-duplicated, references that point nowhere are dropped with a warning,
 * routing roles come from the flows, and positions come from a layered layout,
 * because Gemini is reliable about what it saw and unreliable about coordinates.
 * The result passes Minder Core's own validator or this throws.
 */
export function walkthroughToTwin(observation: WalkthroughObservation): ExtractedTwin {
  const warnings: string[] = [];
  const ids = new IdRegistry();
  const evidence: Record<string, Evidence[]> = {};

  const areas = observation.areas.map((area) => ({
    ...area,
    nodeId: ids.claim(area.id, area.name),
  }));
  const lines = observation.lines.map((line) => ({
    ...line,
    nodeId: ids.claim(line.id, line.name),
  }));
  const equipment = observation.equipment.map((item) => ({
    ...item,
    nodeId: ids.claim(item.id, item.name),
  }));

  const areaIds = new Map(areas.map((area) => [area.id, area.nodeId]));
  const lineIds = new Map(lines.map((line) => [line.id, line.nodeId]));
  const equipmentIds = new Map(equipment.map((item) => [item.id, item.nodeId]));

  for (const item of [...areas, ...lines, ...equipment]) {
    evidence[item.nodeId] = [...item.evidence].sort((a, b) => a.tSec - b.tSec);
  }

  const relationships: PlantRelationship[] = [];
  const contains = (parent: string, child: string) =>
    relationships.push({
      id: `contains-${parent}-${child}`,
      kind: 'contains',
      sourceNodeId: parent,
      targetNodeId: child,
    });

  const lineParent = new Map<string, string>();
  for (const line of lines) {
    const area = resolve(
      line.areaId,
      areaIds,
      `${line.name} names an area that was not listed`,
      warnings,
    );
    if (area !== undefined) {
      contains(area, line.nodeId);
      lineParent.set(line.nodeId, area);
    }
  }
  for (const item of equipment) {
    const line = resolve(
      item.lineId,
      lineIds,
      `${item.name} names a line that was not listed`,
      warnings,
    );
    const area = resolve(
      item.areaId,
      areaIds,
      `${item.name} names an area that was not listed`,
      warnings,
    );
    if (line !== undefined) contains(line, item.nodeId);
    else if (area !== undefined) contains(area, item.nodeId);
  }

  const flows: Record<string, FlowDetail> = {};
  const routeKeys = new Set<string>();
  for (const flow of observation.flows) {
    const from = equipmentIds.get(flow.fromId);
    const to = equipmentIds.get(flow.toId);
    if (from === undefined || to === undefined) {
      warnings.push(
        `A flow of ${flow.material || 'material'} points at equipment that was not listed.`,
      );
      continue;
    }
    if (from === to || routeKeys.has(`${from}>${to}`)) continue;
    routeKeys.add(`${from}>${to}`);
    const id = `route-${from}-${to}`;
    relationships.push({
      id,
      kind: 'routes-to',
      sourceNodeId: from,
      targetNodeId: to,
      name: flow.material,
    });
    flows[id] = { material: flow.material, inferred: flow.inferred, evidence: flow.evidence };
  }

  const routes = relationships.filter((value) => value.kind === 'routes-to');
  const firstSeen = (nodeId: string) => evidence[nodeId]?.[0]?.tSec ?? Number.POSITIVE_INFINITY;
  const positions = layout({
    lines: lines.map((line) => line.nodeId),
    lineParent,
    equipment: equipment.map((item) => item.nodeId),
    parentOf: new Map(
      relationships
        .filter((value) => value.kind === 'contains')
        .map((value) => [value.targetNodeId, value.sourceNodeId]),
    ),
    areas: areas.map((area) => area.nodeId),
    routes,
    firstSeen,
  });

  const nodes: PlantNode[] = [
    ...areas.map((area) => containerNode(area.nodeId, area.name, 'type-area', positions)),
    ...lines.map((line) => containerNode(line.nodeId, line.name, 'type-line', positions)),
    ...equipment.map((item): PlantNode => ({
      id: item.nodeId,
      name: clip(item.name),
      nodeTypeId: equipmentTypeId(item.kind),
      routingRole: routingRole(item.nodeId, routes),
      position: positions.get(item.nodeId) ?? { x: 0, y: 0 },
      values: {
        [PROPERTY.equipmentType]: item.equipmentType,
        [PROPERTY.visibleState]: item.visibleState,
        [PROPERTY.firstSeenSec]: round(firstSeen(item.nodeId)),
      },
      localProperties: [],
    })),
  ];

  const draft: PlantModelDraft = { nodeTypes, nodes, relationships };
  validatePlantDraft(draft);

  return {
    siteName: observation.siteName.trim() || 'Untitled site',
    summary: observation.summary.trim(),
    draft,
    evidence,
    flows,
    openQuestions: observation.openQuestions.map((value) => value.trim()).filter(Boolean),
    warnings,
  };
}

interface LayoutInput {
  readonly areas: readonly string[];
  readonly lines: readonly string[];
  readonly lineParent: ReadonlyMap<string, string>;
  readonly equipment: readonly string[];
  readonly parentOf: ReadonlyMap<string, string>;
  readonly routes: readonly PlantRelationship[];
  readonly firstSeen: (nodeId: string) => number;
}

/*
 * One row per line, in the order the walkthrough reached it. Equipment outside
 * a line gets a row per area, then one shared row. Inside a row, machines
 * follow the material flow; a cycle or a gap falls back to when the camera
 * first saw them. Containers sit at the head of their row.
 */
function layout(input: LayoutInput): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const byFirstSeen = (a: string, b: string) => input.firstSeen(a) - input.firstSeen(b);

  const rows: { head?: string; members: string[] }[] = [];
  const rowOf = new Map<string, number>();
  const addRow = (head: string | undefined) => {
    rows.push({ head, members: [] });
    if (head !== undefined) rowOf.set(head, rows.length - 1);
    return rows.length - 1;
  };

  [...input.lines].sort(byFirstSeen).forEach((line) => addRow(line));
  let loose: number | undefined;
  for (const item of [...input.equipment].sort(byFirstSeen)) {
    const parent = input.parentOf.get(item);
    let row = parent === undefined ? undefined : rowOf.get(parent);
    if (row === undefined && parent !== undefined) row = addRow(parent);
    if (row === undefined) row = loose ??= addRow(undefined);
    rows[row]!.members.push(item);
  }

  // Rows follow the walk: whichever row the camera reached first comes first,
  // but rows of one area stay together so its floor zone is one rectangle.
  const reached = (row: (typeof rows)[number]) =>
    Math.min(
      row.head === undefined ? Number.POSITIVE_INFINITY : input.firstSeen(row.head),
      ...row.members.map(input.firstSeen),
    );
  const areaIds = new Set(input.areas);
  const areaOf = (row: (typeof rows)[number]) => {
    if (row.head === undefined) return undefined;
    return areaIds.has(row.head) ? row.head : input.lineParent.get(row.head);
  };
  const areaReached = new Map<string, number>();
  for (const row of rows) {
    const area = areaOf(row);
    if (area !== undefined) {
      areaReached.set(
        area,
        Math.min(areaReached.get(area) ?? Number.POSITIVE_INFINITY, reached(row)),
      );
    }
  }
  const groupReached = (row: (typeof rows)[number]) => {
    const area = areaOf(row);
    return area === undefined ? reached(row) : (areaReached.get(area) ?? reached(row));
  };
  rows.sort(
    (a, b) =>
      groupReached(a) - groupReached(b) ||
      (areaOf(a) ?? '').localeCompare(areaOf(b) ?? '') ||
      reached(a) - reached(b),
  );

  rows.forEach((row, index) => {
    const y = index * ROW;
    if (row.head !== undefined) positions.set(row.head, { x: 0, y });
    flowOrder(row.members, input.routes, input.firstSeen).forEach((item, column) =>
      positions.set(item, { x: (column + 1) * COLUMN, y }),
    );
  });

  for (const area of input.areas) {
    if (positions.has(area)) continue;
    const childRows = rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row.head !== undefined && input.lineParent.get(row.head) === area);
    const y = childRows.length > 0 ? childRows[0]!.index * ROW : rows.length * ROW;
    positions.set(area, { x: -COLUMN, y });
  }
  return positions;
}

function flowOrder(
  members: readonly string[],
  routes: readonly PlantRelationship[],
  firstSeen: (nodeId: string) => number,
): string[] {
  const inRow = new Set(members);
  const indegree = new Map(members.map((id) => [id, 0]));
  const next = new Map<string, string[]>();
  for (const route of routes) {
    if (!inRow.has(route.sourceNodeId) || !inRow.has(route.targetNodeId)) continue;
    indegree.set(route.targetNodeId, (indegree.get(route.targetNodeId) ?? 0) + 1);
    next.set(route.sourceNodeId, [...(next.get(route.sourceNodeId) ?? []), route.targetNodeId]);
  }
  const ordered: string[] = [];
  const ready = members.filter((id) => indegree.get(id) === 0);
  while (ready.length > 0) {
    ready.sort((a, b) => firstSeen(a) - firstSeen(b));
    const id = ready.shift()!;
    ordered.push(id);
    for (const target of next.get(id) ?? []) {
      const remaining = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, remaining);
      if (remaining === 0) ready.push(target);
    }
  }
  const leftovers = members.filter((id) => !ordered.includes(id));
  return [...ordered, ...leftovers.sort((a, b) => firstSeen(a) - firstSeen(b))];
}

function routingRole(nodeId: string, routes: readonly PlantRelationship[]): PlantRoutingRole {
  const incoming = routes.some((route) => route.targetNodeId === nodeId);
  const outgoing = routes.some((route) => route.sourceNodeId === nodeId);
  if (incoming && outgoing) return 'intermediate';
  if (outgoing) return 'source';
  if (incoming) return 'sink';
  return 'none';
}

function containerNode(
  id: string,
  name: string,
  nodeTypeId: string,
  positions: ReadonlyMap<string, { x: number; y: number }>,
): PlantNode {
  return {
    id,
    name: clip(name),
    nodeTypeId,
    routingRole: 'none',
    position: positions.get(id) ?? { x: 0, y: 0 },
    values: {},
    localProperties: [],
  };
}

function resolve(
  reference: string,
  ids: ReadonlyMap<string, string>,
  warning: string,
  warnings: string[],
): string | undefined {
  if (reference.trim() === '') return undefined;
  const id = ids.get(reference);
  if (id === undefined) warnings.push(`${warning} (${reference}).`);
  return id;
}

class IdRegistry {
  private readonly taken = new Set<string>();

  /** Slugs Gemini's id (or the name when the id is unusable) and suffixes repeats. */
  claim(raw: string, name: string): string {
    const base = slug(raw) || slug(name) || 'node';
    let id = base;
    for (let n = 2; this.taken.has(id); n += 1) id = `${base}-${n}`;
    this.taken.add(id);
    return id;
  }
}

function slug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function clip(value: string): string {
  const trimmed = value.trim() || 'Unnamed';
  return trimmed.length > 160 ? `${trimmed.slice(0, 157)}...` : trimmed;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function round(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : 0;
}

/** What the walkthrough endpoint returns: the twin plus how it was made. */
export interface PlantWalkthroughResult {
  readonly twin: ExtractedTwin;
  readonly model: string;
  readonly elapsedMs: number;
  readonly inputTokens?: number;
}

/** Puts evidence times back in seconds when Gemini wrote them as clock digits (see clockDigitsFix). */
export function normalizeTwinTimes(twin: ExtractedTwin, videoSeconds: number): ExtractedTwin {
  const times = [
    ...Object.values(twin.evidence).flatMap((items) => items.map((item) => item.tSec)),
    ...Object.values(twin.flows).flatMap((flow) => flow.evidence.map((item) => item.tSec)),
  ];
  const fix = clockDigitsFix(times, videoSeconds);
  if (fix === undefined) return twin;
  const evidence = Object.fromEntries(
    Object.entries(twin.evidence).map(([id, items]) => [
      id,
      items.map((item) => ({ ...item, tSec: fix(item.tSec) })),
    ]),
  );
  return {
    ...twin,
    evidence,
    flows: Object.fromEntries(
      Object.entries(twin.flows).map(([id, flow]) => [
        id,
        { ...flow, evidence: flow.evidence.map((item) => ({ ...item, tSec: fix(item.tSec) })) },
      ]),
    ),
    draft: {
      ...twin.draft,
      nodes: twin.draft.nodes.map((node) => {
        const first = evidence[node.id]?.[0]?.tSec;
        return first === undefined || node.values[PROPERTY.firstSeenSec] === undefined
          ? node
          : {
              ...node,
              values: { ...node.values, [PROPERTY.firstSeenSec]: Math.round(first * 10) / 10 },
            };
      }),
    },
  };
}
