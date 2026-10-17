/**
 * The single source of truth for Demo Data 2 (coffee capsules) — coffee
 * capsule filling & packing.
 *
 * Every code here is imported by the generator, the curated-warehouse SQL, the
 * charts, the agent glossary and the plant-model template spec. A station code
 * that drifts between the plant model and the warehouse breaks the one join that
 * makes them the same system, so none of those files may spell a code by hand.
 *
 * Numbers marked ⟨confirm⟩ are demo assumptions; they are named exports so a
 * correction is a one-line change.
 * All data is mock data.
 */

export const DEMO = Object.freeze({
  siteCode: 'DEMO2_COFFEE_CAPSULES',
  siteName: 'Demo Data 2 – Coffee capsule plant',
  templateId: 'demo2-coffee-capsules',
  database: 'demo2_coffee_capsules',
  sourceSchema: 'demo2_coffee_capsules',
  collectionName: 'Demo Data 2 – Coffee Capsules',
  serviceName: 'Demo Data 2 – MES/ERP (mock)',
  crawlerName: 'demo2-src-daily',
  mqttTenantKey: 'tnt_demo2capsules01',
  mqttAdapterName: 'demo2-iot',
  timezone: 'Asia/Ho_Chi_Minh',
  seed: 20_261_001,
  days: 120,
  demandWeeks: 156,
  forecastHorizon: 13,
});

/* ── Products ──────────────────────────────────────────────────────────────── */

/** Recipe families drive changeovers, cleaning and humidity sensitivity. */
export const FAMILIES = Object.freeze([
  { family: 'RG_LIGHT', ten: 'Roast & ground coffee – light roast', milk: false, order: 0 },
  { family: 'RG_MED', ten: 'Roast & ground coffee – medium roast', milk: false, order: 1 },
  { family: 'RG_DARK', ten: 'Roast & ground coffee – dark roast', milk: false, order: 2 },
  { family: 'MILK', ten: 'Milk-based / instant recipe', milk: true, order: 3 },
]);

/**
 * SKUs ⟨confirm which are filled at the plant⟩. `share` is the demand mix; `fill`
 * the target powder mass per capsule (g); `tol` the lower/upper checkweigher
 * tolerance (g); `rhMax` the room humidity above which the powder cakes.
 */
export const SKUS = Object.freeze([
  { sku: '12450001', short: 'AMR', ten: 'Americano capsule', family: 'RG_MED', fill: 10.0, tol: 0.45, rhMax: 45, lines: ['CAP_L1', 'CAP_L2'], share: 0.22, auger: 'RG_10G' },
  { sku: '12450002', short: 'ESI', ten: 'Espresso Intenso capsule', family: 'RG_DARK', fill: 7.0, tol: 0.32, rhMax: 45, lines: ['CAP_L1', 'CAP_L2'], share: 0.14, auger: 'RG_7G' },
  { sku: '12450003', short: 'GRI', ten: 'Grande Intenso capsule', family: 'RG_DARK', fill: 10.0, tol: 0.45, rhMax: 45, lines: ['CAP_L1', 'CAP_L2'], share: 0.12, auger: 'RG_10G' },
  { sku: '12450004', short: 'LUN', ten: 'Lungo capsule', family: 'RG_LIGHT', fill: 6.5, tol: 0.3, rhMax: 45, lines: ['CAP_L1'], share: 0.06, auger: 'RG_7G' },
  { sku: '12450005', short: 'CSD', ten: 'Iced milk coffee capsule', family: 'MILK', fill: 16.0, tol: 0.7, rhMax: 38, lines: ['CAP_L1', 'CAP_L2'], share: 0.18, auger: 'MILK_16G' },
  { sku: '12450006', short: 'CAP', ten: 'Cappuccino capsule (8+8)', family: 'MILK', fill: 11.6, tol: 0.52, rhMax: 38, lines: ['CAP_L2'], share: 0.12, auger: 'MILK_12G' },
  { sku: '12450007', short: 'LAT', ten: 'Latte Macchiato capsule (8+8)', family: 'MILK', fill: 11.4, tol: 0.51, rhMax: 38, lines: ['CAP_L2'], share: 0.09, auger: 'MILK_12G' },
  { sku: '12450008', short: 'FLW', ten: 'Flat White capsule', family: 'MILK', fill: 11.7, tol: 0.53, rhMax: 38, lines: ['CAP_L1', 'CAP_L2'], share: 0.07, auger: 'MILK_12G' },
]);

