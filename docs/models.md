# 接入决策模型

v0.2 的默认软件宠物页面可直接在「模型设置」填写 JEV Key，与可选的进化评估 Key；详见[软件宠物](pet-playground.md)。下文环境变量用于保留的 `?view=lab` 开发者实验室。

复制 `.env.example` 为 `.env`，填写所选服务后自行启动 `npm run dev`。页面“决策来源”中的“已配置 AI”随后可选。所有 API Key 留在 Node 服务中；不要使用 `VITE_*` 保存密钥。不会自动安装服务或下载权重。

默认 Mock 仅匹配演示语句和按钮，不具备自然语言泛化能力。需要任意用户表达时，接入下面的服务或自己实现 `decide()`。输入是文本与当前 profile 的可用语义；输出仍需经过 Planner 和执行前检查。

| `HARNESS_MODEL_PROVIDER` | `HARNESS_MODEL_ENDPOINT` 示例                                     | `HARNESS_MODEL_NAME`         |
| ------------------------ | ----------------------------------------------------------------- | ---------------------------- |
| `ollama`                 | `http://127.0.0.1:11434/api/chat`                                 | 你已经安装的模型名           |
| `openai-compatible`      | 服务商完整 `/v1/chat/completions` 地址                            | 该服务的模型名               |
| `jev`                    | `https://api.cloudflare.com/client/v4/accounts/ACCOUNT_ID/ai/run` | `typesafe/jev`               |
| `laya`                   | `http://127.0.0.1:PORT/v1/systemone`                              | 本地模型标签（用于页面展示） |

需要鉴权时设置 `HARNESS_MODEL_KEY`。端点必须显式给出，适配器不猜测路径，也不跟随重定向。默认推理超时 15 秒，解析失败或超时不下发动作。

Chat Completions 和 Ollama 请求 JSON Intent；JEV / Laya 请求 `state + questions.action` 的 `choice` 问题，再将返回的 `choice/confidence` 转为 Intent。JEV 使用 `{model,input}` 外层，Laya 使用原始问题对象。当前 typed choice 适配器不预测动作参数，使用 profile 参数默认值；必须参数无默认值会在规划时拒绝。

`unsupported` 是显式可选答案。它让模型在缺少能力、否定指令或不确定时有合适出口，但模型仍可能误分类；应用需要用自己的评估样本衡量语义准确性。`minConfidence` 可按 profile 设置；不同后端的置信度不具有统一含义，不能直接共用未经校准的阈值。

```js
import { FunctionModelAdapter } from "../src/index.mjs";
const model = new FunctionModelAdapter(async (input, { profile, signal }) => {
  // 在这里调用你的服务，遵守 signal 取消，并使用 profile 限定可选能力。
  return {
    requestId: input.requestId,
    type: "express",
    semantic: "approval",
    params: {},
    confidence: 0.9,
  };
});
```

本版本用固定 HTTP 响应测试请求与解析合同；未使用用户凭据调用在线推理，也未做模型效果或延迟评估。不要把 Mock 通过当成 JEV 或本地模型已经验收。

协议依据：[Ollama Chat](https://docs.ollama.com/api/chat)、[Cloudflare JEV](https://developers.cloudflare.com/ai/models/typesafe/jev/)、[Laya 官方仓库](https://github.com/NandhaKishorM/laya)。
