import type {
  PlantModelDraft,
  PlantNode,
  PlantRoutingRole,
} from '@/src/entities/models/plant-model';
import {
  EQUIPMENT_KINDS,
  PROPERTY,
  VISIBLE_STATES,
  type EquipmentKind,
  type FlowDetail,
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

/** What the scene needs from a twin: the model, and what is known about each flow. */
export interface TwinSource {
  readonly draft: PlantModelDraft;
  readonly flows: Readonly<Record<string, Pick<FlowDetail, 'material' | 'inferred'>>>;
}

export function buildTwinScene(twin: TwinSource): TwinScene {
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

  return withBounds(machines, zones, flows);
}

/*
 * A saved plant has no floor plan: its node positions are the editor's tree
 * layout, one row per depth. So the floor is laid out here from the hierarchy
 * instead. Each area under the plant becomes a floor zone; inside it, each
 * work center (or other container) is one row of its machines, in the order
 * the editor lists them. Areas sit side by side in a rough square, and the
 * saved routes become flows. A plant made from a walkthrough already carries
 * its floor plan, so it keeps it.
 */
const CONTAINER_TYPE = /\b(area|room|zone|hall|building|site|plant|line)\b/iu;
const AREA_GAP = COLUMN_UNITS * 1.5;

export function plantTwinScene(draft: PlantModelDraft): TwinScene {
  const recorded = Object.fromEntries(
    draft.relationships
      .filter((value) => value.kind === 'routes-to')
      .map((value) => [value.id, { material: value.name ?? '', inferred: false }]),
  );
  if (draft.nodeTypes.some((type) => type.id === 'type-area' || type.id === 'type-line')) {
    return buildTwinScene({ draft, flows: recorded });
  }

  const byId = new Map(draft.nodes.map((node) => [node.id, node]));
  const typeName = new Map(draft.nodeTypes.map((type) => [type.id, type.name]));
  const children = new Map<string, PlantNode[]>();
  const parentOf = new Map<string, string>();
  for (const value of draft.relationships) {
    const child = byId.get(value.targetNodeId);
    if (value.kind !== 'contains' || child === undefined || !byId.has(value.sourceNodeId)) {
      continue;
    }
    parentOf.set(child.id, value.sourceNodeId);
    children.set(value.sourceNodeId, [...(children.get(value.sourceNodeId) ?? []), child]);
  }
  const editorOrder = (a: PlantNode, b: PlantNode) =>
    a.position.y - b.position.y || a.position.x - b.position.x;
  const childrenOf = (id: string) => [...(children.get(id) ?? [])].sort(editorOrder);
  // An empty container, such as a line nothing was filed under yet, is not a machine.
  const isMachine = (node: PlantNode) =>
    !children.has(node.id) && !CONTAINER_TYPE.test(typeName.get(node.nodeTypeId) ?? '');

  const roots = draft.nodes.filter((node) => !parentOf.has(node.id)).sort(editorOrder);
  const [only] = roots;
  // One container at the top is the plant itself; its children are the areas.
  const top =
    roots.length === 1 && only !== undefined && children.has(only.id) ? childrenOf(only.id) : roots;
  const areas = top.filter((node) => children.has(node.id));
  const loose = top.filter(isMachine);

  const machines: TwinMachine[] = [];
  const zones: TwinZone[] = [];
  const perRow = Math.max(1, Math.ceil(Math.sqrt(areas.length + (loose.length > 0 ? 1 : 0))));
  let originX = 0;
  let originZ = 0;
  let rowDepth = 0;
  let placed = 0;

  const placeBlock = (
    rows: readonly (readonly PlantNode[])[],
    areaId?: string,
    lineIds?: readonly (string | undefined)[],
  ) => {
    if (placed > 0 && placed % perRow === 0) {
      originX = 0;
      originZ += rowDepth + AREA_GAP;
      rowDepth = 0;
    }
    const width = Math.max(...rows.map((row) => row.length)) - 1;
    rows.forEach((row, rowIndex) => {
      row.forEach((node, column) => {
        machines.push({
          ...machineOf(node, typeName.get(node.nodeTypeId) ?? ''),
          x: originX + column * COLUMN_UNITS,
          z: originZ + rowIndex * ROW_UNITS,
          lineId: lineIds?.[rowIndex],
          areaId,
        });
      });
    });
    originX += width * COLUMN_UNITS + AREA_GAP;
    rowDepth = Math.max(rowDepth, (rows.length - 1) * ROW_UNITS);
    placed += 1;
  };

  for (const area of areas) {
    // Each row is the machines one container holds directly, nearest first.
    const rows: PlantNode[][] = [];
    const lineIds: (string | undefined)[] = [];
    const visit = (container: PlantNode) => {
      const kids = childrenOf(container.id);
      const own = kids.filter(isMachine);
      if (own.length > 0) {
        rows.push(own);
        lineIds.push(container.id === area.id ? undefined : container.id);
      }
      for (const kid of kids) if (children.has(kid.id)) visit(kid);
    };
    visit(area);
    if (rows.length === 0) continue;
    placeBlock(rows, area.id, lineIds);
    const members = machines.filter((machine) => machine.areaId === area.id);
    zones.push(zoneAround(area, 'area', members, AREA_PADDING));
    for (const lineId of new Set(lineIds)) {
      const line = lineId === undefined ? undefined : byId.get(lineId);
      if (line === undefined) continue;
      const lineMembers = members.filter((machine) => machine.lineId === line.id);
      zones.push(zoneAround(line, 'line', lineMembers, LINE_PADDING));
    }
  }
  if (loose.length > 0) placeBlock([loose]);

  // Areas first, so lines draw on top of them.
  zones.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'area' ? -1 : 1));

  // A route may join containers rather than machines: it then runs between
  // the middle of what each one holds.
  const pointOf = (id: string): readonly [number, number] | undefined => {
    const machine = machines.find((value) => value.id === id);
    if (machine !== undefined) return [machine.x, machine.z];
    const members = machines.filter((value) => holds(id, value.id));
    if (members.length === 0) return undefined;
    return [
      members.reduce((sum, value) => sum + value.x, 0) / members.length,
      members.reduce((sum, value) => sum + value.z, 0) / members.length,
    ];
  };
  const holds = (containerId: string, nodeId: string): boolean => {
    for (let id = parentOf.get(nodeId); id !== undefined; id = parentOf.get(id)) {
      if (id === containerId) return true;
    }
    return false;
  };
  const flows: TwinFlow[] = draft.relationships
    .filter((value) => value.kind === 'routes-to')
    .flatMap((value) => {
      const from = pointOf(value.sourceNodeId);
      const to = pointOf(value.targetNodeId);
      if (from === undefined || to === undefined) return [];
      if (from[0] === to[0] && from[1] === to[1]) return [];
      return [
        {
          id: value.id,
          fromId: value.sourceNodeId,
          toId: value.targetNodeId,
          from,
          to,
          material: value.name ?? '',
          inferred: false,
        },
      ];
    });

  return withBounds(machines, zones, flows);
}