/** SAP carries material numbers zero-padded to 18 characters. */
export const sapMaterial = (sku) => sku.padStart(18, '0');

export const CAPSULES_PER_BOX = 16;
export const BOXES_PER_PACK = 3;
/** ⟨confirm⟩ the meeting notes say "~20–21 pack". */
export const PACKS_PER_LAYER = 21;
export const LAYERS_PER_PALLET = 6;
export const PACKS_PER_PALLET = PACKS_PER_LAYER * LAYERS_PER_PALLET;

/** Illustrative cost prices used for every VND conversion. */
export const MATERIAL_COST = Object.freeze([
  { cost_code: 'POWDER_RG', ten: 'Roast & ground coffee powder', don_vi: 'kg', vnd: 230_000 },
  { cost_code: 'POWDER_MILK', ten: 'Milk powder / instant coffee blend', don_vi: 'kg', vnd: 150_000 },
  { cost_code: 'CAPSULE_EMPTY', ten: 'Empty capsule + lid foil', don_vi: 'capsule', vnd: 450 },
  { cost_code: 'BOX', ten: 'Carton box, 16 capsules', don_vi: 'box', vnd: 1_200 },
]);
export const powderPrice = (family) => (family === 'MILK' ? 150_000 : 230_000);

/* ── Lines, stations, assets ───────────────────────────────────────────────── */

export const LINES = Object.freeze([
  { line: 'CAP_L1', ten: 'Capsule line 1', year: 2018, rate: { RG: 420, MILK: 380 }, lanes: 6, iot: false, oeeTarget: 78, zone: 'FILL_Z1', ahu: 'AHU_01' },
  { line: 'CAP_L2', ten: 'Capsule line 2 (expansion)', year: 2025, rate: { RG: 500, MILK: 450 }, lanes: 8, iot: true, oeeTarget: 75, zone: 'FILL_Z2', ahu: 'AHU_02' },
]);
export const rateFor = (line, family) =>
  LINES.find((item) => item.line === line).rate[family === 'MILK' ? 'MILK' : 'RG'];

/** The 11 stations of each line, in route order. `room` is where they stand. */
export const STATIONS = Object.freeze([
  { station: 'POWDER_FEED', ten: 'Powder feed (buffer hopper, load cell)', ngan: 'Powder feed', room: 'FILL', cycle: 0.14 },
  { station: 'CUP_DENEST', ten: 'Capsule cup denester', ngan: 'Cup feed', room: 'FILL', cycle: 0.14 },
  { station: 'DOSE_TAMP', ten: 'Dosing & tamping', ngan: 'Dose & tamp', room: 'FILL', cycle: 0.14 },
  { station: 'N2_FLUSH', ten: 'Nitrogen flush', ngan: 'N2 flush', room: 'FILL', cycle: 0.14 },
  { station: 'LID_SEAL', ten: 'Lid foil sealing', ngan: 'Lid seal', room: 'FILL', cycle: 0.14 },
  { station: 'CAP_INSPECT', ten: 'Checkweigher, leak test & camera', ngan: 'Checkweigh & leak', room: 'FILL', cycle: 0.14 },
  { station: 'TRANSFER', ten: 'Conveyor to packing room', ngan: 'Conveyor', room: 'PACK', cycle: 0.14 },
  { station: 'CARTON', ten: 'Carton erecting, 16-capsule drop, flap gluing', ngan: 'Cartoning', room: 'PACK', cycle: 2.2 },
  { station: 'BOX_CHECK', ten: 'Box checkweigher & date / lot print', ngan: 'Box check & print', room: 'PACK', cycle: 2.2 },
  { station: 'BUNDLE', ten: '3-box bundling', ngan: 'Bundling', room: 'PACK', cycle: 6.6 },
  { station: 'PALLETIZE', ten: 'Palletizing robot', ngan: 'Palletizing', room: 'PACK', cycle: 6.6 },
]);

