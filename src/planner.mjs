import { normalizeProfile, normalizeArgs } from "./capabilities.mjs";
import { validateIntent, freezeDeep } from "./validation.mjs";
export function planIntent(intent, profile, { now = Date.now } = {}) {
  try {
    const i = validateIntent(intent),
      p = normalizeProfile(profile),
      t = typeof now === "function" ? now() : now;
    if (i.expiresAt !== undefined && i.expiresAt <= t)
      return { status: "stale", reason: "intent expired" };
    if ((i.confidence ?? 0) < p.minConfidence)
      return {
        status: "rejected",
        reason: "confidence below profile threshold",
      };
    if (i.type !== "express")
      return {
        status: "unsupported",
        reason: `intent type not implemented: ${i.type}`,
      };
    if (i.target !== undefined && i.target !== p.profileId)
      return { status: "rejected", reason: "intent target mismatch" };
    // No fuzzy fallback: explicit left/right or requested motion must keep its meaning.
    const candidates = p.capabilities.filter(
      (c) =>
        c.semanticTags.includes(i.semantic) &&
        (!i.requiredMotion || (c.motion ?? c.visual) === i.requiredMotion),
    );
    if (!candidates.length)
      return {
        status: "unsupported",
        reason: `unsupported semantic: ${i.semantic}`,
        availableSemantics: [
          ...new Set(p.capabilities.flatMap((c) => c.semanticTags)),
        ],
      };
    const c = candidates[0],
      args = normalizeArgs(i.params, c.parameters);
    return {
      status: "ready",
      plan: freezeDeep({
        planId: `plan-${i.requestId}`,
        intentId: i.requestId,
        profileId: p.profileId,
        profileVersion: p.version,
        semantic: i.semantic,
        createdAt: t,
        expiresAt: Math.min(i.expiresAt ?? Infinity, t + p.planTtlMs),
        durationMs: c.durationMs,
        steps: [{ capabilityId: c.id, args }],
      }),
    };
  } catch (error) {
    return { status: "invalid", reason: error.message };
  }
}
