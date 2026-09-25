import { validatePlan } from "./validation.mjs";
import { normalizeProfile, normalizeArgs } from "./capabilities.mjs";
export function createSafetyArbiter({ clock = Date.now, profile } = {}) {
  const p = profile ? normalizeProfile(profile) : null;
  let stopped = false,
    stopReason = "stopped";
  return {
    accept(plan, state = {}) {
      const reject = (reason) => ({ status: "rejected", reason });
      try {
        validatePlan(plan);
        if (stopped) return reject(stopReason);
        if (state.online !== true) return reject("offline");
        if (state.busy) return reject("device busy");
        if (state.fault) return reject("device fault");
        if (
          state.hardware &&
          (state.authorized !== true ||
            state.leaseExpiresAt <= clock() ||
            !Number.isFinite(state.leaseExpiresAt))
        )
          return reject("hardware lease required");
        if (clock() >= plan.expiresAt) return reject("stale");
        if (
          !p ||
          plan.profileId !== p.profileId ||
          plan.profileVersion !== p.version
        )
          return reject("profile mismatch");
        for (const step of plan.steps) {
          const c = p.capabilities.find((c) => c.id === step.capabilityId);
          if (!c) return reject("unknown capability");
          normalizeArgs(step.args, c.parameters, { clamp: false });
          if (plan.durationMs > c.maxDurationMs)
            return reject("exceeds maximum duration");
        }
        return {
          status: "accepted",
          context: Object.freeze({ acceptedAt: clock(), planId: plan.planId }),
        };
      } catch (e) {
        return reject(e.message);
      }
    },
    stop(reason = "stopped") {
      stopped = true;
      stopReason = reason;
      return { status: "stopped", reason };
    },
    reset() {
      stopped = false;
      stopReason = "stopped";
      return { status: "ready" };
    },
  };
}
