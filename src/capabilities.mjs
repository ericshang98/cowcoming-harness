import {
  validateProfile,
  freezeDeep,
  isRecord,
  requireString,
} from "./validation.mjs";
const forbidden = new Set(["__proto__", "constructor", "prototype"]);
function parameter(spec, name) {
  if (
    !isRecord(spec) ||
    !["number", "integer", "string", "boolean"].includes(spec.type)
  )
    throw new TypeError(`invalid parameter schema: ${name}`);
  if (forbidden.has(name)) throw new TypeError("reserved parameter name");
  for (const key of ["min", "max"])
    if (spec[key] !== undefined && !Number.isFinite(spec[key]))
      throw new TypeError(`invalid ${name}.${key}`);
  if (spec.min !== undefined && spec.max !== undefined && spec.min > spec.max)
    throw new TypeError(`invalid range: ${name}`);
  if (
    spec.type === "integer" &&
    [spec.min, spec.max].some((v) => v !== undefined && !Number.isInteger(v))
  )
    throw new TypeError("integer bounds must be integers");
  if (
    spec.maxLength !== undefined &&
    (!Number.isInteger(spec.maxLength) ||
      spec.maxLength < 0 ||
      spec.maxLength > 10000)
  )
    throw new TypeError("invalid maxLength");
  if (
    spec.enum !== undefined &&
    (!Array.isArray(spec.enum) || !spec.enum.length)
  )
    throw new TypeError(`invalid enum: ${name}`);
  if (spec.default !== undefined) checkValue(spec.default, spec, name, false);
  return structuredClone(spec);
}
function checkValue(value, spec, name, clamp) {
  if (spec.type === "number" || spec.type === "integer") {
    if (
      !Number.isFinite(value) ||
      (spec.type === "integer" && !Number.isInteger(value))
    )
      throw new TypeError(`${name} must be ${spec.type}`);
    if (
      !clamp &&
      (value < (spec.min ?? -Infinity) || value > (spec.max ?? Infinity))
    )
      throw new TypeError(`${name} out of range`);
    value = Math.max(
      spec.min ?? -Infinity,
      Math.min(spec.max ?? Infinity, value),
    );
  } else if (typeof value !== spec.type)
    throw new TypeError(`${name} must be ${spec.type}`);
  if (spec.type === "string" && value.length > (spec.maxLength ?? 240))
    throw new TypeError(`${name} too long`);
  if (spec.enum && !spec.enum.includes(value))
    throw new TypeError(`${name} not in enum`);
  return value;
}
export function normalizeArgs(params = {}, specs = {}, { clamp = true } = {}) {
  if (!isRecord(params)) throw new TypeError("params must be an object");
  const args = {};
  for (const name of Object.keys(params))
    if (!Object.hasOwn(specs, name))
      throw new TypeError(`unknown parameter: ${name}`);
  for (const [name, spec] of Object.entries(specs)) {
    const v = Object.hasOwn(params, name) ? params[name] : spec.default;
    if (v === undefined) {
      if (spec.required) throw new TypeError(`missing parameter: ${name}`);
      continue;
    }
    args[name] = checkValue(v, spec, name, clamp);
  }
  return args;
}
export function normalizeProfile(profile) {
  validateProfile(profile);
  const p = structuredClone(profile);
  p.version ??= "1";
  requireString(p.version, "profile version");
  p.minConfidence ??= 0;
  p.planTtlMs ??= 15000;
  if (
    !Number.isFinite(p.minConfidence) ||
    p.minConfidence < 0 ||
    p.minConfidence > 1
  )
    throw new TypeError("invalid minConfidence");
  if (!Number.isFinite(p.planTtlMs) || p.planTtlMs <= 0 || p.planTtlMs > 60000)
    throw new TypeError("invalid planTtlMs");
  for (const c of p.capabilities) {
    if (
      !Array.isArray(c.semanticTags) ||
      !c.semanticTags.length ||
      c.semanticTags.some((s) => typeof s !== "string" || !s.trim())
    )
      throw new TypeError("semanticTags must be non-empty strings");
    c.parameters ??= {};
    if (!isRecord(c.parameters))
      throw new TypeError("parameters must be an object");
    for (const [name, spec] of Object.entries(c.parameters))
      c.parameters[name] = parameter(spec, name);
    c.maxDurationMs ??= 5000;
    c.durationMs ??= Math.min(1600, c.maxDurationMs);
    c.interruptible ??= true;
    if (
      typeof c.interruptible !== "boolean" ||
      !Number.isFinite(c.maxDurationMs) ||
      c.maxDurationMs <= 0 ||
      c.maxDurationMs > 60000 ||
      !Number.isFinite(c.durationMs) ||
      c.durationMs <= 0 ||
      c.durationMs > c.maxDurationMs
    )
      throw new TypeError("invalid capability duration / interruptible");
  }
  return freezeDeep(p);
}
export function findCapabilities(profile, semantic) {
  return normalizeProfile(profile).capabilities.filter((c) =>
    c.semanticTags.includes(semantic),
  );
}
