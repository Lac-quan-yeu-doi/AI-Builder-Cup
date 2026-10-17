#!/usr/bin/env python3
"""Deterministic weekly production scheduler — Demo Data 2 (coffee capsules).

Campaign rules + the family changeover matrix, laid onto a one-week horizon with
PM (blocked) windows and humidity risk windows (no milk SKU inside a HIGH risk window).

Runs on Python 3.11 with the standard library only; matplotlib is imported lazily
for ``gantt.png`` and skipped when unavailable. No randomness: every ordering has
an explicit tie-break, so the same input always gives byte-identical output.

CLI:    python3 scheduler.py input.json --out OUTDIR [--no-png] [--report]
Import: from scheduler import schedule; result = schedule(input_dict)
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from datetime import datetime, timedelta
from itertools import permutations

VERSION = "demo2_scheduler 1.0"

FAMILY_ORDER = ["RG_LIGHT", "RG_MED", "RG_DARK", "MILK"]
MILK = "MILK"
CLEANING_LABEL = {
    "DRY": "Dry powder purge",
    "DRY_CLEAN": "Dry clean",
    "WET": "Wet clean (allergen – milk)",
}
DAY_ABBR = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]  # Monday .. Sunday

# Planning allowances (minutes) used only when assigning SKUs to lines.
ALLOW_PER_SKU = 30
ALLOW_MIXED_MILK_RG = 120
# Do not open a milk campaign if less than this many milk minutes fit before a HIGH risk window.
MIN_MILK_BLOCK = 120
MAX_REBALANCE_ROUNDS = 4


# ── small helpers ────────────────────────────────────────────────────────────


def _parse(ts: str) -> datetime:
    return datetime.fromisoformat(ts)


def _iso(dt: datetime) -> str:
    return dt.isoformat(timespec="seconds")


def _rate_key(family: str) -> str:
    return "MILK" if family == MILK else "RG"


def _merge(intervals):
    """Merge [(s, e, label)] into non-overlapping sorted intervals; labels joined."""
    out = []
    for s, e, label in sorted(intervals, key=lambda x: (x[0], x[1], x[2])):
        if e <= s:
            continue
        if out and s <= out[-1][1]:
            ps, pe, pl = out[-1]
            labels = pl if label in pl.split(" / ") else pl + " / " + label
            out[-1] = (ps, max(pe, e), labels)
        else:
            out.append((s, e, label))
    return out


def _overlap(a0, a1, b0, b1):
    return max(0, min(a1, b1) - max(a0, b0))


# ── core ─────────────────────────────────────────────────────────────────────


class _Ctx:
    """Normalised input."""

    def __init__(self, data: dict):
        self.week_label = data.get("week_label", "")
        self.t0 = _parse(data["week_start"])
        self.H = int(data.get("horizon_minutes", 8640))
        self.cpb = int(data.get("capsules_per_box", 16))
        self.skus = {s["sku"]: s for s in data["skus"]}
        self.co = data["changeover"]
        self.line_ids = [ln["line"] for ln in data["lines"]]
        self.lines = {ln["line"]: ln for ln in data["lines"]}
        self.initial_family = dict(data.get("initial_family") or {})
        self.initial_sku = dict(data.get("initial_sku") or {})

        req = {}
        for r in data["requirements"]:
            b = int(round(float(r["boxes"])))
            if b > 0:
                req[r["sku"]] = req.get(r["sku"], 0) + b
        self.req = req

        self.blocked = {ln: [] for ln in self.line_ids}
        for b in data.get("blocked") or []:
            if b["line"] in self.blocked:
                s, e = self._clip(b["start"], b["end"])
                if e > s:
                    self.blocked[b["line"]].append((s, e, b.get("reason", "Maintenance")))
        self.blocked = {ln: _merge(v) for ln, v in self.blocked.items()}

        self.cao = {ln: [] for ln in self.line_ids}
        self.risk_windows = []
        for w in data.get("risk_windows") or []:
            s, e = self._clip(w["start"], w["end"])
            self.risk_windows.append(dict(w, _s=s, _e=e))
            if w.get("level") == "HIGH" and w["line"] in self.cao and e > s:
                self.cao[w["line"]].append((s, e, "HIGH"))
        self.cao = {ln: [(s, e) for s, e, _ in _merge(v)] for ln, v in self.cao.items()}

    def _clip(self, start, end):
        s = (_parse(start) - self.t0).total_seconds() / 60.0
        e = (_parse(end) - self.t0).total_seconds() / 60.0
        return max(0, int(math.floor(s))), min(self.H, int(math.ceil(e)))

    def family(self, sku):
        return self.skus[sku]["family"]

    def eligible(self, sku):
        return [ln for ln in self.line_ids if ln in self.skus[sku].get("lines", [])]

    def rate(self, line, family):
        ln = self.lines[line]
        return float(ln["rate_cpm"][_rate_key(family)]) * float(ln["oee"])  # capsules/min

    def minutes_for(self, line, sku, boxes):
        return boxes * self.cpb / self.rate(line, self.family(sku))

    def available(self, line):
        return self.H - sum(e - s for s, e, _ in self.blocked[line])

    def cao_minutes(self, line):
        return sum(
            e - s - sum(_overlap(s, e, bs, be) for bs, be, _ in self.blocked[line])
            for s, e in self.cao[line]
        )

    def changeover(self, frm, to):
        m, kg, cleaning = self.co[frm][to]
        return int(m), float(kg), cleaning

    def at(self, minute):
        return self.t0 + timedelta(minutes=minute)


# ── b. assignment ────────────────────────────────────────────────────────────


def _assign(ctx: _Ctx):
    assign = {ln: {} for ln in ctx.line_ids}  # line -> sku -> boxes
    notes = []

    def load(line):
        return sum(ctx.minutes_for(line, s, b) for s, b in assign[line].items())

    def milk_load(line):
        return sum(ctx.minutes_for(line, s, b) for s, b in assign[line].items() if ctx.family(s) == MILK)

    def families(line):
        return {ctx.family(s) for s in assign[line]}

    def capacity(line, extra_sku=None):
        skus = set(assign[line]) | ({extra_sku} if extra_sku else set())
        fams = {ctx.family(s) for s in skus}
        allowance = ALLOW_PER_SKU * len(skus)
        if MILK in fams and fams - {MILK}:
            allowance += ALLOW_MIXED_MILK_RG
        return ctx.available(line) - allowance

    def spare(line, sku):
        """Minutes this line can still give to `sku` (milk also respects HIGH risk windows)."""
        sp = capacity(line, sku) - load(line)
        if ctx.family(sku) == MILK:
            sp = min(sp, capacity(line, sku) - ctx.cao_minutes(line) - milk_load(line))
        return max(0.0, sp)

    def fits(line, sku, boxes):
        return ctx.minutes_for(line, sku, boxes) <= spare(line, sku) + 1e-9

    def put(line, sku, boxes):
        if boxes > 0:
            assign[line][sku] = assign[line].get(sku, 0) + boxes

    order = sorted(ctx.req.items(), key=lambda kv: (-kv[1], kv[0]))
    unknown = [s for s, _ in order if s not in ctx.skus or not ctx.eligible(s)]
    single = [(s, b) for s, b in order if s not in unknown and len(ctx.eligible(s)) == 1]
    multi = [(s, b) for s, b in order if s not in unknown and len(ctx.eligible(s)) > 1]

    for sku, boxes in single:  # no choice: pin these first so loads are known
        put(ctx.eligible(sku)[0], sku, boxes)

    for sku, boxes in multi:  # largest first
        fam = ctx.family(sku)
        elig = ctx.eligible(sku)
        pref = sorted(
            elig,
            key=lambda ln: (0 if fam in families(ln) else 1, round(load(ln), 6), ctx.line_ids.index(ln)),
        )
        chosen = next((ln for ln in pref if fits(ln, sku, boxes)), None)
        if chosen:
            put(chosen, sku, boxes)
            continue
        # Split proportionally to spare minutes, converted to boxes at each line's rate.
        spares = [(ln, spare(ln, sku)) for ln in pref]
        cap_boxes = [(ln, int(sp * ctx.rate(ln, fam) / ctx.cpb)) for ln, sp in spares]
        total_cap = sum(c for _, c in cap_boxes)
        if total_cap <= 0:
            put(pref[0], sku, boxes)
            notes.append(f"{ctx.skus[sku]['short']}: not enough capacity to assign")
            continue
        parts, left = [], boxes
        take = min(boxes, total_cap)
        for i, (ln, c) in enumerate(cap_boxes):
            share = take - sum(p for _, p in parts) if i == len(cap_boxes) - 1 else int(take * c / total_cap)
            parts.append((ln, share))
            left -= share
        for ln, p in parts:
            put(ln, sku, p)
        if left > 0:  # overload: park the excess on the preferred line (becomes unmet)
            put(pref[0], sku, left)
        notes.append(
            f"{ctx.skus[sku]['short']}: split "
            + ", ".join(f"{ln} {p:,}" for ln, p in parts if p > 0)
            + " boxes by spare capacity"
        )

    unassigned = {s: b for s, b in order if s in unknown}
    return assign, notes, unassigned


# ── c. sequencing ────────────────────────────────────────────────────────────


def _sequence(ctx: _Ctx, line: str, skus_boxes: dict):
    """Return the family campaign order (list of families) and SKU items."""
    fams_present = sorted({ctx.family(s) for s in skus_boxes}, key=FAMILY_ORDER.index)
    rg = [f for f in fams_present if f != MILK]
    has_milk = MILK in fams_present
    init = ctx.initial_family.get(line)
    init_sku = ctx.initial_sku.get(line)

    def cost(order):
        total, prev = 0, init
        for i, f in enumerate(order):
            if prev is not None:
                same_start = i == 0 and prev == f and init_sku is not None
                if not same_start:
                    total += ctx.changeover(prev, f)[0]
            prev = f
        return total

    candidates = []
    for perm in permutations(rg):
        perm = list(perm)
        canonical = [FAMILY_ORDER.index(f) for f in perm]
        if has_milk:
            candidates.append((cost(perm + [MILK]), 0, canonical, perm + [MILK]))
            if init == MILK:
                candidates.append((cost([MILK] + perm), 1, canonical, [MILK] + perm))
        else:
            candidates.append((cost(perm), 0, canonical, perm))
    if not candidates:
        return []
    candidates.sort(key=lambda c: (c[0], c[1], c[2]))
    fam_order = candidates[0][3]

    items = []
    for f in fam_order:
        members = sorted((s for s in skus_boxes if ctx.family(s) == f), key=lambda s: (-skus_boxes[s], s))
        if init_sku in members and f == fam_order[0]:  # keep running the SKU already on the line
            members.remove(init_sku)
            members.insert(0, init_sku)
        for s in members:
            items.append({"sku": s, "family": f, "rem": int(skus_boxes[s]), "note": ""})
    return items


# ── d. laying onto time ──────────────────────────────────────────────────────


def _lay(ctx: _Ctx, line: str, items: list):
    H = ctx.H
    blocked = ctx.blocked[line]
    cao = ctx.cao[line]
    slots = []
    for s, e, reason in blocked:
        slots.append({"kind": "BLOCKED", "s": s, "e": e, "note": reason})

    def skip_blocked(t):
        moved = True
        while moved:
            moved = False
            for s, e, _ in blocked:
                if s <= t < e:
                    t, moved = e, True
        return t

    def next_block(t):
        return min([s for s, _, _ in blocked if s >= t] + [H])

    def in_cao(t):
        for s, e in cao:
            if s <= t < e:
                return (s, e)
        return None

    def next_cao(t):
        nxt = [(s, e) for s, e in cao if s >= t]
        return min(nxt) if nxt else None

    fam = ctx.initial_family.get(line)
    cur_sku = ctx.initial_sku.get(line)
    t = 0
    guard = 0
    while t < H and any(it["rem"] > 0 for it in items):
        guard += 1
        if guard > 10000:
            raise RuntimeError("scheduler did not converge")
        t = skip_blocked(t)
        if t >= H:
            break
        pending = [it for it in items if it["rem"] > 0]
        item = pending[0]

        if item["family"] == MILK and cao:
            # A milk run may not enter a HIGH risk window. Opening a milk campaign right before
            # one is pointless (changeover + a sliver of milk + a wet clean), so treat
            # "window starts within changeover + MIN_MILK_BLOCK" as a conflict too.
            conflict = in_cao(t)
            co_min = ctx.changeover(fam, MILK)[0] if fam not in (None, MILK) else 0
            if conflict is None and fam != MILK:
                nc = next_cao(t)
                if nc is not None and nc[0] - t < co_min + MIN_MILK_BLOCK:
                    conflict = nc
            if conflict is not None:
                rg = next((it for it in pending if it["family"] != MILK), None)
                if rg is not None:  # fill the window with remaining R&G work
                    item = rg
                    if not item["note"]:
                        item["note"] = "R&G pulled forward to avoid the HIGH risk window"
                else:  # nothing else to run: defer milk to after the window
                    item["note"] = "Milk moved after the HIGH risk window"
                    target = conflict[1] - co_min  # changeover (if any) ends as the window ends
                    if target > t:
                        t = target
                        continue

        # changeover
        need_co = fam is not None and cur_sku != item["sku"]
        if need_co:
            m, kg, cleaning = ctx.changeover(fam, item["family"])
            if t + m > next_block(t):
                t = next_block(t)
                continue
            if t + m > H:
                break
            slots.append({
                "kind": "CHANGEOVER", "s": t, "e": t + m, "sku": item["sku"], "family": item["family"],
                "cleaning": cleaning, "purge_kg": kg,
                "note": f"{fam} → {item['family']} · {CLEANING_LABEL.get(cleaning, cleaning)}",
            })
            t += m
            fam, cur_sku = item["family"], item["sku"]
            continue  # re-evaluate windows at the new time
        fam, cur_sku = item["family"], item["sku"]

        # run
        limit = min(next_block(t), H)
        cut_reason = "maintenance" if limit < H else "end of week"
        if item["family"] == MILK:
            nc = next_cao(t)
            if nc is not None and nc[0] < limit:
                limit, cut_reason = nc[0], "HIGH risk"
        if limit <= t:
            continue
        rate = ctx.rate(line, item["family"])
        need = int(math.ceil(item["rem"] * ctx.cpb / rate - 1e-9))
        m = min(need, limit - t)
        boxes = item["rem"] if m == need else int(math.floor(m * rate / ctx.cpb))
        note = item["note"]
        if m < need:
            note = (note + "; " if note else "") + f"Paused before the {cut_reason} window"
        slots.append({"kind": "RUN", "s": t, "e": t + m, "sku": item["sku"], "family": item["family"],
                      "boxes": boxes, "note": note})
        item["rem"] -= boxes
        item["note"] = "Resumed after the " + cut_reason + " window" if item["rem"] > 0 else ""
        t += m

    unmet = {}
    for it in items:
        if it["rem"] > 0:
            unmet[it["sku"]] = unmet.get(it["sku"], 0) + it["rem"]
    slots.sort(key=lambda x: (x["s"], x["e"], x["kind"]))
    return slots, unmet


def _line_idle(ctx, line, slots):
    used = sum(sl["e"] - sl["s"] for sl in slots)
    return ctx.H - used


def _plan_lines(ctx, assign):
    out = {}
    for line in ctx.line_ids:
        items = _sequence(ctx, line, {s: b for s, b in assign[line].items() if b > 0})
        out[line] = _lay(ctx, line, items)
    return out


def _total_unmet(plans):
    return sum(sum(u.values()) for _, u in plans.values())


# ── e. KPIs ─────────────────────────────────────────────────────────────────


def _kpis(ctx, line, slots, unmet):
    run = [s for s in slots if s["kind"] == "RUN"]
    co = [s for s in slots if s["kind"] == "CHANGEOVER"]
    blocked_min = sum(s["e"] - s["s"] for s in slots if s["kind"] == "BLOCKED")
    run_min = sum(s["e"] - s["s"] for s in run)
    co_min = sum(s["e"] - s["s"] for s in co)
    avail = ctx.H - blocked_min
    planned = {}
    for s in run:
        planned[s["sku"]] = planned.get(s["sku"], 0) + s["boxes"]
    milk_cao = sum(
        _overlap(s["s"], s["e"], a, b) for s in run if s["family"] == MILK for a, b in ctx.cao[line]
    )
    return {
        "changeovers": len(co),
        "changeover_min": co_min,
        "purge_kg": round(sum(s["purge_kg"] for s in co), 1),
        "wet_cleans": sum(1 for s in co if s["cleaning"] == "WET"),
        "run_min": run_min,
        "blocked_min": blocked_min,
        "idle_min": ctx.H - run_min - co_min - blocked_min,
        "available_min": avail,
        "utilisation": round(run_min / avail, 4) if avail else 0.0,
        "boxes_planned": dict(sorted(planned.items())),
        "unmet": dict(sorted(unmet.items())),
        "milk_minutes_in_high_risk": milk_cao,
    }


def _total_kpis(ctx, per_line, extra_unmet):
    keys = ["changeovers", "changeover_min", "wet_cleans", "run_min", "blocked_min", "idle_min",
            "available_min", "milk_minutes_in_high_risk"]
    tot = {k: sum(per_line[ln][k] for ln in ctx.line_ids) for k in keys}
    tot["purge_kg"] = round(sum(per_line[ln]["purge_kg"] for ln in ctx.line_ids), 1)
    tot["utilisation"] = round(tot["run_min"] / tot["available_min"], 4) if tot["available_min"] else 0.0
    planned, unmet = {}, dict(extra_unmet)
    for ln in ctx.line_ids:
        for s, b in per_line[ln]["boxes_planned"].items():
            planned[s] = planned.get(s, 0) + b
        for s, b in per_line[ln]["unmet"].items():
            unmet[s] = unmet.get(s, 0) + b
    tot["boxes_planned"] = dict(sorted(planned.items()))
    tot["unmet"] = dict(sorted(unmet.items()))
    tot["boxes_required"] = sum(ctx.req.values())
    tot["boxes_planned_total"] = sum(planned.values())
    tot["unmet_total"] = sum(unmet.values())
    order = ["changeovers", "changeover_min", "purge_kg", "wet_cleans", "run_min", "blocked_min",
             "idle_min", "available_min", "utilisation", "boxes_required", "boxes_planned_total",
             "unmet_total", "boxes_planned", "unmet", "milk_minutes_in_high_risk"]
    return {k: tot[k] for k in order}


# ── public API ───────────────────────────────────────────────────────────────


def _changeovers(plans):
    return sum(1 for slots, _ in plans.values() for sl in slots if sl["kind"] == "CHANGEOVER")


def _swap_for_risk(ctx, assign, plans, notes):
    """Trade roast work onto a line that has a HIGH risk window, and shared milk work off it.

    A line whose humidity window forbids milk needs enough roast coffee to keep
    running through it. When unmet quantity remains, try moving part of a
    shared roast SKU onto that line and an equal number of minutes of a shared
    milk SKU the other way; keep the trade that leaves the least unmet (then the
    fewest changeovers). Deterministic: candidates are enumerated in sorted order.
    """
    for _ in range(MAX_REBALANCE_ROUNDS):
        best = None
        current = (_total_unmet(plans), _changeovers(plans))
        if current[0] == 0:
            break
        for risky in ctx.line_ids:
            if ctx.cao_minutes(risky) <= 0:
                continue
            for other in ctx.line_ids:
                if other == risky:
                    continue
                roast = sorted(s for s, b in assign[other].items()
                               if b > 0 and ctx.family(s) != MILK and risky in ctx.eligible(s))
                milk = sorted(s for s, b in assign[risky].items()
                              if b > 0 and ctx.family(s) == MILK and other in ctx.eligible(s))
                for x in roast:
                    for fraction in (0.25, 0.5, 0.75, 1.0):
                        moved_x = int(assign[other][x] * fraction)
                        if moved_x <= 0:
                            continue
                        minutes = ctx.minutes_for(risky, x, moved_x)
                        for m in [None, *milk]:
                            trial = {ln: dict(v) for ln, v in assign.items()}
                            trial[other][x] -= moved_x
                            trial[risky][x] = trial[risky].get(x, 0) + moved_x
                            moved_m = 0
                            if m is not None:
                                per_box = ctx.minutes_for(other, m, 1)
                                moved_m = min(trial[risky][m], int(minutes / per_box) if per_box > 0 else 0)
                                if moved_m <= 0:
                                    continue
                                trial[risky][m] -= moved_m
                                trial[other][m] = trial[other].get(m, 0) + moved_m
                            trial_plans = _plan_lines(ctx, trial)
                            score = (_total_unmet(trial_plans), _changeovers(trial_plans))
                            if score < current and (best is None or score < best[0]):
                                best = (score, trial, trial_plans, x, moved_x, m, moved_m, other, risky)
        if best is None:
            break
        _, assign, plans, x, moved_x, m, moved_m, other, risky = best
        text = f"{ctx.skus[x]['short']}: moved {moved_x:,} boxes from {other} to {risky}"
        if m is not None:
            text += f"; {ctx.skus[m]['short']}: moved {moved_m:,} boxes from {risky} to {other}"
        notes.append(text + " (keeps the line on roast & ground coffee during the humidity risk window)")
    return assign, plans


def schedule(data: dict) -> dict:
    ctx = _Ctx(data)
    assign, notes, unassigned = _assign(ctx)
    plans = _plan_lines(ctx, assign)

    # Unmet on one line (e.g. milk pushed past a HIGH risk window) → try the other eligible line.
    for _ in range(MAX_REBALANCE_ROUNDS):
        improved = False
        for line in ctx.line_ids:
            for sku, boxes in sorted(plans[line][1].items()):
                for other in ctx.eligible(sku):
                    if other == line or boxes <= 0:
                        continue
                    idle = _line_idle(ctx, other, plans[other][0])
                    spare_min = max(0, idle - 60)
                    if ctx.family(sku) == MILK:
                        idle_in_cao = sum(e - s for s, e in ctx.cao[other])
                        spare_min = max(0, spare_min - idle_in_cao)
                    move = min(boxes, int(spare_min * ctx.rate(other, ctx.family(sku)) / ctx.cpb))
                    if move <= 0:
                        continue
                    trial = {ln: dict(v) for ln, v in assign.items()}
                    trial[line][sku] -= move
                    trial[other][sku] = trial[other].get(sku, 0) + move
                    trial_plans = _plan_lines(ctx, trial)
                    if _total_unmet(trial_plans) < _total_unmet(plans):
                        assign, plans, improved = trial, trial_plans, True
                        notes.append(
                            f"{ctx.skus[sku]['short']}: moved {move:,}"
                            + f" boxes from {line} to {other} (did not fit on {line})"
                        )
                        break
                if improved:
                    break
            if improved:
                break
        if not improved:
            break

    assign, plans = _swap_for_risk(ctx, assign, plans, notes)

    slots_out, per_line = [], {}
    for line in ctx.line_ids:
        slots, unmet = plans[line]
        for n, sl in enumerate(slots, start=1):
            sku = sl.get("sku")
            meta = ctx.skus.get(sku, {}) if sku else {}
            boxes = int(sl.get("boxes", 0))
            slots_out.append({
                "line": line,
                "slot_no": n,
                "kind": sl["kind"],
                "start": _iso(ctx.at(sl["s"])),
                "end": _iso(ctx.at(sl["e"])),
                "minutes": sl["e"] - sl["s"],
                "sku": sku,
                "short": meta.get("short"),
                "name": meta.get("name"),
                "family": sl.get("family"),
                "boxes": boxes,
                "capsules": boxes * ctx.cpb,
                "cleaning": sl.get("cleaning"),
                "purge_kg": sl.get("purge_kg", 0.0),
                "note": sl.get("note", ""),
            })
        per_line[line] = _kpis(ctx, line, slots, unmet)

    kpis = dict(per_line)
    kpis["total"] = _total_kpis(ctx, per_line, unassigned)

    unmet_list = []
    for line in ctx.line_ids:
        for sku, b in sorted(plans[line][1].items()):
            unmet_list.append({"sku": sku, "short": ctx.skus[sku].get("short"), "line": line, "boxes": b,
                               "reason": "Not enough time in the week"})
    for sku, b in sorted(unassigned.items()):
        unmet_list.append({"sku": sku, "short": ctx.skus.get(sku, {}).get("short"), "line": None, "boxes": b,
                           "reason": "No eligible line for this SKU"})

    windows = []
    for line in ctx.line_ids:
        for s, e, reason in ctx.blocked[line]:
            windows.append({"type": "BLOCKED", "line": line, "start": _iso(ctx.at(s)), "end": _iso(ctx.at(e)),
                            "detail": reason})
    for w in sorted(ctx.risk_windows, key=lambda w: (w["line"], w["_s"], w["_e"], w.get("level", ""))):
        milk = sum(
            _overlap(sl["s"], sl["e"], w["_s"], w["_e"])
            for sl in plans.get(w["line"], ([], {}))[0]
            if sl["kind"] == "RUN" and sl["family"] == MILK
        )
        windows.append({"type": "RISK", "line": w["line"], "start": _iso(ctx.at(w["_s"])),
                        "end": _iso(ctx.at(w["_e"])), "detail": w.get("level", ""), "milk_minutes": milk})

    return {
        "week_label": ctx.week_label,
        "generated_by": VERSION,
        "week_start": _iso(ctx.t0),
        "horizon_minutes": ctx.H,
        "assignment": {ln: dict(sorted((s, b) for s, b in assign[ln].items() if b > 0)) for ln in ctx.line_ids},
        "slots": slots_out,
        "kpis": kpis,
        "unmet": unmet_list,
        "windows": windows,
        "notes": notes,
    }


# ── sample fixture (reference values from ../reference.mjs) ──────────────────

REF_SKUS = [
    ("12450001", "AMR", "Americano capsule", "RG_MED", ["CAP_L1", "CAP_L2"], 0.22),
    ("12450002", "ESI", "Espresso Intenso capsule", "RG_DARK", ["CAP_L1", "CAP_L2"], 0.14),
    ("12450003", "GRI", "Grande Intenso capsule", "RG_DARK", ["CAP_L1", "CAP_L2"], 0.12),
    ("12450004", "LUN", "Lungo capsule", "RG_LIGHT", ["CAP_L1"], 0.06),
    ("12450005", "CSD", "Iced milk coffee capsule", "MILK", ["CAP_L1", "CAP_L2"], 0.18),
    ("12450006", "CAP", "Cappuccino capsule (8+8)", "MILK", ["CAP_L2"], 0.12),
    ("12450007", "LAT", "Latte Macchiato capsule (8+8)", "MILK", ["CAP_L2"], 0.09),
    ("12450008", "FLW", "Flat White capsule", "MILK", ["CAP_L1", "CAP_L2"], 0.07),
]
REF_CHANGEOVER = {
    "RG_LIGHT": {"RG_LIGHT": [15, 5, "DRY"], "RG_MED": [20, 6, "DRY"], "RG_DARK": [25, 8, "DRY"], "MILK": [45, 16, "DRY_CLEAN"]},
    "RG_MED": {"RG_LIGHT": [40, 12, "DRY"], "RG_MED": [15, 5, "DRY"], "RG_DARK": [20, 6, "DRY"], "MILK": [45, 16, "DRY_CLEAN"]},
    "RG_DARK": {"RG_LIGHT": [50, 15, "DRY"], "RG_MED": [35, 11, "DRY"], "RG_DARK": [15, 5, "DRY"], "MILK": [45, 16, "DRY_CLEAN"]},
    "MILK": {"RG_LIGHT": [120, 24, "WET"], "RG_MED": [120, 24, "WET"], "RG_DARK": [120, 24, "WET"], "MILK": [30, 9, "DRY"]},
}


def build_sample_input(total_boxes: int = 310_000) -> dict:
    """The realistic W41 fixture: demand mix × total, S4 PM window, S6 HIGH risk window."""
    return {
        "week_label": "2026-W41",
        "week_start": "2026-10-05T06:00:00",
        "horizon_minutes": 8640,
        "capsules_per_box": 16,
        "skus": [{"sku": s, "short": sh, "name": n, "family": f, "lines": ln} for s, sh, n, f, ln, _ in REF_SKUS],
        "requirements": [{"sku": s, "boxes": int(round(total_boxes * share))} for s, _, _, _, _, share in REF_SKUS],
        "lines": [
            {"line": "CAP_L1", "rate_cpm": {"RG": 420, "MILK": 380}, "oee": 0.74},
            {"line": "CAP_L2", "rate_cpm": {"RG": 500, "MILK": 450}, "oee": 0.70},
        ],
        "changeover": REF_CHANGEOVER,
        "blocked": [{"line": "CAP_L2", "start": "2026-10-05T06:00:00", "end": "2026-10-05T10:00:00",
                     "reason": "Planned dosing auger maintenance"}],
        "risk_windows": [{"line": "CAP_L2", "start": "2026-10-06T13:00:00", "end": "2026-10-07T20:00:00",
                          "level": "HIGH"}],
        "initial_family": {"CAP_L1": "RG_MED", "CAP_L2": "MILK"},
    }


# ── outputs ──────────────────────────────────────────────────────────────────


def _num(x, digits=0):
    return f"{x:,.{digits}f}"


def _time(iso):
    dt = _parse(iso)
    return f"{DAY_ABBR[dt.weekday()]} {dt:%d/%m %H:%M}"


def write_gantt(result: dict, data: dict, path: str) -> bool:
    try:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        from matplotlib.patches import Patch
    except Exception:  # matplotlib unavailable → skip PNG
        return False

    t0 = _parse(result["week_start"])
    H = result["horizon_minutes"]
    lines = [ln["line"] for ln in data["lines"]]
    colors = {"RG_LIGHT": "#E0B77E", "RG_MED": "#A5602B", "RG_DARK": "#4B2A17", "MILK": "#6FA8DC"}
    text_col = {"RG_LIGHT": "#2B1A0B", "RG_MED": "white", "RG_DARK": "white", "MILK": "#0B2540"}
    fam_label = {"RG_LIGHT": "Light roast", "RG_MED": "Medium roast", "RG_DARK": "Dark roast", "MILK": "Milk"}

    def mins(iso):
        return (_parse(iso) - t0).total_seconds() / 60.0

    fig, ax = plt.subplots(figsize=(16, 5.2), dpi=100)
    y_of = {ln: len(lines) - 1 - i for i, ln in enumerate(lines)}
    h = 0.6
    for w in data.get("risk_windows") or []:
        if w.get("level") == "HIGH" and w["line"] in y_of:
            y = y_of[w["line"]]
            ax.axvspan(mins(w["start"]) / 60, mins(w["end"]) / 60,
                       ymin=(y + 0.5 - 0.45) / len(lines), ymax=(y + 0.5 + 0.45) / len(lines),
                       color="#D62728", alpha=0.16, lw=0, zorder=0)
    for sl in result["slots"]:
        y = y_of[sl["line"]]
        x0, w = mins(sl["start"]) / 60, sl["minutes"] / 60
        if sl["kind"] == "RUN":
            ax.barh(y, w, left=x0, height=h, color=colors.get(sl["family"], "#999"), edgecolor="white",
                    lw=0.6, zorder=2)
            if w >= 4.5:
                ax.text(x0 + w / 2, y, sl["short"] or "", ha="center", va="center", fontsize=8.5,
                        color=text_col.get(sl["family"], "black"), zorder=3, fontweight="bold")
        elif sl["kind"] == "CHANGEOVER":
            ax.barh(y, w, left=x0, height=h, color="#9E9E9E", edgecolor="white", lw=0.4, zorder=2)
        else:
            ax.barh(y, w, left=x0, height=h, color="white", edgecolor="#555", hatch="///", lw=0.8, zorder=2)
    ticks = list(range(0, H // 60 + 1, 12))
    ax.set_xticks(ticks)
    ax.set_xticklabels([f"{DAY_ABBR[(t0 + timedelta(hours=t)).weekday()]} {(t0 + timedelta(hours=t)):%H:%M}"
                        for t in ticks], fontsize=8.5)
    ax.set_xlim(0, H / 60)
    ax.set_yticks([y_of[ln] for ln in lines])
    ax.set_yticklabels(lines, fontsize=10)
    ax.set_ylim(-0.5, len(lines) - 0.5)
    ax.grid(axis="x", color="#DDD", lw=0.6, zorder=0)
    ax.set_axisbelow(True)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    ax.set_title(f"Production schedule, week {result['week_label']}", fontsize=13, fontweight="bold", loc="left")
    legend = [Patch(color=colors[f], label=fam_label[f]) for f in FAMILY_ORDER]
    legend += [Patch(color="#9E9E9E", label="Changeover"),
               Patch(facecolor="white", edgecolor="#555", hatch="///", label="Maintenance / blocked"),
               Patch(color="#D62728", alpha=0.25, label="HIGH humidity risk")]
    ax.legend(handles=legend, loc="upper center", bbox_to_anchor=(0.5, -0.1), ncol=7, frameon=False, fontsize=9)
    fig.tight_layout()
    fig.savefig(path, dpi=100)
    plt.close(fig)
    return True


def write_report(result: dict, path: str, gantt: bool) -> None:
    k = result["kpis"]
    tot = k["total"]
    lines = [ln for ln in k if ln != "total"]
    L = []
    L.append(f"# Production plan, week {result['week_label']}")
    L.append("")
    milk_ok = tot["milk_minutes_in_high_risk"] == 0
    summary = (
        f"The plan for week {result['week_label']} (from {_time(result['week_start'])}) schedules "
        f"{_num(tot['boxes_planned_total'])} / {_num(tot['boxes_required'])} boxes on {len(lines)} lines "
        f"with {tot['changeovers']} changeovers ({_num(tot['changeover_min'])} min, "
        f"{_num(tot['purge_kg'], 1)} kg purged powder, {tot['wet_cleans']} wet cleans). "
        f"Utilisation of available time is {_num(tot['utilisation'] * 100, 1)}%. "
    )
    summary += ("No milk production minutes fall inside a HIGH humidity risk window. " if milk_ok else
                f"{tot['milk_minutes_in_high_risk']} milk minutes remain inside a HIGH risk window. ")
    summary += ("All demand is met." if tot["unmet_total"] == 0 else
                f"{_num(tot['unmet_total'])} boxes are short (see Unmet demand).")
    L += [summary, ""]
    if gantt:
        L += ["![Gantt chart](gantt.png)", ""]

    L += ["## KPIs by line", ""]
    cols = [("KPI", None)] + [(ln, ln) for ln in lines] + [("Total", "total")]
    L.append("| " + " | ".join(c for c, _ in cols) + " |")
    L.append("|" + "---|" * len(cols))
    rows = [
        ("Changeovers", "changeovers", 0), ("Changeover time (min)", "changeover_min", 0),
        ("Purged powder (kg)", "purge_kg", 1), ("Wet cleans", "wet_cleans", 0), ("Run time (min)", "run_min", 0),
        ("Blocked / maintenance time (min)", "blocked_min", 0), ("Idle time (min)", "idle_min", 0),
        ("Utilisation (%)", "utilisation", 1), ("Milk minutes in HIGH risk window", "milk_minutes_in_high_risk", 0),
    ]
    for label, key, d in rows:
        vals = []
        for _, ln in cols[1:]:
            v = k[ln][key]
            vals.append(_num(v * 100, 1) if key == "utilisation" else _num(v, d))
        L.append(f"| {label} | " + " | ".join(vals) + " |")
    planned_row = [_num(sum(k[ln]["boxes_planned"].values())) for _, ln in cols[1:]]
    L.append("| Planned boxes | " + " | ".join(planned_row) + " |")
    L.append("")

    L += ["## Production runs", "", "| Line | Start | End | Product | Boxes | Note |",
          "|---|---|---|---|---|---|"]
    for sl in result["slots"]:
        if sl["kind"] != "RUN":
            continue
        L.append(f"| {sl['line']} | {_time(sl['start'])} | {_time(sl['end'])} | "
                 f"{sl['short']} – {sl['name']} | {_num(sl['boxes'])} | {sl['note'] or ''} |")
    L.append("")

    L += ["## Maintenance and risk windows respected", ""]
    for w in result["windows"]:
        if w["type"] == "BLOCKED":
            L.append(f"- {w['line']} · {_time(w['start'])} → {_time(w['end'])} · {w['detail']} — "
                     "no production scheduled in this window.")
        else:
            status = ("no milk products" if w["milk_minutes"] == 0
                      else f"{w['milk_minutes']} milk minutes")
            L.append(f"- {w['line']} · {_time(w['start'])} → {_time(w['end'])} · humidity risk {w['detail']} — "
                     f"{status}.")
    L.append("")

    L += ["## Unmet demand", ""]
    if result["unmet"]:
        L += ["| Product | Line | Boxes short | Reason |", "|---|---|---|---|"]
        for u in result["unmet"]:
            L.append(f"| {u['short']} ({u['sku']}) | {u['line'] or '—'} | {_num(u['boxes'])} | {u['reason']} |")
    else:
        L.append("None — all of the week's demand is scheduled.")
    L.append("")
    if result["notes"]:
        L += ["## Assignment notes", ""] + [f"- {n}" for n in result["notes"]] + [""]
    L.append("_Generated by the demo2_scheduler (campaign rules + changeover matrix)_")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")


def dumps(result: dict) -> str:
    return json.dumps(result, ensure_ascii=False, indent=2)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Demo Data 2 weekly capsule-line scheduler (deterministic)")
    ap.add_argument("input", help="input.json")
    ap.add_argument("--out", required=True, help="output directory")
    ap.add_argument("--no-png", action="store_true", help="skip gantt.png")
    ap.add_argument("--report", action="store_true", help="also write report.md")
    args = ap.parse_args(argv)

    with open(args.input, encoding="utf-8") as f:
        data = json.load(f)
    result = schedule(data)
    os.makedirs(args.out, exist_ok=True)
    with open(os.path.join(args.out, "schedule.json"), "w", encoding="utf-8") as f:
        f.write(dumps(result) + "\n")
    with open(os.path.join(args.out, "kpis.json"), "w", encoding="utf-8") as f:
        f.write(json.dumps(result["kpis"], ensure_ascii=False, indent=2) + "\n")
    gantt = False
    if not args.no_png:
        gantt = write_gantt(result, data, os.path.join(args.out, "gantt.png"))
        if not gantt:
            print("matplotlib unavailable — skipping gantt.png", file=sys.stderr)
    if args.report:
        write_report(result, os.path.join(args.out, "report.md"), gantt)

    t = result["kpis"]["total"]
    print(f"{result['week_label']}: {t['boxes_planned_total']}/{t['boxes_required']} boxes, "
          f"{t['changeovers']} changeovers, {t['purge_kg']} kg purge, {t['wet_cleans']} wet cleans, "
          f"util {t['utilisation']:.1%}, unmet {t['unmet_total']}, milk-in-HIGH-risk {t['milk_minutes_in_high_risk']} min")
    return 0


if __name__ == "__main__":
    sys.exit(main())
