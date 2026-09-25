import test from "node:test";
import assert from "node:assert/strict";
import {
  validateIntent,
  validatePlan,
  validateProfile,
  validateExecutionEvent,
} from "../src/index.mjs";
test("intent shape, confidence and JSON records are validated", () => {
  const input = {
    requestId: "a",
    type: "express",
    semantic: "approval",
    params: {},
  };
  const output = validateIntent(input);
  assert.notEqual(input, output);
  assert.ok(Object.isFrozen(output));
  for (const confidence of [NaN, Infinity, -1, 1.1])
    assert.throws(() => validateIntent({ ...input, confidence }));
  assert.throws(() => validateIntent(new Date()));
  assert.throws(() => validateIntent({ semantic: "nod" }));
});
test("plans cannot be empty or omit expiry; duplicate capabilities rejected", () => {
  assert.throws(() => validatePlan({ planId: "p", intentId: "a", steps: [] }));
  assert.throws(() =>
    validateProfile({
      profileId: "p",
      capabilities: [{ id: "a" }, { id: "a" }],
    }),
  );
});
test("execution evidence cannot confuse simulation and physical verification", () => {
  const e = {
    eventId: "e",
    planId: "p",
    timestamp: 1,
    status: "completed",
    simulated: true,
    sensorVerified: false,
  };
  assert.equal(validateExecutionEvent(e).status, "completed");
  assert.throws(() => validateExecutionEvent({ ...e, sensorVerified: true }));
  assert.throws(() => validateExecutionEvent({ ...e, status: "done" }));
});
