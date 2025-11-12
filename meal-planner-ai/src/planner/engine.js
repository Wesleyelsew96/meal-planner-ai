const {
  HARD_HEURISTICS,
  SOFT_HEURISTICS,
  ALL_HEURISTICS,
  sanitizeSoftHeuristicsOrder,
} = require("../strategies/heuristics");
const {
  DEFAULT_STRATEGY_ID,
  STRATEGY_PRESETS,
  listStrategies,
  getPresetById,
} = require("../strategies/presets");
const frequencyUtils = require("../../public/shared-frequency");
const { getDishIngredients } = require("../shared/dish");

const FREQUENCY_MODES = frequencyUtils.FREQUENCY_MODES || { DAYS: "days", RATIO: "ratio" };
const DEFAULT_RATIO_MIN_DAYS = frequencyUtils.DEFAULT_RATIO_MIN_DAYS || 7;
const RATIO_DAY_MAX = frequencyUtils.RATIO_DAY_MAX || 31;
const WEEK_DAY_KEYS = frequencyUtils.WEEK_DAY_KEYS || [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];
const normalizeDays = frequencyUtils.normalizeDays || ((list) => {
  if (!Array.isArray(list)) return [];
  const normalized = [];
  list.forEach((value) => {
    const day = String(value || "").toLowerCase();
    if (!WEEK_DAY_KEYS.includes(day)) return;
    if (normalized.includes(day)) return;
    normalized.push(day);
  });
  return normalized;
});
const clampRatioDay = frequencyUtils.clampRatioDay || ((value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const rounded = Math.round(num);
  if (rounded < 1) return 1;
  if (rounded > RATIO_DAY_MAX) return RATIO_DAY_MAX;
  return rounded;
});

const DEFAULT_MEAL_MIN = 2;
const DEFAULT_MEAL_MAX = 4;
const DEFAULT_MEALS_PER_DAY = 3;
const MEAL_SETS = {
  2: ["breakfast", "dinner"],
  3: ["breakfast", "lunch", "dinner"],
  4: ["breakfast", "lunch", "dinner", "supper"],
};
const WEEK_DAY_LABELS = {
  sunday: "Sunday",
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
};
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function clampMealsPerDay(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return DEFAULT_MEALS_PER_DAY;
  if (num < DEFAULT_MEAL_MIN) return DEFAULT_MEAL_MIN;
  if (num > DEFAULT_MEAL_MAX) return DEFAULT_MEAL_MAX;
  return num;
}

function getMealsForUser(user) {
  const mealsPerDay = clampMealsPerDay(user?.mealsPerDay);
  return (MEAL_SETS[mealsPerDay] || MEAL_SETS[DEFAULT_MEALS_PER_DAY]).slice();
}

function clampSuggestionDays(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  if (n < 1) return 1;
  if (n > 7) return 7;
  return Math.round(n);
}

