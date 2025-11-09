const http = require("http");
const fs = require("fs");
const path = require("path");

const dataPath = path.join(__dirname, "..", "data", "users.json");
const publicDir = path.join(__dirname, "..", "public");

const DEFAULT_MEALS_PER_DAY = 3;
const MEAL_MIN = 2;
const MEAL_MAX = 4;
const FOOD_GROUP_KEYS = ["meat", "produce", "starch", "dairy"];
const WEEK_DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const WEEK_DAY_LABELS = {
  sunday: "Sunday",
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
};
const MEAL_SETS = {
  2: ["breakfast", "dinner"],
  3: ["breakfast", "lunch", "dinner"],
  4: ["breakfast", "lunch", "dinner", "supper"],
};
const HEURISTIC_KEYS = ["weekday", "avoidDuplicates", "ratioFrequency", "unscheduled", "borrow"];
const DEFAULT_HEURISTICS = HEURISTIC_KEYS.slice();
const FREQUENCY_MODES = {
  DAYS: "days",
  RATIO: "ratio",
};
const DEFAULT_RATIO_MIN_DAYS = 7;
const MAX_RATIO_DAYS = 31;

function clampMealsPerDay(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return DEFAULT_MEALS_PER_DAY;
  if (num < MEAL_MIN) return MEAL_MIN;
  if (num > MEAL_MAX) return MEAL_MAX;
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

function sanitizeHeuristicsOrder(order) {
  if (!Array.isArray(order)) return DEFAULT_HEURISTICS.slice();
  const seen = new Set();
  const sanitized = [];
  order.forEach((key) => {
    if (HEURISTIC_KEYS.includes(key) && !seen.has(key)) {
      seen.add(key);
      sanitized.push(key);
    }
  });
  HEURISTIC_KEYS.forEach((key) => {
    if (!seen.has(key)) {
      seen.add(key);
      sanitized.push(key);
    }
  });
  return sanitized;
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

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function ensureUniqueUserId(store, baseId) {
  const safeBase = baseId && baseId.length ? baseId : "user";
  let candidate = safeBase;
  let counter = 1;
  while (store.users.some((user) => user.id === candidate)) {
    candidate = `${safeBase}-${counter++}`;
  }
  return candidate;
}

function ensureUniqueDishId(user, baseId) {
  const safeBase = baseId && baseId.length ? baseId : "dish";
  const existing = new Set((user?.dishes || []).map((dish) => dish.id));
  let candidate = safeBase;
  let counter = 1;
  while (existing.has(candidate)) {
    candidate = `${safeBase}-${counter++}`;
  }
  return candidate;
}

function normalizeFoodGroups(source) {
  const groups = {};
  FOOD_GROUP_KEYS.forEach((key) => {
    const list = source && Array.isArray(source[key]) ? source[key] : [];
    groups[key] = list
      .map((item) => String(item || "").trim())
      .filter((item) => item.length > 0);
  });
  return groups;
}

function normalizeDays(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((value) => String(value || "").toLowerCase())
    .filter((value, index, array) => WEEK_DAY_KEYS.includes(value) && array.indexOf(value) === index);
}

function clampRatioDay(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const rounded = Math.round(num);
  if (rounded < 1) return 1;
  if (rounded > MAX_RATIO_DAYS) return MAX_RATIO_DAYS;
  return rounded;
}

function normalizeDishFrequency(dish) {
  const source = dish && typeof dish === "object" ? dish.frequency : null;
  const requestedMode = source && typeof source === "object" ? source.mode : null;
  const fallbackDays = normalizeDays(dish && dish.days);
  const mode = requestedMode === FREQUENCY_MODES.RATIO || requestedMode === FREQUENCY_MODES.DAYS
    ? requestedMode
    : FREQUENCY_MODES.DAYS;

  if (mode === FREQUENCY_MODES.RATIO) {
    const ratioSource = source && source.ratio;
    const minDays = clampRatioDay(ratioSource && ratioSource.minDays) || DEFAULT_RATIO_MIN_DAYS;
    let maxDays = clampRatioDay(ratioSource && ratioSource.maxDays);
    if (!maxDays) maxDays = minDays;
    if (maxDays < minDays) maxDays = minDays;
    return {
      mode: FREQUENCY_MODES.RATIO,
      ratio: {
        minDays,
        maxDays,
      },
      days: [],
    };
  }

  const days = source && Array.isArray(source.days) ? normalizeDays(source.days) : fallbackDays;
  return {
    mode: FREQUENCY_MODES.DAYS,
    days,
  };
}

function normalizeDish(dish) {
  if (!dish || typeof dish !== "object") return null;
  const normalized = { ...dish };
  normalized.id = normalized.id || slugify(normalized.name) || `dish-${Date.now()}`;
  normalized.name = String(normalized.name || "");
  normalized.mealTypes = Array.isArray(normalized.mealTypes)
    ? normalized.mealTypes
      .map((meal) => String(meal || "").trim())
      .filter((meal) => meal.length > 0)
    : [];
  if (normalized.notes && typeof normalized.notes !== "string") {
    normalized.notes = String(normalized.notes);
  }
  if (normalized.description && typeof normalized.description !== "string") {
    normalized.description = String(normalized.description);
  }
  normalized.foodGroups = normalizeFoodGroups(normalized.foodGroups || {});
  normalized.frequency = normalizeDishFrequency(normalized);
  normalized.days = normalized.frequency.mode === FREQUENCY_MODES.DAYS
    ? normalized.frequency.days.slice()
    : [];
  return normalized;
}

function getDishIngredients(dish) {
  const groups = dish && dish.foodGroups && typeof dish.foodGroups === "object" ? dish.foodGroups : {};
  const ingredients = new Set();
  FOOD_GROUP_KEYS.forEach((key) => {
    const list = groups[key];
    if (Array.isArray(list)) {
      list.forEach((item) => {
        const value = String(item || "").trim().toLowerCase();
        if (value) ingredients.add(value);
      });
    }
  });
  return Array.from(ingredients);
}

function isDishUnique(ingredients, usedIngredients) {
  if (!ingredients || ingredients.length === 0) return true;
  return !ingredients.some((ing) => usedIngredients.has(ing));
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
        minGap = Math.max(1, Math.floor(7 / Math.max(1, dish.frequency.days.length)));
      }
      state[meal][dish.id] = { minGap: Math.max(1, minGap), lastUsed: null };
    });
  });
  return state;
}

