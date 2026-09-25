import { validatePlan, validateExecutionEvent } from "./validation.mjs";
export function abortableDelay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const cancel = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", cancel);
      resolve();
    }, ms);
    signal?.addEventListener("abort", cancel, { once: true });
  });
}
export class SimulatorExecutor {
  constructor({ delay = abortableDelay } = {}) {
    this.delay = delay;
    this.simulated = true;
    this.hardware = false;
  }
  async getState() {
    return { online: true };
  }
  async execute(plan, { signal, emit }) {
    validatePlan(plan);
    signal?.throwIfAborted();
    emit("accepted");
    emit("running");
    await this.delay(plan.durationMs, signal);
    signal?.throwIfAborted();
    emit("completed", { completionBasis: "simulated" });
  }
  async stop() {
    return { confirmed: true, completionBasis: "simulated" };
  }
}
export class RecordingExecutor extends SimulatorExecutor {
  constructor() {
    super({ delay: async () => {} });
    this.plans = [];
  }
  async execute(plan, context) {
    this.plans.push(structuredClone(plan));
    return super.execute(plan, context);
  }
}
// A hardware transport must report correlated evidence. Returning HTTP 200 is not completion.
export function createBenBenExecutor({ send, stop, getState }) {
  if (![send, stop, getState].every((x) => typeof x === "function"))
    throw new TypeError("send, stop and getState are required");
  return {
    simulated: false,
    hardware: true,
    getState,
    stop,
    async execute(plan, { signal, emit }) {
      validatePlan(plan);
      signal?.throwIfAborted();
      const receipt = await send(plan, { signal });
      if (
        !receipt ||
        receipt.simulated === true ||
        receipt.planId !== plan.planId
      )
        throw new Error("uncorrelated device receipt");
      // State names retain their ordinary meaning; no inferred running/completion.
      const event = validateExecutionEvent({
        eventId: `receipt-${plan.planId}`,
        planId: plan.planId,
        timestamp: Date.now(),
        simulated: false,
        sensorVerified: receipt.sensorVerified === true,
        ...receipt,
      });
      if (
        !["completed", "rejected", "fault", "unknown"].includes(event.status)
      ) {
        emit("unknown", {
          reason: "device has not provided terminal evidence",
        });
        return;
      }
      if (
        event.status === "completed" &&
        !["timed_commands", "sensor_feedback"].includes(event.completionBasis)
      )
        throw new Error("missing completion evidence");
      if (event.sensorVerified && event.completionBasis !== "sensor_feedback")
        throw new Error("invalid sensor evidence");
      emit(event.status, {
        sensorVerified: event.sensorVerified,
        completionBasis: event.completionBasis,
        reason: event.reason,
      });
    },
  };
}
