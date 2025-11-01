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

- `src/engine.js` - core rotation logic (shared by CLI and UI)
- `src/cli.js` - command line helper for quick suggestions
- `src/server.js` - lightweight Node server serving the UI + JSON API
- `public/` - browser UI assets (index, styling, client script)
- `data/users.json` - seed data with two users (Jason, Wesley)
- `examples/profile.example.json` - standalone sample profile for the CLI
- `test/engine.test.js` - rotation smoke test

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
# rotate suggestions for multiple days
npm run start:cli -- --days 3

# lunch only for today
node src/cli.js --profile ./examples/profile.example.json --meal lunch --days 1

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
