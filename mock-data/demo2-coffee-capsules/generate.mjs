/**
 * Deterministic mock plant data for Demo Data 2 (coffee capsules) — coffee
 * capsule filling & packing.
 *
 * Pure apart from the CLI at the bottom: `generate({ seed, endDate, days })`
 * returns identical rows for identical inputs, so every rehearsal and the
 * recording show the same numbers.
 *
 * Physics first, stories second. Nothing here draws a KPI from a distribution:
 *   - a 10-second line state machine (run / changeover / stop / planned) turns
 *     hand-made weekly plans into counts, stops and changeovers;
 *   - a fill-weight distribution per lane turns into checkweigher stats and
 *     overfill ("giveaway");
 *   - hopper load cells integrate every gram that went into a capsule, a purge
 *     bin or the floor, which is where the material balance comes from;
 *   - the AHU's dehumidification capacity against the outdoor dew point sets
 *     the filling-room humidity;
 *   - a hidden wear state per asset drives current, vibration and faults.
 * The six planted stories (see `STORIES` in the reference file) are perturbations of that process, so
 * a chart, a pipeline and an AI answer can only ever agree with each other.
 *
 *   node mock-data/demo2-coffee-capsules/generate.mjs [--out DIR] [--summary] [--end-date YYYY-MM-DD]
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  ASSETS,
  BOXES_PER_PACK,
  CAPSULES_PER_BOX,
  CHANGEOVER,
  DEMO,
  FAMILIES,
  FAULT_CODES,
  HEALTH,
  HOLIDAYS,
  LINES,
  MARKETS,
  MATERIAL_COST,
  REJECT_CODES,
  RISK,
  ROOMS,
  SHIFTS,
  SKUS,
  STATIONS,
  STORIES,
  TAGS,
  WORKCENTERS,
  healthBand,
  isSold,
  powderPrice,
  rateFor,
  riskLevel,
  sapMaterial,
  shiftOfHour,
  workcenterCode,
} from './reference.mjs';

/* ── Time: every timestamp is plant-local wall time, carried as a UTC Date ── */

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const WEEK = 7 * DAY;
const TICK_S = 10;
const TICKS_PER_MIN = 60 / TICK_S;

const pad = (value, size = 2) => String(value).padStart(size, '0');
export const fmtTs = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
export const fmtDate = (ms) => new Date(ms).toISOString().slice(0, 10);
const fmtVnDate = (ms) => {
  const d = new Date(ms);
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
};
const floorDay = (ms) => Math.floor(ms / DAY) * DAY;
const isoDow = (ms) => ((new Date(ms).getUTCDay() + 6) % 7) + 1; // 1 = Monday
const mondayOf = (ms) => floorDay(ms) - (isoDow(ms) - 1) * DAY;

export function isoWeek(ms) {
  const d = new Date(floorDay(ms));
  const thursday = floorDay(ms) + (4 - isoDow(ms)) * DAY;
  const year = new Date(thursday).getUTCFullYear();
  const jan4 = Date.UTC(year, 0, 4);
  const week = 1 + Math.round((thursday - mondayOf(jan4)) / WEEK);
  void d;
  return { year, week, label: `${year}${pad(week)}`, iso: `${year}-W${pad(week)}` };
}

function yesterdayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
}

/* ── Randomness ─────────────────────────────────────────────────────────── */

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Independent streams per concern, so tuning one story never reshuffles another. */
function streams(seed) {
  const make = (salt) => {
    const u = mulberry32(seed ^ salt);
    const normal = (mean = 0, sd = 1) => {
      const a = Math.max(u(), 1e-12);
      const b = u();
      return mean + sd * Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b);
    };
    return {
      u,
      between: (lo, hi) => lo + (hi - lo) * u(),
      normal,
      lognormal: (median, sigma = 0.6) => median * Math.exp(normal(0, sigma)),
      chance: (p) => u() < p,
      pick: (items) => items[Math.floor(u() * items.length)],
    };
  };
  return {
    demand: make(0x1001),
    ops: make(0x2002),
    fill: make(0x3003),
    env: make(0x4004),
    log: make(0x5005),
    misc: make(0x6006),
  };
}

const round = (value, digits = 3) =>
  digits < 0 ? Math.round(value / 10 ** -digits) * 10 ** -digits : Number(Number(value).toFixed(digits));
const clamp = (value, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, value));
const skuOf = (sku) => SKUS.find((item) => item.sku === sku);
const familyOf = (sku) => skuOf(sku).family;

/* ── Demand: weekly shipments per SKU × market, three years ─────────────── */

const TET = ['2024-02-10', '2025-01-29', '2026-02-17', '2027-02-06'].map((d) => Date.parse(`${d}T00:00:00Z`));
const DEMAND_BASE_BOXES = 306_000; // deseasonalised weekly level at the last complete week
const GROWTH = { export: 0.15, domestic: 0.06 };

/** Seasonal multiplier for a market in the ISO week starting at `monday`. */
function season(market, monday) {
  const { week } = isoWeek(monday);
  let factor = 1;
  const exporting = market !== 'VN';
  const q4 = { 45: 1.01, 46: 1.13, 47: 1.13, 48: 1.13, 49: 1.13, 50: 1.01 };
  if (exporting) factor *= q4[week] ?? 1;
  else factor *= week >= 46 && week <= 50 ? 1.05 : 1;
  if (week >= 23 && week <= 38) factor *= 0.93; // mid-year low season
  for (const tet of TET) {
    const weeksBefore = (tet - monday) / WEEK;
    if (weeksBefore > 0 && weeksBefore <= 4) {
      if (market === 'VN') factor *= 1.45;
      else if (['HK', 'TW', 'SG', 'MY'].includes(market)) factor *= 1.12;
    }
    if (weeksBefore <= 0 && weeksBefore > -2 && market === 'VN') factor *= 0.7;
  }
  return factor;
}

function pairShares() {
  const shares = new Map();
  for (const market of MARKETS) {
    const sold = SKUS.filter((sku) => isSold(market.market, sku.sku));
    const total = sold.reduce((sum, sku) => sum + sku.share, 0);
    for (const sku of sold) shares.set(`${sku.sku}|${market.market}`, (market.share * sku.share) / total);
  }
  return shares;
}

function buildDemand(rand, lastCompleteMonday, weeks) {
  const shares = pairShares();
  const weekList = Array.from({ length: weeks }, (_, index) => lastCompleteMonday - (weeks - 1 - index) * WEEK);
  const series = new Map(); // pair -> number[]
  const rows = [];
  const s5 = STORIES.s5;
  for (const [pair, share] of shares) {
    const [sku, market] = pair.split('|');
    const growth = market === 'VN' ? GROWTH.domestic : GROWTH.export;
    const values = weekList.map((monday, index) => {
      const level = DEMAND_BASE_BOXES * share * (1 + growth) ** ((index - (weeks - 1)) / 52);
      const weeksAgo = weeks - 1 - index;
      let uplift = 1;
      if (s5.markets.includes(market) && s5.skus.includes(sku) && weeksAgo <= s5.weeksAgo) {
        uplift = weeksAgo === s5.weeksAgo ? 1 + s5.uplift * 0.55 : 1 + s5.uplift;
      }
      return Math.max(0, Math.round(level * season(market, monday) * uplift * rand.lognormal(1, 0.07)));
    });
    series.set(pair, values);
    weekList.forEach((monday, index) =>
      rows.push({
        CALWEEK: isoWeek(monday).label,
        WEEK_START: fmtDate(monday),
        MATNR: sapMaterial(sku),
        MARKET: market,
        SHIP_BOX: values[index],
        SHIP_PACK: Math.round(values[index] / BOXES_PER_PACK),
      }),
    );
  }
  return { weekList, series, rows, shares };
}

/** Semi-annual S&OP plans, built the way they are in practice: last year's
 *  same months × a flat growth assumption, flat within each month. */
function buildSemiannualPlans(demand, planGrowth = 0.0) {
  const { weekList, series } = demand;
  const rows = [];
  const plan = new Map(); // `${label}|${pair}` -> boxes
  const monthOf = (ms) => new Date(ms + 3 * DAY).getUTCMonth(); // month of the week's Thursday
  const lastYear = new Map(); // `${year}|${month}|${pair}` -> mean weekly
  weekList.forEach((monday, index) => {
    const { year } = isoWeek(monday);
    for (const [pair, values] of series) {
      const key = `${year}|${monthOf(monday)}|${pair}`;
      const entry = lastYear.get(key) ?? { sum: 0, n: 0 };
      entry.sum += values[index];
      entry.n += 1;
      lastYear.set(key, entry);
    }
  });
  const lastMonday = weekList[weekList.length - 1];
  const lastYearNo = isoWeek(lastMonday).year;
  const versions = [];
  for (let year = lastYearNo - 1; year <= lastYearNo; year += 1) {
    versions.push({ vers: `${year}H1`, year, from: 1, to: 26, created: Date.UTC(year - 1, 11, 15) });
    versions.push({ vers: `${year}H2`, year, from: 27, to: 52, created: Date.UTC(year, 5, 15) });
  }
  for (const version of versions) {
    for (let week = version.from; week <= version.to; week += 1) {
      const jan4 = Date.UTC(version.year, 0, 4);
      const monday = mondayOf(jan4) + (week - 1) * WEEK;
      for (const pair of series.keys()) {
        const base = lastYear.get(`${version.year - 1}|${monthOf(monday)}|${pair}`);
        if (base === undefined) continue;
        const boxes = Math.round(((base.sum / base.n) * (1 + planGrowth)) / 10) * 10;
        const [sku, market] = pair.split('|');
        const label = isoWeek(monday).label;
        plan.set(`${label}|${pair}`, boxes);
        rows.push({
          PLAN_VERS: version.vers,
          CREATED_ON: fmtDate(version.created),
          CALWEEK: label,
          WEEK_START: fmtDate(monday),
          MATNR: sapMaterial(sku),
          MARKET: market,
          PLAN_BOX: boxes,
        });
      }
    }
  }
  return { rows, plan };
}

/* ── Forecast (JS reference implementation) ─────────────────────────────── */

/**
 * Seasonal index per ISO week-of-year: each week's ratio to its centred
 * 53-week moving average, averaged over the years available, smoothed over
 * k±1 and normalised to mean 1.
 */
export function seasonalIndex(values, weekNos) {
  const ratios = new Map();
  for (let index = 26; index < values.length - 26; index += 1) {
    let sum = 0;
    for (let j = index - 26; j <= index + 26; j += 1) sum += values[j];
    const cma = sum / 53;
    if (cma <= 0) continue;
    const k = Math.min(weekNos[index], 52);
    const entry = ratios.get(k) ?? [];
    entry.push(values[index] / cma);
    ratios.set(k, entry);
  }
  const raw = new Map();
  for (let k = 1; k <= 52; k += 1) {
    const pool = [];
    for (const n of [k - 1, k, k + 1]) {
      const kk = n < 1 ? 52 : n > 52 ? 1 : n;
      pool.push(...(ratios.get(kk) ?? []));
    }
    raw.set(k, pool.length === 0 ? 1 : pool.reduce((a, b) => a + b, 0) / pool.length);
  }
  const mean = [...raw.values()].reduce((a, b) => a + b, 0) / 52;
  return new Map([...raw].map(([k, v]) => [k, v / mean]));
}

/** Forecast from `origin` (inclusive index of the last known week) for `horizon` weeks. */
export function forecastFrom(values, weekNos, seasonal, origin, horizon) {
  const s = (index) => seasonal.get(Math.min(weekNos[index] ?? 52, 52)) ?? 1;
  let level = 0;
  for (let j = origin - 7; j <= origin; j += 1) level += values[j] / s(j);
  level /= 8;
  let recent = 0;
  let prior = 0;
  for (let j = origin - 12; j <= origin; j += 1) {
    recent += values[j] / s(j);
    prior += values[j - 52] / s(j - 52);
  }
  const growth = prior > 0 ? clamp(recent / prior - 1, -0.2, 0.4) : 0;
  const out = [];
  for (let h = 1; h <= horizon; h += 1) {
    const k = ((weekNos[origin] + h - 1) % 52) + 1;
    out.push(level * (seasonal.get(k) ?? 1) * (1 + growth) ** (h / 52));
  }
  return { level, growth, values: out };
}

