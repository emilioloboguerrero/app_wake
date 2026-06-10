import {describe, it, expect} from "vitest";
import {
  resolveUserLevel,
  resolveLevelPlanId,
  computeWeekInBlock,
  sessionMatchesWeek,
  maxWeekIndexOf,
  isValidLevelChoice,
  allLevelPlansPublishAt,
} from "./levelResolution";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

const courseWithLevels = {
  levels: {options: ["principiante", "intermedio", "avanzado"], default: "principiante"},
  level_plans: {principiante: "plan-a", intermedio: "plan-b", avanzado: "plan-c"},
};

const courseNoLevels = {};

const courseWithLevelsNoPlans = {
  levels: {options: ["principiante", "intermedio"], default: "principiante"},
};

// ---------------------------------------------------------------------------
// resolveUserLevel
// ---------------------------------------------------------------------------
describe("resolveUserLevel", () => {
  it("returns entry.level when it is a declared option", () => {
    expect(resolveUserLevel(courseWithLevels, {level: "intermedio"})).toBe("intermedio");
  });

  it("returns default when entry is null", () => {
    expect(resolveUserLevel(courseWithLevels, null)).toBe("principiante");
  });

  it("returns default when entry is undefined", () => {
    expect(resolveUserLevel(courseWithLevels, undefined)).toBe("principiante");
  });

  it("returns default when entry.level is absent (undefined)", () => {
    expect(resolveUserLevel(courseWithLevels, {})).toBe("principiante");
  });

  it("returns default when entry.level is null", () => {
    expect(resolveUserLevel(courseWithLevels, {level: null})).toBe("principiante");
  });

  it("returns default when entry.level is not in options", () => {
    expect(resolveUserLevel(courseWithLevels, {level: "elite"})).toBe("principiante");
  });

  it("returns null when course has no levels field", () => {
    expect(resolveUserLevel(courseNoLevels, {level: "principiante"})).toBeNull();
  });

  it("returns null when course.levels.options is empty", () => {
    const course = {levels: {options: [], default: "principiante"}};
    expect(resolveUserLevel(course, {level: "principiante"})).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveLevelPlanId
// ---------------------------------------------------------------------------
describe("resolveLevelPlanId", () => {
  it("maps resolved level to its planId", () => {
    expect(resolveLevelPlanId(courseWithLevels, {level: "avanzado"})).toBe("plan-c");
  });

  it("uses default level when entry is absent, maps to correct plan", () => {
    expect(resolveLevelPlanId(courseWithLevels, null)).toBe("plan-a");
  });

  it("uses default when entry.level is invalid, maps to default plan", () => {
    expect(resolveLevelPlanId(courseWithLevels, {level: "unknown"})).toBe("plan-a");
  });

  it("returns null when course has no level_plans", () => {
    expect(resolveLevelPlanId(courseWithLevelsNoPlans, {level: "principiante"})).toBeNull();
  });

  it("returns null when course has no levels at all", () => {
    expect(resolveLevelPlanId(courseNoLevels, null)).toBeNull();
  });

  it("returns null when resolved level has no entry in level_plans", () => {
    const course = {
      levels: {options: ["principiante"], default: "principiante"},
      level_plans: {} as Record<string, string>,
    };
    expect(resolveLevelPlanId(course, null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// computeWeekInBlock
// ---------------------------------------------------------------------------
describe("computeWeekInBlock", () => {
  const start = 0; // epoch base

  it("returns 0 during the first 7 days (day 0)", () => {
    expect(computeWeekInBlock(start, 0, 11)).toBe(0);
  });

  it("returns 0 during the first 7 days (day 6)", () => {
    expect(computeWeekInBlock(start, 6 * DAY_MS, 11)).toBe(0);
  });

  it("returns 1 at exactly 7 days", () => {
    expect(computeWeekInBlock(start, WEEK_MS, 11)).toBe(1);
  });

  it("returns 1 mid-second week (day 10)", () => {
    expect(computeWeekInBlock(start, 10 * DAY_MS, 11)).toBe(1);
  });

  it("returns 2 at exactly 14 days", () => {
    expect(computeWeekInBlock(start, 2 * WEEK_MS, 11)).toBe(2);
  });

  it("clamps to maxWeekIndex when raw exceeds it", () => {
    expect(computeWeekInBlock(start, 100 * DAY_MS, 11)).toBe(11);
  });

  it("never returns negative (now before start)", () => {
    expect(computeWeekInBlock(start, -DAY_MS, 11)).toBe(0);
  });

  it("returns 0 when startedAtMs is null", () => {
    expect(computeWeekInBlock(null, DAY_MS * 10, 11)).toBe(0);
  });

  it("returns 0 when startedAtMs is NaN", () => {
    expect(computeWeekInBlock(NaN, DAY_MS * 10, 11)).toBe(0);
  });

  it("returns exact maxWeekIndex when raw equals it", () => {
    expect(computeWeekInBlock(start, 11 * WEEK_MS, 11)).toBe(11);
  });
});

// ---------------------------------------------------------------------------
// sessionMatchesWeek
// ---------------------------------------------------------------------------
describe("sessionMatchesWeek", () => {
  it("returns true when weekIndex equals weekInBlock", () => {
    expect(sessionMatchesWeek({weekIndex: 3}, 3)).toBe(true);
  });

  it("returns false when weekIndex differs from weekInBlock", () => {
    expect(sessionMatchesWeek({weekIndex: 2}, 3)).toBe(false);
  });

  it("returns false for adjacent week", () => {
    expect(sessionMatchesWeek({weekIndex: 4}, 3)).toBe(false);
  });

  it("returns true when weekIndex is undefined (legacy session)", () => {
    expect(sessionMatchesWeek({}, 3)).toBe(true);
  });

  it("returns true when weekIndex is null (legacy session)", () => {
    expect(sessionMatchesWeek({weekIndex: null}, 3)).toBe(true);
  });

  it("returns true for weekIndex 0 matching block 0", () => {
    expect(sessionMatchesWeek({weekIndex: 0}, 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// maxWeekIndexOf
// ---------------------------------------------------------------------------
describe("maxWeekIndexOf", () => {
  it("returns the highest weekIndex present", () => {
    expect(maxWeekIndexOf([{weekIndex: 0}, {weekIndex: 5}, {weekIndex: 3}])).toBe(5);
  });

  it("returns 0 when no session declares a weekIndex", () => {
    expect(maxWeekIndexOf([{}, {}])).toBe(0);
  });

  it("returns 0 for an empty array", () => {
    expect(maxWeekIndexOf([])).toBe(0);
  });

  it("returns 0 when all weekIndex values are null", () => {
    expect(maxWeekIndexOf([{weekIndex: null}, {weekIndex: null}])).toBe(0);
  });

  it("ignores null values and returns the numeric max", () => {
    expect(maxWeekIndexOf([{weekIndex: null}, {weekIndex: 7}, {weekIndex: 2}])).toBe(7);
  });

  it("handles a single session with weekIndex 0", () => {
    expect(maxWeekIndexOf([{weekIndex: 0}])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// isValidLevelChoice
// ---------------------------------------------------------------------------
describe("isValidLevelChoice", () => {
  it("accepts a level that is in options", () => {
    expect(isValidLevelChoice(courseWithLevels, "intermedio")).toBe(true);
  });

  it("rejects a level not in options", () => {
    expect(isValidLevelChoice(courseWithLevels, "elite")).toBe(false);
  });

  it("rejects when course has no levels field", () => {
    expect(isValidLevelChoice(courseNoLevels, "principiante")).toBe(false);
  });

  it("rejects when course.levels.options is empty", () => {
    const course = {levels: {options: [], default: "principiante"}};
    expect(isValidLevelChoice(course, "principiante")).toBe(false);
  });

  it("accepts all three declared options", () => {
    for (const lvl of ["principiante", "intermedio", "avanzado"]) {
      expect(isValidLevelChoice(courseWithLevels, lvl)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// allLevelPlansPublishAt
// ---------------------------------------------------------------------------
describe("allLevelPlansPublishAt", () => {
  it("returns true when all plans are published", () => {
    expect(allLevelPlansPublishAt({principiante: true, intermedio: true, avanzado: true})).toBe(true);
  });

  it("returns false when any plan is not published", () => {
    expect(allLevelPlansPublishAt({principiante: true, intermedio: false, avanzado: true})).toBe(false);
  });

  it("returns false when all plans are not published", () => {
    expect(allLevelPlansPublishAt({principiante: false, intermedio: false})).toBe(false);
  });

  it("returns false for empty object", () => {
    expect(allLevelPlansPublishAt({})).toBe(false);
  });

  it("returns true for a single plan that is published", () => {
    expect(allLevelPlansPublishAt({principiante: true})).toBe(true);
  });

  it("returns false for a single plan that is not published", () => {
    expect(allLevelPlansPublishAt({principiante: false})).toBe(false);
  });
});