function formatIsoDate(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getWeekdayKey(date) {
  return WEEK_DAY_KEYS[date.getUTCDay()];
}

function capitalize(word) {
  if (!word) return "";
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function pickRandom(list) {
  if (!Array.isArray(list) || list.length === 0) return null;
  const idx = Math.floor(Math.random() * list.length);
  return list[idx];
}

function formatRatioReason(dish, overdue) {
  const ratio = dish.frequency && dish.frequency.mode === FREQUENCY_MODES.RATIO ? dish.frequency.ratio : null;
  if (!ratio) {
    return overdue ? "Meeting frequency target." : "Maintaining frequency target.";
  }
  const label = ratio.minDays === ratio.maxDays
    ? `every ${ratio.minDays} days`
    : `every ${ratio.minDays}-${ratio.maxDays} days`;
  return overdue
    ? `Overdue for ${label}; prioritizing frequency target.`
    : `Targeting ${label}.`;
}

function buildRotationQueues(user, meals) {
  const queues = {};
  meals.forEach((meal) => {
    const unscheduled = (user?.dishes || [])
      .filter((dish) => Array.isArray(dish.mealTypes) && dish.mealTypes.includes(meal))
      .filter((dish) => {
        if (!dish.frequency || !dish.frequency.mode) return true;
        if (dish.frequency.mode === FREQUENCY_MODES.RATIO) return false;
        return !dish.frequency.days || dish.frequency.days.length === 0;
      })
      .map((dish) => dish.id);
    queues[meal] = {
      order: unscheduled,
      unused: new Set(unscheduled),
    };
  });
  return queues;
}

function buildSpacingState(user, meals, rotationQueues) {
  const state = {};
  meals.forEach((meal) => {
    state[meal] = {};
    const rotationLength = Math.max(1, rotationQueues[meal]?.order?.length || 1);
    (user?.dishes || []).forEach((dish) => {
      if (!Array.isArray(dish.mealTypes) || !dish.mealTypes.includes(meal)) return;
      let minGap = 1;
      if (dish.frequency && dish.frequency.mode === FREQUENCY_MODES.RATIO && dish.frequency.ratio) {
        minGap = clampRatioDay(dish.frequency.ratio.minDays) || DEFAULT_RATIO_MIN_DAYS;
      } else if (!dish.frequency || !dish.frequency.days || dish.frequency.days.length === 0) {
        minGap = rotationLength;
      } else {
        minGap = 1;
      }
      state[meal][dish.id] = { minGap: Math.max(1, minGap), lastUsed: null };
    });
  });
  return state;
}

function toEpochDay(date) {
  if (!(date instanceof Date)) return null;
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / MS_PER_DAY);
}

function parseIsoDay(value) {
  if (typeof value !== "string") return null;
  const parts = value.split("-");
  if (parts.length !== 3) return null;
  const [y, m, d] = parts.map((part) => Number(part));
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor(date.getTime() / MS_PER_DAY);
}

function buildLastSelectionMap(user) {
  const selections = user?.selections;
  if (!selections || typeof selections !== "object") return {};
  const latest = {};
  Object.entries(selections).forEach(([date, meals]) => {
    const day = parseIsoDay(date);
    if (!Number.isFinite(day)) return;
    if (!meals || typeof meals !== "object") return;
    Object.values(meals).forEach((dishId) => {
      if (!dishId) return;
      const current = latest[dishId];
      if (current == null || day > current) {
        latest[dishId] = day;
      }
    });
  });
  return latest;
}

function buildRatioTracker(user, startDate) {
  const state = {};
  const lastSelections = buildLastSelectionMap(user);
  const startDay = toEpochDay(startDate);
  (user?.dishes || []).forEach((dish) => {
    if (dish.frequency && dish.frequency.mode === FREQUENCY_MODES.RATIO && dish.frequency.ratio) {
      const minDays = clampRatioDay(dish.frequency.ratio.minDays) || DEFAULT_RATIO_MIN_DAYS;
      let maxDays = clampRatioDay(dish.frequency.ratio.maxDays);
      if (!maxDays) maxDays = minDays;
      if (maxDays < minDays) maxDays = minDays;
      let lastScheduledDay = null;
      const lastSelectionDay = lastSelections[dish.id];
      if (Number.isFinite(lastSelectionDay) && Number.isFinite(startDay)) {
        lastScheduledDay = lastSelectionDay - startDay;
      } else {
        const offset = Math.floor(Math.random() * minDays);
        lastScheduledDay = -offset;
      }
      state[dish.id] = {
        minDays,
        maxDays,
        lastScheduledDay,
      };
    }
  });
  return state;
}

function cloneRatioTracker(tracker) {
  if (!tracker) return {};
  return Object.fromEntries(Object.entries(tracker).map(([id, info]) => [id, { ...info }]));
}

function isSpacingReady(spacingState, meal, dishId, dayIndex) {
  if (!spacingState || !spacingState[meal]) return true;
  const tracker = spacingState[meal][dishId];
  if (!tracker) return true;
  if (!Number.isInteger(tracker.lastUsed)) return true;
  const gap = Math.max(1, tracker.minGap || 1);
  return (dayIndex - tracker.lastUsed) >= gap;
}

function updateSpacingTracker(spacingState, meal, dishId, dayIndex) {
  if (!spacingState || !spacingState[meal] || !spacingState[meal][dishId]) return;
  spacingState[meal][dishId].lastUsed = dayIndex;
}

function clonePlannerState(state) {
  return {
    dayIngredients: state.dayIngredients.map((set) => new Set(set)),
    spacing: Object.fromEntries(
      Object.entries(state.spacing || {}).map(([meal, dishes]) => [
        meal,
        Object.fromEntries(Object.entries(dishes).map(([id, info]) => [id, { ...info }])),
      ]),
    ),
    ratio: Object.fromEntries(Object.entries(state.ratio || {}).map(([id, info]) => [id, { ...info }])),
    rotation: Object.fromEntries(
      Object.entries(state.rotation || {}).map(([meal, info]) => [
        meal,
        {
          order: Array.isArray(info.order) ? info.order.slice() : [],
          unused: new Set(info.unused ? Array.from(info.unused) : []),
        },
      ]),
    ),
  };
}

function createPlannerContext(user, startDate, daysCount, rules) {
  const meals = getMealsForUser(user);
  const heuristicsOrder = sanitizeSoftHeuristicsOrder([...HARD_HEURISTICS, ...SOFT_HEURISTICS]);
  const dishById = {};
  const mealToDishes = {};
  const weeklyAssignments = {};
  const ratioLocks = new Set();
  const ratioDishes = [];
  const ratioTracker = buildRatioTracker(user, startDate);
  meals.forEach((meal) => {
    mealToDishes[meal] = [];
    weeklyAssignments[meal] = {};
  });
  (user?.dishes || []).forEach((dish) => {
    const enriched = { ...dish, _ingredients: getDishIngredients(dish) };
    dishById[dish.id] = enriched;
    (enriched.mealTypes || []).forEach((meal) => {
      if (mealToDishes[meal]) {
        mealToDishes[meal].push(enriched);
      }
    });
    if (enriched.frequency && enriched.frequency.mode === FREQUENCY_MODES.DAYS) {
      (enriched.mealTypes || []).forEach((meal) => {
        if (!weeklyAssignments[meal]) weeklyAssignments[meal] = {};
        enriched.frequency.days.forEach((dayKey) => {
          weeklyAssignments[meal][dayKey] = enriched.id;
        });
      });
    }
    if (enriched.frequency && enriched.frequency.mode === FREQUENCY_MODES.RATIO && enriched.frequency.ratio) {
      ratioDishes.push(enriched);
    }
  });
  const slots = [];
  const slotLookup = {};
  const dayMeta = [];
  for (let i = 0; i < daysCount; i += 1) {
    const date = new Date(startDate.getTime());
    date.setUTCDate(startDate.getUTCDate() + i);
    const dayKey = getWeekdayKey(date);
    dayMeta.push({
      date: formatIsoDate(date),
      weekdayKey: dayKey,
      weekdayLabel: WEEK_DAY_LABELS[dayKey] || capitalize(dayKey),
    });
    meals.forEach((meal) => {
      const slot = {
        index: slots.length,
        dayIndex: i,
        meal,
        dayKey,
        lockedDishId: weeklyAssignments[meal]?.[dayKey] || null,
      };
      slots.push(slot);
      if (!slotLookup[meal]) slotLookup[meal] = {};
      slotLookup[meal][i] = slot;
    });
  }
  seedRatioAssignments({ meals, daysCount, slots, slotLookup, ratioLocks, ratioTracker }, ratioDishes);
  const lockedDayIngredients = Array.from({ length: daysCount }, () => new Set());
  slots.forEach((slot) => {
    if (!slot.lockedDishId) return;
    const dish = dishById[slot.lockedDishId];
    if (!dish || !Array.isArray(dish._ingredients)) return;
    dish._ingredients.forEach((ing) => lockedDayIngredients[slot.dayIndex].add(ing));
  });
  return {
    user,
    meals,
    heuristicsOrder,
    startDate,
    daysCount,
    dishById,
    mealToDishes,
    weeklyAssignments,
    slots,
    dayMeta,
    slotLookup,
    ratioLocks,
    lockedDayIngredients,
    rules: rules || {
      allowIngredientConflicts: false,
      allowSpacingViolations: false,
      requireUnusedFirst: false,
    },
    ratioTracker,
  };
}

function seedRatioAssignments(context, ratioDishes) {
  if (!Array.isArray(ratioDishes) || ratioDishes.length === 0) return;
  ratioDishes.forEach((dish) => {
    const tracker = context.ratioTracker?.[dish.id];
    if (!tracker) return;
    const { minDays, maxDays } = tracker;
    (dish.mealTypes || []).forEach((meal) => {
      let earliest = tracker.lastScheduledDay + minDays;
      let latest = tracker.lastScheduledDay + maxDays;
      if (context.daysCount <= 0) return;
      if (earliest >= context.daysCount) {
        return;
      }
      const forced = latest < 0;
      const windowStart = Math.max(0, earliest);
      const windowEnd = Math.min(context.daysCount - 1, Math.max(windowStart, latest));
      if (windowStart > windowEnd) return;
      const candidates = [];
      for (let day = windowStart; day <= windowEnd; day += 1) {
        const slot = context.slotLookup[meal]?.[day];
        if (!slot || slot.lockedDishId) continue;
        candidates.push(slot);
      }
      if (!candidates.length) return;
      const chosen = forced
        ? candidates[0]
        : candidates[Math.floor(Math.random() * candidates.length)];
      chosen.lockedDishId = dish.id;
      chosen.lockedReason = forced
        ? formatRatioReason(dish, true)
        : formatRatioReason(dish, false);
      context.ratioLocks.add(dish.id);
      tracker.lastScheduledDay = chosen.dayIndex;
    });
  });
}

function initPlannerState(user, context) {
  const rotation = buildRotationQueues(user, context.meals);
  const spacing = buildSpacingState(user, context.meals, rotation);
  const ratioSource = context?.ratioTracker || buildRatioTracker(user, context.startDate);
  const ratio = cloneRatioTracker(ratioSource);
  return {
    dayIngredients: Array.from({ length: context.daysCount }, () => new Set()),
    spacing,
    rotation,
    ratio,
  };
}

function applySoftHeuristicFilters(order, candidates) {
  let pool = candidates.slice();
  order.forEach((key) => {
    if (key === "avoidDuplicates") {
      const filtered = pool.filter((candidate) => (!candidate.ingredientConflict || candidate.forced || candidate.isPlannedDay));
      if (filtered.length) {
        pool = filtered;
      }
    } else if (key === "unscheduled") {
      const hasPreferred = pool.some((candidate) => candidate.unusedPreferred);
      if (hasPreferred) {
        const filtered = pool.filter((candidate) => (
          !candidate.isUnscheduled
          || candidate.unusedPreferred
          || candidate.forced
        ));
        if (filtered.length) {
          pool = filtered;
        }
      }
    }
  });
  return pool;
}

function buildSoftSortKey(candidate, order) {
  const key = [candidate.priority];
  order.forEach((heuristic) => {
    if (heuristic === "avoidDuplicates") {
      key.push(candidate.ingredientConflict ? 1 : 0);
    } else if (heuristic === "unscheduled") {
      key.push(candidate.rotationRank);
    } else if (heuristic === "borrow") {
      key.push(candidate.spacingPenalty);
    }
  });
  return key;
}

function compareCandidatesBySoftOrder(a, b, order) {
  const aKey = buildSoftSortKey(a, order);
  const bKey = buildSoftSortKey(b, order);
  const len = Math.max(aKey.length, bKey.length);
  for (let i = 0; i < len; i += 1) {
    const av = Number.isFinite(aKey[i]) ? aKey[i] : 0;
    const bv = Number.isFinite(bKey[i]) ? bKey[i] : 0;
    if (av !== bv) {
      return av - bv;
    }
  }
  return 0;
}

function buildCandidates(slot, context, state) {
  const dayIndex = slot.dayIndex;
  const reservedIngredients = context.lockedDayIngredients?.[dayIndex];
  const dayInfo = context.dayMeta[dayIndex];
  const softOrder = sanitizeSoftHeuristicsOrder(context.heuristicsOrder);
  if (slot.lockedDishId) {
    const dish = context.dishById[slot.lockedDishId];
    if (!dish) return [];
    return [{
      dish,
      forced: true,
      ingredientConflict: false,
      spacingOk: true,
      spacingPenalty: 0,
      rotationRank: 0,
      priority: 0,
      isUnscheduled: false,
      unusedPreferred: false,
      isPlannedDay: true,
      reasonBase: slot.lockedReason || `Planned for ${dayInfo.weekdayLabel}.`,
    }];
  }
  const mealDishes = context.mealToDishes[slot.meal] || [];
  const baseCandidates = [];
  mealDishes.forEach((dish) => {
    const freq = dish.frequency || { mode: FREQUENCY_MODES.DAYS, days: [] };
    if (freq.mode === FREQUENCY_MODES.DAYS && freq.days.length > 0 && !freq.days.includes(slot.dayKey)) {
      return;
    }
    const hasPlannedDays = freq.mode === FREQUENCY_MODES.DAYS && Array.isArray(freq.days) && freq.days.length > 0;
    const dayIngredients = state.dayIngredients[dayIndex];
    const spacingOkRaw = isSpacingReady(state.spacing, slot.meal, dish.id, slot.dayIndex);
    const ingredientConflict = dish._ingredients?.some(
      (ing) => dayIngredients.has(ing) || (reservedIngredients && reservedIngredients.has(ing)),
    );
    const rotationInfo = state.rotation[slot.meal];
    const tracker = state.ratio[dish.id];
    const isUnscheduled = !tracker && (!freq.days || freq.days.length === 0);
    let rotationRank = 0;
    if (rotationInfo && isUnscheduled) {
      if (rotationInfo.unused && rotationInfo.unused.has(dish.id)) {
        rotationRank = 0;
      } else {
        const queue = rotationInfo.order || [];
        const idx = queue.indexOf(dish.id);
        rotationRank = idx === -1 ? queue.length : idx + 1;
      }
    }
    const unusedPreferred = Boolean(
      isUnscheduled && rotationInfo && rotationInfo.unused && rotationInfo.unused.has(dish.id),
    );
    let priority = 3;
    let forced = false;
    let reasonBase = "Rotating dish.";
    if (tracker) {
      const earliest = Number.isInteger(tracker.lastScheduledDay)
        ? tracker.lastScheduledDay + tracker.minDays
        : 0;
      const latest = Number.isInteger(tracker.lastScheduledDay)
        ? tracker.lastScheduledDay + tracker.maxDays
        : tracker.maxDays - 1;
      if (slot.dayIndex < earliest) {
        return;
      }
      forced = slot.dayIndex >= latest;
      priority = forced ? 0 : 1;
      reasonBase = formatRatioReason(dish, forced);
    } else if (freq.mode === FREQUENCY_MODES.DAYS && freq.days.length > 0) {
      priority = 0;
      forced = true;
      reasonBase = `Planned for ${dayInfo.weekdayLabel}.`;
    }
    const spacingOk = spacingOkRaw || forced;
    if (ingredientConflict && !(context.rules?.allowIngredientConflicts) && !hasPlannedDays && !forced) {
      return;
    }
    if (!spacingOk && !(context.rules?.allowSpacingViolations) && !hasPlannedDays && !forced) {
      return;
    }
    if (
      context.rules?.requireUnusedFirst
      && rotationInfo
      && rotationInfo.unused
      && rotationInfo.unused.size > 0
      && isUnscheduled
      && !unusedPreferred
      && !forced
    ) {
      return;
    }
    baseCandidates.push({
      dish,
      ingredientConflict,
      spacingOk,
      spacingPenalty: spacingOk ? 0 : 1,
      rotationRank,
      isUnscheduled,
      unusedPreferred,
      forced,
      priority,
      isPlannedDay: hasPlannedDays,
      reasonBase,
    });
  });

  if (!baseCandidates.length) return [];

  const filteredPool = applySoftHeuristicFilters(softOrder, baseCandidates);
  if (!filteredPool.length) return [];
  const sorted = filteredPool.slice().sort((a, b) => compareCandidatesBySoftOrder(a, b, softOrder));

  const grouped = [];
  sorted.forEach((candidate) => {
    const signature = buildSoftSortKey(candidate, softOrder).join("|");
    const lastGroup = grouped[grouped.length - 1];
    if (lastGroup && lastGroup.signature === signature) {
      lastGroup.items.push(candidate);
    } else {
      grouped.push({ signature, items: [candidate] });
    }
  });

  const randomized = [];
  grouped.forEach((group) => {
    const shuffled = group.items
      .map((item) => ({ item, r: Math.random() }))
      .sort((a, b) => a.r - b.r)
      .map((entry) => entry.item);
    randomized.push(...shuffled);
  });
  return randomized;
}

function applyCandidate(slot, candidate, context, state) {
  const next = clonePlannerState(state);
  const dayIngredients = next.dayIngredients[slot.dayIndex];
  candidate.dish._ingredients?.forEach((ing) => dayIngredients.add(ing));
  updateSpacingTracker(next.spacing, slot.meal, candidate.dish.id, slot.dayIndex);
  if (next.ratio[candidate.dish.id]) {
    next.ratio[candidate.dish.id].lastScheduledDay = slot.dayIndex;
  }
  const rotationInfo = next.rotation[slot.meal];
  const isUnscheduled = candidate.isUnscheduled;
  if (rotationInfo && isUnscheduled) {
    rotationInfo.unused.delete(candidate.dish.id);
    if (rotationInfo.unused.size === 0) {
      rotationInfo.unused = new Set(rotationInfo.order);
    }
    const order = rotationInfo.order;
    const idx = order.indexOf(candidate.dish.id);
    if (idx !== -1) {
      order.splice(idx, 1);
      order.push(candidate.dish.id);
    }
  }
  return next;
}

function buildReason(candidate) {
  let note = candidate.reasonBase || "Rotating dish.";
  if (candidate.ingredientConflict && !candidate.forced) {
    note = `${note} (duplicate ingredients unavoidable).`;
  }
  if (!candidate.spacingOk && !candidate.forced && !candidate.isPlannedDay) {
    note = `${note} (spacing target not possible).`;
  }
  if (candidate.rotationRank > 0 && candidate.isUnscheduled && !candidate.unusedPreferred) {
    note = `${note} (rotation target not possible).`;
  }
  return note;
}

function solveSlots(index, context, state, assignments) {
  if (index >= context.slots.length) {
    return true;
  }
  const slot = context.slots[index];
  const candidates = buildCandidates(slot, context, state);
  if (!candidates.length) {
    return false;
  }
  for (const candidate of candidates) {
    const nextState = applyCandidate(slot, candidate, context, state);
    if (!nextState) continue;
    assignments[index] = { dish: candidate.dish, reason: buildReason(candidate) };
    if (solveSlots(index + 1, context, nextState, assignments)) {
      return true;
    }
  }
  assignments[index] = null;
  return false;
}

function finalizePlan(context, assignments) {
  const plan = context.dayMeta.map((meta) => ({
    date: meta.date,
    weekday: meta.weekdayLabel,
    meals: {},
    mealOrder: context.meals.slice(),
  }));
  assignments.forEach((assignment, idx) => {
    const slot = context.slots[idx];
    const entry = plan[slot.dayIndex];
    if (assignment) {
      entry.meals[slot.meal] = {
        dishId: assignment.dish.id,
        dishName: assignment.dish.name,
        reason: assignment.reason,
      };
    } else {
      entry.meals[slot.meal] = {
        dishId: null,
        dishName: null,
        reason: "Unable to satisfy constraints.",
      };
    }
  });
  return plan;
}

function buildSuggestionPlan(user, startDate, daysCount) {
  const fallbackRules = [
    { allowIngredientConflicts: false, allowSpacingViolations: false, requireUnusedFirst: true },
    { allowIngredientConflicts: false, allowSpacingViolations: false, requireUnusedFirst: false },
    { allowIngredientConflicts: false, allowSpacingViolations: true, requireUnusedFirst: false },
    { allowIngredientConflicts: true, allowSpacingViolations: true, requireUnusedFirst: false },
  ];

  for (const rules of fallbackRules) {
    const context = createPlannerContext(user, startDate, daysCount, rules);
    const plannerState = initPlannerState(user, context);
    const assignments = new Array(context.slots.length).fill(null);
    const solved = solveSlots(0, context, plannerState, assignments);
    if (solved) {
      return finalizePlan(context, assignments);
    }
  }

  const context = createPlannerContext(user, startDate, daysCount, fallbackRules[fallbackRules.length - 1]);
  return context.dayMeta.map((meta) => ({
    date: meta.date,
    weekday: meta.weekdayLabel,
    meals: context.meals.reduce((acc, meal) => {
      acc[meal] = {
        dishId: null,
        dishName: null,
        reason: "Unable to satisfy constraints.",
      };
      return acc;
    }, {}),
    mealOrder: context.meals.slice(),
  }));
}

module.exports = {
  DEFAULT_MEAL_MIN,
  DEFAULT_MEAL_MAX,
  DEFAULT_MEALS_PER_DAY,
  FREQUENCY_MODES,
  clampMealsPerDay,
  getMealsForUser,
  clampSuggestionDays,
  formatIsoDate,
  buildSuggestionPlan,
};