/* ── Planning: hand-made weekly plans, as a production lead builds them ───── */

const PLANNING_OEE = 0.85; // what the lead assumes; the lines deliver ~0.72

function lineShare(sku) {
  const item = skuOf(sku);
  if (item.lines.length === 1) return { [item.lines[0]]: 1 };
  return { CAP_L1: 0.45, CAP_L2: 0.55 };
}

/**
 * Hand plan: largest volumes first, a big SKU split into two runs (early and
 * late in the week, "because of container dates"), families interleaved — the
 * natural result of planning by volume and due date, and the reason for the
 * changeovers and wet cleans the scheduler later removes.
 */
function handPlan(weekStart, requirement, holidays) {
  const perLine = { CAP_L1: [], CAP_L2: [] };
  for (const [sku, boxes] of Object.entries(requirement)) {
    for (const [line, share] of Object.entries(lineShare(sku))) {
      const qty = Math.round((boxes * share) / 10) * 10;
      if (qty <= 0) continue;
      if (qty > 28_000) {
        perLine[line].push({ sku, boxes: Math.round(qty * 0.55 / 10) * 10, half: 0 });
        perLine[line].push({ sku, boxes: Math.round(qty * 0.45 / 10) * 10, half: 1 });
      } else {
        perLine[line].push({ sku, boxes: qty, half: skuOf(sku).family === 'MILK' ? 0 : 1 });
      }
    }
  }
  const slots = [];
  for (const line of Object.keys(perLine)) {
    const ordered = [
      ...perLine[line].filter((run) => run.half === 0).sort((a, b) => b.boxes - a.boxes || a.sku.localeCompare(b.sku)),
      ...perLine[line].filter((run) => run.half === 1).sort((a, b) => b.boxes - a.boxes || a.sku.localeCompare(b.sku)),
    ];
    let cursor = weekStart;
    let previous = null;
    ordered.forEach((run, index) => {
      if (previous !== null && previous !== run.sku) {
        cursor += CHANGEOVER[familyOf(previous)][familyOf(run.sku)][0] * MINUTE;
      }
      const minutes = (run.boxes * CAPSULES_PER_BOX) / (rateFor(line, familyOf(run.sku)) * PLANNING_OEE);
      let end = cursor + minutes * MINUTE;
      for (const holiday of holidays) {
        if (holiday < end && holiday + DAY > cursor) end += DAY;
      }
      slots.push({ line, slotNo: index + 1, sku: run.sku, boxes: run.boxes, start: cursor, end });
      cursor = end;
      previous = run.sku;
    });
  }
  return slots;
}

/* ── Environment: weather, AHU wear, room humidity ──────────────────────── */

/** Dew point (°C) → RH at temperature (°C), Magnus formula. */
const rhFrom = (temp, dew) =>
  100 * Math.exp((17.625 * dew) / (243.04 + dew) - (17.625 * temp) / (243.04 + temp));

function buildWeather(rand, fromMs, toMs, endMs, nextWeekMonday) {
  const hourly = new Map(); // ms -> {temp, dp, rh, precip, forecast}
  const s6Day = endMs - STORIES.s6.daysAgo * DAY;
  for (let day = floorDay(fromMs); day < toMs; day += DAY) {
    const forecast = day > endMs;
    const storm = day === s6Day || (!forecast && rand.chance(0.33));
    const base = rand.normal(24, 0.45);
    const peak = day === s6Day ? 26.8 : rand.between(25.2, 26.4);
    for (let h = 0; h < 24; h += 1) {
      const ms = day + h * HOUR;
      let dp = base + rand.normal(0, 0.15);
      let precip = 0;
      if (storm && h >= 13 && h <= 19) {
        const shape = Math.sin(((h - 12.5) / 7.5) * Math.PI);
        dp = base + (peak - base) * Math.max(shape, 0.35);
        precip = h >= 14 && h <= 18 ? rand.between(3, 16) : rand.between(0, 2);
      }
      /* The forecast the planner sees for next week: heavy rain Tue 13:00 → Wed 20:00. */
      if (forecast && nextWeekMonday !== undefined) {
        const offset = (ms - nextWeekMonday) / HOUR;
        dp = 24.3 + rand.normal(0, 0.1);
        if (offset >= 24 + 13 && offset <= 48 + 20) {
          dp = offset <= 48 ? rand.between(26.6, 27.2) : rand.between(26.1, 26.8);
          precip = rand.between(4, 18);
        } else if (offset >= 24 + 11 && offset < 24 + 13) {
          dp = 25.2;
        }
      }
      const temp = 27 + 5 * Math.sin(((h - 9) / 24) * 2 * Math.PI) - (precip > 0 ? 2.5 : 0) + rand.normal(0, 0.3);
      const safeDp = forecast ? dp : Math.min(dp, temp - 0.3);
      const safeTemp = forecast ? Math.max(temp, dp + 1.2) : temp;
      hourly.set(ms, {
        temp: round(safeTemp, 1),
        dp: round(safeDp, 2),
        rh: round(Math.min(99, rhFrom(safeTemp, safeDp)), 1),
        precip: round(precip, 1),
        forecast,
      });
    }
  }
  return hourly;
}

/** AHU-02 desiccant-wheel wear (0 = healthy, 0.9 = tripping) at a moment. */
function ahu2Wear(ms, endMs) {
  const s6 = STORIES.s6;
  const eventDay = endMs - s6.daysAgo * DAY;
  const rampStart = eventDay - 4 * DAY;
  const trip = eventDay + s6.stopStart * MINUTE;
  const repaired = eventDay + s6.stopEnd * MINUTE;
  if (ms >= rampStart && ms < eventDay + 12 * HOUR) return 0.4 + (0.35 * (ms - rampStart)) / (4.5 * DAY);
  if (ms >= eventDay + 12 * HOUR && ms < trip) return 0.75 + (0.15 * (ms - eventDay - 12 * HOUR)) / (2 * HOUR);
  if (ms >= trip && ms < repaired) return 0.9;
  const wearFrom = endMs + DAY - s6.wearDays * DAY;
  if (ms >= wearFrom) return (s6.wearNow * (ms - wearFrom)) / (s6.wearDays * DAY);
  if (ms >= rampStart - 6 * DAY && ms < rampStart) return (0.4 * (ms - rampStart + 6 * DAY)) / (6 * DAY);
  return 0;
}

const roomRh = (zone, dpOut, wear, noise) =>
  (zone === 'FILL_Z1' ? 35.2 : 35.0) + 0.9 * (dpOut - 24) + 37.4 * Math.max(wear - 0.4, 0) + noise;

/* ── The generator ──────────────────────────────────────────────────────── */

export function generate({
  seed = DEMO.seed,
  endDate = yesterdayUtc(),
  days = DEMO.days,
  demandWeeks = DEMO.demandWeeks,
} = {}) {
  const rand = streams(seed);
  const endMs = floorDay(endDate.getTime());
  const windowStart = endMs - (days - 1) * DAY;
  const windowEnd = endMs + DAY;
  const inWindow = (ms) => ms >= windowStart && ms < windowEnd;
  const daysAgo = (ms) => Math.floor((endMs - floorDay(ms)) / DAY);
  const holidays = HOLIDAYS.map((d) => Date.parse(`${d}T00:00:00Z`));
  const isHoliday = (ms) => holidays.includes(floorDay(ms));

  const lastCompleteMonday = mondayOf(endMs + DAY) - WEEK;
  const nextWeekMonday = mondayOf(endMs) + WEEK;
  const currentWeekMonday = mondayOf(endMs);

  /* 1 ─ demand, plans, forecast reference ─────────────────────────────── */
  const demand = buildDemand(rand.demand, lastCompleteMonday, demandWeeks);
  const semiannual = buildSemiannualPlans(demand);
  const weekNos = demand.weekList.map((monday) => isoWeek(monday).week);
  const forecastRef = buildForecastReference(demand, weekNos, semiannual.plan);

  /* 2 ─ weather and environment ─────────────────────────────────────── */
  const forecastEnd = nextWeekMonday + 7 * DAY;
  const weather = buildWeather(rand.env, windowStart - 35 * DAY, forecastEnd, endMs, nextWeekMonday);
  const dpAt = (ms) => weather.get(Math.floor(ms / HOUR) * HOUR)?.dp ?? 24;
  const rhNoise = new Map();
  const zoneRh = (zone, ms) => {
    const slot = Math.floor(ms / (30 * MINUTE));
    const key = `${zone}|${slot}`;
    if (!rhNoise.has(key)) rhNoise.set(key, rand.env.normal(0, 0.35));
    const wear = zone === 'FILL_Z2' ? ahu2Wear(ms, endMs) : 0;
    return roomRh(zone, dpAt(ms), wear, rhNoise.get(key));
  };

  /* 3 ─ weekly hand plans and FG stock ─────────────────────────────────── */
  const firstMonday = mondayOf(windowStart);
  const weeksToRun = [];
  for (let monday = firstMonday; monday <= currentWeekMonday; monday += WEEK) weeksToRun.push(monday);

  const avgWeekly = new Map(SKUS.map((sku) => [sku.sku, 0]));
  const recentIdx = demand.weekList.length - 1;
  for (const [pair, values] of demand.series) {
    const sku = pair.split('|')[0];
    const index = demand.weekList.indexOf(firstMonday - WEEK);
    const at = index === -1 ? recentIdx - 17 : index;
    avgWeekly.set(sku, avgWeekly.get(sku) + values[at]);
  }
  const stock = new Map(SKUS.map((sku) => [sku.sku, (avgWeekly.get(sku.sku) / 6) * 12]));
  const shipmentsOn = (sku, dayMs) => {
    const dow = isoDow(dayMs);
    if (dow === 7) return 0;
    const index = demand.weekList.indexOf(mondayOf(dayMs));
    const weekly = index === -1 ? avgWeekly.get(sku) : [...demand.series].filter(([pair]) => pair.startsWith(`${sku}|`)).reduce((sum, [, v]) => sum + v[index], 0);
    return weekly / 6;
  };

  const plans = [];
  const tables = {
    ibp_shipment_history: demand.rows,
    ibp_demand_plan: semiannual.rows,
    sd_open_orders: [],
    pp_process_order: [],
    mm_fg_stock_daily: [],
    pm_work_order: [],
    mes_plan_header: [],
    mes_plan_slot: [],
    scada_counter_hourly: [],
    scada_stop_event: [],
    scada_checkweigher_shift: [],
    scada_material_balance_shift: [],
    mes_changeover_log: [],
    operator_shift_log: [],
    hist_tag_30m: [],
    hist_tag_dictionary: [],
    weather_hourly: [],
  };

  /* 4 ─ simulate the lines ─────────────────────────────────────────────── */
  const sim = simulateLines({
    rand,
    weeksToRun,
    endMs,
    windowStart,
    windowEnd,
    isHoliday,
    holidays,
    zoneRh,
    planFor: (monday) => {
      const label = isoWeek(monday).label;
      const requirement = {};
      for (const sku of SKUS) {
        let boxes = 0;
        for (const market of MARKETS) boxes += semiannual.plan.get(`${label}|${sku.sku}|${market.market}`) ?? 0;
        /* Planners do look at stock — they top up anything below ~10 days, half the gap per week. */
        const daily = avgWeekly.get(sku.sku) / 6;
        const gap = daily * 10 - stock.get(sku.sku);
        requirement[sku.sku] = Math.max(0, Math.round(boxes + 0.5 * gap));
      }
      const slots = handPlan(monday + 6 * HOUR, requirement, holidays);
      const planId = `PLAN-${isoWeek(monday).label}-MAN`;
      plans.push({ monday, planId, slots, requirement });
      return { planId, slots };
    },
    onDay: (dayMs, producedBoxes) => {
      for (const sku of SKUS) {
        const next = stock.get(sku.sku) + (producedBoxes.get(sku.sku) ?? 0) - shipmentsOn(sku.sku, dayMs);
        stock.set(sku.sku, Math.max(0, next));
        if (inWindow(dayMs)) {
          tables.mm_fg_stock_daily.push({
            BUDAT: fmtDate(dayMs),
            MATNR: sapMaterial(sku.sku),
            LGORT: 'FG01',
            STOCK_BOX: Math.round(stock.get(sku.sku)),
          });
        }
      }
    },
  });
  Object.assign(tables, {
    scada_counter_hourly: sim.counters,
    scada_stop_event: sim.stops,
    scada_checkweigher_shift: sim.checkweigher,
    scada_material_balance_shift: sim.material,
    mes_changeover_log: sim.changeovers,
    pp_process_order: sim.orders,
  });

  /* 5 ─ plans as the MES stores them ───────────────────────────────────── */
  for (const plan of plans) {
    if (plan.monday + 7 * DAY <= windowStart) continue;
    const created = plan.monday - 4 * DAY + 9 * HOUR; // Thursday before
    tables.mes_plan_header.push({
      PLAN_ID: plan.planId,
      PLAN_WEEK: isoWeek(plan.monday).iso,
      SOURCE: 'MANUAL',
      CREATED_BY: rand.misc.pick(['shift.lead01', 'shift.lead02']),
      CREATED_AT: fmtTs(created),
      APPROVED_BY: 'site.manager',
      APPROVED_AT: fmtTs(created + 2 * DAY + 7 * HOUR),
      EFFORT_HOURS: round(rand.misc.between(18, 26), 1),
    });
    for (const slot of plan.slots) {
      tables.mes_plan_slot.push({
        PLAN_ID: plan.planId,
        LINE: slot.line,
        SLOT_NO: slot.slotNo,
        START_TS: fmtTs(slot.start),
        END_TS: fmtTs(slot.end),
        MATNR: sapMaterial(slot.sku),
        PLAN_BOX: slot.boxes,
        NOTE: '',
      });
    }
  }

  /* 6 ─ operator shift log (the manual record) ─────────────────────────── */
  tables.operator_shift_log = buildOperatorLog(rand.log, sim, endMs);

  /* 7 ─ maintenance orders ─────────────────────────────────────────────── */
  tables.pm_work_order = buildWorkOrders(rand.misc, sim, weeksToRun, windowStart, windowEnd, endMs);

  /* 8 ─ historian tags, weather, live stream ───────────────────────────── */
  const signals = buildSignals(rand.env, { windowStart, windowEnd, endMs, zoneRh, dpAt, weather, forecastEnd });
  tables.hist_tag_30m = signals.rows;
  tables.hist_tag_dictionary = TAGS.map((tag) => ({
    TAG: tag.tag,
    ASSET: tag.asset,
    METRIC: tag.metric,
    UNIT: tag.unit,
    HI_ALARM: tag.alarm,
  }));
  tables.weather_hourly = signals.weatherRows;

  /* 9 ─ open orders for the next 8 weeks ───────────────────────────────── */
  tables.sd_open_orders = buildOpenOrders(rand.misc, forecastRef, lastCompleteMonday);

  /* 10 ─ master data ──────────────────────────────────────────────────── */
  const master = masterData();

  /* 11 ─ next week's scheduling input ─────────────────────────────────── */
  const risk = roomRiskReference(signals.series, weather, endMs, forecastEnd);
  const scheduleInput = buildScheduleInput({ forecastRef, stock, avgWeekly, nextWeekMonday, risk, sim });

  const summary = summarise({
    tables,
    master,
    sim,
    plans,
    forecastRef,
    signals,
    risk,
    stock,
    avgWeekly,
    endMs,
    windowStart,
    lastCompleteMonday,
    nextWeekMonday,
    scheduleInput,
  });

  return {
    tables: { ...master, ...tables },
    live: signals.live,
    scheduleInput,
    forecast: forecastRef.rows,
    summary,
  };
}

