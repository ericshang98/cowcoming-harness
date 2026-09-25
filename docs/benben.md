# BenBen 五舵机适配

本适配参考 Eric 指定的 [Mark10667/benben](https://github.com/Mark10667/benben)。该仓库可能需要独立访问权限；这里不复制其私有控制器、轨迹、权重或串口代码。没有 BenBen 也能完整使用软件演示、模型沙盒和自定义 profile。

源码核对基线：`ac1aeb5b9ec725df81441ab5c921eac8b2e8daa5`（2026-09-25）。

BenBen 的现有 `/run` 不提供任意五舵机动作 RPC，不能伪装成已有能力。本包提供 `bridges/benben_entry.py`：在 BenBen 原进程中扩展 `/harness/state`、`/harness/run`、`/harness/stop`，沿用原 `Controller`、motion player、进程锁和唯一串口 owner。它不会另启一个串口控制器。

公开五项能力：`nod`、`nod_double`、`shake_head`、`tilt_left`、`tilt_right`。无关节参数覆盖。执行前校验固定 profile/version、单步动作、有效期、去重、硬件开关、示教动作可用性、忙碌/故障/实时会话。已有 live 会话不会被接管。

## 准备好后如何接入

代码交付不等于设备版本已切换。本次未替换或重启现有 BenBen 服务，也未发送实机动作。现场人员确认目标版本、设备与支撑后，再按已有设备流程安排切换。

1. 保留 BenBen 当前环境和已验收启动参数。`BENBEN_ROOT` 指向其仓库根目录；用本包 `bridges/benben_entry.py` **替代**原来的服务器入口，保留原 `--motion-profile five_servo`、串口、语言服务等配置。不要和原服务器同时运行，也不要绕过原进程锁。
2. 扩展是实验接口，依赖 `niu_reactions.server.Controller` 与 `make_handler` 当前接口；BenBen 升级后应重新运行合同检查。启动仍使用 BenBen 自己的依赖、模型与凭据，本包不安装或下载它们。
3. 在本机原控制台 `/session` 获取当前会话 token，保存在本包 `.env` 的 `BENBEN_SESSION_TOKEN`，不要提交或贴到浏览器参数中。设置 `BENBEN_ENDPOINT=http://127.0.0.1:原端口/`、`HARNESS_ENABLE_HARDWARE=1`。
4. 启动本包本地 lab，选择真实 BenBen。页面显示“未配置”或拒绝请求时，不把软件模式当成实机连接。
5. 现场确认后启用 60 秒操作窗口，发起一个动作，核对原控制台与动作结果。此版本在回执完成后回放同义角色动画；不是同步运动或实时数字孪生。

正常完成保持力矩。页面“停止并卸力”才调用原 controller 的停止动作；必须保证实物已有支撑。普通关闭页面、关闭空闲 session 不自动卸力。停止只接受本扩展当前拥有的 planId；若其他控制入口已接管，拒绝停止它。

BenBen 返回的是 `timed_commands`，永远 `sensorVerified: false`。1.8 秒是屏幕预演时长，不是实机轨迹时长；原驱动的示教配置和超时负责实际运动。HTTP 请求超时或回执不完整时，lab 标记未知、锁住新请求并尝试停止；用户仍须在本机核实。

已验证：假控制器的动作白名单、拒绝、并发/所有权、鉴权和 HTTP 客户端合同。未验证：实体机械臂、传感器、真实 BenBen 环境加载、长时间持位和在线 AI 效果。当前 `hardwareVerified: false` 是有意保留的事实。
