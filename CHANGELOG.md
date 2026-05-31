# Changelog / 更新记录

## Unreleased / 未发布

- KAGE v0.1.7 fixes demo mode state isolation so exploring sample sessions does not overwrite the user's real agent filter or include-subdirectories preference.
- KAGE v0.1.7 修复 demo mode 状态隔离，用户体验示例 sessions 时不会覆盖真实的 agent 筛选和 include-subdirectories 偏好。

- KAGE v0.1.6 adds an opt-in desktop demo mode with sanitized Codex, Claude Code, and QoderCLI sessions so first-time users can explore KAGE before they have local agent history.
- KAGE v0.1.6 增加显式开启的桌面 demo mode，内置脱敏的 Codex、Claude Code 和 QoderCLI sessions，让首次用户在没有本地 agent 历史时也能先体验 KAGE。

- KAGE v0.1.5 adds a launch-ready demo flow asset and clearer first-run empty states for users who have not created matching local agent sessions yet.
- KAGE v0.1.5 增加可用于发布传播的 demo flow 视觉资产，并优化首次使用时没有匹配本地 agent session 的空状态。

- Added `package-lock.json` so GitHub Actions npm caching has the lockfile that `actions/setup-node` expects.
- 增加 `package-lock.json`，让 GitHub Actions 的 npm cache 配置能找到 `actions/setup-node` 所需的 lockfile。

- Refined the GitHub landing path with a five-round user churn audit, clearer README fit checks, and stronger homepage install/star CTAs.
- 通过五轮用户流失审计、README 适用性判断，以及更明确的主页安装/Star 入口，优化 GitHub 转化路径。

- KAGE v0.1.4 adds a real macOS app icon, a KAGE menu bar template icon, replay story open controls, and clearer empty search recovery actions.
- KAGE v0.1.4 增加正式 macOS App 图标、KAGE 状态栏 template 图标、replay story 打开控件，以及更清楚的搜索空状态恢复操作。

- KAGE v0.1.3 ignores Claude `subagents/` transcript files during session discovery so it does not generate unusable resume actions for sub-agent folders.
- KAGE v0.1.3 在 session 发现阶段忽略 Claude `subagents/` transcript 文件，避免为子代理目录生成无法恢复的 resume 操作。

- Desktop v0.1.2 makes Fork a first-class action and renames Replay to Replay story so it is clear that replay is read-only review, not session branching.
- Desktop v0.1.2 将 Fork 提升为独立操作，并把 Replay 改成 Replay story，明确 replay 是只读回放，不是 session 分身。

- Desktop v0.1.1 expands the KAGE workspace, makes the terminal the primary surface, and moves Bridge / Replay into an Actions menu.
- Desktop v0.1.1 放大 KAGE 工作区，让 terminal 成为主界面，并把 Bridge / Replay 收进 Actions 菜单。

- Improved the ambiguous session chooser with spaced card-style entries, full paths, session ids, and recent real user messages.
- 改进了歧义 session 选择器，使用留白更清晰的卡片式条目，并展示完整路径、session id 和最近几条真实用户消息。

- Added `c2c` so Claude sessions can be forked into new native Claude sessions and resumed with a fresh session id.
- 增加了 `c2c`，支持把 Claude session fork 成新的原生 Claude session，并使用新的 session id 继续恢复。

- Added `kage update` and shorthand list commands like `kage c`, `kage q`, and `kage x`.
- 增加了 `kage update`，以及 `kage c`、`kage q`、`kage x` 这类简写的 session 列表命令。

- Switched the Qoder integration to QoderCLI-only support and added native `qodercli --resume` install hints.
- 将 Qoder 集成收敛为只支持 QoderCLI，并补上原生 `qodercli --resume` 安装提示。

- Added `q2q` so QoderCLI sessions can also be forked into new native QoderCLI session files.
- 增加了 `q2q`，支持把 QoderCLI session fork 成新的原生 QoderCLI session 文件。

- Tolerate corrupted JSONL rows during session discovery so one bad transcript does not break the whole scan.
- 在 session 发现阶段容忍损坏的 JSONL 行，避免单个坏文件导致整个扫描流程失败。

- Ignore Codex bootstrap pseudo-user messages when deriving chooser titles.
- 在生成选择器标题时忽略 Codex 注入的 bootstrap 伪 user 消息。

- Preserve full chooser titles and paths instead of truncating them.
- 保留完整的选择器标题和路径，不再固定截断。

- Clarify unknown route-alias errors by printing the supported alias list.
- 对未知 route alias 提供更明确的报错，并直接打印支持的 alias 列表。

- Document that rerunning the install command upgrades an existing install.
- 文档中补充说明：重新执行安装命令即可升级已有安装。

- Refreshed the product positioning, GitHub Pages homepage, original KAGE logo asset, and macOS menu bar app plan.
- 更新产品定位、GitHub Pages 主页、原创 KAGE logo 资产，以及 macOS 状态栏应用方案。

- Added the first menu-bar app CLI contract with `doctor`, `sessions`, `actions`, and `run-action`.
- 增加第一版状态栏应用 CLI 合同：`doctor`、`sessions`、`actions` 和 `run-action`。

- Fixed `kage clean` so Claude subagent transcripts are not treated as duplicate or stale exports.
- 修复 `kage clean`，避免把 Claude subagent transcript 误判为重复或过期导出。

- Added `kage search` for finding sessions by text, agent, date range, and project.
- 增加 `kage search`，支持按文本、agent、时间范围和项目路径查找 session。

- Added an experimental native macOS menu bar app scaffold that consumes the KAGE JSON CLI contract.
- 增加实验性的原生 macOS 状态栏 App 骨架，直接消费 KAGE JSON CLI 合同。

## Earlier Work / 早期工作

- Added native Codex, Claude, and QoderCLI session export flows.
- 增加了原生的 Codex、Claude 和 QoderCLI session 导出流程。

- Added the `kage` CLI alias and the GitHub install script.
- 增加了 `kage` CLI 别名和 GitHub 安装脚本。

- Added session-id lookup, `output-dir` support, and machine-readable JSON output.
- 增加了 `session-id` 查找、`output-dir` 支持和机器可读的 JSON 输出。
