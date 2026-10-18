import type {
  PlantCatalogBinding,
  PlantModelDraft,
  PlantNodeType,
  PlantPropertyDefinition,
  PlantReferenceData,
} from '@domain/plant-model/models/plant-model';

/*
 * Demo Data 2 – Coffee capsule plant (mock data).
 *
 * Two coffee-capsule lines: powder arrives from the roasting/grinding area (out
 * of scope for the demo), is filled and sealed in a humidity-controlled room
 * split into one zone per line, then crosses into the packing room to be boxed,
 * bundled and palletized. CAP_L1 is the 2018 line with no sensors; CAP_L2 is the
 * 2025 expansion with historian signals — that contrast is the point of the
 * demo, so both lines carry the full 11-station route.
 *
 * Every code and name below is spelled exactly as in
 * `mock-data/demo2-coffee-capsules/reference.mjs`, the single source of truth
 * that the warehouse, charts and agent glossary also read. TypeScript cannot
 * import that `.mjs`, so the strings are repeated here and the template spec
 * asserts the station list; change them there first.
 *
 * Live properties read `iceberg.demo2_coffee_capsules` rather than the stored draft:
 * station status, asset health and room humidity. They stay blank until that
 * database exists; a catalog-scalar is exempt from the publish-time required
 * check for exactly this reason.
 */
