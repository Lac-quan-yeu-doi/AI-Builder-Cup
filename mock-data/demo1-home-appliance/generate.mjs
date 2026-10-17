/**
 * Deterministic mock MES/ERP data for Demo Data 1 (home appliance — chest freezers).
 *
 * Pure apart from the CLI at the bottom: `generate({ seed, endDate, days })`
 * returns the same rows for the same inputs, so a rehearsal and the recording
 * show identical numbers.
 *
 * Production is simulated rather than sampled: stoppages come first, hourly
 * output follows from the runtime they leave behind, and each step is capped by
 * what the step before it handed over (plus a small WIP buffer). That is what
 * makes an upstream problem visibly drain the whole line, which is the point of
 * story A.
 *
 * Three signals are planted deliberately:
 *   A  PU_FOAM on LINE_FRZ_1 degrades over the last 12 days (DT_FOAM_MOLD).
 *   B  FZ-S245-CU leaks R600a at LEAK_TEST for 8 days, with the root cause
 *      visible upstream at COIL_WIND as bad coil solder.
 *   C  Energy per unit rises with ambient temperature.
 *   D  Export OTD to North America falls in the last month.
 *
 * Run `node mock-data/demo1-home-appliance/generate.mjs --out <dir>` to
 * write CSVs, or `--summary` to print the planted-signal report on its own.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  AREAS,
  DEFECT_CODES,
  DOWNTIME_REASONS,
  EXPORT_MARKETS,
  GENERIC_DOWNTIME,
  LINES,
  PRODUCT_MODELS,
  SHIFTS,
  SIGNATURE_DEFECT,
  SIGNATURE_DOWNTIME,
  WORK_CENTERS,
} from './reference.mjs';

const FIRST_HOUR = 6;
const LAST_HOUR = 21;
const PRODUCTION_HOURS = LAST_HOUR - FIRST_HOUR + 1;
const STORY_A_DAYS = 12;
const STORY_B_FROM = 17;
const STORY_B_TO = 24;
const STORY_B_MODEL = 'FZ-S245-CU';
const UNITS_PER_CONTAINER = 100;
const MAX_BUFFER = 90;

/** mulberry32 — small, fast, and stable across Node versions. */
function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * Rounds while preserving the expected value. Per-hour scrap is a fraction of a
 * unit, and `Math.round` on a fraction below 0.5 is always zero — which silently
 * emptied the quality tables the first time this ran.
 */
function stochasticRound(value, rng) {
  const whole = Math.floor(value);
  return whole + (rng() < value - whole ? 1 : 0);
}