export const lineNumber = (line) => line.slice(-1);
/** `L1_DOSE_TAMP` — the join key shared by the plant model and the warehouse. */
export const workcenterCode = (line, station) => `L${lineNumber(line)}_${station}`;

export const WORKCENTERS = Object.freeze(
  LINES.flatMap((line) =>
    STATIONS.map((station, index) => ({
      workcenter_code: workcenterCode(line.line, station.station),
      line_code: line.line,
      station: station.station,
      ten_cong_doan: station.ten,
      ten_ngan: `L${lineNumber(line.line)} · ${station.ngan}`,
      room_code: station.room === 'FILL' ? line.zone : 'PACK',
      thu_tu: index + 1,
    })),
  ),
);

/**
 * Assets with a historian signal carry `metrics`: tag suffix, unit, the
 * baseline (`normal`) and the alarm limit the health index measures against.
 */
export const ASSETS = Object.freeze([
  { asset: 'DOSING_AUGER_L1', ten: 'Dosing auger L1', kind: 'equipment', wc: 'L1_DOSE_TAMP', vendor: 'Filling machine supplier (EU)', year: 2018, pmDays: 90, signals: 'No sensors (legacy line)', metrics: [] },
  { asset: 'SEAL_HEATER_L1', ten: 'Lid seal heater L1', kind: 'equipment', wc: 'L1_LID_SEAL', vendor: 'Filling machine supplier (EU)', year: 2018, pmDays: 60, signals: 'No sensors (legacy line)', metrics: [] },
  { asset: 'CHECKWEIGHER_L1', ten: 'Capsule checkweigher L1', kind: 'equipment', wc: 'L1_CAP_INSPECT', vendor: 'Checkweigher supplier', year: 2018, pmDays: 180, signals: 'Per-capsule weight', metrics: [] },
  { asset: 'CARTONER_L1', ten: 'Cartoner L1', kind: 'equipment', wc: 'L1_CARTON', vendor: 'Cartoner supplier', year: 2018, pmDays: 90, signals: 'PLC counters', metrics: [] },
  { asset: 'ROBOT_PAL_L1', ten: 'Palletizing robot L1', kind: 'equipment', wc: 'L1_PALLETIZE', vendor: 'Robot supplier', year: 2018, pmDays: 180, signals: 'PLC counters', metrics: [] },
  {
    asset: 'DOSING_AUGER_L2', ten: 'Dosing auger L2', kind: 'equipment', wc: 'L2_DOSE_TAMP', vendor: 'Filling machine supplier (EU)', year: 2025, pmDays: 90, signals: 'Motor current, gearbox vibration',
    metrics: [
      { tag: 'DOSE_AUGER_L2.CUR_A', metric: 'current', unit: 'A', normal: 4.2, noise: 0.05, alarm: 5.2 },
      { tag: 'DOSE_AUGER_L2.VIB_MMS', metric: 'vibration', unit: 'mm/s', normal: 2.1, noise: 0.1, alarm: 4.5 },
    ],
  },
  {
    asset: 'SEAL_HEATER_L2_A', ten: 'Lid seal heater L2 – A', kind: 'equipment', wc: 'L2_LID_SEAL', vendor: 'Filling machine supplier (EU)', year: 2025, pmDays: 60, signals: 'Current, current stability',
    metrics: [
      { tag: 'SEAL_HTR_L2A.CUR_A', metric: 'current', unit: 'A', normal: 6.8, noise: 0.05, alarm: null },
      { tag: 'SEAL_HTR_L2A.CUR_SD', metric: 'current_stability', unit: 'A', normal: 0.05, noise: 0.006, alarm: 0.15 },
    ],
  },
  {
    asset: 'SEAL_HEATER_L2_B', ten: 'Lid seal heater L2 – B', kind: 'equipment', wc: 'L2_LID_SEAL', vendor: 'Filling machine supplier (EU)', year: 2025, pmDays: 60, signals: 'Current, current stability',
    metrics: [
      { tag: 'SEAL_HTR_L2B.CUR_A', metric: 'current', unit: 'A', normal: 6.8, noise: 0.05, alarm: null },
      { tag: 'SEAL_HTR_L2B.CUR_SD', metric: 'current_stability', unit: 'A', normal: 0.05, noise: 0.006, alarm: 0.15 },
    ],
  },
  { asset: 'CHECKWEIGHER_L2', ten: 'Capsule checkweigher L2', kind: 'equipment', wc: 'L2_CAP_INSPECT', vendor: 'Checkweigher supplier', year: 2025, pmDays: 180, signals: 'Per-capsule weight', metrics: [] },
  {
    asset: 'VACUUM_PUMP_L2', ten: 'Leak-test vacuum pump L2', kind: 'equipment', wc: 'L2_CAP_INSPECT', vendor: 'Pump supplier', year: 2025, pmDays: 120, signals: 'Motor current',
    metrics: [{ tag: 'VAC_PUMP_L2.CUR_A', metric: 'current', unit: 'A', normal: 3.1, noise: 0.05, alarm: 4.0 }],
  },
  {
    asset: 'CARTONER_L2', ten: 'Cartoner L2', kind: 'equipment', wc: 'L2_CARTON', vendor: 'Cartoner supplier', year: 2025, pmDays: 90, signals: 'Main motor current',
    metrics: [{ tag: 'CARTONER_L2.CUR_A', metric: 'current', unit: 'A', normal: 9.5, noise: 0.15, alarm: 12.0 }],
  },
  {
    asset: 'ROBOT_PAL_L2', ten: 'Palletizing robot L2', kind: 'equipment', wc: 'L2_PALLETIZE', vendor: 'Robot supplier', year: 2025, pmDays: 180, signals: 'Axis current',
    metrics: [{ tag: 'ROBOT_PAL_L2.CUR_A', metric: 'current', unit: 'A', normal: 7.4, noise: 0.2, alarm: 10.0 }],
  },
  {
    asset: 'AHU_01', ten: 'AHU-01 (L1 filling zone, desiccant wheel)', kind: 'utility', utility: 'AHU/HVAC', vendor: 'HVAC supplier', year: 2018, pmDays: 90, signals: 'Desiccant wheel motor current, supply air dew point',
    metrics: [
      { tag: 'AHU01.WHEEL_A', metric: 'wheel_current', unit: 'A', normal: 2.4, noise: 0.05, alarm: 3.0 },
      { tag: 'AHU01.SUP_DP', metric: 'supply_dew_point', unit: '°C', normal: 5.0, noise: 0.2, alarm: 8.0 },
    ],
  },
  {
    asset: 'AHU_02', ten: 'AHU-02 (L2 filling zone, desiccant wheel)', kind: 'utility', utility: 'AHU/HVAC', vendor: 'HVAC supplier', year: 2025, pmDays: 90, signals: 'Desiccant wheel motor current, compressor, supply air dew point',
    metrics: [
      { tag: 'AHU02.WHEEL_A', metric: 'wheel_current', unit: 'A', normal: 2.4, noise: 0.05, alarm: 3.0 },
      { tag: 'AHU02.SUP_DP', metric: 'supply_dew_point', unit: '°C', normal: 5.0, noise: 0.2, alarm: 8.0 },
      { tag: 'AHU02.COMP_A', metric: 'compressor_current', unit: 'A', normal: 38.0, noise: 0.6, alarm: 46.0 },
    ],
  },
  {
    asset: 'N2_GEN_01', ten: 'Nitrogen generator', kind: 'utility', utility: 'N2 generator', vendor: 'Industrial gas supplier', year: 2018, pmDays: 180, signals: 'N2 purity',
    metrics: [{ tag: 'N2GEN.PURITY', metric: 'purity', unit: '%', normal: 99.5, noise: 0.05, alarm: null }],
  },
  {
    asset: 'AIRCOMP_01', ten: 'Central air compressor', kind: 'utility', utility: 'Compressed air', vendor: 'Compressed-air supplier', year: 2018, pmDays: 120, signals: 'Compressed-air pressure',
    metrics: [{ tag: 'AIRCOMP.PRESS_BAR', metric: 'pressure', unit: 'bar', normal: 6.8, noise: 0.05, alarm: null }],
  },
  { asset: 'CHILLER_01', ten: 'Chiller system', kind: 'utility', utility: 'Chiller', vendor: 'HVAC supplier', year: 2018, pmDays: 180, signals: 'Chilled-water temperature', metrics: [] },
]);