function machineOf(node: PlantNode, typeName: string) {
  return {
    id: node.id,
    name: node.name,
    kind: kindOfTypeName(typeName),
    state: stateOf(node.values[PROPERTY.visibleState]),
    equipmentType: typeName,
    role: node.routingRole,
  };
}

function kindOfTypeName(name: string): EquipmentKind {
  if (/conveyor|belt/iu.test(name)) return 'conveyor';
  if (/warehouse|storage|silo|tank|store/iu.test(name)) return 'storage';
  if (/inspect|quality|test|lab/iu.test(name)) return 'inspection';
  if (/utility|boiler|compressor|chiller|power/iu.test(name)) return 'utility';
  if (/station|work ?center|cell/iu.test(name)) return 'station';
  return 'machine';
}

function zoneAround(
  node: PlantNode,
  kind: TwinZone['kind'],
  members: readonly TwinMachine[],
  pad: number,
): TwinZone {
  return {
    id: node.id,
    name: node.name,
    kind,
    minX: Math.min(...members.map((machine) => machine.x)) - pad,
    maxX: Math.max(...members.map((machine) => machine.x)) + pad,
    minZ: Math.min(...members.map((machine) => machine.z)) - pad,
    maxZ: Math.max(...members.map((machine) => machine.z)) + pad,
  };
}

function withBounds(
  machines: readonly TwinMachine[],
  zones: readonly TwinZone[],
  flows: readonly TwinFlow[],
): TwinScene {
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
