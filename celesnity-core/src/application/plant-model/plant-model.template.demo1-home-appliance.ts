import type {
  PlantCatalogBinding,
  PlantModelDraft,
  PlantNodeType,
  PlantPropertyDefinition,
  PlantPropertyValue,
  PlantReferenceData,
} from '@domain/plant-model/models/plant-model';

/*
 * Demo Data 1 – Home Appliance Plant (Chest Freezers).
 *
 * A chest-freezer plant of roughly ten hectares, 375,000 products a year across
 * three lines. All data is mock data. The route follows a real chest-freezer
 * process chain, and COIL_WIND carries the coil properties that separate the
 * `…-CU` (copper coil) model codes from the `…-AL` (aluminium coil) ones — the
 * detail that makes the graph recognizable to the people who run such a plant.
 *
 * Two properties are catalog-bound, so a node card reads its live value out of
 * `iceberg.demo1_home_appliance` rather than out of the stored draft. They stay
 * blank until that database exists; a catalog-scalar is exempt from the
 * publish-time required check for exactly this reason.
 */
const demo1SchemaId = (value: number): string =>
  `12000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const demo1NodeId = (value: number): string =>
  `22000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const demo1ContainsId = (value: number): string =>
  `32000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const demo1RouteId = (value: number): string =>
  `32000000-0000-4000-8001-${String(value).padStart(12, '0')}`;

const demo1TypeId = {
  area: demo1SchemaId(1),
  line: demo1SchemaId(2),
  workCenter: demo1SchemaId(3),
  equipment: demo1SchemaId(4),
  utility: demo1SchemaId(5),
  warehouse: demo1SchemaId(6),
} as const;

const demo1Property = {
  areaCode: demo1SchemaId(10),
  areaManager: demo1SchemaId(11),
  areaSize: demo1SchemaId(12),
  areaShifts: demo1SchemaId(13),
  lineCode: demo1SchemaId(20),
  lineFamily: demo1SchemaId(21),
  lineTakt: demo1SchemaId(26),
  lineCapacity: demo1SchemaId(27),
  lineOeeTarget: demo1SchemaId(28),
  centerCode: demo1SchemaId(30),
  centerStatus: demo1SchemaId(31),
  centerStatusId: demo1SchemaId(35),
  centerStatusLive: demo1SchemaId(36),
  centerCycle: demo1SchemaId(37),
  centerHeadcount: demo1SchemaId(38),
  centerLine: demo1SchemaId(39),
  equipmentCode: demo1SchemaId(40),
  equipmentVendor: demo1SchemaId(41),
  equipmentYear: demo1SchemaId(42),
  equipmentPower: demo1SchemaId(43),
  equipmentPmDays: demo1SchemaId(44),
  equipmentOeeLive: demo1SchemaId(45),
  utilityCode: demo1SchemaId(50),
  utilityKind: demo1SchemaId(51),
  utilityPower: demo1SchemaId(56),
  warehouseCode: demo1SchemaId(60),
  warehousePallets: demo1SchemaId(61),
  coilLayers: demo1SchemaId(80),
  coilMaterial: demo1SchemaId(81),
  mouldTemperature: demo1SchemaId(85),
} as const;

const demo1ShiftOption = { two: demo1SchemaId(15), three: demo1SchemaId(16) } as const;
const demo1FamilyOption = {
  steelLid: demo1SchemaId(22),
  glassLid: demo1SchemaId(23),
  mini: demo1SchemaId(24),
} as const;
const demo1StatusOption = {
  running: demo1SchemaId(32),
  maintenance: demo1SchemaId(33),
} as const;
const demo1UtilityOption = {
  air: demo1SchemaId(52),
  chiller: demo1SchemaId(53),
  power: demo1SchemaId(54),
} as const;
const demo1CoilOption = { copper: demo1SchemaId(82), aluminium: demo1SchemaId(83) } as const;

/** Live status of a work center, keyed by the node's own `status_id`. */
const demo1StatusBinding: PlantCatalogBinding = {
  mode: 'scalar',
  catalog: 'iceberg',
  schema: 'demo1_home_appliance',
  table: 'dm_workcenter_status',
  valueColumn: 'status',
  labelColumn: 'label',
  filters: [
    {
      column: 'status_id',
      operator: 'eq',
      operand: { kind: 'property', propertyDefinitionId: demo1Property.centerStatusId },
    },
  ],
  limit: 1,
};

/** Live OEE of one machine, keyed by the node's own equipment code. */
const demo1EquipmentOeeBinding: PlantCatalogBinding = {
  mode: 'scalar',
  catalog: 'iceberg',
  schema: 'demo1_home_appliance',
  table: 'dm_equipment_oee',
  valueColumn: 'oee',
  labelColumn: 'label',
  filters: [
    {
      column: 'equipment_code',
      operator: 'eq',
      operand: { kind: 'property', propertyDefinitionId: demo1Property.equipmentCode },
    },
  ],
  limit: 1,
};

const demo1NodeTypes: readonly PlantNodeType[] = [
  {
    id: demo1TypeId.area,
    name: 'Area',
    properties: [
      {
        id: demo1Property.areaCode,
        key: 'area_code',
        name: 'Area code',
        type: 'text',
        required: true,
        order: 0,
        showOnCard: true,
      },
      {
        id: demo1Property.areaManager,
        key: 'supervisor',
        name: 'Supervisor',
        type: 'text',
        required: false,
        order: 1,
      },
      {
        id: demo1Property.areaSize,
        key: 'floor_area_m2',
        name: 'Floor area (m²)',
        type: 'number',
        required: false,
        order: 2,
      },
      {
        id: demo1Property.areaShifts,
        key: 'shifts_per_day',
        name: 'Shifts / day',
        type: 'single-select',
        required: false,
        order: 3,
        options: [
          { id: demo1SchemaId(14), label: '1 shift' },
          { id: demo1ShiftOption.two, label: '2 shifts' },
          { id: demo1ShiftOption.three, label: '3 shifts' },
        ],
      },
    ],
  },
  {
    id: demo1TypeId.line,
    name: 'Line',
    properties: [
      {
        id: demo1Property.lineCode,
        key: 'line_code',
        name: 'Line code',
        type: 'text',
        required: true,
        order: 0,
        showOnCard: true,
      },
      {
        id: demo1Property.lineFamily,
        key: 'product_family',
        name: 'Product family',
        type: 'single-select',
        required: false,
        order: 1,
        showOnCard: true,
        options: [
          { id: demo1FamilyOption.steelLid, label: 'Steel-lid chest freezer' },
          { id: demo1FamilyOption.glassLid, label: 'Glass-top freezer / beverage cooler' },
          { id: demo1FamilyOption.mini, label: 'Mini chest freezer' },
          { id: demo1SchemaId(25), label: 'Beverage cooler' },
        ],
      },
      {
        id: demo1Property.lineTakt,
        key: 'takt_time_sec',
        name: 'Takt time (sec)',
        type: 'number',
        required: false,
        order: 2,
      },
      {
        id: demo1Property.lineCapacity,
        key: 'daily_capacity',
        name: 'Capacity (units/day)',
        type: 'number',
        required: false,
        order: 3,
      },
      {
        id: demo1Property.lineOeeTarget,
        key: 'oee_target_pct',
        name: 'OEE target (%)',
        type: 'number',
        required: false,
        order: 4,
      },
    ],
  },
  {
    id: demo1TypeId.workCenter,
    name: 'Work center',
    properties: [
      {
        id: demo1Property.centerCode,
        key: 'workcenter_code',
        name: 'Work center code',
        type: 'text',
        required: true,
        order: 0,
        showOnCard: true,
      },
      {
        id: demo1Property.centerStatus,
        key: 'status',
        name: 'Status (declared)',
        type: 'single-select',
        required: false,
        order: 1,
        showOnCard: true,
        options: [
          { id: demo1StatusOption.running, label: 'Running' },
          { id: demo1StatusOption.maintenance, label: 'Maintenance' },
          { id: demo1SchemaId(34), label: 'Stopped' },
        ],
      },
      {
        id: demo1Property.centerStatusId,
        key: 'status_id',
        name: 'Status id',
        type: 'number',
        required: false,
        description: 'Lookup key into the status table in the data warehouse.',
        order: 2,
      },
      {
        id: demo1Property.centerStatusLive,
        key: 'status_live',
        name: 'Status (live)',
        type: 'catalog-scalar',
        required: false,
        description: 'Read live from iceberg.demo1_home_appliance.dm_workcenter_status.',
        order: 3,
        showOnCard: true,
        catalogBinding: demo1StatusBinding,
      },
      {
        id: demo1Property.centerCycle,
        key: 'cycle_time_sec',
        name: 'Cycle time (sec)',
        type: 'number',
        required: false,
        order: 4,
      },
      {
        id: demo1Property.centerHeadcount,
        key: 'headcount_per_shift',
        name: 'Headcount / shift',
        type: 'number',
        required: false,
        order: 5,
      },
      {
        id: demo1Property.centerLine,
        key: 'line',
        name: 'Belongs to line',
        type: 'node-reference',
        required: false,
        order: 6,
      },
    ],
  },
  {
    id: demo1TypeId.equipment,
    name: 'Equipment',
    properties: [
      {
        id: demo1Property.equipmentCode,
        key: 'equipment_code',
        name: 'Equipment code',
        type: 'text',
        required: true,
        order: 0,
        showOnCard: true,
      },
      {
        id: demo1Property.equipmentVendor,
        key: 'manufacturer',
        name: 'Manufacturer',
        type: 'text',
        required: false,
        order: 1,
      },
      {
        id: demo1Property.equipmentYear,
        key: 'install_year',
        name: 'Install year',
        type: 'number',
        required: false,
        order: 2,
      },
      {
        id: demo1Property.equipmentPower,
        key: 'power_kw',
        name: 'Power (kW)',
        type: 'number',
        required: false,
        order: 3,
      },
      {
        id: demo1Property.equipmentPmDays,
        key: 'pm_interval_days',
        name: 'Maintenance interval (days)',
        type: 'number',
        required: false,
        order: 4,
      },
      {
        id: demo1Property.equipmentOeeLive,
        key: 'oee_live',
        name: 'OEE (live)',
        type: 'catalog-scalar',
        required: false,
        description: 'Read live from iceberg.demo1_home_appliance.dm_equipment_oee.',
        order: 5,
        showOnCard: true,
        catalogBinding: demo1EquipmentOeeBinding,
      },
    ],
  },
  {
    id: demo1TypeId.utility,
    name: 'Utility',
    properties: [
      {
        id: demo1Property.utilityCode,
        key: 'utility_code',
        name: 'Utility code',
        type: 'text',
        required: true,
        order: 0,
        showOnCard: true,
      },
      {
        id: demo1Property.utilityKind,
        key: 'kind',
        name: 'Kind',
        type: 'single-select',
        required: false,
        order: 1,
        showOnCard: true,
        options: [
          { id: demo1UtilityOption.air, label: 'Compressed air' },
          { id: demo1UtilityOption.chiller, label: 'Chiller' },
          { id: demo1UtilityOption.power, label: 'Power substation' },
          { id: demo1SchemaId(55), label: 'RO water' },
        ],
      },
      {
        id: demo1Property.utilityPower,
        key: 'power_kw',
        name: 'Power (kW)',
        type: 'number',
        required: false,
        order: 2,
      },
    ],
  },
  {
    id: demo1TypeId.warehouse,
    name: 'Warehouse',
    properties: [
      {
        id: demo1Property.warehouseCode,
        key: 'warehouse_code',
        name: 'Warehouse code',
        type: 'text',
        required: true,
        order: 0,
        showOnCard: true,
      },
      {
        id: demo1Property.warehousePallets,
        key: 'pallet_capacity',
        name: 'Capacity (pallets)',
        type: 'number',
        required: false,
        order: 1,
      },
    ],
  },
];

const demo1SiteNodeId = demo1NodeId(1);
const demo1UtilityAreaId = demo1NodeId(8);

const demo1Areas = [
  {
    id: demo1NodeId(2),
    name: 'Metal shop – pressing & cabinet forming',
    code: 'AREA_METAL',
    manager: 'Supervisor A1',
    size: 9_800,
    shifts: demo1ShiftOption.two,
  },
  {
    id: demo1NodeId(3),
    name: 'Coil winding shop',
    code: 'AREA_COIL',
    manager: 'Supervisor A2',
    size: 4_200,
    shifts: demo1ShiftOption.two,
  },
  {
    id: demo1NodeId(4),
    name: 'PU foam shop',
    code: 'AREA_FOAM',
    manager: 'Supervisor B1',
    size: 6_400,
    shifts: demo1ShiftOption.two,
  },
  {
    id: demo1NodeId(5),
    name: 'Assembly shop',
    code: 'AREA_ASSY',
    manager: 'Supervisor B2',
    size: 11_200,
    shifts: demo1ShiftOption.two,
  },
  {
    id: demo1NodeId(6),
    name: 'Gas charging & test area',
    code: 'AREA_TEST',
    manager: 'Supervisor C1',
    size: 5_600,
    shifts: demo1ShiftOption.two,
  },
  {
    id: demo1NodeId(7),
    name: 'Packing & finished-goods warehouse',
    code: 'AREA_PACK',
    manager: 'Supervisor C2',
    size: 12_500,
    shifts: demo1ShiftOption.two,
  },
  {
    id: demo1UtilityAreaId,
    name: 'Utilities',
    code: 'AREA_UTIL',
    manager: 'Supervisor D1',
    size: 3_100,
    shifts: demo1ShiftOption.three,
  },
] as const;

const demo1Lines = [
  {
    id: demo1NodeId(10),
    name: 'Steel-lid chest freezer line',
    code: 'LINE_FRZ_1',
    family: demo1FamilyOption.steelLid,
    takt: 90,
    capacity: 600,
    target: 85,
  },
  {
    id: demo1NodeId(11),
    name: 'Glass-top freezer / beverage cooler line',
    code: 'LINE_FRZ_2',
    family: demo1FamilyOption.glassLid,
    takt: 142,
    capacity: 380,
    target: 82,
  },
  {
    id: demo1NodeId(12),
    name: 'Mini chest freezer line',
    code: 'LINE_FRZ_3',
    family: demo1FamilyOption.mini,
    takt: 200,
    capacity: 270,
    target: 80,
  },
] as const;

const demo1MainLineId = demo1Lines[0].id;

/*
 * The process chain of a chest-freezer plant, in order. `routes-to` follows this
 * array, so inserting a step here inserts it into the route as well.
 */
const demo1WorkCenters = [
  {
    id: demo1NodeId(20),
    name: 'Sheet cutting & pressing',
    code: 'CUT_PRESS',
    area: demo1NodeId(2),
    role: 'source' as const,
    statusId: 1,
    status: demo1StatusOption.running,
    cycle: 85,
    headcount: 6,
  },
  {
    id: demo1NodeId(21),
    name: 'Cabinet bending & welding',
    code: 'CAB_FORM',
    area: demo1NodeId(2),
    role: 'intermediate' as const,
    statusId: 1,
    status: demo1StatusOption.running,
    cycle: 88,
    headcount: 8,
  },
  {
    id: demo1NodeId(22),
    name: 'Copper / aluminium coil winding',
    code: 'COIL_WIND',
    area: demo1NodeId(3),
    role: 'intermediate' as const,
    statusId: 1,
    status: demo1StatusOption.running,
    cycle: 92,
    headcount: 6,
  },
  {
    id: demo1NodeId(23),
    name: 'Liner fitting & shell assembly',
    code: 'LINER_ASSY',
    area: demo1NodeId(4),
    role: 'intermediate' as const,
    statusId: 1,
    status: demo1StatusOption.running,
    cycle: 90,
    headcount: 10,
  },
  {
    id: demo1NodeId(24),
    name: 'PU foam injection',
    code: 'PU_FOAM',
    area: demo1NodeId(4),
    role: 'intermediate' as const,
    statusId: 2,
    status: demo1StatusOption.maintenance,
    cycle: 95,
    headcount: 4,
  },
  {
    id: demo1NodeId(25),
    name: 'Lid & gasket line',
    code: 'LID_LINE',
    area: demo1NodeId(4),
    role: 'intermediate' as const,
    statusId: 1,
    status: demo1StatusOption.running,
    cycle: 87,
    headcount: 7,
  },
  {
    id: demo1NodeId(26),
    name: 'Compressor & condenser assembly',
    code: 'ASSY_COOL',
    area: demo1NodeId(5),
    role: 'intermediate' as const,
    statusId: 1,
    status: demo1StatusOption.running,
    cycle: 93,
    headcount: 12,
  },
  {
    id: demo1NodeId(27),
    name: 'Vacuum & R600a gas charging',
    code: 'VAC_CHG',
    area: demo1NodeId(6),
    role: 'intermediate' as const,
    statusId: 1,
    status: demo1StatusOption.running,
    cycle: 96,
    headcount: 5,
  },
  {
    id: demo1NodeId(28),
    name: 'Leak test',
    code: 'LEAK_TEST',
    area: demo1NodeId(6),
    role: 'intermediate' as const,
    statusId: 1,
    status: demo1StatusOption.running,
    cycle: 84,
    headcount: 4,
  },
  {
    id: demo1NodeId(29),
    name: 'Hi-pot & cooling run test',
    code: 'HIPOT_RUN',
    area: demo1NodeId(6),
    role: 'intermediate' as const,
    statusId: 1,
    status: demo1StatusOption.running,
    cycle: 120,
    headcount: 4,
  },
  {
    id: demo1NodeId(30),
    name: 'Visual QC & energy label',
    code: 'FINAL_QC',
    area: demo1NodeId(6),
    role: 'intermediate' as const,
    statusId: 1,
    status: demo1StatusOption.running,
    cycle: 78,
    headcount: 6,
  },
  {
    id: demo1NodeId(31),
    name: 'Packing',
    code: 'PACK',
    area: demo1NodeId(7),
    role: 'intermediate' as const,
    statusId: 1,
    status: demo1StatusOption.running,
    cycle: 75,
    headcount: 8,
  },
  {
    id: demo1NodeId(32),
    name: 'Finished-goods receipt',
    code: 'FG_WH',
    area: demo1NodeId(7),
    role: 'sink' as const,
    statusId: 1,
    status: demo1StatusOption.running,
    cycle: 60,
    headcount: 4,
  },
] as const;

/*
 * Node-local properties: the coil wrap belongs to COIL_WIND alone, and the mould
 * temperature to PU_FOAM alone, so neither earns a slot on the shared type.
 */
const demo1LocalProperties: Readonly<Record<string, readonly PlantPropertyDefinition[]>> = {
  COIL_WIND: [
    {
      id: demo1Property.coilLayers,
      key: 'coil_layers',
      name: 'Coil layers',
      type: 'number',
      required: false,
      order: 0,
      showOnCard: true,
    },
    {
      id: demo1Property.coilMaterial,
      key: 'coil_material',
      name: 'Coil material',
      type: 'single-select',
      required: false,
      description: 'Copper matches the …-CU model codes, aluminium the …-AL ones.',
      order: 1,
      showOnCard: true,
      options: [
        { id: demo1CoilOption.copper, label: 'Copper' },
        { id: demo1CoilOption.aluminium, label: 'Aluminium' },
      ],
    },
  ],
  PU_FOAM: [
    {
      id: demo1Property.mouldTemperature,
      key: 'mould_setpoint_c',
      name: 'Mould temperature setpoint (°C)',
      type: 'number',
      required: false,
      order: 0,
    },
  ],
};

const demo1LocalValues: Readonly<Record<string, Readonly<Record<string, PlantPropertyValue>>>> = {
  COIL_WIND: {
    [demo1Property.coilLayers]: 3,
    [demo1Property.coilMaterial]: demo1CoilOption.copper,
  },
  PU_FOAM: { [demo1Property.mouldTemperature]: 42 },
};

const demo1Equipment = [
  {
    id: demo1NodeId(40),
    name: 'Hydraulic press 400T #1',
    code: 'PRESS_400T_01',
    center: demo1NodeId(20),
    vendor: 'Amada',
    year: 2018,
    power: 75,
    pmDays: 90,
    x: 50,
  },
  {
    id: demo1NodeId(41),
    name: 'Hydraulic press 400T #2',
    code: 'PRESS_400T_02',
    center: demo1NodeId(20),
    vendor: 'Amada',
    year: 2019,
    power: 75,
    pmDays: 90,
    x: 150,
  },
  {
    id: demo1NodeId(42),
    name: 'CNC press brake',
    code: 'BEND_CNC_01',
    center: demo1NodeId(21),
    vendor: 'Trumpf',
    year: 2018,
    power: 45,
    pmDays: 120,
    x: 295,
  },
  {
    id: demo1NodeId(43),
    name: 'Coil winder #1',
    code: 'COILWIND_01',
    center: demo1NodeId(22),
    vendor: 'Bundy',
    year: 2017,
    power: 22,
    pmDays: 60,
    x: 480,
  },
  {
    id: demo1NodeId(44),
    name: 'Coil winder #2',
    code: 'COILWIND_02',
    center: demo1NodeId(22),
    vendor: 'Bundy',
    year: 2020,
    power: 22,
    pmDays: 60,
    x: 580,
  },
  {
    id: demo1NodeId(45),
    name: 'Foam injection machine #1',
    code: 'FOAM_CANNON_01',
    center: demo1NodeId(24),
    vendor: 'Cannon',
    year: 2016,
    power: 55,
    pmDays: 45,
    x: 910,
  },
  {
    id: demo1NodeId(46),
    name: 'Foam injection machine #2',
    code: 'FOAM_CANNON_02',
    center: demo1NodeId(24),
    vendor: 'Cannon',
    year: 2021,
    power: 55,
    pmDays: 45,
    x: 1_010,
  },
  {
    id: demo1NodeId(47),
    name: 'Vacuum pump',
    code: 'VACPUMP_03',
    center: demo1NodeId(27),
    vendor: 'Edwards',
    year: 2019,
    power: 18,
    pmDays: 60,
    x: 1_555,
  },
  {
    id: demo1NodeId(48),
    name: 'R600a gas charging station',
    code: 'GASFILL_R600A_01',
    center: demo1NodeId(27),
    vendor: 'Galileo',
    year: 2019,
    power: 12,
    pmDays: 30,
    x: 1_655,
  },
  {
    id: demo1NodeId(49),
    name: 'Helium leak detector',
    code: 'HE_SNIFFER_01',
    center: demo1NodeId(28),
    vendor: 'Inficon',
    year: 2020,
    power: 6,
    pmDays: 30,
    x: 1_800,
  },
  {
    id: demo1NodeId(50),
    name: 'Pull-down test chamber',
    code: 'PULLDOWN_CH_01',
    center: demo1NodeId(29),
    vendor: 'Espec',
    year: 2018,
    power: 40,
    pmDays: 90,
    x: 2_015,
  },
  {
    id: demo1NodeId(51),
    name: 'Packing conveyor',
    code: 'CONV_PACK_01',
    center: demo1NodeId(31),
    vendor: 'Interroll',
    year: 2017,
    power: 15,
    pmDays: 120,
    x: 2_445,
  },
] as const;

const demo1Utilities = [
  {
    id: demo1NodeId(60),
    name: 'Central air compressor',
    code: 'AIRCOMP_01',
    kind: demo1UtilityOption.air,
    power: 160,
  },
  {
    id: demo1NodeId(61),
    name: 'Chiller system',
    code: 'CHILLER_01',
    kind: demo1UtilityOption.chiller,
    power: 320,
  },
  {
    id: demo1NodeId(62),
    name: '2500 kVA substation',
    code: 'SUBSTATION_01',
    kind: demo1UtilityOption.power,
    power: 2_000,
  },
] as const;

const demo1Warehouses = [
  {
    id: demo1NodeId(70),
    name: 'Finished-goods warehouse (export)',
    code: 'WH_FG',
    area: demo1NodeId(7),
    pallets: 4_200,
    x: 2_190,
  },
  {
    id: demo1NodeId(71),
    name: 'Materials & steel-coil store',
    code: 'WH_MAT',
    area: demo1NodeId(2),
    pallets: 1_800,
    x: 2_390,
  },
] as const;

const demo1Containment: readonly (readonly [string, string])[] = [
  ...demo1Areas.map((area) => [demo1SiteNodeId, area.id] as const),
  ...demo1Lines.map((line) => [demo1SiteNodeId, line.id] as const),
  ...demo1WorkCenters.map((center) => [center.area, center.id] as const),
  ...demo1Equipment.map((item) => [item.center, item.id] as const),
  ...demo1Utilities.map((item) => [demo1UtilityAreaId, item.id] as const),
  ...demo1Warehouses.map((item) => [item.area, item.id] as const),
];

export const demo1HomeAppliance: PlantModelDraft = {
  nodeTypes: demo1NodeTypes,
  nodes: [
    {
      id: demo1SiteNodeId,
      name: 'Demo Data 1 – Home Appliance Plant (Chest Freezers)',
      nodeTypeId: demo1TypeId.area,
      routingRole: 'none',
      position: { x: 40, y: 40 },
      values: {
        [demo1Property.areaCode]: 'DEMO1_HOME_APPLIANCE',
        [demo1Property.areaManager]: 'Plant manager',
        [demo1Property.areaSize]: 100_000,
        [demo1Property.areaShifts]: demo1ShiftOption.two,
      },
      localProperties: [],
    },
    ...demo1Areas.map((area, index) => ({
      id: area.id,
      name: area.name,
      nodeTypeId: demo1TypeId.area,
      routingRole: 'none' as const,
      position: { x: 40 + index * 250, y: 180 },
      values: {
        [demo1Property.areaCode]: area.code,
        [demo1Property.areaManager]: area.manager,
        [demo1Property.areaSize]: area.size,
        [demo1Property.areaShifts]: area.shifts,
      },
      localProperties: [],
    })),
    ...demo1Lines.map((line, index) => ({
      id: line.id,
      name: line.name,
      nodeTypeId: demo1TypeId.line,
      routingRole: 'none' as const,
      position: { x: 700 + index * 300, y: 40 },
      values: {
        [demo1Property.lineCode]: line.code,
        [demo1Property.lineFamily]: line.family,
        [demo1Property.lineTakt]: line.takt,
        [demo1Property.lineCapacity]: line.capacity,
        [demo1Property.lineOeeTarget]: line.target,
      },
      localProperties: [],
    })),
    ...demo1WorkCenters.map((center, index) => ({
      id: center.id,
      name: center.name,
      nodeTypeId: demo1TypeId.workCenter,
      routingRole: center.role,
      position: { x: 40 + index * 215, y: 360 },
      values: {
        [demo1Property.centerCode]: center.code,
        [demo1Property.centerStatus]: center.status,
        [demo1Property.centerStatusId]: center.statusId,
        [demo1Property.centerCycle]: center.cycle,
        [demo1Property.centerHeadcount]: center.headcount,
        [demo1Property.centerLine]: demo1MainLineId,
        ...(demo1LocalValues[center.code] ?? {}),
      },
      localProperties: demo1LocalProperties[center.code] ?? [],
    })),
    ...demo1Equipment.map((item) => ({
      id: item.id,
      name: item.name,
      nodeTypeId: demo1TypeId.equipment,
      routingRole: 'none' as const,
      position: { x: item.x, y: 520 },
      values: {
        [demo1Property.equipmentCode]: item.code,
        [demo1Property.equipmentVendor]: item.vendor,
        [demo1Property.equipmentYear]: item.year,
        [demo1Property.equipmentPower]: item.power,
        [demo1Property.equipmentPmDays]: item.pmDays,
      },
      localProperties: [],
    })),
    ...demo1Utilities.map((item, index) => ({
      id: item.id,
      name: item.name,
      nodeTypeId: demo1TypeId.utility,
      routingRole: 'none' as const,
      position: { x: 1_540 + index * 200, y: 680 },
      values: {
        [demo1Property.utilityCode]: item.code,
        [demo1Property.utilityKind]: item.kind,
        [demo1Property.utilityPower]: item.power,
      },
      localProperties: [],
    })),
    ...demo1Warehouses.map((item) => ({
      id: item.id,
      name: item.name,
      nodeTypeId: demo1TypeId.warehouse,
      routingRole: 'none' as const,
      position: { x: item.x, y: 680 },
      values: {
        [demo1Property.warehouseCode]: item.code,
        [demo1Property.warehousePallets]: item.pallets,
      },
      localProperties: [],
    })),
  ],
  relationships: [
    ...demo1Containment.map(([sourceNodeId, targetNodeId], index) => ({
      id: demo1ContainsId(index + 1),
      kind: 'contains' as const,
      sourceNodeId,
      targetNodeId,
    })),
    ...demo1WorkCenters.flatMap((center, index) => {
      const previous = demo1WorkCenters[index - 1];
      return previous === undefined
        ? []
        : [
            {
              id: demo1RouteId(index),
              kind: 'routes-to' as const,
              sourceNodeId: previous.id,
              targetNodeId: center.id,
            },
          ];
    }),
  ],
};

/**
 * Downtime and defect vocabularies for the Demo Data 1 site. They are the same
 * codes the demo warehouse uses, so the model and the data agree on what a stoppage
 * is called.
 */
export const DEMO1_HOME_APPLIANCE_REFERENCE_DATA: PlantReferenceData = Object.freeze({
  shiftCalendar: Object.freeze({
    timezone: 'Asia/Ho_Chi_Minh',
    patterns: Object.freeze([
      { code: 'SHIFT_1', name: 'Shift 1', start: '06:00', end: '14:00' },
      { code: 'SHIFT_2', name: 'Shift 2', start: '14:00', end: '22:00' },
    ]),
  }),
  downtimeReasons: Object.freeze([
    { code: 'DT_FOAM_MOLD', name: 'Foam mould fault / foam leak', category: 'Equipment' },
    { code: 'DT_COIL_WIND', name: 'Coil winder jam / copper tube break', category: 'Equipment' },
    { code: 'DT_PRESS_DIE', name: 'Press die change & adjustment', category: 'Changeover' },
    { code: 'DT_CHANGEOVER', name: 'Model changeover', category: 'Changeover' },
    { code: 'DT_MATERIAL', name: 'Material shortage', category: 'Supply' },
    { code: 'DT_GAS_CHARGE', name: 'Gas charging station fault', category: 'Equipment' },
    { code: 'DT_LEAK_RIG', name: 'Leak detector calibration', category: 'Quality' },
    { code: 'DT_POWER', name: 'Power outage / voltage dip', category: 'Utilities' },
    { code: 'DT_PM', name: 'Planned maintenance', category: 'Maintenance' },
    { code: 'DT_QC_HOLD', name: 'Held for QC', category: 'Quality' },
  ]),
  defectCodes: Object.freeze([
    { code: 'QC_R600A_LEAK', name: 'R600a gas leak', stage: 'LEAK_TEST', severity: 'Critical' },
    {
      code: 'QC_COIL_SOLDER',
      name: 'Coil solder joint out of spec',
      stage: 'COIL_WIND',
      severity: 'Critical',
    },
    { code: 'QC_FOAM_VOID', name: 'Foam void / uneven foam', stage: 'PU_FOAM', severity: 'Major' },
    { code: 'QC_LID_SEAL', name: 'Lid gasket not sealing', stage: 'LID_LINE', severity: 'Major' },
    {
      code: 'QC_PULLDOWN_SLOW',
      name: 'Pull-down time out of spec',
      stage: 'HIPOT_RUN',
      severity: 'Major',
    },
    {
      code: 'QC_ELEC_HIPOT',
      name: 'Failed hi-pot (insulation) test',
      stage: 'HIPOT_RUN',
      severity: 'Critical',
    },
    { code: 'QC_PAINT_SCRATCH', name: 'Paint scratch / dented cabinet', stage: 'FINAL_QC', severity: 'Minor' },
    { code: 'QC_LABEL_WRONG', name: 'Wrong energy label', stage: 'FINAL_QC', severity: 'Minor' },
  ]),
});
