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
  normalized.days = normalizeDays(normalized.days);
  return normalized;
}

function chooseDishForMeal(user, meal, dayKey) {
  const dishes = (user?.dishes || []).filter(
    (dish) => Array.isArray(dish.mealTypes) && dish.mealTypes.includes(meal)
  );
  if (dishes.length === 0) {
    return {
      dishId: null,
      dishName: null,
      reason: "No recommendation: no dishes entered for this meal type.",
    };
  }

  const scheduled = dishes.filter((dish) => Array.isArray(dish.days) && dish.days.includes(dayKey));
  if (scheduled.length) {
    const chosen = pickRandom(scheduled);
    return {
      dishId: chosen.id,
      dishName: chosen.name,
      reason: `Planned for ${WEEK_DAY_LABELS[dayKey] || capitalize(dayKey)}.`,
    };
  }

  const unscheduled = dishes.filter((dish) => !Array.isArray(dish.days) || dish.days.length === 0);
  if (unscheduled.length) {
    const chosen = pickRandom(unscheduled);
    return {
      dishId: chosen.id,
      dishName: chosen.name,
      reason: "No day selected; showing unscheduled dish.",
    };
  }

  const fallback = pickRandom(dishes);
  return {
    dishId: fallback.id,
    dishName: fallback.name,
    reason: "Borrowed from another day.",
  };
}

function buildSuggestionPlan(user, startDate, daysCount) {
  const meals = getMealsForUser(user);
  const plan = [];
  for (let i = 0; i < daysCount; i += 1) {
    const date = new Date(startDate.getTime());
    date.setUTCDate(startDate.getUTCDate() + i);
    const dayKey = getWeekdayKey(date);
    const entry = {
      date: formatIsoDate(date),
      weekday: WEEK_DAY_LABELS[dayKey] || capitalize(dayKey),
      meals: {},
      mealOrder: meals.slice(),
    };
    meals.forEach((meal) => {
      entry.meals[meal] = chooseDishForMeal(user, meal, dayKey);
    });
    plan.push(entry);
  }
  return plan;
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
  return normalized;
}

function readUsers() {
  try {
    const raw = fs.readFileSync(dataPath, "utf8");
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return { users: [] };
    if (!Array.isArray(data.users)) data.users = [];
    data.users = data.users.map((user, index) => normalizeUser(user) || { id: `user-${index}`, name: "", mealsPerDay: DEFAULT_MEALS_PER_DAY, dishes: [], selections: {} });
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
  const { id, name, mealTypes = [], description, notes, metadata, foodGroups, days } = payload;
  if (!name || !Array.isArray(mealTypes) || mealTypes.length === 0) {
    sendJson(res, 400, { error: "Dish requires name and at least one meal type" });
    return;
  }
  const dishId = id || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || `dish-${Date.now()}`;

  const store = readUsers();
  const user = store.users.find((u) => u.id === userId);
  if (!user) {
    sendJson(res, 404, { error: "User not found" });
    return;
  }
  if (!Array.isArray(user.dishes)) user.dishes = [];
  const exists = user.dishes.find((d) => d.id === dishId);
  if (exists) {
    sendJson(res, 409, { error: "Dish id already exists" });
    return;
  }
  const dish = normalizeDish({
    id: dishId,
    name,
    mealTypes,
    description,
    notes,
    metadata,
    foodGroups,
    days,
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
  const dish = user.dishes.find((d) => d.id === dishId);
  if (!dish) {
    sendJson(res, 404, { error: "Dish not found" });
    return;
  }
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
  writeUsers(store);
  sendJson(res, 200, dish);
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
