/**
 * The vocabularies Demo Data 1 (home appliance — chest freezers) shares between
 * its plant model and its warehouse.
 *
 * `workcenter_code`, `line_code` and the downtime/defect codes here are the
 * keys every table joins on. That shared key is the whole point: it is what
 * lets a dashboard, an AI answer and a plant graph talk about the same stoppage.
 *
 * All data is mock data.
 */

/** Ex-factory price in VND, used to convert a production loss into money. */
export const PRODUCT_MODELS = Object.freeze([
  {
    product_model: 'FZ-M165-CU',
    product_name: 'Mini chest freezer, 1 compartment, 165 L, copper coil',
    capacity_liters: 165,
    coil_material: 'Copper',
    product_family: 'Mini chest freezer',
    line_code: 'LINE_FRZ_3',
    ex_factory_price_vnd: 3_900_000,
    share: 1,
  },
  {
    product_model: 'FZ-S205-AL',
    product_name: 'Chest freezer, 2 compartments, 205 L, aluminium coil',
    capacity_liters: 205,
    coil_material: 'Aluminium',
    product_family: 'Steel-lid chest freezer',
    line_code: 'LINE_FRZ_1',
    ex_factory_price_vnd: 4_300_000,
    share: 0.26,
  },
  {
    product_model: 'FZ-S205-CU',
    product_name: 'Chest freezer, 2 compartments, 205 L, copper coil',
    capacity_liters: 205,
    coil_material: 'Copper',
    product_family: 'Steel-lid chest freezer',
    line_code: 'LINE_FRZ_1',
    ex_factory_price_vnd: 4_700_000,
    share: 0.3,
  },
  {
    product_model: 'FZ-G205-DM',
    product_name: 'Chest freezer 205 L, dual mode freeze / chill',
    capacity_liters: 205,
    coil_material: 'Aluminium',
    product_family: 'Glass-top freezer',
    line_code: 'LINE_FRZ_2',
    ex_factory_price_vnd: 4_900_000,
    share: 0.55,
  },
  {
    product_model: 'CL-B205-CU',
    product_name: 'Freezer / beverage cooler 205 L',
    capacity_liters: 205,
    coil_material: 'Copper',
    product_family: 'Beverage cooler',
    line_code: 'LINE_FRZ_2',
    ex_factory_price_vnd: 5_100_000,
    share: 0.45,
  },
  {
    product_model: 'FZ-S245-AL',
    product_name: 'Chest freezer, 2 compartments, 245 L, aluminium coil',
    capacity_liters: 245,
    coil_material: 'Aluminium',
    product_family: 'Steel-lid chest freezer',
    line_code: 'LINE_FRZ_1',
    ex_factory_price_vnd: 5_400_000,
    share: 0.18,
  },
  {
    product_model: 'FZ-S245-CU',
    product_name: 'Chest freezer, 2 compartments, 245 L, copper coil',
    capacity_liters: 245,
    coil_material: 'Copper',
    product_family: 'Steel-lid chest freezer',
    line_code: 'LINE_FRZ_1',
    ex_factory_price_vnd: 5_900_000,
    share: 0.18,
  },
  {
    product_model: 'FZ-S372-CU',
    product_name: 'Chest freezer, 2 compartments, 372 L, copper coil',
    capacity_liters: 372,
    coil_material: 'Copper',
    product_family: 'Steel-lid chest freezer',
    line_code: 'LINE_FRZ_1',
    ex_factory_price_vnd: 8_600_000,
    share: 0.08,
  },
]);

export const LINES = Object.freeze([
  {
    line_code: 'LINE_FRZ_1',
    line_name: 'Steel-lid chest freezer line',
    product_family: 'Steel-lid chest freezer',
    takt_time_sec: 90,
    daily_capacity: 600,
    oee_target_pct: 85,
  },
  {
    line_code: 'LINE_FRZ_2',
    line_name: 'Glass-top freezer / beverage cooler line',
    product_family: 'Glass-top freezer',
    takt_time_sec: 142,
    daily_capacity: 380,
    oee_target_pct: 82,
  },
  {
    line_code: 'LINE_FRZ_3',
    line_name: 'Mini chest freezer line',
    product_family: 'Mini chest freezer',
    takt_time_sec: 200,
    daily_capacity: 270,
    oee_target_pct: 80,
  },
]);

/**
 * In route order. The generator caps each step by the one before it.
 *
 * `short_name` exists for chart axes: a horizontal bar chart gives its category
 * axis a narrow fixed gutter, and a long work-center name wraps into lines that
 * collide with their neighbours. A short hand-written name is more readable.
 */
