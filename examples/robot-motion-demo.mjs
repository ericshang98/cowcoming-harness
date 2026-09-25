// Pure compilation: no serial, network or device writes.
import {
  actions,
  makeScore,
  demoRobot,
  compileRobotMotion,
} from "../src/pet.mjs";
const action = actions.find((a) => a.id === (process.argv[2] || "nod"));
if (!action)
  throw Error("Unknown action. Try nod, wave_left, stretch or celebrate.");
const score = makeScore(action, {
  form: "normal",
  emotion: "curious",
  requestId: "offline-motion-example",
});
console.log(JSON.stringify(compileRobotMotion(score, demoRobot), null, 2));
