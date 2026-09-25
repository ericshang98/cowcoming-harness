import React, { useState, useEffect, useRef } from "react";
export default function PetSettings({
  local,
  connection,
  evolution,
  post,
  onConnection,
  onEvolution,
  onClose,
}) {
  const [purpose, setPurpose] = useState("jev"),
    [format, setFormat] = useState("cloudflare"),
    [account, setAccount] = useState(""),
    [endpoint, setEndpoint] = useState(""),
    [model, setModel] = useState(""),
    [key, setKey] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const current = purpose === "jev" ? connection : evolution;
  const panel = useRef();
  useEffect(() => {
    const previous = document.activeElement;
    panel.current?.querySelector("button")?.focus();
    const handler = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if (e.key === "Tab") {
        const focusable = [
          ...panel.current.querySelectorAll("button,input,select,a"),
        ].filter((el) => !el.disabled);
        const first = focusable[0],
          last = focusable.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, []);
  async function connect(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const c = await post("connect", {
        purpose,
        format,
        accountId: account,
        endpoint: endpoint || undefined,
        model: model || (purpose === "jev" ? "typesafe/jev" : ""),
        apiKey: key,
      });
      if (current)
        await post("disconnect", { connectionId: current.connectionId });
      (purpose === "jev" ? onConnection : onEvolution)(c);
      setKey("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function disconnect() {
    setBusy(true);
    try {
      await post("disconnect", { connectionId: current.connectionId });
      (purpose === "jev" ? onConnection : onEvolution)(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="pet-settings"
      role="dialog"
      aria-modal="true"
      aria-label="模型设置"
      ref={panel}
    >
      <div className="section-title">
        <h2>连接模型</h2>
        <button type="button" onClick={onClose} aria-label="关闭模型设置">
          ×
        </button>
      </div>
      {!local ? (
        <p>
          这是静态试玩页。运行 <code>npm run dev</code> 后，在本地页面填写
          Key，就能体验真实 JEV 决策。
        </p>
      ) : (
        <>
          <div className="tabs">
            <button
              aria-pressed={purpose === "jev"}
              onClick={() => {
                setPurpose("jev");
                setEndpoint("");
                setModel("");
                setKey("");
                setError("");
              }}
            >
              JEV 动作决策
            </button>
            <button
              aria-pressed={purpose === "evolution"}
              onClick={() => {
                setPurpose("evolution");
                setEndpoint("");
                setModel("");
                setKey("");
                setError("");
              }}
            >
              进化评估 · 可选
            </button>
          </div>
          <p>
            {purpose === "jev"
              ? "一次请求选择动作和宠物情绪，页面显示实测往返耗时。"
              : "独立 LLM 阅读培养记录，决定保持还是沿分支进化。无需它也能体验 JEV 动作。"}
          </p>
          <form onSubmit={connect}>
            {purpose === "jev" && (
              <label>
                JEV 接口
                <select
                  value={format}
                  onChange={(e) => {
                    setFormat(e.target.value);
                    setEndpoint("");
                  }}
                >
                  <option value="cloudflare">Cloudflare JEV</option>
                  <option value="typed">自定义 typed JEV 端点</option>
                </select>
              </label>
            )}
            {purpose === "jev" && format === "cloudflare" ? (
              <label>
                Cloudflare Account ID
                <input
                  autoComplete="off"
                  value={account}
                  onChange={(e) => setAccount(e.target.value.trim())}
                  placeholder="32 位账户 ID"
                  required
                />
              </label>
            ) : (
              <label>
                接口地址
                <input
                  type="url"
                  autoComplete="off"
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  placeholder={
                    purpose === "evolution"
                      ? "https://…/v1/chat/completions"
                      : "https://…/decision"
                  }
                  required
                />
              </label>
            )}
            <label>
              模型名称
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={
                  purpose === "jev" ? "typesafe/jev" : "服务商提供的模型名称"
                }
                required={purpose === "evolution"}
              />
            </label>
            <label>
              {purpose === "jev" ? "JEV API Key" : "进化评估 API Key"}
              <input
                type="password"
                autoComplete="off"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                required
                placeholder="仅在本次本地服务中使用"
              />
            </label>
            <button className="primary" disabled={busy}>
              {busy ? "连接中…" : current ? "更新连接" : "保存连接"}
            </button>
            {current && (
              <button type="button" onClick={disconnect} disabled={busy}>
                断开并清除 Key
              </button>
            )}
          </form>
          <small>
            Key 不写入文件、浏览器存储或导出记录；本地服务重启或闲置 30
            分钟后需要重新连接。保存不调用模型，发送互动时才发起请求。
          </small>
          {current && (
            <p role="status">已保存 {current.model}，等待互动验证。</p>
          )}
          {error && <p role="alert">{error}</p>}
        </>
      )}
    </section>
  );
}
