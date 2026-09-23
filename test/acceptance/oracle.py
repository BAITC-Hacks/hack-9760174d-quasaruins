#!/usr/bin/env python3
"""Independent reference oracle for the Track 12 city simulator (Akim Lab).

Written separately from the application engine, in a different language, from
the organizer's dataset PDF (track 12 / "Датасет районов.pdf"). It generates
test/acceptance/cases.json, the expected values used by the acceptance tests.

Usage:  python3 test/acceptance/oracle.py            # print anchors
        python3 test/acceptance/oracle.py --write    # regenerate cases.json
No third-party packages. The full plan search takes about 10 seconds.
"""
import itertools, json, random, statistics, sys
from pathlib import Path

DISTRICTS = ["esil", "almaty", "saryarka", "baikonur", "nura"]
POP = {"esil": 0.27, "almaty": 0.24, "saryarka": 0.20, "baikonur": 0.13, "nura": 0.16}
IND = ["T1", "T2", "E1", "E2", "S1", "S2", "B1", "B2", "C1", "C2"]
WEIGHT = dict(zip(IND, [0.10, 0.10, 0.09, 0.11, 0.11, 0.11, 0.09, 0.09, 0.10, 0.10]))
BASE = {
    "esil":     [45, 62, 68, 72, 48, 55, 78, 60, 75, 70],
    "almaty":   [40, 75, 50, 55, 60, 65, 62, 52, 50, 60],
    "saryarka": [50, 70, 42, 40, 62, 68, 58, 55, 45, 55],
    "baikonur": [52, 68, 55, 50, 58, 60, 52, 58, 55, 58],
    "nura":     [55, 40, 45, 65, 38, 35, 55, 50, 60, 50],
}
PUBLISHED_DISTRICT_SCORE = {"esil": 62.99, "almaty": 57.06, "saryarka": 54.65, "baikonur": 56.63, "nura": 49.18}
# id: (direction, scope, cost, lag_quarters, full effects)
MEASURES = {
    "M1":  ("transport", "district", 18, 2, {"T1": 6, "T2": 9}),
    "M2":  ("transport", "city",     22, 2, {"T1": 4, "B2": 3}),
    "M3":  ("transport", "district", 30, 4, {"T1": 16, "T2": 20, "E2": 4}),
    "M4":  ("ecology",   "district", 15, 2, {"E1": 12, "E2": 3, "B1": 2}),
    "M5":  ("ecology",   "district", 25, 3, {"E2": 14, "C1": 4}),
    "M6":  ("ecology",   "city",     20, 4, {"E1": 5, "E2": 3}),
    "M7":  ("social",    "district", 24, 3, {"S1": 16}),
    "M8":  ("social",    "district", 20, 3, {"S2": 14}),
    "M9":  ("social",    "district", 10, 1, {"S1": 3, "S2": 3, "B1": 3}),
    "M10": ("safety",    "district", 12, 1, {"B1": 12, "B2": 2}),
    "M11": ("safety",    "district", 10, 1, {"B2": 12, "T1": -2}),
    "M12": ("services",  "city",     14, 1, {"C2": 5}),
    "M13": ("services",  "district", 28, 4, {"C1": 18, "E2": 2}),
    "M14": ("services",  "city",     16, 1, {"C1": 5, "C2": 2}),
}
SYNERGIES = [("M1", "M2", "T1"), ("M10", "M12", "B1"), ("M5", "M6", "E2")]  # +2, district of first
HORIZON, BUDGET, DECISIONS, MAX_PER_DIRECTION, CRITICAL = 8, 100, 5, 2, 40


def validate(plan):
    """plan: list of {"measure": id, "district": id or None}. Returns list of reason codes."""
    reasons = []
    ids = [p.get("measure") for p in plan]
    if len(plan) != DECISIONS:
        reasons.append("COUNT")
    if any(m not in MEASURES for m in ids):
        return reasons + ["UNKNOWN_MEASURE"]
    if len(set(ids)) != len(ids):
        reasons.append("DUPLICATE")
    for p in plan:
        scope, d = MEASURES[p["measure"]][1], p.get("district")
        if scope == "district" and d is None:
            reasons.append("DISTRICT_REQUIRED")
        elif scope == "district" and d not in DISTRICTS:
            reasons.append("UNKNOWN_DISTRICT")
        elif scope == "city" and d is not None:
            reasons.append("DISTRICT_NOT_ALLOWED")
    if sum(MEASURES[m][2] for m in ids) > BUDGET:
        reasons.append("BUDGET")
    dirs = [MEASURES[m][0] for m in ids]
    if any(dirs.count(x) > MAX_PER_DIRECTION for x in set(dirs)):
        reasons.append("DIRECTION_LIMIT")
    where = {p["measure"]: p.get("district") for p in plan}
    if "M1" in where and "M3" in where:
        reasons.append("INCOMPATIBLE")
    for a, b in (("M4", "M7"), ("M5", "M13")):
        if a in where and b in where and where[a] == where[b]:
            reasons.append("INCOMPATIBLE")
    return sorted(set(reasons))