function buildRatioState(user) {
  const state = {};
  (user?.dishes || []).forEach((dish) => {
    if (dish.frequency && dish.frequency.mode === FREQUENCY_MODES.RATIO && dish.frequency.ratio) {
      const minDays = clampRatioDay(dish.frequency.ratio.minDays) || DEFAULT_RATIO_MIN_DAYS;
      let maxDays = clampRatioDay(dish.frequency.ratio.maxDays);
      if (!maxDays) maxDays = minDays;
      if (maxDays < minDays) maxDays = minDays;
      state[dish.id] = {
        minDays,
        maxDays,
        lastScheduledDay: null,
      };
    }
  });
  return state;
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

function createPlannerContext(user, startDate, daysCount) {
  const meals = getMealsForUser(user);
  const dishById = {};
  const mealToDishes = {};
  const weeklyAssignments = {};
  const ratioLocks = new Set();
  const ratioDishes = [];
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
  seedRatioAssignments({ meals, daysCount, slots, slotLookup, ratioLocks }, ratioDishes);
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
  };
}

function seedRatioAssignments(context, ratioDishes) {
  if (!Array.isArray(ratioDishes) || ratioDishes.length === 0) return;
  ratioDishes.forEach((dish) => {
    const ratio = dish.frequency && dish.frequency.ratio ? dish.frequency.ratio : {};
    const minDays = clampRatioDay(ratio.minDays) || DEFAULT_RATIO_MIN_DAYS;
    let maxDays = clampRatioDay(ratio.maxDays);
    if (!maxDays) maxDays = minDays;
    if (maxDays < minDays) maxDays = minDays;
    (dish.mealTypes || []).forEach((meal) => {
      let lastPlaced = null;
      let windowStart = 0;
      while (windowStart < context.daysCount) {
        const earliest = Math.max(windowStart, lastPlaced === null ? 0 : lastPlaced + minDays);
        if (earliest >= context.daysCount) break;
        let latest = lastPlaced === null
          ? Math.min(context.daysCount - 1, maxDays - 1)
          : Math.min(context.daysCount - 1, lastPlaced + maxDays);
        if (latest < earliest) {
          windowStart = latest + 1;
          continue;
        }
        const candidates = [];
        for (let day = earliest; day <= latest; day += 1) {
          const slot = context.slotLookup[meal]?.[day];
          if (!slot) continue;
          if (slot.lockedDishId) continue;
          candidates.push(slot);
        }
        if (!candidates.length) {
          windowStart = latest + 1;
          continue;
        }
        const chosen = candidates[Math.floor(Math.random() * candidates.length)];
        chosen.lockedDishId = dish.id;
        chosen.lockedReason = formatRatioReason(dish, false);
        context.ratioLocks.add(dish.id);
        lastPlaced = chosen.dayIndex;
        windowStart = lastPlaced + minDays;
      }
    });
  });
}

