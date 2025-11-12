const HARD_HEURISTICS = ["ratioFrequency", "weekday"];
const SOFT_HEURISTICS = ["avoidDuplicates", "unscheduled", "borrow"];
const ALL_HEURISTICS = [...HARD_HEURISTICS, ...SOFT_HEURISTICS];

function sanitizeSoftHeuristicsOrder(order) {
  const base = Array.isArray(order) ? order : [];
  const seen = new Set();
  const sanitized = [];
  base.forEach((key) => {
    if (SOFT_HEURISTICS.includes(key) && !seen.has(key)) {
      seen.add(key);
      sanitized.push(key);
    }
  });
  SOFT_HEURISTICS.forEach((key) => {
    if (!seen.has(key)) {
      seen.add(key);
      sanitized.push(key);
    }
  });
  return sanitized;
}

const HEURISTIC_REGISTRY = {
  ratioFrequency: {
    evaluate(candidate) {
      const window = candidate.ratioWindow;
      if (!window) {
        return { allowed: true, score: 3 };
      }
      if (candidate.slot.dayIndex < window.earliest) {
        return { allowed: false };
      }
      const forced = candidate.slot.dayIndex >= window.latest;
      return {
        allowed: true,
        forced,
        score: forced ? 0 : 1,
        reason: forced ? window.reasonOverdue : window.reasonDue,
      };
    },
  },
  weekday: {
    evaluate(candidate) {
      const days = candidate.freqDays || [];
      if (!days.length) {
        return { allowed: true, score: 2 };
      }
      if (!days.includes(candidate.slot.dayKey)) {
        return { allowed: false };
      }
      return {
        allowed: true,
        forced: true,
        score: 0,
        reason: candidate.weekdayReason,
      };
    },
  },
  avoidDuplicates: {
    evaluate(candidate) {
      return { allowed: true, score: candidate.ingredientConflict ? 1 : 0 };
    },
    filter(candidates) {
      const hasClean = candidates.some((c) => (!c.ingredientConflict || c.forced));
      if (!hasClean) return candidates;
      const filtered = candidates.filter((c) => (!c.ingredientConflict || c.forced));
      return filtered.length ? filtered : candidates;
    },
  },
  unscheduled: {
    evaluate(candidate) {
      return { allowed: true, score: candidate.rotationRank };
    },
    filter(candidates) {
      const hasPreferred = candidates.some((c) => c.unusedPreferred);
      if (!hasPreferred) return candidates;
      const filtered = candidates.filter((c) => (!c.isUnscheduled || c.unusedPreferred || c.forced));
      return filtered.length ? filtered : candidates;
    },
  },
  borrow: {
    evaluate() {
      return { allowed: true, score: 0 };
    },
  },
};

function compareRank(a, b) {
  const len = Math.max(a.rank.length, b.rank.length);
  for (let i = 0; i < len; i += 1) {
    const av = Number.isFinite(a.rank[i]) ? a.rank[i] : 0;
    const bv = Number.isFinite(b.rank[i]) ? b.rank[i] : 0;
    if (av !== bv) {
      return av - bv;
    }
  }
  return 0;
}

function evaluateCandidates(order, candidates) {
  const softOrder = sanitizeSoftHeuristicsOrder(order);
  const evaluationOrder = HARD_HEURISTICS.concat(softOrder);
  const evaluated = [];
  candidates.forEach((candidate) => {
    const rank = [];
    let allowed = true;
    evaluationOrder.forEach((key) => {
      if (!allowed) return;
      const heuristic = HEURISTIC_REGISTRY[key];
      if (!heuristic || typeof heuristic.evaluate !== "function") {
        rank.push(0);
        return;
      }
      const result = heuristic.evaluate(candidate) || {};
      if (result.allowed === false) {
        allowed = false;
        return;
      }
      rank.push(Number.isFinite(result.score) ? result.score : 0);
      if (result.reason && !candidate.reasonBase) {
        candidate.reasonBase = result.reason;
      }
      if (result.forced) {
        candidate.forced = true;
      }
    });
    if (allowed) {
      candidate.rank = rank;
      evaluated.push(candidate);
    }
  });

  let filtered = evaluated;
  evaluationOrder.forEach((key) => {
    const heuristic = HEURISTIC_REGISTRY[key];
    if (heuristic && typeof heuristic.filter === "function") {
      filtered = heuristic.filter(filtered);
    }
  });

  filtered.sort((a, b) => compareRank(a, b) || (a.spacingPenalty - b.spacingPenalty));

  return filtered;
}

module.exports = {
  HARD_HEURISTICS,
  SOFT_HEURISTICS,
  ALL_HEURISTICS,
  HEURISTIC_REGISTRY,
  sanitizeSoftHeuristicsOrder,
  evaluateCandidates,
};