/** Rooms and zones, with the environment the powder needs. ⟨confirm limits⟩ */
export const ROOMS = Object.freeze([
  { room: 'FILL_Z1', ten: 'Filling room – L1 zone', line: 'CAP_L1', ahu: 'AHU_01', tempTarget: 20, rhMax: 40, rhAlarm: 45, rhStop: 50 },
  { room: 'FILL_Z2', ten: 'Filling room – L2 zone', line: 'CAP_L2', ahu: 'AHU_02', tempTarget: 20, rhMax: 40, rhAlarm: 45, rhStop: 50 },
  { room: 'PACK', ten: 'Packing room', line: null, ahu: null, tempTarget: 24, rhMax: 65, rhAlarm: 70, rhStop: 80 },
]);
export const RH_ALARM = 45;
export const RH_STOP = 50;

/** Room tags (not asset-owned) the historian carries. */
export const ROOM_TAGS = Object.freeze([
  { tag: 'FILL_Z1.TEMP', asset: 'FILL_Z1', metric: 'temperature', unit: '°C', alarm: 22 },
  { tag: 'FILL_Z1.RH', asset: 'FILL_Z1', metric: 'humidity', unit: '%', alarm: RH_ALARM },
  { tag: 'FILL_Z2.TEMP', asset: 'FILL_Z2', metric: 'temperature', unit: '°C', alarm: 22 },
  { tag: 'FILL_Z2.RH', asset: 'FILL_Z2', metric: 'humidity', unit: '%', alarm: RH_ALARM },
  { tag: 'PACK.TEMP', asset: 'PACK', metric: 'temperature', unit: '°C', alarm: null },
  { tag: 'PACK.RH', asset: 'PACK', metric: 'humidity', unit: '%', alarm: null },
]);

