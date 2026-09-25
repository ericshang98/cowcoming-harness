import { channels, sampleScore, validateScore } from "./motion-score.mjs";
export const demoRobot = {
  version: 1,
  id: "example-nine-axis",
  label: "九轴映射示例 · 未标定",
  calibrated: false,
  joints: Object.fromEntries(
    channels.map((channel, i) => [
      channel,
      {
        id: i + 1,
        centerDeg: 90,
        scaleDeg: channel.includes("Arm") ? 35 : 15,
        direction: 1,
        minDeg: 30,
        maxDeg: 150,
        maxSpeedDegS: 100,
      },
    ]),
  ),
};
export function validateRobot(robot) {
  if (
    !robot ||
    robot.version !== 1 ||
    typeof robot.id !== "string" ||
    !robot.id.trim() ||
    robot.id.length > 80 ||
    typeof robot.calibrated !== "boolean" ||
    !robot.joints ||
    Object.keys(robot.joints).length > 32
  )
    throw Error("invalid robot profile");
  const ids = new Set();
  for (const [channel, j] of Object.entries(robot.joints)) {
    if (
      !channels.includes(channel) ||
      !j ||
      !Number.isInteger(j.id) ||
      j.id < 0 ||
      j.id > 253 ||
      ids.has(j.id)
    )
      throw Error("invalid/duplicate joint");
    ids.add(j.id);
    for (const key of [
      "centerDeg",
      "scaleDeg",
      "minDeg",
      "maxDeg",
      "maxSpeedDegS",
    ])
      if (!Number.isFinite(j[key])) throw Error("joint values must be finite");
    if (
      ![1, -1].includes(j.direction) ||
      j.scaleDeg <= 0 ||
      j.maxSpeedDegS <= 0 ||
      j.minDeg >= j.maxDeg ||
      j.centerDeg < j.minDeg ||
      j.centerDeg > j.maxDeg
    )
      throw Error("invalid joint limits");
  }
  return robot;
}
export function compileRobotMotion(score, robot) {
  validateScore(score);
  validateRobot(robot);
  for (const channel of score.channels)
    if (!Object.hasOwn(robot.joints, channel))
      throw Error(`missing joint mapping: ${channel}`);
  const map = (pose) =>
    score.channels.map((channel) => {
      const j = robot.joints[channel],
        deg = j.centerDeg + pose[channel] * j.scaleDeg * j.direction;
      if (deg < j.minDeg || deg > j.maxDeg)
        throw Error(`joint limit: ${channel}`);
      return { id: j.id, deg };
    });
  const frames = score.frames.map((f) => ({
    atMs: f.atMs,
    positions: map(f.pose),
  }));
  for (let i = 1; i < frames.length; i++)
    for (let n = 0; n < score.channels.length; n++)
      if (
        Math.abs(frames[i].positions[n].deg - frames[i - 1].positions[n].deg) /
          ((frames[i].atMs - frames[i - 1].atMs) / 1000) >
        robot.joints[score.channels[n]].maxSpeedDegS
      )
        throw Error(`joint speed limit: ${score.channels[n]}`);
  return {
    version: 1,
    requestId: score.requestId,
    actionId: score.actionId,
    robotId: robot.id,
    mode: robot.calibrated ? "calibrated" : "dry-run",
    durationMs: score.durationMs,
    frames,
    score: structuredClone(score),
    robot: structuredClone(robot),
  };
}
const delay = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(Error("aborted"));
    const abort = () => {
      clearTimeout(t);
      reject(Error("aborted"));
    };
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
const owners = new WeakSet();
function bounded(promise, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => reject(Error("cancelled or timed out"));
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve(promise)
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}
// Driver owns serial communication, dynamics/collision checks and a watchdog. No vendor commands here.
export async function executeRobotMotion(
  input,
  driver,
  { signal, sleep = delay, onEvent = () => {} } = {},
) {
  const plan = compileRobotMotion(input.score, input.robot);
  if (plan.mode !== "calibrated") throw Error("robot calibration required");
  if (
    !driver ||
    ["readState", "writeFrame", "stop"].some(
      (k) => typeof driver[k] !== "function",
    )
  )
    throw Error("driver contract incomplete");
  if (owners.has(driver)) throw Error("driver busy");
  owners.add(driver);
  const combined = AbortSignal.any([
    AbortSignal.timeout(plan.durationMs + 10000),
    ...(signal ? [signal] : []),
  ]);
  const event = (status, extra = {}) => {
    const e = {
      requestId: plan.requestId,
      actionId: plan.actionId,
      status,
      sensorVerified: false,
      ...extra,
    };
    onEvent(e);
    return e;
  };
  try {
    combined.throwIfAborted();
    const state = await bounded(
      driver.readState({ signal: combined }),
      combined,
    );
    if (
      !state.ready ||
      !state.positions ||
      plan.frames[0].positions.some(
        (j) =>
          !Number.isFinite(state.positions[j.id]) ||
          Math.abs(state.positions[j.id] - j.deg) > 2,
      )
    )
      throw Error("robot must be ready at calibrated neutral pose");
    event("running");
    for (
      let t = 0;
      t <= plan.durationMs;
      t = Math.min(plan.durationMs, t + 40)
    ) {
      combined.throwIfAborted();
      const pose = sampleScore(plan.score, t);
      const positions = plan.score.channels.map((k) => {
        const j = plan.robot.joints[k];
        return {
          id: j.id,
          deg: j.centerDeg + pose[k] * j.scaleDeg * j.direction,
        };
      });
      await bounded(
        driver.writeFrame(
          { requestId: plan.requestId, atMs: t, positions },
          { signal: combined },
        ),
        combined,
      );
      combined.throwIfAborted();
      if (t === plan.durationMs) break;
      await bounded(
        sleep(Math.min(40, plan.durationMs - t), combined),
        combined,
      );
    }
    const feedback = await bounded(
      driver.readState({ signal: combined }),
      combined,
    );
    combined.throwIfAborted();
    const measured =
      feedback.sensorVerified === true &&
      feedback.ready &&
      plan.frames
        .at(-1)
        .positions.every(
          (j) =>
            Number.isFinite(feedback.positions?.[j.id]) &&
            Math.abs(feedback.positions[j.id] - j.deg) <= 2,
        );
    if (!feedback.ready || (feedback.sensorVerified === true && !measured))
      throw Error("target not reached");
    return event(measured ? "completed" : "sent", {
      sensorVerified: measured,
      completionBasis: measured ? "position_feedback" : "commands_sent",
    });
  } catch (e) {
    let stopped;
    try {
      stopped = await bounded(
        driver.stop({ requestId: plan.requestId }),
        AbortSignal.timeout(2000),
      );
    } catch {}
    return event(
      signal?.aborted && stopped?.confirmed ? "stopped" : "unknown",
      { reason: signal?.aborted ? "cancelled" : "driver rejected or failed" },
    );
  } finally {
    owners.delete(driver);
  }
}