/* ── Line simulation ────────────────────────────────────────────────────── */

const PACKAGING = new Set(['TRANSFER', 'CARTON', 'BOX_CHECK', 'BUNDLE', 'PALLETIZE']);
const STATION_INDEX = new Map(STATIONS.map((item, index) => [item.station, index]));
const LINE_FACTOR = { CAP_L1: 2.7, CAP_L2: 3.0 };
const PERFORMANCE = { CAP_L1: [0.905, 0.94], CAP_L2: [0.875, 0.915] };
/** Baseline capsule reject rates at CAP_INSPECT, per code. */
const CAPSULE_REJECT = { R01: 0.0006, R03: 0.0012, R04: 0.0008, R05: 0.0008 };
const BOX_REJECT = { R06: 0.0005, R07: 0.0003, R08: 0.0008 };

function simulateLines({ rand, weeksToRun, endMs, windowStart, windowEnd, isHoliday, zoneRh, planFor, onDay }) {
  const r = rand.ops;
  const out = { counters: [], stops: [], checkweigher: [], material: [], changeovers: [], orders: [] };
  const inWindow = (ms) => ms >= windowStart && ms < windowEnd;
  const s1 = STORIES.s1;
  const s3 = STORIES.s3;
  const s4 = STORIES.s4;
  const s6 = STORIES.s6;
  const s3Fail = endMs - s3.failDaysAgo * DAY + s3.failMinute * MINUTE;
  const s3WearFrom = endMs - s3.wearFromDaysAgo * DAY;
  const s6Start = endMs - s6.daysAgo * DAY + s6.stopStart * MINUTE;
  const s6End = endMs - s6.daysAgo * DAY + s6.stopEnd * MINUTE;
  const s4From = endMs - s4.fromDaysAgo * DAY;
  const s1From = endMs - s1.daysAgo * DAY;

  /* Lane offsets are a property of the machine, fixed for the whole window. */
  const laneOffset = {};
  for (const line of LINES) laneOffset[line.line] = Array.from({ length: line.lanes }, () => rand.fill.normal(0, 0.03));

  const hourAgg = new Map(); // `${hour}|${line}`
  const shiftAgg = new Map(); // `${shiftDate}|${shift}|${line}|${sku}`
  const dailyBoxes = new Map(); // day -> Map(sku -> boxes)
  const lastSku = { CAP_L1: null, CAP_L2: null };
  let orderSeq = 10_004_100;
  let coSeq = 1;
  let evtSeq = 1;
  const processOrders = [];

  const shiftKeyOf = (ms) => {
    const hour = new Date(ms).getUTCHours();
    const shift = shiftOfHour(hour);
    const shiftDate = hour < 6 ? floorDay(ms) - DAY : floorDay(ms);
    return { shift, shiftDate };
  };

  const hourBucket = (ms, line) => {
    const hour = Math.floor(ms / HOUR) * HOUR;
    const key = `${hour}|${line}`;
    let bucket = hourAgg.get(key);
    if (!bucket) {
      bucket = { hour, line, run: 0, co: 0, planned: 0, lineStop: new Map(), microStop: new Map(), lineWideNoStation: 0, caps: 0, rejects: {}, boxRejects: {}, skuTicks: new Map(), speedTicks: 0 };
      hourAgg.set(key, bucket);
    }
    return bucket;
  };
  const shiftBucket = (ms, line, sku) => {
    const { shift, shiftDate } = shiftKeyOf(ms);
    const key = `${shiftDate}|${shift}|${line}|${sku}`;
    let bucket = shiftAgg.get(key);
    if (!bucket) {
      bucket = { shiftDate, shift, line, sku, caps: 0, rejects: 0, purge: 0, runTicks: 0, stopTicks: 0 };
      shiftAgg.set(key, bucket);
    }
    return bucket;
  };

  const recordStop = (line, station, code, start, end) => {
    if (!inWindow(start)) return;
    const row = {
      EVT_ID: `EV${String(evtSeq).padStart(7, '0')}`,
      LINE: line,
      STATION: station === null ? 'LINE' : workcenterCode(line, station),
      FAULT_CODE: code,
      TS_START: fmtTs(start),
      TS_END: fmtTs(end),
      DUR_S: Math.round((end - start) / 1000),
      ACK_BY: code.startsWith('F') ? `op.${line.toLowerCase()}.${pad(1 + Math.floor(r.u() * 12))}` : 'system',
    };
    evtSeq += 1;
    out.stops.push(row);
    /* PLCs occasionally resend an event; the pipeline's DROP_DUPLICATES removes it. */
    if (code.startsWith('F') && r.chance(0.005)) out.stops.push({ ...row });
  };

  for (const monday of weeksToRun) {
    const weekStart = monday + 6 * HOUR;
    const weekEnd = weekStart + 7 * DAY;
    const { slots } = planFor(monday);

    for (const line of LINES) {
      const lineCode = line.line;
      const queue = slots.filter((slot) => slot.line === lineCode).map((slot) => ({ ...slot, done: 0 }));
      let current = null;
      let stop = null; // {code, station, until, start, lineWide, forced}
      let co = null; // {until, start, from, to, purge, cleaning}
      let perfHour = -1;
      let perf = 0.9;
      let order = null;

      const startOrder = (slot, ms) => {
        order = { AUFNR: String(orderSeq), MATNR: sapMaterial(slot.sku), WERKS: 'VN01', ARBPL: lineCode, GAMNG: slot.boxes, WEMNG: 0, GSTRS: fmtTs(slot.start), GLTRS: fmtTs(slot.end), ISTART: fmtTs(ms), IEND: null, STATUS: 'REL', _start: ms };
        orderSeq += 1;
        processOrders.push(order);
      };
      const closeOrder = (ms) => {
        if (order === null) return;
        order.IEND = fmtTs(ms);
        order.STATUS = ms <= endMs + DAY ? 'TECO' : 'REL';
        order = null;
      };

      for (let ms = monday; ms < monday + 7 * DAY; ms += TICK_S * 1000) {
        const hour = new Date(ms).getUTCHours();
        const dow = isoDow(ms);
        const bucket = hourBucket(ms, lineCode);

        /* Calendar: Sunday CIP, Sunday off, holidays, before the week's start. */
        const sundayCip = dow === 7 && hour >= 6 && hour < 14;
        const off = ms < weekStart || ms >= weekEnd || (dow === 7 && !sundayCip) || isHoliday(ms);
        if (sundayCip || off) {
          bucket.planned += 1;
          if (sundayCip && hour === 6 && ms % HOUR === 0) {
            recordStop(lineCode, null, 'P020', ms, ms + 8 * HOUR);
            lastSku[lineCode] = 'CLEAN';
          }
          if (stop && !stop.forced) stop = null;
          continue;
        }

        /* Forced story events take precedence over anything running. */
        if (lineCode === 'CAP_L2' && ms === s6Start) {
          stop = { code: 'E001', station: null, start: ms, until: s6End, lineWide: true, forced: true };
          recordStop(lineCode, null, 'E001', ms, s6End);
        }
        if (lineCode === 'CAP_L2' && ms === s3Fail) {
          stop = { code: 'F310', station: 'LID_SEAL', start: ms, until: ms + s3.stopMinutes * MINUTE, lineWide: true, forced: true };
          recordStop(lineCode, 'LID_SEAL', 'F310', ms, stop.until);
        }

        if (stop && ms >= stop.until) stop = null;
        if (co && ms >= co.until) co = null;

        if (stop) {
          if (stop.lineWide) {
            if (stop.station === null) bucket.lineWideNoStation += 1;
            else bucket.lineStop.set(stop.station, (bucket.lineStop.get(stop.station) ?? 0) + 1);
            continue;
          }
        }
        if (co) {
          bucket.co += 1;
          continue;
        }

        /* Next slot, with its changeover. */
        if (current === null || current.done >= current.boxes * CAPSULES_PER_BOX) {
          if (current !== null) closeOrder(ms);
          current = queue.shift() ?? null;
          if (current === null) {
            bucket.planned += 1; // nothing planned: the line stands idle
            continue;
          }
          const previous = lastSku[lineCode];
          if (previous !== current.sku) {
            let minutes;
            let purge;
            let cleaning;
            let fromFamily;
            if (previous === null || previous === 'CLEAN') {
              [minutes, purge, cleaning] = [15, 3, 'DRY'];
              fromFamily = 'CLEAN';
            } else {
              [minutes, purge, cleaning] = CHANGEOVER[familyOf(previous)][familyOf(current.sku)];
              fromFamily = familyOf(previous);
            }
            const actualMinutes = minutes * r.between(0.85, 1.3);
            const kg = round(purge * r.between(0.85, 1.25), 1);
            const until = ms + Math.round(actualMinutes * TICKS_PER_MIN) * TICK_S * 1000;
            co = { until };
            if (ms >= windowStart && ms < windowEnd) {
              out.changeovers.push({
                CO_ID: `CO${String(coSeq).padStart(5, '0')}`,
                LINE: lineCode,
                TS_START: fmtTs(ms),
                TS_END: fmtTs(until),
                FROM_MATNR: previous === null || previous === 'CLEAN' ? null : sapMaterial(previous),
                TO_MATNR: sapMaterial(current.sku),
                CLEAN_TYPE: fromFamily === 'CLEAN' ? 'DRY' : cleaning,
                PURGE_KG: kg,
              });
              coSeq += 1;
              recordStop(lineCode, null, 'P010', ms, until);
            }
            shiftBucket(ms, lineCode, current.sku).purge += kg;
            lastSku[lineCode] = current.sku;
            startOrder(current, ms);
            bucket.co += 1;
            continue;
          }
          startOrder(current, ms);
        }

        /* Micro-stop in packaging: only that station stands, the buffer absorbs it. */
        if (stop && !stop.lineWide) {
          bucket.microStop.set(stop.station, (bucket.microStop.get(stop.station) ?? 0) + 1);
        }

        /* Faults. */
        if (!stop) {
          const daysBack = (endMs - floorDay(ms)) / DAY;
          const factor = LINE_FACTOR[lineCode];
          const rh = zoneRh(line.zone, ms);
          const milk = familyOf(current.sku) === 'MILK';
          let total = 0;
          const weights = [];
          for (const fault of FAULT_CODES) {
            if (fault.hazard === 0) continue;
            let hazard = fault.hazard * factor;
            if (fault.code === 'F207') hazard = milk && rh > 42 ? 0.004 : 0.00002;
            if (lineCode === 'CAP_L2' && fault.code === 'F205' && ms >= s4From) hazard *= 1 + 0.6 * clamp((ms - s4From) / (s4.fromDaysAgo * DAY));
            if (lineCode === 'CAP_L2' && fault.code === 'F402' && ms >= s3WearFrom && ms < s3Fail) hazard *= 4;
            void daysBack;
            weights.push([fault, hazard]);
            total += hazard;
          }
          if (r.u() < total / TICKS_PER_MIN) {
            let pickAt = r.u() * total;
            let chosen = weights[0][0];
            for (const [fault, hazard] of weights) {
              pickAt -= hazard;
              if (pickAt <= 0) {
                chosen = fault;
                break;
              }
            }
            const minutes = Math.max(0.3, r.lognormal(chosen.median, 0.6));
            const until = ms + Math.max(1, Math.round(minutes * TICKS_PER_MIN)) * TICK_S * 1000;
            const lineWide = !(chosen.station && PACKAGING.has(chosen.station) && minutes <= 3);
            stop = { code: chosen.code, station: chosen.station, start: ms, until, lineWide, forced: false };
            recordStop(lineCode, chosen.station, chosen.code, ms, until);
            if (lineWide) {
              if (chosen.station === null) bucket.lineWideNoStation += 1;
              else bucket.lineStop.set(chosen.station, (bucket.lineStop.get(chosen.station) ?? 0) + 1);
              continue;
            }
            bucket.microStop.set(chosen.station, (bucket.microStop.get(chosen.station) ?? 0) + 1);
          }
        }

        /* Running. */
        if (hour !== perfHour) {
          perfHour = hour;
          perf = r.between(...PERFORMANCE[lineCode]);
        }
        const caps = (rateFor(lineCode, familyOf(current.sku)) * perf) / TICKS_PER_MIN;
        current.done += caps;
        bucket.run += 1;
        bucket.caps += caps;
        bucket.skuTicks.set(current.sku, (bucket.skuTicks.get(current.sku) ?? 0) + 1);
        const sb = shiftBucket(ms, lineCode, current.sku);
        sb.caps += caps;
        sb.runTicks += 1;

        /* Rejects, with the seal-heater wear of S3 on L2. */
        let seal = CAPSULE_REJECT.R03;
        if (lineCode === 'CAP_L2' && ms >= s3WearFrom && ms < s3Fail) {
          seal += 0.013 * clamp((ms - s3WearFrom) / (s3Fail - s3WearFrom)) ** 1.4;
        }
        const rates = { ...CAPSULE_REJECT, R03: seal };
        for (const [code, rate] of Object.entries(rates)) bucket.rejects[code] = (bucket.rejects[code] ?? 0) + caps * rate;
        for (const [code, rate] of Object.entries(BOX_REJECT)) bucket.boxRejects[code] = (bucket.boxRejects[code] ?? 0) + (caps / CAPSULES_PER_BOX) * rate;

        if (order !== null) order.WEMNG = Math.floor(current.done / CAPSULES_PER_BOX);
        if (ms + TICK_S * 1000 >= weekEnd && current !== null) closeOrder(ms);
      }
      closeOrder(monday + 7 * DAY);
    }

    /* Hour buckets of this week → station rows and daily boxes, then close the days for stock. */
    for (const [key, bucket] of hourAgg) {
      if (bucket.hour >= monday + 7 * DAY) continue;
      hourAgg.delete(key);
      emitHour(bucket);
    }
    for (let day = monday; day < monday + 7 * DAY; day += DAY) {
      onDay(day, dailyBoxes.get(day) ?? new Map());
    }
  }

  function emitHour(bucket) {
    const { hour, line } = bucket;
    const dominant = [...bucket.skuTicks].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const rejectCaps = Object.values(bucket.rejects).reduce((a, b) => a + b, 0);
    const passed = Math.max(0, bucket.caps - rejectCaps);
    const boxesIn = passed / CAPSULES_PER_BOX;
    const boxRejects = Object.values(bucket.boxRejects).reduce((a, b) => a + b, 0);
    const goodBoxes = Math.max(0, boxesIn - boxRejects);
    if (dominant !== null) {
      const day = floorDay(hour);
      const map = dailyBoxes.get(day) ?? new Map();
      for (const [sku, ticks] of bucket.skuTicks) map.set(sku, (map.get(sku) ?? 0) + (goodBoxes * ticks) / bucket.run);
      dailyBoxes.set(day, map);
    }
    if (!inWindow(hour)) return;
    const lineStopTotal = [...bucket.lineStop.values()].reduce((a, b) => a + b, 0) + bucket.lineWideNoStation;
    const rated = dominant === null ? rateFor(line, 'RG') : rateFor(line, familyOf(dominant));
    for (const station of STATIONS) {
      const index = STATION_INDEX.get(station.station);
      let own = bucket.lineStop.get(station.station) ?? 0;
      let blocked = 0;
      let starved = 0;
      for (const [root, ticks] of bucket.lineStop) {
        const rootIndex = STATION_INDEX.get(root);
        if (rootIndex > index) blocked += ticks;
        else if (rootIndex < index) starved += ticks;
      }
      own += bucket.lineWideNoStation;
      const micro = bucket.microStop.get(station.station) ?? 0;
      let microStarved = 0;
      for (const [root, ticks] of bucket.microStop) if (STATION_INDEX.get(root) < index) microStarved += ticks;
      const run = Math.max(0, bucket.run - micro - microStarved);
      let good;
      let reject = 0;
      let unit = 'CAPSULE';
      let speedUnits;
      if (index < STATION_INDEX.get('CAP_INSPECT')) {
        good = bucket.caps;
        if (station.station === 'CUP_DENEST') reject = bucket.caps * 0.0009;
        speedUnits = bucket.caps;
      } else if (station.station === 'CAP_INSPECT') {
        good = passed;
        reject = rejectCaps;
        speedUnits = bucket.caps;
      } else if (station.station === 'TRANSFER') {
        good = passed;
        speedUnits = passed;
      } else if (station.station === 'CARTON') {
        good = boxesIn;
        unit = 'BOX';
        speedUnits = boxesIn;
      } else if (station.station === 'BOX_CHECK') {
        good = goodBoxes;
        reject = boxRejects;
        unit = 'BOX';
        speedUnits = boxesIn;
      } else {
        good = goodBoxes / BOXES_PER_PACK;
        unit = 'PACK';
        speedUnits = good;
      }
      out.counters.push({
        TS_HOUR: fmtTs(hour),
        LINE: line,
        STATION: workcenterCode(line, station.station),
        MATNR: dominant === null ? null : sapMaterial(dominant),
        UNIT: unit,
        RATED_CPM: rated,
        RUN_S: run * TICK_S,
        STOP_S: (own + micro) * TICK_S,
        STARVED_S: (starved + microStarved) * TICK_S,
        BLOCKED_S: blocked * TICK_S,
        CO_S: bucket.co * TICK_S,
        PLANNED_S: bucket.planned * TICK_S,
        GOOD_CNT: Math.round(good),
        REJECT_CNT: Math.round(reject),
        SPEED_AVG: run === 0 ? 0 : round(speedUnits / ((run * TICK_S) / 60), 1),
      });
      void lineStopTotal;
    }
    /* Reject detail feeds the checkweigher and material tables via the shift buckets. */
    for (const [sku, ticks] of bucket.skuTicks) {
      const sb = shiftBucket(hour + 30 * MINUTE, line, sku);
      sb.rejects += (rejectCaps * ticks) / bucket.run;
      sb.rejectCodes ??= {};
      for (const [code, value] of Object.entries(bucket.rejects)) sb.rejectCodes[code] = (sb.rejectCodes[code] ?? 0) + (value * ticks) / bucket.run;
    }
  }

  /* Shift buckets → checkweigher + material balance (with S1's overfill). */
  for (const bucket of shiftAgg.values()) {
    if (bucket.caps < 1) continue;
    const shiftStart = bucket.shiftDate + SHIFTS.find((s) => s.shift === bucket.shift).start * HOUR;
    if (!inWindow(shiftStart)) continue;
    const sku = skuOf(bucket.sku);
    const line = LINES.find((item) => item.line === bucket.line);
    const s1Active = bucket.line === s1.line && sku.auger === s1.auger && shiftStart >= s1From;
    const bias = s1Active ? s1.biasAfter : s1.biasBefore;
    const sd = sku.fill * 0.016;
    const lanes = line.lanes;
    let weighted = 0;
    let underTotal = 0;
    let overTotal = 0;
    for (let lane = 1; lane <= lanes; lane += 1) {
      const mean = sku.fill + bias + laneOffset[bucket.line][lane - 1] + rand.fill.normal(0, 0.015);
      const laneSd = sd * rand.fill.between(0.95, 1.08);
      const n = Math.round(bucket.caps / lanes);
      const under = n * normalTail((sku.fill - sku.tol - mean) / laneSd);
      const over = n * (1 - normalCdf((sku.fill + 2.2 * sku.tol - mean) / laneSd));
      weighted += mean * n;
      underTotal += under;
      overTotal += over;
      out.checkweigher.push({
        SHIFT_DATE: fmtDate(bucket.shiftDate),
        SHIFT: bucket.shift,
        LINE: bucket.line,
        LANE: lane,
        MATNR: sapMaterial(bucket.sku),
        N_SAMPLES: n,
        MEAN_G: round(mean, 3),
        SD_G: round(laneSd, 3),
        TARGET_G: sku.fill,
        UNDER_REJ: Math.round(under + (bucket.rejectCodes?.R01 ?? 0) / lanes),
        OVER_REJ: Math.round(over),
      });
    }
    const meanFill = weighted / Math.max(1, Math.round(bucket.caps / lanes) * lanes);
    const rejectCaps = bucket.rejects + underTotal + overTotal;
    const goodCaps = Math.max(0, bucket.caps - rejectCaps);
    const filledKg = (bucket.caps * meanFill) / 1000;
    const spill = filledKg * rand.fill.between(0.003, 0.006);
    const powderIn = (filledKg + bucket.purge + spill) * (1 + rand.fill.normal(0, 0.0015));
    bucket.meanFill = meanFill;
    bucket.goodCaps = goodCaps;
    bucket.rejectCaps = rejectCaps;
    bucket.spill = spill;
    bucket.powderIn = powderIn;
    out.material.push({
      SHIFT_DATE: fmtDate(bucket.shiftDate),
      SHIFT: bucket.shift,
      LINE: bucket.line,
      MATNR: sapMaterial(bucket.sku),
      POWDER_IN_KG: round(powderIn, 2),
      GOOD_CAPS: Math.round(goodCaps),
      REJECT_CAPS: Math.round(rejectCaps),
      MEAN_FILL_G: round(meanFill, 3),
      TARGET_G: sku.fill,
      PURGE_KG: round(bucket.purge, 1),
      CUPS_USED: Math.round(bucket.caps * 1.0009),
      LIDS_USED: Math.round(bucket.caps * 1.0004),
      CARTONS_USED: Math.round((goodCaps / CAPSULES_PER_BOX) * 1.0016),
    });
  }

  out.orders = processOrders
    .filter((order) => inWindow(order._start))
    .map(({ _start, ...order }) => order);
  out.shiftBuckets = [...shiftAgg.values()].filter((bucket) => bucket.powderIn !== undefined);
  return out;
}

function normalCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}
const normalTail = (z) => normalCdf(z);

/* ── Operator log ───────────────────────────────────────────────────────── */

const NOTES = {
  normal: ['Running steadily', 'Changed lid foil reel', 'Topped up cups at shift start', 'Cleaned area at shift end', 'Checkweigher check at shift start OK', 'Ran to plan'],
  changeover: ['Recipe change, powder purged', 'Wet clean after milk batch', 'Batch change, waiting for QA first-sample approval'],
  fault: ['Lid sealer jammed twice', 'Cup jam at the denester', 'Pallet robot safety stop, reset', 'Cartoner carton jam', 'Dosing auger blocked, cleaned'],
};

function buildOperatorLog(rand, sim, endMs) {
  const s2 = STORIES.s2;
  const rows = [];
  const byShift = new Map();
  for (const bucket of sim.shiftBuckets) {
    const key = `${bucket.shiftDate}|${bucket.shift}|${bucket.line}`;
    const entry = byShift.get(key) ?? { ...bucket, caps: 0, good: 0, rejectCaps: 0, purge: 0, spill: 0, rejectKg: 0 };
    entry.good += bucket.goodCaps;
    entry.rejectCaps += bucket.rejectCaps;
    entry.purge += bucket.purge;
    entry.spill += bucket.spill;
    entry.rejectKg += (bucket.rejectCaps * bucket.meanFill) / 1000;
    byShift.set(key, entry);
  }
  const stopMinutes = new Map();
  for (const stop of sim.stops) {
    if (!stop.FAULT_CODE.startsWith('F') && !['E001', 'M001', 'M002'].includes(stop.FAULT_CODE)) continue;
    const ms = Date.parse(`${stop.TS_START.replace(' ', 'T')}Z`);
    const hour = new Date(ms).getUTCHours();
    const shiftDate = hour < 6 ? floorDay(ms) - DAY : floorDay(ms);
    const key = `${shiftDate}|${shiftOfHour(hour)}|${stop.LINE}`;
    stopMinutes.set(key, (stopMinutes.get(key) ?? 0) + stop.DUR_S / 60);
  }
  const s3FailDay = endMs - STORIES.s3.failDaysAgo * DAY;
  const s6Day = endMs - STORIES.s6.daysAgo * DAY;
  for (const [key, entry] of [...byShift].sort()) {
    const blank = rand.chance(s2.blank[entry.shift]);
    const factor = rand.between(...s2.reportFactor);
    const machineLoss = entry.rejectKg + entry.purge + entry.spill;
    let note = rand.chance(0.45) ? '' : rand.pick(entry.purge > 0 ? NOTES.changeover : (stopMinutes.get(key) ?? 0) > 60 ? NOTES.fault : NOTES.normal);
    if (entry.line === 'CAP_L2' && entry.shiftDate === s3FailDay - DAY && entry.shift === 'SHIFT_3') note = 'Lid seal heater B failed, waiting for maintenance to replace';
    if (entry.line === 'CAP_L2' && entry.shiftDate === s3FailDay - 3 * DAY && entry.shift === 'SHIFT_2') note = 'Leak-test reject rate rising, reported to maintenance';
    if (entry.line === 'CAP_L2' && entry.shiftDate === s6Day && entry.shift === 'SHIFT_2') note = 'Room humidity high, powder caking, line stopped waiting for AHU-02 repair';
    rows.push({
      LOG_DATE: fmtVnDate(entry.shiftDate),
      SHIFT: entry.shift.replace('SHIFT_', 'Shift '),
      LINE: entry.line,
      EMPLOYEE_ID: `EMP${pad(1 + Math.floor(rand.u() * 40), 3)}`,
      GOOD_BOXES: Math.round(entry.good / CAPSULES_PER_BOX / 10) * 10,
      COFFEE_LOSS_KG: blank ? null : round(machineLoss * factor, 1),
      REJECT_CAPSULES: blank || rand.chance(0.3) ? null : Math.round(entry.rejectCaps * rand.between(0.8, 1)),
      STOP_MIN: blank ? null : Math.round((stopMinutes.get(key) ?? 0) * rand.between(0.6, 0.9)),
      NOTE: note,
    });
  }
  return rows;
}

