import { forms } from "./pet-content.mjs";
export function createPetSession() {
  return {
    id: globalThis.crypto.randomUUID(),
    generation: 0,
    form: "calf",
    emotion: "neutral",
    turns: [],
    checkpoint: 0,
    interval: 5,
    path: ["calf"],
  };
}
export function selectForm(s, form) {
  if (!Object.hasOwn(forms, form)) throw Error("unknown form");
  return {
    ...s,
    form,
    generation: s.generation + 1,
    checkpoint: s.turns.length,
  };
}
export function completeTurn(s, turn) {
  if (
    turn.generation !== s.generation ||
    turn.source !== "jev" ||
    !turn.completed ||
    !turn.text?.trim() ||
    !turn.id ||
    s.turns.some((t) => t.id === turn.id)
  )
    return s;
  if (s.turns.length >= 100)
    throw Error("本次培养已满 100 轮，请导出后重置；历史没有被截断。");
  return {
    ...s,
    emotion: turn.emotion,
    turns: [
      ...s.turns,
      {
        id: turn.id,
        text: turn.text,
        action: turn.action,
        emotion: turn.emotion,
        form: s.form,
      },
    ],
  };
}
export function evaluationInput(s, requestId) {
  return {
    requestId,
    sessionId: s.id,
    generation: s.generation,
    currentForm: s.form,
    turnCount: s.turns.length,
    allowedNextForms: Object.keys(forms).filter(
      (k) => forms[k].parent === s.form,
    ),
    turns: s.turns,
  };
}
export function applyEvolution(s, request, result) {
  if (
    request.sessionId !== s.id ||
    request.generation !== s.generation ||
    request.currentForm !== s.form
  )
    return s;
  if (
    result.requestId !== request.requestId ||
    result.sessionId !== s.id ||
    result.generation !== s.generation ||
    !["stay", "evolve"].includes(result.decision)
  )
    throw Error("invalid evolution response");
  if (
    result.decision === "evolve"
      ? !request.allowedNextForms.includes(result.targetForm)
      : result.targetForm !== s.form
  )
    throw Error("invalid successor");
  const changed = result.decision === "evolve";
  return {
    ...s,
    form: result.targetForm,
    generation: s.generation + (changed ? 1 : 0),
    checkpoint: changed ? s.turns.length : request.turnCount,
    path: changed ? [...s.path, result.targetForm] : s.path,
  };
}
