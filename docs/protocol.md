# v0.1 协议与运行语义

核心公开 API 从 `src/index.mjs` 导出；浏览器使用 `src/browser.mjs`（无 Node 文件系统依赖）。

```js
import {
  createRuntime,
  MockModelAdapter,
  RecordingExecutor,
  loadProfile,
} from "../src/index.mjs";
const runtime = createRuntime({
  profile: await loadProfile(
    new URL("../profiles/waving-robot.json", import.meta.url),
  ),
  model: new MockModelAdapter(),
  executor: new RecordingExecutor(),
  onEvent: console.log,
});
await runtime.handle({ requestId: "example-1", text: "请点一下头" });
```

- **Intent**：`requestId, type, semantic, params?, confidence?, target?, expiresAt?`。v0.1 只执行 `express`；`stop` 停止接受新请求；`track/speak` 拒绝。`target` 若提供，必须匹配选中 profile。
- **Plan**：`planId, intentId, profileId, profileVersion, semantic, createdAt, expiresAt, durationMs, steps`。当前恰好一个 step：`capabilityId + args`；所有下发计划深度冻结。
- **ExecutionEvent**：`eventId, requestId, planId, status, timestamp, simulated, sensorVerified`，及可选 `completionBasis / reason`。事件是只读快照。
- **View record**：`animationEvents` 单独记录 GLB / 内置角色播放和缺失状态。它是视觉证据，不改变执行结果；导出 JSON 同时包含它和执行 events。

状态流：`planned → accepted → running → completed`。执行器有证据才发对应状态，不要求无依据补齐中间状态。另有 `unsupported / rejected / stopped / fault / unknown`。沙盒只到 `planned`。

| 回执                                                                       | 含义                                                         |
| -------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `simulated: true, completionBasis: simulated`                              | 软件执行器的定时预演结束，不证明动画成功或设备动作           |
| `simulated: false, completionBasis: timed_commands, sensorVerified: false` | 已有驱动报告定时指令播放完成，不证明真实到位                 |
| `completionBasis: sensor_feedback, sensorVerified: true`                   | 只有另一个确有传感器验证的驱动才能报告；当前 BenBen 不会返回 |
| `unknown`                                                                  | 结果缺失、失联、错配或仅收到接受回执；不宣称完成             |

同一运行会话中 `requestId` 去重，包括并发重发；第二个不同 ID 在忙碌时拒绝。一次停止会取消当前模型/执行等待，丢弃迟到结果，并锁住新请求；显式 resume 只恢复接收，不重播旧请求。实机未知结果或故障同样锁住并尝试停止。记录最多 1000 个请求，满后创建新会话，不悄悄遗忘并重放。重启后不保留去重；生产用途需要持久化控制权与日志。

本地服务仅监听 `127.0.0.1`，校验 Host、Origin、JSON 和页面会话 token。服务器不是互联网多租户网关；不要把开发端口直接公开。硬件操作须服务端启用、使用固定 profile、页面确认现场就绪并获取 60 秒启动租约。租约限定新动作的下发时间，不会在动作中途自动卸力。

API：`GET /api/config`，`POST /api/session`、`/api/run`（NDJSON events + result）、`/api/stop`、`/api/resume`、`/api/arm`、`/api/close`。POST 要带 `X-Harness-Token`；session 只接受软件沙盒/预演或显式配置的 BenBen。关闭空闲会话和切换页面配置不会自动卸力。活动请求连接中断会尝试停止自己的动作；不能保证网络失联时机械臂已停止，应以本机控制器为准。
