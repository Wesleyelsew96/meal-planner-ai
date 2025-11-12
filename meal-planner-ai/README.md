Meal Planner AI
================

Overview

- Goal: help households choose dishes for upcoming meals using intelligent suggestions.
- Current scope: baseline rotation suggester exposed by both a CLI and a browser UI. Future phases will layer in favorites, allergies, budgeting, and planning logic.

Baseline Suggestion Logic

- Users list dishes and tag each with one or more meal types (`breakfast`, `lunch`, `dinner`).
- For each meal type, the engine rotates through the available dishes day by day.
  - One breakfast dish -> suggested every day.
  - Two lunch dishes -> alternates day to day.
  - Seven dinner dishes -> cycles across the week.
- Rotation is deterministic by calendar date so the same date always produces the same suggestion.

Project Structure

- `src/planner/engine.js` - DFS-based planner shared by the server and CLI
- `src/server.js` - lightweight Node server serving the UI + JSON API
- `src/cli.js` - command line helper powered by the same planner
- `src/engine.js` - legacy deterministic engine (kept for baseline tests)
- `src/strategies/` - heuristic registry + preset strategy definitions
- `src/shared/` - normalization helpers reused across modules
- `public/` - browser UI assets (index, styling, client script)
- `data/users.json` - seed data with two users (Jason, Wesley)
- `examples/profile.example.json` - standalone sample profile for the CLI
- `test/engine.test.js` - legacy rotation smoke test

Suggestion Strategies
---------------------

- Backend heuristics are now organized into a registry so they can be evaluated in any order.
- Presets live under `src/strategies/presets.js`. The initial `"balanced"` preset matches the legacy DFS behavior and is exposed via `GET /api/strategies`.
- Users can apply presets from the UI heuristics panel. Custom drag ordering still works; whenever a user reorders heuristics the backend records a `"custom"` strategy for that profile.
- Hard constraints (ratio cadence + weekday locks) always execute first and are shown as read-only tiles in the UI. Only the soft heuristics (duplicate avoidance, unscheduled preference, borrow fallback) are reorderable/preset-driven.

Quick Start (UI)

```
npm start
# visit http://localhost:3000
```

- Pick Jason or Wesley from the dropdown.
- Add or edit dishes (name, meal types, notes/metadata) without touching the CLI.
- Refresh suggestions for any date range (1-30 days) and click "Choose" to record the pick.

Command Line Usage

```
# generate a 3-day plan (same output as the UI/server)
npm run start:cli -- --profile ./examples/profile.example.json --days 3

# lunch only for today
node src/cli.js --profile ./examples/profile.example.json --meal lunch

# specify a start date
node src/cli.js --profile ./examples/profile.example.json --days 2 --date 2025-11-01
```

Data Model

```
{
  "id": "wesley",
  "name": "Wesley",
  "dishes": [
    {
      "id": "eggs-bacon",
      "name": "Eggs and Bacon",
      "mealTypes": ["breakfast"],
      "notes": "Daily go-to breakfast."
    }
  ],
  "selections": {
    "2025-11-01": { "breakfast": "eggs-bacon" }
  }
}
```

- `mealTypes` must contain at least one of `breakfast`, `lunch`, `dinner`.
- `notes`, `description`, and `metadata` (arbitrary key/value JSON) capture user-provided dish details.
- `selections` captures user choices made via the UI.

GitHub Setup

```
cd meal-planner-ai
git init
git add .
git commit -m "chore: scaffold meal planner with UI"

# Using GitHub CLI
gh repo create meal-planner-ai --public --source=. --remote=origin --push

# Manual remote
git remote add origin https://github.com/<your-user-or-org>/meal-planner-ai.git
git push -u origin main
```

Roadmap (next milestones)

1. Variable suggestion horizons beyond deterministic rotation (e.g., weekly sets, calendar export)
2. Allergies and ingredient exclusions
3. Favorites and weighting controls
4. Dietary metrics (calories, macros) and pantry/expiration tracking
5. Budgeting and dine-out planning with restaurant suggestions

Testing

- `npm test` runs the rotation smoke test.
- UI currently relies on manual testing; future phases will add automated coverage as flows stabilise.
