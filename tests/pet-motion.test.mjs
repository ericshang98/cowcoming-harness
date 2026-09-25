import test from "node:test";
import assert from "node:assert/strict";
import { actions, forms, emotions } from "../src/pet-content.mjs";
import {
  validateAction,
  makeScore,
  sampleScore,
} from "../src/motion-score.mjs";
import {
  demoRobot,
  compileRobotMotion,
  executeRobotMotion,
} from "../src/robot-motion.mjs";

test("a hanging driver can be cancelled and simultaneous execution is rejected", async () => {
  const plan = compileRobotMotion(makeScore(actions[0]), {
    ...demoRobot,
    calibrated: true,
  });
  const driver = {
    readState: () => new Promise(() => {}),
    writeFrame: async () => {},
    stop: async () => ({ confirmed: true }),
  };
  const controller = new AbortController();
  const run = executeRobotMotion(plan, driver, { signal: controller.signal });
  await assert.rejects(executeRobotMotion(plan, driver), /busy/);
  controller.abort();
  assert.equal((await run).status, "stopped");
});

test("reported sensor feedback outside tolerance is unknown, not physical completion", async () => {
  const plan = compileRobotMotion(makeScore(actions[0]), {
    ...demoRobot,
    calibrated: true,
  });
  let reads = 0;
  const positions = Object.fromEntries(
    plan.frames[0].positions.map((j) => [j.id, j.deg]),
  );
  const driver = {
    readState: async () =>
      ++reads === 1
        ? { ready: true, positions }
        : { ready: true, sensorVerified: true, positions: {} },
    writeFrame: async () => {},
    stop: async () => ({ confirmed: true }),
  };
  const result = await executeRobotMotion(plan, driver, {
    sleep: async () => {},
  });
  assert.equal(result.status, "unknown");
  assert.equal(result.sensorVerified, false);
});

test("all six forms have 18 portable actions with neutral endpoints and two variants", () => {
  assert.equal(Object.keys(forms).length, 6);
  assert.ok(actions.length >= 18);
  for (const action of actions) {
    validateAction(action);
    assert.ok(action.variants.length >= 2);
    for (const form of Object.keys(forms)) {
      const score = makeScore(action, {
        form,
        emotion: "curious",
        variant: 1,
        requestId: "r",
      });
      for (const t of [0, score.durationMs])
        assert.ok(Object.values(sampleScore(score, t)).every((v) => v === 0));
      for (let t = 0; t < score.durationMs; t += 37)
        assert.ok(
          Object.values(sampleScore(score, t)).every(
            (v) => Number.isFinite(v) && Math.abs(v) <= 1,
          ),
        );
    }
  }
  assert.ok(emotions.curious);
});
test("invalid or non-returning tracks are rejected; single and double nod retain distinct peaks", () => {
  const action = structuredClone(actions[0]);
  action.variants[0].frames[1].pose.headPitch = NaN;
  assert.throws(() => validateAction(action));
  const peaks = (id) =>
    actions
      .find((a) => a.id === id)
      .variants[0].frames.filter((f) => f.pose.headPitch > 0).length;
  assert.equal(peaks("nod"), 1);
  assert.equal(peaks("nod_double"), 2);
});
test("robot mapping refuses missing joints, speed and position violations", () => {
  const score = makeScore(actions.find((a) => a.id === "wave_left"));
  const plan = compileRobotMotion(score, demoRobot);
  assert.equal(plan.mode, "dry-run");
  assert.equal(plan.requestId, score.requestId);
  const robot = structuredClone(demoRobot);
  delete robot.joints.leftArm;
  assert.throws(() => compileRobotMotion(score, robot), /missing/);
  robot.joints = structuredClone(demoRobot.joints);
  robot.joints.leftArm.maxSpeedDegS = 0.1;
  assert.throws(() => compileRobotMotion(score, robot), /speed/);
  robot.joints.leftArm.maxSpeedDegS = 100;
  robot.joints.leftArm.maxDeg = 1;
  assert.throws(() => compileRobotMotion(score, robot), /limit/);
});
test("dry-run cannot execute, unverified delivery is not sensor completion, abort stops", async () => {
  const score = makeScore(actions[0]);
  const plan = compileRobotMotion(score, demoRobot);
  const writes = [];
  const driver = {
    readState: async () => ({
      ready: true,
      positions: Object.fromEntries(
        plan.frames[0].positions.map((j) => [j.id, j.deg]),
      ),
    }),
    writeFrame: async (f) => writes.push(f),
    stop: async () => ({ confirmed: true }),
  };
  await assert.rejects(executeRobotMotion(plan, driver), /calibrat/);
  assert.equal(writes.length, 0);
  const robot = { ...demoRobot, calibrated: true };
  const result = await executeRobotMotion(
    compileRobotMotion(score, robot),
    driver,
    { sleep: async () => {} },
  );
  assert.equal(result.status, "sent");
  assert.equal(result.sensorVerified, false);
  const ac = new AbortController();
  let stopped = false;
  const result2 = await executeRobotMotion(
    compileRobotMotion(score, robot),
    {
      ...driver,
      writeFrame: async () => ac.abort(),
      stop: async () => {
        stopped = true;
        return { confirmed: true };
      },
    },
    { signal: ac.signal, sleep: async () => {} },
  );
  assert.equal(result2.status, "stopped");
  assert.equal(stopped, true);
});
