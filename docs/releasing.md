# 发行同步与验证

发行代码真源是 [Cowcoming](https://github.com/ericshang98/cowcoming) 仓库的 `harness/`。独立仓库只包含该目录，不包含主站角色资源、私有配置或其他历史。社区 PR 可在独立仓库讨论与验证；维护者须将采纳的改动同步回主仓库后再发行。

发布步骤：

1. 在主仓库开发分支提交已验证的 `harness/`。使用 `git archive SOURCE_COMMIT:harness` 导出该提交的跟踪文件；不要用整个工作目录打包，避免带上 `.env`、`node_modules`、运行日志与浏览器记录。
2. 在干净的独立仓库创建 `codex/` 分支，应用导出文件与必要的删除，检查差异并提交。
3. 比较主仓库 `git rev-parse SOURCE_COMMIT:harness` 与独立仓库 `git rev-parse HEAD^{tree}`，必须相同。把两个提交和树哈希写进 Release 说明。
4. Node 24 下运行 `npm ci`、`npm test`、`npm run test:bridge`、`npm run demo`、`npm run sandbox`、`npm run demo:motion`、`npm run build`。安装 Playwright Chromium 后运行 `npm run qa` 与 `npm run qa:pet`；也可用已安装 Chrome 并设置 `QA_BROWSER_CHANNEL=chrome`。
5. 检查 PR 的 CI，通过后合并独立仓库，按 `package.json` 版本打 tag。静态 `dist/` 可作为 Release 附件，必须保留随构建生成的许可证。源码自动由 GitHub 按 tag 提供。

静态产物只有浏览器演示。真实模型需运行本地 Node 服务；不在静态产物里嵌入 Key。浏览器模型验收使用固定响应，不等于真实 JEV 的在线效果或延迟评测。硬件验收使用假驱动，不等于实机已标定或已停止。

主站 PR、独立仓库 Release 与生产部署分别记录。发布独立库不会自动把主站合并或上线，也不会安装、替换或重启用户设备服务。