/* ── Maintenance orders ─────────────────────────────────────────────────── */

const STATION_ASSET = {
  DOSE_TAMP: 'DOSING_AUGER_', LID_SEAL: 'SEAL_HEATER_', CAP_INSPECT: 'CHECKWEIGHER_', CARTON: 'CARTONER_', PALLETIZE: 'ROBOT_PAL_',
};

function buildWorkOrders(rand, sim, weeksToRun, windowStart, windowEnd, endMs) {
  const rows = [];
  let seq = 40_012_000;
  const add = (row) => {
    rows.push({ AUFNR: String(seq), ...row });
    seq += 1;
  };
  for (const monday of weeksToRun) {
    const sunday = monday + 6 * DAY;
    if (sunday < windowStart || sunday >= windowEnd) continue;
    for (const line of LINES) {
      add({ AUART: 'PM02', EQUNR: line.line, KTEXT: `Weekly planned maintenance ${line.line} (during the Sunday CIP shift)`, ERDAT: fmtDate(sunday - 3 * DAY), GSTRP: fmtTs(sunday + 10 * HOUR), GETRI: fmtTs(sunday + 14 * HOUR), DOWNTIME_MIN: 0, COST_VND: Math.round(rand.between(3, 6) * 1e6) });
    }
    if (isoWeek(monday).week % 4 === 0) {
      for (const ahu of ['AHU_01', 'AHU_02']) {
        add({ AUART: 'PM03', EQUNR: ahu, KTEXT: `Periodic check ${ahu}: desiccant wheel, filters, dew point`, ERDAT: fmtDate(sunday - 5 * DAY), GSTRP: fmtTs(sunday + 7 * HOUR), GETRI: fmtTs(sunday + 9 * HOUR), DOWNTIME_MIN: 0, COST_VND: Math.round(rand.between(1.5, 3) * 1e6) });
      }
    }
  }
  for (const stop of sim.stops) {
    if (!['F205', 'F310'].includes(stop.FAULT_CODE) || stop.DUR_S < 40 * 60) continue;
    const station = stop.STATION.slice(3);
    const lineNo = stop.LINE.slice(-1);
    let asset = `${STATION_ASSET[station]}L${lineNo}`;
    if (asset === 'SEAL_HEATER_L2') asset = 'SEAL_HEATER_L2_A';
    const s3 = stop.LINE === 'CAP_L2' && stop.DUR_S === STORIES.s3.stopMinutes * 60;
    if (s3) asset = 'SEAL_HEATER_L2_B';
    add({
      AUART: 'PM01',
      EQUNR: asset,
      KTEXT: s3 ? 'Replace lid seal heater B – current fluctuating, leaks rising' : stop.FAULT_CODE === 'F205' ? 'Strip and clean dosing auger, inspect gearbox' : 'Check lid seal temperature controller',
      ERDAT: stop.TS_START.slice(0, 10),
      GSTRP: stop.TS_START,
      GETRI: stop.TS_END,
      DOWNTIME_MIN: Math.round(stop.DUR_S / 60),
      COST_VND: Math.round((s3 ? 18.5 : rand.between(1.5, 7)) * 1e6),
    });
  }
  const s6 = STORIES.s6;
  const eventDay = endMs - s6.daysAgo * DAY;
  add({ AUART: 'PM01', EQUNR: 'AHU_02', KTEXT: 'Repair AHU-02 desiccant wheel motor – L2 filling room humidity above 50%', ERDAT: fmtDate(eventDay), GSTRP: fmtTs(eventDay + s6.stopStart * MINUTE + 20 * MINUTE), GETRI: fmtTs(eventDay + s6.stopEnd * MINUTE), DOWNTIME_MIN: s6.stopEnd - s6.stopStart, COST_VND: 42_000_000 });
  return rows.sort((a, b) => a.GSTRP.localeCompare(b.GSTRP));
}

/* ── Historian signals, weather, live stream ────────────────────────────── */

function assetWear(asset, ms, endMs) {
  const s3 = STORIES.s3;
  const s4 = STORIES.s4;
  if (asset === 'DOSING_AUGER_L2') {
    const from = endMs - s4.fromDaysAgo * DAY;
    return ms < from ? 0 : (ms - from) / (s4.fromDaysAgo * DAY);
  }
  if (asset === 'SEAL_HEATER_L2_B') {
    const from = endMs - s3.wearFromDaysAgo * DAY;
    const fail = endMs - s3.failDaysAgo * DAY + s3.failMinute * MINUTE;
    if (ms < from || ms >= fail) return 0;
    return (ms - from) / (fail - from);
  }
  return 0;
}

function signalValue(tag, ms, ctx, noise) {
  const { endMs, zoneRh, dpAt } = ctx;
  const dp = dpAt(ms);
  const wear2 = ahu2Wear(ms, endMs);
  switch (tag.tag) {
    case 'FILL_Z1.RH': return zoneRh('FILL_Z1', ms);
    case 'FILL_Z2.RH': return zoneRh('FILL_Z2', ms);
    case 'FILL_Z1.TEMP': return 20 + noise(0.25);
    case 'FILL_Z2.TEMP': return 20.1 + 0.6 * Math.max(wear2 - 0.6, 0) + noise(0.25);
    case 'PACK.TEMP': return 24 + 0.2 * (dp - 24) + noise(0.3);
    case 'PACK.RH': return 55 + 1.5 * (dp - 24) + noise(1);
    case 'AHU01.WHEEL_A': return 2.4 + noise(0.05);
    case 'AHU02.WHEEL_A': return 2.4 * (1 + 0.22 * wear2) + noise(0.05);
    case 'AHU01.SUP_DP': return 5 + 0.3 * (dp - 24) + noise(0.2);
    case 'AHU02.SUP_DP': return 5 + 0.3 * (dp - 24) + 9 * Math.max(wear2 - 0.4, 0) + noise(0.2);
    case 'AHU02.COMP_A': return 38 + 0.67 * (dp - 24) + 6 * wear2 + noise(0.6);
    case 'DOSE_AUGER_L2.CUR_A': return 4.2 * (1 + STORIES.s4.curRise * assetWear('DOSING_AUGER_L2', ms, endMs)) + noise(0.05);
    case 'DOSE_AUGER_L2.VIB_MMS': return 2.1 + (STORIES.s4.vibEnd - 2.1) * assetWear('DOSING_AUGER_L2', ms, endMs) + noise(0.1);
    case 'SEAL_HTR_L2B.CUR_SD': {
      const w = assetWear('SEAL_HEATER_L2_B', ms, endMs);
      return w === 0 ? 0.05 + noise(0.006) : 0.085 + 0.055 * w + noise(0.006);
    }
    case 'SEAL_HTR_L2B.CUR_A': {
      const w = assetWear('SEAL_HEATER_L2_B', ms, endMs);
      return 6.8 - 0.25 * w + noise(0.05 + 0.1 * w);
    }
    default: {
      const metric = ASSETS.flatMap((a) => a.metrics).find((m) => m.tag === tag.tag);
      return metric.normal + noise(metric.noise);
    }
  }
}

