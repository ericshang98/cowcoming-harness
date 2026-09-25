import { createBenBenExecutor } from "./executors.mjs";
// Opt-in local client; never probes devices or calls any endpoint on construction.
export function createBenBenHttpExecutor({
  endpoint,
  token,
  fetchImpl = fetch,
  lease = () => 0,
}) {
  const url = new URL(endpoint);
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    url.pathname !== "/" ||
    url.username ||
    url.password
  )
    throw new Error("BenBen endpoint must be loopback HTTP");
  if (!token) throw new Error("BENBEN_SESSION_TOKEN required");
  let ownedPlan;
  async function request(path, body, signal) {
    const r = await fetchImpl(new URL(path, url), {
      method: body ? "POST" : "GET",
      redirect: "error",
      signal: AbortSignal.any([
        AbortSignal.timeout(body ? 60000 : 3000),
        ...(signal ? [signal] : []),
      ]),
      headers: { "Content-Type": "application/json", "X-Niu-Reaction": token },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!r.ok) throw new Error(`BenBen HTTP ${r.status}`);
    return r.json();
  }
  return createBenBenExecutor({
    getState: async () => {
      const state = await request("/harness/state");
      return {
        ...state,
        online:
          state.online === true &&
          state.hardware === true &&
          state.profileId === "benben-five-servo",
        authorized: lease() > Date.now(),
        leaseExpiresAt: lease(),
      };
    },
    send: async (plan, { signal }) => {
      ownedPlan = plan.planId;
      return request("/harness/run", plan, signal);
    },
    stop: async () =>
      ownedPlan
        ? request("/harness/stop", { planId: ownedPlan })
        : { confirmed: true },
  });
}