/** Every historian tag: rooms plus asset metrics. */
export const TAGS = Object.freeze([
  ...ROOM_TAGS,
  ...ASSETS.flatMap((asset) =>
    asset.metrics.map((metric) => ({
      tag: metric.tag,
      asset: asset.asset,
      metric: metric.metric,
      unit: metric.unit,
      alarm: metric.alarm,
    })),
  ),
]);

/* ── Codes ─────────────────────────────────────────────────────────────────── */

export const LOSS_CATEGORIES = Object.freeze([
  'Breakdown', 'Minor stop', 'Changeover', 'Cleaning', 'Planned maintenance', 'Environment', 'Material', 'Quality', 'Utilities',
]);

/**
 * PLC fault / stop codes. `station` null = the whole line. `hazard` is the
 * chance per running minute on a line; `median` the typical duration (min).
 */
export const FAULT_CODES = Object.freeze([
  { code: 'F101', ten: 'Cup jam at the denester', ngan: 'Cup jam', category: 'Minor stop', station: 'CUP_DENEST', hazard: 0.0035, median: 1.2 },
  { code: 'F205', ten: 'Dosing auger blocked / off-target', ngan: 'Auger blocked', category: 'Breakdown', station: 'DOSE_TAMP', hazard: 0.0007, median: 16 },
  { code: 'F207', ten: 'Powder caking from humidity', ngan: 'Powder caking', category: 'Environment', station: 'DOSE_TAMP', hazard: 0.00005, median: 12 },
  { code: 'F310', ten: 'Seal temperature out of range', ngan: 'Seal temp out of range', category: 'Breakdown', station: 'LID_SEAL', hazard: 0.00025, median: 22 },
  { code: 'F312', ten: 'Lid foil web break / misalignment', ngan: 'Foil misaligned', category: 'Minor stop', station: 'LID_SEAL', hazard: 0.002, median: 2.5 },
  { code: 'F330', ten: 'Low N2 pressure / purity', ngan: 'Low N2', category: 'Utilities', station: 'N2_FLUSH', hazard: 0.00008, median: 14 },
  { code: 'F401', ten: 'High checkweigher reject rate', ngan: 'High weight rejects', category: 'Quality', station: 'CAP_INSPECT', hazard: 0.00025, median: 6 },
  { code: 'F402', ten: 'Leak rejects (seal integrity test)', ngan: 'Leak rejects', category: 'Quality', station: 'CAP_INSPECT', hazard: 0.00015, median: 6 },
  { code: 'F510', ten: 'Transfer conveyor jam', ngan: 'Conveyor jam', category: 'Minor stop', station: 'TRANSFER', hazard: 0.0012, median: 1.5 },
  { code: 'F601', ten: 'Carton erecting fault / carton jam', ngan: 'Carton jam', category: 'Minor stop', station: 'CARTON', hazard: 0.0025, median: 1.8 },
  { code: 'F602', ten: 'Flap glue fault', ngan: 'Glue fault', category: 'Minor stop', station: 'CARTON', hazard: 0.0008, median: 3 },
  { code: 'F701', ten: 'Date / lot code print fault', ngan: 'Print fault', category: 'Quality', station: 'BOX_CHECK', hazard: 0.0003, median: 5 },
  { code: 'F801', ten: 'Bundling / shrink-wrap fault', ngan: 'Bundling fault', category: 'Minor stop', station: 'BUNDLE', hazard: 0.001, median: 2 },
  { code: 'F901', ten: 'Palletizing robot safety stop', ngan: 'Robot safety stop', category: 'Minor stop', station: 'PALLETIZE', hazard: 0.0009, median: 2.2 },
  { code: 'P010', ten: 'Recipe changeover', ngan: 'Recipe changeover', category: 'Changeover', station: null, hazard: 0, median: 0 },
  { code: 'P020', ten: 'Wet clean / CIP', ngan: 'Clean / CIP', category: 'Cleaning', station: null, hazard: 0, median: 0 },
  { code: 'P030', ten: 'Planned maintenance', ngan: 'Planned maintenance', category: 'Planned maintenance', station: null, hazard: 0, median: 0 },
  { code: 'E001', ten: 'Room humidity above limit', ngan: 'Humidity above limit', category: 'Environment', station: null, hazard: 0, median: 0 },
  { code: 'M001', ten: 'Material shortage (cups / foil / cartons)', ngan: 'Material shortage', category: 'Material', station: null, hazard: 0.00012, median: 15 },
  { code: 'M002', ten: 'Waiting for powder from processing', ngan: 'Waiting for powder', category: 'Material', station: 'POWDER_FEED', hazard: 0.0001, median: 18 },
]);

