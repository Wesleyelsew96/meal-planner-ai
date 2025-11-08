const DEFAULT_MEAL_MIN = 2;
const DEFAULT_MEAL_MAX = 4;
const DEFAULT_MEALS_PER_DAY = 3;

const MEAL_SETS = {
  2: ["breakfast", "dinner"],
  3: ["breakfast", "lunch", "dinner"],
  4: ["breakfast", "lunch", "dinner", "supper"],
};

const MEAL_LABELS = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  supper: "Supper",
};

const WEEK_DAYS = [
  { key: "monday", label: "Mon" },
  { key: "tuesday", label: "Tue" },
  { key: "wednesday", label: "Wed" },
  { key: "thursday", label: "Thu" },
  { key: "friday", label: "Fri" },
  { key: "saturday", label: "Sat" },
  { key: "sunday", label: "Sun" },
];

const FOOD_GROUP_DEFS = [
  { key: "meat", label: "Meat" },
  { key: "produce", label: "Produce" },
  { key: "starch", label: "Starch" },
  { key: "dairy", label: "Dairy" },
];

function getDefaultFoodGroups() {
  return FOOD_GROUP_DEFS.reduce((acc, group) => {
    acc[group.key] = [];
    return acc;
  }, {});
}

function cloneFoodGroups(source) {
  const target = getDefaultFoodGroups();
  if (!source || typeof source !== "object") return target;
  FOOD_GROUP_DEFS.forEach(({ key }) => {
    target[key] = Array.isArray(source[key])
      ? source[key].map((item) => String(item || ""))
      : [];
  });
  return target;
}

const state = {
  users: [],
  currentUser: null,
  editingDishId: null,
  dishFoodGroups: getDefaultFoodGroups(),
  dishDays: [],
};

const elements = {
  userSelect: document.getElementById("user-select"),
  userForm: document.getElementById("user-form"),
  userName: document.getElementById("user-name"),
  userMeals: document.getElementById("user-meals"),
  userCreate: document.getElementById("user-create"),
  userSave: document.getElementById("user-save"),
  userDelete: document.getElementById("user-delete"),
  userStatus: document.getElementById("user-status"),
  userSummary: document.getElementById("user-summary"),
  dishForm: document.getElementById("dish-form"),
  dishId: document.getElementById("dish-id"),
  dishName: document.getElementById("dish-name"),
  dishDays: document.getElementById("dish-days"),
  mealTypeOptions: document.getElementById("meal-type-options"),
  dishNotes: document.getElementById("dish-notes"),
  foodGroups: document.getElementById("food-group-grid"),
  dishColumns: document.getElementById("dish-columns"),
  dishStatus: document.getElementById("dish-form-status"),
  dishReset: document.getElementById("dish-reset"),
  dishDelete: document.getElementById("dish-delete"),
  suggestionStatus: document.getElementById("suggestion-status"),
  suggestionForm: document.getElementById("suggestion-form"),
  suggestionDate: document.getElementById("suggestion-date"),
  suggestionDays: document.getElementById("suggestion-days"),
  suggestions: document.getElementById("suggestions"),
};

function clampMealsPerDay(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return DEFAULT_MEALS_PER_DAY;
  return Math.min(DEFAULT_MEAL_MAX, Math.max(DEFAULT_MEAL_MIN, num));
}

function getMealsPerDayFromInput() {
  if (!elements.userMeals) return DEFAULT_MEALS_PER_DAY;
  return clampMealsPerDay(elements.userMeals.value);
}

function renderMealTypeOptions(selectedMeals = getSelectedMealTypes()) {
  if (!elements.mealTypeOptions) return;
  const meals = getAvailableMealTypes();
  elements.mealTypeOptions.innerHTML = "";

  if (!state.currentUser || meals.length === 0) {
    const empty = document.createElement("p");
    empty.className = "food-group-empty";
    empty.textContent = "Select a user to choose meal types.";
    elements.mealTypeOptions.appendChild(empty);
    return;
  }

  const selectedSet = new Set(
    selectedMeals.filter((meal) => meals.includes(meal))
  );

  meals.forEach((meal) => {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = meal;
    checkbox.checked = selectedSet.has(meal);
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(MEAL_LABELS[meal] || meal));
    elements.mealTypeOptions.appendChild(label);
  });
}

