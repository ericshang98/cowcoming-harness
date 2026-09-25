import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import Stage from "./Stage.jsx";
import PetPlayground from "./PetPlayground.jsx";
import {
  createRuntime,
  MockModelAdapter,
  SimulatorExecutor,
  normalizeProfile,
} from "../src/browser.mjs";
import simulator from "../profiles/simulator.json";
import benben from "../profiles/benben-five-servo.json";
import waving from "../profiles/waving-robot.json";
import "./style.css";
const labels = {
  approval: "确认点头",
  proud_approval: "得意双点头",
  refusal: "摇头",
  curiosity_left: "左歪头",
  curiosity_right: "右歪头",
  greeting: "打招呼",
  dance: "跳舞",
};
const states = {
  planned: "已规划",
  accepted: "已接受",
  running: "执行中",
  completed: "完成",
  rejected: "已拒绝",
  unsupported: "不支持",
  stopped: "已停止",
  fault: "失败",
  unknown: "结果未知",
};
function App() {
  const [config, setConfig] = useState({
      profiles: [simulator, benben, waving],
    }),
    [mode, setMode] = useState("simulator"),
    [provider, setProvider] = useState("mock"),
    [profile, setProfile] = useState(simulator),
    [editor, setEditor] = useState(JSON.stringify(simulator, null, 2)),
    [text, setText] = useState("请点一下头"),
    [busy, setBusy] = useState(false),
    [halted, setHalted] = useState(false),
    [events, setEvents] = useState([]),
    [animationEvents, setAnimationEvents] = useState([]),
    [result, setResult] = useState(null),
    [error, setError] = useState(""),
    [motion, setMotion] = useState(null),
    [asset, setAsset] = useState(null),
    [clips, setClips] = useState([]),
    [mapping, setMapping] = useState({}),
    [playback, setPlayback] = useState("等待播放"),
    [armed, setArmed] = useState(false),
    [checking, setChecking] = useState(true);
  const session = useRef(null),
    local = useRef(null),
    current = useRef({ profile, mapping, asset }),
    file = useRef(),
    operation = useRef(0),
    haltedRef = useRef(false),
    armTimer = useRef();
  current.current = { profile, mapping, asset };
  useEffect(() => {
    fetch("/api/config")
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then(setConfig)
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);
  function recordPlayback(status) {
    setPlayback(status);
    setAnimationEvents((v) =>
      [
        ...v,
        {
          status,
          timestamp: Date.now(),
          asset: current.current.asset?.name ?? "builtin",
        },
      ].slice(-100),
    );
  }
  async function api(path, body) {
    const r = await fetch("/api/" + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Harness-Token": config.csrf,
      },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!r.ok) throw Error(d.error || "本地服务请求失败");
    return d;
  }
  function receive(e) {
    setEvents((v) => [...v, e].slice(-100));
    if (
      !haltedRef.current &&
      (e.status === "running" ||
        (mode === "hardware" && e.status === "completed"))
    ) {
      const { profile, mapping } = current.current,
        c = profile.capabilities.find((c) => c.id === e.capabilityId);
      if (c)
        setMotion({
          id: e.eventId,
          visual: c.visual,
          clip: mapping[c.id],
          durationMs: c.durationMs || 1800,
        });
    }
    if (["stopped", "fault", "unknown"].includes(e.status)) setMotion(null);
    if (mode === "hardware" && ["fault", "unknown"].includes(e.status)) {
      haltedRef.current = true;
      setHalted(true);
      setArmed(false);
    }
  }
  async function ensureSession() {
    if (config.csrf) {
      if (!session.current)
        session.current = (
          await api("session", { mode, model: provider, profile })
        ).sessionId;
      return session.current;
    }
    if (!local.current)
      local.current = createRuntime({
        profile,
        model: new MockModelAdapter(),
        executor: mode === "sandbox" ? null : new SimulatorExecutor(),
        onEvent: receive,
      });
    return null;
  }
  async function change(fn) {
    if (busy) return;
    setBusy(true);
    setResult(null);
    try {
      if (session.current) await api("close", { sessionId: session.current });
      session.current = null;
      local.current = null;
      setMotion(null);
      setArmed(false);
      haltedRef.current = false;
      setHalted(false);
      setEvents([]);
      setAnimationEvents([]);
      setError("");
      fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function run(semantic, textOverride) {
    if (busy || halted) return;
    const epoch = ++operation.current;
    setBusy(true);
    setError("");
    setEvents([]);
    setAnimationEvents([]);
    setResult(null);
    try {
      const id = await ensureSession(),
        input = {
          requestId: crypto.randomUUID(),
          text: textOverride ?? text,
          ...(provider === "mock" && semantic ? { semantic } : {}),
        };
      if (epoch !== operation.current) {
        setResult({ status: "stopped", reason: "已取消，未下发动作" });
        return;
      }
      if (config.csrf) {
        const r = await fetch("/api/run", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Harness-Token": config.csrf,
          },
          body: JSON.stringify({ sessionId: id, input }),
        });
        if (!r.ok) {
          const d = await r.json();
          throw Error(d.error);
        }
        const reader = r.body.getReader(),
          decoder = new TextDecoder();
        let pending = "",
          final = false;
        while (true) {
          const { value, done } = await reader.read();
          pending += decoder.decode(value, { stream: !done });
          let at;
          while ((at = pending.indexOf("\n")) >= 0) {
            const line = JSON.parse(pending.slice(0, at));
            pending = pending.slice(at + 1);
            if (line.event) receive(line.event);
            if (line.result) {
              setResult(line.result);
              final = true;
            }
          }
          if (done) break;
        }
        if (!final) throw Error("连接中断，执行结果未知");
      } else setResult(await local.current.handle(input));
    } catch (e) {
      setError(e.message);
      setMotion(null);
      if (mode === "hardware") setHalted(true);
    } finally {
      setBusy(false);
    }
  }
  async function stop() {
    operation.current++;
    haltedRef.current = true;
    clearTimeout(armTimer.current);
    setHalted(true);
    setMotion(null);
    try {
      if (config.csrf && session.current) {
        const r = await api("stop", { sessionId: session.current });
        if (r.status === "unknown")
          setError("停止未获设备确认，请在本机控制台核对。");
      } else await local.current?.stop();
      setArmed(false);
    } catch {
      setError("未能确认停止，请核对本机设备。");
    }
  }
  async function resume() {
    try {
      if (config.csrf && session.current)
        await api("resume", { sessionId: session.current });
      else local.current?.resume();
      haltedRef.current = false;
      setHalted(false);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }
  async function arm() {
    if (busy || halted) return;
    const epoch = operation.current;
    setBusy(true);
    try {
      const id = await ensureSession();
      if (epoch !== operation.current) return;
      const lease = await api("arm", {
        sessionId: id,
        acknowledgeTorque: true,
      });
      if (epoch !== operation.current) {
        await api("stop", { sessionId: id });
        return;
      }
      setArmed(true);
      clearTimeout(armTimer.current);
      armTimer.current = setTimeout(
        () => setArmed(false),
        Math.max(0, lease.leaseExpiresAt - Date.now()),
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function exportTrace() {
    const blob = new Blob(
        [
          JSON.stringify(
            { profile, mode, provider, result, events, animationEvents },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "cowcoming-run.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  const disabled =
    busy || halted || checking || (mode === "hardware" && !armed);
  return (
    <main className="lab">
      <header>
        <a className="brand" href="/">
          cowcoming<span> / harness</span>
        </a>
        <div className="local-status">
          <i />
          {checking
            ? "正在检查本地服务"
            : config.csrf
              ? "本地运行服务已就绪"
              : "纯浏览器演示"}
          <small>v0.1</small>
        </div>
      </header>
      <section className="intro">
        <div className="eyebrow">INTERACTION LAB</div>
        <h1>一个意图，多种表达。</h1>
        <p>换角色、换动作、换机器人。让同一套交互逻辑，连接屏幕与真实世界。</p>
      </section>
      <div className="workspace">
        <aside className="setup">
          <div className="section-title">
            <b>01</b> 组装一次互动
          </div>
          <label>
            演示方式
            <select
              aria-label="演示方式"
              value={mode}
              disabled={busy}
              onChange={(e) => {
                const value = e.target.value;
                change(() => {
                  setMode(value);
                  if (value === "hardware") {
                    setProfile(benben);
                    setEditor(JSON.stringify(benben, null, 2));
                  }
                });
              }}
            >
              <option value="simulator">角色 + 软件预演</option>
              <option value="sandbox">仅查看 AI 决策</option>
              <option value="hardware" disabled={!config.hardwareReady}>
                真实 BenBen{!config.hardwareReady ? " · 未配置" : ""}
              </option>
            </select>
          </label>
          <label>
            决策来源
            <select
              aria-label="决策来源"
              value={provider}
              disabled={busy}
              onChange={(e) => {
                const value = e.target.value;
                change(() => setProvider(value));
              }}
            >
              <option value="mock">固定规则示例（不调用 AI）</option>
              <option value="configured" disabled={!config.modelReady}>
                已配置 AI
                {config.modelLabel ? " · " + config.modelLabel : " · 未配置"}
              </option>
            </select>
          </label>
          <label>
            动作能力
            <select
              aria-label="动作能力"
              value={profile.profileId}
              disabled={busy || mode === "hardware"}
              onChange={(e) => {
                const value = e.target.value;
                change(() => {
                  const p = config.profiles.find((p) => p.profileId === value);
                  setProfile(p);
                  setEditor(JSON.stringify(p, null, 2));
                });
              }}
            >
              {config.profiles.map((p) => (
                <option key={p.profileId} value={p.profileId}>
                  {p.label}
                </option>
              ))}
              {!config.profiles.some(
                (p) => p.profileId === profile.profileId,
              ) && (
                <option value={profile.profileId}>{profile.profileId}</option>
              )}
            </select>
          </label>
          <div className="cap-list">
            {profile.capabilities.map((c) => (
              <span key={c.id}>{c.id}</span>
            ))}
          </div>
          <details>
            <summary>编辑自己的能力配置</summary>
            <p>语义映射到已实现的动作 ID。JSON 不会创建硬件驱动。</p>
            <textarea
              aria-label="能力 JSON"
              className="json-editor"
              value={editor}
              disabled={busy || mode === "hardware"}
              onChange={(e) => setEditor(e.target.value)}
            />
            <button
              disabled={busy || mode === "hardware"}
              onClick={() => {
                try {
                  const p = normalizeProfile(JSON.parse(editor));
                  change(() => setProfile(p));
                } catch (e) {
                  setError(e.message);
                }
              }}
            >
              校验并应用
            </button>
          </details>
          <div className="section-title asset-title">
            <b>02</b> 选择角色表现
          </div>
          <p className="help">
            默认角色由代码生成。导入 GLB
            可绑定你自己的骨骼动画，文件仅在浏览器内读取。
          </p>
          <input
            ref={file}
            hidden
            type="file"
            accept=".glb"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                if (f.size > 100 * 1024 * 1024) {
                  setError("请选择 100 MB 以内的 GLB");
                  return;
                }
                setAsset(f);
                setMotion(null);
                setMapping({});
              }
            }}
          />
          <div className="row">
            <button disabled={busy} onClick={() => file.current.click()}>
              导入 GLB
            </button>
            <button
              disabled={busy}
              onClick={() => {
                setAsset(null);
                setMapping({});
              }}
            >
              内置角色
            </button>
          </div>
          {asset && (
            <details open>
              <summary>绑定动画片段（{clips.length}）</summary>
              {profile.capabilities.map((c) => (
                <label key={c.id}>
                  {c.id}
                  <select
                    disabled={busy}
                    aria-label={c.id}
                    value={mapping[c.id] || ""}
                    onChange={(e) =>
                      setMapping({ ...mapping, [c.id]: e.target.value })
                    }
                  >
                    <option value="">未绑定</option>
                    {clips.map((clip) => (
                      <option key={clip.name} value={clip.name}>
                        {clip.name}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </details>
          )}
        </aside>
        <section className="preview">
          <div className="preview-top">
            <span>
              {mode === "hardware"
                ? "实机执行 + 动画回放"
                : mode === "sandbox"
                  ? "决策沙盒"
                  : "软件预演"}
            </span>
            <span className="pill">
              {mode === "hardware" ? "指令回执 ≠ 实际到位" : "无机械运动"}
            </span>
          </div>
          <Stage
            motion={motion}
            asset={asset}
            onAsset={setClips}
            onPlayback={recordPlayback}
          />
          <div className="preview-bottom">
            <i />
            {playback}
            <span>3D 动画结果独立记录</span>
          </div>
          <div className="composer">
            <label htmlFor="utterance">让它回应你</label>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run();
              }}
            >
              <input
                id="utterance"
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={2000}
                placeholder="例如：请点一下头"
              />
              <button
                className="primary"
                disabled={disabled || !text.trim()}
                type="submit"
              >
                {busy ? "运行中…" : "运行 →"}
              </button>
            </form>
            <div className="examples">
              {Object.entries(labels).map(([id, label]) => (
                <button
                  key={id}
                  disabled={disabled}
                  onClick={() => {
                    setText(label);
                    run(provider === "mock" ? id : undefined, label);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {mode === "hardware" && (
              <div className="hardware-note">
                <p>
                  当前入口沿用 BenBen
                  示教动作，动作后保持力矩。确认支撑与现场控制权后，启用 60
                  秒操作窗口。
                </p>
                <button disabled={busy || halted} onClick={arm}>
                  确认现场就绪，启用操作
                </button>
              </div>
            )}
            <div className="row">
              <button className="stop" onClick={stop}>
                {mode === "hardware" ? "停止并卸力" : "停止本轮"}
              </button>
              {halted && (
                <button disabled={busy} onClick={resume}>
                  恢复接受新请求
                </button>
              )}
              <small>
                {mode === "sandbox"
                  ? "只规划，不启动动画或硬件"
                  : "软件预演不代表物理仿真或实机验收"}
              </small>
            </div>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </div>
        </section>
        <aside className="evidence">
          <div className="section-title">
            <b>03</b> 查看实际发生了什么
          </div>
          <div className="outcome" aria-live="polite">
            <span>本轮结果</span>
            <strong>
              {busy
                ? "处理中"
                : result
                  ? states[result.status] || result.status
                  : "等待第一次互动"}
            </strong>
            <p>
              {result?.reason ||
                (result?.status === "completed"
                  ? mode === "hardware"
                    ? "动作指令播放完成；未验证物理位置。"
                    : "软件执行器预演完成。"
                  : "输入一句话，观察意图如何变成可执行动作。")}
            </p>
          </div>
          <ol className="timeline">
            {events.map((e) => (
              <li key={e.eventId}>
                <i />
                <div>
                  <b>{states[e.status]}</b>
                  <code>{e.capabilityId || e.semantic || "—"}</code>
                  <small>
                    {e.reason ||
                      e.completionBasis ||
                      new Date(e.timestamp).toLocaleTimeString()}
                  </small>
                </div>
              </li>
            ))}
          </ol>
          <button disabled={!events.length} onClick={exportTrace}>
            导出本轮记录 ↓
          </button>
          <details open={Boolean(result)}>
            <summary>意图与计划</summary>
            <pre>
              {result
                ? JSON.stringify(
                    {
                      intent: result.intent,
                      plan: result.plan,
                      animationEvents,
                    },
                    null,
                    2,
                  )
                : "暂无记录"}
            </pre>
          </details>
        </aside>
      </div>
      <footer>
        <span>角色资源 · 决策模型 · 机器人能力，各自独立。</span>
        <a href="https://github.com/ericshang98/cowcoming-harness">
          项目源码 ↗
        </a>
      </footer>
    </main>
  );
}
createRoot(document.getElementById("root")).render(
  new URLSearchParams(location.search).get("view") === "lab" ? (
    <App />
  ) : (
    <PetPlayground />
  ),
);