export const REJECT_CODES = Object.freeze([
  { code: 'R01', ten: 'Underweight', station: 'CAP_INSPECT', unit: 'capsule' },
  { code: 'R02', ten: 'Overweight', station: 'CAP_INSPECT', unit: 'capsule' },
  { code: 'R03', ten: 'Seal not tight / leak', station: 'CAP_INSPECT', unit: 'capsule' },
  { code: 'R04', ten: 'Lid foil misaligned', station: 'CAP_INSPECT', unit: 'capsule' },
  { code: 'R05', ten: 'Deformed cup', station: 'CAP_INSPECT', unit: 'capsule' },
  { code: 'R06', ten: 'Box missing capsules', station: 'BOX_CHECK', unit: 'box' },
  { code: 'R07', ten: 'Wrong date / lot', station: 'BOX_CHECK', unit: 'box' },
  { code: 'R08', ten: 'Dented box / glue fault', station: 'BOX_CHECK', unit: 'box' },
]);

/** Changeover cost by family: [minutes, purge kg, cleaning]. ⟨confirm⟩ */
export const CHANGEOVER = Object.freeze({
  RG_LIGHT: { RG_LIGHT: [15, 5, 'DRY'], RG_MED: [20, 6, 'DRY'], RG_DARK: [25, 8, 'DRY'], MILK: [45, 16, 'DRY_CLEAN'] },
  RG_MED: { RG_LIGHT: [40, 12, 'DRY'], RG_MED: [15, 5, 'DRY'], RG_DARK: [20, 6, 'DRY'], MILK: [45, 16, 'DRY_CLEAN'] },
  RG_DARK: { RG_LIGHT: [50, 15, 'DRY'], RG_MED: [35, 11, 'DRY'], RG_DARK: [15, 5, 'DRY'], MILK: [45, 16, 'DRY_CLEAN'] },
  MILK: { RG_LIGHT: [120, 24, 'WET'], RG_MED: [120, 24, 'WET'], RG_DARK: [120, 24, 'WET'], MILK: [30, 9, 'DRY'] },
});
export const CLEANING_LABEL = Object.freeze({
  DRY: 'Dry powder purge',
  DRY_CLEAN: 'Dry clean',
  WET: 'Wet clean (allergen – milk)',
});

