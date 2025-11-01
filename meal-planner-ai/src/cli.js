#!/usr/bin/env node
// Minimal CLI to exercise the rotation engine.

const fs = require('fs');
const path = require('path');
const {
  suggestForDay,
  suggestDays,
  suggestMealForDay,
} = require('./engine');

function parseArgs(argv) {
  const args = { days: 1 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--profile' || a === '-p') args.profile = argv[++i];
    else if (a === '--days' || a === '-d') args.days = parseInt(argv[++i], 10);
    else if (a === '--date') args.date = argv[++i];
    else if (a === '--meal' || a === '-m') args.meal = argv[++i];
    else if (a === '--help' || a === '-h') args.help = true;
    else args._ = (args._ || []).concat(a);
  }
  return args;
}

function parseDateOrToday(s) {
  if (!s) return new Date();
  const d = new Date(s + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) throw new Error('Invalid --date format; use YYYY-MM-DD');
  return d;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.profile) {
    console.log(`\nMeal Planner AI – Rotation CLI\n\nUsage:\n  node src/cli.js --profile <file.json> [--days N] [--date YYYY-MM-DD] [--meal breakfast|lunch|dinner]\n`);
    process.exit(args.profile ? 0 : 1);
  }

  const profilePath = path.resolve(process.cwd(), args.profile);
  const raw = fs.readFileSync(profilePath, 'utf8');
  const profile = JSON.parse(raw);
  const startDate = parseDateOrToday(args.date);

  if (args.meal) {
    const list = suggestMealForDay(profile, args.meal, startDate);
    console.log(JSON.stringify({ date: startDate.toISOString().slice(0,10), meal: args.meal, suggestions: list }, null, 2));
    return;
  }

  const days = Number.isInteger(args.days) && args.days > 0 ? args.days : 1;
  const out = suggestDays(profile, { startDate, days });
  console.log(JSON.stringify(out, null, 2));
}

if (require.main === module) {
  try { main(); } catch (err) { console.error(err.message || err); process.exit(1); }
}

