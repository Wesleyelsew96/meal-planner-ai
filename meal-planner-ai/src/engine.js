/**
 * Core rotation-based suggestion engine.
 * No external deps; pure functions for easy testing.
 */

const MEALS = ["breakfast", "lunch", "dinner"];

function isValidMealType(meal) {
  return MEALS.includes(meal);
}

function normalizeProfile(profile) {
  if (!profile || typeof profile !== "object") throw new Error("Invalid profile");
  const dishes = Array.isArray(profile.dishes) ? profile.dishes : [];
  const normalized = dishes
    .filter(Boolean)
    .map((d) => {
      const id = String(d.id ?? d.name ?? "");
      const name = String(d.name ?? d.id ?? "Unnamed Dish");
      const mealTypes = Array.isArray(d.mealTypes)
        ? d.mealTypes.filter(isValidMealType)
        : [];
      const rest = { ...d };
      rest.id = id;
      rest.name = name;
      rest.mealTypes = mealTypes;
      return rest;
    })
    .filter((d) => d.id && d.mealTypes.length > 0);
  return { ...profile, dishes: normalized };
}

function groupDishesByMeal(profile) {
  const groups = { breakfast: [], lunch: [], dinner: [] };
  for (const dish of profile.dishes) {
    for (const mt of dish.mealTypes) {
      if (isValidMealType(mt)) groups[mt].push(dish);
    }
  }
  return groups;
}

function yyyymmdd(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function daysSinceEpoch(date) {
  const msPerDay = 24 * 60 * 60 * 1000;
  const utc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor(utc / msPerDay);
}

function pickRotating(group, dayIndex) {
  if (!group || group.length === 0) return null;
  const idx = ((dayIndex % group.length) + group.length) % group.length;
  return group[idx];
}

/**
 * Suggest dishes for a single day across meals.
 * Returns: { date, suggestions: { breakfast: [], lunch: [], dinner: [] } }
 * For baseline, each list contains one deterministic pick (or empty if none).
 */
function suggestForDay(profile, date = new Date()) {
  const normalized = normalizeProfile(profile);
  const groups = groupDishesByMeal(normalized);
  const dayIndex = daysSinceEpoch(date);

  const result = { date: yyyymmdd(date), suggestions: { breakfast: [], lunch: [], dinner: [] } };
  for (const meal of MEALS) {
    const pick = pickRotating(groups[meal], dayIndex);
    result.suggestions[meal] = pick ? [pick] : [];
  }
  return result;
}

/**
 * Suggest for N days starting from a start date (inclusive).
 */
function suggestDays(profile, options = {}) {
  const { startDate = new Date(), days = 1 } = options;
  if (!Number.isInteger(days) || days < 1) throw new Error("days must be >= 1");
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.UTC(
      startDate.getUTCFullYear(),
      startDate.getUTCMonth(),
      startDate.getUTCDate() + i
    ));
    out.push(suggestForDay(profile, d));
  }
  return out;
}

/**
 * Suggest for a specific meal on a given day.
 * Returns an array (baseline length 1 or empty).
 */
function suggestMealForDay(profile, meal, date = new Date()) {
  if (!isValidMealType(meal)) throw new Error("Invalid meal type");
  const normalized = normalizeProfile(profile);
  const groups = groupDishesByMeal(normalized);
  const dayIndex = daysSinceEpoch(date);
  const pick = pickRotating(groups[meal], dayIndex);
  return pick ? [pick] : [];
}

const engine = {
  MEALS,
  normalizeProfile,
  groupDishesByMeal,
  daysSinceEpoch,
  suggestForDay,
  suggestDays,
  suggestMealForDay,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = engine;
}

if (typeof window !== "undefined") {
  window.MealPlannerEngine = engine;
}
