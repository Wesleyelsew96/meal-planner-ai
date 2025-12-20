(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SharedFrequency = factory();
  }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const FREQUENCY_MODES = { DAYS: "days", RATIO: "ratio" };
  const DEFAULT_RATIO_MIN_DAYS = 7;
  const RATIO_DAY_MAX = 31;
  const WEEK_DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

  function clampRatioDay(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    const rounded = Math.round(num);
    if (rounded < 1) return 1;
    if (rounded > RATIO_DAY_MAX) return RATIO_DAY_MAX;
    return rounded;
  }

  function normalizeDays(list) {
    if (!Array.isArray(list)) return [];
    const normalized = [];
    list.forEach((value) => {
      const day = String(value || "").toLowerCase();
      if (!WEEK_DAY_KEYS.includes(day)) return;
      if (normalized.includes(day)) return;
      normalized.push(day);
    });
    return normalized;
  }

  function normalizeFrequency(source, fallbackDays = []) {
    const freq = source && typeof source === "object" ? source : {};
    if (freq.mode === FREQUENCY_MODES.RATIO) {
      const ratio = freq.ratio || {};
      const minDays = clampRatioDay(ratio.minDays) || DEFAULT_RATIO_MIN_DAYS;
      let maxDays = clampRatioDay(ratio.maxDays);
      if (!maxDays) maxDays = minDays;
      if (maxDays < minDays) maxDays = minDays;
      return { mode: FREQUENCY_MODES.RATIO, ratio: { minDays, maxDays }, days: [] };
    }
    const daysSource = Array.isArray(freq.days) && freq.days.length ? freq.days : fallbackDays;
    const days = normalizeDays(daysSource);
    return { mode: FREQUENCY_MODES.DAYS, days, ratio: null };
  }

  return {
    FREQUENCY_MODES,
    DEFAULT_RATIO_MIN_DAYS,
    RATIO_DAY_MAX,
    WEEK_DAY_KEYS,
    clampRatioDay,
    normalizeDays,
    normalizeFrequency,
  };
}));
