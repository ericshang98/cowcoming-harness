import { forms, emotions } from "./pet-content.mjs";
export const channels = [
  "headYaw",
  "headPitch",
  "headRoll",
  "headLift",
  "bodyYaw",
  "bodyLean",
  "bodyLift",
  "leftArm",
  "rightArm",
];
const plain = (v) => v && Object.getPrototypeOf(v) === Object.prototype;
export function validateAction(action) {
  if (
    !plain(action) ||
    action.version !== 1 ||
    !/^[a-z][a-z0-9_-]{0,63}$/.test(action.id) ||
    typeof action.label !== "string" ||
    !action.label.trim() ||
    action.label.length > 80 ||
    typeof action.description !== "string" ||
    action.description.length > 500 ||
    action.interrupt !== "hold-current"
  )
    throw Error("invalid action identity");
  if (
    !Array.isArray(action.variants) ||
    !action.variants.length ||
    action.variants.length > 8
  )
    throw Error("invalid variants");
  if (
    action.forms !== undefined &&
    (!Array.isArray(action.forms) ||
      !action.forms.length ||
      action.forms.some((f) => !Object.hasOwn(forms, f)))
  )
    throw Error("invalid action forms");
  const ids = new Set();
  for (const variant of action.variants) {
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(variant.id) || ids.has(variant.id))
      throw Error("invalid variant id");
    ids.add(variant.id);
    if (
      !Array.isArray(variant.frames) ||
      variant.frames.length < 3 ||
      variant.frames.length > 100
    )
      throw Error("invalid frames");
    let last = -1;
    for (const frame of variant.frames) {
      if (
        !Number.isInteger(frame.atMs) ||
        frame.atMs <= last ||
        frame.atMs > 30000 ||
        !plain(frame.pose)
      )
        throw Error("invalid frame time/pose");
      last = frame.atMs;
      for (const [key, value] of Object.entries(frame.pose))
        if (
          !channels.includes(key) ||
          !Number.isFinite(value) ||
          Math.abs(value) > 1
        )
          throw Error("invalid pose channel/value");
    }
    if (variant.frames[0].atMs !== 0 || variant.frames.at(-1).atMs < 200)
      throw Error("invalid duration");
    for (const frame of [variant.frames[0], variant.frames.at(-1)])
      if (Object.values(frame.pose).some((v) => v !== 0))
        throw Error("motion must start and end neutral");
  }
  return action;
}
export function validateCatalog(catalog) {
  if (!Array.isArray(catalog) || !catalog.length || catalog.length > 40)
    throw Error("action catalog requires 1–40 entries");
  const ids = new Set();
  for (const action of catalog) {
    validateAction(action);
    if (ids.has(action.id) || action.id === "wait")
      throw Error("duplicate/reserved action");
    ids.add(action.id);
  }
  return catalog;
}
export function validateEmotions(value) {
  if (
    !plain(value) ||
    Object.keys(value).length < 1 ||
    Object.keys(value).length > 16
  )
    throw Error("invalid emotions");
  for (const [id, e] of Object.entries(value))
    if (
      !/^[a-z][a-z0-9_]{0,40}$/.test(id) ||
      !plain(e) ||
      typeof e.label !== "string" ||
      !e.label.trim() ||
      e.label.length > 30 ||
      typeof e.description !== "string" ||
      e.description.length > 300
    )
      throw Error("invalid emotion");
  return value;
}
export function makeScore(
  action,
  {
    form = "normal",
    emotion = "neutral",
    variant = 0,
    requestId = globalThis.crypto.randomUUID(),
    emotionCatalog = emotions,
  } = {},
) {
  validateAction(action);
  if (!forms[form] || !Object.hasOwn(emotionCatalog, emotion))
    throw Error("unknown form/emotion");
  const v = action.variants[variant];
  if (!v) throw Error("unknown variant");
  // Personality changes gesture dynamics, never direction, count, or selected joints.
  const pace = Math.min(
    {
      calf: 1.1,
      normal: 1,
      playful: 0.9,
      tough: 1.08,
      celestial: 1.2,
      dark: 1.15,
    }[form],
    30000 / v.frames.at(-1).atMs,
  );
  const amplitude = {
    calf: 0.85,
    normal: 1,
    playful: 1,
    tough: 0.9,
    celestial: 0.8,
    dark: 0.95,
  }[form];
  const used = [...new Set(v.frames.flatMap((f) => Object.keys(f.pose)))];
  return validateScore({
    version: 1,
    requestId,
    actionId: action.id,
    variantId: v.id,
    form,
    emotion,
    interrupt: action.interrupt,
    channels: used,
    durationMs: Math.round(v.frames.at(-1).atMs * pace),
    frames: v.frames.map((f) => ({
      atMs: Math.round(f.atMs * pace),
      pose: Object.fromEntries(
        used.map((k) => [k, (f.pose[k] || 0) * amplitude]),
      ),
    })),
  });
}
export function sampleScore(score, elapsedMs) {
  const t = Math.max(0, Math.min(score.durationMs, elapsedMs));
  const next = score.frames.findIndex((f) => f.atMs >= t);
  const b = score.frames[Math.max(0, next)],
    a = score.frames[Math.max(0, next - 1)];
  const p = b.atMs === a.atMs ? 0 : (t - a.atMs) / (b.atMs - a.atMs);
  return Object.fromEntries(
    score.channels.map((k) => [k, a.pose[k] + (b.pose[k] - a.pose[k]) * p]),
  );
}
export function validateScore(score) {
  if (
    !score ||
    score.version !== 1 ||
    typeof score.requestId !== "string" ||
    score.requestId.length > 100 ||
    !Array.isArray(score.channels) ||
    new Set(score.channels).size !== score.channels.length ||
    score.channels.some((k) => !channels.includes(k))
  )
    throw Error("invalid score");
  validateAction({
    version: 1,
    id: score.actionId,
    label: score.actionId,
    description: "",
    interrupt: "hold-current",
    variants: [{ id: score.variantId, frames: score.frames }],
  });
  if (
    score.durationMs !== score.frames.at(-1).atMs ||
    score.frames.some(
      (f) =>
        score.channels.some((k) => !Number.isFinite(f.pose[k])) ||
        Object.keys(f.pose).some((k) => !score.channels.includes(k)),
    )
  )
    throw Error("score channel/duration mismatch");
  return score;
}
