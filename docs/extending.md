# 添加自己的机器人和角色

## 从能力开始

不要把“用户意图”固定为原机械臂的五项动作。声明你的机器人真正支持的动作，将每项映射到一个或多个精确语义；多个 capability 匹配同一语义时，v0.1 按配置顺序取第一项，不做模糊降级。

```json
{
  "profileId": "my-robot",
  "version": "1",
  "minConfidence": 0.7,
  "capabilities": [
    {
      "id": "raise_arm",
      "semanticTags": ["approval", "greeting"],
      "parameters": {
        "intensity": { "type": "number", "min": 0, "max": 1, "default": 0.5 }
      },
      "durationMs": 1800,
      "maxDurationMs": 5000,
      "interruptible": true,
      "visual": "wave"
    }
  ]
}
```

把 JSON 粘到页面“编辑自己的能力配置”即可验证软件路径。参数支持 number / integer / string / boolean、默认值、枚举、数值范围和必填。未知参数会拒绝。Planner 裁剪数值范围；执行前独立检查严格拒绝越界计划。真实关节限位仍由设备驱动强制执行，不能只依赖这个配置。

`durationMs` 是软件预演预算，`maxDurationMs` 是计划上界；它们不是实时运动控制器，也不能替代驱动自己的超时。`interruptible` 是能力描述；设备驱动必须实现真正的停止语义。当前运行时始终允许请求停止并保留停止确认情况。

## 实现执行器

实现以下三个方法，并明确标记 `hardware: true, simulated: false`：

```js
const executor = {
  hardware: true,
  simulated: false,
  async getState() {
    // 读取真实设备状态；租约由你的应用管理，不能硬编码“已连接”。
    return {
      online: false,
      busy: false,
      fault: false,
      authorized: false,
      leaseExpiresAt: 0,
    };
  },
  async execute(plan, { signal, emit }) {
    // 校验能力 ID，分发到你已有的驱动；拒绝任意角度、代码或未知命令。
    // 收到对应证据时 emit('accepted') / emit('running') / emit('completed', {...})。
    // 不能把“HTTP 200 / 已发送”当成 completed。
    throw new Error("implement your device transport");
  },
  async stop() {
    return { confirmed: false };
  },
};
```

如果你的服务返回与 `planId` 关联的终态回执，可以复用 `createBenBenExecutor({send,getState,stop})` 的通用证据检查，也可以实现独立执行器。只有驱动可以产出实机事件。串口独占、设备限位、动作原子性、现场停止与自检由驱动负责。

当前实验室硬件选择器只开放经固定合同检查的 BenBen；任意 JSON 配置不会变成网络请求或动态插件。要支持新设备，在服务端显式注册驱动，并扩展 session 配置和对应测试。你仍可直接使用 runtime 库接入它。

## 绑定视觉

内置角色支持 `nod / nod_double / shake_head / tilt_left / tilt_right / wave / dance`。`visual` 仅影响预览。导入 GLB 后从真实片段列表逐项选择；未绑定的动作显示缺失，不会随便播放另一个动作。

GLB 必须是内嵌纹理和缓冲区的单文件，单次上限 100 MB。浏览器内解析，无上传；外部纹理请求被拒绝。骨骼、网格、动画的授权由资源提供者确认。本版本不提供自动重定向骨骼、生成动画、物理仿真、TTS 或嘴型生成。

发布可选资源包时附带：资产名与版本、文件大小、SHA-256、作者/来源、许可证、动画片段名称及 capability 映射。使用固定版本 URL；不要把所有大文件塞入源码历史。缺少资源也可以用内置角色复现完整软件交互。
