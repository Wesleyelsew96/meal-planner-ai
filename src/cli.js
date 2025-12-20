#!/usr/bin/env node
// CLI aligned with the planner/DFS engine used by the server/UI.

const fs = require("fs");
const path = require("path");
const frequencyUtils = require("../public/shared-frequency");
const { normalizeFoodGroups } = require("./shared/dish");
const { sanitizeSoftHeuristicsOrder } = require("./strategies/heuristics");
const { STRATEGY_PRESETS, DEFAULT_STRATEGY_ID } = require("./strategies/presets");
const {
  buildSuggestionPlan,
  clampMealsPerDay,
  clampSuggestionDays,
  DEFAULT_MEALS_PER_DAY,
} = require("./planner/engine");

const DEFAULT_SOFT_HEURISTICS = sanitizeSoftHeuristicsOrder(
  STRATEGY_PRESETS.balanced.heuristics || ["avoidDuplicates", "unscheduled", "borrow"],
);

function parseArgs(argv) {
  const args = { days: 1 };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--profile" || a === "-p") args.profile = argv[++i];
    else if (a === "--days" || a === "-d") args.days = parseInt(argv[++i], 10);
    else if (a === "--date") args.date = argv[++i];
    else if (a === "--meal" || a === "-m") args.meal = argv[++i];
    else if (a === "--help" || a === "-h") args.help = true;
    else args._ = (args._ || []).concat(a);
  }
  return args;
}

function parseDateOrToday(s) {
  if (!s) return new Date();
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid --date format; use YYYY-MM-DD");
  return d;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeDish(dish) {
  if (!dish || typeof dish !== "object") return null;
  const normalized = { ...dish };
  normalized.id = normalized.id || slugify(normalized.name) || `dish-${Date.now()}`;
  normalized.name = String(normalized.name || normalized.id);
  normalized.mealTypes = Array.isArray(normalized.mealTypes)
    ? normalized.mealTypes.map((meal) => String(meal || "").trim()).filter(Boolean)
    : [];
  normalized.foodGroups = normalizeFoodGroups(normalized.foodGroups || {});
  normalized.frequency = frequencyUtils.normalizeFrequency(normalized.frequency, normalized.days);
  normalized.days = normalized.frequency.mode === frequencyUtils.FREQUENCY_MODES.DAYS
    ? normalized.frequency.days.slice()
    : [];
  return normalized;
}

function buildUserFromProfile(profile) {
  if (!profile || typeof profile !== "object") {
    throw new Error("Invalid profile JSON");
  }
  const dishes = Array.isArray(profile.dishes)
    ? profile.dishes.map(normalizeDish).filter(Boolean)
    : [];
  const heuristics = sanitizeSoftHeuristicsOrder(profile.heuristics || DEFAULT_SOFT_HEURISTICS);
  return {
    id: profile.userId || profile.id || slugify(profile.name) || "cli-user",
    name: profile.name || profile.userId || "CLI User",
    mealsPerDay: clampMealsPerDay(profile.mealsPerDay ?? DEFAULT_MEALS_PER_DAY),
    dishes,
    selections: profile.selections || {},
    heuristics,
    strategy: profile.strategy || { id: DEFAULT_STRATEGY_ID, customOrder: [] },
  };
}

function formatMealOutput(plan, meal) {
  const firstDay = plan[0];
  if (!firstDay || !firstDay.meals) {
    return { date: null, meal, suggestion: null };
  }
  const entry = firstDay.meals[meal];
  return {
    date: firstDay.date,
    meal,
    suggestion: entry || null,
  };
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.profile) {
    console.log(`
Meal Planner AI - Planner CLI

Usage:
  node src/cli.js --profile <file.json> [--days N] [--date YYYY-MM-DD] [--meal breakfast|lunch|dinner|supper]
`);
    process.exit(args.profile ? 0 : 1);
  }

  const profilePath = path.resolve(process.cwd(), args.profile);
  const raw = fs.readFileSync(profilePath, "utf8");
  const profile = JSON.parse(raw);
  const user = buildUserFromProfile(profile);
  const startDate = parseDateOrToday(args.date);
  const days = clampSuggestionDays(args.meal ? 1 : args.days);

  const plan = buildSuggestionPlan(user, startDate, days > 0 ? days : 1);

  if (args.meal) {
    const mealKey = String(args.meal || "").toLowerCase();
    const output = formatMealOutput(plan, mealKey);
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  console.log(JSON.stringify(plan, null, 2));
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
}
