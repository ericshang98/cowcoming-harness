import { createRuntime, MockModelAdapter, loadProfile } from "../src/index.mjs";
const runtime = createRuntime({
  profile: await loadProfile(
    new URL("../profiles/benben-five-servo.json", import.meta.url),
  ),
  model: new MockModelAdapter(),
});
for (const semantic of ["approval", "dance"])
  console.log(
    JSON.stringify(
      await runtime.handle({ requestId: "sandbox-" + semantic, semantic }),
      null,
      2,
    ),
  );
