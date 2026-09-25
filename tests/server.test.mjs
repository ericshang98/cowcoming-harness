import http from "node:http";
import test from "node:test";
import assert from "node:assert/strict";
import { createLabServer } from "../server/app.mjs";
async function lab(t, env = {}) {
  const server = await createLabServer({ env });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const config = await (await fetch(base + "/api/config")).json();
  return {
    base,
    config,
    post: async (path, value, headers = {}) =>
      fetch(base + "/api/" + path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Harness-Token": config.csrf,
          ...headers,
        },
        body: JSON.stringify(value),
      }),
  };
}
test("local API rejects cross-origin writes, missing tokens and forged hosts", async (t) => {
  const { base, post } = await lab(t);
  assert.equal(
    (await post("session", {}, { Origin: "https://untrusted.example" })).status,
    403,
  );
  assert.equal(
    (await post("session", {}, { "X-Harness-Token": "" })).status,
    403,
  );
  const status = await new Promise((resolve) =>
    http.get(
      base + "/api/config",
      { headers: { Host: "untrusted.example" } },
      (r) => {
        r.resume();
        resolve(r.statusCode);
      },
    ),
  );
  assert.equal(status, 403);
});
test("creates simulator session and returns NDJSON evidence; rejects hardware by default", async (t) => {
  const { post, config } = await lab(t);
  const profile = {
    ...config.profiles[0],
    capabilities: config.profiles[0].capabilities.map((c) => ({
      ...c,
      durationMs: 1,
    })),
  };
  const r = await post("session", {
    mode: "simulator",
    model: "mock",
    profile,
  });
  assert.equal(r.status, 201);
  const { sessionId } = await r.json();
  const first = await (
    await post("run", {
      sessionId,
      input: { requestId: "r1", text: "请点一下头" },
    })
  ).text();
  const lines = first.trim().split("\n").map(JSON.parse);
  assert.equal(lines.at(-1).result.status, "completed");
  assert.equal(lines[0].event.status, "planned");
  const repeat = await (
    await post("run", {
      sessionId,
      input: { requestId: "r1", text: "请点一下头" },
    })
  ).text();
  assert.equal(repeat.trim().split("\n").length, 1);
  assert.equal(
    (
      await post("session", {
        mode: "hardware",
        model: "mock",
        profile: config.profiles[1],
      })
    ).status,
    400,
  );
  assert.equal((await post("close", { sessionId })).status, 200);
});
test("custom profile supports new semantics and exact IDs; configured model stays server-side", async (t) => {
  const { post, config } = await lab(t, { HARNESS_MODEL_KEY: "do-not-leak" });
  assert.ok(!JSON.stringify(config).includes("do-not-leak"));
  const profile = {
    profileId: "custom",
    capabilities: [
      {
        id: "my_wave",
        semanticTags: ["custom-wave"],
        parameters: {},
        durationMs: 1,
        maxDurationMs: 100,
        visual: "wave",
      },
    ],
  };
  const { sessionId } = await (
    await post("session", { mode: "simulator", model: "mock", profile })
  ).json();
  const r = await (
    await post("run", {
      sessionId,
      input: { requestId: "custom", text: "hello", semantic: "custom-wave" },
    })
  ).text();
  assert.ok(r.includes("my_wave"));
});