function buildSignals(rand, ctx) {
  const { windowStart, windowEnd, endMs, weather, forecastEnd } = ctx;
  const rows = [];
  const series = new Map(TAGS.map((tag) => [tag.tag, []]));
  const noise = (sd) => rand.normal(0, sd);
  const decimals = (tag) => (tag.unit === 'A' && tag.metric === 'current_stability' ? 4 : 3);
  /* History starts 30 days before the window so the first health baselines are full. */
  for (let ms = windowStart - 30 * DAY; ms < windowEnd; ms += 30 * MINUTE) {
    for (const tag of TAGS) {
      const value = round(signalValue(tag, ms, ctx, noise), decimals(tag));
      series.get(tag.tag).push([ms, value]);
      if (ms >= windowStart) rows.push({ TS: fmtTs(ms), TAG: tag.tag, VALUE: value, QUALITY: 'GOOD', SOURCE: 'HISTORIAN' });
    }
  }
  const weatherRows = [];
  for (const [ms, w] of [...weather].sort((a, b) => a[0] - b[0])) {
    if (ms < windowStart || ms >= forecastEnd) continue;
    const source = w.forecast ? 'WEATHER_FCST' : 'WEATHER_OBS';
    const issued = w.forecast ? fmtTs(endMs + 18 * HOUR) : null;
    for (const [param, value] of [['WX.TEMP', w.temp], ['WX.RH', w.rh], ['WX.DP', w.dp], ['WX.PRECIP', w.precip]]) {
      weatherRows.push({ TS: fmtTs(ms), TAG: param, VALUE: value, QUALITY: 'GOOD', SOURCE: source, ISSUED_AT: issued });
    }
  }
  /* The next 48 hours, for the MQTT replay publisher, at a 30 s cadence. */
  const live = [];
  const liveTags = ['DOSE_AUGER_L2.CUR_A', 'DOSE_AUGER_L2.VIB_MMS', 'SEAL_HTR_L2A.CUR_A', 'SEAL_HTR_L2B.CUR_A', 'AHU02.WHEEL_A', 'FILL_Z2.RH', 'FILL_Z2.TEMP'];
  for (let ms = windowEnd; ms < windowEnd + 2 * DAY; ms += 30_000) {
    for (const name of liveTags) {
      const tag = TAGS.find((item) => item.tag === name);
      live.push({ ts: fmtTs(ms), tag: name, asset: tag.asset, metric: tag.metric, unit: tag.unit, value: round(signalValue(tag, ms, ctx, noise), 3) });
    }
  }
  return { rows, series, weatherRows, live };
}

/* ── Predictive references (the SQL must reproduce these) ───────────────── */

/** Health of one asset at `ms` from its 30-min series, per HEALTH in the reference. */
export function healthAt(seriesByTag, asset, ms) {
  const metrics = ASSETS.find((item) => item.asset === asset).metrics.filter((m) => m.alarm !== null);
  let worst = { health: 100, rul: null };
  for (const metric of metrics) {
    const points = seriesByTag.get(metric.tag);
    const base = points.filter(([t]) => t >= ms - HEALTH.baselineFromDays * DAY && t < ms - HEALTH.baselineToDays * DAY).map(([, v]) => v);
    const recent = points.filter(([t]) => t > ms - HEALTH.recentHours * HOUR && t <= ms).map(([, v]) => v);
    const slopePts = points.filter(([t]) => t > ms - HEALTH.slopeHours * HOUR && t <= ms);
    if (base.length < 10 || recent.length === 0) continue;
    const mu = base.reduce((a, b) => a + b, 0) / base.length;
    const sigma = Math.sqrt(base.reduce((a, b) => a + (b - mu) ** 2, 0) / (base.length - 1));
    const x = recent.reduce((a, b) => a + b, 0) / recent.length;
    const z = (x - mu) / sigma;
    const ratio = clamp((x - mu) / (metric.alarm - mu));
    const health = 100 - HEALTH.zWeight * clamp(z / HEALTH.zScale) - HEALTH.ratioWeight * ratio;
    const n = slopePts.length;
    const tx = slopePts.map(([t]) => t / DAY);
    const mx = tx.reduce((a, b) => a + b, 0) / n;
    const my = slopePts.reduce((a, [, v]) => a + v, 0) / n;
    let num = 0;
    let den = 0;
    slopePts.forEach(([, v], i) => {
      num += (tx[i] - mx) * (v - my);
      den += (tx[i] - mx) ** 2;
    });
    const slope = num / den;
    const rul = slope > 0 && x < metric.alarm ? Math.min(HEALTH.rulCapDays, (metric.alarm - x) / slope) : null;
    if (health < worst.health) worst = { health, rul, metric: metric.tag, x, mu, z, slope };
  }
  return { ...worst, health: round(worst.health, 1), band: healthBand(worst.health) };
}

/** Hourly humidity-stop risk per zone: observed history plus the forecast horizon. */
function roomRiskReference(series, weather, endMs, forecastEnd) {
  const out = [];
  const avg = (points, from, to) => {
    const values = points.filter(([t]) => t >= from && t < to).map(([, v]) => v);
    return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
  };
  const lastObs = endMs + DAY - 30 * MINUTE;
  for (const room of ROOMS.filter((item) => item.line !== null)) {
    const wheel = series.get(`${room.ahu === 'AHU_01' ? 'AHU01' : 'AHU02'}.WHEEL_A`);
    const rh = series.get(`${room.room}.RH`);
    for (let ms = endMs - 60 * DAY; ms < forecastEnd; ms += HOUR) {
      const future = ms > lastObs;
      const seenAt = future ? lastObs : ms - 24 * HOUR;
      const mu = avg(wheel, seenAt - 28 * DAY, seenAt - 2 * DAY);
      const wheel24 = avg(wheel, seenAt - 24 * HOUR, seenAt + 1);
      const rhNow = avg(rh, seenAt - 2 * HOUR, seenAt + 1);
      const dp = weather.get(ms)?.dp;
      if (mu === null || wheel24 === null || rhNow === null || dp === undefined) continue;
      const dpTerm = clamp((dp - RISK.dpBase) / RISK.dpSpan);
      const ahuTerm = clamp((wheel24 - mu) / mu / RISK.ahuSpan);
      const rhTerm = clamp((rhNow - RISK.rhBase) / RISK.rhSpan);
      const risk = RISK.weights.dp * dpTerm + RISK.weights.ahu * ahuTerm + RISK.weights.rh * rhTerm;
      out.push({ room: room.room, line: room.line, ms, future, risk: round(risk, 3), level: riskLevel(risk), dp, ahu: round((wheel24 - mu) / mu, 3), rh: round(rhNow, 1) });
    }
  }
  return out;
}

function buildForecastReference(demand, weekNos, semiannualPlan) {
  const rows = [];
  const origin = demand.weekList.length - 1;
  const perPair = new Map();
  const backtest = { lead4: { abs: 0, act: 0 }, lead13: { abs: 0, act: 0 }, plan: { abs: 0, act: 0 } };
  for (const [pair, values] of demand.series) {
    const seasonal = seasonalIndex(values, weekNos);
    const future = forecastFrom(values, weekNos, seasonal, origin, DEMO.forecastHorizon);
    const residuals = [];
    for (let t = origin - 25; t <= origin; t += 1) {
      for (const lead of [4, 13]) {
        const f = forecastFrom(values, weekNos, seasonal, t - lead, lead).values[lead - 1];
        const bucket = backtest[`lead${lead}`];
        bucket.abs += Math.abs(values[t] - f);
        bucket.act += values[t];
        if (lead === 4) residuals.push(values[t] / f - 1);
      }
    }
    const mean = residuals.reduce((a, b) => a + b, 0) / residuals.length;
    const cv = Math.sqrt(residuals.reduce((a, b) => a + (b - mean) ** 2, 0) / (residuals.length - 1));
    perPair.set(pair, { seasonal, future, cv });
    const [sku, market] = pair.split('|');
    future.values.forEach((p50, index) => {
      const monday = demand.weekList[origin] + (index + 1) * WEEK;
      rows.push({ sku, market, iso_week: isoWeek(monday).label, lead: index + 1, p10: Math.round(p50 * (1 - 1.2816 * cv)), p50: Math.round(p50), p90: Math.round(p50 * (1 + 1.2816 * cv)) });
    });
  }
  /* The semi-annual plan over the current half-to-date. */
  const lastLabel = isoWeek(demand.weekList[origin]);
  const halfStart = lastLabel.week >= 27 ? 27 : 1;
  const uplift = { act: 0, plan: 0 };
  for (const [pair, values] of demand.series) {
    demand.weekList.forEach((monday, index) => {
      const iw = isoWeek(monday);
      if (iw.year !== lastLabel.year || iw.week < halfStart) return;
      const planned = semiannualPlan.get(`${iw.label}|${pair}`);
      if (planned === undefined) return;
      backtest.plan.abs += Math.abs(values[index] - planned);
      backtest.plan.act += values[index];
      const [sku, market] = pair.split('|');
      if (STORIES.s5.markets.includes(market) && STORIES.s5.skus.includes(sku) && origin - index <= STORIES.s5.weeksAgo) {
        uplift.act += values[index];
        uplift.plan += planned;
      }
    });
  }
  return {
    rows,
    perPair,
    wape: {
      rollingLead4: round(backtest.lead4.abs / backtest.lead4.act, 4),
      rollingLead13: round(backtest.lead13.abs / backtest.lead13.act, 4),
      semiannualPlan: round(backtest.plan.abs / backtest.plan.act, 4),
    },
    upliftVsPlan: round(uplift.act / uplift.plan - 1, 4),
    halfLabel: `${lastLabel.year}H${halfStart === 1 ? 1 : 2}`,
  };
}

function buildOpenOrders(rand, forecastRef, lastCompleteMonday) {
  const coverage = [0.9, 0.75, 0.6, 0.45, 0.3, 0.2, 0.1, 0.05];
  const rows = [];
  let seq = 80_021_400;
  for (const row of forecastRef.rows) {
    if (row.lead > 8) continue;
    const qty = row.p50 * coverage[row.lead - 1] * rand.between(0.85, 1.1);
    if (qty < 50) continue;
    const lines = qty > 3_000 ? 2 : 1;
    for (let posnr = 1; posnr <= lines; posnr += 1) {
      rows.push({ VBELN: String(seq), POSNR: posnr * 10, MATNR: sapMaterial(row.sku), MARKET: row.market, REQ_WEEK: row.iso_week, ORDER_BOX: Math.round(qty / lines / 10) * 10, STATUS: row.lead <= 2 ? 'CONFIRMED' : 'OPEN' });
    }
    seq += 1;
  }
  void lastCompleteMonday;
  return rows;
}

/* ── Next week's scheduling input (for scheduler/scheduler.py) ─────────── */