function initPlannerState(user, context) {
  const rotation = buildRotationQueues(user, context.meals);
  const spacing = buildSpacingState(user, context.meals, rotation);
  const ratio = buildRatioState(user);
  return {
    dayIngredients: Array.from({ length: context.daysCount }, () => new Set()),
    spacing,
    rotation,
    ratio,
  };
}

function buildCandidates(slot, context, state) {
  const dayIndex = slot.dayIndex;
  const reservedIngredients = context.lockedDayIngredients?.[dayIndex];
  const dayInfo = context.dayMeta[dayIndex];
  if (slot.lockedDishId) {
    const dish = context.dishById[slot.lockedDishId];
    if (!dish) return [];
    const conflict = dish._ingredients.some((ing) => state.dayIngredients[dayIndex].has(ing));
    return [{
      dish,
      priority: 0,
      forced: true,
      ingredientConflict: conflict,
      spacingOk: isSpacingReady(state.spacing, slot.meal, dish.id, dayIndex),
      rotationRank: 0,
      reasonBase: slot.lockedReason || `Planned for ${dayInfo.weekdayLabel}.`,
    }];
  }
  const mealDishes = context.mealToDishes[slot.meal] || [];
  const candidates = [];
  let hasUnusedPreferred = false;
  mealDishes.forEach((dish) => {
    const isRatioDish = dish.frequency && dish.frequency.mode === FREQUENCY_MODES.RATIO;
    if (isRatioDish && context.ratioLocks && context.ratioLocks.has(dish.id)) {
      return;
    }
    const freq = dish.frequency || { mode: FREQUENCY_MODES.DAYS, days: [] };
    if (freq.mode === FREQUENCY_MODES.DAYS && freq.days.length > 0 && !freq.days.includes(slot.dayKey)) {
      return;
    }
    const tracker = state.ratio[dish.id];
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
      } else {
        forced = slot.dayIndex >= latest;
        priority = forced ? 0 : 1;
        reasonBase = formatRatioReason(dish, forced);
      }
    } else if (freq.mode === FREQUENCY_MODES.DAYS && freq.days.length > 0) {
      priority = 0;
      forced = true;
      reasonBase = `Planned for ${dayInfo.weekdayLabel}.`;
    }
    const spacingOk = isSpacingReady(state.spacing, slot.meal, dish.id, slot.dayIndex);
    if (!spacingOk && forced !== true) {
      // allow but deprioritize
    }
    const dayIngredients = state.dayIngredients[dayIndex];
    const ingredientConflict = dish._ingredients.some(
      (ing) => dayIngredients.has(ing) || (reservedIngredients && reservedIngredients.has(ing)),
    );
    let rotationRank = 0;
    const rotationInfo = state.rotation[slot.meal];
    const isUnscheduled = !tracker && (!freq.days || freq.days.length === 0);
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
    if (unusedPreferred) hasUnusedPreferred = true;
    candidates.push({
      dish,
      priority,
      forced,
      ingredientConflict,
      spacingOk: spacingOk || forced,
      spacingPenalty: spacingOk ? 0 : 1,
      rotationRank,
      isUnscheduled,
      unusedPreferred,
      reasonBase,
    });
  });
  const pool = hasUnusedPreferred
    ? candidates.filter((candidate) => !candidate.isUnscheduled || candidate.unusedPreferred)
    : candidates;
  const cleanPool = pool.filter((candidate) => (!candidate.ingredientConflict || candidate.forced));
  const workingPool = cleanPool.length ? cleanPool : pool;
  workingPool.sort((a, b) => (
    (a.priority - b.priority)
    || (a.ingredientConflict - b.ingredientConflict)
    || (a.rotationRank - b.rotationRank)
    || (a.spacingPenalty - b.spacingPenalty)
  ));

  const grouped = [];
  workingPool.forEach((candidate) => {
    const lastGroup = grouped[grouped.length - 1];
    if (
      lastGroup
      && candidate.priority === lastGroup.key.priority
      && candidate.ingredientConflict === lastGroup.key.ingredientConflict
      && candidate.rotationRank === lastGroup.key.rotationRank
      && candidate.spacingPenalty === lastGroup.key.spacingPenalty
    ) {
      lastGroup.items.push(candidate);
    } else {
      grouped.push({
        key: {
          priority: candidate.priority,
          ingredientConflict: candidate.ingredientConflict,
          rotationRank: candidate.rotationRank,
          spacingPenalty: candidate.spacingPenalty,
        },
        items: [candidate],
      });
    }
  });

  if (slot.dayIndex === 0 && slot.meal === "supper" && process.env.DEBUG_MEALS === "1") {
    console.log("Supper candidates day", slot.dayIndex, grouped.map((group) => ({
      key: group.key,
      dishes: group.items.map((c) => ({ name: c.dish.name, priority: c.priority })),
    })));
  }
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
  candidate.dish._ingredients.forEach((ing) => dayIngredients.add(ing));
  updateSpacingTracker(next.spacing, slot.meal, candidate.dish.id, slot.dayIndex);
  if (next.ratio[candidate.dish.id]) {
    next.ratio[candidate.dish.id].lastScheduledDay = slot.dayIndex;
  }
  const freq = candidate.dish.frequency || { mode: FREQUENCY_MODES.DAYS, days: [] };
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
  let note = candidate.reasonBase;
  if (candidate.ingredientConflict && !candidate.forced) {
    note = `${note} (duplicate ingredients unavoidable).`;
  }
  if (!candidate.spacingOk) {
    note = `${note} (spacing target not possible).`;
  }
  if (candidate.rotationRank > 0 && candidate.priority >= 3) {
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
  const context = createPlannerContext(user, startDate, daysCount);
  const plannerState = initPlannerState(user, context);
  const assignments = new Array(context.slots.length).fill(null);
  const solved = solveSlots(0, context, plannerState, assignments);
  if (!solved) {
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
  return finalizePlan(context, assignments);
}

function normalizeUser(user) {
  if (!user || typeof user !== "object") return null;
  const normalized = { ...user };
  normalized.id = normalized.id || slugify(normalized.name) || `user-${Date.now()}`;
  normalized.name = typeof normalized.name === "string" ? normalized.name : "";
  normalized.mealsPerDay = clampMealsPerDay(normalized.mealsPerDay);
  if (!Array.isArray(normalized.dishes)) {
    normalized.dishes = [];
  } else {
    normalized.dishes = normalized.dishes
      .map((dish) => normalizeDish(dish))
      .filter(Boolean);
  }
  if (!normalized.selections || typeof normalized.selections !== "object") {
    normalized.selections = {};
  }
  if (!normalized.suggestions || typeof normalized.suggestions !== "object") {
    normalized.suggestions = { generatedAt: null, startDate: null, days: 0, plan: [] };
  } else {
    if (!Array.isArray(normalized.suggestions.plan)) normalized.suggestions.plan = [];
  }
  normalized.heuristics = sanitizeHeuristicsOrder(normalized.heuristics);
  return normalized;
}

function readUsers() {
  try {
    const raw = fs.readFileSync(dataPath, "utf8");
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return { users: [] };
    if (!Array.isArray(data.users)) data.users = [];
    data.users = data.users.map((user, index) => normalizeUser(user) || {
      id: `user-${index}`,
      name: "",
      mealsPerDay: DEFAULT_MEALS_PER_DAY,
      dishes: [],
      selections: {},
      suggestions: { generatedAt: null, startDate: null, days: 0, plan: [] },
      heuristics: DEFAULT_HEURISTICS.slice(),
    });
    return data;
  } catch (err) {
    return { users: [] };
  }
}

function writeUsers(data) {
  const payload = !data || typeof data !== "object" ? { users: [] } : { ...data };
  if (!Array.isArray(payload.users)) payload.users = [];
  payload.users = payload.users.map((user) => normalizeUser(user)).filter(Boolean);
  fs.writeFileSync(dataPath, JSON.stringify(payload, null, 2));
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      if (!body) return resolve(null);
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function serveStatic(req, res, parsedUrl) {
  let pathname = parsedUrl.pathname;
  if (pathname === "/") pathname = "/index.html";

  if (pathname === "/engine.js") {
    const enginePath = path.join(__dirname, "engine.js");
    fs.readFile(enginePath, (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end("Engine not available");
        return;
      }
      res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
      res.end(data);
    });
    return;
  }

  const filePath = path.join(publicDir, pathname);
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const map = {
      ".html": "text/html; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".json": "application/json; charset=utf-8",
    };
    const type = map[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  });
}

