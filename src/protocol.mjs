export const INTENT_TYPES = Object.freeze([
  "express",
  "track",
  "speak",
  "stop",
]);

export const EXECUTION_STATUSES = Object.freeze([
  "planned",
  "accepted",
  "running",
  "completed",
  "rejected",
  "unsupported",
  "stopped",
  "fault",
  "unknown",
]);

export function createId(prefix, now = Date.now()) {
  if (typeof prefix !== "string" || prefix.length === 0) {
    throw new TypeError("prefix must be a non-empty string");
  }
  if (
    !(typeof now === "number" || typeof now === "string") ||
    String(now).length === 0
  ) {
    throw new TypeError("now must be a non-empty number or string");
  }
  return `${prefix}-${now}`;
}
