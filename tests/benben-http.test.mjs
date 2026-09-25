import test from "node:test";
import assert from "node:assert/strict";
import { createBenBenHttpExecutor } from "../src/benben-http.mjs";
import { createRuntime, loadProfile, MockModelAdapter } from "../src/index.mjs";
const profile = await loadProfile(
  new URL("../profiles/benben-five-servo.json", import.meta.url),
);
test("BenBen client is opt-in, loopback-only, correlates taught actions and stop ownership", async () => {
  assert.throws(
    () =>
      createBenBenHttpExecutor({
        endpoint: "https://robot.example/",
        token: "x",
      }),
    /loopback/,
  );
  const calls = [];
  const executor = createBenBenHttpExecutor({
    endpoint: "http://127.0.0.1:8766/",
    token: "local",
    lease: () => Date.now() + 10000,
    fetchImpl: async (url, options) => {
      calls.push(url.pathname);
      assert.equal(options.headers["X-Niu-Reaction"], "local");
      let result;
      if (url.pathname === "/harness/state")
        result = { online: true, hardware: true, profileId: profile.profileId };
      if (url.pathname === "/harness/run") {
        const plan = JSON.parse(options.body);
        assert.equal(plan.steps[0].capabilityId, "nod");
        result = {
          planId: plan.planId,
          status: "completed",
          completionBasis: "timed_commands",
          sensorVerified: false,
        };
      }
      if (url.pathname === "/harness/stop") {
        assert.equal(JSON.parse(options.body).planId, "plan-x");
        result = { confirmed: true };
      }
      return { ok: true, json: async () => result };
    },
  });
  assert.deepEqual(calls, []);
  await executor.stop();
  assert.deepEqual(calls, []);
  const runtime = createRuntime({
    profile,
    model: new MockModelAdapter(),
    executor,
  });
  const result = await runtime.handle({ requestId: "x", semantic: "approval" });
  assert.equal(result.status, "completed");
  assert.equal(result.events.at(-1).sensorVerified, false);
  await runtime.stop();
  assert.deepEqual(calls, ["/harness/state", "/harness/run", "/harness/stop"]);
});
test("expired local lease refuses hardware dispatch even with an online controller", async () => {
  const calls = [];
  const executor = createBenBenHttpExecutor({
    endpoint: "http://127.0.0.1:8766/",
    token: "local",
    fetchImpl: async (url) => {
      calls.push(url.pathname);
      return {
        ok: true,
        json: async () => ({
          online: true,
          hardware: true,
          profileId: profile.profileId,
        }),
      };
    },
  });
  const runtime = createRuntime({
    profile,
    model: new MockModelAdapter(),
    executor,
  });
  assert.equal(
    (await runtime.handle({ requestId: "x", semantic: "approval" })).status,
    "rejected",
  );
  assert.deepEqual(calls, ["/harness/state"]);
});