function handleGetUsers(req, res, id) {
  const store = readUsers();
  if (!id) {
    sendJson(res, 200, store.users);
    return;
  }
  const user = store.users.find((u) => u.id === id);
  if (!user) {
    sendJson(res, 404, { error: "User not found" });
    return;
  }
  sendJson(res, 200, user);
}

async function handleCreateUser(req, res) {
  const payload = await readBody(req);
  if (!payload || typeof payload !== "object") {
    sendJson(res, 400, { error: "Invalid payload" });
    return;
  }
  const name = String(payload.name || "").trim();
  if (!name) {
    sendJson(res, 400, { error: "Name is required" });
    return;
  }
  const mealsPerDay = clampMealsPerDay(payload.mealsPerDay);
  const store = readUsers();
  const baseId = slugify(payload.id || name) || `user-${Date.now()}`;
  const userId = ensureUniqueUserId(store, baseId);
  const newUser = normalizeUser({
    id: userId,
    name,
    mealsPerDay,
    dishes: [],
    selections: {},
    suggestions: { generatedAt: null, startDate: null, days: 0, plan: [] },
    heuristics: sanitizeHeuristicsOrder(payload.heuristics),
  });
  store.users.push(newUser);
  writeUsers(store);
  sendJson(res, 201, newUser);
}

