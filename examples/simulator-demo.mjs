import {
  createRuntime,
  MockModelAdapter,
  RecordingExecutor,
  loadProfile,
} from "../src/index.mjs";
const profile = await loadProfile(
  new URL("../profiles/simulator.json", import.meta.url),
);
const runtime = createRuntime({
  profile,
  model: new MockModelAdapter(),
  executor: new RecordingExecutor(),
  onEvent: (e) => console.log(JSON.stringify(e)),
});
const result = await runtime.handle({
  requestId: "demo-approval",
  semantic: "approval",
});
if (result.status !== "completed") process.exitCode = 1;
