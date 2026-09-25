import test from "node:test";
import assert from "node:assert/strict";
import {
  loadProfile,
  normalizeProfile,
  planIntent,
  createSafetyArbiter,
} from "../src/index.mjs";
const profile = await loadProfile(
  new URL("../profiles/simulator.json", import.meta.url),
);
const intent = (semantic = "approval", params = {}) => ({
  requestId: "r",
  type: "express",
  semantic,
  params,
});
test("same intent maps to independent robot capabilities, without joint commands", async () => {
  const a = planIntent(intent("approval", { intensity: 4 }), profile, {
    now: 100,
  });
  assert.equal(a.plan.steps[0].args.intensity, 1);
  assert.ok(a.plan.expiresAt > 100);
  const b = planIntent(
    intent(),
    await loadProfile(
      new URL("../profiles/waving-robot.json", import.meta.url),
    ),
  );
  assert.equal(b.plan.steps[0].capabilityId, "arm_wave");
  assert.equal(a.plan.steps[0].capabilityId, "nod");
});
test("explicit motion has no fuzzy fallback; invalid params and stale results rejected", () => {
  assert.equal(planIntent(intent("flight"), profile).status, "unsupported");
  assert.equal(
    planIntent(intent("approval", { angle: 20 }), profile).status,
    "invalid",
  );
  assert.equal(
    planIntent(intent("approval", { intensity: "1" }), profile).status,
    "invalid",
  );
  assert.equal(
    planIntent({ ...intent(), expiresAt: 1 }, profile, { now: 2 }).status,
    "stale",
  );
});
test("profile rejects invalid defaults, duplicate IDs, non-finite ranges and invalid integers", () => {
  for (const spec of [
    { type: "number", min: 3, max: 1 },
    { type: "number", min: NaN },
    { type: "integer", default: 1.5 },
  ]) {
    assert.throws(() =>
      normalizeProfile({
        ...profile,
        capabilities: [
          { ...profile.capabilities[0], parameters: { amount: spec } },
        ],
      }),
    );
  }
});
test("arbiter independently checks profile, params, duration, readiness, leases, expiry and stop", () => {
  const arbiter = createSafetyArbiter({ profile, clock: () => 100 }),
    plan = planIntent(intent(), profile, { now: 100 }).plan;
  assert.equal(arbiter.accept(plan, { online: true }).status, "accepted");
  for (const state of [
    {},
    { online: false },
    { online: true, busy: true },
    { online: true, hardware: true },
    { online: true, fault: true },
  ])
    assert.equal(arbiter.accept(plan, state).status, "rejected");
  for (const edit of [
    { profileId: "wrong" },
    { expiresAt: 99 },
    { durationMs: 50000 },
    { steps: [{ capabilityId: "nod", args: { intensity: 7 } }] },
    { steps: [{ capabilityId: "arbitrary", args: {} }] },
  ])
    assert.equal(
      arbiter.accept({ ...plan, ...edit }, { online: true }).status,
      "rejected",
    );
  arbiter.stop();
  assert.equal(arbiter.accept(plan, { online: true }).status, "rejected");
  arbiter.reset();
  assert.equal(arbiter.accept(plan, { online: true }).status, "accepted");
});
