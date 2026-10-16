import { describe, expect, it } from 'vitest';

import {
  buildPlantNodeDisplay,
  buildPlantTopologyNodeDisplays,
} from '@/app/(workspace)/plant-model/[siteId]/_components/plant-node-display';
import type { PlantModelDraft, PlantNode, PlantNodeType } from '@/src/entities/models/plant-model';

const type: PlantNodeType = {
  id: 'work-center',
  name: 'Work center',
  properties: [
    {
      id: 'code',
      key: 'code',
      name: 'Code',
      type: 'text',
      required: false,
      order: 0,
      showOnCard: true,
    },
    {
      id: 'status',
      key: 'status',
      name: 'Status',
      type: 'single-select',
      required: false,
      order: 1,
      showOnCard: true,
      options: [
        { id: 'active', label: 'Active' },
        { id: 'paused', label: 'Paused' },
      ],
    },
    {
      id: 'live-status',
      key: 'live_status',
      name: 'Live status',
      type: 'catalog-scalar',
      required: false,
      order: 2,
      catalogBinding: {
        mode: 'scalar',
        catalog: 'iceberg',
        schema: 'demo',
        table: 'plant_statuses',
        valueColumn: 'status',
        filters: [],
      },
    },
    {
      id: 'primary-equipment',
      key: 'primary_equipment',
      name: 'Primary equipment',
      type: 'node-reference',
      required: false,
      order: 3,
      showOnCard: true,
    },
  ],
};

const node: PlantNode = {
  id: 'cutting',
  name: 'Cutting 1',
  nodeTypeId: type.id,
  routingRole: 'source',
  position: { x: 0, y: 0 },
  values: { code: 'CUT_1', status: 'active', 'primary-equipment': 'filler-a' },
  localProperties: [
    {
      id: 'empty-note',
      key: 'empty_note',
      name: 'Note',
      type: 'text',
      required: false,
      order: 4,
      showOnCard: true,
    },
  ],
};

const referencedNode: PlantNode = {
  id: 'filler-a',
  name: 'Filler A',
  nodeTypeId: type.id,
  routingRole: 'intermediate',
  position: { x: 200, y: 0 },
  values: {},
  localProperties: [],
};

const draft: PlantModelDraft = {
  nodeTypes: [type],
  nodes: [node, referencedNode],
  relationships: [],
};
const labels = {
  trueValue: 'Yes',
  falseValue: 'No',
  liveValue: 'Live value',
  notSet: 'Not set',
};

describe('Plant Model node display', () => {
  it('shows configured non-empty values on the card and all properties in details', () => {
    const display = buildPlantNodeDisplay(node, type, draft, labels);

    expect(display.cardFields).toEqual([
      { id: 'code', name: 'Code', value: 'CUT_1' },
      { id: 'status', name: 'Status', value: 'Active' },
      { id: 'primary-equipment', name: 'Primary equipment', value: 'Filler A' },
    ]);
    expect(display.details).toEqual([
      { id: 'code', name: 'Code', value: 'CUT_1' },
      { id: 'status', name: 'Status', value: 'Active' },
      { id: 'live-status', name: 'Live status', value: 'Live value' },
      { id: 'primary-equipment', name: 'Primary equipment', value: 'Filler A' },
      { id: 'empty-note', name: 'Note', value: 'Not set' },
    ]);
  });

  it('projects every configured card field into the overview, including node references', () => {
    const overview = buildPlantTopologyNodeDisplays(draft, labels).get(node.id);

    expect(overview?.cardFields).toEqual([
      { id: 'code', name: 'Code', value: 'CUT_1' },
      { id: 'status', name: 'Status', value: 'Active' },
      { id: 'primary-equipment', name: 'Primary equipment', value: 'Filler A' },
    ]);
    expect(overview?.statusField).toEqual({ id: 'status', name: 'Status', value: 'Active' });
  });
});