/* ── Calendar, markets ─────────────────────────────────────────────────────── */

export const SHIFTS = Object.freeze([
  { shift: 'SHIFT_1', ten: 'Shift 1', start: 6, end: 14 },
  { shift: 'SHIFT_2', ten: 'Shift 2', start: 14, end: 22 },
  { shift: 'SHIFT_3', ten: 'Shift 3', start: 22, end: 6 },
]);
export const shiftOfHour = (hour) => (hour >= 6 && hour < 14 ? 'SHIFT_1' : hour >= 14 && hour < 22 ? 'SHIFT_2' : 'SHIFT_3');

/** Sunday 06:00–14:00 is CIP / planned maintenance; the rest of Sunday is off. */
export const SUNDAY_CIP = Object.freeze({ start: 6, end: 14 });
/** Vietnamese public holidays the plant closes on (inside any 120-day window we use). */
export const HOLIDAYS = Object.freeze(['2026-04-30', '2026-05-01', '2026-09-01', '2026-09-02', '2027-01-01']);

export const MARKETS = Object.freeze([
  { market: 'VN', ten: 'Vietnam', share: 0.1, export: false },
  { market: 'TH', ten: 'Thailand', share: 0.16, export: true },
  { market: 'PH', ten: 'Philippines', share: 0.18, export: true },
  { market: 'MY', ten: 'Malaysia', share: 0.12, export: true },
  { market: 'SG', ten: 'Singapore', share: 0.08, export: true },
  { market: 'HK', ten: 'Hong Kong', share: 0.09, export: true },
  { market: 'TW', ten: 'Taiwan', share: 0.14, export: true },
  { market: 'ID', ten: 'Indonesia', share: 0.13, export: true },
]);

