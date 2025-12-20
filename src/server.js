const http = require("http");
const fs = require("fs");
const path = require("path");
const frequencyUtils = require("../public/shared-frequency");
const { load: loadStore, save: saveStore } = require("./store");
const planner = require("./planner/engine");
const {
  DEFAULT_MEAL_MIN,
  DEFAULT_MEAL_MAX,
  DEFAULT_MEALS_PER_DAY,
  FREQUENCY_MODES,
  clampMealsPerDay,
  getMealsForUser,
  clampSuggestionDays,
  formatIsoDate,
  buildSuggestionPlan,
} = planner;
const {
  sanitizeSoftHeuristicsOrder,
} = require("./strategies/heuristics");
const {
  DEFAULT_STRATEGY_ID,
  STRATEGY_PRESETS,
  listStrategies,
  getPresetById,
} = require("./strategies/presets");
const { normalizeFoodGroups } = require("./shared/dish");

const normalizeFrequency = frequencyUtils.normalizeFrequency;
const publicDir = path.join(__dirname, "..", "public");

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

function ensureStrategyObject(source) {
  if (!source || typeof source !== "object") {
    return { id: DEFAULT_STRATEGY_ID, customOrder: [] };
  }
  const rawId = typeof source.id === "string" ? source.id : DEFAULT_STRATEGY_ID;
  if (rawId === "custom") {
    const customOrder = Array.isArray(source.customOrder)
      ? sanitizeSoftHeuristicsOrder(source.customOrder)
      : [];
    if (!customOrder.length) {
      return { id: DEFAULT_STRATEGY_ID, customOrder: [] };
    }
    return { id: "custom", customOrder };
  }
  const presetId = STRATEGY_PRESETS[rawId] ? rawId : DEFAULT_STRATEGY_ID;
  return { id: presetId, customOrder: [] };
}

function setPresetStrategy(user, strategyId = DEFAULT_STRATEGY_ID) {
  if (!user) return;
  const preset = getPresetById(strategyId);
  user.strategy = { id: preset.id, customOrder: [] };
  user.heuristics = sanitizeSoftHeuristicsOrder(preset.heuristics);
}

function setCustomStrategy(user, order) {
  if (!user) return;
  const sanitized = sanitizeSoftHeuristicsOrder(order);
  if (!sanitized.length) {
    setPresetStrategy(user, DEFAULT_STRATEGY_ID);
    return;
  }
  user.strategy = { id: "custom", customOrder: sanitized.slice() };
  user.heuristics = sanitized.slice();
}

function normalizeStrategy(user) {
  if (!user) return;
  user.heuristics = sanitizeSoftHeuristicsOrder(user.heuristics);
  const normalized = ensureStrategyObject(user.strategy);
  if (normalized.id === "custom") {
    const customOrder = normalized.customOrder.length ? normalized.customOrder : user.heuristics;
    if (customOrder.length) {
      setCustomStrategy(user, customOrder);
      return;
    }
    setPresetStrategy(user, DEFAULT_STRATEGY_ID);
    return;
  }
  setPresetStrategy(user, normalized.id);
}

function normalizeDishFrequency(dish) {
  return normalizeFrequency(dish && dish.frequency, dish && dish.days);
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
  } else if (!Array.isArray(normalized.suggestions.plan)) {
    normalized.suggestions.plan = [];
  }
  normalizeStrategy(normalized);
  return normalized;
}

async function getStore() {
  const store = await loadStore();
  if (!store.__normalized) {
    store.users = store.users
      .map((user, index) => normalizeUser(user) || {
        id: `user-${index}`,
        name: "",
        mealsPerDay: DEFAULT_MEALS_PER_DAY,
        dishes: [],
        selections: {},
        suggestions: { generatedAt: null, startDate: null, days: 0, plan: [] },
        heuristics: sanitizeSoftHeuristicsOrder([]),
        strategy: { id: DEFAULT_STRATEGY_ID, customOrder: [] },
      });
    Object.defineProperty(store, "__normalized", { value: true, enumerable: false });
  }
  return store;
}

