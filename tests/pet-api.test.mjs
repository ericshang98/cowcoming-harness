import test from "node:test";
import assert from "node:assert/strict";
import { createLabServer } from "../server/app.mjs";
import { actions } from "../src/pet-content.mjs";
async function setup(t, fetchImpl) {
  const s = await createLabServer({ env: {}, fetchImpl });
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  t.after(() => {
    s.closeAllConnections();
    s.close();
  });
  const url = `http://127.0.0.1:${s.address().port}`;
  const config = await (await fetch(url + "/api/config")).json();
  return {
    config,
    post: (path, data) =>
      fetch(url + "/api/pet/" + path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Harness-Token": config.csrf,
        },
        body: JSON.stringify(data),
      }),
  };
}
test("page connection keeps secrets local, JEV sees form/emotion/action choices and returns measured timing", async (t) => {
  let seen;
  const { post } = await setup(t, async (url, opts) => {
    seen = { url, opts };
    return {
      ok: true,
      json: async () => ({
        result: {
          answers: {
            action: { type: "choice", choice: "nod", confidence: 0.9 },
            emotion: { type: "choice", choice: "curious", confidence: 0.8 },
          },
        },
      }),
    };
  });
  const connected = await post("connect", {
    purpose: "jev",
    format: "cloudflare",
    accountId: "a".repeat(32),
    apiKey: "private-test-key",
  });
  assert.equal(connected.status, 201);
  const c = await connected.json();
  assert.ok(!JSON.stringify(c).includes("private-test-key"));
  const r = await post("decide", {
    connectionId: c.connectionId,
    requestId: "a",
    text: "请点一下头",
    form: "tough",
    emotion: "neutral",
    catalog: actions,
  });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.action, "nod");
  assert.ok(d.latencyMs >= 0);
  assert.equal(seen.opts.headers.Authorization, "Bearer private-test-key");
  const body = JSON.parse(seen.opts.body);
  assert.equal(body.model, "typesafe/jev");
  assert.ok(body.input.questions.emotion.criteria.curious);
  assert.ok(body.input.state.includes("死要面子"));
  await post("disconnect", { connectionId: c.connectionId });
  assert.equal(
    (await post("decide", { connectionId: c.connectionId, text: "你好" }))
      .status,
    400,
  );
});
test("malformed choices, explicit motion substitutions, empty keys and remote plaintext are rejected", async (t) => {
  const { post } = await setup(t, async () => ({
    ok: true,
    json: async () => ({
      answers: {
        action: { type: "choice", choice: "wave_left", confidence: 1 },
        emotion: { type: "choice", choice: "neutral", confidence: 1 },
      },
    }),
  }));
  assert.equal(
    (
      await post("connect", {
        purpose: "jev",
        endpoint: "http://example.com/run",
        apiKey: "k",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await post("connect", {
        purpose: "jev",
        accountId: "a".repeat(32),
        apiKey: "",
      })
    ).status,
    400,
  );
  const c = await (
    await post("connect", {
      purpose: "jev",
      format: "typed",
      endpoint: "http://127.0.0.1:9999/decision",
      apiKey: "k",
    })
  ).json();
  assert.equal(
    (
      await post("decide", {
        connectionId: c.connectionId,
        requestId: "a",
        text: "点一下头",
        form: "normal",
        emotion: "neutral",
      })
    ).status,
    400,
  );
});