function buildScheduleInput({ forecastRef, stock, avgWeekly, nextWeekMonday, risk, sim }) {
  const label = isoWeek(nextWeekMonday).label;
  const requirement = new Map(SKUS.map((sku) => [sku.sku, 0]));
  for (const row of forecastRef.rows) if (row.iso_week === label) requirement.set(row.sku, requirement.get(row.sku) + row.p50);
  /* Forecast P50 plus a top-up towards 10 days of cover, scaled so the week stays feasible
     (~318k boxes is what both lines deliver after the Monday maintenance window). */
  const base = [...requirement.values()].reduce((a, b) => a + b, 0);
  const topUps = new Map(
    SKUS.map((sku) => {
      const daily = requirement.get(sku.sku) / 6;
      return [sku.sku, Math.max(0, 0.5 * (daily * 10 - (stock.get(sku.sku) ?? 0)))];
    }),
  );
  const topUpTotal = [...topUps.values()].reduce((a, b) => a + b, 0);
  const scale = topUpTotal === 0 ? 0 : clamp((318_000 - base) / topUpTotal, 0, 1);
  for (const sku of SKUS) {
    requirement.set(sku.sku, Math.round((requirement.get(sku.sku) + scale * topUps.get(sku.sku)) / 10) * 10);
  }
  const windows = [];
  for (const room of ['FILL_Z1', 'FILL_Z2']) {
    const hours = risk.filter((item) => item.future && item.room === room && item.level === 'HIGH' && item.ms >= nextWeekMonday && item.ms < nextWeekMonday + 7 * DAY);
    let open = null;
    for (const item of hours) {
      if (open && item.ms === open.end) open.end = item.ms + HOUR;
      else {
        if (open) windows.push(open);
        open = { line: item.line, start: item.ms, end: item.ms + HOUR };
      }
    }
    if (open) windows.push(open);
  }
  const lastFamily = {};
  for (const line of LINES) {
    const last = [...sim.changeovers].reverse().find((co) => co.LINE === line.line);
    lastFamily[line.line] = last ? familyOf(last.TO_MATNR.replace(/^0+/u, '')) : 'RG_MED';
  }
  const iso = (ms) => new Date(ms).toISOString().slice(0, 19);
  return {
    week_label: isoWeek(nextWeekMonday).iso,
    week_start: iso(nextWeekMonday + 6 * HOUR),
    horizon_minutes: 8640,
    capsules_per_box: CAPSULES_PER_BOX,
    skus: SKUS.map((sku) => ({ sku: sku.sku, short: sku.short, name: sku.ten, family: sku.family, lines: sku.lines })),
    requirements: SKUS.map((sku) => ({ sku: sku.sku, boxes: requirement.get(sku.sku) })),
    lines: LINES.map((line) => ({ line: line.line, rate_cpm: line.rate, oee: line.line === 'CAP_L1' ? 0.74 : 0.7 })),
    changeover: CHANGEOVER,
    blocked: [
      { line: 'CAP_L2', start: iso(nextWeekMonday + 6 * HOUR), end: iso(nextWeekMonday + 10 * HOUR), reason: 'Dosing auger DOSING_AUGER_L2 maintenance + AHU-02 desiccant wheel check' },
    ],
    risk_windows: windows.map((window) => ({ line: window.line, start: iso(window.start), end: iso(window.end), level: 'HIGH' })),
    initial_family: lastFamily,
    _avgWeekly: Object.fromEntries(avgWeekly),
  };
}

/* ── Master data tables ─────────────────────────────────────────────────── */

function masterData() {
  return {
    md_material: SKUS.map((sku) => ({
      MATNR: sapMaterial(sku.sku), SHORT_CODE: sku.short, PRODUCT_NAME: sku.ten, FAMILY: sku.family,
      CONTAINS_MILK: sku.family === 'MILK', CAPSULES_PER_BOX, TARGET_FILL_G: sku.fill, TOLERANCE_G: sku.tol,
      RH_MAX_PCT: sku.rhMax, ELIGIBLE_LINES: sku.lines.join(','), AUGER_PROFILE: sku.auger, DEMAND_SHARE: sku.share,
    })),
    md_family: FAMILIES.map((f) => ({ FAMILY: f.family, NAME: f.ten, CONTAINS_MILK: f.milk, SEQ: f.order })),
    md_material_cost: MATERIAL_COST.map((c) => ({ COST_CODE: c.cost_code, NAME: c.ten, UOM: c.don_vi, PRICE_VND: c.vnd })),
    md_line: LINES.map((line) => ({ LINE: line.line, NAME: line.ten, YEAR_COMMISSIONED: line.year, RATE_RG_CPM: line.rate.RG, RATE_MILK_CPM: line.rate.MILK, LANES: line.lanes, HAS_IOT: line.iot, OEE_TARGET: line.oeeTarget, ZONE: line.zone })),
    md_workcenter: WORKCENTERS.map((wc) => ({ WORKCENTER: wc.workcenter_code, LINE: wc.line_code, STATION: wc.station, NAME: wc.ten_cong_doan, SHORT_NAME: wc.ten_ngan, ROOM: wc.room_code, SEQ: wc.thu_tu })),
    md_asset: ASSETS.map((a) => ({ ASSET: a.asset, NAME: a.ten, KIND: a.kind, WORKCENTER: a.wc ?? null, SIGNALS: a.signals, PM_DAYS: a.pmDays, YEAR: a.year })),
    md_fault_code: FAULT_CODES.map((f) => ({ FAULT_CODE: f.code, NAME: f.ten, SHORT_NAME: f.ngan, CATEGORY: f.category, STATION: f.station })),
    md_reject_code: REJECT_CODES.map((c) => ({ REJECT_CODE: c.code, NAME: c.ten, STATION: c.station, UNIT: c.unit })),
    md_changeover_matrix: Object.entries(CHANGEOVER).flatMap(([from, targets]) => Object.entries(targets).map(([to, [minutes, kg, cleaning]]) => ({ FROM_FAMILY: from, TO_FAMILY: to, MINUTES: minutes, PURGE_KG: kg, CLEANING: cleaning }))),
    md_shift: SHIFTS.map((s) => ({ SHIFT: s.shift, NAME: s.ten, START_HOUR: s.start, END_HOUR: s.end })),
    md_market: MARKETS.map((m) => ({ MARKET: m.market, NAME: m.ten, IS_EXPORT: m.export })),
    md_room: ROOMS.map((r) => ({ ROOM: r.room, NAME: r.ten, LINE: r.line, AHU: r.ahu, TEMP_TARGET_C: r.tempTarget, RH_MAX_PCT: r.rhMax, RH_ALARM_PCT: r.rhAlarm, RH_STOP_PCT: r.rhStop })),
  };
}

/* ── Summary: the numbers the runbook quotes ────────────────────────────── */

function summarise(ctx) {
  const { tables, sim, plans, forecastRef, signals, risk, stock, avgWeekly, endMs, windowStart, nextWeekMonday } = ctx;
  const ms = (ts) => Date.parse(`${ts.replace(' ', 'T')}Z`);
  const s1From = endMs - STORIES.s1.daysAgo * DAY;

  /* S1 — overfill. */
  let excessKg = 0;
  let affectedIn = 0;
  let affectedTheo = 0;
  let beforeIn = 0;
  let beforeTheo = 0;
  for (const row of tables.scada_material_balance_shift) {
    const sku = skuOf(row.MATNR.replace(/^0+/u, ''));
    const day = Date.parse(`${row.SHIFT_DATE}T00:00:00Z`);
    const theo = (row.GOOD_CAPS * row.TARGET_G) / 1000;
    if (row.LINE === 'CAP_L1' && sku.auger === STORIES.s1.auger) {
      if (day >= s1From) {
        excessKg += (row.GOOD_CAPS * Math.max(row.MEAN_FILL_G - row.TARGET_G - STORIES.s1.biasBefore, 0)) / 1000;
        affectedIn += row.POWDER_IN_KG;
        affectedTheo += theo;
      } else if (day >= s1From - 60 * DAY) {
        beforeIn += row.POWDER_IN_KG;
        beforeTheo += theo;
      }
    }
  }
  const excessVnd = excessKg * 230_000;

  /* S2 — manual vs machine. */
  let manual = 0;
  let machineMatched = 0;
  let machineAll = 0;
  let blank = { SHIFT_1: [0, 0], SHIFT_2: [0, 0], SHIFT_3: [0, 0] };
  const machineByShift = new Map();
  for (const bucket of sim.shiftBuckets) {
    const d = new Date(bucket.shiftDate);
    const key = `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}|${bucket.shift}|${bucket.line}`;
    const giveaway = (bucket.goodCaps * Math.max(bucket.meanFill - skuOf(bucket.sku).fill, 0)) / 1000;
    const nonGiveaway = (bucket.rejectCaps * bucket.meanFill) / 1000 + bucket.purge + bucket.spill;
    const entry = machineByShift.get(key) ?? { nonGiveaway: 0, all: 0 };
    entry.nonGiveaway += nonGiveaway;
    entry.all += nonGiveaway + giveaway;
    machineByShift.set(key, entry);
  }
  let manualAllRatioNum = 0;
  let manualAllRatioDen = 0;
  for (const row of tables.operator_shift_log) {
    const shift = row.SHIFT.replace('Shift ', 'SHIFT_');
    blank[shift][1] += 1;
    const machine = machineByShift.get(`${row.LOG_DATE}|${shift}|${row.LINE}`);
    if (row.COFFEE_LOSS_KG === null) {
      blank[shift][0] += 1;
      if (machine) manualAllRatioDen += machine.all;
      continue;
    }
    if (!machine) continue;
    manual += row.COFFEE_LOSS_KG;
    machineMatched += machine.nonGiveaway;
    machineAll += machine.all;
    manualAllRatioNum += row.COFFEE_LOSS_KG;
    manualAllRatioDen += machine.all;
  }
  const totalLogs = tables.operator_shift_log.length;
  const blankTotal = Object.values(blank).reduce((a, [b]) => a + b, 0);

  /* S3 / S4 — health. */
  const failMs = endMs - STORIES.s3.failDaysAgo * DAY + STORIES.s3.failMinute * MINUTE;
  let firstBelow60 = null;
  for (let t = failMs - 10 * DAY; t < failMs; t += 30 * MINUTE) {
    if (healthAt(signals.series, 'SEAL_HEATER_L2_B', t).health < 60) {
      firstBelow60 = t;
      break;
    }
  }
  const afterRepair = healthAt(signals.series, 'SEAL_HEATER_L2_B', failMs + 7 * DAY);
  const now = endMs + DAY - 30 * MINUTE;
  const healthNow = Object.fromEntries(
    ASSETS.filter((a) => a.metrics.some((m) => m.alarm !== null)).map((a) => [a.asset, healthAt(signals.series, a.asset, now)]),
  );

  /* S5 — forecast, capacity, stock. */
  const cover = Object.fromEntries(SKUS.map((sku) => [sku.short, round(stock.get(sku.sku) / (avgWeekly.get(sku.sku) / 6), 1)]));
  const oee30 = oeeByLine(tables.scada_counter_hourly, endMs - 29 * DAY);
  const capacityBoxes = LINES.reduce((sum, line) => {
    const avgRate = SKUS.filter((s) => s.lines.includes(line.line)).reduce((a, s) => a + rateFor(line.line, s.family) * s.share, 0) / SKUS.filter((s) => s.lines.includes(line.line)).reduce((a, s) => a + s.share, 0);
    return sum + (8640 * avgRate * oee30[line.line].oee) / CAPSULES_PER_BOX;
  }, 0);
  const weeklyForecast = new Map();
  for (const row of forecastRef.rows) weeklyForecast.set(row.iso_week, (weeklyForecast.get(row.iso_week) ?? 0) + row.p50);
  const load = [...weeklyForecast].map(([week, boxes]) => ({ week, load: round(boxes / capacityBoxes, 3) }));

  /* S5b — hand plans. */
  const weekly = new Map();
  for (const co of tables.mes_changeover_log) {
    const week = isoWeek(ms(co.TS_START)).label;
    const entry = weekly.get(week) ?? { n: 0, kg: 0, wet: 0, minutes: 0 };
    entry.n += 1;
    entry.kg += co.PURGE_KG;
    entry.wet += co.CLEAN_TYPE === 'WET' ? 1 : 0;
    entry.minutes += (ms(co.TS_END) - ms(co.TS_START)) / MINUTE;
    weekly.set(week, entry);
  }
  const fullWeeks = [...weekly].filter(([week]) => plans.some((p) => isoWeek(p.monday).label === week && p.monday >= windowStart && p.monday + 7 * DAY <= endMs + DAY)).map(([, v]) => v);
  const avg = (items, key) => round(items.reduce((a, b) => a + b[key], 0) / Math.max(1, items.length), 1);

  /* S6 — humidity. */
  const s6Stop = tables.scada_stop_event.find((row) => row.FAULT_CODE === 'E001');
  const s6Ms = endMs - STORIES.s6.daysAgo * DAY + STORIES.s6.stopStart * MINUTE;
  const backtest = risk.find((item) => item.room === 'FILL_Z2' && item.ms === s6Ms);
  const peakRh = Math.max(...signals.series.get('FILL_Z2.RH').filter(([t]) => t >= s6Ms - 6 * HOUR && t <= s6Ms + 6 * HOUR).map(([, v]) => v));
  const forward = (room) => risk.filter((item) => item.future && item.room === room);
  const caoWindows = (room) => {
    const hours = forward(room).filter((item) => item.level === 'HIGH');
    if (hours.length === 0) return [];
    const windows = [];
    let open = null;
    for (const item of hours) {
      if (open && item.ms === open.end) open.end = item.ms + HOUR;
      else {
        if (open) windows.push(open);
        open = { start: item.ms, end: item.ms + HOUR };
      }
    }
    windows.push(open);
    return windows.map((w) => `${fmtTs(w.start)} → ${fmtTs(w.end)}`);
  };
  const rhStops = tables.scada_stop_event.filter((row) => row.FAULT_CODE === 'E001').length;

  const rowCounts = Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.length]));

  return {
    window: { from: fmtDate(windowStart), to: fmtDate(endMs), days: DEMO.days, nextWeek: isoWeek(nextWeekMonday).iso },
    baseline: {
      oee30,
      capsulesPerProductionDay: round(avgCapsPerDay(tables.scada_counter_hourly, endMs - 29 * DAY), 0),
    },
    s1: {
      excessOverfillKg: round(excessKg, 0),
      excessOverfillVnd: round(excessVnd, -6),
      annualisedVnd: round((excessVnd / STORIES.s1.daysAgo) * 300 * (7 / 6), -8),
      l1YieldAffectedBefore: round(beforeTheo / beforeIn, 4),
      l1YieldAffectedAfter: round(affectedTheo / affectedIn, 4),
    },
    s2: {
      manualVsMachineNonOverfill: round(manual / machineMatched, 3),
      manualVsMachineIncludingOverfill: round(manualAllRatioNum / manualAllRatioDen, 3),
      blankRate: round(blankTotal / totalLogs, 3),
      blankByShift: Object.fromEntries(Object.entries(blank).map(([k, [b, n]]) => [k, round(b / n, 3)])),
      machineAllKgWithLogs: round(machineAll, 0),
    },
    s3: {
      failure: fmtTs(failMs),
      firstHealthBelow60: firstBelow60 === null ? null : fmtTs(firstBelow60),
      daysOfWarning: firstBelow60 === null ? 0 : round((failMs - firstBelow60) / DAY, 1),
      healthSevenDaysAfterRepair: afterRepair.health,
    },
    s4: { now: healthNow.DOSING_AUGER_L2, healthNow: Object.fromEntries(Object.entries(healthNow).map(([k, v]) => [k, `${v.health} ${v.band}${v.rul ? ` RUL ${round(v.rul, 1)}d` : ''}`])) },
    s5: {
      wape: forecastRef.wape,
      half: forecastRef.halfLabel,
      upliftPhThCsdAmrVsPlan: forecastRef.upliftVsPlan,
      fgCoverDays: cover,
      weeklyCapacityBoxes: Math.round(capacityBoxes),
      overloadWeeks: load.filter((item) => item.load > 1).map((item) => `${item.week} ${Math.round(item.load * 100)}%`),
      load,
    },
    s5b: {
      handWeeks: fullWeeks.length,
      handChangeoversPerWeek: avg(fullWeeks, 'n'),
      handPurgeKgPerWeek: avg(fullWeeks, 'kg'),
      handWetCleansPerWeek: avg(fullWeeks, 'wet'),
      handChangeoverHoursPerWeek: round(avg(fullWeeks, 'minutes') / 60, 1),
    },
    s6: {
      stop: s6Stop ? `${s6Stop.TS_START} → ${s6Stop.TS_END} (${Math.round(s6Stop.DUR_S / 60)} min)` : null,
      stopMinutes: s6Stop ? Math.round(s6Stop.DUR_S / 60) : 0,
      peakRhZ2: round(peakRh, 1),
      backtestRiskAtStop: backtest ? `${backtest.risk} ${backtest.level}` : null,
      e001Stops: rhStops,
      caoZ2: caoWindows('FILL_Z2'),
      highRiskZ1: caoWindows('FILL_Z1'),
      maxRiskZ1: round(Math.max(...forward('FILL_Z1').map((item) => item.risk)), 3),
    },
    rowCounts,
    totalRows: Object.values(rowCounts).reduce((a, b) => a + b, 0),
  };
}