function getSelectedMealTypes() {
  if (!elements.mealTypeOptions) return [];
  const inputs = elements.mealTypeOptions.querySelectorAll('input[type="checkbox"]');
  return Array.from(inputs)
    .filter((input) => input.checked)
    .map((input) => input.value);
}

function renderFoodGroupsEditor() {
  if (!elements.foodGroups) return;
  elements.foodGroups.innerHTML = "";
  FOOD_GROUP_DEFS.forEach(({ key, label }) => {
    const column = document.createElement("div");
    column.className = "food-group-column";
    column.dataset.group = key;

    const header = document.createElement("div");
    header.className = "food-group-header";
    const title = document.createElement("span");
    title.textContent = label;
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "icon-button add";
    addBtn.textContent = "+";
    addBtn.title = `Add ${label} item`;
    addBtn.addEventListener("click", () => addFoodGroupItem(key));
    header.appendChild(title);
    header.appendChild(addBtn);
    column.appendChild(header);

    const list = document.createElement("div");
    list.className = "food-group-list";
    const items = state.dishFoodGroups[key] || [];
    if (items.length === 0) {
      const empty = document.createElement("p");
      empty.className = "food-group-empty";
      empty.textContent = "No items yet.";
      list.appendChild(empty);
    } else {
      items.forEach((value, index) => {
        const row = document.createElement("div");
        row.className = "food-group-row";
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "icon-button remove";
        removeBtn.textContent = "-";
        removeBtn.title = "Remove item";
        removeBtn.addEventListener("click", () => removeFoodGroupItem(key, index));
        const input = document.createElement("input");
        input.type = "text";
        input.value = value;
        input.placeholder = `Add ${label.toLowerCase()}`;
        input.dataset.group = key;
        input.dataset.index = String(index);
        input.addEventListener("input", (event) => updateFoodGroupItem(key, index, event.target.value));
        row.appendChild(removeBtn);
        row.appendChild(input);
        list.appendChild(row);
      });
    }
    column.appendChild(list);
    elements.foodGroups.appendChild(column);
  });
}

function addFoodGroupItem(groupKey) {
  if (!state.dishFoodGroups[groupKey]) state.dishFoodGroups[groupKey] = [];
  state.dishFoodGroups[groupKey].push("");
  renderFoodGroupsEditor();
}

function removeFoodGroupItem(groupKey, index) {
  if (!state.dishFoodGroups[groupKey]) return;
  state.dishFoodGroups[groupKey].splice(index, 1);
  renderFoodGroupsEditor();
}

function updateFoodGroupItem(groupKey, index, value) {
  if (!state.dishFoodGroups[groupKey]) return;
  state.dishFoodGroups[groupKey][index] = value;
}

function getFoodGroupsPayload() {
  const payload = {};
  FOOD_GROUP_DEFS.forEach(({ key }) => {
    const list = state.dishFoodGroups[key] || [];
    payload[key] = list
      .map((item) => String(item || "").trim())
      .filter((item) => item.length > 0);
  });
  return payload;
}
function getAvailableMealTypes() {
  if (!state.currentUser) return [];
  const mealsPerDay = getMealsPerDayFromInput();
  return (MEAL_SETS[mealsPerDay] || MEAL_SETS[DEFAULT_MEALS_PER_DAY]).slice();
}

function getDisplayMeals(user = state.currentUser) {
  if (!user) return MEAL_SETS[DEFAULT_MEALS_PER_DAY].slice();
  const meals = MEAL_SETS[user.mealsPerDay] || MEAL_SETS[DEFAULT_MEALS_PER_DAY];
  return meals.slice();
}

function ensureSuggestionStructure(raw) {
  if (!raw || typeof raw !== "object") {
    return { generatedAt: null, startDate: null, days: 0, plan: [] };
  }
  if (!Array.isArray(raw.plan)) raw.plan = [];
  return raw;
}

