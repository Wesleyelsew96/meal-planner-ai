(() => {
  const SAMPLE_DATA = {
    users: [
      {
        id: "jason",
        name: "Wesley",
        mealsPerDay: 4,
        heuristics: ["avoidDuplicates", "unscheduled", "borrow"],
        strategy: { id: "balanced", customOrder: [] },
        dishes: [
          { id: "smoothie", name: "Eggs and Bacon", mealTypes: ["breakfast"], notes: "adsf", foodGroups: { meat: ["Eggs", "Bacon"], produce: [], starch: [], dairy: [] }, days: ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"], frequency: { mode: "days", days: ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"], ratio: null }, _ingredients: ["eggs","bacon"] },
          { id: "grain-bowl", name: "Turkey Sandwich", mealTypes: ["lunch"], metadata: { calories: 520 }, foodGroups: { meat: ["Turkey","Salami"], produce: ["Spinach"], starch: ["Bread"], dairy: ["Cheese"] }, days: ["monday","wednesday","thursday","sunday"], frequency: { mode: "days", days: ["monday","wednesday","thursday","sunday"], ratio: null }, _ingredients: ["turkey","salami","spinach","bread","cheese"] },
          { id: "sushi", name: "Costco", mealTypes: ["lunch"], foodGroups: { meat: ["Hotdog","Pepperoni"], produce: [], starch: ["Bread","Fries"], dairy: ["Cheese"] }, days: ["tuesday"], frequency: { mode: "days", days: ["tuesday"], ratio: null }, _ingredients: ["hotdog","pepperoni","bread","cheese"] },
          { id: "steak", name: "Chicken Pasta", mealTypes: ["dinner"], foodGroups: { meat: ["Chicken"], produce: [], starch: ["Pasta"], dairy: [] }, days: [], frequency: { mode: "days", days: [], ratio: null }, _ingredients: ["chicken","pasta"] },
          { id: "veggie-pasta", name: "Chicken + Rice", mealTypes: ["dinner"], foodGroups: { meat: ["Chicken"], produce: [], starch: ["Rice"], dairy: [] }, days: [], frequency: { mode: "days", days: [], ratio: null }, _ingredients: ["chicken","rice"] },
          { id: "pizzeria-leopold", name: "Pizzeria Leopold", mealTypes: ["lunch"], foodGroups: { meat: ["Pepperoni","Salami"], produce: ["Basil"], starch: ["Bread"], dairy: ["Cheese"] }, days: ["friday","saturday"], frequency: { mode: "days", days: ["friday","saturday"], ratio: null }, _ingredients: ["pepperoni","salami","basil","bread","cheese"] },
          { id: "chicken-fries", name: "Chicken + Fries", mealTypes: ["dinner"], foodGroups: { meat: ["Chicken"], produce: [], starch: ["Fries"], dairy: [] }, days: [], frequency: { mode: "days", days: [], ratio: null }, _ingredients: ["chicken","fries"] },
          { id: "burger-fries", name: "Burger + Fries", mealTypes: ["supper"], foodGroups: { meat: ["Burger"], produce: [], starch: ["Fries"], dairy: [] }, days: [], frequency: { mode: "ratio", ratio: { minDays: 3, maxDays: 4 }, days: [] }, _ingredients: ["burger","fries"] },
          { id: "steak-fries-asparagus", name: "Steak + Fries + Asparagus", mealTypes: ["supper"], foodGroups: { meat: ["Steak"], produce: [], starch: ["Fries"], dairy: [] }, days: [], frequency: { mode: "days", days: [], ratio: null }, _ingredients: ["steak","fries"] },
          { id: "pork-fries-green-beans", name: "Pulled Pork Sandwich + Fries", mealTypes: ["supper"], foodGroups: { meat: ["Pulled Pork"], produce: [], starch: ["Fries","Bread"], dairy: [] }, days: [], frequency: { mode: "ratio", ratio: { minDays: 7, maxDays: 7 }, days: [] }, _ingredients: ["pulled pork","fries","bread"] },
          { id: "tacos-fogon-lagunero", name: "Tacos (Fogon Lagunero)", mealTypes: ["supper"], foodGroups: { meat: ["Carnitas","Al Pastor"], produce: [], starch: ["Tacos"], dairy: [] }, days: ["tuesday"], frequency: { mode: "days", days: ["tuesday"], ratio: null }, _ingredients: ["carnitas","al pastor","tacos"] },
          { id: "chicken-noodles-asian", name: "Chicken + Noodles (Asian)", mealTypes: ["dinner"], foodGroups: { meat: ["Chicken"], produce: [], starch: ["Noodles"], dairy: [] }, days: [], frequency: { mode: "days", days: [], ratio: null }, _ingredients: ["chicken","noodles"] },
          { id: "chipotle-carnitas-bowl", name: "Chipotle Carnitas Bowl", mealTypes: ["supper"], foodGroups: { meat: ["Carnitas"], produce: [], starch: ["Rice"], dairy: [] }, days: [], frequency: { mode: "days", days: [], ratio: null }, _ingredients: ["carnitas","rice"] },
          { id: "pork-fries-green-beans-1", name: "Pork + Fries + Green Beans", mealTypes: ["supper"], foodGroups: { meat: ["Pork"], produce: ["Green Beans"], starch: ["Fries"], dairy: [] }, days: [], frequency: { mode: "ratio", ratio: { minDays: 6, maxDays: 8 }, days: [] }, _ingredients: ["pork","green beans","fries"] }
        ],
        selections: {},
        suggestions: null
      },
      {
        id: "wesley",
        name: "Jason",
        mealsPerDay: 3,
        heuristics: ["avoidDuplicates", "unscheduled", "borrow"],
        strategy: { id: "balanced", customOrder: [] },
        dishes: [
          { id: "eggs-bacon", name: "Eggs and Bacon", mealTypes: ["breakfast"], notes: "Daily go-to breakfast.", foodGroups: { meat: [], produce: [], starch: [], dairy: [] }, days: [], frequency: { mode: "days", days: [], ratio: null }, _ingredients: [] },
          { id: "chicken-salad", name: "Chicken Salad", mealTypes: ["lunch"], foodGroups: { meat: [], produce: [], starch: [], dairy: [] }, days: [], frequency: { mode: "days", days: [], ratio: null }, _ingredients: [] },
          { id: "wrap", name: "Turkey Wrap", mealTypes: ["lunch"], foodGroups: { meat: [], produce: [], starch: [], dairy: [] }, days: [], frequency: { mode: "days", days: [], ratio: null }, _ingredients: [] },
          { id: "salmon", name: "Salmon & Quinoa", mealTypes: ["dinner"], foodGroups: { meat: [], produce: [], starch: [], dairy: [] }, days: [], frequency: { mode: "days", days: [], ratio: null }, _ingredients: [] },
          { id: "stir-fry", name: "Tofu Stir Fry", mealTypes: ["dinner"], foodGroups: { meat: [], produce: [], starch: [], dairy: [] }, days: [], frequency: { mode: "days", days: [], ratio: null }, _ingredients: [] },
          { id: "taco-night", name: "Fish Tacos", mealTypes: ["dinner"], foodGroups: { meat: [], produce: [], starch: [], dairy: [] }, days: [], frequency: { mode: "days", days: [], ratio: null }, _ingredients: [] }
        ],
        selections: {},
        suggestions: null
      }
    ],
  };

  const MEAL_SETS = {
    2: ["breakfast", "dinner"],
    3: ["breakfast", "lunch", "dinner"],
    4: ["breakfast", "lunch", "dinner", "supper"],
  };

  const WEEKDAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

  const storageKey = "meal-planner-demo";
  const loadState = () => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return JSON.parse(raw);
    } catch (err) {
      console.warn("Local storage unavailable; falling back to defaults.", err);
    }
    return JSON.parse(JSON.stringify(SAMPLE_DATA));
  };

  let db = loadState();

  const persist = () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(db));
    } catch (err) {
      console.warn("Unable to persist demo data", err);
    }
  };

  const jsonResponse = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  const notFound = () => jsonResponse({ error: "Not found" }, 404);
  const badRequest = (msg) => jsonResponse({ error: msg || "Bad request" }, 400);

  const normalizeId = (name) =>
    String(name || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || `user-${Date.now()}`;

  const findUser = (id) => db.users.find((u) => u.id === id);

  const rotateSuggestion = (user, startDate, days) => {
    const meals = MEAL_SETS[user.mealsPerDay] || MEAL_SETS[3];
    const plan = [];
    const start = startDate ? new Date(startDate) : new Date();
    for (let i = 0; i < days; i += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      const iso = date.toISOString().slice(0, 10);
      const weekday = WEEKDAYS[date.getDay()];
      const mealsObj = {};
      meals.forEach((meal) => {
        const candidates = user.dishes.filter((d) => d.mealTypes?.includes(meal));
        if (!candidates.length) return;
        const idx = (date.getDate() + i) % candidates.length;
        const dish = candidates[idx];
        mealsObj[meal] = {
          dishId: dish.id,
          dishName: dish.name,
          reason: dish.frequency?.mode === "days" && (dish.frequency.days || []).length
            ? `Planned for ${weekday}.`
            : "Rotating dish.",
        };
      });
      plan.push({ date: iso, weekday, meals: mealsObj, mealOrder: meals.slice() });
    }
    return {
      generatedAt: new Date().toISOString(),
      startDate: startDate || new Date().toISOString().slice(0, 10),
      days,
      plan,
    };
  };

  const handleUsers = async (req) => {
    if (req.method === "GET") return jsonResponse(db.users);
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (!body.name) return badRequest("Name is required.");
      const id = normalizeId(body.name);
      const user = {
        id,
        name: body.name,
        mealsPerDay: Number(body.mealsPerDay) || 3,
        dishes: [],
        selections: {},
        suggestions: null,
        heuristics: Array.isArray(body.heuristics) ? body.heuristics : ["avoidDuplicates", "unscheduled", "borrow"],
        strategy: body.strategyId ? { id: body.strategyId, customOrder: [] } : { id: "balanced", customOrder: [] },
      };
      db.users.push(user);
      persist();
      return jsonResponse(user, 201);
    }
    return notFound();
  };

  const handleUser = async (req, userId) => {
    const user = findUser(userId);
    if (!user) return notFound();
    if (req.method === "GET") return jsonResponse(user);
    if (req.method === "PUT") {
      const body = await req.json().catch(() => ({}));
      if (body.name) user.name = body.name;
      if (body.mealsPerDay) user.mealsPerDay = Number(body.mealsPerDay) || user.mealsPerDay;
      if (body.strategyId) user.strategy = { id: body.strategyId, customOrder: [] };
      if (Array.isArray(body.heuristics)) user.heuristics = body.heuristics;
      persist();
      return jsonResponse(user);
    }
    if (req.method === "DELETE") {
      db.users = db.users.filter((u) => u.id !== userId);
      persist();
      return new Response(null, { status: 204 });
    }
    return notFound();
  };

  const handleDishes = async (req, userId) => {
    const user = findUser(userId);
    if (!user) return notFound();
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (!body.name || !Array.isArray(body.mealTypes) || body.mealTypes.length === 0) {
        return badRequest("Dish name and meal types are required.");
      }
      const id = normalizeId(body.name);
      const dish = {
        id,
        name: body.name,
        mealTypes: body.mealTypes.map((m) => String(m)),
        notes: body.notes || "",
        foodGroups: body.foodGroups || { meat: [], produce: [], starch: [], dairy: [] },
        frequency: body.frequency || { mode: "days", days: [], ratio: null },
        days: body.days || [],
      };
      user.dishes.push(dish);
      persist();
      return jsonResponse(dish, 201);
    }
    return notFound();
  };

  const handleDish = async (req, userId, dishId) => {
    const user = findUser(userId);
    if (!user) return notFound();
    const dish = user.dishes.find((d) => d.id === dishId);
    if (!dish) return notFound();
    if (req.method === "PUT") {
      const body = await req.json().catch(() => ({}));
      Object.assign(dish, {
        name: body.name ?? dish.name,
        mealTypes: Array.isArray(body.mealTypes) ? body.mealTypes : dish.mealTypes,
        notes: body.notes ?? dish.notes,
        foodGroups: body.foodGroups ?? dish.foodGroups,
        frequency: body.frequency ?? dish.frequency,
        days: body.days ?? dish.days,
      });
      persist();
      return jsonResponse(dish);
    }
    if (req.method === "DELETE") {
      user.dishes = user.dishes.filter((d) => d.id !== dishId);
      persist();
      return new Response(null, { status: 204 });
    }
    return notFound();
  };

  const handleSuggestions = async (req, userId) => {
    const user = findUser(userId);
    if (!user) return notFound();
    if (req.method !== "POST") return notFound();
    const body = await req.json().catch(() => ({}));
    const days = Math.min(7, Math.max(1, Number(body.days) || 1));
    const suggestion = rotateSuggestion(user, body.startDate, days);
    user.suggestions = suggestion;
    persist();
    return jsonResponse(suggestion);
  };

  const router = async (url, init = {}) => {
    const u = new URL(url, window.location.origin);
    const path = u.pathname;
    if (!path.startsWith("/api/")) return null;
    const segments = path.replace(/^\/+/, "").split("/");
    // /api/users
    if (segments[1] === "users" && segments.length === 2) {
      return handleUsers(new Request(url, init));
    }
    // /api/users/:id
    if (segments[1] === "users" && segments[2]) {
      const userId = segments[2];
      if (segments.length === 3) return handleUser(new Request(url, init), userId);
      // /api/users/:id/dishes
      if (segments[3] === "dishes" && segments.length === 4) {
        return handleDishes(new Request(url, init), userId);
      }
      // /api/users/:id/dishes/:dishId
      if (segments[3] === "dishes" && segments[4]) {
        return handleDish(new Request(url, init), userId, segments[4]);
      }
      // /api/users/:id/suggestions
      if (segments[3] === "suggestions") {
        return handleSuggestions(new Request(url, init), userId);
      }
    }
    return null;
  };

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    const match = await router(url, init);
    if (match) return match;
    return originalFetch(input, init);
  };

  // Expose reset for debugging
  window.__mealPlannerDemoReset = () => {
    db = JSON.parse(JSON.stringify(SAMPLE_DATA));
    persist();
    return db;
  };
})();
