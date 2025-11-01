const http = require("http");
const fs = require("fs");
const path = require("path");

const dataPath = path.join(__dirname, "..", "data", "users.json");
const publicDir = path.join(__dirname, "..", "public");

function readUsers() {
  const raw = fs.readFileSync(dataPath, "utf8");
  return JSON.parse(raw);
}

function writeUsers(data) {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
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

async function handleCreateDish(req, res, userId) {
  const payload = await readBody(req);
  if (!payload) {
    sendJson(res, 400, { error: "Missing body" });
    return;
  }
  const { id, name, mealTypes = [], description, notes, metadata } = payload;
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
  const dish = { id: dishId, name, mealTypes };
  if (description) dish.description = String(description);
  if (notes) dish.notes = String(notes);
  if (metadata && typeof metadata === "object") dish.metadata = metadata;
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
  writeUsers(store);
  sendJson(res, 200, dish);
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
  if (req.method === "POST" && parts.length === 4 && parts[0] === "api" && parts[1] === "users" && parts[3] === "dishes") {
    return handleCreateDish(req, res, parts[2]);
  }
  if (req.method === "PUT" && parts.length === 5 && parts[0] === "api" && parts[1] === "users" && parts[3] === "dishes") {
    return handleUpdateDish(req, res, parts[2], parts[4]);
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
