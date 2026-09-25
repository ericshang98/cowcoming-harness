import test from "node:test";
import assert from "node:assert/strict";
import {
  createPetSession,
  completeTurn,
  selectForm,
  evaluationInput,
  applyEvolution,
} from "../src/pet-session.mjs";
test("only completed model interactions count, duplicates and old generations cannot grow", () => {
  let s = createPetSession();
  const turn = {
    id: "x",
    generation: 0,
    source: "jev",
    text: "你好",
    action: "wave_left",
    emotion: "joyful",
    completed: true,
  };
  assert.equal(completeTurn(s, { ...turn, source: "preview" }).turns.length, 0);
  s = completeTurn(s, turn);
  assert.equal(s.turns.length, 1);
  assert.equal(completeTurn(s, turn).turns.length, 1);
  s = selectForm(s, "normal");
  assert.equal(completeTurn(s, { ...turn, id: "y" }).turns.length, 1);
});
test("evolution consumes full history, only accepts the current snapshot and one successor", () => {
  let s = createPetSession();
  for (let i = 0; i < 5; i++)
    s = completeTurn(s, {
      id: String(i),
      generation: 0,
      source: "jev",
      text: "hi",
      action: "nod",
      emotion: "neutral",
      completed: true,
    });
  const req = evaluationInput(s, "eval");
  assert.equal(req.turns.length, 5);
  assert.deepEqual(req.allowedNextForms, ["normal"]);
  const result = { ...req, decision: "evolve", targetForm: "dark" };
  assert.throws(() => applyEvolution(s, req, result), /successor/);
  assert.equal(
    applyEvolution(selectForm(s, "normal"), req, {
      ...result,
      targetForm: "normal",
    }).form,
    "normal",
  );
  const grown = applyEvolution(s, req, { ...result, targetForm: "normal" });
  assert.equal(grown.form, "normal");
  assert.equal(grown.turns.length, 5);
});