def evaluate(plan):
    """Score a plan (validity not checked here). Empty plan = baseline."""
    value = {d: dict(zip(IND, BASE[d])) for d in DISTRICTS}
    where = {p["measure"]: p.get("district") for p in plan}
    for m, d in where.items():
        _, scope, _, lag, effects = MEASURES[m]
        share = (HORIZON - lag) / HORIZON
        for target in (DISTRICTS if scope == "city" else [d]):
            for k, v in effects.items():
                value[target][k] += v * share
    synergies = []
    for a, b, k in SYNERGIES:
        if a in where and b in where:
            value[where[a]][k] += 2
            synergies.append({"pair": [a, b], "district": where[a], "indicator": k, "bonus": 2})
    for d in DISTRICTS:
        for k in IND:
            value[d][k] = min(100.0, max(0.0, value[d][k]))
    dscore = {d: sum(WEIGHT[k] * value[d][k] for k in IND) for d in DISTRICTS}
    avg = sum(POP[d] * dscore[d] for d in DISTRICTS)
    weakest = min(dscore.values())
    crit = [{"district": d, "indicator": k, "value": round(value[d][k], 5)}
            for d in DISTRICTS for k in IND if value[d][k] < CRITICAL]
    return {
        "cost": sum(MEASURES[m][2] for m in where),
        "score": 0.7 * avg + 0.3 * weakest - 1.0 * len(crit),
        "cityAverage": avg, "weakestDistrictScore": weakest,
        "weakestDistrict": min(dscore, key=dscore.get),
        "criticalCount": len(crit), "critical": crit,
        "districtScores": dscore, "synergies": synergies,
    }


def all_valid_plans():
    for combo in itertools.combinations(MEASURES, DECISIONS):
        local = [m for m in combo if MEASURES[m][1] == "district"]
        for assign in itertools.product(DISTRICTS, repeat=len(local)):
            where = dict(zip(local, assign))
            plan = [{"measure": m, "district": where.get(m)} for m in combo]
            if not validate(plan):
                yield plan


def P(*items):
    return [{"measure": m, "district": d} for m, d in items]


def r5(x):
    return round(x, 5)


def expected(plan):
    e = evaluate(plan)
    return {"valid": True, "cost": e["cost"], "score": r5(e["score"]),
            "cityAverage": r5(e["cityAverage"]), "weakestDistrictScore": r5(e["weakestDistrictScore"]),
            "weakestDistrict": e["weakestDistrict"], "criticalCount": e["criticalCount"],
            "critical": e["critical"], "synergies": e["synergies"],
            "districtScores": {d: r5(v) for d, v in e["districtScores"].items()}}


