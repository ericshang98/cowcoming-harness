import { normalizeProfile } from "./capabilities.mjs";
import { planIntent } from "./planner.mjs";
import { createSafetyArbiter } from "./safety.mjs";
import { validateIntent, freezeDeep, requireString } from "./validation.mjs";
function bounded(promise, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve(promise)
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}
export function createRuntime({
  model,
  executor = null,
  profile,
  clock = Date.now,
  timeoutMs = 20000,
  onEvent = () => {},
  maxRequests = 1000,
}) {
  const p = normalizeProfile(profile),
    safety = createSafetyArbiter({ profile: p, clock });
  const requests = new Map();
  let active = null,
    sequence = 0,
    halted = false;
  const runtime = {
    profile: p,
    get busy() {
      return active !== null;
    },
    handle(input) {
      try {
        requireString(input?.requestId, "requestId");
      } catch (e) {
        return Promise.resolve({
          status: "invalid",
          reason: e.message,
          events: [],
        });
      }
      if (requests.has(input.requestId)) return requests.get(input.requestId);
      if (active)
        return Promise.resolve({
          status: "rejected",
          reason: "runtime busy",
          events: [],
        });
      if (halted)
        return Promise.resolve({
          status: "rejected",
          reason: "runtime stopped; explicit resume required",
          events: [],
        });
      if (requests.size >= maxRequests)
        return Promise.resolve({
          status: "rejected",
          reason: "session full; create a new session",
          events: [],
        });
      const controller = new AbortController();
      active = { controller, plan: null };
      const context = active;
      const task = run(structuredClone(input), context).finally(() => {
        if (active === context) active = null;
      });
      requests.set(input.requestId, task);
      return task;
    },
    async stop() {
      halted = true;
      safety.stop("stopped by user");
      const context = active;
      context?.controller.abort(new Error("stopped by user"));
      if (!executor?.stop)
        return { status: "stopped", completionBasis: "no_device" };
      try {
        const r = await bounded(executor.stop(), AbortSignal.timeout(3000));
        return { status: r?.confirmed ? "stopped" : "unknown", ...r };
      } catch {
        return { status: "unknown", reason: "stop not confirmed by device" };
      }
    },
    resume() {
      if (active) throw new Error("cannot resume an active request");
      halted = false;
      safety.reset();
    },
  };
  async function run(input, context) {
    const events = [];
    let intent,
      plan,
      executing = false,
      terminal = false;
    const signal = AbortSignal.any([
      context.controller.signal,
      AbortSignal.timeout(timeoutMs),
    ]);
    const emit = (status, extra = {}) => {
      if (terminal) return;
      if (signal.aborted && !["stopped", "unknown", "fault"].includes(status))
        return;
      const event = freezeDeep({
        ...extra,
        eventId: `event-${input.requestId}-${++sequence}`,
        requestId: input.requestId,
        planId: plan?.planId ?? `plan-${input.requestId}`,
        profileId: p.profileId,
        semantic: intent?.semantic,
        capabilityId: plan?.steps[0]?.capabilityId,
        status,
        timestamp: clock(),
        simulated: executor?.simulated !== false,
        sensorVerified:
          extra.sensorVerified === true && executor?.simulated === false,
      });
      events.push(event);
      try {
        onEvent(event);
      } catch {
        /* View subscribers cannot affect execution. */
      }
      if (
        [
          "completed",
          "rejected",
          "unsupported",
          "stopped",
          "fault",
          "unknown",
        ].includes(status)
      )
        terminal = true;
    };
    try {
      intent = validateIntent(
        await bounded(model.decide(input, { profile: p, signal }), signal),
      );
      if (intent.requestId !== input.requestId)
        throw new Error("model changed requestId");
      if (intent.type === "stop") {
        const stopped = await runtime.stop();
        emit(stopped.status, {
          reason: "model requested stop",
          completionBasis: stopped.completionBasis,
        });
        return { status: stopped.status, intent, events };
      }
      const planned = planIntent(intent, p, { now: clock });
      if (planned.status !== "ready") {
        emit(planned.status === "unsupported" ? "unsupported" : "rejected", {
          reason: planned.reason,
        });
        return { ...planned, intent, events };
      }
      plan = planned.plan;
      context.plan = plan;
      emit("planned");
      if (!executor) return { status: "planned", intent, plan, events };
      const state = await bounded(executor.getState(), signal);
      const accepted = safety.accept(plan, {
        ...state,
        hardware: executor.hardware === true,
      });
      if (accepted.status !== "accepted") {
        emit("rejected", { reason: accepted.reason });
        return { ...accepted, intent, plan, events };
      }
      signal.throwIfAborted();
      executing = true;
      await bounded(executor.execute(plan, { signal, emit }), signal);
      if (!terminal)
        emit("unknown", {
          reason: "executor returned without terminal evidence",
        });
      if (
        executor.hardware &&
        ["unknown", "fault"].includes(events.at(-1).status)
      ) {
        halted = true;
        safety.stop("execution outcome unknown");
        try {
          await bounded(executor.stop(), AbortSignal.timeout(3000));
        } catch {}
      }
      return { status: events.at(-1).status, intent, plan, events };
    } catch (error) {
      const hardware = executing && executor?.hardware;
      if (hardware) {
        halted = true;
        safety.stop("execution outcome unknown");
        if (!context.controller.signal.aborted) {
          try {
            await bounded(executor.stop(), AbortSignal.timeout(3000));
          } catch {}
        }
      }
      emit(hardware ? "unknown" : signal.aborted ? "stopped" : "fault", {
        reason: signal.aborted
          ? "request cancelled or timed out"
          : "model or executor failed",
        errorCode: error.name ?? "Error",
      });
      return { status: events.at(-1)?.status ?? "fault", intent, plan, events };
    }
  }
  return runtime;
}