async function handleUpdateUser(req, res, userId) {
  const payload = await readBody(req);
  if (!payload || typeof payload !== "object") {
    sendJson(res, 400, { error: "Invalid payload" });
    return;
  }
  const store = readUsers();
  const user = store.users.find((u) => u.id === userId);
  if (!user) {
    sendJson(res, 404, { error: "User not found" });
    return;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "name")) {
    const name = String(payload.name || "").trim();
    if (!name) {
      sendJson(res, 400, { error: "Name is required" });
      return;
    }
    user.name = name;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "mealsPerDay")) {
    user.mealsPerDay = clampMealsPerDay(payload.mealsPerDay);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "heuristics")) {
    user.heuristics = sanitizeHeuristicsOrder(payload.heuristics);
  }
  writeUsers(store);
  sendJson(res, 200, user);
}

function handleDeleteUser(req, res, userId) {
  const store = readUsers();
  const index = store.users.findIndex((u) => u.id === userId);
  if (index === -1) {
    sendJson(res, 404, { error: "User not found" });
    return;
  }
  store.users.splice(index, 1);
  writeUsers(store);
  res.writeHead(204);
  res.end();
}

async function handleCreateDish(req, res, userId) {
  const payload = await readBody(req);
  if (!payload) {
    sendJson(res, 400, { error: "Missing body" });
    return;
  }
  const { id, name, mealTypes = [], description, notes, metadata, foodGroups, days, frequency } = payload;
  if (!name || !Array.isArray(mealTypes) || mealTypes.length === 0) {
    sendJson(res, 400, { error: "Dish requires name and at least one meal type" });
    return;
  }

  const store = readUsers();
  const user = store.users.find((u) => u.id === userId);
  if (!user) {
    sendJson(res, 404, { error: "User not found" });
    return;
  }
  if (!Array.isArray(user.dishes)) user.dishes = [];
  const baseId = id || slugify(name) || `dish-${Date.now()}`;
  const dishId = ensureUniqueDishId(user, baseId);
  const dish = normalizeDish({
    id: dishId,
    name,
    mealTypes,
    description,
    notes,
    metadata,
    foodGroups,
    days,
    frequency,
  });
  user.dishes.push(dish);
  writeUsers(store);
  sendJson(res, 201, dish);
}

