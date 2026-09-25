import React, { useState, useEffect, useRef } from "react";
import PetStage from "./PetStage.jsx";
import PetSettings from "./PetSettings.jsx";
import {
  actions,
  forms,
  emotions,
  availableActions,
} from "../src/pet-content.mjs";
import {
  makeScore,
  validateCatalog,
  validateEmotions,
} from "../src/motion-score.mjs";
import {
  demoRobot,
  validateRobot,
  compileRobotMotion,
} from "../src/robot-motion.mjs";
import {
  createPetSession,
  completeTurn,
  selectForm,
  evaluationInput,
  applyEvolution,
} from "../src/pet-session.mjs";
import "./pet.css";
export default function PetPlayground() {
  const [config, setConfig] = useState(null),
    [checked, setChecked] = useState(false),
    [pet, setPet] = useState(createPetSession),
    [catalog, setCatalog] = useState(actions),
    [emotionCatalog, setEmotionCatalog] = useState(emotions),
    [score, setScore] = useState(null),
    [text, setText] = useState("你好，陪我玩一会儿吧"),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState("选一个动作，认识一下它。"),
    [error, setError] = useState(""),
    [connection, setConnection] = useState(null),
    [evolution, setEvolution] = useState(null),
    [settings, setSettings] = useState(false),
    [decision, setDecision] = useState(null),
    [robot, setRobot] = useState(demoRobot),
    [plan, setPlan] = useState(null),
    [mappingError, setMappingError] = useState(""),
    [advanced, setAdvanced] = useState(false),
    [autoGrow, setAutoGrow] = useState(false),
    [evaluating, setEvaluating] = useState(false),
    [growthMessage, setGrowthMessage] = useState(""),
    [events, setEvents] = useState([]),
    [renderReady, setRenderReady] = useState(true);
  const current = useRef(pet),
    operation = useRef(0),
    request = useRef(),
    active = useRef(),
    growth = useRef(),
    uploads = useRef(),
    robotUpload = useRef(),
    growthRef = useRef({ evolution, autoGrow });
  growthRef.current = { evolution, autoGrow };
  current.current = pet;
  function update(next) {
    current.current = next;
    setPet(next);
  }
  useEffect(() => {
    let live = true;
    fetch("/api/config")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((c) => {
        if (live) setConfig(c);
      })
      .catch(() => {})
      .finally(() => {
        if (live) setChecked(true);
      });
    return () => {
      live = false;
      request.current?.abort();
      growth.current?.abort();
    };
  }, []);
  function record(kind, message, id) {
    setEvents((v) =>
      [
        ...v,
        { at: new Date().toISOString(), kind, message, requestId: id },
      ].slice(-100),
    );
  }
  async function post(path, data, signal) {
    const r = await fetch("/api/pet/" + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Harness-Token": config?.csrf,
      },
      body: JSON.stringify(data),
      signal,
    });
    let d;
    try {
      d = await r.json();
    } catch {
      throw Error("本地服务没有返回有效响应，请重新启动并刷新页面。");
    }
    if (!r.ok) throw Error(d.error || "请求未完成");
    return d;
  }
  function stop(message = "已停止，等待你的下一次互动。") {
    operation.current++;
    request.current?.abort();
    growth.current?.abort();
    growth.current = null;
    active.current = null;
    setScore(null);
    setBusy(false);
    setEvaluating(false);
    setStatus(message);
    record("stop", message);
  }
  function chooseForm(form) {
    stop("正在体验 " + forms[form].name + "。");
    update(selectForm(current.current, form));
    setDecision(null);
    setGrowthMessage("手动切换用于体验；没有把它记为自动进化。");
  }
  function reset() {
    stop("重新认识小牛吧。");
    update(createPetSession());
    setDecision(null);
    setGrowthMessage("软件培养记录已重置。");
    setEvents([]);
    setPlan(null);
    setMappingError("");
  }
  async function evaluate(snapshot = current.current) {
    const { evolution: conn, autoGrow: enabled } = growthRef.current;
    if (
      !enabled ||
      !conn ||
      growth.current ||
      snapshot.turns.length - snapshot.checkpoint < snapshot.interval
    )
      return;
    const input = evaluationInput(snapshot, crypto.randomUUID());
    if (!input.allowedNextForms.length) return;
    const controller = new AbortController();
    growth.current = controller;
    setEvaluating(true);
    setGrowthMessage("正在阅读这次培养的完整记录…");
    try {
      const result = await post(
        "evolve",
        { connectionId: conn.connectionId, ...input },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      const before = current.current;
      const next = applyEvolution(before, input, result);
      if (next === before) return;
      if (next.form !== before.form) {
        operation.current++;
        request.current?.abort();
        active.current = null;
        setScore(null);
        setBusy(false);
        setDecision(null);
        setPlan(null);
        setStatus("它长大了，和新的它打个招呼吧。");
      }
      update(next);
      setGrowthMessage(
        (result.decision === "evolve"
          ? "成长为 " + forms[next.form].name + "。"
          : "这次保持当前形态。") + result.reason,
      );
      record("evolution", result.reason, input.requestId);
    } catch (e) {
      if (!controller.signal.aborted)
        setGrowthMessage("进化评估未完成：" + e.message + "。可点击重试。");
    } finally {
      if (growth.current === controller) {
        growth.current = null;
        setEvaluating(false);
      }
    }
  }
  function played(id) {
    const turn = active.current;
    if (!turn || turn.id !== id) return;
    active.current = null;
    setBusy(false);
    setScore(null);
    setStatus(
      turn.source === "jev" ? "它回应完了，继续聊聊吧。" : "动作试玩结束。",
    );
    record("software.completed", "软件动作实际播完", id);
    if (turn.source === "jev") {
      try {
        const next = completeTurn(current.current, {
          ...turn,
          completed: true,
        });
        update(next);
        void evaluate(next);
      } catch (e) {
        setError(e.message);
      }
    }
  }
  function play(action, emotion, source, inputText, modelDecision) {
    const id = modelDecision?.requestId ?? crypto.randomUUID();
    const snapshot = current.current;
    const nextScore = makeScore(action, {
      requestId: id,
      form: snapshot.form,
      emotion,
      emotionCatalog,
      variant: Math.floor(Math.random() * action.variants.length),
    });
    update({ ...snapshot, emotion });
    active.current = {
      id,
      generation: snapshot.generation,
      source,
      text: inputText,
      action: action.id,
      emotion,
    };
    setScore(nextScore);
    setBusy(true);
    setStatus(action.label + " · " + forms[snapshot.form].name);
    setMappingError("");
    try {
      setPlan(compileRobotMotion(nextScore, robot));
    } catch (e) {
      setPlan(null);
      setMappingError(e.message);
    }
    record(source === "jev" ? "jev.action" : "preview", action.label, id);
  }
  function preview(action) {
    if (busy || !renderReady) return;
    operation.current++;
    setError("");
    setDecision(null);
    try {
      play(action, current.current.emotion, "preview", "");
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  async function send(e) {
    e.preventDefault();
    if (busy || !text.trim() || !renderReady) return;
    if (!connection) {
      setSettings(true);
      return;
    }
    const epoch = ++operation.current;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    setDecision(null);
    setStatus("JEV 正在选择动作和情绪…");
    try {
      const d = await post(
        "decide",
        {
          connectionId: connection.connectionId,
          requestId: crypto.randomUUID(),
          text,
          form: current.current.form,
          emotion: current.current.emotion,
          catalog,
          emotionCatalog,
          history: current.current.turns,
        },
        controller.signal,
      );
      if (epoch !== operation.current) return;
      setDecision(d);
      record(
        "jev.decision",
        `${d.latencyMs} ms · ${d.action} / ${d.emotion}`,
        d.requestId,
      );
      if (d.action === "wait") {
        update({ ...current.current, emotion: d.emotion });
        setStatus("它选择安静陪伴。");
        setBusy(false);
        return;
      }
      const a = availableActions(current.current.form, catalog).find(
        (a) => a.id === d.action,
      );
      if (!a) throw Error("这个形态没有对应动作，未播放");
      play(a, d.emotion, "jev", text, d);
    } catch (e) {
      if (epoch === operation.current) {
        setError(e.message);
        setBusy(false);
        setStatus("这次没有执行动作，可以修改后重试。");
      }
    }
  }
  function download(name, value) {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importFile(file, type) {
    if (!file) return;
    try {
      if (file.size > 200000) throw Error("配置文件需小于 200 KB");
      const data = JSON.parse(await file.text());
      if (type === "robot") {
        validateRobot(data);
        setRobot(data);
        if (score) {
          try {
            setPlan(compileRobotMotion(score, data));
            setMappingError("");
          } catch (e) {
            setPlan(null);
            setMappingError(e.message);
          }
        } else {
          setPlan(null);
          setMappingError("");
        }
      } else {
        validateCatalog(data.actions);
        validateEmotions(data.emotions);
        stop("已载入动作与情绪配置。");
        setCatalog(data.actions);
        setEmotionCatalog(data.emotions);
        update({ ...current.current, emotion: Object.keys(data.emotions)[0] });
      }
      setError("");
    } catch (e) {
      setError("配置未载入：" + e.message);
    }
  }
  const available = availableActions(pet.form, catalog),
    nextForms = Object.keys(forms).filter(
      (id) => forms[id].parent === pet.form,
    );
  return (
    <div className="pet-page">
      <header className="pet-header">
        <a className="pet-brand" href="./">
          牛来<span>COWCOMING / OPEN PLAYGROUND</span>
        </a>
        <nav>
          <a href="?view=lab">开发者实验室 ↗</a>
          <button onClick={() => setSettings(!settings)}>
            模型设置{connection && <i />}
          </button>
        </nav>
      </header>
      <main className="pet-layout">
        <aside className="pet-family">
          <span className="eyebrow">01 / 一起长大的性格</span>
          <h1>
            养一只
            <br />
            有脾气的牛。
          </h1>
          <p>先玩动作，再让 JEV 决定它如何回应。</p>
          <div className="form-list" role="group" aria-label="选择牛的形态">
            {Object.entries(forms).map(([id, f]) => (
              <button
                key={id}
                aria-pressed={pet.form === id}
                onClick={() => chooseForm(id)}
              >
                <span
                  className="form-dot"
                  style={{ background: f.color, borderColor: f.accent }}
                />
                <span>
                  {f.name}
                  <small>
                    {id === "calf"
                      ? "从这里开始"
                      : id === "normal"
                        ? "慢慢熟悉"
                        : id === "playful" || id === "celestial"
                          ? "爱玩的一支"
                          : "嘴硬的一支"}
                  </small>
                </span>
                <b>{pet.form === id ? "●" : "↗"}</b>
              </button>
            ))}
          </div>
          <div className="pet-growth">
            <strong>这次相处</strong>
            <p>{pet.turns.length} 轮软件互动 · 试玩不计数</p>
            <p className="tree-note">
              小牛 → 普通牛来
              <br />↳ 骚牛 → 仙牛
              <br />↳ 硬牛 → 暗黑牛
            </p>
            <label className="check">
              <input
                type="checkbox"
                checked={autoGrow}
                onChange={(e) => setAutoGrow(e.target.checked)}
              />
              自动成长
            </label>
            {autoGrow && (
              <>
                <label>
                  每几轮评估
                  <input
                    aria-label="进化评估轮数"
                    type="number"
                    min="1"
                    max="100"
                    value={pet.interval}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (Number.isInteger(n) && n >= 1 && n <= 100) {
                        growth.current?.abort();
                        growth.current = null;
                        setEvaluating(false);
                        update({
                          ...pet,
                          interval: n,
                          generation: pet.generation + 1,
                          checkpoint: pet.turns.length,
                        });
                      }
                    }}
                  />
                </label>
                <small>
                  {!evolution
                    ? "先在模型设置里连接进化评估模型。"
                    : nextForms.length
                      ? "达到轮数会判断是否适合成长。"
                      : "已经到达这个分支的终点。"}
                </small>
              </>
            )}
            {growthMessage && <p role="status">{growthMessage}</p>}
            {autoGrow && evolution && (
              <button disabled={evaluating} onClick={() => evaluate()}>
                {evaluating ? "评估中…" : "重试进化评估"}
              </button>
            )}
            <button className="quiet" onClick={reset}>
              重新养一只
            </button>
          </div>
        </aside>
        <section className="pet-center">
          <div className="stage-header">
            <span>
              <i className={connection ? "online" : "offline"} />
              {connection ? "JEV 已配置" : "动作试玩"}
            </span>
            <span>软件宠物 · 无需设备</span>
          </div>
          <div className="pet-stage-wrap">
            <PetStage
              form={pet.form}
              emotion={pet.emotion}
              score={score}
              onComplete={played}
              onFailure={() => {
                setRenderReady(false);
                stop("3D 不可用，未记录互动完成。");
              }}
            />
            <div className="pet-bubble">
              <span>{forms[pet.form].name}</span>
              <p>{forms[pet.form].phrase}</p>
              <small>角色预设台词</small>
            </div>
            <span className="orbit-hint">拖动看一看 · 滚轮拉近</span>
          </div>
          <div className="pet-feeling">
            <span className="emotion-badge">
              {emotionCatalog[pet.emotion]?.label ?? pet.emotion}
            </span>
            <p>{forms[pet.form].personality}</p>
          </div>
          <div className="pet-decision" aria-live="polite">
            <span>{status}</span>
            {decision && (
              <strong data-testid="decision-timing">
                JEV 往返 {decision.latencyMs} ms{" "}
                <small>
                  动作置信度 {Math.round(decision.actionConfidence * 100)}%
                </small>
              </strong>
            )}
          </div>
          {error && (
            <p className="pet-error" role="alert">
              {error}
            </p>
          )}
          <form className="pet-composer" onSubmit={send}>
            <label htmlFor="pet-text">和它说一句</label>
            <textarea
              id="pet-text"
              value={text}
              maxLength="2000"
              onChange={(e) => setText(e.target.value)}
              placeholder="比如：你这么可爱，伸个懒腰给我看看"
            />
            <div>
              <span>
                {checked
                  ? config
                    ? "你的输入经本地服务发送给所选模型。"
                    : "静态试玩 · 本地运行后可连接 JEV"
                  : "正在检查本地服务…"}
              </span>
              {busy ? (
                <button type="button" onClick={() => stop()}>
                  停止
                </button>
              ) : (
                <button
                  className="primary"
                  disabled={!renderReady || !checked}
                  type="submit"
                >
                  {connection ? "让 JEV 回应 ↗" : "连接 JEV 开始互动"}
                </button>
              )}
            </div>
          </form>
          <details className="pet-records">
            <summary>互动记录 · {events.length}</summary>
            <ol>
              {events.map((e, i) => (
                <li key={i}>
                  <time>{e.at.slice(11, 19)}</time>
                  <span>{e.kind}</span>
                  {e.message}
                </li>
              ))}
            </ol>
            <button
              onClick={() =>
                download("cowcoming-session.json", {
                  session: pet,
                  events,
                  decision,
                })
              }
            >
              导出这次记录
            </button>
          </details>
        </section>
        <aside className="pet-actions">
          <span className="eyebrow">02 / 先玩起来</span>
          <h2>它会怎么动？</h2>
          <p>当前形态 {available.length} 项动作，点一下就能看。</p>
          <div className="action-grid">
            {catalog.map((a) => {
              const enabled = available.some((x) => x.id === a.id);
              return (
                <button
                  key={a.id}
                  disabled={busy || !enabled || !renderReady}
                  onClick={() => preview(a)}
                  title={enabled ? a.description : "切换成长后的形态体验"}
                >
                  <span>{a.label}</span>
                  <small>
                    {enabled ? `${a.variants.length} 种表现` : "成长形态可用"}
                  </small>
                </button>
              );
            })}
          </div>
          <label className="emotion-picker">
            试玩情绪
            <select
              value={pet.emotion}
              disabled={busy}
              onChange={(e) => update({ ...pet, emotion: e.target.value })}
            >
              {Object.entries(emotionCatalog).map(([id, e]) => (
                <option key={id} value={id}>
                  {e.label}
                </option>
              ))}
            </select>
          </label>
          <small>
            情绪是宠物的表现。这里的可编辑预设不会判断你的真实心情。
          </small>
          <button
            className="hardware-toggle"
            aria-expanded={advanced}
            onClick={() => setAdvanced(!advanced)}
          >
            03 / 接到自己的机器人 {advanced ? "−" : "+"}
          </button>
          {advanced && (
            <div className="pet-hardware">
              <p>
                同一动作时间轴 → 关节映射 →
                舵机角度。此处只预览和导出，不发送机械指令。
              </p>
              <strong>{robot.label || robot.id}</strong>
              <p>
                配置
                {robot.calibrated
                  ? "声明已标定；本页仍不执行"
                  : "尚未标定，仅供试算"}
              </p>
              <button onClick={() => robotUpload.current.click()}>
                导入机器人映射
              </button>
              <button onClick={() => download("robot-profile.json", robot)}>
                导出映射
              </button>
              <input
                hidden
                ref={robotUpload}
                type="file"
                accept=".json"
                onChange={(e) => {
                  importFile(e.target.files[0], "robot");
                  e.target.value = "";
                }}
              />
              {mappingError && (
                <p role="alert">当前动作无法映射：{mappingError}</p>
              )}
              {plan && (
                <>
                  <p>
                    {plan.frames.length} 个关键帧 · {plan.durationMs} ms ·{" "}
                    {plan.score.channels.length} 个逻辑轴
                  </p>
                  <button onClick={() => download("robot-motion.json", plan)}>
                    导出硬件轨迹
                  </button>
                  <details>
                    <summary>查看舵机角度</summary>
                    <pre>{JSON.stringify(plan.frames, null, 2)}</pre>
                  </details>
                </>
              )}
              <a href="?view=lab">已有 BenBen？打开开发者实验室 ↗</a>
            </div>
          )}
          <div className="content-tools">
            <button
              onClick={() =>
                download("cowcoming-actions.json", {
                  version: 1,
                  actions: catalog,
                  emotions: emotionCatalog,
                })
              }
            >
              导出动作包
            </button>
            <button onClick={() => uploads.current.click()}>导入动作包</button>
            <input
              hidden
              ref={uploads}
              type="file"
              accept=".json"
              onChange={(e) => {
                importFile(e.target.files[0], "content");
                e.target.value = "";
              }}
            />
          </div>
        </aside>
      </main>
      {settings && (
        <div
          className="settings-shade"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSettings(false);
          }}
        >
          <PetSettings
            local={Boolean(config)}
            connection={connection}
            evolution={evolution}
            post={post}
            onConnection={(c) => {
              stop("JEV 连接已更新。");
              setConnection(c);
            }}
            onEvolution={(c) => {
              growth.current?.abort();
              growth.current = null;
              setEvaluating(false);
              setEvolution(c);
            }}
            onClose={() => setSettings(false)}
          />
        </div>
      )}
      <footer className="pet-footer">
        原创程序牛 · 动作与情绪可编辑 · JEV 负责选择，动作库负责表现
        <a href="https://github.com/ericshang98/cowcoming-harness">
          开源代码 ↗
        </a>
      </footer>
    </div>
  );
}
