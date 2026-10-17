import type {
  PlantModelDraft,
  PlantModelTemplate,
  PlantReferenceData,
} from '@domain/plant-model/models/plant-model';

import { demo1HomeAppliance } from './plant-model.template.demo1-home-appliance';
import { demo2CoffeeCapsules } from './plant-model.template.demo2-coffee-capsules';

const blank: PlantModelDraft = { nodeTypes: [], nodes: [], relationships: [] };

const apparel: PlantModelDraft = {
  nodeTypes: [
    {
      id: '10000000-0000-4000-8000-000000000001',
      name: 'Area',
      properties: [],
    },
    {
      id: '10000000-0000-4000-8000-000000000002',
      name: 'Work center',
      properties: [
        {
          id: '10000000-0000-4000-8000-000000000010',
          key: 'code',
          name: 'Code',
          type: 'text',
          required: false,
          order: 0,
          showOnCard: true,
        },
        {
          id: '10000000-0000-4000-8000-000000000011',
          key: 'status',
          name: 'Status',
          type: 'single-select',
          required: false,
          order: 1,
          showOnCard: true,
          options: [
            { id: '10000000-0000-4000-8000-000000000012', label: 'Active' },
            { id: '10000000-0000-4000-8000-000000000013', label: 'Maintenance' },
          ],
        },
        {
          id: '10000000-0000-4000-8000-000000000014',
          key: 'status_id',
          name: 'Status ID',
          type: 'number',
          required: false,
          order: 2,
        },
        {
          id: '10000000-0000-4000-8000-000000000015',
          key: 'live_status',
          name: 'Live catalog status',
          type: 'catalog-scalar',
          required: false,
          order: 3,
          catalogBinding: {
            mode: 'scalar',
            catalog: 'iceberg',
            schema: 'demo',
            table: 'plant_statuses',
            valueColumn: 'status',
            labelColumn: 'label',
            filters: [
              {
                column: 'id',
                operator: 'eq',
                operand: {
                  kind: 'property',
                  propertyDefinitionId: '10000000-0000-4000-8000-000000000014',
                },
              },
            ],
            limit: 2,
          },
        },
      ],
    },
    {
      id: '10000000-0000-4000-8000-000000000003',
      name: 'Equipment',
      properties: [],
    },
  ],
  nodes: [
    {
      id: '20000000-0000-4000-8000-000000000001',
      name: 'Apparel line 1',
      nodeTypeId: '10000000-0000-4000-8000-000000000001',
      routingRole: 'none',
      position: { x: 40, y: 40 },
      values: {},
      localProperties: [],
    },
    ...[
      ['20000000-0000-4000-8000-000000000010', 'Cutting 1', 'CUT_1', 80, 180, 'source'],
      ['20000000-0000-4000-8000-000000000011', 'Sewing 1', 'SEW_1', 340, 180, 'intermediate'],
      ['20000000-0000-4000-8000-000000000012', 'QC gate A', 'QC_A', 600, 180, 'intermediate'],
      ['20000000-0000-4000-8000-000000000013', 'Packing 1', 'PACK_1', 860, 180, 'sink'],
    ].map(([id, name, code, x, y, routingRole]) => ({
      id: id as string,
      name: name as string,
      nodeTypeId: '10000000-0000-4000-8000-000000000002',
      routingRole: routingRole as 'source' | 'intermediate' | 'sink',
      position: { x: x as number, y: y as number },
      values: {
        '10000000-0000-4000-8000-000000000010': code as string,
        '10000000-0000-4000-8000-000000000011': '10000000-0000-4000-8000-000000000012',
        '10000000-0000-4000-8000-000000000014': 1,
      },
      localProperties: [],
    })),
    {
      id: '20000000-0000-4000-8000-000000000020',
      name: 'Cutter A',
      nodeTypeId: '10000000-0000-4000-8000-000000000003',
      routingRole: 'none',
      position: { x: 80, y: 330 },
      values: {},
      localProperties: [],
    },
  ],
  relationships: [
    ...[
      '20000000-0000-4000-8000-000000000010',
      '20000000-0000-4000-8000-000000000011',
      '20000000-0000-4000-8000-000000000012',
      '20000000-0000-4000-8000-000000000013',
    ].map((targetNodeId, index) => ({
      id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      kind: 'contains' as const,
      sourceNodeId: '20000000-0000-4000-8000-000000000001',
      targetNodeId,
    })),
    {
      id: '30000000-0000-4000-8000-000000000010',
      kind: 'contains',
      sourceNodeId: '20000000-0000-4000-8000-000000000010',
      targetNodeId: '20000000-0000-4000-8000-000000000020',
    },
    ...[
      ['20000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000011'],
      ['20000000-0000-4000-8000-000000000011', '20000000-0000-4000-8000-000000000012'],
      ['20000000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-000000000013'],
    ].map(([sourceNodeId, targetNodeId], index) => ({
      id: `30000000-0000-4000-8001-${String(index + 1).padStart(12, '0')}`,
      kind: 'routes-to' as const,
      sourceNodeId: sourceNodeId!,
      targetNodeId: targetNodeId!,
    })),
  ],
};