function formatMeal(meal) {
  if (!meal) return "";
  return meal.charAt(0).toUpperCase() + meal.slice(1);
}

function clampSuggestionDays(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  if (n < 1) return 1;
  if (n > 7) return 7;
  return Math.round(n);
}

function getApiUrl(path) {
  if (typeof window === "undefined") return path;
  if (window.location.protocol === "file:" || !window.location.origin || window.location.origin === "null") {
    return `http://localhost:3000${path}`;
  }
  return path;
}

function setDishDays(days) {
  state.dishDays = Array.isArray(days)
    ? days
      .map((day) => String(day || "").toLowerCase())
      .filter((day, index, array) => WEEK_DAYS.some((def) => def.key === day) && array.indexOf(day) === index)
    : [];
}

function renderDayCheckboxes(selectedDays = state.dishDays) {
  if (!elements.dishDays) return;
  setDishDays(selectedDays);
  elements.dishDays.innerHTML = "";
  const selectedSet = new Set(state.dishDays);
  WEEK_DAYS.forEach((day) => {
    const wrapper = document.createElement("label");
    wrapper.className = "day-checkbox";
    const caption = document.createElement("span");
    caption.textContent = day.label;
    caption.setAttribute("aria-hidden", "true");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = day.key;
    checkbox.checked = selectedSet.has(day.key);
    checkbox.addEventListener("change", (event) => toggleDaySelection(day.key, event.target.checked));
    wrapper.appendChild(caption);
    wrapper.appendChild(checkbox);
    elements.dishDays.appendChild(wrapper);
  });
}

function toggleDaySelection(dayKey, isChecked) {
  const day = String(dayKey || "").toLowerCase();
  if (!WEEK_DAYS.some((def) => def.key === day)) return;
  const existing = new Set(state.dishDays);
  if (isChecked) {
    existing.add(day);
  } else {
    existing.delete(day);
  }
  state.dishDays = Array.from(existing);
}

async function init() {
  bindEvents();
  renderMealTypeOptions();
  renderFoodGroupsEditor();
  renderDayCheckboxes();
  await loadUsers();
  setDefaultDate();
}

function bindEvents() {
  if (elements.userSelect) {
    elements.userSelect.addEventListener("change", (event) => {
      const userId = event.target.value;
      if (userId) selectUser(userId);
      else clearCurrentUser();
    });
  }

  if (elements.userForm) {
    elements.userForm.addEventListener("submit", (event) => {
      event.preventDefault();
      handleUserSave();
    });
  }

  if (elements.userMeals) {
    elements.userMeals.addEventListener("change", () => {
      renderMealTypeOptions();
    });
  }

  if (elements.userCreate) {
    elements.userCreate.addEventListener("click", (event) => {
      event.preventDefault();
      handleUserCreate();
    });
  }

  if (elements.userDelete) {
    elements.userDelete.addEventListener("click", (event) => {
      event.preventDefault();
      handleUserDelete();
    });
  }

  if (elements.dishForm) {
    elements.dishForm.addEventListener("submit", handleDishSubmit);
  }

  if (elements.dishReset) {
    elements.dishReset.addEventListener("click", () => resetDishForm());
  }

  if (elements.dishDelete) {
    elements.dishDelete.addEventListener("click", () => handleDishDelete());
  }

  if (elements.suggestionForm) {
    elements.suggestionForm.addEventListener("submit", (event) => {
      event.preventDefault();
      handleSuggestionSubmit();
    });
  }
}

function setDefaultDate() {
  const today = new Date();
  const iso = today.toISOString().slice(0, 10);
  elements.suggestionDate.value = iso;
}

async function loadUsers(preferredId) {
  try {
    const res = await fetch(getApiUrl("/api/users"));
    if (!res.ok) throw new Error(`Failed to load users (${res.status})`);
    const users = await res.json();
    state.users = Array.isArray(users) ? users : [];
    renderUserOptions();
    const targetId = preferredId
      || (state.currentUser && state.users.some((user) => user.id === state.currentUser.id) ? state.currentUser.id : null)
      || (state.users[0] && state.users[0].id);
    if (targetId) {
      await selectUser(targetId);
    } else {
      clearCurrentUser();
    }
    return true;
  } catch (err) {
    console.error("Unable to load users", err);
    setUserStatus("Unable to load users.", true);
    clearCurrentUser();
    return false;
  }
}