function oeeByLine(counters, fromMs) {
  const out = {};
  for (const line of LINES) {
    let run = 0;
    let avail = 0;
    let units = 0;
    let rated = 0;
    let good = 0;
    let reject = 0;
    for (const row of counters) {
      if (row.LINE !== line.line || !row.STATION.endsWith('CAP_INSPECT')) continue;
      if (Date.parse(`${row.TS_HOUR.replace(' ', 'T')}Z`) < fromMs) continue;
      run += row.RUN_S;
      avail += 3600 - row.PLANNED_S;
      good += row.GOOD_CNT;
      reject += row.REJECT_CNT;
      units += row.GOOD_CNT + row.REJECT_CNT;
      rated += (row.RATED_CPM * row.RUN_S) / 60;
    }
    const a = run / avail;
    const p = units / rated;
    const q = good / (good + reject);
    out[line.line] = { availability: round(a, 3), performance: round(p, 3), quality: round(q, 4), oee: round(a * p * q, 3) };
  }
  return out;
}

function avgCapsPerDay(counters, fromMs) {
  const byDay = new Map();
  for (const row of counters) {
    if (!row.STATION.endsWith('CAP_INSPECT')) continue;
    const ms = Date.parse(`${row.TS_HOUR.replace(' ', 'T')}Z`);
    if (ms < fromMs) continue;
    byDay.set(floorDay(ms), (byDay.get(floorDay(ms)) ?? 0) + row.GOOD_CNT);
  }
  const producing = [...byDay.values()].filter((v) => v > 100_000);
  return producing.reduce((a, b) => a + b, 0) / producing.length;
}

/* ── Assertions: a missing story is a dead demo ─────────────────────────── */

export function assertPlantedSignals(summary) {
  const problems = [];
  const expect = (condition, message) => {
    if (!condition) problems.push(message);
  };
  const { s1, s2, s3, s4, s5, s6, baseline } = summary;
  expect(baseline.oee30.CAP_L1.oee >= 0.7 && baseline.oee30.CAP_L1.oee <= 0.78, `L1 OEE ${baseline.oee30.CAP_L1.oee} outside 0.70–0.78`);
  expect(baseline.oee30.CAP_L2.oee >= 0.66 && baseline.oee30.CAP_L2.oee <= 0.74, `L2 OEE ${baseline.oee30.CAP_L2.oee} outside 0.66–0.74`);
  expect(s1.excessOverfillKg >= 900 && s1.excessOverfillKg <= 1_600, `S1 excess overfill ${s1.excessOverfillKg} kg outside 900–1600`);
  expect(s1.l1YieldAffectedAfter < s1.l1YieldAffectedBefore - 0.025, `S1 yield did not drop: ${s1.l1YieldAffectedBefore} → ${s1.l1YieldAffectedAfter}`);
  expect(s2.manualVsMachineNonOverfill >= 0.55 && s2.manualVsMachineNonOverfill <= 0.7, `S2 manual/machine ${s2.manualVsMachineNonOverfill} outside 0.55–0.70`);
  expect(s2.blankByShift.SHIFT_3 > s2.blankByShift.SHIFT_1 && s2.blankByShift.SHIFT_3 > s2.blankByShift.SHIFT_2, 'S2 Shift 3 is not the blankest shift');
  expect(s3.daysOfWarning >= 5, `S3 only ${s3.daysOfWarning} days of warning`);
  expect(s3.healthSevenDaysAfterRepair >= 75, `S3 health after repair ${s3.healthSevenDaysAfterRepair}`);
  expect(s4.now.band === 'Warning', `S4 auger band is ${s4.now.band} (${s4.now.health})`);
  expect(s4.now.rul !== null && s4.now.rul >= 5 && s4.now.rul <= 8.5, `S4 RUL ${s4.now.rul}`);
  for (const [asset, text] of Object.entries(s4.healthNow)) {
    if (['DOSING_AUGER_L2', 'AHU_02'].includes(asset)) continue;
    expect(/Normal|Watch/u.test(text), `S4 noise alarm on ${asset}: ${text}`);
  }
  expect(s5.wape.semiannualPlan >= 0.15, `S5 semi-annual WAPE ${s5.wape.semiannualPlan} < 0.15`);
  expect(s5.wape.rollingLead4 <= 0.11, `S5 rolling WAPE ${s5.wape.rollingLead4} > 0.11`);
  expect(s5.upliftPhThCsdAmrVsPlan >= 0.15, `S5 uplift vs plan ${s5.upliftPhThCsdAmrVsPlan}`);
  expect(s5.overloadWeeks.length >= 3 && s5.overloadWeeks.length <= 5, `S5 overload weeks ${s5.overloadWeeks.join(', ')}`);
  expect(s6.stopMinutes >= 300 && s6.stopMinutes <= 360, `S6 stop ${s6.stopMinutes} min`);
  expect(s6.backtestRiskAtStop?.endsWith('HIGH'), `S6 backtest risk ${s6.backtestRiskAtStop}`);
  expect(s6.caoZ2.length >= 1, 'S6 no forward HIGH risk window for zone L2');
  expect(s6.highRiskZ1.length === 0, `S6 zone L1 has HIGH risk windows ${s6.highRiskZ1.join(', ')}`);
  expect(s6.e001Stops === 1, `S6 ${s6.e001Stops} humidity stops, expected exactly 1`);
  if (problems.length > 0) {
    throw new Error(`Planted signals are not where the demo needs them:\n  - ${problems.join('\n  - ')}`);
  }
}

/* ── CSV + CLI ──────────────────────────────────────────────────────────── */

export function toCsv(rows) {
  if (rows.length === 0) return '';
  const columns = Object.keys(rows[0]);
  const escape = (value) => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [columns.join(','), ...rows.map((row) => columns.map((column) => escape(row[column])).join(','))].join('\n');
}

export function writeOutputs(result, out) {
  mkdirSync(out, { recursive: true });
  const sums = [];
  for (const [name, rows] of Object.entries(result.tables)) {
    const text = `${toCsv(rows)}\n`;
    writeFileSync(join(out, `${name}.csv`), text, 'utf8');
    sums.push(`${createHash('sha256').update(text).digest('hex')}  ${name}.csv`);
  }
  writeFileSync(join(out, 'sensor_live_48h.csv'), `${toCsv(result.live)}\n`, 'utf8');
  writeFileSync(join(out, 'schedule_input_next_week.json'), `${JSON.stringify(result.scheduleInput, null, 2)}\n`, 'utf8');
  writeFileSync(join(out, 'forecast_reference.csv'), `${toCsv(result.forecast)}\n`, 'utf8');
  writeFileSync(join(out, 'summary.json'), `${JSON.stringify(result.summary, null, 2)}\n`, 'utf8');
  writeFileSync(join(out, 'SHA256SUMS'), `${sums.join('\n')}\n`, 'utf8');
}

if (process.argv[1]?.endsWith('demo2-coffee-capsules/generate.mjs')) {
  const argument = (name, fallback) => {
    const index = process.argv.indexOf(`--${name}`);
    return index === -1 ? fallback : process.argv[index + 1];
  };
  const endDate = argument('end-date', undefined);
  const result = generate({
    seed: Number(argument('seed', DEMO.seed)),
    ...(endDate === undefined ? {} : { endDate: new Date(`${endDate}T00:00:00Z`) }),
  });
  console.log(JSON.stringify(result.summary, (key, value) => (key === 'load' ? undefined : value), 2));
  if (!process.argv.includes('--no-assert')) assertPlantedSignals(result.summary);
  if (!process.argv.includes('--summary')) {
    const out = argument('out', new URL('./out', import.meta.url).pathname);
    writeOutputs(result, out);
    console.log(`Wrote ${Object.keys(result.tables).length} tables to ${out}`);
  }
}
