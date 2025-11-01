const state = {
  users: [],
  currentUser: null,
  editingDishId: null,
};

const elements = {
  userSelect: document.getElementById("user-select"),
  userSummary: document.getElementById("user-summary"),
  dishForm: document.getElementById("dish-form"),
  dishId: document.getElementById("dish-id"),
  dishName: document.getElementById("dish-name"),
  mealBreakfast: document.getElementById("meal-breakfast"),
  mealLunch: document.getElementById("meal-lunch"),
  mealDinner: document.getElementById("meal-dinner"),
  dishNotes: document.getElementById("dish-notes"),
  dishMetadata: document.getElementById("dish-metadata"),
  dishStatus: document.getElementById("dish-form-status"),
  dishReset: document.getElementById("dish-reset"),
  lists: {
    breakfast: document.getElementById("breakfast-list"),
    lunch: document.getElementById("lunch-list"),
    dinner: document.getElementById("dinner-list"),
  },
  suggestionForm: document.getElementById("suggestion-form"),
  suggestionDate: document.getElementById("suggestion-date"),
  suggestionDays: document.getElementById("suggestion-days"),
  suggestions: document.getElementById("suggestions"),
};

async function init() {
  bindEvents();
  await loadUsers();
  setDefaultDate();
}

function bindEvents() {
  elements.userSelect.addEventListener("change", (event) => {
    const userId = event.target.value;
    if (userId) selectUser(userId);
  });

  elements.dishForm.addEventListener("submit", handleDishSubmit);
  elements.dishReset.addEventListener("click", () => resetDishForm());

  elements.suggestionForm.addEventListener("submit", (event) => {
    event.preventDefault();
    renderSuggestions();
  });
}

function setDefaultDate() {
  const today = new Date();
  const iso = today.toISOString().slice(0, 10);
  elements.suggestionDate.value = iso;
}

async function loadUsers() {
  const res = await fetch("/api/users");
  const users = await res.json();
  state.users = users;
  renderUserOptions();
  if (users.length > 0) {
    selectUser(users[0].id);
  }
}

function renderUserOptions() {
  elements.userSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.textContent = "Select user";
  placeholder.value = "";
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
}

async function selectUser(userId) {
  const res = await fetch(`/api/users/${userId}`);
  if (!res.ok) {
    elements.userSummary.textContent = "Unable to load user.";
    return;
  }
  const user = await res.json();
  state.currentUser = user;
  state.editingDishId = null;
  elements.userSelect.value = userId;
  renderUserSummary();
  renderDishes();
  resetDishForm();
  renderSuggestions();
}

