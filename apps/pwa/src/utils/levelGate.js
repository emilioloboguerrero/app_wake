export function effectiveLevel(course, entry) {
  const opts = course?.levels?.options;
  if (!Array.isArray(opts) || opts.length === 0) return null;
  const chosen = entry?.level;
  if (typeof chosen === 'string' && opts.includes(chosen)) return chosen;
  return course.levels.default;
}

export function shouldAskLevel(course, entry) {
  const opts = course?.levels?.options;
  if (!Array.isArray(opts) || opts.length === 0) return false;
  return !(typeof entry?.level === 'string' && opts.includes(entry.level));
}