const pad = (value) => String(value).padStart(2, '0');
const isoDate = (date) =>
  `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
const isoStamp = (date, hour, minute = 0) => `${isoDate(date)} ${pad(hour)}:${pad(minute)}:00`;
const addDays = (date, count) => new Date(date.getTime() + count * 86_400_000);
const dayOfYear = (date) => Math.floor((date - Date.UTC(date.getUTCFullYear(), 0, 0)) / 86_400_000);

function yesterdayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - 86_400_000);
}

/** Ambient temperature at the plant: a seasonal curve peaking in April, plus a daily one. */
function ambientTemperature(date, hour, jitter) {
  const seasonal = 3.5 * Math.cos((2 * Math.PI * (dayOfYear(date) - 105)) / 365);
  const daily = 4 * Math.sin((Math.PI * (hour - FIRST_HOUR)) / PRODUCTION_HOURS);
  return Math.round((27.5 + seasonal + daily + jitter) * 10) / 10;
}

function weightedPick(rng, items, weightOf) {
  const total = items.reduce((sum, item) => sum + weightOf(item), 0);
  let cursor = rng() * total;
  for (const item of items) {
    cursor -= weightOf(item);
    if (cursor <= 0) return item;
  }
  return items[items.length - 1];
}

/**
 * Stoppages for one line/work center on one day, already spread across the
 * hours they cover. Story A adds its own foam-mould events on top.
 */
function stoppagesFor(rng, { lineCode, workcenterCode, date, daysAgo }) {
  const events = [];
  let count = 0;
  while (count < 3 && rng() < 0.32) count += 1;

  for (let index = 0; index < count; index += 1) {
    const signature = SIGNATURE_DOWNTIME[workcenterCode];
    const reason =
      signature !== undefined && rng() < 0.7
        ? signature
        : GENERIC_DOWNTIME[Math.floor(rng() * GENERIC_DOWNTIME.length)];
    events.push({
      reason,
      startHour: FIRST_HOUR + Math.floor(rng() * PRODUCTION_HOURS),
      startMinute: Math.floor(rng() * 60),
      minutes: Math.round(10 + rng() * 50),
    });
  }

  const storyA =
    lineCode === 'LINE_FRZ_1' && workcenterCode === 'PU_FOAM' && daysAgo < STORY_A_DAYS;
  if (storyA) {
    const severity = (STORY_A_DAYS - daysAgo) / STORY_A_DAYS;
    let remaining = Math.round(15 + severity * 245);
    while (remaining > 0) {
      const minutes = Math.min(remaining, Math.round(35 + rng() * 45));
      events.push({
        reason: 'DT_FOAM_MOLD',
        startHour: FIRST_HOUR + Math.floor(rng() * PRODUCTION_HOURS),
        startMinute: Math.floor(rng() * 60),
        minutes,
      });
      remaining -= minutes;
    }
  }

  const perHour = new Map();
  for (const event of events) {
    let cursorHour = event.startHour;
    let cursorMinute = event.startMinute;
    let left = event.minutes;
    while (left > 0 && cursorHour <= LAST_HOUR) {
      const slice = Math.min(left, 60 - cursorMinute);
      perHour.set(cursorHour, Math.min(60, (perHour.get(cursorHour) ?? 0) + slice));
      left -= slice;
      cursorHour += 1;
      cursorMinute = 0;
    }
  }

  const logged = events.map((event) => {
    const start = new Date(date.getTime());
    const endMinutes = event.startHour * 60 + event.startMinute + event.minutes;
    return {
      start_time: isoStamp(start, event.startHour, event.startMinute),
      end_time: isoStamp(start, Math.min(23, Math.floor(endMinutes / 60)), endMinutes % 60),
      line_code: lineCode,
      workcenter_code: workcenterCode,
      reason_code: event.reason,
      duration_min: event.minutes,
      note: event.reason === 'DT_FOAM_MOLD' ? 'Foam mould leaking, stopped for cleaning' : '',
    };
  });

  return { perHour, logged, storyA };
}

export function generate({ seed = 20_260_916, endDate = yesterdayUtc(), days = 120 } = {}) {
  const rng = mulberry32(seed);
  const start = addDays(endDate, -(days - 1));

  const mesRows = [];
  const downtimeRows = [];
  const qcRows = [];
  const workOrderRows = [];
  const energyRows = [];
  const inventoryRows = [];
  const exportRows = [];

  const modelsByLine = new Map(
    LINES.map((line) => [
      line.line_code,
      PRODUCT_MODELS.filter((model) => model.line_code === line.line_code),
    ]),
  );
  const openOrders = new Map();
  const stockByModel = new Map(PRODUCT_MODELS.map((model) => [model.product_model, 400]));
  const pendingContainers = new Map(PRODUCT_MODELS.map((model) => [model.product_model, 0]));
  let orderSequence = 1;
  const dailyLineOutput = [];

  for (let dayIndex = 0; dayIndex < days; dayIndex += 1) {
    const date = addDays(start, dayIndex);
    const daysAgo = days - 1 - dayIndex;
    const working = date.getUTCDay() !== 0;
    const producedToday = new Map();

    if (working) {
      for (const line of LINES) {
        const candidates = modelsByLine.get(line.line_code) ?? [];
        const storyBWindow =
          line.line_code === 'LINE_FRZ_1' && daysAgo >= STORY_B_FROM && daysAgo <= STORY_B_TO;
        const model = storyBWindow
          ? (candidates.find((item) => item.product_model === STORY_B_MODEL) ?? candidates[0])
          : weightedPick(rng, candidates, (item) => item.share);

        const order = openOrders.get(line.line_code);
        if (order === undefined || order.model_code !== model.product_model || order.spanDays >= 3) {
          if (order !== undefined) workOrderRows.push(finishOrder(order));
          openOrders.set(line.line_code, {
            order_no: `WO-${String(orderSequence++).padStart(5, '0')}`,
            start_date: isoDate(date),
            end_date: isoDate(date),
            model_code: model.product_model,
            line_code: line.line_code,
            planned_qty: 0,
            completed_qty: 0,
            spanDays: 0,
          });
        }
        const active = openOrders.get(line.line_code);
        active.spanDays += 1;
        active.end_date = isoDate(date);

        const unitsPerHour = 3_600 / line.takt_time_sec;
        const stoppages = WORK_CENTERS.map((center) =>
          stoppagesFor(rng, {
            lineCode: line.line_code,
            workcenterCode: center.workcenter_code,
            date,
            daysAgo,
          }),
        );
        for (const stoppage of stoppages) downtimeRows.push(...stoppage.logged);

        const buffers = WORK_CENTERS.map(() => 0);
        const dayDefects = new Map();
        let lineGoodToday = 0;
        let linePlannedToday = 0;

        for (let hour = FIRST_HOUR; hour <= LAST_HOUR; hour += 1) {
          const shift = hour < SHIFTS[1].start_hour ? SHIFTS[0] : SHIFTS[1];
          const linePace = 0.88 + (rng() - 0.5) * 0.03;
          let upstream = Number.POSITIVE_INFINITY;

          WORK_CENTERS.forEach((center, index) => {
            const downtime = Math.min(60, Math.round(stoppages[index].perHour.get(hour) ?? 0));
            const runtime = 60 - downtime;
            const storyA = stoppages[index].storyA;
            const severity = storyA ? (STORY_A_DAYS - daysAgo) / STORY_A_DAYS : 0;
            const performance = linePace * (0.99 + rng() * 0.02) * (1 - severity * 0.15);
            const capacity = Math.floor(unitsPerHour * (runtime / 60) * performance);
            const available =
              upstream === Number.POSITIVE_INFINITY
                ? Number.POSITIVE_INFINITY
                : upstream + buffers[index];
            const produced = Math.max(0, Math.min(capacity, available));
            if (Number.isFinite(available)) {
              buffers[index] = Math.min(MAX_BUFFER, Math.max(0, available - produced));
            }
            /*
             * Two different losses, kept apart on purpose.
             *
             * A serial line starves everything downstream of a stoppage, so a
             * single OEE number makes PACK look as sick as the foam station
             * that actually stopped — and an executive chart built on it points
             * the board at the wrong end of the line. Splitting the idle
             * minutes into "my machine stopped" and "nothing arrived" is what
             * a real MES does, and it is what lets the OEE chart name a culprit
             * while output still falls line-wide.
             */
            const starved = capacity === 0 ? 0 : Math.round(runtime * (1 - produced / capacity));
            const planned = Math.round(unitsPerHour);

            const scrapRate = (0.0012 + rng() * 0.0016) * (1 + severity * 1.6);
            const reworkRate = 0.0006 + rng() * 0.001;
            const scrap = stochasticRound(produced * scrapRate, rng);
            const rework = stochasticRound(produced * reworkRate, rng);
            const good = Math.max(0, produced - scrap - rework);

            mesRows.push({
              event_time: isoStamp(date, hour),
              line_code: line.line_code,
              workcenter_code: center.workcenter_code,
              model_code: model.product_model,
              shift_code: shift.shift_code,
              planned_qty: planned,
              good_qty: good,
              scrap_qty: scrap,
              rework_qty: rework,
              run_min: Math.max(0, runtime - starved),
              down_min: downtime,
              starved_min: starved,
            });

            if (scrap > 0) {
              const key = `${center.workcenter_code}|${SIGNATURE_DEFECT[center.workcenter_code]}`;
              dayDefects.set(key, (dayDefects.get(key) ?? 0) + scrap);
            }
            if (index === WORK_CENTERS.length - 1) {
              lineGoodToday += good;
              linePlannedToday += planned;
            }
            upstream = good;
          });
        }

        if (storyBWindow) {
          const leakKey = `LEAK_TEST|QC_R600A_LEAK`;
          const solderKey = `COIL_WIND|QC_COIL_SOLDER`;
          dayDefects.set(leakKey, Math.round((dayDefects.get(leakKey) ?? 2) * (11 + rng() * 6)));
          dayDefects.set(solderKey, Math.round((dayDefects.get(solderKey) ?? 2) * (4 + rng() * 2)));
        }

        for (const [key, quantity] of dayDefects) {
          const [workcenterCode, defectCode] = key.split('|');
          const definition = DEFECT_CODES.find((item) => item.defect_code === defectCode);
          qcRows.push({
            event_time: isoStamp(date, FIRST_HOUR + Math.floor(rng() * PRODUCTION_HOURS)),
            line_code: line.line_code,
            workcenter_code: workcenterCode,
            model_code: model.product_model,
            defect_code: defectCode,
            quantity: quantity,
            severity: definition?.severity ?? 'Minor',
          });
        }

        active.planned_qty += linePlannedToday;
        active.completed_qty += lineGoodToday;
        producedToday.set(
          model.product_model,
          (producedToday.get(model.product_model) ?? 0) + lineGoodToday,
        );
        dailyLineOutput.push({
          date: isoDate(date),
          daysAgo,
          line_code: line.line_code,
          product_model: model.product_model,
          good: lineGoodToday,
        });
      }
    }

    const dailyLoadFactor = 0.9 + rng() * 0.2;
    for (const area of AREAS) {
      for (let hour = FIRST_HOUR; hour <= LAST_HOUR; hour += 1) {
        const temperature = ambientTemperature(date, hour, (rng() - 0.5) * 1.6);
        const utilisation = working ? 0.68 + rng() * 0.08 : 0.2 + rng() * 0.04;
        const cooling =
          area.area_code === 'AREA_UTIL' || area.area_code === 'AREA_FOAM'
            ? Math.max(0, temperature - 24) * (area.area_code === 'AREA_UTIL' ? 46 : 18)
            : 0;
        const kwh =
          Math.round((area.base_load_kw * utilisation + cooling) * dailyLoadFactor * 10) / 10;
        energyRows.push({
          event_time: isoStamp(date, hour),
          area_code: area.area_code,
          kwh,
          peak_kw: Math.round(kwh * (1.12 + rng() * 0.1) * 10) / 10,
          power_factor: Math.round((0.9 + rng() * 0.07) * 100) / 100,
          ambient_temp_c: temperature,
        });
      }
    }

    for (const model of PRODUCT_MODELS) {
      const opening = stockByModel.get(model.product_model) ?? 0;
      const received = producedToday.get(model.product_model) ?? 0;
      const domestic = working ? Math.round(received * (0.35 + rng() * 0.12)) : 0;
      const pending = (pendingContainers.get(model.product_model) ?? 0) + received - domestic;
      const containers = Math.floor(Math.max(0, pending) / UNITS_PER_CONTAINER);
      const shipped = containers * UNITS_PER_CONTAINER;
      pendingContainers.set(model.product_model, Math.max(0, pending) - shipped);

      for (let index = 0; index < containers; index += 1) {
        const market = weightedPick(rng, EXPORT_MARKETS, (item) => item.share);
        const committed = addDays(date, market.transit_days);
        const lateRisk = market.market === 'North America' && daysAgo < 30 ? 0.2 : 0.04;
        const slip = rng() < lateRisk ? 1 + Math.floor(rng() * 6) : 0;
        exportRows.push({
          ship_date: isoDate(date),
          market: market.market,
          container_no: `DMOU${String(4_000_000 + exportRows.length).padStart(7, '0')}`,
          port: market.port,
          model_code: model.product_model,
          quantity: UNITS_PER_CONTAINER,
          committed_date: isoDate(committed),
          actual_delivery_date: isoDate(addDays(committed, slip)),
        });
      }

      const closing = opening + received - domestic - shipped;
      stockByModel.set(model.product_model, Math.max(0, closing));
      inventoryRows.push({
        stock_date: isoDate(date),
        warehouse_code: 'WH_FG',
        model_code: model.product_model,
        opening_qty: opening,
        received_qty: received,
        issued_qty: domestic + shipped,
        closing_qty: Math.max(0, closing),
      });
    }
  }

  for (const order of openOrders.values()) workOrderRows.push(finishOrder(order));

  const tables = {
    dim_product_model: PRODUCT_MODELS.map(({ share, ...rest }) => rest),
    dim_line: LINES.map((line) => ({ ...line })),
    dim_workcenter: WORK_CENTERS.map((center, index) => ({ ...center, sequence: index + 1 })),
    dim_shift: SHIFTS.map((shift) => ({ ...shift })),
    dim_downtime_reason: DOWNTIME_REASONS.map((reason) => ({ ...reason })),
    dim_defect_code: DEFECT_CODES.map((defect) => ({ ...defect })),
    dim_area: AREAS.map((area) => ({ ...area })),
    bronze_mes_production_log: mesRows,
    bronze_downtime_event: downtimeRows,
    bronze_qc_inspection: qcRows,
    bronze_erp_work_order: workOrderRows,
    bronze_energy: energyRows,
    bronze_fg_inventory: inventoryRows,
    bronze_export_shipment: exportRows,
  };

  return { tables, summary: summarize(tables, dailyLineOutput, { start, endDate, days, seed }) };
}

/**
 * Guards the four planted signals. A seed run that quietly loses one of these
 * produces a demo where the assistant answers a question nobody can verify, so
 * this throws rather than warns.
 */
export function assertPlantedSignals(summary) {
  const failures = [];
  const { storyA, storyB, storyC, storyD } = summary;

  if (storyA.foamOeeBaseline < 0.8)
    failures.push(`Story A: baseline foam OEE ${storyA.foamOeeBaseline} is below 0.80.`);
  if (storyA.foamOeeRecent > 0.72)
    failures.push(`Story A: recent foam OEE ${storyA.foamOeeRecent} is not a visible drop.`);
  if (storyA.lostUnits < 300)
    failures.push(`Story A: only ${storyA.lostUnits} units lost; too small to quote.`);

  const leaks = Object.entries(storyB.leaksByModel);
  const [topModel, topCount] = leaks[0] ?? ['', 0];
  const runnerUp = leaks[1]?.[1] ?? 0;
  if (topModel !== 'FZ-S245-CU')
    failures.push(`Story B: ${topModel} leaks most, expected FZ-S245-CU.`);
  if (topCount < runnerUp * 1.6)
    failures.push(`Story B: ${topCount} vs ${runnerUp} is too close to call on a chart.`);
  if (storyB.solderAtCoilWind < 50)
    failures.push('Story B: no upstream coil-solder trail to follow.');

  if (storyC.kwhPerUnitVsAmbient < 0.5)
    failures.push(`Story C: energy/ambient correlation ${storyC.kwhPerUnitVsAmbient} is too weak.`);
  if (storyC.dailyKwhVsAmbient > 0.97)
    failures.push(`Story C: correlation ${storyC.dailyKwhVsAmbient} is implausibly perfect.`);

  const recent = storyD.otdLast30ByMarket['North America'] ?? 1;
  if (recent > 0.88) failures.push(`Story D: North America OTD ${recent} does not stand out.`);
  if (storyD.otdOverall < 0.9)
    failures.push(`Story D: overall OTD ${storyD.otdOverall} makes the plant look broken.`);

  if (failures.length > 0)
    throw new Error(`Planted demo signals are missing:\n  - ${failures.join('\n  - ')}`);
}

function finishOrder(order) {
  const { spanDays, ...rest } = order;
  return {
    ...rest,
    status: rest.completed_qty >= rest.planned_qty ? 'COMPLETED' : 'IN_PROGRESS',
  };
}

/**
 * The planted-signal report. The runbook's spoken numbers come from here rather
 * than the other way round — a figure invented in a script and then rounded in
 * a slide is how a demo ends up contradicting its own screen.
 */
function summarize(tables, dailyLineOutput, context) {
  const mes = tables.bronze_mes_production_log;
  const oeeOf = (rows) => {
    const runtime = rows.reduce((sum, row) => sum + row.run_min, 0);
    const downtime = rows.reduce((sum, row) => sum + row.down_min, 0);
    const good = rows.reduce((sum, row) => sum + row.good_qty, 0);
    const pace = rows.reduce((sum, row) => sum + (row.planned_qty * row.run_min) / 60, 0);
    const total = runtime + downtime;
    return total === 0 || pace === 0 ? 0 : (runtime / total) * (good / pace);
  };
  const dayKey = (row) => row.event_time.slice(0, 10);
  const cutoff = (daysAgo) =>
    new Date(context.endDate.getTime() - daysAgo * 86_400_000).toISOString().slice(0, 10);

  const foam = mes.filter(
    (row) => row.line_code === 'LINE_FRZ_1' && row.workcenter_code === 'PU_FOAM',
  );
  const foamRecent = foam.filter((row) => dayKey(row) > cutoff(STORY_A_DAYS));
  const foamBefore = foam.filter(
    (row) => dayKey(row) <= cutoff(STORY_A_DAYS) && dayKey(row) > cutoff(STORY_A_DAYS + 30),
  );

  const line1 = dailyLineOutput.filter((row) => row.line_code === 'LINE_FRZ_1');
  const recentDays = line1.filter((row) => row.daysAgo < STORY_A_DAYS);
  const baselineDays = line1.filter(
    (row) => row.daysAgo >= STORY_A_DAYS && row.daysAgo < STORY_A_DAYS + 30,
  );
  const mean = (rows) =>
    rows.length === 0 ? 0 : rows.reduce((sum, row) => sum + row.good, 0) / rows.length;
  const lostPerDay = Math.max(0, mean(baselineDays) - mean(recentDays));
  const lostUnits = Math.round(lostPerDay * recentDays.length);
  const priceOf = (code) =>
    PRODUCT_MODELS.find((item) => item.product_model === code)?.ex_factory_price_vnd ?? 0;
  const averagePrice =
    recentDays.length === 0
      ? 0
      : recentDays.reduce((sum, row) => sum + priceOf(row.product_model), 0) / recentDays.length;

  const leaks = tables.bronze_qc_inspection.filter((row) => row.defect_code === 'QC_R600A_LEAK');
  const leakByModel = new Map();
  for (const row of leaks)
    leakByModel.set(row.model_code, (leakByModel.get(row.model_code) ?? 0) + row.quantity);

  const dailyEnergy = new Map();
  for (const row of tables.bronze_energy) {
    const key = row.event_time.slice(0, 10);
    const bucket = dailyEnergy.get(key) ?? { kwh: 0, temperature: 0, hours: 0 };
    bucket.kwh += row.kwh;
    bucket.temperature += row.ambient_temp_c;
    bucket.hours += 1;
    dailyEnergy.set(key, bucket);
  }
  const dailyGood = new Map();
  for (const row of dailyLineOutput)
    dailyGood.set(row.date, (dailyGood.get(row.date) ?? 0) + row.good);
  const energyPoints = [...dailyEnergy]
    .filter(([date]) => (dailyGood.get(date) ?? 0) > 0)
    .map(([date, bucket]) => ({
      temperature: bucket.temperature / bucket.hours,
      kwh: bucket.kwh,
      perUnit: bucket.kwh / (dailyGood.get(date) ?? 1),
    }));
  const temperatures = energyPoints.map((point) => point.temperature);
  const correlation = pearson(
    temperatures,
    energyPoints.map((point) => point.kwh),
  );
  const perUnitCorrelation = pearson(
    temperatures,
    energyPoints.map((point) => point.perUnit),
  );

  const otd = new Map();
  const otdRecent = new Map();
  for (const row of tables.bronze_export_shipment) {
    const bucket = otd.get(row.market) ?? { total: 0, onTime: 0 };
    bucket.total += 1;
    if (row.actual_delivery_date <= row.committed_date) bucket.onTime += 1;
    otd.set(row.market, bucket);
    if (row.ship_date > cutoff(30)) {
      const recent = otdRecent.get(row.market) ?? { total: 0, onTime: 0 };
      recent.total += 1;
      if (row.actual_delivery_date <= row.committed_date) recent.onTime += 1;
      otdRecent.set(row.market, recent);
    }
  }
  const share = (bucket) => round(bucket.onTime / bucket.total);
  const allOnTime = [...otd.values()].reduce((sum, bucket) => sum + bucket.onTime, 0);
  const allTotal = [...otd.values()].reduce((sum, bucket) => sum + bucket.total, 0);

  return {
    window: { from: context.start.toISOString().slice(0, 10), to: cutoff(0), days: context.days },
    seed: context.seed,
    rowCounts: Object.fromEntries(
      Object.entries(tables).map(([name, rows]) => [name, rows.length]),
    ),
    storyA: {
      foamOeeRecent: round(oeeOf(foamRecent)),
      foamOeeBaseline: round(oeeOf(foamBefore)),
      lostUnits,
      lostBillionVnd: round((lostUnits * averagePrice) / 1_000_000_000, 2),
    },
    storyB: {
      leaksByModel: Object.fromEntries([...leakByModel].sort((a, b) => b[1] - a[1])),
      solderAtCoilWind: tables.bronze_qc_inspection
        .filter((row) => row.defect_code === 'QC_COIL_SOLDER')
        .reduce((sum, row) => sum + row.quantity, 0),
    },
    storyC: {
      dailyKwhVsAmbient: round(correlation, 3),
      kwhPerUnitVsAmbient: round(perUnitCorrelation, 3),
    },
    storyD: {
      otdOverall: round(allOnTime / allTotal),
      otdByMarket: Object.fromEntries([...otd].map(([market, b]) => [market, share(b)])),
      otdLast30ByMarket: Object.fromEntries(
        [...otdRecent].map(([market, b]) => [market, share(b)]),
      ),
    },
  };
}

function pearson(left, right) {
  const n = left.length;
  const meanLeft = left.reduce((sum, value) => sum + value, 0) / n;
  const meanRight = right.reduce((sum, value) => sum + value, 0) / n;
  let covariance = 0;
  let varianceLeft = 0;
  let varianceRight = 0;
  for (let index = 0; index < n; index += 1) {
    const a = left[index] - meanLeft;
    const b = right[index] - meanRight;
    covariance += a * b;
    varianceLeft += a * a;
    varianceRight += b * b;
  }
  return covariance / Math.sqrt(varianceLeft * varianceRight);
}

const round = (value, digits = 3) => Number(value.toFixed(digits));

function toCsv(rows) {
  if (rows.length === 0) return '';
  const columns = Object.keys(rows[0]);
  const escape = (value) => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [
    columns.join(','),
    ...rows.map((row) => columns.map((column) => escape(row[column])).join(',')),
  ].join('\n');
}

if (process.argv[1]?.endsWith('demo1-home-appliance/generate.mjs')) {
  const argument = (name, fallback) => {
    const index = process.argv.indexOf(`--${name}`);
    return index === -1 ? fallback : process.argv[index + 1];
  };
  const endDate = argument('end-date', undefined);
  const { tables, summary } = generate({
    seed: Number(argument('seed', 20_260_916)),
    days: Number(argument('days', 120)),
    ...(endDate === undefined ? {} : { endDate: new Date(`${endDate}T00:00:00Z`) }),
  });

  assertPlantedSignals(summary);

  if (!process.argv.includes('--summary')) {
    const out = argument('out', 'out');
    mkdirSync(out, { recursive: true });
    for (const [name, rows] of Object.entries(tables)) {
      writeFileSync(join(out, `${name}.csv`), `${toCsv(rows)}\n`, 'utf8');
    }
    console.log(`Wrote ${Object.keys(tables).length} CSV files to ${out}`);
  }
  console.log(JSON.stringify(summary, null, 2));
}