function renderUserSummary() {
  if (!state.currentUser) {
    elements.userSummary.textContent = "";
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
  elements.userSummary.textContent = `Dishes - Breakfast: ${counts.breakfast}, Lunch: ${counts.lunch}, Dinner: ${counts.dinner}`;
}

function renderDishes() {
  if (!state.currentUser) return;
  const meals = ["breakfast", "lunch", "dinner"];
  meals.forEach((meal) => {
    const list = elements.lists[meal];
    list.innerHTML = "";
    const dishes = state.currentUser.dishes.filter((dish) => dish.mealTypes.includes(meal));
    if (dishes.length === 0) {
      const empty = document.createElement("li");
      empty.textContent = "No dishes yet.";
      empty.className = "empty";
      list.appendChild(empty);
      return;
    }
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
  });
}

function formatDishMeta(dish) {
  const bits = [];
  if (dish.notes) bits.push(dish.notes);
  if (dish.description) bits.push(dish.description);
  if (dish.metadata && typeof dish.metadata === "object") {
    const metaBits = Object.entries(dish.metadata)
      .map(([key, value]) => `${key}: ${value}`);
    bits.push(metaBits.join(" | "));
  }
  return bits.filter(Boolean).join(" | ");
}

function startDishEdit(dish) {
  state.editingDishId = dish.id;
  elements.dishId.value = dish.id;
  elements.dishName.value = dish.name || "";
  elements.mealBreakfast.checked = dish.mealTypes.includes("breakfast");
  elements.mealLunch.checked = dish.mealTypes.includes("lunch");
  elements.mealDinner.checked = dish.mealTypes.includes("dinner");
  elements.dishNotes.value = dish.notes || dish.description || "";
  if (dish.metadata) {
    elements.dishMetadata.value = JSON.stringify(dish.metadata, null, 2);
  } else {
    elements.dishMetadata.value = "";
  }
  elements.dishStatus.textContent = `Editing ${dish.name}`;
}

function resetDishForm() {
  state.editingDishId = null;
  elements.dishId.value = "";
  elements.dishName.value = "";
  elements.mealBreakfast.checked = false;
  elements.mealLunch.checked = false;
  elements.mealDinner.checked = false;
  elements.dishNotes.value = "";
  elements.dishMetadata.value = "";
  elements.dishStatus.textContent = "";
}

async function handleDishSubmit(event) {
  event.preventDefault();
  if (!state.currentUser) return;

  const name = elements.dishName.value.trim();
  const mealTypes = [elements.mealBreakfast, elements.mealLunch, elements.mealDinner]
    .filter((input) => input.checked)
    .map((input) => input.value);
  const notes = elements.dishNotes.value.trim();
  const metaText = elements.dishMetadata.value.trim();
  let metadata;
  if (!name) {
    setDishStatus("Name is required", true);
    return;
  }
  if (mealTypes.length === 0) {
    setDishStatus("Choose at least one meal type", true);
    return;
  }
  if (metaText) {
    try {
      metadata = JSON.parse(metaText);
    } catch (err) {
      setDishStatus("Metadata must be valid JSON", true);
      return;
    }
  }

  const payload = { name, mealTypes };
  if (notes) payload.notes = notes;
  if (metadata) payload.metadata = metadata;

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

  const res = await fetch(url, {
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

function setDishStatus(message, isError) {
  elements.dishStatus.textContent = message;
  if (isError) {
    elements.dishStatus.classList.add("error");
  } else {
    elements.dishStatus.classList.remove("error");
  }
}

function renderSuggestions() {
  if (!state.currentUser) {
    elements.suggestions.innerHTML = "<p>Select a user to view suggestions.</p>";
    return;
  }
  const dateValue = elements.suggestionDate.value;
  const daysValue = parseInt(elements.suggestionDays.value, 10) || 1;
  const startDate = dateValue ? new Date(`${dateValue}T00:00:00Z`) : new Date();

  const schedule = MealPlannerEngine.suggestDays(state.currentUser, {
    startDate: new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate())),
    days: Math.max(1, Math.min(30, daysValue)),
  });

  const selections = state.currentUser.selections || {};

  elements.suggestions.innerHTML = "";
  schedule.forEach((day) => {
    const card = document.createElement("div");
    card.className = "suggestion-card";
    const title = document.createElement("h4");
    title.textContent = day.date;
    card.appendChild(title);

    MealPlannerEngine.MEALS.forEach((meal) => {
      const row = document.createElement("div");
      row.className = "suggestion-row";
      const dishList = day.suggestions[meal];
      const label = document.createElement("div");
      label.textContent = `${meal}: ${dishList.length ? dishList[0].name : "(none)"}`;
      row.appendChild(label);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "secondary";

      const selectedId = selections[day.date]?.[meal];
      if (dishList.length && selectedId === dishList[0].id) {
        btn.textContent = "Selected";
        btn.disabled = true;
        const selectedLabel = document.createElement("span");
        selectedLabel.className = "selected";
        selectedLabel.textContent = "(selected)";
        label.appendChild(document.createTextNode(" "));
        label.appendChild(selectedLabel);
      } else if (dishList.length) {
        btn.textContent = "Choose";
        btn.addEventListener("click", () => selectSuggestion(day.date, meal, dishList[0]));
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

async function selectSuggestion(date, meal, dish) {
  if (!state.currentUser) return;
  const userId = state.currentUser.id;
  const res = await fetch(`/api/users/${userId}/selection`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date, meal, dishId: dish.id }),
  });
  if (!res.ok) {
    alert("Unable to save selection");
    return;
  }
  if (!state.currentUser.selections) state.currentUser.selections = {};
  if (!state.currentUser.selections[date]) state.currentUser.selections[date] = {};
  state.currentUser.selections[date][meal] = dish.id;
  renderSuggestions();
}

init().catch((err) => {
  console.error("Failed to initialize", err);
  elements.suggestions.innerHTML = "<p>Unable to load application.</p>";
});
