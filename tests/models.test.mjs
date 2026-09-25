import test from "node:test";
import assert from "node:assert/strict";
import {
  createHttpModelAdapter,
  loadProfile,
  MockModelAdapter,
  createRuntime,
  RecordingExecutor,
} from "../src/index.mjs";
const profile = await loadProfile(
  new URL("../profiles/simulator.json", import.meta.url),
);
test("JEV and Laya use typed choices with unsupported and host-bound correlation", async () => {
  for (const provider of ["jev", "laya"]) {
    const adapter = createHttpModelAdapter({
      provider,
      model: "typesafe/jev",
      endpoint: "http://127.0.0.1:9999/decision",
      fetchImpl: async (url, options) => {
        const body = JSON.parse(options.body),
          decision = provider === "jev" ? body.input : body;
        assert.equal(decision.questions.action.type, "choice");
        assert.ok(decision.questions.action.criteria.unsupported);
        assert.ok(decision.questions.action.criteria.approval);
        assert.equal(JSON.parse(decision.state).text, "请点头");
        const result = {
          answers: {
            action: { type: "choice", choice: "approval", confidence: 0.9 },
          },
        };
        return {
          ok: true,
          json: async () => (provider === "jev" ? { result } : result),
        };
      },
    });
    assert.deepEqual(
      await adapter.decide({ requestId: "bound", text: "请点头" }, { profile }),
      {
        requestId: "bound",
        type: "express",
        semantic: "approval",
        params: {},
        confidence: 0.9,
      },
    );
  }
});
test("typed adapter rejects unknown choices and malformed confidence before planning", async () => {
  for (const answer of [
    { type: "choice", choice: "shell", confidence: 1 },
    { type: "choice", choice: "approval", confidence: NaN },
    { type: "choice", choice: "approval" },
  ]) {
    const model = createHttpModelAdapter({
      provider: "laya",
      endpoint: "http://127.0.0.1:9999/",
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ answers: { action: answer } }),
      }),
    });
    const executor = new RecordingExecutor(),
      runtime = createRuntime({ profile, model, executor });
    assert.equal(
      (await runtime.handle({ requestId: "x", text: "hi" })).status,
      "fault",
    );
    assert.equal(executor.plans.length, 0);
  }
});
test("fixture covers natural nod example but never interprets negated requests as approval", async () => {
  const model = new MockModelAdapter();
  assert.equal(
    (await model.decide({ requestId: "r", text: "请点一下头" })).semantic,
    "approval",
  );
  assert.equal(
    (await model.decide({ requestId: "r", text: "不要点头" })).semantic,
    "unsupported",
  );
});
