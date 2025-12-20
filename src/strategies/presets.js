const { sanitizeSoftHeuristicsOrder } = require("./heuristics");

const DEFAULT_STRATEGY_ID = "balanced";

const STRATEGY_PRESETS = {
  balanced: {
    id: "balanced",
    label: "Balanced Rotation",
    description: "Matches the legacy DFS priority ordering (constraints first, then duplicates/rotation).",
    heuristics: sanitizeSoftHeuristicsOrder(["avoidDuplicates", "unscheduled", "borrow"]),
  },
};

function listStrategies() {
  return Object.values(STRATEGY_PRESETS).map((preset) => ({
    id: preset.id,
    label: preset.label,
    description: preset.description,
    heuristics: sanitizeSoftHeuristicsOrder(preset.heuristics),
  }));
}

function getPresetById(id) {
  if (id && STRATEGY_PRESETS[id]) {
    return STRATEGY_PRESETS[id];
  }
  return STRATEGY_PRESETS[DEFAULT_STRATEGY_ID];
}

module.exports = {
  DEFAULT_STRATEGY_ID,
  STRATEGY_PRESETS,
  listStrategies,
  getPresetById,
};