def build_cases():
    base = evaluate([])
    for d in DISTRICTS:  # transcription check against the published district totals
        assert abs(base["districtScores"][d] - PUBLISHED_DISTRICT_SCORE[d]) < 0.006, d
    assert abs(base["score"] - 52.56) < 0.006
    example = P(("M7", "nura"), ("M8", "nura"), ("M10", "nura"), ("M12", None), ("M5", "saryarka"))
    assert not validate(example) and abs(evaluate(example)["score"] - 56.5) < 0.05
    valid_cases = {
        "published_example": (example, "Worked example from the dataset PDF (cost 95, about 56.5, M10+M12 synergy)."),
        "cheapest_published_set": (P(("M4", "saryarka"), ("M9", "nura"), ("M10", "nura"), ("M11", "esil"), ("M12", None)),
                                   "Cheapest set named in the PDF (cost 61); districts chosen by the tester."),
        "new_critical_from_M11": (P(("M11", "almaty"), ("M7", "nura"), ("M8", "nura"), ("M12", None), ("M4", "saryarka")),
                                  "M11 lowers Almaty T1 from 40 to 38.25, creating one critical value; Nura criticals are fixed."),
        "synergy_M1_M2_and_M10_M12": (P(("M1", "nura"), ("M2", None), ("M8", "nura"), ("M10", "nura"), ("M12", None)),
                                      "Two synergies in Nura: T1 +2 and B1 +2."),
        "synergy_M5_M6": (P(("M5", "saryarka"), ("M6", None), ("M8", "nura"), ("M7", "nura"), ("M11", "esil")),
                          "M5+M6 synergy: E2 +2 in Saryarka."),
        "M4_M7_different_districts_ok": (P(("M4", "esil"), ("M7", "nura"), ("M9", "almaty"), ("M10", "baikonur"), ("M12", None)),
                                         "M4 and M7 are allowed in different districts."),
        "exact_budget_100": (P(("M3", "nura"), ("M7", "nura"), ("M8", "nura"), ("M10", "nura"), ("M12", None)),
                             "Spends exactly 100; one of the best plans."),
    }
    invalid_cases = {
        "four_measures": (P(("M9", "nura"), ("M10", "nura"), ("M12", None), ("M4", "esil")), ["COUNT"]),
        "six_measures": (P(("M9", "nura"), ("M10", "nura"), ("M11", "esil"), ("M12", None), ("M4", "esil"), ("M1", "nura")), ["COUNT"]),
        "over_budget": (P(("M3", "nura"), ("M13", "almaty"), ("M5", "saryarka"), ("M7", "esil"), ("M2", None)), ["BUDGET"]),
        "duplicate_measure": (P(("M9", "nura"), ("M9", "esil"), ("M10", "nura"), ("M12", None), ("M4", "esil")), ["DUPLICATE"]),
        "district_missing": (P(("M7", None), ("M8", "nura"), ("M10", "nura"), ("M12", None), ("M5", "saryarka")), ["DISTRICT_REQUIRED"]),
        "district_on_city_measure": (P(("M7", "nura"), ("M8", "nura"), ("M10", "nura"), ("M12", "esil"), ("M5", "saryarka")), ["DISTRICT_NOT_ALLOWED"]),
        "unknown_measure": (P(("M15", "nura"), ("M8", "nura"), ("M10", "nura"), ("M12", None), ("M5", "saryarka")), ["UNKNOWN_MEASURE"]),
        "unknown_district": (P(("M7", "downtown"), ("M8", "nura"), ("M10", "nura"), ("M12", None), ("M5", "saryarka")), ["UNKNOWN_DISTRICT"]),
        "three_social": (P(("M7", "nura"), ("M8", "nura"), ("M9", "esil"), ("M10", "nura"), ("M12", None)), ["DIRECTION_LIMIT"]),
        "M1_and_M3": (P(("M1", "esil"), ("M3", "nura"), ("M9", "nura"), ("M10", "nura"), ("M12", None)), ["INCOMPATIBLE"]),
        "M4_M7_same_district": (P(("M4", "nura"), ("M7", "nura"), ("M10", "nura"), ("M12", None), ("M9", "esil")), ["INCOMPATIBLE"]),
        "M5_M13_same_district": (P(("M5", "saryarka"), ("M13", "saryarka"), ("M9", "nura"), ("M10", "nura"), ("M11", "esil")), ["INCOMPATIBLE"]),
    }
    cases = []
    for cid, (plan, note) in valid_cases.items():
        assert not validate(plan), (cid, validate(plan))
        cases.append({"id": cid, "note": note, "plan": plan, "expect": expected(plan)})
    for cid, (plan, reasons) in invalid_cases.items():
        got = validate(plan)
        assert got == reasons, (cid, got)
        cases.append({"id": cid, "plan": plan, "expect": {"valid": False, "reasons": reasons}})

    scored = [(evaluate(p)["score"], p) for p in all_valid_plans()]
    scores = sorted(s for s, _ in scored)
    best = max(scored, key=lambda x: x[0])
    rng = random.Random(12)
    for i, (_, plan) in enumerate(rng.sample(scored, 10)):
        cases.append({"id": f"random_valid_{i + 1:02d}", "plan": plan, "expect": expected(plan)})
    ex_score = evaluate(example)["score"]
    return {
        "about": "Expected values from test/acceptance/oracle.py, an independent Python implementation of the Track 12 dataset rules. Scores rounded to 5 decimals; compare with tolerance.",
        "tolerance": 1e-4,
        "districtIds": DISTRICTS,
        "planFormat": "list of {measure, district}; district is null for city-wide measures (M2, M6, M12, M14)",
        "reasonCodes": ["COUNT", "BUDGET", "DUPLICATE", "DISTRICT_REQUIRED", "DISTRICT_NOT_ALLOWED", "UNKNOWN_MEASURE", "UNKNOWN_DISTRICT", "DIRECTION_LIMIT", "INCOMPATIBLE"],
        "baseline": {"score": r5(base["score"]), "cityAverage": r5(base["cityAverage"]),
                     "weakestDistrictScore": r5(base["weakestDistrictScore"]), "criticalCount": base["criticalCount"],
                     "critical": base["critical"], "districtScores": {d: r5(v) for d, v in base["districtScores"].items()}},
        "search": {"validPlanCount": len(scores), "bestScore": r5(best[0]), "bestPlan": best[1],
                   "medianScore": r5(statistics.median(scores)), "worstScore": r5(scores[0]),
                   "publishedExampleBeatsShare": r5(sum(1 for s in scores if s < ex_score) / len(scores))},
        "cases": cases,
    }


if __name__ == "__main__":
    data = build_cases()
    print("baseline", data["baseline"]["score"], "| valid plans", data["search"]["validPlanCount"],
          "| best", data["search"]["bestScore"], "| median", data["search"]["medianScore"],
          "| example beats", data["search"]["publishedExampleBeatsShare"])
    for c in data["cases"][:7]:
        print(" ", c["id"], c["expect"].get("score"), "crit", c["expect"].get("criticalCount"))
    if "--write" in sys.argv:
        out = Path(__file__).with_name("cases.json")
        out.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print("wrote", out.name, len(data["cases"]), "cases")