/** Which SKUs are sold where (≈75% of pairs). Milk-heavy SKUs skip a few markets. */
export const MARKET_SKU_EXCLUSIONS = Object.freeze([
  ['VN', '12450006'], ['VN', '12450007'], ['SG', '12450004'], ['ID', '12450007'],
  ['ID', '12450008'], ['HK', '12450005'], ['MY', '12450004'], ['TW', '12450005'],
  ['SG', '12450008'], ['PH', '12450004'], ['TH', '12450007'], ['HK', '12450004'],
  ['ID', '12450004'], ['VN', '12450008'], ['MY', '12450007'], ['SG', '12450006'],
]);
export const isSold = (market, sku) =>
  !MARKET_SKU_EXCLUSIONS.some(([m, s]) => m === market && s === sku);

/* ── Planted stories (relative to the last day of data, D-1 = day 0 below) ─── */

export const STORIES = Object.freeze({
  /** S1 — L1 overfill after an auger-profile change. */
  s1: { line: 'CAP_L1', auger: 'RG_10G', daysAgo: 21, biasBefore: 0.12, biasAfter: 0.45 },
  /** S2 — manual log: blank rate per shift and under-report factor range. */
  s2: { blank: { SHIFT_1: 0.1, SHIFT_2: 0.16, SHIFT_3: 0.38 }, reportFactor: [0.5, 0.75] },
  /** S3 — L2 seal heater B: wear from D-26 00:00, fails D-19 02:10 for 192 min. */
  s3: { asset: 'SEAL_HEATER_L2_B', wearFromDaysAgo: 26, failDaysAgo: 19, failMinute: 130, stopMinutes: 192 },
  /** S4 — L2 dosing auger wear from D-9, continuing into the live stream. */
  s4: { asset: 'DOSING_AUGER_L2', fromDaysAgo: 9, vibEnd: 3.4, curRise: 0.12 },
  /** S5 — PH/TH listing uplift for CSD + AMR from (last complete week − 8). */
  s5: { markets: ['PH', 'TH'], skus: ['12450005', '12450001'], uplift: 0.35, weeksAgo: 8 },
  /** S6 — AHU-02 humidity stop D-41 14:00–19:30; current wear over the last 5 days. */
  s6: { daysAgo: 41, stopStart: 14 * 60, stopEnd: 19 * 60 + 30, wearDays: 5, wearNow: 0.5 },
});

/* ── Predictive formulas (the JS reference and the Spark SQL share these) ─── */

/**
 * Asset health 0–100 per metric: 100 − zWeight·clamp(z / zScale) − ratioWeight·ratio,
 * where z is the 6-hour mean against a 28-day baseline that ends 10 days back
 * and ratio is how far that mean has travelled from baseline towards the alarm.
 * The asset takes its worst metric. RUL = (alarm − x6h) / 72-hour slope.
 */
export const HEALTH = Object.freeze({
  zWeight: 30,
  zScale: 20,
  ratioWeight: 70,
  /** Baseline = [t − 38 d, t − 10 d]: 28 days, ending early enough not to absorb a drift it should flag. */
  baselineFromDays: 38,
  baselineToDays: 10,
  recentHours: 6,
  slopeHours: 72,
  rulCapDays: 60,
  bands: [
    { min: 75, band: 'Normal' },
    { min: 50, band: 'Watch' },
    { min: 30, band: 'Warning' },
    { min: 0, band: 'Critical' },
  ],
});
export const healthBand = (health) => HEALTH.bands.find((item) => health >= item.min).band;

/** Humidity-stop risk per filling zone, hourly. */
export const RISK = Object.freeze({
  dpBase: 22,
  dpSpan: 5,
  ahuSpan: 0.15,
  rhBase: 35,
  rhSpan: 10,
  weights: { dp: 0.45, ahu: 0.35, rh: 0.2 },
  levels: [
    { min: 0.65, level: 'HIGH' },
    { min: 0.4, level: 'MEDIUM' },
    { min: 0, level: 'LOW' },
  ],
});
export const riskLevel = (risk) => RISK.levels.find((item) => risk >= item.min).level;
