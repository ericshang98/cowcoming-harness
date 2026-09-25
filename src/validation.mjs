import { EXECUTION_STATUSES, INTENT_TYPES } from "./protocol.mjs";
export const isRecord = (v) =>
  v !== null &&
  typeof v === "object" &&
  Object.getPrototypeOf(v) === Object.prototype;
export const requireString = (v, name, maxLength = 240) => {
  if (typeof v !== "string" || !v.trim() || v.length > maxLength)
    throw new TypeError(
      `${name} must be a non-empty string (max ${maxLength})`,
    );
};
export const finite = (v, name) => {
  if (!Number.isFinite(v)) throw new TypeError(`${name} must be finite`);
};
export const freezeDeep = (v) => {
  if (v && typeof v === "object" && !Object.isFrozen(v)) {
    Object.values(v).forEach(freezeDeep);
    Object.freeze(v);
  }
  return v;
};
function record(v, name) {
  if (!isRecord(v)) throw new TypeError(`${name} must be a plain JSON object`);
}
export function validateIntent(v) {
  record(v, "intent");
  requireString(v.requestId, "requestId");
  requireString(v.semantic, "semantic");
  if (!INTENT_TYPES.includes(v.type))
    throw new TypeError("invalid intent type");
  if (v.params !== undefined) record(v.params, "params");
  if (
    v.confidence !== undefined &&
    (!Number.isFinite(v.confidence) || v.confidence < 0 || v.confidence > 1)
  )
    throw new TypeError("confidence must be finite and between 0 and 1");
  if (v.target !== undefined) requireString(v.target, "target");
  if (v.expiresAt !== undefined) finite(v.expiresAt, "expiresAt");
  return Object.freeze({ ...v });
}
export function validateProfile(v) {
  record(v, "profile");
  requireString(v.profileId, "profileId");
  if (!Array.isArray(v.capabilities) || v.capabilities.length > 100)
    throw new TypeError("capabilities must be an array (max 100)");
  const ids = new Set();
  for (const c of v.capabilities) {
    record(c, "capability");
    requireString(c.id, "capability.id");
    if (ids.has(c.id)) throw new TypeError("duplicate capability id");
    ids.add(c.id);
  }
  return Object.freeze({ ...v });
}
export function validatePlan(v) {
  record(v, "plan");
  requireString(v.planId, "planId", 256);
  requireString(v.intentId, "intentId");
  requireString(v.profileId, "profileId");
  finite(v.expiresAt, "expiresAt");
  finite(v.createdAt, "createdAt");
  if (!Array.isArray(v.steps) || v.steps.length !== 1)
    throw new TypeError("v1 plan must have exactly one step");
  for (const s of v.steps) {
    record(s, "step");
    requireString(s.capabilityId, "capabilityId");
    record(s.args, "args");
  }
  if (
    !Number.isFinite(v.durationMs) ||
    v.durationMs <= 0 ||
    v.durationMs > 60000
  )
    throw new TypeError("durationMs must be within (0,60000]");
  return Object.freeze({ ...v });
}
export function validateExecutionEvent(v) {
  record(v, "execution event");
  if (!EXECUTION_STATUSES.includes(v.status))
    throw new TypeError("invalid execution status");
  requireString(v.eventId, "eventId", 320);
  requireString(v.planId, "planId", 256);
  if (typeof v.simulated !== "boolean" || typeof v.sensorVerified !== "boolean")
    throw new TypeError("simulated and sensorVerified must be boolean");
  finite(v.timestamp, "timestamp");
  if (v.simulated && v.sensorVerified)
    throw new TypeError("simulation cannot verify physical position");
  return Object.freeze({ ...v });
}