const demo2SchemaId = (value: number): string =>
  `13000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const demo2NodeId = (value: number): string =>
  `23000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const demo2ContainsId = (value: number): string =>
  `33000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const demo2RouteId = (value: number): string =>
  `33000000-0000-4000-8001-${String(value).padStart(12, '0')}`;

const demo2TypeId = {
  area: demo2SchemaId(1),
  line: demo2SchemaId(2),
  workCenter: demo2SchemaId(3),
  equipment: demo2SchemaId(4),
  utility: demo2SchemaId(5),
  warehouse: demo2SchemaId(6),
} as const;

const demo2Property = {
  areaCode: demo2SchemaId(10),
  areaCleanliness: demo2SchemaId(11),
  areaTemperature: demo2SchemaId(12),
  areaHumidity: demo2SchemaId(13),
  lineCode: demo2SchemaId(20),
  lineYear: demo2SchemaId(21),
  lineRate: demo2SchemaId(22),
  lineLanes: demo2SchemaId(23),
  lineIot: demo2SchemaId(24),
  lineOeeTarget: demo2SchemaId(25),
  centerCode: demo2SchemaId(30),
  centerStatusLive: demo2SchemaId(31),
  centerCycle: demo2SchemaId(32),
  centerLine: demo2SchemaId(33),
  equipmentCode: demo2SchemaId(40),
  equipmentVendor: demo2SchemaId(41),
  equipmentYear: demo2SchemaId(42),
  equipmentPmDays: demo2SchemaId(43),
  equipmentSignals: demo2SchemaId(44),
  equipmentHealthLive: demo2SchemaId(45),
  utilityCode: demo2SchemaId(50),
  utilityKind: demo2SchemaId(51),
  utilitySignals: demo2SchemaId(52),
  utilityHealthLive: demo2SchemaId(53),
  warehouseCode: demo2SchemaId(60),
  warehousePallets: demo2SchemaId(61),
} as const;

const demo2CleanlinessOption = {
  normal: demo2SchemaId(14),
  controlled: demo2SchemaId(15),
  cleanRoom: demo2SchemaId(16),
} as const;
const demo2IotOption = { yes: demo2SchemaId(26), no: demo2SchemaId(27) } as const;
const demo2UtilityOption = {
  'AHU/HVAC': demo2SchemaId(54),
  'N2 generator': demo2SchemaId(55),
  'Compressed air': demo2SchemaId(56),
  Chiller: demo2SchemaId(57),
  Substation: demo2SchemaId(58),
} as const;

/** Live status of a station, keyed by the node's own work-center code. */
const demo2StatusBinding: PlantCatalogBinding = {
  mode: 'scalar',
  catalog: 'iceberg',
  schema: 'demo2_coffee_capsules',
  table: 'dm_workcenter_status',
  valueColumn: 'status',
  labelColumn: 'label',
  filters: [
    {
      column: 'workcenter_code',
      operator: 'eq',
      operand: { kind: 'property', propertyDefinitionId: demo2Property.centerCode },
    },
  ],
  limit: 1,
};

/*
 * Machines and utilities share one health table keyed by `asset_code`, but each
 * type keeps its own code property, so each gets a binding pointing at it.
 */
const demo2HealthBinding = (codePropertyId: string): PlantCatalogBinding => ({
  mode: 'scalar',
  catalog: 'iceberg',
  schema: 'demo2_coffee_capsules',
  table: 'dm_asset_health',
  valueColumn: 'health',
  labelColumn: 'label',
  filters: [
    {
      column: 'asset_code',
      operator: 'eq',
      operand: { kind: 'property', propertyDefinitionId: codePropertyId },
    },
  ],
  limit: 1,
});

/*
 * Room humidity is what cakes the powder, so the three rooms the product passes
 * through carry it on their card. It is a node-local property (only rooms with
 * a historian RH tag have one) whose filter reads the node-type property
 * `area_code`: the lookup resolves operands from the node's values by id, so a
 * local binding may key on any property the node has.
 */
const demo2RoomEnvBinding: PlantCatalogBinding = {
  mode: 'scalar',
  catalog: 'iceberg',
  schema: 'demo2_coffee_capsules',
  table: 'dm_room_env',
  valueColumn: 'rh',
  labelColumn: 'label',
  filters: [
    {
      column: 'room_code',
      operator: 'eq',
      operand: { kind: 'property', propertyDefinitionId: demo2Property.areaCode },
    },
  ],
  limit: 1,
};

const demo2RoomEnvProperty = (id: string): PlantPropertyDefinition => ({
  id,
  key: 'environment_live',
  name: 'Environment (live)',
  type: 'catalog-scalar',
  required: false,
  description: 'Room humidity read live from iceberg.demo2_coffee_capsules.dm_room_env.',
  order: 0,
  showOnCard: true,
  catalogBinding: demo2RoomEnvBinding,
});

const demo2NodeTypes: readonly PlantNodeType[] = [
  {
    id: demo2TypeId.area,
    name: 'Area / Room',
    properties: [
      {
        id: demo2Property.areaCode,
        key: 'area_code',
        name: 'Area code',
        type: 'text',
        required: true,
        order: 0,
        showOnCard: true,
      },
      {
        id: demo2Property.areaCleanliness,
        key: 'cleanliness',
        name: 'Cleanliness class',
        type: 'single-select',
        required: false,
        order: 1,
        options: [
          { id: demo2CleanlinessOption.normal, label: 'Normal' },
          { id: demo2CleanlinessOption.controlled, label: 'Controlled' },
          { id: demo2CleanlinessOption.cleanRoom, label: 'Clean room' },
        ],
      },
      {
        id: demo2Property.areaTemperature,
        key: 'target_temp_c',
        name: 'Target temperature (°C)',
        type: 'number',
        required: false,
        order: 2,
      },
      {
        id: demo2Property.areaHumidity,
        key: 'max_rh_pct',
        name: 'Maximum humidity (%RH)',
        type: 'number',
        required: false,
        order: 3,
      },
    ],
  },
  {
    id: demo2TypeId.line,
    name: 'Line',
    properties: [
      {
        id: demo2Property.lineCode,
        key: 'line_code',
        name: 'Line code',
        type: 'text',
        required: true,
        order: 0,
        showOnCard: true,
      },
      {
        id: demo2Property.lineYear,
        key: 'year_commissioned',
        name: 'Year commissioned',
        type: 'number',
        required: false,
        order: 1,
      },
      {
        id: demo2Property.lineRate,
        key: 'rated_speed_cpm',
        name: 'Rated speed (capsules/min)',
        type: 'number',
        required: false,
        order: 2,
        showOnCard: true,
      },
      {
        id: demo2Property.lineLanes,
        key: 'filling_lanes',
        name: 'Filling lanes',
        type: 'number',
        required: false,
        order: 3,
      },
      {
        id: demo2Property.lineIot,
        key: 'has_iot_sensors',
        name: 'IoT sensors fitted',
        type: 'single-select',
        required: false,
        order: 4,
        showOnCard: true,
        options: [
          { id: demo2IotOption.yes, label: 'Yes' },
          { id: demo2IotOption.no, label: 'No' },
        ],
      },
      {
        id: demo2Property.lineOeeTarget,
        key: 'oee_target',
        name: 'OEE target (%)',
        type: 'number',
        required: false,
        order: 5,
      },
    ],
  },
  {
    id: demo2TypeId.workCenter,
    name: 'Work center',
    properties: [
      {
        id: demo2Property.centerCode,
        key: 'workcenter_code',
        name: 'Work center code',
        type: 'text',
        required: true,
        order: 0,
        showOnCard: true,
      },
      {
        id: demo2Property.centerStatusLive,
        key: 'status_live',
        name: 'Status (live)',
        type: 'catalog-scalar',
        required: false,
        description: 'Read live from iceberg.demo2_coffee_capsules.dm_workcenter_status.',
        order: 1,
        showOnCard: true,
        catalogBinding: demo2StatusBinding,
      },
      {
        id: demo2Property.centerCycle,
        key: 'cycle_time_s',
        name: 'Cycle time (s)',
        type: 'number',
        required: false,
        order: 2,
      },
      {
        id: demo2Property.centerLine,
        key: 'line',
        name: 'Belongs to line',
        type: 'node-reference',
        required: false,
        order: 3,
      },
    ],
  },
  {
    id: demo2TypeId.equipment,
    name: 'Equipment',
    properties: [
      {
        id: demo2Property.equipmentCode,
        key: 'equipment_code',
        name: 'Equipment code',
        type: 'text',
        required: true,
        order: 0,
        showOnCard: true,
      },
      {
        id: demo2Property.equipmentVendor,
        key: 'manufacturer',
        name: 'Manufacturer',
        type: 'text',
        required: false,
        order: 1,
      },
      {
        id: demo2Property.equipmentYear,
        key: 'year_installed',
        name: 'Year installed',
        type: 'number',
        required: false,
        order: 2,
      },
      {
        id: demo2Property.equipmentPmDays,
        key: 'pm_interval_days',
        name: 'Maintenance interval (days)',
        type: 'number',
        required: false,
        order: 3,
      },
      {
        id: demo2Property.equipmentSignals,
        key: 'monitored_signals',
        name: 'Monitored signals',
        type: 'text',
        required: false,
        order: 4,
      },
      {
        id: demo2Property.equipmentHealthLive,
        key: 'health_live',
        name: 'Equipment health (live)',
        type: 'catalog-scalar',
        required: false,
        description: 'Read live from iceberg.demo2_coffee_capsules.dm_asset_health.',
        order: 5,
        showOnCard: true,
        catalogBinding: demo2HealthBinding(demo2Property.equipmentCode),
      },
    ],
  },
  {
    id: demo2TypeId.utility,
    name: 'Utility',
    properties: [
      {
        id: demo2Property.utilityCode,
        key: 'utility_code',
        name: 'Utility code',
        type: 'text',
        required: true,
        order: 0,
        showOnCard: true,
      },
      {
        id: demo2Property.utilityKind,
        key: 'kind',
        name: 'Kind',
        type: 'single-select',
        required: false,
        order: 1,
        options: Object.entries(demo2UtilityOption).map(([label, id]) => ({ id, label })),
      },
      {
        id: demo2Property.utilitySignals,
        key: 'monitored_signals',
        name: 'Monitored signals',
        type: 'text',
        required: false,
        order: 2,
      },
      {
        id: demo2Property.utilityHealthLive,
        key: 'health_live',
        name: 'Utility health (live)',
        type: 'catalog-scalar',
        required: false,
        description: 'Read live from iceberg.demo2_coffee_capsules.dm_asset_health.',
        order: 3,
        showOnCard: true,
        catalogBinding: demo2HealthBinding(demo2Property.utilityCode),
      },
    ],
  },
  {
    id: demo2TypeId.warehouse,
    name: 'Warehouse',
    properties: [
      {
        id: demo2Property.warehouseCode,
        key: 'warehouse_code',
        name: 'Warehouse code',
        type: 'text',
        required: true,
        order: 0,
        showOnCard: true,
      },
      {
        id: demo2Property.warehousePallets,
        key: 'pallet_capacity',
        name: 'Capacity (pallets)',
        type: 'number',
        required: false,
        order: 1,
      },
    ],
  },
];

/* ── Canvas layout ─────────────────────────────────────────────────────────
 * Areas on a top band, one horizontal lane per line with its machines just
 * below, the shared powder source between the lanes on the left and the
 * warehouses and utilities on the right. */
const LANE_Y = { CAP_L1: 395, CAP_L2: 725 } as const;
const EQUIPMENT_OFFSET_Y = 165;
const EQUIPMENT_STACK_Y = 165;
const STATION_X0 = 300;
const STATION_DX = 250;

const demo2SiteNodeId = demo2NodeId(1);
const demo2UtilityAreaId = demo2NodeId(8);
const demo2UpstreamId = demo2NodeId(20);

/*
 * Areas and rooms. FILL_Z1/FILL_Z2/PACK are the room codes the warehouse keys
 * environment readings on; the two fill zones sit inside the filling room.
 */
const demo2Areas = [
  { id: demo2NodeId(2), name: 'Coffee powder processing (out of scope)', code: 'AREA_PROCESSING' },
  {
    id: demo2NodeId(3),
    name: 'Filling room',
    code: 'AREA_FILLING',
    cleanliness: demo2CleanlinessOption.cleanRoom,
    temperature: 20,
    humidity: 40,
  },
  {
    id: demo2NodeId(4),
    name: 'Filling room – L1 zone',
    code: 'FILL_Z1',
    parent: demo2NodeId(3),
    cleanliness: demo2CleanlinessOption.cleanRoom,
    temperature: 20,
    humidity: 40,
    envPropertyId: demo2SchemaId(70),
  },
  {
    id: demo2NodeId(5),
    name: 'Filling room – L2 zone',
    code: 'FILL_Z2',
    parent: demo2NodeId(3),
    cleanliness: demo2CleanlinessOption.cleanRoom,
    temperature: 20,
    humidity: 40,
    envPropertyId: demo2SchemaId(71),
  },
  {
    id: demo2NodeId(6),
    name: 'Packing room',
    code: 'PACK',
    cleanliness: demo2CleanlinessOption.controlled,
    temperature: 24,
    humidity: 65,
    envPropertyId: demo2SchemaId(72),
  },
  {
    id: demo2NodeId(7),
    name: 'Finished goods & dispatch',
    code: 'AREA_WAREHOUSE',
    cleanliness: demo2CleanlinessOption.normal,
  },
  {
    id: demo2UtilityAreaId,
    name: 'Utilities area',
    code: 'AREA_UTIL',
    cleanliness: demo2CleanlinessOption.normal,
  },
] as const satisfies readonly {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly parent?: string;
  readonly cleanliness?: string;
  readonly temperature?: number;
  readonly humidity?: number;
  readonly envPropertyId?: string;
}[];

const demo2AreaIdByCode = new Map<string, string>(demo2Areas.map((area) => [area.code, area.id]));
const demo2AreaId = (code: string): string => {
  const id = demo2AreaIdByCode.get(code);
  if (id === undefined) throw new Error(`Unknown Demo Data 2 area ${code}.`);
  return id;
};

/** `LINES` in the reference; `zone` is the fill room of that line. */
const demo2Lines = [
  {
    id: demo2NodeId(10),
    code: 'CAP_L1',
    name: 'Capsule line 1',
    prefix: 'L1',
    year: 2018,
    rate: 420,
    lanes: 6,
    iot: demo2IotOption.no,
    oeeTarget: 78,
    zone: 'FILL_Z1',
  },
  {
    id: demo2NodeId(11),
    code: 'CAP_L2',
    name: 'Capsule line 2 (expansion)',
    prefix: 'L2',
    year: 2025,
    rate: 500,
    lanes: 8,
    iot: demo2IotOption.yes,
    oeeTarget: 75,
    zone: 'FILL_Z2',
  },
] as const;

/*
 * `STATIONS` in the reference, in route order. `routes-to` follows this array
 * on each line, so inserting a step here inserts it into both routes.
 */
const demo2Stations = [
  {
    station: 'POWDER_FEED',
    name: 'Powder feed (buffer hopper, load cell)',
    room: 'FILL',
    cycle: 0.14,
  },
  { station: 'CUP_DENEST', name: 'Capsule cup denester', room: 'FILL', cycle: 0.14 },
  { station: 'DOSE_TAMP', name: 'Dosing & tamping', room: 'FILL', cycle: 0.14 },
  { station: 'N2_FLUSH', name: 'Nitrogen flush', room: 'FILL', cycle: 0.14 },
  { station: 'LID_SEAL', name: 'Lid foil sealing', room: 'FILL', cycle: 0.14 },
  { station: 'CAP_INSPECT', name: 'Checkweigher, leak test & camera', room: 'FILL', cycle: 0.14 },
  { station: 'TRANSFER', name: 'Conveyor to packing room', room: 'PACK', cycle: 0.14 },
  {
    station: 'CARTON',
    name: 'Carton erecting, 16-capsule drop, flap gluing',
    room: 'PACK',
    cycle: 2.2,
  },
  { station: 'BOX_CHECK', name: 'Box checkweigher & date / lot print', room: 'PACK', cycle: 2.2 },
  { station: 'BUNDLE', name: '3-box bundling', room: 'PACK', cycle: 6.6 },
  { station: 'PALLETIZE', name: 'Palletizing robot', room: 'PACK', cycle: 6.6 },
] as const;

/** One station node per line × station; `code` is the warehouse join key. */
const demo2WorkCenters = demo2Lines.flatMap((line, lineIndex) =>
  demo2Stations.map((station, index) => ({
    id: demo2NodeId(100 * (lineIndex + 1) + index + 1),
    name: `${line.prefix} · ${station.name}`,
    code: `${line.prefix}_${station.station}`,
    line,
    room: station.room === 'FILL' ? line.zone : 'PACK',
    cycle: station.cycle,
    x: STATION_X0 + index * STATION_DX,
    y: LANE_Y[line.code],
  })),
);

const demo2WorkCenterByCode = new Map(demo2WorkCenters.map((center) => [center.code, center]));

const demo2Warehouses = [
  {
    id: demo2NodeId(300),
    name: 'Finished-goods warehouse',
    code: 'FG_WH',
    role: 'sink' as const,
    pallets: 3_200,
    position: { x: STATION_X0 + demo2Stations.length * STATION_DX, y: 560 },
  },
  {
    id: demo2NodeId(301),
    name: 'Packaging & materials store',
    code: 'MAT_WH',
    role: 'none' as const,
    pallets: 900,
    position: { x: STATION_X0 + demo2Stations.length * STATION_DX, y: 890 },
  },
] as const;
const demo2FinishedGoodsId = demo2Warehouses[0].id;

/** `ASSETS` with kind 'equipment' in the reference; `wc` is the parent station. */
const demo2Equipment = [
  {
    code: 'DOSING_AUGER_L1',
    name: 'Dosing auger L1',
    wc: 'L1_DOSE_TAMP',
    vendor: 'Filling machine supplier (EU)',
    year: 2018,
    pmDays: 90,
    signals: 'No sensors (legacy line)',
  },
  {
    code: 'SEAL_HEATER_L1',
    name: 'Lid seal heater L1',
    wc: 'L1_LID_SEAL',
    vendor: 'Filling machine supplier (EU)',
    year: 2018,
    pmDays: 60,
    signals: 'No sensors (legacy line)',
  },
  {
    code: 'CHECKWEIGHER_L1',
    name: 'Capsule checkweigher L1',
    wc: 'L1_CAP_INSPECT',
    vendor: 'Checkweigher supplier',
    year: 2018,
    pmDays: 180,
    signals: 'Per-capsule weight',
  },
  {
    code: 'CARTONER_L1',
    name: 'Cartoner L1',
    wc: 'L1_CARTON',
    vendor: 'Cartoner supplier',
    year: 2018,
    pmDays: 90,
    signals: 'PLC counters',
  },
  {
    code: 'ROBOT_PAL_L1',
    name: 'Palletizing robot L1',
    wc: 'L1_PALLETIZE',
    vendor: 'Robot supplier',
    year: 2018,
    pmDays: 180,
    signals: 'PLC counters',
  },
  {
    code: 'DOSING_AUGER_L2',
    name: 'Dosing auger L2',
    wc: 'L2_DOSE_TAMP',
    vendor: 'Filling machine supplier (EU)',
    year: 2025,
    pmDays: 90,
    signals: 'Motor current, gearbox vibration',
  },
  {
    code: 'SEAL_HEATER_L2_A',
    name: 'Lid seal heater L2 – A',
    wc: 'L2_LID_SEAL',
    vendor: 'Filling machine supplier (EU)',
    year: 2025,
    pmDays: 60,
    signals: 'Current, current stability',
  },
  {
    code: 'SEAL_HEATER_L2_B',
    name: 'Lid seal heater L2 – B',
    wc: 'L2_LID_SEAL',
    vendor: 'Filling machine supplier (EU)',
    year: 2025,
    pmDays: 60,
    signals: 'Current, current stability',
  },
  {
    code: 'CHECKWEIGHER_L2',
    name: 'Capsule checkweigher L2',
    wc: 'L2_CAP_INSPECT',
    vendor: 'Checkweigher supplier',
    year: 2025,
    pmDays: 180,
    signals: 'Per-capsule weight',
  },
  {
    code: 'VACUUM_PUMP_L2',
    name: 'Leak-test vacuum pump L2',
    wc: 'L2_CAP_INSPECT',
    vendor: 'Pump supplier',
    year: 2025,
    pmDays: 120,
    signals: 'Motor current',
  },
  {
    code: 'CARTONER_L2',
    name: 'Cartoner L2',
    wc: 'L2_CARTON',
    vendor: 'Cartoner supplier',
    year: 2025,
    pmDays: 90,
    signals: 'Main motor current',
  },
  {
    code: 'ROBOT_PAL_L2',
    name: 'Palletizing robot L2',
    wc: 'L2_PALLETIZE',
    vendor: 'Robot supplier',
    year: 2025,
    pmDays: 180,
    signals: 'Axis current',
  },
].map((item, index, all) => {
  const center = demo2WorkCenterByCode.get(item.wc);
  if (center === undefined) throw new Error(`Unknown Demo Data 2 station ${item.wc}.`);
  // A second machine on the same station stacks below the first.
  const stack = all.slice(0, index).filter((other) => other.wc === item.wc).length;
  return {
    ...item,
    id: demo2NodeId(400 + index),
    center: center.id,
    position: {
      x: center.x,
      y: center.y + EQUIPMENT_OFFSET_Y + stack * EQUIPMENT_STACK_Y,
    },
  };
});

/** `ASSETS` with kind 'utility' in the reference. */
const demo2Utilities = [
  {
    code: 'AHU_01',
    name: 'AHU-01 (L1 filling zone, desiccant wheel)',
    kind: demo2UtilityOption['AHU/HVAC'],
    signals: 'Desiccant wheel motor current, supply air dew point',
  },
  {
    code: 'AHU_02',
    name: 'AHU-02 (L2 filling zone, desiccant wheel)',
    kind: demo2UtilityOption['AHU/HVAC'],
    signals: 'Desiccant wheel motor current, compressor, supply air dew point',
  },
  {
    code: 'N2_GEN_01',
    name: 'Nitrogen generator',
    kind: demo2UtilityOption['N2 generator'],
    signals: 'N2 purity',
  },
  {
    code: 'AIRCOMP_01',
    name: 'Central air compressor',
    kind: demo2UtilityOption['Compressed air'],
    signals: 'Compressed-air pressure',
  },
  {
    code: 'CHILLER_01',
    name: 'Chiller system',
    kind: demo2UtilityOption.Chiller,
    signals: 'Chilled-water temperature',
  },
].map((item, index) => ({ ...item, id: demo2NodeId(500 + index) }));

const demo2Containment: readonly (readonly [string, string])[] = [
  ...demo2Areas.map((area) => ['parent' in area ? area.parent : demo2SiteNodeId, area.id] as const),
  ...demo2Lines.map((line) => [demo2SiteNodeId, line.id] as const),
  [demo2AreaId('AREA_PROCESSING'), demo2UpstreamId],
  ...demo2WorkCenters.map((center) => [demo2AreaId(center.room), center.id] as const),
  ...demo2Warehouses.map((item) => [demo2AreaId('AREA_WAREHOUSE'), item.id] as const),
  ...demo2Equipment.map((item) => [item.center, item.id] as const),
  ...demo2Utilities.map((item) => [demo2UtilityAreaId, item.id] as const),
];

/*
 * One route per line: the shared powder source feeds both first stations and
 * both palletizers deliver to the one finished-goods warehouse.
 */
const demo2Routes: readonly (readonly [string, string])[] = demo2Lines.flatMap((line) => {
  const chain = [
    demo2UpstreamId,
    ...demo2WorkCenters.filter((center) => center.line === line).map((center) => center.id),
    demo2FinishedGoodsId,
  ];
  return chain.slice(1).map((target, index) => [chain[index] as string, target] as const);
});

export const demo2CoffeeCapsules: PlantModelDraft = {
  nodeTypes: demo2NodeTypes,
  nodes: [
    {
      id: demo2SiteNodeId,
      name: 'Demo Data 2 – Coffee capsule plant',
      nodeTypeId: demo2TypeId.area,
      routingRole: 'none',
      position: { x: 40, y: 40 },
      values: { [demo2Property.areaCode]: 'DEMO2_COFFEE_CAPSULES' },
      localProperties: [],
    },
    ...demo2Areas.map((area, index) => ({
      id: area.id,
      name: area.name,
      nodeTypeId: demo2TypeId.area,
      routingRole: 'none' as const,
      position: { x: STATION_X0 + index * 250, y: 230 },
      values: {
        [demo2Property.areaCode]: area.code,
        ...('cleanliness' in area ? { [demo2Property.areaCleanliness]: area.cleanliness } : {}),
        ...('temperature' in area ? { [demo2Property.areaTemperature]: area.temperature } : {}),
        ...('humidity' in area ? { [demo2Property.areaHumidity]: area.humidity } : {}),
      },
      localProperties: 'envPropertyId' in area ? [demo2RoomEnvProperty(area.envPropertyId)] : [],
    })),
    ...demo2Lines.map((line, index) => ({
      id: line.id,
      name: line.name,
      nodeTypeId: demo2TypeId.line,
      routingRole: 'none' as const,
      position: { x: 700 + index * 300, y: 40 },
      values: {
        [demo2Property.lineCode]: line.code,
        [demo2Property.lineYear]: line.year,
        [demo2Property.lineRate]: line.rate,
        [demo2Property.lineLanes]: line.lanes,
        [demo2Property.lineIot]: line.iot,
        [demo2Property.lineOeeTarget]: line.oeeTarget,
      },
      localProperties: [],
    })),
    {
      id: demo2UpstreamId,
      name: 'Powder supply from processing',
      nodeTypeId: demo2TypeId.workCenter,
      routingRole: 'source',
      position: { x: 40, y: 560 },
      values: { [demo2Property.centerCode]: 'UPSTREAM_POWDER' },
      localProperties: [],
    },
    ...demo2WorkCenters.map((center) => ({
      id: center.id,
      name: center.name,
      nodeTypeId: demo2TypeId.workCenter,
      routingRole: 'intermediate' as const,
      position: { x: center.x, y: center.y },
      values: {
        [demo2Property.centerCode]: center.code,
        [demo2Property.centerCycle]: center.cycle,
        [demo2Property.centerLine]: center.line.id,
      },
      localProperties: [],
    })),
    ...demo2Warehouses.map((item) => ({
      id: item.id,
      name: item.name,
      nodeTypeId: demo2TypeId.warehouse,
      routingRole: item.role,
      position: item.position,
      values: {
        [demo2Property.warehouseCode]: item.code,
        [demo2Property.warehousePallets]: item.pallets,
      },
      localProperties: [],
    })),
    ...demo2Equipment.map((item) => ({
      id: item.id,
      name: item.name,
      nodeTypeId: demo2TypeId.equipment,
      routingRole: 'none' as const,
      position: item.position,
      values: {
        [demo2Property.equipmentCode]: item.code,
        [demo2Property.equipmentVendor]: item.vendor,
        [demo2Property.equipmentYear]: item.year,
        [demo2Property.equipmentPmDays]: item.pmDays,
        [demo2Property.equipmentSignals]: item.signals,
      },
      localProperties: [],
    })),
    ...demo2Utilities.map((item, index) => ({
      id: item.id,
      name: item.name,
      nodeTypeId: demo2TypeId.utility,
      routingRole: 'none' as const,
      position: {
        x: STATION_X0 + (demo2Stations.length + 1) * STATION_DX + 40,
        y: 230 + index * 165,
      },
      values: {
        [demo2Property.utilityCode]: item.code,
        [demo2Property.utilityKind]: item.kind,
        [demo2Property.utilitySignals]: item.signals,
      },
      localProperties: [],
    })),
  ],
  relationships: [
    ...demo2Containment.map(([sourceNodeId, targetNodeId], index) => ({
      id: demo2ContainsId(index + 1),
      kind: 'contains' as const,
      sourceNodeId,
      targetNodeId,
    })),
    ...demo2Routes.map(([sourceNodeId, targetNodeId], index) => ({
      id: demo2RouteId(index + 1),
      kind: 'routes-to' as const,
      sourceNodeId,
      targetNodeId,
    })),
  ],
};

/**
 * Shift, downtime and defect vocabularies for Demo Data 2. They are `SHIFTS`,
 * `FAULT_CODES` and `REJECT_CODES` from the reference, so the model and the
 * warehouse agree on what a stoppage or a reject is called.
 */
export const DEMO2_COFFEE_CAPSULES_REFERENCE_DATA: PlantReferenceData = Object.freeze({
  shiftCalendar: Object.freeze({
    timezone: 'Asia/Ho_Chi_Minh',
    patterns: Object.freeze([
      { code: 'SHIFT_1', name: 'Shift 1', start: '06:00', end: '14:00' },
      { code: 'SHIFT_2', name: 'Shift 2', start: '14:00', end: '22:00' },
      { code: 'SHIFT_3', name: 'Shift 3', start: '22:00', end: '06:00' },
    ]),
  }),
  downtimeReasons: Object.freeze([
    { code: 'F101', name: 'Cup jam at the denester', category: 'Minor stop' },
    { code: 'F205', name: 'Dosing auger blocked / off-target', category: 'Breakdown' },
    { code: 'F207', name: 'Powder caking from humidity', category: 'Environment' },
    { code: 'F310', name: 'Seal temperature out of range', category: 'Breakdown' },
    { code: 'F312', name: 'Lid foil web break / misalignment', category: 'Minor stop' },
    { code: 'F330', name: 'Low N2 pressure / purity', category: 'Utilities' },
    { code: 'F401', name: 'High checkweigher reject rate', category: 'Quality' },
    { code: 'F402', name: 'Leak rejects (seal integrity test)', category: 'Quality' },
    { code: 'F510', name: 'Transfer conveyor jam', category: 'Minor stop' },
    { code: 'F601', name: 'Carton erecting fault / carton jam', category: 'Minor stop' },
    { code: 'F602', name: 'Flap glue fault', category: 'Minor stop' },
    { code: 'F701', name: 'Date / lot code print fault', category: 'Quality' },
    { code: 'F801', name: 'Bundling / shrink-wrap fault', category: 'Minor stop' },
    { code: 'F901', name: 'Palletizing robot safety stop', category: 'Minor stop' },
    { code: 'P010', name: 'Recipe changeover', category: 'Changeover' },
    { code: 'P020', name: 'Wet clean / CIP', category: 'Cleaning' },
    { code: 'P030', name: 'Planned maintenance', category: 'Planned maintenance' },
    { code: 'E001', name: 'Room humidity above limit', category: 'Environment' },
    { code: 'M001', name: 'Material shortage (cups / foil / cartons)', category: 'Material' },
    { code: 'M002', name: 'Waiting for powder from processing', category: 'Material' },
  ]),
  /* A leaking capsule reaches the consumer stale, so R03 is the one critical code. */
  defectCodes: Object.freeze([
    { code: 'R01', name: 'Underweight', stage: 'CAP_INSPECT', severity: 'Major' },
    { code: 'R02', name: 'Overweight', stage: 'CAP_INSPECT', severity: 'Major' },
    { code: 'R03', name: 'Seal not tight / leak', stage: 'CAP_INSPECT', severity: 'Critical' },
    { code: 'R04', name: 'Lid foil misaligned', stage: 'CAP_INSPECT', severity: 'Minor' },
    { code: 'R05', name: 'Deformed cup', stage: 'CAP_INSPECT', severity: 'Minor' },
    { code: 'R06', name: 'Box missing capsules', stage: 'BOX_CHECK', severity: 'Major' },
    { code: 'R07', name: 'Wrong date / lot', stage: 'BOX_CHECK', severity: 'Minor' },
    { code: 'R08', name: 'Dented box / glue fault', stage: 'BOX_CHECK', severity: 'Minor' },
  ]),
});