function renderUserOptions() {
  if (!elements.userSelect) return;
  elements.userSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  const hasUsers = state.users.length > 0;
  placeholder.textContent = hasUsers ? "Select user" : "No users";
  placeholder.value = "";
  placeholder.disabled = true;
  placeholder.selected = !state.currentUser;
  elements.userSelect.appendChild(placeholder);

  state.users.forEach((user) => {
    const opt = document.createElement("option");
    opt.value = user.id;
    opt.textContent = user.name;
    if (state.currentUser && state.currentUser.id === user.id) {
      opt.selected = true;
    }
    elements.userSelect.appendChild(opt);
  });

  elements.userSelect.disabled = state.users.length === 0;
}

function clearCurrentUser() {
  state.currentUser = null;
  state.editingDishId = null;
  if (elements.userSelect) {
    elements.userSelect.value = "";
  }
  fillUserForm();
  renderUserSummary();
  renderDishes();
  if (elements.suggestions) {
    elements.suggestions.innerHTML = "<p>Select a user to view suggestions.</p>";
  }
  renderMealTypeOptions([]);
  state.dishFoodGroups = getDefaultFoodGroups();
  renderFoodGroupsEditor();
  setSuggestionStatus("");
}

function fillUserForm() {
  const hasUser = Boolean(state.currentUser);
  if (elements.userName) {
    elements.userName.value = hasUser ? (state.currentUser.name || "") : "";
  }
  if (elements.userMeals) {
    const value = hasUser ? clampMealsPerDay(state.currentUser.mealsPerDay) : DEFAULT_MEALS_PER_DAY;
    elements.userMeals.value = String(value);
  }
  if (elements.userSave) {
    elements.userSave.disabled = !hasUser;
  }
  if (elements.userDelete) {
    elements.userDelete.disabled = !hasUser;
  }
  renderMealTypeOptions();
}

async function selectUser(userId) {
  const res = await fetch(getApiUrl(`/api/users/${userId}`));
  if (!res.ok) {
    elements.userSummary.textContent = "Unable to load user.";
    return;
  }
  const user = await res.json();
  state.currentUser = {
    ...user,
    mealsPerDay: clampMealsPerDay(user.mealsPerDay ?? DEFAULT_MEALS_PER_DAY),
    suggestions: ensureSuggestionStructure(user.suggestions),
  };
  state.editingDishId = null;
  if (elements.userSelect) {
    elements.userSelect.value = userId;
  }
  fillUserForm();
  renderUserSummary();
  renderDishes();
  resetDishForm();
  renderSuggestions();
  setUserStatus("");
  setSuggestionStatus("");
}

function renderUserSummary() {
  if (!state.currentUser) {
    elements.userSummary.textContent = "Add or select a user to begin.";
    return;
  }
  const counts = {
    breakfast: 0,
    lunch: 0,
    dinner: 0,
  };
  (state.currentUser.dishes || []).forEach((dish) => {
    dish.mealTypes.forEach((meal) => {
      if (counts[meal] !== undefined) counts[meal] += 1;
    });
  });
  const mealsPerDay = state.currentUser.mealsPerDay || DEFAULT_MEALS_PER_DAY;
  elements.userSummary.textContent = `Meals per day: ${mealsPerDay} - Dishes: Breakfast ${counts.breakfast}, Lunch ${counts.lunch}, Dinner ${counts.dinner}`;
}

function getUserFormPayload() {
  const name = elements.userName ? elements.userName.value.trim() : "";
  const mealsPerDay = getMealsPerDayFromInput();
  return { name, mealsPerDay };
}