export const WORK_CENTERS = Object.freeze([
  {
    workcenter_code: 'CUT_PRESS',
    short_name: 'Press',
    workcenter_name: 'Sheet cutting & pressing',
    area_code: 'AREA_METAL',
  },
  {
    workcenter_code: 'CAB_FORM',
    short_name: 'Cabinet weld',
    workcenter_name: 'Cabinet bending & welding',
    area_code: 'AREA_METAL',
  },
  {
    workcenter_code: 'COIL_WIND',
    short_name: 'Coil winding',
    workcenter_name: 'Copper / aluminium coil winding',
    area_code: 'AREA_COIL',
  },
  {
    workcenter_code: 'LINER_ASSY',
    short_name: 'Shell assy',
    workcenter_name: 'Liner fitting & shell assembly',
    area_code: 'AREA_FOAM',
  },
  {
    workcenter_code: 'PU_FOAM',
    short_name: 'PU foam',
    workcenter_name: 'PU foam injection',
    area_code: 'AREA_FOAM',
  },
  {
    workcenter_code: 'LID_LINE',
    short_name: 'Lid & gasket',
    workcenter_name: 'Lid & gasket line',
    area_code: 'AREA_FOAM',
  },
  {
    workcenter_code: 'ASSY_COOL',
    short_name: 'Compressor',
    workcenter_name: 'Compressor & condenser assembly',
    area_code: 'AREA_ASSY',
  },
  {
    workcenter_code: 'VAC_CHG',
    short_name: 'Gas charge',
    workcenter_name: 'Vacuum & R600a gas charging',
    area_code: 'AREA_TEST',
  },
  {
    workcenter_code: 'LEAK_TEST',
    short_name: 'Leak test',
    workcenter_name: 'Leak test',
    area_code: 'AREA_TEST',
  },
  {
    workcenter_code: 'HIPOT_RUN',
    short_name: 'Run test',
    workcenter_name: 'Hi-pot & cooling run test',
    area_code: 'AREA_TEST',
  },
  {
    workcenter_code: 'FINAL_QC',
    short_name: 'Final QC',
    workcenter_name: 'Visual QC & energy label',
    area_code: 'AREA_TEST',
  },
  {
    workcenter_code: 'PACK',
    short_name: 'Packing',
    workcenter_name: 'Packing',
    area_code: 'AREA_PACK',
  },
  {
    workcenter_code: 'FG_WH',
    short_name: 'FG receipt',
    workcenter_name: 'Finished-goods receipt',
    area_code: 'AREA_PACK',
  },
]);

export const SHIFTS = Object.freeze([
  { shift_code: 'SHIFT_1', shift_name: 'Shift 1', start_hour: 6, end_hour: 14 },
  { shift_code: 'SHIFT_2', shift_name: 'Shift 2', start_hour: 14, end_hour: 22 },
]);

export const DOWNTIME_REASONS = Object.freeze([
  {
    reason_code: 'DT_FOAM_MOLD',
    short_name: 'Foam mould',
    reason_name: 'Foam mould fault / foam leak',
    category: 'Equipment',
  },
  {
    reason_code: 'DT_COIL_WIND',
    short_name: 'Coil winder',
    reason_name: 'Coil winder jam / copper tube break',
    category: 'Equipment',
  },
  {
    reason_code: 'DT_PRESS_DIE',
    short_name: 'Press die',
    reason_name: 'Press die change & adjustment',
    category: 'Changeover',
  },
  {
    reason_code: 'DT_CHANGEOVER',
    short_name: 'Model change',
    reason_name: 'Model changeover',
    category: 'Changeover',
  },
  {
    reason_code: 'DT_MATERIAL',
    short_name: 'No material',
    reason_name: 'Material shortage',
    category: 'Supply',
  },
  {
    reason_code: 'DT_GAS_CHARGE',
    short_name: 'Gas station',
    reason_name: 'Gas charging station fault',
    category: 'Equipment',
  },
  {
    reason_code: 'DT_LEAK_RIG',
    short_name: 'Leak calib.',
    reason_name: 'Leak detector calibration',
    category: 'Quality',
  },
  {
    reason_code: 'DT_POWER',
    short_name: 'Power loss',
    reason_name: 'Power outage / voltage dip',
    category: 'Utilities',
  },
  {
    reason_code: 'DT_PM',
    short_name: 'Planned PM',
    reason_name: 'Planned maintenance',
    category: 'Maintenance',
  },
  {
    reason_code: 'DT_QC_HOLD',
    short_name: 'QC hold',
    reason_name: 'Held for QC',
    category: 'Quality',
  },
]);

