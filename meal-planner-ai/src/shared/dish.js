const FOOD_GROUP_KEYS = ["meat", "produce", "starch", "dairy"];

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

function getDishIngredients(dish) {
  const groups = dish && dish.foodGroups && typeof dish.foodGroups === "object"
    ? dish.foodGroups
    : {};
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

module.exports = {
  FOOD_GROUP_KEYS,
  normalizeFoodGroups,
  getDishIngredients,
};
