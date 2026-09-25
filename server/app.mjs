import http from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import {
  createRuntime,
  normalizeProfile,
  MockModelAdapter,
  SimulatorExecutor,
  createHttpModelAdapter,
  loadProfile,
} from "../src/index.mjs";
import { createBenBenHttpExecutor } from "../src/benben-http.mjs";
import { createPetApi } from "./pet-api.mjs";
export async function createLabServer({
  env = process.env,
  uiHandler,
  fetchImpl = fetch,
} = {}) {
  const csrf = randomBytes(24).toString("hex"),
    sessions = new Map();
  let hardwareOwner = null;
  const petApi = createPetApi({ fetchImpl });
  const profiles = await Promise.all(
    ["simulator", "benben-five-servo", "waving-robot"].map((n) =>
      loadProfile(new URL(`../profiles/${n}.json`, import.meta.url)),
    ),
  );
  const modelReady = Boolean(
    env.HARNESS_MODEL_ENDPOINT && env.HARNESS_MODEL_NAME,
  );
  const hardwareReady =
    env.HARNESS_ENABLE_HARDWARE === "1" &&
    Boolean(env.BENBEN_ENDPOINT && env.BENBEN_SESSION_TOKEN);
  const json = (res, status, value) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(JSON.stringify(value));
  };
  async function body(req, limit = 65536) {
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > limit) throw Error("request too large");
      chunks.push(chunk);
    }
    const value = JSON.parse(Buffer.concat(chunks).toString());
    if (!value || Array.isArray(value) || typeof value !== "object")
      throw Error("JSON object required");
    return value;
  }
  const server = http.createServer(async (req, res) => {
    const port = server.address()?.port,
      host = `127.0.0.1:${port}`;
    if (req.headers.host !== host) {
      json(res, 403, { error: "invalid local host" });
      return;
    }
    const path = new URL(req.url, `http://${host}`).pathname;
    if (!path.startsWith("/api/")) {
      if (uiHandler)
        return uiHandler(req, res, () =>
          json(res, 404, { error: "not found" }),
        );
      json(res, 404, { error: "UI not attached" });
      return;
    }
    if (req.headers.origin && req.headers.origin !== `http://${host}`) {
      json(res, 403, { error: "origin rejected" });
      return;
    }
    try {
      if (req.method === "GET" && path === "/api/config") {
        json(res, 200, {
          csrf,
          profiles,
          modelReady,
          hardwareReady,
          modelLabel: modelReady ? env.HARNESS_MODEL_NAME : null,
        });
        return;
      }
      if (req.method !== "POST" || req.headers["x-harness-token"] !== csrf) {
        json(res, 403, { error: "refresh this local page" });
        return;
      }
      if (!req.headers["content-type"]?.startsWith("application/json")) {
        json(res, 415, { error: "JSON required" });
        return;
      }
      const data = await body(
        req,
        path.startsWith("/api/pet/") ? 262144 : 65536,
      );
      if (await petApi(path, data, req, res, json)) return;
      if (path === "/api/session") {
        for (const [id, old] of sessions) {
          if (!old.runtime.busy && Date.now() - old.touched > 30 * 60 * 1000) {
            sessions.delete(id);
            if (hardwareOwner === id) hardwareOwner = null;
          }
        }
        if (sessions.size >= 30) throw Error("close an old session first");
        if (
          !["simulator", "sandbox", "hardware"].includes(data.mode) ||
          !["mock", "configured"].includes(data.model)
        )
          throw Error("invalid mode or model");
        const profile = normalizeProfile(data.profile);
        if (
          data.mode === "hardware" &&
          (!hardwareReady ||
            JSON.stringify(profile) !== JSON.stringify(profiles[1]))
        )
          throw Error(
            "hardware requires the bundled BenBen profile and server configuration",
          );
        if (data.model === "configured" && !modelReady)
          throw Error("model not configured on server");
        const model =
          data.model === "mock"
            ? new MockModelAdapter()
            : createHttpModelAdapter({
                endpoint: env.HARNESS_MODEL_ENDPOINT,
                model: env.HARNESS_MODEL_NAME,
                provider: env.HARNESS_MODEL_PROVIDER || "openai-compatible",
                apiKey: env.HARNESS_MODEL_KEY,
                fetchImpl,
              });
        const id = randomUUID(),
          s = {
            id,
            lease: 0,
            touched: Date.now(),
            mode: data.mode,
            emit: () => {},
          };
        const executor =
          data.mode === "sandbox"
            ? null
            : data.mode === "hardware"
              ? createBenBenHttpExecutor({
                  endpoint: env.BENBEN_ENDPOINT,
                  token: env.BENBEN_SESSION_TOKEN,
                  fetchImpl,
                  lease: () => s.lease,
                })
              : new SimulatorExecutor();
        s.runtime = createRuntime({
          profile,
          model,
          executor,
          timeoutMs: data.mode === "hardware" ? 65000 : 20000,
          onEvent: (e) => s.emit(e),
        });
        sessions.set(id, s);
        json(res, 201, { sessionId: id });
        return;
      }
      const s = sessions.get(data.sessionId);
      if (!s) throw Error("session not found");
      s.touched = Date.now();
      if (path === "/api/close") {
        if (s.runtime.busy) throw Error("request active");
        sessions.delete(s.id);
        if (hardwareOwner === s.id) hardwareOwner = null;
        json(res, 200, { closed: true });
        return;
      }
      if (path === "/api/arm") {
        if (
          s.mode !== "hardware" ||
          !hardwareReady ||
          data.acknowledgeTorque !== true
        )
          throw Error("hardware acknowledgement required");
        if (hardwareOwner && hardwareOwner !== s.id) {
          const owner = sessions.get(hardwareOwner);
          if (owner && (owner.runtime.busy || owner.lease > Date.now()))
            throw Error("hardware owned by another lab session");
        }
        hardwareOwner = s.id;
        s.lease = Date.now() + 60000;
        json(res, 200, { leaseExpiresAt: s.lease });
        return;
      }
      if (path === "/api/stop") {
        s.lease = 0;
        json(res, 200, await s.runtime.stop());
        return;
      }
      if (path === "/api/resume") {
        s.runtime.resume();
        json(res, 200, { ready: true });
        return;
      }
      if (path !== "/api/run") {
        json(res, 404, { error: "not found" });
        return;
      }
      if (s.runtime.busy) throw Error("request active");
      if (
        typeof data.input?.requestId !== "string" ||
        typeof data.input?.text !== "string" ||
        data.input.text.length > 2000
      )
        throw Error("input text/requestId required (max 2000 characters)");
      // Only the mock fixture may receive explicit semantics from the page; real models decide from text.
      res.writeHead(200, {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      s.emit = (e) => {
        if (!res.destroyed) res.write(JSON.stringify({ event: e }) + "\n");
      };
      const disconnect = () => {
        if (s.runtime.busy) {
          s.lease = 0;
          void s.runtime.stop();
        }
      };
      res.on("close", disconnect);
      const result = await s.runtime.handle(data.input);
      res.off("close", disconnect);
      s.emit = () => {};
      if (!res.destroyed) {
        res.end(JSON.stringify({ result }) + "\n");
      }
    } catch (e) {
      if (!res.headersSent)
        json(res, 400, {
          error: e.message.replace(/https?:\/\/\S+/g, "[endpoint]"),
        });
      else res.end();
    }
  });
  server.requestTimeout = 70000;
  server.headersTimeout = 10000;
  return server;
}