async function handleUpdateDish(req, res, userId, dishId) {
  const payload = await readBody(req);
  const store = readUsers();
  const user = store.users.find((u) => u.id === userId);
  if (!user) {
    sendJson(res, 404, { error: "User not found" });
    return;
  }
  const index = user.dishes.findIndex((d) => d.id === dishId);
  if (index === -1) {
    sendJson(res, 404, { error: "Dish not found" });
    return;
  }
  const dish = user.dishes[index];
  if (payload.name) dish.name = String(payload.name);
  if (Array.isArray(payload.mealTypes) && payload.mealTypes.length > 0) {
    dish.mealTypes = payload.mealTypes;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "description")) {
    dish.description = payload.description ? String(payload.description) : "";
  }
  if (Object.prototype.hasOwnProperty.call(payload, "notes")) {
    dish.notes = payload.notes ? String(payload.notes) : "";
  }
  if (payload.metadata && typeof payload.metadata === "object") {
    dish.metadata = payload.metadata;
  }
  if (payload.foodGroups && typeof payload.foodGroups === "object") {
    dish.foodGroups = normalizeFoodGroups(payload.foodGroups);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "days")) {
    dish.days = normalizeDays(payload.days);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "frequency")) {
    dish.frequency = payload.frequency;
  }
  const normalized = normalizeDish(dish);
  user.dishes[index] = normalized;
  writeUsers(store);
  sendJson(res, 200, normalized);
}

function handleDeleteDish(req, res, userId, dishId) {
  const store = readUsers();
  const user = store.users.find((u) => u.id === userId);
  if (!user) {
    sendJson(res, 404, { error: "User not found" });
    return;
  }
  const index = user.dishes.findIndex((d) => d.id === dishId);
  if (index === -1) {
    sendJson(res, 404, { error: "Dish not found" });
    return;
  }
  user.dishes.splice(index, 1);
  writeUsers(store);
  res.writeHead(204);
  res.end();
}

