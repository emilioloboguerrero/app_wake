/**
 * Flag to open body entry modal when navigating to Lab.
 * Set before navigate('/progress'), consumed by LabScreen on mount.
 */
let pending = false;

export function setPendingOpenBodyEntry() {
  pending = true;
}

export function consumePendingOpenBodyEntry() {
  const val = pending;
  pending = false;
  return val;
}