export const DEFECT_CODES = Object.freeze([
  {
    defect_code: 'QC_R600A_LEAK',
    defect_name: 'R600a gas leak',
    workcenter_code: 'LEAK_TEST',
    severity: 'Critical',
  },
  {
    defect_code: 'QC_COIL_SOLDER',
    defect_name: 'Coil solder joint out of spec',
    workcenter_code: 'COIL_WIND',
    severity: 'Critical',
  },
  {
    defect_code: 'QC_FOAM_VOID',
    defect_name: 'Foam void / uneven foam',
    workcenter_code: 'PU_FOAM',
    severity: 'Major',
  },
  {
    defect_code: 'QC_LID_SEAL',
    defect_name: 'Lid gasket not sealing',
    workcenter_code: 'LID_LINE',
    severity: 'Major',
  },
  {
    defect_code: 'QC_PULLDOWN_SLOW',
    defect_name: 'Pull-down time out of spec',
    workcenter_code: 'HIPOT_RUN',
    severity: 'Major',
  },
  {
    defect_code: 'QC_ELEC_HIPOT',
    defect_name: 'Failed hi-pot (insulation) test',
    workcenter_code: 'HIPOT_RUN',
    severity: 'Critical',
  },
  {
    defect_code: 'QC_PAINT_SCRATCH',
    defect_name: 'Paint scratch / dented cabinet',
    workcenter_code: 'FINAL_QC',
    severity: 'Minor',
  },
  {
    defect_code: 'QC_LABEL_WRONG',
    defect_name: 'Wrong energy label',
    workcenter_code: 'FINAL_QC',
    severity: 'Minor',
  },
]);

export const AREAS = Object.freeze([
  { area_code: 'AREA_METAL', area_name: 'Metal shop – pressing & cabinet forming', base_load_kw: 210 },
  { area_code: 'AREA_COIL', area_name: 'Coil winding shop', base_load_kw: 85 },
  { area_code: 'AREA_FOAM', area_name: 'PU foam shop', base_load_kw: 260 },
  { area_code: 'AREA_ASSY', area_name: 'Assembly shop', base_load_kw: 120 },
  { area_code: 'AREA_TEST', area_name: 'Gas charging & test area', base_load_kw: 175 },
  { area_code: 'AREA_PACK', area_name: 'Packing & finished-goods warehouse', base_load_kw: 95 },
  { area_code: 'AREA_UTIL', area_name: 'Utilities', base_load_kw: 430 },
]);

/** Which stoppage a work center is prone to, before the generic reasons. */
export const SIGNATURE_DOWNTIME = Object.freeze({
  CUT_PRESS: 'DT_PRESS_DIE',
  CAB_FORM: 'DT_PRESS_DIE',
  COIL_WIND: 'DT_COIL_WIND',
  PU_FOAM: 'DT_FOAM_MOLD',
  VAC_CHG: 'DT_GAS_CHARGE',
  LEAK_TEST: 'DT_LEAK_RIG',
});

export const GENERIC_DOWNTIME = Object.freeze([
  'DT_CHANGEOVER',
  'DT_MATERIAL',
  'DT_POWER',
  'DT_PM',
  'DT_QC_HOLD',
]);

/** Which defect a work center produces when it scraps a unit. */
export const SIGNATURE_DEFECT = Object.freeze({
  CUT_PRESS: 'QC_PAINT_SCRATCH',
  CAB_FORM: 'QC_PAINT_SCRATCH',
  COIL_WIND: 'QC_COIL_SOLDER',
  LINER_ASSY: 'QC_FOAM_VOID',
  PU_FOAM: 'QC_FOAM_VOID',
  LID_LINE: 'QC_LID_SEAL',
  ASSY_COOL: 'QC_ELEC_HIPOT',
  VAC_CHG: 'QC_R600A_LEAK',
  LEAK_TEST: 'QC_R600A_LEAK',
  HIPOT_RUN: 'QC_PULLDOWN_SLOW',
  FINAL_QC: 'QC_PAINT_SCRATCH',
  PACK: 'QC_LABEL_WRONG',
  FG_WH: 'QC_LABEL_WRONG',
});

export const EXPORT_MARKETS = Object.freeze([
  { market: 'North America', share: 0.55, port: 'Cai Mep', transit_days: 28 },
  { market: 'Europe', share: 0.3, port: 'Cai Mep', transit_days: 32 },
  { market: 'Asia', share: 0.15, port: 'Cat Lai', transit_days: 12 },
]);
