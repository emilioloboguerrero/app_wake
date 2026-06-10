export function buildLevelConfig(options, defaultLevel, mapping) {
  const level_plans = {};
  for (const opt of options) {
    const planId = mapping?.[opt];
    if (planId) level_plans[opt] = planId;
  }
  return { levels: { options, default: defaultLevel }, level_plans };
}

export function isLevelConfigComplete(options, mapping) {
  return options.length > 0 && options.every((o) => !!mapping?.[o]);
}
