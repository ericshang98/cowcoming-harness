import test from "node:test";
import assert from "node:assert/strict";
import {
  loadProfile,
  createRuntime,
  MockModelAdapter,
  FunctionModelAdapter,
  RecordingExecutor,
  SimulatorExecutor,
  createBenBenExecutor,
  createHttpModelAdapter,
} from "../src/index.mjs";
const profile = await loadProfile(
  new URL("../profiles/simulator.json", import.meta.url),
);
const input = (id = "r") => ({ requestId: id, semantic: "approval" });
const make = (options = {}) =>
  createRuntime({
    profile,
    model: new MockModelAdapter(),
    executor: new RecordingExecutor(),
    ...options,
  });
test("fixture end-to-end, immutable events and concurrent duplicate requests execute once", async () => {
  const executor = new RecordingExecutor(),
    runtime = make({ executor });
  const [a, b] = await Promise.all([
    runtime.handle(input()),
    runtime.handle(input()),
  ]);
  assert.equal(a, b);
  assert.equal(executor.plans.length, 1);
  assert.deepEqual(
    a.events.map((e) => e.status),
    ["planned", "accepted", "running", "completed"],
  );
  assert.equal(a.events.at(-1).sensorVerified, false);
  assert.equal(a.events.at(-1).simulated, true);
});
test("sandbox plans without executing; unknown semantic never dispatches", async () => {
  const runtime = make({ executor: null });
  assert.equal((await runtime.handle(input())).status, "planned");
  const executor = new RecordingExecutor();
  const result = await make({ executor }).handle({
    requestId: "unknown",
    semantic: "fly",
  });
  assert.equal(result.status, "unsupported");
  assert.equal(executor.plans.length, 0);
});
test("stop during delayed inference invalidates late result; resume never replays old ID", async () => {
  let resolve;
  const model = new FunctionModelAdapter(
    (i) =>
      new Promise(
        (r) =>
          (resolve = () =>
            r({
              requestId: i.requestId,
              type: "express",
              semantic: "approval",
            })),
      ),
  );
  const executor = new RecordingExecutor(),
    runtime = make({ model, executor });
  const pending = runtime.handle(input());
  await runtime.stop();
  resolve();
  assert.equal((await pending).status, "stopped");
  assert.equal(executor.plans.length, 0);
  assert.equal((await runtime.handle(input("new"))).status, "rejected");
  runtime.resume();
  assert.equal((await runtime.handle(input())).status, "stopped");
});
test("one active request; stop aborts an ongoing simulated action and prevents late completion", async () => {
  const executor = new SimulatorExecutor(),
    events = [];
  const runtime = make({ executor, onEvent: (e) => events.push(e) });
  const pending = runtime.handle(input());
  await new Promise((r) => setTimeout(r, 5));
  assert.equal((await runtime.handle(input("other"))).status, "rejected");
  await runtime.stop();
  assert.equal((await pending).status, "stopped");
  assert.ok(!events.some((e) => e.status === "completed"));
});
test("model failure, wrong correlation and provider output cannot cause motion", async () => {
  for (const model of [
    new FunctionModelAdapter(() => {
      throw Error("secret credential");
    }),
    new FunctionModelAdapter(() => ({
      requestId: "wrong",
      type: "express",
      semantic: "approval",
    })),
  ]) {
    const executor = new RecordingExecutor();
    const r = await make({ model, executor }).handle(input());
    assert.equal(r.status, "fault");
    assert.equal(executor.plans.length, 0);
    assert.ok(!JSON.stringify(r).includes("secret credential"));
  }
});
test("hardware HTTP acceptance is not completion and uncorrelated receipts fail closed", async () => {
  for (const receipt of [
    { status: "accepted", planId: "plan-r" },
    { status: "completed", planId: "wrong" },
  ]) {
    const executor = createBenBenExecutor({
      send: async () => receipt,
      getState: async () => ({
        online: true,
        hardware: true,
        authorized: true,
        leaseExpiresAt: Date.now() + 5000,
      }),
      stop: async () => ({ confirmed: true }),
    });
    assert.equal((await make({ executor }).handle(input())).status, "unknown");
  }
});
test("timed hardware receipt is distinct from physical-position evidence", async () => {
  const executor = createBenBenExecutor({
    send: async (p) => ({
      planId: p.planId,
      status: "completed",
      sensorVerified: false,
      completionBasis: "timed_commands",
    }),
    getState: async () => ({
      online: true,
      hardware: true,
      authorized: true,
      leaseExpiresAt: Date.now() + 5000,
    }),
    stop: async () => ({ confirmed: true }),
  });
  const r = await make({ executor }).handle(input());
  assert.equal(r.status, "completed");
  assert.equal(r.events.at(-1).simulated, false);
  assert.equal(r.events.at(-1).sensorVerified, false);
});
test("HTTP adapters parse provider JSON and bind request ID on host", async () => {
  for (const provider of ["ollama", "openai-compatible"]) {
    const model = createHttpModelAdapter({
      provider,
      endpoint: "http://127.0.0.1:11434/api/chat",
      model: "example",
      fetchImpl: async (u, o) => {
        assert.equal(o.redirect, "error");
        assert.ok(JSON.parse(o.body).messages.length === 2);
        const content = JSON.stringify({
          requestId: "forged",
          type: "express",
          semantic: "approval",
          params: {},
          confidence: 0.9,
        });
        return {
          ok: true,
          json: async () =>
            provider === "ollama"
              ? { message: { content } }
              : { choices: [{ message: { content } }] },
        };
      },
    });
    assert.equal((await model.decide(input(), { profile })).requestId, "r");
  }
});
test("an uncooperative model times out without dispatching its late result", async () => {
  let resolve;
  const model = new FunctionModelAdapter(
    (i) =>
      new Promise(
        (r) =>
          (resolve = () =>
            r({
              requestId: i.requestId,
              type: "express",
              semantic: "approval",
            })),
      ),
  );
  const executor = new RecordingExecutor(),
    runtime = make({ model, executor, timeoutMs: 10 });
  const keepAlive = setTimeout(() => {}, 100);
  try {
    assert.equal((await runtime.handle(input())).status, "stopped");
    resolve();
    await new Promise((r) => setTimeout(r, 1));
    assert.equal(executor.plans.length, 0);
  } finally {
    clearTimeout(keepAlive);
  }
});
test("hardware unknown/fault latches stop even when transport returns normally", async () => {
  for (const status of ["unknown", "fault"]) {
    let stopped = 0;
    const executor = createBenBenExecutor({
      send: async (p) => ({ planId: p.planId, status }),
      getState: async () => ({
        online: true,
        authorized: true,
        leaseExpiresAt: Date.now() + 5000,
      }),
      stop: async () => {
        stopped++;
        return { confirmed: true };
      },
    });
    const runtime = make({ executor });
    assert.equal((await runtime.handle(input())).status, status);
    assert.equal(stopped, 1);
    assert.equal((await runtime.handle(input("next"))).status, "rejected");
  }
});
test("unimplemented intent types and a different target never reach an executor", async () => {
  for (const extra of [
    { type: "track" },
    { type: "speak" },
    { target: "another-robot" },
  ]) {
    const executor = new RecordingExecutor(),
      model = new FunctionModelAdapter((i) => ({
        requestId: i.requestId,
        type: "express",
        semantic: "approval",
        ...extra,
      }));
    const r = await make({ executor, model }).handle(input());
    assert.ok(["rejected", "unsupported"].includes(r.status));
    assert.equal(executor.plans.length, 0);
  }
});
