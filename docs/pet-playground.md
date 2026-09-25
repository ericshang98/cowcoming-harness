# 软件宠物与机器人动作

## 从 localhost 开始

Node 24 下运行 `npm ci && npm run dev`，打开终端输出地址。默认原创程序牛不下载 GLB 或 AI 权重。六形态沿用牛来人格与分支：小牛 → 普通牛来 → 骚牛 → 仙牛，以及普通牛来 → 硬牛 → 暗黑牛。外观是新的轻量示例，并非原网站六套精细 GLB。

先点动作，随后在「模型设置」填 JEV API Key。Cloudflare 接入还需 Account ID；使用自建 typed 代理时填写完整端点。一次 JEV 调用选择动作和宠物情绪，决策不会输出机械轨迹。界面记录从发送模型请求到收到完整结果的往返时间，包含网络开销，不宣称纯模型推理时延；具体值取决于用户服务。

JEV 的结构化多问题合同已按 [Cloudflare 官方说明](https://developers.cloudflare.com/ai/models/typesafe/jev/) 核对。官方示例支持 Choice、Score 与 Noul，本例使用两个 Choice。自定义 typed 端点接收同一 `state + questions` 对象并返回 `answers`，具体路径由接入者提供。

表单的 Key 只保存在本机 Node 进程的连接对象中，不写 `.env`、浏览器存储、URL 或导出文件；保存后清空密码框。闲置连接下次请求在 30 分钟阈值后失效；断开删除对应对象。只监听 loopback，沿用 Host/Origin/CSRF 检查。部署出的静态站只能试玩，不出现密码输入框。关闭标签页中止当前模型请求；需要立即清除 Key 时先点断开，或结束本地服务。

## 动作、情绪与进化

内置 18 项动作，每项鲜明/轻柔两种同义变体。形态调整节奏与幅度，不改变单/双点头次数、左右方向。小牛开放 10 项，普通牛来和硬牛 14 项，骚牛/仙牛/暗黑牛 18 项。动作包的 `forms` 可重新定义可用形态；不填则适用全部形态。

动作：点一下头、点两次头、摇头、左右歪头、左右看、抬头、低头、左右手问候、张开双臂、鞠躬、摇摆、蹦一下、伸懒腰、打瞌睡、举手庆祝。各关节关键帧由本包原创程序产生；它不是物理仿真。

修订 212 有六种人格，但没有独立情绪枚举。因此这里新增平静、好奇、开心、得意、委屈、困倦作为**可编辑的示例词表**；不声称它们是此前确认的全部情绪。情绪作用于角色表情，JEV 读取上一情绪与人格再选择下一情绪。完整人格提示词随 `profiles/niulai-personas.json` 保留。页面的台词是明确标注的预设展示，不是 JEV 生成的语言；这版没有 TTS 或自由聊天生成。

动作按钮是预览，不计成长。真实 JEV 的动作在浏览器实际播完后，才计入独立的“软件培养”会话；页面渲染失败、取消、WAIT、模型错误均不计轮。本会话与原站要求设备回执的实机培养分开，不伪造机械臂回执。最多保存 100 轮，不自动截断完整培养历史；可导出后重置。刷新开启新会话。

自动成长需要另配一个支持 JSON Chat Completions 的评估模型，默认周期 5，可改 1–100。评估读取该软件培养的全部完成记录，只能保持或走一个直接后继。手动切换、重置、改周期取消旧评估；迟到结果不能改变新会话。到达终点停止评估。失败保留历史并可重试。模型设置里的两把 Key 属于不同职责，不要求 JEV 负责长文本生成。

## 自己编排动作

导出动作包，在 JSON 中编辑 `actions` 与 `emotions`，再导入。一个动作的例子：

```json
{
  "version": 1,
  "id": "my_greeting",
  "label": "我的问候",
  "description": "缓慢抬起左臂再放下，用于问候",
  "interrupt": "hold-current",
  "variants": [{
    "id": "gentle",
    "label": "轻柔",
    "frames": [
      {"atMs": 0, "pose": {}},
      {"atMs": 1000, "pose": {"leftArm": 0.4}},
      {"atMs": 2000, "pose": {}}
    ]
  }]
}
```

逻辑轴支持 `headYaw/headPitch/headRoll/headLift/bodyYaw/bodyLean/bodyLift/leftArm/rightArm`。值为 [-1,1]，每个关键帧里没写的轴为中位 0。动作从中位开始并回到中位；停止保持当前软件姿态，新的动作重新从中位播放。机械端不会自动执行回正路径。

JEV 只能选择当前形态已登记候选；明确点头时会缩小为对应动作与 WAIT，禁止用其他动作冒充。对自由语言，这不是完整语义正确性的保证，仍需用真实模型评估。自定义动作通过标签和说明成为模型候选。一个包最多 40 项动作、16 个情绪、每动作 8 个变体、每变体 100 帧。

## 连接其他机器人

页面「接到自己的机器人」可导入映射、显示缺失轴或越界错误，导出硬件角度时间轴。默认九轴示例及 `head-only.example.json` 都未标定，只做试算；导入、预览和导出不会驱动串口。

一个逻辑轴对应一个已标定舵机：

```json
{"headYaw":{"id":1,"centerDeg":90,"scaleDeg":15,"direction":1,"minDeg":60,"maxDeg":120,"maxSpeedDegS":30}}
```

目标角度 = `centerDeg + 逻辑轴值 × scaleDeg × direction`。它与厂商的原始编码单位不同。头部升降/身体移动若需要多个关节联动或逆运动学，应由具体机器人适配器计算并校验，不能直接照抄本示例的单轴映射；尤其不能把 `hop` 当成机械臂可以安全跳跃的证据。

编译器检查所有需要的轴、重复舵机、有限值、位置和分段速度，不做静默裁剪。开始执行前检查驱动上报 ready 且当前位置接近该动作中位。`calibrated:true` 只是接入者的声明，不是自动标定或安全认证。负载、碰撞、加速度、急停和通信 watchdog 仍由硬件驱动负责。

SDK 可直接使用：

```js
import { actions, makeScore, compileRobotMotion, executeRobotMotion } from 'cowcoming-harness/pet';
const score = makeScore(actions.find(a => a.id === 'nod'), {
  form: 'normal', emotion: 'curious', requestId: 'one-response-id'
});
const plan = compileRobotMotion(score, myCalibratedRobot);
// 同一个 score 可同时交给软件播放器；两端各记自己的回执。
const receipt = await executeRobotMotion(plan, myDriver, { signal, onEvent });
```

`myDriver` 实现 `readState({signal})`、`writeFrame({requestId,atMs,positions},{signal})`、`stop({requestId})`。readState 返回 `{ready,positions:{舵机ID:角度},sensorVerified}`；stop 返回 `{confirmed}`。驱动必须遵守取消并拥有实际设备互斥权。SDK 按名义 40 ms 步长线性插值，不是实时系统；写入延迟会影响实际周期。发送结束是 `sent/commands_sent`，只有驱动明确提供目标到位的传感器反馈才是 `completed/position_feedback`。取消、异常或读回不符尝试停止，无法证明停止时标 `unknown`。

现有 BenBen 使用另外的示教动作适配器，在 `?view=lab` 里接入；此版本不会把新增 18 项动作自动转换为 BenBen 的关节轨迹。其原串口所有权、现场配置与运行实例不由新页面接管。

`npm run demo:motion -- wave_left` 只输出编译结果，无设备访问。接入真实机器人前用自己的假驱动覆盖错误、迟到、停机与角度转换，再做现场标定和实测。
