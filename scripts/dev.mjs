import { createServer as createViteServer } from "vite";
import { createLabServer } from "../server/app.mjs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
const port = Number(process.env.HARNESS_PORT || 4186);
let vite;
const server = await createLabServer({
  uiHandler: (req, res, next) => vite.middlewares(req, res, next),
});
vite = await createViteServer({
  configFile: false,
  root,
  server: { middlewareMode: true, hmr: { server } },
  appType: "spa",
});
server.on("error", async (e) => {
  console.error(
    e.code === "EADDRINUSE"
      ? "Port occupied; choose HARNESS_PORT. No existing process was stopped."
      : e.message,
  );
  await vite.close();
  process.exitCode = 1;
});
server.listen(port, "127.0.0.1", () =>
  console.log(
    `Cowcoming Harness: http://127.0.0.1:${port}/ (software preview by default)`,
  ),
);
// Closing this developer server does not stop an idle, holding robot.
