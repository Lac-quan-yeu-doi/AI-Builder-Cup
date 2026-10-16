import type { PlantRoutingRole } from '@/src/entities/models/plant-model';
import {
  EQUIPMENT_KINDS,
  PROPERTY,
  VISIBLE_STATES,
  type EquipmentKind,
  type ExtractedTwin,
  type VisibleState,
} from '@/src/entities/models/plant-walkthrough';

/*
 * The twin is drawn from the plant model alone. The 2D layout from
 * `toPlantModel` (one row per line, flow order left to right) becomes the
 * floor plan: x stays x, the row becomes depth. Areas and lines become floor
 * zones around the machines they contain, so nothing here needs Gemini again.
 */

export const COLUMN_UNITS = 4.2;
export const ROW_UNITS = 4.6;
const LAYOUT_COLUMN = 280;
const LAYOUT_ROW = 200;
const LINE_PADDING = 1.2;
const AREA_PADDING = 1.6;

export interface TwinMachine {
  readonly id: string;
  readonly name: string;
  readonly kind: EquipmentKind;
  readonly state: VisibleState;
  readonly equipmentType: string;
  readonly role: PlantRoutingRole;
  readonly x: number;
  readonly z: number;
  readonly lineId?: string;
  readonly areaId?: string;
}

export interface TwinZone {
  readonly id: string;
  readonly name: string;
  readonly kind: 'area' | 'line';
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface TwinFlow {
  readonly id: string;
  readonly fromId: string;
  readonly toId: string;
  readonly from: readonly [number, number];
  readonly to: readonly [number, number];
  readonly material: string;
  readonly inferred: boolean;
}

export interface TwinScene {
  readonly machines: readonly TwinMachine[];
  readonly zones: readonly TwinZone[];
  readonly flows: readonly TwinFlow[];
  readonly bounds: {
    readonly minX: number;
    readonly maxX: number;
    readonly minZ: number;
    readonly maxZ: number;
  };
}

export function buildTwinScene(twin: ExtractedTwin): TwinScene {
  const { nodes, relationships } = twin.draft;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const parentOf = new Map(
    relationships
      .filter((value) => value.kind === 'contains')
      .map((value) => [value.targetNodeId, value.sourceNodeId]),
  );
  const typeOf = (id: string | undefined) =>
    id === undefined ? undefined : byId.get(id)?.nodeTypeId;

  const machines: TwinMachine[] = nodes
    .filter((node) => node.nodeTypeId !== 'type-area' && node.nodeTypeId !== 'type-line')
    .map((node) => {
      const parent = parentOf.get(node.id);
      const lineId = typeOf(parent) === 'type-line' ? parent : undefined;
      const areaId =
        typeOf(parent) === 'type-area'
          ? parent
          : lineId !== undefined && typeOf(parentOf.get(lineId)) === 'type-area'
            ? parentOf.get(lineId)
            : undefined;
      return {
        id: node.id,
        name: node.name,
        kind: kindOf(node.nodeTypeId),
        state: stateOf(node.values[PROPERTY.visibleState]),
        equipmentType: String(node.values[PROPERTY.equipmentType] ?? ''),
        role: node.routingRole,
        x: (node.position.x / LAYOUT_COLUMN) * COLUMN_UNITS,
        z: (node.position.y / LAYOUT_ROW) * ROW_UNITS,
        lineId,
        areaId,
      };
    });

  const zones: TwinZone[] = [];
  for (const node of nodes) {
    if (node.nodeTypeId !== 'type-area' && node.nodeTypeId !== 'type-line') continue;
    const kind = node.nodeTypeId === 'type-area' ? 'area' : 'line';
    const members = machines.filter((machine) =>
      kind === 'area' ? machine.areaId === node.id : machine.lineId === node.id,
    );
    if (members.length === 0) continue;
    const pad = kind === 'area' ? AREA_PADDING : LINE_PADDING;
    zones.push({
      id: node.id,
      name: node.name,
      kind,
      minX: Math.min(...members.map((machine) => machine.x)) - pad,
      maxX: Math.max(...members.map((machine) => machine.x)) + pad,
      minZ: Math.min(...members.map((machine) => machine.z)) - pad,
      maxZ: Math.max(...members.map((machine) => machine.z)) + pad,
    });
  }
  // Areas first, so lines draw on top of them.
  zones.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'area' ? -1 : 1));

  const at = new Map(machines.map((machine) => [machine.id, [machine.x, machine.z] as const]));
  const flows: TwinFlow[] = relationships
    .filter((value) => value.kind === 'routes-to')
    .flatMap((value) => {
      const from = at.get(value.sourceNodeId);
      const to = at.get(value.targetNodeId);
      const detail = twin.flows[value.id];
      if (from === undefined || to === undefined) return [];
      return [
        {
          id: value.id,
          fromId: value.sourceNodeId,
          toId: value.targetNodeId,
          from,
          to,
          material: detail?.material ?? value.name ?? '',
          inferred: detail?.inferred ?? true,
        },
      ];
    });

  const xs = [
    ...machines.map((machine) => machine.x),
    ...zones.flatMap((zone) => [zone.minX, zone.maxX]),
  ];
  const zs = [
    ...machines.map((machine) => machine.z),
    ...zones.flatMap((zone) => [zone.minZ, zone.maxZ]),
  ];
  const bounds =
    xs.length === 0
      ? { minX: -1, maxX: 1, minZ: -1, maxZ: 1 }
      : {
          minX: Math.min(...xs),
          maxX: Math.max(...xs),
          minZ: Math.min(...zs),
          maxZ: Math.max(...zs),
        };

  return { machines, zones, flows, bounds };
}

function kindOf(nodeTypeId: string): EquipmentKind {
  const kind = nodeTypeId.replace(/^type-/, '');
  return (EQUIPMENT_KINDS as readonly string[]).includes(kind)
    ? (kind as EquipmentKind)
    : 'machine';
}

function stateOf(value: unknown): VisibleState {
  return (VISIBLE_STATES as readonly unknown[]).includes(value)
    ? (value as VisibleState)
    : 'unknown';
}