async function handleGenerateSuggestions(req, res, userId) {
  const payload = await readBody(req);
  const store = readUsers();
  const user = store.users.find((u) => u.id === userId);
  if (!user) {
    sendJson(res, 404, { error: "User not found" });
    return;
  }
  if (payload && Array.isArray(payload.heuristics)) {
    user.heuristics = sanitizeHeuristicsOrder(payload.heuristics);
  }
  const days = clampSuggestionDays(payload?.days);
  const start = payload?.startDate ? new Date(`${payload.startDate}T00:00:00Z`) : new Date();
  const startDate = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const plan = buildSuggestionPlan(user, startDate, days);
  const suggestion = {
    generatedAt: new Date().toISOString(),
    startDate: formatIsoDate(startDate),
    days,
    plan,
  };
  user.suggestions = suggestion;
  writeUsers(store);
  sendJson(res, 200, suggestion);
}

async function handleSelection(req, res, userId) {
  const payload = await readBody(req);
  const { date, meal, dishId } = payload || {};
  if (!date || !meal || !dishId) {
    sendJson(res, 400, { error: "date, meal, and dishId are required" });
    return;
  }
  const store = readUsers();
  const user = store.users.find((u) => u.id === userId);
  if (!user) {
    sendJson(res, 404, { error: "User not found" });
    return;
  }
  const dish = user.dishes.find((d) => d.id === dishId);
  if (!dish) {
    sendJson(res, 404, { error: "Dish not found" });
    return;
  }
  if (!user.selections) user.selections = {};
  if (!user.selections[date]) user.selections[date] = {};
  user.selections[date][meal] = dishId;
  writeUsers(store);
  sendJson(res, 200, { date, meal, dishId });
}

function handleApi(req, res, parsedUrl) {
  const parts = parsedUrl.pathname.split("/").filter(Boolean);
  if (req.method === "GET" && parts.length === 2 && parts[0] === "api" && parts[1] === "users") {
    return handleGetUsers(req, res);
  }
  if (req.method === "GET" && parts.length === 3 && parts[0] === "api" && parts[1] === "users") {
    return handleGetUsers(req, res, parts[2]);
  }
  if (req.method === "POST" && parts.length === 2 && parts[0] === "api" && parts[1] === "users") {
    return handleCreateUser(req, res);
  }
  if (req.method === "PUT" && parts.length === 3 && parts[0] === "api" && parts[1] === "users") {
    return handleUpdateUser(req, res, parts[2]);
  }
  if (req.method === "DELETE" && parts.length === 3 && parts[0] === "api" && parts[1] === "users") {
    return handleDeleteUser(req, res, parts[2]);
  }
  if (req.method === "POST" && parts.length === 4 && parts[0] === "api" && parts[1] === "users" && parts[3] === "dishes") {
    return handleCreateDish(req, res, parts[2]);
  }
  if (req.method === "PUT" && parts.length === 5 && parts[0] === "api" && parts[1] === "users" && parts[3] === "dishes") {
    return handleUpdateDish(req, res, parts[2], parts[4]);
  }
  if (req.method === "DELETE" && parts.length === 5 && parts[0] === "api" && parts[1] === "users" && parts[3] === "dishes") {
    return handleDeleteDish(req, res, parts[2], parts[4]);
  }
  if (req.method === "POST" && parts.length === 4 && parts[0] === "api" && parts[1] === "users" && parts[3] === "suggestions") {
    return handleGenerateSuggestions(req, res, parts[2]);
  }
  if (req.method === "POST" && parts.length === 4 && parts[0] === "api" && parts[1] === "users" && parts[3] === "selection") {
    return handleSelection(req, res, parts[2]);
  }
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
}

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (parsedUrl.pathname.startsWith("/api/")) {
    if (req.method === "POST" || req.method === "PUT") {
      handleApi(req, res, parsedUrl).catch((err) => {
        sendJson(res, 400, { error: err.message || "Invalid request" });
      });
      return;
    }
    return handleApi(req, res, parsedUrl);
  }

  serveStatic(req, res, parsedUrl);
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Meal Planner UI available at http://localhost:${PORT}`);
  });
}

module.exports = { server };