const propertyTypeShowcase: PlantModelDraft = {
  nodeTypes: [
    {
      id: '11000000-0000-4000-8000-000000000001',
      name: 'Facility',
      properties: [
        {
          id: '11000000-0000-4000-8000-000000000010',
          key: 'site_code',
          name: 'Site code',
          type: 'text',
          required: true,
          description: 'Free-form text, such as an ERP or corporate identifier.',
          order: 0,
        },
        {
          id: '11000000-0000-4000-8000-000000000011',
          key: 'commissioned_at',
          name: 'Commissioned at',
          type: 'datetime',
          required: false,
          description: 'A date and time value.',
          order: 1,
        },
        {
          id: '11000000-0000-4000-8000-000000000012',
          key: 'is_operational',
          name: 'Operational',
          type: 'boolean',
          required: false,
          description: 'A true or false value.',
          order: 2,
        },
        {
          id: '11000000-0000-4000-8000-000000000013',
          key: 'region',
          name: 'Region',
          type: 'single-select',
          required: false,
          description: 'Choose one option from a reusable value set.',
          order: 3,
          options: [
            { id: '11000000-0000-4000-8000-000000000014', label: 'South' },
            { id: '11000000-0000-4000-8000-000000000015', label: 'Central' },
            { id: '11000000-0000-4000-8000-000000000016', label: 'North' },
          ],
        },
        {
          id: '11000000-0000-4000-8000-000000000017',
          key: 'certifications',
          name: 'Certifications',
          type: 'multi-select',
          required: false,
          description: 'Choose several options from a reusable value set.',
          order: 4,
          options: [
            { id: '11000000-0000-4000-8000-000000000018', label: 'ISO 9001' },
            { id: '11000000-0000-4000-8000-000000000019', label: 'ISO 14001' },
            { id: '11000000-0000-4000-8000-000000000020', label: 'ISO 45001' },
          ],
        },
      ],
    },
    {
      id: '11000000-0000-4000-8000-000000000002',
      name: 'Production line',
      properties: [
        {
          id: '11000000-0000-4000-8000-000000000030',
          key: 'target_units_per_hour',
          name: 'Target units per hour',
          type: 'number',
          required: false,
          description: 'A numeric value, including decimal values.',
          order: 0,
          showOnCard: true,
        },
        {
          id: '11000000-0000-4000-8000-000000000031',
          key: 'primary_equipment',
          name: 'Primary equipment',
          type: 'node-reference',
          required: false,
          description: 'A reference to another node in this plant model.',
          order: 1,
        },
      ],
    },
    {
      id: '11000000-0000-4000-8000-000000000003',
      name: 'Equipment',
      properties: [
        {
          id: '11000000-0000-4000-8000-000000000040',
          key: 'status_id',
          name: 'Status ID',
          type: 'number',
          required: true,
          description: 'Used as the parameter for the live status lookup below.',
          order: 0,
          showOnCard: true,
        },
        {
          id: '11000000-0000-4000-8000-000000000041',
          key: 'live_status',
          name: 'Live status',
          type: 'catalog-scalar',
          required: false,
          description: 'Read-only live value resolved from one catalog row.',
          order: 1,
          catalogBinding: {
            mode: 'scalar',
            catalog: 'iceberg',
            schema: 'demo',
            table: 'plant_statuses',
            valueColumn: 'status',
            labelColumn: 'label',
            filters: [
              {
                column: 'id',
                operator: 'eq',
                operand: {
                  kind: 'property',
                  propertyDefinitionId: '11000000-0000-4000-8000-000000000040',
                },
              },
            ],
            limit: 2,
          },
        },
        {
          id: '11000000-0000-4000-8000-000000000042',
          key: 'preferred_status',
          name: 'Preferred status',
          type: 'catalog-choices',
          required: false,
          description: 'Choose one value from a live catalog-backed option list.',
          order: 2,
          showOnCard: true,
          catalogBinding: {
            mode: 'choices',
            catalog: 'iceberg',
            schema: 'demo',
            table: 'plant_statuses',
            valueColumn: 'status',
            labelColumn: 'label',
            filters: [],
            orderBy: { column: 'status', direction: 'asc' },
            limit: 100,
          },
        },
        {
          id: '11000000-0000-4000-8000-000000000043',
          key: 'allowed_statuses',
          name: 'Allowed statuses',
          type: 'catalog-multi-select',
          required: false,
          description: 'Choose several values from a live catalog-backed option list.',
          order: 3,
          catalogBinding: {
            mode: 'choices',
            catalog: 'iceberg',
            schema: 'demo',
            table: 'plant_statuses',
            valueColumn: 'status',
            labelColumn: 'label',
            filters: [],
            orderBy: { column: 'status', direction: 'asc' },
            limit: 100,
          },
        },
      ],
    },
    {
      id: '11000000-0000-4000-8000-000000000004',
      name: 'Warehouse',
      properties: [],
    },
  ],
  nodes: [
    {
      id: '21000000-0000-4000-8000-000000000001',
      name: 'Binh Duong showcase plant',
      nodeTypeId: '11000000-0000-4000-8000-000000000001',
      routingRole: 'none',
      position: { x: 40, y: 40 },
      values: {
        '11000000-0000-4000-8000-000000000010': 'BD-SHOWCASE-01',
        '11000000-0000-4000-8000-000000000011': '2025-01-15T01:30:00.000Z',
        '11000000-0000-4000-8000-000000000012': true,
        '11000000-0000-4000-8000-000000000013': '11000000-0000-4000-8000-000000000014',
        '11000000-0000-4000-8000-000000000017': [
          '11000000-0000-4000-8000-000000000018',
          '11000000-0000-4000-8000-000000000019',
        ],
      },
      localProperties: [],
    },
    {
      id: '21000000-0000-4000-8000-000000000002',
      name: 'Filling line 1',
      nodeTypeId: '11000000-0000-4000-8000-000000000002',
      routingRole: 'source',
      position: { x: 80, y: 210 },
      values: {
        '11000000-0000-4000-8000-000000000030': 1200.5,
        '11000000-0000-4000-8000-000000000031': '21000000-0000-4000-8000-000000000003',
      },
      localProperties: [],
    },
    {
      id: '21000000-0000-4000-8000-000000000003',
      name: 'Filler A',
      nodeTypeId: '11000000-0000-4000-8000-000000000003',
      routingRole: 'intermediate',
      position: { x: 390, y: 210 },
      values: {
        '11000000-0000-4000-8000-000000000040': 1,
        '11000000-0000-4000-8000-000000000042': 'running',
        '11000000-0000-4000-8000-000000000043': ['running', 'maintenance'],
      },
      localProperties: [],
    },
    {
      id: '21000000-0000-4000-8000-000000000004',
      name: 'Finished goods warehouse',
      nodeTypeId: '11000000-0000-4000-8000-000000000004',
      routingRole: 'sink',
      position: { x: 700, y: 210 },
      values: {
        '11000000-0000-4000-8000-000000000050': 'One-off metadata belongs to this node only.',
      },
      localProperties: [
        {
          id: '11000000-0000-4000-8000-000000000050',
          key: 'storage_note',
          name: 'Storage note',
          type: 'text',
          required: false,
          description: 'Example of a node-local property instead of a reusable type property.',
          order: 0,
        },
      ],
    },
  ],
  relationships: [
    ...[
      '21000000-0000-4000-8000-000000000002',
      '21000000-0000-4000-8000-000000000003',
      '21000000-0000-4000-8000-000000000004',
    ].map((targetNodeId, index) => ({
      id: `31000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      kind: 'contains' as const,
      sourceNodeId: '21000000-0000-4000-8000-000000000001',
      targetNodeId,
    })),
    {
      id: '31000000-0000-4000-8001-000000000001',
      kind: 'routes-to',
      sourceNodeId: '21000000-0000-4000-8000-000000000002',
      targetNodeId: '21000000-0000-4000-8000-000000000003',
    },
    {
      id: '31000000-0000-4000-8001-000000000002',
      kind: 'routes-to',
      sourceNodeId: '21000000-0000-4000-8000-000000000003',
      targetNodeId: '21000000-0000-4000-8000-000000000004',
    },
  ],
};

export const PLANT_MODEL_TEMPLATES: readonly PlantModelTemplate[] = Object.freeze([
  { id: 'blank', name: 'Blank plant', description: 'Start with an empty model.', draft: blank },
  {
    id: 'apparel',
    name: 'Apparel line',
    description:
      'Start with an area, reusable work centers, child equipment, and a complete route.',
    draft: apparel,
  },
  {
    id: 'demo1-home-appliance',
    name: 'Demo Data 1 – Home Appliance Plant (Chest Freezers)',
    description:
      'A chest-freezer plant: 7 areas, 3 lines, a 13-step route from sheet pressing to finished-goods receipt, equipment and utilities, with two properties read live from the data warehouse.',
    draft: demo1HomeAppliance,
  },
  {
    id: 'demo2-coffee-capsules',
    name: 'Demo Data 2 – Coffee Capsule Plant',
    description:
      'Two coffee-capsule filling and packing lines: 11 stations per line from powder feed to finished goods, a humidity-controlled filling room, equipment, utilities, and live status, health and environment properties read from the data warehouse.',
    draft: demo2CoffeeCapsules,
  },
  {
    id: 'property-type-showcase',
    name: 'Property type showcase',
    description:
      'Explore every property editor with populated values, hierarchy, routing, and live catalog bindings.',
    draft: propertyTypeShowcase,
  },
]);

export const DEFAULT_PLANT_REFERENCE_DATA: PlantReferenceData = Object.freeze({
  shiftCalendar: Object.freeze({ timezone: 'Asia/Ho_Chi_Minh', patterns: [] }),
  downtimeReasons: Object.freeze([]),
  defectCodes: Object.freeze([]),
});