async function handleUserCreate() {
  const payload = getUserFormPayload();
  if (!payload.name) {
    setUserStatus("Name is required.", true);
    return;
  }
  try {
    const res = await fetch(getApiUrl("/api/users"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data) {
      throw new Error((data && data.error) || "Unable to create user.");
    }
    const user = data;
    setUserStatus(`Created ${user.name || user.id}.`);
    await loadUsers(user.id);
  } catch (err) {
    console.error("Failed to create user", err);
    setUserStatus(err.message || "Unable to create user.", true);
  }
}

async function handleUserSave() {
  if (!state.currentUser) {
    setUserStatus("Select a user before saving.", true);
    return;
  }
  const payload = getUserFormPayload();
  if (!payload.name) {
    setUserStatus("Name is required.", true);
    return;
  }
  try {
    const res = await fetch(getApiUrl(`/api/users/${state.currentUser.id}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data) {
      throw new Error((data && data.error) || "Unable to save user.");
    }
    const updated = data;
    state.currentUser = {
      ...state.currentUser,
      ...updated,
      mealsPerDay: clampMealsPerDay(updated.mealsPerDay ?? payload.mealsPerDay),
      suggestions: ensureSuggestionStructure(updated.suggestions ?? state.currentUser.suggestions),
    };
    fillUserForm();
    renderUserSummary();
    setUserStatus("User saved.");
    await loadUsers(state.currentUser.id);
  } catch (err) {
    console.error("Failed to save user", err);
    setUserStatus(err.message || "Unable to save user.", true);
  }
}

async function handleUserDelete() {
  if (!state.currentUser) {
    setUserStatus("Select a user before deleting.", true);
    return;
  }
  const confirmed = window.confirm(`Delete ${state.currentUser.name || state.currentUser.id}?`);
  if (!confirmed) return;
  try {
    const res = await fetch(getApiUrl(`/api/users/${state.currentUser.id}`), {
      method: "DELETE",
    });
    if (!res.ok && res.status !== 204) {
      const info = await res.json().catch(() => ({}));
      throw new Error(info.error || "Unable to delete user.");
    }
    setUserStatus("User deleted.");
    await loadUsers();
  } catch (err) {
    console.error("Failed to delete user", err);
    setUserStatus(err.message || "Unable to delete user.", true);
  }
}

function renderDishes() {
  if (!elements.dishColumns) return;
  if (!state.currentUser) {
    elements.dishColumns.innerHTML = '<p class="empty-state">Add or select a user to manage dishes.</p>';
    return;
  }
  const meals = getDisplayMeals(state.currentUser);
  elements.dishColumns.innerHTML = "";
  meals.forEach((meal) => {
    const column = document.createElement("div");
    column.className = "dish-column";
    column.dataset.meal = meal;

    const heading = document.createElement("h3");
    heading.textContent = MEAL_LABELS[meal] || meal;
    column.appendChild(heading);

    const list = document.createElement("ul");
    list.className = "dish-list";

    const dishes = state.currentUser.dishes.filter(
      (dish) => Array.isArray(dish.mealTypes) && dish.mealTypes.includes(meal)
    );

    if (dishes.length === 0) {
      const empty = document.createElement("li");
      empty.textContent = "No dishes yet.";
      empty.className = "empty";
      list.appendChild(empty);
    } else {
      dishes.forEach((dish) => {
        const li = document.createElement("li");
        li.dataset.dishId = dish.id;
        const header = document.createElement("div");
        header.textContent = dish.name;
        li.appendChild(header);
        const meta = formatDishMeta(dish);
        if (meta) {
          const metaEl = document.createElement("div");
          metaEl.className = "dish-meta";
          metaEl.textContent = meta;
          li.appendChild(metaEl);
        }
        li.addEventListener("click", () => startDishEdit(dish));
        list.appendChild(li);
      });
    }

    column.appendChild(list);
    elements.dishColumns.appendChild(column);
  });
}

function formatDishMeta(dish) {
  if (!Array.isArray(dish.days) || dish.days.length === 0) return "";
  const labels = dish.days
    .map((day) => {
      const found = WEEK_DAYS.find((d) => d.key === day);
      return found ? found.label : day;
    })
    .join(", ");
  return `Days: ${labels}`;
}

function startDishEdit(dish) {
  state.editingDishId = dish.id;
  if (elements.dishId) elements.dishId.value = dish.id;
  if (elements.dishName) elements.dishName.value = dish.name || "";
  renderMealTypeOptions(Array.isArray(dish.mealTypes) ? dish.mealTypes : []);
  if (elements.dishNotes) {
    elements.dishNotes.value = dish.notes || dish.description || "";
  }
  state.dishFoodGroups = cloneFoodGroups(dish.foodGroups);
  renderFoodGroupsEditor();
  renderDayCheckboxes(Array.isArray(dish.days) ? dish.days : []);
  if (elements.dishDelete) {
    elements.dishDelete.disabled = false;
  }
  setDishStatus(`Editing ${dish.name}`);
}

function resetDishForm() {
  state.editingDishId = null;
  state.dishFoodGroups = getDefaultFoodGroups();
  if (elements.dishId) elements.dishId.value = "";
  if (elements.dishName) elements.dishName.value = "";
  renderMealTypeOptions([]);
  if (elements.dishNotes) elements.dishNotes.value = "";
  renderFoodGroupsEditor();
  renderDayCheckboxes([]);
  if (elements.dishDelete) {
    elements.dishDelete.disabled = true;
  }
  setDishStatus("");
}

async function handleDishDelete() {
  if (!state.currentUser || !state.editingDishId) {
    setDishStatus("Select a dish before deleting.", true);
    return;
  }
  const dishName = elements.dishName ? elements.dishName.value || state.editingDishId : state.editingDishId;
  const confirmed = window.confirm(`Delete ${dishName}? This cannot be undone.`);
  if (!confirmed) return;

  const userId = state.currentUser.id;
  const url = `/api/users/${userId}/dishes/${state.editingDishId}`;
  try {
    const res = await fetch(getApiUrl(url), { method: "DELETE" });
    if (!res.ok && res.status !== 204) {
      const info = await res.json().catch(() => ({ error: "Unable to delete" }));
      throw new Error(info.error || "Unable to delete dish.");
    }
    setDishStatus("Dish deleted.");
    await selectUser(userId);
    resetDishForm();
  } catch (err) {
    console.error("Failed to delete dish", err);
    setDishStatus(err.message || "Unable to delete dish.", true);
  }
}

async function handleDishSubmit(event) {
  event.preventDefault();
  if (!state.currentUser) return;

  const name = elements.dishName.value.trim();
  const mealTypes = getSelectedMealTypes();
  const notes = elements.dishNotes.value.trim();
  const foodGroups = getFoodGroupsPayload();
  const plannedDays = state.dishDays.slice();
  if (!name) {
    setDishStatus("Name is required", true);
    return;
  }
  if (mealTypes.length === 0) {
    setDishStatus("Choose at least one meal type", true);
    return;
  }

  const payload = { name, mealTypes, foodGroups, days: plannedDays };
  if (notes) payload.notes = notes;

  const userId = state.currentUser.id;
  let url;
  let method;
  if (state.editingDishId) {
    url = `/api/users/${userId}/dishes/${state.editingDishId}`;
    method = "PUT";
  } else {
    url = `/api/users/${userId}/dishes`;
    method = "POST";
  }

  const res = await fetch(getApiUrl(url), {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const info = await res.json().catch(() => ({ error: "Unable to save" }));
    setDishStatus(info.error || "Unable to save", true);
    return;
  }

  setDishStatus("Saved", false);
  await selectUser(userId);
}

function setUserStatus(message, isError) {
  if (!elements.userStatus) return;
  elements.userStatus.textContent = message || "";
  elements.userStatus.classList.toggle("error", Boolean(isError));
}

function setDishStatus(message, isError) {
  elements.dishStatus.textContent = message;
  if (isError) {
    elements.dishStatus.classList.add("error");
  } else {
    elements.dishStatus.classList.remove("error");
  }
}

function setSuggestionStatus(message, isError) {
  if (!elements.suggestionStatus) return;
  elements.suggestionStatus.textContent = message || "";
  elements.suggestionStatus.classList.toggle("error", Boolean(isError));
}

async function handleSuggestionSubmit() {
  if (!state.currentUser) {
    setSuggestionStatus("Select a user first.", true);
    return;
  }
  const days = clampSuggestionDays(elements.suggestionDays?.value);
  if (elements.suggestionDays) {
    elements.suggestionDays.value = String(days);
  }
  const payload = {
    startDate: elements.suggestionDate?.value || null,
    days,
  };

  try {
    setSuggestionStatus("Generating suggestions...");
    const res = await fetch(getApiUrl(`/api/users/${state.currentUser.id}/suggestions`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const info = await res.json().catch(() => ({}));
      throw new Error(info.error || "Unable to generate suggestions.");
    }
    const suggestion = await res.json();
    state.currentUser.suggestions = ensureSuggestionStructure(suggestion);
    renderSuggestions();
    setSuggestionStatus("Suggestions updated.");
  } catch (err) {
    console.error("Failed to generate suggestions", err);
    const message = err && err.message === "Failed to fetch"
      ? "Unable to reach the server. Please run `npm start` and try again."
      : err.message || "Unable to generate suggestions.";
    setSuggestionStatus(message, true);
  }
}

function renderSuggestions() {
  if (!state.currentUser) {
    elements.suggestions.innerHTML = "<p>Select a user to view suggestions.</p>";
    return;
  }
  const suggestion = ensureSuggestionStructure(state.currentUser.suggestions);
  state.currentUser.suggestions = suggestion;
  if (!suggestion.plan.length) {
    elements.suggestions.innerHTML = "<p>No suggestions yet. Click Suggest to generate a plan.</p>";
    return;
  }
  const selections = state.currentUser.selections || {};

  elements.suggestions.innerHTML = "";
  suggestion.plan.forEach((day) => {
    const card = document.createElement("div");
    card.className = "suggestion-card";
    const title = document.createElement("h4");
    title.textContent = `${day.weekday || ""} · ${day.date || ""}`;
    card.appendChild(title);

    const meals = Array.isArray(day.mealOrder) ? day.mealOrder : Object.keys(day.meals || {});
    meals.forEach((meal) => {
      const entry = day.meals && day.meals[meal];
      const row = document.createElement("div");
      row.className = "suggestion-row";

      const labelWrapper = document.createElement("div");
      labelWrapper.className = "suggestion-label";
      const label = document.createElement("div");
      if (entry && entry.dishId) {
        label.textContent = `${formatMeal(meal)}: ${entry.dishName || entry.dishId}`;
      } else {
        label.textContent = `${formatMeal(meal)}: (no recommendation)`;
      }
      labelWrapper.appendChild(label);
      if (entry && entry.reason) {
        const note = document.createElement("small");
        note.textContent = entry.reason;
        labelWrapper.appendChild(note);
      }
      row.appendChild(labelWrapper);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "secondary";
      const selectedId = selections[day.date]?.[meal];

      if (entry && entry.dishId) {
        if (selectedId === entry.dishId) {
          btn.textContent = "Selected";
          btn.disabled = true;
          const selectedLabel = document.createElement("span");
          selectedLabel.className = "selected";
          selectedLabel.textContent = "(selected)";
          labelWrapper.appendChild(selectedLabel);
        } else {
          btn.textContent = "Choose";
          btn.addEventListener("click", () => selectSuggestion(day.date, meal, entry.dishId));
        }
      } else {
        btn.textContent = "No dish";
        btn.disabled = true;
      }

      row.appendChild(btn);
      card.appendChild(row);
    });

    elements.suggestions.appendChild(card);
  });
}

async function selectSuggestion(date, meal, dishId) {
  if (!state.currentUser || !dishId) return;
  const userId = state.currentUser.id;
  const res = await fetch(getApiUrl(`/api/users/${userId}/selection`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date, meal, dishId }),
  });
  if (!res.ok) {
    alert("Unable to save selection");
    return;
  }
  if (!state.currentUser.selections) state.currentUser.selections = {};
  if (!state.currentUser.selections[date]) state.currentUser.selections[date] = {};
  state.currentUser.selections[date][meal] = dishId;
  renderSuggestions();
}

init().catch((err) => {
  console.error("Failed to initialize", err);
  elements.suggestions.innerHTML = "<p>Unable to load application.</p>";
});
