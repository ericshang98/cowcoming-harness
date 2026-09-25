import { chromium } from "playwright";
import { createServer as createViteServer } from "vite";
import { createLabServer } from "../server/app.mjs";
import { fileURLToPath } from "node:url";
import { mkdir, readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const root = fileURLToPath(new URL("..", import.meta.url)),
  out = new URL("../.pwc/pet/", import.meta.url);
await mkdir(out, { recursive: true });
let server,
  vite,
  browser,
  releaseEvolution,
  calls = 0;
const errors = [];
try {
  let base = process.env.QA_URL;
  if (!base) {
    server = await createLabServer({
      env: {},
      fetchImpl: async (url, options) => {
        calls++;
        const body = JSON.parse(options.body);
        if (body.messages) {
          const req = JSON.parse(body.messages[1].content);
          await new Promise((resolve) => {
            releaseEvolution = resolve;
          });
          return {
            ok: true,
            json: async () => ({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      decision: "evolve",
                      targetForm: req.allowedNextForms[0],
                      reason: "测试替身：完整互动后的合法下一步",
                    }),
                  },
                },
              ],
            }),
          };
        }
        const input = body.input ?? body,
          text = JSON.parse(input.state).text;
        if (text.includes("慢一点"))
          await new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, 1500);
            options.signal.addEventListener(
              "abort",
              () => {
                clearTimeout(timer);
                reject(Error("aborted"));
              },
              { once: true },
            );
          });
        return {
          ok: true,
          json: async () => ({
            answers: {
              action: {
                type: "choice",
                choice: text.includes("错误")
                  ? "not-an-action"
                  : (Object.keys(input.questions.action.criteria).find(
                      (k) => k !== "wait",
                    ) ?? "wait"),
                confidence: 0.91,
              },
              emotion: { type: "choice", choice: "curious", confidence: 0.83 },
            },
          }),
        };
      },
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
    headless: true,
    ...(process.env.QA_BROWSER_CHANNEL
      ? { channel: process.env.QA_BROWSER_CHANNEL }
      : {}),
    args: ["--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1080 },
  });
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page.getByRole("heading", { name: /养一只/ }).waitFor();
  await page.locator(".pet-canvas canvas").waitFor();
  await page
    .getByRole("button", { name: "点一下头 2 种表现", exact: true })
    .click();
  await page.getByText("动作试玩结束。", { exact: true }).waitFor();
  assert.ok(await page.getByText("0 轮软件互动 · 试玩不计数").count());
  for (const label of ["普通牛来", "骚牛", "硬牛", "仙牛", "暗黑牛"])
    await page
      .getByRole("group", { name: "选择牛的形态" })
      .getByRole("button", { name: new RegExp(label) })
      .click();
  assert.equal(await page.locator(".action-grid button:enabled").count(), 18);
  await page
    .getByRole("button", { name: "左手招呼 2 种表现", exact: true })
    .click();
  await page.getByText("动作试玩结束。", { exact: true }).waitFor();
  await page.screenshot({
    path: fileURLToPath(new URL("desktop.png", out)),
    fullPage: true,
  });
  await page.getByRole("button", { name: /接到自己的机器人/ }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出硬件轨迹", exact: true }).click();
  const file = await download;
  const data = JSON.parse(await readFile(await file.path(), "utf8"));
  assert.equal(data.mode, "dry-run");
  assert.equal(data.actionId, "wave_left");
  await page.locator(".pet-hardware input[type=file]").setInputFiles({
    name: "head-only.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        id: "head-only",
        calibrated: false,
        joints: {},
      }),
    ),
  });
  await page
    .getByRole("button", { name: "左手招呼 2 种表现", exact: true })
    .click();
  await page.getByText(/当前动作无法映射：missing joint/).waitFor();
  await page.getByText("动作试玩结束。", { exact: true }).waitFor();
  if (server) {
    await page.getByRole("button", { name: "模型设置", exact: true }).click();
    await page.getByLabel("Cloudflare Account ID").fill("a".repeat(32));
    await page
      .getByLabel("JEV API Key", { exact: true })
      .fill("fixture-secret-not-for-storage");
    await page.getByRole("button", { name: "保存连接", exact: true }).click();
    await page.getByText(/已保存 typesafe\/jev/).waitFor();
    assert.equal(
      await page.getByLabel("JEV API Key", { exact: true }).inputValue(),
      "",
    );
    await page.getByRole("button", { name: "关闭模型设置" }).click();
    await page.getByLabel("和它说一句").fill("请点一下头");
    await page.getByRole("button", { name: "让 JEV 回应 ↗" }).click();
    await page.getByText("它回应完了，继续聊聊吧。").waitFor();
    await page.getByText("1 轮软件互动 · 试玩不计数").waitFor();
    assert.match(
      await page.getByTestId("decision-timing").innerText(),
      /JEV 往返 \d+ ms/,
    );
    assert.equal(calls, 1);
    assert.equal(
      await page.evaluate(
        () =>
          Object.keys(localStorage).length + Object.keys(sessionStorage).length,
      ),
      0,
    );
    await page.getByLabel("和它说一句").fill("错误");
    await page.getByRole("button", { name: "让 JEV 回应 ↗" }).click();
    await page.getByRole("alert").filter({ hasText: "无效选择" }).waitFor();
    assert.ok(await page.getByText("1 轮软件互动 · 试玩不计数").count());
    await page.getByLabel("和它说一句").fill("慢一点，点一下头");
    await page.getByRole("button", { name: "让 JEV 回应 ↗" }).click();
    await page.getByRole("button", { name: "停止", exact: true }).click();
    await page.waitForTimeout(1700);
    assert.ok(await page.getByText("1 轮软件互动 · 试玩不计数").count());
    assert.equal(await page.getByTestId("decision-timing").count(), 0);
    await page.getByRole("button", { name: "重新养一只", exact: true }).click();
    await page.getByLabel("自动成长", { exact: true }).check();
    await page.getByLabel("进化评估轮数").fill("1");
    await page.getByRole("button", { name: "模型设置", exact: true }).click();
    await page.getByRole("button", { name: "进化评估 · 可选" }).click();
    await page
      .getByLabel("接口地址")
      .fill("https://models.example/v1/chat/completions");
    await page.getByLabel("模型名称").fill("fixture-evaluator");
    await page.getByLabel("进化评估 API Key").fill("fixture-evolution-key");
    await page.getByRole("button", { name: "保存连接", exact: true }).click();
    await page.getByText(/已保存 fixture-evaluator/).waitFor();
    await page.getByRole("button", { name: "关闭模型设置" }).click();
    await page.getByLabel("和它说一句").fill("请点一下头");
    await page.getByRole("button", { name: "让 JEV 回应 ↗" }).click();
    await page.getByText("正在阅读这次培养的完整记录…").waitFor();
    await page
      .getByRole("button", { name: "点一下头 2 种表现", exact: true })
      .click();
    await page.getByRole("button", { name: "停止", exact: true }).waitFor();
    assert.ok(releaseEvolution);
    releaseEvolution();
    await page.getByText(/成长为 普通牛来/).waitFor();
    assert.equal(
      await page.getByRole("button", { name: "停止", exact: true }).count(),
      0,
    );
    await page.waitForTimeout(2000);
    assert.ok(await page.getByText("1 轮软件互动 · 试玩不计数").count());
    assert.equal(
      await page
        .getByRole("group", { name: "选择牛的形态" })
        .locator("[aria-pressed=true]")
        .innerText()
        .then((t) => t.includes("普通牛来")),
      true,
    );
  } else {
    await page.getByRole("button", { name: "模型设置", exact: true }).click();
    await page.getByText(/这是静态试玩页/).waitFor();
    assert.equal(await page.locator("input[type=password]").count(), 0);
    await page.getByRole("button", { name: "关闭模型设置" }).click();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: fileURLToPath(new URL("mobile.png", out)),
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      passed: true,
      mode: server ? "local with fixture JEV/evolution" : "static",
      checks: [
        "first-play",
        "six-forms",
        "18-actions",
        "software-counting",
        "hardware-export",
        "missing-joints",
        ...(server
          ? [
              "JEV-key-memory",
              "decision-timing",
              "model-error",
              "stop-no-late-play",
              "evolution-successor",
              "evolution-cancels-old-form-action",
            ]
          : ["static-no-key-input"]),
        "mobile",
      ],
      calls,
    }),
  );
} finally {
  await browser?.close();
  server?.closeAllConnections();
  server?.close();
  await vite?.close();
}
