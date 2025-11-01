const assert = (cond, msg) => { if (!cond) { throw new Error(msg || 'Assertion failed'); } };

const {
  suggestForDay,
  suggestMealForDay,
} = require('../src/engine');

const profile = {
  userId: 'tester',
  dishes: [
    { id: 'b1', name: 'Same Breakfast', mealTypes: ['breakfast'] },
    { id: 'l1', name: 'Lunch A', mealTypes: ['lunch'] },
    { id: 'l2', name: 'Lunch B', mealTypes: ['lunch'] },
    { id: 'd1', name: 'Dinner 1', mealTypes: ['dinner'] },
    { id: 'd2', name: 'Dinner 2', mealTypes: ['dinner'] },
    { id: 'd3', name: 'Dinner 3', mealTypes: ['dinner'] },
    { id: 'd4', name: 'Dinner 4', mealTypes: ['dinner'] },
    { id: 'd5', name: 'Dinner 5', mealTypes: ['dinner'] },
    { id: 'd6', name: 'Dinner 6', mealTypes: ['dinner'] },
    { id: 'd7', name: 'Dinner 7', mealTypes: ['dinner'] },
  ],
};

function d(y, m, day) { // m is 1-based
  return new Date(`${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}T00:00:00Z`);
}

// Day 1
const day1 = d(2025, 11, 1);
const s1 = suggestForDay(profile, day1);
assert(s1.suggestions.breakfast.length === 1, 'breakfast pick present');
assert(s1.suggestions.lunch.length === 1, 'lunch pick present');
assert(s1.suggestions.dinner.length === 1, 'dinner pick present');

// Next day – lunch should alternate between l1 and l2, dinner rotates over 7.
const day2 = d(2025, 11, 2);
const l1 = suggestMealForDay(profile, 'lunch', day1)[0].id;
const l2 = suggestMealForDay(profile, 'lunch', day2)[0].id;
assert(l1 !== l2, 'lunch alternates day-to-day');

console.log('engine.test.js passed');

