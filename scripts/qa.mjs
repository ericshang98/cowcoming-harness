import { chromium } from "playwright";
import { createServer as createViteServer } from "vite";
import { createLabServer } from "../server/app.mjs";
import { fileURLToPath } from "node:url";
import { mkdir, readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const root = fileURLToPath(new URL("..", import.meta.url));
const out = new URL("../.pwc/", import.meta.url);
await mkdir(out, { recursive: true });
let server, vite, browser;
try {
  let base = process.env.QA_URL;
  if (!base) {
    server = await createLabServer({
      env: {},
      uiHandler: (req, res, next) => vite.middlewares(req, res, next),
    });
    vite = await createViteServer({
      root,
      configFile: false,
      server: { middlewareMode: true, hmr: { server } },
      appType: "spa",
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${server.address().port}/`;
  }
  browser = await chromium.launch({
    ...(process.env.QA_BROWSER_CHANNEL
      ? { channel: process.env.QA_BROWSER_CHANNEL }
      : {}),
    headless: true,
    args: ["--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({
      viewport: { width: 1530, height: 1100 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + (base.includes('?') ? '&' : '?') + 'view=lab');
  const run = () => page.getByRole("button", { name: "运行 →" }).click();
  const done = () =>
    page.getByText("软件执行器预演完成。", { exact: true }).waitFor();
  await run();
  await done();
  await page.screenshot({
    path: fileURLToPath(new URL("desktop.png", out)),
    fullPage: true,
  });
  await page
    .getByLabel("动作能力", { exact: true })
    .selectOption("waving-robot");
  await page.getByLabel('让它回应你', {exact:true}).fill('表示同意');
  await run();
  await done();
  assert.ok(
    await page.locator("code").filter({ hasText: "arm_wave" }).count(),
    "custom capability selected",
  );
  await page.getByLabel("演示方式", { exact: true }).selectOption("sandbox");
  await run();
  await page.locator(".outcome strong").filter({ hasText: "已规划" }).waitFor();
  assert.equal(
    await page.locator(".timeline b").filter({ hasText: "执行中" }).count(),
    0,
  );
  await page.getByLabel("演示方式", { exact: true }).selectOption("simulator");
  await page.getByRole("button", { name: "跳舞", exact: true }).click();
  await page.locator(".outcome strong").filter({ hasText: "不支持" }).waitFor();
  await page.getByLabel("动作能力", { exact: true }).selectOption("simulator");
  await page.getByRole("button", { name: "跳舞", exact: true }).click();
  await page.locator(".timeline b").filter({ hasText: "执行中" }).waitFor();
  await page.getByRole("button", { name: "停止本轮", exact: true }).click();
  await page.getByRole("button", { name: "恢复接受新请求" }).click();
  await page.waitForFunction(
    () =>
      !document
        .querySelector(".preview-bottom")
        .textContent.includes("动画播放中"),
  );
  // Tiny original GLB with one animated triangle; no external model download.
  const values = [-0.5, 0, 0, 0.5, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0.3, 0];
  const binary = Buffer.alloc(values.length * 4);
  values.forEach((v, i) => binary.writeFloatLE(v, i * 4));
  const gltf = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    buffers: [{ byteLength: binary.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 8 },
      { buffer: 0, byteOffset: 44, byteLength: 24 },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: "VEC3",
        min: [-0.5, 0, 0],
        max: [0.5, 1, 0],
      },
      {
        bufferView: 1,
        componentType: 5126,
        count: 2,
        type: "SCALAR",
        min: [0],
        max: [1],
      },
      { bufferView: 2, componentType: 5126, count: 2, type: "VEC3" },
    ],
    animations: [
      {
        name: "Confirm",
        samplers: [{ input: 1, output: 2, interpolation: "LINEAR" }],
        channels: [{ sampler: 0, target: { node: 0, path: "translation" } }],
      },
    ],
  };
  const json = Buffer.from(
      JSON.stringify(gltf).padEnd(
        Math.ceil(JSON.stringify(gltf).length / 4) * 4,
        " ",
      ),
    ),
    header = Buffer.alloc(20),
    binHeader = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + json.length + binary.length, 8);
  header.writeUInt32LE(json.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  binHeader.writeUInt32LE(binary.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  await page.locator("input[type=file]").setInputFiles({
    name: "fixture.glb",
    mimeType: "model/gltf-binary",
    buffer: Buffer.concat([header, json, binHeader, binary]),
  });
  await page.getByText("绑定动画片段（1）", { exact: true }).waitFor();
  await page.getByRole("button", { name: "确认点头", exact: true }).click();
  await done();
  await page
    .locator(".preview-bottom")
    .filter({ hasText: "动画未绑定：不播放替代动作" })
    .waitFor();
  await page.getByLabel("nod", { exact: true }).selectOption("Confirm");
  await page.getByRole("button", { name: "确认点头", exact: true }).click();
  await done();
  await page
    .locator(".preview-bottom")
    .filter({ hasText: "动画播完" })
    .waitFor();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出本轮记录 ↓" }).click();
  const download = await downloadPromise,
    trace = JSON.parse(await readFile(await download.path(), "utf8"));
  assert.equal(trace.result.status, "completed");
  assert.ok(trace.animationEvents.some((e) => e.status === "动画播完"));
  assert.ok(
    trace.events.every(
      (e) => e.simulated === true && e.sensorVerified === false,
    ),
  );
  await page.getByRole("button", { name: "内置角色", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: fileURLToPath(new URL("mobile.png", out)),
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
    false,
    "no mobile overflow",
  );
  if (!process.env.QA_URL) {
    const delayed = await browser.newPage();
    let release, intercepted;
    const gate = new Promise((r) => (release = r)),
      sessionStarted = new Promise((r) => (intercepted = r));
    let dispatches = 0;
    delayed.on("request", (r) => {
      if (r.url().endsWith("/api/run")) dispatches++;
    });
    await delayed.route("**/api/session", async (route) => {
      const response = await route.fetch();
      intercepted();
      await gate;
      await route.fulfill({ response });
    });
    await delayed.goto(base + (base.includes('?') ? '&' : '?') + 'view=lab');
    await delayed.getByRole("button", { name: "运行 →" }).click();
    await sessionStarted;
    await delayed
      .getByRole("button", { name: "停止本轮", exact: true })
      .click();
    release();
    await delayed.getByRole("button", { name: "恢复接受新请求" }).click();
    assert.equal(
      dispatches,
      0,
      "stop during session creation must not dispatch",
    );
    await delayed.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({ checks: process.env.QA_URL ? 11 : 12, errors, base }),
  );
} finally {
  await browser?.close();
  await vite?.close();
  if (server) {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
}