async function persistStore(store) {
  await saveStore({ users: store.users });
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
  const filePath = path.join(publicDir, pathname);
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
      ".ico": "image/x-icon",
    };
    res.writeHead(200, { "Content-Type": map[ext] || "text/plain; charset=utf-8" });
    res.end(data);
  });
}

async function handleGetUsers(req, res, id) {
  const store = await getStore();
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

async function handleGetStrategies(req, res) {
  sendJson(res, 200, listStrategies());
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
  const store = await getStore();
  const baseId = slugify(payload.id || name) || `user-${Date.now()}`;
  const userId = ensureUniqueUserId(store, baseId);
  const newUser = normalizeUser({
    id: userId,
    name,
    mealsPerDay,
    dishes: [],
    selections: {},
    suggestions: { generatedAt: null, startDate: null, days: 0, plan: [] },
    strategy: payload.strategy || null,
    heuristics: payload.heuristics || [],
  });
  store.users.push(newUser);
  await persistStore(store);
  sendJson(res, 201, newUser);
}

async function handleUpdateUser(req, res, userId) {
  const payload = await readBody(req);
  if (!payload || typeof payload !== "object") {
    sendJson(res, 400, { error: "Invalid payload" });
    return;
  }
  const store = await getStore();
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
  if (payload.strategy && payload.strategy.id) {
    if (payload.strategy.id === "custom" && Array.isArray(payload.strategy.customOrder)) {
      setCustomStrategy(user, payload.strategy.customOrder);
    } else {
      setPresetStrategy(user, payload.strategy.id);
    }
  } else if (Array.isArray(payload.heuristics)) {
    setCustomStrategy(user, payload.heuristics);
  }
  await persistStore(store);
  sendJson(res, 200, user);
}

async function handleApplyStrategy(req, res, userId) {
  const payload = await readBody(req);
  const store = await getStore();
  const user = store.users.find((u) => u.id === userId);
  if (!user) {
    sendJson(res, 404, { error: "User not found" });
    return;
  }
  if (payload && payload.strategyId) {
    setPresetStrategy(user, payload.strategyId);
  } else if (payload && payload.strategy && payload.strategy.id) {
    if (payload.strategy.id === "custom" && Array.isArray(payload.strategy.customOrder)) {
      setCustomStrategy(user, payload.strategy.customOrder);
    } else {
      setPresetStrategy(user, payload.strategy.id);
    }
  } else if (payload && Array.isArray(payload.heuristics)) {
    setCustomStrategy(user, payload.heuristics);
  } else {
    sendJson(res, 400, { error: "strategyId or heuristics required" });
    return;
  }
  await persistStore(store);
  sendJson(res, 200, { strategy: user.strategy, heuristics: user.heuristics });
}

async function handleDeleteUser(req, res, userId) {
  const store = await getStore();
  const index = store.users.findIndex((u) => u.id === userId);
  if (index === -1) {
    sendJson(res, 404, { error: "User not found" });
    return;
  }
  store.users.splice(index, 1);
  await persistStore(store);
  res.writeHead(204);
  res.end();
}

async function handleCreateDish(req, res, userId) {
  const payload = await readBody(req);
  if (!payload) {
    sendJson(res, 400, { error: "Missing body" });
    return;
  }
  const { name, mealTypes = [] } = payload;
  if (!name || !Array.isArray(mealTypes) || mealTypes.length === 0) {
    sendJson(res, 400, { error: "Dish requires name and at least one meal type" });
    return;
  }

  const store = await getStore();
  const user = store.users.find((u) => u.id === userId);
  if (!user) {
    sendJson(res, 404, { error: "User not found" });
    return;
  }
  if (!Array.isArray(user.dishes)) user.dishes = [];
  const baseId = slugify(payload.id || name) || `dish-${Date.now()}`;
  const dishId = ensureUniqueDishId(user, baseId);
  const newDish = normalizeDish({
    ...payload,
    id: dishId,
  });
  if (!newDish) {
    sendJson(res, 400, { error: "Invalid dish payload" });
    return;
  }
  user.dishes.push(newDish);
  await persistStore(store);
  sendJson(res, 201, newDish);
}

async function handleUpdateDish(req, res, userId, dishId) {
  const payload = await readBody(req);
  if (!payload) {
    sendJson(res, 400, { error: "Missing body" });
    return;
  }
  const store = await getStore();
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
  const updatedDish = normalizeDish({ ...user.dishes[index], ...payload, id: dishId });
  if (!updatedDish) {
    sendJson(res, 400, { error: "Invalid dish payload" });
    return;
  }
  user.dishes[index] = updatedDish;
  await persistStore(store);
  sendJson(res, 200, updatedDish);
}

async function handleDeleteDish(req, res, userId, dishId) {
  const store = await getStore();
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
  await persistStore(store);
  res.writeHead(204);
  res.end();
}

async function handleGenerateSuggestions(req, res, userId) {
  const payload = await readBody(req);
  const store = await getStore();
  const user = store.users.find((u) => u.id === userId);
  if (!user) {
    sendJson(res, 404, { error: "User not found" });
    return;
  }
  if (payload && Array.isArray(payload.heuristics)) {
    setCustomStrategy(user, payload.heuristics);
  } else if (payload && payload.strategyId) {
    setPresetStrategy(user, payload.strategyId);
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
  await persistStore(store);
  sendJson(res, 200, suggestion);
}

async function handleSelection(req, res, userId) {
  const payload = await readBody(req);
  const { date, meal, dishId } = payload || {};
  if (!date || !meal || !dishId) {
    sendJson(res, 400, { error: "date, meal, and dishId are required" });
    return;
  }
  const store = await getStore();
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
  await persistStore(store);
  sendJson(res, 200, { date, meal, dishId });
}

async function handleApi(req, res, parsedUrl) {
  const parts = parsedUrl.pathname.split("/").filter(Boolean);
  if (req.method === "GET" && parts.length === 2 && parts[0] === "api" && parts[1] === "strategies") {
    await handleGetStrategies(req, res);
    return;
  }
  if (req.method === "GET" && parts.length === 2 && parts[0] === "api" && parts[1] === "users") {
    await handleGetUsers(req, res);
    return;
  }
  if (req.method === "GET" && parts.length === 3 && parts[0] === "api" && parts[1] === "users") {
    await handleGetUsers(req, res, parts[2]);
    return;
  }
  if (req.method === "POST" && parts.length === 2 && parts[0] === "api" && parts[1] === "users") {
    await handleCreateUser(req, res);
    return;
  }
  if (req.method === "PUT" && parts.length === 3 && parts[0] === "api" && parts[1] === "users") {
    await handleUpdateUser(req, res, parts[2]);
    return;
  }
  if (req.method === "DELETE" && parts.length === 3 && parts[0] === "api" && parts[1] === "users") {
    await handleDeleteUser(req, res, parts[2]);
    return;
  }
  if (req.method === "POST" && parts.length === 4 && parts[0] === "api" && parts[1] === "users" && parts[3] === "dishes") {
    await handleCreateDish(req, res, parts[2]);
    return;
  }
  if (req.method === "PUT" && parts.length === 5 && parts[0] === "api" && parts[1] === "users" && parts[3] === "dishes") {
    await handleUpdateDish(req, res, parts[2], parts[4]);
    return;
  }
  if (req.method === "DELETE" && parts.length === 5 && parts[0] === "api" && parts[1] === "users" && parts[3] === "dishes") {
    await handleDeleteDish(req, res, parts[2], parts[4]);
    return;
  }
  if (req.method === "POST" && parts.length === 4 && parts[0] === "api" && parts[1] === "users" && parts[3] === "suggestions") {
    await handleGenerateSuggestions(req, res, parts[2]);
    return;
  }
  if (req.method === "POST" && parts.length === 4 && parts[0] === "api" && parts[1] === "users" && parts[3] === "strategy") {
    await handleApplyStrategy(req, res, parts[2]);
    return;
  }
  if (req.method === "POST" && parts.length === 4 && parts[0] === "api" && parts[1] === "users" && parts[3] === "selection") {
    await handleSelection(req, res, parts[2]);
    return;
  }
  sendJson(res, 404, { error: "Not found" });
}

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (parsedUrl.pathname.startsWith("/api/")) {
    handleApi(req, res, parsedUrl).catch((err) => {
      console.error(err);
      sendJson(res, 500, { error: err.message || "Server error" });
    });
    return;
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
